import React from 'react';
import { Link } from 'react-router-dom';
import { MapPinOff, ExternalLink } from 'lucide-react';
import EstadoVazio from '../../../components/EstadoVazio';

// Clientes do filtro que NÃO aparecem no mapa por não ter ponto GPS.
// A ficha completa é onde o ponto é cadastrado (aba Qualidade dos dados).
export default function ListaSemGps({ clientes, onSelecionar }) {
    if (!clientes.length) {
        return <EstadoVazio icon={MapPinOff} titulo="Todo mundo do filtro tem ponto GPS" descricao="Nenhum cliente ficou de fora do mapa." />;
    }
    return (
        <div className="space-y-1.5">
            <p className="text-xs text-gray-500 px-1">{clientes.length} {clientes.length === 1 ? 'cliente' : 'clientes'} sem ponto GPS — não aparecem no mapa. O ponto é cadastrado na ficha (aba Qualidade dos dados).</p>
            <ul className="space-y-1.5">
                {clientes.map(c => (
                    <li key={c.uuid} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-2">
                        <button type="button" onClick={() => onSelecionar(c.uuid)} className="flex-1 min-w-0 text-left min-h-[36px]">
                            <p className="text-sm font-medium text-gray-900 truncate">{c.fantasia || c.nome}</p>
                            <p className="text-xs text-gray-500 truncate">{[c.cidade, c.vendedorNome].filter(Boolean).join(' · ') || 'Sem cidade / vendedor'}</p>
                        </button>
                        <Link to={`/clientes/${c.uuid}`} title="Abrir ficha completa" className="p-2 text-gray-400 hover:text-primary rounded-full hover:bg-gray-100 shrink-0">
                            <ExternalLink className="h-4 w-4" />
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
