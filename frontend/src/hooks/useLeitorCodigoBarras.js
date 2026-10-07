// Detecta o BIPE de um leitor de código de barras USB/sem fio (que se comporta como teclado:
// digita o código inteiro muito rápido e termina com Enter).
//
// Regra: pacote de >= minimo caracteres (teclas de 1 caractere), com intervalo entre teclas
// <= intervaloMaxMs e terminado em Enter. Digitação humana (mesmo rápida) não chega a isso.
// Ao reconhecer: cancela o Enter (nenhum botão/formulário reage), DEVOLVE ao campo focado o valor
// que ele tinha antes do pacote (os dígitos do leitor não ficam na Quantidade/Busca) e chama
// onCodigo(codigo).
// O hook escuta SEMPRE (não existe "desligar"): com `bloqueado=true` (ex.: janela de confirmação aberta)
// ele ainda reconhece o pacote do leitor, ENGOLE o Enter final (stopImmediatePropagation — assim a janela
// não confirma sozinha) e chama onBloqueado() em vez de onCodigo(). Como o listener é registrado uma vez,
// na montagem da tela, ele roda ANTES do listener de qualquer janela aberta depois.
//
// Uso: useLeitorCodigoBarras({ onCodigo: (c) => ..., bloqueado: !!modalAberto, onBloqueado: () => aviso() });
import { useEffect, useRef } from 'react';

const TECLAS_MODIFICADORAS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph']);

// Devolve o valor ao campo de um jeito que o React (input controlado) enxerga.
function restaurarValor(campo, valor) {
    if (!campo || !('value' in campo) || campo.value === valor) return;
    try {
        const proto = campo.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(campo, valor); else campo.value = valor;
        campo.dispatchEvent(new Event('input', { bubbles: true }));
    } catch {
        try { campo.value = valor; } catch { /* campo sem value */ }
    }
}

export function useLeitorCodigoBarras({ onCodigo, bloqueado = false, onBloqueado, minimo = 8, intervaloMaxMs = 60 } = {}) {
    // O handler mais recente fica num ref: o listener é registrado uma vez só e nunca fica "velho".
    const onCodigoRef = useRef(onCodigo);
    onCodigoRef.current = onCodigo;
    const bloqueadoRef = useRef(bloqueado);
    bloqueadoRef.current = bloqueado;
    const onBloqueadoRef = useRef(onBloqueado);
    onBloqueadoRef.current = onBloqueado;

    // Responde "um pacote do leitor está sendo digitado AGORA?" — quem aplica o resultado de um bipe
    // (que é assíncrono) espera o pacote seguinte terminar, senão a restauração do campo apaga o resultado.
    const emAndamentoRef = useRef(() => false);

    useEffect(() => {
        let buf = '';
        let ultimo = 0;
        let campo = null;
        let valorAntes = '';

        emAndamentoRef.current = () => buf.length > 0 && (performance.now() - ultimo) <= intervaloMaxMs * 3;

        const aoTeclar = (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey) { buf = ''; return; }
            const agora = performance.now();

            if (e.key === 'Enter') {
                const ehBipe = buf.length >= minimo && (agora - ultimo) <= intervaloMaxMs;
                if (ehBipe) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    const codigo = buf;
                    buf = '';
                    restaurarValor(campo, valorAntes);
                    if (bloqueadoRef.current) {
                        try { onBloqueadoRef.current?.(codigo); } catch (err) { console.error('[Leitor] erro no aviso:', err); }
                        return;
                    }
                    try { onCodigoRef.current?.(codigo); } catch (err) { console.error('[Leitor] erro no tratamento do código:', err); }
                    return;
                }
                buf = '';
                return;
            }

            if (e.key.length !== 1) {
                if (!TECLAS_MODIFICADORAS.has(e.key)) buf = '';   // Tab, Backspace, setas... quebram o pacote
                return;
            }

            if (!buf || (agora - ultimo) > intervaloMaxMs) {
                // começo de um pacote novo (ou pessoa digitando devagar)
                buf = '';
                campo = document.activeElement;
                valorAntes = campo && 'value' in campo ? campo.value : '';
            }
            buf += e.key;
            ultimo = agora;
        };

        document.addEventListener('keydown', aoTeclar, true);
        return () => document.removeEventListener('keydown', aoTeclar, true);
    }, [minimo, intervaloMaxMs]);
    return useRef(() => emAndamentoRef.current()).current;   // função estável: pacoteEmAndamento()
}

export default useLeitorCodigoBarras;
