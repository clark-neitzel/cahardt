// Sugestão de tipo (normal/especial) vinda do histórico do cliente — tudo opcional
// (pedidos antigos/outros status não trazem o campo).
export function tipoSugerido(p) {
  return p?.sugestaoTipo === 'ESPECIAL' ? 'ESPECIAL' : 'NORMAL';
}

export function textoSugestao(p) {
  const h = p?.historicoTipos;
  if (!h || !(h.total > 0)) return '';
  if (h.motivo === 'CONDICAO_NAO_PERMITE') {
    return 'Últimos pedidos foram especiais, mas a condição de pagamento deste pedido não permite especial.';
  }
  if (p.sugestaoTipo === 'ESPECIAL') {
    return `Sugerido pelo histórico: ${h.especiais ?? 0} dos últimos ${h.total} pedidos foram especiais.`;
  }
  return '';
}

// Selos para o card/detalhe (mesmo formato dos selos de LinhaPedidoOnline)
export function selosSugestao(p) {
  const h = p?.historicoTipos;
  if (h?.motivo === 'CONDICAO_NAO_PERMITE') {
    return [{ texto: 'Histórico especial · condição não permite', cls: 'bg-amber-100 text-amber-700' }];
  }
  if (p?.sugestaoTipo === 'ESPECIAL') {
    return [{ texto: 'Costuma pedir especial', cls: 'bg-purple-100 text-purple-700' }];
  }
  return [];
}
