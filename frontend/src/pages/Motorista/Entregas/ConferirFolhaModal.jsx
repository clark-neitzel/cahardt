import React, { useState, useEffect, useRef } from 'react';
import { X, CheckCircle, AlertTriangle, QrCode, Camera, RefreshCw, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import entregasService from '../../../services/entregasService';

// Rótulos das ações do histórico (mesmos códigos do backend)
const ACAO_LABELS = {
    EDITADA: 'Dados alterados',
    PEDIDOS_ADICIONADOS: 'Entrou na carga',
    PEDIDO_REMOVIDO: 'Saiu da carga',
    AMOSTRAS_ADICIONADAS: 'Amostra entrou',
    AMOSTRA_REMOVIDA: 'Amostra saiu',
    CRIADA: 'Carga criada'
};

const descreverMudanca = (log) => {
    const alt = log.alteracoes || {};
    const linhas = [];
    if (alt.dataSaida) linhas.push({ tag: 'MUDOU', texto: `Saída: ${alt.dataSaida.de} → ${alt.dataSaida.para}` });
    if (alt.motorista && alt.motorista.de) linhas.push({ tag: 'MUDOU', texto: `Motorista: ${alt.motorista.de} → ${alt.motorista.para}` });
    const tag = log.acao === 'PEDIDO_REMOVIDO' || log.acao === 'AMOSTRA_REMOVIDA' ? 'SAIU' : 'ENTROU';
    if (Array.isArray(alt.pedidos)) {
        alt.pedidos.forEach(p => linhas.push({ tag, texto: `Pedido ${p.numero}${p.cliente ? ` — ${p.cliente}` : ''}` }));
    }
    if (Array.isArray(alt.amostras)) {
        alt.amostras.forEach(a => linhas.push({ tag, texto: `${a.numero}${a.destinatario ? ` — ${a.destinatario}` : ''}` }));
    }
    if (linhas.length === 0) linhas.push({ tag: 'MUDOU', texto: ACAO_LABELS[log.acao] || log.acao });
    return linhas;
};

const TAG_CORES = {
    ENTROU: 'bg-green-100 text-green-800',
    SAIU: 'bg-red-100 text-red-700',
    MUDOU: 'bg-yellow-100 text-yellow-800'
};

const ConferirFolhaModal = ({ onClose }) => {
    const [fase, setFase] = useState('camera'); // camera | consultando | resultado | erroCamera
    const [resultado, setResultado] = useState(null);
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const pararRef = useRef(false);
    const consultandoRef = useRef(false);

    const pararCamera = () => {
        pararRef.current = true;
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
    };

    const consultarFolha = async (conteudo) => {
        if (consultandoRef.current) return;
        // Formato do QR da folha: HARDT-CARGA|<id>|<numero>|<versao>
        const partes = String(conteudo || '').split('|');
        if (partes[0] !== 'HARDT-CARGA' || partes.length < 4) {
            return; // QR de outra coisa (PIX, site...) — segue escaneando
        }
        consultandoRef.current = true;
        pararCamera();
        setFase('consultando');
        try {
            const dados = await entregasService.conferirFolha(partes[1], partes[3]);
            setResultado(dados);
            setFase('resultado');
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao conferir a folha. Verifique seu 4G.');
            setResultado(null);
            consultandoRef.current = false;
            iniciarCamera();
        }
    };

    const iniciarCamera = async () => {
        setFase('camera');
        pararRef.current = false;
        consultandoRef.current = false;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            streamRef.current = stream;
            if (!videoRef.current) { pararCamera(); return; }
            videoRef.current.srcObject = stream;
            await videoRef.current.play().catch(() => {});

            const jsQR = (await import('jsqr')).default;
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            const varrer = () => {
                if (pararRef.current) return;
                const video = videoRef.current;
                if (video && video.readyState >= 2 && video.videoWidth > 0) {
                    const escala = Math.min(1, 480 / video.videoWidth);
                    canvas.width = Math.round(video.videoWidth * escala);
                    canvas.height = Math.round(video.videoHeight * escala);
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const codigo = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
                    if (codigo?.data) {
                        consultarFolha(codigo.data);
                        return;
                    }
                }
                setTimeout(varrer, 250);
            };
            varrer();
        } catch (e) {
            console.error('Câmera indisponível:', e);
            setFase('erroCamera');
        }
    };

    useEffect(() => {
        iniciarCamera();
        return () => pararCamera();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fechar = () => {
        pararCamera();
        onClose();
    };

    // Junta as mudanças de todos os logs desde a versão da folha
    const mudancas = (resultado?.mudancas || []).flatMap(descreverMudanca);

    return (
        <div className="fixed inset-0 z-[70] bg-black/80 flex flex-col">
            {/* Topo */}
            <div className="bg-house text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                    <QrCode className="h-5 w-5" />
                    <h2 className="font-bold">Conferir Folha da Carga</h2>
                </div>
                <button onClick={fechar} className="p-2 -mr-1 rounded-full active:bg-white/15">
                    <X className="h-5 w-5" />
                </button>
            </div>

            {/* Câmera */}
            {(fase === 'camera' || fase === 'consultando') && (
                <div className="flex-1 relative overflow-hidden bg-black">
                    <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                    {/* Mira */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-56 h-56 border-2 border-white/90 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"></div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-5 text-center">
                        <p className="text-white font-semibold text-sm drop-shadow">
                            {fase === 'consultando' ? 'Conferindo com o sistema…' : 'Aponte para o QR no cabeçalho da folha impressa'}
                        </p>
                    </div>
                </div>
            )}

            {/* Câmera bloqueada */}
            {fase === 'erroCamera' && (
                <div className="flex-1 bg-secondary flex flex-col items-center justify-center p-6 text-center">
                    <Camera className="h-12 w-12 text-gray-400 mb-3" />
                    <p className="font-bold text-gray-800">Não consegui abrir a câmera</p>
                    <p className="text-sm text-gray-500 mt-1 max-w-xs">
                        Libere o acesso à câmera para o app nas configurações do celular e tente de novo.
                    </p>
                    <button onClick={iniciarCamera} className="mt-5 px-5 py-2.5 bg-primary text-white rounded-full font-semibold text-sm flex items-center gap-2">
                        <RefreshCw className="h-4 w-4" /> Tentar novamente
                    </button>
                </div>
            )}

            {/* Resultado — o veredito da versão aparece SEMPRE (quem separa/confere também escaneia);
                a dona da carga é informação complementar logo abaixo */}
            {fase === 'resultado' && resultado && (
                <div className="flex-1 bg-secondary overflow-y-auto">
                    {resultado.atualizada ? (
                        <>
                            <div className="bg-primary text-white p-6 text-center">
                                <CheckCircle className="h-12 w-12 mx-auto mb-2" />
                                <h3 className="text-lg font-bold">Folha confere!</h3>
                                <p className="text-sm opacity-90 mt-1">
                                    Carga #{resultado.numero} · esta folha é a versão atual (v{resultado.versaoAtual})
                                </p>
                            </div>
                            <div className="p-4 space-y-3">
                                <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm">
                                    <div className="flex justify-between py-1"><span className="text-gray-500">Folha escaneada</span><span className="font-bold">v{resultado.versaoFolha}</span></div>
                                    <div className="flex justify-between py-1"><span className="text-gray-500">No sistema</span><span className="font-bold">v{resultado.versaoAtual} (igual) ✅</span></div>
                                    <div className="flex justify-between py-1"><span className="text-gray-500">Motorista</span><span className="font-bold">{resultado.motorista || '—'}</span></div>
                                    <div className="flex justify-between py-1"><span className="text-gray-500">Pedidos / Amostras</span><span className="font-bold">{resultado.totais?.pedidos ?? '—'} / {resultado.totais?.amostras ?? 0}</span></div>
                                </div>
                                {!resultado.minha && (
                                    <div className="bg-gray-700 text-white rounded-xl p-4 text-sm flex items-start gap-2.5">
                                        <Truck className="h-5 w-5 flex-shrink-0 mt-0.5 opacity-80" />
                                        <span>Esta carga é do motorista <b>{resultado.motorista || '—'}</b>. Se você é o motorista, confira se pegou a folha certa — a sua carga tem outro número.</span>
                                    </div>
                                )}
                                <div className="bg-mint rounded-xl p-4 text-sm font-semibold text-primaryDark">
                                    {resultado.minha
                                        ? 'Pode carregar e sair — a folha na sua mão é a mesma coisa que o app mostra.'
                                        : 'Folha válida para separar e conferir — é a versão atual da carga.'}
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="bg-amber-600 text-white p-6 text-center">
                                <AlertTriangle className="h-12 w-12 mx-auto mb-2" />
                                <h3 className="text-lg font-bold">Folha desatualizada!</h3>
                                <p className="text-sm opacity-90 mt-1">
                                    A Carga #{resultado.numero} mudou depois desta impressão
                                </p>
                            </div>
                            <div className="p-4 space-y-3">
                                <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-center gap-3 text-sm font-bold">
                                    <span className="px-3 py-1 rounded-full bg-red-100 text-red-700">Folha: v{resultado.versaoFolha}</span>
                                    <span className="text-gray-400">→</span>
                                    <span className="px-3 py-1 rounded-full bg-green-100 text-green-800">Sistema: v{resultado.versaoAtual}</span>
                                </div>
                                {mudancas.length > 0 && (
                                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                                        <p className="text-[11px] font-bold uppercase tracking-widest text-amber-700 mb-2">O que mudou desde a impressão</p>
                                        <div className="divide-y divide-gray-100">
                                            {mudancas.map((m, i) => (
                                                <div key={i} className="py-2 flex items-start gap-2 text-sm">
                                                    <span className={`flex-shrink-0 mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${TAG_CORES[m.tag] || 'bg-gray-100 text-gray-700'}`}>{m.tag}</span>
                                                    <span className="text-gray-700">{m.texto}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {!resultado.minha && (
                                    <div className="bg-gray-700 text-white rounded-xl p-4 text-sm flex items-start gap-2.5">
                                        <Truck className="h-5 w-5 flex-shrink-0 mt-0.5 opacity-80" />
                                        <span>Esta carga é do motorista <b>{resultado.motorista || '—'}</b>.</span>
                                    </div>
                                )}
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm font-semibold text-amber-800">
                                    {resultado.minha
                                        ? 'Peça a folha nova na expedição antes de sair. O que vale é o que está no app.'
                                        : 'Não use esta folha para separar ou conferir — reimprima o romaneio no sistema.'}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Ações */}
                    <div className="p-4 pt-1 space-y-2 pb-8">
                        <button
                            onClick={() => { setResultado(null); iniciarCamera(); }}
                            className="w-full py-3 bg-white border border-primary text-primary rounded-full font-semibold text-sm flex items-center justify-center gap-2 active:bg-mint/40"
                        >
                            <QrCode className="h-4 w-4" /> Escanear outra folha
                        </button>
                        <button
                            onClick={fechar}
                            className="w-full py-3 bg-primary text-white rounded-full font-semibold text-sm active:bg-primaryDark"
                        >
                            Fechar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ConferirFolhaModal;
