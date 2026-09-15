import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Package, ToggleLeft, ToggleRight, Pencil, ArrowUpRight, Repeat, Trash2, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import pcpItemService from '../../services/pcpItemService';
import categoriaProdutoService from '../../services/categoriaProdutoService';
import api from '../../services/api';
import SelectBusca from '../../components/SelectBusca';
import { useFiltroSalvo } from '../../hooks/useFiltrosSalvos';
import { useAtualizaAoVoltar } from '../../hooks/useAtualizaAoVoltar';

const TIPO_CORES = {
    MP: 'bg-amber-100 text-amber-800',
    SUB: 'bg-purple-100 text-purple-800',
    PA: 'bg-green-100 text-green-800',
    EMB: 'bg-blue-100 text-blue-800',
};

const TIPOS = [
    { value: 'MP', label: 'Matéria-Prima' },
    { value: 'SUB', label: 'Subproduto' },
    { value: 'PA', label: 'Produto Acabado' },
    { value: 'EMB', label: 'Embalagem' },
];

// Modal "Enviar para Produtos" (promover órfão) — D3 do plano: item do PCP sem produto por
// trás vira um Produto de verdade. Categoria Matéria-Prima/Embalagem mantém o item ativo como
// espelho; qualquer outra categoria INATIVA o item (o estoque dele não é transferido sozinho).
const ModalPromoverProduto = ({ item, onCancelar, onConfirmado }) => {
    const [nome, setNome] = useState(item?.nome || '');
    const [categoria, setCategoria] = useState('');
    const [categoriaProdutoId, setCategoriaProdutoId] = useState('');
    const [controle, setControle] = useState('segue');
    const [categoriasEstoque, setCategoriasEstoque] = useState([]);
    const [categoriasProduto, setCategoriasProduto] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [enviando, setEnviando] = useState(false);

    useEffect(() => {
        Promise.all([
            api.get('/categorias-estoque').then(r => (Array.isArray(r?.data) ? r.data : [])).catch(() => []),
            categoriaProdutoService.listar().catch(() => [])
        ]).then(([ce, cp]) => {
            setCategoriasEstoque(ce);
            setCategoriasProduto(Array.isArray(cp) ? cp : []);
        }).finally(() => setCarregando(false));
    }, []);

    const categoriaEscolhida = categoriasEstoque.find(c => c.nome === categoria);
    const ehProducao = categoriaEscolhida && /materia.?prima|embalagem/i.test(
        categoriaEscolhida.nome.normalize('NFD').replace(/[̀-ͯ]/g, '')
    );

    const confirmar = async () => {
        if (!categoria.trim()) { toast.error('Escolha a categoria do produto — é obrigatória.'); return; }
        if (!ehProducao) {
            const ok = window.confirm(
                `A categoria "${categoria}" não é de produção (Matéria-Prima/Embalagem).\n\n` +
                `Este item do PCP será INATIVADO e o estoque dele NÃO é transferido sozinho para o produto novo — confirme e ajuste o estoque manualmente depois, se precisar.\n\nContinuar?`
            );
            if (!ok) return;
        }
        setEnviando(true);
        try {
            const resp = await pcpItemService.promoverProduto(item.id, {
                nome: nome.trim() || undefined,
                categoria: categoria.trim(),
                categoriaProdutoId: categoriaProdutoId || undefined,
                controlaEstoque: controle === 'segue' ? undefined : controle === 'true'
            });
            toast.success(
                resp?.tornouEspelhoPcp
                    ? `Produto "${resp?.produto?.nome || nome}" criado — o item continua no PCP como espelho.`
                    : `Produto "${resp?.produto?.nome || nome}" criado — o item do PCP foi inativado.${resp?.estoqueNaoTransferido ? ` Estoque não transferido: ${resp.estoqueNaoTransferido}.` : ''}`,
                { duration: 8000 }
            );
            onConfirmado();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Não foi possível promover este item a produto.');
        } finally {
            setEnviando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 p-0 md:p-4" onClick={() => !enviando && onCancelar()}>
            <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-lg p-5 space-y-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900">Enviar para Produtos</h2>
                    <button onClick={onCancelar} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"><X className="h-5 w-5" /></button>
                </div>
                <p className="text-xs text-gray-500">
                    Este item do PCP não tem produto por trás — vira um produto de verdade, com categoria, controle de estoque e histórico.
                </p>
                <div>
                    <label className="text-sm font-medium text-gray-700">Nome do produto</label>
                    <input value={nome} onChange={e => setNome(e.target.value)}
                        className="mt-1 w-full min-h-[44px] border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                </div>
                <div>
                    <label className="text-sm font-medium text-gray-700">Categoria *</label>
                    <SelectBusca value={categoria} onChange={e => setCategoria(e.target.value)} className="mt-1 w-full">
                        <option value="">{carregando ? 'Carregando…' : 'Escolher categoria…'}</option>
                        {categoriasEstoque.map(c => <option key={c.nome} value={c.nome}>{c.nome}</option>)}
                    </SelectBusca>
                    {categoria && (
                        <small className={`text-xs ${ehProducao ? 'text-green-700' : 'text-amber-700'}`}>
                            {ehProducao
                                ? 'Categoria de produção: o item continua ativo no PCP como espelho.'
                                : 'Categoria fora de produção: o item do PCP será inativado (estoque não é transferido sozinho).'}
                        </small>
                    )}
                </div>
                <div>
                    <label className="text-sm font-medium text-gray-700">Categoria comercial</label>
                    <SelectBusca value={categoriaProdutoId} onChange={e => setCategoriaProdutoId(e.target.value)} className="mt-1 w-full">
                        <option value="">— nenhuma —</option>
                        {categoriasProduto.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </SelectBusca>
                </div>
                <div>
                    <label className="text-sm font-medium text-gray-700">Controle de estoque</label>
                    <div className="mt-1 flex flex-wrap gap-2">
                        {[{ value: 'segue', label: 'Segue a categoria' }, { value: 'true', label: 'Controlar sempre' }, { value: 'false', label: 'Nunca controlar' }].map(o => (
                            <button key={o.value} type="button" onClick={() => setControle(o.value)}
                                className={`px-3 py-2 min-h-[44px] rounded-full text-xs font-semibold border ${controle === o.value ? 'bg-primary border-primary text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                                {o.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex flex-col md:flex-row md:justify-end gap-2 pt-1">
                    <button onClick={onCancelar} disabled={enviando}
                        className="w-full md:w-auto px-4 py-3 md:py-2 min-h-[44px] bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-medium text-sm disabled:opacity-50">
                        Cancelar
                    </button>
                    <button onClick={confirmar} disabled={enviando}
                        className="w-full md:w-auto px-4 py-3 md:py-2 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2">
                        {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
                        {enviando ? 'Enviando…' : 'Enviar para Produtos'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default function ItensPcp() {
    const navigate = useNavigate();
    const [itens, setItens] = useState([]);
    const [loading, setLoading] = useState(true);
    // Busca também é lembrada por usuário (pedido do dono 15/09/2026): ao abrir um
    // subproduto e voltar, a lista reabre filtrada do mesmo jeito.
    const [search, setSearch] = useFiltroSalvo('itens-pcp:search', '');
    const [ativoFiltro, setAtivoFiltro] = useFiltroSalvo('itens-pcp:ativoFiltro', 'true');
    // Tipo agora é filtro (não mais travado em SUB) — órfãos de MP/PA/EMB também moram aqui.
    const [tipoFiltro, setTipoFiltro] = useFiltroSalvo('itens-pcp:tipoFiltro', 'SUB');
    const [modalPromover, setModalPromover] = useState(null); // item ou null
    const [modalTipo, setModalTipo] = useState(null); // item ou null
    const [novoTipo, setNovoTipo] = useState('');
    const [excluindo, setExcluindo] = useState('');

    const carregar = useCallback(async () => {
        try {
            setLoading(true);
            const params = {};
            if (tipoFiltro) params.tipo = tipoFiltro;
            if (search.trim()) params.search = search.trim();
            if (ativoFiltro) params.ativo = ativoFiltro;
            const data = await pcpItemService.listar(params);
            setItens(Array.isArray(data) ? data : []);
        } catch (err) {
            toast.error('Erro ao carregar itens: ' + err.message);
        } finally {
            setLoading(false);
        }
    }, [search, ativoFiltro, tipoFiltro]);

    useEffect(() => { carregar(); }, [carregar]);
    useAtualizaAoVoltar(carregar); // rebusca ao voltar ao app / a cada 5 min (tela deixada aberta)

    const toggleAtivo = async (id) => {
        try {
            await pcpItemService.toggleAtivo(id);
            toast.success('Status alterado');
            carregar();
        } catch (err) {
            toast.error(err.message);
        }
    };

    const confirmarMudarTipo = async () => {
        if (!modalTipo || !novoTipo) return;
        try {
            await pcpItemService.atualizar(modalTipo.id, { tipo: novoTipo });
            toast.success('Tipo alterado.');
            setModalTipo(null);
            carregar();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Não foi possível mudar o tipo deste item.');
        }
    };

    const excluir = async (item) => {
        if (!item.podeExcluir) return;
        if (!window.confirm(`Excluir "${item.nome}" definitivamente? Isso não pode ser desfeito.`)) return;
        setExcluindo(item.id);
        try {
            await pcpItemService.excluir(item.id);
            toast.success('Item excluído.');
            carregar();
        } catch (e) {
            // 409: o backend já devolve o motivo (receita, ordem, movimentação...)
            toast.error(e.response?.data?.error || 'Não foi possível excluir este item.', { duration: 8000 });
        } finally {
            setExcluindo('');
        }
    };

    return (
        <div className="w-full px-3 py-4 md:px-4 md:py-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div>
                    <h1 className="text-lg md:text-2xl font-bold text-gray-800">Itens do PCP</h1>
                    <p className="text-sm text-gray-500 mt-1">Matéria-prima, subproduto, produto acabado e embalagem usados na produção. MP/PA/EMB nascem do cadastro de Produtos — o que aparece "sem produto" aqui é item antigo que ainda não foi migrado.</p>
                </div>
                <button
                    onClick={() => navigate('/pcp/itens/novo')}
                    className="shrink-0 flex items-center justify-center gap-2 px-4 py-3 md:py-2 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm"
                >
                    <Plus className="h-4 w-4" />
                    Novo Subproduto
                </button>
            </div>

            {/* Filtros */}
            <div className="flex flex-col md:flex-row flex-wrap gap-3 mb-4">
                <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome ou código..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full min-h-[44px] pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                    />
                </div>
                <SelectBusca value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)} className="w-full md:w-56">
                    <option value="">Todos os tipos</option>
                    {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </SelectBusca>
                <SelectBusca value={ativoFiltro} onChange={e => setAtivoFiltro(e.target.value)} className="w-full md:w-40">
                    <option value="true">Ativos</option>
                    <option value="false">Inativos</option>
                    <option value="">Todos</option>
                </SelectBusca>
            </div>

            {/* Tabela desktop / cards mobile */}
            {loading ? (
                <div className="text-center py-12 text-gray-400">Carregando...</div>
            ) : itens.length === 0 ? (
                <div className="text-center py-12">
                    <Package className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500">Nenhum item encontrado</p>
                </div>
            ) : (
                <>
                {/* Mobile: cards */}
                <div className="md:hidden space-y-3">
                    {itens.map(item => {
                        const orfao = !item.produtoId;
                        return (
                            <div key={item.id} className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 ${!item.ativo ? 'opacity-60' : ''}`}>
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="font-semibold text-gray-900 truncate">{item.nome}</span>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${TIPO_CORES[item.tipo] || 'bg-gray-100 text-gray-700'}`}>{item.tipo}</span>
                                </div>
                                <div className="text-xs text-gray-500">{item.codigo} · {parseFloat(item.estoqueAtual || 0).toFixed(3)} {item.unidade}</div>
                                {orfao && (
                                    <div className="mt-2 px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700 inline-block">sem produto (órfão)</div>
                                )}
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <button onClick={() => navigate(`/pcp/itens/${item.id}`)} className="px-3 py-2 min-h-[44px] bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-medium text-xs inline-flex items-center gap-1.5"><Pencil className="h-3.5 w-3.5" /> Editar</button>
                                    <button onClick={() => toggleAtivo(item.id)} className="px-3 py-2 min-h-[44px] bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-medium text-xs inline-flex items-center gap-1.5">
                                        {item.ativo ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />} {item.ativo ? 'Desativar' : 'Ativar'}
                                    </button>
                                    {orfao && (
                                        <>
                                            <button onClick={() => setModalPromover(item)} className="px-3 py-2 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-semibold text-xs inline-flex items-center gap-1.5"><ArrowUpRight className="h-3.5 w-3.5" /> Enviar para Produtos</button>
                                            <button onClick={() => { setModalTipo(item); setNovoTipo(item.tipo); }} className="px-3 py-2 min-h-[44px] bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-medium text-xs inline-flex items-center gap-1.5"><Repeat className="h-3.5 w-3.5" /> Mudar tipo</button>
                                            <button
                                                onClick={() => excluir(item)}
                                                disabled={!item.podeExcluir || excluindo === item.id}
                                                title={!item.podeExcluir ? 'Este item está em uso — não pode ser excluído. Use Inativar.' : undefined}
                                                className="px-3 py-2 min-h-[44px] bg-white border border-red-300 text-red-600 hover:bg-red-50 rounded-full font-medium text-xs inline-flex items-center gap-1.5 disabled:opacity-40 disabled:hover:bg-white"
                                            >
                                                {excluindo === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Excluir
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Desktop: tabela */}
                <div className="hidden md:block bg-white rounded-lg border border-gray-200 overflow-hidden overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium text-gray-600">Código</th>
                                <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                                <th className="text-center px-4 py-3 font-medium text-gray-600">Tipo</th>
                                <th className="text-center px-4 py-3 font-medium text-gray-600">Unidade</th>
                                <th className="text-right px-4 py-3 font-medium text-gray-600">Estoque</th>
                                <th className="text-right px-4 py-3 font-medium text-gray-600">Mínimo</th>
                                <th className="text-center px-4 py-3 font-medium text-gray-600">Produto</th>
                                <th className="text-center px-4 py-3 font-medium text-gray-600">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {itens.map(item => {
                                const abaixoMin = parseFloat(item.estoqueMinimo) > 0 && parseFloat(item.estoqueAtual) < parseFloat(item.estoqueMinimo);
                                const orfao = !item.produtoId;
                                return (
                                    <tr key={item.id} className={`hover:bg-gray-50 ${!item.ativo ? 'opacity-50' : ''}`}>
                                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.codigo}</td>
                                        <td className="px-4 py-3">
                                            <span className="font-medium text-gray-800">{item.nome}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_CORES[item.tipo] || 'bg-gray-100 text-gray-700'}`}>{item.tipo}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center text-gray-600">{item.unidade}</td>
                                        <td className={`px-4 py-3 text-right font-medium ${abaixoMin ? 'text-red-600' : 'text-gray-800'}`}>
                                            {parseFloat(item.estoqueAtual).toFixed(3)}
                                        </td>
                                        <td className="px-4 py-3 text-right text-gray-500">
                                            {parseFloat(item.estoqueMinimo).toFixed(3)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {orfao
                                                ? <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">sem produto</span>
                                                : <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">produto ✓</span>}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex items-center justify-center gap-1 flex-wrap">
                                                <button
                                                    onClick={() => navigate(`/pcp/itens/${item.id}`)}
                                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                                    title="Editar"
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => toggleAtivo(item.id)}
                                                    className={`p-1.5 rounded ${item.ativo ? 'text-green-500 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                                                    title={item.ativo ? 'Desativar' : 'Ativar'}
                                                >
                                                    {item.ativo ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                                                </button>
                                                {orfao && (
                                                    <>
                                                        <button onClick={() => setModalPromover(item)} title="Enviar para Produtos" className="p-1.5 text-primary hover:bg-mint/40 rounded"><ArrowUpRight className="h-4 w-4" /></button>
                                                        <button onClick={() => { setModalTipo(item); setNovoTipo(item.tipo); }} title="Mudar tipo" className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"><Repeat className="h-4 w-4" /></button>
                                                        <button
                                                            onClick={() => excluir(item)}
                                                            disabled={!item.podeExcluir || excluindo === item.id}
                                                            title={item.podeExcluir ? 'Excluir' : 'Este item está em uso — não pode ser excluído. Use Inativar.'}
                                                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                                                        >
                                                            {excluindo === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                </>
            )}

            {modalPromover && (
                <ModalPromoverProduto
                    item={modalPromover}
                    onCancelar={() => setModalPromover(null)}
                    onConfirmado={() => { setModalPromover(null); carregar(); }}
                />
            )}

            {/* Mudar tipo — só faz sentido para órfão que não seja SUB resultado de receita ativa
                (o backend recusa com 400 e a mensagem aparece no toast). */}
            {modalTipo && (
                <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 p-0 md:p-4" onClick={() => setModalTipo(null)}>
                    <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-900">Mudar tipo</h2>
                            <button onClick={() => setModalTipo(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"><X className="h-5 w-5" /></button>
                        </div>
                        <p className="text-sm text-gray-600">{modalTipo.nome}</p>
                        <SelectBusca value={novoTipo} onChange={e => setNovoTipo(e.target.value)} className="w-full">
                            {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </SelectBusca>
                        <div className="flex flex-col md:flex-row md:justify-end gap-2 pt-1">
                            <button onClick={() => setModalTipo(null)} className="w-full md:w-auto px-4 py-3 md:py-2 min-h-[44px] bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-medium text-sm">Cancelar</button>
                            <button onClick={confirmarMudarTipo} className="w-full md:w-auto px-4 py-3 md:py-2 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm">Salvar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
