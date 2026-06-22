import React, { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Clock, Plus, Trash2, Calendar, CalendarRange, Package, Truck, Check, X, CalendarX } from 'lucide-react';
import toast from 'react-hot-toast';
import { kitFestaService } from '../../services/kitFestaService';

const MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const addDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// Grade de horários 06:00 → 20:00 a cada 30 min
const GRID = [];
for (let min = 6 * 60; min <= 20 * 60; min += 30) GRID.push(`${pad(Math.floor(min / 60))}:${pad(min % 60)}`);

const STATUS = {
  open: { label: 'Aberto', dot: 'bg-emerald-500' },
  few: { label: 'Últimas vagas', dot: 'bg-amber-400' },
  full: { label: 'Esgotado', dot: 'bg-red-400' },
  closed: { label: 'Fechado', dot: 'bg-gray-400' },
};

export default function AbaAgenda() {
  return (
    <div className="space-y-4">
      <LoteConfig onAplicado={() => window.dispatchEvent(new Event('kf-agenda-reload'))} />
      <CalendarioEditor />
    </div>
  );
}

/* ============ Configuração em LOTE ============ */
function LoteConfig({ onAplicado }) {
  const h = hoje();
  const [de, setDe] = useState(ymd(h));
  const [ate, setAte] = useState(ymd(addDias(h, 30)));
  const [dias, setDias] = useState(new Set([0, 1, 2, 3, 4, 5, 6])); // dias da semana incluídos
  const [modo, setModo] = useState('retirada');
  const [sel, setSel] = useState(new Set()); // horários selecionados
  const [cap, setCap] = useState(10);
  const [salvando, setSalvando] = useState(false);

  const toggleDia = (n) => setDias(s => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x; });
  const toggleSlot = (hh) => setSel(s => { const x = new Set(s); x.has(hh) ? x.delete(hh) : x.add(hh); return x; });
  const selFaixa = (ini, fim) => setSel(new Set(GRID.filter(hh => hh >= ini && hh <= fim)));

  const datasNoPeriodo = () => {
    const out = [];
    let d = new Date(de + 'T12:00:00');
    const dFim = new Date(ate + 'T12:00:00');
    if (d > dFim) return out;
    while (d <= dFim) { if (dias.has(d.getDay())) out.push(ymd(d)); d = addDias(d, 1); }
    return out;
  };

  const aplicar = async () => {
    const datas = datasNoPeriodo();
    if (!datas.length) return toast.error('Nenhum dia no período (confira as datas e os dias da semana).');
    if (!sel.size) return toast.error('Selecione ao menos um horário.');
    setSalvando(true);
    try {
      const slots = [...sel].sort().map(hora => ({ hora, capacidade: cap }));
      await kitFestaService.salvarLote({ datas, modo, slots, fecharDia: false });
      toast.success(`${datas.length} dia(s) configurados (${modo}).`);
      onAplicado?.();
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao aplicar'); }
    finally { setSalvando(false); }
  };

  const fecharPeriodo = async () => {
    const datas = datasNoPeriodo();
    if (!datas.length) return toast.error('Nenhum dia no período.');
    if (!confirm(`Fechar ${datas.length} dia(s) no período? Eles ficam indisponíveis no site.`)) return;
    setSalvando(true);
    try {
      await kitFestaService.salvarLote({ datas, fecharDia: true });
      toast.success(`${datas.length} dia(s) fechados.`);
      onAplicado?.();
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao fechar'); }
    finally { setSalvando(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="font-semibold text-gray-800 flex items-center gap-1.5 mb-1"><CalendarRange className="h-5 w-5 text-emerald-600" /> Configurar horários em lote</h3>
      <p className="text-xs text-gray-500 mb-3">Defina o período, os dias da semana, o tipo e os horários — aplica de uma vez em todos os dias escolhidos.</p>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Esquerda: período + dias + modo + capacidade */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">De</label>
              <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={de} onChange={e => setDe(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Até</label>
              <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={ate} onChange={e => setAte(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">Dias da semana</label>
            <div className="flex gap-1 mt-1">
              {DOW.map((d, i) => (
                <button key={i} onClick={() => toggleDia(i)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium ${dias.has(i) ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{d}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">Tipo</label>
            <div className="flex gap-1 mt-1">
              <button onClick={() => setModo('retirada')} className={`flex-1 py-2 rounded-lg text-sm flex items-center justify-center gap-1.5 ${modo === 'retirada' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'}`}><Package className="h-4 w-4" /> Retirada</button>
              <button onClick={() => setModo('entrega')} className={`flex-1 py-2 rounded-lg text-sm flex items-center justify-center gap-1.5 ${modo === 'entrega' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'}`}><Truck className="h-4 w-4" /> Entrega</button>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">Pedidos por horário (capacidade)</label>
            <input type="number" min="1" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={cap} onChange={e => setCap(Math.max(1, parseInt(e.target.value) || 1))} />
          </div>
        </div>

        {/* Direita: grade de horários */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-500">Horários (06:00–20:00)</label>
            <div className="flex gap-1 text-[11px]">
              <button onClick={() => setSel(new Set(GRID))} className="text-emerald-600">Todos</button>
              <span className="text-gray-300">·</span>
              <button onClick={() => selFaixa('08:00', '17:00')} className="text-emerald-600">Comercial</button>
              <span className="text-gray-300">·</span>
              <button onClick={() => setSel(new Set())} className="text-gray-400">Limpar</button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1.5 max-h-56 overflow-y-auto p-0.5">
            {GRID.map(hh => (
              <button key={hh} onClick={() => toggleSlot(hh)}
                className={`py-1.5 rounded-md text-xs font-medium border ${sel.has(hh) ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'}`}>{hh}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-gray-100">
        <button onClick={aplicar} disabled={salvando}
          className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aplicar horários ao período
        </button>
        <button onClick={fecharPeriodo} disabled={salvando}
          className="border border-red-200 text-red-600 rounded-lg px-4 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-50 flex items-center gap-1.5">
          <CalendarX className="h-4 w-4" /> Fechar os dias do período
        </button>
        <span className="text-xs text-gray-400 self-center">{datasNoPeriodo().length} dia(s) no período selecionado</span>
      </div>
    </div>
  );
}

/* ============ Calendário + editor do dia ============ */
function CalendarioEditor() {
  const h = hoje();
  const [view, setView] = useState({ y: h.getFullYear(), m: h.getMonth() });
  const [mapa, setMapa] = useState({});
  const [loading, setLoading] = useState(true);
  const [selDia, setSelDia] = useState(null);

  const carregar = useCallback(() => {
    setLoading(true);
    const inicio = ymd(new Date(view.y, view.m, 1));
    const fim = ymd(new Date(view.y, view.m + 1, 0));
    kitFestaService.agenda(inicio, fim)
      .then(arr => { const m = {}; arr.forEach(d => { m[d.data] = d; }); setMapa(m); })
      .catch(() => toast.error('Erro ao carregar agenda'))
      .finally(() => setLoading(false));
  }, [view.y, view.m]);
  useEffect(carregar, [carregar]);
  useEffect(() => { const fn = () => carregar(); window.addEventListener('kf-agenda-reload', fn); return () => window.removeEventListener('kf-agenda-reload', fn); }, [carregar]);

  const go = (d) => setView(v => { const nm = new Date(v.y, v.m + d, 1); return { y: nm.getFullYear(), m: nm.getMonth() }; });

  const firstDow = new Date(view.y, view.m, 1).getDay();
  const totalDias = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let dia = 1; dia <= totalDias; dia++) {
    const key = ymd(new Date(view.y, view.m, dia));
    cells.push({ dia, key, info: mapa[key] });
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => go(-1)} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronLeft className="h-5 w-5 text-gray-500" /></button>
          <b className="text-gray-800">{MES[view.m]} {view.y}</b>
          <button onClick={() => go(1)} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronRight className="h-5 w-5 text-gray-500" /></button>
        </div>
        {loading ? <div className="p-12 text-center text-gray-400"><Loader2 className="h-6 w-6 animate-spin inline" /></div> : (
          <>
            <div className="grid grid-cols-7 text-center text-xs text-gray-400 mb-1">{DOW.map(d => <span key={d}>{d}</span>)}</div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((c, i) => {
                if (!c) return <div key={i} />;
                const info = c.info;
                const st = info?.status;
                const temSlots = info && (info.slotsRetirada > 0 || info.slotsEntrega > 0);
                const sel = selDia === c.key;
                return (
                  <button key={i} onClick={() => setSelDia(c.key)}
                    className={`aspect-square rounded-lg border text-sm flex flex-col items-center justify-center relative ${sel ? 'ring-2 ring-emerald-500 border-emerald-500' : 'border-gray-100 hover:border-gray-300'}`}>
                    <span className="text-gray-700">{c.dia}</span>
                    {st === 'closed'
                      ? <span className="w-1.5 h-1.5 rounded-full mt-0.5 bg-gray-400" />
                      : temSlots ? <span className="w-1.5 h-1.5 rounded-full mt-0.5 bg-emerald-500" />
                        : <span className="w-1.5 h-1.5 rounded-full mt-0.5 bg-gray-200" />}
                    {info?.pedidos > 0 && <span className="absolute top-0.5 right-0.5 text-[9px] bg-emerald-600 text-white rounded-full px-1">{info.pedidos}</span>}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full bg-emerald-500" />Com horários</span>
              <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full bg-gray-400" />Fechado</span>
              <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full bg-gray-200" />Sem horários</span>
              <span className="flex items-center gap-1"><span className="text-[9px] bg-emerald-600 text-white rounded-full px-1">n</span>pedidos no dia</span>
            </div>
          </>
        )}
      </div>

      <div>
        {selDia ? <DiaEditor data={selDia} onChanged={carregar} /> : (
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm text-gray-400 text-center">
            Clique num dia para editar os horários manualmente ou fechar o dia.
          </div>
        )}
      </div>
    </div>
  );
}

/* ============ Editor de um dia ============ */
function DiaEditor({ data, onChanged }) {
  const [dia, setDia] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const carregar = useCallback(() => {
    setLoading(true);
    kitFestaService.getDia(data).then(setDia).finally(() => setLoading(false));
  }, [data]);
  useEffect(carregar, [carregar]);

  const fechado = dia?.status === 'closed';

  const setStatus = async (status) => {
    setBusy(true);
    try { await kitFestaService.setStatusDia({ data, status }); toast.success(status === 'closed' ? 'Dia fechado' : 'Dia aberto'); carregar(); onChanged?.(); }
    catch { toast.error('Erro'); } finally { setBusy(false); }
  };

  const salvarModo = async (modo, slots) => {
    setBusy(true);
    try {
      await kitFestaService.salvarLote({ datas: [data], modo, slots, fecharDia: false });
      toast.success('Horários salvos'); carregar(); onChanged?.();
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao salvar'); } finally { setBusy(false); }
  };

  const label = data.split('-').reverse().join('/');

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800 flex items-center gap-1.5"><Calendar className="h-4 w-4 text-emerald-600" /> {label}</h3>
        {fechado
          ? <button onClick={() => setStatus('open')} disabled={busy} className="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700">Reabrir dia</button>
          : <button onClick={() => setStatus('closed')} disabled={busy} className="text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 flex items-center gap-1"><CalendarX className="h-3.5 w-3.5" /> Fechar dia</button>}
      </div>

      {loading ? <div className="py-8 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div> : fechado ? (
        <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3 text-center">Este dia está <b>fechado</b> — não aparece para os clientes. Reabra para editar os horários.</p>
      ) : (
        <div className="space-y-4">
          <ModoSlots titulo="Retirada" icon={Package} slots={dia?.retirada || []} onSalvar={(s) => salvarModo('retirada', s)} busy={busy} />
          <ModoSlots titulo="Entrega" icon={Truck} slots={dia?.entrega || []} onSalvar={(s) => salvarModo('entrega', s)} busy={busy} />
        </div>
      )}
    </div>
  );
}

function ModoSlots({ titulo, icon: Icon, slots, onSalvar, busy }) {
  const [lista, setLista] = useState([]);
  const [novoH, setNovoH] = useState('');
  const [novoC, setNovoC] = useState(10);
  useEffect(() => { setLista(slots.map(s => ({ ...s }))); }, [slots]);

  const setCap = (i, v) => setLista(l => l.map((s, idx) => idx === i ? { ...s, capacidade: Math.max(1, parseInt(v) || 1) } : s));
  const remover = (i) => setLista(l => l.filter((_, idx) => idx !== i));
  const add = () => {
    if (!novoH) return toast.error('Escolha um horário');
    if (lista.some(s => s.hora === novoH)) return toast.error('Horário já existe');
    setLista(l => [...l, { hora: novoH, capacidade: Math.max(1, parseInt(novoC) || 1), usado: 0 }].sort((a, b) => a.hora.localeCompare(b.hora)));
    setNovoH('');
  };

  return (
    <div className="border border-gray-100 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-gray-600 uppercase flex items-center gap-1.5"><Icon className="h-4 w-4 text-emerald-600" /> {titulo}</div>
        <button onClick={() => onSalvar(lista.map(s => ({ hora: s.hora, capacidade: s.capacidade })))} disabled={busy}
          className="text-xs px-2.5 py-1 rounded-md bg-emerald-600 text-white disabled:opacity-50">Salvar {titulo.toLowerCase()}</button>
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {lista.length === 0 && <p className="text-xs text-gray-300 px-1">Nenhum horário. Adicione abaixo.</p>}
        {lista.map((s, i) => (
          <div key={s.hora} className="flex items-center gap-2 bg-gray-50 rounded-md px-2 py-1">
            <span className="font-mono text-sm text-gray-700 w-12">{s.hora}</span>
            <span className="text-[11px] text-gray-400">cap.</span>
            <input type="number" min="1" value={s.capacidade} onChange={e => setCap(i, e.target.value)} className="w-14 border border-gray-200 rounded px-2 py-0.5 text-sm" />
            {s.usado > 0 && <span className="text-[11px] text-amber-600">{s.usado} usado(s)</span>}
            <button onClick={() => remover(i)} className="ml-auto text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-2 pt-2 border-t border-gray-100">
        <input type="time" value={novoH} onChange={e => setNovoH(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm flex-1" />
        <input type="number" min="1" value={novoC} onChange={e => setNovoC(e.target.value)} className="w-14 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
        <button onClick={add} className="bg-gray-800 text-white rounded-lg px-2.5"><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
