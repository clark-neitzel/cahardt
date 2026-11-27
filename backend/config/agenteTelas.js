// "Para onde o dono vai conferir" uma solicitação do agente: chave/família -> rota do app (frontend/src/App.jsx).
// Sem deep link por id na v1: leva à tela certa; só Fornecedores aceita `?busca=` (ver FornecedoresPage).
// Desconhecida -> null (a tela mostra só o resumo).
const POR_FAMILIA = {
    '/api/contas-pagar': { rota: '/contas-pagar', rotulo: 'Contas a Pagar' },
    '/api/anexos': { rota: '/contas-pagar', rotulo: 'Contas a Pagar' },
    '/api/contas-receber': { rota: '/financeiro/contas-receber/tabela', rotulo: 'Contas a Receber' },
    '/api/fornecedores': { rota: '/fornecedores', rotulo: 'Fornecedores' },
    '/api/notas-entrada': { rota: '/notas-recebidas', rotulo: 'Notas Recebidas' },
    '/api/conciliacao-bancaria': { rota: '/financeiro/conciliacao', rotulo: 'Conciliação Bancária' },
    '/api/financeiro-gerencial': { rota: '/financeiro/dashboard', rotulo: 'Financeiro' },
    '/api/contas-financeiras': { rota: '/financeiro/por-conta', rotulo: 'Bancos e Caixas' },
    '/api/categorias-estoque': { rota: '/config/categorias-estoque', rotulo: 'Categorias de Estoque' },
    '/api/pcp/itens': { rota: '/pcp/itens', rotulo: 'Itens do PCP' },
    '/api/pcp/receitas': { rota: '/pcp/receitas', rotulo: 'Receitas' },
    '/api/pcp/estoque': { rota: '/pcp/estoque', rotulo: 'Estoque PCP' },
    '/api/produtos': { rota: '/admin/produtos', rotulo: 'Produtos' },
    '/api/estoque': { rota: '/estoque', rotulo: 'Estoque' },
    '/api/pedidos': { rota: '/pedidos', rotulo: 'Pedidos' },
    '/api/clientes': { rota: '/clientes', rotulo: 'Clientes' },
    '/api/caixa': { rota: '/caixa', rotulo: 'Caixa' },
    '/api/embarques': { rota: '/admin/embarques', rotulo: 'Embarque' },
    '/api/entregas': { rota: '/entregas', rotulo: 'Entregas' },
    '/api/indicadores-gestao': { rota: '/indicadores-gestao', rotulo: 'Indicadores de Gestão' },
};

function textoCurto(v) {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t ? t.slice(0, 80) : null;
}

/** `{ rota, rotulo } | null`. `familia` vem do catálogo; `body` (já redigido) só ajuda a montar `?busca=`. */
function telaDestino(familia, body) {
    const t = POR_FAMILIA[String(familia || '').toLowerCase()];
    if (!t) return null;
    if (t.rota === '/fornecedores') {
        const b = body && typeof body === 'object' ? body : {};
        const busca = textoCurto(b.razaoSocial) || textoCurto(b.nomeFantasia) || textoCurto(b.nome) || textoCurto(b.cnpjCpf);
        if (busca) return { rota: `/fornecedores?busca=${encodeURIComponent(busca)}`, rotulo: t.rotulo };
    }
    return { ...t };
}

module.exports = { telaDestino, POR_FAMILIA };
