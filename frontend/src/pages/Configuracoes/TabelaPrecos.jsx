import React, { useState, useEffect } from 'react';
import tabelaPrecoService from '../../services/tabelaPrecoService';
import { BadgeDollarSign, Calendar, Landmark, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

const TabelaPrecos = () => {
    const [condicoes, setCondicoes] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        carregarDados();
    }, []);

    const carregarDados = async () => {
        try {
            setLoading(true);
            const dados = await tabelaPrecoService.listar();
            setCondicoes(dados);
        } catch (error) {
            toast.error('Erro ao carregar tabela de preços');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    };

    const formatPercent = (value) => {
        return new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1 }).format(value / 100);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <BadgeDollarSign className="h-8 w-8 text-primary" />
                    Tabela de Preços e Condições
                </h1>
                <div className="text-sm text-gray-500">
                    Total: {condicoes.length} registros
                </div>
            </div>

            {loading ? (
                <div className="text-center py-10 text-gray-500">Carregando dados...</div>
            ) : (
                <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descrição (Nome)</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo / Opção</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Qtd Parc.</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Dias</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acréscimo</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Regras</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {condicoes.map((item) => (
                                <tr key={item.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {item.id}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                        <div className="font-semibold">{item.nomeCondicao}</div>
                                        <div className="text-xs text-gray-500">{item.idCondicao}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <div>{item.tipoPagamento || '-'}</div>
                                        <div className="text-xs text-gray-400">{item.opcaoCondicao}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center font-medium">
                                        {item.qtdParcelas}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                                        {item.parcelasDias} dias
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {item.acrescimoPreco > 0 ? (
                                            <span className="text-red-600 font-medium">+{item.acrescimoPreco}%</span>
                                        ) : (
                                            <span className="text-green-600">Sem acréscimo</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {item.exigeBanco && (
                                            <div className="flex items-center gap-1 text-orange-600 text-xs" title="Exige Banco Padrão">
                                                <Landmark className="h-4 w-4" />
                                                Exige Banco
                                            </div>
                                        )}
                                        {item.bancoPadrao && (
                                            <div className="text-xs text-gray-400 mt-1 truncate max-w-[100px]" title={item.bancoPadrao}>
                                                ID: {item.bancoPadrao}
                                            </div>
                                        )}
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
            )}
        </div>
    );
};

export default TabelaPrecos;
