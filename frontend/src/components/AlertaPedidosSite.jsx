import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Megaphone, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import congeladosService from '../services/congeladosService';

const INTERVALO_MS = 15 * 60 * 1000; // 15 minutos
const DELAY_INICIAL_MS = 6000;        // não bloquear o carregamento inicial

const money = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
const haQuanto = (iso) => {
  if (!iso) return '';
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60); const r = min % 60;
  return `há ${h}h${r ? ` ${r}min` : ''}`;
};

// Bip de atenção (2 toques curtos) via Web Audio — sem precisar de arquivo.
function bip() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const toque = (freq, t0) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      o.start(t0); o.stop(t0 + 0.3);
    };
    toque(880, ctx.currentTime);
    toque(1175, ctx.currentTime + 0.2);
  } catch { /* navegador pode bloquear áudio antes de interação — ignora */ }
}

export default function AlertaPedidosSite() {
  const navigate = useNavigate();
  const [dados, setDados] = useState({ total: 0, kitFesta: [], congelados: [] });
  const [visivel, setVisivel] = useState(false);
  const dismissedRef = useRef(false);
  const visivelRef = useRef(false);
  useEffect(() => { visivelRef.current = visivel; }, [visivel]);

  const verificar = useCallback(async () => {
    try {
      const d = await congeladosService.pedidosNovos();
      if (d?.total > 0) {
        setDados(d);
        if (!dismissedRef.current && !visivelRef.current) { setVisivel(true); bip(); }
      } else {
        setDados({ total: 0, kitFesta: [], congelados: [] });
        setVisivel(false);
      }
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => {
    const t = setTimeout(verificar, DELAY_INICIAL_MS);
    const i = setInterval(() => { dismissedRef.current = false; verificar(); }, INTERVALO_MS);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [verificar]);

  const fechar = () => { dismissedRef.current = true; setVisivel(false); };
  const irPara = (rota) => { dismissedRef.current = true; setVisivel(false); navigate(rota); };

  if (!visivel || dados.total === 0) return null;
  const { kitFesta: kf, congelados: cg, total } = dados;

  const Linha = ({ it, cor }) => (
    <div className="flex items-center gap-2.5 border border-amber-200 bg-amber-50/60 rounded-lg px-3 py-2 mb-1.5">
      <span className={`text-[10px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded flex-none ${cor === 'kf' ? 'bg-pink-100 text-pink-700' : 'bg-sky-100 text-sky-700'}`}>
        {cor === 'kf' ? 'Kit Festa' : 'Congelados'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-gray-800 truncate">{it.nomeCliente}</div>
        <div className="text-xs text-gray-500">
          {haQuanto(it.createdAt)} · {it.totalCaixas} cx
          {it.encaixe && <> · <span className="text-orange-600 font-semibold">Encaixe</span></>}
          {it.status === 'PENDENTE_CADASTRO' && <> · <span className="text-orange-600 font-semibold">sem cadastro</span></>}
        </div>
      </div>
      <div className="text-right flex-none">
        <div className="text-sm font-bold text-gray-800">{money(it.total)}</div>
        <div className="text-xs text-gray-400">#{it.numero}</div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 flex items-center gap-3" style={{ background: 'linear-gradient(120deg,#f59e0b,#ea7a0c)' }}>
          <div className="bg-white/20 rounded-full p-2.5 flex-none"><Megaphone className="h-6 w-6 text-white" /></div>
          <div className="min-w-0">
            <h2 className="text-white font-extrabold text-lg leading-tight flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-white animate-pulse" /> Pedidos novos esperando!
            </h2>
            <p className="text-amber-50 text-sm">{total} pedido{total > 1 ? 's' : ''} do site aguardando aprovação</p>
          </div>
          <button onClick={fechar} className="ml-auto text-white/80 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        {/* Lista */}
        <div className="px-4 py-3 max-h-[52vh] overflow-y-auto">
          {kf.length > 0 && (
            <>
              <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5 mt-1">Kit Festa · {kf.length}</div>
              {kf.map(it => <Linha key={`kf-${it.id}`} it={it} cor="kf" />)}
            </>
          )}
          {cg.length > 0 && (
            <>
              <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5 mt-2">Congelados · {cg.length}</div>
              {cg.map(it => <Linha key={`cg-${it.id}`} it={it} cor="cg" />)}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-gray-50 border-t flex items-center gap-2 flex-wrap">
          <button onClick={fechar} className="text-sm text-gray-600 font-semibold hover:text-gray-800">Lembrar em 15 min</button>
          <div className="ml-auto flex gap-2">
            {kf.length > 0 && <button onClick={() => irPara('/kit-festa-admin')} className="px-4 py-2 rounded-lg text-white text-sm font-bold bg-pink-600 hover:bg-pink-700">Ver Kit Festa ({kf.length})</button>}
            {cg.length > 0 && <button onClick={() => irPara('/site-admin')} className="px-4 py-2 rounded-lg text-white text-sm font-bold bg-sky-600 hover:bg-sky-700">Ver Congelados ({cg.length})</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
