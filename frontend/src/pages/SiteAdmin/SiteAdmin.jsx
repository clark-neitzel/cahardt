import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Snowflake, Package, ClipboardList, Settings, Search, Check, X, Link2, Trash2, RefreshCw, Plus, Star, ImageOff, Save, Loader2, Store, Megaphone, Upload, Image as ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import congeladosService from '../../services/congeladosService';
import api, { API_URL } from '../../services/api';

const money = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
const imgUrl = (u) => !u ? null : (u.startsWith('http') ? u : `${API_URL}${u}`);

const STATUS_INFO = {
  AGUARDANDO: { label: 'Aguardando', cls: 'bg-amber-100 text-amber-700' },
  PENDENTE_CADASTRO: { label: 'Sem cadastro', cls: 'bg-orange-100 text-orange-700' },
  CONVERTIDO: { label: 'Convertido', cls: 'bg-green-100 text-green-700' },
  RECUSADO: { label: 'Recusado', cls: 'bg-red-100 text-red-700' },
  CANCELADO: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-600' },
};

const TABS = [
  { id: 'pedidos', label: 'Pedidos', icon: ClipboardList },
  { id: 'produtos', label: 'Produtos', icon: Package },
  { id: 'config', label: 'Configurações', icon: Settings },
];

export default function SiteAdmin() {
  const [tab, setTab] = useState('pedidos');
  const linkCliente = `${window.location.origin}/congelados`;
  const linkHome = `${window.location.origin}/inicio`;
  const copiar = () => navigator.clipboard.writeText(linkCliente).then(() => toast.success('Link copiado!'));

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 py-4">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Snowflake className="h-6 w-6 text-sky-500" />
          <div>
            <h1 className="text-xl font-bold text-gray-800">Site · Congelados</h1>
            <p className="text-xs text-gray-500">Página principal · pedidos de congelados · conversão em pedidos</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href={linkHome} target="_blank" rel="noreferrer"
            className="text-xs px-3 py-2 rounded-lg border border-sky-200 text-sky-700 hover:bg-sky-50 flex items-center gap-1.5">
            <Link2 className="h-4 w-4" /> Abrir site
          </a>
          <button onClick={copiar} className="text-xs px-3 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700 flex items-center gap-1.5">
            Copiar link do cliente
          </button>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 overflow-x-auto border-b border-gray-200 mb-4 -mx-1 px-1">
        {TABS.map(t => {
          const Icon = t.icon; const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${active ? 'border-sky-600 text-sky-700 font-semibold' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'pedidos' && <PedidosTab />}
      {tab === 'produtos' && <ProdutosTab />}
      {tab === 'config' && <ConfigTab />}
    </div>
  );
}

/* ===================== PEDIDOS ===================== */
function PedidosTab() {
  const [pedidos, setPedidos] = useState([]);
  const [status, setStatus] = useState('');
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [aprovar, setAprovar] = useState(null);
  const [vincular, setVincular] = useState(null);

  const carregar = useCallback(() => {
    setLoading(true);
    congeladosService.pedidos({ status: status || undefined, busca: busca || undefined })
      .then(setPedidos).catch(() => setPedidos([])).finally(() => setLoading(false));
  }, [status, busca]);
  useEffect(() => { carregar(); }, [carregar]);

  const recusar = async (p) => {
    const motivo = window.prompt('Motivo da recusa (opcional):') ?? '';
    await congeladosService.recusarPedido(p.id, motivo); carregar();
  };
  const excluir = async (p) => {
    if (!window.confirm(`Excluir o pedido #${p.numero}? Não pode ser desfeito.`)) return;
    try { await congeladosService.excluirPedido(p.id); carregar(); }
    catch (e) { toast.error(e?.response?.data?.error || 'Erro ao excluir.'); }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome, documento, telefone…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-200 focus:border-sky-400" />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">Todos os status</option>
          {Object.keys(STATUS_INFO).map(s => <option key={s} value={s}>{STATUS_INFO[s].label}</option>)}
        </select>
        <button onClick={carregar} className="p-2 border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50"><RefreshCw size={16} /></button>
      </div>

      {loading ? <p className="text-gray-400 text-sm py-10 text-center">Carregando…</p>
        : pedidos.length === 0 ? <p className="text-gray-400 text-sm py-10 text-center">Nenhum pedido do site ainda.</p>
          : (
            <div className="space-y-3">
              {pedidos.map(p => (
                <PedidoCard key={p.id} p={p}
                  onAprovar={() => setAprovar(p)} onVincular={() => setVincular(p)}
                  onRecusar={() => recusar(p)} onExcluir={() => excluir(p)} />
              ))}
            </div>
          )}

      {aprovar && <AprovarModal pedido={aprovar} onClose={() => setAprovar(null)} onDone={() => { setAprovar(null); carregar(); }} />}
      {vincular && <VincularModal pedido={vincular} onClose={() => setVincular(null)} onDone={() => { setVincular(null); carregar(); }} />}
    </div>
  );
}

function PedidoCard({ p, onAprovar, onVincular, onRecusar, onExcluir }) {
  const s = STATUS_INFO[p.status] || { label: p.status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-sky-50 text-sky-600">#{p.numero}</span>
            <b className="text-gray-800">{p.nomeCliente}</b>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>{s.label}</span>
            {p.celularAlterado && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">telefone novo</span>}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Doc: {p.documentoCliente}{p.telefoneCliente ? ` · ${p.telefoneCliente}` : ''}
            {p.condicaoNome ? ` · ${p.condicaoNome}` : ''}{p.diaEntrega ? ` · entrega ${p.diaEntrega}` : ''}
          </div>
        </div>
        <div className="text-right">
          <div className="font-bold text-gray-800">{money(p.total)}</div>
          <div className="text-xs text-gray-400">{p.totalCaixas} cx</div>
        </div>
      </div>

      <div className="mt-3 text-sm text-gray-600 grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        {p.itens.map(it => (
          <div key={it.id} className="flex justify-between py-0.5 border-b border-gray-50">
            <span>{it.quantidade}× {it.nomeProduto}</span>
            <span className="text-gray-400">{money(it.precoUnitario * it.quantidade)}</span>
          </div>
        ))}
      </div>
      {p.observacoes && <p className="mt-2 text-xs text-gray-500 italic">Obs: {p.observacoes}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {p.pedido ? (
          <span className="inline-flex items-center gap-1 text-sm text-green-700 font-medium">
            <Check size={15} /> Virou pedido {p.pedido.especial ? 'especial' : ''} {p.pedido.numero ? `#${p.pedido.numero}` : ''}
          </span>
        ) : p.status === 'PENDENTE_CADASTRO' ? (
          <>
            <button onClick={onVincular} className="btn-sky"><Link2 size={15} /> Vincular cliente</button>
            <button onClick={onRecusar} className="btn-ghost-red"><X size={15} /> Recusar</button>
          </>
        ) : p.status === 'AGUARDANDO' ? (
          <>
            <button onClick={onAprovar} className="btn-sky"><Check size={15} /> Aprovar e gerar pedido</button>
            <button onClick={onRecusar} className="btn-ghost-red"><X size={15} /> Recusar</button>
          </>
        ) : null}
        <button onClick={onExcluir} className="ml-auto text-gray-400 hover:text-red-500 p-1.5" title="Excluir"><Trash2 size={15} /></button>
      </div>

      <style>{`
        .btn-sky{display:inline-flex;align-items:center;gap:6px;background:#0284c7;color:#fff;font-size:.82rem;font-weight:600;padding:.45em .9em;border-radius:8px}
        .btn-sky:hover{background:#0369a1}
        .btn-ghost-red{display:inline-flex;align-items:center;gap:6px;border:1px solid #fca5a5;color:#dc2626;font-size:.82rem;font-weight:600;padding:.45em .9em;border-radius:8px}
        .btn-ghost-red:hover{background:#fef2f2}
      `}</style>
    </div>
  );
}

function AprovarModal({ pedido, onClose, onDone }) {
  const [tipo, setTipo] = useState('NORMAL');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const confirmar = async () => {
    setErro(''); setBusy(true);
    try { await congeladosService.aprovarPedido(pedido.id, { tipoConversao: tipo }); onDone(); }
    catch (e) { setErro(e?.response?.data?.error || 'Erro ao aprovar.'); }
    finally { setBusy(false); }
  };
  return (
    <Modal onClose={onClose} title={`Aprovar pedido #${pedido.numero}`}>
      <p className="text-sm text-gray-500 mb-3">Gerar um pedido no sistema a partir deste pedido do site.{pedido.condicaoNome ? ` Condição: ${pedido.condicaoNome}.` : ''}</p>
      <div className="space-y-2 mb-4">
        {['NORMAL', 'ESPECIAL'].map(t => (
          <label key={t} className={`flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer ${tipo === t ? 'border-sky-400 bg-sky-50' : 'border-gray-200'}`}>
            <input type="radio" name="tipo" checked={tipo === t} onChange={() => setTipo(t)} />
            <span className="text-sm font-medium text-gray-700">{t === 'NORMAL' ? 'Pedido normal (com nota / vai ao Conta Azul)' : 'Pedido especial (sem nota)'}</span>
          </label>
        ))}
      </div>
      {erro && <p className="text-sm text-red-600 mb-3">{erro}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
        <button onClick={confirmar} disabled={busy} className="px-4 py-2 text-sm font-semibold bg-sky-600 text-white rounded-lg disabled:opacity-50">{busy ? 'Gerando…' : 'Gerar pedido'}</button>
      </div>
    </Modal>
  );
}

function VincularModal({ pedido, onClose, onDone }) {
  const [q, setQ] = useState(pedido.documentoCliente || '');
  const [res, setRes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const buscar = useCallback(async (termo) => {
    if (!termo || termo.length < 2) { setRes([]); return; }
    try { const r = await api.get('/clientes/buscar-global', { params: { q: termo } }); setRes(r.data?.data || []); }
    catch { setRes([]); }
  }, []);
  useEffect(() => { const t = setTimeout(() => buscar(q), 350); return () => clearTimeout(t); }, [q, buscar]);
  const vincular = async (c) => {
    setErro(''); setBusy(true);
    try { await congeladosService.vincularCliente(pedido.id, c.UUID); onDone(); }
    catch (e) { setErro(e?.response?.data?.error || 'Erro ao vincular.'); setBusy(false); }
  };
  return (
    <Modal onClose={onClose} title={`Vincular cliente · pedido #${pedido.numero}`}>
      <p className="text-sm text-gray-500 mb-3">Procure o cadastro do cliente no sistema (Conta Azul) e vincule. Depois você poderá aprovar.</p>
      <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="Nome, documento ou código…"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 focus:ring-2 focus:ring-sky-200" />
      {erro && <p className="text-sm text-red-600 mb-2">{erro}</p>}
      <div className="max-h-64 overflow-y-auto space-y-1">
        {res.map(c => (
          <button key={c.UUID} disabled={busy} onClick={() => vincular(c)}
            className="w-full text-left px-3 py-2 rounded-lg border border-gray-100 hover:bg-sky-50 disabled:opacity-50">
            <div className="text-sm font-medium text-gray-800">{c.NomeFantasia || c.Nome}</div>
            <div className="text-xs text-gray-400">{c.Documento || 's/ doc'}{c.Codigo ? ` · cód ${c.Codigo}` : ''}</div>
          </button>
        ))}
        {q.length >= 2 && res.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">Nenhum cliente encontrado.</p>}
      </div>
    </Modal>
  );
}

/* ===================== PRODUTOS ===================== */
const LS_FILTRO = 'congeladosAdmin.produtos.filtro';
const LS_CATS = 'congeladosAdmin.produtos.cats';

function ProdutosTab() {
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState(() => localStorage.getItem(LS_FILTRO) || 'todos');
  const [cats, setCats] = useState(() => { try { return JSON.parse(localStorage.getItem(LS_CATS)) || []; } catch { return []; } });
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(null);

  // persiste filtros
  useEffect(() => { localStorage.setItem(LS_FILTRO, filtro); }, [filtro]);
  useEffect(() => { localStorage.setItem(LS_CATS, JSON.stringify(cats)); }, [cats]);

  const carregar = useCallback(() => {
    setLoading(true);
    congeladosService.produtosApp({ busca: busca || undefined })
      .then(setProdutos).catch(() => setProdutos([])).finally(() => setLoading(false));
  }, [busca]);
  useEffect(() => { const t = setTimeout(carregar, busca ? 350 : 0); return () => clearTimeout(t); }, [busca, carregar]);
  useEffect(() => { api.get('/categorias-produto').then(r => setCategorias(Array.isArray(r.data) ? r.data : (r.data?.data || []))).catch(() => {}); }, []);

  const toggleCat = (id) => setCats(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);

  const filtrados = produtos.filter(p => {
    if (filtro === 'nosite' && !p.noSite) return false;
    if (filtro === 'fora' && p.noSite) return false;
    if (cats.length && !cats.includes(p.categoriaComercialId)) return false;
    return true;
  });

  const toggleSite = async (p) => {
    if (p.noSite) {
      if (!window.confirm(`Tirar "${p.nome}" do site de congelados?`)) return;
      await congeladosService.removerProdutoSite(p.produtoId); toast.success('Removido do site');
    } else {
      await congeladosService.salvarProdutoSite(p.produtoId, { ativo: true }); toast.success('Adicionado ao site');
    }
    carregar();
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm" placeholder="Buscar produto do app..."
            value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[['todos', 'Todos'], ['nosite', 'No site'], ['fora', 'Fora']].map(([v, l]) => (
            <button key={v} onClick={() => setFiltro(v)}
              className={`px-3 py-1.5 text-xs rounded-md ${filtro === v ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500'}`}>{l}</button>
          ))}
        </div>
      </div>

      {/* Categorias comerciais (multi-seleção, salvas) */}
      {categorias.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3 items-center">
          <span className="text-xs text-gray-400 mr-1">Categorias:</span>
          {categorias.map(c => (
            <button key={c.id} onClick={() => toggleCat(c.id)}
              className={`text-xs px-2.5 py-1 rounded-full border ${cats.includes(c.id) ? 'bg-sky-600 text-white border-sky-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{c.nome}</button>
          ))}
          {cats.length > 0 && <button onClick={() => setCats([])} className="text-xs text-gray-400 underline ml-1">limpar</button>}
        </div>
      )}
      <p className="text-xs text-gray-400 mb-3">Escolha os produtos congelados que aparecem no site. Os do Kit Festa aparecem sinalizados — decida em qual site cada um entra.</p>

      {loading ? <div className="p-12 text-center text-gray-400"><Loader2 className="h-6 w-6 animate-spin inline" /></div>
        : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtrados.map(p => (
              <div key={p.produtoId} className={`bg-white rounded-xl border p-3 flex gap-3 ${p.noSite ? 'border-sky-200' : 'border-gray-200'}`}>
                <div className="w-16 h-16 rounded-lg bg-gray-100 shrink-0 overflow-hidden flex items-center justify-center">
                  {imgUrl(p.imagem) ? <img src={imgUrl(p.imagem)} alt={p.nome} className="w-full h-full object-cover" /> : <ImageOff className="h-5 w-5 text-gray-300" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-800 truncate">{p.nome}</div>
                  <div className="text-xs text-gray-400">{p.categoriaComercial || '—'}{p.noKitFesta && <span className="ml-1 text-emerald-500">· Kit Festa</span>}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{money(p.site?.precoCongelados ?? p.valorVenda)}
                    {p.site?.destaque && <Star className="h-3 w-3 text-amber-400 inline ml-1 fill-amber-400" />}</div>
                  <div className="flex gap-1.5 mt-2">
                    <button onClick={() => toggleSite(p)}
                      className={`text-xs px-2 py-1 rounded-md flex items-center gap-1 ${p.noSite ? 'bg-sky-50 text-sky-700' : 'bg-gray-100 text-gray-600'}`}>
                      {p.noSite ? <><Check className="h-3 w-3" /> No site</> : <><Plus className="h-3 w-3" /> Add</>}
                    </button>
                    {p.noSite && <button onClick={() => setEditando(p)} className="text-xs px-2 py-1 rounded-md border border-gray-200 text-gray-600">Configurar</button>}
                  </div>
                </div>
              </div>
            ))}
            {filtrados.length === 0 && <div className="col-span-full text-center text-gray-400 text-sm py-12">Nenhum produto.</div>}
          </div>
        )}

      {editando && <ModalConfigProduto produto={editando} onClose={() => setEditando(null)} onSaved={() => { setEditando(null); carregar(); }} />}
    </div>
  );
}

function ModalConfigProduto({ produto, onClose, onSaved }) {
  const s = produto.site || {};
  const [form, setForm] = useState({
    precoCongelados: s.precoCongelados ?? '',
    unidadesPorCaixa: s.unidadesPorCaixa ?? 0,
    descricaoSite: s.descricaoSite || '',
    destaque: !!s.destaque,
    ordem: s.ordem ?? 0,
    ativo: s.ativo !== false,
  });
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    setSalvando(true);
    try {
      await congeladosService.salvarProdutoSite(produto.produtoId, {
        ...form,
        precoCongelados: form.precoCongelados === '' ? '' : Number(String(form.precoCongelados).replace(',', '.')),
      });
      toast.success('Configuração salva'); onSaved();
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  };
  return (
    <Modal onClose={onClose} title={produto.nome}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500">Preço do site (R$)</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.precoCongelados}
              onChange={e => setForm({ ...form, precoCongelados: e.target.value })} placeholder={`app: ${Number(produto.valorVenda).toFixed(2)}`} inputMode="decimal" />
            <p className="text-[11px] text-gray-400 mt-0.5">Vazio = usa o cálculo automático (condição + negociação).</p>
          </div>
          <div>
            <label className="text-xs text-gray-500">Unid. por caixa</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.unidadesPorCaixa}
              onChange={e => setForm({ ...form, unidadesPorCaixa: e.target.value })} inputMode="numeric" placeholder="0 = não mostrar" />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500">Descrição no site</label>
          <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-16" value={form.descricaoSite}
            onChange={e => setForm({ ...form, descricaoSite: e.target.value })} placeholder="Texto que aparece no card do produto" />
        </div>
        <div className="grid grid-cols-2 gap-2 items-center">
          <div>
            <label className="text-xs text-gray-500">Ordem</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.ordem}
              onChange={e => setForm({ ...form, ordem: e.target.value })} inputMode="numeric" />
          </div>
          <div className="space-y-1 pt-4">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={form.destaque} onChange={e => setForm({ ...form, destaque: e.target.checked })} /> Destaque (Mais pedidos)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} /> Ativo no site
            </label>
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={salvar} disabled={salvando}
          className="flex-1 bg-sky-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-sky-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
        </button>
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg">Fechar</button>
      </div>
    </Modal>
  );
}

/* ===================== CONFIGURAÇÕES ===================== */
function ConfigTab() {
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(null);

  const carregar = () => {
    setLoading(true);
    congeladosService.getConfig().then(setCfg).catch(() => toast.error('Erro ao carregar configurações')).finally(() => setLoading(false));
  };
  useEffect(carregar, []);

  const salvarSecao = async (chave, valor) => {
    setSalvando(chave);
    try { await congeladosService.setConfig(chave, valor); toast.success('Salvo'); }
    catch { toast.error('Erro ao salvar'); }
    finally { setSalvando(null); }
  };
  const up = (chave, patch) => setCfg(c => ({ ...c, [chave]: { ...c[chave], ...patch } }));

  if (loading || !cfg) return <div className="p-12 text-center text-gray-400"><Loader2 className="h-6 w-6 animate-spin inline" /></div>;

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Secao titulo="Dados da loja" icon={Store} onSave={() => salvarSecao('loja', cfg.loja)} saving={salvando === 'loja'}>
        <LogoUploader logoUrl={cfg.logoUrl} onChanged={(url) => setCfg(c => ({ ...c, logoUrl: url }))} />
        <Campo label="Nome" value={cfg.loja?.nome || ''} onChange={e => up('loja', { nome: e.target.value })} />
        <Campo label="Slogan" value={cfg.loja?.slogan || ''} onChange={e => up('loja', { slogan: e.target.value })} />
        <Campo label="Desde" value={cfg.loja?.desde || ''} onChange={e => up('loja', { desde: e.target.value })} />
        <Campo label="Endereço" value={cfg.loja?.endereco || ''} onChange={e => up('loja', { endereco: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Telefone (exibição)" value={cfg.loja?.telefone || ''} onChange={e => up('loja', { telefone: e.target.value })} />
          <Campo label="WhatsApp (só números)" value={cfg.loja?.whatsapp || ''} onChange={e => up('loja', { whatsapp: e.target.value })} />
        </div>
        <Campo label="Instagram (sem @)" value={cfg.loja?.instagram || ''} onChange={e => up('loja', { instagram: e.target.value })} />
      </Secao>

      <Secao titulo="Página inicial (hero)" icon={Megaphone} onSave={() => salvarSecao('hero', cfg.hero)} saving={salvando === 'hero'}>
        <Campo label="Kicker (linha pequena)" value={cfg.hero?.kicker || ''} onChange={e => up('hero', { kicker: e.target.value })} />
        <Campo label="Título" value={cfg.hero?.titulo || ''} onChange={e => up('hero', { titulo: e.target.value })} />
        <div>
          <label className="text-xs text-gray-500">Subtítulo</label>
          <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-20" value={cfg.hero?.subtitulo || ''}
            onChange={e => up('hero', { subtitulo: e.target.value })} />
        </div>
      </Secao>

      <Secao titulo="Seção “Dois jeitos de pedir”" icon={Megaphone} onSave={() => salvarSecao('caminhos', cfg.caminhos)} saving={salvando === 'caminhos'}>
        <Campo label="Título" value={cfg.caminhos?.titulo || ''} onChange={e => up('caminhos', { titulo: e.target.value })} />
        <div>
          <label className="text-xs text-gray-500">Subtítulo</label>
          <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-16" value={cfg.caminhos?.subtitulo || ''}
            onChange={e => up('caminhos', { subtitulo: e.target.value })} />
        </div>
      </Secao>

      <Secao titulo="Área de congelados (login)" icon={Settings} onSave={() => salvarSecao('congelados', cfg.congelados)} saving={salvando === 'congelados'}>
        <Campo label="Título do login" value={cfg.congelados?.loginTitulo || ''} onChange={e => up('congelados', { loginTitulo: e.target.value })} />
        <div>
          <label className="text-xs text-gray-500">Texto do login</label>
          <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-16" value={cfg.congelados?.loginSub || ''}
            onChange={e => up('congelados', { loginSub: e.target.value })} />
        </div>
      </Secao>
    </div>
  );
}

const Campo = ({ label, ...props }) => (
  <div>
    <label className="text-xs text-gray-500">{label}</label>
    <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" {...props} />
  </div>
);

function Secao({ titulo, icon: Icon, children, onSave, saving }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800 flex items-center gap-1.5 text-sm"><Icon className="h-4 w-4 text-sky-600" /> {titulo}</h3>
        <button onClick={onSave} disabled={saving}
          className="text-xs px-3 py-1.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 flex items-center gap-1">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar
        </button>
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function LogoUploader({ logoUrl, onChanged }) {
  const inputRef = useRef(null);
  const [enviando, setEnviando] = useState(false);
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return toast.error('Imagem muito grande (máx 3MB)');
    setEnviando(true);
    try { const { logoUrl: url } = await congeladosService.uploadLogo(file); onChanged(url); toast.success('Logo atualizada'); }
    catch (err) { toast.error(err.response?.data?.error || 'Erro ao enviar logo'); }
    finally { setEnviando(false); if (inputRef.current) inputRef.current.value = ''; }
  };
  return (
    <div>
      <label className="text-xs text-gray-500">Logo do site</label>
      <div className="flex items-center gap-3 mt-1">
        <div className="w-16 h-16 rounded-lg bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
          {imgUrl(logoUrl) ? <img src={imgUrl(logoUrl)} alt="logo" className="w-full h-full object-contain" /> : <ImageIcon className="h-5 w-5 text-gray-500" />}
        </div>
        <div>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={enviando}
            className="text-xs px-3 py-2 rounded-lg border border-sky-200 text-sky-700 hover:bg-sky-50 flex items-center gap-1.5 disabled:opacity-50">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Trocar logo
          </button>
          <p className="text-[11px] text-gray-400 mt-1">PNG com fundo transparente · máx 3MB</p>
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      </div>
    </div>
  );
}

/* ===================== MODAL ===================== */
function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
