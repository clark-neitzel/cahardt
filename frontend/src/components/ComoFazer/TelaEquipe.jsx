import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, LogOut } from 'lucide-react';
import { useBaseComoFazer } from './BaseComoFazer';
import { limparSessaoTablet } from '../../services/comoFazerService';
import { pararFala } from './falar';

// Moldura das telas da equipe: título, "Voltar" e (no tablet) "Sair" sempre visível.
export default function TelaEquipe({ titulo, subtitulo, emoji, voltarPara, mostrarVoltar = true, acoes, children }) {
    const navigate = useNavigate();
    const { base, tablet } = useBaseComoFazer();
    // ao sair da tela a voz para (não fica lendo na tela seguinte)
    useEffect(() => () => pararFala(), []);
    return (
        <div className="max-w-4xl mx-auto p-3 md:p-6 pb-24 max-w-full overflow-x-hidden">
            <div className="flex items-start gap-2 mb-4">
                {mostrarVoltar && (
                    <button type="button" onClick={() => (voltarPara ? navigate(voltarPara) : navigate(base))}
                        className="min-h-[56px] min-w-[56px] flex items-center justify-center rounded-full bg-white border border-gray-300 text-gray-700 shrink-0" aria-label="Voltar">
                        <ChevronLeft className="h-6 w-6" />
                    </button>
                )}
                <div className="flex-1 min-w-0 pt-1">
                    <h1 className="text-lg md:text-2xl font-bold text-gray-900 leading-tight break-words">{emoji ? `${emoji} ` : ''}{titulo}</h1>
                    {subtitulo ? <p className="text-xs md:text-sm text-gray-600 mt-0.5 break-words">{subtitulo}</p> : null}
                </div>
                {acoes}
                {tablet && (
                    <button type="button" onClick={() => limparSessaoTablet()}
                        className="min-h-[56px] px-5 inline-flex items-center gap-2 rounded-full bg-white border border-gray-300 text-gray-700 font-bold text-sm shrink-0">
                        <LogOut className="h-4 w-4" /> Sair
                    </button>
                )}
            </div>
            {children}
        </div>
    );
}
