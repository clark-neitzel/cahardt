// Central de Pendências (A3 do plano nav-design-vendas, 09/2026) — agrega em UMA
// chamada o que está esperando um clique do escritório/gerência, em vez de abrir
// 8-10 telas separadas para descobrir.
//
// Cada bloco reaproveita o MESMO critério/serviço que a tela original já usa (fonte
// citada no comentário de cada função) — a ação de 1 clique daqui é a MESMA ação da
// tela original, nunca um caminho paralelo novo.
//
// Só leitura (nenhum bloco entra em $transaction). Cada bloco roda em try/catch
// próprio: se um falhar, os outros seguem e o bloco quebrado volta com `erro: true`.
const prisma = require('../config/database');
const focusNfe = require('./focusNfeService');
const caixaConferenciaService = require('./caixaConferenciaService');

const round2 = (v) => Math.round(Number(v || 0) * 100) / 100;

// ── Tarefas atrasadas — mesma lógica de GET /api/tarefas/pendentes (backend/routes/
// tarefaRoutes.js), reimplementada aqui como função pura (o arquivo original não
// exporta os helpers; são poucas linhas, então replicar é mais seguro do que mexer
// num arquivo de rota tocado por várias telas). Se a regra de recorrência mudar lá,
// precisa mudar aqui também. ────────────────────────────────────────────────────
const minutosTarefa = (hhmm) => {
    const [h, m] = String(hhmm || '00:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
};
const diaSemanaTarefa = (dataStr) => new Date(`${dataStr}T12:00:00Z`).getUTCDay();
function ocorreNoDiaTarefa(tarefa, dataRef) {
    if (dataRef < tarefa.dataInicio) return false;
    if (tarefa.recorrenciaFim && dataRef > tarefa.recorrenciaFim) return false;
    switch (tarefa.recorrencia) {
        case 'NUNCA': return dataRef === tarefa.dataInicio;
        case 'DIARIA': return true;
        case 'DIAS_UTEIS': { const d = diaSemanaTarefa(dataRef); return d >= 1 && d <= 5; }
        case 'SEMANAL': return diaSemanaTarefa(dataRef) === diaSemanaTarefa(tarefa.dataInicio);
        case 'MENSAL': return dataRef.slice(8) === tarefa.dataInicio.slice(8);
        case 'DIAS_SEMANA': return (tarefa.diasSemana || []).includes(diaSemanaTarefa(dataRef));
        default: return false;
    }
}
// Data/hora LOCAL do Brasil no servidor (mesmo fuso que a agenda usa no aparelho do
// usuário — aqui é só para a contagem da Central, não substitui o pop-up do app).
function agoraBrasil() {
    const agora = new Date();
    const dataStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
    const partes = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(agora);
    const h = partes.find(p => p.type === 'hour')?.value || '00';
    const m = partes.find(p => p.type === 'minute')?.value || '00';
    return { dataStr, horaStr: `${h}:${m}` };
}

// ── Bloco: pedidos_aprovar ──────────────────────────────────────────────────────
// Fonte: mesmo critério da aba de aprovação em ListaPedidos.jsx / pedidoController
// (aprovarEspecial/aprovarBonificacao) — especial ou bonificação com statusEnvio
// ABERTO/ERRO e ainda não aprovado (situacaoCA fora de APROVADO/FATURADO/EM_ABERTO).
async function blocoPedidosAprovar(limite) {
    const where = {
        cancelado: false,
        statusEnvio: { in: ['ABERTO', 'ERRO'] },
        OR: [{ especial: true }, { bonificacao: true }],
        AND: [{ OR: [{ situacaoCA: null }, { situacaoCA: { notIn: ['APROVADO', 'FATURADO', 'EM_ABERTO'] } }] }],
    };
    const [contador, pedidos] = await Promise.all([
        prisma.pedido.count({ where }),
        prisma.pedido.findMany({
            where,
            select: {
                id: true, numero: true, especial: true, bonificacao: true, dataVenda: true, createdAt: true,
                cliente: { select: { Nome: true } },
                itens: { select: { quantidade: true, valor: true } },
            },
            orderBy: { createdAt: 'asc' },
            take: limite,
        }),
    ]);
    const itens = pedidos.map(p => {
        const valor = round2(p.itens.reduce((s, i) => s + Number(i.quantidade) * Number(i.valor), 0));
        const tipo = p.bonificacao ? 'BONIFICACAO' : 'ESPECIAL';
        return {
            id: p.id,
            titulo: `${p.bonificacao ? 'BN#' : 'ZZ#'}${p.numero ?? '—'} · ${p.cliente?.Nome || 'Cliente'}`,
            subtitulo: p.bonificacao ? 'Bonificação aguardando aprovação' : 'Pedido especial aguardando aprovação',
            valor,
            dataRef: p.dataVenda,
            rota: '/pedidos',
            acao: {
                tipo: 'aprovar_pedido',
                label: 'Aprovar',
                endpoint: `/api/pedidos/${p.id}/${p.bonificacao ? 'aprovar-bonificacao' : 'aprovar-especial'}`,
                metodo: 'PUT',
            },
        };
    });
    return {
        chave: 'pedidos_aprovar',
        titulo: 'Pedidos aguardando aprovação',
        severidade: 'ambar',
        contador,
        itens,
        rotaVerTodos: '/pedidos',
    };
}

// ── Bloco: nfe_emitir ────────────────────────────────────────────────────────────
// Fonte: MESMO critério + MESMA lógica do chip "Sem nota" (frontend/src/pages/
// Financeiro/NotasFiscais.jsx linha ~260: `pedidos.filter(p => !p.notaCA && !p.nota
// && p.podeEmitir !== false)`), calculado a partir da fila de GET /api/notas-fiscais
// /fila (backend/routes/notasFiscaisRoutes.js). Reimplementado aqui em vez de bater
// na rota porque a fila devolve o array inteiro (sem count) e faz uma chamada de
// sincronização de webhooks antes — pesado demais para um agregador.
//
// ⚠️ CUIDADO que já pegou esta função duas vezes:
// 1) (achado do QA, 09/2026) a nota é achada pelo `ref` do ambiente atual
//    (`nf-{h|p}-{pedidoId}`), igual ao frontend faz — usar `notasFiscaisApp: {
//    none: {} }` (nenhuma nota em NENHUM ambiente) SUBCONTA a fila: pedido de
//    teste/homolog com uma notaFiscalApp "solta" de outro ambiente ou com `ref`
//    fora do padrão continua "sem nota" pro ambiente ATUAL, e a tela original
//    conta ele assim.
// 2) (achado do revisor, 09/2026) a correção acima carregava até 2000 pedidos
//    com JOIN em toda chamada e filtrava em JS — pesado, e o contador ficava
//    truncado em silêncio acima do backstop. Solução: como o `ref` é sempre
//    `nf-{h|p}-{pedidoId}` (o prefixo do ambiente é fixo, só o pedidoId muda) e a
//    coluna é `@unique` (indexada), filtrar `startsWith(prefixo)` DENTRO da
//    relação `notasFiscaisApp` do próprio pedido é semanticamente igual ao match
//    exato do frontend — só teria diferença se existisse, para o MESMO pedido,
//    uma nota cujo `ref` começa com o prefixo do ambiente atual mas pertence a
//    outro pedido (não acontece: `ref` sempre embute o próprio `pedidoId`). Isso
//    devolve o filtro para o banco (`WHERE ... NOT EXISTS`), sem backstop e sem
//    truncar nada — `count` e `findMany` compartilham o mesmo `where`.
async function blocoNfeEmitir(limite) {
    const ambiente = focusNfe.ambiente();
    const prefixo = `nf-${ambiente === 'producao' ? 'p' : 'h'}-`;
    const where = {
        especial: false,
        cancelado: false,
        statusEnvio: { not: 'EXCLUIDO' },
        numero: { not: null },
        AND: [
            { OR: [{ situacaoCA: null }, { situacaoCA: { notIn: ['CANCELADO', 'EXCLUIDO'] } }] },
            // Bonificação sem aprovar ainda não pode emitir — não é "sem nota", é
            // "sem aprovar" (aparece no bloco pedidos_aprovar, não aqui).
            { OR: [{ bonificacao: false }, { bonificacao: true, nfBonificacao: true, statusEnvio: 'RECEBIDO' }] },
        ],
        notasFiscaisApp: { none: { ref: { startsWith: prefixo } } },
    };
    const [contador, pedidos] = await Promise.all([
        prisma.pedido.count({ where }),
        prisma.pedido.findMany({
            where,
            select: {
                id: true, numero: true, bonificacao: true, dataVenda: true,
                cliente: { select: { Nome: true } },
                itens: { select: { quantidade: true, valor: true } },
            },
            orderBy: { dataVenda: 'desc' },
            take: limite,
        }),
    ]);
    const itens = pedidos.map(p => ({
        id: p.id,
        titulo: `${p.bonificacao ? 'BN#' : '#'}${p.numero} · ${p.cliente?.Nome || 'Cliente'}`,
        subtitulo: 'Sem NF-e emitida',
        valor: round2(p.itens.reduce((s, i) => s + Number(i.quantidade) * Number(i.valor), 0)),
        dataRef: p.dataVenda,
        rota: '/notas-fiscais',
        acao: { tipo: 'emitir_nfe', label: 'Emitir NF-e', endpoint: `/api/notas-fiscais/emitir/${p.id}`, metodo: 'POST' },
    }));
    return {
        chave: 'nfe_emitir',
        titulo: 'NF-e a emitir',
        severidade: 'vermelho',
        contador,
        itens,
        rotaVerTodos: '/notas-fiscais',
    };
}

// ── Bloco: nfe_rejeitada ─────────────────────────────────────────────────────────
// Fonte: notas_fiscais_app com status ERRO/DENEGADO (backend/services/
// focusNfeEmissaoService.js grava status: 'ERRO' junto de mensagemSefaz).
async function blocoNfeRejeitada(limite) {
    const where = { status: { in: ['ERRO', 'DENEGADO'] } };
    const [contador, notas] = await Promise.all([
        prisma.notaFiscalApp.count({ where }),
        prisma.notaFiscalApp.findMany({
            where,
            select: {
                id: true, mensagemSefaz: true, atualizadoEm: true,
                pedido: { select: { id: true, numero: true, bonificacao: true, cliente: { select: { Nome: true } } } },
            },
            orderBy: { atualizadoEm: 'desc' },
            take: limite,
        }),
    ]);
    const itens = notas.map(n => ({
        id: n.pedido?.id || n.id,
        titulo: `${n.pedido?.bonificacao ? 'BN#' : '#'}${n.pedido?.numero ?? '—'} · ${n.pedido?.cliente?.Nome || 'Cliente'}`,
        subtitulo: (n.mensagemSefaz || 'Rejeitada pela SEFAZ').slice(0, 140),
        dataRef: n.atualizadoEm,
        rota: '/notas-fiscais',
        acao: n.pedido ? { tipo: 'reemitir_nfe', label: 'Tentar de novo', endpoint: `/api/notas-fiscais/emitir/${n.pedido.id}`, metodo: 'POST' } : null,
    }));
    return {
        chave: 'nfe_rejeitada',
        titulo: 'NF-e rejeitada pela SEFAZ',
        severidade: 'vermelho',
        contador,
        itens,
        rotaVerTodos: '/notas-fiscais',
    };
}

// ── Bloco: caixas_conferir ───────────────────────────────────────────────────────
// Fonte: caixaConferenciaService.listarAConferir — a MESMA fila que alimenta o card
// "Caixas p/ conferir" na agenda de Tarefas (frontend/src/pages/Tarefas/
// CaixasPendentesAgenda.jsx) e a tela do Caixa. Respeita a mesma visibilidade
// (quem pode conferir, dono não vê o próprio caixa).
async function blocoCaixasConferir(limite, usuario) {
    const perms = usuario?.permissoes || {};
    let fila = [];
    try {
        fila = await caixaConferenciaService.listarAConferir({ usuario, perms, incluirHoje: false });
    } catch (e) {
        throw e;
    }
    const valorTotal = round2(fila.reduce((s, c) => s + Number(c.valorAPrestar || 0), 0));
    const itens = fila.slice(0, limite).map(c => ({
        id: c.caixaId,
        titulo: `${c.vendedorNome} · ${c.data}`,
        subtitulo: `${c.diasParado}d parado${c.reconferir ? ' · valor mudou, reconferir' : ''}`,
        valor: round2(c.valorAPrestar),
        dataRef: c.data,
        rota: '/caixa',
    }));
    return {
        chave: 'caixas_conferir',
        titulo: 'Caixas para conferir',
        severidade: 'ambar',
        contador: fila.length,
        valorTotal,
        itens,
        rotaVerTodos: '/caixa',
    };
}

// ── Bloco: notas_sem_conta ───────────────────────────────────────────────────────
// Fonte: NotaEntrada (backend/routes/notasEntrada.js) — status NOVA (XML baixado,
// ainda não virou conta a pagar/vinculada/entrada sem pagamento) há mais de 2 dias.
async function blocoNotasSemConta(limite) {
    const doisDiasAtras = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const where = { status: 'NOVA', contaPagarId: null, criadoEm: { lte: doisDiasAtras } };
    const [contador, agregado, notas] = await Promise.all([
        prisma.notaEntrada.count({ where }),
        prisma.notaEntrada.aggregate({ where, _sum: { valorTotal: true } }),
        prisma.notaEntrada.findMany({
            where,
            select: { id: true, numero: true, fornecedorNome: true, valorTotal: true, criadoEm: true },
            orderBy: { criadoEm: 'asc' },
            take: limite,
        }),
    ]);
    const itens = notas.map(n => ({
        id: n.id,
        titulo: `NF ${n.numero || '—'} · ${n.fornecedorNome}`,
        subtitulo: 'Recebida, ainda sem conta a pagar vinculada',
        valor: n.valorTotal != null ? round2(n.valorTotal) : undefined,
        dataRef: n.criadoEm,
        rota: '/notas-recebidas',
    }));
    return {
        chave: 'notas_sem_conta',
        titulo: 'Notas recebidas sem conta a pagar',
        severidade: 'ambar',
        contador,
        valorTotal: round2(agregado._sum.valorTotal || 0),
        itens,
        rotaVerTodos: '/notas-recebidas',
    };
}

// ── Bloco: boletos_nao_enviados ──────────────────────────────────────────────────
// Sem função pronta identificada no repo (plano pediu o critério mais simples,
// documentado): pedido de venda (não especial/bonificação), FATURADO, condição a
// prazo (mesmo teste A_PRAZO do backend/services/impressaoLoteService.js), criado há
// mais de 24h e SEM NENHUMA cobrança Asaas (pix ou boleto) gerada ainda. Não repete
// a consulta ao Conta Azul que a impressão em lote faz (rede, lenta) — só banco local.
async function blocoBoletosNaoEnviados(limite) {
    const ontemMenos24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const where = {
        cancelado: false,
        especial: false,
        bonificacao: false,
        situacaoCA: 'FATURADO',
        createdAt: { lte: ontemMenos24h },
        OR: [
            { tipoPagamento: 'BOLETO_BANCARIO' },
            { nomeCondicaoPagamento: { contains: 'boleto', mode: 'insensitive' } },
        ],
        cobrancasAsaas: { none: {} },
    };
    const TAKE_MAX = 200; // trava de segurança: bloco de anomalia, não deveria ter volume alto
    const [contador, pedidos] = await Promise.all([
        prisma.pedido.count({ where }),
        prisma.pedido.findMany({
            where,
            select: {
                id: true, numero: true, createdAt: true,
                cliente: { select: { Nome: true } },
                itens: { select: { quantidade: true, valor: true } },
            },
            orderBy: { createdAt: 'asc' },
            take: TAKE_MAX,
        }),
    ]);
    const valorTotal = round2(pedidos.reduce((s, p) => s + p.itens.reduce((s2, i) => s2 + Number(i.quantidade) * Number(i.valor), 0), 0));
    const itens = pedidos.slice(0, limite).map(p => ({
        id: p.id,
        titulo: `#${p.numero} · ${p.cliente?.Nome || 'Cliente'}`,
        subtitulo: 'Faturado a prazo, sem boleto/PIX gerado',
        valor: round2(p.itens.reduce((s, i) => s + Number(i.quantidade) * Number(i.valor), 0)),
        dataRef: p.createdAt,
        rota: '/pedidos',
        acao: { tipo: 'gerar_boleto', label: 'Gerar boleto', endpoint: '/api/asaas/boletos', metodo: 'POST', body: { pedidoIds: [p.id] } },
    }));
    return {
        chave: 'boletos_nao_enviados',
        titulo: 'Faturados sem cobrança gerada',
        severidade: 'ambar',
        contador,
        valorTotal,
        itens,
        rotaVerTodos: '/pedidos',
    };
}

// ── Bloco: producao_sugerida ─────────────────────────────────────────────────────
// Fonte: sugestoes_producao status PENDENTE (backend/services/pcpSugestaoService.js
// ~L167 usa o mesmo status como trava de "só PENDENTE pode ser aceita/rejeitada").
async function blocoProducaoSugerida(limite) {
    const where = { status: 'PENDENTE' };
    const [contador, sugestoes] = await Promise.all([
        prisma.sugestaoProducao.count({ where }),
        prisma.sugestaoProducao.findMany({
            where,
            select: {
                id: true, quantidadeSugerida: true, bateladas: true, motivo: true, createdAt: true,
                itemPcp: { select: { nome: true, unidade: true } },
            },
            orderBy: { createdAt: 'asc' },
            take: limite,
        }),
    ]);
    const itens = sugestoes.map(s => ({
        id: s.id,
        titulo: s.itemPcp?.nome || 'Item PCP',
        subtitulo: `${Number(s.quantidadeSugerida)} ${s.itemPcp?.unidade || ''} · ${s.motivo === 'DEMANDA_PEDIDOS' ? 'demanda de pedidos' : 'abaixo do mínimo'}`,
        dataRef: s.createdAt,
        rota: '/pcp/sugestoes',
        acao: { tipo: 'aceitar_sugestao', label: 'Aceitar', endpoint: `/api/pcp/sugestoes/${s.id}/aceitar`, metodo: 'PATCH' },
    }));
    return {
        chave: 'producao_sugerida',
        titulo: 'Ordens de produção sugeridas',
        severidade: 'cinza',
        contador,
        itens,
        rotaVerTodos: '/pcp/sugestoes',
    };
}

// ── Bloco: tarefas_atrasadas ─────────────────────────────────────────────────────
// Fonte: mesma regra de GET /api/tarefas/pendentes (ver helpers no topo deste
// arquivo) — só as tarefas do PRÓPRIO usuário logado (é a mesma visibilidade do
// pop-up/sino de tarefas; ver agenda de colegas exige outra permissão à parte).
async function blocoTarefasAtrasadas(limite, usuario) {
    if (!usuario?.id) return { chave: 'tarefas_atrasadas', titulo: 'Tarefas atrasadas', severidade: 'cinza', contador: 0, itens: [], rotaVerTodos: '/tarefas' };
    const { dataStr, horaStr } = agoraBrasil();
    const tarefas = await prisma.tarefa.findMany({
        where: { ativo: true, responsavelId: usuario.id, dataInicio: { lte: dataStr } },
        select: {
            id: true, titulo: true, hora: true, dataInicio: true, recorrencia: true, recorrenciaFim: true, diasSemana: true,
            ocorrencias: { where: { dataRef: dataStr }, select: { status: true } },
        },
    });
    const atrasadas = tarefas
        .filter(t => ocorreNoDiaTarefa(t, dataStr))
        .filter(t => minutosTarefa(t.hora) <= minutosTarefa(horaStr))
        .filter(t => t.ocorrencias[0]?.status !== 'CONCLUIDA')
        .sort((a, b) => minutosTarefa(a.hora) - minutosTarefa(b.hora));
    const itens = atrasadas.slice(0, limite).map(t => ({
        id: t.id,
        titulo: t.titulo,
        subtitulo: `Hoje às ${t.hora}`,
        dataRef: dataStr,
        rota: '/tarefas',
    }));
    return {
        chave: 'tarefas_atrasadas',
        titulo: 'Tarefas atrasadas (minhas)',
        severidade: 'ambar',
        contador: atrasadas.length,
        itens,
        rotaVerTodos: '/tarefas',
    };
}

// ── Agregador ─────────────────────────────────────────────────────────────────
const DEFINICOES = [
    { chave: 'pedidos_aprovar', fn: (l, u) => blocoPedidosAprovar(l) },
    { chave: 'nfe_emitir', fn: (l, u) => blocoNfeEmitir(l) },
    { chave: 'nfe_rejeitada', fn: (l, u) => blocoNfeRejeitada(l) },
    { chave: 'caixas_conferir', fn: (l, u) => blocoCaixasConferir(l, u) },
    { chave: 'notas_sem_conta', fn: (l, u) => blocoNotasSemConta(l) },
    { chave: 'boletos_nao_enviados', fn: (l, u) => blocoBoletosNaoEnviados(l) },
    { chave: 'producao_sugerida', fn: (l, u) => blocoProducaoSugerida(l) },
    { chave: 'tarefas_atrasadas', fn: (l, u) => blocoTarefasAtrasadas(l, u) },
];

const TITULOS = {
    pedidos_aprovar: 'Pedidos aguardando aprovação',
    nfe_emitir: 'NF-e a emitir',
    nfe_rejeitada: 'NF-e rejeitada pela SEFAZ',
    caixas_conferir: 'Caixas para conferir',
    notas_sem_conta: 'Notas recebidas sem conta a pagar',
    boletos_nao_enviados: 'Faturados sem cobrança gerada',
    producao_sugerida: 'Ordens de produção sugeridas',
    tarefas_atrasadas: 'Tarefas atrasadas (minhas)',
};

const ROTAS_VER_TODOS = {
    pedidos_aprovar: '/pedidos',
    nfe_emitir: '/notas-fiscais',
    nfe_rejeitada: '/notas-fiscais',
    caixas_conferir: '/caixa',
    notas_sem_conta: '/notas-recebidas',
    boletos_nao_enviados: '/pedidos',
    producao_sugerida: '/pcp/sugestoes',
    tarefas_atrasadas: '/tarefas',
};

const listarPendencias = async ({ usuario, limitePorBloco = 5 } = {}) => {
    const limite = Math.max(1, Math.min(20, Number(limitePorBloco) || 5));

    const resultados = await Promise.all(DEFINICOES.map(async (def) => {
        try {
            return await def.fn(limite, usuario);
        } catch (e) {
            console.error(`[Pendências] Falha no bloco ${def.chave}:`, e.message);
            return {
                chave: def.chave,
                titulo: TITULOS[def.chave],
                severidade: 'cinza',
                contador: 0,
                itens: [],
                rotaVerTodos: ROTAS_VER_TODOS[def.chave],
                erro: true,
            };
        }
    }));

    const total = resultados.reduce((s, b) => s + (b.contador || 0), 0);
    const dinheiroParado = round2(
        (resultados.find(b => b.chave === 'caixas_conferir')?.valorTotal || 0)
        + (resultados.find(b => b.chave === 'boletos_nao_enviados')?.valorTotal || 0)
    );
    // "vencidas" = pendências com prazo já estourado (tarefa atrasada, nota recebida
    // parada há mais de 2 dias). "avisos" = precisa de atenção mas sem prazo estourado
    // por si só (NF rejeitada, faturado sem cobrança, sugestão de produção).
    const vencidas = (resultados.find(b => b.chave === 'tarefas_atrasadas')?.contador || 0)
        + (resultados.find(b => b.chave === 'notas_sem_conta')?.contador || 0);
    const avisos = (resultados.find(b => b.chave === 'nfe_rejeitada')?.contador || 0)
        + (resultados.find(b => b.chave === 'boletos_nao_enviados')?.contador || 0)
        + (resultados.find(b => b.chave === 'producao_sugerida')?.contador || 0);

    return {
        geradoEm: new Date().toISOString(),
        totais: { total, dinheiroParado, vencidas, avisos },
        blocos: resultados,
    };
};

module.exports = { listarPendencias };
