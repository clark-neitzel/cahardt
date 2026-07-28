import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import toast from 'react-hot-toast';
import {
    Target, MapPin, Tag, Trophy, AlertTriangle, ChevronDown, Users, Route
} from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import SelectBusca from '../../components/SelectBusca';
import {
    Card, BarraMeta, Gauge, BadgeRecompra, Carregando, fmtRS, fmtRS0, fmtBR, fmtInt,
    useAtualizaAoVoltar
} from './dashUi';

dayjs.locale('pt-br');

const saudacao = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
};

const ordinal = (n) => (n != null ? `${n}º` : '—');

// Aviso: clientes da carteira com ponto GPS divergente das entregas reais.
// O vendedor corrige pelo mapa — o alfinete já abre no lugar sugerido.
const AvisoGpsDivergente = () => {
    const [lista, setLista] = useState([]);
    const [corrigindo, setCorrigindo] = useState(null); // cliente em correção
    useEffect(() => {
        let vivo = true;
        import('../../services/gpsClientesService').then(({ default: svc }) =>
            svc.minhasDivergencias().then(l => { if (vivo) setLista(l || []); }).catch(() => { })
        );
        return () => { vivo = false; };
    }, []);
    if (!lista.length) return null;
    const fmtD = (m) => m == null ? '' : (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);
    return (
        <>
            <div className="bg-white rounded-xl border border-amber-300 shadow-sm overflow-hidden">
                <div className="bg-amber-50 px-4 py-3 border-b border-amber-200 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-amber-600" />
                    <p className="text-sm font-bold text-amber-800">
                        {lista.length === 1 ? '1 cliente seu está' : `${lista.length} clientes seus estão`} com o ponto GPS errado
                    </p>
                </div>
                <div className="divide-y divide-gray-100">
                    {lista.map(c => (
                        <div key={c.UUID} className="px-4 py-2.5 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">{c.nome}</p>
                                <p className="text-xs text-gray-500">
                                    {c.distanciaM != null
                                        ? `entregas acontecendo a ${fmtD(c.distanciaM)} do cadastro`
                                        : 'entregas acontecendo em lugar diferente do cadastro'}
                                </p>
                            </div>
                            <button onClick={() => setCorrigindo(c)}
                                className="px-3 py-1.5 bg-primary hover:bg-primaryDark text-white rounded-full text-xs font-semibold shrink-0">
                                Corrigir
                            </button>
                        </div>
                    ))}
                </div>
            </div>
            {corrigindo && (
                <ModalGpsLazy
                    cliente={corrigindo}
                    onFechar={(corrigiu) => {
                        if (corrigiu) setLista(l => l.filter(x => x.UUID !== corrigindo.UUID));
                        setCorrigindo(null);
                    }}
                />
            )}
        </>
    );
};

// O mapa (Leaflet) só carrega quando o vendedor toca em "Corrigir"
const ModalGpsLazy = ({ cliente, onFechar }) => {
    const [Comp, setComp] = useState(null);
    useEffect(() => {
        import('../../components/ModalPontoGps').then(m => setComp(() => m.default));
    }, []);
    if (!Comp) return null;
    return (
        <Comp
            aberto
            onFechar={() => onFechar(false)}
            clienteUuid={cliente.UUID}
            clienteNome={cliente.nome}
            pontoAtual={cliente.ponto}
            sugestao={cliente.sugestao}
            origem="SAUDE"
            onSalvo={(ponto, r) => {
                if (r?.pendente) toast('Mudança registrada — espera aprovação da logística.', { icon: '🕓' });
                else if (ponto) toast.success('Ponto corrigido — obrigado!');
                onFechar(!!ponto || r?.pendente);
            }}
        />
    );
};

/**
 * Dashboard pessoal do vendedor: minha meta, meu dia, meu ranking e
 * quem visitar primeiro (recompra crítica + retornos prometidos + cobrança).
 * Gestores podem ver o dashboard de qualquer vendedor pelo seletor.
 */
const DashboardVendedorPessoal = ({ vendedorInicial = '' }) => {
    const { user } = useAuth();
    const [metas, setMetas] = useState(null);
    const [extras, setExtras] = useState(null);
    const [loading, setLoading] = useState(true);
    const [vendedores, setVendedores] = useState([]);
    const [vendedorSelecionado, setVendedorSelecionado] = useState(vendedorInicial);
    const [tick, setTick] = useState(0);

    // Dado vivo: rebusca ao voltar para o app (PWA em segundo plano) e a cada 5 min
    const marcarAtualizado = useAtualizaAoVoltar(() => setTick((t) => t + 1));

    const isGestor = !!user?.permissoes?.admin
        || !!user?.permissoes?.Pode_Ver_Dashboard_Admin
        || !!user?.permissoes?.Pode_Gerenciar_Metas
        || user?.email === 'clarksonneitzel@gmail.com';

    useEffect(() => {
        if (isGestor) {
            api.get('/vendedores', { params: { ativo: 'true' } })
                .then((res) => setVendedores(Array.isArray(res.data) ? res.data : []))
                .catch(() => { });
        }
    }, [isGestor]);

    useEffect(() => {
        const params = vendedorSelecionado ? { vendedorId: vendedorSelecionado } : {};
        if (!metas) setLoading(true); // rebusca silenciosa quando já há dado na tela
        Promise.all([
            api.get('/metas/dashboard', { params }),
            api.get('/dashboards/vendedor', { params })
        ])
            .then(([m, e]) => { setMetas(m.data); setExtras(e.data); marcarAtualizado(); })
            .catch(() => toast.error('Não foi possível carregar o seu dashboard.'))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vendedorSelecionado, tick]);

    if (loading) return <Carregando />;

    const alvo = metas?.metasAlvo || {};
    const real = metas?.realizado || {};
    const proj = metas?.projecoes || {};
    const cal = metas?.resumoCalendario || {};
    const hoje = extras?.hoje || {};
    const rank = extras?.ranking || {};
    const cart = extras?.carteira || {};

    const pctMeta = alvo.mensal > 0 ? (real.totalVendidoMes / alvo.mensal) * 100 : 0;
    const diasRestantes = Math.max(0, (cal.totalDiasMes || 0) - (cal.diasTrabalhadosMesAteHoje || 0));
    const faltaVender = Math.max(0, (alvo.mensal || 0) - (real.totalVendidoMes || 0));
    const precisaPorDia = diasRestantes > 0 ? faltaVender / diasRestantes : 0;
    const projBateMeta = alvo.mensal > 0 && (proj.mensal || 0) >= alvo.mensal;
    const nomeExibido = vendedorSelecionado
        ? (vendedores.find((v) => v.id === vendedorSelecionado)?.nome || '').split(' ')[0]
        : user?.nome?.split(' ')[0];
    const cidadesHoje = metas?.cidadesDeHoje || [];

    const fatorProjecao = (cal.totalDiasMes || 1) / Math.max(cal.diasTrabalhadosMesAteHoje || 1, 1);
    const cidades = (metas?.progressoCidades || []).map((c) => ({ ...c, projecao: Math.round((c.realizado || 0) * fatorProjecao) }));
    const produtos = (metas?.progressoProdutos || []);

    return (
        <div className="max-w-2xl mx-auto w-full">
            {/* Cabeçalho verde-escuro */}
            <div className="bg-house text-white px-4 pt-5 pb-14 md:rounded-b-2xl">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-extrabold">{saudacao()}, {nomeExibido}! 👋</h1>
                        <p className="text-sm font-semibold text-white/70 mt-0.5">
                            {dayjs().format('dddd, D [de] MMMM')}
                            {metas?.hojeEhDiaTrabalho === false ? ' · hoje não é dia de venda' : ''}
                        </p>
                    </div>
                    {isGestor && vendedores.length > 0 && (
                        <div className="w-44 flex-none">
                            <SelectBusca value={vendedorSelecionado} onChange={(e) => setVendedorSelecionado(e.target.value)} className="w-full">
                                <option value="">Meu dashboard</option>
                                {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                            </SelectBusca>
                        </div>
                    )}
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                    {cidadesHoje.map((c) => (
                        <span key={c} className="bg-white/10 border border-white/20 rounded-full px-3 py-1 text-xs font-bold">📍 {c}</span>
                    ))}
                    {hoje.clientesRotaHoje > 0 && (
                        <span className="bg-white/10 border border-white/20 rounded-full px-3 py-1 text-xs font-bold">{fmtInt(hoje.clientesRotaHoje)} clientes na rota de hoje</span>
                    )}
                </div>
            </div>

            <div className="px-3 md:px-0 -mt-10 space-y-3 pb-10">
                {/* Pontos GPS da carteira que precisam de correção */}
                {!vendedorSelecionado && <AvisoGpsDivergente />}

                {/* Minha meta do mês */}
                {metas?.temMeta ? (
                    <Card icon={Target} titulo={`Minha meta de ${dayjs().format('MMMM')}`} direita={`${cal.diasTrabalhadosMesAteHoje || 0} de ${cal.totalDiasMes || 0} dias`}>
                        <div className="flex items-center gap-4">
                            <Gauge percent={pctMeta} tamanho={104} />
                            <div className="flex-1 grid grid-cols-2 gap-3">
                                <div><p className="text-xs font-bold text-gray-500">Vendi até agora</p><p className="text-base font-extrabold text-gray-900 tabular-nums">{fmtRS0(real.totalVendidoMes)}</p></div>
                                <div><p className="text-xs font-bold text-gray-500">Meta do mês</p><p className="text-base font-extrabold text-gray-900 tabular-nums">{fmtRS0(alvo.mensal)}</p></div>
                                <div>
                                    <p className="text-xs font-bold text-gray-500">Projeção</p>
                                    <p className={`text-base font-extrabold tabular-nums ${projBateMeta ? 'text-green-700' : 'text-amber-700'}`}>{fmtRS0(proj.mensal)}{projBateMeta ? ' ✓' : ''}</p>
                                </div>
                                <div><p className="text-xs font-bold text-gray-500">Flex disponível</p><p className="text-base font-extrabold text-gray-900 tabular-nums">{real.flexDisponivel != null ? fmtRS0(real.flexDisponivel) : '—'}</p></div>
                            </div>
                        </div>
                        <div className="mt-3 bg-mint rounded-lg px-3.5 py-2.5 text-sm font-semibold text-primaryDark">
                            {diasRestantes > 0 && faltaVender > 0 && (
                                <>Para bater a meta: vender <b>{fmtRS0(precisaPorDia)} por dia</b> nos {fmtInt(diasRestantes)} dias de venda que faltam. </>
                            )}
                            {faltaVender <= 0 && alvo.mensal > 0 && <>Meta batida! 🎉 Tudo daqui pra frente é recorde. </>}
                            {projBateMeta && faltaVender > 0 && <>No seu ritmo atual você fecha em <b>{fmtRS0(proj.mensal)}</b> — acima da meta. 💪</>}
                            {!projBateMeta && alvo.mensal > 0 && faltaVender > 0 && <>No ritmo atual você fecha em <b>{fmtRS0(proj.mensal)}</b> — precisa acelerar.</>}
                        </div>
                    </Card>
                ) : (
                    <Card icon={Target} titulo="Minha meta">
                        <p className="text-sm text-gray-600">Você ainda não tem meta cadastrada para este mês.</p>
                    </Card>
                )}

                {/* Hoje */}
                <div className="grid grid-cols-3 gap-2.5">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-3 py-3">
                        <p className="text-xs font-bold text-gray-500">Vendi hoje</p>
                        <p className="text-base font-extrabold text-gray-900 tabular-nums whitespace-nowrap">{fmtRS0(hoje.vendas)}</p>
                        {alvo.diaria > 0 && <p className="text-[11px] font-semibold text-gray-500 mt-0.5">meta do dia: {fmtRS0(alvo.diaria)}</p>}
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-3 py-3">
                        <p className="text-xs font-bold text-gray-500">Pedidos hoje</p>
                        <p className="text-base font-extrabold text-gray-900 tabular-nums">{fmtInt(hoje.pedidos)}</p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-3 py-3">
                        <p className="text-xs font-bold text-gray-500">Atendi hoje</p>
                        <p className="text-base font-extrabold text-gray-900 tabular-nums">
                            {fmtInt(hoje.clientesAtendidos)}{hoje.clientesRotaHoje > 0 && <span className="text-sm text-gray-500">/{fmtInt(hoje.clientesRotaHoje)}</span>}
                        </p>
                        <p className="text-[11px] font-semibold text-gray-500 mt-0.5">da rota do dia</p>
                    </div>
                </div>

                {/* Semana + Flex */}
                {metas?.temMeta && (
                    <Card>
                        <div className="space-y-3">
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="font-semibold text-gray-700">Semana</span>
                                    <span className="font-bold text-gray-900 tabular-nums">{fmtRS0(real.totalVendidoSemana)} / {fmtRS0(alvo.semanal)}</span>
                                </div>
                                <BarraMeta percent={alvo.semanal > 0 ? (real.totalVendidoSemana / alvo.semanal) * 100 : 0} />
                            </div>
                            {alvo.flexMensal > 0 && (
                                <div>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="font-semibold text-gray-700">Flex usado</span>
                                        <span className="font-bold text-gray-900 tabular-nums">{fmtRS0(real.flexUtilizadoMes)} / {fmtRS0(alvo.flexMensal)}</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                        <div className="h-2.5 rounded-full bg-primary" style={{ width: `${Math.min(100, (real.flexUtilizadoMes / alvo.flexMensal) * 100)}%` }} />
                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>
                )}

                {/* Ranking da semana */}
                {rank.posicao != null && (
                    <Card>
                        <div className="flex items-center gap-4">
                            <div className="flex-none w-14 h-14 rounded-2xl bg-mint flex flex-col items-center justify-center text-primaryDark">
                                <span className="text-xl font-extrabold leading-none">{ordinal(rank.posicao)}</span>
                                <span className="text-[10px] font-extrabold uppercase">lugar</span>
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><Trophy className="h-4 w-4 text-[#cba258]" /> Ranking da semana</p>
                                <p className="text-[13px] font-medium text-gray-600">
                                    {rank.posicao === 1
                                        ? 'Você está em 1º lugar — segura a ponta! 🏆'
                                        : rank.faltaParaSubir != null
                                            ? <>Faltam <b className="text-gray-900">{fmtRS0(rank.faltaParaSubir)}</b> para alcançar o {ordinal(rank.posicao - 1)} lugar.</>
                                            : `Entre ${fmtInt(rank.totalVendedores)} vendedores esta semana.`}
                                    {rank.posicaoSemanaPassada != null && rank.posicao !== rank.posicaoSemanaPassada && (
                                        <> Semana passada: {ordinal(rank.posicaoSemanaPassada)}.</>
                                    )}
                                </p>
                            </div>
                        </div>
                    </Card>
                )}

                {/* Quem visitar primeiro */}
                <Card icon={AlertTriangle} titulo="Quem visitar primeiro" direita="da sua carteira">
                    <div className="space-y-2">
                        {(extras?.quemVisitar || []).map((c) => (
                            <Link key={c.clienteId} to={`/clientes/${c.clienteId}`} className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
                                <span className={`flex-none w-10 h-10 rounded-lg flex items-center justify-center font-extrabold text-xs ${c.status === 'CRITICO' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {c.diasSemComprar != null ? `${c.diasSemComprar}d` : '!'}
                                </span>
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[13px] font-bold text-gray-900 truncate">{c.nome}</span>
                                    <span className="block text-xs font-medium text-gray-500">
                                        {c.status === 'CRITICO' ? 'crítico' : 'atrasado'}
                                        {c.cicloDias != null ? ` — comprava a cada ${c.cicloDias} dias` : ''}
                                        {c.compraMensalEstimada > 0 ? ` · ${fmtRS0(c.compraMensalEstimada)}/mês` : ''}
                                    </span>
                                </span>
                                <span className="flex-none bg-primary text-white rounded-full px-3.5 py-2 text-xs font-bold">Visitar</span>
                            </Link>
                        ))}
                        {(extras?.retornos || []).filter((r) => r.vencido || dayjs(r.dataRetorno).isSame(dayjs(), 'day')).slice(0, 3).map((r) => (
                            <Link key={r.id} to={r.clienteId ? `/clientes/${r.clienteId}` : '/atendimentos'} className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
                                <span className="flex-none w-10 h-10 rounded-lg flex items-center justify-center font-extrabold text-[11px] bg-blue-100 text-blue-800">
                                    {r.vencido ? 'venc.' : 'hoje'}
                                </span>
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[13px] font-bold text-gray-900 truncate">{r.nome}</span>
                                    <span className="block text-xs font-medium text-gray-500">
                                        você prometeu retornar {r.vencido ? `em ${dayjs(r.dataRetorno).format('DD/MM')}` : 'hoje'}
                                        {r.assunto ? ` — ${r.assunto}` : ''}
                                    </span>
                                </span>
                                <span className="flex-none bg-primary text-white rounded-full px-3.5 py-2 text-xs font-bold">Retornar</span>
                            </Link>
                        ))}
                        {(extras?.inadimplentes || []).slice(0, 2).map((c) => (
                            <Link key={c.clienteId} to={`/clientes/${c.clienteId}`} className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
                                <span className="flex-none w-10 h-10 rounded-lg flex items-center justify-center font-extrabold text-xs bg-amber-100 text-amber-700">R$</span>
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[13px] font-bold text-gray-900 truncate">{c.nome}</span>
                                    <span className="block text-xs font-medium text-gray-500">
                                        {fmtRS(c.valor)} vencido{c.vencimentoMaisAntigo ? ` desde ${dayjs(c.vencimentoMaisAntigo).format('DD/MM')}` : ''} · lembrar na visita
                                    </span>
                                </span>
                                <span className="flex-none bg-primary text-white rounded-full px-3.5 py-2 text-xs font-bold">Cobrar</span>
                            </Link>
                        ))}
                        {(extras?.quemVisitar || []).length === 0 && (extras?.inadimplentes || []).length === 0 && (
                            <p className="text-sm text-gray-500">Carteira em dia — nenhum cliente crítico. 👏</p>
                        )}
                    </div>
                    <p className="text-xs text-gray-500 font-medium mt-3">
                        Sua carteira: <b className="text-gray-700">{fmtInt(cart.criticos)} críticos</b> · {fmtInt(cart.atrasados)} atrasados · {fmtInt(cart.atencao)} em atenção
                        {cart.valorVencido > 0 && <> · <b className="text-red-700">{fmtRS0(cart.valorVencido)} vencidos</b> ({fmtInt(cart.inadimplentes)} clientes)</>}
                        {' '}· <Link to="/rota" className="text-primary font-bold">abrir minha rota →</Link>
                    </p>
                </Card>

                {/* Meta por cidade */}
                {cidades.length > 0 && (
                    <details className="bg-white rounded-xl border border-gray-200 shadow-sm group" open>
                        <summary className="flex items-center gap-2 px-4 py-3.5 cursor-pointer list-none min-h-[44px]">
                            <MapPin className="h-4 w-4 text-blue-600" />
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Minha meta por cidade</span>
                            <ChevronDown className="h-4 w-4 text-gray-400 ml-auto transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="px-4 pb-4 space-y-2.5 border-t border-gray-100 pt-3">
                            {cidades.map((c) => (
                                <div key={c.cidade}>
                                    <div className="flex justify-between text-[13px] mb-1">
                                        <span className="font-semibold text-gray-800">{c.cidade}</span>
                                        <span className="font-bold text-gray-900 tabular-nums">{fmtRS0(c.realizado)} / {fmtRS0(c.meta)}</span>
                                    </div>
                                    <BarraMeta percent={c.meta > 0 ? (c.realizado / c.meta) * 100 : 0} altura="h-2" />
                                </div>
                            ))}
                        </div>
                    </details>
                )}

                {/* Meta por produto */}
                {produtos.length > 0 && (
                    <details className="bg-white rounded-xl border border-gray-200 shadow-sm group">
                        <summary className="flex items-center gap-2 px-4 py-3.5 cursor-pointer list-none min-h-[44px]">
                            <Tag className="h-4 w-4 text-purple-600" />
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Minha meta por produto</span>
                            <ChevronDown className="h-4 w-4 text-gray-400 ml-auto transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="px-4 pb-4 space-y-2.5 border-t border-gray-100 pt-3">
                            {produtos.map((p) => (
                                <div key={p.produtoId}>
                                    <div className="flex justify-between text-[13px] mb-1">
                                        <span className="font-semibold text-gray-800 truncate pr-2">{p.nome}</span>
                                        <span className="font-bold text-gray-900 tabular-nums whitespace-nowrap">{fmtBR(p.realizado, 0)} / {fmtBR(p.meta, 0)} un</span>
                                    </div>
                                    <BarraMeta percent={p.meta > 0 ? (p.realizado / p.meta) * 100 : 0} altura="h-2" />
                                </div>
                            ))}
                        </div>
                    </details>
                )}

                {/* Atalhos */}
                <div className="grid grid-cols-2 gap-2.5">
                    <Link to="/rota" className="flex items-center justify-center gap-2 bg-white border border-primary text-primary rounded-full px-4 py-3 text-sm font-bold min-h-[44px]">
                        <Route className="h-4 w-4" /> Minha rota
                    </Link>
                    <Link to="/pedidos" className="flex items-center justify-center gap-2 bg-primary text-white rounded-full px-4 py-3 text-sm font-bold min-h-[44px]">
                        <Users className="h-4 w-4" /> Novo pedido
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default DashboardVendedorPessoal;
