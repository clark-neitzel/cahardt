import React, { useState, useEffect } from 'react';
import { LogOut, MapPin, Home, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDiario } from '../../contexts/DiarioContext';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import FormVeiculoPresencial from './FormVeiculoPresencial';

const DiarioGateway = () => {
    const { logout, user, signed } = useAuth();
    const { diarioStatus, carregarStatus } = useDiario();

    // Passos do modal
    // 1: PendenciaOntem -> 2: Escolher Modo -> 3: Form Presencial
    const [step, setStep] = useState(1);

    // Dados de Encerramento Pendente
    const [pendenciaKm, setPendenciaKm] = useState('');
    const [pendenciaObs, setPendenciaObs] = useState('');

    // Dados Novo Checkin Presencial
    const [modo, setModo] = useState(null); // 'HOME_OFFICE' ou 'PRESENCIAL'
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!diarioStatus.pendenciaAnterior) {
            setStep(2); // Vai direto para escolher o modo se não dever nada de ontem
        } else {
            setStep(1); // Cobra o fechamento de ontem
        }
    }, [diarioStatus.pendenciaAnterior]);

    const resolverPendencia = async (e) => {
        e.preventDefault();
        try {
            setIsSubmitting(true);
            await api.post('/diarios/encerrar', {
                diarioId: diarioStatus.diarioPendente.id,
                kmFinal: parseInt(pendenciaKm),
                obsFinal: pendenciaObs
            });
            toast.success('Ponto do dia anterior encerrado com sucesso!');
            await carregarStatus();
            setStep(2); // Libera pro inicio de hoje
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao salvar quilometragem final.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const confirmarHomeOffice = async () => {
        try {
            setIsSubmitting(true);
            await api.post('/diarios/iniciar', { modo: 'HOME_OFFICE' });
            toast.success('Expediente de Home Office iniciado!');
            setTimeout(() => window.location.reload(), 800);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao iniciar o dia.');
            setIsSubmitting(false);
        }
    };

    const confirmarPresencial = async (dados) => {
        try {
            await api.post('/diarios/iniciar', { modo: 'PRESENCIAL', ...dados });
            toast.success('Boa viagem! Registrado com sucesso.');
            setTimeout(() => window.location.reload(), 800);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao iniciar o dia.');
        }
    };

    if (!signed) return null; // Prevenção se a sessão estiver limpando
    if (user?.permissoes?.admin || user?.permissoes?.Isento_Ponto) return null; // Admin ou Isento de Ponto pula o check-in diário

    if (diarioStatus.loading) {
        return <div className="fixed inset-0 bg-white z-[100] flex justify-center items-center font-semibold text-gray-500">Aguarde, verificando seu Ponto Diário...</div>;
    }

    if (diarioStatus.hojeStatus === 'iniciado' && !diarioStatus.pendenciaAnterior) {
        return null; // Gateway liberado! Nao exibe a cortina.
    }

    // Modal de Bloqueio Intransponível
    return (
        <div className="fixed inset-0 bg-gray-100 z-[100] overflow-y-auto w-full h-full flex flex-col justify-center items-center py-4 sm:py-0">

            <div className="bg-white mx-4 p-6 sm:p-8 w-full max-w-xl rounded-2xl shadow-xl border border-gray-200 relative">

                {/* Header do Gatekeeper */}
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-100">
                    <span className="text-gray-500 font-medium text-sm">Olá, {user.nome?.split(' ')[0]}</span>
                    <button onClick={logout} className="text-red-500 hover:text-red-700 flex font-bold bg-red-50 hover:bg-red-100 transition-colors p-2 rounded items-center text-sm">
                        <LogOut className="w-4 h-4 mr-1.5" /> Sair
                    </button>
                </div>

                {/* 1. FATURA PENDENTE DE ONTEM */}
                {step === 1 && (
                    <div className="space-y-6">
                        <div className="flex flex-col items-center justify-center text-red-600">
                            <AlertTriangle className="w-16 h-16 mb-4" />
                            <h2 className="text-2xl font-bold text-center">Fechamento do Dia de Ontem Pendente!</h2>
                        </div>
                        <p className="text-gray-600 text-center">
                            Você trabalhou pelo modo <strong>PRESECIAL</strong> em {new Date(diarioStatus.diarioPendente?.dataReferencia).toLocaleDateString()} com o veículo <strong>{diarioStatus.diarioPendente?.veiculo?.placa}</strong>.
                            <br />Para liberar o aplicativo <b>hoje</b>, você precisa bater seu ponto final informando a quilometragem na qual entregou o veículo!
                        </p>

                        <div className="bg-orange-50 p-4 rounded-lg flex items-center justify-between text-orange-900 border border-orange-200">
                            <span>KM INICIAL (Sua saída na rua):</span>
                            <span className="font-mono text-xl">{diarioStatus.diarioPendente?.kmInicial}</span>
                        </div>

                        <form onSubmit={resolverPendencia} className="space-y-4 pt-4 border-t border-gray-100">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 uppercase tracking-wider">KM FINAL DO VEÍCULO (Sua Chegada) *</label>
                                <input
                                    type="number"
                                    required
                                    className="mt-1 flex-1 block w-full bg-gray-50 focus:bg-white rounded-md border-gray-300 text-center text-3xl h-16 font-mono font-bold focus:border-red-500 focus:ring-red-500"
                                    value={pendenciaKm}
                                    onChange={(e) => setPendenciaKm(e.target.value)}
                                    placeholder="00000"
                                />
                            </div>
                            <button type="submit" disabled={isSubmitting} className="w-full h-14 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-lg flex items-center justify-center shadow-lg transition-transform active:scale-95">
                                ENVIAR KM E LIBERAR SISTEMA
                            </button>
                        </form>
                    </div>
                )}

                {/* 2. INICIO DE HOJE - COMO TRABALHA */}
                {step === 2 && modo === null && (
                    <div className="space-y-6">
                        <div className="text-center">
                            <h2 className="text-2xl font-bold text-gray-900">Bom dia! 🌤️</h2>
                            <p className="text-gray-500 mt-2">Antes de acessar o Catálogo e Vendas, inicie o seu dia abaixo.</p>
                        </div>

                        <div className="pt-6">
                            <h3 className="text-lg font-medium text-center text-gray-800 mb-4">Como você trabalhará hoje?</h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <button
                                    onClick={() => setModo('HOME_OFFICE')}
                                    className="h-32 border-2 border-dashed border-gray-300 hover:border-blue-500 hover:bg-blue-50 rounded-xl flex flex-col items-center justify-center text-gray-600 transition-colors"
                                >
                                    <Home className="w-10 h-10 text-blue-500 mb-2" />
                                    <span className="font-bold text-lg">HOME OFFICE</span>
                                    <span className="text-xs mt-1">Trabalho da Base/Casa</span>
                                </button>

                                <button
                                    onClick={() => setModo('PRESENCIAL')}
                                    className="h-32 border-2 border-dashed border-gray-300 hover:border-green-500 hover:bg-green-50 rounded-xl flex flex-col items-center justify-center text-gray-600 transition-colors"
                                >
                                    <MapPin className="w-10 h-10 text-green-500 mb-2" />
                                    <span className="font-bold text-lg">PRESENCIAL (ROTA)</span>
                                    <span className="text-xs mt-1">Carro/Visitação</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 3A. HOME OFFICE FORM */}
                {step === 2 && modo === 'HOME_OFFICE' && (
                    <div className="space-y-6 text-center animate-pulse">
                        <Home className="w-20 h-20 text-blue-500 mx-auto" />
                        <h2 className="text-2xl font-bold text-gray-900">Home Office Selecionado</h2>
                        <p className="text-gray-600">Sem veículo por enquanto. Se mais tarde você sair com o carro, use o botão <strong>Pegar veículo</strong> no menu para registrar placa, KM e checklist.</p>
                        <div className="flex flex-col sm:flex-row gap-3 pt-6">
                            <button onClick={() => setModo(null)} className="w-full sm:flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 rounded-xl transition-colors">
                                VOLTAR
                            </button>
                            <button
                                onClick={confirmarHomeOffice}
                                disabled={isSubmitting}
                                className="w-full sm:flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg transition-transform active:scale-95 flex justify-center items-center"
                            >
                                {isSubmitting ? 'Aguarde...' : 'CONFIRMAR INÍCIO'}
                            </button>
                        </div>
                    </div>
                )}

                {/* 3B. PRESENCIAL FORM + CHECKLIST */}
                {step === 2 && modo === 'PRESENCIAL' && (
                    <FormVeiculoPresencial onConfirmar={confirmarPresencial} onVoltar={() => setModo(null)} />
                )}
            </div>

            <p className="mt-8 text-gray-400 text-sm font-medium">Controle de Frota Integrado — Conta Azul App</p>
        </div>
    );
};

export default DiarioGateway;
