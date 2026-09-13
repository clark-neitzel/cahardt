// Paletas do Mapa de Clientes.
// - Dias da semana: cor FIXA (o vendedor decora "TER é laranja"); #00754A fica
//   reservado para ação, não entra como cor de dado.
// - Categoria / vendedor / cidade: paleta rotativa (mesma CORES do MapaExpedicao,
//   sem o verde primário) na ordem alfabética dos valores.
// - WhatsApp: verde/vermelho — mesma semântica dos badges de status do sistema.
// - Sem valor: cinza.

export const COR_DIA = {
    SEG: '#2563eb', // azul
    TER: '#ea580c', // laranja
    QUA: '#7c3aed', // roxo
    QUI: '#0891b2', // ciano
    SEX: '#db2777', // rosa
    SAB: '#ca8a04', // mostarda
    DOM: '#65a30d', // lima
    'N/D': '#6b7280', // cinza
};

export const CORES_ROTATIVAS = ['#2563eb', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#dc2626', '#65a30d', '#9333ea', '#0d9488', '#b45309', '#4f46e5', '#be123c'];

export const COR_SEM_VALOR = '#6b7280';
export const COR_OCULTO = '#d1d5db'; // fatia de valor desligado na legenda (esmaecida)
export const COR_WHATSAPP = { sim: '#16a34a', nao: '#dc2626' };
export const COR_SELECAO = '#cba258'; // dourado — só destaque

export const SEM_VALOR = '__sem__';

export const OPCOES_COLORIR = [
    { valor: 'diaEntrega', label: 'Dia de entrega' },
    { valor: 'diaVenda', label: 'Dia de venda' },
    { valor: 'categoria', label: 'Categoria' },
    { valor: 'vendedor', label: 'Vendedor' },
    { valor: 'whatsapp', label: 'WhatsApp' },
    { valor: 'cidade', label: 'Cidade' },
];

export const ROTULO_SEM_VALOR = {
    diaEntrega: 'Sem dia de entrega',
    diaVenda: 'Sem dia de venda',
    categoria: 'Sem categoria',
    vendedor: 'Sem vendedor',
    whatsapp: 'Sem WhatsApp',
    cidade: 'Sem cidade',
};

// Dias REAIS (sem 'N/D'): em toda a tela — legenda, chips, paradas — 'N/D' conta
// como "sem dia", nunca como um dia.
export const diasReais = (dias) => (dias || []).filter(d => d && d !== 'N/D');

// Valores (chaves) de um cliente para o critério escolhido. Dias devolvem 1..N
// chaves (o pino vira fatias); os demais devolvem exatamente 1.
export function chavesDoCliente(c, colorirPor) {
    switch (colorirPor) {
        case 'diaEntrega': { const d = diasReais(c.diasEntrega); return d.length ? d : [SEM_VALOR]; }
        case 'diaVenda': { const d = diasReais(c.diasVenda); return d.length ? d : [SEM_VALOR]; }
        case 'categoria': return [c.categoriaId || SEM_VALOR];
        case 'vendedor': return [c.vendedorId || SEM_VALOR];
        case 'whatsapp': return [c.whatsapp?.temNumero ? 'sim' : 'nao'];
        case 'cidade': return [c.cidade || SEM_VALOR];
        default: return [SEM_VALOR];
    }
}

// Rótulo legível de uma chave (para legenda e cartões)
export function rotuloDaChave(chave, colorirPor, c) {
    if (chave === SEM_VALOR) return ROTULO_SEM_VALOR[colorirPor] || 'Sem valor';
    switch (colorirPor) {
        case 'categoria': return c?.categoriaNome || 'Categoria';
        case 'vendedor': return c?.vendedorNome ? `${c.vendedorNome}${c.vendedorAtivo === false ? ' (inativo)' : ''}` : 'Vendedor';
        case 'whatsapp': return chave === 'sim' ? 'Tem WhatsApp' : 'Sem WhatsApp';
        default: return String(chave);
    }
}

// Cor de uma chave. `indice` = posição alfabética (para a paleta rotativa).
export function corDaChave(chave, colorirPor, indice = 0) {
    if (chave === SEM_VALOR) return COR_SEM_VALOR;
    if (colorirPor === 'diaEntrega' || colorirPor === 'diaVenda') return COR_DIA[chave] || COR_SEM_VALOR;
    if (colorirPor === 'whatsapp') return chave === 'sim' ? COR_WHATSAPP.sim : COR_WHATSAPP.nao;
    return CORES_ROTATIVAS[indice % CORES_ROTATIVAS.length];
}
