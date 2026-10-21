import React, { useState } from 'react';
import { LogOut, X } from 'lucide-react';
import { useDiario } from '../../contexts/DiarioContext';
import FormVoltaPresencial from './FormVoltaPresencial';

const DiarioCheckout = () => {
    const { diarioStatus, carregarStatus } = useDiario();
    const [isOpen, setIsOpen] = useState(false);
    // Só exibe se o dia estiver iniciado em modo PRESENCIAL
    if (!diarioStatus.diarioHoje || diarioStatus.diarioHoje.modo !== 'PRESENCIAL' || diarioStatus.diarioHoje.kmFinal) {
        return null;
    }

    const diario = diarioStatus.diarioHoje;

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
                <div className="fixed inset-0 bg-gray-600 bg-opacity-75 z-50 overflow-y-auto">
                    <div className="min-h-full flex items-start sm:items-center justify-center p-3">
                        <div className="relative p-4 sm:p-5 border w-full max-w-md shadow-lg rounded-xl bg-white">
                            <div className="flex justify-between items-center mb-4 border-b pb-3">
                                <h3 className="text-lg font-bold text-gray-900 flex items-center">
                                    <LogOut className="h-5 w-5 mr-2 text-red-600" />
                                    Encerrar o dia
                                </h3>
                                <button onClick={() => setIsOpen(false)} aria-label="Fechar"
                                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100">
                                    <X className="h-6 w-6" />
                                </button>
                            </div>
                            <FormVoltaPresencial
                                diario={diario}
                                onEncerrado={async () => { await carregarStatus(); setIsOpen(false); }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default DiarioCheckout;
