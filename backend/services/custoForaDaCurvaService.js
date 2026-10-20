/**
 * Trava de "custo fora da curva" (20/10/2026) — Notas Recebidas e Contas a Pagar.
 *
 * Avisa ANTES de gravar quando o custo unitário que vai ser lançado destoa da referência
 * do produto/insumo (> 3x ou < 1/3) ou quando a unidade do fornecedor é de embalagem
 * (CX, FD, PCT...) e o fator de conversão ficou em 1 — os dois erros típicos de digitação
 * que distorcem estoque e custo (ex.: "2 CX" lançadas como 2 kg).
 *
 * Só LEITURA. A trava fica nas ROTAS (nunca nos services de estoque, que adminExec e
 * scripts chamam direto). Cálculo do custo idêntico a
 * notaEstoqueService.montarItensResolvidos: qtd = round(q * fator, 3); custo = valorTotal / qtd.
 *
 * Funções puras (testáveis sem banco): normalizarUnidade, avaliarItem, calcularReferencia.
 * avaliarLote faz no máximo 3 consultas Prisma para a lista inteira (nunca 1 por item).
 */
const prisma = require('../config/database');

const RAZAO_LIMITE = 3;      // custo > 3x ou < 1/3 da referência
const AMOSTRA = 5;           // mediana das últimas N compras válidas
const JANELA_DIAS = 540;     // só compras dos últimos ~18 meses entram na referência

// Unidades que são EMBALAGEM (contêm N unidades de medida). Levantadas no histórico de
// produção (compras_itens.unidade_fornecedor / itens_pcp.unidade). Unidade de medida
// legítima (KG, LT, UN, PC, G, ML, M) NUNCA entra aqui.
const UNIDADES_EMBALAGEM = new Set([
    'CX', 'FD', 'PCT', 'BLD', 'SC', 'SQ', 'BIS', 'FR', 'GF', 'CT', 'PET', 'POTE', 'LATA', 'KIT'
]);

const NOMES_EMBALAGEM = {
    CX: 'Caixa', FD: 'Fardo', PCT: 'Pacote', BLD: 'Bandeja', SC: 'Saco', SQ: 'Saquinho',
    BIS: 'Bisnaga', FR: 'Frasco', GF: 'Garrafa', CT: 'Cartela', PET: 'Garrafa PET',
    POTE: 'Pote', LATA: 'Lata', KIT: 'Kit'
};

const ALIAS_UNIDADE = {
    KILOGRAMA: 'KG', KILO: 'KG', QUILO: 'KG', QUILOGRAMA: 'KG', KGS: 'KG',
    L: 'LT', LTS: 'LT', LITRO: 'LT', LITROS: 'LT',
    UNID: 'UN', UND: 'UN', UNI: 'UN', UNIDADE: 'UN', UNIDADES: 'UN',
    PACOTE: 'PCT', PT: 'PCT', PCTE: 'PCT',
    CAIXA: 'CX', FARDO: 'FD', BANDEJA: 'BLD', BDJ: 'BLD', SACO: 'SC', GARRAFA: 'GF',
    POTES: 'POTE', LATAS: 'LATA', BISNAGA: 'BIS', FRASCO: 'FR', PC: 'PC', PECA: 'PC'
};

const round = (v, casas) => { const f = 10 ** casas; return Math.round(Number(v) * f) / f; };
const num = (v) => Number(v || 0);

function normalizarUnidade(u) {
    const s = String(u == null ? '' : u)
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[.\s]/g, '').toUpperCase();
    if (!s) return '';
    return ALIAS_UNIDADE[s] || s;
}

const ehEmbalagem = (u) => UNIDADES_EMBALAGEM.has(normalizarUnidade(u));

// ── formatação pt-BR (manual: não depende do ICU do Node) ──
function fmtMoeda(v) {
    const n = Number(v);
    const casas = Math.abs(n) > 0 && Math.abs(n) < 0.1 ? 4 : 2;
    const f = 10 ** casas;
    const [int, dec] = (Math.round(Math.abs(n) * f + 1e-6) / f).toFixed(casas).split('.'); // meio-centavo sobe (toFixed erra 124,085)
    return `R$ ${n < 0 ? '-' : ''}${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}
function fmtQtd(v) {
    const [int, dec] = round(v, 3).toFixed(3).split('.');
    const d = dec.replace(/0+$/, '');
    return int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d ? `,${d}` : '');
}
function fmtData(d) {
    if (!d) return '';
    const t = new Date(new Date(d).getTime() - 3 * 3600 * 1000); // fuso de Brasília
    return `${String(t.getUTCDate()).padStart(2, '0')}/${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}
const un = (u) => String(u || '').toLowerCase();

function mediana(valores) {
    const v = valores.slice().sort((a, b) => a - b);
    if (v.length === 0) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * Referência de custo do alvo.
 * @param {Array}  compras  compras válidas JÁ ordenadas da mais recente p/ a mais antiga:
 *                          [{ custoUnitario, dataCompra }]
 * @param {number|null} custoCadastro  custo atual do cadastro (fallback)
 */
function calcularReferencia(compras, custoCadastro) {
    const amostra = (compras || []).filter((c) => num(c.custoUnitario) > 0).slice(0, AMOSTRA);
    if (amostra.length > 0) {
        return {
            custo: round(mediana(amostra.map((c) => num(c.custoUnitario))), 6),
            fonte: 'COMPRAS',
            dataUltima: amostra[0].dataCompra || null,
            custoUltima: round(num(amostra[0].custoUnitario), 6),
            qtdAmostra: amostra.length
        };
    }
    if (num(custoCadastro) > 0) {
        return { custo: round(num(custoCadastro), 6), fonte: 'CADASTRO', dataUltima: null, custoUltima: null, qtdAmostra: 0 };
    }
    return null;
}

/**
 * Avalia UM item. Devolve a lista de alertas (0, 1 ou 2).
 * @param {object} i {
 *   chave, descricao, quantidade (na unidade do fornecedor), valorTotal,
 *   unidadeFornecedor (opcional — despesa manual não tem), fator (default 1),
 *   alvoUnidade (nossa unidade), referencia (calcularReferencia) | null,
 *   checarCusto (default true), checarEmbalagem (default false),
 *   jaUsouEmbalagemFator1 (alvo já tem compra válida com a mesma unidade e fator 1)
 * }
 */
function avaliarItem(i) {
    const alertas = [];
    const fator = num(i.fator) > 0 ? num(i.fator) : 1;
    const quantidadeConvertida = round(num(i.quantidade) * fator, 3);
    if (!(quantidadeConvertida > 0)) return alertas;

    const valorTotal = num(i.valorTotal);
    const custoUnitario = valorTotal > 0 ? round(valorTotal / quantidadeConvertida, 6) : null;
    const base = {
        chave: i.chave,
        descricao: i.descricao || '',
        custoUnitario,
        unidade: i.alvoUnidade || null,
        unidadeFornecedor: i.unidadeFornecedor || null,
        quantidadeFornecedor: num(i.quantidade),
        quantidadeConvertida,
        fator
    };

    // 1) Custo fora da curva
    const ref = i.referencia || null;
    if (i.checarCusto !== false && custoUnitario != null && ref && num(ref.custo) > 0) {
        const razao = custoUnitario / num(ref.custo);
        let tipo = null;
        if (razao > RAZAO_LIMITE) tipo = 'CUSTO_ALTO';
        else if (razao < 1 / RAZAO_LIMITE) tipo = 'CUSTO_BAIXO';
        if (tipo) {
            const un_ = un(i.alvoUnidade);
            const sufixo = un_ ? `/${un_}` : '';
            const parteRef = ref.fonte === 'COMPRAS'
                ? `Última compra: ${fmtMoeda(ref.custoUltima)}${sufixo}${ref.dataUltima ? ` (${fmtData(ref.dataUltima)})` : ''}.`
                : `Custo atual do cadastro: ${fmtMoeda(ref.custo)}${sufixo}.`;
            alertas.push({
                ...base,
                tipo,
                referencia: {
                    custo: ref.custo, fonte: ref.fonte,
                    dataUltima: ref.dataUltima, custoUltima: ref.custoUltima, qtdAmostra: ref.qtdAmostra
                },
                razao: round(razao, 4),
                mensagem: `${fmtMoeda(custoUnitario)}${sufixo}. ${parteRef} Confira quantidade e fator de conversão.`
            });
        }
    }

    // 2) Embalagem com fator 1
    if (i.checarEmbalagem && fator === 1 && i.unidadeFornecedor && i.alvoUnidade
        && ehEmbalagem(i.unidadeFornecedor)
        && normalizarUnidade(i.unidadeFornecedor) !== normalizarUnidade(i.alvoUnidade)
        && !i.jaUsouEmbalagemFator1) {
        const uf = normalizarUnidade(i.unidadeFornecedor);
        const nome = NOMES_EMBALAGEM[uf] || `Embalagem (${uf})`;
        alertas.push({
            ...base,
            tipo: 'EMBALAGEM_FATOR_1',
            referencia: ref ? {
                custo: ref.custo, fonte: ref.fonte,
                dataUltima: ref.dataUltima, custoUltima: ref.custoUltima, qtdAmostra: ref.qtdAmostra
            } : null,
            razao: ref && custoUnitario != null && num(ref.custo) > 0 ? round(custoUnitario / num(ref.custo), 4) : null,
            mensagem: `${nome} com fator 1: ${fmtQtd(i.quantidade)} ${uf} viraram ${fmtQtd(quantidadeConvertida)} ${un(i.alvoUnidade)}. Quantos ${un(i.alvoUnidade)} tem cada ${nome.toLowerCase()}?`
        });
    }
    return alertas;
}

/**
 * Avalia uma lista de itens com NO MÁXIMO 3 consultas (insumos, produtos, compras).
 * @param {Array} itens [{ chave, descricao, produtoId?, itemPcpId?, alvoUnidadeNovo? (produto criado na hora),
 *                         quantidade, valorTotal, unidadeFornecedor?, fator?, checarCusto?, checarEmbalagem? }]
 * @param {object} opts { excluirNotaId, excluirContaId } — origem atual fica fora da referência
 */
async function avaliarLote(itens, { excluirNotaId = null, excluirContaId = null } = {}) {
    const lista = (itens || []).filter(Boolean);
    if (lista.length === 0) return [];

    const prodIds = [...new Set(lista.map((i) => i.produtoId).filter(Boolean))];
    const pcpIds = [...new Set(lista.map((i) => i.itemPcpId).filter(Boolean))];

    // Consulta 1: insumos PCP (nome, unidade, custo, produto espelho)
    const pcps = pcpIds.length
        ? await prisma.itemPcp.findMany({ where: { id: { in: pcpIds } }, select: { id: true, nome: true, unidade: true, custoUnitario: true, produtoId: true } })
        : [];
    const pcpPorId = new Map(pcps.map((p) => [p.id, p]));
    // Consulta 2: produtos (diretos; o espelho só serve para somar compras, não precisa do cadastro)
    const prods = prodIds.length
        ? await prisma.produto.findMany({ where: { id: { in: prodIds } }, select: { id: true, nome: true, unidade: true, custoManual: true, custoMedio: true } })
        : [];
    const prodPorId = new Map(prods.map((p) => [p.id, p]));

    // Consulta 3: compras válidas de todos os alvos (alvo PCP soma as do produto espelho)
    const produtoIdsCompras = new Set(prodIds);
    for (const p of pcps) if (p.produtoId) produtoIdsCompras.add(p.produtoId);
    const desde = new Date(Date.now() - JANELA_DIAS * 24 * 3600 * 1000);
    const where = {
        estornado: false,
        quantidade: { gt: 0 },
        custoUnitario: { gt: 0 },
        dataCompra: { gte: desde },
        OR: [
            ...(produtoIdsCompras.size ? [{ produtoId: { in: [...produtoIdsCompras] } }] : []),
            ...(pcpIds.length ? [{ itemPcpId: { in: pcpIds } }] : [])
        ]
    };
    // NOT com OR explícito: coluna nula (compra de despesa manual não tem nota) deve CONTINUAR entrando.
    const and = [];
    if (excluirNotaId) and.push({ OR: [{ notaEntradaId: null }, { notaEntradaId: { not: excluirNotaId } }] });
    if (excluirContaId) and.push({ OR: [{ contaPagarId: null }, { contaPagarId: { not: excluirContaId } }] });
    if (and.length) where.AND = and;
    const compras = where.OR.length
        ? await prisma.compraItem.findMany({
            where,
            select: { produtoId: true, itemPcpId: true, custoUnitario: true, dataCompra: true, unidadeFornecedor: true, fatorConversao: true },
            orderBy: { dataCompra: 'desc' }
        })
        : [];

    const comprasDoAlvo = (item) => {
        const pcp = item.itemPcpId ? pcpPorId.get(item.itemPcpId) : null;
        const prodAlvo = item.produtoId || pcp?.produtoId || null;
        return compras.filter((c) =>
            (item.itemPcpId && c.itemPcpId === item.itemPcpId) || (prodAlvo && c.produtoId === prodAlvo));
    };

    const alertas = [];
    for (const item of lista) {
        let alvoNome = null; let alvoUnidade = item.alvoUnidadeNovo || null; let cadastro = null;
        let temAlvo = false;
        if (item.produtoId) {
            const p = prodPorId.get(item.produtoId);
            if (p) { alvoNome = p.nome; alvoUnidade = p.unidade; cadastro = num(p.custoManual) > 0 ? num(p.custoManual) : num(p.custoMedio); temAlvo = true; }
        } else if (item.itemPcpId) {
            const p = pcpPorId.get(item.itemPcpId);
            if (p) { alvoNome = p.nome; alvoUnidade = p.unidade; cadastro = num(p.custoUnitario); temAlvo = true; }
        }
        // Produto criado na hora: só embalagem (não há histórico). Alvo inexistente: ignora.
        if (!temAlvo && !item.alvoUnidadeNovo) continue;

        const dele = temAlvo ? comprasDoAlvo(item) : [];
        const unF = normalizarUnidade(item.unidadeFornecedor);
        const jaUsou = !!unF && dele.some((c) => normalizarUnidade(c.unidadeFornecedor) === unF && num(c.fatorConversao) === 1);
        const referencia = temAlvo ? calcularReferencia(dele, cadastro) : null;

        alertas.push(...avaliarItem({
            chave: item.chave,
            descricao: item.descricao || alvoNome || '',
            quantidade: item.quantidade,
            valorTotal: item.valorTotal,
            unidadeFornecedor: item.unidadeFornecedor,
            fator: item.fator,
            alvoUnidade,
            referencia,
            checarCusto: temAlvo && item.checarCusto !== false,
            checarEmbalagem: !!item.checarEmbalagem,
            jaUsouEmbalagemFator1: jaUsou
        }));
    }
    return alertas;
}

/** Resposta 409 padrão das rotas de gravação. */
function respostaBloqueio(alertas) {
    return {
        ok: false,
        codigo: 'CUSTO_FORA_DA_CURVA',
        error: 'Há item com custo ou conversão suspeita. Confira antes de gravar.',
        alertas
    };
}

/** Log de quem confirmou mesmo assim. */
function logConfirmacao(alertas, usuarioId, contexto) {
    for (const a of alertas) {
        console.warn(`[CustoForaDaCurva] ${contexto} usuario=${usuarioId} item="${a.descricao}" tipo=${a.tipo} custo=${a.custoUnitario} razao=${a.razao} ref=${a.referencia?.custo ?? '-'} qtdForn=${a.quantidadeFornecedor}${a.unidadeFornecedor ? ' ' + a.unidadeFornecedor : ''} fator=${a.fator}`);
    }
}

module.exports = {
    RAZAO_LIMITE, AMOSTRA, JANELA_DIAS, UNIDADES_EMBALAGEM,
    normalizarUnidade, ehEmbalagem, calcularReferencia, avaliarItem, avaliarLote,
    respostaBloqueio, logConfirmacao
};
