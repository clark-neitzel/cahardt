/**
 * Normalização da forma de pagamento (Fase 0 Contabilidade).
 *
 * Baixas antigas espelhadas do Conta Azul gravaram a forma com o valor colado
 * ("À vista - Dinheiro: R$ 250,36") ou com o enum cru do CA ("BOLETO_BANCARIO").
 * Para o relatório contábil agrupar por forma, tudo converge para os rótulos
 * canônicos que o app já usa (mapMetodoCA / telas de baixa):
 *   Dinheiro · Pix · Boleto · Cheque · Cartão Crédito · Cartão Débito ·
 *   Transferência · Outro   (+ "PIX Asaas"/"Boleto Asaas", que são preservados)
 *
 * Regra: se não reconhecer, devolve o texto limpo (sem a parte "R$ …"), nunca null
 * para entrada não-vazia — melhor mostrar o original que esconder.
 */

const CANONICAS = [
    'Dinheiro', 'Pix', 'Boleto', 'Cheque', 'Cartão Crédito', 'Cartão Débito',
    'Transferência', 'Outro', 'PIX Asaas', 'Boleto Asaas'
];

// Enums crus do CA que vazaram para o banco antes do mapa ficar completo.
// Conferidos ANTES das heurísticas por palavra (senão DEBITO_AUTOMATICO viraria
// "Cartão Débito"). Mesmo dicionário do mapMetodoCA dos syncs.
const ENUMS_CA = {
    DINHEIRO: 'Dinheiro', BOLETO: 'Boleto', BOLETO_BANCARIO: 'Boleto',
    PIX: 'Pix', PIX_PAGAMENTO_INSTANTANEO: 'Pix',
    CARTAO_CREDITO: 'Cartão Crédito', CARTAO_DEBITO: 'Cartão Débito',
    TRANSFERENCIA_BANCARIA: 'Transferência', DEPOSITO_BANCARIO: 'Depósito',
    CHEQUE: 'Cheque', DEBITO_AUTOMATICO: 'Débito Automático', OUTRO: 'Outro'
};

function normalizarFormaPagamento(valor) {
    if (valor == null) return null;
    let s = String(valor).trim();
    if (!s) return null;

    // Já é canônica? Não mexe (preserva "PIX Asaas"/"Boleto Asaas").
    const exata = CANONICAS.find((c) => c.toLowerCase() === s.toLowerCase());
    if (exata) return exata;

    // Enum cru do CA ("PIX_PAGAMENTO_INSTANTANEO") — dicionário antes das heurísticas
    if (ENUMS_CA[s.toUpperCase()]) return ENUMS_CA[s.toUpperCase()];

    // Tira o valor colado ("…: R$ 250,36" ou "… R$ 250,36") e prefixos de condição.
    s = s.replace(/[:\s]*R\$\s*[\d.,]+.*$/i, '').trim();
    s = s.replace(/^(à\s*vista|a\s*vista|a\s*prazo|prazo)\s*[-–—:]?\s*/i, '').trim();
    s = s.replace(/[-–—:]\s*$/, '').trim();

    const low = s.toLowerCase();
    if (/asaas/.test(low)) return /boleto/.test(low) ? 'Boleto Asaas' : 'PIX Asaas';
    if (/dinheiro|espécie|especie/.test(low)) return 'Dinheiro';
    if (/pix/.test(low)) return 'Pix';
    if (/boleto/.test(low)) return 'Boleto';
    if (/cheque/.test(low)) return 'Cheque';
    if (/cr[eé]dito/.test(low)) return 'Cartão Crédito';
    if (/d[eé]bito/.test(low)) return 'Cartão Débito';
    if (/transfer|ted|doc|dep[oó]sito/.test(low)) return 'Transferência';
    if (/outro/.test(low)) return 'Outro';

    return s || String(valor).trim();
}

module.exports = { normalizarFormaPagamento, FORMAS_CANONICAS: CANONICAS };
