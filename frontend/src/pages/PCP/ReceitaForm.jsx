import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import pcpReceitaService from '../../services/pcpReceitaService';
import pcpItemService from '../../services/pcpItemService';
import api from '../../services/api';

const TIPOS_CONSUMO = ['MP', 'SUB', 'EMB'];
const ETAPAS = ['', 'preparo', 'modelagem', 'fritura', 'cozimento', 'montagem', 'embalagem'];

export default function ReceitaForm() {
    const { id } = useParams();
    const navigate = useNavigate();
    const isEdicao = !!id;
    const [loading, setLoading] = useState(false);
    const [salvando, setSalvando] = useState(false);

    // Listas de selecao
    const [subprodutos, setSubprodutos] = useState([]); // SUBs do PCP
    const [produtos, setProdutos] = useState([]);         // Produtos do cadastro (MP/EMB/PA)
    const [itensResultado, setItensResultado] = useState([]); // PA: Produtos + SUBs

    const [form, setForm] = useState({
        itemPcpId: '',       // pode ser itemPcpId existente ou "produto:UUID"
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
                // Carregar SUBprodutos do PCP
                const subs = await pcpItemService.listar({ ativo: 'true', tipo: 'SUB' });
                setSubprodutos(Array.isArray(subs) ? subs : []);

                // Carregar todos os itens PCP que ja existem (para PA vinculado)
                const todosItens = await pcpItemService.listar({ ativo: 'true' });
                const todosArr = Array.isArray(todosItens) ? todosItens : [];

                // Carregar Produtos do cadastro (sistema)
                const resProd = await api.get('/produtos', { params: { limit: 500 } });
                const prodList = resProd.data?.data || resProd.data || [];
                const prodArr = Array.isArray(prodList) ? prodList : [];
                setProdutos(prodArr);

                // Itens resultado (PA): Produtos do sistema + SUBs
                const produtosPa = prodArr.map(p => ({
                    id: 'produto:' + p.id,
                    produtoId: p.id,
                    codigo: p.codigo,
                    nome: p.nome,
                    tipo: 'PA',
                    unidade: p.unidade,
                    origem: 'cadastro',
                }));
                const subsPa = (Array.isArray(subs) ? subs : []).map(s => ({
                    id: s.id,
                    codigo: s.codigo,
                    nome: s.nome,
                    tipo: 'SUB',
                    unidade: s.unidade,
                    origem: 'pcp',
                }));
                setItensResultado([...subsPa, ...produtosPa]);
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

    // Montar lista unificada de ingredientes: Produtos (MP/EMB) + SUBs
    const ingredientesDisponiveis = [
        ...subprodutos.map(s => ({
            id: s.id,
            label: `[SUB] ${s.codigo} - ${s.nome}`,
            tipo: 'SUB',
            origem: 'pcp',
        })),
        ...produtos.map(p => ({
            id: 'produto:' + p.id,
            produtoId: p.id,
            label: `${p.codigo} - ${p.nome} (${p.unidade})`,
            tipo: 'MP',
            origem: 'cadastro',
        })),
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
                const sel = ingredientesDisponiveis.find(d => d.id === value);
                if (sel) updated.tipo = sel.tipo === 'SUB' ? 'SUB' : 'MP';
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

        setSalvando(true);
        try {
            // Resolver IDs: se comeca com "produto:" precisa garantir ItemPcp
            let itemPcpIdFinal = form.itemPcpId;
            if (itemPcpIdFinal.startsWith('produto:')) {
                const produtoId = itemPcpIdFinal.replace('produto:', '');
                const res = await pcpItemService.importar({ produtoId, tipo: 'PA' });
                itemPcpIdFinal = res.id;
            }

            const itensResolvidos = [];
            for (const item of itens) {
                let itemId = item.itemPcpId;
                if (itemId.startsWith('produto:')) {
                    const produtoId = itemId.replace('produto:', '');
                    const tipo = item.tipo === 'EMB' ? 'EMB' : 'MP';
                    try {
                        const res = await pcpItemService.importar({ produtoId, tipo });
                        itemId = res.id;
                    } catch (err) {
                        // Ja existe - buscar o existente
                        if (err.response?.data?.error?.includes('já está importado')) {
                            const todos = await pcpItemService.listar({ ativo: 'true' });
                            const todosArr = Array.isArray(todos) ? todos : [];
                            const existente = todosArr.find(i => i.produtoId === produtoId);
                            if (existente) itemId = existente.id;
                            else throw err;
                        } else {
                            throw err;
                        }
                    }
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
                await pcpReceitaService.atualizar(id, dados);
                toast.success('Receita atualizada');
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
                {/* Cabecalho */}
                <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
                    <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Dados da Receita</h2>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Item Produzido (PA ou SUB) *</label>
                            <select
                                value={form.itemPcpId}
                                onChange={e => handleChange('itemPcpId', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                required
                            >
                                <option value="">Selecione...</option>
                                {itensResultado.filter(i => i.tipo === 'SUB').length > 0 && (
                                    <optgroup label="Subprodutos (PCP)">
                                        {itensResultado.filter(i => i.tipo === 'SUB').map(p => (
                                            <option key={p.id} value={p.id}>[SUB] {p.codigo} - {p.nome}</option>
                                        ))}
                                    </optgroup>
                                )}
                                <optgroup label="Produtos do Sistema (PA)">
                                    {itensResultado.filter(i => i.tipo === 'PA').map(p => (
                                        <option key={p.id} value={p.id}>{p.codigo} - {p.nome}</option>
                                    ))}
                                </optgroup>
                            </select>
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

                {/* Componentes da receita */}
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
                        <div className="space-y-2">
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
                                        <select
                                            value={item.itemPcpId}
                                            onChange={e => updateItem(idx, 'itemPcpId', e.target.value)}
                                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                                        >
                                            <option value="">Selecione...</option>
                                            {subprodutos.length > 0 && (
                                                <optgroup label="Subprodutos (PCP)">
                                                    {subprodutos.map(s => (
                                                        <option key={s.id} value={s.id}>[SUB] {s.codigo} - {s.nome}</option>
                                                    ))}
                                                </optgroup>
                                            )}
                                            <optgroup label="Produtos do Sistema (MP / EMB)">
                                                {produtos.map(p => (
                                                    <option key={'p-' + p.id} value={'produto:' + p.id}>{p.codigo} - {p.nome} ({p.unidade})</option>
                                                ))}
                                            </optgroup>
                                        </select>
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
