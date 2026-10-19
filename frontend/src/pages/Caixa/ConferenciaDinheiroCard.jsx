import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Banknote, Calculator, CheckCircle2, AlertTriangle, X, Lock, Undo2, Send, Clock, ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import SelectBusca from '../../components/SelectBusca';
import CampoNumero, { CampoNumeroComBotoes } from '../../components/CampoNumero';
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

const novoId = () => (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    }));

const CLASSE_INPUT = 'border border-gray-300 rounded-lg text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none';

// FORA do componente de propósito: declarada dentro, a cada tecla o React trata
// como um tipo novo, remonta a linha e o campo PERDE O FOCO no meio da digitação
// (digitar "18" virava "1"). Pego no teste de clique.
// Larguras FIXAS (nota | [−] campo [+] | subtotal): sem isso o layout redistribui as
// colunas quando o subtotal aparece ("—" vira "R$ 700,00") e os campos pulam.
// `aba` marca em qual aba do celular o campo mora (usado pelo Enter para trocar de aba).
const LinhaContagem = ({ valor, mapa, setMapa, moeda, aba }) => {
    const q = qtdDe(mapa, valor);
    const sub = Math.round(q * valor * 100) / 100;
    const rotulo = moeda ? rotuloMoeda(valor) : `R$ ${valor}`;
    return (
        <div className="grid grid-cols-[4.25rem_1fr_5.5rem] items-center gap-1 py-1 border-b border-gray-50 last:border-0">
            <span className="font-semibold text-gray-900 text-sm whitespace-nowrap">{rotulo}</span>
            <CampoNumeroComBotoes
                value={mapa[String(valor)] ?? ''}
                onChange={e => setMapa(m => ({ ...m, [String(valor)]: e.target.value }))}
                min={0} max={9999} placeholder="0" rotulo={`notas de ${rotulo}`}
                data-contagem="1" data-aba={aba} onFocus={e => e.target.select()}
                className={`w-14 min-h-[44px] md:min-h-0 md:h-9 px-1 font-bold text-center ${CLASSE_INPUT}`}
            />
            <span className={`text-right text-sm tabular-nums ${sub > 0 ? 'text-gray-800 font-semibold' : 'text-gray-400'}`}>
                {sub > 0 ? brl(sub) : '—'}
            </span>
        </div>
    );
};

const CabecalhoSecao = ({ children }) => (
    <div className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-1">{children}</div>
);

const converterOutros = (v) => Number(String(v).replace(',', '.')) || 0;

// ─────────────────────────────────────────────────────────────────────────────
// Modal: contar (só anota) ou conferir (fecha a conferência do dinheiro)
// ─────────────────────────────────────────────────────────────────────────────
const ModalConferir = ({
    aberto, onFechar, onOk, vendedorId, vendedorNome, data, valorEsperado, minhaQuebra, semMovimento,
    modo = 'conferir', inicial = null,
}) => {
    const contar = modo === 'contar';
    const [cedulas, setCedulas] = useState({});
    const [moedas, setMoedas] = useState({});
    const [outros, setOutros] = useState([]);
    const [observacao, setObservacao] = useState('');
    const [motivo, setMotivo] = useState('');
    const [motivoTipo, setMotivoTipo] = useState('');
    const [autorizadores, setAutorizadores] = useState([]);
    const [autorizadorId, setAutorizadorId] = useState('');
    const [senha, setSenha] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [aba, setAba] = useState('cedulas');
    const idContagem = useRef(novoId());
    const raiz = useRef(null);
    const corpo = useRef(null);
    useEffect(() => { corpo.current?.scrollTo?.({ top: 0 }); }, [aba]);

    useEffect(() => {
        if (!aberto) return;
        const ced = {}; const moe = {};
        Object.entries(inicial?.cedulas || {}).forEach(([k, q]) => { ced[k] = String(q); });
        Object.entries(inicial?.moedas || {}).forEach(([k, q]) => { moe[k] = String(q); });
        setCedulas(ced); setMoedas(moe);
        setOutros((inicial?.outros || []).map(o => ({ descricao: o.descricao || '', valor: String(o.valor ?? '') })));
        setObservacao(inicial?.observacao || ''); setMotivo(''); setMotivoTipo('');
        setAutorizadorId(''); setSenha(''); setAba('cedulas');
        idContagem.current = novoId();
        if (!contar) {
            caixaService.getAutorizadoresDiferenca().then(setAutorizadores).catch(() => setAutorizadores([]));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aberto]);

    const qtd = qtdDe;

    const totais = useMemo(() => {
        let totalCedulas = 0, pecasCedulas = 0, totalMoedas = 0, pecasMoedas = 0;
        CEDULAS.forEach(v => { const q = qtd(cedulas, v); totalCedulas += q * v; pecasCedulas += q; });
        MOEDAS.forEach(v => { const q = qtd(moedas, v); totalMoedas += q * v; pecasMoedas += q; });
        const totalOutros = outros.reduce((s, o) => s + converterOutros(o.valor), 0);
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

    const temDiferenca = !contar && Math.abs(totais.diferenca) > 0.009;
    const passouQuebra = temDiferenca && Math.abs(totais.diferenca) > Number(minhaQuebra || 0) + 0.009;
    const faltando = totais.diferenca < 0;

    // Chip "Quebra de caixa": o texto acompanha o sinal da diferença; sem diferença os chips somem.
    useEffect(() => {
        if (!temDiferenca) {
            if (motivoTipo) { setMotivoTipo(''); setMotivo(''); }
            return;
        }
        if (motivoTipo === 'QUEBRA_DE_CAIXA') setMotivo(`Quebra de caixa (${faltando ? 'falta' : 'sobra'})`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [temDiferenca, faltando, motivoTipo]);

    const escolherTipo = (tipo) => {
        if (tipo === motivoTipo) return;
        setMotivoTipo(tipo);
        if (tipo === 'OUTRO') setMotivo('');
    };

    const podeConfirmar = contar
        ? totais.total > 0
        : semMovimento
            ? true
            : (!temDiferenca || (motivoTipo && motivo.trim() && (!passouQuebra || (autorizadorId && senha))));

    const montarContagem = () => ({
        cedulas: Object.fromEntries(CEDULAS.map(v => [String(v), qtd(cedulas, v)]).filter(([, q]) => q > 0)),
        moedas: Object.fromEntries(MOEDAS.map(v => [String(v), qtd(moedas, v)]).filter(([, q]) => q > 0)),
        outros: outros
            .filter(o => converterOutros(o.valor) > 0)
            .map(o => ({ descricao: o.descricao || 'Outros', valor: converterOutros(o.valor) })),
    });

    const confirmar = useCallback(async () => {
        if (salvando) return;
        setSalvando(true);
        try {
            if (contar) {
                const r = await caixaService.registrarContagemDinheiro({
                    id: idContagem.current, vendedorId, data,
                    contagem: montarContagem(),
                    observacao: observacao.trim() || null,
                });
                toast.success(r?.duplicado ? 'Contagem já estava salva.' : `Contagem salva: ${brl(totais.total)}.`);
                onOk?.(r);
                onFechar();
                return;
            }
            const payload = {
                vendedorId, data,
                observacao: observacao.trim() || null,
                motivoDiferenca: temDiferenca ? motivo.trim() : null,
                motivoTipo: temDiferenca ? (motivoTipo || 'OUTRO') : null,
                autorizadorId: passouQuebra ? autorizadorId : null,
                autorizadorSenha: passouQuebra ? senha : null,
            };
            if (semMovimento) payload.valorContado = 0;
            else payload.contagem = montarContagem();
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
            toast.error(e.response?.data?.error || (contar ? 'Erro ao salvar a contagem.' : 'Erro ao conferir o dinheiro.'));
        } finally {
            setSalvando(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [salvando, contar, vendedorId, data, observacao, motivo, motivoTipo, temDiferenca, passouQuebra, autorizadorId, senha,
        semMovimento, cedulas, moedas, outros, totais.diferenca, totais.total, faltando, onOk, onFechar]);

    // Enter pula para a próxima nota (cédulas, moedas, outros valores); na última vai ao botão.
    // No celular a próxima pode estar em outra aba: troca de aba e foca depois de renderizar.
    const aoTeclar = (e) => {
        if (e.key !== 'Enter' || !e.target.matches?.('[data-contagem]')) return;
        e.preventDefault();
        const campos = Array.from(raiz.current?.querySelectorAll('[data-contagem]') || []);
        const prox = campos[campos.indexOf(e.target) + 1];
        const focar = (el) => { el.focus(); el.select?.(); };
        if (prox) {
            if (prox.offsetParent !== null) focar(prox);
            else { setAba(prox.dataset.aba || 'cedulas'); setTimeout(() => focar(prox), 30); }
            return;
        }
        const fim = Array.from(raiz.current?.querySelectorAll('[data-fim]') || []).find(b => b.offsetParent !== null);
        fim?.focus();
    };

    if (!aberto) return null;

    const vis = (nome) => (aba === nome ? 'block' : 'hidden');
    const rotuloBotao = salvando
        ? 'Gravando…'
        : contar
            ? 'Salvar contagem'
            : semMovimento
                ? '🖐️ Conferi: não havia dinheiro a receber'
                : temDiferenca
                    ? `Confirmar com ${faltando ? 'falta' : 'sobra'} de ${brl(Math.abs(totais.diferenca))}`
                    : '🖐️ Confirmo que conferi o dinheiro';
    const classeBotao = `w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full font-semibold text-sm min-h-[48px] shadow-sm
        ${!podeConfirmar || salvando
            ? 'bg-gray-200 text-gray-500'
            : temDiferenca ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-primary hover:bg-primaryDark text-white'}`;

    const abas = [
        { id: 'cedulas', nome: 'Cédulas', valor: totais.totalCedulas },
        { id: 'moedas', nome: 'Moedas', valor: totais.totalMoedas },
        { id: 'outros', nome: 'Outros', valor: null },
    ];

    return (
        <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4" onClick={onFechar}>
            <div
                ref={raiz} onKeyDown={aoTeclar}
                className="bg-white w-full md:max-w-3xl lg:max-w-5xl rounded-t-2xl md:rounded-2xl shadow-2xl h-[92dvh] md:h-auto max-h-[95vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="bg-house px-4 md:px-5 py-3 flex items-center gap-3 rounded-t-2xl shrink-0">
                    <Calculator className="h-6 w-6 text-white shrink-0" />
                    <div className="text-white flex-1 min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-white/60 truncate">
                            {vendedorNome} · {dataBR(data)}
                        </div>
                        <div className="font-bold text-base leading-tight">
                            {contar ? 'Contagem do dinheiro' : 'Conferência do dinheiro'}
                        </div>
                    </div>
                    <button onClick={onFechar} aria-label="Fechar" className="p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10 shrink-0">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Celular: abas (só para contagem de verdade; dia sem movimento não tem tabela) */}
                {!semMovimento && (
                    <div className="md:hidden shrink-0 px-3 pt-3">
                        <div className="flex bg-mint/60 rounded-full p-1 gap-1">
                            {abas.map(a => (
                                <button key={a.id} type="button" onClick={() => setAba(a.id)}
                                    className={`flex-1 min-h-[44px] rounded-full text-xs font-bold leading-tight px-1
                                        ${aba === a.id ? 'bg-white text-house shadow-sm' : 'text-gray-600'}`}>
                                    {a.nome}
                                    {a.valor > 0 && <span className="block text-[10px] font-semibold text-primaryDark tabular-nums">{brl(a.valor)}</span>}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div ref={corpo} className="p-3 md:p-4 overflow-y-auto flex-1 min-h-0">
                    {semMovimento ? (
                        <div className="max-w-xl mx-auto space-y-3">
                            <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                                <span className="text-sm text-gray-600">Valor a prestar segundo o sistema</span>
                                <span className="text-base font-bold text-gray-900 tabular-nums">{brl(valorEsperado)}</span>
                            </div>
                            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                                Dia sem dinheiro a receber. Confirme que <b>não havia valor a prestar</b> — é isso que encerra o dia.
                            </div>
                            <input
                                value={observacao} onChange={e => setObservacao(e.target.value)}
                                placeholder="Observação (opcional)"
                                className={`w-full px-3 py-2 ${CLASSE_INPUT}`}
                            />
                            <div className="hidden md:flex flex-col gap-2">
                                <button type="button" data-fim="1" onClick={confirmar} disabled={!podeConfirmar || salvando} className={classeBotao}>
                                    {rotuloBotao}
                                </button>
                                <button type="button" onClick={onFechar}
                                    className="w-full px-4 py-2.5 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm">
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
                            {/* Coluna 1: cédulas */}
                            <div className={`${vis('cedulas')} md:block border border-gray-200 rounded-xl p-3`}>
                                <CabecalhoSecao>Cédulas</CabecalhoSecao>
                                <div className="grid grid-cols-[4.25rem_1fr_5.5rem] gap-1 text-[10px] uppercase tracking-wide text-gray-500 font-bold pb-1">
                                    <span>Nota</span><span className="text-center">Quantas</span><span className="text-right">Subtotal</span>
                                </div>
                                {CEDULAS.map(v => <LinhaContagem key={v} valor={v} mapa={cedulas} setMapa={setCedulas} aba="cedulas" />)}
                            </div>

                            {/* Coluna 2: moedas + outros valores */}
                            <div className={`${aba === 'cedulas' ? 'hidden' : 'block'} md:block space-y-3`}>
                                <div className={`${vis('moedas')} md:block border border-gray-200 rounded-xl p-3`}>
                                    <CabecalhoSecao>Moedas</CabecalhoSecao>
                                    {MOEDAS.map(v => <LinhaContagem key={v} valor={v} mapa={moedas} setMapa={setMoedas} moeda aba="moedas" />)}
                                </div>
                                <div className={`${vis('outros')} md:block border border-gray-200 rounded-xl p-3`}>
                                    <CabecalhoSecao>Outros valores</CabecalhoSecao>
                                    {outros.map((o, i) => (
                                        <div key={i} className="flex gap-2 mb-2">
                                            <input
                                                value={o.descricao}
                                                onChange={e => setOutros(l => l.map((x, j) => j === i ? { ...x, descricao: e.target.value } : x))}
                                                placeholder="Cheque, vale…"
                                                className={`flex-1 min-w-0 px-2.5 min-h-[44px] md:min-h-0 md:py-1.5 ${CLASSE_INPUT}`}
                                            />
                                            <CampoNumero
                                                decimal casas={2} value={o.valor} placeholder="0,00"
                                                data-contagem="1" data-aba="outros"
                                                onChange={e => setOutros(l => l.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))}
                                                className={`w-24 px-2.5 min-h-[44px] md:min-h-0 md:py-1.5 text-right font-semibold ${CLASSE_INPUT}`}
                                            />
                                            <button type="button" aria-label="Remover" onClick={() => setOutros(l => l.filter((_, j) => j !== i))}
                                                className="p-2.5 md:p-1.5 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-100">
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                    <button type="button"
                                        onClick={() => setOutros(l => [...l, { descricao: '', valor: '' }])}
                                        className="min-h-[44px] md:min-h-0 text-xs font-semibold text-primary hover:text-primaryDark"
                                    >
                                        + outro valor (cheque, vale…)
                                    </button>
                                </div>
                                <div className={`${vis('outros')} md:block border border-gray-200 rounded-xl p-3`}>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Observação (opcional)</label>
                                    <input
                                        value={observacao} onChange={e => setObservacao(e.target.value)}
                                        placeholder={contar ? 'Ex.: recebi do motorista às 14h' : 'Ex.: recebido no balcão, notas conferidas'}
                                        className={`w-full px-3 py-2 ${CLASSE_INPUT}`}
                                    />
                                </div>
                            </div>

                            {/* Coluna 3: resumo (no celular vive na aba Outros) */}
                            <div className={`${vis('outros')} md:block md:col-span-2 lg:col-span-1 border border-gray-200 rounded-xl p-3 space-y-3`}>
                                <div className="hidden md:flex items-center justify-between bg-house text-white rounded-xl px-4 py-3">
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-white/60">Total contado</div>
                                        <div className="text-[11px] text-white/70">{totais.pecas} peça(s) de dinheiro</div>
                                    </div>
                                    <div className="text-2xl font-bold tabular-nums">{brl(totais.total)}</div>
                                </div>

                                {contar ? (
                                    <div className="rounded-xl px-3 py-2.5 text-sm bg-gray-100 border border-gray-200 text-gray-700">
                                        É só uma <b>contagem</b>. Não fecha o caixa, não pede motivo nem senha. Fica anotada no dia
                                        do motorista com seu nome e a hora.
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                                            <span className="text-sm text-gray-600">Valor a prestar segundo o sistema</span>
                                            <span className="text-base font-bold text-gray-900 tabular-nums">{brl(valorEsperado)}</span>
                                        </div>
                                        {temDiferenca ? (
                                            <div className={`rounded-xl px-3 py-2.5 text-sm border ${passouQuebra ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                                                <b>{faltando ? 'Faltam' : 'Sobram'} {brl(Math.abs(totais.diferenca))}.</b>{' '}
                                                {passouQuebra
                                                    ? `Passa da sua quebra de caixa (${brl(minhaQuebra)}) — precisa da senha de quem autoriza.`
                                                    : `Dentro da sua quebra de caixa (${brl(minhaQuebra)}) — você pode fechar a conferência.`}
                                            </div>
                                        ) : (
                                            <div className="rounded-xl px-3 py-2.5 text-sm bg-green-50 border border-green-200 text-green-800 flex items-center gap-2">
                                                <CheckCircle2 className="h-4 w-4 shrink-0" /> <b>Bate certo.</b> Nenhuma diferença.
                                            </div>
                                        )}
                                    </>
                                )}

                                {temDiferenca && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Motivo da diferença <span className="text-red-600">*</span>
                                            </label>
                                            <div className="flex flex-wrap gap-2 mb-2">
                                                {[['QUEBRA_DE_CAIXA', 'Quebra de caixa'], ['OUTRO', 'Outro motivo…']].map(([tipo, nome]) => (
                                                    <button key={tipo} type="button" onClick={() => escolherTipo(tipo)}
                                                        aria-pressed={motivoTipo === tipo}
                                                        className={`px-3.5 py-2 min-h-[44px] md:min-h-0 md:py-1.5 rounded-full text-xs font-semibold border
                                                            ${motivoTipo === tipo
                                                                ? 'bg-mint text-primaryDark border-primary'
                                                                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                                                        {nome}
                                                    </button>
                                                ))}
                                            </div>
                                            <input
                                                value={motivo} onChange={e => setMotivo(e.target.value)}
                                                readOnly={motivoTipo === 'QUEBRA_DE_CAIXA'}
                                                disabled={!motivoTipo}
                                                placeholder={motivoTipo ? 'Ex.: pagou peça do carro e não lançou a despesa' : 'Escolha uma opção acima'}
                                                className={`w-full px-3 py-2 ${CLASSE_INPUT} ${motivoTipo === 'QUEBRA_DE_CAIXA' ? 'bg-gray-50 text-gray-700' : ''} disabled:bg-gray-50`}
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
                                                        className={`w-full px-3 py-2 ${CLASSE_INPUT}`}
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

                                {/* Botões no desktop/iPad (no celular ficam no rodapé fixo) */}
                                <div className="hidden md:flex flex-col gap-2 pt-1">
                                    <button type="button" data-fim="1" onClick={confirmar} disabled={!podeConfirmar || salvando} className={classeBotao}>
                                        {rotuloBotao}
                                    </button>
                                    <button type="button" onClick={onFechar}
                                        className="w-full px-4 py-2.5 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm">
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Rodapé fixo do celular: total + botão sempre à mão */}
                <div className="md:hidden shrink-0 border-t border-gray-200 bg-white px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2">
                    {!semMovimento && (
                        <div className="flex items-center justify-between bg-house text-white rounded-xl px-4 py-2">
                            <div className="text-[11px] text-white/70">
                                <span className="font-bold uppercase tracking-widest text-white/60 text-[10px]">Total contado</span>
                                <div>{totais.pecas} peça(s)</div>
                            </div>
                            <div className="text-xl font-bold tabular-nums">{brl(totais.total)}</div>
                        </div>
                    )}
                    {semMovimento && (
                        <button type="button" onClick={onFechar}
                            className="w-full px-4 py-2.5 bg-white border border-primary text-primary rounded-full font-medium text-sm min-h-[44px]">
                            Cancelar
                        </button>
                    )}
                    {!podeConfirmar && !contar && !semMovimento && temDiferenca && aba !== 'outros' && (
                        <button type="button" onClick={() => setAba('outros')} className="w-full text-xs font-semibold text-primary min-h-[44px]">
                            Falta o motivo da diferença — toque aqui (aba Outros)
                        </button>
                    )}
                    <button type="button" data-fim="1" onClick={confirmar} disabled={!podeConfirmar || salvando} className={classeBotao}>
                        {rotuloBotao}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Cartão na tela do Caixa
// ─────────────────────────────────────────────────────────────────────────────
const ConferenciaDinheiroCard = ({ conferencia, vendedorId, vendedorNome, data, valorAPrestar, caixaStatus, temMovimento = true, onAtualizar }) => {
    const [modal, setModal] = useState(null); // null | { modo: 'contar'|'conferir', inicial }
    const [verHistorico, setVerHistorico] = useState(false);
    const [ocupado, setOcupado] = useState(false);

    if (!conferencia) return null;

    const {
        exigida, ativa, conferido, conferidoPorNome, conferidoEm, valorContado, diferenca,
        motivoDiferenca, autorizadoPorNome, observacao, desatualizada, valorNaConferencia,
        enviadoEm, enviadoPorNome, enviadoOrigem, podeConferir, bloqueadoPorSerDono, minhaQuebra, contagem,
        contagens,
    } = conferencia;
    const listaContagens = Array.isArray(contagens) ? contagens : [];
    const ultima = listaContagens[0] || null;
    const anteriores = listaContagens.slice(1);
    const podeUsarConferir = podeConferir && !bloqueadoPorSerDono;

    const fechado = caixaStatus !== 'ABERTO';
    const semMovimento = Math.abs(Number(valorAPrestar || 0)) < 0.009;
    // Contar nunca depende da chave caixa_conferencia nem da permissão de conferir.
    const podeContar = !semMovimento;

    // 10/2026: caixa sem NENHUM movimento no dia (sem entrega, despesa, adiantamento,
    // cobrança em dinheiro ou baixa de título) não entra mais na fila de conferência —
    // nem pela virada do dia, nem pelo clique manual em "Enviar"/Imprimir (o backend
    // devolve enviado:false,motivo:'SEM_MOVIMENTO' e não grava nada). Mostrar o card
    // cheio pedindo pra "conferir caixa sem dinheiro (R$ 0,00)" nesse caso só confunde
    // quem olha um dia vazio — uma linha discreta já deixa claro que não há nada a fazer
    // aqui. Não se aplica quando já existe uma conferência registrada (`conferido`):
    // aquele R$ 0,00 foi contado de propósito por alguém e o registro continua valendo.
    const enviar = async () => {
        setOcupado(true);
        try {
            const res = await caixaService.enviarParaConferencia({ vendedorId, data, origem: 'MANUAL' });
            if (res?.enviado === false && res?.motivo === 'SEM_MOVIMENTO') {
                toast('Caixa sem movimento — não precisa de conferência do dinheiro.', { icon: 'ℹ️' });
            } else {
                toast.success('Caixa enviado para conferência do dinheiro.');
            }
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

    // Caixa sem nenhum movimento e nunca conferido: nada a fazer aqui (ver nota acima).
    // Vale tanto ABERTO (dia vazio, ainda rodando) quanto FECHADO (fechou sozinho sem
    // passar pela fila, pela regra nova) — a mensagem serve pros dois.
    if (!temMovimento) {
        return (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4">
                <div className="flex items-center gap-2 px-5 py-3.5 text-gray-500">
                    <Banknote className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="text-sm">Sem movimento no dia — não precisa conferir dinheiro.</span>
                </div>
            </div>
        );
    }

    // Caixa fechado SEM conferência do dinheiro (acontece enquanto a regra está
    // desligada, ou em caixa antigo). Some o botão de contar — o dinheiro se
    // confere antes de fechar — mas o cartão continua dizendo isso na cara,
    // senão o usuário procura a contagem e só acha o botão antigo.
    if (fechado) {
        return (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                    <Banknote className="h-4 w-4 text-gray-400" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Conferência do dinheiro</span>
                </div>
                <div className="p-4 md:p-5">
                    <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-600">
                        <b>Este caixa foi fechado sem a conferência do dinheiro.</b>
                        <div className="text-xs mt-1">
                            A contagem é feita <b>antes</b> de fechar, no botão “Conferir o dinheiro” deste cartão.
                            Para contar agora, é preciso <b>reabrir o caixa</b> (botão abaixo, para quem tem permissão).
                        </div>
                    </div>
                </div>
            </div>
        );
    }

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

                    {ultima && (
                        <div className="mt-3 rounded-xl bg-mint/60 border border-primary/20 px-3 py-2.5 text-sm text-house">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                <Calculator className="h-4 w-4 text-primaryDark shrink-0" />
                                <div className="flex-1 min-w-[12rem]">
                                    <b className="tabular-nums">{brl(ultima.total)}</b>
                                    {ultima.pecas != null && <span> · {ultima.pecas} peça(s)</span>}
                                    <div className="text-xs text-house/75">
                                        Contado{ultima.contadoPorNome ? ` por ${ultima.contadoPorNome}` : ''} às {hora(ultima.criadoEm)}
                                        {ultima.observacao ? ` · “${ultima.observacao}”` : ''}
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {podeUsarConferir && (
                                        <button onClick={() => setModal({ modo: 'conferir', inicial: { ...(ultima.detalhe || {}), observacao: ultima.observacao || '' } })}
                                            disabled={ocupado}
                                            className="px-3.5 py-2 min-h-[44px] md:min-h-0 md:py-1.5 bg-primary hover:bg-primaryDark text-white rounded-full text-xs font-semibold disabled:opacity-50">
                                            Usar na conferência
                                        </button>
                                    )}
                                    {podeContar && (
                                        <button onClick={() => setModal({ modo: 'contar', inicial: null })}
                                            className="px-3.5 py-2 min-h-[44px] md:min-h-0 md:py-1.5 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-xs font-semibold">
                                            Contar de novo
                                        </button>
                                    )}
                                </div>
                            </div>
                            {anteriores.length > 0 && (
                                <div className="mt-2">
                                    <button onClick={() => setVerHistorico(v => !v)}
                                        className="inline-flex items-center gap-1 text-xs font-semibold text-primaryDark min-h-[44px] md:min-h-0">
                                        Contagens anteriores do dia ({anteriores.length})
                                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${verHistorico ? 'rotate-180' : ''}`} />
                                    </button>
                                    {verHistorico && (
                                        <ul className="mt-1 space-y-1 text-xs text-house/80">
                                            {anteriores.map(c => (
                                                <li key={c.id} className="flex flex-wrap gap-x-2">
                                                    <span className="tabular-nums font-semibold">{brl(c.total)}</span>
                                                    <span>{c.pecas != null ? `${c.pecas} peça(s) · ` : ''}{c.contadoPorNome || 'alguém'} às {hora(c.criadoEm)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2 mt-3">
                        {podeContar && !ultima && (
                            <button onClick={() => setModal({ modo: 'contar', inicial: null })} disabled={ocupado}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm min-h-[44px] disabled:opacity-50">
                                <Calculator className="h-4 w-4" /> Contar o dinheiro
                            </button>
                        )}
                        {podeConferir && (
                            <button onClick={() => setModal({ modo: 'conferir', inicial: null })} disabled={ocupado}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm min-h-[44px] disabled:opacity-50">
                                <CheckCircle2 className="h-4 w-4" />
                                {semMovimento ? 'Conferir caixa sem dinheiro (R$ 0,00)' : `Conferir e fechar — ${brl(valorAPrestar)}`}
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
                            <AlertTriangle className="h-3 w-3" /> Só quem tem a permissão “Conferir Dinheiro do Caixa” pode conferir e fechar. Contar o dinheiro está liberado.
                        </p>
                    )}
                </div>
            </div>

            <ModalConferir
                aberto={!!modal}
                modo={modal?.modo || 'conferir'}
                inicial={modal?.inicial || null}
                onFechar={() => setModal(null)}
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
