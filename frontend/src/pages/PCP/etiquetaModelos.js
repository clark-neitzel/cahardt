// ─── Modelos de etiqueta (fonte única) ────────────────────────────────────────
// Dois tamanhos de rolo: o clássico 80×100 (em produção) e o novo ANVISA 100×120
// com selos de advertência "ALTO EM". O usuário escolhe qual usar porque ainda
// tem rolo do tamanho antigo.

// ── DUAS DIMENSÕES INDEPENDENTES (desde 08/2026) ──────────────────────────────
// Tamanho (rolo físico na impressora) e Layout (visual do rótulo) são escolhidos
// SEPARADAMENTE, para imprimir qualquer combinação: Clássico ou ANVISA, cada um
// em 80×100 ou 100×120. O tamanho controla a folha (@page) e as dimensões do
// rótulo; o layout controla o desenho (com ou sem selos "ALTO EM").
export const TAMANHOS = {
    p80:  { id: 'p80',  larguraMM: 80,  alturaMM: 100, label: '80 × 100' },
    g120: { id: 'g120', larguraMM: 100, alturaMM: 120, label: '100 × 120' },
};
export const TAMANHO_PADRAO = 'p80'; // rolo atual/clássico — default seguro

export const LAYOUTS = {
    classico: { id: 'classico', comSelos: false, label: 'Clássico' },
    anvisa:   { id: 'anvisa',   comSelos: true,  label: 'ANVISA'   },
};
export const LAYOUT_PADRAO = 'classico';

// Normaliza um layout salvo/legado para uma chave válida de LAYOUTS.
// (o localStorage antigo guardava 'classico' | 'anvisa120' na chave 'etiquetas:modelo')
export function layoutValido(v) {
    if (LAYOUTS[v]) return v;
    if (v === 'anvisa120') return 'anvisa';
    return LAYOUT_PADRAO;
}

// Legado — mantido para não quebrar código/imports antigos (id → dimensões).
// Combina tamanho+layout do jeito antigo; novos chamadores usam TAMANHOS/LAYOUTS.
export const MODELOS = {
    classico:  { id: 'classico',  nome: 'Clássico 80×100',  larguraMM: 80,  alturaMM: 100, comSelos: false },
    anvisa120: { id: 'anvisa120', nome: 'ANVISA 100×120',   larguraMM: 100, alturaMM: 120, comSelos: true  },
};

export const MODELO_PADRAO = 'classico';

// SKU do catálogo tem prioridade; cai para o código interno se não vinculado
export const codExibir = (et) => et.produto?.codigo || et.codigoProduto;

// Validade em dias: a do produto do catálogo manda (fonte única); cai na da etiqueta se não houver
export const validadeDias = (et) => et.produto?.validadeDias ?? et.validadeDias ?? 90;

// Lista oficial de alérgenos (RDC 26/2015 / IN 75/2020) para os checks do formulário
export const ALERGENOS_LISTA = [
    'Trigo', 'Centeio', 'Cevada', 'Aveia',
    'Crustáceos', 'Ovos', 'Peixes', 'Amendoim', 'Soja', 'Leite',
    'Amêndoa', 'Avelã', 'Castanha-de-caju', 'Castanha-do-pará',
    'Macadâmia', 'Nozes', 'Pecã', 'Pistache', 'Pinoli', 'Castanhas',
    'Látex natural',
];

// ─── Parsers de valores nutricionais ──────────────────────────────────────────
// Valores armazenados como "34kcal (2% VD)", "5,7g (2% VD)", "147mg (6% VD)"

export function parseValor(str) {
    if (!str) return null;
    const m = String(str).replace(',', '.').match(/-?[\d.]+/);
    return m ? parseFloat(m[0]) : null;
}

export function parseVD(str) {
    if (!str) return '0';
    const m = String(str).match(/(\d+)\s*%/);
    return m ? m[1] : '0';
}

export function fmtNum(n, dec) {
    if (n === null || n === undefined || isNaN(n)) return '0';
    const f = Math.pow(10, dec);
    const r = Math.round(n * f) / f;
    return String(r).replace('.', ',');
}

// Peso líquido = quantidade da embalagem × peso unitário (kg se ≥ 1000g)
export function pesoLiquidoStr(et) {
    const g = (Number(et.quantidadeEmbalagem) || 0) * (Number(et.pesoUnitario) || 0);
    if (g <= 0) return '';
    if (g >= 1000) {
        const kg = Math.round((g / 1000) * 100) / 100;
        return `${String(kg).replace('.', ',')} kg`;
    }
    return `${g} g`;
}

// Peso da porção usado na tabela nutricional (peso da tabela → peso unitário)
export function pesoTabela(et) {
    return Number(et.pesoTabelaNutricional) || Number(et.pesoUnitario) || 0;
}

// Linhas da tabela nutricional (mesma lógica do modelo clássico) — dec = casas
// decimais, indent = nível de recuo, always = mostra mesmo com valor vazio.
export function linhasNutricionais(et) {
    return [
        { label: 'Valor Energético (kcal)',   raw: et.valorEnergetico,      dec: 0, indent: 0 },
        { label: 'Carboidratos totais (g)',   raw: et.carboidratos,         dec: 1, indent: 0 },
        { label: 'Açúcares totais (g)',       raw: et.acucaresTotais,       dec: 1, indent: 1, always: true },
        { label: 'Açúcares adicionados (g)',  raw: et.acucaresAdicionados,  dec: 1, indent: 2, always: true },
        { label: 'Proteínas (g)',             raw: et.proteinas,            dec: 1, indent: 0 },
        { label: 'Gorduras totais (g)',       raw: et.gordurasTotais,       dec: 1, indent: 0 },
        { label: 'Gorduras saturadas (g)',    raw: et.gordurasSaturadas,    dec: 1, indent: 1 },
        { label: 'Gorduras trans (g)',        raw: et.gordurasTrans,        dec: 1, indent: 1 },
        { label: 'Fibras alimentares (g)',    raw: et.fibraAlimentar,       dec: 1, indent: 0 },
        { label: 'Sódio (mg)',                raw: et.sodio,                dec: 0, indent: 0 },
    ].filter(r => r.always || r.raw);
}

// ─── Selos de advertência ANVISA ("ALTO EM") ──────────────────────────────────
// Calculados pela coluna 100 g: por100 = valor_da_porção / peso_da_porção × 100.
// Limites (RDC 429/2020 · IN 75/2020) para produto SÓLIDO:
//   açúcar adicionado ≥ 15 g/100 g · gordura saturada ≥ 6 g/100 g · sódio ≥ 600 mg/100 g
// Sem peso válido ou sem valor do nutriente → aquele selo NÃO é gerado
// (sem divisão por zero, sem "undefined").
export function selosAnvisa(et) {
    const peso = pesoTabela(et);
    if (!(peso > 0)) return [];
    const selos = [];
    const avaliar = (raw, limite, chave, rotulo) => {
        const v = parseValor(raw);
        if (v === null || isNaN(v)) return;
        const por100 = (v / peso) * 100;
        if (por100 >= limite) selos.push({ chave, rotulo });
    };
    avaliar(et.acucaresAdicionados, 15,  'ACUCAR',   'AÇÚCAR ADICIONADO');
    avaliar(et.gordurasSaturadas,   6,   'GORD_SAT', 'GORDURA SATURADA');
    avaliar(et.sodio,               600, 'SODIO',    'SÓDIO');
    return selos;
}
