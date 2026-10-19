import { useCallback, useEffect, useState } from 'react';
import { History, MapPin, RotateCcw, X, Loader2, AlertTriangle, ChevronDown, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import clienteService from '../../services/clienteService';
import gpsClientesService from '../../services/gpsClientesService';
import SelectBusca from '../SelectBusca';
import {
    formatarDataHora, formatarData, telaDaOrigem, resumoMudanca, linhaEndereco, distanciaMetros, formatarDistancia,
} from '../../utils/gpsQuemAtualizou';

// ─────────────────────────────────────────────────────────────────────────────
// Histórico do ENDEREÇO do cliente (texto + ponto no mapa): quem mudou, quando,
// e cada versão antiga com "Ver no mapa" e "Restaurar".
// O mapa em si fica em QualidadeGps (card Localização); este componente só avisa
// qual versão foi escolhida via `onVerNoMapa(versao | null)`.
// `compacto`: só as 2 últimas, sem botões, com link "ver todas" (aba Cadastro).
// ─────────────────────────────────────────────────────────────────────────────

const parseLatLng = (s) => {
    if (!s) return null;
    const [lat, lng] = String(s).split(',').map(x => parseFloat(String(x).trim()));
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng };
};

const TIPO_SELO = {
    RESTAURACAO: { txt: 'Restauração', classe: 'bg-blue-100 text-blue-800' },
    CRIACAO: { txt: 'Cadastro novo', classe: 'bg-green-100 text-green-800' },
    SISTEMA: { txt: 'Sem autor registrado', classe: 'bg-gray-100 text-gray-700' },
    MUDANCA_GPS: { txt: 'Só o ponto (registro antigo)', classe: 'bg-gray-100 text-gray-700' },
};
const STATUS_SELO = {
    DESFEITO: { txt: 'Desfeito', classe: 'bg-gray-100 text-gray-700' },
    REJEITADO: { txt: 'Rejeitado', classe: 'bg-red-100 text-red-700' },
    PENDENTE: { txt: 'Aguardando aprovação', classe: 'bg-amber-100 text-amber-700' },
};

// Erros do restaurar que pedem "tentar só uma das partes"
const ERRO_DO_PONTO = ['EMPRESA', 'DUPLICADO', 'INVALIDO'];
const ERRO_DO_TEXTO = ['CIDADE_NAO_CADASTRADA', 'IE_INCOMPATIVEL_UF'];

const versaoDe = (ev, lado) => {
    const snapshot = lado === 'antes' ? ev.antes : ev.depois;
    const data = formatarDataHora(ev.em);
    return {
        eventoId: ev.id,
        lado,
        snapshot: snapshot || {},
        em: ev.em,
        autorNome: ev.autorNome || null,
        rotulo: lado === 'depois'
            ? `Versão de ${data || 'data não registrada'}`
            : `Versão anterior à alteração de ${data || 'data não registrada'}`,
    };
};

function ModalRestaurar({ aberto, onFechar, clienteUuid, evento, lado, atual, podeTexto, podePonto, onRestaurado }) {
    const snap = (lado === 'antes' ? evento?.antes : evento?.depois) || {};
    const temTexto = !!(evento?.textoRegistrado !== false && linhaEndereco(snap));
    const temPonto = !!parseLatLng(snap.Ponto_GPS);
    const textoOk = temTexto && podeTexto;
    const pontoOk = temPonto && podePonto;

    const [querTexto, setQuerTexto] = useState(true);
    const [querPonto, setQuerPonto] = useState(true);
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState(null); // { mensagem, codigo, sugestoes }
    const [autorizar, setAutorizar] = useState(null); // { mensagem }
    const [autorizadores, setAutorizadores] = useState([]);
    const [autorizadorId, setAutorizadorId] = useState('');
    const [senha, setSenha] = useState('');

    useEffect(() => {
        if (!aberto) return;
        setQuerTexto(true); setQuerPonto(true); setErro(null); setAutorizar(null);
        setAutorizadorId(''); setSenha(''); setEnviando(false);
    }, [aberto, evento?.id, lado]);

    if (!aberto || !evento) return null;

    const texto = textoOk && querTexto;
    const ponto = pontoOk && querPonto;

    const enviar = async (partesForcadas, comAutorizacao) => {
        const partes = partesForcadas || (texto && ponto ? 'tudo' : texto ? 'texto' : 'ponto');
        setEnviando(true); setErro(null);
        try {
            const body = { lado, partes };
            if (comAutorizacao) body.autorizacao = comAutorizacao;
            const r = await clienteService.enderecoRestaurar(clienteUuid, evento.id, body);
            if (r?.semMudanca) {
                toast('O cliente já estava com essa versão — nada mudou.', { icon: 'ℹ️' });
            } else {
                toast.success('Endereço restaurado!');
                (r?.partesIgnoradas || []).forEach((p) => {
                    if (p?.parte === 'ponto') toast('Essa versão não tinha ponto — o ponto do mapa não foi mexido.', { icon: 'ℹ️' });
                    else if (p?.parte === 'texto') toast('Essa versão não tinha endereço escrito — o endereço atual não foi mexido.', { icon: 'ℹ️' });
                });
            }
            onRestaurado?.(r);
            onFechar();
        } catch (e) {
            const d = e?.response?.data || {};
            const status = e?.response?.status;
            if (status === 422 && d.codigo === 'PROXIMO') {
                setAutorizar({ mensagem: d.error || 'Esse ponto fica muito perto de outro cliente.' });
                try { setAutorizadores(await gpsClientesService.autorizadores()); } catch { setAutorizadores([]); }
            } else {
                setErro({
                    mensagem: d.error || d.mensagem || (e?.message ? `Não foi possível restaurar: ${e.message}` : 'Não foi possível restaurar.'),
                    codigo: d.codigo || null,
                    sugestoes: Array.isArray(d.sugestoes) ? d.sugestoes : [],
                });
            }
        } finally {
            setEnviando(false);
        }
    };

    const distPonto = ponto ? distanciaMetros(parseLatLng(atual?.Ponto_GPS), parseLatLng(snap.Ponto_GPS)) : null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4">
            <div className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-xl max-h-[95vh] flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="bg-mint p-1.5 rounded-lg"><RotateCcw className="h-4 w-4 text-primary" /></div>
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900">Restaurar esta versão</p>
                            <p className="text-[11px] text-gray-500 truncate">{versaoDe(evento, lado).rotulo}</p>
                        </div>
                    </div>
                    <button type="button" onClick={onFechar} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100" aria-label="Fechar">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-4 space-y-3 overflow-y-auto">
                    {!textoOk && !pontoOk ? (
                        <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2.5">
                            Essa versão não tem nada que você possa restaurar
                            {!podeTexto && !podePonto ? ' com as suas permissões.' : ' (sem endereço escrito e sem ponto registrados).'}
                        </div>
                    ) : (
                        <>
                            {temTexto && (
                                <label className={`block rounded-xl border p-3 ${textoOk ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-70'}`}>
                                    <span className="flex items-start gap-2.5 min-h-[44px]">
                                        <input type="checkbox" className="mt-1 h-4 w-4 accent-primary shrink-0" checked={textoOk && querTexto} disabled={!textoOk || enviando}
                                            onChange={(e) => setQuerTexto(e.target.checked)} />
                                        <span className="min-w-0 text-sm">
                                            <b className="text-gray-900">Endereço escrito</b>
                                            {!podeTexto && <span className="block text-xs text-gray-500">Você não tem permissão para editar o endereço escrito.</span>}
                                            <span className="block text-xs text-gray-500 mt-1">Hoje</span>
                                            <span className="block text-gray-700 break-words">{linhaEndereco(atual) || '—'}</span>
                                            <span className="block text-xs text-gray-500 mt-1">Volta para</span>
                                            <span className="block text-gray-900 font-semibold break-words">{linhaEndereco(snap)}</span>
                                        </span>
                                    </span>
                                </label>
                            )}
                            <label className={`block rounded-xl border p-3 ${pontoOk ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-70'}`}>
                                <span className="flex items-start gap-2.5 min-h-[44px]">
                                    <input type="checkbox" className="mt-1 h-4 w-4 accent-primary shrink-0" checked={pontoOk && querPonto} disabled={!pontoOk || enviando}
                                        onChange={(e) => setQuerPonto(e.target.checked)} />
                                    <span className="min-w-0 text-sm">
                                        <b className="text-gray-900">Ponto no mapa</b>
                                        {!temPonto && <span className="block text-xs text-gray-500">Essa versão não tem ponto — o ponto atual do mapa não será mexido.</span>}
                                        {temPonto && !podePonto && <span className="block text-xs text-gray-500">Você não tem permissão para mexer no ponto.</span>}
                                        {pontoOk && (
                                            <span className="block text-xs text-gray-600 mt-0.5">
                                                {distPonto != null ? `O ponto muda ${formatarDistancia(distPonto)} de lugar.` : 'O ponto volta para o lugar dessa versão.'}
                                            </span>
                                        )}
                                    </span>
                                </span>
                            </label>
                            {texto && (
                                <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                                    O endereço escrito vai nas notas fiscais. Confira antes de restaurar.
                                </p>
                            )}
                        </>
                    )}

                    {autorizar && (
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                            <div className="text-[13px] bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5">🚫 {autorizar.mensagem}</div>
                            <p className="text-xs font-bold uppercase tracking-widest text-gray-600 flex items-center gap-1.5">
                                <ShieldCheck className="h-3.5 w-3.5" /> Autorização da logística
                            </p>
                            <SelectBusca value={autorizadorId} onChange={e => setAutorizadorId(e.target.value)} className="w-full">
                                <option value="">Quem autoriza?</option>
                                {autorizadores.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                            </SelectBusca>
                            <input type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="Senha do autorizador"
                                className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setAutorizar(null)}
                                    className="flex-1 min-h-[44px] px-4 py-2 bg-white border border-gray-300 text-gray-600 rounded-full font-medium text-sm">Voltar</button>
                                <button type="button" disabled={!autorizadorId || !senha || enviando}
                                    onClick={() => enviar(null, { vendedorId: autorizadorId, senha })}
                                    className="flex-1 min-h-[44px] px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm disabled:opacity-50">
                                    Liberar e restaurar
                                </button>
                            </div>
                        </div>
                    )}

                    {erro && (
                        <div className="text-[13px] bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 space-y-2">
                            <p>🚫 {erro.mensagem}</p>
                            {erro.sugestoes.length > 0 && (
                                <p className="text-xs text-red-700">Cidades parecidas: {erro.sugestoes.map(s => (typeof s === 'string' ? s : s?.nome)).filter(Boolean).join(', ')}</p>
                            )}
                            {texto && ponto && ERRO_DO_PONTO.includes(erro.codigo) && (
                                <button type="button" onClick={() => enviar('texto')} disabled={enviando}
                                    className="w-full min-h-[44px] px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm">
                                    Restaurar só o endereço escrito
                                </button>
                            )}
                            {texto && ponto && ERRO_DO_TEXTO.includes(erro.codigo) && (
                                <button type="button" onClick={() => enviar('ponto')} disabled={enviando}
                                    className="w-full min-h-[44px] px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm">
                                    Restaurar só o ponto no mapa
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {!autorizar && (
                    <div className="flex gap-2 px-4 py-3 border-t border-gray-100">
                        <button type="button" onClick={onFechar}
                            className="flex-1 min-h-[44px] px-4 py-2 bg-white border border-gray-300 text-gray-600 rounded-full font-medium text-sm">Cancelar</button>
                        <button type="button" onClick={() => enviar()} disabled={enviando || (!texto && !ponto)}
                            className="flex-1 min-h-[44px] px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-1.5">
                            {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Restaurar esta versão
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function HistoricoEndereco({
    clienteUuid,
    podeRestaurarTexto = false,
    podeRestaurarPonto = false,
    onVerNoMapa,          // (versao | null) => void
    versaoEmFoco = null,  // { eventoId, lado } | null
    onRestaurado,         // () => void — pai recarrega a ficha
    compacto = false,
    onVerTodas,           // () => void — só no modo compacto
    recarregarKey = 0,    // mude para recarregar a lista
    className = '',
}) {
    const [dados, setDados] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(null);
    const [restaurando, setRestaurando] = useState(null); // { evento, lado }

    const carregar = useCallback(async () => {
        if (!clienteUuid) return;
        setCarregando(true); setErro(null);
        try {
            setDados(await clienteService.enderecoHistorico(clienteUuid));
        } catch (e) {
            setErro(e?.response?.data?.error || 'Não foi possível carregar o histórico do endereço.');
        } finally {
            setCarregando(false);
        }
    }, [clienteUuid]);

    useEffect(() => { carregar(); }, [carregar, recarregarKey]);

    const eventos = Array.isArray(dados?.eventos) ? dados.eventos : [];
    const visiveis = compacto ? eventos.slice(0, 2) : eventos;
    const registroDesde = formatarData(dados?.registroDesde);
    const podeAlgo = podeRestaurarTexto || podeRestaurarPonto;

    // Compacto sem nada para mostrar: some (a caixa "quem atualizou" já cobre o caso)
    if (compacto && !carregando && !erro && eventos.length === 0) return null;

    const corpo = () => {
        if (carregando && !dados) {
            return (
                <div className="space-y-2" aria-busy="true">
                    {[0, 1].map(i => <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />)}
                </div>
            );
        }
        if (erro) {
            return (
                <div className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-3 space-y-2">
                    <p className="flex items-start gap-1.5"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {erro}</p>
                    <button type="button" onClick={carregar} className="min-h-[44px] px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm">
                        Tentar de novo
                    </button>
                </div>
            );
        }
        if (eventos.length === 0) {
            return (
                <p className="text-sm text-gray-600">
                    Ainda não há alterações de endereço registradas.
                    {registroDesde ? ` O registro começou em ${registroDesde}.` : ''}
                </p>
            );
        }
        return (
            <div className="space-y-3">
                {visiveis.map((ev, idx) => {
                    const tipo = TIPO_SELO[ev.tipo] || (ev.fonte === 'GPS_LEGADO' ? TIPO_SELO.MUDANCA_GPS : null);
                    const st = ev.status && ev.status !== 'APLICADO' ? STATUS_SELO[ev.status] : null;
                    const desfeito = ev.status === 'DESFEITO' || ev.status === 'REJEITADO';
                    const tela = telaDaOrigem(ev.origem);
                    const autor = ev.autorNome || (ev.tipo === 'SISTEMA' ? 'Sistema' : '—');
                    const linhas = compacto ? [] : ['depois', 'antes'];
                    return (
                        <div key={ev.id} className="rounded-xl border border-gray-200 p-3">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-sm font-bold text-gray-900">{autor}</span>
                                {ev.tipo === 'SISTEMA' && <span className="text-xs text-gray-500">detectado em</span>}
                                <span className="text-xs text-gray-600">{formatarDataHora(ev.em) || 'data não registrada'}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                {tipo && <span className={`px-2 py-1 text-xs font-semibold rounded-full ${tipo.classe}`}>{tipo.txt}</span>}
                                {st && <span className={`px-2 py-1 text-xs font-semibold rounded-full ${st.classe}`}>{st.txt}</span>}
                                {tela && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-mint text-primaryDark">{tela}</span>}
                            </div>
                            <p className={`text-sm mt-2 break-words ${desfeito ? 'text-gray-500 line-through' : 'text-gray-700'}`}>{resumoMudanca(ev)}</p>
                            {ev.restauradoDe && (
                                <p className="text-xs text-gray-500 mt-1">
                                    Voltou à versão {ev.restauradoDe.lado === 'depois' ? 'de' : 'anterior a'} {formatarDataHora(ev.restauradoDe.em) || 'data não registrada'}
                                    {ev.restauradoDe.autorNome ? ` (alterada por ${ev.restauradoDe.autorNome})` : ''}.
                                </p>
                            )}
                            {ev.autorizadoPorNome && (
                                <p className="text-xs text-gray-500 mt-1">Ponto perto de outro cliente, liberado por {ev.autorizadoPorNome}.</p>
                            )}

                            {linhas.length > 0 && (
                                <div className="mt-3 space-y-2">
                                    {linhas.map((lado) => {
                                        const snap = (lado === 'antes' ? ev.antes : ev.depois) || null;
                                        const end = linhaEndereco(snap);
                                        const temPonto = !!parseLatLng(snap?.Ponto_GPS);
                                        const semDado = !end && !temPonto;
                                        const ehAtual = idx === 0 && lado === 'depois' && !desfeito;
                                        const emFoco = versaoEmFoco?.eventoId === ev.id && versaoEmFoco?.lado === lado;
                                        const restauravel = ev.restauravel?.[lado] !== false && !semDado;
                                        return (
                                            <div key={lado} className={`rounded-lg border p-2.5 ${emFoco ? 'border-primary bg-mint/30' : 'border-gray-200 bg-gray-50'}`}>
                                                <p className="text-xs font-bold uppercase tracking-widest text-gray-600">
                                                    {lado === 'depois' ? 'Ficou assim' : 'Era assim antes'}
                                                    {ehAtual && <span className="ml-2 normal-case tracking-normal px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-xs font-semibold">versão atual</span>}
                                                </p>
                                                <p className="text-sm text-gray-800 mt-1 break-words">
                                                    {semDado ? 'Sem registro desta versão.' : (end || 'Endereço escrito não registrado nesta versão.')}
                                                </p>
                                                <p className="text-xs text-gray-500 mt-0.5">{temPonto ? 'Com ponto no mapa' : 'Sem ponto no mapa'}</p>
                                                <div className="flex flex-col sm:flex-row gap-2 mt-2">
                                                    <button type="button" disabled={semDado}
                                                        onClick={() => onVerNoMapa?.(emFoco ? null : versaoDe(ev, lado))}
                                                        className={`min-h-[44px] px-4 py-2 rounded-full font-medium text-sm flex items-center justify-center gap-1.5 disabled:opacity-50 ${emFoco ? 'bg-primary text-white' : 'bg-white border border-primary text-primary hover:bg-mint/40'}`}>
                                                        <MapPin className="h-4 w-4" /> {emFoco ? 'No mapa' : 'Ver no mapa'}
                                                    </button>
                                                    {podeAlgo && !ehAtual && (
                                                        <button type="button" disabled={!restauravel}
                                                            title={restauravel ? '' : 'Esta versão não tem dado para restaurar'}
                                                            onClick={() => setRestaurando({ evento: ev, lado })}
                                                            className="min-h-[44px] px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm flex items-center justify-center gap-1.5 disabled:opacity-50">
                                                            <RotateCcw className="h-4 w-4" /> Restaurar
                                                        </button>
                                                    )}
                                                </div>
                                                {!restauravel && !semDado && podeAlgo && (
                                                    <p className="text-xs text-gray-500 mt-1">Esta versão não tem dado para restaurar.</p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
                {registroDesde && !compacto && (
                    <p className="text-xs text-gray-500">
                        O registro do endereço escrito começou em {registroDesde}. Antes disso só existe o histórico do ponto no mapa.
                    </p>
                )}
                {compacto && eventos.length > 2 && onVerTodas && (
                    <button type="button" onClick={onVerTodas}
                        className="min-h-[44px] text-xs font-semibold text-primary hover:text-primaryDark flex items-center gap-1">
                        ver todas ({eventos.length}) <ChevronDown className="h-3 w-3 -rotate-90" />
                    </button>
                )}
            </div>
        );
    };

    return (
        <div className={compacto ? `mt-3 pt-3 border-t border-dashed border-gray-200 ${className}` : `bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}>
            {compacto ? (
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <History className="h-3.5 w-3.5" /> Histórico do endereço
                </p>
            ) : (
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                    <History className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Histórico do endereço</span>
                </div>
            )}
            <div className={compacto ? '' : 'p-4'}>{corpo()}</div>

            <ModalRestaurar
                aberto={!!restaurando}
                onFechar={() => setRestaurando(null)}
                clienteUuid={clienteUuid}
                evento={restaurando?.evento}
                lado={restaurando?.lado}
                atual={dados?.atual?.snapshot}
                podeTexto={podeRestaurarTexto}
                podePonto={podeRestaurarPonto}
                onRestaurado={() => { onVerNoMapa?.(null); carregar(); onRestaurado?.(); }}
            />
        </div>
    );
}
