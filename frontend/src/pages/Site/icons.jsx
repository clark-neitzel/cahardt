import React from 'react';

// Conjunto mínimo de ícones (stroke, grid 24) — espelha order-icons do protótipo.
const I = {
  search: "M21 21l-4.3-4.3 M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z",
  plus: "M12 5v14 M5 12h14",
  minus: "M5 12h14",
  chevRight: "M9 6l6 6-6 6",
  check: "M20 6L9 17l-5-5",
  trash: "M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6",
  cart: "M6 6h15l-1.5 9h-12z M6 6L5 2H2 M9 20a1 1 0 1 0 0 2 1 1 0 0 0 0-2z M18 20a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  tag: "M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z M7 7h.01",
  refresh: "M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
};

export function Icon({ n, w = 18, sw = 2, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" width={w} height={w} fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {I[n].split(" M").map((d, i) => <path key={i} d={(i ? "M" : "") + d} />)}
    </svg>
  );
}

// Ícone cheio do WhatsApp (botão flutuante)
export function WhatsIcon({ w = 30 }) {
  return (
    <svg viewBox="0 0 32 32" width={w} height={w} fill="currentColor" aria-hidden="true">
      <path d="M16 3C9.4 3 4 8.4 4 15c0 2.1.6 4.1 1.6 5.9L4 29l8.3-1.6c1.7.9 3.6 1.4 5.7 1.4 6.6 0 12-5.4 12-12S22.6 3 16 3zm0 21.8c-1.8 0-3.5-.5-5-1.3l-.4-.2-3.7.7.7-3.6-.2-.4c-.9-1.6-1.4-3.4-1.4-5.3C6 9.9 10.5 5.5 16 5.5S26 9.9 26 15.4 21.5 24.8 16 24.8zm5.5-7c-.3-.2-1.8-.9-2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.1-.2.2-.3.2-.6.1-1.8-.9-3-1.6-4.2-3.6-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5-.1-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3 1.8.8 2.5.8 3.4.7.5-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.2-.6-.4z"/>
    </svg>
  );
}
