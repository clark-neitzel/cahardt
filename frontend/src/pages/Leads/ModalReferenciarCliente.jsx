import React, { useState, useEffect } from 'react';
import { X, Search, UserCheck, Loader2 } from 'lucide-react';
import clienteService from '../../services/clienteService';
import leadService from '../../services/leadService';
import toast from 'react-hot-toast';

const ModalReferenciarCliente = ({ lead, onClose, onVinculado }) => {
    const [search, setSearch] = useState('');
    const [clientes, setClientes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [vinculando, setVinculando] = useState(false);

    useEffect(() => {
        if (search.length < 2) {
            setClientes([]);
            return;
        }
        const timer = setTimeout(async () => {
            try {
                setLoading(true);
                const result = await clienteService.listar({ search, limit: 20, ativo: true });
                setClientes(result.data || result);
            } catch (error) {
                console.error('Erro ao buscar clientes:', error);
            } finally {
                setLoading(false);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [search]);

    const handleVincular = async (clienteId) => {
        if (!window.confirm(`Vincular o lead "${lead.nomeEstabelecimento}" a este cliente?`)) return;
        try {
            setVinculando(true);
            await leadService.referenciarCliente(lead.id, clienteId);
            toast.success('Lead vinculado ao cliente com sucesso!');
            onVinculado();
        } catch (error) {
            toast.error('Erro ao vincular: ' + (error.response?.data?.error || error.message));
        } finally {
            setVinculando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50" onClick={onClose}>
            <div
                className="bg-white w-full md:w-[500px] md:max-h-[80vh] rounded-t-2xl md:rounded-2xl flex flex-col max-h-[85vh]"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <div>
                        <h3 className="font-bold text-gray-900">Vincular a Cliente</h3>
                        <p className="text-xs text-gray-500 mt-0.5">Lead: {lead.nomeEstabelecimento}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
                        <X className="h-5 w-5 text-gray-400" />
                    </button>
                </div>

                {/* Busca */}
                <div className="p-4 border-b border-gray-100">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar cliente por nome ou CNPJ..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-blue-400 outline-none"
                            autoFocus
                        />
                    </div>
                    {search.length > 0 && search.length < 2 && (
                        <p className="text-xs text-gray-400 mt-1">Digite pelo menos 2 caracteres...</p>
                    )}
                </div>

                {/* Resultados */}
                <div className="flex-1 overflow-y-auto p-2">
                    {loading ? (
                        <div className="flex items-center justify-center py-8 text-gray-400">
                            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Buscando...
                        </div>
                    ) : clientes.length === 0 && search.length >= 2 ? (
                        <p className="text-center py-8 text-sm text-gray-400">Nenhum cliente encontrado.</p>
                    ) : (
                        <div className="space-y-1">
                            {clientes.map(c => (
                                <button
                                    key={c.UUID}
                                    onClick={() => handleVincular(c.UUID)}
                                    disabled={vinculando}
                                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-emerald-50 text-left transition-colors disabled:opacity-50"
                                >
                                    <UserCheck className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900 truncate">{c.NomeFantasia || c.Nome}</p>
                                        <div className="flex gap-2 text-[11px] text-gray-400">
                                            {c.Documento && <span>{c.Documento}</span>}
                                            {c.vendedor?.nome && <span>Vend: {c.vendedor.nome}</span>}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ModalReferenciarCliente;
