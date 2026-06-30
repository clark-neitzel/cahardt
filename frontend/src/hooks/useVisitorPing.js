import { useEffect, useRef } from 'react';
import { API_URL } from '../services/api';

function getSessionId() {
  let id = localStorage.getItem('_vsid');
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('_vsid', id);
  }
  return id;
}

// Envia heartbeat a cada 30s para o rastreio de visitantes online.
// pagina: 'inicio' | 'congelados' | 'kit-festa'
// temCarrinho: boolean — se há itens no carrinho
export function useVisitorPing(pagina, temCarrinho = false) {
  const carritoRef = useRef(temCarrinho);
  useEffect(() => { carritoRef.current = temCarrinho; }, [temCarrinho]);

  useEffect(() => {
    const sessionId = getSessionId();
    const send = () => {
      fetch(`${API_URL}/api/visitors/ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, pagina, temCarrinho: carritoRef.current }),
        keepalive: true,
      }).catch(() => {});
    };
    send();
    const id = setInterval(send, 30_000);
    return () => clearInterval(id);
  }, [pagina]);
}
