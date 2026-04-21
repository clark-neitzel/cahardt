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

// ─────────────────────────────────────────────
// 5. Geração de orientação via IA (GPT-4o-mini)
// ─────────────────────────────────────────────
const prisma = require('../config/database');

// Prompt completo enviado ao GPT — exportado para conferência
function montarPromptIA({ nomeCliente, cenario, insight, atendimentosRecentes }) {
    const cat = CATALOGO[cenario] || {};

    const atendStr = atendimentosRecentes?.length
        ? atendimentosRecentes.map(a =>
            `- ${new Date(a.criadoEm).toLocaleDateString('pt-BR')} | ${a.tipo} | ${a.acaoLabel || '-'} | ${a.observacao || 'sem obs'}`
          ).join('\n')
        : '(nenhum atendimento registrado)';

    return `Você é um assistente de vendas consultivas para distribuidora de alimentos.
Analise o histórico deste cliente e gere uma orientação comercial objetiva e direta para o vendedor de campo.

CLIENTE: ${nomeCliente}
CENÁRIO CLASSIFICADO: ${cenario} — ${cat.situacao || ''}

HISTÓRICO ANALÍTICO:
- Dias sem comprar: ${insight.diasSemComprar ?? 'N/A'} (ciclo esperado: ${insight.cicloReferenciaDias} dias)
- Status de recompra: ${insight.statusRecompra}
- Pedidos últimos 30 dias: ${insight.qtdPedidosUltimos30d}
- Ticket médio recente: ${insight.ticketMedioRecente ? 'R$ ' + Number(insight.ticketMedioRecente).toFixed(2) : 'sem dados'}
- Ticket médio histórico: ${insight.ticketMedioBase ? 'R$ ' + Number(insight.ticketMedioBase).toFixed(2) : 'sem dados'}
- Variação de ticket: ${insight.variacaoTicketPct != null ? Number(insight.variacaoTicketPct).toFixed(1) + '%' : 'sem dados'}
- Atendimentos sem pedido (30d): ${insight.qtdAtendimentosSemPedido30d}
- Canal último atendimento: ${insight.canalUltimoAtendimento || 'nenhum registrado'}
- Devolução recente: ${insight.teveDevolucaoRecente ? 'Sim' : 'Não'}
- Score de risco: ${insight.scoreRisco}/100
- Score de oportunidade: ${insight.scoreOportunidade}/100

ÚLTIMOS ATENDIMENTOS (mais recentes primeiro):
${atendStr}

Responda APENAS com JSON válido, sem markdown, sem explicação:
{
  "situacao": "situação atual do cliente em 1 frase objetiva (máx 70 chars)",
  "objetivo": "o que o vendedor deve alcançar neste atendimento (máx 70 chars)",
  "canal": "canal recomendado e motivo curto (máx 50 chars)",
  "acao": "ação principal concreta a tomar (máx 90 chars)",
  "objecao": "objeção mais provável com base no histórico (máx 70 chars)",
  "resposta": "como contornar a objeção em linguagem de vendedor (máx 90 chars)"
}`;
}

async function gerarOrientacaoIA(clienteId, opcoes = {}) {
    const {
        disparadoPor = 'MANUAL',
        usuarioId = null,
        atendimentoId = null,
    } = opcoes;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY não configurada.');

    // Busca dados do cliente
    const cliente = await prisma.cliente.findUnique({
        where: { UUID: clienteId },
        select: { Nome: true, NomeFantasia: true, idVendedor: true, categoriaCliente: { select: { nome: true } } }
    });
    if (!cliente) throw new Error(`Cliente ${clienteId} não encontrado.`);

    // Busca insight atual
    const insight = await prisma.clienteInsight.findUnique({ where: { clienteId } });
    if (!insight) throw new Error(`Sem insight para cliente ${clienteId}. Rode recalcular primeiro.`);

    // Busca últimos 5 atendimentos
    const atendimentosRecentes = await prisma.atendimento.findMany({
        where: { clienteId },
        orderBy: { criadoEm: 'desc' },
        take: 5,
        select: { criadoEm: true, tipo: true, acaoLabel: true, observacao: true }
    });

    const cenario = classificarCenario(insight);
    const nomeCliente = cliente.NomeFantasia || cliente.Nome;
    const prompt = montarPromptIA({ nomeCliente, cenario, insight, atendimentosRecentes });
    const dadosEntrada = { insight, atendimentosRecentes };
    const modelo = 'gpt-4o-mini';
    const inicio = Date.now();

    // Chamada GPT-4o-mini
    const { OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey });

    let response, orientacaoIaJson, erroMsg = null, sucesso = true;
    try {
        response = await openai.chat.completions.create({
            model: modelo,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 400,
        });

        const raw = response.choices[0].message.content.trim();
        try {
            orientacaoIaJson = JSON.parse(raw);
        } catch {
            throw new Error(`GPT retornou JSON inválido: ${raw}`);
        }

        // Salva no banco
        await prisma.clienteInsight.update({
            where: { clienteId },
            data: { orientacaoIaJson }
        });
    } catch (err) {
        sucesso = false;
        erroMsg = err.message;
        // Salva log de erro e propaga
        try {
            await prisma.iaAnaliseLog.create({
                data: {
                    clienteId,
                    vendedorId: cliente.idVendedor || null,
                    disparadoPor,
                    disparadoPorUsuarioId: usuarioId,
                    atendimentoId: atendimentoId || null,
                    modelo,
                    promptEnviado: prompt,
                    dadosEntrada,
                    respostaIa: null,
                    tokensPrompt: null,
                    tokensResposta: null,
                    tokensTotal: null,
                    duracaoMs: Date.now() - inicio,
                    sucesso: false,
                    erroMsg,
                }
            });
        } catch (logErr) {
            console.error('[IA] Erro ao salvar log de falha:', logErr.message);
        }
        throw err;
    }

    // Salva log de sucesso
    try {
        await prisma.iaAnaliseLog.create({
            data: {
                clienteId,
                vendedorId: cliente.idVendedor || null,
                disparadoPor,
                disparadoPorUsuarioId: usuarioId,
                atendimentoId: atendimentoId || null,
                modelo,
                promptEnviado: prompt,
                dadosEntrada,
                respostaIa: orientacaoIaJson,
                tokensPrompt: response.usage?.prompt_tokens ?? null,
                tokensResposta: response.usage?.completion_tokens ?? null,
                tokensTotal: response.usage?.total_tokens ?? null,
                duracaoMs: Date.now() - inicio,
                sucesso: true,
                erroMsg: null,
            }
        });
    } catch (logErr) {
        console.error('[IA] Erro ao salvar log:', logErr.message);
    }

    return {
        clienteId,
        nome: nomeCliente,
        cenario,
        orientacaoIaJson,
        promptEnviado: prompt,
        tokensUsados: response.usage,
        dadosAnalise: { insight, atendimentosRecentes }
    };
}

module.exports = {
    CENARIO,
    CATALOGO,
    classificarCenario,
    gerarOrientacao,
    montarPromptIA,
    gerarOrientacaoIA,
};
