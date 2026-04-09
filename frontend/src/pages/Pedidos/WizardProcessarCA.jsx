import React, { useState, useEffect } from 'react';
import { X, Loader2, CheckCircle2, AlertCircle, Upload, FileText, ChevronRight, ExternalLink } from 'lucide-react';
import devolucaoService from '../../services/devolucaoService';
import { API_URL } from '../../services/api';
import toast from 'react-hot-toast';

/**
 * Wizard para processar devolução no Conta Azul (boletos).
 * Props:
 *  - devolucao: { id, escopo, valorTotal, numero }
 *  - onClose: fechar wizard
 *  - onConcluido: callback quando wizard finaliza
 */
const WizardProcessarCA = ({ devolucao, onClose, onConcluido }) => {
    const isTotal = devolucao.escopo === 'TOTAL';

    // Etapas do wizard
    const buildSteps = () => {
        const steps = [
            { key: 'buscar-parcela', label: 'Buscar parcela no CA', tipo: 'auto' },
            { key: 'cancelar-cobranca', label: 'Cancelar cobranca/boleto no CA', tipo: 'manual' },
            { key: 'aplicar-desconto', label: isTotal ? 'Aplicar desconto (R$ 0,01)' : `Aplicar desconto de R$ ${Number(devolucao.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, tipo: 'auto' },
        ];
        if (isTotal) {
            steps.push({ key: 'baixa-caixinha', label: 'Quitar R$ 0,01 na Caixinha', tipo: 'auto' });
        } else {
            steps.push({ key: 'gerar-cobranca', label: 'Gerar nova cobranca no CA', tipo: 'manual' });
            steps.push({ key: 'upload-boleto', label: 'Anexar PDF do novo boleto', tipo: 'manual-upload' });
        }
        steps.push({ key: 'verificar', label: 'Verificar resultado no CA', tipo: 'auto' });
        steps.push({ key: 'finalizar', label: 'Finalizar', tipo: 'confirmar' });
        return steps;
    };

    const steps = buildSteps();
    const [currentIdx, setCurrentIdx] = useState(0);
    const [stepStatus, setStepStatus] = useState({}); // key → 'loading' | 'done' | 'error'
    const [stepData, setStepData] = useState({});     // key → response data
    const [error, setError] = useState(null);
    const [boletoFile, setBoletoFile] = useState(null);

    const currentStep = steps[currentIdx];

    // Auto-execute automatic steps
    useEffect(() => {
        if (currentStep?.tipo === 'auto' && stepStatus[currentStep.key] !== 'done' && stepStatus[currentStep.key] !== 'loading') {
            executeStep(currentStep.key);
        }
    }, [currentIdx]);

    const executeStep = async (key) => {
        setStepStatus(prev => ({ ...prev, [key]: 'loading' }));
        setError(null);
        try {
            const result = await devolucaoService.processarCA(devolucao.id, key);
            setStepStatus(prev => ({ ...prev, [key]: 'done' }));
            setStepData(prev => ({ ...prev, [key]: result }));
        } catch (err) {
            setStepStatus(prev => ({ ...prev, [key]: 'error' }));
            setError(err.response?.data?.error || err.response?.data?.detalhe || err.message);
        }
    };

    const handleManualConfirm = () => {
        setStepStatus(prev => ({ ...prev, [currentStep.key]: 'done' }));
        setCurrentIdx(prev => prev + 1);
    };

    const handleUploadBoleto = async () => {
        if (!boletoFile) {
            toast.error('Selecione o PDF do boleto.');
            return;
        }
        setStepStatus(prev => ({ ...prev, [currentStep.key]: 'loading' }));
        setError(null);
        try {
            const result = await devolucaoService.uploadBoleto(devolucao.id, boletoFile);
            setStepStatus(prev => ({ ...prev, [currentStep.key]: 'done' }));
            setStepData(prev => ({ ...prev, [currentStep.key]: result }));
            setCurrentIdx(prev => prev + 1);
        } catch (err) {
            setStepStatus(prev => ({ ...prev, [currentStep.key]: 'error' }));
            setError(err.response?.data?.error || err.message);
        }
    };

    const handleFinalizar = async () => {
        setStepStatus(prev => ({ ...prev, 'finalizar': 'loading' }));
        setError(null);
        try {
            await devolucaoService.processarCA(devolucao.id, 'finalizar');
            setStepStatus(prev => ({ ...prev, 'finalizar': 'done' }));
            toast.success('Devolucao processada no Conta Azul com sucesso!');
            onConcluido();
        } catch (err) {
            setStepStatus(prev => ({ ...prev, 'finalizar': 'error' }));
            setError(err.response?.data?.error || err.message);
        }
    };

    const handleNext = () => {
        if (stepStatus[currentStep.key] === 'done') {
            setCurrentIdx(prev => prev + 1);
        }
    };

    const handleRetry = () => {
        setError(null);
        if (currentStep.tipo === 'auto') {
            executeStep(currentStep.key);
        }
    };

    const parcelaData = stepData['buscar-parcela']?.parcela;
    const descontoData = stepData['aplicar-desconto']?.resultado;
    const verificacaoData = stepData['verificar']?.parcela;

    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center" onClick={onClose}>
            <div
                className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto shadow-xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between z-10 rounded-t-2xl">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Processar no Conta Azul</h2>
                        <p className="text-xs text-gray-500">
                            DEV#{devolucao.numero} · {isTotal ? 'Devolucao Total' : 'Devolucao Parcial'} · R$ {Number(devolucao.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="px-5 py-4 space-y-3">
                    {/* Stepper */}
                    {steps.map((step, idx) => {
                        const status = stepStatus[step.key];
                        const isCurrent = idx === currentIdx;
                        const isPast = idx < currentIdx || status === 'done';
                        const isFuture = idx > currentIdx && status !== 'done';

                        return (
                            <div key={step.key} className={`rounded-lg border p-3 transition-all ${
                                isCurrent ? 'border-blue-400 bg-blue-50 shadow-sm' :
                                isPast ? 'border-green-200 bg-green-50' :
                                'border-gray-200 bg-gray-50 opacity-60'
                            }`}>
                                <div className="flex items-center gap-2">
                                    {/* Icon */}
                                    {status === 'loading' && <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />}
                                    {status === 'done' && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
                                    {status === 'error' && <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />}
                                    {!status && <div className={`h-4 w-4 rounded-full border-2 shrink-0 ${isCurrent ? 'border-blue-400' : 'border-gray-300'}`} />}

                                    <span className={`text-sm font-medium ${
                                        isPast ? 'text-green-700' : isCurrent ? 'text-blue-800' : 'text-gray-500'
                                    }`}>
                                        {idx + 1}. {step.label}
                                    </span>
                                </div>

                                {/* Step content (only current) */}
                                {isCurrent && (
                                    <div className="mt-3 ml-6 space-y-2">
                                        {/* Auto step: buscar-parcela result */}
                                        {step.key === 'buscar-parcela' && status === 'done' && parcelaData && (
                                            <div className="text-xs space-y-1 bg-white p-2 rounded border">
                                                <div><span className="text-gray-500">Status:</span> <span className="font-medium">{parcelaData.status}</span></div>
                                                <div><span className="text-gray-500">Valor Bruto:</span> <span className="font-medium">R$ {Number(parcelaData.valorBruto).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                                                <div><span className="text-gray-500">Metodo:</span> <span className="font-medium">{parcelaData.metodoPagamento}</span></div>
                                                <div><span className="text-gray-500">Vencimento:</span> <span className="font-medium">{parcelaData.vencimento}</span></div>
                                                {parcelaData.solicitacoesCobrancas?.length > 0 && (
                                                    <div className="text-amber-700 font-medium">
                                                        {parcelaData.solicitacoesCobrancas.length} cobranca(s) encontrada(s)
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Manual step: cancelar cobranca */}
                                        {step.key === 'cancelar-cobranca' && status !== 'done' && (
                                            <div className="space-y-2">
                                                <div className="p-2.5 bg-amber-50 rounded border border-amber-200 text-xs text-amber-800">
                                                    <p className="font-bold mb-1">Acao necessaria no painel do Conta Azul:</p>
                                                    <ol className="list-decimal ml-4 space-y-0.5">
                                                        <li>Acesse o lancamento financeiro deste cliente</li>
                                                        <li>Cancele a cobranca/boleto existente</li>
                                                        <li>Aguarde a confirmacao do cancelamento</li>
                                                    </ol>
                                                </div>
                                                <button
                                                    onClick={handleManualConfirm}
                                                    className="w-full py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 transition flex items-center justify-center gap-1.5"
                                                >
                                                    <CheckCircle2 className="h-4 w-4" /> Ja cancelei a cobranca
                                                </button>
                                            </div>
                                        )}

                                        {/* Auto step: aplicar-desconto result */}
                                        {step.key === 'aplicar-desconto' && status === 'done' && descontoData && (
                                            <div className="text-xs space-y-1 bg-white p-2 rounded border">
                                                <div><span className="text-gray-500">Desconto aplicado:</span> <span className="font-bold text-green-700">R$ {Number(descontoData.desconto).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                                                <div><span className="text-gray-500">Novo valor liquido:</span> <span className="font-bold">R$ {Number(descontoData.novoLiquido).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                                                <div><span className="text-gray-500">Metodo:</span> <span className="font-medium">{descontoData.metodoPagamento}</span></div>
                                            </div>
                                        )}

                                        {/* Auto step: baixa-caixinha done */}
                                        {step.key === 'baixa-caixinha' && status === 'done' && (
                                            <div className="text-xs text-green-700 bg-white p-2 rounded border">
                                                Baixa de R$ 0,01 realizada na Caixinha com sucesso.
                                            </div>
                                        )}

                                        {/* Manual step: gerar cobranca */}
                                        {step.key === 'gerar-cobranca' && status !== 'done' && (
                                            <div className="space-y-2">
                                                <div className="p-2.5 bg-amber-50 rounded border border-amber-200 text-xs text-amber-800">
                                                    <p className="font-bold mb-1">Acao necessaria no painel do Conta Azul:</p>
                                                    <ol className="list-decimal ml-4 space-y-0.5">
                                                        <li>Acesse o lancamento financeiro deste cliente</li>
                                                        <li>Gere uma nova cobranca/boleto com o valor atualizado</li>
                                                        <li>Valor do novo boleto: <span className="font-bold">R$ {descontoData ? Number(descontoData.novoLiquido).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '...'}</span></li>
                                                    </ol>
                                                </div>
                                                <button
                                                    onClick={handleManualConfirm}
                                                    className="w-full py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 transition flex items-center justify-center gap-1.5"
                                                >
                                                    <CheckCircle2 className="h-4 w-4" /> Ja gerei a nova cobranca
                                                </button>
                                            </div>
                                        )}

                                        {/* Manual-upload step: upload boleto */}
                                        {step.key === 'upload-boleto' && status !== 'done' && (
                                            <div className="space-y-2">
                                                <p className="text-xs text-gray-600">Baixe o PDF do novo boleto no CA e anexe aqui.</p>
                                                <label className="flex items-center gap-2 cursor-pointer border-2 border-dashed border-blue-300 rounded-lg p-3 hover:bg-blue-50 transition">
                                                    {boletoFile ? (
                                                        <>
                                                            <FileText className="h-5 w-5 text-blue-600" />
                                                            <span className="text-sm text-blue-700 font-medium truncate">{boletoFile.name}</span>
                                                            <button onClick={(ev) => { ev.preventDefault(); setBoletoFile(null); }} className="ml-auto text-red-500 hover:text-red-700">
                                                                <X className="h-4 w-4" />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Upload className="h-5 w-5 text-blue-400" />
                                                            <span className="text-sm text-blue-500">Selecionar PDF do boleto</span>
                                                        </>
                                                    )}
                                                    <input
                                                        type="file"
                                                        accept=".pdf,image/*"
                                                        onChange={e => setBoletoFile(e.target.files[0] || null)}
                                                        className="hidden"
                                                    />
                                                </label>
                                                <button
                                                    onClick={handleUploadBoleto}
                                                    disabled={!boletoFile || status === 'loading'}
                                                    className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-1.5"
                                                >
                                                    {status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                                    Enviar PDF do Boleto
                                                </button>
                                            </div>
                                        )}

                                        {/* Verificacao result */}
                                        {step.key === 'verificar' && status === 'done' && verificacaoData && (
                                            <div className="text-xs space-y-1 bg-white p-2 rounded border">
                                                <div><span className="text-gray-500">Status CA:</span> <span className={`font-bold ${verificacaoData.status === 'QUITADO' || verificacaoData.status === 'RECEBIDO' ? 'text-green-700' : 'text-amber-700'}`}>{verificacaoData.status}</span></div>
                                                <div><span className="text-gray-500">Valor Bruto:</span> <span className="font-medium">R$ {Number(verificacaoData.valorBruto).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                                                <div><span className="text-gray-500">Desconto:</span> <span className="font-medium">R$ {Number(verificacaoData.desconto).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                                                <div><span className="text-gray-500">Valor Liquido:</span> <span className="font-bold">R$ {Number(verificacaoData.valorLiquido).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                                                <div><span className="text-gray-500">Metodo:</span> <span className="font-medium">{verificacaoData.metodoPagamento}</span></div>
                                            </div>
                                        )}

                                        {/* Finalizar button */}
                                        {step.key === 'finalizar' && status !== 'done' && (
                                            <button
                                                onClick={handleFinalizar}
                                                disabled={status === 'loading'}
                                                className="w-full py-3 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-50 transition flex items-center justify-center gap-1.5"
                                            >
                                                {status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                                Confirmar e Finalizar
                                            </button>
                                        )}

                                        {/* Error */}
                                        {status === 'error' && error && (
                                            <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 space-y-1">
                                                <p className="font-bold">Erro: {error}</p>
                                                {step.tipo === 'auto' && (
                                                    <button onClick={handleRetry} className="text-red-600 underline font-medium">Tentar novamente</button>
                                                )}
                                            </div>
                                        )}

                                        {/* Next button for auto steps that completed */}
                                        {step.tipo === 'auto' && status === 'done' && step.key !== 'finalizar' && (
                                            <button
                                                onClick={handleNext}
                                                className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition flex items-center justify-center gap-1.5"
                                            >
                                                Proximo <ChevronRight className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default WizardProcessarCA;
