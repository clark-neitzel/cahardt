import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import pcpItemService from '../../services/pcpItemService';
import api from '../../services/api';

const TIPOS = ['MP', 'SUB', 'PA', 'EMB'];
const UNIDADES = ['KG', 'UN', 'L', 'PCT', 'CX', 'G', 'ML'];

export default function ItemPcpForm() {
    const { id } = useParams();
    const navigate = useNavigate();
    const isEdicao = !!id;
    const [loading, setLoading] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [produtos, setProdutos] = useState([]);

    const [form, setForm] = useState({
        codigo: '',
        nome: '',
        tipo: 'MP',
        unidade: 'KG',
        descricao: '',
        produtoId: '',
        custoUnitario: '',
        estoqueMinimo: '0',
    });

    useEffect(() => {
        if (isEdicao) {
            setLoading(true);
            pcpItemService.buscarPorId(id)
                .then(item => {
                    setForm({
                        codigo: item.codigo || '',
                        nome: item.nome || '',
                        tipo: item.tipo || 'MP',
                        unidade: item.unidade || 'KG',
                        descricao: item.descricao || '',
                        produtoId: item.produtoId || '',
                        custoUnitario: item.custoUnitario ? String(item.custoUnitario) : '',
                        estoqueMinimo: item.estoqueMinimo ? String(item.estoqueMinimo) : '0',
                    });
                })
                .catch(() => toast.error('Erro ao carregar item'))
                .finally(() => setLoading(false));
        }

        // Carregar produtos para vincular PA
        api.get('/produtos', { params: { ativo: true } })
            .then(r => setProdutos(r.data || []))
            .catch(() => {});
    }, [id, isEdicao]);

    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.codigo || !form.nome) {
            toast.error('Codigo e nome sao obrigatorios');
            return;
        }

        setSalvando(true);
        try {
            const dados = {
                ...form,
                produtoId: form.produtoId || null,
                custoUnitario: form.custoUnitario ? parseFloat(form.custoUnitario) : null,
                estoqueMinimo: parseFloat(form.estoqueMinimo || 0),
            };

            if (isEdicao) {
                await pcpItemService.atualizar(id, dados);
                toast.success('Item atualizado');
            } else {
                await pcpItemService.criar(dados);
                toast.success('Item criado');
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

            <h1 className="text-2xl font-bold text-gray-800 mb-6">{isEdicao ? 'Editar Item' : 'Novo Item PCP'}</h1>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Codigo *</label>
                        <input
                            type="text"
                            value={form.codigo}
                            onChange={e => handleChange('codigo', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
                        <select
                            value={form.tipo}
                            onChange={e => handleChange('tipo', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        >
                            {TIPOS.map(t => <option key={t} value={t}>{t === 'MP' ? 'Materia-Prima' : t === 'SUB' ? 'Subproduto' : t === 'PA' ? 'Produto Acabado' : 'Embalagem'}</option>)}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                    <input
                        type="text"
                        value={form.nome}
                        onChange={e => handleChange('nome', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                    />
                </div>

                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Unidade *</label>
                        <select
                            value={form.unidade}
                            onChange={e => handleChange('unidade', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        >
                            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
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

                {form.tipo === 'PA' && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Vincular a Produto Comercial</label>
                        <select
                            value={form.produtoId}
                            onChange={e => handleChange('produtoId', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">Nenhum</option>
                            {produtos.map(p => (
                                <option key={p.id} value={p.id}>{p.codigo} - {p.nome}</option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-400 mt-1">Ao finalizar uma OP, o estoque comercial sera atualizado automaticamente.</p>
                    </div>
                )}

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descricao</label>
                    <textarea
                        value={form.descricao}
                        onChange={e => handleChange('descricao', e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                </div>

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
                        {isEdicao ? 'Salvar' : 'Criar Item'}
                    </button>
                </div>
            </form>
        </div>
    );
}
