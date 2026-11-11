// Número do pedido como aparece na tela: #N (normal) · ZZ#N (especial) · BN#N (bonificação).
// Pedido recém-criado pode ainda não ter número (rascunho) — nunca interpolar null direto (vira "#null").
export const fmtNumero = (pedido) => (pedido.numero == null
    ? '(rascunho)'
    : pedido.bonificacao ? `BN#${pedido.numero}` : pedido.especial ? `ZZ#${pedido.numero}` : `#${pedido.numero}`);

export default fmtNumero;
