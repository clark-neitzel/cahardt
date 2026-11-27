// GUARDAS do agente: mesmo com a célula da matriz em SIM, certas chamadas viram PEDIDO DE AUTORIZAÇÃO (PEDE).
//
// Por que REBAIXAR e não recusar: um `confirmarDuplicata:true` mandado por um agente não protege nada. Na dúvida a
// chamada vai para a fila com o motivo escrito, e o DONO decide (plano, seção 3.4).
//
// Regras:
//  - só olham a requisição (corpo JSON / query) e fazem LEITURAS curtas no banco; nunca gravam, nunca chamam rede;
//  - falha ao conferir (banco fora, erro inesperado) = REBAIXA (fecha), com o motivo "não foi possível conferir";
//  - valem só na chamada DIRETA do agente com a matriz ativa. Na execução de um pedido já autorizado (ticket) não
//    rodam de novo: ali o dono já viu o motivo e decidiu.
//  - corpo multipart não é lido aqui (o arquivo ainda não foi processado quando a política decide): para isso existe
//    `recusarSeAgente`, chamado DENTRO da rota depois do upload.
// Guardas "fixas" (função que SEMPRE pede) ficam na classificação (`semprePede` em config/agenteClassificacao.js).
const prisma = require('../config/database');
const { contextoAgente } = require('../utils/agenteContexto');

const LIMITE_LOTE = 20; // listas maiores que isto viram pedido (um engano se repetiria N vezes)

const verdadeiro = (v) => v === true || v === 1 || v === '1' || (typeof v === 'string' && ['true', 'sim', 's'].includes(v.trim().toLowerCase()));
const preenchido = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const NOMES_IGNORADOS = new Set(['vários', 'varios', 'sem categoria', '']); // espelha categoriaDespesaService.limparNome

function nomeCategoria(v) {
    const n = String(v == null ? '' : v).trim();
    return !n || NOMES_IGNORADOS.has(n.toLowerCase()) ? null : n;
}

function diaInteiro(data) {
    const d = new Date(data);
    if (isNaN(d.getTime())) return null;
    const ini = new Date(d.getTime() - 36 * 60 * 60 * 1000); // janela larga (fuso): 1,5 dia para cada lado
    const fim = new Date(d.getTime() + 36 * 60 * 60 * 1000);
    return { gte: ini, lte: fim };
}

// ───────────────────────── guardas reutilizáveis ─────────────────────────
function semBaixaNaCriacao(body) {
    const b = obj(body);
    if (verdadeiro(b.pago) || preenchido(b.dataPagamento)) return ['lançar já como PAGO é dar baixa (pago/dataPagamento): precisa de autorização'];
    return [];
}

/** Categoria fora da DRE, ou que ainda não existe (seria criada por texto livre). */
async function categoriaPermitida(nomes) {
    const lista = [...new Set((nomes || []).map(nomeCategoria).filter(Boolean))];
    if (!lista.length) return [];
    const achadas = await prisma.categoriaDespesa.findMany({ where: { nome: { in: lista } }, select: { nome: true, classificacao: true } });
    const porNome = new Map(achadas.map((c) => [c.nome, c]));
    const motivos = [];
    for (const n of lista) {
        const c = porNome.get(n);
        if (!c) motivos.push(`a categoria "${n.slice(0, 60)}" não existe e seria criada por texto livre`);
        else if (c.classificacao === 'FORA_DRE') motivos.push(`a categoria "${n.slice(0, 60)}" fica FORA da DRE (retirada de lucros, empréstimo, imobilizado...)`);
    }
    return motivos;
}

/** Despesa parecida já lançada: mesmo fornecedor + (mesmo nº de documento OU mesma parcela de valor e vencimento). */
async function duplicataDespesa(body) {
    const b = obj(body);
    if (!preenchido(b.fornecedorId)) return [];
    const base = { fornecedorId: String(b.fornecedorId), status: { not: 'CANCELADO' } }; // `status` é obrigatório (nunca null)
    if (preenchido(b.numeroNota)) {
        const mesmaNota = await prisma.contaPagar.findFirst({ where: { ...base, numeroNota: String(b.numeroNota).trim() }, select: { id: true } });
        if (mesmaNota) return ['possível duplicata: já existe despesa deste fornecedor com o mesmo número de documento'];
    }
    const parcelas = Array.isArray(b.parcelas) ? b.parcelas.slice(0, 12) : [];
    for (const p of parcelas) {
        const valor = Number(p && p.valor);
        const janela = diaInteiro(p && p.dataVencimento);
        if (!Number.isFinite(valor) || valor <= 0 || !janela) continue;
        const igual = await prisma.contaPagar.findFirst({
            where: { ...base, parcelas: { some: { valor: { gte: valor - 0.005, lte: valor + 0.005 }, dataVencimento: janela } } },
            select: { id: true },
        });
        if (igual) return ['possível duplicata: já existe despesa deste fornecedor com parcela de mesmo valor e vencimento'];
    }
    return [];
}

async function duplicataFornecedor(body) {
    const b = obj(body);
    if (preenchido(b.cnpjCpf)) return []; // com documento a própria rota recusa o repetido
    const nome = String(b.razaoSocial || '').trim();
    if (!nome) return [];
    const igual = await prisma.fornecedor.findFirst({ where: { razaoSocial: { equals: nome, mode: 'insensitive' } }, select: { id: true } });
    return igual
        ? ['possível duplicata: fornecedor sem CNPJ/CPF e já existe outro com a mesma razão social']
        : ['fornecedor sem CNPJ/CPF: não dá para conferir duplicidade pelo documento'];
}

function clienteSemDocumento(body) {
    return preenchido(obj(body).Documento) ? [] : ['cliente sem CPF/CNPJ: não dá para conferir se o cadastro já existe'];
}

async function duplicataNotaManual(body) {
    const b = obj(body);
    const cnpj = String(b.fornecedorCnpj || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    if (!cnpj) return ['nota manual sem CNPJ do fornecedor: não dá para conferir se a SEFAZ já trouxe a mesma nota'];
    const base = { fornecedorCnpj: cnpj, status: { not: 'CANCELADA_EMITENTE' } }; // `status` é obrigatório (nunca null)
    if (preenchido(b.numero)) {
        const mesmoNumero = await prisma.notaEntrada.findFirst({ where: { ...base, numero: String(b.numero).trim() }, select: { id: true } });
        if (mesmoNumero) return ['possível duplicata: já existe nota deste fornecedor com o mesmo número'];
    }
    const valor = Number(b.valorTotal);
    if (Number.isFinite(valor) && valor > 0) {
        const mesmoValor = await prisma.notaEntrada.findFirst({ where: { ...base, valorTotal: { gte: valor - 0.005, lte: valor + 0.005 } }, select: { id: true } });
        if (mesmoValor) return ['possível duplicata: já existe nota deste fornecedor com o mesmo valor (pode ser a mesma nota vinda da SEFAZ)'];
    }
    return [];
}

async function duplicataItemPcp(body) {
    const nome = String(obj(body).nome || '').trim();
    if (!nome) return [];
    const igual = await prisma.itemPcp.findFirst({ where: { nome: { equals: nome, mode: 'insensitive' } }, select: { id: true } });
    return igual ? ['possível duplicata: já existe item de PCP com este nome'] : [];
}

function loteGrande(lista, oQue) {
    return Array.isArray(lista) && lista.length > LIMITE_LOTE ? [`lote com ${lista.length} ${oQue} (acima de ${LIMITE_LOTE}): precisa de autorização`] : [];
}

// ───────────────────────── registro: chave do catálogo -> guarda ─────────────────────────
const REGISTRO = {
    'POST /api/contas-pagar': async ({ body }) => [
        ...semBaixaNaCriacao(body),
        // despesa COM produtos dá ENTRADA no estoque e mexe no custo médio sem nota: a entrada do agente vem pela nota (gerar-conta)
        ...(Array.isArray(obj(body).itens) && obj(body).itens.length ? ['despesa com produtos (itens): dá entrada no estoque e altera o custo sem nota fiscal'] : []),
        ...loteGrande(obj(body).parcelas, 'parcelas'),
        ...(await categoriaPermitida([obj(body).categoria])),
        ...(await duplicataDespesa(body)),
    ],
    'POST /api/notas-entrada/:p/gerar-conta': async ({ body }) => {
        const b = obj(body);
        const itens = Array.isArray(b.itens) ? b.itens : [];
        return [
            ...semBaixaNaCriacao(b),
            ...(await categoriaPermitida([b.categoriaPadrao, ...itens.slice(0, 500).map((i) => i && i.categoria)])),
        ];
    },
    'POST /api/notas-entrada/lancar-manual': async ({ body }) => duplicataNotaManual(body),
    'POST /api/fornecedores': async ({ body }) => duplicataFornecedor(body),
    'POST /api/clientes': async ({ body }) => clienteSemDocumento(body),
    'POST /api/produtos': async ({ body }) => {
        const b = obj(body);
        const m = [];
        if (preenchido(b.estoqueInicial) && Number(String(b.estoqueInicial).replace(',', '.')) !== 0) m.push('produto com estoque inicial: é entrada de estoque sem documento');
        if (preenchido(b.valorVenda)) m.push('produto já com preço de venda: o preço é decisão do dono');
        return m;
    },
    'POST /api/pcp/itens': async ({ body }) => duplicataItemPcp(body),
    'POST /api/pcp/itens/importar-lote': async ({ body }) => loteGrande(obj(body).itens, 'itens'),
    'POST /api/pcp/receitas': async ({ body }) => (String(obj(body).status || '').trim().toLowerCase() === 'rascunho'
        ? [] : ['receita que não é rascunho: sem `status: "rascunho"` ela nasce ATIVA (em uso na produção)']),
    // extrato enviado como JSON/query (o normal é multipart: aí vale `recusarSeAgente` dentro da rota)
    'POST /api/conciliacao-bancaria/importar': async ({ body, query }) => (verdadeiro(obj(body).forcar) || verdadeiro(obj(query).forcar)
        ? ['importar extrato com `forcar` ignora a trava de conta errada'] : []),
};

function temGuarda(chave) { return Object.prototype.hasOwnProperty.call(REGISTRO, chave); }

/**
 * Avalia as guardas de uma função. Devolve { rebaixar: bool, motivos: [texto] }. NUNCA lança.
 * `req` precisa de body (já lido pelo express.json) e query.
 */
async function avaliar(chave, req) {
    const fn = REGISTRO[chave];
    // vale para QUALQUER função: "confirmo que o custo fora da curva está certo" é confirmação de PESSOA na tela;
    // vinda de um agente não protege nada (ele mesmo mandaria a flag) -> vira pedido de autorização
    const gerais = verdadeiro(obj(req && req.body).confirmarCustoForaDaCurva)
        ? ['veio com `confirmarCustoForaDaCurva`: confirmar custo fora da curva é decisão de uma pessoa'] : [];
    if (!fn) return { rebaixar: gerais.length > 0, motivos: gerais };
    try {
        const motivos = [...gerais, ...(await fn({ body: req && req.body, query: req && req.query }))].filter(Boolean);
        return { rebaixar: motivos.length > 0, motivos };
    } catch (e) {
        console.error('[AgenteGuardas] falha ao conferir (a chamada vira pedido de autorização):', chave, e && e.message);
        return { rebaixar: true, motivos: ['não foi possível conferir as travas de segurança agora (duplicidade/categoria)'] };
    }
}

/**
 * Para usar DENTRO de rota com upload (multipart), depois que o corpo foi lido: se a requisição é de agente e a
 * condição perigosa veio, responde 422 e devolve true (a rota deve parar). Humano/worker: devolve false, nada muda.
 */
function recusarSeAgente(res, condicao, mensagem) {
    if (!condicao || !contextoAgente()) return false;
    res.status(422).json({ error: mensagem, codigo: 'AGENTE_GUARDA', orientacao: 'Esta opção não pode ser usada pelo agente. Peça a uma pessoa para fazer pela tela.' });
    return true;
}

module.exports = { avaliar, temGuarda, recusarSeAgente, REGISTRO, LIMITE_LOTE };
