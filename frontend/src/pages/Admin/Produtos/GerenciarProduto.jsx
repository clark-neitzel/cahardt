import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import produtoService from '../../../services/produtoService';
import { API_URL } from '../../../services/api';
import ImageUploader from '../../../components/ImageUploader';
import { ArrowLeft, Trash2, Star, Save } from 'lucide-react';

const GerenciarProduto = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [produto, setProduto] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchDetalhe = async () => {
        try {
            const data = await produtoService.detalhar(id);
            setProduto(data);
        } catch (error) {
            console.error('Erro ao carregar produto:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDetalhe();
    }, [id]);

    const handleUpload = async (formData) => {
        try {
            setLoading(true);
            await produtoService.uploadImagens(id, formData);
            await fetchDetalhe();
        } catch (error) {
            alert('Erro ao enviar imagem');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteImage = async (imagemId) => {
        if (!window.confirm("Remover esta imagem?")) return;
        try {
            await produtoService.removerImagem(imagemId);
            await fetchDetalhe();
        } catch (error) {
            alert('Erro ao remover imagem');
        }
    };

    const handleSetPrincipal = async (imagemId) => {
        try {
            await produtoService.definirPrincipal(id, imagemId);
            await fetchDetalhe();
        } catch (error) {
            alert('Erro ao definir principal');
        }
    };

    const handleToggleStatus = async () => {
        try {
            await produtoService.alterarStatus(id, !produto.ativo);
            await fetchDetalhe();
        } catch (error) {
            alert('Erro ao alterar status');
        }
    };

    if (loading && !produto) return <div className="p-8 text-center">Carregando...</div>;
    if (!produto) return <div className="p-8 text-center">Produto não encontrado.</div>;

    // Helper para formatar moeda
    const formatCurrency = (val) => {
        if (val === undefined || val === null) return '';
        return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    // Helper para formatar número
    const formatNumber = (val) => {
        if (val === undefined || val === null) return '';
        return Number(val).toLocaleString('pt-BR');
    };

    // Helper para formatar data
    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleString('pt-BR');
    };

    return (
        <div className="container mx-auto px-4 py-6 max-w-7xl">
            <div className="flex items-center justify-between mb-6">
                <button
                    onClick={() => navigate('/admin/produtos')}
                    className="flex items-center text-gray-600 hover:text-gray-900"
                >
                    <ArrowLeft className="h-5 w-5 mr-1" /> Voltar
                </button>
                <div className="flex items-center space-x-3">
                    <span className={`px-3 py-1 text-sm font-semibold rounded-full ${produto.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {produto.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                    <button
                        onClick={handleToggleStatus}
                        className="text-sm text-blue-600 hover:text-blue-800 underline"
                    >
                        {produto.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                </div>
            </div>

            <div className="bg-white shadow rounded-lg mb-6 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                    <h1 className="text-xl font-bold text-gray-800">
                        Editar produto - {produto.nome}
                    </h1>
                </div>

                <div className="p-6 space-y-8">
                    {/* Seção 1: Informações do Produto */}
                    <section>
                        <h2 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">Informações do produto</h2>
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                            <div className="md:col-span-8">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                                <input
                                    type="text"
                                    value={produto.nome || ''}
                                    readOnly
                                    className="w-full border-gray-300 rounded-md shadow-sm bg-gray-50 focus:ring-0 focus:border-gray-300"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Código (SKU)</label>
                                <input
                                    type="text"
                                    value={produto.codigo || ''}
                                    readOnly
                                    className="w-full border-gray-300 rounded-md shadow-sm bg-gray-50 focus:ring-0 focus:border-gray-300"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Valor de venda</label>
                                <input
                                    type="text"
                                    value={formatCurrency(produto.valorVenda)}
                                    readOnly
                                    className="w-full border-gray-300 rounded-md shadow-sm bg-gray-50 focus:ring-0 focus:border-gray-300"
                                />
                            </div>

                            <div className="md:col-span-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Código de barras (EAN)</label>
                                <input
                                    type="text"
                                    value={produto.ean || ''}
                                    readOnly
                                    className="w-full border-gray-300 rounded-md shadow-sm bg-gray-50 focus:ring-0 focus:border-gray-300"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Unidade</label>
                                <input
                                    type="text"
                                    value={produto.unidade || ''}
                                    readOnly
                                    className="w-full border-gray-300 rounded-md shadow-sm bg-gray-50 focus:ring-0 focus:border-gray-300"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Peso Líquido</label>
                                <input
                                    type="text"
                                    value={formatNumber(produto.pesoLiquido)}
                                    readOnly
                                    className="w-full border-gray-300 rounded-md shadow-sm bg-gray-50 focus:ring-0 focus:border-gray-300"
                                />
                            </div>
                            <div className="md:col-span-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Última Atualização</label>
                                <input
                                    type="text"
                                    value={formatDate(produto.updatedAt)}
                                    readOnly
                                    className="w-full border-gray-300 rounded-md shadow-sm bg-gray-50 text-gray-500 focus:ring-0 focus:border-gray-300"
                                />
                            </div>

                            <div className="md:col-span-12">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Observações do produto (Descrição)</label>
                                <textarea
                                    rows={3}
                                    value={produto.descricao || ''}
                                    readOnly
                                    className="w-full border-gray-300 rounded-md shadow-sm bg-gray-50 focus:ring-0 focus:border-gray-300"
                                />
                            </div>
                        </div>
                    </section>

                    {/* Seção 2: Estoque e Custos */}
                    <section>
                        <h2 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">Estoque</h2>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade disponível</label>
                                <input
                                    type="text"
                                    value={formatNumber(produto.estoqueDisponivel)}
                                    readOnly
                                    className="w-full border-gray-300 rounded-md shadow-sm bg-gray-50 focus:ring-0 focus:border-gray-300"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade reservada</label>
                                <input
                                    type="text"
                                    value={formatNumber(produto.estoqueReservado)}
                                    readOnly
                                    className="w-full border-gray-300 rounded-md shadow-sm bg-gray-50 focus:ring-0 focus:border-gray-300"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade total</label>
                                <input
                                    type="text"
                                    value={formatNumber(produto.estoqueTotal)}
                                    readOnly
                                    className="w-full border-gray-300 rounded-md shadow-sm bg-gray-50 focus:ring-0 focus:border-gray-300"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Custo médio</label>
                                <input
                                    type="text"
                                    value={formatCurrency(produto.custoMedio)}
                                    readOnly
                                    className="w-full border-gray-300 rounded-md shadow-sm bg-gray-50 focus:ring-0 focus:border-gray-300"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Estoque mínimo</label>
                                <input
                                    type="text"
                                    value={formatNumber(produto.estoqueMinimo)}
                                    readOnly
                                    className="w-full border-gray-300 rounded-md shadow-sm bg-gray-50 focus:ring-0 focus:border-gray-300"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                                <input
                                    type="text"
                                    value={produto.categoria || ''}
                                    readOnly
                                    className="w-full border-gray-300 rounded-md shadow-sm bg-gray-50 focus:ring-0 focus:border-gray-300"
                                />
                            </div>
                            <div className="md:col-span-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1">ID (Sistema)</label>
                                <input
                                    type="text"
                                    value={produto.id || ''}
                                    readOnly
                                    className="w-full border-gray-300 rounded-md shadow-sm bg-gray-50 text-xs text-gray-400 focus:ring-0 focus:border-gray-300"
                                />
                            </div>
                        </div>
                    </section>

                    {/* Imagens (Mantido Embaixo) */}
                    <section>
                        <h2 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">Galeria de Imagens</h2>
                        <div className="mb-6">
                            <ImageUploader onUpload={handleUpload} />
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {produto.imagens && produto.imagens.map((img) => (
                                <div key={img.id} className={`relative group border rounded-lg overflow-hidden ${img.principal ? 'ring-2 ring-primary' : ''}`}>
                                    <img
                                        src={`${API_URL}${img.url}`}
                                        alt="Produto"
                                        className="w-full h-32 object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                        <div className="flex space-x-2">
                                            <button
                                                onClick={() => handleSetPrincipal(img.id)}
                                                title="Definir como Principal"
                                                className={`p-1 rounded-full ${img.principal ? 'bg-yellow-400 text-white' : 'bg-white text-gray-600 hover:text-yellow-500'}`}
                                            >
                                                <Star className="h-5 w-5" fill={img.principal ? "currentColor" : "none"} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteImage(img.id)}
                                                title="Remover"
                                                className="p-1 rounded-full bg-white text-red-500 hover:bg-red-100"
                                            >
                                                <Trash2 className="h-5 w-5" />
                                            </button>
                                        </div>
                                    </div>
                                    {img.principal && (
                                        <div className="absolute top-0 right-0 bg-primary text-white text-xs px-2 py-1 rounded-bl">
                                            Capa
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        {(!produto.imagens || produto.imagens.length === 0) && (
                            <p className="text-gray-500 text-center py-6">Nenhuma imagem cadastrada.</p>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
};

export default GerenciarProduto;
