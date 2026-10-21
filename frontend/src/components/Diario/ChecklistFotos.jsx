import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Camera, Loader2, CheckCircle, AlertTriangle, RefreshCw, SkipForward, Zap } from 'lucide-react';
import { toast } from 'react-hot-toast';
import checklistVeiculoService, { urlImagem } from '../../services/checklistVeiculoService';
import { comprimirFoto } from '../../utils/comprimirFoto';
import TireAssimModal from './TireAssimModal';
import VisualizadorFotos from '../ChecklistVeiculo/VisualizadorFotos';
import {
    agruparSlots, fotoPrincipal, complementoDe, fotoResolvida, estadoDoQuadrinho, montarSlides, kmLidoDoPainel,
} from '../../utils/checklistFotos';

// Os grupos (Fora, Painel, Capô, Carga), a ordem e as dicas vêm do servidor (slot.grupo / dicaGrupo);
// utils/checklistFotos.js cai num mapa fixo quando o servidor não manda.

// Volta: sem a ordem "capô fechado / capô aberto" da saída
const TITULO_VOLTA = { FORA: 'Por fora', PAINEL: 'Painel (porta fechada, chave ligada)', CARGA: 'Baú / Porta-malas' };
const DICA_VOLTA = { FORA: 'Fotos de fora do veículo', CARGA: 'Abre o baú ou o porta-malas: tem que estar vazio e limpo' };

const TEXTO_FLASH = 'Pouca luz? Antes de bater a foto, toque no raio (⚡) da câmera e deixe em Automático ou Ligado. A IA não reprova foto por ser escura: se faltar algo, ela diz o que mostrar.';

/**
 * Grade de fotos do checklist de saída. Cria/recupera o rascunho do dia (idempotente),
 * sobe cada foto na hora e avisa o formulário pai pelo `onEstado`.
 *   config   = resposta de GET /veiculos/:id/checklist-config
 *   onEstado = ({ checklistId, faltam, luzOleoAcesa, kmLido, kmLidoRev }) => void
 *   onFalha  = () => void  (rascunho não pôde ser criado -> pai volta às caixinhas)
 */
const ChecklistFotos = ({ veiculoId, config, onEstado, onFalha, momento = 'SAIDA', diarioId = null, atrasada = false }) => {
    const ehVolta = momento === 'VOLTA';
    // rascunho: na volta vai amarrado ao diário (e `atrasada` quando é o dia anterior)
    const extraRascunho = ehVolta ? { momento: 'VOLTA', diarioId, ...(atrasada ? { atrasada: true } : {}) } : {};
    const [checklist, setChecklist] = useState(null); // { id, fotos, fotosPuladas, luzOleoAcesa, modo }
    const [envio, setEnvio] = useState({});            // { angulo: { fase, mensagem } }
    const [tireAssim, setTireAssim] = useState(null);
    const [vis, setVis] = useState(null);              // ângulo clicado ao abrir o visualizador
    const [avisoCapo, setAvisoCapo] = useState(null);  // slot do capô que o motorista tocou com o "fora" incompleto
    const [capoLiberado, setCapoLiberado] = useState(false);
    const inputRef = useRef(null);
    const anguloRef = useRef(null);
    const complementoRef = useRef(false);   // a próxima foto da câmera é a foto extra (água/óleo)?
    const arquivosRef = useRef({});   // arquivo já comprimido por ângulo (para "Tentar de novo")
    const previewsRef = useRef({});   // blob URLs de pré-visualização
    const onFalhaRef = useRef(onFalha);
    onFalhaRef.current = onFalha;

    const modoTeste = (checklist?.modo || config?.modo) === 'TESTE';

    // Cria (ou recupera) o rascunho ao escolher o veículo
    useEffect(() => {
        let cancelado = false;
        checklistVeiculoService.criarRascunho(veiculoId, extraRascunho)
            .then(r => { if (!cancelado) setChecklist(r); })
            .catch(err => {
                console.error('Checklist: falha ao criar rascunho', err);
                if (!cancelado) onFalhaRef.current?.();
            });
        return () => { cancelado = true; };
    }, [veiculoId, diarioId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => () => {
        Object.values(previewsRef.current).forEach(u => { try { URL.revokeObjectURL(u); } catch { /* */ } });
    }, []);

    const slots = useMemo(
        () => [...(config?.slots || [])].sort((a, b) => (a.ordem || 0) - (b.ordem || 0)),
        [config]
    );
    const grupos = useMemo(() => agruparSlots(slots), [slots]);
    const luzOleo = !!checklist?.luzOleoAcesa;

    const fotoDe = useCallback((angulo) => fotoPrincipal(checklist?.fotos, angulo), [checklist]);
    const puladaDe = useCallback(
        (angulo) => (checklist?.fotosPuladas || []).some(p => p.angulo === angulo),
        [checklist]
    );
    const obrigatorio = useCallback(
        (slot) => !!slot.obrigatorio || (slot.angulo === 'vareta_oleo' && luzOleo),
        [luzOleo]
    );
    const resolvido = useCallback((slot) => {
        return fotoResolvida(fotoDe(slot.angulo)) || puladaDe(slot.angulo);
    }, [fotoDe, puladaDe]);

    const faltam = checklist ? slots.filter(s => obrigatorio(s) && !resolvido(s)).length : slots.filter(s => s.obrigatorio).length;
    const kmPainel = kmLidoDoPainel(checklist?.fotos);
    const kmLido = kmPainel?.km ?? null;
    const kmLidoRev = kmPainel?.fotoId ?? null;

    useEffect(() => {
        if (checklist) onEstado?.({ checklistId: checklist.id, faltam, luzOleoAcesa: luzOleo, kmLido, kmLidoRev });
    }, [checklist?.id, faltam, luzOleo, kmLido, kmLidoRev]); // eslint-disable-line react-hooks/exhaustive-deps

    const limparPreview = (angulo) => {
        if (previewsRef.current[angulo]) {
            try { URL.revokeObjectURL(previewsRef.current[angulo]); } catch { /* */ }
            delete previewsRef.current[angulo];
        }
    };

    // chave do estado de envio: a foto extra (complemento) não mexe no quadrinho principal
    const chaveEnvio = (angulo, complemento) => (complemento ? `${angulo}:extra` : angulo);

    const enviar = async (angulo, arquivoNovo, complemento = false) => {
        if (!checklist) return;
        const chave = chaveEnvio(angulo, complemento);
        setEnvio(e => ({ ...e, [chave]: { fase: 'enviando' } }));
        try {
            if (arquivoNovo) {
                const arq = await comprimirFoto(arquivoNovo);
                arquivosRef.current[chave] = arq;
                if (!complemento) {
                    limparPreview(angulo);
                    previewsRef.current[angulo] = URL.createObjectURL(arq);
                }
            }
            const arq = arquivosRef.current[chave];
            if (!arq) throw new Error('sem arquivo');
            const r = await checklistVeiculoService.enviarFoto(checklist.id, angulo, arq, (ev) => {
                if (!complemento && ev.total && ev.loaded >= ev.total) {
                    setEnvio(e => (e[chave]?.fase === 'enviando' ? { ...e, [chave]: { fase: 'analisando' } } : e));
                }
            }, { complemento });
            setChecklist(c => {
                if (complemento) {
                    // troca só a foto extra; a principal e o veredito não mudam
                    const outras = (c.fotos || []).filter(f => !(f.angulo === angulo && f.complemento === true));
                    return { ...c, fotos: [...outras, { ...r.foto, complemento: true }] };
                }
                const outras = (c.fotos || []).filter(f => f.angulo !== angulo || f.complemento === true);
                // foto nova: sai também da lista de puladas
                return { ...c, fotos: [...outras, r.foto], fotosPuladas: (c.fotosPuladas || []).filter(p => p.angulo !== angulo) };
            });
            if (!complemento) limparPreview(angulo);
            delete arquivosRef.current[chave];
            setEnvio(e => { const n = { ...e }; delete n[chave]; return n; });
            if (complemento) toast.success('Foto extra enviada.');
        } catch (err) {
            const mensagem = err?.response?.data?.error || 'Não foi possível enviar a foto (sem sinal?).';
            if (complemento) {
                // opcional: nunca trava o dia nem ocupa o quadrinho
                delete arquivosRef.current[chave];
                setEnvio(e => { const n = { ...e }; delete n[chave]; return n; });
                toast.error(`Foto extra não enviada. ${mensagem}`);
            } else {
                setEnvio(e => ({ ...e, [chave]: { fase: 'erro', mensagem } }));
            }
        }
    };

    const abrirCamera = (angulo, complemento = false) => {
        anguloRef.current = angulo;
        complementoRef.current = complemento;
        setTireAssim(null);
        setVis(null);
        inputRef.current?.click(); // síncrono no toque do usuário
    };

    const aoEscolherArquivo = (e) => {
        const arquivo = e.target.files?.[0];
        e.target.value = '';
        const angulo = anguloRef.current;
        if (arquivo && angulo) enviar(angulo, arquivo, complementoRef.current);
    };

    // Se faltam fotos de FORA, o 1º toque no CAPÔ avisa (sem bloquear).
    const foraIncompleto = () => grupos
        .filter(g => g.grupo === 'FORA')
        .flatMap(g => g.slots)
        .filter(sl => obrigatorio(sl) && !resolvido(sl));

    const tocarSlot = (slot) => {
        const f = fotoDe(slot.angulo);
        if (f) return setVis(slot.angulo); // com foto (inclusive "Refazer"): abre o visualizador
        const grupoSlot = grupos.find(g => g.slots.some(sl => sl.angulo === slot.angulo))?.grupo;
        if (grupoSlot === 'CAPO' && !capoLiberado && foraIncompleto().length > 0) return setAvisoCapo(slot);
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

    // Troca a foto principal do ângulo pela versão que o servidor devolveu (resposta/aceite)
    const trocarFoto = (fotoNova) => {
        if (!fotoNova?.id) return false;
        setChecklist(c => ({
            ...c,
            fotos: (c.fotos || []).map(f => (f.id === fotoNova.id ? { ...f, ...fotoNova } : f)),
        }));
        return true;
    };
    const ressincronizar = async () => {
        try {
            const r = await checklistVeiculoService.criarRascunho(veiculoId, extraRascunho); // idempotente
            setChecklist(r);
        } catch { /* mantém o que já está na tela */ }
    };

    const travaAcaoRef = useRef(false); // dois toques no mesmo instante = 1 só POST
    const umaVez = async (fn) => {
        if (travaAcaoRef.current) return;
        travaAcaoRef.current = true;
        try { await fn(); } finally { travaAcaoRef.current = false; }
    };

    const acoesVisualizador = {
        modoTeste,
        onRefazer: (slide) => abrirCamera(slide.angulo, false),       // síncrono: câmera no mesmo toque
        onComplemento: (slide) => abrirCamera(slide.angulo, true),
        onResponder: (slide, indice, resposta) => umaVez(async () => {
            const r = await checklistVeiculoService.responder(checklist.id, { angulo: slide.angulo, indice, resposta });
            if (!trocarFoto(r?.foto)) await ressincronizar();
        }),
        onAceitar: (slide, desfazer) => umaVez(async () => {
            const r = await checklistVeiculoService.aceitar(checklist.id, slide.fotoId, desfazer);
            if (!trocarFoto(r?.foto)) await ressincronizar();
        }),
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
        const extraEnv = envio[chaveEnvio(slot.angulo, true)];
        const temExtra = !!complementoDe(checklist.fotos, slot.angulo);

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

        const est = estadoDoQuadrinho(foto, { envio: env, pulada });
        const ocupado = est.codigo === 'ENVIANDO';
        const imagem = previewsRef.current[slot.angulo] || (foto ? urlImagem(foto.url) : null);

        return (
            <div key={slot.angulo} className="min-w-0">
                <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => tocarSlot(slot)}
                    className={`relative w-full aspect-square rounded-xl border-2 overflow-hidden flex items-center justify-center ${est.moldura} disabled:cursor-wait`}
                    aria-label={`${slot.rotulo}${obrig ? ' (obrigatória)' : ''}${est.palavra ? `: ${est.palavra}` : ''}`}
                >
                    {imagem && <img src={imagem} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                    {ocupado && <Loader2 className="relative h-7 w-7 text-white animate-spin drop-shadow" />}
                    {est.camera && <Camera className="h-7 w-7 text-gray-500" />}
                    {est.palavra && (
                        <span className={`absolute bottom-0 inset-x-0 text-center text-[11px] font-bold py-1 px-1 leading-tight ${est.faixa}`}>
                            {est.palavra}
                        </span>
                    )}
                </button>
                <p className="mt-1 text-[11px] leading-tight font-semibold text-gray-700 text-center">
                    {slot.rotulo}{obrig ? ' *' : ''}
                </p>
                {foto?.serve === false && !foto.aceitaPeloMotorista && foto.motivoRefazer && (
                    <p className="mt-0.5 text-[10px] leading-tight text-red-700 text-center">{foto.motivoRefazer}</p>
                )}
                {extraEnv && <p className="mt-0.5 text-[10px] leading-tight text-gray-600 text-center">Enviando foto extra…</p>}
                {!extraEnv && temExtra && <p className="mt-0.5 text-[10px] leading-tight text-green-700 text-center">+ foto extra</p>}
            </div>
        );
    };

    const temVareta = slots.some(s => s.angulo === 'vareta_oleo');
    const grupoCompleto = (g) => g.slots.every(sl => !obrigatorio(sl) || resolvido(sl));
    const foraCompleto = grupos.filter(g => g.grupo === 'FORA').every(grupoCompleto);
    const capoCompleto = grupos.filter(g => g.grupo === 'CAPO').every(grupoCompleto);

    const secao = (g) => (
        <div key={g.grupo}>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-600">{ehVolta ? (TITULO_VOLTA[g.grupo] || g.titulo) : g.titulo}</p>
            {g.dica && <p className="text-xs text-gray-600 mt-0.5 mb-2">{ehVolta && DICA_VOLTA[g.grupo] && !g.slots.some(sl => sl.dicaGrupo) ? DICA_VOLTA[g.grupo] : g.dica}</p>}
            {g.grupo === 'CAPO' && foraCompleto && !capoCompleto && (
                <p className="mb-2 flex items-start gap-1.5 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" /> <span>As fotos de fora já estão feitas? Então pode abrir o capô.</span>
                </p>
            )}
            {g.grupo === 'CARGA' && capoCompleto && grupos.some(x => x.grupo === 'CAPO') && (
                <p className="mb-2 flex items-start gap-1.5 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" /> <span>Feche o capô antes das fotos do baú.</span>
                </p>
            )}
            <div className="grid grid-cols-3 gap-2">{g.slots.map(renderTile)}</div>
            {(g.grupo === 'FORA' || g.grupo === 'CAPO') && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2">
                    <Zap className="h-4 w-4 shrink-0 text-amber-500" /> <span>{TEXTO_FLASH}</span>
                </p>
            )}
        </div>
    );

    // Visualizador: só os ângulos que já têm foto, na ordem dos blocos
    const slidesVis = vis ? montarSlides(checklist.fotos, grupos.flatMap(g => g.slots), { editavel: true, modo: 'motorista' }) : [];
    const indiceVis = Math.max(0, slidesVis.findIndex(sl => sl.angulo === vis));

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

            {!ehVolta && !config?.temFotoModelo && (
                <p className="text-xs text-gray-600 flex items-start gap-1.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-gray-400" />
                    Este veículo ainda não tem foto modelo cadastrada. Siga a instrução escrita de cada foto.
                </p>
            )}

            {grupos.map(secao)}

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

            <TireAssimModal slot={tireAssim} tipoVareta={config?.tipoVareta} onClose={() => setTireAssim(null)}
                onAbrirCamera={() => tireAssim && abrirCamera(tireAssim.angulo, false)} />

            {avisoCapo && (
                <div className="fixed inset-0 z-[120] bg-black/60 flex items-end sm:items-center justify-center" onClick={() => setAvisoCapo(null)}>
                    <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
                        <p className="flex items-start gap-2 text-base font-bold text-gray-900">
                            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
                            Faltam fotos de fora. Tire antes de abrir o capô.
                        </p>
                        <p className="text-sm text-gray-600">Com o capô aberto o carro sai diferente nas fotos de fora. Se não der agora, pode abrir mesmo assim.</p>
                        <div className="flex flex-col gap-2">
                            <button type="button"
                                onClick={() => { const prox = foraIncompleto()[0]; setAvisoCapo(null); if (prox) setTireAssim(prox); }}
                                className="w-full min-h-[48px] bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm shadow-sm">
                                Tirar as de fora
                            </button>
                            <button type="button"
                                onClick={() => { const sl = avisoCapo; setCapoLiberado(true); setAvisoCapo(null); setTireAssim(sl); }}
                                className="w-full min-h-[48px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm">
                                Abrir mesmo assim
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {vis && slidesVis.length > 0 && (
                <VisualizadorFotos slides={slidesVis} indiceInicial={indiceVis} modo="motorista"
                    acoes={acoesVisualizador} onClose={() => setVis(null)} />
            )}
        </div>
    );
};

export default ChecklistFotos;
