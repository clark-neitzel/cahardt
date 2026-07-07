import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import toast from 'react-hot-toast';
import { Truck, MapPin, CheckCircle2, CalendarDays } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { Card, Carregando, fmtRS0, fmtInt, useAtualizaAoVoltar } from './dashUi';

dayjs.locale('pt-br');

const saudacao = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
};

const BadgeEntrega = ({ status }) => {
    const mapa = {
        ENTREGUE: ['bg-green-100 text-green-800', 'entregue'],
        ENTREGUE_PARCIAL: ['bg-amber-100 text-amber-700', 'parcial'],
        DEVOLVIDO: ['bg-red-100 text-red-700', 'devolvido']
    };
    const [cls, rotulo] = mapa[status] || ['bg-gray-100 text-gray-700', status];
    return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${cls}`}>{rotulo}</span>;
};

/** Dashboard do entregador: rota de hoje, próxima parada, dinheiro a receber e semana. */
const DashboardEntregador = () => {
    const { user } = useAuth();
    const [d, setD] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tick, setTick] = useState(0);

    // Dado vivo: rebusca ao voltar para o app e a cada 5 min (o motorista deixa a tela aberta)
    const marcarAtualizado = useAtualizaAoVoltar(() => setTick((t) => t + 1));

    useEffect(() => {
        api.get('/dashboards/entregador')
            .then((res) => { setD(res.data); marcarAtualizado(); })
            .catch(() => toast.error('Não foi possível carregar o painel de entregas.'))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tick]);

    if (loading) return <Carregando />;

    const rota = d?.rotaHoje || {};
    const dinheiro = d?.dinheiro || {};
    const hoje = d?.hoje || {};
    const semana = d?.semana || {};
    const proxima = (rota.proximas || [])[0];
    const depois = (rota.proximas || []).slice(1);
    const total = rota.total || 0;
    const pct = total > 0 ? Math.round((rota.feitas / total) * 100) : 0;

    const abrirMapa = (parada) => {
        const destino = parada.gps || parada.endereco;
        if (!destino) return;
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}`, '_blank');
    };

    return (
        <div className="max-w-2xl mx-auto w-full">
            <div className="bg-house text-white px-4 pt-5 pb-14 md:rounded-b-2xl">
                <h1 className="text-xl font-extrabold">{saudacao()}, {user?.nome?.split(' ')[0]}! 🚚</h1>
                <p className="text-sm font-semibold text-white/70 mt-0.5">
                    {dayjs().format('dddd, D [de] MMMM')}
                    {rota.embarqueNumero ? ` · embarque nº ${rota.embarqueNumero}` : ''}
                </p>
                {(rota.cidades || []).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                        <span className="bg-white/10 border border-white/20 rounded-full px-3 py-1 text-xs font-bold">
                            📍 {rota.cidades.join(' → ')}
                        </span>
                    </div>
                )}
            </div>

            <div className="px-3 md:px-0 -mt-10 space-y-3 pb-10">
                {/* Progresso do dia + próxima parada */}
                <Card icon={Truck} titulo="Minha rota de hoje" direita={dayjs().format('HH:mm')}>
                    {total === 0 ? (
                        <p className="text-sm text-gray-600">Nenhuma entrega na sua rota hoje. Quando um embarque for liberado, ele aparece aqui.</p>
                    ) : (
                        <>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-extrabold text-gray-900 tabular-nums">{fmtInt(rota.feitas)}</span>
                                <span className="text-sm font-bold text-gray-600">de {fmtInt(total)} entregas feitas</span>
                                <span className="ml-auto text-sm font-extrabold text-primaryDark tabular-nums">{pct}%</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden mt-2">
                                <div className="h-3 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                            </div>
                            <p className="text-xs text-gray-500 font-medium mt-2">
                                Faltam <b className="text-gray-700">{fmtInt(rota.pendentes)} paradas</b>
                                {rota.amostrasPendentes > 0 ? ` + ${fmtInt(rota.amostrasPendentes)} amostras` : ''}.
                            </p>

                            {proxima && (
                                <div className="bg-mint rounded-xl p-4 mt-3">
                                    <p className="text-[11px] font-extrabold uppercase tracking-widest text-primaryDark">Próxima parada · nº {proxima.ordem}</p>
                                    <p className="text-base font-extrabold text-primaryDark mt-1">{proxima.nome}</p>
                                    {proxima.endereco && <p className="text-[13px] font-semibold text-primaryDark/80 mt-0.5">{proxima.endereco}</p>}
                                    {proxima.recebeNaEntrega && proxima.valor > 0 && (
                                        <p className="text-xs font-bold text-amber-700 mt-1.5">💵 recebe {fmtRS0(proxima.valor)} na entrega</p>
                                    )}
                                    <div className="flex gap-2 mt-3">
                                        <button
                                            onClick={() => abrirMapa(proxima)}
                                            className="flex-1 bg-white border border-primary text-primaryDark rounded-full px-4 py-3 text-sm font-bold min-h-[46px]"
                                        >
                                            🗺️ Abrir no mapa
                                        </button>
                                        <Link
                                            to="/minhas-entregas"
                                            className="flex-1 bg-primary text-white rounded-full px-4 py-3 text-sm font-bold min-h-[46px] text-center"
                                        >
                                            ✓ Fazer check-in
                                        </Link>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </Card>

                {/* KPIs do dia */}
                <div className="grid grid-cols-3 gap-2.5">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-3 py-3">
                        <p className="text-xs font-bold text-gray-500">Dinheiro a receber</p>
                        <p className="text-base font-extrabold text-gray-900 tabular-nums whitespace-nowrap">{fmtRS0(dinheiro.aReceberNaEntrega)}</p>
                        <p className="text-[11px] font-semibold text-gray-500 mt-0.5">{fmtInt(dinheiro.clientesQuePagam)} pagam na entrega</p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-3 py-3">
                        <p className="text-xs font-bold text-gray-500">Devoluções hoje</p>
                        <p className="text-base font-extrabold text-gray-900 tabular-nums">{fmtInt(hoje.parciais + hoje.devolvidas)}</p>
                        {hoje.parciais > 0 && <p className="text-[11px] font-semibold text-gray-500 mt-0.5">{fmtInt(hoje.parciais)} parciais</p>}
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-3 py-3">
                        <p className="text-xs font-bold text-gray-500">Divergências</p>
                        <p className={`text-base font-extrabold tabular-nums ${hoje.divergencias > 0 ? 'text-red-700' : 'text-gray-900'}`}>{fmtInt(hoje.divergencias)}</p>
                        <p className="text-[11px] font-semibold text-gray-500 mt-0.5">{hoje.divergencias > 0 ? 'avisar o escritório' : 'pagamentos ok'}</p>
                    </div>
                </div>

                {/* Próximas paradas */}
                {depois.length > 0 && (
                    <Card icon={MapPin} titulo="Depois da próxima" direita="ordem de prioridade">
                        <div className="space-y-2">
                            {depois.map((p) => (
                                <div key={p.pedidoId} className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
                                    <span className="flex-none w-9 h-9 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center font-extrabold text-sm">{p.ordem}</span>
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-[13px] font-bold text-gray-900 truncate">{p.nome}</span>
                                        {p.endereco && <span className="block text-xs font-medium text-gray-500 truncate">{p.endereco}</span>}
                                    </span>
                                    {p.recebeNaEntrega && p.valor > 0 && (
                                        <span className="flex-none px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">💵 {fmtRS0(p.valor)}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-gray-500 font-medium mt-3">
                            {rota.pendentes > rota.proximas?.length ? `+ ${fmtInt(rota.pendentes - rota.proximas.length)} paradas — ` : ''}
                            <Link to="/minhas-entregas" className="text-primary font-bold">abrir o Painel de Entregas →</Link>
                        </p>
                    </Card>
                )}

                {/* Finalizadas hoje */}
                {(hoje.ultimas || []).length > 0 && (
                    <Card icon={CheckCircle2} titulo="Finalizadas hoje" direita={`${fmtInt(hoje.entregues + hoje.parciais + hoje.devolvidas)} entregas`}>
                        <div className="divide-y divide-gray-100">
                            {hoje.ultimas.map((u, i) => (
                                <div key={i} className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
                                    <span className="flex-1 text-[13px] font-semibold text-gray-800 truncate">{u.nome}</span>
                                    <BadgeEntrega status={u.status} />
                                    <span className="text-xs font-semibold text-gray-500 tabular-nums whitespace-nowrap">{u.hora ? dayjs(u.hora).format('HH:mm') : ''}</span>
                                </div>
                            ))}
                        </div>
                    </Card>
                )}

                {/* Minha semana */}
                <Card icon={CalendarDays} titulo="Minha semana" direita="segunda até hoje">
                    <div className="grid grid-cols-3 gap-3 text-center">
                        <div><p className="text-xl font-extrabold text-gray-900 tabular-nums">{fmtInt(semana.entregas)}</p><p className="text-xs font-bold text-gray-500">entregas feitas</p></div>
                        <div><p className="text-xl font-extrabold text-gray-900 tabular-nums">{fmtInt(semana.devolucoes)}</p><p className="text-xs font-bold text-gray-500">devoluções</p></div>
                        <div><p className="text-xl font-extrabold text-gray-900 tabular-nums">{fmtInt(semana.divergencias)}</p><p className="text-xs font-bold text-gray-500">divergências</p></div>
                    </div>
                    {semana.semanaPassada && (
                        <p className="text-xs text-gray-500 font-medium mt-3 text-center">
                            Semana passada: {fmtInt(semana.semanaPassada.entregas)} entregas · {fmtInt(semana.semanaPassada.devolucoes)} devoluções
                            {semana.devolucoes < semana.semanaPassada.devolucoes ? ' — devoluções caindo 👏' : ''}
                        </p>
                    )}
                </Card>
            </div>
        </div>
    );
};

export default DashboardEntregador;
