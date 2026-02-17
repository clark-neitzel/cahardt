
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import produtoService from '../../../services/produtoService';
import configService from '../../../services/configService';
import { API_URL } from '../../../services/api';
import { ArrowLeft, Loader, AlertCircle, Camera } from 'lucide-react';

const GerenciarProduto = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Data States
    const [produto, setProduto] = useState(null);
    const [categorias, setCategorias] = useState([]);
    const [imagemAtual, setImagemAtual] = useState(0);

    // Form State
    const [formData, setFormData] = useState({
        nome: '',
        codigo: '',
        valorVenda: '',
        custoMedio: '',
        unidade: '',
        categoria: '',
        ean: '',
        ncm: '',
        pesoLiquido: '',
        descricao: '',
        ativo: true
    });

    useEffect(() => {
        const loadUtilitarios = async () => {
            try {
                const cats = await configService.getCategorias();
                setCategorias(cats || []);
            } catch (err) {
                console.error("Erro ao carregar categorias", err);
                // Fallback para evitar crash
                setCategorias([]);
            }
        };

        const fetchDetalhe = async () => {
            try {
                const data = await produtoService.detalhar(id);
                setProduto(data);
                setFormData({
                    nome: data.nome || '',
                    codigo: data.codigo || '',
                    valorVenda: data.valorVenda ? Number(data.valorVenda).toFixed(2) : '0.00',
                    custoMedio: data.custoMedio ? Number(data.custoMedio).toFixed(2) : '0.00',
                    unidade: data.unidade || '',
                    categoria: data.categoria || '',
                    ean: data.ean || '',
                    ncm: data.ncm || '',
                    pesoLiquido: data.pesoLiquido || '',
                    descricao: data.descricao || '',
                    ativo: data.ativo
                });
            } catch (error) {
                console.error('Erro ao carregar produto:', error);
                setError('Erro ao carregar detalhes do produto.');
            } finally {
                setLoading(false);
            }
        };

        loadUtilitarios();
        fetchDetalhe();
    }, [id]);



    const handleBack = () => {
        if (location.state) {
            // Se tiver estado preservado (busca, filtro, pag), volta com ele
            const params = new URLSearchParams();
            if (location.state.search) params.set('search', location.state.search);
            if (location.state.page) params.set('page', location.state.page);
            if (location.state.statusFilter) params.set('ativo', location.state.statusFilter);
            if (location.state.selectedCategories && location.state.selectedCategories.length > 0) {
                params.set('categorias', location.state.selectedCategories.join(','));
            }
            navigate(`/admin/produtos?${params.toString()}`);
        } else {
            // Fallback: Tenta history.back()
            navigate(-1);
        }
    };

    if (loading) return (
        <div className="flex justify-center items-center h-screen bg-gray-50">
            <Loader className="animate-spin h-8 w-8 text-primary" />
        </div>
    );

    if (!produto) return <div className="p-8 text-center text-red-500">Produto não encontrado.</div>;

    const imagens = produto.imagens && produto.imagens.length > 0
        ? produto.imagens
        : [{ url: null }];

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header Sticky */}
            <div className="sticky top-0 z-10 bg-white border-b shadow-sm px-4 py-4 mb-6">
                <div className="container mx-auto max-w-5xl flex justify-between items-center">
                    <div className="flex items-center space-x-4">
                        <button onClick={handleBack} className="text-gray-500 hover:text-gray-800 transition-colors p-1 rounded-full hover:bg-gray-100" title="Voltar para a lista">
                            <ArrowLeft className="h-6 w-6" />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900 leading-tight">
                                {formData.nome || 'Novo Produto'}
                            </h1>
                            <div className="flex items-center space-x-2 text-sm">
                                <span className="text-gray-500">Código: {formData.codigo}</span>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${formData.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                    {formData.ativo ? 'Ativo' : 'Inativo'}
                                </span>
                            </div>
                        </div>
                    </div>


                </div>
            </div>

            <div className="container mx-auto max-w-5xl px-4">
                {/* Feedback Messages */}
                {error && (
                    <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 flex items-center">
                        <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
                        <p className="text-red-700">{error}</p>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Coluna Esquerda: Imagens e Estoque */}
                    <div className="space-y-6">
                        {/* Card Imagem */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <h3 className="font-semibold text-gray-700">Imagens</h3>
                                <Camera className="h-4 w-4 text-gray-400" />
                            </div>
                            <div className="aspect-square bg-gray-100 relative group">
                                <img
                                    src={imagens[imagemAtual].url ? `${API_URL}${imagens[imagemAtual].url}` : 'https://via.placeholder.com/400?text=Sem+Imagem'}
                                    alt="Produto"
                                    className="w-full h-full object-contain p-4"
                                    onError={(e) => { e.target.src = 'https://via.placeholder.com/400?text=Erro'; }}
                                />
                            </div>
                            {imagens.length > 1 && (
                                <div className="p-4 flex gap-2 overflow-x-auto">
                                    {imagens.map((img, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setImagemAtual(idx)}
                                            className={`h-16 w-16 flex-shrink-0 rounded border-2 overflow-hidden ${idx === imagemAtual ? 'border-primary' : 'border-transparent'}`}
                                        >
                                            <img src={`${API_URL}${img.url}`} className="w-full h-full object-cover" alt="" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Card Estoque */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                            <div className="p-4 border-b border-gray-100 bg-gray-50">
                                <h3 className="font-semibold text-gray-700">Estoque</h3>
                            </div>
                            <div className="p-4 grid grid-cols-2 gap-4">
                                <div className="bg-green-50 p-3 rounded border border-green-100">
                                    <p className="text-xs text-green-700 uppercase font-semibold">Disponível</p>
                                    <p className="text-2xl font-bold text-green-800">{produto.estoqueDisponivel}</p>
                                </div>
                                <div className="bg-blue-50 p-3 rounded border border-blue-100">
                                    <p className="text-xs text-blue-700 uppercase font-semibold">Total</p>
                                    <p className="text-xl font-bold text-blue-800">{produto.estoqueTotal}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Coluna Direita: Formulário - Wrapped in Fragment to ensure render */}
                    <div className="md:col-span-2 space-y-6">
                        {/* Card Dados Principais */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                            <div className="p-4 border-b border-gray-100 bg-gray-50">
                                <h3 className="font-semibold text-gray-700">Identificação</h3>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Produto</label>
                                    <input
                                        type="text"
                                        name="nome"
                                        value={formData.nome}
                                        readOnly
                                        className="w-full rounded-md border-gray-300 shadow-sm py-2 px-3 border bg-gray-50 text-gray-700 cursor-not-allowed"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Código (SKU)</label>
                                        <input
                                            type="text"
                                            name="codigo"
                                            value={formData.codigo}
                                            readOnly
                                            className="w-full rounded-md border-gray-300 shadow-sm py-2 px-3 border bg-gray-50 text-gray-700 cursor-not-allowed"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">EAN / GTIN</label>
                                        <input
                                            type="text"
                                            name="ean"
                                            value={formData.ean}
                                            readOnly
                                            className="w-full rounded-md border-gray-300 shadow-sm py-2 px-3 border bg-gray-50 text-gray-700 cursor-not-allowed"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Card Valores e Categoria */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                            <div className="p-4 border-b border-gray-100 bg-gray-50">
                                <h3 className="font-semibold text-gray-700">Valores e Classificação</h3>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Valor de Venda (R$)</label>
                                        <div className="relative rounded-md shadow-sm">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <span className="text-gray-500 sm:text-sm">R$</span>
                                            </div>
                                            <input
                                                type="number"
                                                name="valorVenda"
                                                step="0.01"
                                                value={formData.valorVenda}
                                                readOnly
                                                className="w-full pl-10 rounded-md border-gray-300 shadow-sm py-2 px-3 border font-bold bg-gray-50 text-gray-700 cursor-not-allowed"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Custo Médio (R$)</label>
                                        <div className="relative rounded-md shadow-sm">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <span className="text-gray-500 sm:text-sm">R$</span>
                                            </div>
                                            <input
                                                type="number"
                                                name="custoMedio"
                                                step="0.01"
                                                value={formData.custoMedio}
                                                readOnly
                                                className="w-full pl-10 rounded-md border-gray-300 shadow-sm bg-gray-100 text-gray-500 cursor-not-allowed py-2 px-3 border"
                                                title="Sincronizado do Conta Azul"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Unidade</label>
                                        <input
                                            type="text"
                                            name="unidade"
                                            value={formData.unidade}
                                            readOnly
                                            className="w-full rounded-md border-gray-300 shadow-sm py-2 px-3 border uppercase bg-gray-50 text-gray-700 cursor-not-allowed"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                                    <input
                                        type="text"
                                        name="categoria"
                                        value={formData.categoria}
                                        readOnly
                                        className="w-full rounded-md border-gray-300 shadow-sm py-2 px-3 border bg-gray-50 text-gray-700 cursor-not-allowed"
                                    />

                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">NCM</label>
                                        <input
                                            type="text"
                                            name="ncm"
                                            value={formData.ncm}
                                            readOnly
                                            className="w-full rounded-md border-gray-300 shadow-sm py-2 px-3 border bg-gray-50 text-gray-700 cursor-not-allowed"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Peso Líquido (kg)</label>
                                        <input
                                            type="number"
                                            step="0.001"
                                            name="pesoLiquido"
                                            value={formData.pesoLiquido}
                                            readOnly
                                            className="w-full rounded-md border-gray-300 shadow-sm py-2 px-3 border bg-gray-50 text-gray-700 cursor-not-allowed"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Card Descrição */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                            <div className="p-4 border-b border-gray-100 bg-gray-50">
                                <h3 className="font-semibold text-gray-700">Descrição/Obs</h3>
                            </div>
                            <div className="p-4">
                                <textarea
                                    name="descricao"
                                    rows={4}
                                    value={formData.descricao}
                                    readOnly
                                    className="w-full rounded-md border-gray-300 shadow-sm py-2 px-3 border bg-gray-50 text-gray-700 cursor-not-allowed"
                                />
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};

export default GerenciarProduto;

