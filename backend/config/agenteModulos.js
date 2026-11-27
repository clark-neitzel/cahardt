// MATRIZ de permissões da API do usuário-agente: MÓDULO × AÇÃO (plano docs/plano-matriz-permissoes-agente.md).
//
// Este arquivo diz QUAIS módulos existem, de que famílias de rota cada um é feito, e quais permissões "humanas"
// (as do cadastro do usuário) o agente precisa ter para a rota não devolver 403 pelo check dela mesma.
// A classificação de cada função de ESCRITA (qual ação ela é) mora em config/agenteClassificacao.js.
//
// Nada aqui libera coisa alguma sozinho: quem decide é a célula gravada pelo dono em `agente_politicas`
// (escopo MODULO, chave `<modulo>.<acao>`), e só quando o marcador `MATRIZ/ativa` existe para o agente.
const ACOES = ['ver', 'criar', 'editar', 'excluir', 'estornar', 'baixar'];
const ROTULO_ACAO = { ver: 'Ver', criar: 'Criar', editar: 'Editar', excluir: 'Excluir', estornar: 'Estornar', baixar: 'Dar baixa' };

// Vocabulário: o banco guarda LIBERADO/PEDE/BLOQUEADO (o mesmo das exceções); a API da matriz e a tela falam SIM/PEDE/NAO.
const NIVEL_PARA_TELA = { LIBERADO: 'SIM', PEDE: 'PEDE', BLOQUEADO: 'NAO' };
const TELA_PARA_NIVEL = { SIM: 'LIBERADO', PEDE: 'PEDE', NAO: 'BLOQUEADO', 'NÃO': 'BLOQUEADO' };

const ESCRITAS = ['criar', 'editar', 'excluir', 'estornar', 'baixar'];

// permissoesBase: { chave, acoes?, rotulo } — `chave` é o caminho dentro de Vendedor.permissoes (`Pode_X` ou `grupo.campo`).
// Sem `acoes` = vale para todas as ações do módulo. É só para o aviso de PRONTIDÃO da tela ("falta a permissão X"):
// a rota continua sendo a única autoridade (o agente nunca vira admin; a matriz não substitui o check da rota).
const MODULOS = [
    {
        chave: 'contas_pagar', rotulo: 'Contas a pagar', familias: ['/api/contas-pagar', '/api/anexos'], rotuloBaixar: 'Dar baixa',
        permissoesBase: [
            { chave: 'Pode_Acessar_Contas_Pagar', acoes: ['ver'], rotulo: 'Acessar Contas a Pagar' },
            { chave: 'Pode_Baixar_Contas_Pagar', acoes: ESCRITAS, rotulo: 'Lançar/baixar Contas a Pagar' },
        ],
    },
    {
        chave: 'notas_recebidas', rotulo: 'Notas recebidas', familias: ['/api/notas-entrada'], rotuloBaixar: 'Vincular a parcelas',
        permissoesBase: [
            { chave: 'Pode_Acessar_Notas_Recebidas', acoes: ['ver'], rotulo: 'Acessar Notas Recebidas' },
            { chave: 'Pode_Baixar_Contas_Pagar', acoes: ESCRITAS, rotulo: 'Lançar/baixar Contas a Pagar' },
        ],
    },
    {
        chave: 'contas_receber', rotulo: 'Contas a receber', familias: ['/api/contas-receber'], rotuloBaixar: 'Dar baixa',
        permissoesBase: [
            { chave: 'Pode_Acessar_Contas_Receber', acoes: ['ver'], rotulo: 'Acessar Contas a Receber' },
            { chave: 'Pode_Baixar_Contas_Receber', acoes: ESCRITAS, rotulo: 'Baixar Contas a Receber' },
        ],
    },
    {
        chave: 'caixa', rotulo: 'Caixa', familias: ['/api/caixa'], rotuloBaixar: 'Fechar / conferir / baixar',
        permissoesBase: [
            { chave: 'Pode_Acessar_Caixa', acoes: ['ver'], rotulo: 'Acessar o Caixa' },
            { chave: 'Pode_Editar_Caixa', acoes: ESCRITAS, rotulo: 'Editar o Caixa' },
        ],
    },
    {
        chave: 'conciliacao', rotulo: 'Conciliação bancária', familias: ['/api/conciliacao-bancaria', '/api/contas-financeiras'], rotuloBaixar: 'Conciliar / baixar',
        permissoesBase: [{ chave: 'Pode_Acessar_Financeiro_Gerencial', rotulo: 'Acessar o Financeiro Gerencial' }],
    },
    {
        chave: 'dre_categorias', rotulo: 'DRE e categorias de despesa', familias: ['/api/financeiro-gerencial'], rotuloBaixar: null,
        permissoesBase: [{ chave: 'Pode_Acessar_Financeiro_Gerencial', rotulo: 'Acessar o Financeiro Gerencial' }],
    },
    {
        chave: 'contabilidade', rotulo: 'Contabilidade', familias: ['/api/contabilidade'], rotuloBaixar: null,
        permissoesBase: [{ chave: 'Pode_Acessar_Contabilidade', acoes: ['ver'], rotulo: 'Acessar a Contabilidade' }],
    },
    {
        chave: 'indicadores', rotulo: 'Indicadores e dashboards', familias: ['/api/indicadores-gestao', '/api/dashboards'], rotuloBaixar: null,
        permissoesBase: [
            { chave: 'Pode_Ver_Indicadores_Gestao', acoes: ['ver'], rotulo: 'Ver Indicadores de Gestão' },
            { chave: 'Pode_Ver_Dashboard_Admin', rotulo: 'Ver o Dashboard geral' },
        ],
    },
    {
        chave: 'cadastros', rotulo: 'Cadastros (clientes e fornecedores)', familias: ['/api/clientes', '/api/fornecedores'], rotuloBaixar: null,
        permissoesBase: [
            { chave: 'clientes.view', acoes: ['ver'], rotulo: 'Ver Clientes' },
            { chave: 'clientes.edit', acoes: ESCRITAS, rotulo: 'Gerenciar Clientes' },
        ],
    },
    {
        chave: 'produtos', rotulo: 'Produtos', familias: ['/api/produtos', '/api/categorias-estoque'], rotuloBaixar: null,
        permissoesBase: [{ chave: 'produtos.edit', acoes: ESCRITAS, rotulo: 'Editar Produtos' }],
    },
    {
        chave: 'estoque', rotulo: 'Estoque', familias: ['/api/estoque', '/api/pcp/estoque'], rotuloBaixar: null,
        permissoesBase: [
            { chave: 'produtos.edit', acoes: ESCRITAS, rotulo: 'Editar Produtos' },
            { chave: 'pcp.estoque', rotulo: 'PCP: estoque' },
        ],
    },
    {
        chave: 'pcp', rotulo: 'PCP (receitas e insumos)', familias: ['/api/pcp/itens', '/api/pcp/receitas'], rotuloBaixar: null,
        permissoesBase: [
            { chave: 'pcp.itens', rotulo: 'PCP: itens' },
            { chave: 'pcp.receitas', rotulo: 'PCP: receitas' },
        ],
    },
    {
        chave: 'pedidos', rotulo: 'Pedidos', familias: ['/api/pedidos'], rotuloBaixar: 'Aprovar / faturar',
        permissoesBase: [
            { chave: 'pedidos.view', acoes: ['ver'], rotulo: 'Ver Pedidos' },
            { chave: 'pedidos.edit', acoes: ESCRITAS, rotulo: 'Editar Pedidos' },
        ],
    },
    {
        chave: 'expedicao', rotulo: 'Expedição (cargas e entregas)', familias: ['/api/embarques', '/api/entregas'], rotuloBaixar: 'Concluir entrega / conferência',
        permissoesBase: [
            { chave: 'Pode_Acessar_Embarque', acoes: ['ver'], rotulo: 'Acessar Cargas' },
            { chave: 'Pode_Editar_Embarque', acoes: ESCRITAS, rotulo: 'Editar Cargas' },
            { chave: 'Pode_Ver_Todas_Entregas', acoes: ['ver'], rotulo: 'Ver todas as entregas' },
        ],
    },
];

const POR_CHAVE = new Map(MODULOS.map((m) => [m.chave, m]));
const POR_FAMILIA = new Map();
for (const m of MODULOS) for (const f of m.familias) POR_FAMILIA.set(f, m);

function moduloPorChave(chave) { return POR_CHAVE.get(String(chave || '')) || null; }
function moduloDaFamilia(familia) { return POR_FAMILIA.get(String(familia || '')) || null; }

/** `contas_pagar.criar` -> { modulo, acao } (ou null). */
function lerChaveCelula(chave) {
    const [m, a, resto] = String(chave || '').split('.');
    if (resto !== undefined || !POR_CHAVE.has(m) || !ACOES.includes(a)) return null;
    return { modulo: m, acao: a };
}
const chaveCelula = (modulo, acao) => `${modulo}.${acao}`;

// ───────────────────────── regra padrão (matriz inicial do Luke, seção 6 do plano) ─────────────────────────
// ver = SIM; criar = SIM só no trabalho de lançamento (decisão 1 do dono); todo o resto = PEDE.
const MODULOS_CRIAR_SIM = ['contas_pagar', 'notas_recebidas', 'cadastros', 'produtos', 'pcp', 'conciliacao', 'dre_categorias'];
function nivelPadrao(modulo, acao) {
    if (acao === 'ver') return 'LIBERADO';
    if (acao === 'criar' && MODULOS_CRIAR_SIM.includes(modulo)) return 'LIBERADO';
    return 'PEDE';
}

// ───────────────────────── prontidão (permissões-base) ─────────────────────────
function valorNoCaminho(obj, caminho) {
    let v = obj;
    for (const parte of String(caminho).split('.')) {
        if (v == null || typeof v !== 'object') return undefined;
        v = v[parte];
    }
    return v;
}
// "ligada": true, ou objeto/lista com algo dentro (permissão no projeto pode ser OBJETO — nunca `!!perms.x` no pai)
function ligada(v) {
    if (v === true) return true;
    if (Array.isArray(v)) return v.length > 0;
    if (v && typeof v === 'object') return Object.values(v).some(ligada);
    return false;
}
/** Permissões-base que FALTAM ao agente para a célula (modulo, acao). [] = pronto. */
function faltamParaCelula(permissoes, modulo, acao) {
    const m = moduloPorChave(modulo);
    if (!m) return [];
    return m.permissoesBase
        .filter((p) => !p.acoes || p.acoes.includes(acao))
        .filter((p) => !ligada(valorNoCaminho(permissoes || {}, p.chave)))
        .map((p) => ({ chave: p.chave, rotulo: p.rotulo }));
}

module.exports = {
    ACOES, ROTULO_ACAO, MODULOS, NIVEL_PARA_TELA, TELA_PARA_NIVEL, MODULOS_CRIAR_SIM,
    moduloPorChave, moduloDaFamilia, lerChaveCelula, chaveCelula, nivelPadrao, faltamParaCelula, ligada, valorNoCaminho,
};
