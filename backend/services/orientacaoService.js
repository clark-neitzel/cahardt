/**
 * Motor de Orientação Comercial do Atendimento
 *
 * v2 — histórico unificado [PEDIDO]/[ATENDIMENTO], prompt direto para vendedor de campo.
 * FINANCEIRO e eventos automáticos excluídos da análise comercial.
 */

// ─────────────────────────────────────────────
// 1. Enum de cenários
// ─────────────────────────────────────────────
const CENARIO = {
    NOVO_SEM_COMPRA:    'NOVO_SEM_COMPRA',
    PRIMEIRA_COMPRA:    'PRIMEIRA_COMPRA',
    REGULAR:            'REGULAR',
    ATENCAO:            'ATENCAO',
    ATRASADO:           'ATRASADO',
    PARADO:             'PARADO',
    QUEDA_TICKET:       'QUEDA_TICKET',
    NEGA_WHATSAPP:      'NEGA_WHATSAPP',
    OBJECAO_RECORRENTE: 'OBJECAO_RECORRENTE',
};

// ─────────────────────────────────────────────
// 2. Catálogo estático (fallback sem IA)
// ─────────────────────────────────────────────
const CATALOGO = {
    [CENARIO.NOVO_SEM_COMPRA]: {
        situacao:      'Novo cliente sem compra',
        acaoSugerida:  'Apresentar portfólio e condições especiais de primeiro pedido',
        seNegar:       'Deixar catálogo e agendar retorno em 3 dias',
    },
    [CENARIO.PRIMEIRA_COMPRA]: {
        situacao:      '1ª compra, sem recompra ainda',
        acaoSugerida:  'Validar giro do último pedido e tentar 2ª compra',
        seNegar:       'Perguntar até quando dura o estoque e marcar retorno',
    },
    [CENARIO.REGULAR]: {
        situacao:      'Regular comprando no prazo',
        acaoSugerida:  'Sugerir produto ausente do mix ou promoção ativa',
        seNegar:       'Perguntar quando costuma reabastecer e confirmar próxima visita',
    },
    [CENARIO.ATENCAO]: {
        situacao:      'Em atenção — compra atrasando 1 ciclo',
        acaoSugerida:  'Visita presencial com proposta concreta',
        seNegar:       'Entender motivo e oferecer pedido menor ou prazo diferenciado',
    },
    [CENARIO.ATRASADO]: {
        situacao:      'Atrasado — 2 ciclos sem comprar',
        acaoSugerida:  'Visita para entender quebra de frequência e reativar',
        seNegar:       'Oferecer amostra ou condição especial para retomar',
    },
    [CENARIO.PARADO]: {
        situacao:      'Parado — 3+ ciclos sem comprar',
        acaoSugerida:  'Visita pessoal para entender sumiço e reabrir relação',
        seNegar:       'Deixar amostra e reagendar em 1 semana',
    },
    [CENARIO.QUEDA_TICKET]: {
        situacao:      'Comprou menos que o normal',
        acaoSugerida:  'Verificar concorrência ou problema e recompor mix',
        seNegar:       'Investigar motivo da queda e propor item complementar',
    },
    [CENARIO.NEGA_WHATSAPP]: {
        situacao:      'Negando por WhatsApp repetidamente',
        acaoSugerida:  'Não insistir no WhatsApp — forçar contato presencial',
        seNegar:       'Agendar visita física sem avisar pelo WhatsApp',
    },
    [CENARIO.OBJECAO_RECORRENTE]: {
        situacao:      'Objeção recorrente com devolução recente',
        acaoSugerida:  'Visita para resolver causa raiz da objeção',
        seNegar:       'Levantar histórico de objeções e apresentar solução direcionada',
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
        ticketMedioBase,
        diasSemComprar,
        cicloReferenciaDias,
    } = insight;

    // Nega recorrente: 3+ atendimentos comerciais sem gerar pedido em 30 dias
    if (qtdAtendimentosSemPedido30d >= 3) {
        return CENARIO.NEGA_WHATSAPP;
    }

    // 1ª compra: sem base histórica (< 3 pedidos) e fora do prazo
    if (ticketMedioBase === null && statusRecompra !== 'NO_PRAZO') {
        return CENARIO.PRIMEIRA_COMPRA;
    }

    // Crítico — diferenciar ATRASADO (2 ciclos) de PARADO (3+ ciclos)
    if (statusRecompra === 'CRITICO') {
        if (teveDevolucaoRecente) return CENARIO.OBJECAO_RECORRENTE;
        const ciclos = (diasSemComprar || 0) / (cicloReferenciaDias || 7);
        if (ciclos >= 3) return CENARIO.PARADO;
        return CENARIO.ATRASADO;
    }

    // Atrasado com queda de ticket
    if (statusRecompra === 'ATRASADO' && variacaoTicketPct !== null && variacaoTicketPct < -20) {
        return CENARIO.QUEDA_TICKET;
    }

    // Em atenção (1 ciclo)
    if (statusRecompra === 'ATRASADO' || statusRecompra === 'ATENCAO') {
        return CENARIO.ATENCAO;
    }

    // Regular
    return CENARIO.REGULAR;
}

// ─────────────────────────────────────────────
// 4. Gerar orientação determinística (fallback)
// ─────────────────────────────────────────────
function gerarOrientacao(insight) {
    const cenario = classificarCenario(insight);
    const orientacao = CATALOGO[cenario];

    return {
        insightPrincipalTipo:   cenario,
        insightPrincipalResumo: orientacao.situacao,
        proximaAcaoSugerida:    orientacao.acaoSugerida,
        _orientacaoCompleta:    orientacao,
    };
}

// ─────────────────────────────────────────────
// 5. Geração de orientação via IA (modelo configurado em aiProvider)
// ─────────────────────────────────────────────
const prisma = require('../config/database');
const ai = require('./aiProvider');

// Monta prompt — recebe historicoStr (já filtrado/tagueado) e orientacaoAnterior
function montarPromptIA({ nomeCliente, cenario, insight, historicoStr, orientacaoAnterior }) {
    const cat = CATALOGO[cenario] || {};

    return `Você é um assistente de vendas consultivas para distribuidora de alimentos.
Analise o histórico comercial deste cliente e gere uma orientação prática e direta para o vendedor de campo.

CLIENTE: ${nomeCliente}
CENÁRIO: ${cenario} — ${cat.situacao || ''}

DADOS ANALÍTICOS:
- Dias sem comprar: ${insight.diasSemComprar ?? 'N/A'} (ciclo esperado: ${insight.cicloReferenciaDias} dias)
- Status de recompra: ${insight.statusRecompra}
- Pedidos últimos 30 dias: ${insight.qtdPedidosUltimos30d}
- Ticket médio recente: ${insight.ticketMedioRecente ? 'R$ ' + Number(insight.ticketMedioRecente).toFixed(2) : 'sem dados'}
- Ticket médio histórico: ${insight.ticketMedioBase ? 'R$ ' + Number(insight.ticketMedioBase).toFixed(2) : 'sem dados'}
- Variação de ticket: ${insight.variacaoTicketPct != null ? Number(insight.variacaoTicketPct).toFixed(1) + '%' : 'sem dados'}
- Atendimentos comerciais sem pedido (30d): ${insight.qtdAtendimentosSemPedido30d}
- Devolução recente: ${insight.teveDevolucaoRecente ? 'Sim' : 'Não'}
- Score de risco: ${insight.scoreRisco}/100

HISTÓRICO COMERCIAL (últimos 10 eventos — [PEDIDO] e [ATENDIMENTO] apenas):
${historicoStr}

${orientacaoAnterior}

Regras:
- Seja direto e prático — o vendedor lê isso em 5 segundos antes de entrar
- Use linguagem de vendedor de rota, não de gerente
- "motivo" deve ser um dado concreto (ex: "12 dias sem comprar", "ticket caiu 35%")
- "seNegar" deve ser uma ação real, não uma frase genérica
- NÃO sugira trocar o canal de atendimento (ex: não diga "ligue em vez de WhatsApp" ou "visite pessoalmente"). O canal já está definido — foque no conteúdo da abordagem

Responda APENAS com JSON válido, sem markdown, sem explicação:
{
  "situacao": "classificação curta e forte (máx 60 chars)",
  "motivo": "dado concreto que justifica o cenário (máx 70 chars)",
  "metaHoje": "o que buscar nesta visita (máx 60 chars)",
  "acao": "ação concreta e específica (máx 90 chars)",
  "seNegar": "plano B se o cliente recusar (máx 80 chars)"
}`;
}

async function gerarOrientacaoIA(clienteId, opcoes = {}) {
    const {
        disparadoPor = 'MANUAL',
        usuarioId = null,
        atendimentoId = null,
    } = opcoes;

    if (!ai.isConfigured()) throw new Error('Chave da IA não configurada (OPENAI_API_KEY / GEMINI_API_KEY).');

    const cliente = await prisma.cliente.findUnique({
        where: { UUID: clienteId },
        select: { Nome: true, NomeFantasia: true, idVendedor: true, categoriaCliente: { select: { nome: true } } }
    });
    if (!cliente) throw new Error(`Cliente ${clienteId} não encontrado.`);

    const insight = await prisma.clienteInsight.findUnique({ where: { clienteId } });
    if (!insight) throw new Error(`Sem insight para cliente ${clienteId}. Rode recalcular primeiro.`);

    // ── Histórico unificado: atendimentos comerciais + pedidos (últimos 10) ──
    const [atendimentosComerciais, pedidosRecentes] = await Promise.all([
        prisma.atendimento.findMany({
            where: { clienteId, tipo: { notIn: ['FINANCEIRO'] } },
            orderBy: { criadoEm: 'desc' },
            take: 20,
            select: { criadoEm: true, tipo: true, acaoLabel: true, observacao: true }
        }),
        prisma.pedido.findMany({
            where: { clienteId },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: { createdAt: true, statusEnvio: true, numero: true,
                      itens: { select: { valor: true, quantidade: true } } }
        })
    ]);

    const timeline = [
        ...atendimentosComerciais.map(a => ({
            data: a.criadoEm,
            tag: '[ATENDIMENTO]',
            descricao: `${a.tipo}${a.acaoLabel ? ' | ' + a.acaoLabel : ''} | ${a.observacao || 'sem obs'}`
        })),
        ...pedidosRecentes.map(p => {
            const total = p.itens.reduce((s, i) => s + Number(i.valor) * Number(i.quantidade), 0);
            return {
                data: p.createdAt,
                tag: '[PEDIDO]',
                descricao: `#${p.numero || '?'} | ${p.statusEnvio} | R$ ${total.toFixed(2)}`
            };
        })
    ].sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 10);

    const historicoStr = timeline.length
        ? timeline.map(e => `- ${new Date(e.data).toLocaleDateString('pt-BR')} ${e.tag} ${e.descricao}`).join('\n')
        : '(sem histórico comercial registrado)';

    const orientacaoAnterior = insight.orientacaoIaJson
        ? `ORIENTAÇÃO ANTERIOR SUGERIDA:\n${JSON.stringify(insight.orientacaoIaJson, null, 2)}`
        : 'ORIENTAÇÃO ANTERIOR: nenhuma ainda';
    // ─────────────────────────────────────────────────────────────────────────

    const cenario = classificarCenario(insight);
    const nomeCliente = cliente.NomeFantasia || cliente.Nome;
    const prompt = montarPromptIA({ nomeCliente, cenario, insight, historicoStr, orientacaoAnterior });
    let modelo = ai.modeloAtual();
    const inicio = Date.now();
    const dadosEntrada = { insight, timeline };

    const salvarLog = async (params) => {
        try {
            await prisma.$executeRawUnsafe(
                `INSERT INTO "ia_analise_logs"
                 ("cliente_id","vendedor_id","disparado_por","disparado_por_usuario_id","atendimento_id",
                  "modelo","prompt_enviado","dados_entrada","resposta_ia",
                  "tokens_prompt","tokens_resposta","tokens_total","duracao_ms","sucesso","erro_msg")
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,$15)`,
                params.clienteId,
                params.vendedorId || null,
                params.disparadoPor,
                params.usuarioId || null,
                params.atendimentoId || null,
                params.modelo,
                params.promptEnviado,
                JSON.stringify(params.dadosEntrada),
                params.respostaIa !== null ? JSON.stringify(params.respostaIa) : null,
                params.tokensPrompt || null,
                params.tokensResposta || null,
                params.tokensTotal || null,
                params.duracaoMs || null,
                params.sucesso,
                params.erroMsg || null,
            );
        } catch (logErr) {
            console.error('[IA] Erro ao salvar log:', logErr.message);
        }
    };

    let resultadoIA, orientacaoIaJson, erroMsg = null;
    try {
        resultadoIA = await ai.gerarTexto({
            mensagens: [{ role: 'user', content: prompt }],
            maxTokens: 1000, // folga para tokens de raciocínio do gpt-6-luna (contam no teto)
            temperature: 0.3,
            json: true,
        });
        modelo = resultadoIA.modelo || modelo;

        const raw = resultadoIA.texto;
        try {
            orientacaoIaJson = JSON.parse(raw);
        } catch {
            throw new Error(`A IA retornou JSON inválido: ${raw}`);
        }

        await prisma.clienteInsight.update({
            where: { clienteId },
            data: { orientacaoIaJson }
        });
    } catch (err) {
        erroMsg = err.message;
        await salvarLog({
            clienteId, vendedorId: cliente.idVendedor,
            disparadoPor, usuarioId, atendimentoId,
            modelo, promptEnviado: prompt, dadosEntrada,
            respostaIa: null,
            tokensPrompt: null, tokensResposta: null, tokensTotal: null,
            duracaoMs: Date.now() - inicio,
            sucesso: false, erroMsg,
        });
        // Erro vindo da API da IA: tela recebe mensagem em português, sem trecho de chave
        // (o texto original fica só no erro_msg do log acima).
        if (typeof err.status === 'number') {
            const amigavel = err.status === 401 ? 'Chave da IA inválida ou expirada'
                : err.status === 429 ? 'Limite da IA atingido, tente em instantes'
                : 'A IA não respondeu agora, tente novamente';
            const e2 = new Error(amigavel);
            e2.status = err.status;
            throw e2;
        }
        throw err;
    }

    await salvarLog({
        clienteId, vendedorId: cliente.idVendedor,
        disparadoPor, usuarioId, atendimentoId,
        modelo, promptEnviado: prompt, dadosEntrada,
        respostaIa: orientacaoIaJson,
        tokensPrompt: resultadoIA.usage?.prompt ?? null,
        tokensResposta: resultadoIA.usage?.resposta ?? null,
        tokensTotal: resultadoIA.usage?.total ?? null,
        duracaoMs: Date.now() - inicio,
        sucesso: true, erroMsg: null,
    });

    return {
        clienteId,
        nome: nomeCliente,
        cenario,
        orientacaoIaJson,
        promptEnviado: prompt,
        // mantém o formato antigo (OpenAI) que a rota manual devolve à tela
        tokensUsados: {
            prompt_tokens: resultadoIA.usage?.prompt ?? null,
            completion_tokens: resultadoIA.usage?.resposta ?? null,
            total_tokens: resultadoIA.usage?.total ?? null,
        },
        dadosAnalise: { insight, timeline }
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
