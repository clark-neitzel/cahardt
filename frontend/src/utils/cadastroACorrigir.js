// Bloqueio de cadastro a corrigir (CPF com nome de uma palavra só).
// O backend devolve HTTP 403 { error, codigo:'CADASTRO_A_CORRIGIR', clienteId, clienteNome, motivos:[{tipo,campo,mensagem}] }
// ao criar/enviar pedido, criar amostra, aprovar/converter pedido da fila do site e emitir NF de venda.

// Devolve os dados do bloqueio (ou null se o erro não for esse).
export function erroCadastroACorrigir(error) {
    const r = error?.response;
    if (r?.status === 403 && r?.data?.codigo === 'CADASTRO_A_CORRIGIR') return r.data;
    return null;
}

// Texto legível (nunca "erro genérico") a partir do corpo do 403.
export function mensagemCadastroACorrigir(dados) {
    if (!dados) return '';
    const motivos = Array.isArray(dados.motivos) ? dados.motivos.map(m => m?.mensagem).filter(Boolean) : [];
    if (motivos.length) return motivos.join(' ');
    return dados.error || 'O cadastro deste cliente precisa ser corrigido antes de continuar.';
}
