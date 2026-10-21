import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Camera, Loader2, CheckCircle, AlertTriangle, RefreshCw, SkipForward, Zap } from 'lucide-react';
import { toast } from 'react-hot-toast';
import checklistVeiculoService, { urlImagem } from '../../services/checklistVeiculoService';
import { comprimirFoto } from '../../utils/comprimirFoto';
import TireAssimModal from './TireAssimModal';

// Só agrupa visualmente (a lista de ângulos e as regras vêm do servidor, via checklist-config).
const GRUPO_FORA = ['frente', 'lateral_direita', 'lateral_esquerda', 'traseira'];
const GRUPO_CAPO = ['agua_radiador', 'vareta_oleo'];

const TEXTO_FLASH = 'Pouca luz? Antes de bater a foto, toque no raio (⚡) da câmera e deixe em Automático ou Ligado. A IA não reprova foto por ser escura: se faltar algo, ela diz o que mostrar.';

/**
 * Grade de fotos do checklist de saída. Cria/recupera o rascunho do dia (idempotente),
 * sobe cada foto na hora e avisa o formulário pai pelo `onEstado`.
 *   config   = resposta de GET /veiculos/:id/checklist-config
 *   onEstado = ({ checklistId, faltam, luzOleoAcesa }) => void
 *   onFalha  = () => void  (rascunho não pôde ser criado -> pai volta às caixinhas)
 */
const ChecklistFotos = ({ veiculoId, config, onEstado, onFalha }) => {
    const [checklist, setChecklist] = useState(null); // { id, fotos, fotosPuladas, luzOleoAcesa, modo }
    const [envio, setEnvio] = useState({});            // { angulo: { fase, mensagem } }
    const [tireAssim, setTireAssim] = useState(null);
    const inputRef = useRef(null);
    const anguloRef = useRef(null);
    const arquivosRef = useRef({});   // arquivo já comprimido por ângulo (para "Tentar de novo")
    const previewsRef = useRef({});   // blob URLs de pré-visualização
    const onFalhaRef = useRef(onFalha);
    onFalhaRef.current = onFalha;

    const modoTeste = (checklist?.modo || config?.modo) === 'TESTE';

    // Cria (ou recupera) o rascunho ao escolher o veículo
    useEffect(() => {
        let cancelado = false;
        checklistVeiculoService.criarRascunho(veiculoId)
            .then(r => { if (!cancelado) setChecklist(r); })
            .catch(err => {
                console.error('Checklist: falha ao criar rascunho', err);
                if (!cancelado) onFalhaRef.current?.();
            });
        return () => { cancelado = true; };
    }, [veiculoId]);

    useEffect(() => () => {
        Object.values(previewsRef.current).forEach(u => { try { URL.revokeObjectURL(u); } catch { /* */ } });
    }, []);

    const slots = useMemo(
        () => [...(config?.slots || [])].sort((a, b) => (a.ordem || 0) - (b.ordem || 0)),
        [config]
    );
    const luzOleo = !!checklist?.luzOleoAcesa;

    const fotoDe = useCallback((angulo) => {
        const lista = (checklist?.fotos || []).filter(f => f.angulo === angulo);
        return lista.length ? lista[lista.length - 1] : null;
    }, [checklist]);
    const puladaDe = useCallback(
        (angulo) => (checklist?.fotosPuladas || []).some(p => p.angulo === angulo),
        [checklist]
    );
    const obrigatorio = useCallback(
        (slot) => !!slot.obrigatorio || (slot.angulo === 'vareta_oleo' && luzOleo),
        [luzOleo]
    );
    const resolvido = useCallback((slot) => {
        const f = fotoDe(slot.angulo);
        return (f && f.serve !== false) || puladaDe(slot.angulo);
    }, [fotoDe, puladaDe]);

    const faltam = checklist ? slots.filter(s => obrigatorio(s) && !resolvido(s)).length : slots.filter(s => s.obrigatorio).length;

    useEffect(() => {
        if (checklist) onEstado?.({ checklistId: checklist.id, faltam, luzOleoAcesa: luzOleo });
    }, [checklist?.id, faltam, luzOleo]); // eslint-disable-line react-hooks/exhaustive-deps

    const limparPreview = (angulo) => {
        if (previewsRef.current[angulo]) {
            try { URL.revokeObjectURL(previewsRef.current[angulo]); } catch { /* */ }
            delete previewsRef.current[angulo];
        }
    };

    const enviar = async (angulo, arquivoNovo) => {
        if (!checklist) return;
        setEnvio(e => ({ ...e, [angulo]: { fase: 'enviando' } }));
        try {
            if (arquivoNovo) {
                const arq = await comprimirFoto(arquivoNovo);
                arquivosRef.current[angulo] = arq;
                limparPreview(angulo);
                previewsRef.current[angulo] = URL.createObjectURL(arq);
            }
            const arq = arquivosRef.current[angulo];
            if (!arq) throw new Error('sem arquivo');
            const r = await checklistVeiculoService.enviarFoto(checklist.id, angulo, arq, (ev) => {
                if (ev.total && ev.loaded >= ev.total) {
                    setEnvio(e => (e[angulo]?.fase === 'enviando' ? { ...e, [angulo]: { fase: 'analisando' } } : e));
                }
            });
            setChecklist(c => {
                const outras = (c.fotos || []).filter(f => f.angulo !== angulo);
                // foto nova: sai também da lista de puladas
                return { ...c, fotos: [...outras, r.foto], fotosPuladas: (c.fotosPuladas || []).filter(p => p.angulo !== angulo) };
            });
            limparPreview(angulo);
            delete arquivosRef.current[angulo];
            setEnvio(e => { const n = { ...e }; delete n[angulo]; return n; });
        } catch (err) {
            const mensagem = err?.response?.data?.error || 'Não foi possível enviar a foto (sem sinal?).';
            setEnvio(e => ({ ...e, [angulo]: { fase: 'erro', mensagem } }));
        }
    };

    const abrirCamera = (angulo) => {
        anguloRef.current = angulo;
        setTireAssim(null);
        inputRef.current?.click(); // síncrono no toque do usuário
    };

    const aoEscolherArquivo = (e) => {
        const arquivo = e.target.files?.[0];
        e.target.value = '';
        const angulo = anguloRef.current;
        if (arquivo && angulo) enviar(angulo, arquivo);
    };

    const tocarSlot = (slot) => {
        const f = fotoDe(slot.angulo);
        if (f && f.serve === false) return abrirCamera(slot.angulo); // refazer: câmera direto
        setTireAssim(slot);
    };

    const pular = async (angulo) => {
        try {
            const r = await checklistVeiculoService.pular(checklist.id, angulo, 'FALHA_ENVIO');
            setChecklist(c => ({ ...c, fotosPuladas: r.fotosPuladas || [...(c.fotosPuladas || []), { angulo, motivo: 'FALHA_ENVIO' }] }));
            limparPreview(angulo);
            delete arquivosRef.current[angulo];
            setEnvio(e => { const n = { ...e }; delete n[angulo]; return n; });
        } catch (err) {
            toast.error(err?.response?.data?.error || 'Não foi possível pular esta foto.');
        }
    };

    const alternarLuzOleo = async () => {
        const novo = !luzOleo;
        setChecklist(c => ({ ...c, luzOleoAcesa: novo }));
        try {
            await checklistVeiculoService.atualizar(checklist.id, { luzOleoAcesa: novo });
        } catch {
            toast.error('Não consegui salvar a luz de óleo. Tente de novo.');
            setChecklist(c => ({ ...c, luzOleoAcesa: !novo }));
        }
    };

    if (!checklist) {
        return (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
                <Loader2 className="h-5 w-5 animate-spin" /> Preparando o checklist...
            </div>
        );
    }

    const renderTile = (slot) => {
        const env = envio[slot.angulo];
        const foto = fotoDe(slot.angulo);
        const pulada = puladaDe(slot.angulo);
        const obrig = obrigatorio(slot);

        if (env?.fase === 'erro') {
            return (
                <div key={slot.angulo} className="col-span-3 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3">
                    <div className="h-16 w-16 shrink-0 rounded-lg overflow-hidden bg-gray-200">
                        {previewsRef.current[slot.angulo] && <img src={previewsRef.current[slot.angulo]} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-red-800">{slot.rotulo}: falha no envio</p>
                        <p className="text-xs text-red-700 mb-2">{env.mensagem}</p>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => enviar(slot.angulo)}
                                className="min-h-[44px] px-4 bg-primary hover:bg-primaryDark text-white rounded-full text-xs font-semibold inline-flex items-center gap-1.5">
                                <RefreshCw className="h-4 w-4" /> Tentar de novo
                            </button>
                            {modoTeste && (
                                <button type="button" onClick={() => pular(slot.angulo)}
                                    className="min-h-[44px] px-4 bg-white border border-gray-300 text-gray-700 rounded-full text-xs font-medium inline-flex items-center gap-1.5">
                                    <SkipForward className="h-4 w-4" /> Pular esta foto (teste)
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            );
        }

        const ocupado = env?.fase === 'enviando' || env?.fase === 'analisando';
        let moldura = 'border-dashed border-gray-300 bg-gray-50';
        let faixa = null;
        const imagem = previewsRef.current[slot.angulo] || (foto ? urlImagem(foto.url) : null);

        if (ocupado) {
            moldura = 'border-gray-300 bg-gray-100';
            faixa = { cor: 'bg-gray-800/80 text-white', texto: env.fase === 'enviando' ? 'Enviando...' : 'Analisando...' };
        } else if (foto && foto.serve === false) {
            moldura = 'border-red-400 bg-red-50';
            faixa = { cor: 'bg-red-600 text-white', texto: 'Refazer' };
        } else if (foto) {
            const st = foto.statusIa;
            if (st === 'IA_INDISPONIVEL' || st === 'NAO_ANALISADA') {
                moldura = 'border-gray-400 bg-gray-50';
                faixa = { cor: 'bg-gray-700/85 text-white', texto: 'Enviada sem análise' };
            } else if (st === 'REPROVA') {
                moldura = 'border-red-400';
                faixa = { cor: 'bg-red-600 text-white', texto: 'Problema' };
            } else if (st === 'PERGUNTA') {
                moldura = 'border-amber-400';
                faixa = { cor: 'bg-amber-500 text-white', texto: '? pergunta' };
            } else if (st === 'ATENCAO') {
                moldura = 'border-amber-400';
                faixa = { cor: 'bg-amber-500 text-white', texto: 'Atenção' };
            } else {
                moldura = 'border-green-500';
                faixa = { cor: 'bg-green-600 text-white', texto: 'OK' };
            }
        } else if (pulada) {
            moldura = 'border-gray-300 bg-gray-100';
            faixa = { cor: 'bg-gray-500 text-white', texto: 'Pulada (teste)' };
        }

        return (
            <div key={slot.angulo} className="min-w-0">
                <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => tocarSlot(slot)}
                    className={`relative w-full aspect-square rounded-xl border-2 overflow-hidden flex items-center justify-center ${moldura} disabled:cursor-wait`}
                    aria-label={`${slot.rotulo}${obrig ? ' (obrigatória)' : ''}`}
                >
                    {imagem && <img src={imagem} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                    {ocupado && <Loader2 className="relative h-7 w-7 text-white animate-spin drop-shadow" />}
                    {!imagem && !ocupado && <Camera className="h-7 w-7 text-gray-400" />}
                    {faixa && (
                        <span className={`absolute bottom-0 inset-x-0 text-center text-[10px] font-bold py-1 px-1 leading-tight ${faixa.cor}`}>
                            {faixa.texto}
                        </span>
                    )}
                </button>
                <p className="mt-1 text-[11px] leading-tight font-semibold text-gray-700 text-center">
                    {slot.rotulo}{obrig ? ' *' : ''}
                </p>
                {foto?.serve === false && foto.motivoRefazer && (
                    <p className="mt-0.5 text-[10px] leading-tight text-red-700 text-center">{foto.motivoRefazer}</p>
                )}
            </div>
        );
    };

    const doGrupo = (lista) => slots.filter(s => lista.includes(s.angulo));
    const fora = doGrupo(GRUPO_FORA);
    const capo = doGrupo(GRUPO_CAPO);
    const dentro = slots.filter(s => !GRUPO_FORA.includes(s.angulo) && !GRUPO_CAPO.includes(s.angulo));
    const temVareta = slots.some(s => s.angulo === 'vareta_oleo');

    const secao = (titulo, lista, flash) => (lista.length === 0 ? null : (
        <div key={titulo}>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">{titulo}</p>
            <div className="grid grid-cols-3 gap-2">{lista.map(renderTile)}</div>
            {flash && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2">
                    <Zap className="h-4 w-4 shrink-0 text-amber-500" /> <span>{TEXTO_FLASH}</span>
                </p>
            )}
        </div>
    ));

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-gray-800">Fotos do veículo</p>
                {faltam > 0 ? (
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">
                        Faltam {faltam} {faltam === 1 ? 'foto' : 'fotos'}
                    </span>
                ) : (
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 inline-flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5" /> Todas as fotos enviadas
                    </span>
                )}
            </div>

            {!config?.temFotoModelo && (
                <p className="text-xs text-gray-600 flex items-start gap-1.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-gray-400" />
                    Este veículo ainda não tem foto modelo cadastrada. Siga a instrução escrita de cada foto.
                </p>
            )}

            {secao('Por fora', fora, true)}
            {secao('Capô', capo, true)}
            {secao('Dentro', dentro, false)}

            {temVareta && (
                <button type="button" onClick={alternarLuzOleo} aria-pressed={luzOleo}
                    className={`w-full min-h-[48px] flex items-center gap-3 px-3 rounded-xl border text-left text-sm ${luzOleo ? 'bg-red-50 border-red-400 text-red-900 font-semibold' : 'bg-gray-50 border-gray-300 text-gray-700'}`}>
                    <span className={`h-5 w-5 shrink-0 rounded border flex items-center justify-center ${luzOleo ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-gray-400'}`}>
                        {luzOleo && <CheckCircle className="h-4 w-4" />}
                    </span>
                    Luz de óleo acesa? {luzOleo && <span className="text-xs font-normal">(a foto da vareta passa a ser obrigatória)</span>}
                </button>
            )}

            {/* Câmera nativa, NUNCA galeria */}
            <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={aoEscolherArquivo} />

            <TireAssimModal slot={tireAssim} onClose={() => setTireAssim(null)}
                onAbrirCamera={() => tireAssim && abrirCamera(tireAssim.angulo)} />
        </div>
    );
};

export default ChecklistFotos;
