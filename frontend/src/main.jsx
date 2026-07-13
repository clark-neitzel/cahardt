import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Emergency Error Boundary
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
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
  document.body.innerHTML += `<div style="color:red;padding:20px;border:1px solid red;margin:20px;">
    <h3>Global Error: ${message}</h3>
    <p>${source}:${lineno}:${colno}</p>
    <pre>${error ? error.stack : ''}</pre>
  </div>`;
};

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
