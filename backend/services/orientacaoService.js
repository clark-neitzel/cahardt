/**
 * Motor de Orientação Comercial do Atendimento
 *
 * Etapa 1: Classificação determinística do cenário do cliente.
 * Usa apenas dados já existentes em ClienteInsight — sem novos campos.
 *
 * Etapa 3 (futuro): validador pré-salvamento via GPT usará OPENAI_API_KEY.
 */

// ─────────────────────────────────────────────
// 1. Enum de cenários
// ─────────────────────────────────────────────
const CENARIO = {
    NOVO_SEM_COMPRA:            'NOVO_SEM_COMPRA',
    FEZ_1_COMPRA_SEM_RECOMPRA:  'FEZ_1_COMPRA_SEM_RECOMPRA',
    REGULAR_NO_PRAZO:           'REGULAR_NO_PRAZO',
    EM_ATENCAO:                 'EM_ATENCAO',
    ATRASADO_PARADO:            'ATRASADO_PARADO',
    COMPROU_MENOS_NORMAL:       'COMPROU_MENOS_NORMAL',
    NEGA_WHATSAPP:              'NEGA_WHATSAPP',
    OBJECAO_RECORRENTE:         'OBJECAO_RECORRENTE',
};

// ─────────────────────────────────────────────
// 2. Catálogo estático de orientação (4 campos)
// ─────────────────────────────────────────────
const CATALOGO = {
    [CENARIO.NOVO_SEM_COMPRA]: {
        situacao:         'Novo cliente sem compra',
        objetivo:         'Realizar a primeira venda',
        canalRecomendado: 'Presencial',
        acaoSugerida:     'Apresentar portfólio e condições especiais de primeiro pedido',
    },
    [CENARIO.FEZ_1_COMPRA_SEM_RECOMPRA]: {
        situacao:         'Fez 1 compra e não recomprou',
        objetivo:         'Converter em cliente recorrente',
        canalRecomendado: 'Presencial',
        acaoSugerida:     'Verificar satisfação, entender objeção e oferecer novo pedido',
    },
    [CENARIO.REGULAR_NO_PRAZO]: {
        situacao:         'Regular comprando no prazo',
        objetivo:         'Manter e ampliar o mix',
        canalRecomendado: 'WhatsApp ou Presencial',
        acaoSugerida:     'Sugerir produto ausente ou promoção ativa',
    },
    [CENARIO.EM_ATENCAO]: {
        situacao:         'Em atenção — compra atrasando',
        objetivo:         'Reativar antes de virar crítico',
        canalRecomendado: 'Presencial',
        acaoSugerida:     'Visita com proposta concreta (produto, condição ou promoção)',
    },
    [CENARIO.ATRASADO_PARADO]: {
        situacao:         'Atrasado / parado',
        objetivo:         'Reabrir relacionamento comercial',
        canalRecomendado: 'Presencial',
        acaoSugerida:     'Visita pessoal para entender sumiço e fechar pedido',
    },
    [CENARIO.COMPROU_MENOS_NORMAL]: {
        situacao:         'Comprou menos que o normal',
        objetivo:         'Entender queda e recuperar ticket',
        canalRecomendado: 'Presencial',
        acaoSugerida:     'Verificar concorrência ou problema e recompor mix',
    },
    [CENARIO.NEGA_WHATSAPP]: {
        situacao:         'Nega muito por WhatsApp',
        objetivo:         'Forçar contato presencial',
        canalRecomendado: 'Presencial',
        acaoSugerida:     'Não insistir no WhatsApp — agendar visita física',
    },
    [CENARIO.OBJECAO_RECORRENTE]: {
        situacao:         'Objeção recorrente',
        objetivo:         'Resolver causa raiz da objeção',
        canalRecomendado: 'Presencial',
        acaoSugerida:     'Levantar histórico de objeções e apresentar solução direcionada',
    },
};

// ─────────────────────────────────────────────
// 3. Classificação determinística
//    Prioridade: topo da lista vence.
// ─────────────────────────────────────────────
function classificarCenario(insight) {
    if (!insight || insight.statusRecompra === 'SEM_HISTORICO') {
        return CENARIO.NOVO_SEM_COMPRA;
    }

    const {
        statusRecompra,
        variacaoTicketPct,
        qtdAtendimentosSemPedido30d,
        teveDevolucaoRecente,
        ticketMedioBase,   // null quando há poucos pedidos (< 3 no histórico total)
    } = insight;

    // Nega por WhatsApp: vários atendimentos sem gerar pedido
    if (qtdAtendimentosSemPedido30d >= 3) {
        return CENARIO.NEGA_WHATSAPP;
    }

    // Fez 1 compra e parou: sem base histórica + fora do prazo
    if (ticketMedioBase === null && statusRecompra !== 'NO_PRAZO') {
        return CENARIO.FEZ_1_COMPRA_SEM_RECOMPRA;
    }

    // Objeção recorrente: crítico E devolução recente
    if (statusRecompra === 'CRITICO' && teveDevolucaoRecente) {
        return CENARIO.OBJECAO_RECORRENTE;
    }

    // Atrasado/parado
    if (statusRecompra === 'CRITICO') {
        return CENARIO.ATRASADO_PARADO;
    }

    // Comprou menos que o normal
    if (statusRecompra === 'ATRASADO' && variacaoTicketPct !== null && variacaoTicketPct < -20) {
        return CENARIO.COMPROU_MENOS_NORMAL;
    }

    // Em atenção (atrasado sem queda de ticket, ou apenas atenção)
    if (statusRecompra === 'ATRASADO' || statusRecompra === 'ATENCAO') {
        return CENARIO.EM_ATENCAO;
    }

    // Regular no prazo
    return CENARIO.REGULAR_NO_PRAZO;
}

// ─────────────────────────────────────────────
// 4. Gerar orientação a partir do insight
//    Retorna os dados prontos para salvar nos
//    3 campos null do ClienteInsight.
// ─────────────────────────────────────────────
function gerarOrientacao(insight) {
    const cenario = classificarCenario(insight);
    const orientacao = CATALOGO[cenario];

    return {
        insightPrincipalTipo:   cenario,
        insightPrincipalResumo: orientacao.situacao,
        proximaAcaoSugerida:    orientacao.acaoSugerida,
        // Dados extras para uso no card (não persistidos, enviados via API)
        _orientacaoCompleta: orientacao,
    };
}

module.exports = {
    CENARIO,
    CATALOGO,
    classificarCenario,
    gerarOrientacao,
};
