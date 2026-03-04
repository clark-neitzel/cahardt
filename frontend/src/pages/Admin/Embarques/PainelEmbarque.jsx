import React, { useState, useEffect } from 'react';
import { Plus, Search, Truck, FileText, X } from 'lucide-react';
import toast from 'react-hot-toast';
import embarqueService from '../../../services/embarqueService';
import vendedorService from '../../../services/vendedorService';
import NovaCargaModal from './NovaCargaModal';
import DetalhesCargaModal from './DetalhesCargaModal';

const PainelEmbarque = () => {
    const [embarques, setEmbarques] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isNovaCargaOpen, setIsNovaCargaOpen] = useState(false);
    const [vendedores, setVendedores] = useState([]);
    const [cargaSelecionadaId, setCargaSelecionadaId] = useState(null);

    const fetchData = async () => {
        try {
            setLoading(true);
            const dataEmbarques = await embarqueService.listar({});
            setEmbarques(dataEmbarques);

            const dataVendedores = await vendedorService.listar();
            // Filtração Avançada: Puxa só quem tá ativo E quem tem a flag 'Pode_Executar_Entregas' ou é Root Admin
            const motoristas = dataVendedores.filter(v => {
                if (!v.ativo) return false;

                try {
                    // Trata string JSON se vier crua do banco, ou objeto já parseado pelo service
                    const perms = typeof v.permissoes === 'string' ? JSON.parse(v.permissoes) : (v.permissoes || {});
                    return !!(perms.admin) || !!(perms.Pode_Executar_Entregas);
                } catch (e) {
                    return false;
                }
            });
            setVendedores(motoristas);
        } catch (error) {
            console.error('Erro ao buscar dados:', error);
            if (error?.response?.status === 403) {
                toast.error('Sem permissão para acessar Embarques. Verifique suas permissões em Vendedores.');
            } else {
                toast.error('Erro ao carregar embarques. Verifique a conexão com o servidor.');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const onCargaCriada = () => {
        setIsNovaCargaOpen(false);
        fetchData();
        toast.success('Novo embarque registrado na doca.');
    };

    return (
        <div className="max-w-7xl mx-auto px-3 md:px-0 py-4 md:py-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 md:p-6 rounded-t-lg shadow-sm border-b gap-3">
                <div className="flex items-center space-x-3">
                    <div className="bg-sky-100 p-2 rounded-lg">
                        <Truck className="h-5 w-5 md:h-6 md:w-6 text-sky-600" />
                    </div>
                    <div>
                        <h1 className="text-lg md:text-2xl font-bold text-gray-900 tracking-tight">Painel de Expedição</h1>
                        <p className="text-xs md:text-sm text-gray-500 hidden sm:block">Gestão Logística de Romaneios, Veículos e Motoristas da Rota</p>
                    </div>
                </div>
                <button
                    onClick={() => setIsNovaCargaOpen(true)}
                    className="inline-flex items-center px-3 md:px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 transition-colors w-full sm:w-auto justify-center"
                >
                    <Plus className="-ml-1 mr-2 h-5 w-5" />
                    Montar Nova Carga
                </button>
            </div>

            {/* Desktop: Tabela */}
            <div className="hidden md:block bg-white shadow overflow-hidden sm:rounded-b-lg">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Carga n°</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Data Programada</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Motorista (Responsável)</th>
                            <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Qtd. NF / Pedidos</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200 text-sm">
                        {loading ? (
                            <tr>
                                <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                                    <Truck className="h-8 w-8 text-gray-300 animate-bounce mb-2 mx-auto" />
                                    Buscando frota...
                                </td>
                            </tr>
                        ) : embarques.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                                    Nenhuma carga despachada recentemente.
                                </td>
                            </tr>
                        ) : embarques.map((emb) => (
                            <tr key={emb.id} className="hover:bg-sky-50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap font-mono font-medium text-gray-900">
                                    #{emb.numero}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-gray-700">
                                    {new Date(emb.dataSaida).toLocaleDateString('pt-BR')}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-gray-700">
                                    {emb.responsavel?.nome || <span className="text-red-500 text-xs text-italic">Usuário Deletado</span>}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center text-gray-900 font-bold">
                                    <span className="bg-gray-100 px-3 py-1 rounded-full text-xs border border-gray-200">{emb._count?.pedidos}</span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button
                                        onClick={() => setCargaSelecionadaId(emb.id)}
                                        className="text-sky-600 hover:text-sky-900 flex items-center justify-end w-full"
                                    >
                                        <FileText className="h-4 w-4 mr-1" /> Analisar / Imprimir
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile: Cards */}
            <div className="md:hidden bg-white rounded-b-lg shadow-sm">
                {loading ? (
                    <div className="text-center py-8 text-gray-500">
                        <Truck className="h-8 w-8 text-gray-300 animate-bounce mb-2 mx-auto" />
                        Buscando frota...
                    </div>
                ) : embarques.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">Nenhuma carga despachada recentemente.</div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {embarques.map((emb) => (
                            <div
                                key={emb.id}
                                onClick={() => setCargaSelecionadaId(emb.id)}
                                className="p-3 active:bg-sky-50 cursor-pointer"
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-mono font-bold text-[14px] text-gray-900">Carga #{emb.numero}</span>
                                    <span className="bg-gray-100 px-2 py-0.5 rounded-full text-[11px] font-bold border border-gray-200 text-gray-700">
                                        {emb._count?.pedidos} pedidos
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
                                    <span>{new Date(emb.dataSaida).toLocaleDateString('pt-BR')}</span>
                                    <span className="font-medium text-gray-700">
                                        {emb.responsavel?.nome || <span className="text-red-500">Sem motorista</span>}
                                    </span>
                                </div>
                                <div className="flex justify-end mt-1">
                                    <span className="text-sky-600 text-[11px] font-semibold flex items-center gap-0.5">
                                        <FileText className="h-3 w-3" /> Analisar
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {isNovaCargaOpen && (
                <NovaCargaModal
                    onClose={() => setIsNovaCargaOpen(false)}
                    vendedores={vendedores}
                    onSuccess={onCargaCriada}
                />
            )}

            {cargaSelecionadaId && (
                <DetalhesCargaModal
                    embarqueId={cargaSelecionadaId}
                    onClose={() => setCargaSelecionadaId(null)}
                    onUpdated={fetchData}
                />
            )}
        </div>
    );
};

export default PainelEmbarque;
