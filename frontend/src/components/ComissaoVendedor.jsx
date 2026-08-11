import React, { useState, useEffect, useCallback, useRef } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import { Coins, X, TrendingUp, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { comissaoService } from '../services/comissaoService';
import { Card, BarraMeta, fmtRS0 } from '../pages/Dashboard/dashUi';

dayjs.locale('pt-br');

// ---------------------------------------------------------------------------
// Comissão do vendedor — linguagem simples, sem jargão.
// Usado no card do dashboard e no popup das 08:00 / 18:00.
// Só aparece para quem tem comissão ativa (meta + configuração no mês).
// ---------------------------------------------------------------------------

const gestorPerms = (user) => {
    const p = user?.permissoes || {};
    return !!p.admin || !!p.Pode_Ver_Dashboard_Admin || !!p.Pode_Gerenciar_Metas;
};

const comissaoAtiva = (dados) => !!dados?.temMeta && !!dados?.temConfig;

// ── Conteúdo (compartilhado entre card e popup) ────────────────────────────
export const ResumoComissao = ({ dados }) => {
    const c = dados.calculo || {};
    const proj = dados.projecao;
    const ganhou = c.totalComissao || 0;
    const percMeta = dados.percRealizado ?? 0;
    const minimo = dados.config?.percMinimoMeta || 0;
    const faltaParaMinimo = minimo > 0
        ? Math.max(0, (dados.meta || 0) * (minimo / 100) - (dados.realizado || 0))
        : 0;
    const metaBatida = percMeta >= 100;
    const temProjecao = proj && proj.diasRestantes > 0;

    return (
        <div className="space-y-3">
            {/* O número que importa */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-mint rounded-xl px-3.5 py-3">
                    <p className="text-xs font-bold text-primaryDark/70">Comissão já garantida</p>
                    <p className="text-xl font-extrabold text-primaryDark tabular-nums">{fmtRS0(ganhou)}</p>
                </div>
                <div className="bg-gray-50 rounded-xl px-3.5 py-3">
                    <p className="text-xs font-bold text-gray-500">Vendi até agora</p>
                    <p className="text-xl font-extrabold text-gray-900 tabular-nums">{fmtRS0(dados.realizado)}</p>
                    <p className="text-[11px] font-semibold text-gray-500">{percMeta.toFixed(0)}% da meta</p>
                </div>
            </div>

            <div>
                <div className="flex justify-between text-[13px] mb-1">
                    <span className="font-semibold text-gray-700">Caminho até a meta</span>
                    <span className="font-bold text-gray-900 tabular-nums">{fmtRS0(dados.realizado)} / {fmtRS0(dados.meta)}</span>
                </div>
                <BarraMeta percent={percMeta} />
            </div>

            {/* Mínimo para destravar a comissão */}
            {c.minimoNaoAtingido && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-3 text-[13px] text-red-700">
                    <AlertTriangle className="h-4 w-4 flex-none mt-0.5" />
                    <span>
                        Para ter comissão neste mês você precisa vender pelo menos <b>{minimo}% da meta</b>.
                        Faltam <b>{fmtRS0(faltaParaMinimo)}</b> em vendas para destravar — depois disso, tudo o que
                        você já vendeu conta.
                    </span>
                </div>
            )}

            {/* Se continuar nesse ritmo… */}
            {temProjecao && (
                proj.minimoNaoAtingido ? (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3 text-[13px] text-amber-800">
                        <TrendingUp className="h-4 w-4 flex-none mt-0.5" />
                        <span>
                            No ritmo de agora, você termina o mês <b>abaixo do mínimo</b> e fica sem comissão.
                            Ainda dá tempo de virar: são <b>{proj.diasRestantes} dias de venda</b> pela frente.
                        </span>
                    </div>
                ) : (
                    <div className="bg-mint rounded-xl px-3.5 py-3 text-[13px] font-semibold text-primaryDark">
                        Se continuar nesse ritmo, você fecha o mês com{' '}
                        <b className="text-base">{fmtRS0(proj.comissao?.total)}</b> de comissão,
                        vendendo {fmtRS0(proj.valorProjetado)}
                        {dados.meta > 0 && proj.percMeta >= 100 ? ' — acima da meta! 💪' : '.'}
                    </div>
                )
            )}
            {temProjecao && proj.metodo === 'dias_semana' && (
                <p className="text-[11px] text-gray-400 font-medium">
                    Estimativa feita com as suas últimas segundas, terças, quartas… — cada dia que falta é
                    comparado com os mesmos dias das semanas anteriores.
                </p>
            )}
            {metaBatida && !c.minimoNaoAtingido && (
                <p className="text-[13px] font-semibold text-green-700">Meta batida! 🎉 Cada venda daqui pra frente aumenta a sua comissão.</p>
            )}
        </div>
    );
};

// ── Card do dashboard do vendedor ──────────────────────────────────────────
export const CardComissao = () => {
    const [dados, setDados] = useState(null);
    useEffect(() => {
        comissaoService.minha().then(setDados).catch(() => { });
    }, []);
    if (!comissaoAtiva(dados)) return null;
    return (
        <Card icon={Coins} titulo="Minha comissão" direita={dayjs().format('MMMM')}>
            <ResumoComissao dados={dados} />
        </Card>
    );
};

// ── Popup das 08:00 e das 18:00 ────────────────────────────────────────────
// Aparece uma vez por janela (manhã/tarde) por dia, só para quem tem comissão
// ativa. Gestores/admin não recebem.
const JANELAS = [
    { id: 'manha', de: 8, ate: 12 },
    { id: 'tarde', de: 18, ate: 24 },
];

const AlertaComissao = () => {
    const { user } = useAuth();
    const [dados, setDados] = useState(null);
    const [visivel, setVisivel] = useState(false);
    const chaveRef = useRef(null);

    const verificar = useCallback(async () => {
        const h = new Date().getHours();
        const janela = JANELAS.find(j => h >= j.de && h < j.ate);
        if (!janela) return;
        const chave = `comissao_popup:${user.id}:${dayjs().format('YYYY-MM-DD')}:${janela.id}`;
        if (localStorage.getItem(chave)) return;
        try {
            const r = await comissaoService.minha();
            if (!comissaoAtiva(r)) {
                localStorage.setItem(chave, '1'); // sem comissão ativa: não insistir hoje
                return;
            }
            chaveRef.current = chave;
            setDados(r);
            setVisivel(true);
        } catch { /* rede/backend fora: tenta na próxima checagem */ }
    }, [user?.id]);

    useEffect(() => {
        if (!user || gestorPerms(user)) return;
        const timer = setTimeout(verificar, 8000);          // deixa o app abrir primeiro
        const interval = setInterval(verificar, 60 * 1000); // pega a virada das 08h/18h com o app aberto
        return () => { clearTimeout(timer); clearInterval(interval); };
    }, [user, verificar]);

    if (!visivel || !dados) return null;

    const fechar = () => {
        if (chaveRef.current) localStorage.setItem(chaveRef.current, '1');
        setVisivel(false);
    };

    return (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto">
                <div className="bg-primary px-5 py-4 flex items-center justify-between sticky top-0">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 rounded-full p-2">
                            <Coins className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-white font-bold text-lg leading-tight">Sua comissão</h2>
                            <p className="text-white/70 text-sm">{dayjs().format('MMMM [de] YYYY')}</p>
                        </div>
                    </div>
                    <button onClick={fechar} className="text-white/80 hover:text-white p-1">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="px-5 py-4">
                    <ResumoComissao dados={dados} />
                </div>
                <div className="px-5 py-3 bg-gray-50 border-t flex justify-end">
                    <button onClick={fechar}
                        className="px-5 py-2 bg-primary hover:bg-primaryDark text-white text-sm font-semibold rounded-full shadow-sm">
                        Combinado! 💪
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AlertaComissao;
