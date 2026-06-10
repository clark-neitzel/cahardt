import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import etiquetaService from '../../services/etiquetaService';
import produtoService from '../../services/produtoService';

const VAZIO = {
    produtoId: '',
    codigoProduto: '',
    nomeProduto: '',
    pesoUnitario: '',
    pesoTabelaNutricional: '',
    valorEnergetico: '',
    carboidratos: '',
    proteinas: '',
    gordurasTotais: '',
    gordurasSaturadas: '',
    gordurasTrans: '',
    fibraAlimentar: '',
    sodio: '',
    quantidadeEmbalagem: '',
    quantidadeAproximada: false,
    composicao: '',
    modoPreparo: '',
    codigoBarras: '',
    contemLeite: false,
    contemGluten: false,
    contemOvo: false,
    outrosAlergenos: '',
    avisosRotulo: '',
    armazenamento: '',
    validadeDias: 90,
    ativo: true,
    tipoProduto: '',
};

function Campo({ label, required, children }) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
                {label}{required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            {children}
        </div>
    );
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
const textareaCls = `${inputCls} resize-none`;

export default function EtiquetaForm() {
    const navigate = useNavigate();
    const { id } = useParams();
    const editando = Boolean(id);

    const [form, setForm] = useState(VAZIO);
    const [produtos, setProdutos] = useState([]);
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        produtoService.listar({ ativo: true, limit: 500 }).then(r => {
            const arr = Array.isArray(r) ? r : (r?.produtos || r?.itens || []);
            setProdutos(arr);
        }).catch(() => {});
    }, []);

    useEffect(() => {
        if (!editando) return;
        etiquetaService.buscar(id).then(et => {
            setForm({
                ...VAZIO,
                ...et,
                produtoId:    et.produtoId    ?? '',
                outrosAlergenos: et.outrosAlergenos ?? '',
                avisosRotulo:    et.avisosRotulo    ?? '',
                armazenamento:   et.armazenamento   ?? '',
                tipoProduto:     et.tipoProduto     ?? '',
                codigoBarras:    et.codigoBarras    ?? '',
            });
        }).catch(err => { toast.error(err.message); navigate('/pcp/etiquetas/dados'); });
    }, [id, editando, navigate]);

    const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.codigoProduto.trim()) return toast.error('Código é obrigatório.');
        if (!form.nomeProduto.trim())   return toast.error('Nome é obrigatório.');
        if (!form.composicao.trim())    return toast.error('Composição é obrigatória.');
        if (!form.modoPreparo.trim())   return toast.error('Modo de preparo é obrigatório.');

        setSalvando(true);
        try {
            const payload = { ...form, produtoId: form.produtoId || null };
            if (editando) {
                await etiquetaService.atualizar(id, payload);
                toast.success('Etiqueta atualizada!');
            } else {
                await etiquetaService.criar(payload);
                toast.success('Etiqueta criada!');
            }
            navigate('/pcp/etiquetas/dados');
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-6">
            {/* Cabeçalho */}
            <div className="flex items-center gap-3 mb-6">
                <button onClick={() => navigate('/pcp/etiquetas/dados')} className="p-2 rounded-lg hover:bg-gray-100">
                    <ChevronLeft className="h-5 w-5 text-gray-600" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">
                        {editando ? 'Editar Etiqueta' : 'Nova Etiqueta'}
                    </h1>
                    <p className="text-sm text-gray-500">Preencha os dados do rótulo do produto</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Identificação */}
                <section className="bg-white rounded-xl border border-gray-200 p-5">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Identificação</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Campo label="Código do Produto" required>
                            <input type="text" value={form.codigoProduto} onChange={e => set('codigoProduto', e.target.value)} className={inputCls} placeholder="Ex: 3082" />
                        </Campo>
                        <Campo label="Nome do Produto" required>
                            <input type="text" value={form.nomeProduto} onChange={e => set('nomeProduto', e.target.value)} className={inputCls} placeholder="Ex: MINI BOLINHA QUEIJO" />
                        </Campo>
                        <Campo label="Peso Unitário (g)" required>
                            <input type="number" min="1" value={form.pesoUnitario} onChange={e => set('pesoUnitario', e.target.value)} className={inputCls} placeholder="Ex: 28" />
                        </Campo>
                        <Campo label="Peso Tabela Nutricional / Porção (g)" required>
                            <input type="number" min="1" value={form.pesoTabelaNutricional} onChange={e => set('pesoTabelaNutricional', e.target.value)} className={inputCls} placeholder="Ex: 28" />
                        </Campo>
                        <Campo label="Quantidade por Embalagem" required>
                            <div className="flex items-center gap-3">
                                <input type="number" min="1" value={form.quantidadeEmbalagem} onChange={e => set('quantidadeEmbalagem', e.target.value)} className={inputCls} placeholder="Ex: 50" />
                                <label className="flex items-center gap-1.5 whitespace-nowrap cursor-pointer text-sm text-gray-700 select-none">
                                    <input
                                        type="checkbox"
                                        checked={form.quantidadeAproximada}
                                        onChange={e => set('quantidadeAproximada', e.target.checked)}
                                        className="w-4 h-4 rounded accent-indigo-600"
                                    />
                                    Qtd. aproximada (~)
                                </label>
                            </div>
                        </Campo>
                        <Campo label="Código de Barras (EAN)">
                            <input type="text" value={form.codigoBarras} onChange={e => set('codigoBarras', e.target.value)} className={inputCls} placeholder="Ex: 7898620330460" />
                        </Campo>
                        <Campo label="Tipo de Produto">
                            <input type="text" value={form.tipoProduto} onChange={e => set('tipoProduto', e.target.value)} className={inputCls} placeholder="Ex: Mini - Fritar" />
                        </Campo>
                        <Campo label="Validade (dias)">
                            <input type="number" min="1" value={form.validadeDias} onChange={e => set('validadeDias', e.target.value)} className={inputCls} />
                        </Campo>
                    </div>
                    <div className="mt-4">
                        <Campo label="Vincular ao Produto do Catálogo (opcional)">
                            <select value={form.produtoId} onChange={e => set('produtoId', e.target.value)} className={inputCls}>
                                <option value="">— Nenhum —</option>
                                {produtos.map(p => (
                                    <option key={p.id} value={p.id}>{p.codigo} — {p.nome}</option>
                                ))}
                            </select>
                        </Campo>
                    </div>
                </section>

                {/* Informação Nutricional */}
                <section className="bg-white rounded-xl border border-gray-200 p-5">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Informação Nutricional</h2>
                    <p className="text-xs text-gray-400 mb-4">Preencha com o valor e o %VD, ex: <span className="font-mono">34kcal (2% VD)</span></p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Campo label="Valor Energético"><input type="text" value={form.valorEnergetico} onChange={e => set('valorEnergetico', e.target.value)} className={inputCls} placeholder="34kcal (2% VD)" /></Campo>
                        <Campo label="Carboidratos"><input type="text" value={form.carboidratos} onChange={e => set('carboidratos', e.target.value)} className={inputCls} placeholder="5,7g (2% VD)" /></Campo>
                        <Campo label="Proteínas"><input type="text" value={form.proteinas} onChange={e => set('proteinas', e.target.value)} className={inputCls} placeholder="0,9g (1% VD)" /></Campo>
                        <Campo label="Gorduras Totais"><input type="text" value={form.gordurasTotais} onChange={e => set('gordurasTotais', e.target.value)} className={inputCls} placeholder="0,8g (1% VD)" /></Campo>
                        <Campo label="Gorduras Saturadas"><input type="text" value={form.gordurasSaturadas} onChange={e => set('gordurasSaturadas', e.target.value)} className={inputCls} placeholder="0,3g (2% VD)" /></Campo>
                        <Campo label="Gorduras Trans"><input type="text" value={form.gordurasTrans} onChange={e => set('gordurasTrans', e.target.value)} className={inputCls} placeholder="0g (0% VD)" /></Campo>
                        <Campo label="Fibra Alimentar"><input type="text" value={form.fibraAlimentar} onChange={e => set('fibraAlimentar', e.target.value)} className={inputCls} placeholder="0,4g (2% VD)" /></Campo>
                        <Campo label="Sódio"><input type="text" value={form.sodio} onChange={e => set('sodio', e.target.value)} className={inputCls} placeholder="147mg (6% VD)" /></Campo>
                    </div>
                </section>

                {/* Composição e Preparo */}
                <section className="bg-white rounded-xl border border-gray-200 p-5">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Composição e Preparo</h2>
                    <div className="space-y-4">
                        <Campo label="Composição / Ingredientes" required>
                            <textarea rows={4} value={form.composicao} onChange={e => set('composicao', e.target.value)} className={textareaCls} placeholder="Água, Farinha de Trigo, Queijo mussarela..." />
                        </Campo>
                        <Campo label="Modo de Preparo" required>
                            <textarea rows={4} value={form.modoPreparo} onChange={e => set('modoPreparo', e.target.value)} className={textareaCls} placeholder="Colocar o produto ainda congelado, em óleo pré-aquecido em 180ºC, por 3 minutos..." />
                        </Campo>
                        <Campo label="Armazenamento / Conservação">
                            <input type="text" value={form.armazenamento} onChange={e => set('armazenamento', e.target.value)} className={inputCls} placeholder="Congelar -12ºC. Após descongelado, não recongelar." />
                        </Campo>
                    </div>
                </section>

                {/* Alérgenos */}
                <section className="bg-white rounded-xl border border-gray-200 p-5">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Alérgenos</h2>
                    <div className="flex flex-wrap gap-4 mb-4">
                        {[['contemLeite', 'Contém Leite'], ['contemGluten', 'Contém Glúten'], ['contemOvo', 'Contém Ovo']].map(([field, label]) => (
                            <label key={field} className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={form[field]}
                                    onChange={e => set(field, e.target.checked)}
                                    className="w-4 h-4 rounded accent-indigo-600"
                                />
                                <span className="text-sm text-gray-700">{label}</span>
                            </label>
                        ))}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Campo label="Outros Alérgenos">
                            <input type="text" value={form.outrosAlergenos} onChange={e => set('outrosAlergenos', e.target.value)} className={inputCls} placeholder="Ex: Sim - frutos do mar" />
                        </Campo>
                        <Campo label="Aviso no Rótulo">
                            <input type="text" value={form.avisosRotulo} onChange={e => set('avisosRotulo', e.target.value)} className={inputCls} placeholder="Pode conter traços: Leite, Soja, Ovos" />
                        </Campo>
                    </div>
                </section>

                {/* Rodapé */}
                <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={form.ativo} onChange={e => set('ativo', e.target.checked)} className="w-4 h-4 rounded accent-indigo-600" />
                        <span className="text-sm text-gray-700">Ativo</span>
                    </label>
                    <div className="flex gap-3">
                        <button type="button" onClick={() => navigate('/pcp/etiquetas/dados')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                            Cancelar
                        </button>
                        <button type="submit" disabled={salvando} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
                            <Save className="h-4 w-4" />
                            {salvando ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
