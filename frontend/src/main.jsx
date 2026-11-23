import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { redeViva } from './utils/redeViva'
import { garantirOffline } from './utils/garantirOffline'
import { WifiOff, RefreshCw } from 'lucide-react'

// Erro de "arquivo da tela sumiu" — acontece quando a aba ficou aberta durante um
// deploy: o index.html velho aponta para pedaços de JS que o servidor já trocou.
// Não é bug do app; a saída certa é recarregar (uma vez só, para não entrar em laço).
const CHAVE_TRAVA_CHUNK = 'hardt:recarregou-por-chunk';

function ehErroDeChunk(error) {
  const msg = String(error?.message || error || '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk \d+ failed/i.test(msg);
}

let recarregandoPorChunk = false;
function recarregarPorChunk(aoNaoRecarregar) {
  // Sem internet (ex.: câmara fria): recarregar apagaria a casca offline do app (Separação de Carga).
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (sessionStorage.getItem(CHAVE_TRAVA_CHUNK) === '1') return false;
  if (recarregandoPorChunk) return true;
  recarregandoPorChunk = true;

  // navigator.onLine mente (Wi-Fi sem saída): confirma a rede de verdade antes de apagar cache e recarregar.
  redeViva().then((viva) => {
    if (!viva) {
      recarregandoPorChunk = false;
      if (aoNaoRecarregar) aoNaoRecarregar();
      return;
    }
    sessionStorage.setItem(CHAVE_TRAVA_CHUNK, '1');
    // Limpa o cache do service worker antes de recarregar, para não voltar na casca antiga.
    const limpeza = typeof caches !== 'undefined'
      ? caches.keys().then((nomes) => Promise.all(nomes.map((n) => caches.delete(n))))
      : Promise.resolve();
    limpeza.catch(() => { }).finally(() => window.location.reload());
  });
  return true;
}

// Emergency Error Boundary
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, recarregando: false, semConexao: false };
  }

  static getDerivedStateFromError(error) {
    if (ehErroDeChunk(error)) return { hasError: false, recarregando: true };
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    if (ehErroDeChunk(error)) {
      // Sem rede de verdade a tela falhou por falta de internet, não por deploy: mostra "Sem conexão" com botão
      // (no PWA do iPhone não há como recarregar). Online de verdade o fluxo antigo (limpa cache + recarrega 1x) segue.
      const semRede = () => this.setState({ semConexao: true, recarregando: false });
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { semRede(); return; }
      if (recarregarPorChunk(semRede)) return;
      this.setState({ hasError: true, error, errorInfo, recarregando: false });
      return;
    }
    this.setState({ error, errorInfo });
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.semConexao) {
      return (
        <div className="min-h-screen bg-secondary flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 w-full max-w-sm text-center">
            <div className="bg-mint p-3 rounded-full inline-flex mb-4">
              <WifiOff className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 mb-2">Sem conexão</h1>
            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              Esta tela ainda não está guardada neste aparelho. Abra o app uma vez com internet para poder usá-la sem sinal. Você continua logado.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full min-h-[44px] px-4 py-3 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm inline-flex items-center justify-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }

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

  // OFFLINE GARANTIDO: com rede de verdade, pede ao service worker para conferir/repor a casca do app no cache
  // (index.html + arquivos das telas offline). Roda: ao abrir, ao a internet voltar e ao voltar para o app —
  // no máximo a cada ~10 min, sem competir com o carregamento inicial. Falha é silenciosa. Cobre também o caso
  // do recarregamento por deploy novo (recarregarPorChunk apaga os caches e recarrega; aqui eles são repostos).
  // Ver frontend/public/sw.js e frontend/src/utils/garantirOffline.js.
  const INTERVALO_GARANTIA_MS = 10 * 60 * 1000;
  let ultimaGarantia = 0;
  let garantindo = false;
  const agendarGarantia = (forcar) => {
    if (garantindo) return;
    if (!forcar && Date.now() - ultimaGarantia < INTERVALO_GARANTIA_MS) return;
    garantindo = true;
    const rodar = async () => {
      try {
        if (!(await redeViva())) return;
        await navigator.serviceWorker.ready;
        const r = await garantirOffline();
        if (r.ok) ultimaGarantia = Date.now();
      } catch { /* silencioso */ } finally { garantindo = false; }
    };
    const ocioso = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    ocioso(rodar, { timeout: 5000 });
  };
  window.addEventListener('load', () => setTimeout(() => agendarGarantia(true), 2500));
  window.addEventListener('online', () => agendarGarantia(false));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') agendarGarantia(false);
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
