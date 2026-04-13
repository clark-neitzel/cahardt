import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2, Loader2, Search, X, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import pcpReceitaService from '../../services/pcpReceitaService';
import pcpItemService from '../../services/pcpItemService';
import api from '../../services/api';

const TIPOS_CONSUMO = ['MP', 'SUB', 'EMB'];
const ETAPAS = ['', 'preparo', 'modelagem', 'fritura', 'cozimento', 'montagem', 'embalagem'];

// ── Combobox com busca ──
function ComboboxBusca({ value, onChange, opcoes, placeholder = 'Buscar...', className = '' }) {
    const [aberto, setAberto] = useState(false);
    const [busca, setBusca] = useState('');
    const ref = useRef(null);
    const inputRef = useRef(null);

    // Fechar ao clicar fora
    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const selecionado = opcoes.find(o => o.id === value);

    const filtradas = busca.trim()
        ? opcoes.filter(o => {
            if (o.tipo === 'grupo') return false;
            const q = busca.toLowerCase();
            return (o.label || '').toLowerCase().includes(q);
        })
        : opcoes;

    const handleSelect = (id) => {
        onChange(id);
        setAberto(false);
        setBusca('');
    };

    const abrir = () => {
        setAberto(true);
        setBusca('');
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    return (
        <div ref={ref} className={`relative ${className}`}>
            {/* Botao que mostra selecionado */}
            <button
                type="button"
                onClick={abrir}
                className="w-full flex items-center gap-2 px-2 py-1.5 border border-gray-300 rounded text-sm text-left bg-white hover:border-gray-400 transition-colors min-h-[34px]"
            >
                <span className={`flex-1 truncate ${selecionado ? 'text-gray-800' : 'text-gray-400'}`}>
                    {selecionado ? selecionado.label : placeholder}
                </span>
                {value ? (
                    <X className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600 shrink-0" onClick={(e) => { e.stopPropagation(); onChange(''); }} />
                ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                )}
            </button>

            {/* Dropdown */}
            {aberto && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 flex flex-col">
                    {/* Campo de busca */}
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                        <Search className="h-4 w-4 text-gray-400 shrink-0" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={busca}
                            onChange={e => setBusca(e.target.value)}
                            placeholder="Digite para buscar..."
                            className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400"
                        />
                        {busca && (
                            <button type="button" onClick={() => setBusca('')} className="text-gray-400 hover:text-gray-600">
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Lista */}
                    <div className="flex-1 overflow-y-auto">
                        {filtradas.length === 0 ? (
                            <div className="px-3 py-4 text-center text-sm text-gray-400">Nenhum resultado</div>
                        ) : (
                            filtradas.map((o, i) => {
                                if (o.tipo === 'grupo') {
                                    return (
                                        <div key={`g-${i}`} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50 sticky top-0">
                                            {o.label}
                                        </div>
                                    );
                                }
                                return (
                                    <button
                                        key={o.id}
                                        type="button"
                                        onClick={() => handleSelect(o.id)}
                                        className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${o.id === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
                                    >
                                        {o.label}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function ReceitaForm() {
    const { id } = useParams();
    const navigate = useNavigate();
    const isEdicao = !!id;
    const [loading, setLoading] = useState(false);
    const [salvando, setSalvando] = useState(false);

    const [subprodutos, setSubprodutos] = useState([]);
    const [itensImportados, setItensImportados] = useState([]); // MP/EMB/PA ja existentes no PCP
    const [produtos, setProdutos] = useState([]);

    const [form, setForm] = useState({
        itemPcpId: '',
        nome: '',
        rendimentoBase: '',
        perdaPercentual: '',
        status: 'ativa',
        dataInicioVigencia: new Date().toISOString().split('T')[0],
        observacoes: '',
    });

    const [itens, setItens] = useState([]);

    useEffect(() => {
        const carregarDados = async () => {
            try {
                const todos = await pcpItemService.listar({ ativo: 'true' });
                const lista = Array.isArray(todos) ? todos : [];
                setSubprodutos(lista.filter(x => x.tipo === 'SUB'));
                setItensImportados(lista.filter(x => x.tipo !== 'SUB'));

                const resProd = await api.get('/produtos', { params: { limit: 500 } });
                const prodList = resProd.data?.data || resProd.data || [];
                setProdutos(Array.isArray(prodList) ? prodList : []);
            } catch {
                toast.error('Erro ao carregar dados');
            }
        };

        carregarDados();

        if (isEdicao) {
            setLoading(true);
            pcpReceitaService.buscarPorId(id)
                .then(receita => {
                    setForm({
                        itemPcpId: receita.itemPcpId,
                        nome: receita.nome,
                        rendimentoBase: String(receita.rendimentoBase),
                        perdaPercentual: receita.perdaPercentual ? String(receita.perdaPercentual) : '',
                        status: receita.status,
                        dataInicioVigencia: receita.dataInicioVigencia?.split('T')[0] || '',
                        observacoes: receita.observacoes || '',
                    });
                    setItens(receita.itens.map(i => ({
                        itemPcpId: i.itemPcpId,
                        quantidade: String(i.quantidade),
                        tipo: i.tipo,
                        ordemEtapa: i.ordemEtapa || '',
                        observacao: i.observacao || '',
                    })));
                })
                .catch(() => toast.error('Erro ao carregar receita'))
                .finally(() => setLoading(false));
        }
    }, [id, isEdicao]);

    const produtoIdsJaImportados = new Set(itensImportados.map(i => i.produtoId).filter(Boolean));
    const pasImportados = itensImportados.filter(i => i.tipo === 'PA');
    const mpEmbImportados = itensImportados.filter(i => i.tipo === 'MP' || i.tipo === 'EMB');
    const produtosNaoImportados = produtos.filter(p => !produtoIdsJaImportados.has(p.id));

    // Opcoes para "Item Produzido" (PA ou SUB)
    const opcoesResultado = [
        ...(subprodutos.length > 0 ? [
            { id: '__g_sub', tipo: 'grupo', label: 'Subprodutos (PCP)' },
            ...subprodutos.map(s => ({ id: s.id, label: `[SUB] ${s.codigo} - ${s.nome}`, tipo: 'SUB' })),
        ] : []),
        ...(pasImportados.length > 0 ? [
            { id: '__g_pa_imp', tipo: 'grupo', label: 'Produtos Acabados (ja no PCP)' },
            ...pasImportados.map(i => ({ id: i.id, label: `[PA] ${i.codigo} - ${i.nome}`, tipo: 'PA' })),
        ] : []),
        { id: '__g_pa', tipo: 'grupo', label: 'Produtos do Sistema (importar como PA)' },
        ...produtosNaoImportados.map(p => ({ id: 'produto:' + p.id, label: `${p.codigo} - ${p.nome}`, tipo: 'PA' })),
    ];

    // Opcoes para ingredientes (MP/EMB + SUB)
    const opcoesIngredientes = [
        ...(subprodutos.length > 0 ? [
            { id: '__g_sub', tipo: 'grupo', label: 'Subprodutos (PCP)' },
            ...subprodutos.map(s => ({ id: s.id, label: `[SUB] ${s.codigo} - ${s.nome}`, tipo: 'SUB' })),
        ] : []),
        ...(mpEmbImportados.length > 0 ? [
            { id: '__g_imp', tipo: 'grupo', label: 'MP / EMB (ja no PCP)' },
            ...mpEmbImportados.map(i => ({ id: i.id, label: i.nome, tipo: i.tipo })),
        ] : []),
        { id: '__g_prod', tipo: 'grupo', label: 'Produtos do Sistema (importar)' },
        ...produtosNaoImportados.map(p => ({ id: 'produto:' + p.id, label: p.nome, tipo: 'MP' })),
    ];

    const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

    const addItem = () => {
        setItens(prev => [...prev, { itemPcpId: '', quantidade: '', tipo: 'MP', ordemEtapa: '', observacao: '' }]);
    };

    const removeItem = (idx) => setItens(prev => prev.filter((_, i) => i !== idx));

    const updateItem = (idx, field, value) => {
        setItens(prev => prev.map((item, i) => {
            if (i !== idx) return item;
            const updated = { ...item, [field]: value };
            if (field === 'itemPcpId') {
                const sel = opcoesIngredientes.find(d => d.id === value);
                if (sel && sel.tipo !== 'grupo') updated.tipo = sel.tipo === 'SUB' ? 'SUB' : 'MP';
            }
            return updated;
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.itemPcpId || !form.nome || !form.rendimentoBase) {
            toast.error('Preencha item produzido, nome e rendimento base');
            return;
        }
        if (itens.length === 0 || itens.some(i => !i.itemPcpId || !i.quantidade)) {
            toast.error('Adicione pelo menos 1 ingrediente com quantidade');
            return;
        }

        let motivo = null;
        if (isEdicao) {
            motivo = prompt('Motivo da alteração (será registrada nova versão):');
            if (!motivo?.trim()) {
                toast.error('É necessário informar o motivo para editar a receita.');
                return;
            }
        }

        setSalvando(true);
        try {
            // Resolver item produzido
            let itemPcpIdFinal = form.itemPcpId;
            if (itemPcpIdFinal.startsWith('produto:')) {
                const produtoId = itemPcpIdFinal.replace('produto:', '');
                const res = await pcpItemService.importar({ produtoId, tipo: 'PA' });
                itemPcpIdFinal = res.id;
            }

            // Resolver ingredientes
            const itensResolvidos = [];
            for (const item of itens) {
                let itemId = item.itemPcpId;
                if (itemId.startsWith('produto:')) {
                    const produtoId = itemId.replace('produto:', '');
                    const tipo = item.tipo === 'EMB' ? 'EMB' : 'MP';
                    const res = await pcpItemService.importar({ produtoId, tipo });
                    itemId = res.id;
                }
                itensResolvidos.push({
                    itemPcpId: itemId,
                    quantidade: parseFloat(item.quantidade),
                    tipo: item.tipo,
                    ordemEtapa: item.ordemEtapa || null,
                    observacao: item.observacao || null,
                });
            }

            const dados = {
                ...form,
                itemPcpId: itemPcpIdFinal,
                rendimentoBase: parseFloat(form.rendimentoBase),
                perdaPercentual: form.perdaPercentual ? parseFloat(form.perdaPercentual) : null,
                itens: itensResolvidos,
            };

            if (isEdicao) {
                const atualizada = await pcpReceitaService.atualizar(id, { ...dados, motivo: motivo.trim() });
                toast.success(`Nova versão v${atualizada.versao} criada`);
                navigate(`/pcp/receitas/${atualizada.id}`);
                return;
            } else {
                await pcpReceitaService.criar(dados);
                toast.success('Receita criada');
            }
            navigate('/pcp/receitas');
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        } finally {
            setSalvando(false);
        }
    };

    if (loading) return <div className="text-center py-12 text-gray-400">Carregando...</div>;

    return (
        <div className="max-w-4xl mx-auto px-4 py-6">
            <button onClick={() => navigate('/pcp/receitas')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
                <ArrowLeft className="h-4 w-4" /> Voltar
            </button>

            <h1 className="text-2xl font-bold text-gray-800 mb-6">{isEdicao ? 'Editar Receita' : 'Nova Receita'}</h1>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
                    <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Dados da Receita</h2>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Item Produzido (PA ou SUB) *</label>
                            <ComboboxBusca
                                value={form.itemPcpId}
                                onChange={v => handleChange('itemPcpId', v)}
                                opcoes={opcoesResultado}
                                placeholder="Buscar produto..."
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Receita *</label>
                            <input
                                type="text"
                                value={form.nome}
                                onChange={e => handleChange('nome', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Rendimento Base *</label>
                            <input
                                type="number"
                                step="0.001"
                                value={form.rendimentoBase}
                                onChange={e => handleChange('rendimentoBase', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                placeholder="Ex: 100.000"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Perda Padrao (%)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={form.perdaPercentual}
                                onChange={e => handleChange('perdaPercentual', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                placeholder="Ex: 5.00"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                            <select
                                value={form.status}
                                onChange={e => handleChange('status', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="ativa">Ativa</option>
                                <option value="rascunho">Rascunho</option>
                                <option value="inativa">Inativa</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Observacoes</label>
                        <textarea
                            value={form.observacoes}
                            onChange={e => handleChange('observacoes', e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>

                {/* Componentes */}
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Componentes</h2>
                        <button
                            type="button"
                            onClick={addItem}
                            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                        >
                            <Plus className="h-4 w-4" /> Adicionar
                        </button>
                    </div>

                    {itens.length === 0 ? (
                        <p className="text-center py-6 text-gray-400 text-sm">Nenhum componente. Clique em "Adicionar" acima.</p>
                    ) : (
                        <div className="space-y-3">
                            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-1">
                                <div className="col-span-4">Item</div>
                                <div className="col-span-2">Quantidade</div>
                                <div className="col-span-1">Tipo</div>
                                <div className="col-span-2">Etapa</div>
                                <div className="col-span-2">Obs</div>
                                <div className="col-span-1"></div>
                            </div>
                            {itens.map((item, idx) => (
                                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                                    <div className="col-span-4">
                                        <ComboboxBusca
                                            value={item.itemPcpId}
                                            onChange={v => updateItem(idx, 'itemPcpId', v)}
                                            opcoes={opcoesIngredientes}
                                            placeholder="Buscar ingrediente..."
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <input
                                            type="number"
                                            step="0.001"
                                            value={item.quantidade}
                                            onChange={e => updateItem(idx, 'quantidade', e.target.value)}
                                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                                            placeholder="0.000"
                                        />
                                    </div>
                                    <div className="col-span-1">
                                        <select
                                            value={item.tipo}
                                            onChange={e => updateItem(idx, 'tipo', e.target.value)}
                                            className="w-full px-1 py-1.5 border border-gray-300 rounded text-xs"
                                        >
                                            {TIPOS_CONSUMO.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-span-2">
                                        <select
                                            value={item.ordemEtapa}
                                            onChange={e => updateItem(idx, 'ordemEtapa', e.target.value)}
                                            className="w-full px-1 py-1.5 border border-gray-300 rounded text-xs"
                                        >
                                            {ETAPAS.map(e => <option key={e} value={e}>{e || '—'}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-span-2">
                                        <input
                                            type="text"
                                            value={item.observacao}
                                            onChange={e => updateItem(idx, 'observacao', e.target.value)}
                                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
                                            placeholder="obs"
                                        />
                                    </div>
                                    <div className="col-span-1 text-center">
                                        <button type="button" onClick={() => removeItem(idx)} className="p-1 text-red-400 hover:text-red-600">
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3">
                    <button type="button" onClick={() => navigate('/pcp/receitas')} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={salvando}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {isEdicao ? 'Salvar' : 'Criar Receita'}
                    </button>
                </div>
            </form>
        </div>
    );
}
