import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, ShoppingCart } from 'lucide-react';
import toast from 'react-hot-toast';
import pcpItemService from '../../services/pcpItemService';

const UNIDADES = ['KG', 'UN', 'L', 'PCT', 'CX', 'G', 'ML'];

export default function ItemPcpForm() {
    const { id } = useParams();
    const navigate = useNavigate();
    const isEdicao = !!id;
    const [compras, setCompras] = useState([]); // Fase 6: histórico de compras (só edição)
    const [loading, setLoading] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [isImportado, setIsImportado] = useState(false);

    const [form, setForm] = useState({
        codigo: '',
        nome: '',
        tipo: 'SUB',
        unidade: 'KG',
        descricao: '',
        custoUnitario: '',
        estoqueMinimo: '0',
    });

    useEffect(() => {
        if (isEdicao) {
            setLoading(true);
            pcpItemService.buscarPorId(id)
                .then(item => {
                    setIsImportado(!!item.produtoId);
                    setForm({
                        codigo: item.codigo || '',
                        nome: item.nome || '',
                        tipo: item.tipo || 'SUB',
                        unidade: item.unidade || 'KG',
                        descricao: item.descricao || '',
                        custoUnitario: item.custoUnitario ? String(item.custoUnitario) : '',
                        estoqueMinimo: item.estoqueMinimo ? String(item.estoqueMinimo) : '0',
                    });
                })
                .catch(() => toast.error('Erro ao carregar item'))
                .finally(() => setLoading(false));
        } else {
            pcpItemService.proximoCodigo()
                .then(({ codigo }) => setForm(prev => ({ ...prev, codigo })))
                .catch(() => {});
        }
    }, [id, isEdicao]);

    useEffect(() => {
        if (!isEdicao) return;
        pcpItemService.compras(id)
            .then(d => setCompras(Array.isArray(d) ? d : []))
            .catch(() => {});
    }, [id, isEdicao]);

    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!isEdicao && (!form.codigo || !form.nome)) {
            toast.error('Codigo e nome sao obrigatorios');
            return;
        }

        setSalvando(true);
        try {
            if (isEdicao) {
                const dados = isImportado
                    ? { estoqueMinimo: parseFloat(form.estoqueMinimo || 0), custoUnitario: form.custoUnitario ? parseFloat(form.custoUnitario) : null, descricao: form.descricao }
                    : { ...form, custoUnitario: form.custoUnitario ? parseFloat(form.custoUnitario) : null, estoqueMinimo: parseFloat(form.estoqueMinimo || 0) };
                await pcpItemService.atualizar(id, dados);
                toast.success('Item atualizado');
            } else {
                await pcpItemService.criar({
                    ...form,
                    tipo: 'SUB',
                    custoUnitario: form.custoUnitario ? parseFloat(form.custoUnitario) : null,
                    estoqueMinimo: parseFloat(form.estoqueMinimo || 0),
                });
                toast.success('Subproduto criado');
            }
            navigate('/pcp/itens');
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        } finally {
            setSalvando(false);
        }
    };

    if (loading) return <div className="text-center py-12 text-gray-400">Carregando...</div>;

    return (
        <div className="max-w-2xl mx-auto px-4 py-6">
            <button onClick={() => navigate('/pcp/itens')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
                <ArrowLeft className="h-4 w-4" /> Voltar
            </button>

            <h1 className="text-2xl font-bold text-gray-800 mb-2">
                {isEdicao ? 'Editar Item' : 'Novo Subproduto'}
            </h1>
            {isEdicao && isImportado && (
                <p className="text-sm text-green-600 mb-4">
                    Item importado do cadastro de Produtos. Codigo, nome e unidade nao podem ser alterados aqui.
                </p>
            )}
            {!isEdicao && (
                <p className="text-sm text-purple-600 mb-4">
                    Subprodutos sao itens intermediarios criados no PCP. MP, PA e EMB devem ser importados do cadastro.
                </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Codigo *</label>
                        <input
                            type="text"
                            value={form.codigo}
                            onChange={e => handleChange('codigo', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                            required={!isImportado}
                            disabled={isImportado}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                        <input
                            type="text"
                            value={form.tipo === 'MP' ? 'Materia-Prima' : form.tipo === 'SUB' ? 'Subproduto' : form.tipo === 'PA' ? 'Produto Acabado' : 'Embalagem'}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-100 text-gray-500"
                            disabled
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                    <input
                        type="text"
                        value={form.nome}
                        onChange={e => handleChange('nome', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                        required={!isImportado}
                        disabled={isImportado}
                    />
                </div>

                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Unidade *</label>
                        {isImportado ? (
                            <input
                                type="text"
                                value={form.unidade}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-100 text-gray-500"
                                disabled
                            />
                        ) : (
                            <select
                                value={form.unidade}
                                onChange={e => handleChange('unidade', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            >
                                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Custo Unitario</label>
                        <input
                            type="number"
                            step="0.0001"
                            value={form.custoUnitario}
                            onChange={e => handleChange('custoUnitario', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            placeholder="0.0000"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Estoque Minimo</label>
                        <input
                            type="number"
                            step="0.001"
                            value={form.estoqueMinimo}
                            onChange={e => handleChange('estoqueMinimo', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            placeholder="0.000"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descricao</label>
                    <textarea
                        value={form.descricao}
                        onChange={e => handleChange('descricao', e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                {isEdicao && compras.length > 0 && (
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <ShoppingCart className="h-4 w-4 text-amber-600" />
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Histórico de compras</span>
                        </div>
                        <div className="space-y-2">
                            {compras.map(c => (
                                <div key={c.id} className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-1">
                                    <div className="min-w-0">
                                        <span className="font-medium text-gray-900">{c.fornecedorNome}</span>
                                        <span className="text-gray-500"> · {c.dataCompra ? new Date(c.dataCompra).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : ''}{c.numeroNota ? ` · Nota ${c.numeroNota}` : ''}</span>
                                    </div>
                                    <div className="text-gray-700 shrink-0">
                                        {Number(c.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {c.unidade} · custo R$ {Number(c.custoUnitario).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} · total R$ {Number(c.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-1.5 text-xs text-gray-500">
                            O custo unitário é atualizado por média ponderada com o estoque a cada compra conferida nas Notas Recebidas.
                        </div>
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                    <button type="button" onClick={() => navigate('/pcp/itens')} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={salvando}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {isEdicao ? 'Salvar' : 'Criar Subproduto'}
                    </button>
                </div>
            </form>
        </div>
    );
}
