/**
 * Clippy — assistente de AJUDA do sistema.
 *
 * Função única: dizer ao usuário ONDE e COMO fazer cada tarefa no app.
 * NÃO acessa dados de negócio (vendas, valores, clientes). Ele conhece apenas
 * o MAPA DAS TELAS e responde "onde eu faço X?" / "como faço Y?".
 *
 * Filtra o mapa pelas permissões do usuário, então só sugere telas que ele
 * realmente pode acessar. Devolve { resposta, atalhos:[{label, rota}] }.
 *
 * Provider de IA abstraído em aiProvider.js (OpenAI padrão, Gemini plugável).
 */

const ai = require('./aiProvider');

// ─────────────────────────────────────────────
// Mapa das telas do app (fonte do menu em App.jsx).
// perm = chave de permissão exigida (null = todos). Mantido em sincronia com o Sidebar.
// ─────────────────────────────────────────────
const APP_MAP = [
    { titulo: 'Dashboard', rota: '/', caminho: 'Início', perm: null,
      descricao: 'Tela inicial com a visão geral do dia.' },

    // Vendas
    { titulo: 'Catálogo', rota: '/catalogo', caminho: 'Vendas › Catálogo', perm: 'catalogo',
      descricao: 'Consultar produtos, fotos e preços.' },
    { titulo: 'Pedidos', rota: '/pedidos', caminho: 'Vendas › Pedidos', perm: 'pedidos',
      descricao: 'Ver, editar e acompanhar pedidos.' },
    { titulo: 'Novo Pedido', rota: '/pedidos/novo', caminho: 'Vendas › Pedidos › Novo Pedido', perm: 'pedidos',
      descricao: 'Lançar um novo pedido para um cliente (botão "Novo Pedido" na tela de Pedidos).' },
    { titulo: 'Relatório de Pedidos', rota: '/relatorios/pedidos', caminho: 'Vendas › Rel. Pedidos', perm: 'pedidos',
      descricao: 'Listagem detalhada e filtros de pedidos.' },
    { titulo: 'Relatório de Vendas', rota: '/relatorios/vendas', caminho: 'Vendas › Rel. Vendas', perm: 'relatorioVendas',
      descricao: 'Relatório de vendas e faturamento por período.' },
    { titulo: 'Delivery', rota: '/delivery', caminho: 'Vendas › Delivery', perm: 'delivery',
      descricao: 'Kanban de pedidos de delivery (Kit Festa).' },
    { titulo: 'Rota', rota: '/rota', caminho: 'Vendas › Rota', perm: 'pedidos',
      descricao: 'Roteiro de visitas e clientes no mapa.' },
    { titulo: 'Leads', rota: '/leads', caminho: 'Vendas › Leads', perm: 'rota',
      descricao: 'Cadastrar e acompanhar leads (clientes potenciais).' },
    { titulo: 'Atendimentos', rota: '/atendimentos', caminho: 'Vendas › Atendimentos', perm: 'Pode_Ver_Atendimentos',
      descricao: 'Registrar e consultar atendimentos comerciais a clientes.' },
    { titulo: 'Análise IA', rota: '/analise-ia', caminho: 'Vendas › Análise IA', perm: 'Pode_Ver_Analise_IA',
      descricao: 'Análises e orientações comerciais geradas por IA.' },
    { titulo: 'Clientes', rota: '/clientes', caminho: 'Vendas › Clientes', perm: 'clientes',
      descricao: 'Cadastro de clientes, ficha, histórico e referências.' },

    // Logística
    { titulo: 'Embarque', rota: '/admin/embarques', caminho: 'Logística › Embarque', perm: 'Pode_Acessar_Embarque',
      descricao: 'Montar cargas e despachar entregas.' },
    { titulo: 'Entregas', rota: '/entregas', caminho: 'Logística › Entregas', perm: 'Pode_Ver_Todas_Entregas',
      descricao: 'Acompanhar todas as entregas (visão gerencial).' },

    // Financeiro
    { titulo: 'Caixa', rota: '/caixa', caminho: 'Financeiro › Caixa', perm: 'Pode_Acessar_Caixa',
      descricao: 'Caixa diário: conferência de entregas e pagamentos recebidos.' },
    { titulo: 'Despesas', rota: '/despesas', caminho: 'Financeiro › Despesas', perm: 'Pode_Acessar_Caixa',
      descricao: 'Lançar e consultar despesas (botão "Nova Despesa").' },
    { titulo: 'Auditoria de Entregas', rota: '/admin/auditoria-entregas', caminho: 'Financeiro › Auditoria', perm: 'Pode_Ver_Todas_Entregas',
      descricao: 'Auditar entregas e divergências de pagamento.' },
    { titulo: 'Contas a Receber', rota: '/financeiro/contas-receber/tabela', caminho: 'Financeiro › Contas a Receber', perm: 'Pode_Acessar_Contas_Receber',
      descricao: 'Ver o que cada cliente deve, parcelas, vencidos e dar baixa.' },

    // Admin
    { titulo: 'Produtos (cadastro)', rota: '/admin/produtos', caminho: 'Admin › Produtos', perm: 'produtos',
      descricao: 'Cadastrar e editar produtos.' },
    { titulo: 'Vendedores', rota: '/admin/vendedores', caminho: 'Admin › Vendedores', perm: 'vendedores',
      descricao: 'Cadastrar usuários/vendedores e definir permissões.' },
    { titulo: 'Mensagens Agendadas', rota: '/admin/mensagens', caminho: 'Admin › Mensagens', perm: 'admin',
      descricao: 'Programar mensagens automáticas.' },
    { titulo: 'Veículos', rota: '/admin/veiculos', caminho: 'Admin › Veículos', perm: 'Pode_Acessar_Veiculos',
      descricao: 'Cadastro e manutenção da frota.' },
    { titulo: 'Sincronizar', rota: '/admin/sync', caminho: 'Admin › Sincronizar', perm: 'sync',
      descricao: 'Sincronizar dados com o Conta Azul.' },

    // RH
    { titulo: 'Currículos', rota: '/rh/curriculos', caminho: 'RH › Currículos', perm: 'Pode_Ver_RH',
      descricao: 'Consultar currículos recebidos.' },

    // PCP / Produção / Estoque
    { titulo: 'PCP (Produção)', rota: '/pcp/painel', caminho: 'PCP', perm: 'pcp',
      descricao: 'Planejamento e controle de produção: itens, receitas, ordens, agenda e sugestões.' },
    { titulo: 'Estoque', rota: '/estoque/posicao', caminho: 'Produção › Estoque', perm: 'estoque',
      descricao: 'Posição, ajuste e histórico de estoque.' },

    // Configurações
    { titulo: 'Configurações', rota: '/admin/config', caminho: 'Configurações', perm: 'configuracoes',
      descricao: 'Configurações gerais, preços, bancos, metas e categorias.' },
];

// Mesma semântica do hasPermission do frontend: admin libera tudo;
// boolean → valor; array (ex.: estoque) → tem itens; objeto (ex.: pcp) → algum true.
function podeAcessar(perms, key) {
    if (!perms) return false;
    if (perms.admin) return true;
    if (!key) return true;
    const val = perms[key];
    if (typeof val === 'boolean') return val;
    if (Array.isArray(val)) return val.length > 0;
    if (val && typeof val === 'object') return Object.values(val).some(Boolean);
    return false;
}

const PERSONA = `Você é o "Clippy", o assistente de ajuda do app de gestão da Hardt Salgados.
Sua ÚNICA função é dizer ao usuário ONDE e COMO realizar tarefas no sistema (em qual tela/menu).
REGRAS:
- Você NÃO tem acesso a dados de negócio (vendas, valores, nomes de clientes). Se pedirem números ou dados,
  responda gentilmente que você só ajuda a navegar e indique a tela onde ele encontra essa informação.
- Baseie-se SOMENTE na lista de telas fornecida. NUNCA invente telas, menus ou caminhos.
- Se a tela necessária não estiver na lista (o usuário não tem permissão), diga que ele não tem acesso a ela.
- Seja curto, direto e amigável, em português do Brasil. Sempre cite o caminho do menu.`;

/**
 * Responde uma dúvida de "onde/como faço X" com base no mapa de telas do usuário.
 * @param {Object} opts
 * @param {string} opts.pergunta
 * @param {Array}  [opts.historico] [{role:'user'|'assistant', content}]
 * @param {Object} [opts.perms]     req.user.permissoes
 * @returns {Promise<{resposta:string, atalhos:Array<{label,rota}>}>}
 */
async function responderAjuda({ pergunta, historico = [], perms = {} } = {}) {
    if (!ai.isConfigured()) {
        const err = new Error('IA não configurada (defina OPENAI_API_KEY ou GEMINI_API_KEY).');
        err.statusCode = 503;
        throw err;
    }
    if (!pergunta || !pergunta.trim()) {
        const err = new Error('Pergunta vazia.');
        err.statusCode = 400;
        throw err;
    }

    const disponiveis = APP_MAP.filter(e => podeAcessar(perms, e.perm));
    const baseTexto = disponiveis
        .map(e => `- ${e.titulo} — ${e.caminho} (rota ${e.rota}): ${e.descricao}`)
        .join('\n');

    const system = `${PERSONA}

TELAS DISPONÍVEIS PARA ESTE USUÁRIO (use apenas estas):
${baseTexto}

Responda SEMPRE em JSON neste formato:
{ "resposta": "explicação curta de onde/como fazer", "atalhos": [{ "label": "Nome da tela", "rota": "/rota" }] }
- Inclua no máximo 2 atalhos, apenas com rotas que aparecem na lista acima.
- Se não houver tela aplicável, deixe "atalhos": [].`;

    const msgs = historico
        .filter(h => h && (h.role === 'user' || h.role === 'assistant') && h.content)
        .slice(-8)
        .map(h => ({ role: h.role, content: String(h.content).slice(0, 800) }));

    msgs.push({ role: 'user', content: pergunta.trim().slice(0, 800) });

    const { texto, modelo, provider } = await ai.gerarTexto({
        system,
        mensagens: msgs,
        maxTokens: 400,
        temperature: 0.2,
        json: true,
    });

    let parsed;
    try {
        parsed = JSON.parse(texto);
    } catch {
        parsed = { resposta: texto, atalhos: [] };
    }

    // Só deixa passar atalhos com rota válida (anti-alucinação)
    const rotasValidas = new Set(disponiveis.map(e => e.rota));
    const atalhos = (Array.isArray(parsed.atalhos) ? parsed.atalhos : [])
        .filter(a => a && typeof a.rota === 'string' && rotasValidas.has(a.rota))
        .slice(0, 2)
        .map(a => ({ label: String(a.label || a.rota), rota: a.rota }));

    return {
        resposta: parsed.resposta || texto,
        atalhos,
        modelo,
        provider,
    };
}

module.exports = { responderAjuda, APP_MAP };
