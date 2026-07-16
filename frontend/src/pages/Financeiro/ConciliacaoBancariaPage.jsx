import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import conciliacaoService from '../../services/conciliacaoBancariaService';
import contasReceberService from '../../services/contasReceberService';
import SelectBusca from '../../components/SelectBusca';
import { Landmark, Loader2, RefreshCw, Upload, Wand2, Check, X, Undo2, ChevronDown, ChevronUp, Search, Download, ArrowLeftRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useFiltroSalvo } from '../../hooks/useFiltrosSalvos';

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtData = (ymd) => `${ymd.slice(8)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
const hojeYMD = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const somaDiasYMD = (ymd, n) => {
    const d = new Date(`${ymd}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
const fimDoMes = (ym) => {
    const [a, m] = ym.split('-').map(Number);
    const prox = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
    return somaDiasYMD(`${prox}-01`, -1);
};
const periodos = () => {
    const hoje = hojeYMD();
    const mes = hoje.slice(0, 7);
    return [
        { key: 'MES', label: 'Este mês', de: `${mes}-01`, ate: fimDoMes(mes) },
        { key: 'ULT30', label: 'Últimos 30 dias', de: somaDiasYMD(hoje, -29), ate: hoje },
        { key: 'ULT60', label: 'Últimos 60 dias', de: somaDiasYMD(hoje, -59), ate: hoje },
        { key: 'ULT90', label: 'Últimos 90 dias', de: somaDiasYMD(hoje, -89), ate: hoje }
    ];
};

const STATUS_BADGE = {
    PENDENTE: 'bg-yellow-100 text-yellow-800',
    CONCILIADO: 'bg-green-100 text-green-800',
    TRANSFERENCIA: 'bg-purple-100 text-purple-700',
    IGNORADO: 'bg-gray-100 text-gray-700'
};
const STATUS_LABEL = { PENDENTE: 'Pendente', CONCILIADO: 'Conciliado', TRANSFERENCIA: 'Transferência', IGNORADO: 'Ignorado' };

const KpiCard = ({ titulo, valor, cor = 'text-gray-900', sub, subCor = 'text-gray-500' }) => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{titulo}</div>
        <div className={`text-lg md:text-2xl font-bold mt-1 ${cor}`}>{valor}</div>
        {sub && <div className={`text-xs mt-0.5 ${subCor}`}>{sub}</div>}
    </div>
);

const ValorCell = ({ tipo, valor }) => (
    <span className={`font-semibold ${tipo === 'CREDITO' ? 'text-green-700' : 'text-red-700'}`}>
        {tipo === 'CREDITO' ? '+' : '−'} R$ {fmt(valor)}
    </span>
);

// Linha de detalhe de uma baixa do app: de que boleto/nota se trata, quando venceu,
// quanto era a parcela e como a baixa foi composta (juros/multa/desconto).
// Usada em toda ação de conciliar — o usuário nunca confirma às cegas.
const DetalheBaixa = ({ p }) => {
    const d = p.detalhe;
    if (!d) return null;
    const partes = [];
    if (d.descricao && d.descricao !== d.nome) partes.push(d.descricao);
    if (d.numeroNota) partes.push(`NF ${d.numeroNota}`);
    if (d.parcela != null) partes.push(`parcela ${d.parcela}`);
    if (d.vencimento) partes.push(`venceu ${fmtData(d.vencimento)}`);
    if (d.valorParcela > 0 && Math.abs(d.valorParcela - p.valor) > 0.01) partes.push(`parcela de R$ ${fmt(d.valorParcela)}`);
    const comp = [];
    if (d.juros > 0) comp.push(`juros R$ ${fmt(d.juros)}`);
    if (d.multa > 0) comp.push(`multa R$ ${fmt(d.multa)}`);
    if (d.desconto > 0) comp.push(`desconto R$ ${fmt(d.desconto)}`);
    if (d.formaPagamento) comp.push(d.formaPagamento);
    return (
        <div className="text-xs text-gray-500 mt-0.5">
            {partes.length > 0 && <div className="truncate">{partes.join(' · ')}</div>}
            {comp.length > 0 && <div className="truncate">pago {fmtData(p.data)}{d.valorPago > 0 ? ` — R$ ${fmt(d.valorPago)}` : ''} ({comp.join(', ')})</div>}
        </div>
    );
};

// ── Modal ÚNICO de busca: "este lançamento do banco é ISTO no sistema" ──
// Modelo do Conta Azul (pedido do usuário): janela de ±15 dias da data do débito
// (ajustável), listando TODOS os boletos em aberto do período + as baixas já
// registradas sem par. O usuário marca um ou mais e concilia — boleto em aberto
// ganha a baixa na hora (data e banco do extrato, fila do CA). Cadastrar despesa
// nova e Ignorar também moram aqui, para a linha da tela ter só dois botões.
// ── Modal: transferência entre contas da PRÓPRIA empresa ──
// "PIX OUTRA IF - MESMA TIT.", TED entre os bancos da casa: não é receita nem
// despesa. Registra o movimento (sai de uma conta, entra na outra) — aparece em
// Saldos por Conta / extrato — e tira o lançamento dos pendentes.
const TransferenciaModal = ({ lancamento, contas, contaId, onClose, onSuccess }) => {
    const ehSaida = lancamento.tipo === 'DEBITO';
    const [outraContaId, setOutraContaId] = useState('');
    const [obs, setObs] = useState('');
    const [salvando, setSalvando] = useState(false);
    const contaAtual = contas.find(c => c.id === contaId);
    const outras = contas.filter(c => c.id !== contaId);

    const confirmar = async () => {
        setSalvando(true);
        try {
            const r = await conciliacaoService.transferir(lancamento.id, outraContaId, obs.trim());
            toast.success(r.message);
            onSuccess();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao registrar transferência');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
            <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-w-md w-full" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="min-w-0">
                        <p className="text-xs text-gray-500">
                            {fmtData(lancamento.data)} · <span className={`font-semibold ${ehSaida ? 'text-red-700' : 'text-green-700'}`}>{ehSaida ? '−' : '+'} R$ {fmt(lancamento.valor)}</span>
                        </p>
                        <h2 className="font-bold text-gray-900">Transferência entre contas</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-5 space-y-3">
                    <p className="text-sm text-gray-600">
                        Este dinheiro {ehSaida ? 'saiu de' : 'entrou em'} <strong>{contaAtual?.nome || 'esta conta'}</strong> e{' '}
                        {ehSaida ? 'foi para' : 'veio de'} outra conta da empresa. Não é receita nem despesa — vira um
                        movimento próprio nos relatórios por conta.
                    </p>
                    <div>
                        <label className="text-sm font-medium text-gray-700 block mb-1">
                            {ehSaida ? 'Para qual conta foi?' : 'De qual conta veio?'}
                        </label>
                        <SelectBusca value={outraContaId} onChange={e => setOutraContaId(e.target.value)} className="w-full">
                            <option value="">Conta fora do sistema / não sei</option>
                            {outras.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </SelectBusca>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-700 block mb-1">Observação (opcional)</label>
                        <input value={obs} onChange={e => setObs(e.target.value)} placeholder="ex.: cobrir pagamentos da semana"
                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                    </div>
                </div>
                <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-medium text-sm">Cancelar</button>
                    <button onClick={confirmar} disabled={salvando}
                        className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
                        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
                        Registrar transferência
                    </button>
                </div>
            </div>
        </div>
    );
};

const BuscarModal = ({ lancamento, pendentes, contaId, onClose, onSuccess, onCriarDespesa, onIgnorar, onTransferir }) => {
    const ehSaida = lancamento.tipo === 'DEBITO';
    const [janela, setJanela] = useState('15'); // dias p/ cada lado ('15'|'30'|'60'|'365')
    const [busca, setBusca] = useState('');
    const [abertas, setAbertas] = useState(null);   // boletos em aberto (só saída)
    const [abertasReceber, setAbertasReceber] = useState(null); // contas a receber em aberto (só entrada)
    const [baixas, setBaixas] = useState(null);     // baixas já registradas sem par
    const [motivos, setMotivos] = useState([]);
    const [metodos, setMetodos] = useState([]);
    const [selParc, setSelParc] = useState(new Set());
    const [selParcReceber, setSelParcReceber] = useState(new Set());
    const [selPag, setSelPag] = useState(new Set());
    const [selLanc, setSelLanc] = useState(new Set([lancamento.id]));
    const [mostrarExtras, setMostrarExtras] = useState(false);
    const [metodoPagamento, setMetodoPagamento] = useState(
        /pix|cobrança|cobranca/i.test(lancamento.descricao || '') ? 'PIX_PAGAMENTO_INSTANTANEO'
            : /ted|transfer/i.test(lancamento.descricao || '') ? 'TRANSFERENCIA_BANCARIA'
                : lancamento.tipo === 'CREDITO' ? 'PIX_PAGAMENTO_INSTANTANEO' // entrada no banco/Asaas: quase sempre PIX
                    : 'BOLETO_BANCARIO'
    );
    const [form, setForm] = useState({ juros: '', multa: '', desconto: '' });
    const [motivo, setMotivo] = useState('');
    const [obsMotivo, setObsMotivo] = useState('');
    const [salvando, setSalvando] = useState(false);
    const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }));

    const de = somaDiasYMD(lancamento.data, -Number(janela));
    const ate = somaDiasYMD(lancamento.data, Number(janela));

    useEffect(() => {
        conciliacaoService.motivosDiferenca().then(setMotivos).catch(() => setMotivos([]));
        conciliacaoService.opcoesDespesa().then(o => setMetodos(o.metodosPagamento || [])).catch(() => setMetodos([]));
    }, []);

    // Recarrega as listas quando a janela ou a busca mudam (busca com debounce).
    // Saída → boletos a pagar em aberto; entrada → contas a receber em aberto.
    useEffect(() => {
        let vivo = true;
        setAbertas(ehSaida ? null : []);
        setAbertasReceber(ehSaida ? [] : null);
        setBaixas(null);
        const t = setTimeout(() => {
            if (ehSaida) {
                conciliacaoService.parcelasPagarAbertas(lancamento.valor, busca, de, ate)
                    .then(p => { if (vivo) setAbertas(p); })
                    .catch(() => { if (vivo) setAbertas([]); });
            } else {
                conciliacaoService.parcelasReceberAbertas(lancamento.valor, busca, de, ate)
                    .then(p => { if (vivo) setAbertasReceber(p); })
                    .catch(() => { if (vivo) setAbertasReceber([]); });
            }
            conciliacaoService.baixasDisponiveis(contaId, de, ate, lancamento.tipo)
                .then(b => { if (vivo) setBaixas(b); })
                .catch(() => { if (vivo) setBaixas([]); });
        }, busca ? 350 : 0);
        return () => { vivo = false; clearTimeout(t); };
    }, [contaId, lancamento, busca, de, ate, ehSaida]);

    const alternar = (setFn, id) => setFn(prev => {
        const s = new Set(prev);
        if (s.has(id)) s.delete(id); else s.add(id);
        return s;
    });

    // Abertas ordenadas: valor batendo primeiro, depois vencimento mais perto do lançamento
    const dist = (v) => Math.abs((new Date(`${v}T12:00:00Z`) - new Date(`${lancamento.data}T12:00:00Z`)) / 86400000);
    const listaAbertas = (abertas || []).slice().sort((a, b) => (b.bate - a.bate) || (dist(a.vencimento) - dist(b.vencimento)));
    const listaAbertasReceber = (abertasReceber || []).slice().sort((a, b) => (b.bate - a.bate) || (dist(a.vencimento) - dist(b.vencimento)));
    // Filtro das baixas já registradas: nome, pedido ("Pedido 1860"), NF, valor
    // ("330,10" ou "330.1"), vencimento/data ("09/07/2026") — tudo num campo só.
    const listaBaixas = (baixas || []).filter(p => {
        const alvo = busca.trim().toLowerCase();
        if (!alvo) return true;
        const campos = [
            p.label, p.detalhe?.nome, p.detalhe?.descricao, p.detalhe?.numeroNota, p.detalhe?.nf,
            String(p.valor), fmt(p.valor),
            p.data, p.data ? fmtData(p.data) : '',
            p.detalhe?.vencimento, p.detalhe?.vencimento ? fmtData(p.detalhe.vencimento) : ''
        ].filter(Boolean).join(' | ').toLowerCase();
        return campos.includes(alvo);
    });
    const outrosPendentes = pendentes.filter(p => p.tipo === lancamento.tipo && p.id !== lancamento.id);

    // ── A conta, ao vivo (espelha as regras do backend) ──
    const n = (v) => Math.max(0, Number(String(v).replace(',', '.')) || 0);
    const jur = n(form.juros), mul = n(form.multa), desc = n(form.desconto);
    const r2 = (v) => Math.round(v * 100) / 100;
    const somaExtrato = r2([lancamento, ...outrosPendentes.filter(p => selLanc.has(p.id))]
        .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i)
        .reduce((s, p) => s + p.valor, 0));
    const parcSel = listaAbertas.filter(p => selParc.has(p.id));
    const parcReceberSel = listaAbertasReceber.filter(p => selParcReceber.has(p.id));
    const somaExistentes = r2((baixas || []).filter(p => selPag.has(p.id)).reduce((s, p) => s + p.valor, 0));
    const temSelecao = selParc.size > 0 || selParcReceber.size > 0 || selPag.size > 0;

    let statusConta = null; // { ok, texto, precisaMotivo }
    if (temSelecao) {
        if (parcReceberSel.length > 0) {
            // ENTRADA dando baixa em conta(s) a receber: sem juros/multa/desconto
            const disponivel = r2(somaExtrato - somaExistentes);
            const ordenadas = parcReceberSel.slice().sort((a, b) => a.vencimento.localeCompare(b.vencimento));
            const somaAntes = r2(ordenadas.slice(0, -1).reduce((s, p) => s + p.saldo, 0));
            const ultima = ordenadas[ordenadas.length - 1];
            if (disponivel <= 0) {
                statusConta = { ok: false, texto: 'As baixas já marcadas consomem todo o valor do extrato — não sobra para as contas a receber.' };
            } else if (disponivel < somaAntes - 0.01) {
                statusConta = { ok: false, texto: `O valor não alcança todas as contas marcadas (faltam R$ ${fmt(somaAntes - disponivel)}). Desmarque alguma.` };
            } else {
                const recebidoUltima = r2(disponivel - somaAntes);
                const sobra = r2(ultima.saldo - recebidoUltima);
                if (sobra < -0.01) {
                    // extrato maior que o total a receber → excesso vira diferença (precisa motivo)
                    const diferenca = r2(disponivel - r2(ordenadas.reduce((s, p) => s + p.saldo, 0)));
                    statusConta = { ok: true, precisaMotivo: true, diferenca, texto: `Sobra R$ ${fmt(diferenca)} além das contas marcadas — diga o que é para conciliar.` };
                } else {
                    statusConta = {
                        ok: true,
                        texto: sobra > 0.01
                            ? `Fecha com baixa PARCIAL na conta de ${ultima.cliente} — ficam faltando R$ ${fmt(sobra)}.`
                            : `Fecha certinho: ${parcReceberSel.length} conta(s) a receber baixada(s)${selPag.size ? ` + ${selPag.size} baixa(s) amarrada(s)` : ''}.`
                    };
                }
            }
        } else if (parcSel.length > 0) {
            const disponivel = r2(somaExtrato - somaExistentes - jur - mul);
            const ordenadas = parcSel.slice().sort((a, b) => a.vencimento.localeCompare(b.vencimento));
            const somaAntes = r2(ordenadas.slice(0, -1).reduce((s, p) => s + p.saldo, 0));
            const ultima = ordenadas[ordenadas.length - 1];
            if (disponivel <= 0) {
                statusConta = { ok: false, texto: 'Juros/multa e baixas marcadas consomem todo o valor do banco — não sobra nada para os boletos.' };
            } else if (disponivel < somaAntes - 0.01) {
                statusConta = { ok: false, texto: `O valor não alcança todos os boletos marcados (faltam R$ ${fmt(somaAntes - disponivel)}). Desmarque algum.` };
            } else {
                const pagoUltima = r2(disponivel - somaAntes);
                const tetoUltima = r2(ultima.saldo - desc);
                if (pagoUltima > tetoUltima + 0.01) {
                    statusConta = { ok: false, texto: `Saiu R$ ${fmt(pagoUltima - tetoUltima)} a mais que os boletos devem. É juros ou multa? Informe nos campos.` };
                } else {
                    const sobra = r2(tetoUltima - pagoUltima);
                    statusConta = {
                        ok: true,
                        texto: sobra > 0.01
                            ? `Fecha com baixa PARCIAL no boleto de ${ultima.fornecedor || ultima.descricao} — ficam faltando R$ ${fmt(sobra)}.`
                            : `Fecha certinho: ${parcSel.length} boleto(s) quitado(s)${selPag.size ? ` + ${selPag.size} baixa(s) amarrada(s)` : ''}.`
                    };
                }
            }
        } else {
            const diferenca = r2(somaExtrato - somaExistentes);
            statusConta = Math.abs(diferenca) <= 0.01
                ? { ok: true, texto: 'Os valores batem.' }
                : { ok: true, precisaMotivo: true, diferenca, texto: `Diferença de R$ ${fmt(Math.abs(diferenca))} — diga o que é para conciliar.` };
        }
    }
    const motivoOk = !statusConta?.precisaMotivo || (motivo && (motivo !== 'OUTRO' || obsMotivo.trim()));
    const podeConfirmar = temSelecao && statusConta?.ok && motivoOk && !salvando;

    const confirmar = async () => {
        setSalvando(true);
        try {
            const r = await conciliacaoService.conciliarUnificado({
                lancamentoIds: [...selLanc],
                parcelaPagarIds: [...selParc],
                parcelaReceberIds: [...selParcReceber],
                pagamentoIds: [...selPag],
                metodoPagamento: (selParc.size > 0 || selParcReceber.size > 0) ? metodoPagamento : null,
                juros: jur, multa: mul, desconto: desc,
                motivoDiferenca: statusConta?.precisaMotivo ? motivo : null,
                obsDiferenca: statusConta?.precisaMotivo ? obsMotivo.trim() : null
            });
            toast.success(r.message);
            onSuccess();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao conciliar');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
            <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-w-2xl w-full max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <div className="min-w-0">
                        <p className="text-xs text-gray-500">
                            {fmtData(lancamento.data)} · <span className={`font-semibold ${ehSaida ? 'text-red-700' : 'text-green-700'}`}>{ehSaida ? '−' : '+'} R$ {fmt(lancamento.valor)}</span> · {lancamento.descricao || 'sem descrição'}
                        </p>
                        <h2 className="font-bold text-gray-900">O que é este lançamento no sistema?</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto">
                    {/* Janela de vencimento + busca — como no Conta Azul */}
                    <div className="flex flex-col md:flex-row gap-2">
                        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
                            {[['15', '±15 dias'], ['30', '±30 dias'], ['60', '±60 dias'], ['365', 'Tudo']].map(([v, label]) => (
                                <button
                                    key={v}
                                    onClick={() => setJanela(v)}
                                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs transition-colors ${janela === v ? 'bg-primary text-white font-semibold' : 'bg-white border border-gray-300 text-gray-700 font-medium hover:bg-gray-50'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                value={busca}
                                onChange={e => setBusca(e.target.value)}
                                placeholder={ehSaida ? 'Buscar fornecedor, descrição, nº da nota, valor ou vencimento…' : 'Buscar cliente, pedido, NF, valor (330,10) ou vencimento (09/07)…'}
                                className="w-full border border-gray-300 rounded pl-9 pr-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Contas a receber em aberto (só entrada) — dar baixa aqui mesmo */}
                    {!ehSaida && (
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Contas a receber em aberto</p>
                            {abertasReceber === null && (
                                <div className="text-center text-gray-500 text-sm py-2 flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
                            )}
                            {abertasReceber !== null && listaAbertasReceber.length === 0 && (
                                <p className="text-sm text-gray-500 py-1">Nenhuma conta a receber em aberto com vencimento nesse período{busca ? ' para essa busca' : ''} — aumente a janela ou ajuste a busca.</p>
                            )}
                            <div className="space-y-1.5 max-h-52 overflow-y-auto">
                                {listaAbertasReceber.map(p => (
                                    <label key={p.id} className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer ${selParcReceber.has(p.id) ? 'border-primary bg-mint/30' : 'border-gray-200 hover:bg-gray-50'}`}>
                                        <input type="checkbox" checked={selParcReceber.has(p.id)} onChange={() => alternar(setSelParcReceber, p.id)} className="mt-1 accent-[#00754A]" />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-sm font-medium text-gray-900 truncate flex-1">{p.cliente}</span>
                                                {p.bate && <span className="shrink-0 px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">valor bate</span>}
                                                {p.status === 'PARCIAL' && <span className="shrink-0 px-2 py-0.5 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Parcial</span>}
                                                <span className="text-sm font-semibold whitespace-nowrap">R$ {fmt(p.saldo)}</span>
                                            </div>
                                            <div className="text-xs text-gray-500 truncate">
                                                {p.pedido ? `Pedido ${p.pedido}` : 'Conta a receber'}{p.nf ? ` · NF ${p.nf}` : ''}{p.numeroParcela ? ` · parcela ${p.numeroParcela}` : ''} · vence {fmtData(p.vencimento)}
                                            </div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Boletos em aberto (só saída) */}
                    {ehSaida && (
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Boletos em aberto no Contas a Pagar</p>
                            {abertas === null && (
                                <div className="text-center text-gray-500 text-sm py-2 flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
                            )}
                            {abertas !== null && listaAbertas.length === 0 && (
                                <p className="text-sm text-gray-500 py-1">Nenhum boleto em aberto com vencimento nesse período{busca ? ' para essa busca' : ''} — aumente a janela ou ajuste a busca.</p>
                            )}
                            <div className="space-y-1.5 max-h-52 overflow-y-auto">
                                {listaAbertas.map(p => (
                                    <label key={p.id} className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer ${selParc.has(p.id) ? 'border-primary bg-mint/30' : 'border-gray-200 hover:bg-gray-50'}`}>
                                        <input type="checkbox" checked={selParc.has(p.id)} onChange={() => alternar(setSelParc, p.id)} className="mt-1 accent-[#00754A]" />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-sm font-medium text-gray-900 truncate flex-1">{p.fornecedor || p.descricao || 'Despesa'}</span>
                                                {p.bate && <span className="shrink-0 px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">valor bate</span>}
                                                {p.status === 'PARCIAL' && <span className="shrink-0 px-2 py-0.5 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Parcial</span>}
                                                <span className="text-sm font-semibold whitespace-nowrap">R$ {fmt(p.saldo)}</span>
                                            </div>
                                            <div className="text-xs text-gray-500 truncate">
                                                {p.descricao}{p.numeroNota ? ` · NF ${p.numeroNota}` : ''} · vence {fmtData(p.vencimento)}
                                                {!p.vaiAoCA && ' · importada do CA (baixa fica só no app)'}
                                            </div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Baixas já registradas sem par no extrato */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">
                            {ehSaida ? 'Pagamentos já baixados no app (sem par no extrato)' : 'Recebimentos já baixados no app (sem par no extrato)'}
                        </p>
                        {baixas === null && (
                            <div className="text-center text-gray-500 text-sm py-2 flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
                        )}
                        {baixas !== null && listaBaixas.length === 0 && (
                            <p className="text-sm text-gray-500 py-1">Nenhuma baixa livre nesse período.</p>
                        )}
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {listaBaixas.map(p => (
                                <label key={p.id} className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer ${selPag.has(p.id) ? 'border-primary bg-mint/30' : 'border-gray-200 hover:bg-gray-50'}`}>
                                    <input type="checkbox" checked={selPag.has(p.id)} onChange={() => alternar(setSelPag, p.id)} className="mt-0.5 accent-[#00754A]" />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-gray-900 truncate flex-1">{p.detalhe?.nome || p.label}</span>
                                            <span className="text-sm font-semibold whitespace-nowrap">R$ {fmt(p.valor)}</span>
                                        </div>
                                        <DetalheBaixa p={p} />
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Raro: 2 PIX pagando 1 boleto — somar outros lançamentos do banco */}
                    {outrosPendentes.length > 0 && (
                        <div>
                            <button type="button" onClick={() => setMostrarExtras(v => !v)} className="text-xs font-medium text-primary hover:underline">
                                {mostrarExtras ? '− Esconder outros lançamentos do banco' : '+ Somar outro lançamento do banco (ex.: 2 PIX pagando 1 boleto)'}
                            </button>
                            {mostrarExtras && (
                                <div className="space-y-1.5 max-h-32 overflow-y-auto mt-2">
                                    {outrosPendentes.map(p => (
                                        <label key={p.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer ${selLanc.has(p.id) ? 'border-primary bg-mint/30' : 'border-gray-200 hover:bg-gray-50'}`}>
                                            <input type="checkbox" checked={selLanc.has(p.id)} onChange={() => alternar(setSelLanc, p.id)} className="accent-[#00754A]" />
                                            <span className="text-xs text-gray-500 shrink-0">{fmtData(p.data)}</span>
                                            <span className="text-sm text-gray-800 truncate flex-1">{p.descricao || '(sem descrição)'}</span>
                                            <span className="text-sm font-semibold whitespace-nowrap">R$ {fmt(p.valor)}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Forma de pagamento + juros/multa/desconto — só quando há boleto a pagar marcado */}
                    {selParc.size > 0 && (
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                            <div className="col-span-3">
                                <label className="text-sm font-medium text-gray-700 block mb-1">Forma de pagamento</label>
                                <SelectBusca value={metodoPagamento} onChange={e => setMetodoPagamento(e.target.value)} className="w-full">
                                    {metodos.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </SelectBusca>
                            </div>
                            {[['juros', 'Juros (R$)'], ['multa', 'Multa (R$)'], ['desconto', 'Desconto (R$)']].map(([campo, label]) => (
                                <div key={campo}>
                                    <label className="text-sm font-medium text-gray-700 block mb-1">{label}</label>
                                    <input inputMode="decimal" value={form[campo]} onChange={set(campo)} placeholder="0,00"
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Forma de pagamento — quando há conta a RECEBER marcada (sem juros/multa/desconto) */}
                    {selParcReceber.size > 0 && (
                        <div>
                            <label className="text-sm font-medium text-gray-700 block mb-1">Forma de pagamento</label>
                            <SelectBusca value={metodoPagamento} onChange={e => setMetodoPagamento(e.target.value)} className="w-full md:w-1/2">
                                {metodos.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </SelectBusca>
                        </div>
                    )}
                </div>

                {/* Rodapé: a conta ao vivo + motivo quando não fecha + confirmar */}
                <div className="px-5 py-4 border-t border-gray-100 shrink-0 space-y-2">
                    {temSelecao && statusConta && (
                        <div className={`rounded-xl border p-3 text-sm ${statusConta.ok && !statusConta.precisaMotivo ? 'border-green-200 bg-green-50 text-green-800' : statusConta.ok ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
                            <div className="flex items-center justify-between gap-2">
                                <span>Banco R$ {fmt(somaExtrato)} × Sistema R$ {fmt(somaExistentes + parcSel.reduce((s, p) => s + p.saldo, 0) + parcReceberSel.reduce((s, p) => s + p.saldo, 0))}</span>
                            </div>
                            <div className="mt-0.5">{statusConta.texto}</div>
                        </div>
                    )}
                    {statusConta?.precisaMotivo && (
                        <div className="flex flex-col md:flex-row gap-2">
                            <SelectBusca value={motivo} onChange={e => setMotivo(e.target.value)} className="w-full md:flex-1">
                                <option value="">O que é a diferença?…</option>
                                {motivos.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </SelectBusca>
                            {motivo === 'OUTRO' && (
                                <input value={obsMotivo} onChange={e => setObsMotivo(e.target.value)} placeholder="Descreva…"
                                    className="w-full md:flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                            )}
                        </div>
                    )}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <div className="text-xs text-gray-500">
                            Não está no sistema?{' '}
                            {ehSaida && <button type="button" onClick={onCriarDespesa} className="font-medium text-primary hover:underline">Cadastrar despesa</button>}
                            {ehSaida && ' · '}
                            <button type="button" onClick={onTransferir} className="font-medium text-primary hover:underline">Transferência entre contas</button>
                            {' · '}
                            <button type="button" onClick={onIgnorar} className="font-medium text-gray-600 hover:underline">Ignorar (tarifa…)</button>
                        </div>
                        <div className="ml-auto flex gap-2">
                            <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-medium text-sm">Cancelar</button>
                            <button onClick={confirmar} disabled={!podeConfirmar}
                                className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
                                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                Conciliar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── Modal: criar a despesa que faltava, direto do extrato ──
// O dinheiro já saiu do banco, então a despesa nasce PAGA: data, valor e banco vêm do
// próprio lançamento (campos travados). Ao salvar, a baixa criada vira o candidato da
// linha — o usuário volta para a lista e clica em "Conciliar".
const DespesaModal = ({ lancamento, onClose, onSuccess }) => {
    const [opcoes, setOpcoes] = useState(null); // { fornecedores, categorias, metodosPagamento }
    const [salvando, setSalvando] = useState(false);
    const [novoFornecedor, setNovoFornecedor] = useState(false);
    const [form, setForm] = useState({
        fornecedorId: '',
        fornecedorNovo: '',
        descricao: '',
        categoriaCaId: '',
        numeroNota: lancamento.detalhes?.documento || '',
        dataVencimento: lancamento.data,
        metodoPagamento: 'BOLETO_BANCARIO',
        juros: '',
        multa: '',
        observacoes: ''
    });
    const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }));

    useEffect(() => {
        conciliacaoService.opcoesDespesa()
            .then(o => {
                setOpcoes(o);
                // Sugere a descrição a partir do que o banco mandou (beneficiário, quando existe)
                setForm(f => ({
                    ...f,
                    descricao: f.descricao || lancamento.detalhes?.nome || lancamento.descricao || ''
                }));
            })
            .catch(() => { toast.error('Não consegui carregar fornecedores/categorias.'); setOpcoes({ fornecedores: [], categorias: [], metodosPagamento: [] }); });
    }, [lancamento]);

    const total = Number(lancamento.valor || 0);
    const jur = Math.max(0, Number(String(form.juros).replace(',', '.')) || 0);
    const mul = Math.max(0, Number(String(form.multa).replace(',', '.')) || 0);
    const valorBoleto = Math.round((total - jur - mul) * 100) / 100;
    const valorValido = valorBoleto > 0;
    const temFornecedor = novoFornecedor ? !!form.fornecedorNovo.trim() : !!form.fornecedorId;
    const podeSalvar = temFornecedor && form.descricao.trim() && form.metodoPagamento && valorValido && !salvando;

    const salvar = async () => {
        setSalvando(true);
        try {
            const r = await conciliacaoService.criarDespesa(lancamento.id, {
                fornecedorId: novoFornecedor ? null : form.fornecedorId,
                fornecedorNovo: novoFornecedor ? form.fornecedorNovo.trim() : null,
                descricao: form.descricao.trim(),
                categoriaCaId: form.categoriaCaId || null,
                categoria: opcoes?.categorias?.find(c => c.id === form.categoriaCaId)?.nome || null,
                numeroNota: form.numeroNota.trim() || null,
                dataVencimento: form.dataVencimento || null,
                metodoPagamento: form.metodoPagamento,
                juros: jur,
                multa: mul,
                observacoes: form.observacoes.trim() || null
            });
            toast.success(r.message);
            onSuccess();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao criar a despesa');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
            <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-w-lg w-full max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <div className="min-w-0">
                        <p className="text-xs text-gray-500">Saída do banco sem despesa lançada</p>
                        <h2 className="font-bold text-gray-900">Cadastrar a despesa</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto">
                    {/* O que o banco disse — tudo o que temos do lançamento */}
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm space-y-1">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-600">{fmtData(lancamento.data)}</span>
                            <span className="font-bold text-red-700">− R$ {fmt(total)}</span>
                        </div>
                        <div className="text-gray-800 break-words">{lancamento.descricao || '(sem descrição)'}</div>
                        {lancamento.detalhes?.nome && <div className="text-gray-600 text-xs">Beneficiário no banco: <strong>{lancamento.detalhes.nome}</strong></div>}
                        {lancamento.detalhes?.documento && <div className="text-gray-600 text-xs">Documento: {lancamento.detalhes.documento}</div>}
                    </div>

                    {opcoes === null ? (
                        <div className="text-center text-gray-500 text-sm py-4 flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                        </div>
                    ) : (
                        <>
                            {/* Fornecedor */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-sm font-medium text-gray-700">Fornecedor *</label>
                                    <button
                                        type="button"
                                        onClick={() => setNovoFornecedor(v => !v)}
                                        className="text-xs font-medium text-primary hover:underline"
                                    >
                                        {novoFornecedor ? 'Escolher um já cadastrado' : '+ Cadastrar novo'}
                                    </button>
                                </div>
                                {novoFornecedor ? (
                                    <input
                                        value={form.fornecedorNovo}
                                        onChange={set('fornecedorNovo')}
                                        placeholder="Nome / razão social do fornecedor"
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                    />
                                ) : (
                                    <SelectBusca value={form.fornecedorId} onChange={set('fornecedorId')} className="w-full">
                                        <option value="">Escolha o fornecedor…</option>
                                        {(opcoes.fornecedores || []).map(f => (
                                            <option key={f.id} value={f.id}>{f.nomeFantasia || f.razaoSocial}</option>
                                        ))}
                                    </SelectBusca>
                                )}
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-700 block mb-1">Descrição *</label>
                                <input
                                    value={form.descricao}
                                    onChange={set('descricao')}
                                    placeholder="Ex.: Energia elétrica — julho"
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-700 block mb-1">Categoria (DRE)</label>
                                    <SelectBusca value={form.categoriaCaId} onChange={set('categoriaCaId')} className="w-full">
                                        <option value="">Sem categoria</option>
                                        {(opcoes.categorias || []).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                    </SelectBusca>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700 block mb-1">Forma de pagamento *</label>
                                    <SelectBusca value={form.metodoPagamento} onChange={set('metodoPagamento')} className="w-full">
                                        {(opcoes.metodosPagamento || []).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                    </SelectBusca>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700 block mb-1">Vencimento do boleto</label>
                                    <input
                                        type="date"
                                        value={form.dataVencimento}
                                        onChange={set('dataVencimento')}
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700 block mb-1">Nº da nota/documento</label>
                                    <input
                                        value={form.numeroNota}
                                        onChange={set('numeroNota')}
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                    />
                                </div>
                            </div>

                            {/* Juros/multa: o extrato traz o TOTAL que saiu; aqui a gente separa */}
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Pagou juros ou multa?</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 block mb-1">Juros (R$)</label>
                                        <input
                                            inputMode="decimal"
                                            value={form.juros}
                                            onChange={set('juros')}
                                            placeholder="0,00"
                                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 block mb-1">Multa (R$)</label>
                                        <input
                                            inputMode="decimal"
                                            value={form.multa}
                                            onChange={set('multa')}
                                            placeholder="0,00"
                                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                        />
                                    </div>
                                </div>
                                <div className={`mt-2 rounded-xl border p-3 text-sm ${valorValido ? 'border-gray-200 bg-gray-50' : 'border-red-200 bg-red-50'}`}>
                                    {valorValido ? (
                                        <span className="text-gray-700">
                                            Valor da despesa <strong>R$ {fmt(valorBoleto)}</strong>
                                            {(jur > 0 || mul > 0) && <> + juros/multa <strong>R$ {fmt(jur + mul)}</strong></>}
                                            {' = '}<strong>R$ {fmt(total)}</strong> que saiu do banco.
                                        </span>
                                    ) : (
                                        <span className="text-red-700">Juros + multa não podem chegar ao valor total que saiu do banco.</span>
                                    )}
                                </div>
                            </div>

                            <p className="text-xs text-gray-500">
                                A despesa é criada <strong>já paga</strong> em {fmtData(lancamento.data)}, no banco deste extrato, e vai para o Conta Azul.
                                Depois de salvar, a linha volta com a baixa como sugestão — aí é só clicar em <strong>Conciliar</strong>.
                            </p>
                        </>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 shrink-0 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-medium text-sm">Cancelar</button>
                    <button
                        onClick={salvar}
                        disabled={!podeSalvar}
                        className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Cadastrar despesa
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Modal: lançar VÁRIAS despesas de uma vez (tarifas repetidas) e já conciliar ──
// Feito para as tarifas do Asaas (boleto/PIX): o usuário marca as linhas, escolhe UMA
// vez o fornecedor, a categoria da DRE e a forma de pagamento; cada linha vira sua
// própria despesa (mantém a descrição e o nº do documento do banco) já paga e conciliada.
const DespesaLoteModal = ({ lancamentos, onClose, onSuccess }) => {
    const [opcoes, setOpcoes] = useState(null); // { fornecedores, categorias, metodosPagamento }
    const [salvando, setSalvando] = useState(false);
    const [novoFornecedor, setNovoFornecedor] = useState(false);
    const [resultado, setResultado] = useState(null); // { criadas, falhas } quando termina com falhas
    const [form, setForm] = useState({ fornecedorId: '', fornecedorNovo: '', categoriaCaId: '', metodoPagamento: 'DEPOSITO_BANCARIO' });
    const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }));

    useEffect(() => {
        conciliacaoService.opcoesDespesa()
            .then(setOpcoes)
            .catch(() => { toast.error('Não consegui carregar fornecedores/categorias.'); setOpcoes({ fornecedores: [], categorias: [], metodosPagamento: [] }); });
    }, []);

    const total = lancamentos.reduce((s, l) => s + Number(l.valor || 0), 0);
    const temFornecedor = novoFornecedor ? !!form.fornecedorNovo.trim() : !!form.fornecedorId;
    const podeSalvar = temFornecedor && form.metodoPagamento && lancamentos.length > 0 && !salvando;

    const salvar = async () => {
        setSalvando(true);
        try {
            const r = await conciliacaoService.criarDespesasLote({
                lancamentoIds: lancamentos.map(l => l.id),
                fornecedorId: novoFornecedor ? null : form.fornecedorId,
                fornecedorNovo: novoFornecedor ? form.fornecedorNovo.trim() : null,
                categoriaCaId: form.categoriaCaId || null,
                categoria: opcoes?.categorias?.find(c => c.id === form.categoriaCaId)?.nome || null,
                metodoPagamento: form.metodoPagamento
            });
            if (r.falhas?.length > 0) {
                setResultado(r); // mostra o que não deu certo, sem fechar
                toast(r.message, { icon: '⚠️' });
            } else {
                toast.success(r.message);
                onSuccess();
            }
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao lançar as despesas em lote');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
            <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-w-lg w-full max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <div className="min-w-0">
                        <p className="text-xs text-gray-500">{lancamentos.length} saída(s) selecionada(s) · R$ {fmt(total)}</p>
                        <h2 className="font-bold text-gray-900">Lançar despesas em lote e conciliar</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto">
                    {resultado ? (
                        <div className="space-y-3">
                            <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                                {resultado.criadas} despesa(s) lançada(s) e conciliada(s).
                            </div>
                            {resultado.falhas?.length > 0 && (
                                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm">
                                    <p className="font-semibold text-red-700 mb-1">{resultado.falhas.length} não deu(deram) certo:</p>
                                    <ul className="space-y-1 max-h-48 overflow-y-auto">
                                        {resultado.falhas.map((f, i) => (
                                            <li key={i} className="text-red-700 text-xs truncate" title={`${f.descricao} — ${f.erro}`}>
                                                • {f.descricao} — {f.erro}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ) : opcoes === null ? (
                        <div className="text-center text-gray-500 text-sm py-4 flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                        </div>
                    ) : (
                        <>
                            <p className="text-sm text-gray-600">
                                O fornecedor, a categoria e a forma de pagamento abaixo valem para <strong>todas</strong>. Cada linha
                                vira sua própria despesa (mantendo a descrição e o nº do documento do banco), já <strong>paga e
                                conciliada</strong> no banco deste extrato — e vai para o Conta Azul.
                            </p>

                            {/* Fornecedor (uma vez para todas) */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-sm font-medium text-gray-700">Fornecedor *</label>
                                    <button type="button" onClick={() => setNovoFornecedor(v => !v)} className="text-xs font-medium text-primary hover:underline">
                                        {novoFornecedor ? 'Escolher um já cadastrado' : '+ Cadastrar novo'}
                                    </button>
                                </div>
                                {novoFornecedor ? (
                                    <input value={form.fornecedorNovo} onChange={set('fornecedorNovo')} placeholder="Nome / razão social (ex.: Asaas)"
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                                ) : (
                                    <SelectBusca value={form.fornecedorId} onChange={set('fornecedorId')} className="w-full">
                                        <option value="">Escolha o fornecedor…</option>
                                        {(opcoes.fornecedores || []).map(f => <option key={f.id} value={f.id}>{f.nomeFantasia || f.razaoSocial}</option>)}
                                    </SelectBusca>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-700 block mb-1">Categoria (DRE)</label>
                                    <SelectBusca value={form.categoriaCaId} onChange={set('categoriaCaId')} className="w-full">
                                        <option value="">Sem categoria</option>
                                        {(opcoes.categorias || []).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                    </SelectBusca>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700 block mb-1">Forma de pagamento *</label>
                                    <SelectBusca value={form.metodoPagamento} onChange={set('metodoPagamento')} className="w-full">
                                        {(opcoes.metodosPagamento || []).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                    </SelectBusca>
                                </div>
                            </div>

                            {/* Prévia das linhas selecionadas */}
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Lançamentos ({lancamentos.length})</p>
                                <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 max-h-56 overflow-y-auto">
                                    {lancamentos.map(l => (
                                        <div key={l.id} className="flex items-center justify-between gap-2 px-3 py-2">
                                            <div className="min-w-0">
                                                <div className="text-sm text-gray-800 truncate">{l.descricao || '(sem descrição)'}</div>
                                                <div className="text-xs text-gray-400">{fmtData(l.data)}{l.detalhes?.documento ? ` · doc ${l.detalhes.documento}` : ''}</div>
                                            </div>
                                            <span className="text-sm font-semibold text-red-700 whitespace-nowrap">− R$ {fmt(l.valor)}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex justify-between mt-2 text-sm font-semibold text-gray-800">
                                    <span>Total</span><span>R$ {fmt(total)}</span>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 shrink-0 flex justify-end gap-2">
                    {resultado ? (
                        <button onClick={onSuccess} className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm">Fechar</button>
                    ) : (
                        <>
                            <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-medium text-sm">Cancelar</button>
                            <button onClick={salvar} disabled={!podeSalvar}
                                className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
                                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                Lançar {lancamentos.length} e conciliar
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const ConciliacaoBancariaPage = () => {
    const opcoesPeriodo = useMemo(periodos, []);
    const [contas, setContas] = useState([]);
    // Filtros persistidos por usuário/tela. Do período salvamos só a CHAVE
    // ('ULT30' etc.) — as datas são recalculadas a partir de hoje a cada visita.
    const [contaId, setContaId] = useFiltroSalvo('conciliacao-bancaria:contaId', '');
    const [periodoKey, setPeriodoKey] = useFiltroSalvo('conciliacao-bancaria:periodoKey', 'ULT30'); // últimos 30 dias
    const periodo = useMemo(
        () => opcoesPeriodo.find(p => p.key === periodoKey) || opcoesPeriodo[1],
        [opcoesPeriodo, periodoKey]
    );
    const setPeriodo = (p) => setPeriodoKey(p.key);
    const [statusFiltro, setStatusFiltro] = useFiltroSalvo('conciliacao-bancaria:statusFiltro', 'todos');
    const [dados, setDados] = useState(null);
    const [loading, setLoading] = useState(false);
    const [agindo, setAgindo] = useState(null); // id do lançamento com ação em andamento
    const [importando, setImportando] = useState(false);
    const [autoRodando, setAutoRodando] = useState(false);
    const [escolhas, setEscolhas] = useState({}); // lancamentoId → id do pagamento escolhido
    const [mostrarSoNoApp, setMostrarSoNoApp] = useState(false);
    const [buscarModal, setBuscarModal] = useState(null); // lançamento que abriu a busca ("o que é isto?")
    const [transfModal, setTransfModal] = useState(null); // lançamento marcado como transferência entre contas
    const [despesaModal, setDespesaModal] = useState(null); // lançamento que abriu o modal de nova despesa
    const [selecionados, setSelecionados] = useState(new Set()); // ids de saídas pendentes marcadas p/ lote
    const [loteModal, setLoteModal] = useState(false); // modal de lançar despesas em lote
    const [asaasInfo, setAsaasInfo] = useState(null); // { configurado, contaFinanceiraCaId, ultimaSync }
    const [syncAsaas, setSyncAsaas] = useState(false);
    const inputArquivo = useRef(null);

    useEffect(() => {
        contasReceberService.contasFinanceiras()
            .then(cf => {
                setContas(cf);
                const padrao = cf.find(c => c.padrao) || cf[0];
                // Mantém a conta salva do usuário se ela ainda existir; senão, usa a padrão
                setContaId(prev => (prev && cf.some(c => c.id === prev)) ? prev : (padrao ? padrao.id : ''));
            })
            .catch(() => toast.error('Não consegui carregar as contas (bancos/caixas).'));
        // Extrato automático do Asaas: sem integração, o botão simplesmente não aparece
        conciliacaoService.asaasInfo().then(setAsaasInfo).catch(() => {});
    }, []);

    const carregar = useCallback(async () => {
        if (!contaId) return;
        setLoading(true);
        try {
            const d = await conciliacaoService.lancamentos(contaId, periodo.de, periodo.ate, statusFiltro);
            setDados(d);
            setEscolhas({});
            setSelecionados(new Set());
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar o extrato');
        } finally {
            setLoading(false);
        }
    }, [contaId, periodo, statusFiltro]);

    useEffect(() => { carregar(); }, [carregar]);

    const importar = async (arquivo) => {
        if (!arquivo) return;
        setImportando(true);
        try {
            const r = await conciliacaoService.importar(contaId, arquivo);
            toast.success(r.message);
            (r.avisos || []).slice(0, 3).forEach(a => toast(a, { icon: '⚠️' }));
            carregar();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao importar o arquivo OFX');
        } finally {
            setImportando(false);
            if (inputArquivo.current) inputArquivo.current.value = '';
        }
    };

    // Busca o extrato direto no Asaas (o robô já faz sozinho a cada 30 min)
    const buscarAsaas = async () => {
        setSyncAsaas(true);
        try {
            const r = await conciliacaoService.sincronizarAsaas(7);
            toast.success(r.message);
            conciliacaoService.asaasInfo().then(setAsaasInfo).catch(() => {});
            carregar();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao buscar o extrato no Asaas');
        } finally {
            setSyncAsaas(false);
        }
    };

    const conciliarAuto = async () => {
        setAutoRodando(true);
        try {
            const r = await conciliacaoService.conciliarAuto(contaId, periodo.de, periodo.ate);
            toast.success(r.message);
            carregar();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro na conciliação automática');
        } finally {
            setAutoRodando(false);
        }
    };

    const agir = async (id, fn, ok) => {
        setAgindo(id);
        try {
            const r = await fn();
            toast.success(r.message || ok);
            carregar();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Não deu certo — tente de novo');
        } finally {
            setAgindo(null);
        }
    };

    const conciliarLinha = (l) => {
        const escolhido = (l.sugestoes || []).find(s => s.id === (escolhas[l.id] || l.sugestoes?.[0]?.id));
        if (!escolhido) { toast.error('Nenhuma sugestão para conciliar.'); return; }
        if (escolhido.origem === 'ABERTO') {
            // Boleto em aberto com data e valor batendo: a conciliação dá a baixa na hora
            // (data e banco do extrato) e amarra a linha — tudo num clique.
            const metodo = /pix/i.test(l.descricao || '') ? 'PIX_PAGAMENTO_INSTANTANEO' : 'BOLETO_BANCARIO';
            agir(l.id, () => conciliacaoService.conciliarUnificado({
                lancamentoIds: [l.id],
                parcelaPagarIds: [escolhido.id],
                pagamentoIds: [],
                metodoPagamento: metodo
            }), 'Baixado e conciliado!');
            return;
        }
        const payload = l.tipo === 'CREDITO' ? { pagamentoParcelaId: escolhido.id } : { pagamentoParcelaPagarId: escolhido.id };
        agir(l.id, () => conciliacaoService.conciliar(l.id, payload), 'Conciliado!');
    };

    const ignorarLinha = (l) => {
        const obs = window.prompt('Por que ignorar? (ex.: tarifa bancária — transferência entre contas tem botão próprio no Buscar…)') || '';
        agir(l.id, () => conciliacaoService.ignorar(l.id, obs), 'Ignorado.');
    };

    const desfazerLinha = (l) => agir(l.id, () => conciliacaoService.desfazer(l.id), 'Voltou para pendente.');

    // Confirma de uma vez os créditos IDENTIFICADOS que fecham (com o seu clique — nada roda sozinho)
    const confirmarIdentificadasLote = async () => {
        const n = lancamentos.filter(x => x.status === 'PENDENTE' && x.identificado?.fecha).length;
        if (!n) return;
        if (!window.confirm(`Confirmar ${n} lançamento(s) identificado(s)?\n\nSão créditos cuja Venda do extrato é o próprio pedido do app, com valor fechando (exato ou com a tarifa de R$ 1,50 do boleto — nesses, a despesa da tarifa é gerada).`)) return;
        setAutoRodando(true);
        try {
            const r = await conciliacaoService.confirmarIdentificadas(contaId, periodo.de, periodo.ate);
            toast.success(r.message);
            await carregar();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao confirmar as identificadas');
        } finally {
            setAutoRodando(false);
        }
    };

    const resumo = dados?.resumo;
    const lancamentos = dados?.lancamentos || [];
    const soNoApp = dados?.soNoApp || { entradas: [], saidas: [] };
    const totalSoNoApp = (soNoApp.entradas?.length || 0) + (soNoApp.saidas?.length || 0);

    // Créditos identificados prontos para confirmar em lote (Venda = pedido, valor fechando)
    const identificaveis = lancamentos.filter(l => l.status === 'PENDENTE' && l.identificado?.fecha).length;

    // Seleção em lote: só saídas PENDENTES podem virar despesa em massa (tarifas repetidas)
    const selecionaveis = lancamentos.filter(l => l.status === 'PENDENTE' && l.tipo === 'DEBITO');
    const idsSelecionaveis = selecionaveis.map(l => l.id);
    const podeSelecionar = (l) => l.status === 'PENDENTE' && l.tipo === 'DEBITO';
    const alternarSelecao = (id) => setSelecionados(prev => {
        const s = new Set(prev);
        if (s.has(id)) s.delete(id); else s.add(id);
        return s;
    });
    const todosSelecionados = idsSelecionaveis.length > 0 && idsSelecionaveis.every(id => selecionados.has(id));
    const alternarTodos = () => setSelecionados(todosSelecionados ? new Set() : new Set(idsSelecionaveis));
    const lancamentosSelecionados = selecionaveis.filter(l => selecionados.has(l.id));
    const totalSelecionado = lancamentosSelecionados.reduce((s, l) => s + Number(l.valor || 0), 0);

    // Painel de ação de uma linha pendente — DOIS botões, sempre os mesmos:
    //   Conciliar (quando há sugestão com data e valor batendo) e Buscar… (todo o resto:
    //   escolher outro boleto, juntar vários, cadastrar despesa, ignorar).
    const AcoesPendente = ({ l }) => {
        const escolhido = (l.sugestoes || []).find(s => s.id === (escolhas[l.id] || l.sugestoes?.[0]?.id));
        const ident = l.identificado;

        // IDENTIFICADO (Venda NNNN = pedido NNNN do app) — certeza, não sugestão
        if (ident) {
            return (
                <div className="flex flex-col gap-1.5 min-w-0">
                    <div className={`rounded-lg border p-2 text-xs ${ident.fecha ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                        <div className={`font-semibold ${ident.fecha ? 'text-green-800' : 'text-amber-800'}`}>
                            ✓ Venda {ident.venda}{ident.parcela ? ` · parcela ${ident.parcela}` : ''}{ident.statusCA ? ` · ${ident.statusCA}` : ''}
                        </div>
                        <div className="text-gray-700 mt-0.5">
                            Pedido {ident.venda} · {ident.cliente}
                            {ident.valorBaixa != null && <> · baixa R$ {fmt(ident.valorBaixa)}{ident.tarifa ? ' (tarifa R$ 1,50 — despesa gerada ao confirmar)' : ''}</>}
                        </div>
                        {!ident.fecha && <div className="text-amber-700 mt-0.5">{ident.motivo} — confira pelo Buscar antes de conciliar.</div>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {ident.fecha && (
                            <button
                                onClick={() => agir(l.id, () => conciliacaoService.conciliar(l.id, { pagamentoParcelaId: ident.pagamentoId }), 'Confirmado!')}
                                disabled={agindo === l.id}
                                className="px-3 py-1.5 bg-primary hover:bg-primaryDark text-white rounded-full text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                            >
                                <Check className="h-3.5 w-3.5" /> Confirmar
                            </button>
                        )}
                        <button
                            onClick={() => setBuscarModal(l)}
                            disabled={agindo === l.id}
                            className="px-3 py-1.5 rounded-full text-xs inline-flex items-center gap-1 disabled:opacity-50 bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium"
                        >
                            <Search className="h-3.5 w-3.5" /> Buscar…
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <div className="flex flex-col gap-1.5 min-w-0">
                {escolhido ? (
                    <>
                        {l.sugestoes.length > 1 ? (
                            <SelectBusca value={escolhas[l.id] || l.sugestoes[0].id} onChange={e => setEscolhas(s => ({ ...s, [l.id]: e.target.value }))} className="w-full">
                                {l.sugestoes.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                            </SelectBusca>
                        ) : (
                            <div className="text-xs text-gray-700 truncate font-medium" title={escolhido.label}>
                                {escolhido.label}
                            </div>
                        )}
                        {/* Os dados do boleto/nota — conferir ANTES de conciliar */}
                        <DetalheBaixa p={escolhido} />
                        {escolhido.origem === 'ABERTO' && (
                            <div className="text-xs text-amber-700">Conciliar dá a baixa neste boleto (data e banco do extrato){escolhido.detalhe?.vaiAoCA === false ? ' — fica só no app (importada do CA)' : ' e envia ao Conta Azul'}.</div>
                        )}
                        {escolhido.tarifa > 0 && (
                            <div className="text-xs text-amber-700">
                                Boleto do Conta Azul: crédito líquido da tarifa de R$ {fmt(escolhido.tarifa)} — ao Conciliar, a tarifa fica registrada como motivo da diferença.
                            </div>
                        )}
                    </>
                ) : /MESMA TIT|TRANSF/i.test(l.descricao || '') ? (
                    <div className="text-xs text-purple-700">Parece transferência entre contas da empresa — em "Buscar…" há o botão próprio.</div>
                ) : (
                    <div className="text-xs text-gray-500">Nada com data e valor batendo — use a busca.</div>
                )}
                <div className="flex flex-wrap gap-1.5">
                    {escolhido && (
                        <button
                            onClick={() => conciliarLinha(l)}
                            disabled={agindo === l.id}
                            className="px-3 py-1.5 bg-primary hover:bg-primaryDark text-white rounded-full text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                        >
                            <Check className="h-3.5 w-3.5" /> Conciliar
                        </button>
                    )}
                    <button
                        onClick={() => setBuscarModal(l)}
                        disabled={agindo === l.id}
                        className={`px-3 py-1.5 rounded-full text-xs inline-flex items-center gap-1 disabled:opacity-50 ${escolhido ? 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium' : 'bg-white border border-primary text-primary hover:bg-mint/40 font-semibold'}`}
                        title="Procurar o boleto/baixa certo, juntar vários, cadastrar despesa ou ignorar"
                    >
                        <Search className="h-3.5 w-3.5" /> Buscar…
                    </button>
                </div>
            </div>
        );
    };

    // Descrição do banco + o que mais o OFX trouxe (beneficiário, nº do documento).
    // "DÉB.TIT.COMPE EFETIVADO" sozinho não diz nada — o beneficiário, quando o banco
    // manda, é a única pista de do que se trata.
    const DescricaoBanco = ({ l }) => {
        const p = l.pistas;
        const abertas = p?.parcelasAbertas || [];
        return (
            <div className="min-w-0">
                <span className="line-clamp-2 text-gray-700">{l.descricao || '(sem descrição)'}</span>
                {(l.detalhes?.nome || l.detalhes?.documento) && (
                    <div className="text-xs text-gray-500 mt-0.5 truncate">
                        {l.detalhes.nome && <span className="text-gray-600 font-medium">{l.detalhes.nome}</span>}
                        {l.detalhes.nome && l.detalhes.documento && ' · '}
                        {l.detalhes.documento && <span>doc {l.detalhes.documento}</span>}
                    </div>
                )}
                {/* Quem é? CNPJ/CPF que o banco escondeu no texto do PIX */}
                {p?.fornecedorDoDocumento && (
                    <div className="text-xs mt-0.5 truncate">
                        <span className="text-gray-500">CNPJ do texto: </span>
                        <span className="font-semibold text-gray-700">{p.fornecedorDoDocumento}</span>
                    </div>
                )}
                {!p?.fornecedorDoDocumento && p?.documento && (
                    <div className="text-xs text-gray-500 mt-0.5 truncate">CNPJ/CPF {p.documento} (não cadastrado como fornecedor)</div>
                )}
                {/* CPF mascarado pelo banco (***.851.799-**): só o miolo vem, então é palpite */}
                {p?.fornecedorProvavel && (
                    <div className="text-xs mt-0.5 truncate">
                        <span className="text-gray-500">Provavelmente </span>
                        <span className="font-semibold text-gray-700">{p.fornecedorProvavel}</span>
                        <span className="text-gray-500"> (CPF parcial)</span>
                    </div>
                )}
                {!p?.fornecedorProvavel && p?.documentoParcial && (
                    <div className="text-xs text-gray-500 mt-0.5 truncate">CPF ***.{p.documentoParcial.slice(0, 3)}.{p.documentoParcial.slice(3)}-** (sem correspondência no cadastro)</div>
                )}
                {/* Boleto sem beneficiário: a pista é o valor bater com uma conta em aberto */}
                {abertas.length > 0 && (
                    <div className="text-xs mt-0.5 text-amber-700 truncate" title={abertas.map(a => `${a.fornecedor || a.descricao} — vence ${fmtData(a.vencimento)}`).join(' · ')}>
                        Mesmo valor de: <span className="font-semibold">{abertas[0].fornecedor || abertas[0].descricao}</span>
                        {' '}(vence {fmtData(abertas[0].vencimento)}){abertas.length > 1 && ` +${abertas.length - 1}`}
                    </div>
                )}
            </div>
        );
    };

    const AcoesLinha = ({ l }) => {
        if (l.status === 'PENDENTE') return <AcoesPendente l={l} />;
        if (l.status === 'CONCILIADO') return (
            <div className="flex items-center gap-2 min-w-0">
                <div className="min-w-0">
                    <span className="text-xs text-gray-600 truncate block" title={l.conciliadoCom}>
                        {l.conciliadoAuto ? '🪄 ' : ''}{l.conciliadoCom}
                    </span>
                    {(l.grupoBaixas || []).length > 0 && (
                        <span className="text-xs text-gray-500 truncate block" title={l.grupoBaixas.join(' · ')}>
                            {l.grupoBaixas.join(' · ')}
                        </span>
                    )}
                    {/* Grupo fechado com diferença declarada: fica sempre visível, não some */}
                    {Math.abs(l.grupoDiferenca || 0) > 0.01 && (
                        <span className="text-xs text-amber-700 truncate block" title={l.grupoMotivoDiferenca || ''}>
                            Diferença R$ {fmt(Math.abs(l.grupoDiferenca))}{l.grupoMotivoDiferenca ? ` — ${l.grupoMotivoDiferenca}` : ''}
                        </span>
                    )}
                </div>
                <button onClick={() => desfazerLinha(l)} disabled={agindo === l.id} className="shrink-0 p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100" title="Desfazer (desfaz o grupo inteiro, se houver)">
                    <Undo2 className="h-4 w-4" />
                </button>
            </div>
        );
        if (l.status === 'TRANSFERENCIA') return (
            <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-700 shrink-0">
                    <ArrowLeftRight className="h-3 w-3" /> Transferência
                </span>
                <span className="text-xs text-gray-600 truncate">
                    {l.transferencia ? `${l.transferencia.sentido} ${l.transferencia.outraConta}` : (l.obs || 'entre contas da empresa')}
                </span>
                <button onClick={() => desfazerLinha(l)} disabled={agindo === l.id} className="shrink-0 p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100" title="Desfazer (apaga a transferência)">
                    <Undo2 className="h-4 w-4" />
                </button>
            </div>
        );
        return (
            <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-gray-500 truncate">{l.obs || 'Ignorado'}</span>
                <button onClick={() => desfazerLinha(l)} disabled={agindo === l.id} className="shrink-0 p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100" title="Desfazer">
                    <Undo2 className="h-4 w-4" />
                </button>
            </div>
        );
    };

    // Conta do Asaas selecionada? Aí o extrato entra sozinho (worker) e há o botão de buscar agora.
    const ehContaAsaas = !!(asaasInfo?.configurado && asaasInfo.contaFinanceiraCaId === contaId);

    return (
        <div className="max-w-full overflow-x-hidden -mx-4 sm:-mx-6 lg:-mx-8">
            {/* Topbar */}
            <div className="flex items-center justify-between p-3 md:p-6 bg-white border-b border-gray-200 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="bg-amber-100 p-1.5 md:p-2 rounded-lg shrink-0">
                        <Landmark className="h-4 w-4 md:h-5 md:w-5 text-amber-600" />
                    </div>
                    <h1 className="text-base md:text-2xl font-bold text-gray-900 truncate">Conciliação Bancária</h1>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <input ref={inputArquivo} type="file" accept=".ofx,.OFX,.qfx,.pdf,.PDF" className="hidden" onChange={e => importar(e.target.files?.[0])} />
                    {ehContaAsaas && (
                        <button
                            onClick={buscarAsaas}
                            disabled={syncAsaas}
                            className="px-3 py-1.5 md:px-4 md:py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-xs md:text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                            title={asaasInfo?.ultimaSync?.em
                                ? `O extrato do Asaas entra sozinho a cada 30 min. Última busca: ${new Date(asaasInfo.ultimaSync.em).toLocaleString('pt-BR')}`
                                : 'O extrato do Asaas entra sozinho a cada 30 min'}
                        >
                            {syncAsaas ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                            Buscar do Asaas
                        </button>
                    )}
                    <button
                        onClick={() => contaId ? inputArquivo.current?.click() : toast.error('Escolha o banco/caixa primeiro.')}
                        disabled={importando}
                        className="px-3 py-1.5 md:px-4 md:py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm text-xs md:text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                        {importando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        Importar OFX/PDF
                    </button>
                    <button
                        onClick={carregar}
                        disabled={loading}
                        className="p-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full disabled:opacity-50"
                        title="Atualizar"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="p-3 md:p-6 space-y-4">
                {/* Conta + período + status */}
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                    <SelectBusca value={contaId} onChange={e => setContaId(e.target.value)} className="w-full md:w-72">
                        <option value="" disabled>Escolha o banco/caixa…</option>
                        {contas.map(c => <option key={c.id} value={c.id}>{c.nome}{c.padrao ? ' (padrão)' : ''}</option>)}
                    </SelectBusca>
                    <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                        {opcoesPeriodo.map(p => (
                            <button
                                key={p.key}
                                onClick={() => setPeriodo(p)}
                                className={`shrink-0 px-3 py-1.5 min-h-[36px] rounded-full text-xs transition-colors ${
                                    periodo.key === p.key
                                        ? 'bg-primary text-white font-semibold'
                                        : 'bg-white border border-gray-300 text-gray-700 font-medium hover:bg-gray-50'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <div className="md:ml-auto">
                        <SelectBusca value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)} className="w-full md:w-44">
                            <option value="todos">Todos os status</option>
                            <option value="PENDENTE">Pendentes</option>
                            <option value="CONCILIADO">Conciliados</option>
                            <option value="TRANSFERENCIA">Transferências</option>
                            <option value="IGNORADO">Ignorados</option>
                        </SelectBusca>
                    </div>
                </div>

                {!contaId && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-sm text-gray-500">
                        Escolha o banco/caixa acima, depois importe o extrato OFX exportado do banco.
                    </div>
                )}

                {ehContaAsaas && (
                    <p className="text-xs text-gray-500">
                        Esta é a conta do Asaas: o extrato entra aqui <strong>sozinho, a cada 30 minutos</strong>, sem importar OFX
                        {asaasInfo?.ultimaSync?.em ? ` (última busca ${new Date(asaasInfo.ultimaSync.em).toLocaleString('pt-BR')})` : ''}.
                    </p>
                )}

                {contaId && (
                    <>
                        {/* KPIs */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <KpiCard
                                titulo="Pendentes"
                                valor={String(resumo?.pendentes ?? '—')}
                                cor={Number(resumo?.pendentes) > 0 ? 'text-amber-700' : 'text-gray-900'}
                                sub={`R$ ${fmt(resumo?.valorPendente)} a conferir`}
                            />
                            <KpiCard
                                titulo="Conciliados"
                                valor={String(resumo?.conciliados ?? '—')}
                                cor="text-green-700"
                                sub={`R$ ${fmt(resumo?.valorConciliado)} batidos`}
                            />
                            <KpiCard
                                titulo="Ignorados / Transf."
                                valor={`${resumo?.ignorados ?? '—'} · ${resumo?.transferencias ?? '—'}`}
                                sub="tarifas · transferências entre contas"
                            />
                            <KpiCard
                                titulo="Só no app"
                                valor={String(totalSoNoApp)}
                                cor={totalSoNoApp > 0 ? 'text-amber-700' : 'text-gray-900'}
                                sub="baixas sem par no extrato"
                            />
                        </div>

                        {/* Ações em massa */}
                        <div className="flex flex-wrap gap-2">
                            {identificaveis > 0 && (
                                <button
                                    onClick={confirmarIdentificadasLote}
                                    disabled={autoRodando || loading}
                                    className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
                                    title="Créditos com Venda NNNN identificada (é o pedido NNNN do app) e valor fechando — exato ou com a tarifa de R$ 1,50 do boleto"
                                >
                                    {autoRodando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                    Confirmar identificadas ({identificaveis})
                                </button>
                            )}
                            {Number(resumo?.pendentes) > 0 && (
                                <button
                                    onClick={conciliarAuto}
                                    disabled={autoRodando || loading}
                                    className="px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    {autoRodando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                                    Conciliar automático (casos com 1 só candidato)
                                </button>
                            )}
                        </div>

                        {/* Barra de seleção em lote — aparece ao marcar saídas pendentes (tarifas) */}
                        {selecionados.size > 0 && (
                            <div className="sticky top-2 z-20 bg-primary text-white rounded-full px-4 py-2.5 flex items-center justify-between gap-3 shadow-md">
                                <span className="text-sm font-medium">
                                    {selecionados.size} saída(s) selecionada(s) · R$ {fmt(totalSelecionado)}
                                </span>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => setSelecionados(new Set())} className="text-xs px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25">Limpar</button>
                                    <button onClick={() => setLoteModal(true)} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white text-primary hover:bg-gray-100 inline-flex items-center gap-1.5">
                                        <Check className="h-3.5 w-3.5" /> Lançar despesas e conciliar
                                    </button>
                                </div>
                            </div>
                        )}

                        {loading && (
                            <div className="text-center text-gray-500 text-sm py-2 flex items-center justify-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                            </div>
                        )}

                        {!loading && lancamentos.length === 0 && (
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-sm text-gray-500">
                                {ehContaAsaas
                                    ? 'Nenhum lançamento do extrato neste período. O extrato do Asaas entra sozinho a cada 30 minutos — ou clique em "Buscar do Asaas" no topo.'
                                    : 'Nenhum lançamento do extrato neste período. Importe o arquivo OFX do banco — ou o PDF do extrato do Conta Azul — pelo botão verde no topo.'}
                            </div>
                        )}

                        {lancamentos.length > 0 && (
                            <>
                                {/* Selecionar todas as saídas pendentes (tarifas) — lote */}
                                {selecionaveis.length > 0 && (
                                    <label className="flex items-center gap-2 px-1 text-xs text-gray-600 cursor-pointer select-none">
                                        <input type="checkbox" checked={todosSelecionados} onChange={alternarTodos} className="accent-[#00754A]" />
                                        Selecionar as {selecionaveis.length} saída(s) pendente(s) para lançar em lote
                                    </label>
                                )}

                                {/* Mobile: cards */}
                                <div className="md:hidden space-y-3">
                                    {lancamentos.map(l => (
                                        <div key={l.id} className={`bg-white rounded-xl border shadow-sm p-4 ${selecionados.has(l.id) ? 'border-primary ring-1 ring-primary/30' : 'border-gray-200'}`}>
                                            <div className="flex items-center justify-between mb-1 gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {podeSelecionar(l) && (
                                                        <input type="checkbox" checked={selecionados.has(l.id)} onChange={() => alternarSelecao(l.id)} className="accent-[#00754A] shrink-0" />
                                                    )}
                                                    <span className="text-xs text-gray-500">{fmtData(l.data)}</span>
                                                </div>
                                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[l.status]}`}>{STATUS_LABEL[l.status]}</span>
                                            </div>
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <div className="text-sm min-w-0"><DescricaoBanco l={l} /></div>
                                                <ValorCell tipo={l.tipo} valor={l.valor} />
                                            </div>
                                            <AcoesLinha l={l} />
                                        </div>
                                    ))}
                                </div>

                                {/* Desktop: tabela */}
                                <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-3 py-3 w-10">
                                                    {selecionaveis.length > 0 && (
                                                        <input type="checkbox" checked={todosSelecionados} onChange={alternarTodos} className="accent-[#00754A]" title="Selecionar todas as saídas pendentes" />
                                                    )}
                                                </th>
                                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</th>
                                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Descrição no banco</th>
                                                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-96">Conciliação</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                            {lancamentos.map(l => (
                                                <tr key={l.id} className={`align-top ${selecionados.has(l.id) ? 'bg-mint/30' : 'hover:bg-gray-50'}`}>
                                                    <td className="px-3 py-3 text-center">
                                                        {podeSelecionar(l) && (
                                                            <input type="checkbox" checked={selecionados.has(l.id)} onChange={() => alternarSelecao(l.id)} className="accent-[#00754A]" />
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-3 text-gray-900 whitespace-nowrap">{fmtData(l.data)}</td>
                                                    <td className="px-5 py-3 max-w-xs"><DescricaoBanco l={l} /></td>
                                                    <td className="px-5 py-3 text-right whitespace-nowrap"><ValorCell tipo={l.tipo} valor={l.valor} /></td>
                                                    <td className="px-5 py-3"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[l.status]}`}>{STATUS_LABEL[l.status]}</span></td>
                                                    <td className="px-5 py-3 w-96"><AcoesLinha l={l} /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}

                        {/* Só no app: baixas sem par no extrato */}
                        {totalSoNoApp > 0 && (
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                                <button
                                    onClick={() => setMostrarSoNoApp(v => !v)}
                                    className="w-full flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 text-left"
                                >
                                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600 flex-1">
                                        Baixas do app sem par no extrato ({totalSoNoApp})
                                    </span>
                                    {mostrarSoNoApp ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                                </button>
                                {mostrarSoNoApp && (
                                    <div className="p-5 space-y-1.5 text-sm">
                                        <p className="text-xs text-gray-500 mb-2">
                                            Estão registradas no app nesta conta, mas nenhum lançamento do extrato bateu com elas.
                                            Pode ser data/valor diferente, conta errada na baixa, ou extrato ainda não importado.
                                        </p>
                                        {(soNoApp.entradas || []).map(p => (
                                            <div key={p.id} className="flex items-center justify-between gap-2">
                                                <span className="text-gray-700 truncate">{fmtData(p.data)} — {p.label}</span>
                                                <span className="font-semibold text-green-700 whitespace-nowrap">+ R$ {fmt(p.valor)}</span>
                                            </div>
                                        ))}
                                        {(soNoApp.saidas || []).map(p => (
                                            <div key={p.id} className="flex items-center justify-between gap-2">
                                                <span className="text-gray-700 truncate">{fmtData(p.data)} — {p.label}</span>
                                                <span className="font-semibold text-red-700 whitespace-nowrap">− R$ {fmt(p.valor)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <p className="text-xs text-gray-500">
                            Como funciona: exporte o extrato do banco em OFX — ou, na Conta PJ do Conta Azul (que não gera OFX), o próprio PDF do extrato — e importe aqui (importar de novo não duplica —
                            só atualiza a descrição das linhas que já existiam). O sistema <strong>sugere</strong> quando data e
                            valor batem: com uma baixa já registrada (aí Conciliar só amarra) ou com um boleto em aberto do
                            Contas a Pagar (aí Conciliar dá a baixa na hora, com a data e o banco do extrato, e envia ao Conta Azul).
                            "Conciliar automático" fecha sozinho os casos sem ambiguidade. Para todo o resto, <strong>"Buscar…"</strong>:
                            lista os boletos em aberto numa janela de ±15 dias (ajustável) e as baixas sem par, com busca por fornecedor —
                            dá para marcar vários, registrar juros/multa/desconto, cadastrar uma despesa que nunca foi lançada,
                            marcar <strong>transferência entre contas</strong> (dinheiro movido entre os bancos da empresa — não é
                            receita nem despesa; aparece em Saldos por Conta) ou ignorar (tarifa). Diferença de valor só passa
                            declarando o motivo, que fica registrado na linha.
                            Para <strong>tarifas repetidas</strong> (boleto/PIX do Asaas): marque as caixinhas das saídas pendentes e
                            clique em <strong>"Lançar despesas e conciliar"</strong> — escolhe fornecedor, categoria e forma de pagamento
                            uma vez só, e cada linha vira uma despesa já paga e conciliada.
                        </p>
                    </>
                )}
            </div>

            {/* A busca única: "o que é este lançamento no sistema?" — boletos em aberto,
                baixas registradas, cadastrar despesa e ignorar, tudo num lugar só. */}
            {buscarModal && (
                <BuscarModal
                    lancamento={buscarModal}
                    pendentes={lancamentos.filter(x => x.status === 'PENDENTE')}
                    contaId={contaId}
                    onClose={() => setBuscarModal(null)}
                    onSuccess={() => { setBuscarModal(null); carregar(); }}
                    onCriarDespesa={() => { setDespesaModal(buscarModal); setBuscarModal(null); }}
                    onTransferir={() => { setTransfModal(buscarModal); setBuscarModal(null); }}
                    onIgnorar={() => { const l = buscarModal; setBuscarModal(null); ignorarLinha(l); }}
                />
            )}

            {/* Dinheiro movido entre contas da própria empresa — nem receita nem despesa */}
            {transfModal && (
                <TransferenciaModal
                    lancamento={transfModal}
                    contas={contas}
                    contaId={contaId}
                    onClose={() => setTransfModal(null)}
                    onSuccess={() => { setTransfModal(null); carregar(); }}
                />
            )}

            {/* Cadastrar a despesa que faltava. Ao salvar, volta para a lista com a baixa
                já sugerida na linha — o usuário confere e clica em "Conciliar". */}
            {despesaModal && (
                <DespesaModal
                    lancamento={despesaModal}
                    onClose={() => setDespesaModal(null)}
                    onSuccess={() => { setDespesaModal(null); carregar(); }}
                />
            )}

            {/* Lançar VÁRIAS despesas de uma vez (tarifas) e já conciliar */}
            {loteModal && (
                <DespesaLoteModal
                    lancamentos={lancamentosSelecionados}
                    onClose={() => setLoteModal(false)}
                    onSuccess={() => { setLoteModal(false); carregar(); }}
                />
            )}
        </div>
    );
};

export default ConciliacaoBancariaPage;
