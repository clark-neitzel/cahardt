import React, { useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';

// Modal padrão das telas de agentes: em baixo no celular (folha), centralizado no desktop.
// Fica abaixo do menu do SelectBusca (z-[9999]) para o dropdown abrir por cima.
export function ModalBase({ titulo, onFechar, children, rodape, largura = 'md:max-w-md', fecharAoClicarFora = true, esconderX = false }) {
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && fecharAoClicarFora) onFechar?.(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onFechar, fecharAoClicarFora]);
    return (
        <div
            className="fixed inset-0 z-[9000] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4"
            onMouseDown={(e) => { if (fecharAoClicarFora && e.target === e.currentTarget) onFechar?.(); }}
            role="dialog"
            aria-modal="true"
        >
            <div className={`bg-white w-full ${largura} rounded-t-2xl md:rounded-2xl shadow-xl max-h-[92vh] flex flex-col`}>
                <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-bold text-gray-900 min-w-0 truncate">{titulo}</p>
                    {!esconderX && (
                        <button type="button" onClick={onFechar} aria-label="Fechar" className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 shrink-0">
                            <X className="h-5 w-5" />
                        </button>
                    )}
                </div>
                <div className="p-4 space-y-3 overflow-y-auto">{children}</div>
                {rodape && <div className="px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">{rodape}</div>}
            </div>
        </div>
    );
}

export const BtnPrimario = ({ className = '', ...p }) => (
    <button type="button" {...p} className={`min-h-[44px] px-5 py-2.5 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed ${className}`} />
);
export const BtnSecundario = ({ className = '', ...p }) => (
    <button type="button" {...p} className={`min-h-[44px] px-5 py-2.5 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed ${className}`} />
);
export const BtnPerigo = ({ className = '', ...p }) => (
    <button type="button" {...p} className={`min-h-[44px] px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-full font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed ${className}`} />
);
export const BtnPerigoContorno = ({ className = '', ...p }) => (
    <button type="button" {...p} className={`min-h-[44px] px-5 py-2.5 bg-white border border-red-300 text-red-700 hover:bg-red-50 rounded-full font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed ${className}`} />
);

// Confirmação simples em modal (no app não usamos window.confirm: some no iPad standalone).
export function ConfirmModal({ titulo, children, rotuloConfirmar = 'Confirmar', perigo = false, ocupado = false, onConfirmar, onCancelar, aviso }) {
    return (
        <ModalBase
            titulo={titulo}
            onFechar={ocupado ? undefined : onCancelar}
            rodape={(
                <>
                    <BtnSecundario onClick={onCancelar} disabled={ocupado}>Cancelar</BtnSecundario>
                    {perigo
                        ? <BtnPerigo onClick={onConfirmar} disabled={ocupado}>{ocupado ? 'Aguarde…' : rotuloConfirmar}</BtnPerigo>
                        : <BtnPrimario onClick={onConfirmar} disabled={ocupado}>{ocupado ? 'Aguarde…' : rotuloConfirmar}</BtnPrimario>}
                </>
            )}
        >
            {aviso && (
                <div className="flex gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>{aviso}</div>
                </div>
            )}
            <div className="text-sm text-gray-700 space-y-2">{children}</div>
        </ModalBase>
    );
}
