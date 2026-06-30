import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Copy, MessageCircle, RefreshCw, Loader2, Upload, Trash2, Plus, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import funcionarioService from '../../services/funcionarioService';
import { API_URL } from '../../services/api';

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const CATS_DOC = ['RG', 'CPF', 'CTPS', 'RESIDENCIA', 'CONTRATO', 'OUTRO'];
const TIPOS_EXAME = ['ADMISSIONAL', 'PERIODICO', 'DEMISSIONAL', 'RETORNO', 'MUDANCA_FUNCAO'];
const TABS = ['Dados', 'Documentos', 'Exames', 'Atestados', 'Cartão de ponto', 'Desempenho'];

const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
const mesAtual = () => new Date().toISOString().slice(0, 7);

export default function FuncionarioFicha() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [f, setF] = useState(null);
  const [aba, setAba] = useState('Dados');
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setF(await funcionarioService.detalhar(id)); }
    catch { toast.error('Erro ao carregar funcionário.'); }
    finally { setCarregando(false); }
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  if (carregando || !f) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 text-blue-600 animate-spin" /></div>;
  }

  const iniciais = (f.nome || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="max-w-5xl mx-auto p-3 md:p-6">
      <button onClick={() => navigate('/rh/funcionarios')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
        <ChevronLeft className="h-4 w-4" /> Funcionários
      </button>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {/* cabeçalho */}
        <div className="p-5 flex items-center gap-4 border-b border-gray-100">
          <div className="h-14 w-14 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xl font-bold">{iniciais}</div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-gray-900 truncate">{f.nome}</p>
            <p className="text-sm text-gray-500">{f.cargo || 'Sem cargo'}{f.estado?.status === 'DENTRO' ? <span className="text-green-700 font-semibold"> · Trabalhando desde {f.estado.desde}</span> : ''}</p>
          </div>
          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${f.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>{f.ativo ? 'Ativo' : 'Inativo'}</span>
        </div>

        {/* abas */}
        <div className="flex gap-1 px-3 pt-3 overflow-x-auto border-b border-gray-100">
          {TABS.map((t) => (
            <button key={t} onClick={() => setAba(t)} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 ${aba === t ? 'text-primary font-semibold border-primary' : 'text-gray-500 font-medium border-transparent'}`}>{t}</button>
          ))}
        </div>

        <div className="p-5">
          {aba === 'Dados' && <AbaDados f={f} onSaved={carregar} />}
          {aba === 'Documentos' && <AbaDocumentos f={f} onSaved={carregar} />}
          {aba === 'Exames' && <AbaExames f={f} onSaved={carregar} />}
          {aba === 'Atestados' && <AbaAtestados f={f} onSaved={carregar} />}
          {aba === 'Cartão de ponto' && <AbaCartao f={f} />}
          {aba === 'Desempenho' && <AbaDesempenho f={f} onSaved={carregar} />}
        </div>
      </div>
    </div>
  );
}

// ─── Aba Dados ────────────────────────────────────────────────────────────────
function AbaDados({ f, onSaved }) {
  const [form, setForm] = useState({
    cargo: f.cargo || '', salario: f.salario ?? '', tipoHoraExtra: f.tipoHoraExtra || 'BANCO',
    jornadaMovel: f.jornadaMovel, ativo: f.ativo
  });
  const [jornadas, setJornadas] = useState(() => {
    const map = {};
    (f.jornadas || []).forEach(j => { map[j.diaSemana] = j; });
    return Array.from({ length: 7 }, (_, d) => map[d] || { diaSemana: d, entrada1: '', saida1: '', entrada2: '', saida2: '', folga: d === 0 });
  });
  const [salvando, setSalvando] = useState(false);
  const [token, setToken] = useState(f.pontoToken);

  const set = (c) => (e) => setForm((s) => ({ ...s, [c]: e.target.value }));
  const setJ = (i, c, v) => setJornadas((arr) => arr.map((j, idx) => idx === i ? { ...j, [c]: v } : j));

  const salvar = async () => {
    setSalvando(true);
    try {
      await funcionarioService.atualizar(f.id, form);
      await funcionarioService.salvarJornada(f.id, { jornadas, jornadaMovel: form.jornadaMovel });
      toast.success('Dados salvos!');
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.erro || 'Erro ao salvar.'); }
    finally { setSalvando(false); }
  };

  const gerarLink = async () => {
    try { const r = await funcionarioService.gerarLink(f.id); setToken(r.pontoToken); toast.success('Link gerado!'); }
    catch { toast.error('Erro ao gerar link.'); }
  };

  const linkPonto = token ? `${window.location.origin}/ponto/${token}` : '';
  const copiar = () => { navigator.clipboard.writeText(linkPonto); toast.success('Link copiado!'); };
  const whats = () => window.open(`https://wa.me/?text=${encodeURIComponent('Seu link de ponto: ' + linkPonto)}`, '_blank');

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="block"><span className="text-sm font-medium text-gray-700">Cargo</span><input value={form.cargo} onChange={set('cargo')} className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm" /></label>
        <label className="block"><span className="text-sm font-medium text-gray-700">Salário (R$)</span><input value={form.salario} onChange={set('salario')} className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm" /></label>
        <label className="block"><span className="text-sm font-medium text-gray-700">Hora extra</span>
          <select value={form.tipoHoraExtra} onChange={set('tipoHoraExtra')} className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm">
            <option value="BANCO">Banco de horas</option><option value="PAGA">Hora extra paga</option>
          </select>
        </label>
      </div>

      {/* escala */}
      <div className="border border-gray-200 rounded-lg">
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
          <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Escala semanal</span>
          <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
            <input type="checkbox" checked={form.jornadaMovel} onChange={(e) => setForm(s => ({ ...s, jornadaMovel: e.target.checked }))} /> Janela móvel
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white text-gray-500"><tr className="text-xs uppercase">
              <th className="px-3 py-2 text-left">Dia</th><th className="px-2 py-2">Entrada</th><th className="px-2 py-2">Saída almoço</th><th className="px-2 py-2">Volta</th><th className="px-2 py-2">Saída</th><th className="px-2 py-2">Folga</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {jornadas.map((j, i) => (
                <tr key={i} className={j.folga ? 'text-gray-400' : ''}>
                  <td className="px-3 py-1.5 font-medium">{DIAS[i]}</td>
                  {['entrada1', 'saida1', 'entrada2', 'saida2'].map((campo) => (
                    <td key={campo} className="px-1 py-1.5">
                      <input type="time" disabled={j.folga} value={j[campo] || ''} onChange={(e) => setJ(i, campo, e.target.value)} className="border border-gray-200 rounded px-1 py-1 text-xs w-24 disabled:bg-gray-50" />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={j.folga} onChange={(e) => setJ(i, 'folga', e.target.checked)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-t border-gray-100">Janela móvel: se entrar antes, a saída esperada desloca mantendo a mesma carga diária. O excedente vira banco/hora extra.</p>
      </div>

      {/* link de ponto */}
      <div className="border border-gray-200 rounded-lg p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Link de ponto do funcionário</p>
        {token ? (
          <div className="flex flex-col md:flex-row gap-2">
            <input readOnly value={linkPonto} className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm bg-gray-50 text-gray-600" />
            <button onClick={copiar} className="px-3 py-2 bg-primary hover:bg-blue-700 text-white rounded-md text-sm font-semibold inline-flex items-center gap-1"><Copy className="h-4 w-4" /> Copiar</button>
            <button onClick={whats} className="px-3 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md text-sm font-medium inline-flex items-center gap-1"><MessageCircle className="h-4 w-4" /> WhatsApp</button>
            <button onClick={gerarLink} className="px-3 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md text-sm font-medium inline-flex items-center gap-1"><RefreshCw className="h-4 w-4" /> Gerar novo</button>
          </div>
        ) : (
          <button onClick={gerarLink} className="px-3 py-2 bg-primary hover:bg-blue-700 text-white rounded-md text-sm font-semibold">Gerar link de ponto</button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.ativo} onChange={(e) => setForm(s => ({ ...s, ativo: e.target.checked }))} /> Funcionário ativo</label>
        <button onClick={salvar} disabled={salvando} className="px-4 py-2 bg-primary hover:bg-blue-700 text-white rounded-md font-semibold text-sm disabled:opacity-60 inline-flex items-center gap-1">{salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar</button>
      </div>
    </div>
  );
}

// ─── Aba Documentos ───────────────────────────────────────────────────────────
function AbaDocumentos({ f, onSaved }) {
  const [categoria, setCategoria] = useState('RG');
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append('arquivo', file); fd.append('categoria', categoria); fd.append('nome', file.name);
      await funcionarioService.addDocumento(f.id, fd);
      toast.success('Documento anexado!'); onSaved();
    } catch { toast.error('Erro ao anexar.'); }
    finally { setEnviando(false); e.target.value = ''; }
  };
  const excluir = async (docId) => {
    if (!confirm('Excluir este documento?')) return;
    try { await funcionarioService.delDocumento(f.id, docId); toast.success('Excluído.'); onSaved(); }
    catch { toast.error('Erro ao excluir.'); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="border border-gray-300 rounded px-3 py-2 text-sm">
          {CATS_DOC.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="px-3 py-2 bg-primary hover:bg-blue-700 text-white rounded-md text-sm font-semibold cursor-pointer inline-flex items-center gap-1">
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Anexar (PDF/imagem)
          <input type="file" accept="image/*,application/pdf" hidden onChange={enviar} />
        </label>
      </div>
      <ListaAnexos itens={f.documentos} render={(d) => `${d.nome} · ${d.categoria}`} onDelete={excluir} />
    </div>
  );
}

// ─── Aba Exames ───────────────────────────────────────────────────────────────
function AbaExames({ f, onSaved }) {
  const [form, setForm] = useState({ tipo: 'PERIODICO', data: '', validade: '', resultado: 'APTO', obs: '' });
  const [file, setFile] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const set = (c) => (e) => setForm(s => ({ ...s, [c]: e.target.value }));

  const salvar = async () => {
    setSalvando(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => v && fd.append(k, v));
      if (file) fd.append('arquivo', file);
      await funcionarioService.addExame(f.id, fd);
      toast.success('Exame salvo!'); setFile(null); setForm({ tipo: 'PERIODICO', data: '', validade: '', resultado: 'APTO', obs: '' }); onSaved();
    } catch { toast.error('Erro ao salvar.'); }
    finally { setSalvando(false); }
  };
  const excluir = async (exId) => { if (!confirm('Excluir exame?')) return; try { await funcionarioService.delExame(f.id, exId); onSaved(); } catch { toast.error('Erro.'); } };

  const hoje = new Date();
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3">
        <select value={form.tipo} onChange={set('tipo')} className="border border-gray-300 rounded px-2 py-2 text-sm">{TIPOS_EXAME.map(t => <option key={t} value={t}>{t}</option>)}</select>
        <input type="date" value={form.data} onChange={set('data')} className="border border-gray-300 rounded px-2 py-2 text-sm" />
        <input type="date" value={form.validade} onChange={set('validade')} placeholder="validade" className="border border-gray-300 rounded px-2 py-2 text-sm" />
        <select value={form.resultado} onChange={set('resultado')} className="border border-gray-300 rounded px-2 py-2 text-sm"><option value="APTO">Apto</option><option value="INAPTO">Inapto</option></select>
        <label className="border border-gray-300 rounded px-2 py-2 text-sm text-gray-600 cursor-pointer truncate">{file ? file.name : 'Anexo (opcional)'}<input type="file" accept="image/*,application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0])} /></label>
      </div>
      <button onClick={salvar} disabled={salvando} className="px-3 py-2 bg-primary hover:bg-blue-700 text-white rounded-md text-sm font-semibold mb-4 inline-flex items-center gap-1">{salvando && <Loader2 className="h-4 w-4 animate-spin" />}<Plus className="h-4 w-4" /> Adicionar exame</button>
      <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
        {(f.exames || []).length === 0 && <li className="px-4 py-3 text-sm text-gray-400">Nenhum exame.</li>}
        {(f.exames || []).map((ex) => {
          const venc = ex.validade ? new Date(ex.validade) : null;
          const dias = venc ? Math.ceil((venc - hoje) / 86400000) : null;
          const badge = dias == null ? null : dias < 0 ? ['bg-red-100 text-red-700', 'Vencido'] : dias <= 30 ? ['bg-amber-100 text-amber-700', `Vence ${dias}d`] : ['bg-green-100 text-green-800', 'Válido'];
          return (
            <li key={ex.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span><b>{ex.tipo}</b> · {fmtData(ex.data)}{ex.validade ? ` · vence ${fmtData(ex.validade)}` : ''} <span className="text-xs text-gray-500">{ex.resultado || ''}</span></span>
              <span className="flex items-center gap-2">
                {badge && <span className={`px-2 py-1 text-xs font-semibold rounded-full ${badge[0]}`}>{badge[1]}</span>}
                {ex.arquivo && <a href={`${API_URL}/uploads/${ex.arquivo}`} target="_blank" rel="noreferrer" className="text-primary text-xs font-semibold">Ver</a>}
                <button onClick={() => excluir(ex.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Aba Atestados ────────────────────────────────────────────────────────────
function AbaAtestados({ f, onSaved }) {
  const [form, setForm] = useState({ dataInicio: '', dias: '1', cid: '', obs: '' });
  const [file, setFile] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const set = (c) => (e) => setForm(s => ({ ...s, [c]: e.target.value }));

  const salvar = async () => {
    if (!form.dataInicio) { toast.error('Informe a data.'); return; }
    setSalvando(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => v && fd.append(k, v));
      if (file) fd.append('arquivo', file);
      await funcionarioService.addAtestado(f.id, fd);
      toast.success('Atestado salvo!'); setFile(null); setForm({ dataInicio: '', dias: '1', cid: '', obs: '' }); onSaved();
    } catch { toast.error('Erro ao salvar.'); }
    finally { setSalvando(false); }
  };
  const excluir = async (atId) => { if (!confirm('Excluir atestado?')) return; try { await funcionarioService.delAtestado(f.id, atId); onSaved(); } catch { toast.error('Erro.'); } };

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        <input type="date" value={form.dataInicio} onChange={set('dataInicio')} className="border border-gray-300 rounded px-2 py-2 text-sm" />
        <input type="number" min="1" value={form.dias} onChange={set('dias')} placeholder="dias" className="border border-gray-300 rounded px-2 py-2 text-sm" />
        <input value={form.cid} onChange={set('cid')} placeholder="CID (opcional)" className="border border-gray-300 rounded px-2 py-2 text-sm" />
        <input value={form.obs} onChange={set('obs')} placeholder="Obs" className="border border-gray-300 rounded px-2 py-2 text-sm" />
        <label className="border border-gray-300 rounded px-2 py-2 text-sm text-gray-600 cursor-pointer truncate">{file ? file.name : 'Anexo'}<input type="file" accept="image/*,application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0])} /></label>
      </div>
      <button onClick={salvar} disabled={salvando} className="px-3 py-2 bg-primary hover:bg-blue-700 text-white rounded-md text-sm font-semibold mb-4 inline-flex items-center gap-1">{salvando && <Loader2 className="h-4 w-4 animate-spin" />}<Plus className="h-4 w-4" /> Adicionar atestado</button>
      <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
        {(f.atestados || []).length === 0 && <li className="px-4 py-3 text-sm text-gray-400">Nenhum atestado.</li>}
        {(f.atestados || []).map((a) => (
          <li key={a.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span><b>{fmtData(a.dataInicio)}</b> · {a.dias} dia(s){a.cid ? ` · CID ${a.cid}` : ''}</span>
            <span className="flex items-center gap-2">
              {a.arquivo && <a href={`${API_URL}/uploads/${a.arquivo}`} target="_blank" rel="noreferrer" className="text-primary text-xs font-semibold">Ver</a>}
              <button onClick={() => excluir(a.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Aba Cartão de ponto ──────────────────────────────────────────────────────
function AbaCartao({ f }) {
  const [mes, setMes] = useState(mesAtual());
  const [cartao, setCartao] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setCartao(await funcionarioService.cartao(f.id, mes)); }
    catch { toast.error('Erro ao carregar cartão.'); }
    finally { setCarregando(false); }
  }, [f.id, mes]);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-sm" />
        <button onClick={() => setModal(true)} className="px-3 py-1.5 bg-primary hover:bg-blue-700 text-white rounded-md text-xs font-semibold inline-flex items-center gap-1"><Plus className="h-4 w-4" /> Adicionar batida</button>
      </div>

      {carregando ? <div className="py-10 text-center"><Loader2 className="h-6 w-6 text-blue-600 animate-spin mx-auto" /></div> : cartao && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Kpi v={cartao.resumo.trabalhado} l="Trabalhadas" />
            <Kpi v={cartao.resumo.saldo} l="Banco de horas" cor={cartao.resumo.saldoMin >= 0 ? 'text-green-600' : 'text-red-600'} />
            <Kpi v={cartao.resumo.extra} l="Hora extra" cor="text-amber-600" />
            <Kpi v={String(cartao.resumo.faltas)} l="Faltas/atrasos" cor="text-red-600" />
          </div>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50"><tr>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Dia</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Batidas</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Previsto</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Trabalhado</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Saldo</th>
              </tr></thead>
              <tbody className="bg-white divide-y divide-gray-200 text-sm">
                {cartao.linhas.length === 0 && <tr><td colSpan="5" className="px-3 py-6 text-center text-gray-400">Sem batidas neste mês.</td></tr>}
                {cartao.linhas.map((l) => (
                  <tr key={l.data} className={`hover:bg-gray-50 ${l.abonado ? 'bg-red-50/40' : ''}`}>
                    <td className="px-3 py-2.5 font-medium">{new Date(`${l.data}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td>
                    <td className="px-3 py-2.5">
                      {l.abonado && !l.batidas.length ? <span className="text-xs text-red-600">Abonado (atestado)</span> :
                        l.batidas.map((b, i) => (
                          <span key={b.id}>
                            {i > 0 && ' · '}
                            {b.latLng ? <a href={`https://www.google.com/maps?q=${b.latLng}`} target="_blank" rel="noreferrer" className="text-primary underline decoration-dotted tabular-nums">{b.hora} 📍</a> : <span className="tabular-nums">{b.hora}</span>}
                          </span>
                        ))}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{l.previsto}</td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold">{l.trabalhado}</td>
                    <td className={`px-3 py-2.5 tabular-nums font-semibold ${l.saldoMin > 0 ? 'text-green-700' : l.saldoMin < 0 ? 'text-red-700' : 'text-gray-500'}`}>{l.saldo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modal && <ModalBatida funcionarioId={f.id} onClose={() => setModal(false)} onSaved={() => { setModal(false); carregar(); }} />}
    </div>
  );
}

function Kpi({ v, l, cor = 'text-gray-900' }) {
  return <div className="bg-gray-50 rounded-lg p-3 text-center"><p className={`text-xl font-bold tabular-nums ${cor}`}>{v}</p><p className="text-xs text-gray-500">{l}</p></div>;
}

function ModalBatida({ funcionarioId, onClose, onSaved }) {
  const [form, setForm] = useState({ data: mesAtual() + '-01', hora: '13:00', tipo: 'ENTRADA', obs: '' });
  const [salvando, setSalvando] = useState(false);
  const set = (c) => (e) => setForm(s => ({ ...s, [c]: e.target.value }));
  const salvar = async () => {
    setSalvando(true);
    try { await funcionarioService.addBatida({ funcionarioId, ...form }); toast.success('Batida adicionada!'); onSaved(); }
    catch { toast.error('Erro ao adicionar.'); }
    finally { setSalvando(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <p className="font-bold text-gray-900 mb-3">Adicionar / ajustar batida</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="text-sm font-medium text-gray-700">Data</span><input type="date" value={form.data} onChange={set('data')} className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm" /></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Hora</span><input type="time" value={form.hora} onChange={set('hora')} className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm" /></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Tipo</span><select value={form.tipo} onChange={set('tipo')} className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm"><option value="ENTRADA">Entrada</option><option value="SAIDA">Saída</option></select></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Motivo</span><input value={form.obs} onChange={set('obs')} placeholder="Esqueceu de bater" className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm" /></label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md font-medium text-sm">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-4 py-2 bg-primary text-white rounded-md font-semibold text-sm disabled:opacity-60 inline-flex items-center gap-1">{salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Aba Desempenho ───────────────────────────────────────────────────────────
function AbaDesempenho({ f, onSaved }) {
  const [form, setForm] = useState({ periodo: mesAtual(), nota: '', obs: '' });
  const [salvando, setSalvando] = useState(false);
  const set = (c) => (e) => setForm(s => ({ ...s, [c]: e.target.value }));
  const salvar = async () => {
    setSalvando(true);
    try { await funcionarioService.addAvaliacao(f.id, form); toast.success('Avaliação salva!'); setForm({ periodo: mesAtual(), nota: '', obs: '' }); onSaved(); }
    catch { toast.error('Erro ao salvar.'); }
    finally { setSalvando(false); }
  };
  const media = (f.avaliacoes || []).length ? ((f.avaliacoes.reduce((s, a) => s + Number(a.nota || 0), 0) / f.avaliacoes.length).toFixed(1)) : '—';

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Kpi v={media} l="Nota média" cor="text-primary" />
        <Kpi v={String((f.atestados || []).length)} l="Atestados" cor="text-amber-600" />
        <Kpi v={String((f.avaliacoes || []).length)} l="Avaliações" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <input type="month" value={form.periodo} onChange={set('periodo')} className="border border-gray-300 rounded px-2 py-2 text-sm" />
        <input type="number" min="0" max="10" step="0.5" value={form.nota} onChange={set('nota')} placeholder="Nota 0–10" className="border border-gray-300 rounded px-2 py-2 text-sm" />
        <input value={form.obs} onChange={set('obs')} placeholder="Observação" className="border border-gray-300 rounded px-2 py-2 text-sm md:col-span-2" />
      </div>
      <button onClick={salvar} disabled={salvando} className="px-3 py-2 bg-primary hover:bg-blue-700 text-white rounded-md text-sm font-semibold mb-4 inline-flex items-center gap-1">{salvando && <Loader2 className="h-4 w-4 animate-spin" />}<Plus className="h-4 w-4" /> Adicionar avaliação</button>
      <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
        {(f.avaliacoes || []).length === 0 && <li className="px-4 py-3 text-sm text-gray-400">Nenhuma avaliação.</li>}
        {(f.avaliacoes || []).map((a) => (
          <li key={a.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span><b>{a.periodo}</b>{a.obs ? ` · ${a.obs}` : ''}</span>
            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">Nota {Number(a.nota).toFixed(1)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Lista de anexos genérica ─────────────────────────────────────────────────
function ListaAnexos({ itens, render, onDelete }) {
  if (!itens?.length) return <p className="text-sm text-gray-400">Nenhum documento anexado.</p>;
  return (
    <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
      {itens.map((d) => (
        <li key={d.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span className="truncate">📄 {render(d)}</span>
          <span className="flex items-center gap-3 shrink-0">
            <a href={`${API_URL}/uploads/${d.arquivo}`} target="_blank" rel="noreferrer" className="text-primary text-xs font-semibold">Ver</a>
            <button onClick={() => onDelete(d.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
          </span>
        </li>
      ))}
    </ul>
  );
}
