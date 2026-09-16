// Objeto ÚNICO de produto para a API de consulta da IA (`/api/ia-consulta/v1`, v1.6.0 — item 8
// do pedido do bot). Antes cada endpoint devolvia o produto de um jeito e o bot tentava seis
// nomes de campo para achar o preço. Aqui mora a montagem de um formato só, usado SOMANDO aos
// objetos que já existem (nunca substituindo — /v1 é contrato congelado):
//   • no catálogo e no reconhecimento os campos novos entram NO MESMO NÍVEL do item, sem tocar
//     nos que já existiam (`enriquecerItem` só adiciona chave que ainda não existe);
//   • nos itens de pedido (histórico, produtos-comprados, pedido criado, promoções) entra como
//     sub-objeto `produto`.
//
// Este módulo NÃO importa congeladosService nem iaClienteService (evita ciclo) — só prisma e
// promocaoService. O que não existe no cadastro vem `null` e está documentado em
// backend/docs/ia-consulta-api.md (seção v1.6.0).
const prisma = require('../config/database');
const promocaoService = require('./promocaoService');

const dec = (v) => (v == null ? 0 : Number(v));
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const dataSP = (d) => (d ? new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : null);

// Include padrão de Produto para quem vai chamar produtoParaIA (usar em include/select de itens).
const PRODUTO_INCLUDE_IA = {
    imagens: true,
    categoriaProduto: { select: { id: true, nome: true } },
    congeladosProduto: true,
};

function imagemPrincipal(produto) {
    if (!produto?.imagens?.length) return null;
    const p = produto.imagens.find(i => i.principal) || produto.imagens[0];
    return p?.url || null;
}
function imagensProduto(produto) {
    if (!produto?.imagens?.length) return [];
    return [...produto.imagens]
        .sort((a, b) => (b.principal === true ? 1 : 0) - (a.principal === true ? 1 : 0))
        .map(i => i.url).filter(Boolean);
}

// ── Derivações a partir do NOME do sistema ─────────────────────────────────────────────────
// Padrão real do cadastro: `<dígito>-[XX-][P|M|G|GG-]<NOME> C/<un> <peso>GR`
//   ex.: "2-FR-M-COXINHA FRANGO C/AIPIM C/30 60GR", "1-GG-COXINHA FRANGO C/10 170GR",
//        "2-FR-RISOLES DE CARNE C/10"
// O que dá para derivar com segurança: tamanho (token exato P/M/G/GG na posição), unidades
// (C/30) e peso unitário (60GR). O significado de "1-"/"2-" e "FR" NÃO está documentado —
// por isso não derivamos preparo/linha do prefixo (decisão do plano).
const RE_PREFIXO = /^\d-(?:[A-Z]{2}-)?(?:(P|M|G|GG)-)?/;
const RE_TAMANHO = /^\d-(?:[A-Z]{2}-)?(P|M|G|GG)-/;
const RE_UNIDADES = /\bC\/(\d+)\b/;
const RE_PESO = /\b(\d+)\s*GR\b/;

function nomeCurtoDe(nomeCompleto) {
    const n = String(nomeCompleto || '').trim();
    if (!n) return '';
    const curto = n
        .replace(RE_PREFIXO, '')
        .replace(/\s+C\/\d+\b/g, '')
        .replace(/\s+\d+\s*GR\b/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    return curto || n;
}
function tamanhoDe(nomeCompleto) {
    const m = RE_TAMANHO.exec(String(nomeCompleto || ''));
    return m ? m[1] : null;
}
function unidadesDoNome(nomeCompleto) {
    const m = RE_UNIDADES.exec(String(nomeCompleto || ''));
    return m ? parseInt(m[1], 10) : null;
}
function pesoDoNome(nomeCompleto) {
    const m = RE_PESO.exec(String(nomeCompleto || ''));
    return m ? parseInt(m[1], 10) : null;
}
// Rótulo livre da categoria ("Para fritar", "Para assar", "Pronto para servir") → enum.
// Rótulos exatos que `preparoLabelDeEtiqueta` pode devolver → enum. Checados primeiro (match
// exato, controlado) antes do fallback por substring (rótulo digitado à mão na categoria).
// "Assar ou fritar" (ambíguo, mais de um verbo na etiqueta) fica de propósito sem enum — o texto
// em `preparo` já é claro, forçar FRITO ou ASSADO seria adivinhar.
const PREPARO_TIPO_CONTROLADO = {
    'para fritar': 'FRITO',
    'para assar': 'ASSADO',
    'somente aquecer': 'PRONTO',
    'cozinhar': 'COZIDO',
};
function preparoTipoDe(rotulo) {
    const r = String(rotulo || '').trim();
    if (!r) return null;
    const controlado = PREPARO_TIPO_CONTROLADO[r.toLowerCase()];
    if (controlado) return controlado;
    if (/\bou\b/i.test(r)) return null; // rótulo combinado ("Assar ou fritar") — ambíguo de propósito
    if (/frit/i.test(r)) return 'FRITO';
    if (/assa|forn/i.test(r)) return 'ASSADO';
    if (/pronto|aquec/i.test(r)) return 'PRONTO';
    if (/cru/i.test(r)) return 'CRU';
    return null;
}

// ── Preparo a partir do texto livre da ETIQUETA (Dados da Etiqueta do PCP) ─────────────────
// Decisão do dono (16/09/2026): o rótulo de preparo do card do site/IA passa a vir da etiqueta
// (fonte técnica, cadastrada pelo PCP) em vez de só o texto livre digitado por categoria no
// admin do site — 25 dos 51 produtos do catálogo mostravam "Somente Aquecer" enquanto a etiqueta
// mandava fritar ou assar. Classificação por VERBO com negação por PROXIMIDADE (revisão de código
// 16/09/2026, 2ª rodada): só anula o verbo se "não"/"sem" estiver nas até 3 palavras IMEDIATAMENTE
// antes dele na mesma cláusula ("não fritar", "não deve fritar", "sem fritar") — negação mais
// distante não anula ("não descongelar antes de fritar" classifica FRITAR normalmente, porque quem
// está negado ali é "descongelar", não "fritar"). Isso corrige o exagero da 1ª versão (qualquer
// negação em QUALQUER ponto da cláusula anulava o verbo, mesmo negando outra coisa) sem reabrir o
// risco original da revisão de 2026-09-15 ("Não fritar, assar em forno..." continua nunca virando
// "Para fritar" — a negação está a 0 palavras do verbo, dentro da janela).
// PENDENTE (decisão do dono, não implementado): produto já frito de fábrica cujo nome tem "FRITO"
// mas a etiqueta só manda "aquecer no forno" hoje classifica ASSADO/"Para assar" — o dono pode
// querer um rótulo próprio tipo "Aquecer no forno" nesse caso. Não mudar sem pedido explícito;
// se vier, o lugar certo é aqui (teria que olhar o nome do produto também, que hoje esta função
// não recebe).
// Não classifica (devolve null) quando não reconhece nenhum verbo com segurança — nesse caso o
// chamador cai no rótulo por categoria (comportamento antigo), nunca inventa um preparo.
function semAcento(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}
// "pré-aquecido"/"pre aquecido" descreve o FORNO/ÓLEO sendo preaquecido, não o produto sendo só
// aquecido — toda etiqueta do PCP fala nisso ("em óleo pré-aquecido a 180°C"), então é removido
// ANTES de procurar o verbo "aquecer" (senão toda etiqueta bateria falso-positivo em AQUECER).
// Mesmo problema com "pré-frito"/"pré-cozido" (achado do QA 16/09/2026): são ADJETIVO DE ESTADO
// do produto ("Produto pré-frito. Assar em forno...") — descrevem como ele chegou congelado, não
// uma instrução de preparo — e bateriam falso-positivo em FRITAR se não fossem removidos antes.
function semPreAquecimentoTexto(txt) {
    return txt
        .replace(/pre-?\s?aquec\w*/gi, ' ')
        .replace(/\bpre-?\s?frit\w*/gi, ' ')
        .replace(/\bpre-?\s?cozid\w*/gi, ' ');
}
const PREPARO_VERBOS = [
    { tag: 'FRITAR', re: /\b(frit\w*|oleo|fritadeira)\b/i },
    { tag: 'ASSAR', re: /\b(assar|assad\w*|forno)\b/i },
    { tag: 'AQUECER', re: /\b(aquec\w*|micro-?ondas|pronto para( o)? consumo)\b/i },
    { tag: 'COZINHAR', re: /\b(cozinh\w*|agua fervente)\b/i },
];
const PREPARO_NEGACAO = /^(nao|sem)$/i;
const PREPARO_JANELA_NEGACAO = 3; // só anula o verbo se "não"/"sem" estiver a ATÉ 3 palavras antes dele
const PREPARO_LABEL_DE_TAG = { ASSAR: 'assar', FRITAR: 'fritar', COZINHAR: 'cozinhar', AQUECER: 'aquecer' };
const PREPARO_ORDEM_TAGS = ['ASSAR', 'FRITAR', 'COZINHAR', 'AQUECER'];

function preparoLabelDeEtiqueta(modoPreparo) {
    const texto = String(modoPreparo || '').trim();
    if (!texto) return null;
    const base = semAcento(texto).toLowerCase();
    const semPreAquec = semPreAquecimentoTexto(base);
    // Cláusulas separadas por . , ; — mantém "assar ou fritar" numa cláusula só (sem essa
    // pontuação entre os dois verbos), mas separa "não fritar, assar em forno" em duas, cada
    // uma julgada por si (a negação da 1ª não contamina a 2ª).
    const clausulas = semPreAquec.split(/[.,;]+/).map(c => c.trim()).filter(Boolean);
    const tags = new Set();
    for (const cl of clausulas) {
        for (const v of PREPARO_VERBOS) {
            const m = v.re.exec(cl);
            if (!m) continue;
            // Só anula o verbo se "não"/"sem" aparecer nas ATÉ 3 palavras imediatamente antes dele
            // ("não fritar", "não deve fritar", "sem fritar") — negação mais distante na mesma
            // cláusula ("não descongelar antes de fritar") não anula: aqui quem está negado é
            // "descongelar", não "fritar".
            const palavrasAntes = cl.slice(0, m.index).trim().split(/\s+/).filter(Boolean);
            const janela = palavrasAntes.slice(-PREPARO_JANELA_NEGACAO);
            if (janela.some(w => PREPARO_NEGACAO.test(w))) continue;
            tags.add(v.tag);
        }
    }
    if (!tags.size) return null;
    const ordenadas = PREPARO_ORDEM_TAGS.filter(t => tags.has(t));
    if (ordenadas.length === 1) {
        const t = ordenadas[0];
        if (t === 'FRITAR') return 'Para fritar';
        if (t === 'ASSAR') return 'Para assar';
        if (t === 'AQUECER') return 'Somente aquecer';
        if (t === 'COZINHAR') return 'Cozinhar';
    }
    const txt = ordenadas.map(t => PREPARO_LABEL_DE_TAG[t]).join(' ou ');
    return txt.charAt(0).toUpperCase() + txt.slice(1);
}

// ── Só ETIQUETAS (1 query) + nomes ─────────────────────────────────────────────────────────
// Extraído de `carregarExtrasProdutos` (revisão de código 16/09/2026): o catálogo público do
// site (`congeladosService.catalogoPublico`, roda em TODA visita) só precisa disto pra derivar
// `preparo` — não precisa de promoções. `produtos` = array de { id, codigo, nome,
// congeladosProduto? } (o registro Produto do Prisma serve).
async function carregarEtiquetasProdutos(produtos) {
    const lista = (produtos || []).filter(Boolean);
    const ids = [...new Set(lista.map(p => p.id).filter(Boolean))];
    const codigos = [...new Set(lista.map(p => p.codigo).filter(Boolean))];
    // Nomes para descrever condições de promoção ("a partir de 5 un de COXINHA…") — montado aqui
    // (não depende de query) pra `carregarExtrasProdutos` poder reaproveitar sem recalcular.
    const nomes = new Map();
    for (const p of lista) nomes.set(p.id, p.congeladosProduto?.nomeSite || p.nome || null);
    if (!ids.length) return { etiquetas: new Map(), nomes };

    const etiquetasRaw = await prisma.etiquetaProduto.findMany({
        where: { ativo: true, OR: [{ produtoId: { in: ids } }, ...(codigos.length ? [{ codigoProduto: { in: codigos } }] : [])] },
        orderBy: { updatedAt: 'desc' },
    }).catch(() => []);

    // Mesma regra do fichaPublico: por produtoId; não achando, por codigoProduto (mais recente).
    const porProdutoId = new Map();
    const porCodigo = new Map();
    for (const et of etiquetasRaw) {
        if (et.produtoId && !porProdutoId.has(et.produtoId)) porProdutoId.set(et.produtoId, et);
        if (et.codigoProduto && !porCodigo.has(et.codigoProduto)) porCodigo.set(et.codigoProduto, et);
    }
    const etiquetas = new Map();
    for (const p of lista) {
        const et = porProdutoId.get(p.id) || (p.codigo ? porCodigo.get(p.codigo) : null) || null;
        if (et) etiquetas.set(p.id, et);
    }
    return { etiquetas, nomes };
}

// ── Extras em lote (etiquetas + promoções vigentes + nomes p/ condições) ──────────────────
// Só para o caminho da IA (que usa promoção). `produtos` = array de { id, codigo, nome,
// congeladosProduto? } (o registro Produto do Prisma serve). `etiquetasBase` (opcional): quando
// o chamador já carregou as etiquetas desse mesmo lote (`congeladosService.catalogoPublico`
// pendura em `lista._etiquetas`), reaproveita em vez de rebuscar — só a query de promoção roda.
async function carregarExtrasProdutos(produtos, { etiquetasBase = null } = {}) {
    const lista = (produtos || []).filter(Boolean);
    const ids = [...new Set(lista.map(p => p.id).filter(Boolean))];
    const vazio = { etiquetas: new Map(), promos: new Map(), nomes: new Map() };
    if (!ids.length) return vazio;

    const [{ etiquetas, nomes }, promos] = await Promise.all([
        etiquetasBase ? Promise.resolve(etiquetasBase) : carregarEtiquetasProdutos(lista),
        promocaoService.listarVigentes({ produtoIds: ids }).catch(() => new Map()),
    ]);

    // Nomes para descrever condições ("a partir de 5 un de COXINHA…") — as condições podem
    // apontar para produtos fora do lote (`nomes` acima só cobre o lote recebido).
    const faltando = new Set();
    for (const promo of promos.values()) {
        for (const g of promo.grupos || []) for (const c of g.condicoes || []) {
            if (c.produtoId && !nomes.has(c.produtoId)) faltando.add(c.produtoId);
        }
    }
    if (faltando.size) {
        const outros = await prisma.produto.findMany({
            where: { id: { in: [...faltando] } },
            select: { id: true, nome: true, congeladosProduto: { select: { nomeSite: true } } },
        }).catch(() => []);
        for (const p of outros) nomes.set(p.id, p.congeladosProduto?.nomeSite || p.nome);
    }

    return { etiquetas, promos, nomes };
}

// ── Promoção no formato da IA ──────────────────────────────────────────────────────────────
// `precoPromo` = precoPromocional × (1 + acréscimo% da condição do contexto) — a MESMA conta da
// tela de pedido do vendedor (NovoPedido.jsx). `precoNormal` = preço de tabela do contexto (não
// o negociado do cliente, que pode estar abaixo). `tabelas` é sempre ["*"]: promoção aqui não
// tem vínculo com tabela de preço. `LEVE_MAIS` não existe neste sistema.
function promocaoParaIA(promo, { acrescimoPct = 0, precoTabela = null, nomePorProdutoId = null } = {}) {
    if (!promo) return null;
    const fator = 1 + dec(acrescimoPct) / 100;
    const nomeDe = (pid) => (nomePorProdutoId instanceof Map ? nomePorProdutoId.get(pid) : nomePorProdutoId?.[pid]) || null;
    const condicoes = promo.tipo === 'CONDICIONAL'
        ? (promo.grupos || []).map(g => (g.condicoes || []).map(c => ({
            tipo: c.tipo,
            produtoId: c.produtoId || null,
            produtoNome: c.produtoId ? nomeDe(c.produtoId) : null,
            quantidadeMinima: c.quantidadeMinima != null ? dec(c.quantidadeMinima) : null,
            valorMinimo: c.valorMinimo != null ? dec(c.valorMinimo) : null,
        })))
        : [];
    return {
        id: promo.id,
        nome: promo.nome,
        tipo: promo.tipo === 'CONDICIONAL' ? 'CONDICIONAL' : 'PRECO',
        tipoSistema: promo.tipo,
        produtoId: promo.produtoId,
        precoPromo: round2(dec(promo.precoPromocional) * fator),
        precoPromoBase: round2(promo.precoPromocional),
        precoNormal: precoTabela != null ? round2(precoTabela) : null,
        condicao: promocaoService.descreverCondicao(promo, nomePorProdutoId),
        condicoes,
        validoDe: dataSP(promo.dataInicio),
        validoAte: dataSP(promo.dataFim),
        tabelas: ['*'],
    };
}

// ── Produto no formato da IA ───────────────────────────────────────────────────────────────
// produto  = registro Produto (com imagens, categoriaProduto e, se houver, congeladosProduto)
// cp       = registro CongeladosProduto (item do site); null se o produto não está no site
// etiqueta = EtiquetaProduto ativa (peso unitário / peso do pacote) ou null
// promo    = Promocao vigente do produto ou null
// preparoLabel = rótulo livre da categoria (config `categoriasNomes[cat].preparo`) ou ''
// acrescimoPct = acréscimo % da condição do contexto (tabela "Site" no catálogo público)
// precoCliente = preço já calculado para o cliente reconhecido, ou null (catálogo público)
function produtoParaIA({ produto, cp = null, etiqueta = null, promo = null, preparoLabel = '', preparoOrigem = null, acrescimoPct = 0, precoCliente = null, nomePorProdutoId = null }) {
    const p = produto || cp?.produto || null;
    const site = cp || p?.congeladosProduto || null;
    const nomeCompleto = p?.nome || site?.nomeSite || '';
    // Etiqueta ativa do PCP (Dados da Etiqueta) é a fonte mais confiável de nome/peso/preparo
    // quando existir — cadastro dedicado, feito à mão, em vez de derivado por regex do nome do
    // sistema. `unidadesPorCaixa` do site continua tendo prioridade (é o que o pedido usa pra
    // fechar caixa) — a etiqueta só entra quando o site não tem esse dado.
    const base = site?.precoCongelados != null ? dec(site.precoCongelados) : dec(p?.valorVenda);
    const precoTabela = round2(base * (1 + dec(acrescimoPct) / 100));
    const unidadesPorEmbalagem = (site?.unidadesPorCaixa > 0 ? site.unidadesPorCaixa : null)
        ?? (etiqueta?.quantidadeEmbalagem > 0 ? etiqueta.quantidadeEmbalagem : null)
        ?? (p?.quantidadePorCaixa > 0 ? p.quantidadePorCaixa : null)
        ?? unidadesDoNome(nomeCompleto);
    const pesoUnidadeG = (etiqueta?.pesoUnitario > 0 ? etiqueta.pesoUnitario : null) ?? pesoDoNome(nomeCompleto);
    const pesoG = (etiqueta?.pesoPacote > 0 ? etiqueta.pesoPacote : null)
        ?? ((unidadesPorEmbalagem && pesoUnidadeG) ? unidadesPorEmbalagem * pesoUnidadeG : null);
    const ativo = !!p && p.ativo !== false && (site ? site.ativo !== false : true);
    const disponivel = ativo && Number(p?.estoqueDisponivel || 0) > 0;
    // preparoTipo é normalizado do rótulo em `preparoLabel` — que desde 2026-09-16 já vem
    // classificado com segurança (verbo + cláusula com negação tratada, ver
    // `preparoLabelDeEtiqueta`) pelo chamador (congeladosService), com fallback pro rótulo da
    // categoria quando a etiqueta não permite classificar. `preparoTipoDe` aqui só mapeia o
    // rótulo já pronto pro enum — não lê o texto livre da etiqueta diretamente.
    const modoPreparo = etiqueta?.modoPreparo ? String(etiqueta.modoPreparo).trim().slice(0, 300) : null;
    const preparoTipo = preparoTipoDe(preparoLabel);

    return {
        id: site?.id || null,                 // congeladosProdutoId — é o que vai em itens[].id ao criar pedido
        produtoId: p?.id || null,
        codigo: p?.codigo || '',
        nome: site?.nomeSite || nomeCompleto, // mesma regra do catálogo (nomeSite ‖ nome)
        nomeSite: site?.nomeSite || null,
        nomeCompleto,
        // etiqueta.nomeProduto é digitado à mão no PCP (nome limpo, sem código/prefixo) — mais
        // confiável que o derivado por regex do nome do sistema; usa só quando há etiqueta ativa.
        nomeCurto: etiqueta?.nomeProduto ? String(etiqueta.nomeProduto).trim() : nomeCurtoDe(nomeCompleto),
        linha: site ? 'CONGELADOS' : null,
        grupo: p?.categoriaProduto?.id || null,      // ID (igual ao catálogo)
        grupoNome: p?.categoriaProduto?.nome || null,
        // tamanho (P/M/G/GG) só é derivável do código/nome do sistema — a etiqueta não tem esse campo.
        tamanho: tamanhoDe(nomeCompleto),
        pesoUnidadeG,
        unidade: p?.unidade || '',
        unidades: site?.unidadesPorCaixa || 0,
        embalagem: site?.embalagem || 'caixa',
        embalagemInfo: {
            rotulo: site?.embalagem || 'caixa',
            unidade: p?.unidade || null,
            unidadesPorEmbalagem,
            pesoG,
        },
        preparo: preparoLabel ? String(preparoLabel) : '',
        preparoTipo,
        // (v1.6.4) de onde veio o rótulo de `preparo`: "ETIQUETA" (Dados da Etiqueta do PCP,
        // fonte preferida desde 16/09/2026) | "CATEGORIA" (texto do admin do site, reserva) | null
        // (nenhuma das duas fontes tinha preparo pra esse produto).
        preparoOrigem: preparoOrigem || null,
        // Texto livre do "Modo de Preparo" da etiqueta (cortado em 300 chars) — a Ana pode citar
        // literalmente quando o cliente perguntar "como preparo?".
        modoPreparo,
        // Dados da etiqueta ativa úteis para perguntas do tipo "tem glúten?"/"tem lactose?"/
        // "como guardar?". null quando não há etiqueta cadastrada para o produto.
        etiqueta: etiqueta ? {
            codigoBarras: etiqueta.codigoBarras || null,
            alergenos: Array.isArray(etiqueta.alergenos) ? etiqueta.alergenos : [],
            contemGluten: !!etiqueta.contemGluten,
            contemLactose: !!etiqueta.contemLactose,
            armazenamento: etiqueta.armazenamento || null,
        } : null,
        precoTabela,
        precoCliente: precoCliente != null ? round2(precoCliente) : null,
        preco: precoCliente != null ? round2(precoCliente) : precoTabela,
        minimoPorItem: 1,
        ativo,
        disponivel,
        indisponivel: !disponivel,
        previsaoRetorno: null,                // não existe previsão de retorno no cadastro
        promocao: promocaoParaIA(promo, { acrescimoPct, precoTabela, nomePorProdutoId }),
        imagem: imagemPrincipal(p),
        imagens: imagensProduto(p),
    };
}

// Soma ao item já serializado do catálogo SÓ as chaves que ele ainda não tem — os campos
// antigos (id, produtoId, preco, grupo, embalagem, preparo, indisponivel…) ficam intactos.
function enriquecerItem(item, novos) {
    for (const k of Object.keys(novos)) {
        if (!(k in item)) item[k] = novos[k];
    }
    return item;
}

module.exports = {
    PRODUTO_INCLUDE_IA,
    carregarEtiquetasProdutos,
    carregarExtrasProdutos,
    produtoParaIA,
    promocaoParaIA,
    enriquecerItem,
    nomeCurtoDe,
    tamanhoDe,
    preparoTipoDe,
    preparoLabelDeEtiqueta,
    round2,
    dataSP,
};
