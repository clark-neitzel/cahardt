import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Loader2, Check, SlidersHorizontal, Lightbulb, MoreHorizontal, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import conciliacaoService from '../../services/conciliacaoBancariaService';
import SelectBusca from '../../components/SelectBusca';
import MultiSelect from '../../components/MultiSelect';
import FiltroPeriodo, { usePeriodoSalvo } from '../../components/FiltroPeriodo';
import { useFiltrosSalvos } from '../../hooks/useFiltrosSalvos';

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = (ymd) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : '');
const fmtDM = (ymd) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : '');
const cents = (v) => Math.round(Number(v || 0) * 100);

const COR_COND = {
    BOLETO: 'bg-blue-100 text-blue-800',
    PIX: 'bg-mint text-primaryDark',
    CARTAO: 'bg-purple-100 text-purple-700',
    DINHEIRO: 'bg-green-100 text-green-800',
};
const corCondicao = (cod) => {
    const c = String(cod || '').toUpperCase();
    if (c.includes('BOLETO')) return COR_COND.BOLETO;
    if (c.includes('PIX')) return COR_COND.PIX;
    if (c.includes('CARTAO') || c.includes('CREDITO') || c.includes('DEBITO')) return COR_COND.CARTAO;
    if (c.includes('DINHEIRO')) return COR_COND.DINHEIRO;
    return 'bg-gray-100 text-gray-700';
};

// Aceita '412,30', '412.30', '1.234,56', '1234' e '1.234' (milhar).
// Regra: com vírgula, a vírgula é o decimal e os pontos são milhar; sem vírgula,
// ponto seguido de exatamente 2 dígitos no fim é decimal; senão o ponto é milhar.
export function parseValorBR(txt) {
    let t = String(txt || '').replace(/[R$\s]/g, '');
    if (!t) return '';
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/\.\d{2}$/.test(t)) t = t.replace(/\.(?=.*\.)/g, '');
    else if (/^\d+\.\d$/.test(t)) { /* '412.3' = decimal */ }
    else t = t.replace(/\./g, '');
    return /^\d+(\.\d+)?$/.test(t) ? t : '';
}

const TOLERANCIAS = [['0', 'Exato'], ['5', '±5%'], ['10', '±10%'], ['25', '±25%']];

// Sugestão: subconjunto dos títulos que fecha EXATAMENTE o valor (em centavos).
// Limitado a 30 candidatos e a um teto de estados — nunca trava a tela.
function acharSubconjunto(titulos, alvoCents) {
    if (alvoCents <= 0) return null;
    const cand = titulos
        .map((t) => ({ t, c: cents(t.saldo) }))
        .filter((x) => x.c > 0 && x.c <= alvoCents)
        .sort((a, b) => b.c - a.c)
        .slice(0, 30);
    if (cand.length === 0) return null;
    const TETO = 150000;
    const alcancado = new Map(); // soma -> { i, prev }
    alcancado.set(0, { i: -1, prev: -1 });
    for (let i = 0; i < cand.length; i++) {
        const somas = Array.from(alcancado.keys());
        for (const s of somas) {
            const n = s + cand[i].c;
            if (n > alvoCents || alcancado.has(n)) continue;
            alcancado.set(n, { i, prev: s });
            if (n === alvoCents) {
                const ids = [];
                let cur = n;
                while (cur > 0) { const e = alcancado.get(cur); ids.push(cand[e.i].t); cur = e.prev; }
                return ids;
            }
        }
        if (alcancado.size > TETO) break;
    }
    return null;
}

/**
 * Conciliar um débito do extrato com VÁRIOS títulos do Contas a Pagar (pode ficar "Parcial").
 * Baixa sempre o saldo inteiro de cada título; valor diferente → "modo avançado" (BuscarModal).
 */
const ConciliarVariosModal = ({ lancamento, onClose, onSuccess, onAlterou, onAvancado, onCriarDespesa, onTransferir, onIgnorar }) => {
    const [parciais, setParciais] = useState(null);
    const [opcoes, setOpcoes] = useState({ condicoes: [], metodosPagamento: [] });
    const [periodo, periodoCtl] = usePeriodoSalvo('conciliacao-varios', 'mes');
    const [filtros, setFiltros] = useFiltrosSalvos('conciliacao-varios', { condicoes: [], tol: '10' });
    const [q, setQ] = useState('');
    const [qAplicada, setQAplicada] = useState('');
    const [valorTxt, setValorTxt] = useState('');
    const [valorAplicado, setValorAplicado] = useState('');
    const [lista, setLista] = useState({ titulos: [], total: 0, somaTotal: 0, truncado: false });
    const [carregando, setCarregando] = useState(true);
    const [sel, setSel] = useState(() => new Map()); // id -> título (mantém entre filtros)
    const [metodo, setMetodo] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [desfazendo, setDesfazendo] = useState(null);
    const [filtrosAbertos, setFiltrosAbertos] = useState(false);
    const [sugestao, setSugestao] = useState(null);
    const [erroParciais, setErroParciais] = useState(false);
    const [maisAberto, setMaisAberto] = useState(false);
    const reqRef = useRef(0);

    const valorLinha = Number(lancamento.valor || 0);
    const jaConciliado = parciais ? Number(parciais.valorConciliado || 0) : Number(lancamento.valorConciliado || 0);
    const jaCents = cents(jaConciliado);
    const alvoCents = cents(valorLinha);

    const carregarParciais = useCallback(async () => {
        setErroParciais(false);
        try {
            const p = await conciliacaoService.parciais(lancamento.id);
            setParciais(p);
        } catch (e) {
            // NÃO assume "nada conciliado": sem esse número a conta de quanto falta seria falsa
            setErroParciais(true);
        }
    }, [lancamento.id]);

    useEffect(() => {
        carregarParciais();
        conciliacaoService.opcoesVarios().then((o) => setOpcoes({
            condicoes: o.condicoes || [], metodosPagamento: o.metodosPagamento || []
        })).catch(() => { });
    }, [carregarParciais]);

    // Pré-seleciona PIX na forma de pagamento da baixa
    useEffect(() => {
        if (metodo || !opcoes.metodosPagamento.length) return;
        const pix = opcoes.metodosPagamento.find((m) => /pix/i.test(m.value));
        setMetodo((pix || opcoes.metodosPagamento[0]).value);
    }, [opcoes.metodosPagamento, metodo]);

    // Busca/valor com debounce (não persistem)
    useEffect(() => { const t = setTimeout(() => setQAplicada(q), 350); return () => clearTimeout(t); }, [q]);
    useEffect(() => { const t = setTimeout(() => setValorAplicado(valorTxt), 450); return () => clearTimeout(t); }, [valorTxt]);

    const condKey = (filtros.condicoes || []).join(',');
    const carregarLista = useCallback(async () => {
        const meu = ++reqRef.current;
        setCarregando(true);
        try {
            const params = {};
            if (periodo.de) params.de = periodo.de;
            if (periodo.ate) params.ate = periodo.ate;
            if (condKey) params.condicoes = condKey;
            if (qAplicada.trim()) params.q = qAplicada.trim();
            const v = parseValorBR(valorAplicado);
            if (v && Number(v) > 0) { params.valor = v; params.tol = filtros.tol || '10'; }
            const d = await conciliacaoService.titulosPagarAbertos(params);
            if (meu !== reqRef.current) return;
            setLista({
                titulos: d.titulos || [], total: d.total ?? (d.titulos || []).length,
                somaTotal: d.somaTotal ?? 0, truncado: !!d.truncado
            });
        } catch (e) {
            if (meu !== reqRef.current) return;
            toast.error(e.response?.data?.error || 'Erro ao carregar os títulos em aberto');
        } finally {
            if (meu === reqRef.current) setCarregando(false);
        }
    }, [periodo.de, periodo.ate, condKey, qAplicada, valorAplicado, filtros.tol]);

    useEffect(() => { carregarLista(); }, [carregarLista]);

    // ---- Números do resumo (tudo em centavos) ----
    const marcadoCents = useMemo(() => Array.from(sel.values()).reduce((s, t) => s + cents(t.saldo), 0), [sel]);
    const faltaCents = alvoCents - jaCents - marcadoCents;
    const estoura = faltaCents < -1;
    const fecha = Math.abs(faltaCents) <= 1 && marcadoCents > 0;
    const pct = alvoCents > 0 ? Math.min(100, ((jaCents + marcadoCents) / alvoCents) * 100) : 0;
    const visiveisIds = useMemo(() => new Set(lista.titulos.map((t) => t.parcelaPagarId)), [lista.titulos]);
    const foraDoFiltro = useMemo(() => Array.from(sel.keys()).filter((id) => !visiveisIds.has(id)).length, [sel, visiveisIds]);
    // Igual ao servidor: forma vazia OU fora da lista de formas aceitas na baixa conta como "sem forma"
    const formasValidas = useMemo(() => new Set((opcoes.metodosPagamento || []).map((o) => o.value)), [opcoes.metodosPagamento]);
    const precisaMetodo = Array.from(sel.values()).some((t) => !t.metodoPagamentoCA || !formasValidas.has(t.metodoPagamentoCA));

    const rotuloCondicao = useMemo(() => {
        const m = new Map((opcoes.metodosPagamento || []).map((o) => [o.value, o.label]));
        return (cod) => (cod ? (m.get(cod) || String(cod).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())) : 'Não informado');
    }, [opcoes.metodosPagamento]);

    // Sugestão: roda fora do clique, com pequeno atraso
    useEffect(() => {
        setSugestao(null);
        const restante = alvoCents - jaCents;
        if (restante <= 0 || carregando || lista.titulos.length < 2) return undefined;
        const t = setTimeout(() => {
            try {
                const achou = acharSubconjunto(lista.titulos, restante);
                setSugestao(achou && achou.length >= 1 ? achou : null);
            } catch { setSugestao(null); }
        }, 150);
        return () => clearTimeout(t);
    }, [lista.titulos, alvoCents, jaCents, carregando]);

    const sugestaoJaMarcada = sugestao && sugestao.length === sel.size && sugestao.every((t) => sel.has(t.parcelaPagarId));

    const alternar = (t) => setSel((m) => {
        const n = new Map(m);
        if (n.has(t.parcelaPagarId)) n.delete(t.parcelaPagarId); else n.set(t.parcelaPagarId, t);
        return n;
    });
    const marcarTodos = () => setSel((m) => { const n = new Map(m); lista.titulos.forEach((t) => n.set(t.parcelaPagarId, t)); return n; });
    const marcarSugestao = () => setSel(new Map(sugestao.map((t) => [t.parcelaPagarId, t])));

    const limparFiltros = () => {
        periodoCtl.limpar();
        setFiltros({ condicoes: [], tol: '10' });
        setQ(''); setQAplicada(''); setValorTxt(''); setValorAplicado('');
    };
    const nFiltros = (periodo.padrao ? 0 : 1) + ((filtros.condicoes || []).length ? 1 : 0) + (qAplicada.trim() ? 1 : 0) + (valorAplicado.trim() ? 1 : 0);

    // ---- Ações ----
    const conciliar = async () => {
        if (marcadoCents === 0 || estoura || salvando || !parciais) return;
        if (!fecha) {
            const ok = window.confirm(`Conciliar parcial: ${sel.size} título(s), R$ ${fmt(marcadoCents / 100)}.\n\nVai ficar faltando R$ ${fmt(faltaCents / 100)} nesta linha do extrato (ela fica "Parcial"). As baixas dos títulos marcados são dadas agora. Continuar?`);
            if (!ok) return;
        }
        setSalvando(true);
        try {
            const body = {
                parcelaPagarIds: Array.from(sel.keys()),
                valorConciliadoEsperado: jaConciliado
            };
            if (metodo && formasValidas.has(metodo)) body.metodoPagamento = metodo; // servidor só usa como reserva
            const r = await conciliacaoService.conciliarVarios(lancamento.id, body);
            toast.success(r.message || (r.status === 'CONCILIADO' ? 'Conciliado!' : 'Conciliado parcialmente.'));
            onSuccess();
        } catch (e) {
            const msg = e.response?.data?.error || 'Não deu certo — tente de novo';
            toast.error(msg);
            if (/recarregue/i.test(msg)) { setSel(new Map()); carregarParciais(); carregarLista(); onAlterou?.(); }
        } finally {
            setSalvando(false);
        }
    };

    const desfazerTitulo = async (t) => {
        const ok = window.confirm(`Desfazer "${t.fornecedor || t.descricao || 'título'}" (R$ ${fmt(t.valor)})?\n\nA baixa dada na conciliação será ESTORNADA: o título volta a ficar em aberto no Contas a Pagar e o valor volta a faltar nesta linha.`);
        if (!ok) return;
        setDesfazendo(t.pagamentoId);
        try {
            const r = await conciliacaoService.desfazerTitulo(lancamento.id, t.pagamentoId);
            toast.success(r.message || 'Título desfeito.');
            await carregarParciais();
            carregarLista();
            onAlterou?.();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Não deu certo — tente de novo');
        } finally {
            setDesfazendo(null);
        }
    };

    const cls = estoura ? 'text-red-700' : fecha ? 'text-primary' : 'text-amber-700';
    const rotuloBtn = estoura ? 'Passou do valor' : fecha ? 'Conciliar' : 'Conciliar parcial';
    const rotuloBtnCurto = estoura ? 'Passou' : fecha ? 'Conciliar' : 'Parcial';
    const continuando = jaCents > 0;
    const fechar = () => {
        if (sel.size > 0 && !window.confirm(`Descartar ${sel.size} título${sel.size !== 1 ? 's' : ''} marcado${sel.size !== 1 ? 's' : ''}?`)) return;
        onClose();
    };
    // Sair para outra ação descarta os marcados: pede confirmação (só se houver)
    const comConfirmacao = (fn) => () => {
        if (sel.size > 0 && !window.confirm(`Descartar ${sel.size} título${sel.size !== 1 ? 's' : ''} marcado${sel.size !== 1 ? 's' : ''}?`)) return;
        fn?.();
    };
    const acaoMais = (fn) => () => { setMaisAberto(false); comConfirmacao(fn)(); };
    const titulosJa = parciais?.titulos || [];

    const Origem = ({ o }) => (o === 'IMPORTADO_CA'
        ? <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-700 whitespace-nowrap">Importada (antiga)</span>
        : o === 'DDA'
            ? <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">DDA</span>
            : <span className="text-gray-400">—</span>);

    const Cond = ({ t }) => (
        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full whitespace-nowrap ${t.metodoPagamentoCA ? corCondicao(t.metodoPagamentoCA) : 'bg-gray-100 text-gray-600'}`}>
            {rotuloCondicao(t.metodoPagamentoCA)}
        </span>
    );

    const parcelaTxt = (t) => (t.totalParcelas > 1 ? `${t.numeroParcela}/${t.totalParcelas}` : '1/1');

    const camposFiltro = (
        <>
<FiltroPeriodo periodo={periodo} controle={periodoCtl} rotulo="Vencimento" className="w-full md:w-auto" />
                        <div className="w-full md:w-60">
                            <MultiSelect
                                options={opcoes.condicoes}
                                valueKey="value"
                                labelKey="label"
                                selected={filtros.condicoes || []}
                                onChange={(v) => setFiltros((f) => ({ ...f, condicoes: v }))}
                                placeholder="Condição: todas"
                                summary
                            />
                        </div>
                        <div className="relative flex-1 min-w-[170px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Fornecedor, descrição, nota ou categoria"
                                className="w-full border border-gray-300 rounded-full pl-9 pr-3 py-2 text-sm min-h-[44px] md:min-h-0 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                        </div>
                        <div className="flex items-stretch gap-2 w-full md:w-auto">
                            <input
                                value={valorTxt}
                                onChange={(e) => setValorTxt(e.target.value)}
                                inputMode="decimal"
                                placeholder="Valor ≈ 412,30"
                                className="flex-1 md:w-36 border border-gray-300 rounded-full px-3 py-2 text-sm min-h-[44px] md:min-h-0 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                            <SelectBusca value={filtros.tol || '10'} onChange={(e) => setFiltros((f) => ({ ...f, tol: e.target.value }))} className="w-28">
                                {TOLERANCIAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </SelectBusca>
                        </div>
                        {nFiltros > 0 && (
                            <button type="button" onClick={limparFiltros} className="text-xs font-bold text-primary hover:text-primaryDark whitespace-nowrap min-h-[44px] md:min-h-0">Limpar filtros</button>
                        )}
        </>
    );

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center md:p-4" onClick={fechar}>
            <div className="bg-white md:rounded-2xl shadow-xl w-full max-w-6xl h-full md:h-auto md:max-h-[94vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                {/* Cabeçalho */}
                <div className="px-4 md:px-5 py-1.5 md:py-3 border-b border-gray-100 flex items-center md:items-start justify-between gap-2 shrink-0">
                    <div className="min-w-0">
                        <p className="text-xs text-gray-500 truncate">
                            {fmtData(lancamento.data)} · <span className="font-semibold text-red-700">− R$ {fmt(valorLinha)}</span> · {lancamento.descricao || 'sem descrição'}
                        </p>
                        <h2 className="font-bold text-gray-900 text-sm md:text-lg">O que é este lançamento no sistema?</h2>
                    </div>
                    <button onClick={fechar} className="w-11 h-11 -mr-1 inline-flex items-center justify-center text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 shrink-0" title="Fechar" aria-label="Fechar"><X className="w-5 h-5" /></button>
                </div>

                {/* Resumo + ações no TOPO */}
                <div className="px-4 md:px-5 py-2 md:py-3 bg-[#f7faf8] border-b border-[#e3ece8] shrink-0">
                    <div className="grid grid-cols-2 md:flex md:flex-wrap items-end gap-x-2 md:gap-x-6 gap-y-2 text-[11px] md:text-xs text-gray-600">
                        <div>Extrato<b className="block text-sm md:text-base text-gray-900">R$ {fmt(valorLinha)}</b></div>
                        {continuando && <div>Já conciliado<b className="block text-sm md:text-base text-gray-900">R$ {fmt(jaConciliado)}</b></div>}
                        <div>{continuando ? 'Novos marcados' : 'Marcado'}<b className="block text-sm md:text-base text-gray-900">R$ {fmt(marcadoCents / 100)}</b></div>
                        <div className={cls}>{estoura ? 'Passou' : fecha ? 'Fechou' : 'Falta'}<b className="block text-sm md:text-base">R$ {fmt(Math.abs(faltaCents) / 100)}</b></div>
                        {sugestao && !sugestaoJaMarcada && !fecha && (
                            <button type="button" onClick={marcarSugestao} className="col-span-2 md:col-auto md:ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primaryDark text-left min-h-[44px] md:min-h-0">
                                <Lightbulb className="h-4 w-4 shrink-0" />
                                <span>Sugerido: {sugestao.length} título{sugestao.length !== 1 ? 's' : ''} {sugestao.length !== 1 ? 'fecham' : 'fecha'} o valor{continuando ? ' que falta' : ''} — Marcar</span>
                            </button>
                        )}
                    </div>
                    <div className="h-1.5 md:h-2 bg-gray-200 rounded-full my-1.5 md:my-2.5 overflow-hidden">
                        <div className={`h-full ${estoura ? 'bg-red-500' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                    </div>
                    {erroParciais && (
                        <div className="mb-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800 flex flex-wrap items-center gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span className="flex-1 min-w-[10rem]">Não consegui ver quanto já foi conciliado nesta linha. Conciliar fica bloqueado até carregar.</span>
                            <button type="button" onClick={carregarParciais} className="min-h-[44px] md:min-h-0 px-4 py-1.5 bg-white border border-red-300 text-red-700 rounded-full font-semibold">Tentar de novo</button>
                        </div>
                    )}
                    <div className="flex items-center gap-1.5 md:gap-2 md:flex-wrap">
                        <button
                            onClick={conciliar}
                            disabled={marcadoCents === 0 || estoura || salvando || !parciais || (precisaMetodo && !metodo)}
                            className="flex-1 min-w-0 md:flex-none min-h-[44px] px-3 md:px-5 py-2 whitespace-nowrap bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {salvando ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <Check className="h-4 w-4 shrink-0" />} <span className="md:hidden">{rotuloBtnCurto}</span><span className="hidden md:inline">{rotuloBtn}</span>
                        </button>
                        <button onClick={fechar} className="min-h-[44px] px-3 md:px-5 py-2 whitespace-nowrap bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm">Cancelar</button>
                        <div className="relative md:hidden">
                            <button type="button" onClick={() => setMaisAberto((a) => !a)} className="min-h-[44px] px-3 whitespace-nowrap bg-white border border-gray-300 text-gray-700 rounded-full text-sm font-medium inline-flex items-center gap-1" aria-expanded={maisAberto}>
                                <MoreHorizontal className="h-4 w-4" /> Mais
                            </button>
                            {maisAberto && (
                                <>
                                    <div className="fixed inset-0 z-20" onClick={() => setMaisAberto(false)} />
                                    <div className="absolute right-0 top-full mt-1 z-30 w-64 bg-white border border-gray-200 rounded-xl shadow-lg py-1">
                                        <button onClick={acaoMais(onCriarDespesa)} className="w-full text-left px-4 min-h-[44px] text-sm font-semibold text-primary hover:bg-gray-50">Cadastrar despesa</button>
                                        <button onClick={acaoMais(onTransferir)} className="w-full text-left px-4 min-h-[44px] text-sm font-semibold text-primary hover:bg-gray-50">Transferência entre contas</button>
                                        <button onClick={acaoMais(onIgnorar)} className="w-full text-left px-4 min-h-[44px] text-sm font-semibold text-primary hover:bg-gray-50">Ignorar (tarifa…)</button>
                                        <button onClick={acaoMais(onAvancado)} className="w-full text-left px-4 min-h-[44px] text-sm font-medium text-gray-700 hover:bg-gray-50">Modo avançado</button>
                                    </div>
                                </>
                            )}
                        </div>
                        <span className="hidden md:inline text-xs text-gray-600 md:w-auto">
                            {fecha ? 'Valor fechado.' : estoura ? 'Desmarque algum título.' : marcadoCents > 0 ? 'O restante continua pendente nesta linha.' : 'Marque os títulos que esta saída pagou.'}
                            {foraDoFiltro > 0 && ` · ${foraDoFiltro} marcado${foraDoFiltro !== 1 ? 's' : ''} fora do filtro`}
                        </span>
                    </div>
                    {precisaMetodo && (
                        <div className="mt-2 flex flex-col md:flex-row md:items-center gap-1.5 md:gap-3">
                            <span className="text-sm font-medium text-gray-700">Forma de pagamento da baixa</span>
                            <SelectBusca value={metodo} onChange={(e) => setMetodo(e.target.value)} className="w-full md:w-72">
                                {(opcoes.metodosPagamento || []).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </SelectBusca>
                            <span className="text-xs text-gray-500">Há título marcado sem forma de pagamento cadastrada.</span>
                        </div>
                    )}
                </div>

                {/* Filtros: no celular viram uma folha sobreposta (a lista não perde altura) */}
                <div className="px-4 md:px-5 py-1.5 md:py-2.5 border-b border-gray-100 shrink-0">
                    <button
                        type="button"
                        onClick={() => setFiltrosAbertos(true)}
                        className="md:hidden w-full min-h-[44px] px-4 rounded-full border border-gray-300 text-sm font-medium text-gray-700 inline-flex items-center justify-center gap-2"
                    >
                        <SlidersHorizontal className="h-4 w-4" /> Filtros{nFiltros > 0 ? ` (${nFiltros})` : ''}
                    </button>
                    <div className="hidden md:flex flex-row flex-wrap items-center gap-2">
                        {camposFiltro}
                    </div>
                </div>
                {filtrosAbertos && (
                    <div className="md:hidden fixed inset-0 z-[60] bg-black/40 flex items-end" onClick={() => setFiltrosAbertos(false)}>
                        <div className="bg-white rounded-t-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                            <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between shrink-0">
                                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Filtros</span>
                                <button type="button" onClick={() => setFiltrosAbertos(false)} className="w-11 h-11 -mr-2 inline-flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="Fechar filtros"><X className="w-5 h-5" /></button>
                            </div>
                            <div className="flex flex-col gap-2 p-4 pb-24 overflow-y-auto">
                                {camposFiltro}
                            </div>
                            <div className="px-4 py-3 border-t border-gray-100 shrink-0">
                                <button type="button" onClick={() => setFiltrosAbertos(false)} className="w-full min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm">
                                    {carregando ? 'Carregando…' : `Ver ${lista.total} título${lista.total !== 1 ? 's' : ''}`}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Contagem + marcar todos */}
                <div className="px-4 md:px-5 py-2 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
                    <span className="text-gray-600">
                        {carregando ? 'Carregando…' : `${lista.total} título${lista.total !== 1 ? 's' : ''} · R$ ${fmt(lista.somaTotal)}`}
                        {lista.truncado && ' · mostrando os 500 primeiros (refine o filtro)'}
                    </span>
                    <span className="flex items-center gap-4">
                        <button type="button" onClick={marcarTodos} disabled={!lista.titulos.length} className="font-bold text-primary hover:text-primaryDark disabled:opacity-40 min-h-[44px] md:min-h-0">Marcar todos os filtrados</button>
                        <button type="button" onClick={() => setSel(new Map())} disabled={!sel.size} className="font-bold text-primary hover:text-primaryDark disabled:opacity-40 min-h-[44px] md:min-h-0">Desmarcar tudo</button>
                    </span>
                </div>

                {/* Lista */}
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                    {/* Já conciliado nesta linha */}
                    {titulosJa.length > 0 && (
                        <div className="border-b border-gray-200 bg-gray-50/60">
                            <p className="px-4 md:px-5 pt-3 text-xs font-bold uppercase tracking-widest text-gray-600">Já conciliado nesta linha</p>
                            {titulosJa.map((t) => (
                                <div key={t.pagamentoId} className="px-4 md:px-5 py-2.5 flex items-center gap-3 border-b border-gray-100 last:border-0">
                                    <input type="checkbox" checked disabled className="h-5 w-5 accent-primary shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-semibold text-gray-900 truncate">
                                            {t.fornecedor || t.descricao || 'Título'}
                                            <span className="ml-2 px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">Já conciliado</span>
                                        </div>
                                        <div className="text-xs text-gray-500 truncate">
                                            {t.descricao && t.fornecedor ? `${t.descricao} · ` : ''}{t.conciliadoEm ? fmtData(String(t.conciliadoEm).slice(0, 10)) : ''}{t.conciliadoPor ? ` · ${t.conciliadoPor}` : ''}
                                        </div>
                                    </div>
                                    <div className="text-sm font-bold text-gray-900 whitespace-nowrap">R$ {fmt(t.valor)}</div>
                                    <button
                                        onClick={() => desfazerTitulo(t)}
                                        disabled={desfazendo === t.pagamentoId}
                                        className="shrink-0 min-h-[44px] md:min-h-0 px-2 text-xs font-bold text-red-700 hover:text-red-800 disabled:opacity-50"
                                    >
                                        {desfazendo === t.pagamentoId ? '…' : 'Desfazer'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {carregando && lista.titulos.length === 0 ? (
                        <div className="py-10 flex items-center justify-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando títulos…</div>
                    ) : lista.titulos.length === 0 ? (
                        <div className="py-10 px-4 text-center text-sm text-gray-500">Nenhum título em aberto com esses filtros.</div>
                    ) : (
                        <>
                            {/* Mobile: cards */}
                            <div className="md:hidden">
                                {lista.titulos.map((t) => {
                                    const marcado = sel.has(t.parcelaPagarId);
                                    return (
                                        <div key={t.parcelaPagarId} onClick={() => alternar(t)} className={`flex items-start gap-3 px-4 py-3 border-b border-gray-100 min-h-[56px] cursor-pointer ${marcado ? 'bg-mint' : 'bg-white'}`}>
                                            <input type="checkbox" checked={marcado} readOnly className="h-5 w-5 mt-0.5 accent-primary shrink-0" />
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-semibold text-gray-900 truncate">{t.fornecedor || t.descricao || 'Sem fornecedor'}</div>
                                                <div className="text-xs text-gray-500 truncate">
                                                    {[t.descricao && t.fornecedor ? t.descricao : null, t.numeroNota ? `NF ${t.numeroNota}` : null, t.categoria].filter(Boolean).join(' · ')}
                                                </div>
                                                <div className="text-xs text-gray-500 mt-0.5">vence {fmtDM(t.vencimento)} · parcela {parcelaTxt(t)}</div>
                                                <div className="mt-1 flex flex-wrap gap-1"><Cond t={t} />{(t.origem === 'IMPORTADO_CA' || t.origem === 'DDA') && <Origem o={t.origem} />}</div>
                                            </div>
                                            <div className="text-sm font-bold text-gray-900 whitespace-nowrap">R$ {fmt(t.saldo)}</div>
                                        </div>
                                    );
                                })}
                            </div>
                            {/* Desktop: tabela */}
                            <div className="hidden md:block">
                                <table className="w-full divide-y divide-gray-200 text-sm">
                                    <thead className="bg-gray-50 sticky top-0 z-10">
                                        <tr>
                                            <th className="w-10 px-3 py-2" />
                                            {['Vencimento', 'Fornecedor / descrição', 'Categoria', 'Condição', 'Parcela', 'Origem'].map((h) => (
                                                <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                                            ))}
                                            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-100">
                                        {lista.titulos.map((t) => {
                                            const marcado = sel.has(t.parcelaPagarId);
                                            return (
                                                <tr key={t.parcelaPagarId} onClick={() => alternar(t)} className={`cursor-pointer ${marcado ? 'bg-mint' : 'hover:bg-gray-50'}`}>
                                                    <td className="px-3 py-2.5"><input type="checkbox" checked={marcado} readOnly className="h-[18px] w-[18px] accent-primary" /></td>
                                                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">{fmtData(t.vencimento)}</td>
                                                    <td className="px-3 py-2.5 max-w-[300px]">
                                                        <div className="font-semibold text-gray-900 truncate">{t.fornecedor || t.descricao || 'Sem fornecedor'}</div>
                                                        <div className="text-xs text-gray-500 truncate">{[t.fornecedor ? t.descricao : null, t.numeroNota ? `NF ${t.numeroNota}` : null].filter(Boolean).join(' · ')}</div>
                                                    </td>
                                                    <td className="px-3 py-2.5 text-gray-700 max-w-[160px] truncate">{t.categoria || '—'}</td>
                                                    <td className="px-3 py-2.5"><Cond t={t} /></td>
                                                    <td className="px-3 py-2.5 text-gray-700">{parcelaTxt(t)}</td>
                                                    <td className="px-3 py-2.5"><Origem o={t.origem} /></td>
                                                    <td className="px-3 py-2.5 text-right font-bold text-gray-900 whitespace-nowrap">R$ {fmt(t.saldo)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>

                {/* Rodapé: caminhos alternativos */}
                <div className="hidden md:flex px-5 py-2.5 border-t border-gray-100 text-xs text-gray-600 flex-wrap items-center gap-x-4 gap-y-1 shrink-0">
                    <span>Não está no sistema?</span>
                    <button onClick={comConfirmacao(onCriarDespesa)} className="font-bold text-primary hover:text-primaryDark min-h-[44px] md:min-h-0">Cadastrar despesa</button>
                    <button onClick={comConfirmacao(onTransferir)} className="font-bold text-primary hover:text-primaryDark min-h-[44px] md:min-h-0">Transferência entre contas</button>
                    <button onClick={comConfirmacao(onIgnorar)} className="font-bold text-primary hover:text-primaryDark min-h-[44px] md:min-h-0">Ignorar (tarifa…)</button>
                    <button onClick={comConfirmacao(onAvancado)} className="md:ml-auto font-bold text-gray-600 hover:text-gray-900 underline min-h-[44px] md:min-h-0" title="Juros/multa/desconto, baixa já registrada ou somar outro lançamento do banco">Modo avançado</button>
                </div>
            </div>
        </div>
    );
};

export default ConciliarVariosModal;
