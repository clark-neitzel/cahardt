import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import produtoService from '../../../services/produtoService';
import { API_URL } from '../../../services/api';
import ImageUploader from '../../../components/ImageUploader';
import { ArrowLeft, Trash2, Star } from 'lucide-react';

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
            await fetchDetalhe(); // Recarrega
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

    return (
        <div className="container mx-auto px-4 py-6">
            <button
                onClick={() => navigate('/admin/produtos')}
                className="mb-4 flex items-center text-gray-600 hover:text-gray-900"
            >
                <ArrowLeft className="h-5 w-5 mr-1" /> Voltar
            </button>

            <div className="bg-white shadow rounded-lg p-6 mb-6">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">{produto.nome}</h1>
                        <p className="text-gray-500">{produto.codigo}</p>
                    </div>
                    <button
                        onClick={handleToggleStatus}
                        className={`px-4 py-2 rounded font-medium text-white transition ${produto.ativo ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
                            }`}
                    >
                        {produto.ativo ? 'Desativar Produto' : 'Ativar Produto'}
                    </button>
                </div>
            </div>

            <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Galeria de Imagens</h2>

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
            </div>
        </div>
    );
};

export default GerenciarProduto;
