import React from 'react';

export const ATALHOS_HORARIO = ['08:00', '10:00', '14:00', '16:00'];

// "HH:MM" válido ou '' — garante que nunca sobe lixo para o servidor
export const horaValida = (h) => typeof h === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(h);

// Horário de entrega opcional: atalhos (pílulas) + hora livre + limpar.
// value: 'HH:MM' ou ''.  onChange(novo 'HH:MM' | '')
export default function CampoHorarioEntrega({ value, onChange, className = '' }) {
    const v = value || '';
    return (
        <div className={className}>
            <div className="flex flex-wrap gap-2">
                {ATALHOS_HORARIO.map(h => {
                    const ativo = v === h;
                    return (
                        <button
                            key={h}
                            type="button"
                            onClick={() => onChange(ativo ? '' : h)}
                            aria-pressed={ativo}
                            className={`min-h-[44px] px-4 rounded-full text-sm font-semibold border ${ativo
                                ? 'bg-primary border-primary text-white'
                                : 'bg-white border-primary text-primary hover:bg-mint/40'}`}
                        >
                            {h}
                        </button>
                    );
                })}
            </div>
            <div className="flex items-center gap-2 mt-2">
                <input
                    type="time"
                    value={v}
                    onChange={e => onChange(e.target.value || '')}
                    aria-label="Horário livre"
                    className="flex-1 min-w-0 min-h-[44px] border border-gray-300 rounded-md px-3 py-2 bg-white text-sm text-gray-900 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                />
                {v && (
                    <button
                        type="button"
                        onClick={() => onChange('')}
                        className="min-h-[44px] px-4 rounded-full text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-100"
                    >
                        limpar
                    </button>
                )}
            </div>
        </div>
    );
}
