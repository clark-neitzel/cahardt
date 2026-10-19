import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import inadimplenciaService from '../../../services/inadimplenciaService';
import CampoNumero from '../../../components/CampoNumero';

/**
 * Regras da "Venda a inadimplente" (só admin — o servidor também exige admin no PUT).
 * Manda ao servidor SÓ a chave que foi mexida (nunca o objeto inteiro).
 * O selo de atraso aparece desde o 1º dia; carência e valor mínimo valem só para TRAVAR a venda.
 */
const Toggle = ({ ligado, onClick, disabled, rotulo }) => (
    <button type="button" onClick={onClick} disabled={disabled} role="switch" aria-checked={ligado} aria-label={rotulo}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${ligado ? 'bg-primary' : 'bg-gray-300'}`}>
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${ligado ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
);

const quando = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
};

const UltimaMudanca = ({ info }) => {
    const nome = info?.usuarioNome || info?.nome;
    const em = quando(info?.em || info?.quando);
    if (!nome && !em) return <p className="text-[11px] text-gray-500 mt-0.5">Valor padrão — ninguém mudou ainda</p>;
    return <p className="text-[11px] text-gray-500 mt-0.5">Última mudança: {nome || 'alguém'}{em ? ` · ${em}` : ''}</p>;
};

const Linha = ({ titulo, descricao, info, children }) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
        <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-700">{titulo}</p>
            <p className="text-xs text-gray-600">{descricao}</p>
            <UltimaMudanca info={info} />
        </div>
        <div className="flex items-center gap-2 shrink-0">{children}</div>
    </div>
);

const VendaInadimplenteConfigCard = () => {
    const [cfg, setCfg] = useState(null);
    const [erroCarga, setErroCarga] = useState(false);
    const [salvando, setSalvando] = useState(false);
    // texto digitado nos campos numéricos (só vira PUT no blur, e só se mudou)
    const [digitado, setDigitado] = useState({});

    useEffect(() => {
        inadimplenciaService.getConfig().then(setCfg).catch(() => setErroCarga(true));
    }, []);

    const salvar = async (parcial) => {
        setSalvando(true);
        try {
            const novo = await inadimplenciaService.salvarConfig(parcial);
            setCfg(novo);
            setDigitado({});
            toast.success('Regra de venda a inadimplente atualizada.');
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao salvar.');
            setDigitado({}); // volta a mostrar o valor que está valendo
        } finally {
            setSalvando(false);
        }
    };

    if (erroCarga) return null;
    if (!cfg) return null;
    const um = cfg.ultimaMudanca || {};

    const campoNumero = (chave, { max, passo = '1', sufixo }) => {
        const atual = cfg[chave];
        return (
            <>
                <CampoNumero
 min="0" max={max} step={passo}
                    value={digitado[chave] ?? String(atual ?? '')}
                    disabled={salvando}
                    onChange={(e) => setDigitado(d => ({ ...d, [chave]: e.target.value }))}
                    onBlur={() => {
                        if (digitado[chave] === undefined) return;
                        if (String(digitado[chave]).trim() === '') { setDigitado({}); return; } // vazio não salva: volta ao valor atual
                        const v = Number(String(digitado[chave]).replace(',', '.'));
                        if (!Number.isFinite(v) || v < 0) { toast.error('Informe um número válido.'); setDigitado({}); return; }
                        if (v !== Number(atual)) salvar({ [chave]: v });
                        else setDigitado({});
                    }}
                    className="w-24 min-h-[44px] border border-gray-300 rounded px-3 py-2 text-sm text-right font-semibold focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                />
                <span className="text-xs text-gray-600 w-10">{sufixo}</span>
            </>
        );
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden" data-card-venda-inadimplente>
            <div className="p-4 md:p-6 border-b border-gray-100 bg-mint/40">
                <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-primary" />
                    Venda a inadimplente
                </h2>
                <p className="text-sm text-gray-600 mt-0.5">
                    Define quando um cliente em atraso trava a venda e o que a equipe pode fazer com ele.
                    O selo vermelho aparece desde o 1º dia de atraso; a carência e o valor mínimo valem só para <b>bloquear a venda</b>.
                </p>
            </div>

            <div className="p-4 md:p-6 space-y-3">
                <Linha titulo="Dias de carência" info={um.carenciaDias}
                    descricao="Só bloqueia a venda depois de quantos dias do vencimento.">
                    {campoNumero('carenciaDias', { max: 365, sufixo: 'dias' })}
                </Linha>

                <Linha titulo="Valor mínimo para bloquear" info={um.valorMinimoBloqueio}
                    descricao="Atrasos menores que isto aparecem com o selo, mas não travam a venda.">
                    <span className="text-xs text-gray-600">R$</span>
                    {campoNumero('valorMinimoBloqueio', { max: 100000, passo: '0.01', sufixo: '' })}
                </Linha>

                <Linha titulo="Pix/cartão/dinheiro vira “a confirmar” após" info={um.prazoAConfirmarDias}
                    descricao="Dias sem conciliação até o selo amarelo aparecer (pendência do escritório, não cobrança do cliente).">
                    {campoNumero('prazoAConfirmarDias', { max: 365, sufixo: 'dias' })}
                </Linha>

                <Linha titulo="Compra de funcionário nunca é inadimplência" info={um.funcionarioFora}
                    descricao={cfg.funcionarioFora ? 'Ligado — funcionário não recebe selo nem trava (desconto em folha).' : 'Desligado — compra de funcionário em atraso aparece como inadimplência.'}>
                    <Toggle ligado={!!cfg.funcionarioFora} disabled={salvando} rotulo="Compra de funcionário nunca é inadimplência"
                        onClick={() => salvar({ funcionarioFora: !cfg.funcionarioFora })} />
                </Linha>

                <Linha titulo="Motorista vê o atraso na entrega" info={um.motoristaVeAtraso}
                    descricao={cfg.motoristaVeAtraso ? 'Ligado — mostra a faixa amarela no checkout (não bloqueia a entrega).' : 'Desligado — o motorista não vê o atraso do cliente.'}>
                    <Toggle ligado={!!cfg.motoristaVeAtraso} disabled={salvando} rotulo="Motorista vê o atraso na entrega"
                        onClick={() => salvar({ motoristaVeAtraso: !cfg.motoristaVeAtraso })} />
                </Linha>

                <Linha titulo="Pedido do site/Ana exige responsável para liberar" info={um.siteExigeResponsavel}
                    descricao="Sempre ligado — regra do dono, não pode ser desligada.">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600" title="Regra fixa">
                        <Lock className="h-4 w-4" /> Fixa
                    </span>
                    <Toggle ligado disabled rotulo="Pedido do site/Ana exige responsável (fixo)" onClick={() => {}} />
                </Linha>

                {salvando && (
                    <p className="text-xs text-gray-500 flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin" /> salvando…
                    </p>
                )}
            </div>
        </div>
    );
};

export default VendaInadimplenteConfigCard;
