import { Link } from 'react-router-dom';
import { API_URL } from '../services/api';
import StatusBadge from './StatusBadge';

const ProductCard = ({ produto }) => {
    const imagemPrincipal = produto.imagens && produto.imagens.length > 0
        ? `${API_URL}${produto.imagens[0].url}`
        : 'https://via.placeholder.com/150?text=Sem+Imagem';

    return (
        <Link to={`/produto/${produto.id}`} className="block">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                <div className="h-40 bg-gray-100 relative">
                    <img
                        src={imagemPrincipal}
                        alt={produto.nome}
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2">
                        <StatusBadge ativo={produto.ativo} estoque={produto.saldoEstoque} />
                    </div>
                </div>
                <div className="p-4">
                    <p className="text-xs text-gray-500 mb-1">{produto.codigo}</p>
                    <h3 className="text-sm font-medium text-gray-900 line-clamp-2 h-10">
                        {produto.nome}
                    </h3>
                    <div className="mt-2 flex items-center justify-between">
                        <span className="text-lg font-bold text-primary">
                            R$ {Number(produto.precoVenda).toFixed(2).replace('.', ',')}
                        </span>
                        <span className="text-xs text-gray-500">
                            Est: {produto.saldoEstoque} {produto.unidade}
                        </span>
                    </div>
                </div>
            </div>
        </Link>
    );
};

export default ProductCard;
