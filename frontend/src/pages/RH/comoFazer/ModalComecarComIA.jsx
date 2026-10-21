import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Loader2, Mic, Square, Sparkles, RotateCcw, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import comoFazerService, { mensagemErro, TIPOS } from '../../../services/comoFazerService';
import iaService, { montarStream, registrarResultado, mensagemDeErroIa } from '../../../services/comoFazerIaService';
import { useDitado } from '../../../components/ComoFazer/ditado';
import PreviaIA from './PreviaIA';

const CAMPO = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none';
const btnPrim = 'min-h-[48px] px-5 rounded-full bg-primary hover:bg-primaryDark text-white font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50';
const btnSec = 'min-h-[48px] px-5 rounded-full bg-white border border-gray-300 text-gray-800 font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50';
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function contarPassos(bruto) { return (bruto.match(/"texto"\s*:/g) || []).length; }

/**
 * "Conte para a IA" → "Montando…" → prévia → "Usar este rascunho".
 *  modo 'novo'  : o conteúdo AINDA NÃO existe — só é criado no "Usar" (criarDados = o que o ModalNovo já preencheu).
 *  modo 'vazio' : o conteúdo existe e não tem passos — "Usar" entrega o doc ao editor (onAplicar), pela fila do autosave.
 */
export default function ModalComecarComIA({ modo, contexto, criarDados, conteudoId, onCriado, onAplicar, onFechar }) {
    const { tipo, titulo, setor, setorNome } = contexto;
    const [fase, setFase] = useState('form');          // form | montando | previa
    const [pedido, setPedido] = useState('');
    const [cargos, setCargos] = useState('');
    const [tamanho, setTamanho] = useState('completo');
    const [item, setItem] = useState(null);            // { id, nome, tipo }
    const [busca, setBusca] = useState('');
    const [achados, setAchados] = useState([]);
    const [buscando, setBuscando] = useState(false);
    const [erro, setErro] = useState('');
    const [podeEmBranco, setPodeEmBranco] = useState(false);
    const [info, setInfo] = useState(null);            // inicio {usoId, modelo, provedor}
    const [bruto, setBruto] = useState('');
    const [seg, setSeg] = useState(0);
    const [previa, setPrevia] = useState(null);        // fim {usoId, doc, avisos, erros, resumo}
    const [pedirDif, setPedirDif] = useState(false);
    const [observacao, setObservacao] = useState('');
    const [usando, setUsando] = useState(false);
    const [erroUsar, setErroUsar] = useState('');
    const [criadoId, setCriadoId] = useState('');
    const ctrl = useRef(null);
    const ocupado = useRef(false);   // trava de duplo clique
    const t0 = useRef(0);
    const { suporta, ouvindo, alternar, parar } = useDitado(pedido, useCallback((v) => setPedido(String(v).slice(0, 4000)), []));

    // cronômetro da montagem
    useEffect(() => {
        if (fase !== 'montando') return undefined;
        const i = setInterval(() => setSeg(Math.floor((Date.now() - t0.current) / 1000)), 500);
        return () => clearInterval(i);
    }, [fase]);
    // fechar/sair com montagem em andamento = cancelar (servidor marca CANCELADO)
    useEffect(() => () => { try { ctrl.current?.abort(); } catch { /* nada */ } }, []);

    // busca do item PCP (opcional), com espera de 300 ms
    useEffect(() => {
        const q = busca.trim();
        if (q.length < 2) { setAchados([]); return undefined; }
        let vivo = true;
        const t = setTimeout(() => {
            setBuscando(true);
            iaService.itensPcp(q).then((r) => { if (vivo) setAchados(Array.isArray(r?.itens) ? r.itens : []); })
                .catch(() => { if (vivo) setAchados([]); })
                .finally(() => { if (vivo) setBuscando(false); });
        }, 300);
        return () => { vivo = false; clearTimeout(t); };
    }, [busca]);

    const pedidoOk = pedido.trim().length >= 10;
    const faltaSetor = !setor;
    const faltaTitulo = !String(titulo || '').trim();

    const montar = useCallback(async (extra = null) => {
        if (ocupado.current) return;
        ocupado.current = true;
        parar();
        setErro(''); setPodeEmBranco(false); setBruto(''); setSeg(0); setInfo(null);
        t0.current = Date.now();
        setFase('montando');
        const corpo = {
            tipo, setor, titulo: String(titulo).trim(), pedido: pedido.trim(), tamanho,
            ...(item ? { itemPcpId: item.id } : {}),
            ...(cargos.trim() ? { cargos: cargos.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 5) } : {}),
            ...(extra || {}),
        };
        const c = new AbortController();
        ctrl.current = c;
        let fim = null; let erroEvt = null; let acumulado = '';
        try {
            const desfecho = await montarStream({
                corpo, signal: c.signal,
                onEvento: (nome, d) => {
                    if (nome === 'inicio') setInfo(d);
                    else if (nome === 'texto') { acumulado += d?.delta || ''; setBruto(acumulado); }
                    else if (nome === 'fim') fim = d;
                    else if (nome === 'erro') erroEvt = d;
                },
            });
            if (desfecho === 'fim' && fim?.doc) { setPrevia(fim); setPedirDif(false); setObservacao(''); setFase('previa'); }
            else if (desfecho === 'cancelado') { setFase('form'); }
            else if (desfecho === 'erro') { setErro(mensagemDeErroIa(erroEvt || {})); setPodeEmBranco(true); setFase('form'); }
            else { setErro('A conexão caiu antes de a IA terminar. Seus dados continuam aqui — toque em “Montar de novo”.'); setPodeEmBranco(true); setFase('form'); }
        } catch (e) {
            setErro(mensagemDeErroIa(e)); setPodeEmBranco(true); setFase('form');
        } finally {
            ocupado.current = false;
            ctrl.current = null;
        }
    }, [tipo, setor, titulo, pedido, tamanho, item, cargos, parar]);

    const cancelar = () => { try { ctrl.current?.abort(); } catch { /* nada */ } };

    const descartarEVoltar = () => {
        registrarResultado(previa?.usoId, 'DESCARTADO');
        setPrevia(null); setFase('form');
    };

    const pedirDiferente = () => {
        if (observacao.trim().length < 3) { toast.error('Diga o que mudar (pelo menos 3 letras).'); return; }
        registrarResultado(previa.usoId, 'DESCARTADO');   // a versão anterior é substituída
        const { ia, ...semIaCampo } = previa.doc || {};   // eslint-disable-line no-unused-vars
        montar({ rascunhoAnterior: semIaCampo, observacao: observacao.trim().slice(0, 500) });
    };

    const docComIa = () => ({
        ...previa.doc,
        ia: { origem: 'IA', usoId: previa.usoId, modelo: info?.modelo || '', em: new Date().toISOString() },
    });

    const usar = async () => {
        if (usando || !previa) return;
        setUsando(true); setErroUsar('');
        const doc = docComIa();
        if (modo === 'vazio') {
            onAplicar(doc);
            registrarResultado(previa.usoId, 'USADO', conteudoId);
            toast.success('Rascunho da IA colocado no editor. Confira cada passo.');
            onFechar();
            return;
        }
        let id = criadoId;
        try {
            if (!id) { const r = await comoFazerService.criar(criarDados); id = r.id; setCriadoId(id); }
        } catch (e) { setErroUsar(mensagemErro(e)); setUsando(false); return; }
        try { await comoFazerService.salvarRascunho(id, doc); }   // retry só do PUT: o conteúdo já existe
        catch (e) { setErroUsar(`O conteúdo foi criado, mas não consegui guardar o rascunho da IA (${mensagemErro(e)}). Toque em “Tentar de novo”.`); setUsando(false); return; }
        registrarResultado(previa.usoId, 'USADO', id);
        onCriado(id);
    };

    const fechar = () => { cancelar(); parar(); onFechar(); };
    const tp = TIPOS[tipo];
    const nPassos = contarPassos(bruto);

    return (
        <div className="fixed inset-0 z-[9100] bg-black/60 flex items-end md:items-center justify-center p-0 md:p-4">
            <div className="bg-white w-full md:max-w-2xl rounded-t-2xl md:rounded-2xl shadow-xl max-h-[95vh] flex flex-col">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                    <span className="h-9 w-9 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center shrink-0"><Sparkles className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                        <p className="text-base font-bold text-gray-900 truncate">
                            {fase === 'form' && 'Conte para a IA'}
                            {fase === 'montando' && `Montando o POP de ${titulo}…`}
                            {fase === 'previa' && `Rascunho sugerido: ${titulo}`}
                        </p>
                        <p className="text-xs text-gray-600 truncate">
                            {fase === 'form' && 'Ela monta o rascunho; você ajusta depois'}
                            {fase === 'montando' && `${info ? `${info.provedor === 'openai' ? 'ChatGPT' : info.provedor} (${info.modelo}) · ` : ''}${setorNome || ''} · ${tp?.rotulo || ''}`}
                            {fase === 'previa' && `${tp?.rotulo || ''} · ${setorNome || ''} · ${previa?.resumo?.passos ?? ''} passos em ${previa?.resumo?.secoes ?? ''} blocos${previa?.resumo?.segundos != null ? ` · feito em ${previa.resumo.segundos} s` : ''}`}
                        </p>
                    </div>
                    <button type="button" onClick={fechar} aria-label="Fechar" className="p-2 min-h-[44px] min-w-[44px] text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 inline-flex items-center justify-center"><X className="h-5 w-5" /></button>
                </div>

                <div className="p-4 space-y-3 overflow-y-auto overflow-x-hidden flex-1">
                    {fase === 'form' && (
                        <>
                            {erro && (
                                <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-semibold p-3 break-words" role="alert">{erro}</div>
                            )}
                            <div className="flex flex-wrap gap-1.5 text-xs">
                                <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 font-semibold">{tp?.icone} {tp?.rotulo}</span>
                                <span className={`px-2 py-1 rounded-full font-semibold ${faltaSetor ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>{faltaSetor ? 'Sem setor' : setorNome || setor}</span>
                                <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 font-semibold break-all">{titulo || 'Sem título'}</span>
                            </div>
                            {(faltaSetor || faltaTitulo) && <p className="text-sm text-red-700 font-semibold">{faltaTitulo ? 'Dê um nome ao conteúdo antes.' : 'Escolha um setor antes.'}</p>}
                            <div>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-gray-700">O que você quer ensinar? <span className="text-gray-500 font-normal">({pedido.trim().length < 10 ? `mín. 10 letras` : `${pedido.length}`}/4000)</span></span>
                                    {suporta && (
                                        <button type="button" onClick={alternar} aria-pressed={ouvindo}
                                            className={`min-h-[44px] px-4 rounded-full text-sm font-semibold inline-flex items-center gap-2 border ${ouvindo ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-primary text-primary'}`}>
                                            {ouvindo ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />} {ouvindo ? 'Parar' : 'Falar'}
                                        </button>
                                    )}
                                </div>
                                <textarea value={pedido} onChange={(e) => setPedido(e.target.value.slice(0, 4000))} rows={6}
                                    placeholder="Ex.: Como ligar a fritadeira, esperar o óleo esquentar, fritar sem encher o cesto e limpar no fim do dia. O pessoal se queima tirando o cesto rápido."
                                    className={`${CAMPO} mt-1`} />
                                {ouvindo && <p className="text-xs text-red-700 font-semibold mt-1">Ouvindo… fale com calma. Toque em Parar quando terminar.</p>}
                            </div>
                            <div>
                                <span className="text-sm font-medium text-gray-700">Produto / item relacionado (opcional)</span>
                                {item ? (
                                    <div className="mt-1 flex items-center gap-2 rounded-lg border border-primary bg-mint/40 px-3 py-2 text-sm">
                                        <span className="flex-1 min-w-0 break-words font-semibold text-gray-900">{item.nome}</span>
                                        <button type="button" onClick={() => setItem(null)} aria-label="Tirar item" className="p-2 min-h-[44px] min-w-[44px] text-gray-600 inline-flex items-center justify-center"><X className="h-4 w-4" /></button>
                                    </div>
                                ) : (
                                    <>
                                        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no cadastro do PCP (ex.: fritadeira)" className={`${CAMPO} mt-1`} />
                                        {buscando && <p className="text-xs text-gray-500 mt-1">Buscando…</p>}
                                        {achados.length > 0 && (
                                            <div className="mt-1 rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-44 overflow-y-auto">
                                                {achados.map((a) => (
                                                    <button key={a.id} type="button" onClick={() => { setItem(a); setBusca(''); setAchados([]); }} className="w-full text-left px-3 min-h-[44px] text-sm hover:bg-gray-50 break-words">
                                                        {a.nome} <span className="text-xs text-gray-500">· {a.tipo}{a.unidade ? ` · ${a.unidade}` : ''}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                            <label className="block"><span className="text-sm font-medium text-gray-700">Quem executa (opcional, separe por vírgula)</span>
                                <input value={cargos} onChange={(e) => setCargos(e.target.value)} placeholder="Ex.: Auxiliar de produção" className={`${CAMPO} mt-1`} /></label>
                            <div>
                                <span className="text-sm font-medium text-gray-700">Tamanho</span>
                                <div className="mt-1 grid grid-cols-2 gap-2">
                                    {[['completo', 'Completo', '8 a 15 passos'], ['curto', 'Curto', 'até 6 passos']].map(([v, r, d]) => (
                                        <button key={v} type="button" onClick={() => setTamanho(v)} aria-pressed={tamanho === v}
                                            className={`min-h-[52px] rounded-xl border text-sm font-semibold px-2 ${tamanho === v ? 'bg-mint/60 border-primary text-primaryDark' : 'bg-white border-gray-300 text-gray-700'}`}>
                                            {r}<span className="block text-xs font-normal text-gray-600">{d}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {fase === 'montando' && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-3 rounded-xl bg-violet-50 border border-violet-200 p-3">
                                <Loader2 className="h-6 w-6 animate-spin text-violet-700 shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-violet-900">{nPassos > 0 ? `Escrevendo… ${nPassos} ${nPassos === 1 ? 'passo' : 'passos'}` : 'Pensando… isso leva de 10 a 30 segundos'}</p>
                                    <p className="text-xs text-violet-800">Nada foi salvo ainda. Você pode cancelar.</p>
                                </div>
                                <span className="text-lg font-extrabold text-violet-900 tabular-nums" aria-label="tempo">{mmss(seg)}</span>
                            </div>
                            {bruto && (
                                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 font-mono break-all max-h-48 overflow-hidden" aria-live="off">
                                    …{bruto.slice(-300)}
                                </div>
                            )}
                        </div>
                    )}

                    {fase === 'previa' && previa && (
                        <>
                            <PreviaIA doc={previa.doc} avisos={previa.avisos || []} erros={previa.erros || []} />
                            {pedirDif && (
                                <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 space-y-2">
                                    <span className="text-sm font-semibold text-violet-900">↻ Pedir diferente — o que mudar?</span>
                                    <textarea value={observacao} onChange={(e) => setObservacao(e.target.value.slice(0, 500))} rows={3} className={CAMPO}
                                        placeholder="ex.: mais curto · fale do termômetro · coloque um passo para trocar o óleo" />
                                </div>
                            )}
                            {erroUsar && <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-semibold p-3 break-words" role="alert">{erroUsar}</div>}
                        </>
                    )}
                </div>

                <div className="px-4 py-3 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end bg-white rounded-b-2xl">
                    {fase === 'form' && (
                        <>
                            {podeEmBranco && <button type="button" onClick={onFechar} className={btnSec}>Começar em branco</button>}
                            {!podeEmBranco && <button type="button" onClick={fechar} className={btnSec}>Cancelar</button>}
                            <button type="button" onClick={() => montar()} disabled={!pedidoOk || faltaSetor || faltaTitulo} className={btnPrim}>
                                <Sparkles className="h-4 w-4" /> {erro ? 'Montar de novo' : 'Montar o POP'}
                            </button>
                        </>
                    )}
                    {fase === 'montando' && <button type="button" onClick={cancelar} className={btnSec}>Cancelar</button>}
                    {fase === 'previa' && (
                        <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 sm:justify-end w-full">
                            <button type="button" onClick={usar} disabled={usando} className={`${btnPrim} col-span-2 sm:order-3`}>
                                {usando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {erroUsar ? 'Tentar de novo' : 'Usar este rascunho'}
                            </button>
                            {pedirDif
                                ? <button type="button" onClick={pedirDiferente} disabled={usando || observacao.trim().length < 3} className={`${btnSec} sm:order-2`}><RotateCcw className="h-4 w-4" /> Enviar pedido</button>
                                : <button type="button" onClick={() => setPedirDif(true)} disabled={usando} className={`${btnSec} sm:order-2`}><RotateCcw className="h-4 w-4" /> Pedir diferente</button>}
                            <button type="button" onClick={descartarEVoltar} disabled={usando} className={`${btnSec} sm:order-1`}>Cancelar</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
