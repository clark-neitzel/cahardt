import React, { useEffect, useState } from 'react';
import { Wallet, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import caixaService from '../../../services/caixaService';

/**
 * Liga/desliga a CONFERÊNCIA DO DINHEIRO do caixa.
 *
 * Publicamos a regra DESLIGADA de propósito: com as permissões novas nascendo
 * desligadas, ligar tudo junto travaria o fechamento de todos os caixas. O dono
 * primeiro dá a permissão a quem confere e só então liga aqui.
 */
const Toggle = ({ ligado, onClick, disabled }) => (
    <button type="button" onClick={onClick} disabled={disabled}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50
            ${ligado ? 'bg-primary' : 'bg-gray-300'}`}>
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${ligado ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
);

const dataBR = (s) => (s ? String(s).split('-').reverse().join('/') : '');

const ConferenciaCaixaConfigCard = () => {
    const [cfg, setCfg] = useState(null);
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        caixaService.getConfigConferencia().then(setCfg).catch(() => setCfg(null));
    }, []);

    const salvar = async (parcial, aviso) => {
        if (aviso && !window.confirm(aviso)) return;
        setSalvando(true);
        try {
            setCfg(await caixaService.salvarConfigConferencia(parcial));
            toast.success('Regra do caixa atualizada.');
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao salvar.');
        } finally {
            setSalvando(false);
        }
    };

    if (!cfg) return null;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-mint/40">
                <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-primary" />
                    Caixa — conferência do dinheiro
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                    Quem recebe o dinheiro conta na calculadora do app e assina. Só depois disso o caixa pode ser fechado —
                    inclusive caixa de R$ 0,00. Quem confere não fecha o mesmo caixa.
                </p>
            </div>

            <div className="p-6 space-y-4">
                {!cfg.ativo && (
                    <div className="flex gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>
                            <b>Regra desligada.</b> A tela de conferência já funciona (dá para contar e assinar),
                            mas o fechamento do caixa <b>não está travado</b> ainda.
                            <div className="mt-1 text-xs">
                                Antes de ligar: dê a permissão <b>“Conferir Dinheiro do Caixa”</b> a quem recebe o dinheiro
                                e <b>“Autorizar Diferença no Caixa”</b> a quem libera falta/sobra, em Usuários → Permissões.
                            </div>
                        </div>
                    </div>
                )}
                {cfg.ativo && (
                    <div className="flex gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
                        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>
                            <b>Regra ligada</b>{cfg.desde ? ` desde ${dataBR(cfg.desde)}` : ''} — caixa só fecha com o dinheiro conferido,
                            e caixa fechado não aceita mais lançamento. Caixas anteriores a essa data não travam.
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50">
                    <div className="pr-3">
                        <p className="text-sm font-semibold text-gray-700">Exigir conferência do dinheiro para fechar</p>
                        <p className="text-xs text-gray-500">
                            Trava o botão Fechar Caixa até alguém contar e assinar. Também impede lançar em dia já fechado.
                        </p>
                    </div>
                    <Toggle
                        ligado={!!cfg.ativo} disabled={salvando}
                        onClick={() => salvar(
                            { ativo: !cfg.ativo },
                            cfg.ativo
                                ? 'Desligar a exigência? Os caixas voltam a fechar sem conferência do dinheiro.'
                                : 'Ligar a exigência? A partir de hoje, nenhum caixa fecha sem alguém conferir o dinheiro.\n\nConfirme antes que as pessoas certas já tenham a permissão de conferir.'
                        )}
                    />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50">
                    <div className="pr-3">
                        <p className="text-sm font-semibold text-gray-700">Caixa só de segunda a sexta</p>
                        <p className="text-xs text-gray-500">
                            Sábado e domingo não abrem caixa: o movimento do fim de semana entra no caixa da segunda seguinte.
                            A entrega/despesa continua gravada na data real.
                        </p>
                    </div>
                    <Toggle
                        ligado={!!cfg.soDiasUteis} disabled={salvando}
                        onClick={() => salvar(
                            { soDiasUteis: !cfg.soDiasUteis },
                            cfg.soDiasUteis
                                ? 'Voltar a ter caixa no sábado e domingo?'
                                : 'Ligar? O caixa de segunda passa a somar sábado + domingo + segunda.'
                        )}
                    />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50">
                    <div className="pr-3">
                        <p className="text-sm font-semibold text-gray-700">Tarefa na agenda quando houver diferença</p>
                        <p className="text-xs text-gray-500">
                            Falta ou sobra vira lembrete para cobrar a pessoa. O <b>vale continua manual</b>, lançado no Contas a Pagar.
                        </p>
                    </div>
                    <Toggle ligado={!!cfg.tarefaDiferenca} disabled={salvando}
                        onClick={() => salvar({ tarefaDiferenca: !cfg.tarefaDiferenca })} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50 gap-3">
                    <div className="pr-3">
                        <p className="text-sm font-semibold text-gray-700">Avisar no WhatsApp caixa parado</p>
                        <p className="text-xs text-gray-500">
                            Dias sem conferir até o bot avisar quem confere (uma mensagem por pessoa por dia, às 8h). 0 = não avisar.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <input
                            type="number" min="0" max="30"
                            defaultValue={cfg.whatsappAtrasoDias}
                            onBlur={(e) => {
                                const v = Math.max(0, Number(e.target.value) || 0);
                                if (v !== cfg.whatsappAtrasoDias) salvar({ whatsappAtrasoDias: v });
                            }}
                            className="w-20 border border-gray-300 rounded px-3 py-2 text-sm text-right font-semibold focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                        <span className="text-xs text-gray-500">dias</span>
                    </div>
                </div>

                {salvando && (
                    <p className="text-xs text-gray-400 flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin" /> salvando…
                    </p>
                )}
            </div>
        </div>
    );
};

export default ConferenciaCaixaConfigCard;
