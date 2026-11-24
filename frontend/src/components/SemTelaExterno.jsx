import React from 'react';
import { Lock, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// Usuário externo (contador) sem a Contabilidade liberada: não há tela para mostrar.
export default function SemTelaExterno() {
    const { logout } = useAuth();
    return (
        <div className="min-h-[60vh] flex items-center justify-center p-3 md:p-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm w-full max-w-md p-6 text-center">
                <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-mint flex items-center justify-center">
                    <Lock className="h-6 w-6 text-primary" />
                </div>
                <h1 className="text-lg font-bold text-gray-900">Nenhuma tela liberada</h1>
                <p className="mt-2 text-sm text-gray-600">
                    Sua conta ainda não tem nenhuma tela liberada. Fale com o administrador.
                </p>
                <button
                    onClick={logout}
                    className="mt-5 inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm"
                >
                    <LogOut className="h-4 w-4" />
                    Sair
                </button>
            </div>
        </div>
    );
}
