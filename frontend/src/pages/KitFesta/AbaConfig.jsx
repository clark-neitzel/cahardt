import React, { useEffect, useState, useRef } from 'react';
import { Loader2, Save, Store, Megaphone, ListChecks, Gift, Truck, Star, Plus, Trash2, Image as ImageIcon, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { kitFestaService } from '../../services/kitFestaService';
import { API_URL } from '../../services/api';

const imgUrl = (u) => !u ? null : (u.startsWith('http') ? u : `${API_URL}${u}`);

const Campo = ({ label, ...props }) => (
  <div>
    <label className="text-xs text-gray-500">{label}</label>
    <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" {...props} />
  </div>
);

export default function AbaConfig() {
  const [cfg, setCfg] = useState(null);
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(null);

  const carregar = () => {
    setLoading(true);
    Promise.all([kitFestaService.getConfig(), kitFestaService.avaliacoes()])
      .then(([c, a]) => { setCfg(c); setAvaliacoes(a); })
      .catch(() => toast.error('Erro ao carregar configurações'))
      .finally(() => setLoading(false));
  };
  useEffect(carregar, []);

  const salvarSecao = async (chave, valor) => {
    setSalvando(chave);
    try { await kitFestaService.setConfig(chave, valor); toast.success('Salvo'); }
    catch { toast.error('Erro ao salvar'); }
    finally { setSalvando(null); }
  };

  const up = (chave, patch) => setCfg(c => ({ ...c, [chave]: { ...c[chave], ...patch } }));

  if (loading || !cfg) return <div className="p-12 text-center text-gray-400"><Loader2 className="h-6 w-6 animate-spin inline" /></div>;

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {/* Loja */}
      <Secao titulo="Dados da loja" icon={Store} onSave={() => salvarSecao('loja', cfg.loja)} saving={salvando === 'loja'}>
        <LogoUploader logoUrl={cfg.logoUrl} onChanged={(url) => setCfg(c => ({ ...c, logoUrl: url }))} />
        <Campo label="Nome" value={cfg.loja?.nome || ''} onChange={e => up('loja', { nome: e.target.value })} />
        <Campo label="Slogan" value={cfg.loja?.slogan || ''} onChange={e => up('loja', { slogan: e.target.value })} />
        <Campo label="Desde" value={cfg.loja?.desde || ''} onChange={e => up('loja', { desde: e.target.value })} />
        <Campo label="Endereço" value={cfg.loja?.endereco || ''} onChange={e => up('loja', { endereco: e.target.value })} />
        <Campo label="Link do mapa (Google Maps)" value={cfg.loja?.mapsUrl || ''} onChange={e => up('loja', { mapsUrl: e.target.value })} placeholder="https://maps.app.goo.gl/..." />
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Telefone (exibição)" value={cfg.loja?.telefone || ''} onChange={e => up('loja', { telefone: e.target.value })} />
          <Campo label="WhatsApp (só números)" value={cfg.loja?.whatsapp || ''} onChange={e => up('loja', { whatsapp: e.target.value })} />
        </div>
      </Secao>

      {/* Regras */}
      <Secao titulo="Regras do pedido" icon={ListChecks} onSave={() => salvarSecao('regras', { ...cfg.regras, minCaixas: Number(cfg.regras?.minCaixas) || 4 })} saving={salvando === 'regras'}>
        <Campo label="Pedido mínimo (caixas)" value={cfg.regras?.minCaixas ?? 4} inputMode="numeric"
          onChange={e => up('regras', { minCaixas: e.target.value })} />
        <p className="text-xs text-gray-400">O cliente não consegue finalizar abaixo desse número de caixas.</p>
      </Secao>

      {/* Hero */}
      <Secao titulo="Página inicial (hero)" icon={Megaphone} onSave={() => salvarSecao('hero', cfg.hero)} saving={salvando === 'hero'}>
        <Campo label="Kicker (linha pequena)" value={cfg.hero?.kicker || ''} onChange={e => up('hero', { kicker: e.target.value })} />
        <Campo label="Título" value={cfg.hero?.titulo || ''} onChange={e => up('hero', { titulo: e.target.value })} />
        <div>
          <label className="text-xs text-gray-500">Subtítulo</label>
          <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-20"
            value={cfg.hero?.subtitulo || ''} onChange={e => up('hero', { subtitulo: e.target.value })} />
        </div>
      </Secao>

      {/* Indicação + Frete */}
      <Secao titulo="Indicação e entrega" icon={Gift} onSave={async () => { await salvarSecao('indicacao', { ...cfg.indicacao, credito: Number(cfg.indicacao?.credito) || 0 }); await salvarSecao('freteTexto', cfg.freteTexto); }} saving={salvando === 'indicacao' || salvando === 'freteTexto'}>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={!!cfg.indicacao?.ativo} onChange={e => up('indicacao', { ativo: e.target.checked })} />
          Programa de indicação ativo
        </label>
        <Campo label="Crédito por indicação (R$)" value={cfg.indicacao?.credito ?? 20} inputMode="decimal"
          onChange={e => up('indicacao', { credito: e.target.value })} />
        <div>
          <label className="text-xs text-gray-500 flex items-center gap-1"><Truck className="h-3 w-3" /> Texto da entrega no checkout</label>
          <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={cfg.freteTexto || ''}
            onChange={e => setCfg(c => ({ ...c, freteTexto: e.target.value }))} />
        </div>
      </Secao>

      {/* Como funciona */}
      <Secao titulo="Como funciona (4 passos)" icon={ListChecks} className="lg:col-span-2"
        onSave={() => salvarSecao('comoFunciona', cfg.comoFunciona)} saving={salvando === 'comoFunciona'}>
        <div className="grid sm:grid-cols-2 gap-3">
          {(cfg.comoFunciona || []).map((p, i) => (
            <div key={i} className="bg-gray-50 rounded-lg p-3 space-y-2">
              <Campo label={`Passo ${i + 1} — título`} value={p.titulo}
                onChange={e => setCfg(c => { const arr = [...c.comoFunciona]; arr[i] = { ...arr[i], titulo: e.target.value }; return { ...c, comoFunciona: arr }; })} />
              <Campo label="Descrição" value={p.desc}
                onChange={e => setCfg(c => { const arr = [...c.comoFunciona]; arr[i] = { ...arr[i], desc: e.target.value }; return { ...c, comoFunciona: arr }; })} />
            </div>
          ))}
        </div>
      </Secao>

      {/* Avaliações */}
      <div className="lg:col-span-2">
        <Avaliacoes lista={avaliacoes} onChanged={carregar} />
      </div>
    </div>
  );
}

function LogoUploader({ logoUrl, onChanged }) {
  const inputRef = useRef(null);
  const [enviando, setEnviando] = useState(false);

  const escolher = () => inputRef.current?.click();
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return toast.error('Imagem muito grande (máx 3MB)');
    setEnviando(true);
    try {
      const { logoUrl: url } = await kitFestaService.uploadLogo(file);
      onChanged(url);
      toast.success('Logo atualizada');
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao enviar logo'); }
    finally { setEnviando(false); if (inputRef.current) inputRef.current.value = ''; }
  };

  return (
    <div>
      <label className="text-xs text-gray-500">Logo do site</label>
      <div className="flex items-center gap-3 mt-1">
        <div className="w-16 h-16 rounded-lg bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
          {imgUrl(logoUrl) ? <img src={imgUrl(logoUrl)} alt="logo" className="w-full h-full object-contain" />
            : <ImageIcon className="h-5 w-5 text-gray-500" />}
        </div>
        <div>
          <button type="button" onClick={escolher} disabled={enviando}
            className="text-xs px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex items-center gap-1.5 disabled:opacity-50">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Trocar logo
          </button>
          <p className="text-[11px] text-gray-400 mt-1">PNG com fundo transparente · máx 3MB</p>
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      </div>
    </div>
  );
}

function Secao({ titulo, icon: Icon, children, onSave, saving, className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800 flex items-center gap-1.5 text-sm">
          <Icon className="h-4 w-4 text-emerald-600" /> {titulo}
        </h3>
        <button onClick={onSave} disabled={saving}
          className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar
        </button>
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

// ── Avaliações ──
function Avaliacoes({ lista, onChanged }) {
  const vazio = { nome: '', evento: '', texto: '', estrelas: 5, dataLabel: '', ordem: lista.length, ativo: true };
  const [form, setForm] = useState(vazio);
  const [editId, setEditId] = useState(null);

  const salvar = async () => {
    if (!form.nome.trim() || !form.texto.trim()) return toast.error('Preencha nome e texto');
    try {
      await kitFestaService.salvarAvaliacao(editId, form);
      toast.success('Avaliação salva'); setForm(vazio); setEditId(null); onChanged();
    } catch { toast.error('Erro ao salvar'); }
  };
  const editar = (a) => { setEditId(a.id); setForm({ nome: a.nome, evento: a.evento || '', texto: a.texto, estrelas: a.estrelas, dataLabel: a.dataLabel || '', ordem: a.ordem, ativo: a.ativo }); };
  const remover = async (a) => { if (!confirm('Remover avaliação?')) return; await kitFestaService.removerAvaliacao(a.id); onChanged(); };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="font-semibold text-gray-800 flex items-center gap-1.5 text-sm mb-3">
        <Star className="h-4 w-4 text-amber-400 fill-amber-400" /> Avaliações de clientes
      </h3>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Nome" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
            <Campo label="Evento" value={form.evento} onChange={e => setForm({ ...form, evento: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-500">Texto</label>
            <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-16" value={form.texto}
              onChange={e => setForm({ ...form, texto: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">Estrelas</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.estrelas}
                onChange={e => setForm({ ...form, estrelas: Number(e.target.value) })}>
                {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} ★</option>)}
              </select>
            </div>
            <Campo label="Data (texto)" value={form.dataLabel} onChange={e => setForm({ ...form, dataLabel: e.target.value })} placeholder="mai/2026" />
          </div>
          <div className="flex gap-2">
            <button onClick={salvar} className="flex-1 bg-emerald-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-700 flex items-center justify-center gap-1">
              <Plus className="h-4 w-4" /> {editId ? 'Salvar' : 'Adicionar'}
            </button>
            {editId && <button onClick={() => { setEditId(null); setForm(vazio); }} className="px-3 text-sm text-gray-500 border border-gray-200 rounded-lg">Cancelar</button>}
          </div>
        </div>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {lista.map(a => (
            <div key={a.id} className="bg-gray-50 rounded-lg p-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="font-medium text-gray-800">{a.nome} <span className="text-amber-400">{'★'.repeat(a.estrelas)}</span></div>
                <div className="flex gap-1">
                  <button onClick={() => editar(a)} className="text-xs text-emerald-600">editar</button>
                  <button onClick={() => remover(a)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <div className="text-xs text-gray-400">{a.evento} · {a.dataLabel}</div>
              <p className="text-xs text-gray-600 mt-1 line-clamp-2">{a.texto}</p>
            </div>
          ))}
          {lista.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Nenhuma avaliação cadastrada.</p>}
        </div>
      </div>
    </div>
  );
}
