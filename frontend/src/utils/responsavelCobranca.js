// ─────────────────────────────────────────────────────────────────────────────
// RESPONSÁVEL PELA COBRANÇA — papel, rótulo e cor (ponto único do frontend)
// ─────────────────────────────────────────────────────────────────────────────
// Desde 08/2026 a linha de pagamento da entrega guarda um PAPEL explícito em
// `responsavelPapel`: VENDEDOR | ESCRITORIO | MOTORISTA. A PESSOA continua em
// `vendedorResponsavelId` (vale para VENDEDOR e para MOTORISTA); `escritorioResponsavel`
// é a marcação legada do escritório.
//
// ⚠️ NUNCA monte o rótulo na mão com `if (vendedorResponsavelId) ... else if
// (escritorioResponsavel)`. Era assim que a tela fazia até 08/2026 — e como o checkout
// gravava o MOTORISTA na coluna do vendedor, toda dívida de motorista aparecia escrita
// como "Vendedor responsável" no caixa, no selo de Contas a Receber e no relatório.
//
// ⚠️ Também nunca leia `responsavelPapel` cru: as marcações gravadas ANTES de 08/2026
// têm o campo vazio e sumiriam da tela sem erro nenhum. Use `papelResponsavel`, que
// espelha exatamente a derivação do backend
// (backend/services/recebimentoEntregaService.js → `papelResponsavel`):
//   papel válido no campo vence → senão pessoa preenchida = VENDEDOR → senão
//   `escritorioResponsavel` = ESCRITORIO → senão não é linha de responsável.

export const PAPEIS_RESPONSAVEL = ['VENDEDOR', 'ESCRITORIO', 'MOTORISTA'];

// Rótulo longo — mesmo texto do backend (`ROTULO_RESPONSAVEL`).
export const ROTULO_PAPEL = {
    VENDEDOR: 'Vendedor responsável',
    ESCRITORIO: 'Escritório responsável',
    MOTORISTA: 'Motorista responsável'
};

// Rótulo curto — para badge/selo, onde o espaço é pouco (celular).
export const ROTULO_PAPEL_CURTO = {
    VENDEDOR: 'Vendedor',
    ESCRITORIO: 'Escritório',
    MOTORISTA: 'Motorista'
};

// Cor do selo — três baldes, três cores, sempre as mesmas em todas as telas.
// (Design system: azul/âmbar já eram vendedor/escritório; roxo entra para o motorista.)
export const CLASSE_PAPEL = {
    VENDEDOR: 'bg-blue-100 text-blue-800',
    ESCRITORIO: 'bg-amber-100 text-amber-700',
    MOTORISTA: 'bg-purple-100 text-purple-700'
};

/**
 * Papel da linha de pagamento: 'VENDEDOR' | 'ESCRITORIO' | 'MOTORISTA', ou `null`
 * quando a linha é recebimento de verdade (dinheiro/PIX/cartão que quita).
 */
export const papelResponsavel = (p) => {
    if (!p) return null;
    const papel = String(p.responsavelPapel || '').trim().toUpperCase();
    if (PAPEIS_RESPONSAVEL.includes(papel)) return papel;
    if (p.vendedorResponsavelId) return 'VENDEDOR';
    if (p.escritorioResponsavel) return 'ESCRITORIO';
    return null;
};

/** A linha é de responsável pela cobrança (ou seja: NÃO quita)? */
export const ehLinhaResponsavel = (p) => papelResponsavel(p) !== null;

/** Rótulo pronto ('Motorista responsável'…) ou `null` quando não é linha de responsável. */
export const rotuloResponsavel = (p, { curto = false } = {}) => {
    const papel = papelResponsavel(p);
    if (!papel) return null;
    return (curto ? ROTULO_PAPEL_CURTO : ROTULO_PAPEL)[papel];
};

/** Este papel aponta para uma PESSOA (VENDEDOR e MOTORISTA sim; ESCRITORIO não). */
export const papelExigePessoa = (papel) => papel === 'VENDEDOR' || papel === 'MOTORISTA';
