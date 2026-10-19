import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Loader2, Printer, Check, AlertTriangle, Minus, Plus } from 'lucide-react';
import SelectBusca from '../../../components/SelectBusca';
import PreviewEtiquetaCozinha from './PreviewEtiquetaCozinha';
import {
    TAMANHOS_COZINHA, DIAS_EXTENSO, diaSemana, dmy, emojiDoItem, hojeIso, kgParaGramas, rotuloGrupo, somarDias, validadeSugerida,
} from './util';

const chipBase = 'min-h-[44px] px-4 py-2 rounded-full border text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors';
const chipOn = 'bg-mint border-primary text-primaryDark';
const chipOff = 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50';

function Campo({ titulo, dica, children }) {
    return (
        <div className="mb-4">
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <span className="text-sm font-bold text-gray-700">{titulo}</span>
                {dica && <span className="text-xs text-gray-600 text-right">{dica}</span>}
            </div>
            {children}
        </div>
    );
}

export default function GavetaEtiqueta({ item, equipe, impressoras, envio, onImprimir, onFechar }) {
    const novo = !!item.novo;
    const hoje = useMemo(() => hojeIso(), []);
    const [nomeLivre, setNomeLivre] = useState(item.nome || '');
    const [fabModo, setFabModo] = useState('hoje');
    const [fabOutra, setFabOutra] = useState(somarDias(hoje, -2));
    const [conservacao, setConservacao] = useState(item.ultimaConservacao === 'CONGELADO' ? 'CONGELADO' : 'REFRIGERADO');
    const sugInicial = validadeSugerida(item, item.ultimaConservacao === 'CONGELADO' ? 'CONGELADO' : 'REFRIGERADO');
    const [validadeDias, setValidadeDias] = useState(sugInicial);
    const [prazoOutro, setPrazoOutro] = useState('');
    const [pesoTxt, setPesoTxt] = useState('');
    const [qtd, setQtd] = useState(1);
    const [responsavelId, setResponsavelId] = useState(equipe[0] ? String(equipe[0].id) : '');
    const [tamanho, setTamanho] = useState(item.ultimoTamanho === '100x120' ? '100x120' : '40x25');
    const [impressoraId, setImpressoraId] = useState('');
    const nomeRef = useRef(null);

    const fase = envio.fase;
    const travado = fase !== 'ocioso';
    const fabricacao = fabModo === 'hoje' ? hoje : fabModo === 'ontem' ? somarDias(hoje, -1) : fabOutra;
    const sug = validadeSugerida(item, conservacao);
    const semPrazo = sug == null;
    const opcoes = semPrazo ? [3, 7, 30, 90] : [...new Set([sug, 1, 2, 3, 7, 30, 90])].sort((a, b) => a - b);
    const validade = validadeDias ? somarDias(fabricacao, validadeDias) : '';
    const pesoGramas = kgParaGramas(pesoTxt);
    const impDoTamanho = (impressoras || []).filter(i => i.tamanho === tamanho);
    const impressorasCarregadas = Array.isArray(impressoras);
    const semImpressora = impressorasCarregadas && impDoTamanho.length === 0;
    const precisaEscolherImp = impDoTamanho.length > 1;
    const respSelecionado = equipe.find(p => String(p.id) === String(responsavelId));
    const chipsEquipe = equipe.slice(0, 4);
    const nomeFinal = (novo ? nomeLivre : item.nome).trim();

    useEffect(() => { if (novo) nomeRef.current?.focus(); }, [novo]);
    useEffect(() => { if (!responsavelId && equipe[0]) setResponsavelId(String(equipe[0].id)); }, [equipe]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (impDoTamanho.length === 1) setImpressoraId(String(impDoTamanho[0].id));
        else if (!impDoTamanho.some(i => String(i.id) === impressoraId)) setImpressoraId('');
    }, [tamanho, impressoras]); // eslint-disable-line react-hooks/exhaustive-deps

    const trocarConservacao = (c) => {
        setConservacao(c);
        setValidadeDias(validadeSugerida(item, c));
        setPrazoOutro('');
    };

    const escolherPrazo = (n) => { setValidadeDias(n); setPrazoOutro(''); };
    const digitarPrazo = (v) => {
        const limpo = v.replace(/\D/g, '').slice(0, 3);
        setPrazoOutro(limpo);
        const n = parseInt(limpo, 10);
        setValidadeDias(n >= 1 && n <= 730 ? n : null);
    };

    const problemas = [];
    if (!nomeFinal) problemas.push('Digite o nome do item.');
    if (!validadeDias) problemas.push('Escolha a validade.');
    if (fabricacao < somarDias(hoje, -7) || fabricacao > hoje) problemas.unshift(`Data de fabricação: escolha de ${dmy(somarDias(hoje, -7))} até hoje (${dmy(hoje)}).`);
    if (!responsavelId) problemas.push('Escolha quem fez.');
    if (semImpressora) problemas.push(`Nenhuma impressora ativa para ${TAMANHOS_COZINHA[tamanho].curto}.`);
    if (precisaEscolherImp && !impressoraId) problemas.push('Escolha a impressora.');
    const podeImprimir = problemas.length === 0 && fase === 'ocioso';

    const imprimir = () => {
        if (!podeImprimir) return;
        const payload = {
            ...(novo ? { nomeLivre: nomeFinal } : { itemPcpId: item.id }),
            fabricacao,
            conservacao,
            validadeDias,
            ...(pesoGramas ? { pesoGramas } : {}),
            quantidade: qtd,
            tamanho,
            ...(impressoraId ? { impressoraId } : {}),
            responsavelId: respSelecionado ? respSelecionado.id : responsavelId,
        };
        onImprimir(payload, nomeFinal);
    };

    const subtitulo = novo
        ? 'Item novo · fica salvo em "Outros"'
        : [rotuloGrupo(item.grupoCozinha) || 'Item', sug ? `validade sugerida ${sug} dias ${conservacao === 'CONGELADO' ? 'congelado' : 'refrigerado'}` : 'sem validade cadastrada'].join(' · ');

    return (
        <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-black/40" onClick={() => (fase === 'enviando' ? null : onFechar())} role="dialog" aria-modal="true" aria-label="Imprimir etiqueta">
            <div className="bg-white w-full md:max-w-3xl rounded-t-3xl md:rounded-2xl max-h-[94dvh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="px-4 pt-2.5 pb-2 border-b border-gray-100">
                    <div className="mx-auto h-1 w-10 rounded-full bg-gray-300 mb-2.5 md:hidden" />
                    <div className="flex items-center gap-3">
                        <span className="text-3xl leading-none" aria-hidden="true">{novo ? '✏️' : emojiDoItem(item)}</span>
                        <div className="min-w-0 flex-1">
                            {novo ? (
                                <input
                                    ref={nomeRef}
                                    value={nomeLivre}
                                    onChange={e => setNomeLivre(e.target.value.slice(0, 60))}
                                    disabled={travado}
                                    placeholder="Nome do item (ex.: Cebola caramelizada)"
                                    className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 text-base font-bold focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                />
                            ) : (
                                <h2 className="text-lg font-extrabold text-gray-900 leading-tight break-words">{item.nome}</h2>
                            )}
                            <p className="text-xs text-gray-600 mt-0.5">{subtitulo}</p>
                        </div>
                        <button type="button" onClick={onFechar} disabled={fase === 'enviando'} aria-label="Fechar" className="h-11 w-11 shrink-0 rounded-full bg-gray-100 hover:bg-gray-200 inline-flex items-center justify-center disabled:opacity-40">
                            <X className="h-5 w-5 text-gray-700" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto">
                <fieldset disabled={travado} className="px-4 pt-4 pb-2 min-w-0 border-0 m-0">
                    <div className="md:grid md:grid-cols-[minmax(0,1fr)_270px] md:gap-6">
                        <div className="min-w-0">
                            <Campo titulo="Fabricação" dica={`${DIAS_EXTENSO[diaSemana(fabricacao)]} · ${dmy(fabricacao)}`}>
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" onClick={() => setFabModo('hoje')} className={`${chipBase} ${fabModo === 'hoje' ? chipOn : chipOff}`}>Hoje</button>
                                    <button type="button" onClick={() => setFabModo('ontem')} className={`${chipBase} ${fabModo === 'ontem' ? chipOn : chipOff}`}>Ontem</button>
                                    <button type="button" onClick={() => setFabModo('outra')} className={`${chipBase} ${fabModo === 'outra' ? chipOn : chipOff}`}>Outra data</button>
                                </div>
                                {fabModo === 'outra' && (
                                    <input
                                        type="date"
                                        value={fabOutra}
                                        min={somarDias(hoje, -7)}
                                        max={hoje}
                                        onChange={e => { if (e.target.value) setFabOutra(e.target.value); }}
                                        className="mt-2 min-h-[44px] border border-gray-300 rounded-lg px-3 text-sm font-bold focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                    />
                                )}
                            </Campo>

                            <Campo titulo="Conservação" dica="muda a validade sugerida">
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" onClick={() => trocarConservacao('REFRIGERADO')} className={`${chipBase} ${conservacao === 'REFRIGERADO' ? chipOn : chipOff}`}>❄️ Refrigerado 0–4 °C</button>
                                    <button type="button" onClick={() => trocarConservacao('CONGELADO')} className={`${chipBase} ${conservacao === 'CONGELADO' ? chipOn : chipOff}`}>🧊 Congelado −18 °C</button>
                                </div>
                            </Campo>

                            <Campo titulo="Validade" dica={validade ? `vence ${DIAS_EXTENSO[diaSemana(validade)]}, ${dmy(validade)}${!semPrazo && validadeDias !== sug ? ' · alterada' : ''}` : ''}>
                                {semPrazo && (
                                    <p className="mb-2 text-sm font-semibold text-amber-700 flex items-center gap-1.5">
                                        <AlertTriangle className="h-4 w-4 shrink-0" /> Defina a validade: este item não tem prazo cadastrado.
                                    </p>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    {opcoes.map(n => (
                                        <button key={n} type="button" onClick={() => escolherPrazo(n)}
                                            className={`${chipBase} ${validadeDias === n && !prazoOutro ? chipOn : chipOff} ${n === sug ? 'border-dashed' : ''}`}>
                                            {n} d{n === sug ? ' · sugerida' : ''}
                                        </button>
                                    ))}
                                    <input
                                        inputMode="numeric"
                                        value={prazoOutro}
                                        onChange={e => digitarPrazo(e.target.value)}
                                        placeholder="outro (dias)"
                                        aria-label="Outro prazo em dias"
                                        className="w-32 min-h-[44px] border border-gray-300 rounded-full px-4 text-sm font-bold focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                    />
                                </div>
                            </Campo>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                                <Campo titulo="Peso" dica="opcional">
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        {[1, 2, 5].map(k => (
                                            <button key={k} type="button" onClick={() => setPesoTxt(String(k))} className={`${chipBase} ${pesoTxt === String(k) ? chipOn : chipOff}`}>{k} kg</button>
                                        ))}
                                    </div>
                                    <input
                                        inputMode="decimal"
                                        value={pesoTxt}
                                        onChange={e => setPesoTxt(e.target.value.replace(/[^\d.,]/g, '').slice(0, 7))}
                                        placeholder="kg (ex.: 2,5)"
                                        aria-label="Peso em quilos"
                                        className="w-full min-h-[44px] border border-gray-300 rounded-lg px-3 text-base font-bold focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                    />
                                </Campo>

                                <Campo titulo="Quantas etiquetas">
                                    <div className="flex items-center border border-gray-300 rounded-full h-12 overflow-hidden">
                                        <button type="button" onClick={() => setQtd(q => Math.max(1, q - 1))} aria-label="Menos uma" className="w-14 h-full bg-gray-50 hover:bg-gray-100 inline-flex items-center justify-center"><Minus className="h-5 w-5" /></button>
                                        <input
                                            inputMode="numeric"
                                            value={qtd}
                                            onChange={e => { const n = parseInt(e.target.value.replace(/\D/g, ''), 10); setQtd(Number.isFinite(n) ? Math.min(200, Math.max(1, n)) : 1); }}
                                            aria-label="Quantidade de etiquetas"
                                            className="flex-1 min-w-0 text-center font-extrabold text-lg focus:outline-none"
                                        />
                                        <button type="button" onClick={() => setQtd(q => Math.min(200, q + 1))} aria-label="Mais uma" className="w-14 h-full bg-gray-50 hover:bg-gray-100 inline-flex items-center justify-center"><Plus className="h-5 w-5" /></button>
                                    </div>
                                    {tamanho === '40x25' && qtd % 2 === 1 && qtd > 1 && (
                                        <p className="text-xs text-gray-600 mt-1.5">Sai em 2 colunas: a última etiqueta sai sozinha.</p>
                                    )}
                                </Campo>
                            </div>

                            <Campo titulo="Responsável" dica={respSelecionado ? '' : 'quem fez'}>
                                <div className="flex flex-wrap gap-2">
                                    {chipsEquipe.map(p => (
                                        <button key={p.id} type="button" onClick={() => setResponsavelId(String(p.id))} className={`${chipBase} ${String(responsavelId) === String(p.id) ? chipOn : chipOff}`}>{p.nome}</button>
                                    ))}
                                </div>
                                {equipe.length > chipsEquipe.length && (
                                    <div className="mt-2">
                                        <SelectBusca value={chipsEquipe.some(p => String(p.id) === String(responsavelId)) ? '' : responsavelId} onChange={e => e.target.value && setResponsavelId(e.target.value)} className="w-full">
                                            <option value="">Outra pessoa…</option>
                                            {equipe.map(p => <option key={p.id} value={String(p.id)}>{p.nome}</option>)}
                                        </SelectBusca>
                                    </div>
                                )}
                            </Campo>

                            <Campo titulo="Impressora / tamanho">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {Object.values(TAMANHOS_COZINHA).map(t => {
                                        const sem = impressorasCarregadas && !impressoras.some(i => i.tamanho === t.id);
                                        return (
                                            <button key={t.id} type="button" onClick={() => setTamanho(t.id)}
                                                className={`text-left rounded-2xl border-2 p-3 min-h-[64px] ${tamanho === t.id ? 'border-primary bg-mint' : 'border-gray-200 bg-white'} ${sem ? 'opacity-60' : ''}`}>
                                                <b className="block text-sm text-gray-900">🖨️ {t.titulo}</b>
                                                <small className="text-xs text-gray-600">{sem ? 'Sem impressora ativa' : t.sub}</small>
                                            </button>
                                        );
                                    })}
                                </div>
                                {precisaEscolherImp && (
                                    <div className="mt-2">
                                        <SelectBusca value={impressoraId} onChange={e => setImpressoraId(e.target.value)} className="w-full">
                                            <option value="">Escolha a impressora…</option>
                                            {impDoTamanho.map(i => <option key={i.id} value={String(i.id)}>{i.nome}</option>)}
                                        </SelectBusca>
                                    </div>
                                )}
                            </Campo>
                        </div>

                        <div className="mb-4 md:mb-0 md:sticky md:top-0 self-start">
                            <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Prévia</p>
                            <div className="flex justify-center bg-gray-50 border border-gray-200 rounded-xl p-3 overflow-hidden">
                                <PreviewEtiquetaCozinha
                                    tamanho={tamanho}
                                    nome={nomeFinal}
                                    fabricacao={fabricacao}
                                    validade={validade}
                                    conservacao={conservacao}
                                    pesoGramas={pesoGramas}
                                    lote={envio.lote?.lote}
                                    responsavel={respSelecionado?.nome}
                                />
                            </div>
                            <p className="text-xs text-gray-600 mt-2">A prévia é só uma ideia do visual. O lote é definido ao imprimir.</p>
                        </div>
                    </div>
                </fieldset>
                </div>

                <div className="border-t border-gray-100 px-4 pt-3 pb-4 bg-white rounded-b-2xl">
                    <EstadoEnvio envio={envio} />
                    {fase === 'ocioso' && problemas.length > 0 && (
                        <p className="text-xs font-semibold text-amber-700 mb-2">{problemas[0]}</p>
                    )}
                    {fase === 'erro' ? (
                        <div className="flex flex-col sm:flex-row gap-2">
                            {!envio.semRetentativa && (
                                <button type="button" onClick={envio.tentarDeNovo} className="flex-1 min-h-[52px] rounded-full bg-primary hover:bg-primaryDark text-white font-extrabold text-base inline-flex items-center justify-center gap-2">
                                    <Printer className="h-5 w-5" /> Tentar de novo
                                </button>
                            )}
                            <button type="button" onClick={envio.limpar} className={envio.semRetentativa ? 'flex-1 min-h-[52px] rounded-full bg-primary hover:bg-primaryDark text-white font-extrabold text-base' : 'min-h-[52px] px-5 rounded-full bg-white border border-gray-300 text-gray-700 font-semibold text-sm'}>Voltar e editar</button>
                        </div>
                    ) : fase === 'ocioso' ? (
                        <button type="button" onClick={imprimir} disabled={!podeImprimir}
                            className="w-full min-h-[52px] rounded-full bg-primary hover:bg-primaryDark text-white font-extrabold text-base shadow-sm inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:bg-primary">
                            <Printer className="h-5 w-5" /> Imprimir {qtd} etiqueta{qtd > 1 ? 's' : ''}
                        </button>
                    ) : (
                        <button type="button" onClick={onFechar} disabled={fase === 'enviando'}
                            className="w-full min-h-[52px] rounded-full bg-white border border-gray-300 text-gray-700 font-semibold text-sm disabled:opacity-50">
                            {fase === 'saiu' ? 'Fechar' : 'Fechar (continua tentando em segundo plano)'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

function EstadoEnvio({ envio }) {
    const { fase, info, erro, lote } = envio;
    if (fase === 'ocioso') return null;
    const base = 'mb-2 rounded-xl px-3 py-2.5 text-sm font-semibold flex items-start gap-2';
    if (fase === 'erro') {
        return <div className={`${base} bg-red-50 text-red-700 border border-red-200`} role="alert"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /><span>{erro}</span></div>;
    }
    if (fase === 'saiu') {
        return <div className={`${base} bg-green-50 text-green-800 border border-green-200`} role="status"><Check className="h-4 w-4 mt-0.5 shrink-0" /><span>Saiu da impressora{lote?.lote ? ` · lote ${lote.lote}` : ''}.</span></div>;
    }
    if (fase === 'enviando') {
        return <div className={`${base} bg-gray-50 text-gray-700 border border-gray-200`} role="status"><Loader2 className="h-4 w-4 mt-0.5 shrink-0 animate-spin" /><span>Enviando…</span></div>;
    }
    if (fase === 'imprimindo') {
        return <div className={`${base} bg-mint/60 text-primaryDark border border-primary/30`} role="status"><Loader2 className="h-4 w-4 mt-0.5 shrink-0 animate-spin" /><span>Imprimindo…{lote?.lote ? ` lote ${lote.lote}` : ''}</span></div>;
    }
    // fila
    const offline = info.agenteOffline;
    return (
        <div className={`${base} ${offline ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-gray-50 text-gray-700 border border-gray-200'}`} role="status">
            {offline ? <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> : <Loader2 className="h-4 w-4 mt-0.5 shrink-0 animate-spin" />}
            <span>
                {offline
                    ? 'O computador da cozinha não responde. A etiqueta fica na fila por 15 minutos e sai quando ele voltar.'
                    : info.tentandoDeNovo ? 'A impressora deu problema, tentando de novo…' : 'Na fila, já vai sair…'}
                {lote?.lote ? ` (lote ${lote.lote})` : ''}
                {info.semRede ? ' · Sem conexão para acompanhar; veja em "Hoje na cozinha".' : ''}
            </span>
        </div>
    );
}
