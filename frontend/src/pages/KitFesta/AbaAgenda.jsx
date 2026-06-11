import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Clock, Plus, Trash2, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import { kitFestaService } from '../../services/kitFestaService';

const MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const STATUS = {
  open: { label: 'Aberto', cls: 'bg-emerald-500 text-white', dot: 'bg-emerald-500' },
  few: { label: 'Últimas vagas', cls: 'bg-amber-400 text-white', dot: 'bg-amber-400' },
  full: { label: 'Esgotado', cls: 'bg-red-400 text-white', dot: 'bg-red-400' },
  closed: { label: 'Fechado', cls: 'bg-gray-300 text-gray-600', dot: 'bg-gray-300' },
};
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function AbaAgenda() {
  const hoje = new Date();
  const [view, setView] = useState({ y: hoje.getFullYear(), m: hoje.getMonth() });
  const [dias, setDias] = useState({}); // 'YYYY-MM-DD' -> {status, pedidos}
  const [loading, setLoading] = useState(true);
  const [selDia, setSelDia] = useState(null);

  const carregar = () => {
    setLoading(true);
    const inicio = ymd(new Date(view.y, view.m, 1));
    const fim = ymd(new Date(view.y, view.m + 1, 0));
    kitFestaService.agenda(inicio, fim)
      .then(arr => { const m = {}; arr.forEach(d => { m[d.data] = d; }); setDias(m); })
      .catch(() => toast.error('Erro ao carregar agenda'))
      .finally(() => setLoading(false));
  };
  useEffect(carregar, [view.y, view.m]);

  const go = (d) => setView(v => { const nm = new Date(v.y, v.m + d, 1); return { y: nm.getFullYear(), m: nm.getMonth() }; });

  const setStatus = async (dataKey, status) => {
    try {
      await kitFestaService.setStatusDia({ data: dataKey, status });
      setDias(d => ({ ...d, [dataKey]: { ...(d[dataKey] || {}), data: dataKey, status } }));
      toast.success(`${dataKey.split('-').reverse().join('/')} → ${STATUS[status].label}`);
    } catch { toast.error('Erro ao salvar'); }
  };

  // Ações em lote
  const aplicarLote = async (fn, status, msg) => {
    const datas = [];
    const total = new Date(view.y, view.m + 1, 0).getDate();
    for (let dia = 1; dia <= total; dia++) {
      const d = new Date(view.y, view.m, dia);
      if (fn(d)) datas.push(ymd(d));
    }
    if (!datas.length) return;
    try { await kitFestaService.setStatusLote({ datas, status }); toast.success(msg); carregar(); }
    catch { toast.error('Erro no lote'); }
  };

  const firstDow = new Date(view.y, view.m, 1).getDay();
  const totalDias = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let dia = 1; dia <= totalDias; dia++) {
    const key = ymd(new Date(view.y, view.m, dia));
    cells.push({ dia, key, info: dias[key] });
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      {/* Calendário */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => go(-1)} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronLeft className="h-5 w-5 text-gray-500" /></button>
          <b className="text-gray-800">{MES[view.m]} {view.y}</b>
          <button onClick={() => go(1)} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronRight className="h-5 w-5 text-gray-500" /></button>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3 text-xs">
          <button onClick={() => aplicarLote(() => true, 'open', 'Mês todo aberto')} className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700">Abrir mês</button>
          <button onClick={() => aplicarLote(d => d.getDay() === 0, 'closed', 'Domingos fechados')} className="px-2 py-1 rounded-md bg-gray-100 text-gray-600">Fechar domingos</button>
          <button onClick={() => aplicarLote(() => true, 'closed', 'Mês todo fechado')} className="px-2 py-1 rounded-md bg-gray-100 text-gray-600">Fechar mês</button>
        </div>

        {loading ? <div className="p-12 text-center text-gray-400"><Loader2 className="h-6 w-6 animate-spin inline" /></div> : (
          <>
            <div className="grid grid-cols-7 text-center text-xs text-gray-400 mb-1">
              {DOW.map(d => <span key={d}>{d}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((c, i) => {
                if (!c) return <div key={i} />;
                const st = c.info?.status || 'open';
                const sel = selDia === c.key;
                return (
                  <button key={i} onClick={() => setSelDia(c.key)}
                    className={`aspect-square rounded-lg border text-sm flex flex-col items-center justify-center relative transition-all ${sel ? 'ring-2 ring-emerald-500 border-emerald-500' : 'border-gray-100 hover:border-gray-300'}`}>
                    <span className="text-gray-700">{c.dia}</span>
                    <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${STATUS[st].dot}`} />
                    {c.info?.pedidos > 0 && <span className="absolute top-0.5 right-0.5 text-[9px] bg-emerald-600 text-white rounded-full px-1">{c.info.pedidos}</span>}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-500">
              {Object.entries(STATUS).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1"><i className={`w-2.5 h-2.5 rounded-full ${v.dot}`} />{v.label}</span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Painel lateral: dia selecionado + horários */}
      <div className="space-y-4">
        {selDia ? (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-800 flex items-center gap-1.5 text-sm mb-1">
              <Calendar className="h-4 w-4 text-emerald-600" /> {selDia.split('-').reverse().join('/')}
            </h3>
            <p className="text-xs text-gray-400 mb-3">{dias[selDia]?.pedidos || 0} pedido(s) neste dia</p>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(STATUS).map(([k, v]) => (
                <button key={k} onClick={() => setStatus(selDia, k)}
                  className={`py-2 rounded-lg text-xs font-medium ${(dias[selDia]?.status || 'open') === k ? v.cls : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm text-gray-400 text-center">
            Clique num dia para abrir/fechar e ver os pedidos.
          </div>
        )}
        <Horarios />
      </div>
    </div>
  );
}

// ── Template de horários ──
function Horarios() {
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [novo, setNovo] = useState({ modo: 'retirada', hora: '', capacidade: 10 });

  const carregar = () => { setLoading(true); kitFestaService.horarios().then(setLista).finally(() => setLoading(false)); };
  useEffect(carregar, []);

  const add = async () => {
    if (!novo.hora) return toast.error('Informe o horário');
    try { await kitFestaService.salvarHorario(null, { ...novo, capacidade: Number(novo.capacidade) || 10, ordem: lista.length }); setNovo({ ...novo, hora: '' }); carregar(); }
    catch { toast.error('Erro ao adicionar'); }
  };
  const remover = async (h) => { await kitFestaService.removerHorario(h.id); carregar(); };
  const togglecap = async (h, cap) => { await kitFestaService.salvarHorario(h.id, { ...h, capacidade: Number(cap) || 0 }); carregar(); };

  const porModo = (m) => lista.filter(h => h.modo === m);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="font-semibold text-gray-800 flex items-center gap-1.5 text-sm mb-3">
        <Clock className="h-4 w-4 text-emerald-600" /> Horários e capacidade
      </h3>
      {loading ? <div className="text-center text-gray-400 py-4"><Loader2 className="h-5 w-5 animate-spin inline" /></div> : (
        <>
          {['retirada', 'entrega'].map(modo => (
            <div key={modo} className="mb-3">
              <div className="text-xs font-medium text-gray-500 uppercase mb-1.5">{modo}</div>
              <div className="space-y-1">
                {porModo(modo).map(h => (
                  <div key={h.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <span className="font-mono text-sm text-gray-700 w-14">{h.hora}</span>
                    <span className="text-xs text-gray-400">cap.</span>
                    <input className="w-14 border border-gray-200 rounded px-2 py-0.5 text-sm" defaultValue={h.capacidade}
                      onBlur={e => togglecap(h, e.target.value)} inputMode="numeric" />
                    <button onClick={() => remover(h)} className="ml-auto text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                {porModo(modo).length === 0 && <p className="text-xs text-gray-300 px-1">Nenhum horário.</p>}
              </div>
            </div>
          ))}
          <div className="flex gap-1.5 pt-2 border-t border-gray-100">
            <select className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" value={novo.modo} onChange={e => setNovo({ ...novo, modo: e.target.value })}>
              <option value="retirada">Retirada</option>
              <option value="entrega">Entrega</option>
            </select>
            <input type="time" className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm flex-1" value={novo.hora} onChange={e => setNovo({ ...novo, hora: e.target.value })} />
            <input className="w-14 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" placeholder="cap" value={novo.capacidade} onChange={e => setNovo({ ...novo, capacidade: e.target.value })} inputMode="numeric" />
            <button onClick={add} className="bg-emerald-600 text-white rounded-lg px-2.5"><Plus className="h-4 w-4" /></button>
          </div>
        </>
      )}
    </div>
  );
}
