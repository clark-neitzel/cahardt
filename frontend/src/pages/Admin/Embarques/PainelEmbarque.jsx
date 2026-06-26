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
        <div className="max-w-7xl mx-auto px-3 md:px-0 py-4 md:py-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 md:p-5 rounded-t-xl shadow-sm border border-gray-200 border-b-0 gap-3">
                <div className="flex items-center gap-3">
                    <div className="bg-sky-100 p-2 rounded-lg">
                        <Truck className="h-5 w-5 text-sky-600" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-gray-900">Painel de Expedição</h1>
                        <p className="text-xs text-gray-500 hidden sm:block">Gestão logística de romaneios, veículos e motoristas</p>
                    </div>
                </div>
                <button
                    onClick={() => setIsNovaCargaOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl shadow-sm text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 transition-colors w-full sm:w-auto justify-center"
                >
                    <Plus className="h-4 w-4" />
                    Montar Nova Carga
                </button>
            </div>

            {/* Desktop: Tabela */}
            <div className="hidden md:block bg-white shadow-sm overflow-hidden rounded-b-xl border border-gray-200 border-t-0">
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
                                <td colSpan="5" className="px-6 py-10 text-center">
                                    <div className="flex items-center justify-center gap-2 text-gray-500">
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-sky-600"></div>
                                        <span className="text-sm">Buscando frota…</span>
                                    </div>
                                </td>
                            </tr>
                        ) : embarques.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="px-6 py-10 text-center">
                                    <div className="flex flex-col items-center gap-2 text-gray-400">
                                        <Truck className="h-10 w-10 text-gray-200" />
                                        <span className="text-sm">Nenhuma carga despachada recentemente.</span>
                                    </div>
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
            <div className="md:hidden bg-white rounded-b-xl shadow-sm border border-gray-200 border-t-0">
                {loading ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-sky-600"></div>
                        <span className="text-sm">Buscando frota…</span>
                    </div>
                ) : embarques.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
                        <Truck className="h-10 w-10 text-gray-200" />
                        <span className="text-sm">Nenhuma carga despachada recentemente.</span>
                    </div>
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
                    motoristas={vendedores}
                />
            )}
        </div>
    );
};

export default PainelEmbarque;
