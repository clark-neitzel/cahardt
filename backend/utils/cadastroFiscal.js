// Cadastro fiscal do cliente — o que a NF-e exige para o destinatário.
//
// Fonte única da regra que antes vivia SÓ dentro de `montarNotaVenda`
// (focusNfeEmissaoService.js). Extraída em 09/2026 porque a bonificação COM NOTA
// precisa saber ANTES (na criação do pedido e na lista de clientes) se o cadastro
// dá para emitir — em vez de o vendedor descobrir dias depois, com a nota travada
// no Financeiro.
//
// ⚠️ As mensagens de erro da emissão NÃO mudaram: `mensagemCadastroIncompleto`
// devolve exatamente o texto que o usuário já conhece desde 07/2026.
//
// Dois vocabulários de propósito:
//   - ROTULOS_EMISSAO  → texto da emissão de NF-e ("endereço (rua)", "número"…)
//   - camposFaltandoParaNota → rótulos curtos para tela/API ("CNPJ/CPF", "bairro"…)

/** CPF/CNPJ do cadastro sem pontuação, em maiúsculas (CNPJ alfanumérico — NT 2026.004). */
function documentoNormalizado(cliente) {
    return String(cliente?.Documento || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

/** Documento de 11 dígitos = CPF (pessoa física). */
function ehCPFDoc(doc) {
    return /^\d{11}$/.test(String(doc || ''));
}

// Campos de endereço exigidos, na ordem em que sempre apareceram na mensagem da emissão.
const CAMPOS_ENDERECO = [
    { campo: 'End_Logradouro', emissao: 'endereço (rua)', curto: 'endereço' },
    { campo: 'End_Numero', emissao: 'número', curto: 'número' },
    { campo: 'End_Bairro', emissao: 'bairro', curto: 'bairro' },
    { campo: 'End_Cidade', emissao: 'cidade', curto: 'cidade' },
    { campo: 'End_Estado', emissao: 'UF', curto: 'UF' },
    { campo: 'End_CEP', emissao: 'CEP', curto: 'CEP' },
];

/** Endereço: rótulos NA LINGUAGEM DA EMISSÃO (usado por `montarNotaVenda`). */
function camposEnderecoFaltando(cliente) {
    return CAMPOS_ENDERECO.filter(c => !cliente?.[c.campo]).map(c => c.emissao);
}

/**
 * O que falta no cadastro para este cliente poder RECEBER nota.
 * `[]` = apto. Rótulos curtos, prontos para a tela ("CNPJ/CPF", "bairro", "CEP").
 */
function camposFaltandoParaNota(cliente) {
    const faltando = [];
    if (!documentoNormalizado(cliente)) faltando.push('CNPJ/CPF');
    faltando.push(...CAMPOS_ENDERECO.filter(c => !cliente?.[c.campo]).map(c => c.curto));
    return faltando;
}

/** Atalho booleano. */
function aptoParaNota(cliente) {
    return camposFaltandoParaNota(cliente).length === 0;
}

/** `{ ok, faltando }` — formato que a API de clientes devolve por cliente. */
function fiscalApto(cliente) {
    const faltando = camposFaltandoParaNota(cliente);
    return { ok: faltando.length === 0, faltando };
}

/**
 * Mensagem AMIGÁVEL da emissão de NF-e — `null` quando o cadastro está completo.
 * TEXTO IDÊNTICO ao que a emissão devolve desde 07/2026: não mudar sem avisar o
 * usuário, ele já conhece essas duas frases.
 */
function mensagemCadastroIncompleto(cliente) {
    if (!documentoNormalizado(cliente)) {
        return `Cliente "${cliente?.Nome}" sem CPF/CNPJ no cadastro — preencha para emitir a nota.`;
    }
    const faltando = camposEnderecoFaltando(cliente);
    if (faltando.length) {
        return `Cliente "${cliente?.Nome}" com cadastro incompleto para a nota: falta ${faltando.join(', ')}.`;
    }
    return null;
}

module.exports = {
    documentoNormalizado,
    ehCPFDoc,
    camposEnderecoFaltando,
    camposFaltandoParaNota,
    aptoParaNota,
    fiscalApto,
    mensagemCadastroIncompleto,
};
