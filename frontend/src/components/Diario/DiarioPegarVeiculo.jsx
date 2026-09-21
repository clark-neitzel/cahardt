import React, { useState } from 'react';
import { Car, X } from 'lucide-react';
import { useDiario } from '../../contexts/DiarioContext';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import FormVeiculoPresencial from './FormVeiculoPresencial';

/**
 * Botão "Pegar veículo": aparece para quem iniciou o dia em HOME OFFICE.
 * O motorista abre o app em casa e, ao chegar na empresa, assume o carro daqui
 * mesmo (placa, KM, checklist) — o registro do dia vira PRESENCIAL e o botão
 * "Finalizar" (KM final) passa a aparecer no lugar deste.
 */
const DiarioPegarVeiculo = () => {
    const { diarioStatus, carregarStatus } = useDiario();
    const [isOpen, setIsOpen] = useState(false);

    const hoje = diarioStatus.diarioHoje;
    if (!hoje || hoje.modo !== 'HOME_OFFICE') return null;

    const confirmar = async (dados) => {
        try {
            await api.post('/diarios/assumir-veiculo', dados);
            toast.success('Boa viagem! Veículo registrado com sucesso.');
            setIsOpen(false);
            await carregarStatus();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao registrar o veículo.');
        }
    };

    return (
        <>
            {/* Botão Sidebar Desktop — ícone sempre visível, texto aparece no hover da sidebar */}
            <button
                onClick={() => setIsOpen(true)}
                className="hidden md:flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-[13px] text-primaryDark bg-mint hover:bg-mint/80 transition-colors w-[calc(100%-16px)]"
                title="Pegar veículo — você está em Home Office; registre a placa e o KM ao sair com o carro"
            >
                <Car className="h-5 w-5 shrink-0" />
                <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap overflow-hidden font-semibold">
                    Pegar veículo
                </span>
            </button>

            {/* Botão Mobile — aparece no topbar */}
            <button
                onClick={() => setIsOpen(true)}
                className="md:hidden inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-primaryDark bg-mint hover:bg-mint/80"
                title="Pegar veículo (placa, KM e checklist)"
            >
                <Car className="h-4 w-4 mr-1.5" />
                Pegar veículo
            </button>

            {isOpen && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full z-50 flex items-start sm:items-center justify-center py-4">
                    <div className="relative p-5 sm:p-6 border w-full max-w-xl shadow-lg rounded-2xl bg-white mx-4">
                        <button
                            onClick={() => setIsOpen(false)}
                            className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                            title="Fechar"
                        >
                            <X className="h-5 w-5" />
                        </button>
                        <p className="text-xs text-gray-500 mb-3">
                            Você iniciou hoje em <strong>Home Office</strong>. Ao sair com o carro, registre aqui a placa, o KM e o checklist — depois o botão <strong>Finalizar</strong> pede o KM de chegada.
                        </p>
                        <FormVeiculoPresencial titulo="Pegar veículo" onConfirmar={confirmar} />
                    </div>
                </div>
            )}
        </>
    );
};

export default DiarioPegarVeiculo;
