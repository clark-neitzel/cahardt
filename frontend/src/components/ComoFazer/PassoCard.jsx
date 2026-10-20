import { useState } from 'react';
import { Volume2, Play, AlertTriangle, ImageOff, X } from 'lucide-react';
import { urlMidia } from '../../services/comoFazerService';
import { falar, suportaFala } from './falar';

// O ÚNICO componente de passo: usado pela página do conteúdo (linha numerada), pelo checklist,
// pela dosagem e pela prévia do editor. Foto/vídeo à direita, frase, detalhe, Ouvir, itens, perigo.

/** Texto que o botão Ouvir lê para este passo. */
export function textoDoPasso(passo, numero) {
    const partes = [];
    if (passo?.perigo) partes.push('Atenção. Perigo.');
    if (numero) partes.push(`Passo ${numero}.`);
    if (passo?.texto) partes.push(passo.texto);
    if (passo?.detalhe) partes.push(passo.detalhe);
    if (Array.isArray(passo?.itens)) {
        passo.itens.forEach((i) => {
            const q = [i.quantidade, i.unidade].filter(Boolean).join(' ');
            partes.push(`${q ? `${q} de ` : ''}${i.nome || ''}.`);
        });
    }
    return partes.join(' ');
}

function Midia({ foto, video, alt, pequena }) {
    const [falhou, setFalhou] = useState(false);
    const [tocando, setTocando] = useState(false);
    const [ampliada, setAmpliada] = useState(false);
    const src = urlMidia(foto);
    const srcVideo = urlMidia(video);
    const tam = pequena ? 'w-20 h-20' : 'w-28 h-28 md:w-48 md:h-36';
    if (!src && !srcVideo) return null;

    if (tocando && srcVideo) {
        return (
            <video src={srcVideo} controls autoPlay playsInline onError={() => setTocando(false)}
                className={`${pequena ? 'w-32' : 'w-44 md:w-64'} rounded-xl bg-black shrink-0`} />
        );
    }
    return (
        <>
            <button type="button" disabled={!src && !srcVideo}
                onClick={() => (srcVideo ? setTocando(true) : setAmpliada(true))}
                className={`${tam} relative shrink-0 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center`}>
                {src && !falhou
                    ? <img src={src} alt={alt || ''} onError={() => setFalhou(true)} className="w-full h-full object-cover" />
                    : <ImageOff className="h-7 w-7 text-gray-400" />}
                {srcVideo && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                        <span className="h-11 w-11 rounded-full bg-house/90 text-white flex items-center justify-center"><Play className="h-5 w-5" /></span>
                    </span>
                )}
            </button>
            {ampliada && src && !falhou && (
                <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-3" onClick={() => setAmpliada(false)}>
                    <button type="button" aria-label="Fechar" className="absolute top-3 right-3 p-3 rounded-full bg-white/20 text-white"><X className="h-6 w-6" /></button>
                    <img src={src} alt={alt || ''} className="max-h-full max-w-full object-contain rounded-lg" />
                </div>
            )}
        </>
    );
}

export default function PassoCard({ passo, numero, compacto = false, semOuvir = false }) {
    if (!passo) return null;
    const itens = Array.isArray(passo.itens) ? passo.itens : [];
    const podeOuvir = !semOuvir && suportaFala();

    return (
        <div className={`flex gap-3 rounded-xl bg-white p-3 ${passo.perigo ? 'border-2 border-red-500' : 'border border-gray-200'}`}>
            {numero != null && (
                <span className={`shrink-0 h-9 w-9 rounded-full flex items-center justify-center font-extrabold text-white ${passo.perigo ? 'bg-red-600' : 'bg-house'}`}>{numero}</span>
            )}
            <div className="flex-1 min-w-0">
                {passo.perigo && (
                    <span className="inline-flex items-center gap-1 mb-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                        <AlertTriangle className="h-3.5 w-3.5" /> Perigo
                    </span>
                )}
                <p className={`${compacto ? 'text-base' : 'text-lg md:text-xl'} font-bold text-gray-900 leading-snug break-words`}>{passo.texto || ''}</p>
                {passo.detalhe ? <p className="text-sm text-gray-600 mt-1 break-words">{passo.detalhe}</p> : null}

                {itens.length > 0 && (
                    <div className="grid grid-cols-1 gap-2 mt-3">
                        {itens.map((i, idx) => (
                            <div key={i.id || idx} className="flex items-center gap-3 rounded-xl border border-gray-200 p-2">
                                <Midia foto={i.foto} alt={i.nome} pequena />
                                <div className="min-w-0">
                                    <div className="text-2xl font-extrabold text-primaryDark leading-none">{i.quantidade || ''}</div>
                                    <div className="text-sm font-bold text-gray-900 mt-1 break-words">{i.nome || ''}</div>
                                    {i.unidade ? <div className="text-xs text-gray-600 break-words">{i.unidade}</div> : null}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {podeOuvir && (
                    <button type="button" onClick={() => falar(textoDoPasso(passo, numero))}
                        className="mt-2 inline-flex items-center gap-2 min-h-[56px] px-5 rounded-full border-2 border-primary text-primaryDark font-bold text-sm bg-white active:bg-mint">
                        <Volume2 className="h-4 w-4" /> Ouvir
                    </button>
                )}
            </div>
            <Midia foto={passo.foto} video={passo.video} alt={passo.texto} pequena={compacto} />
        </div>
    );
}
