import React, { useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Mostrada quando existe sessão salva mas o servidor não respondeu (rede ruim,
 * backend reiniciando). O token NÃO é apagado — é só tentar de novo.
 *
 * Importante no iPhone: no atalho da tela inicial (standalone) não há barra de
 * endereço nem botão de recarregar, então o botão abaixo é a única saída do usuário.
 */
export default function TelaSemConexao() {
    const { tentarNovamente, logout } = useAuth();
    const [tentando, setTentando] = useState(false);

    const handleTentar = async () => {
        setTentando(true);
        try {
            await tentarNovamente();
        } finally {
            setTentando(false);
        }
    };

    return (
        <div className="min-h-screen bg-secondary flex items-center justify-center p-6">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 w-full max-w-sm text-center">
                <div className="bg-mint p-3 rounded-full inline-flex mb-4">
                    <WifiOff className="h-6 w-6 text-primary" />
                </div>

                <h1 className="text-lg font-bold text-gray-900 mb-2">Sem conexão com o servidor</h1>
                <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                    Não conseguimos confirmar seu acesso agora. Verifique a internet e tente novamente —
                    você continua logado.
                </p>

                <button
                    onClick={handleTentar}
                    disabled={tentando}
                    className="w-full min-h-[44px] px-4 py-3 bg-primary hover:bg-primaryDark disabled:opacity-60 text-white rounded-full shadow-sm font-semibold text-sm inline-flex items-center justify-center gap-2"
                >
                    <RefreshCw className={`h-4 w-4 ${tentando ? 'animate-spin' : ''}`} />
                    {tentando ? 'Tentando...' : 'Tentar novamente'}
                </button>

                <button
                    onClick={logout}
                    className="w-full min-h-[44px] mt-3 px-4 py-3 bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-full font-medium text-sm"
                >
                    Sair e entrar com outra conta
                </button>
            </div>
        </div>
    );
}
