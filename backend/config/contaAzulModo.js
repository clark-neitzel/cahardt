// ============================================================================
// MODO DO CONTA AZUL — desde 23/07/2026 o app é o dono do financeiro.
//
// O CA bloqueou a emissão de NF-e e a empresa está saindo dele (plano de remoção
// completa em docs/plano-remocao-conta-azul.md, 09/2026). Com esta chave ligada,
// NADA mais é cadastrado no Conta Azul pelo lado de vendas/recebimentos/pagamentos:
//   - pedidos NÃO são enviados como venda (faturam localmente, número gerado aqui)
//   - baixas de boleto/PIX Asaas, do Caixa e de devoluções fecham SÓ no app
//   - produto novo não é criado no CA
//   - Contas a Pagar TAMBÉM passa por esta chave: fornecedor/despesa/baixa "já
//     paguei" não são mais enviados (contasPagarCaSyncService.js) — ao contrário
//     do que este comentário dizia antes, não é um fluxo à parte.
// A LEITURA continua liberada (importação do histórico, XML de notas antigas,
// conferência de baixas de títulos antigos que ainda vivem só no CA).
//
// Para religar o envio ao CA (improvável — a Fase 1 da remoção já apagou o código
// de envio morto de syncPedidosService.js e contasPagarCaSyncService.js), mudar
// para false NÃO é mais suficiente: o código de envio precisaria ser reescrito.
// ============================================================================
module.exports = { CA_SOMENTE_LEITURA: true };
