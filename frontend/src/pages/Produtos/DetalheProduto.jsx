import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import produtoService from '../../services/produtoService';
import { API_URL } from '../../services/api';
import { ArrowLeft, ShoppingCart } from 'lucide-react';

const DetalheProduto = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [produto, setProduto] = useState(null);
    const [loading, setLoading] = useState(true);
    const [imagemAtual, setImagemAtual] = useState(0);

    useEffect(() => {
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
        fetchDetalhe();
    }, [id]);

    if (loading) return <div className="p-8 text-center">Carregando...</div>;
    if (!produto) return <div className="p-8 text-center">Produto não encontrado.</div>;

    const imagens = produto.imagens && produto.imagens.length > 0
        ? produto.imagens
        : [{ url: 'https://via.placeholder.com/400?text=Sem+Imagem' }];

    return (
        <div className="container mx-auto px-4 py-6">
            <button
                onClick={() => navigate(-1)}
                className="mb-4 flex items-center text-gray-600 hover:text-gray-900"
            >
                <ArrowLeft className="h-5 w-5 mr-1" /> Voltar
            </button>

            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                {/* Galeria de Imagens */}
                <div className="relative h-64 md:h-96 bg-gray-100">
                    <img
                        src={`${API_URL}${imagens[imagemAtual].url.replace('https://via.placeholder.com', '')}`}
                        alt={produto.nome}
                        className="w-full h-full object-contain"
                        onError={(e) => { e.target.src = 'https://via.placeholder.com/400?text=Erro+Imagem'; }}
                    />
                    {imagens.length > 1 && (
                        <div className="absolute bottom-4 left-0 right-0 flex justify-center space-x-2">
                            {imagens.map((_, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setImagemAtual(idx)}
                                    className={`h-2 w-2 rounded-full ${idx === imagemAtual ? 'bg-primary' : 'bg-gray-300'}`}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Informações */}
                <div className="p-6">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm text-gray-500 mb-1">Cód: {produto.codigo}</p>
                            <h1 className="text-2xl font-bold text-gray-900 mb-2">{produto.nome}</h1>
                        </div>
                        <div className="mt-4 border-t border-gray-100 pt-4">
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <p className="text-sm text-gray-500">Preço Venda</p>
                                    <p className="text-2xl font-bold text-primary">
                                        R$ {Number(produto.valorVenda || 0).toFixed(2).replace('.', ',')}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">Unidade</p>
                                    <p className="text-lg font-medium">{produto.unidade}</p>
                                </div>
                            </div>

                            <div className="mb-4">
                                <h3 className="text-sm font-semibold text-gray-700 mb-2">Estoque</h3>
                                <div className="grid grid-cols-3 gap-2 text-sm bg-gray-50 p-3 rounded">
                                    <div>
                                        <p className="text-gray-500">Disponível</p>
                                        <p className="font-bold text-green-700">{produto.estoqueDisponivel}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-500">Reservado</p>
                                        <p className="font-bold text-orange-600">{produto.estoqueReservado}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-500">Total</p>
                                        <p className="font-bold text-gray-900">{produto.estoqueTotal}</p>
                                    </div>
                                </div>
                            </div>

                            {produto.descricao && (
                                <div className="mb-4">
                                    <h3 className="text-sm font-semibold text-gray-700 mb-1">Descrição</h3>
                                    <p className="text-sm text-gray-600 leading-relaxed">{produto.descricao}</p>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4 text-xs text-gray-500 border-t pt-3">
                                <div>
                                    <span>Categoria: </span> <span className="text-gray-700">{produto.categoria || '-'}</span>
                                </div>
                                <div>
                                    <span>EAN: </span> <span className="text-gray-700">{produto.ean || '-'}</span>
                                </div>
                                <div>
                                    <span>Peso Líq.: </span> <span className="text-gray-700">{produto.pesoLiquido ? `${produto.pesoLiquido} kg` : '-'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8">
                            <button className="w-full bg-primary hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center transition-colors shadow-md">
                                <ShoppingCart className="h-5 w-5 mr-2" />
                                Adicionar ao Pedido
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            );
};

            export default DetalheProduto;
