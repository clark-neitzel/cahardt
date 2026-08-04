import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Banknote, Calculator, CheckCircle2, AlertTriangle, X, Lock, Undo2, Send, Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import SelectBusca from '../../components/SelectBusca';
import caixaService from '../../services/caixaService';

// Cédulas e moedas do real. A pessoa digita a quantidade; o total sai da contagem
// (nunca é digitado à mão) — é o que impede "bater" o valor no olho.
const CEDULAS = [200, 100, 50, 20, 10, 5, 2];
const MOEDAS = [1, 0.5, 0.25, 0.1, 0.05];

const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const rotuloMoeda = (v) => `R$ ${v.toFixed(2).replace('.', ',')}`;
const dataBR = (s) => (s ? String(s).split('-').reverse().join('/') : '');
const hora = (d) => (d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');

const qtdDe = (mapa, v) => {
    const n = parseInt(mapa?.[String(v)], 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
};

// FORA do componente de propósito: declarada dentro, a cada tecla o React trata
// como um tipo novo, remonta a linha e o campo PERDE O FOCO no meio da digitação
// (digitar "18" virava "1"). Pego no teste de clique.
const LinhaContagem = ({ valor, mapa, setMapa, moeda }) => {
    const q = qtdDe(mapa, valor);
    const sub = Math.round(q * valor * 100) / 100;
    return (
        <tr className="border-b border-gray-50 last:border-0">
            <td className="py-1.5 pr-2 font-semibold text-gray-900 text-sm whitespace-nowrap">
                {moeda ? rotuloMoeda(valor) : `R$ ${valor}`}
            </td>
            <td className="py-1.5 px-1 text-center">
                <input
                    type="number" min="0" inputMode="numeric" placeholder="0"
                    value={mapa[String(valor)] ?? ''}
                    onChange={e => setMapa(m => ({ ...m, [String(valor)]: e.target.value }))}
                    className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-bold text-center
                               focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                />
            </td>
            <td className={`py-1.5 pl-2 text-right text-sm tabular-nums ${sub > 0 ? 'text-gray-800 font-semibold' : 'text-gray-300'}`}>
                {sub > 0 ? brl(sub) : '—'}
            </td>
        </tr>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Modal: contar o dinheiro
// ─────────────────────────────────────────────────────────────────────────────
const ModalConferir = ({ aberto, onFechar, onOk, vendedorId, vendedorNome, data, valorEsperado, minhaQuebra, semMovimento }) => {
    const [cedulas, setCedulas] = useState({});
    const [moedas, setMoedas] = useState({});
    const [outros, setOutros] = useState([]);
    const [observacao, setObservacao] = useState('');
    const [motivo, setMotivo] = useState('');
    const [autorizadores, setAutorizadores] = useState([]);
    const [autorizadorId, setAutorizadorId] = useState('');
    const [senha, setSenha] = useState('');
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        if (!aberto) return;
        setCedulas({}); setMoedas({}); setOutros([]);
        setObservacao(''); setMotivo(''); setAutorizadorId(''); setSenha('');
        caixaService.getAutorizadoresDiferenca().then(setAutorizadores).catch(() => setAutorizadores([]));
    }, [aberto]);

    const qtd = qtdDe;

    const totais = useMemo(() => {
        let totalCedulas = 0, pecasCedulas = 0, totalMoedas = 0, pecasMoedas = 0;
        CEDULAS.forEach(v => { const q = qtd(cedulas, v); totalCedulas += q * v; pecasCedulas += q; });
        MOEDAS.forEach(v => { const q = qtd(moedas, v); totalMoedas += q * v; pecasMoedas += q; });
        const totalOutros = outros.reduce((s, o) => s + (Number(String(o.valor).replace(',', '.')) || 0), 0);
        const total = Math.round((totalCedulas + totalMoedas + totalOutros) * 100) / 100;
        return {
            totalCedulas: Math.round(totalCedulas * 100) / 100,
            totalMoedas: Math.round(totalMoedas * 100) / 100,
            totalOutros: Math.round(totalOutros * 100) / 100,
            pecas: pecasCedulas + pecasMoedas,
            total,
            diferenca: Math.round((total - Number(valorEsperado || 0)) * 100) / 100,
        };
    }, [cedulas, moedas, outros, valorEsperado]);

    const temDiferenca = Math.abs(totais.diferenca) > 0.009;
    const passouQuebra = temDiferenca && Math.abs(totais.diferenca) > Number(minhaQuebra || 0) + 0.009;
    const faltando = totais.diferenca < 0;

    const podeConfirmar = semMovimento
        ? true
        : (!temDiferenca || (motivo.trim() && (!passouQuebra || (autorizadorId && senha))));

    const confirmar = useCallback(async () => {
        if (salvando) return;
        setSalvando(true);
        try {
            const payload = {
                vendedorId, data,
                observacao: observacao.trim() || null,
                motivoDiferenca: temDiferenca ? motivo.trim() : null,
                autorizadorId: passouQuebra ? autorizadorId : null,
                autorizadorSenha: passouQuebra ? senha : null,
            };
            if (semMovimento) {
                payload.valorContado = 0;
            } else {
                payload.contagem = {
                    cedulas: Object.fromEntries(CEDULAS.map(v => [String(v), qtd(cedulas, v)]).filter(([, q]) => q > 0)),
                    moedas: Object.fromEntries(MOEDAS.map(v => [String(v), qtd(moedas, v)]).filter(([, q]) => q > 0)),
                    outros: outros
                        .filter(o => Number(String(o.valor).replace(',', '.')) > 0)
                        .map(o => ({ descricao: o.descricao || 'Outros', valor: Number(String(o.valor).replace(',', '.')) })),
                };
            }
            const r = await caixaService.conferirDinheiro(payload);
            toast.success(
                temDiferenca
                    ? `Conferido com ${faltando ? 'falta' : 'sobra'} de ${brl(Math.abs(totais.diferenca))}.`
                    : 'Dinheiro conferido. O caixa já pode ser fechado.'
            );
            if (r?.tarefa) toast.success('Tarefa criada na agenda para cobrar a diferença.', { duration: 5000 });
            onOk?.(r);
            onFechar();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao conferir o dinheiro.');
        } finally {
            setSalvando(false);
        }
    }, [salvando, vendedorId, data, observacao, motivo, temDiferenca, passouQuebra, autorizadorId, senha,
        semMovimento, cedulas, moedas, outros, totais.diferenca, faltando, onOk, onFechar]);

    if (!aberto) return null;

    return (
        <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4" onClick={onFechar}>
            <div
                className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[95vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="bg-house px-4 md:px-5 py-3.5 flex items-center gap-3 rounded-t-2xl shrink-0">
                    <Calculator className="h-6 w-6 text-white shrink-0" />
                    <div className="text-white flex-1 min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-white/60 truncate">
                            {vendedorNome} · {dataBR(data)}
                        </div>
                        <div className="font-bold text-base leading-tight">Conferência do dinheiro</div>
                    </div>
                    <button onClick={onFechar} className="p-1.5 text-white/70 hover:text-white rounded-full hover:bg-white/10 shrink-0">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-4 md:p-5 overflow-y-auto space-y-3">
                    <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                        <span className="text-sm text-gray-600">Valor a prestar segundo o sistema</span>
                        <span className="text-base font-bold text-gray-900 tabular-nums">{brl(valorEsperado)}</span>
                    </div>

                    {semMovimento ? (
                        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                            Dia sem dinheiro a receber. Confirme que <b>não havia valor a prestar</b> — é isso que encerra o dia.
                        </div>
                    ) : (
                        <>
                            <div className="border border-gray-200 rounded-xl p-3">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-1">Cédulas</div>
                                <table className="w-full">
                                    <thead>
                                        <tr className="text-[10px] uppercase tracking-wide text-gray-400">
                                            <th className="text-left font-bold pb-1">Nota</th>
                                            <th className="text-center font-bold pb-1">Quantas</th>
                                            <th className="text-right font-bold pb-1">Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {CEDULAS.map(v => <LinhaContagem key={v} valor={v} mapa={cedulas} setMapa={setCedulas} />)}
                                    </tbody>
                                </table>

                                <div className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mt-3 mb-1">Moedas</div>
                                <table className="w-full">
                                    <tbody>
                                        {MOEDAS.map(v => <LinhaContagem key={v} valor={v} mapa={moedas} setMapa={setMoedas} moeda />)}
                                    </tbody>
                                </table>

                                {outros.map((o, i) => (
                                    <div key={i} className="flex gap-2 mt-2">
                                        <input
                                            value={o.descricao}
                                            onChange={e => setOutros(l => l.map((x, j) => j === i ? { ...x, descricao: e.target.value } : x))}
                                            placeholder="Cheque, vale…"
                                            className="flex-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                        />
                                        <input
                                            value={o.valor} inputMode="decimal" placeholder="0,00"
                                            onChange={e => setOutros(l => l.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))}
                                            className="w-24 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-right font-semibold focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                        />
                                        <button onClick={() => setOutros(l => l.filter((_, j) => j !== i))}
                                            className="p-1.5 text-gray-400 hover:text-red-600 rounded-full hover:bg-gray-100">
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    onClick={() => setOutros(l => [...l, { descricao: '', valor: '' }])}
                                    className="mt-2 text-xs font-semibold text-primary hover:text-primaryDark"
                                >
                                    + outro valor (cheque, vale…)
                                </button>
                            </div>

                            <div className="flex items-center justify-between bg-house text-white rounded-xl px-4 py-3">
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-white/60">Total contado</div>
                                    <div className="text-[11px] text-white/70">{totais.pecas} peça(s) de dinheiro</div>
                                </div>
                                <div className="text-2xl font-bold tabular-nums">{brl(totais.total)}</div>
                            </div>
                        </>
                    )}

                    {!semMovimento && (
                        temDiferenca ? (
                            <div className={`rounded-xl px-4 py-3 text-sm border ${passouQuebra ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                                <b>{faltando ? 'Faltam' : 'Sobram'} {brl(Math.abs(totais.diferenca))}.</b>{' '}
                                {passouQuebra
                                    ? `Passa da sua quebra de caixa (${brl(minhaQuebra)}) — precisa da senha de quem autoriza.`
                                    : `Dentro da sua quebra de caixa (${brl(minhaQuebra)}) — você pode fechar a conferência.`}
                            </div>
                        ) : (
                            <div className="rounded-xl px-4 py-3 text-sm bg-green-50 border border-green-200 text-green-800 flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 shrink-0" /> <b>Bate certo.</b> Nenhuma diferença.
                            </div>
                        )
                    )}

                    {temDiferenca && !semMovimento && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Motivo da diferença <span className="text-red-600">*</span>
                                </label>
                                <input
                                    value={motivo} onChange={e => setMotivo(e.target.value)}
                                    placeholder="Ex.: pagou peça do carro e não lançou a despesa"
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                />
                            </div>
                            {passouQuebra && (
                                <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 space-y-2">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Quem autoriza</label>
                                        <SelectBusca value={autorizadorId} onChange={e => setAutorizadorId(e.target.value)} className="w-full">
                                            <option value="">Selecione…</option>
                                            {autorizadores.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                                        </SelectBusca>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Senha do autorizador</label>
                                        <input
                                            type="password" value={senha} onChange={e => setSenha(e.target.value)}
                                            autoComplete="new-password"
                                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                        />
                                    </div>
                                    {autorizadores.length === 0 && (
                                        <p className="text-xs text-red-700">
                                            Ninguém tem a permissão “Autorizar Diferença no Caixa” ainda — peça ao administrador para liberar.
                                        </p>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Observação (opcional)</label>
                        <input
                            value={observacao} onChange={e => setObservacao(e.target.value)}
                            placeholder="Ex.: recebido no balcão, notas conferidas"
                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                    </div>
                </div>

                <div className="p-4 md:p-5 border-t border-gray-100 shrink-0 space-y-2">
                    <button
                        onClick={confirmar} disabled={!podeConfirmar || salvando}
                        className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full font-semibold text-sm min-h-[48px] shadow-sm
                            ${!podeConfirmar || salvando
                                ? 'bg-gray-200 text-gray-400'
                                : temDiferenca ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-primary hover:bg-primaryDark text-white'}`}
                    >
                        {salvando ? 'Gravando…' : semMovimento
                            ? '🖐️ Conferi: não havia dinheiro a receber'
                            : temDiferenca
                                ? `Confirmar com ${faltando ? 'falta' : 'sobra'} de ${brl(Math.abs(totais.diferenca))}`
                                : '🖐️ Confirmo que conferi o dinheiro'}
                    </button>
                    <button onClick={onFechar}
                        className="w-full px-4 py-2.5 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm min-h-[44px]">
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Cartão na tela do Caixa
// ─────────────────────────────────────────────────────────────────────────────
const ConferenciaDinheiroCard = ({ conferencia, vendedorId, vendedorNome, data, valorAPrestar, caixaStatus, onAtualizar }) => {
    const [modal, setModal] = useState(false);
    const [ocupado, setOcupado] = useState(false);

    if (!conferencia) return null;

    const {
        exigida, ativa, conferido, conferidoPorNome, conferidoEm, valorContado, diferenca,
        motivoDiferenca, autorizadoPorNome, observacao, desatualizada, valorNaConferencia,
        enviadoEm, enviadoPorNome, enviadoOrigem, podeConferir, bloqueadoPorSerDono, minhaQuebra, contagem,
    } = conferencia;

    const fechado = caixaStatus !== 'ABERTO';
    const semMovimento = Math.abs(Number(valorAPrestar || 0)) < 0.009;

    const enviar = async () => {
        setOcupado(true);
        try {
            await caixaService.enviarParaConferencia({ vendedorId, data, origem: 'MANUAL' });
            toast.success('Caixa enviado para conferência do dinheiro.');
            onAtualizar?.();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao enviar para conferência.');
        } finally { setOcupado(false); }
    };

    const desfazer = async () => {
        if (!window.confirm('Desfazer a conferência do dinheiro deste caixa?')) return;
        setOcupado(true);
        try {
            await caixaService.desfazerConferenciaDinheiro({ vendedorId, data });
            toast.success('Conferência desfeita.');
            onAtualizar?.();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao desfazer a conferência.');
        } finally { setOcupado(false); }
    };

    // Conferido e válido
    if (conferido) {
        const dif = Number(diferenca || 0);
        const temDif = Math.abs(dif) > 0.009;
        const pecas = contagem
            ? Object.values(contagem.cedulas || {}).reduce((s, q) => s + Number(q), 0)
            + Object.values(contagem.moedas || {}).reduce((s, q) => s + Number(q), 0)
            : 0;
        return (
            <div className="bg-white rounded-xl border border-green-200 shadow-sm mb-4">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-green-100 bg-green-50/60 rounded-t-xl">
                    <Banknote className="h-4 w-4 text-primaryDark" />
                    <span className="text-xs font-bold uppercase tracking-widest text-primaryDark">Dinheiro conferido</span>
                </div>
                <div className="p-4 md:p-5">
                    <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-900">
                        <b>✓ {conferidoPorNome}</b> conferiu em {dataBR(data)} às {hora(conferidoEm)} — {brl(valorContado)}
                        {temDif
                            ? <span className="text-red-700 font-semibold"> · {dif < 0 ? 'faltou' : 'sobrou'} {brl(Math.abs(dif))}</span>
                            : ' · sem diferença'}
                        {pecas > 0 && <div className="text-xs text-green-800/80 mt-1">{pecas} peça(s) de dinheiro contadas</div>}
                        {motivoDiferenca && <div className="text-xs text-red-800 mt-1">Motivo: {motivoDiferenca}</div>}
                        {autorizadoPorNome && <div className="text-xs text-green-800/80">Autorizado por {autorizadoPorNome}</div>}
                        {observacao && <div className="text-xs text-green-800/80 mt-1">“{observacao}”</div>}
                    </div>
                    {!fechado && (
                        <button onClick={desfazer} disabled={ocupado}
                            className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm min-h-[44px] disabled:opacity-50">
                            <Undo2 className="h-4 w-4" /> Desfazer conferência
                        </button>
                    )}
                </div>
            </div>
        );
    }

    if (fechado) return null; // caixa fechado sem conferência (regra desligada na época)

    return (
        <>
            <div className="bg-white rounded-xl border border-amber-200 shadow-sm mb-4">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-amber-100 bg-amber-50/60 rounded-t-xl">
                    <Banknote className="h-4 w-4 text-amber-700" />
                    <span className="text-xs font-bold uppercase tracking-widest text-amber-700">Conferência do dinheiro</span>
                    {!exigida && ativa === false && (
                        <span className="ml-auto text-[10px] font-semibold text-gray-400 uppercase tracking-wide">opcional por enquanto</span>
                    )}
                </div>
                <div className="p-4 md:p-5">
                    {desatualizada && (
                        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 mb-3">
                            <b>O valor mudou depois da conferência.</b> Era {brl(valorNaConferencia)} quando o dinheiro foi conferido,
                            agora é {brl(valorAPrestar)} — precisa conferir de novo.
                        </div>
                    )}

                    <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                        {enviadoEm ? (
                            <>
                                <b>Aguardando alguém contar o dinheiro.</b>{' '}
                                <span className="inline-flex items-center gap-1 text-xs">
                                    <Clock className="h-3 w-3" />
                                    enviado {enviadoOrigem === 'IMPRESSAO' ? 'ao imprimir a folha' : enviadoOrigem === 'VIRADA_DIA' ? 'pela virada do dia' : 'manualmente'}
                                    {enviadoPorNome ? ` por ${enviadoPorNome}` : ''} às {hora(enviadoEm)}
                                </span>
                            </>
                        ) : (
                            <><b>Este caixa ainda não foi para conferência.</b> Ao imprimir a folha ele entra na fila de quem recebe o dinheiro.</>
                        )}
                        {exigida && <div className="text-xs mt-1">Enquanto o dinheiro não for conferido, o caixa não pode ser fechado.</div>}
                    </div>

                    <div className="flex flex-wrap gap-2 mt-3">
                        {podeConferir && (
                            <button onClick={() => setModal(true)} disabled={ocupado}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm min-h-[44px] disabled:opacity-50">
                                <Calculator className="h-4 w-4" />
                                {semMovimento ? 'Conferir caixa sem dinheiro (R$ 0,00)' : `Conferir o dinheiro — ${brl(valorAPrestar)}`}
                            </button>
                        )}
                        {!enviadoEm && (
                            <button onClick={enviar} disabled={ocupado}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm min-h-[44px] disabled:opacity-50">
                                <Send className="h-4 w-4" /> Enviar para conferência
                            </button>
                        )}
                    </div>

                    {bloqueadoPorSerDono && (
                        <p className="text-xs text-gray-500 mt-2 flex items-center gap-1.5">
                            <Lock className="h-3 w-3" /> Você não pode conferir o dinheiro do próprio caixa — outra pessoa precisa contar.
                        </p>
                    )}
                    {!podeConferir && !bloqueadoPorSerDono && (
                        <p className="text-xs text-gray-500 mt-2 flex items-center gap-1.5">
                            <AlertTriangle className="h-3 w-3" /> Só quem tem a permissão “Conferir Dinheiro do Caixa” pode fazer a contagem.
                        </p>
                    )}
                </div>
            </div>

            <ModalConferir
                aberto={modal}
                onFechar={() => setModal(false)}
                onOk={onAtualizar}
                vendedorId={vendedorId}
                vendedorNome={vendedorNome}
                data={data}
                valorEsperado={valorAPrestar}
                minhaQuebra={minhaQuebra}
                semMovimento={semMovimento}
            />
        </>
    );
};

export default ConferenciaDinheiroCard;
