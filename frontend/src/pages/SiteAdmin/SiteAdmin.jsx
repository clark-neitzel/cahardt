import React, { useEffect, useState, useCallback } from 'react';
import { Snowflake, Package, ClipboardList, Search, Check, X, Link2, Trash2, RefreshCw } from 'lucide-react';
import congeladosService from '../../services/congeladosService';
import api from '../../services/api';

const money = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');

const STATUS_INFO = {
  AGUARDANDO: { label: 'Aguardando', cls: 'bg-amber-100 text-amber-700' },
  PENDENTE_CADASTRO: { label: 'Sem cadastro', cls: 'bg-orange-100 text-orange-700' },
  CONVERTIDO: { label: 'Convertido', cls: 'bg-green-100 text-green-700' },
  RECUSADO: { label: 'Recusado', cls: 'bg-red-100 text-red-700' },
  CANCELADO: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-600' },
};

export default function SiteAdmin() {
  const [tab, setTab] = useState('pedidos');
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Snowflake className="text-sky-500" size={26} />
        <h1 className="text-2xl font-bold text-gray-800">Site · Congelados</h1>
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-5">
        <TabBtn active={tab === 'pedidos'} onClick={() => setTab('pedidos')} icon={ClipboardList} label="Pedidos do site" />
        <TabBtn active={tab === 'produtos'} onClick={() => setTab('produtos')} icon={Package} label="Produtos no site" />
      </div>

      {tab === 'pedidos' ? <PedidosTab /> : <ProdutosTab />}
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${active ? 'border-sky-500 text-sky-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
      <Icon size={16} /> {label}
    </button>
  );
}

/* ===================== PEDIDOS ===================== */
function PedidosTab() {
  const [pedidos, setPedidos] = useState([]);
  const [status, setStatus] = useState('');
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [aprovar, setAprovar] = useState(null);   // pedido p/ aprovar
  const [vincular, setVincular] = useState(null); // pedido p/ vincular

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
    catch (e) { alert(e?.response?.data?.error || 'Erro ao excluir.'); }
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
          <div className="flex items-center gap-2">
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
function ProdutosTab() {
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [busca, setBusca] = useState('');
  const [cat, setCat] = useState('');
  const [filtro, setFiltro] = useState('todos'); // todos | nosite | fora
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(() => {
    setLoading(true);
    congeladosService.produtosApp({ busca: busca || undefined, categoriaComercialId: cat || undefined })
      .then(setProdutos).catch(() => setProdutos([])).finally(() => setLoading(false));
  }, [busca, cat]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { api.get('/categorias-produto').then(r => setCategorias(Array.isArray(r.data) ? r.data : (r.data?.data || []))).catch(() => {}); }, []);

  const toggle = async (p) => {
    if (p.noSite) await congeladosService.removerProdutoSite(p.produtoId);
    else await congeladosService.salvarProdutoSite(p.produtoId, { ativo: true });
    carregar();
  };
  const salvarCampo = async (p, campo, valor) => {
    await congeladosService.salvarProdutoSite(p.produtoId, { [campo]: valor });
    carregar();
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar produto…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-200 focus:border-sky-400" />
        </div>
        <select value={cat} onChange={e => setCat(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">Todas as categorias comerciais</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[['todos', 'Todos'], ['nosite', 'No site'], ['fora', 'Fora']].map(([id, lbl]) => (
            <button key={id} onClick={() => setFiltro(id)}
              className={`px-3 py-1.5 text-sm rounded-md ${filtro === id ? 'bg-white shadow-sm text-sky-600 font-medium' : 'text-gray-500'}`}>{lbl}</button>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-3">Marque os produtos que aparecem no site de congelados. O preço usa o valor de venda do produto, salvo se você informar um preço específico para o site. Produtos que já estão no Kit Festa aparecem sinalizados — escolha em qual site cada produto entra.</p>

      {loading ? <p className="text-gray-400 text-sm py-10 text-center">Carregando…</p>
        : (
          <div className="space-y-2">
            {produtos.filter(p => filtro === 'todos' ? true : filtro === 'nosite' ? p.noSite : !p.noSite).map(p => (
              <div key={p.produtoId} className={`flex flex-wrap items-center gap-3 border rounded-xl p-3 ${p.noSite ? 'border-sky-200 bg-sky-50/40' : 'border-gray-200 bg-white'}`}>
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center">
                  {p.imagem ? <img src={p.imagem.startsWith('http') ? p.imagem : `${api.defaults.baseURL.replace('/api', '')}${p.imagem}`} alt="" className="w-full h-full object-cover" /> : <Package size={18} className="text-gray-300" />}
                </div>
                <div className="flex-1 min-w-[160px]">
                  <div className="text-sm font-medium text-gray-800">{p.nome}</div>
                  <div className="text-xs text-gray-400">cód {p.codigo} · {money(p.valorVenda)}{p.categoriaComercial ? ` · ${p.categoriaComercial}` : ''}{p.noKitFesta ? ' · também no Kit Festa' : ''}</div>
                </div>
                {p.noSite && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500">Preço site</label>
                    <input defaultValue={p.site?.precoCongelados ?? ''} placeholder={money(p.valorVenda)}
                      onBlur={e => { const v = e.target.value.trim(); salvarCampo(p, 'precoCongelados', v === '' ? '' : Number(v.replace(',', '.'))); }}
                      className="w-24 px-2 py-1 border border-gray-300 rounded text-sm" />
                  </div>
                )}
                <button onClick={() => toggle(p)}
                  className={`text-sm font-semibold px-3 py-1.5 rounded-lg ${p.noSite ? 'bg-sky-600 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                  {p.noSite ? 'No site ✓' : 'Adicionar'}
                </button>
              </div>
            ))}
            {produtos.length === 0 && <p className="text-gray-400 text-sm py-10 text-center">Nenhum produto encontrado.</p>}
          </div>
        )}
    </div>
  );
}

/* ===================== MODAL ===================== */
function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
