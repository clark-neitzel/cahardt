import React from 'react';

// Seletor de dias da semana — cópia fiel do DayPicker que vive dentro de
// pages/Clientes/DetalheCliente.jsx (mesma lista, mesma ordem, mesmo join(', ')).
// O formato gravado em Dia_de_entrega / Dia_de_venda é "SEG, QUI" (vírgula +
// espaço, na ordem de DIAS_SEMANA) — a tela de Clientes filtra com `contains`,
// então um formato diferente quebraria aquele filtro em silêncio. NÃO mudar.
// (DetalheCliente ainda tem a cópia própria; migrar para este quando aquele
// arquivo for mexido — boy-scout registrado em docs/mapa-clientes/PLANO.md.)
export const DIAS_SEMANA = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM', 'N/D'];

// "SEG, QUI" → ['SEG','QUI'] (tolerante a null, espaços e vírgula sem espaço)
export const parseDias = (str) => String(str || '').split(',').map(s => s.trim()).filter(Boolean);

// ['QUI','SEG'] → "SEG, QUI" (ordena pela semana e descarta valor fora da lista)
export const juntarDias = (dias) => DIAS_SEMANA.filter(d => (dias || []).includes(d)).join(', ');

const DayPicker = ({ label, selected, onChange, compacto = false }) => {
    const selectedDays = parseDias(selected);

    const toggleDay = (day) => {
        let newDays;
        if (selectedDays.includes(day)) {
            newDays = selectedDays.filter(d => d !== day);
        } else {
            newDays = [...selectedDays, day];
            newDays.sort((a, b) => DIAS_SEMANA.indexOf(a) - DIAS_SEMANA.indexOf(b));
        }
        onChange(newDays.join(', '));
    };

    return (
        <div>
            {label && <label className={`block text-sm font-medium text-gray-700 ${compacto ? 'mb-1' : 'mb-2'}`}>{label}</label>}
            <div className={`flex flex-wrap ${compacto ? 'gap-1.5' : 'gap-2'}`}>
                {DIAS_SEMANA.map(day => (
                    <button
                        key={day}
                        type="button"
                        aria-pressed={selectedDays.includes(day)}
                        onClick={() => toggleDay(day)}
                        className={`${compacto ? 'px-2.5 py-2 text-[11px] min-h-[36px]' : 'px-3 py-2 text-xs'} font-bold rounded border transition-colors ${selectedDays.includes(day)
                            ? 'bg-primary text-white border-primary'
                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                            }`}
                    >
                        {day}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default DayPicker;
