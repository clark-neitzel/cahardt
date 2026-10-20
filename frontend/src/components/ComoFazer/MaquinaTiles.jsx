import { useState } from 'react';
import { Volume2, PhoneCall, GraduationCap, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import comoFazerService, { mensagemErro, codigoErro } from '../../services/comoFazerService';
import { falar, suportaFala } from './falar';

const TILES = [
    { bloco: 'MONTAR', emoji: '🔧', rotulo: 'Montar' },
    { bloco: 'USAR', emoji: '▶️', rotulo: 'Usar' },
    { bloco: 'LIMPAR', emoji: '🧼', rotulo: 'Limpar' },
    { bloco: 'PROBLEMA', emoji: '🚨', rotulo: 'Deu problema', perigo: true },
];

const contar = (secoes, bloco) => (secoes || [])
    .filter((s) => s.bloco === bloco)
    .reduce((t, s) => t + (Array.isArray(s.passos) ? s.passos.length : 0), 0);

// Os 4 botões grandes da máquina viram ATALHOS para as seções da mesma página.
export default function MaquinaTiles({ conteudo, doc, onIr }) {
    const [chamando, setChamando] = useState(false);
    const secoes = Array.isArray(doc?.secoes) ? doc.secoes : [];
    const problemas = secoes.filter((s) => s.bloco === 'PROBLEMA');

    const chamar = async () => {
        setChamando(true);
        try {
            await comoFazerService.chamarEncarregado(conteudo.id, {});
            toast.success('Avisamos o encarregado. Ele já recebe na agenda.', { duration: 5000 });
        } catch (e) {
            if (codigoErro(e) === 'SEM_ENCARREGADO') toast.error('Este conteúdo ainda não tem encarregado cadastrado. Chame o encarregado pessoalmente.', { duration: 6000 });
            else if (codigoErro(e) === 'AGUARDE') toast('Já avisamos há pouco. Aguarde um instante.', { icon: '⏳' });
            else toast.error(mensagemErro(e, 'Não consegui avisar. Chame o encarregado pessoalmente.'));
        } finally { setChamando(false); }
    };

    return (
        <div className="space-y-3">
            {doc?.avisoPerigo ? (
                <div className="rounded-xl border-l-4 border-red-600 bg-red-50 p-3 flex items-start gap-2">
                    <p className="flex-1 text-sm md:text-base text-gray-900"><b className="text-red-700">⚠️ Perigo:</b> {doc.avisoPerigo}</p>
                    {suportaFala() && (
                        <button type="button" onClick={() => falar(`Atenção. Perigo. ${doc.avisoPerigo}`)} aria-label="Ouvir o aviso"
                            className="min-h-[56px] min-w-[56px] shrink-0 rounded-full border-2 border-red-600 text-red-700 flex items-center justify-center bg-white">
                            <Volume2 className="h-5 w-5" />
                        </button>
                    )}
                </div>
            ) : null}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {TILES.map((t) => {
                    const n = t.bloco === 'PROBLEMA' ? problemas.length : contar(secoes, t.bloco);
                    return (
                        <button key={t.bloco} type="button" onClick={() => onIr(t.bloco)}
                            className={`min-h-[110px] rounded-2xl bg-white border-2 ${t.perigo ? 'border-red-500' : 'border-gray-200'} p-3 flex flex-col items-center justify-center gap-1 active:bg-mint/40`}>
                            <span className="text-4xl leading-none">{t.emoji}</span>
                            <b className="text-base md:text-lg text-gray-900">{t.rotulo}</b>
                            <small className="text-xs font-semibold text-gray-600">
                                {t.bloco === 'PROBLEMA' ? `${n} ${n === 1 ? 'situação' : 'situações'}` : `${n} ${n === 1 ? 'passo' : 'passos'}`}
                            </small>
                        </button>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button type="button" onClick={chamar} disabled={chamando}
                    className="min-h-[64px] rounded-2xl bg-white border-2 border-red-500 px-4 flex items-center gap-3 text-left disabled:opacity-60">
                    {chamando ? <Loader2 className="h-7 w-7 animate-spin text-red-600" /> : <PhoneCall className="h-7 w-7 text-red-600 shrink-0" />}
                    <span><b className="block text-gray-900">Chamar o encarregado</b><small className="text-gray-600">Avisa pela agenda dele agora</small></span>
                </button>
                <button type="button" onClick={() => onIr('TREINAMENTO')}
                    className="min-h-[64px] rounded-full bg-primary hover:bg-primaryDark text-white font-bold text-base px-4 flex items-center justify-center gap-2">
                    <GraduationCap className="h-6 w-6" /> Fazer o treinamento desta máquina
                </button>
            </div>
        </div>
    );
}
