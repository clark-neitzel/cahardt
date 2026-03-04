import React, { useState, useEffect } from 'react';
import contaFinanceiraService from '../../services/contaFinanceiraService';
import { Landmark, Check, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

const ContasFinanceiras = () => {
    const [contas, setContas] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { carregarDados(); }, []);

    const carregarDados = async () => {
        try {
            setLoading(true);
            const dados = await contaFinanceiraService.listar();
            setContas(dados);
        } catch (error) {
            toast.error('Erro ao carregar contas financeiras');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4 md:space-y-6 px-3 md:px-0">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <Landmark className="h-6 w-6 md:h-8 md:w-8 text-primary" />
                    Contas Financeiras (Bancos)
                </h1>
                <div className="text-xs md:text-sm text-gray-500">
                    Total: {contas.length} registros
                </div>
            </div>

            {loading ? (
                <div className="text-center py-10 text-gray-500">Carregando dados...</div>
            ) : (
                <>
                    {/* Desktop: Tabela */}
                    <div className="hidden md:block bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Banco</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo Uso</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Opção Condição</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fonte Venda ID</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {contas.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400 font-mono">{item.id}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.nomeBanco}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium text-gray-600">{item.tipoUso}</span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.opcaoCondicao || '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400 font-mono" title={item.fonteVendaId}>
                                            {item.fonteVendaId ? `${item.fonteVendaId.substring(0, 8)}...` : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${item.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {item.ativo ? 'Ativo' : 'Inativo'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile: Cards */}
                    <div className="md:hidden space-y-2">
                        {contas.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">Nenhuma conta financeira.</div>
                        ) : contas.map(item => (
                            <div key={item.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                                <div className="flex items-center justify-between mb-1">
                                    <p className="font-bold text-[14px] text-gray-900">{item.nomeBanco}</p>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${item.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                        {item.ativo ? 'Ativo' : 'Inativo'}
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
                                    <span className="bg-gray-100 px-1.5 py-0.5 rounded font-medium">{item.tipoUso}</span>
                                    {item.opcaoCondicao && <span>Condição: {item.opcaoCondicao}</span>}
                                </div>
                                <p className="text-[10px] text-gray-400 font-mono mt-1 truncate">{item.id}</p>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default ContasFinanceiras;
