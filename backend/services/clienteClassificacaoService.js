// Classificação do cadastro: CLIENTE | FORNECEDOR | CLIENTE_FORNECEDOR | A_CLASSIFICAR.
//
// AUTOMÁTICA (calculada ao vivo, nunca gravada — por isso não há backfill nem marcador de boot):
//   - temContasReceber: existe QUALQUER ContaReceber do cliente (inclui QUITADO/CANCELADO: é histórico).
//   - temPedido: existe Pedido não cancelado e não bonificação. É mais largo que WHERE_PEDIDO_RECEITA
//     (FATURADO ou especial) de propósito: pedido feito e ainda não faturado já prova que é cliente;
//     pedido só de bonificação (brinde, sem cobrança) não prova.
//   - temContasPagar: o documento do cliente bate com o de um Fornecedor que tenha ao menos uma
//     ContaPagar. Não existe FK de pagar → cliente; o elo é o documento, sempre via normalizarDoc
//     (preserva letras do CNPJ alfanumérico) e documento vazio nunca casa com nada.
//   CaReceberImportado NÃO entra: é arquivo morto do CA (chave clienteCaId/nome, não Cliente.UUID); o
//   contas a receber operacional + pedidos já cobrem os dados vivos.
//   `Perfis` NÃO entra no cálculo (vazio/ inválido vira "CLIENTE" no mapa — sinal ruim); só é mostrado
//   como dica.
//
// MANUAL: linha em `cliente_classificacao` (tabela lateral, sem FK). Vale por cima do automático;
// apagar a linha volta ao automático. Toda escrita vai para `cliente_alteracoes`.
const prisma = require('../config/database');
const { erro, idOpcional } = require('./analyticsComum');
const historico = require('./clienteHistoricoService');
const { normalizarDoc } = require('../utils/documento');

const VALORES = ['CLIENTE', 'FORNECEDOR', 'CLIENTE_FORNECEDOR'];
const A_CLASSIFICAR = 'A_CLASSIFICAR';
const TELA = 'Cadastros pra acertar';

/** Perfis do cadastro como dica. Diferente do mapa: vazio/inválido => [] (nada registrado). */
function perfisDe(raw) {
    let lista = [];
    try { lista = JSON.parse(raw || '[]'); } catch { lista = []; }
    if (!Array.isArray(lista)) lista = [];
    const out = [];
    for (const item of lista) {
        const v = String((item && typeof item === 'object' ? item.perfil : item) ?? '').trim().toUpperCase();
        if (v && !out.includes(v)) out.push(v);
    }
    return out;
}

/** Regra automática. Pura. */
function automaticaDe({ temContasReceber, temPedido, temContasPagar }) {
    const temCliente = !!(temContasReceber || temPedido);
    const temFornecedor = !!temContasPagar;
    if (temCliente && temFornecedor) return 'CLIENTE_FORNECEDOR';
    if (temFornecedor) return 'FORNECEDOR';
    if (temCliente) return 'CLIENTE';
    return A_CLASSIFICAR;
}

/** Objeto público. Pura (sem Prisma): evidências + manual opcional (+ perfis crus do cadastro). */
function montar({ evidencias = {}, manual = null, perfis = null } = {}) {
    const ev = {
        temContasReceber: !!evidencias.temContasReceber,
        temPedido: !!evidencias.temPedido,
        temContasPagar: !!evidencias.temContasPagar,
    };
    const automatica = automaticaDe(ev);
    const man = VALORES.includes(manual) ? manual : null;
    const valor = man || automatica;
    return {
        valor,
        origem: man ? 'manual' : 'automatica',
        automatica,
        manual: man,
        somenteFornecedor: valor === 'FORNECEDOR',
        evidencias: ev,
        perfis: perfisDe(perfis),
    };
}

/** Documentos (normalizados, não vazios) de fornecedores que têm ao menos uma conta a pagar. 3 queries no máximo. */
async function documentosComContasPagar() {
    const pagar = await prisma.contaPagar.findMany({ where: { fornecedorId: { not: null } }, select: { fornecedorId: true }, distinct: ['fornecedorId'] });
    const ids = pagar.map((p) => p.fornecedorId).filter(Boolean);
    if (!ids.length) return new Set();
    const forn = await prisma.fornecedor.findMany({ where: { id: { in: ids } }, select: { cnpjCpf: true } });
    return new Set(forn.map((f) => normalizarDoc(f.cnpjCpf)).filter(Boolean));
}

/**
 * Evidências + manual de vários clientes em poucas queries (nunca uma por cliente).
 * `clientes`: [{ UUID, Documento, Perfis }]. Devolve Map<UUID, objeto público>.
 * `todos: true` evita o filtro `in` (quando a lista é "todos os ativos", o IN gigante só atrapalha).
 */
async function classificacaoDeClientes(clientes, { todos = false } = {}) {
    const mapa = new Map();
    if (!clientes.length) return mapa;
    const ids = clientes.map((c) => c.UUID);
    const filtro = todos ? {} : { clienteId: { in: ids } };
    const [receber, pedidos, docsPagar, manuais] = await Promise.all([
        prisma.contaReceber.findMany({ where: filtro, select: { clienteId: true }, distinct: ['clienteId'] }),
        prisma.pedido.findMany({ where: { ...filtro, cancelado: false, bonificacao: false }, select: { clienteId: true }, distinct: ['clienteId'] }),
        documentosComContasPagar(),
        prisma.clienteClassificacao.findMany({ where: todos ? {} : { clienteId: { in: ids } }, select: { clienteId: true, classificacao: true } }),
    ]);
    const comReceber = new Set(receber.map((r) => r.clienteId));
    const comPedido = new Set(pedidos.map((r) => r.clienteId));
    const manualPorId = new Map(manuais.map((m) => [m.clienteId, m.classificacao]));
    for (const c of clientes) {
        const doc = normalizarDoc(c.Documento);
        mapa.set(c.UUID, montar({
            evidencias: {
                temContasReceber: comReceber.has(c.UUID),
                temPedido: comPedido.has(c.UUID),
                temContasPagar: !!doc && docsPagar.has(doc),
            },
            manual: manualPorId.get(c.UUID) || null,
            perfis: c.Perfis,
        }));
    }
    return mapa;
}

/** Só com ids (listas que não trazem o documento): busca Documento/Perfis em uma query e classifica. */
async function classificacaoPorIds(idsBrutos) {
    const ids = [...new Set((idsBrutos || []).filter(Boolean))];
    if (!ids.length) return new Map();
    const rows = await prisma.cliente.findMany({ where: { UUID: { in: ids } }, select: { UUID: true, Documento: true, Perfis: true } });
    return classificacaoDeClientes(rows);
}

/** Acrescenta `classificacao` e `somenteFornecedor` a cada item (sem mexer nos demais campos). */
async function enriquecer(itens, idDe) {
    if (!Array.isArray(itens) || !itens.length) return itens;
    const mapa = await classificacaoPorIds(itens.map(idDe));
    for (const it of itens) {
        const c = mapa.get(idDe(it));
        if (c) { it.classificacao = c; it.somenteFornecedor = c.somenteFornecedor; }
    }
    return itens;
}

const rotulo = (origem, valor) => `${origem}:${valor}`;

/**
 * Grava ou limpa a classificação manual. `body.classificacao`: CLIENTE | FORNECEDOR | CLIENTE_FORNECEDOR |
 * "automatica" (ou null) para voltar ao automático. `ator`: { agente } (API) ou { id, nome } (app).
 */
async function classificar(clienteId, body, ator) {
    const id = idOpcional(clienteId, 'clienteId');
    if (!id) throw erro(400, 'Informe o cliente.', 'CAMPO_OBRIGATORIO');
    const bruto = body?.classificacao;
    const limpar = bruto === null || String(bruto ?? '').trim().toLowerCase() === 'automatica';
    const valor = limpar ? null : String(bruto ?? '').trim().toUpperCase();
    if (!limpar && !VALORES.includes(valor)) {
        throw erro(400, `classificacao inválida. Use: ${VALORES.join(', ')} ou automatica.`, 'CLASSIFICACAO_INVALIDA');
    }
    const cliente = await prisma.cliente.findUnique({ where: { UUID: id }, select: { UUID: true, Documento: true, Perfis: true } });
    if (!cliente) throw erro(404, 'Cliente não encontrado.', 'NAO_ENCONTRADO');

    const antes = await prisma.clienteClassificacao.findUnique({ where: { clienteId: id } });
    const porAgente = !!ator?.agente;
    if (limpar) {
        if (antes) await prisma.clienteClassificacao.delete({ where: { clienteId: id } });
    } else {
        const quem = {
            atualizadoPorTipo: porAgente ? 'agente' : 'usuario',
            atualizadoPorId: porAgente ? `agente:${String(ator.agente).slice(0, 80)}` : (ator?.id ? String(ator.id).slice(0, 80) : null),
            atualizadoPorNome: String(porAgente ? ator.agente : (ator?.nome || ator?.login || 'desconhecido')).slice(0, 180),
            origem: porAgente ? 'api_agente' : 'app',
        };
        await prisma.clienteClassificacao.upsert({
            where: { clienteId: id },
            create: { clienteId: id, classificacao: valor, ...quem },
            update: { classificacao: valor, ...quem },
        });
    }

    // Resultado já com a escrita aplicada; histórico depois (best-effort, fora de transação).
    const mapa = await classificacaoDeClientes([cliente]);
    const publico = mapa.get(id);
    const automatica = publico.automatica;
    const de = antes ? rotulo('manual', antes.classificacao) : rotulo('automatica', automatica);
    const para = valor ? rotulo('manual', valor) : rotulo('automatica', automatica);
    if (de !== para) {
        await historico.registrar({
            clienteId: id, ator: porAgente ? { agente: ator.agente } : { id: ator?.id || null, nome: ator?.nome || ator?.login || null },
            tela: TELA, mudancas: [{ campo: 'classificacao', de, para }],
        });
    }
    return publico;
}

module.exports = {
    VALORES, A_CLASSIFICAR, perfisDe, automaticaDe, montar,
    classificacaoDeClientes, classificacaoPorIds, enriquecer, classificar, documentosComContasPagar,
};
