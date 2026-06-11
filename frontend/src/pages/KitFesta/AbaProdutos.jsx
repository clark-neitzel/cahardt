import React, { useEffect, useState } from 'react';
import { Search, Loader2, Check, Star, X, ImageOff, Tag, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { kitFestaService } from '../../services/kitFestaService';
import { API_URL } from '../../services/api';

const imgUrl = (u) => !u ? null : (u.startsWith('http') ? u : `${API_URL}${u}`);

export default function AbaProdutos() {
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todos'); // todos | site | fora
  const [editando, setEditando] = useState(null); // produto sendo configurado
  const [gerCategorias, setGerCategorias] = useState(false);

  const carregar = () => {
    setLoading(true);
    Promise.all([kitFestaService.produtosApp({ busca }), kitFestaService.categorias()])
      .then(([p, c]) => { setProdutos(p); setCategorias(c); })
      .catch(() => toast.error('Erro ao carregar produtos'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { const t = setTimeout(carregar, busca ? 350 : 0); return () => clearTimeout(t); }, [busca]);

  const filtrados = produtos.filter(p => filtro === 'todos' ? true : filtro === 'site' ? p.noSite : !p.noSite);

  const toggleSite = async (p) => {
    if (p.noSite) {
      if (!confirm(`Tirar "${p.nome}" do site?`)) return;
      await kitFestaService.removerProdutoSite(p.produtoId);
      toast.success('Removido do site');
    } else {
      await kitFestaService.salvarProdutoSite(p.produtoId, { ativo: true, unidadesPorCaixa: 25 });
      toast.success('Adicionado ao site');
    }
    carregar();
  };

  return (
    <div>
      {/* Barra de ações */}
      <div className="flex flex-col md:flex-row md:items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm" placeholder="Buscar produto do app..."
            value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[['todos', 'Todos'], ['site', 'No site'], ['fora', 'Fora']].map(([v, l]) => (
            <button key={v} onClick={() => setFiltro(v)}
              className={`px-3 py-1.5 text-xs rounded-md ${filtro === v ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500'}`}>{l}</button>
          ))}
        </div>
        <button onClick={() => setGerCategorias(true)}
          className="text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1.5">
          <Tag className="h-4 w-4" /> Categorias do site
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-gray-400"><Loader2 className="h-6 w-6 animate-spin inline" /></div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtrados.map(p => (
            <div key={p.produtoId} className={`bg-white rounded-xl border p-3 flex gap-3 ${p.noSite ? 'border-emerald-200' : 'border-gray-200'}`}>
              <div className="w-16 h-16 rounded-lg bg-gray-100 shrink-0 overflow-hidden flex items-center justify-center">
                {imgUrl(p.imagem) ? <img src={imgUrl(p.imagem)} alt={p.nome} className="w-full h-full object-cover" />
                  : <ImageOff className="h-5 w-5 text-gray-300" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-gray-800 truncate">{p.nome}</div>
                <div className="text-xs text-gray-400">{p.categoriaComercial || p.categoriaCA || '—'}</div>
                <div className="text-xs text-gray-500 mt-0.5">R$ {Number(p.site?.precoKitFesta ?? p.valorVenda).toFixed(2).replace('.', ',')}
                  {p.noSite && <span className="text-gray-400"> · {p.site.unidadesPorCaixa}un</span>}
                  {p.site?.destaque && <Star className="h-3 w-3 text-amber-400 inline ml-1 fill-amber-400" />}
                </div>
                <div className="flex gap-1.5 mt-2">
                  <button onClick={() => toggleSite(p)}
                    className={`text-xs px-2 py-1 rounded-md flex items-center gap-1 ${p.noSite ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
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

      {editando && <ModalConfig produto={editando} categorias={categorias} onClose={() => setEditando(null)} onSaved={() => { setEditando(null); carregar(); }} />}
      {gerCategorias && <ModalCategorias categorias={categorias} onClose={() => setGerCategorias(false)} onChanged={carregar} />}
    </div>
  );
}

// ── Modal: configurar produto no site ──
function ModalConfig({ produto, categorias, onClose, onSaved }) {
  const s = produto.site || {};
  const [form, setForm] = useState({
    categoriaId: s.categoriaId || '',
    unidadesPorCaixa: s.unidadesPorCaixa ?? 25,
    precoKitFesta: s.precoKitFesta ?? '',
    descricaoSite: s.descricaoSite || '',
    tags: (s.tags || []).join(', '),
    opcoes: (s.opcoes || []).join(', '),
    destaque: !!s.destaque,
    ordem: s.ordem ?? 0,
    ativo: s.ativo !== false,
  });
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    setSalvando(true);
    try {
      await kitFestaService.salvarProdutoSite(produto.produtoId, {
        ...form,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        opcoes: form.opcoes.split(',').map(t => t.trim()).filter(Boolean),
        precoKitFesta: form.precoKitFesta === '' ? null : Number(form.precoKitFesta),
      });
      toast.success('Configuração salva');
      onSaved();
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">{produto.nome}</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs text-gray-500">Categoria no site</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.categoriaId}
              onChange={e => setForm({ ...form, categoriaId: e.target.value })}>
              <option value="">— sem categoria —</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">Unidades por caixa</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.unidadesPorCaixa}
                onChange={e => setForm({ ...form, unidadesPorCaixa: e.target.value })} inputMode="numeric" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Preço Kit Festa (R$)</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.precoKitFesta}
                onChange={e => setForm({ ...form, precoKitFesta: e.target.value })} placeholder={`app: ${Number(produto.valorVenda).toFixed(2)}`} inputMode="decimal" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">Descrição no site</label>
            <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-16" value={form.descricaoSite}
              onChange={e => setForm({ ...form, descricaoSite: e.target.value })} placeholder="Texto que aparece no card do produto" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">Tags (vírgula)</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.tags}
                onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="Mais pedido, Novidade" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Opções (vírgula)</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.opcoes}
                onChange={e => setForm({ ...form, opcoes: e.target.value })} placeholder="Frango, Palmito" />
            </div>
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
        <div className="p-4 border-t border-gray-100 flex gap-2">
          <button onClick={salvar} disabled={salvando}
            className="flex-1 bg-emerald-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg">Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: gerenciar categorias do site ──
function ModalCategorias({ categorias, onClose, onChanged }) {
  const [lista, setLista] = useState(categorias);
  const [nova, setNova] = useState('');

  const recarregar = () => kitFestaService.categorias().then(c => { setLista(c); onChanged(); });

  const add = async () => {
    if (!nova.trim()) return;
    await kitFestaService.salvarCategoria(null, { nome: nova.trim(), ordem: lista.length });
    setNova(''); recarregar();
  };
  const remover = async (c) => {
    if (!confirm(`Remover categoria "${c.nome}"? Os produtos ficam sem categoria.`)) return;
    await kitFestaService.removerCategoria(c.id); recarregar();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Categorias do site</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <div className="p-4 space-y-2">
          {lista.map(c => (
            <div key={c.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
              <span className="text-sm text-gray-700">{c.nome} <span className="text-xs text-gray-400">/{c.slug}</span></span>
              <button onClick={() => remover(c)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          {lista.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Nenhuma categoria. Ex: Fritos, De forno, Doces.</p>}
          <div className="flex gap-2 pt-2">
            <input className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Nova categoria" value={nova}
              onChange={e => setNova(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
            <button onClick={add} className="bg-emerald-600 text-white rounded-lg px-3 text-sm"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
