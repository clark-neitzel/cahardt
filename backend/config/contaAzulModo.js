// ============================================================================
// MODO DO CONTA AZUL — desde 23/07/2026 o app é o dono do financeiro.
//
// O CA bloqueou a emissão de NF-e e a empresa está saindo dele. Com esta chave
// ligada, NADA mais é cadastrado no Conta Azul pelo lado de vendas/recebimentos:
//   - pedidos NÃO são enviados como venda (faturam localmente, número gerado aqui)
//   - baixas de boleto/PIX Asaas, do Caixa e de devoluções fecham SÓ no app
//   - produto novo não é criado no CA
// A LEITURA continua liberada (importação do histórico, XML de notas antigas,
// sync de baixas de contas antigas que ainda vivem lá). Contas a PAGAR/DDA têm
// fluxo próprio e não passam por esta chave.
//
// Para religar o envio ao CA (improvável), mudar para false e publicar.
// ============================================================================
module.exports = { CA_SOMENTE_LEITURA: true };
