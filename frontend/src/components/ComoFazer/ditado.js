import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

// Ditado por voz (Web Speech). Mesmo padrão de Pedidos/NovoPedido.jsx (toggleMicrophone):
// continuous + interimResults, pt-BR, o texto digitado antes é preservado.
// O botão 🎤 só deve aparecer se `suportaDitado()` for true (iPad/iPhone/Chrome têm; Firefox não).

const classeReconhecimento = () => (typeof window === 'undefined' ? null : (window.SpeechRecognition || window.webkitSpeechRecognition || null));
export const suportaDitado = () => !!classeReconhecimento();

/** Liga o ditado a um campo controlado: `valor` / `setValor`. */
export function useDitado(valor, setValor) {
    const [ouvindo, setOuvindo] = useState(false);
    const recRef = useRef(null);
    const baseRef = useRef('');
    const valorRef = useRef(valor);
    valorRef.current = valor;

    const parar = useCallback(() => {
        const r = recRef.current;
        recRef.current = null;
        if (r) { try { r.stop(); } catch { /* já parou */ } }
        setOuvindo(false);
    }, []);

    useEffect(() => () => {   // sai da tela: solta o microfone
        const r = recRef.current; recRef.current = null;
        if (r) { try { r.abort(); } catch { /* ignora */ } }
    }, []);

    const alternar = useCallback(() => {
        if (recRef.current) { parar(); return; }
        const Classe = classeReconhecimento();
        if (!Classe) return;
        const rec = new Classe();
        rec.lang = 'pt-BR';
        rec.continuous = true;
        rec.interimResults = true;
        baseRef.current = valorRef.current || '';
        rec.onstart = () => setOuvindo(true);
        rec.onresult = (ev) => {
            let final = ''; let parcial = '';
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
                const t = ev.results[i][0].transcript;
                if (ev.results[i].isFinal) final += `${t} `; else parcial += t;
            }
            const base = `${baseRef.current} ${final}`.replace(/\s+/g, ' ').trim();
            setValor(`${base} ${parcial}`.trim());
            if (final) baseRef.current = base;
        };
        rec.onerror = (ev) => {
            if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') toast.error('O microfone está bloqueado. Libere o microfone para este site nas configurações do aparelho.');
            else if (ev.error !== 'aborted' && ev.error !== 'no-speech') toast.error('Não consegui ouvir. Fale mais perto ou confira a internet.');
            setOuvindo(false);
        };
        rec.onend = () => { recRef.current = null; setOuvindo(false); };
        recRef.current = rec;
        try { rec.start(); } catch { recRef.current = null; setOuvindo(false); }
    }, [parar, setValor]);

    return { suporta: suportaDitado(), ouvindo, alternar, parar };
}
