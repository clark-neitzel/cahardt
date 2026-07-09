import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlarmClock, X, Lock, Repeat, CheckCircle2, CalendarCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import tarefaService, { hojeStr } from '../services/tarefaService';
import AnexosTarefa from './AnexosTarefa';

// Pop-up global das Tarefas da Equipe: quando chega o horário de uma tarefa,
// aparece por cima de qualquer tela, com som. Fechar/adiar = volta em 5 min
// (se a tarefa tiver "insistir" ligado). Se outra tarefa tocar, ela toma o
// lugar; as anteriores continuam pendentes (contador no rodapé e na agenda).
const POLL_MS = 60 * 1000; // confere o relógio a cada 1 min
const SNOOZE_MS = 5 * 60 * 1000; // "lembrar em 5 min"
const DELAY_INICIAL_MS = 6000;

const RECORRENCIA_LABEL = {
    DIARIA: 'Repete: todo dia',
    DIAS_UTEIS: 'Repete: seg a sex',
    SEMANAL: 'Repete: toda semana',
    MENSAL: 'Repete: todo mês',
};

function bipTarefa() {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const toque = (freq, t0) => {
            const o = ctx.createOscillator(); const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination); o.type = 'sine'; o.frequency.value = freq;
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
            o.start(t0); o.stop(t0 + 0.3);
        };
        toque(880, ctx.currentTime);
        toque(1175, ctx.currentTime + 0.18);
        toque(880, ctx.currentTime + 0.36);
    } catch { /* áudio bloqueado antes de interação — ignora */ }
}

const AlertaTarefas = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [tarefa, setTarefa] = useState(null); // a que está na tela
    const [outrasPendentes, setOutrasPendentes] = useState(0);
    const snoozeRef = useRef({}); // { [tarefaId|dataRef]: timestamp até quando fica quieto }
    const alertadasRef = useRef(new Set()); // já tocou (para tarefas com "insistir" desligado)
    const chave = (t) => `${t.id}|${t.dataRef}`;

    const verificar = useCallback(async () => {
        try {
            const { pendentes } = await tarefaService.pendentes();
            if (!pendentes || pendentes.length === 0) {
                setTarefa(null);
                setOutrasPendentes(0);
                return;
            }
            setOutrasPendentes(pendentes.length - 1);
            // a mais recente manda; as demais ficam aguardando no contador
            const atual = pendentes[0];
            const k = chave(atual);
            const agora = Date.now();
            const emSnooze = (snoozeRef.current[k] || 0) > agora;
            const jaAlertouUmaVez = alertadasRef.current.has(k);
            if (emSnooze) return;
            if (!atual.insistir && jaAlertouUmaVez) return;
            alertadasRef.current.add(k);
            setTarefa((antes) => {
                const trocou = !antes || chave(antes) !== k;
                if (trocou) bipTarefa();
                return atual;
            });
        } catch {
            // sem rede/sessão — tenta de novo no próximo ciclo
        }
    }, []);

    useEffect(() => {
        if (!user) return;
        const timer = setTimeout(() => verificar(), DELAY_INICIAL_MS);
        const interval = setInterval(() => verificar(), POLL_MS);
        return () => { clearTimeout(timer); clearInterval(interval); };
    }, [user, verificar]);

    if (!user || !tarefa) return null;

    const adiar = async () => {
        snoozeRef.current[chave(tarefa)] = Date.now() + SNOOZE_MS;
        setTarefa(null);
        try { await tarefaService.adiar(tarefa.id, tarefa.dataRef); } catch { /* registro do adiamento é secundário */ }
    };

    const concluir = async () => {
        const t = tarefa;
        setTarefa(null);
        try {
            await tarefaService.concluir(t.id, t.dataRef);
            verificar(); // se houver outra pendente, ela assume
        } catch {
            setTarefa(t); // não conseguiu concluir — volta o aviso
        }
    };

    const verAgenda = () => {
        snoozeRef.current[chave(tarefa)] = Date.now() + SNOOZE_MS;
        setTarefa(null);
        navigate('/tarefas');
    };

    const atrasada = tarefa.dataRef < hojeStr();

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                {/* Faixa superior */}
                <div className="bg-house px-5 py-4 flex items-center gap-3">
                    <div className="animate-pulse" style={{ willChange: 'opacity' }}>
                        <AlarmClock className="h-8 w-8 text-white" />
                    </div>
                    <div className="text-white flex-1 min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-white/60">
                            {atrasada ? `Tarefa pendente de ${tarefa.dataRef.split('-').reverse().join('/')}` : `Hora da tarefa · ${tarefa.hora}`}
                        </div>
                        <div className="font-bold text-lg leading-tight truncate">{tarefa.titulo}</div>
                    </div>
                    <button onClick={adiar} className="p-1.5 text-white/70 hover:text-white rounded-full hover:bg-white/10 shrink-0" title="Fechar (volta em 5 min)">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
                    <div className="flex items-center gap-2 flex-wrap">
                        {tarefa.criadaPeloAdmin ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">
                                <Lock className="h-3 w-3" /> Criada por {tarefa.criadoPor?.nome || 'Admin'}
                            </span>
                        ) : tarefa.criadoPor?.id !== user?.id && (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">
                                Criada por {tarefa.criadoPor?.nome}
                            </span>
                        )}
                        {RECORRENCIA_LABEL[tarefa.recorrencia] && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-mint text-primaryDark">
                                <Repeat className="h-3 w-3" /> {RECORRENCIA_LABEL[tarefa.recorrencia]}
                            </span>
                        )}
                    </div>

                    {tarefa.descricao && <p className="text-sm text-gray-600 whitespace-pre-wrap">{tarefa.descricao}</p>}

                    <AnexosTarefa anexos={tarefa.anexos} />

                    <div className="flex flex-col sm:flex-row gap-3 pt-1">
                        <button onClick={concluir}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm min-h-[44px]">
                            <CheckCircle2 className="h-4 w-4" /> Concluir tarefa
                        </button>
                        <button onClick={adiar}
                            className="flex-1 px-4 py-3 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm min-h-[44px]">
                            {tarefa.insistir ? 'Lembrar em 5 min' : 'Fechar'}
                        </button>
                    </div>

                    <button onClick={verAgenda} className="w-full text-center text-[12px] text-gray-400 hover:text-gray-600 inline-flex items-center justify-center gap-1.5 pt-0.5">
                        <CalendarCheck className="h-3.5 w-3.5" />
                        {outrasPendentes > 0
                            ? `+${outrasPendentes} tarefa${outrasPendentes > 1 ? 's' : ''} pendente${outrasPendentes > 1 ? 's' : ''} — ver na agenda`
                            : 'Ver na agenda'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AlertaTarefas;
