import React, { useState, useEffect } from 'react';
import tabelaPrecoService from '../../services/tabelaPrecoService';
import contaFinanceiraService from '../../services/contaFinanceiraService';
import { BadgeDollarSign, Landmark, X, Save } from 'lucide-react';
import { toast } from 'react-hot-toast';

const TabelaPrecos = () => {
    const [condicoes, setCondicoes] = useState([]);
    const [loading, setLoading] = useState(true);

    // Estados do Modal de Edição
    const [bancos, setBancos] = useState([]);
    const [editingItem, setEditingItem] = useState(null);
    const [saving, setSaving] = useState(false);
    const [editForm, setEditForm] = useState({ acrescimoPreco: 0, valorMinimo: 0, ativo: true });

    useEffect(() => {
        carregarDados();
    }, []);

    const carregarDados = async () => {
        try {
            setLoading(true);
            const [dados, bancosData] = await Promise.all([
                tabelaPrecoService.listar(),
                contaFinanceiraService.listar()
            ]);
            setCondicoes(dados);
            setBancos(bancosData.filter(b => b.ativo)); // apenas bancos ativos
        } catch (error) {
            toast.error('Erro ao carregar dados');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleEditClick = (item) => {
        setEditingItem(item);
        setEditForm({
            nomeCondicao: item.nomeCondicao || '',
            tipoPagamento: item.tipoPagamento || '',
            opcaoCondicao: item.opcaoCondicao || '',
            qtdParcelas: item.qtdParcelas || 1,
            parcelasDias: item.parcelasDias || 0,
            exigeBanco: item.exigeBanco || false,
            bancoPadrao: item.bancoPadrao || '',
            acrescimoPreco: item.acrescimoPreco || 0,
            valorMinimo: item.valorMinimo || 0,
            ativo: item.ativo
        });
    };

    const handleCloseModal = () => {
        setEditingItem(null);
    };

    const handleSaveEdit = async () => {
        if (!editingItem) return;
        try {
            setSaving(true);
            const updated = await tabelaPrecoService.atualizar(editingItem.id, editForm);

            // Atualizar lista local
            setCondicoes(condicoes.map(c => c.id === editingItem.id ? { ...c, ...updated } : c));

            toast.success('Condição atualizada com sucesso');
            handleCloseModal();
        } catch (error) {
            console.error(error);
            toast.error('Erro ao atualizar condição');
        } finally {
            setSaving(false);
        }
    };

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <BadgeDollarSign className="h-8 w-8 text-primary" />
                    Preços e Condições
                </h1>
                <div className="text-sm font-medium text-gray-500 bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-100">
                    {condicoes.length} tabelas no sistema
                </div>
            </div>

            {loading ? (
                <div className="text-center py-10 text-gray-500">Carregando dados...</div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50/80">
                            <tr>
                                <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Descrição</th>
                                <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Forma de Pag.</th>
                                <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Acréscimo</th>
                                <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Valor Mínimo</th>
                                <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Regras / Status</th>
                                <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {condicoes.map((item) => (
                                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                                    {/* DESCRIÇÃO E ID */}
                                    <td className="px-5 py-4 whitespace-nowrap">
                                        <div className="text-sm font-bold text-gray-900">{item.nomeCondicao}</div>
                                        <div className="text-xs text-gray-500 bg-gray-100 inline-block px-1.5 py-0.5 rounded mt-1 font-mono">
                                            ID: {item.idCondicao}
                                        </div>
                                    </td>

                                    {/* TIPO E PRAZO */}
                                    <td className="px-5 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-700 font-medium">{item.tipoPagamento || '-'}</div>
                                        <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                            <span>{item.opcaoCondicao || "N/A"}</span>
                                            <span className="text-gray-300">•</span>
                                            <span>{item.qtdParcelas}x</span>
                                            <span className="text-gray-300">•</span>
                                            <span>{item.parcelasDias} dias</span>
                                        </div>
                                    </td>

                                    {/* ACRÉSCIMO */}
                                    <td className="px-5 py-4 whitespace-nowrap">
                                        {item.acrescimoPreco > 0 ? (
                                            <span className="text-sm font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">
                                                +{item.acrescimoPreco}%
                                            </span>
                                        ) : (
                                            <span className="text-sm font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                                                Sem Juros
                                            </span>
                                        )}
                                    </td>

                                    {/* VALOR MÍNIMO */}
                                    <td className="px-5 py-4 whitespace-nowrap">
                                        <span className={`text-sm ${item.valorMinimo > 0 ? "font-bold text-blue-700" : "font-medium text-gray-400"}`}>
                                            {item.valorMinimo > 0 ? formatCurrency(item.valorMinimo) : 'Retalho (S/ Limite)'}
                                        </span>
                                    </td>

                                    {/* REGRAS E STATUS */}
                                    <td className="px-5 py-4 whitespace-nowrap">
                                        <div className="flex flex-col gap-1.5 items-start">
                                            <span className={`px-2 py-0.5 inline-flex text-[11px] font-bold rounded-full uppercase tracking-wide border ${item.ativo ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                {item.ativo ? 'Ativo' : 'Inativo'}
                                            </span>
                                            {item.exigeBanco && (
                                                <div className="flex items-center gap-1 text-orange-600 text-xs font-medium" title={item.bancoPadrao}>
                                                    <Landmark className="h-3 w-3" /> Exige Banco
                                                </div>
                                            )}
                                        </div>
                                    </td>

                                    {/* AÇÕES */}
                                    <td className="px-5 py-4 whitespace-nowrap text-right">
                                        <button
                                            onClick={() => handleEditClick(item)}
                                            className="text-blue-600 hover:text-blue-800 font-semibold bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors text-sm"
                                        >
                                            Editar
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* MODAL DE EDIÇÃO */}
            {editingItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden transform transition-all">
                        {/* Header */}
                        <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50/50">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 leading-tight">Configurar Tabela</h3>
                                <p className="text-sm text-gray-500 mt-0.5">Editando ID: {editingItem.idCondicao}</p>
                            </div>
                            <button
                                onClick={handleCloseModal}
                                className="text-gray-400 hover:text-gray-600 bg-white hover:bg-gray-100 p-1.5 rounded-full transition-colors border border-transparent hover:border-gray-200"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Body - adicionado Max Height para scroll caso tenham muitos campos */}
                        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Descrição (Nome)</label>
                                <input
                                    type="text"
                                    className="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2.5 px-3 bg-white text-gray-900 font-medium"
                                    value={editForm.nomeCondicao}
                                    onChange={(e) => setEditForm({ ...editForm, nomeCondicao: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Tipo de Pagamento</label>
                                    <select
                                        className="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2.5 px-3 bg-white text-gray-900 font-medium"
                                        value={editForm.tipoPagamento}
                                        onChange={(e) => setEditForm({ ...editForm, tipoPagamento: e.target.value })}
                                    >
                                        <option value="">Selecione...</option>
                                        <option value="DINHEIRO">Dinheiro</option>
                                        <option value="PIX">Pix</option>
                                        <option value="BOLETO_BANCARIO">Boleto Bancário</option>
                                        <option value="CARTAO">Cartão</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Opção (Ex: À vista)</label>
                                    <input
                                        type="text"
                                        className="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2.5 px-3 bg-white text-gray-900 font-medium"
                                        value={editForm.opcaoCondicao}
                                        onChange={(e) => setEditForm({ ...editForm, opcaoCondicao: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Qtd. Parcelas</label>
                                    <input
                                        type="number"
                                        min="1"
                                        className="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2.5 px-3 bg-white text-gray-900 font-medium"
                                        value={editForm.qtdParcelas}
                                        onChange={(e) => setEditForm({ ...editForm, qtdParcelas: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Intervalo (Dias)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        className="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2.5 px-3 bg-white text-gray-900 font-medium"
                                        value={editForm.parcelasDias}
                                        onChange={(e) => setEditForm({ ...editForm, parcelasDias: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                        Acréscimo (%)
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2.5 pl-3 pr-8 bg-white text-gray-900 font-medium"
                                            placeholder="0,00"
                                            value={editForm.acrescimoPreco}
                                            onChange={(e) => setEditForm({ ...editForm, acrescimoPreco: e.target.value })}
                                        />
                                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-500 font-bold">
                                            %
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-gray-500 mt-1">Juros sobre o preço normal.</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                        Valor Mínimo
                                    </label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <span className="text-gray-500 font-medium sm:text-sm">R$</span>
                                        </div>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2.5 pl-9 pr-3 bg-white text-gray-900 font-medium"
                                            placeholder="0,00"
                                            value={editForm.valorMinimo}
                                            onChange={(e) => setEditForm({ ...editForm, valorMinimo: e.target.value })}
                                        />
                                    </div>
                                    <p className="text-[11px] text-gray-500 mt-1">0 = Sem bloqueio.</p>
                                </div>
                            </div>

                            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                                        checked={editForm.exigeBanco}
                                        onChange={(e) => setEditForm({ ...editForm, exigeBanco: e.target.checked })}
                                    />
                                    <span className="text-sm font-semibold text-gray-700">Exige Informar Banco</span>
                                </label>
                                {editForm.exigeBanco && (
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Banco Padrão (Conta Financeira)</label>
                                        <select
                                            className="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 py-1.5 px-3 bg-white text-gray-900 text-sm font-medium"
                                            value={editForm.bancoPadrao}
                                            onChange={(e) => setEditForm({ ...editForm, bancoPadrao: e.target.value })}
                                        >
                                            <option value="">Selecione um banco...</option>
                                            {bancos.map(b => (
                                                <option key={b.id} value={b.id}>
                                                    {b.nomeBanco} (ID: {b.id.substring(0, 8)}...)
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>

                            <div className="pt-2 border-t border-gray-100">
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Status da Tabela no Sistema</label>
                                <select
                                    className="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2.5 px-3 bg-gray-50/50 text-gray-900 font-medium"
                                    value={editForm.ativo ? 'true' : 'false'}
                                    onChange={(e) => setEditForm({ ...editForm, ativo: e.target.value === 'true' })}
                                >
                                    <option value="true">🟢 Ativa para vendas</option>
                                    <option value="false">🔴 Inativa (Oculta do Vendedor)</option>
                                </select>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-5 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={handleCloseModal}
                                disabled={saving}
                                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveEdit}
                                disabled={saving}
                                className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm transition-colors disabled:opacity-50"
                            >
                                {saving ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white"></div>
                                        <span>Salvando...</span>
                                    </>
                                ) : (
                                    <>
                                        <Save className="h-4 w-4" />
                                        <span>Salvar Alterações</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TabelaPrecos;
