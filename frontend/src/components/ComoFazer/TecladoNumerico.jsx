import { Delete } from 'lucide-react';

// UM teclado numérico para tudo: PIN (4 dígitos), PIN do encarregado e temperatura do checklist.
// Controlado: recebe `valor` (texto) e devolve o novo texto em `onChange`.
function Tecla({ children, onClick, rotulo, base }) {
    return <button type="button" onClick={onClick} aria-label={rotulo} className={base}>{children}</button>;
}

export default function TecladoNumerico({ valor = '', onChange, maxLen = 6, negativo = false, virgula = false, escuro = false, className = '' }) {
    const toca = (d) => { if (String(valor).length < maxLen) onChange(String(valor) + d); };
    const apaga = () => onChange(String(valor).slice(0, -1));
    const sinal = () => onChange(String(valor).startsWith('-') ? String(valor).slice(1) : `-${valor}`);
    const virg = () => { if (!String(valor).includes(',')) onChange(`${valor || '0'},`); };

    const base = `min-h-[64px] rounded-2xl text-2xl font-extrabold flex items-center justify-center select-none touch-manipulation active:scale-95 transition-transform ${escuro ? 'bg-white text-gray-900' : 'bg-white border border-gray-300 text-gray-900 shadow-sm'}`;

    return (
        <div className={`grid grid-cols-3 gap-2 w-full max-w-[300px] mx-auto ${className}`}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <Tecla base={base} key={d} onClick={() => toca(d)}>{d}</Tecla>
            ))}
            {negativo ? <Tecla base={base} onClick={sinal} rotulo="Trocar sinal">−</Tecla>
                : virgula ? <Tecla base={base} onClick={virg} rotulo="Vírgula">,</Tecla>
                    : <span />}
            <Tecla base={base} onClick={() => toca('0')}>0</Tecla>
            <Tecla base={base} onClick={apaga} rotulo="Apagar"><Delete className="h-7 w-7" /></Tecla>
            {negativo && virgula && (
                <button type="button" onClick={virg} aria-label="Vírgula" className={`${base} col-span-3`}>,</button>
            )}
        </div>
    );
}
