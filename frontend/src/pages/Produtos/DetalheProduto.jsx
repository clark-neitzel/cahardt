
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import produtoService from '../../services/produtoService';
import configService from '../../services/configService';
import { API_URL } from '../../services/api';
import { ArrowLeft, Loader, AlertCircle, Camera, Tag, DollarSign, FileText, Layers } from 'lucide-react';

const DetalheProduto = () => {
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
        contaAzulUpdatedAt: '',
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
                    contaAzulUpdatedAt: data.contaAzulUpdatedAt || '',
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
        <div className="flex items-center justify-center h-screen bg-gray-50 gap-2">
            <Loader className="animate-spin h-6 w-6 text-primary" />
            <span className="text-sm text-gray-500">Carregando produto…</span>
        </div>
    );

    if (!produto) return (
        <div className="flex flex-col items-center justify-center p-10 gap-3 text-center">
            <AlertCircle className="h-10 w-10 text-red-400" />
            <p className="text-sm text-red-600 font-medium">Produto não encontrado.</p>
        </div>
    );

    const imagens = produto.imagens && produto.imagens.length > 0
        ? produto.imagens
        : [{ url: null }];

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header Sticky */}
            <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm px-4 py-3 mb-5">
                <div className="flex items-center gap-3 max-w-5xl mx-auto">
                    <button onClick={handleBack} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0" title="Voltar">
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-base md:text-lg font-bold text-gray-900 leading-tight truncate">
                            {formData.nome || 'Produto'}
                        </h1>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 font-mono">{formData.codigo}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${formData.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                {formData.ativo ? 'Ativo' : 'Inativo'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-3 md:px-6">
                {/* Feedback de erro */}
                {error && (
                    <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                        <p className="text-sm text-red-700">{error}</p>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                    {/* Coluna Esquerda: Imagens e Estoque */}
                    <div className="space-y-4">
                        {/* Card Imagem */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                                <Camera className="h-4 w-4 text-purple-600" />
                                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Imagens</span>
                            </div>
                            <div className="aspect-square bg-gray-100 relative">
                                <img
                                    src={imagens[imagemAtual].url ? `${API_URL}${imagens[imagemAtual].url}` : 'https://via.placeholder.com/400?text=Sem+Imagem'}
                                    alt="Produto"
                                    className="w-full h-full object-contain p-4"
                                    onError={(e) => { e.target.src = 'https://via.placeholder.com/400?text=Sem+imagem'; }}
                                />
                            </div>
                            {imagens.length > 1 && (
                                <div className="p-3 flex gap-2 overflow-x-auto hide-scrollbar">
                                    {imagens.map((img, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setImagemAtual(idx)}
                                            className={`h-14 w-14 flex-shrink-0 rounded-lg border-2 overflow-hidden transition-colors ${idx === imagemAtual ? 'border-primary' : 'border-gray-200 hover:border-gray-400'}`}
                                        >
                                            <img src={`${API_URL}${img.url}`} className="w-full h-full object-cover" alt="" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Card Estoque */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                                <Layers className="h-4 w-4 text-blue-600" />
                                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Estoque</span>
                            </div>
                            <div className="p-4 grid grid-cols-2 gap-3">
                                <div className="bg-green-50 rounded-lg border border-green-100 p-3 text-center">
                                    <p className="text-xs text-green-700 font-semibold uppercase tracking-wide">Disponível</p>
                                    <p className="text-2xl font-bold text-green-800 mt-0.5">{produto.estoqueDisponivel}</p>
                                </div>
                                <div className="bg-blue-50 rounded-lg border border-blue-100 p-3 text-center">
                                    <p className="text-xs text-blue-700 font-semibold uppercase tracking-wide">Total</p>
                                    <p className="text-2xl font-bold text-blue-800 mt-0.5">{produto.estoqueTotal}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Coluna Direita: Campos */}
                    <div className="md:col-span-2 space-y-4">
                        {/* Card Identificação */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                                <Tag className="h-4 w-4 text-blue-600" />
                                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Identificação</span>
                            </div>
                            <div className="p-4 md:p-5 space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Nome do Produto</label>
                                    <input
                                        type="text"
                                        value={formData.nome}
                                        readOnly
                                        className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm text-gray-700 cursor-default"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Código (SKU)</label>
                                        <input
                                            type="text"
                                            value={formData.codigo}
                                            readOnly
                                            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm text-gray-700 cursor-default font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">EAN / GTIN</label>
                                        <input
                                            type="text"
                                            value={formData.ean}
                                            readOnly
                                            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm text-gray-700 cursor-default font-mono"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Card Valores e Classificação */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                                <DollarSign className="h-4 w-4 text-green-600" />
                                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Valores e Classificação</span>
                            </div>
                            <div className="p-4 md:p-5 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Valor de Venda</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">R$</span>
                                            <input
                                                type="text"
                                                value={formData.valorVenda}
                                                readOnly
                                                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-sm font-bold text-gray-800 cursor-default"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Custo Médio</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">R$</span>
                                            <input
                                                type="text"
                                                value={formData.custoMedio}
                                                readOnly
                                                title="Sincronizado do Conta Azul"
                                                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-sm text-gray-500 cursor-default"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Unidade</label>
                                        <input
                                            type="text"
                                            value={formData.unidade}
                                            readOnly
                                            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm text-gray-700 cursor-default uppercase"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Categoria</label>
                                        <input
                                            type="text"
                                            value={formData.categoria}
                                            readOnly
                                            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm text-gray-700 cursor-default"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">NCM</label>
                                        <input
                                            type="text"
                                            value={formData.ncm}
                                            readOnly
                                            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm text-gray-700 cursor-default font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Peso Líquido (kg)</label>
                                        <input
                                            type="text"
                                            value={formData.pesoLiquido}
                                            readOnly
                                            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm text-gray-700 cursor-default"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Card Descrição */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                                <FileText className="h-4 w-4 text-gray-500" />
                                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Descrição / Obs</span>
                            </div>
                            <div className="p-4 md:p-5">
                                <textarea
                                    rows={4}
                                    value={formData.descricao}
                                    readOnly
                                    className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm text-gray-700 cursor-default resize-none"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DetalheProduto;
