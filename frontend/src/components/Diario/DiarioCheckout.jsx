import React, { useState } from 'react';
import { LogOut, X, AlertTriangle } from 'lucide-react';
import { useDiario } from '../../contexts/DiarioContext';
import { toast } from 'react-hot-toast';
import api from '../../services/api';

const DiarioCheckout = () => {
    const { diarioStatus, carregarStatus } = useDiario();
    const [isOpen, setIsOpen] = useState(false);
    const [kmFinal, setKmFinal] = useState('');
    const [obsFinal, setObsFinal] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [confirmacaoKm, setConfirmacaoKm] = useState(false); // Modal de alerta de KM excessivo

    // Só exibe se o dia estiver iniciado em modo PRESENCIAL
    if (!diarioStatus.diarioHoje || diarioStatus.diarioHoje.modo !== 'PRESENCIAL' || diarioStatus.diarioHoje.kmFinal) {
        return null;
    }

    const diario = diarioStatus.diarioHoje;
    const kmRodados = kmFinal && diario.kmInicial ? parseInt(kmFinal) - diario.kmInicial : 0;

    // Média de KM por dia do veículo (vem do veiculo aninhado se disponível)
    const mediaKmDia = diario.veiculo?.kmMedioSugerido || null;
    const kmExcessivo = mediaKmDia && kmRodados > 0 && kmRodados > (mediaKmDia * 1.5);

    const executarEnvio = async () => {
        try {
            setIsSubmitting(true);
            await api.post('/diarios/encerrar', {
                diarioId: diario.id,
                kmFinal: parseInt(kmFinal),
                obsFinal
            });
            toast.success('Expediente presencial encerrado com sucesso!');
            await carregarStatus();
            setIsOpen(false);
            setConfirmacaoKm(false);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao finalizar o dia');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!kmFinal) return;
        // Se KM for excessivo, abre modal de confirmação primeiro
        if (kmExcessivo) {
            setConfirmacaoKm(true);
            return;
        }
        await executarEnvio();
    };

    return (
        <>
            {/* Botão Sidebar Desktop — ícone sempre visível, texto aparece no hover da sidebar */}
            <button
                onClick={() => setIsOpen(true)}
                className="hidden md:flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-[13px] text-red-600 bg-red-50 hover:bg-red-100 transition-colors w-[calc(100%-16px)]"
                title={`Finalizar Expediente — ${diario.veiculo?.placa || ''}`}
            >
                <LogOut className="h-5 w-5 shrink-0" />
                <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap overflow-hidden font-semibold">
                    Finalizar Expediente
                </span>
            </button>

            {/* Botão Mobile — aparece no topbar */}
            <button
                onClick={() => setIsOpen(true)}
                className="md:hidden inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-red-700 bg-red-100 hover:bg-red-200"
                title="Finalizar o Dia e Informar KM Final"
            >
                <LogOut className="h-4 w-4 mr-1.5" />
                Finalizar
            </button>

            {isOpen && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
                    <div className="relative p-5 border w-full max-w-md shadow-lg rounded-xl bg-white mx-4">
                        <div className="flex justify-between items-center mb-4 border-b pb-3">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center">
                                <LogOut className="h-5 w-5 mr-2 text-red-600" />
                                Encerrar Dia Presencial
                            </h3>
                            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-500">
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        <div className="bg-blue-50 p-3 rounded-lg flex items-center justify-between text-blue-900 border border-blue-200 mb-4">
                            <span className="text-sm font-medium">Você saiu com:</span>
                            <span className="font-mono text-lg font-bold">{diario.kmInicial} <span className="text-xs">KM</span></span>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide">
                                    Odômetro / KM Final *
                                </label>
                                <input
                                    type="number"
                                    required
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 text-center text-3xl font-mono h-14 font-bold bg-gray-50 uppercase"
                                    value={kmFinal}
                                    onChange={(e) => setKmFinal(e.target.value)}
                                    placeholder="00000"
                                    min={diario.kmInicial}
                                />
                                <div className="flex justify-between mt-1">
                                    <p className="text-xs text-gray-500">Deve ser igual ou maior que a saída.</p>
                                    {kmRodados > 0 && (
                                        <p className={`text-xs font-bold ${kmExcessivo ? 'text-amber-600' : 'text-gray-500'}`}>
                                            {kmExcessivo && '⚠️ '}+{kmRodados.toLocaleString('pt-BR')} km rodados
                                            {mediaKmDia && ` (média: ${mediaKmDia} km/dia)`}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Ocorrências do dia (opcional)</label>
                                <textarea
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm bg-gray-50"
                                    rows="2"
                                    value={obsFinal}
                                    onChange={(e) => setObsFinal(e.target.value)}
                                    placeholder="Teve algum problema com o carro, trânsito ou multas?"
                                ></textarea>
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full h-12 flex justify-center items-center rounded-lg shadow-sm px-4 py-2 bg-red-600 text-base font-bold text-white hover:bg-red-700 disabled:opacity-50 transition-colors mt-2"
                            >
                                CONFIRMAR E ENTREGAR VEÍCULO
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Confirmação de KM Excessivo */}
            {confirmacaoKm && (
                <div className="fixed inset-0 bg-gray-900 bg-opacity-80 z-[60] flex items-center justify-center">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 space-y-4">
                        <div className="flex flex-col items-center text-amber-600">
                            <AlertTriangle className="w-16 h-16 mb-3" />
                            <h3 className="text-xl font-bold text-gray-900 text-center">KM Acima da Média!</h3>
                        </div>
                        <p className="text-gray-600 text-sm text-center">
                            Foram registrados <strong className="text-gray-900">{kmRodados.toLocaleString('pt-BR')} km</strong> percorridos hoje.<br />
                            A média deste veículo é de <strong>{mediaKmDia} km/dia</strong>.
                        </p>
                        <p className="text-sm text-center text-gray-700 font-medium">
                            Confirma que o odômetro <strong>{parseInt(kmFinal).toLocaleString('pt-BR')} km</strong> está correto?
                        </p>
                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <button
                                onClick={() => setConfirmacaoKm(false)}
                                className="w-full py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-bold hover:bg-gray-50"
                            >
                                ✏️ Corrigir KM
                            </button>
                            <button
                                onClick={executarEnvio}
                                disabled={isSubmitting}
                                className="w-full py-3 bg-red-600 rounded-xl text-white font-bold hover:bg-red-700 disabled:opacity-50"
                            >
                                {isSubmitting ? 'Aguarde...' : '✅ Sim, confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default DiarioCheckout;
