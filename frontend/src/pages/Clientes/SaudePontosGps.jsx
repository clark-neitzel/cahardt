import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, MapPin, RefreshCw, Loader2, Check, X as XIcon,
    History, ExternalLink, Store, AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import gpsClientesService from '../../services/gpsClientesService';
import ModalPontoGps from '../../components/ModalPontoGps';

// ─────────────────────────────────────────────────────────────────────────────
// Saúde dos Pontos GPS — a "faxina" dos pontos bagunçados.
// O sistema cruza o ponto cadastrado de cada cliente com os sinais reais
// (entregas concluídas, atendimentos na rua, confirmações "na porta") e aponta:
// repetidos, na empresa, suspeitos (com sugestão de correção em 1 clique),
// sem GPS. Também é aqui que a logística aprova pendências e liga o bloqueio
// de pedido sem GPS.
// ─────────────────────────────────────────────────────────────────────────────

const fmtDist = (m) => m == null ? '—' : (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

const linkMapa = (ponto) => ponto ? `https://maps.google.com/?q=${ponto}` : null;

const Kpi = ({ valor, rotulo, cor }) => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 text-center">
        <p className={`text-2xl font-bold tabular-nums ${cor}`}>{valor}</p>
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mt-0.5">{rotulo}</p>
    </div>
);

const Card = ({ titulo, badge, children }) => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
            <MapPin className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-bold uppercase tracking-widest text-gray-600">{titulo}</span>
            {badge != null && <span className="ml-auto px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-700 tabular-nums">{badge}</span>}
        </div>
        <div className="p-4">{children}</div>
    </div>
);

export default function SaudePontosGps() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const perms = user?.permissoes || {};
    const podeAutorizar = !!(perms.admin || perms.Pode_Autorizar_Ponto_Gps);

    const [dados, setDados] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const [salvandoConfig, setSalvandoConfig] = useState(false);
    const [decidindo, setDecidindo] = useState(null);   // id da pendência em decisão
    const [aceitando, setAceitando] = useState(null);   // UUID do suspeito em correção
    const [mapaAberto, setMapaAberto] = useState(null); // { clienteUuid, nome, ponto, sugestao }
    const [historico, setHistorico] = useState(null);   // null = fechado
    const [desfazendo, setDesfazendo] = useState(null);

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            setDados(await gpsClientesService.saude());
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar a saúde dos pontos.');
        } finally {
            setCarregando(false);
        }
    }, []);

    useEffect(() => { carregar(); }, [carregar]);

    const toggleExigir = async () => {
        if (!podeAutorizar) return toast.error('Só quem tem a permissão "Autorizar Ponto GPS" liga/desliga o bloqueio.');
        setSalvandoConfig(true);
        try {
            const novo = !dados?.config?.exigirNoPedido;
            await gpsClientesService.setConfig({ exigirNoPedido: novo });
            setDados(d => ({ ...d, config: { ...d.config, exigirNoPedido: novo } }));
            toast.success(novo
                ? 'Bloqueio LIGADO: pedido de cliente sem GPS (e sem ser balcão) não envia mais.'
                : 'Bloqueio desligado: pedidos voltam a sair sem exigir GPS.');
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao mudar a configuração.');
        } finally {
            setSalvandoConfig(false);
        }
    };

    const decidir = async (id, aprovar) => {
        setDecidindo(id);
        try {
            await gpsClientesService.decidirPendencia(id, aprovar);
            toast.success(aprovar ? 'Mudança aprovada e aplicada.' : 'Mudança rejeitada — o ponto antigo continua.');
            carregar();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao decidir.');
        } finally {
            setDecidindo(null);
        }
    };

    const aceitarSugestao = async (s) => {
        setAceitando(s.UUID);
        try {
            const r = await gpsClientesService.salvarPonto(s.UUID, { ponto: s.sugestao, origem: 'SAUDE' });
            if (r.pendente) toast('Virou pendência de aprovação (ponto confirmado movido para longe).', { icon: '🕓' });
            else toast.success(`Ponto de ${s.nome} corrigido para o centro das entregas reais.`);
            carregar();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao aceitar a sugestão.');
        } finally {
            setAceitando(null);
        }
    };

    const abrirHistorico = async () => {
        if (historico) { setHistorico(null); return; }
        try { setHistorico(await gpsClientesService.historico()); }
        catch { toast.error('Erro ao carregar o histórico.'); }
    };

    const desfazer = async (id) => {
        if (!window.confirm('Desfazer esta mudança? O ponto volta ao valor anterior.')) return;
        setDesfazendo(id);
        try {
            await gpsClientesService.desfazer(id);
            toast.success('Mudança desfeita.');
            setHistorico(await gpsClientesService.historico());
            carregar();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao desfazer.');
        } finally {
            setDesfazendo(null);
        }
    };

    const k = dados?.kpis;

    return (
        <div className="max-w-full overflow-x-hidden">
            {/* Topbar */}
            <div className="flex items-center justify-between p-3 md:p-6 bg-white border-b border-gray-200">
                <div className="flex items-center gap-2 min-w-0">
                    <button onClick={() => navigate('/clientes')} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div className="bg-green-100 p-1.5 md:p-2 rounded-lg">
                        <MapPin className="h-4 w-4 md:h-5 md:w-5 text-green-600" />
                    </div>
                    <h1 className="text-base md:text-2xl font-bold text-gray-900 truncate">Saúde dos Pontos GPS</h1>
                </div>
                <button onClick={carregar} disabled={carregando}
                    className="px-3 py-1.5 md:px-4 md:py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-xs md:text-sm font-medium flex items-center gap-1.5 disabled:opacity-50">
                    {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    <span className="hidden md:inline">Recalcular</span>
                </button>
            </div>

            <div className="p-3 md:p-6 space-y-4">
                {carregando && !dados ? (
                    <div className="flex items-center justify-center py-20 text-gray-500 gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" /> Cruzando os pontos com as entregas reais…
                    </div>
                ) : dados && (
                    <>
                        {/* KPIs */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                            <Kpi valor={k.repetidos} rotulo="Repetidos" cor={k.repetidos ? 'text-red-600' : 'text-gray-400'} />
                            <Kpi valor={k.naEmpresa} rotulo="Na empresa" cor={k.naEmpresa ? 'text-amber-600' : 'text-gray-400'} />
                            <Kpi valor={k.suspeitos} rotulo="Suspeitos" cor={k.suspeitos ? 'text-yellow-600' : 'text-gray-400'} />
                            <Kpi valor={k.semGps} rotulo="Sem GPS" cor={k.semGps ? 'text-gray-700' : 'text-gray-400'} />
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                            <span className="px-2 py-1 font-semibold rounded-full bg-green-100 text-green-800">📍✅ {k.confirmados} confirmados</span>
                            <span className="px-2 py-1 font-semibold rounded-full bg-gray-100 text-gray-700">🏪 {k.balcoes} balcão</span>
                            <span className="px-2 py-1 font-semibold rounded-full bg-blue-100 text-blue-800">{k.total} clientes ativos</span>
                        </div>

                        {/* Interruptor do bloqueio de pedido */}
                        <div className={`rounded-xl border p-4 flex items-start md:items-center justify-between gap-3 flex-col md:flex-row ${dados.config?.exigirNoPedido ? 'bg-mint/40 border-primary/30' : 'bg-white border-gray-200'}`}>
                            <div>
                                <p className="text-sm font-bold text-gray-900">Exigir ponto GPS para ENVIAR pedido</p>
                                <p className="text-xs text-gray-600 mt-0.5">
                                    {dados.config?.exigirNoPedido
                                        ? 'LIGADO — pedido de cliente sem ponto (e sem ser balcão) não envia. Salvar como aberto continua podendo.'
                                        : 'Desligado — recomendação: ligar depois de zerar os problemas acima, para não travar cliente bom.'}
                                </p>
                            </div>
                            <button onClick={toggleExigir} disabled={salvandoConfig || !podeAutorizar}
                                className={`px-4 py-2 rounded-full font-semibold text-sm shrink-0 disabled:opacity-50 ${dados.config?.exigirNoPedido ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-primary hover:bg-primaryDark text-white'}`}>
                                {salvandoConfig ? '…' : (dados.config?.exigirNoPedido ? 'Desligar bloqueio' : 'Ligar bloqueio')}
                            </button>
                        </div>

                        {/* Pendências de aprovação */}
                        {dados.pendencias?.length > 0 && (
                            <Card titulo="Pendentes de aprovação (logística)" badge={dados.pendencias.length}>
                                <div className="space-y-3">
                                    {dados.pendencias.map(p => (
                                        <div key={p.id} className="border border-amber-200 bg-amber-50 rounded-xl p-3">
                                            <p className="text-sm font-bold text-gray-900">{p.cliente}</p>
                                            <p className="text-xs text-gray-600 mt-0.5">
                                                Mover o ponto <b>{fmtDist(p.distanciaM)}</b> · pedido por <b>{p.autor || '?'}</b>
                                                {p.posicaoAutor ? ' (estava em campo)' : ' (sem posição de quem pediu)'}
                                                {p.origem ? ` · origem: ${p.origem}` : ''}
                                            </p>
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                <button onClick={() => decidir(p.id, true)} disabled={!podeAutorizar || decidindo === p.id}
                                                    className="px-4 py-1.5 bg-primary hover:bg-primaryDark text-white rounded-full text-xs font-semibold flex items-center gap-1 disabled:opacity-50">
                                                    <Check className="h-3.5 w-3.5" /> Aprovar
                                                </button>
                                                <button onClick={() => decidir(p.id, false)} disabled={!podeAutorizar || decidindo === p.id}
                                                    className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full text-xs font-semibold flex items-center gap-1 disabled:opacity-50">
                                                    <XIcon className="h-3.5 w-3.5" /> Rejeitar
                                                </button>
                                                {p.pontoNovo && (
                                                    <a href={linkMapa(p.pontoNovo)} target="_blank" rel="noreferrer"
                                                        className="px-4 py-1.5 bg-white border border-gray-300 text-gray-600 rounded-full text-xs font-medium flex items-center gap-1">
                                                        <ExternalLink className="h-3.5 w-3.5" /> Ver ponto novo
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        )}

                        {/* Suspeitos (com sugestão automática) */}
                        {dados.suspeitos?.length > 0 && (
                            <Card titulo="Suspeitos — entregas acontecendo longe do cadastro" badge={dados.suspeitos.length}>
                                <div className="space-y-3">
                                    {dados.suspeitos.map(s => (
                                        <div key={s.UUID} className="border border-yellow-200 bg-yellow-50 rounded-xl p-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-sm font-bold text-gray-900 truncate">{s.nome}</p>
                                                <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-yellow-100 text-yellow-800 shrink-0">Suspeito</span>
                                            </div>
                                            <p className="text-xs text-gray-600 mt-0.5">
                                                {s.sinais} sinais em {s.dias} dias{s.distanciaM != null ? <> · a <b>{fmtDist(s.distanciaM)}</b> do cadastro</> : ' · cliente sem ponto no cadastro'}
                                                {s.vendedor ? ` · vendedor: ${s.vendedor}` : ''}
                                            </p>
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                <button onClick={() => aceitarSugestao(s)} disabled={aceitando === s.UUID}
                                                    className="px-4 py-1.5 bg-primary hover:bg-primaryDark text-white rounded-full text-xs font-semibold flex items-center gap-1 disabled:opacity-50">
                                                    {aceitando === s.UUID ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                                    Aceitar sugestão
                                                </button>
                                                <button onClick={() => setMapaAberto({ clienteUuid: s.UUID, nome: s.nome, ponto: s.ponto, sugestao: s.sugestao })}
                                                    className="px-4 py-1.5 bg-white border border-gray-300 text-gray-600 rounded-full text-xs font-medium flex items-center gap-1">
                                                    <MapPin className="h-3.5 w-3.5" /> Ver no mapa
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        )}

                        {/* Repetidos */}
                        {dados.duplicados?.length > 0 && (
                            <Card titulo="Pontos repetidos ou colados (menos de 30 m)" badge={dados.duplicados.length}>
                                <div className="space-y-2">
                                    {dados.duplicados.map((d, i) => (
                                        <div key={i} className="flex items-center gap-2 text-sm border-b border-gray-100 last:border-0 pb-2">
                                            <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full shrink-0 ${d.exato ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {d.exato ? 'Idêntico' : `${d.distanciaM} m`}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                {d.clientes.map(c => (
                                                    <button key={c.UUID} onClick={() => navigate(`/clientes/${c.UUID}`)}
                                                        className="block text-left text-gray-800 hover:text-primary truncate w-full">
                                                        {c.nome}{c.vendedor ? <span className="text-gray-400 text-xs"> · {c.vendedor}</span> : ''}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[11px] text-gray-500 mt-2">Abra cada cliente e ajuste o ponto no mapa — o sistema não deixa mais salvar repetido.</p>
                            </Card>
                        )}

                        {/* Na empresa */}
                        {dados.naEmpresa?.length > 0 && (
                            <Card titulo="Pontos dentro da empresa" badge={dados.naEmpresa.length}>
                                <div className="space-y-1.5">
                                    {dados.naEmpresa.map(c => (
                                        <button key={c.UUID} onClick={() => navigate(`/clientes/${c.UUID}`)}
                                            className="flex items-center justify-between w-full text-left text-sm text-gray-800 hover:text-primary border-b border-gray-100 last:border-0 pb-1.5">
                                            <span className="truncate">{c.nome}</span>
                                            <span className="text-xs text-gray-400 shrink-0 ml-2">{c.vendedor || ''}</span>
                                        </button>
                                    ))}
                                </div>
                            </Card>
                        )}

                        {/* Sem GPS */}
                        {dados.semGps?.length > 0 && (
                            <Card titulo="Sem ponto GPS (e não são balcão)" badge={dados.semGps.length}>
                                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                                    {dados.semGps.map(c => (
                                        <button key={c.UUID} onClick={() => navigate(`/clientes/${c.UUID}`)}
                                            className="flex items-center justify-between w-full text-left text-sm text-gray-800 hover:text-primary border-b border-gray-100 last:border-0 pb-1.5">
                                            <span className="truncate">{c.nome}</span>
                                            <span className="text-xs text-gray-400 shrink-0 ml-2">{c.vendedor || ''}</span>
                                        </button>
                                    ))}
                                </div>
                            </Card>
                        )}

                        {/* Balcões */}
                        {dados.balcoes?.length > 0 && (
                            <Card titulo="Clientes balcão (dispensados de GPS)" badge={dados.balcoes.length}>
                                <div className="space-y-1.5">
                                    {dados.balcoes.map(c => (
                                        <button key={c.UUID} onClick={() => navigate(`/clientes/${c.UUID}`)}
                                            className="flex items-center gap-2 w-full text-left text-sm text-gray-800 hover:text-primary border-b border-gray-100 last:border-0 pb-1.5">
                                            <Store className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                            <span className="truncate flex-1">{c.nome}</span>
                                            {c.por && <span className="text-xs text-gray-400 shrink-0">por {c.por}</span>}
                                        </button>
                                    ))}
                                </div>
                            </Card>
                        )}

                        {/* Tudo limpo */}
                        {!dados.pendencias?.length && !dados.suspeitos?.length && !dados.duplicados?.length && !dados.naEmpresa?.length && !dados.semGps?.length && (
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
                                <p className="text-3xl mb-2">📍✅</p>
                                <p className="text-sm font-bold text-gray-900">Tudo em ordem!</p>
                                <p className="text-xs text-gray-500 mt-1">Nenhum ponto repetido, na empresa, suspeito ou faltando.</p>
                            </div>
                        )}

                        {/* Histórico */}
                        <div>
                            <button onClick={abrirHistorico}
                                className="px-4 py-2 bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-full text-sm font-medium flex items-center gap-2">
                                <History className="h-4 w-4" /> {historico ? 'Fechar histórico' : 'Histórico de alterações'}
                            </button>
                            {historico && (
                                <div className="mt-3 bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
                                    {historico.length === 0 && <p className="p-4 text-sm text-gray-500">Nenhuma alteração registrada ainda.</p>}
                                    {historico.map(h => (
                                        <div key={h.id} className="p-3 flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-gray-900 truncate">{h.cliente}</p>
                                                <p className="text-xs text-gray-600">
                                                    {h.tipo === 'BALCAO_ON' ? '🏪 marcado como balcão' :
                                                        h.tipo === 'BALCAO_OFF' ? 'deixou de ser balcão' :
                                                            h.pontoNovo == null ? 'ponto removido' :
                                                                h.pontoAntigo == null ? 'primeiro ponto definido' :
                                                                    `movido ${fmtDist(h.distanciaM)}`}
                                                    {h.autor ? <> · por <b>{h.autor}</b></> : ''}
                                                    {h.autorizadoPor ? ` · liberado por ${h.autorizadoPor}` : ''}
                                                    {' · '}{new Date(h.criadoEm).toLocaleDateString('pt-BR')}
                                                    {h.status !== 'APLICADO' && <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 text-gray-600">{h.status}</span>}
                                                </p>
                                            </div>
                                            {podeAutorizar && h.tipo === 'MUDANCA' && h.status === 'APLICADO' && h.pontoAntigo != null && (
                                                <button onClick={() => desfazer(h.id)} disabled={desfazendo === h.id}
                                                    className="px-3 py-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-full shrink-0 disabled:opacity-50">
                                                    ↩️ Desfazer
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <p className="text-[11px] text-gray-500 flex items-start gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            O selo "confirmado" nasce da repetição: 3+ sinais (entregas, atendimentos na rua, confirmações do motorista) em dias diferentes, agrupados num raio de 100 m. Checkout em lote e posição dentro da empresa não contam.
                        </p>
                    </>
                )}
            </div>

            {mapaAberto && (
                <ModalPontoGps
                    aberto={!!mapaAberto}
                    onFechar={() => setMapaAberto(null)}
                    clienteUuid={mapaAberto.clienteUuid}
                    clienteNome={mapaAberto.nome}
                    pontoAtual={mapaAberto.ponto}
                    sugestao={mapaAberto.sugestao}
                    origem="SAUDE"
                    onSalvo={(ponto, r) => {
                        if (r?.pendente) toast('Virou pendência de aprovação.', { icon: '🕓' });
                        else if (ponto) toast.success('Ponto corrigido!');
                        carregar();
                    }}
                />
            )}
        </div>
    );
}
