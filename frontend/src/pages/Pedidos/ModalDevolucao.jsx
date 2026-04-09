import React, { useState, useEffect } from 'react';
import { X, Loader, Package, Upload, FileText } from 'lucide-react';
import devolucaoService from '../../services/devolucaoService';
import api from '../../services/api';
import toast from 'react-hot-toast';
import WizardProcessarCA from './WizardProcessarCA';

const ModalDevolucao = ({ entrega, onClose, onSalvo }) => {
    // entrega: { pedidoId, clienteNome, numero, especial, statusEntrega, valorPedido, itensDevolvidos, idVendaContaAzul }
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [pedido, setPedido] = useState(null);
    const [itensQtd, setItensQtd] = useState({}); // produtoId → quantidade devolvida
    const [motivo, setMotivo] = useState('');
    const [observacao, setObservacao] = useState('');
    // Campos CA
    const isCA = !!entrega.idVendaContaAzul && !entrega.especial;
    const isBoleto = isCA && (entrega.condicaoPagamento || '').toLowerCase().includes('boleto');
    const [notaDevolucaoCA, setNotaDevolucaoCA] = useState('');
    const [pdfFile, setPdfFile] = useState(null);
    const [wizardDevolucao, setWizardDevolucao] = useState(null); // devolução criada, abre wizard

    useEffect(() => {
        carregarPedido();
    }, []);

    const carregarPedido = async () => {
        try {
            setLoading(true);
            const res = await api.get(`/pedidos/${entrega.pedidoId}`);
            const ped = res.data;
            setPedido(ped);

            // Pré-preencher quantidades com itensDevolvidos existentes (da entrega)
            const qtdMap = {};
            if (ped.itensDevolvidos?.length > 0) {
                ped.itensDevolvidos.forEach(dev => {
                    qtdMap[dev.produtoId] = Number(dev.quantidade);
                });
            } else if (entrega.statusEntrega === 'DEVOLVIDO') {
                // Se foi devolvido total, preencher com quantidade original
                ped.itens?.forEach(item => {
                    qtdMap[item.produtoId] = Number(item.quantidade);
                });
            }
            setItensQtd(qtdMap);

            // Pré-preencher motivo se houver
            if (ped.motivoDevolucao) setMotivo(ped.motivoDevolucao);
        } catch (error) {
            toast.error('Erro ao carregar dados do pedido.');
            onClose();
        } finally {
            setLoading(false);
        }
    };

    const handleQtdChange = (produtoId, valor, max) => {
        const v = Math.max(0, Math.min(Number(valor) || 0, max));
        setItensQtd(prev => ({ ...prev, [produtoId]: v }));
    };

    const itensParaDevolver = pedido?.itens?.filter(i => (itensQtd[i.produtoId] || 0) > 0) || [];
    const valorTotalDevolucao = itensParaDevolver.reduce((sum, i) => {
        return sum + (itensQtd[i.produtoId] || 0) * Number(i.valor);
    }, 0);

    const handleSalvar = async () => {
        if (!motivo.trim()) {
            toast.error('Informe o motivo da devolução.');
            return;
        }
        if (itensParaDevolver.length === 0) {
            toast.error('Selecione ao menos um item para devolver.');
            return;
        }
        if (isCA && !notaDevolucaoCA.trim()) {
            toast.error('Informe o número da nota de devolução.');
            return;
        }

        try {
            setSaving(true);
            const itens = itensParaDevolver.map(i => ({
                produtoId: i.produtoId,
                quantidade: itensQtd[i.produtoId]
            }));

            if (isCA) {
                const formData = new FormData();
                formData.append('pedidoId', entrega.pedidoId);
                formData.append('itens', JSON.stringify(itens));
                formData.append('motivo', motivo.trim());
                formData.append('observacao', observacao.trim());
                formData.append('notaDevolucaoCA', notaDevolucaoCA.trim());
                if (pdfFile) formData.append('pdf', pdfFile);

                const devCriada = await devolucaoService.criarContaAzul(formData);

                if (isBoleto) {
                    // Abrir wizard para processar boleto no CA
                    setWizardDevolucao(devCriada);
                    setSaving(false);
                    return;
                }
            } else {
                await devolucaoService.criarEspecial({
                    pedidoId: entrega.pedidoId,
                    itens,
                    motivo: motivo.trim(),
                    observacao: observacao.trim()
                });
            }

            onSalvo();
        } catch (error) {
            toast.error(error.response?.data?.error || error.message || 'Erro ao registrar devolução.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
            <div
                className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto shadow-xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between z-10 rounded-t-2xl">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Registrar Devolução</h2>
                        <p className="text-xs text-gray-500">
                            {entrega.numero ? `Pedido #${entrega.numero}` : entrega.pedidoId.slice(0, 8)} · {entrega.clienteNome}
                            {isCA && <span className="ml-1 text-blue-600 font-medium">(Conta Azul)</span>}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                ) : (
                    <div className="px-5 py-4 space-y-4">
                        {/* Status da entrega */}
                        <div className="flex items-center gap-2 p-2.5 bg-red-50 rounded-lg border border-red-200">
                            <Package className="h-4 w-4 text-red-500" />
                            <span className="text-sm text-red-700 font-medium">
                                Entrega: {entrega.statusEntrega} · Valor: R$ {Number(entrega.valorPedido || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                        </div>

                        {/* Itens do pedido */}
                        <div>
                            <p className="text-sm font-semibold text-gray-700 mb-2">Itens para devolução</p>
                            <div className="space-y-2">
                                {pedido?.itens?.map(item => {
                                    const max = Number(item.quantidade);
                                    const qtd = itensQtd[item.produtoId] || 0;
                                    const valorItem = qtd * Number(item.valor);
                                    return (
                                        <div key={item.id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${qtd > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 truncate">{item.produto?.nome || item.produtoId}</p>
                                                <p className="text-xs text-gray-500">
                                                    {max} {item.produto?.unidade || 'un'} × R$ {Number(item.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={max}
                                                    step="any"
                                                    value={qtd || ''}
                                                    onChange={e => handleQtdChange(item.produtoId, e.target.value, max)}
                                                    placeholder="0"
                                                    className="w-20 text-center border rounded-lg py-1.5 text-sm focus:ring-2 focus:ring-red-300 focus:border-red-400"
                                                />
                                                {qtd > 0 && (
                                                    <span className="text-xs text-red-600 font-medium whitespace-nowrap">
                                                        -R$ {valorItem.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Resumo financeiro */}
                        {itensParaDevolver.length > 0 && (
                            <div className="p-3 bg-red-100 rounded-lg border border-red-300">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-semibold text-red-800">Valor total da devolução:</span>
                                    <span className="text-lg font-bold text-red-900">
                                        R$ {valorTotalDevolucao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <p className="text-xs text-red-600 mt-1">
                                    {itensParaDevolver.length} item(s) · Estoque será creditado · Conta a receber será ajustada
                                </p>
                            </div>
                        )}

                        {/* Motivo */}
                        <div>
                            <label className="text-sm font-semibold text-gray-700">Motivo da Devolução *</label>
                            <textarea
                                value={motivo}
                                onChange={e => setMotivo(e.target.value)}
                                placeholder="Descreva o motivo da devolução..."
                                className="w-full mt-1 border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-red-300 focus:border-red-400 resize-none"
                                rows={3}
                            />
                        </div>

                        {/* Observação */}
                        <div>
                            <label className="text-sm font-semibold text-gray-700">Observação (opcional)</label>
                            <textarea
                                value={observacao}
                                onChange={e => setObservacao(e.target.value)}
                                placeholder="Observações adicionais..."
                                className="w-full mt-1 border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-gray-300 resize-none"
                                rows={2}
                            />
                        </div>

                        {/* Campos exclusivos CA */}
                        {isCA && (
                            <div className="space-y-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                                <p className="text-xs font-bold text-blue-700 uppercase">Dados da Nota de Devolução (Conta Azul)</p>
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Número da Nota *</label>
                                    <input
                                        type="text"
                                        value={notaDevolucaoCA}
                                        onChange={e => setNotaDevolucaoCA(e.target.value)}
                                        placeholder="Ex: 12345"
                                        className="w-full mt-1 border rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-300"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700">PDF da Nota (opcional)</label>
                                    <div className="mt-1">
                                        <label className="flex items-center gap-2 cursor-pointer border-2 border-dashed border-blue-300 rounded-lg p-3 hover:bg-blue-100 transition">
                                            {pdfFile ? (
                                                <>
                                                    <FileText className="h-5 w-5 text-blue-600" />
                                                    <span className="text-sm text-blue-700 font-medium truncate">{pdfFile.name}</span>
                                                    <button onClick={(ev) => { ev.preventDefault(); setPdfFile(null); }} className="ml-auto text-red-500 hover:text-red-700">
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <Upload className="h-5 w-5 text-blue-400" />
                                                    <span className="text-sm text-blue-500">Selecionar arquivo PDF ou imagem</span>
                                                </>
                                            )}
                                            <input
                                                type="file"
                                                accept=".pdf,image/*"
                                                onChange={e => setPdfFile(e.target.files[0] || null)}
                                                className="hidden"
                                            />
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Aviso boleto */}
                        {isBoleto && itensParaDevolver.length > 0 && (
                            <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800">
                                <p className="font-bold">Pedido com boleto detectado</p>
                                <p>Apos registrar a devolucao, um assistente guiado ajudara a processar no Conta Azul (cancelar cobranca, aplicar desconto, gerar novo boleto).</p>
                            </div>
                        )}

                        {/* Botão confirmar */}
                        <button
                            onClick={handleSalvar}
                            disabled={saving || itensParaDevolver.length === 0 || !motivo.trim()}
                            className="w-full bg-red-600 text-white font-bold py-3.5 rounded-xl text-[15px] flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-red-700 transition"
                        >
                            {saving ? <Loader className="h-5 w-5 animate-spin" /> : null}
                            {saving ? 'Registrando...' : isBoleto
                                ? `Registrar e Processar no CA · R$ ${valorTotalDevolucao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                : `Confirmar Devolução · R$ ${valorTotalDevolucao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                            }
                        </button>

                        <div className="h-4" />
                    </div>
                )}

                {/* Wizard Processar CA (boleto) */}
                {wizardDevolucao && (
                    <WizardProcessarCA
                        devolucao={wizardDevolucao}
                        onClose={() => {
                            setWizardDevolucao(null);
                            onSalvo(); // Fechar tudo — devolução já foi criada
                        }}
                        onConcluido={() => {
                            setWizardDevolucao(null);
                            onSalvo();
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default ModalDevolucao;
