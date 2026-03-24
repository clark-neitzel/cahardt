import React, { useState, useEffect } from 'react';
import tabelaPrecoService from '../../services/tabelaPrecoService';
import contaFinanceiraService from '../../services/contaFinanceiraService';
import api from '../../services/api';
import { BadgeDollarSign, Landmark, X, Save, Plus, Wallet, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

const TabelaPrecos = () => {
    const [condicoes, setCondicoes] = useState([]);
    const [loading, setLoading] = useState(true);

    // Estados do Modal de Edição/Criação
    const [bancos, setBancos] = useState([]);
    const [editingItem, setEditingItem] = useState(null);
    const [isCreating, setIsCreating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editForm, setEditForm] = useState({ acrescimoPreco: 0, valorMinimo: 0, ativo: true, debitaCaixa: false, permiteEspecial: false });
    const [categoriasCA, setCategoriasCA] = useState([]);

    useEffect(() => {
        carregarDados();
    }, []);

    const carregarDados = async () => {
        try {
            setLoading(true);
            const [dados, bancosData, catsRes] = await Promise.all([
                tabelaPrecoService.listar(),
                contaFinanceiraService.listar(),
                api.get('/produtos/categorias-ca').then(r => r.data).catch(() => [])
            ]);
            setCondicoes(dados);
            setBancos(bancosData.filter(b => b.ativo));
            setCategoriasCA(catsRes);
        } catch (error) {
            toast.error('Erro ao carregar dados');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleEditClick = (item) => {
        setIsCreating(false);
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
            debitaCaixa: item.debitaCaixa || false,
            permiteEspecial: item.permiteEspecial || false,
            categoriasEspecial: item.categoriasEspecial || [],
            ativo: item.ativo,
            regrasCategoria: item.regrasCategoria || []
        });
    };

    const handleNewClick = () => {
        setIsCreating(true);
        setEditingItem({ id: '', idCondicao: '' });
        setEditForm({
            id: '',
            idCondicao: '',
            nomeCondicao: '',
            tipoPagamento: '',
            opcaoCondicao: '',
            qtdParcelas: 1,
            parcelasDias: 0,
            exigeBanco: false,
            bancoPadrao: '',
            acrescimoPreco: 0,
            valorMinimo: 0,
            debitaCaixa: false,
            permiteEspecial: false,
            categoriasEspecial: [],
            ativo: true,
            regrasCategoria: []
        });
    };

    const handleCloseModal = () => {
        setEditingItem(null);
        setIsCreating(false);
    };

    const handleSaveEdit = async () => {
        if (!editingItem) return;
        try {
            setSaving(true);

            if (isCreating) {
                if (!editForm.id || !editForm.idCondicao || !editForm.nomeCondicao) {
                    toast.error('Preencha ID, Código e Nome da condição.');
                    setSaving(false);
                    return;
                }
                const nova = await tabelaPrecoService.criar(editForm);
                setCondicoes([...condicoes, nova]);
                toast.success('Condição criada com sucesso');
            } else {
                const updated = await tabelaPrecoService.atualizar(editingItem.id, editForm);
                setCondicoes(condicoes.map(c => c.id === editingItem.id ? { ...c, ...updated } : c));
                toast.success('Condição atualizada com sucesso');
            }

            handleCloseModal();
        } catch (error) {
            console.error(error);
            toast.error(error.response?.data?.error || (isCreating ? 'Erro ao criar condição' : 'Erro ao atualizar condição'));
        } finally {
            setSaving(false);
        }
    };

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
    };

    return (
        <div className="space-y-4 md:space-y-6 px-3 md:px-0">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <BadgeDollarSign className="h-6 w-6 md:h-8 md:w-8 text-primary" />
                    Preços e Condições
                </h1>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleNewClick}
                        className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-lg shadow-sm text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                        <Plus className="h-4 w-4 mr-1" /> Nova Condição
                    </button>
                    <div className="text-xs md:text-sm font-medium text-gray-500 bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-100">
                        {condicoes.length} tabelas no sistema
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-10 text-gray-500">Carregando dados...</div>
            ) : (
                <>
                    {/* Desktop: Tabela */}
                    <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
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
                                        <td className="px-5 py-4 whitespace-nowrap">
                                            <div className="text-sm font-bold text-gray-900">{item.nomeCondicao}</div>
                                            <div className="text-xs text-gray-500 bg-gray-100 inline-block px-1.5 py-0.5 rounded mt-1 font-mono">
                                                ID: {item.idCondicao}
                                            </div>
                                        </td>
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
                                        <td className="px-5 py-4 whitespace-nowrap">
                                            <span className={`text-sm ${item.valorMinimo > 0 ? "font-bold text-blue-700" : "font-medium text-gray-400"}`}>
                                                {item.valorMinimo > 0 ? formatCurrency(item.valorMinimo) : 'Retalho (S/ Limite)'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 whitespace-nowrap">
                                            <div className="flex flex-col gap-1.5 items-start">
                                                <span className={`px-2 py-0.5 inline-flex text-[11px] font-bold rounded-full uppercase tracking-wide border ${item.ativo ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                    {item.ativo ? 'Ativo' : 'Inativo'}
                                                </span>
                                                {item.debitaCaixa && (
                                                    <div className="flex items-center gap-1 text-amber-600 text-xs font-medium">
                                                        <Wallet className="h-3 w-3" /> Debita Caixa
                                                    </div>
                                                )}
                                                {item.exigeBanco && (
                                                    <div className="flex items-center gap-1 text-orange-600 text-xs font-medium" title={item.bancoPadrao}>
                                                        <Landmark className="h-3 w-3" /> Exige Banco
                                                    </div>
                                                )}
                                                {item.permiteEspecial && (
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-200">
                                                        Especial
                                                    </span>
                                                )}
                                                {item.regrasCategoria?.length > 0 && (
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-200">
                                                        {item.regrasCategoria.length} regra(s) categoria
                                                    </span>
                                                )}
                                            </div>
                                        </td>
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

                    {/* Mobile: Cards */}
                    <div className="md:hidden space-y-2">
                        {condicoes.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">Nenhuma condição cadastrada.</div>
                        ) : condicoes.map(item => (
                            <div key={item.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                                <div className="flex items-start justify-between mb-1.5">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-[14px] text-gray-900">{item.nomeCondicao}</p>
                                        <p className="text-[10px] text-gray-400 font-mono mt-0.5">ID: {item.idCondicao}</p>
                                    </div>
                                    <div className="flex items-center gap-1.5 ml-2">
                                        {item.permiteEspecial && (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-200">
                                                Especial
                                            </span>
                                        )}
                                        {item.debitaCaixa && (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                                                Caixa
                                            </span>
                                        )}
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${item.ativo ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                            {item.ativo ? 'Ativo' : 'Inativo'}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500 mb-2">
                                    <span className="bg-gray-100 px-1.5 py-0.5 rounded font-medium">{item.tipoPagamento || '-'}</span>
                                    <span>{item.opcaoCondicao || 'N/A'} | {item.qtdParcelas}x | {item.parcelasDias} dias</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex gap-2">
                                        {item.acrescimoPreco > 0 ? (
                                            <span className="text-[11px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">+{item.acrescimoPreco}%</span>
                                        ) : (
                                            <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Sem Juros</span>
                                        )}
                                        <span className={`text-[11px] ${item.valorMinimo > 0 ? 'font-bold text-blue-700' : 'text-gray-400'}`}>
                                            {item.valorMinimo > 0 ? formatCurrency(item.valorMinimo) : 'S/ Limite'}
                                        </span>
                                        {item.exigeBanco && (
                                            <span className="text-[11px] text-orange-600 font-medium flex items-center gap-0.5">
                                                <Landmark className="h-3 w-3" /> Banco
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => handleEditClick(item)}
                                        className="text-blue-600 font-semibold bg-blue-50 px-2.5 py-1 rounded-lg text-[12px]"
                                    >
                                        Editar
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* MODAL DE EDIÇÃO / CRIAÇÃO */}
            {editingItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden transform transition-all">
                        {/* Header */}
                        <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50/50">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 leading-tight">
                                    {isCreating ? 'Nova Condição' : 'Configurar Tabela'}
                                </h3>
                                <p className="text-sm text-gray-500 mt-0.5">
                                    {isCreating ? 'Preencha os dados da nova condição' : `Editando ID: ${editingItem.idCondicao}`}
                                </p>
                            </div>
                            <button
                                onClick={handleCloseModal}
                                className="text-gray-400 hover:text-gray-600 bg-white hover:bg-gray-100 p-1.5 rounded-full transition-colors border border-transparent hover:border-gray-200"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">

                            {/* ID e Código (só na criação) */}
                            {isCreating && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">ID (Ex: 1009)</label>
                                        <input
                                            type="text"
                                            className="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2.5 px-3 bg-white text-gray-900 font-medium"
                                            value={editForm.id}
                                            onChange={(e) => setEditForm({ ...editForm, id: e.target.value })}
                                            placeholder="1009"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Código (Ex: BOL_35)</label>
                                        <input
                                            type="text"
                                            className="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2.5 px-3 bg-white text-gray-900 font-medium"
                                            value={editForm.idCondicao}
                                            onChange={(e) => setEditForm({ ...editForm, idCondicao: e.target.value })}
                                            placeholder="BOL_35"
                                        />
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Descrição (Nome)</label>
                                <input
                                    type="text"
                                    className="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2.5 px-3 bg-white text-gray-900 font-medium"
                                    value={editForm.nomeCondicao}
                                    onChange={(e) => setEditForm({ ...editForm, nomeCondicao: e.target.value })}
                                    placeholder="Ex: 35 dias - Boleto"
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

                            {/* Permite Especial */}
                            <div className="p-4 bg-violet-50 rounded-lg border border-violet-200 space-y-3">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="rounded border-gray-300 text-violet-600 focus:ring-violet-500 h-4 w-4"
                                        checked={editForm.permiteEspecial}
                                        onChange={(e) => setEditForm({ ...editForm, permiteEspecial: e.target.checked })}
                                    />
                                    <span className="text-sm font-semibold text-violet-800">Permite Pedido Especial</span>
                                </label>
                                <p className="text-[11px] text-violet-600 mt-1 ml-6">
                                    Marque se esta condição pode ser usada em pedidos especiais. Apenas condições marcadas aparecerão no dropdown quando o vendedor ativar "Especial".
                                </p>

                                {/* Categorias visíveis no pedido especial */}
                                {editForm.permiteEspecial && categoriasCA.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-violet-200">
                                        <label className="block text-sm font-semibold text-violet-800 mb-1">Categorias de Produto Visíveis</label>
                                        <p className="text-[11px] text-violet-600 mb-2">
                                            Selecione quais categorias de produto aparecem ao criar um pedido especial com esta condição.
                                        </p>
                                        <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                                            {categoriasCA.map(cat => (
                                                <label key={cat} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-violet-100 cursor-pointer transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        className="rounded border-gray-300 text-violet-600 focus:ring-violet-500 h-3.5 w-3.5"
                                                        checked={(editForm.categoriasEspecial || []).includes(cat)}
                                                        onChange={(e) => {
                                                            const atual = editForm.categoriasEspecial || [];
                                                            const novas = e.target.checked
                                                                ? [...atual, cat]
                                                                : atual.filter(c => c !== cat);
                                                            setEditForm({ ...editForm, categoriasEspecial: novas });
                                                        }}
                                                    />
                                                    <span className="text-xs text-gray-800 font-medium">{cat}</span>
                                                </label>
                                            ))}
                                        </div>
                                        {(editForm.categoriasEspecial || []).length > 0 && (
                                            <p className="text-[10px] text-violet-500 mt-2">
                                                {(editForm.categoriasEspecial || []).length} categoria(s) selecionada(s)
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Debita Caixa */}
                            <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="rounded border-gray-300 text-amber-600 focus:ring-amber-500 h-4 w-4"
                                        checked={editForm.debitaCaixa}
                                        onChange={(e) => setEditForm({ ...editForm, debitaCaixa: e.target.checked })}
                                    />
                                    <Wallet className="h-4 w-4 text-amber-600" />
                                    <span className="text-sm font-semibold text-amber-800">Debita do Caixa do Motorista</span>
                                </label>
                                <p className="text-[11px] text-amber-600 mt-1 ml-6">
                                    Marque se o motorista recebe o dinheiro em mãos (ex: À vista Dinheiro). Não marque se o pagamento vai pelo banco (ex: Pix, Boleto).
                                </p>
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

                            {/* Regras por Categoria CA (para Pedidos Especiais) */}
                            <div className="pt-2 border-t border-gray-100">
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700">Regras por Categoria (Especiais)</label>
                                        <p className="text-[11px] text-gray-500">Define preço base e acréscimo diferenciados por categoria do CA para pedidos especiais.</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const regras = [...(editForm.regrasCategoria || [])];
                                            regras.push({ categoria: '', precoBase: 'valorVenda', acrescimo: 0 });
                                            setEditForm({ ...editForm, regrasCategoria: regras });
                                        }}
                                        className="text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 px-2 py-1 rounded border border-purple-200 transition-colors flex items-center gap-1"
                                    >
                                        <Plus className="h-3 w-3" /> Regra
                                    </button>
                                </div>
                                {(editForm.regrasCategoria || []).length > 0 && (
                                    <div className="space-y-2 bg-purple-50 p-3 rounded-lg border border-purple-200">
                                        {(editForm.regrasCategoria || []).map((regra, idx) => (
                                            <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded border border-purple-100">
                                                <select
                                                    className="flex-1 text-xs border-gray-300 rounded py-1.5 px-2 bg-white text-gray-900"
                                                    value={regra.categoria}
                                                    onChange={(e) => {
                                                        const regras = [...editForm.regrasCategoria];
                                                        regras[idx] = { ...regras[idx], categoria: e.target.value };
                                                        setEditForm({ ...editForm, regrasCategoria: regras });
                                                    }}
                                                >
                                                    <option value="">Categoria...</option>
                                                    {categoriasCA.map(cat => (
                                                        <option key={cat} value={cat}>{cat}</option>
                                                    ))}
                                                </select>
                                                <select
                                                    className="w-28 text-xs border-gray-300 rounded py-1.5 px-2 bg-white text-gray-900"
                                                    value={regra.precoBase}
                                                    onChange={(e) => {
                                                        const regras = [...editForm.regrasCategoria];
                                                        regras[idx] = { ...regras[idx], precoBase: e.target.value };
                                                        setEditForm({ ...editForm, regrasCategoria: regras });
                                                    }}
                                                >
                                                    <option value="valorVenda">Preço Venda</option>
                                                    <option value="custoMedio">Custo Médio</option>
                                                </select>
                                                <div className="relative w-20">
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        className="w-full text-xs border-gray-300 rounded py-1.5 pl-2 pr-5 bg-white text-gray-900"
                                                        value={regra.acrescimo}
                                                        onChange={(e) => {
                                                            const regras = [...editForm.regrasCategoria];
                                                            regras[idx] = { ...regras[idx], acrescimo: Number(e.target.value) };
                                                            setEditForm({ ...editForm, regrasCategoria: regras });
                                                        }}
                                                        placeholder="0"
                                                    />
                                                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-bold">%</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const regras = editForm.regrasCategoria.filter((_, i) => i !== idx);
                                                        setEditForm({ ...editForm, regrasCategoria: regras });
                                                    }}
                                                    className="text-red-400 hover:text-red-600 p-1"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                        <p className="text-[10px] text-purple-600 mt-1">
                                            Categorias sem regra usam o acréscimo geral ({editForm.acrescimoPreco || 0}%) sobre preço de venda.
                                            Se preço ficar abaixo do custo médio, o item é marcado no pedido.
                                        </p>
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
                                    <option value="true">Ativa para vendas</option>
                                    <option value="false">Inativa (Oculta do Vendedor)</option>
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
                                        <span>{isCreating ? 'Criar Condição' : 'Salvar Alterações'}</span>
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
