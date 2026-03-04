import React, { useEffect, useState } from 'react';
import configService from '../../../services/configService';
import formasPagamentoService from '../../../services/formasPagamentoService';
import tabelaPrecoService from '../../../services/tabelaPrecoService';
import { Save, AlertCircle, CheckCircle, Truck, Wallet, CreditCard } from 'lucide-react';
import { Link } from 'react-router-dom';

const Configuracoes = () => {
    const [categorias, setCategorias] = useState([]);
    const [selectedCategorias, setSelectedCategorias] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);

    // Caixa Diário config
    const [formasPagamento, setFormasPagamento] = useState([]);
    const [formasDebitaCaixa, setFormasDebitaCaixa] = useState([]);
    const [condicoesPagamento, setCondicoesPagamento] = useState([]);
    const [condicoesDebitaCaixa, setCondicoesDebitaCaixa] = useState([]);
    const [savingCaixa, setSavingCaixa] = useState(false);
    const [messageCaixa, setMessageCaixa] = useState(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [cats, currentConfig, formas, debitaCaixaConfig, condicoes, condicoesDebitaConfig] = await Promise.all([
                configService.getCategorias(),
                configService.get('categorias_vendas'),
                formasPagamentoService.listar().catch(() => []),
                configService.get('formas_pagamento_debita_caixa').catch(() => []),
                tabelaPrecoService.listar(true).catch(() => []),
                configService.get('condicoes_pagamento_debita_caixa').catch(() => [])
            ]);
            setCategorias(cats);
            setSelectedCategorias(Array.isArray(currentConfig) ? currentConfig : []);
            setFormasPagamento(Array.isArray(formas) ? formas : []);
            setFormasDebitaCaixa(Array.isArray(debitaCaixaConfig) ? debitaCaixaConfig : []);
            setCondicoesPagamento(Array.isArray(condicoes) ? condicoes : []);
            setCondicoesDebitaCaixa(Array.isArray(condicoesDebitaConfig) ? condicoesDebitaConfig : []);
        } catch (error) {
            console.error('Erro ao carregar configurações:', error);
            setMessage({ type: 'error', text: 'Erro ao carregar dados.' });
        } finally {
            setLoading(false);
        }
    };

    const handleToggleCategoria = (cat) => {
        setSelectedCategorias(prev => {
            if (prev.includes(cat)) {
                return prev.filter(c => c !== cat);
            } else {
                return [...prev, cat];
            }
        });
    };

    const handleToggleDebitaCaixa = (formaId) => {
        setFormasDebitaCaixa(prev => {
            if (prev.includes(formaId)) {
                return prev.filter(id => id !== formaId);
            } else {
                return [...prev, formaId];
            }
        });
    };

    const handleToggleCondicaoDebita = (condicaoId) => {
        setCondicoesDebitaCaixa(prev => {
            if (prev.includes(condicaoId)) {
                return prev.filter(id => id !== condicaoId);
            } else {
                return [...prev, condicaoId];
            }
        });
    };

    const handleSaveCaixa = async () => {
        try {
            setSavingCaixa(true);
            setMessageCaixa(null);
            await Promise.all([
                configService.save('formas_pagamento_debita_caixa', formasDebitaCaixa),
                configService.save('condicoes_pagamento_debita_caixa', condicoesDebitaCaixa)
            ]);
            setMessageCaixa({ type: 'success', text: 'Configuração do caixa salva!' });
            setTimeout(() => setMessageCaixa(null), 3000);
        } catch (error) {
            console.error('Erro ao salvar config caixa:', error);
            setMessageCaixa({ type: 'error', text: 'Erro ao salvar configuração do caixa.' });
        } finally {
            setSavingCaixa(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setMessage(null);
            await configService.save('categorias_vendas', selectedCategorias);
            setMessage({ type: 'success', text: 'Configurações salvas com sucesso!' });

            // Auto hide success message
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            console.error('Erro ao salvar:', error);
            setMessage({ type: 'error', text: 'Erro ao salvar configurações.' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Carregando configurações...</div>;

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-2xl font-bold text-gray-800 mb-6">Configurações do Sistema</h1>

            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50">
                    <h2 className="text-lg font-semibold text-gray-700">Catálogo de Vendas</h2>
                    <p className="text-sm text-gray-500">Defina quais produtos aparecem para os vendedores.</p>
                </div>

                <div className="p-6">
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Categorias Visíveis
                        </label>
                        <p className="text-xs text-gray-500 mb-4">
                            Selecione as categorias que devem aparecer no catálogo. Se nenhuma for selecionada, todas aparecerão (ou nenhuma, dependendo da regra).
                            Recomendamos selecionar explicitamente as desejadas.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto p-4 border rounded-md bg-gray-50">
                            {categorias.length === 0 ? (
                                <p className="text-sm text-gray-400 col-span-3 text-center">Nenhuma categoria encontrada nos produtos.</p>
                            ) : (
                                categorias.map(cat => (
                                    <label key={cat} className="flex items-center space-x-3 p-2 bg-white rounded border border-gray-200 hover:bg-blue-50 cursor-pointer transition-colors">
                                        <input
                                            type="checkbox"
                                            className="h-5 w-5 text-primary focus:ring-primary border-gray-300 rounded"
                                            checked={selectedCategorias.includes(cat)}
                                            onChange={() => handleToggleCategoria(cat)}
                                        />
                                        <span className="text-sm text-gray-700 font-medium">{cat}</span>
                                    </label>
                                ))
                            )}
                        </div>
                        <div className="mt-2 text-right text-xs text-gray-500">
                            {selectedCategorias.length} categorias selecionadas de {categorias.length}.
                        </div>
                    </div>

                    {message && (
                        <div className={`p-4 rounded-md mb-4 flex items-center ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            {message.type === 'success' ? <CheckCircle className="h-5 w-5 mr-2" /> : <AlertCircle className="h-5 w-5 mr-2" />}
                            {message.text}
                        </div>
                    )}

                    <div className="flex justify-end pt-4 border-t border-gray-100">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className={`flex items-center px-6 py-2 bg-primary text-white rounded-md font-medium shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                                ${saving ? 'opacity-75' : ''}`}
                        >
                            <Save className="h-5 w-5 mr-2" />
                            {saving ? 'Salvando...' : 'Salvar Alterações'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Nova Seção Sub-Modulos */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden mt-8">
                <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-700 flex items-center">
                            <Truck className="h-5 w-5 mr-2 text-sky-600" />
                            Logística e Expedição
                        </h2>
                        <p className="text-sm text-gray-500">Regras e exceções de controle para os caminhões.</p>
                    </div>
                </div>
                <div className="p-6">
                    <div className="mb-4">
                        <h3 className="text-md font-medium text-gray-800">Meios de Pagamento da Viagem</h3>
                        <p className="text-xs text-gray-500 mt-1 mb-4">
                            Crie parâmetros de baixa como "Caixa Devedor (Motorista)", "Responsabilidade Escritório", Pix na rua, etc. Isso moldará o checkout do Aplicativo.
                        </p>
                        <Link to="/config/pagamentos-entrega" className="inline-flex items-center px-4 py-2 bg-sky-50 text-sky-700 border border-sky-200 rounded-md shadow-sm text-sm font-medium hover:bg-sky-100 transition-colors">
                            Configurar Pagamentos da Entrega
                        </Link>
                    </div>
                </div>
            </div>
            {/* Seção Caixa Diário */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden mt-8">
                <div className="p-6 border-b border-gray-100 bg-gray-50">
                    <h2 className="text-lg font-semibold text-gray-700 flex items-center">
                        <Wallet className="h-5 w-5 mr-2 text-amber-600" />
                        Caixa Diário — Formas que Debitam do Caixa
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Selecione quais formas de pagamento de entrega são consideradas "dinheiro em mãos" do motorista e devem ser descontadas no caixa diário.
                    </p>
                </div>
                <div className="p-6">
                    {formasPagamento.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">
                            Nenhuma forma de pagamento de entrega cadastrada. <Link to="/config/pagamentos-entrega" className="text-primary hover:underline">Cadastre primeiro.</Link>
                        </p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {formasPagamento.filter(f => f.ativo !== false).map(forma => (
                                <label key={forma.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded border border-gray-200 hover:bg-amber-50 cursor-pointer transition-colors">
                                    <input
                                        type="checkbox"
                                        className="h-5 w-5 text-amber-600 focus:ring-amber-500 border-gray-300 rounded"
                                        checked={formasDebitaCaixa.includes(forma.id)}
                                        onChange={() => handleToggleDebitaCaixa(forma.id)}
                                    />
                                    <span className="text-sm text-gray-700 font-medium">{forma.nome}</span>
                                </label>
                            ))}
                        </div>
                    )}

                    <div className="mt-2 text-right text-xs text-gray-500">
                        {formasDebitaCaixa.length} formas selecionadas como débito do caixa.
                    </div>

                    {/* Condições de Pagamento dos Pedidos */}
                    <div className="mt-6 pt-6 border-t border-gray-200">
                        <h3 className="text-md font-semibold text-gray-700 flex items-center mb-1">
                            <CreditCard className="h-4 w-4 mr-2 text-amber-600" />
                            Condições de Pagamento dos Pedidos
                        </h3>
                        <p className="text-xs text-gray-500 mb-4">
                            Selecione quais condições de pagamento usadas nos pedidos também devem ser consideradas como "dinheiro em mãos" do motorista.
                        </p>

                        {condicoesPagamento.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-4">
                                Nenhuma condição de pagamento cadastrada.
                            </p>
                        ) : (() => {
                            // Deduplicar por opcaoCondicao (várias entradas podem ter a mesma condição)
                            const seen = new Set();
                            const condicoesUnicas = condicoesPagamento.filter(cond => {
                                const key = cond.opcaoCondicao || cond.id;
                                if (seen.has(key)) return false;
                                seen.add(key);
                                return true;
                            });
                            return (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {condicoesUnicas.map(cond => (
                                        <label key={cond.opcaoCondicao || cond.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded border border-gray-200 hover:bg-amber-50 cursor-pointer transition-colors">
                                            <input
                                                type="checkbox"
                                                className="h-5 w-5 text-amber-600 focus:ring-amber-500 border-gray-300 rounded"
                                                checked={condicoesDebitaCaixa.includes(cond.opcaoCondicao || cond.id)}
                                                onChange={() => handleToggleCondicaoDebita(cond.opcaoCondicao || cond.id)}
                                            />
                                            <span className="text-sm text-gray-700 font-medium">{cond.nomeCondicao || cond.nome}</span>
                                        </label>
                                    ))}
                                </div>
                            );
                        })()}

                        <div className="mt-2 text-right text-xs text-gray-500">
                            {condicoesDebitaCaixa.length} condições selecionadas como débito do caixa.
                        </div>
                    </div>

                    {messageCaixa && (
                        <div className={`p-4 rounded-md mt-4 flex items-center ${messageCaixa.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            {messageCaixa.type === 'success' ? <CheckCircle className="h-5 w-5 mr-2" /> : <AlertCircle className="h-5 w-5 mr-2" />}
                            {messageCaixa.text}
                        </div>
                    )}

                    <div className="flex justify-end pt-4 border-t border-gray-100 mt-4">
                        <button
                            onClick={handleSaveCaixa}
                            disabled={savingCaixa}
                            className={`flex items-center px-6 py-2 bg-amber-600 text-white rounded-md font-medium shadow-sm hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                                ${savingCaixa ? 'opacity-75' : ''}`}
                        >
                            <Save className="h-5 w-5 mr-2" />
                            {savingCaixa ? 'Salvando...' : 'Salvar Config. Caixa'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Configuracoes;
