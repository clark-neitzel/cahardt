import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Camera, AlertTriangle, Keyboard, Loader2 } from 'lucide-react';
import { dvValido, limpar } from '../utils/chaveNfe';

/**
 * LEITOR DE CÓDIGO DE BARRAS PELA CÂMERA (Code-128 da DANFE).
 *
 * Serve para bipar uma nota avulsa sem leitor de mesa — no galpão, no balcão, com o
 * celular na mão. Para um maço de 30 folhas o leitor USB ganha fácil (é só um teclado
 * que "digita" a chave), por isso este modal é sempre OPCIONAL: se a câmera não abrir,
 * o campo de digitação da tela continua funcionando e é ele que a tela oferece de volta.
 *
 * Dois caminhos de decodificação, nesta ordem:
 *  1. `BarcodeDetector` NATIVO — quando existe E declara suportar `code_128`
 *     (Chrome no Android). Custo zero de bundle, decodifica no processo do navegador.
 *  2. `@zxing/library` (Apache-2.0) por `import()` DINÂMICO — fallback do iOS/Safari.
 *     Dinâmico de propósito: o Vite manda a biblioteca para um chunk separado, que só
 *     é baixado quando alguém toca "Ler pelo celular". Nada de CDN (a CSP e o modo
 *     offline do PWA barrariam) e nada de pesar a abertura do app para quem nunca usa.
 *
 * `jsqr`, que já existe no projeto, NÃO serve: lê só QR e a DANFE traz Code-128C.
 *
 * Regras de câmera do projeto (molde: `Motorista/Entregas/ConferirFolhaModal.jsx`):
 * `facingMode:'environment'`, `<video playsInline muted>` (senão o iOS abre em tela
 * cheia e some com o app) e TODOS os tracks parados no unmount — câmera que fica
 * ligada por engano acende a luzinha e come bateria do vendedor em campo.
 */
const LeitorCodigoBarras = ({ onLeitura, onClose, titulo = 'Ler o código de barras' }) => {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const pararRef = useRef(false);      // trava o laço de varredura no unmount
    const entregueRef = useRef(false);   // garante UMA entrega por abertura
    const timerRef = useRef(null);

    const [fase, setFase] = useState('iniciando'); // iniciando | lendo | erro
    const [motivoErro, setMotivoErro] = useState('');
    const [motor, setMotor] = useState('');        // 'nativo' | 'zxing'

    /** Para a câmera de verdade: laço, timer e todos os tracks do stream. */
    const pararCamera = useCallback(() => {
        pararRef.current = true;
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        const stream = streamRef.current;
        if (stream) {
            stream.getTracks().forEach(t => { try { t.stop(); } catch { /* já parado */ } });
            streamRef.current = null;
        }
        const v = videoRef.current;
        if (v) { try { v.srcObject = null; } catch { /* ignora */ } }
    }, []);

    /**
     * Uma leitura boa: vibra, para a câmera e devolve a chave para a tela.
     *
     * ⚠️ A guarda do `pararRef` é o que impede o BIPE FANTASMA. A decodificação roda
     * dentro de um `await`: se o frame terminar de decodificar DEPOIS de a pessoa
     * tocar no X, sem esta linha a entrega ainda aconteceria e a nota iria para
     * ARQUIVADO sozinha — ninguém bipou, e no Pedaço 1 não há desfazer na tela.
     * `pararCamera()` liga o `pararRef` e é chamado tanto pelo X quanto pela limpeza
     * do efeito, então esta checagem cobre os dois caminhos de saída.
     */
    const entregar = useCallback((texto) => {
        if (entregueRef.current || pararRef.current) return;
        entregueRef.current = true;
        pararCamera();
        try { navigator.vibrate?.(60); } catch { /* sem vibração, tudo bem */ }
        // Quem fecha o modal é a tela que recebe a leitura (ela decide o que fazer
        // com a chave antes de sumir com a câmera).
        onLeitura?.(texto);
    }, [onLeitura, pararCamera]);

    const fechar = useCallback(() => {
        pararCamera();
        onClose?.();
    }, [onClose, pararCamera]);

    useEffect(() => {
        let cancelado = false;

        /**
         * Só aceita a chave de 44 dígitos com DV bom. O verso da DANFE tem outros
         * códigos, e o Code-128 tem checksum próprio — leitura errada praticamente
         * não passa daqui. Qualquer outra coisa: segue varrendo, sem incomodar.
         */
        const aceitar = (bruto) => {
            // 2ª guarda do bipe fantasma: o `cancelado` deste efeito (desmontagem)
            // não é visível dentro de `entregar`, que vive fora dele.
            if (cancelado || pararRef.current) return true; // "true" = pare de varrer
            const c = limpar(bruto);
            if (c.length === 44 && dvValido(c)) { entregar(c); return true; }
            return false;
        };

        const iniciar = async () => {
            pararRef.current = false;
            entregueRef.current = false;
            setFase('iniciando');

            // 1) Câmera traseira
            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
                });
            } catch (e) {
                if (cancelado) return;
                console.error('[Canhoto] Câmera indisponível:', e);
                const negada = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
                const semCamera = e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError';
                setMotivoErro(
                    negada
                        ? 'A permissão da câmera está negada para este app. Libere a câmera nos ajustes do aparelho (ou no cadeado da barra de endereço) e tente de novo.'
                        : semCamera
                            ? 'Não encontrei uma câmera neste aparelho.'
                            : 'Não consegui abrir a câmera agora.'
                );
                setFase('erro');
                return;
            }
            if (cancelado || pararRef.current) {
                stream.getTracks().forEach(t => { try { t.stop(); } catch { /* ignora */ } });
                return;
            }
            streamRef.current = stream;
            const video = videoRef.current;
            if (!video) { pararCamera(); return; }
            video.srcObject = stream;
            await video.play().catch(() => { /* iOS às vezes recusa o play; o frame vem mesmo assim */ });
            if (cancelado) return;
            setFase('lendo');

            // 2) Motor de decodificação
            let detectarNativo = null;
            try {
                if ('BarcodeDetector' in window) {
                    const formatos = await window.BarcodeDetector.getSupportedFormats();
                    if (Array.isArray(formatos) && formatos.includes('code_128')) {
                        const det = new window.BarcodeDetector({ formats: ['code_128'] });
                        detectarNativo = async (fonte) => {
                            const achados = await det.detect(fonte);
                            return achados?.[0]?.rawValue || null;
                        };
                        setMotor('nativo');
                    }
                }
            } catch (e) {
                console.warn('[Canhoto] BarcodeDetector nativo indisponível, caindo no ZXing:', e?.message);
                detectarNativo = null;
            }

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            let lerZxing = null;

            if (!detectarNativo) {
                try {
                    // Import DINÂMICO: chunk separado, baixado só agora.
                    const z = await import('@zxing/library');
                    if (cancelado) return;
                    const hints = new Map();
                    hints.set(z.DecodeHintType.POSSIBLE_FORMATS, [z.BarcodeFormat.CODE_128]);
                    hints.set(z.DecodeHintType.TRY_HARDER, true);
                    const reader = new z.MultiFormatReader();
                    reader.setHints(hints);
                    lerZxing = (img) => {
                        // ImageData (RGBA) → luminância. RGBLuminanceSource só converte
                        // sozinho quando recebe Int32Array; com Uint8ClampedArray ele usa
                        // os valores como já sendo cinza — então a conta é nossa.
                        const { data, width, height } = img;
                        const lum = new Uint8ClampedArray(width * height);
                        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
                            lum[j] = (data[i] * 306 + data[i + 1] * 601 + data[i + 2] * 117) >> 10;
                        }
                        const bitmap = new z.BinaryBitmap(new z.HybridBinarizer(new z.RGBLuminanceSource(lum, width, height)));
                        try { return reader.decode(bitmap)?.getText() || null; }
                        catch { return null; }          // "não achei nada neste frame" é o normal
                        finally { reader.reset(); }
                    };
                    setMotor('zxing');
                } catch (e) {
                    if (cancelado) return;
                    console.error('[Canhoto] Falha ao carregar o leitor:', e);
                    setMotivoErro('Não consegui carregar o leitor de código de barras. Verifique a internet e tente de novo — ou digite o número da nota.');
                    setFase('erro');
                    pararCamera();
                    return;
                }
            }

            // 3) Varredura
            const varrer = async () => {
                if (pararRef.current || cancelado || entregueRef.current) return;
                const v = videoRef.current;
                if (v && v.readyState >= 2 && v.videoWidth > 0) {
                    try {
                        if (detectarNativo) {
                            const bruto = await detectarNativo(v);
                            if (bruto && aceitar(bruto)) return;
                        } else if (lerZxing) {
                            // Resolução horizontal é o que decide num código comprido:
                            // 44 dígitos viram ~350 barras. Abaixo de ~1000px elas
                            // se fundem e nada é lido.
                            const largura = Math.min(v.videoWidth, 1280);
                            const escala = largura / v.videoWidth;
                            canvas.width = largura;
                            canvas.height = Math.round(v.videoHeight * escala);
                            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
                            // Só a faixa central: é onde a mira está e corta ~70% do trabalho.
                            const alturaFaixa = Math.max(80, Math.round(canvas.height * 0.4));
                            const topo = Math.round((canvas.height - alturaFaixa) / 2);
                            const img = ctx.getImageData(0, topo, canvas.width, alturaFaixa);
                            const bruto = lerZxing(img);
                            if (bruto && aceitar(bruto)) return;
                        }
                    } catch (e) {
                        // Frame ruim/câmera trocando de foco: ignora e tenta o próximo.
                        if (e?.name === 'InvalidStateError') { /* vídeo ainda não pronto */ }
                    }
                }
                timerRef.current = setTimeout(varrer, detectarNativo ? 200 : 120);
            };
            varrer();
        };

        iniciar();
        return () => { cancelado = true; pararCamera(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="fixed inset-0 z-[70] bg-black/85 flex flex-col">
            {/* Topo */}
            <div className="bg-house text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                    <Camera className="h-5 w-5 shrink-0" />
                    <h2 className="font-bold truncate">{titulo}</h2>
                </div>
                <button
                    type="button"
                    onClick={fechar}
                    aria-label="Fechar"
                    className="p-2 -mr-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full active:bg-white/15"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>

            {fase === 'erro' ? (
                <div className="flex-1 overflow-y-auto p-4 flex items-start justify-center">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 max-w-md w-full mt-6">
                        <div className="flex items-start gap-2 mb-3">
                            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                            <div>
                                <div className="font-bold text-gray-900">Não deu para usar a câmera</div>
                                <p className="text-sm text-gray-600 mt-1">{motivoErro}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-2 bg-mint/40 border border-primary/20 rounded-lg px-3 py-2.5 text-sm text-gray-700">
                            <Keyboard className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                            <span>Sem problema: feche esta janela e <b>digite o número da nota</b> no campo de bipe — funciona do mesmo jeito.</span>
                        </div>
                        <button
                            type="button"
                            onClick={fechar}
                            className="mt-4 w-full px-4 py-3 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm"
                        >
                            Voltar e digitar
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="relative flex-1 overflow-hidden">
                        <video
                            ref={videoRef}
                            playsInline
                            muted
                            autoPlay
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                        {/* Mira: faixa horizontal, no formato do código da DANFE */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-[88%] h-28 border-2 border-white/90 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
                        </div>
                        {fase === 'iniciando' && (
                            <div className="absolute inset-0 flex items-center justify-center gap-2 text-white text-sm font-medium">
                                <Loader2 className="h-5 w-5 animate-spin" /> Abrindo a câmera…
                            </div>
                        )}
                    </div>
                    <div className="bg-black/70 text-white px-4 py-3 text-center text-sm flex-shrink-0">
                        <div className="font-semibold">Enquadre o código de barras comprido da DANFE</div>
                        <div className="text-white/70 text-xs mt-0.5">
                            Aquele de 44 dígitos, embaixo da chave de acesso. Segure firme e aproxime até preencher a faixa.
                            {motor === 'zxing' && ' · leitura por software'}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default LeitorCodigoBarras;
