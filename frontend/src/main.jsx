import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Erro de "arquivo da tela sumiu" — acontece quando a aba ficou aberta durante um
// deploy: o index.html velho aponta para pedaços de JS que o servidor já trocou.
// Não é bug do app; a saída certa é recarregar (uma vez só, para não entrar em laço).
const CHAVE_TRAVA_CHUNK = 'hardt:recarregou-por-chunk';

function ehErroDeChunk(error) {
  const msg = String(error?.message || error || '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk \d+ failed/i.test(msg);
}

function recarregarPorChunk() {
  if (sessionStorage.getItem(CHAVE_TRAVA_CHUNK) === '1') return false;
  sessionStorage.setItem(CHAVE_TRAVA_CHUNK, '1');

  // Limpa o cache do service worker antes de recarregar, para não voltar na casca antiga.
  const limpeza = typeof caches !== 'undefined'
    ? caches.keys().then((nomes) => Promise.all(nomes.map((n) => caches.delete(n))))
    : Promise.resolve();

  limpeza.catch(() => { }).finally(() => window.location.reload());
  return true;
}

// Emergency Error Boundary
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, recarregando: false };
  }

  static getDerivedStateFromError(error) {
    if (ehErroDeChunk(error)) return { hasError: false, recarregando: true };
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    if (ehErroDeChunk(error)) {
      if (recarregarPorChunk()) return;
      this.setState({ hasError: true, error, errorInfo, recarregando: false });
      return;
    }
    this.setState({ error, errorInfo });
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.recarregando) {
      return (
        <div style={{ padding: 32, textAlign: 'center', color: '#555', fontFamily: 'system-ui, sans-serif' }}>
          Atualizando o app...
        </div>
      );
    }

    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, fontFamily: 'monospace', color: 'red', whiteSpace: 'pre-wrap' }}>
          <h1>Algo deu errado.</h1>
          <h3>{this.state.error && this.state.error.toString()}</h3>
          <p>{this.state.errorInfo && this.state.errorInfo.componentStack}</p>
        </div>
      );
    }

    return this.props.children;
  }
}

// Global Error Handler for non-React errors
window.onerror = function (message, source, lineno, colno, error) {
  if (ehErroDeChunk(error || message)) {
    recarregarPorChunk();
    return;
  }
  document.body.innerHTML += `<div style="color:red;padding:20px;border:1px solid red;margin:20px;">
    <h3>Global Error: ${message}</h3>
    <p>${source}:${lineno}:${colno}</p>
    <pre>${error ? error.stack : ''}</pre>
  </div>`;
};

// Promise rejeitada sem catch (ex.: import dinâmico de um service dentro de um handler).
window.addEventListener('unhandledrejection', (evento) => {
  if (ehErroDeChunk(evento.reason)) {
    evento.preventDefault();
    recarregarPorChunk();
  }
});

// Service worker: no iPhone o app roda como atalho (standalone), sem barra de
// endereço nem botão de recarregar. Sem ele, uma falha de rede na abertura deixa
// o usuário preso no erro do Safari. Ver frontend/public/sw.js.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Falha ao registrar o service worker:', err);
    });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
