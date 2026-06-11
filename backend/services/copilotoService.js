/**
 * Clippy — assistente de AJUDA do sistema.
 *
 * Função: dizer ao usuário ONDE e COMO fazer cada tarefa no app, com base nos
 * MANUAIS DAS ABAS (um arquivo por aba em `backend/manuais/abas/`, fonte da verdade).
 * NÃO acessa dados de negócio (vendas, valores, clientes).
 *
 * Eficiência de tokens: o prompt leva um ÍNDICE curto de todas as abas que o
 * usuário pode acessar + o conteúdo completo apenas das abas mais relevantes à
 * pergunta (selecionadas por palavras-chave). Filtra tudo por permissão.
 *
 * Rotas dos botões "Ir para" vêm da tabela ABAS (rotas REAIS validadas no App.jsx),
 * não do cabeçalho dos manuais (que pode divergir).
 *
 * Provider de IA abstraído em aiProvider.js (OpenAI padrão, Gemini plugável).
 */

const fs = require('fs');
const path = require('path');
const ai = require('./aiProvider');

// ─────────────────────────────────────────────
// Tabela de abas: slug (= nome do manual), nome exibido, ROTA REAL e permissão.
// Mantida em sincronia com o menu (Sidebar) em frontend/src/App.jsx.
//
// perm: string | string[]
//   - string: chave direta em permissoes (boolean) ou objeto (checa .view)
//   - 'pcp.itens': notação ponto para sub-chaves (perms.pcp.itens)
//   - array: acesso se QUALQUER permissão for válida
//   - null: acesso público (qualquer usuário logado)
// ─────────────────────────────────────────────
const ABAS = [
    // ── Vendas ──────────────────────────────────
    { slug: 'dashboard',          nome: 'Dashboard',                    rota: '/',                                   perm: null },
    { slug: 'catalogo',           nome: 'Catálogo',                     rota: '/catalogo',                           perm: 'catalogo' },
    { slug: 'pedidos',            nome: 'Pedidos',                      rota: '/pedidos',                            perm: 'pedidos' },
    { slug: 'rel-pedidos',        nome: 'Relatório de Pedidos',         rota: '/relatorios/pedidos',                 perm: 'pedidos' },
    { slug: 'rel-vendas',         nome: 'Relatório de Vendas',          rota: '/relatorios/vendas',                  perm: 'relatorioVendas' },
    { slug: 'analise-flex',       nome: 'Análise de Flex',              rota: '/relatorios/flex',                    perm: 'pedidos' },
    { slug: 'delivery',           nome: 'Delivery',                     rota: '/delivery',                           perm: 'delivery' },
    { slug: 'kit-festa',          nome: 'Kit Festa',                    rota: '/kit-festa-admin',                    perm: 'kitFesta' },
    { slug: 'rota',               nome: 'Rota',                         rota: '/rota',                               perm: 'pedidos' },
    { slug: 'leads',              nome: 'Leads',                        rota: '/leads',                              perm: 'rota' },
    { slug: 'atendimentos',       nome: 'Atendimentos',                 rota: '/atendimentos',                       perm: 'Pode_Ver_Atendimentos' },
    { slug: 'analise-ia',         nome: 'Análise IA',                   rota: '/analise-ia',                         perm: 'Pode_Ver_Analise_IA' },
    { slug: 'clientes',           nome: 'Clientes',                     rota: '/clientes',                           perm: 'clientes' },
    // ── Logística ───────────────────────────────
    { slug: 'embarque',           nome: 'Embarque',                     rota: '/admin/embarques',                    perm: 'Pode_Acessar_Embarque' },
    { slug: 'entregas',           nome: 'Entregas',                     rota: '/entregas',                           perm: ['Pode_Ver_Todas_Entregas', 'Pode_Executar_Entregas'] },
    { slug: 'minhas-entregas',    nome: 'Minhas Entregas (Motorista)',   rota: '/minhas-entregas',                    perm: 'Pode_Executar_Entregas' },
    // ── Financeiro ──────────────────────────────
    { slug: 'caixa',              nome: 'Caixa',                        rota: '/caixa',                              perm: 'Pode_Acessar_Caixa' },
    { slug: 'despesas',           nome: 'Despesas',                     rota: '/despesas',                           perm: 'Pode_Acessar_Caixa' },
    { slug: 'auditoria-entregas', nome: 'Auditoria de Entregas',        rota: '/admin/auditoria-entregas',           perm: 'Pode_Ver_Todas_Entregas' },
    { slug: 'contas-receber',     nome: 'Contas a Receber',             rota: '/financeiro/contas-receber/tabela',   perm: 'Pode_Acessar_Contas_Receber' },
    // ── Admin ────────────────────────────────────
    { slug: 'produtos',           nome: 'Produtos',                     rota: '/admin/produtos',                     perm: 'produtos' },
    { slug: 'vendedores',         nome: 'Vendedores',                   rota: '/admin/vendedores',                   perm: 'vendedores' },
    { slug: 'mensagens-agendadas',nome: 'Mensagens Agendadas',          rota: '/admin/mensagens',                    perm: 'admin' },
    { slug: 'veiculos',           nome: 'Veículos',                     rota: '/admin/veiculos',                     perm: ['Pode_Acessar_Veiculos'] },
    { slug: 'sincronizar',        nome: 'Sincronizar',                  rota: '/admin/sync',                         perm: 'sync' },
    // ── RH ───────────────────────────────────────
    { slug: 'curriculos',         nome: 'Currículos',                   rota: '/rh/curriculos',                      perm: ['Pode_Ver_RH', 'Pode_Editar_RH'] },
    // ── PCP — sub-permissões específicas ─────────
    { slug: 'pcp-itens',          nome: 'PCP — Itens',                  rota: '/pcp/itens',                          perm: 'pcp.itens' },
    { slug: 'pcp-receitas',       nome: 'PCP — Receitas',               rota: '/pcp/receitas',                       perm: 'pcp.receitas' },
    { slug: 'pcp-ordens',         nome: 'PCP — Ordens',                 rota: '/pcp/ordens',                         perm: 'pcp.ordens' },
    { slug: 'pcp-painel',         nome: 'PCP — Painel',                 rota: '/pcp/painel',                         perm: 'pcp.ordens' },
    { slug: 'pcp-calendario',     nome: 'PCP — Calendário',             rota: '/pcp/calendario',                     perm: 'pcp.agenda' },
    { slug: 'pcp-estoque',        nome: 'PCP — Estoque PCP',            rota: '/pcp/estoque',                        perm: 'pcp.estoque' },
    { slug: 'pcp-sugestoes',      nome: 'PCP — Sugestões',              rota: '/pcp/sugestoes',                      perm: 'pcp.sugestoes' },
    { slug: 'pcp-dashboard',      nome: 'PCP — Dashboard',              rota: '/pcp/dashboard',                      perm: 'pcp.sugestoes' },
    { slug: 'pcp-etiquetas',      nome: 'PCP — Etiquetas',              rota: '/pcp/etiquetas',                      perm: 'pcp.etiquetas' },
    { slug: 'pcp-etiquetas-dados',nome: 'PCP — Dados de Etiquetas',     rota: '/pcp/etiquetas/dados',                perm: 'pcp.etiquetas' },
    // ── Estoque ──────────────────────────────────
    { slug: 'estoque-posicao',    nome: 'Estoque — Posição',            rota: '/estoque/posicao',                    perm: 'estoque' },
    { slug: 'estoque-ajuste',     nome: 'Estoque — Ajuste',             rota: '/estoque',                            perm: 'estoque' },
    { slug: 'estoque-historico',  nome: 'Estoque — Histórico',          rota: '/estoque/historico',                  perm: 'estoque' },
    // ── Configurações ────────────────────────────
    { slug: 'config-gerais',               nome: 'Configurações — Gerais',        rota: '/admin/config',                      perm: 'configuracoes' },
    { slug: 'config-precos',               nome: 'Configurações — Preços',        rota: '/config/tabela-precos',              perm: 'configuracoes' },
    { slug: 'config-bancos',               nome: 'Configurações — Bancos',        rota: '/config/contas-financeiras',         perm: 'configuracoes' },
    { slug: 'config-metas',                nome: 'Configurações — Metas',         rota: '/config/metas',                      perm: 'configuracoes' },
    { slug: 'config-comissoes',            nome: 'Configurações — Comissões',     rota: '/config/comissoes',                  perm: 'configuracoes' },
    { slug: 'config-categorias-produto',   nome: 'Configurações — Cat. Produtos', rota: '/config/categorias-produto',         perm: 'configuracoes' },
    { slug: 'config-categorias-cliente',   nome: 'Configurações — Cat. Clientes', rota: '/config/categorias-cliente',         perm: 'configuracoes' },
    { slug: 'config-categorias-estoque',   nome: 'Configurações — Cat. Estoque',  rota: '/config/categorias-estoque',         perm: 'configuracoes' },
];

// ─────────────────────────────────────────────
// Carrega os manuais (uma vez, na inicialização). Em produção os arquivos vêm
// junto no deploy do backend, então editar um manual + publicar = Clippy atualizado.
// ─────────────────────────────────────────────
const MANUAIS_DIR = path.join(__dirname, '..', 'manuais', 'abas');

function carregarManuais() {
    const map = {};
    try {
        for (const f of fs.readdirSync(MANUAIS_DIR)) {
            if (!f.endsWith('.md') || f.toLowerCase() === 'readme.md') continue;
            const slug = f.replace(/\.md$/, '');
            const raw = fs.readFileSync(path.join(MANUAIS_DIR, f), 'utf8');
            let corpo = raw;
            const fm = raw.match(/^---\n[\s\S]*?\n---\n?/); // remove frontmatter
            if (fm) corpo = raw.slice(fm[0].length);
            corpo = corpo.trim();
            let resumo = '';
            const m = corpo.match(/##\s*O que é\s*\n+([^\n]+)/i);
            if (m) resumo = m[1].replace(/[*_>#`]/g, '').trim();
            map[slug] = { resumo, corpo };
        }
    } catch (e) {
        console.error('[copiloto] Falha ao carregar manuais:', e.message);
    }
    return map;
}

const MANUAIS = carregarManuais();
console.log(`[copiloto] ${Object.keys(MANUAIS).length} manuais de abas carregados.`);

// ─────────────────────────────────────────────
// Permissão — espelha o hasPermission do AuthContext do frontend.
//
// Tipos suportados em `perm`:
//   null          → acesso livre (qualquer usuário logado)
//   'chave'       → boolean direto (ex: 'Pode_Acessar_Caixa')
//   'catalogo'    → objeto { view, edit } — verifica .view === true
//   'estoque'     → array — verifica length > 0
//   'pcp.itens'   → notação ponto: perms.pcp.itens (boolean)
//   ['a', 'b']    → array de perms — acesso se QUALQUER uma for válida
// ─────────────────────────────────────────────
function resolverUmaChave(perms, key) {
    // Notação ponto: 'pcp.itens' → perms.pcp.itens
    if (key.includes('.')) {
        const [parent, child] = key.split('.');
        const parentVal = perms[parent];
        if (!parentVal || typeof parentVal !== 'object' || Array.isArray(parentVal)) return false;
        const val = parentVal[child];
        return typeof val === 'boolean' ? val : false;
    }
    const val = perms[key];
    if (typeof val === 'boolean') return val;
    // Array (estoque): tem algum item
    if (Array.isArray(val)) return val.length > 0;
    // Objeto (catalogo, pedidos, rota, clientes, produtos, vendedores, sync, configuracoes):
    // verifica .view === true — NÃO usa some(Boolean) para evitar falso-positivo com 'vinculados'
    if (val && typeof val === 'object') return val.view === true;
    return false;
}

function podeAcessar(perms, perm) {
    if (!perms) return false;
    if (perms.admin) return true;
    if (!perm) return true;
    const chaves = Array.isArray(perm) ? perm : [perm];
    return chaves.some((k) => resolverUmaChave(perms, k));
}

// ─────────────────────────────────────────────
// Seleção por relevância (palavras-chave) — para gastar poucos tokens
// ─────────────────────────────────────────────
const STOPWORDS = new Set([
    'como', 'onde', 'qual', 'quais', 'para', 'pra', 'uma', 'com', 'que', 'dos', 'das',
    'fazer', 'quero', 'posso', 'faco', 'tem', 'sobre', 'meu', 'minha', 'isso', 'aqui',
    'app', 'sistema', 'aba', 'tela', 'consigo', 'consegue', 'preciso', 'sei', 'fica',
]);
function normalizar(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}
function tokenizar(s) {
    return normalizar(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function selecionarRelevantes(pergunta, abasAcessiveis, n = 3) {
    const qt = [...new Set(tokenizar(pergunta))];
    if (!qt.length) return [];
    const scored = abasAcessiveis.map((a) => {
        const man = MANUAIS[a.slug] || {};
        const titulo = new Set(tokenizar(`${a.nome} ${man.resumo || ''}`));
        const corpoNorm = normalizar(man.corpo || '');
        let score = 0;
        for (const t of qt) {
            if (titulo.has(t)) score += 2;
            else if (corpoNorm.includes(t)) score += 1;
        }
        return { a, score };
    });
    return scored.filter((x) => x.score > 0).sort((x, y) => y.score - x.score).slice(0, n).map((x) => x.a);
}

// Extrai o trecho ÚTIL do manual para responder: descarta as seções de
// desenvolvedor ("Depende de", "Arquivos no código"), que ficam no fim e só
// gastam tokens. Mantém "O que é / O que dá pra fazer / Como fazer / Permissões".
function trechoUtil(corpo) {
    if (!corpo) return '';
    const corte = corpo.search(/\n##\s*(Depende|Arquivos)/i);
    const t = corte > 0 ? corpo.slice(0, corte) : corpo;
    return t.trim().slice(0, 4000);
}

const PERSONA = `Você é o "Clippy", o assistente de ajuda do app de gestão da Hardt Salgados.
Sua função é ensinar o usuário a usar o sistema: ONDE fica cada coisa e COMO fazer cada tarefa, com base nos manuais das telas.
REGRAS:
- Você NÃO tem acesso a dados de negócio (vendas, valores, nomes de clientes). Se pedirem números/dados, diga que você só ajuda a usar o app e indique a tela onde ele encontra isso.
- Baseie-se SOMENTE no índice e nos manuais fornecidos. NUNCA invente telas, menus, botões ou caminhos.
- Se a tela necessária não estiver na lista (o usuário não tem permissão), diga que ele não tem acesso a ela.
- Responda de forma COMPLETA e prática, em português do Brasil: se o manual traz um passo a passo, liste TODOS os passos em ordem. NUNCA escreva "siga os passos abaixo" (ou parecido) sem de fato listar os passos. Use as informações do manual, não invente nem resuma a ponto de ficar vago.
- FORMATO: quando houver passos, escreva UM passo por linha, cada um iniciando com "1.", "2.", "3."... e uma quebra de linha real (\\n) entre eles. Use texto simples, SEM markdown (nada de **, *, # ou _). Se precisar destacar um botão, escreva o nome entre aspas, ex.: clique em "+ Entrada".`;

/**
 * Responde uma dúvida de uso com base nos manuais das abas acessíveis ao usuário.
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

    const acessiveis = ABAS.filter((a) => podeAcessar(perms, a.perm));

    const indice = acessiveis
        .map((a) => {
            const r = MANUAIS[a.slug]?.resumo;
            return `- ${a.nome} (${a.rota})${r ? ': ' + r : ''}`;
        })
        .join('\n');

    const relevantes = selecionarRelevantes(pergunta, acessiveis);
    const detalhes = relevantes
        .map((a) => `### ${a.nome} (${a.rota})\n${trechoUtil(MANUAIS[a.slug]?.corpo)}`)
        .join('\n\n');

    const system = `${PERSONA}

ÍNDICE DAS TELAS (todas que ESTE usuário pode acessar):
${indice}

MANUAIS DAS TELAS MAIS RELEVANTES À PERGUNTA:
${detalhes || '(nenhum manual específico selecionado — use o índice acima)'}

Responda SEMPRE em JSON neste formato:
{ "resposta": "explicação de onde/como fazer", "atalhos": [{ "label": "Nome da tela", "rota": "/rota" }] }
- No máximo 2 atalhos, apenas com rotas que aparecem no índice acima.
- Se não houver tela aplicável, deixe "atalhos": [].`;

    const msgs = historico
        .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && h.content)
        .slice(-8)
        .map((h) => ({ role: h.role, content: String(h.content).slice(0, 800) }));

    msgs.push({ role: 'user', content: pergunta.trim().slice(0, 800) });

    const { texto, modelo, provider } = await ai.gerarTexto({
        system,
        mensagens: msgs,
        maxTokens: 750,
        temperature: 0.2,
        json: true,
    });

    let parsed;
    try {
        parsed = JSON.parse(texto);
    } catch {
        parsed = { resposta: texto, atalhos: [] };
    }

    const rotasValidas = new Set(acessiveis.map((a) => a.rota));
    const atalhos = (Array.isArray(parsed.atalhos) ? parsed.atalhos : [])
        .filter((a) => a && typeof a.rota === 'string' && rotasValidas.has(a.rota))
        .slice(0, 2)
        .map((a) => ({ label: String(a.label || a.rota), rota: a.rota }));

    return { resposta: parsed.resposta || texto, atalhos, modelo, provider };
}

module.exports = { responderAjuda, ABAS };
