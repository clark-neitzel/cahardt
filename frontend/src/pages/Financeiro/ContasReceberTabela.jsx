import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import contasReceberService from '../../services/contasReceberService';
import vendedorService from '../../services/vendedorService';
import {
    DollarSign, Search, Filter, X, RefreshCw, CheckCircle, Undo2,
    Download, ArrowUpDown, CheckSquare, Square, Link as LinkIcon,
    ChevronDown, ChevronUp, MoreVertical
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

const LS_KEY = 'contasReceberTabela_filters';

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-';

const STATUS_CONTA = {
    ABERTO: 'bg-blue-100 text-blue-800',
    PARCIAL: 'bg-yellow-100 text-yellow-800',
    QUITADO: 'bg-green-100 text-green-800',
    CANCELADO: 'bg-gray-200 text-gray-500'
};
const STATUS_PARC = {
    PENDENTE: 'bg-gray-100 text-gray-700',
    PAGO: 'bg-green-100 text-green-700',
    VENCIDO: 'bg-red-100 text-red-700',
    CANCELADO: 'bg-gray-100 text-gray-400'
};

const FORMAS = ['Dinheiro', 'Pix', 'Boleto', 'Cartão Crédito', 'Cartão Débito', 'Transferência', 'Cheque', 'Outro'];

const loadFilters = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
    catch { return {}; }
};

const ContasReceberTabela = () => {
    const { user } = useAuth();
    const podeBaixar = user?.permissoes?.admin || user?.permissoes?.Pode_Baixar_Contas_Receber;

    const saved = loadFilters();

    const [linhas, setLinhas] = useState([]);
    const [indicadores, setIndicadores] = useState({});
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(null);
    const [syncingTodas, setSyncingTodas] = useState(false);
    const [syncLog, setSyncLog] = useState(null); // { progresso, total, itens: [{pedido, status, msg, aplicadas}], ativo }

    const [vendedores, setVendedores] = useState([]);

    // Filtros — status/statusParcela/condicao/forma são ARRAYS (multi-select)
    const asArr = (v) => Array.isArray(v) ? v : (v ? [v] : []);
    const [filtros, setFiltros] = useState({
        busca: saved.busca || '',
        status: asArr(saved.status),
        statusParcela: asArr(saved.statusParcela),
        origem: saved.origem || '',
        vendedorId: saved.vendedorId || '',
        condicaoPagamento: asArr(saved.condicaoPagamento),
        formaPagamento: asArr(saved.formaPagamento),
        vencDe: saved.vencDe || '',
        vencAte: saved.vencAte || '',
        pagDe: saved.pagDe || '',
        pagAte: saved.pagAte || ''
    });

    // Ordenação client-side
    const [sort, setSort] = useState({ col: 'vencimento', dir: 'asc' });

    // Seleção
    const [sel, setSel] = useState(new Set());

    // UI
    const [filtrosAbertos, setFiltrosAbertos] = useState(false);
    const [detalheLinha, setDetalheLinha] = useState(null);

    // Modais
    const [baixaLoteOpen, setBaixaLoteOpen] = useState(false);
    const [baixaLoteForm, setBaixaLoteForm] = useState({ formaPagamento: '', dataPagamento: '', observacao: '' });
    const [salvando, setSalvando] = useState(false);

    // Carrega aux
    useEffect(() => {
        vendedorService.listarAtivos().then(setVendedores).catch(() => {});
    }, []);

    // Condições distintas, derivadas das contas carregadas
    const condicoes = useMemo(() => {
        const set = new Set();
        linhas.forEach(l => { if (l.condicaoPagamento) set.add(l.condicaoPagamento); });
        return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }, [linhas]);

    // Formas de pagamento distintas (das baixas existentes)
    const formasUsadas = useMemo(() => {
        const set = new Set();
        linhas.forEach(l => { if (l.formaPagamento) set.add(l.formaPagamento); });
        return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }, [linhas]);

    const saveFilters = useCallback(() => {
        localStorage.setItem(LS_KEY, JSON.stringify(filtros));
    }, [filtros]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (filtros.busca) params.busca = filtros.busca;
            if (filtros.status.length) params.status = filtros.status.join(',');
            if (filtros.statusParcela.length) params.statusParcela = filtros.statusParcela.join(',');
            if (filtros.origem) params.origem = filtros.origem;
            if (filtros.vendedorId) params.vendedorId = filtros.vendedorId;
            if (filtros.condicaoPagamento.length) params.condicaoPagamento = filtros.condicaoPagamento.join(',');
            if (filtros.formaPagamento.length) params.formaPagamento = filtros.formaPagamento.join(',');
            if (filtros.vencDe) params.vencimentoDe = filtros.vencDe;
            if (filtros.vencAte) params.vencimentoAte = filtros.vencAte;
            if (filtros.pagDe) params.pagamentoDe = filtros.pagDe;
            if (filtros.pagAte) params.pagamentoAte = filtros.pagAte;

            const data = await contasReceberService.listar(params);
            // Flatten: uma linha por parcela
            const flat = [];
            (data.contas || []).forEach(c => {
                (c.parcelas || []).forEach(p => {
                    flat.push({
                        contaId: c.id,
                        parcelaId: p.id,
                        clienteNome: c.clienteNome,
                        clienteId: c.clienteId,
                        pedidoId: c.pedidoId,
                        pedidoNumero: c.pedidoNumero,
                        pedidoEspecial: c.pedidoEspecial,
                        idVendaContaAzul: c.idVendaContaAzul,
                        origem: c.origem,
                        condicaoPagamento: c.condicaoPagamento,
                        vendedorNome: c.vendedorNome,
                        vendedorId: c.vendedorId,
                        statusConta: c.status,
                        numeroParcela: p.numeroParcela,
                        parcelasTotal: c.parcelasTotal,
                        valor: p.valor,
                        dataVencimento: p.dataVencimento,
                        statusParcela: p.status,
                        dataPagamento: p.dataPagamento,
                        valorPago: p.valorPago,
                        formaPagamento: p.formaPagamento,
                        baixadoPorNome: p.baixadoPorNome
                    });
                });
            });
            // Filtro client-side extra para statusParcela/forma (quando some: combina em AND)
            let filtered = flat;
            if (filtros.statusParcela.length) filtered = filtered.filter(l => filtros.statusParcela.includes(l.statusParcela));
            if (filtros.formaPagamento.length) filtered = filtered.filter(l => filtros.formaPagamento.includes(l.formaPagamento || ''));
            setLinhas(filtered);
            setIndicadores(data.indicadores || {});
            saveFilters();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar');
        } finally {
            setLoading(false);
        }
    }, [filtros, saveFilters]);

    useEffect(() => { fetchData(); }, []); // eslint-disable-line

    const aplicarFiltros = () => fetchData();
    const limparFiltros = () => {
        setFiltros({
            busca: '', status: [], statusParcela: [], origem: '', vendedorId: '',
            condicaoPagamento: [], formaPagamento: [], vencDe: '', vencAte: '', pagDe: '', pagAte: ''
        });
        localStorage.removeItem(LS_KEY);
        setTimeout(fetchData, 0);
    };

    // Ordenação
    const linhasOrdenadas = useMemo(() => {
        const copy = [...linhas];
        const k = sort.col;
        const dir = sort.dir === 'asc' ? 1 : -1;
        copy.sort((a, b) => {
            let va = a[k], vb = b[k];
            if (k === 'vencimento') { va = a.dataVencimento; vb = b.dataVencimento; }
            if (k === 'pagamento') { va = a.dataPagamento || ''; vb = b.dataPagamento || ''; }
            if (k === 'valor') { va = Number(a.valor); vb = Number(b.valor); }
            if (va == null) va = '';
            if (vb == null) vb = '';
            if (va < vb) return -1 * dir;
            if (va > vb) return 1 * dir;
            return 0;
        });
        return copy;
    }, [linhas, sort]);

    const toggleSort = (col) => setSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }));

    // Seleção
    const elegivel = (l) => l.statusParcela === 'PENDENTE' || l.statusParcela === 'VENCIDO';
    const selElegiveis = linhasOrdenadas.filter(elegivel);
    const todasSelecionadas = selElegiveis.length > 0 && selElegiveis.every(l => sel.has(l.parcelaId));
    const toggleOne = (id) => setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const toggleTodas = () => setSel(p => {
        if (todasSelecionadas) { const n = new Set(p); selElegiveis.forEach(l => n.delete(l.parcelaId)); return n; }
        const n = new Set(p); selElegiveis.forEach(l => n.add(l.parcelaId)); return n;
    });

    const valorSel = useMemo(() =>
        linhasOrdenadas.filter(l => sel.has(l.parcelaId)).reduce((s, l) => s + Number(l.valor || 0), 0)
    , [linhasOrdenadas, sel]);

    // Baixa individual rápida
    const handleBaixar = async (l) => {
        if (!podeBaixar) return;
        const forma = window.prompt(`Forma de pagamento para parcela ${l.numeroParcela} (R$ ${fmt(l.valor)}):`, 'Dinheiro');
        if (forma === null) return;
        try {
            await contasReceberService.darBaixa(l.parcelaId, {
                valorPago: l.valor,
                formaPagamento: forma || null,
                dataPagamento: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
            });
            toast.success('Baixa realizada!');
            fetchData();
        } catch (e) { toast.error(e.response?.data?.error || 'Erro ao baixar'); }
    };

    const handleEstornar = async (l) => {
        if (!window.confirm(`Estornar baixa da parcela ${l.numeroParcela}?`)) return;
        try {
            await contasReceberService.estornarBaixa(l.parcelaId);
            toast.success('Estornado');
            fetchData();
        } catch (e) { toast.error(e.response?.data?.error || 'Erro'); }
    };

    const handleSyncCATodas = async () => {
        // Itera pelas contas VISÍVEIS na tela (únicas), uma por uma, com log detalhado.
        const contasUnicas = [];
        const seen = new Set();
        for (const l of linhasOrdenadas) {
            if (seen.has(l.contaId)) continue;
            if (!l.idVendaContaAzul) continue;
            if (l.statusConta === 'QUITADO' || l.statusConta === 'CANCELADO') continue;
            seen.add(l.contaId);
            contasUnicas.push(l);
        }
        if (contasUnicas.length === 0) { toast('Nenhuma conta elegível visível na tela.'); return; }
        if (!window.confirm(`Verificar ${contasUnicas.length} conta(s) visíveis no Conta Azul? Uma por uma, com log detalhado.`)) return;

        setSyncingTodas(true);
        setSyncLog({ progresso: 0, total: contasUnicas.length, itens: [], ativo: true, totalAplicadas: 0, erros: 0 });

        let totalAplicadas = 0;
        let erros = 0;
        const itens = [];
        for (let i = 0; i < contasUnicas.length; i++) {
            const l = contasUnicas[i];
            const label = l.pedidoNumero ? `#${l.pedidoNumero}` : l.contaId.slice(0, 8);
            try {
                const r = await contasReceberService.syncCA(l.contaId);
                const aplicadas = r.aplicadas || 0;
                const vencAt = r.vencimentosAtualizados || 0;
                totalAplicadas += aplicadas;
                itens.push({
                    pedido: label,
                    cliente: l.clienteNome,
                    status: (aplicadas > 0 || vencAt > 0) ? 'ok' : 'semmudanca',
                    msg: r.message || r.mensagem || 'Sem alterações',
                    aplicadas,
                    debug: r.debug || null,
                    raw: r
                });
            } catch (e) {
                erros++;
                itens.push({
                    pedido: label,
                    cliente: l.clienteNome,
                    status: 'erro',
                    msg: e.response?.data?.error || e.message || 'Erro desconhecido',
                    aplicadas: 0,
                    debug: e.response?.data?.detalhe || null,
                    raw: e.response?.data || { error: e.message }
                });
            }
            setSyncLog({ progresso: i + 1, total: contasUnicas.length, itens: [...itens], ativo: i + 1 < contasUnicas.length, totalAplicadas, erros });
            // throttle entre contas pra evitar rate limit do CA (10 req/s)
            if (i + 1 < contasUnicas.length) await new Promise(r => setTimeout(r, 800));
        }

        toast.success(`Concluído: ${totalAplicadas} parcela(s) baixadas em ${contasUnicas.length} conta(s). ${erros} erro(s).`, { duration: 6000 });
        fetchData();
        setSyncingTodas(false);
    };

    const handleSyncCA = async (contaId, idVendaCA) => {
        if (!idVendaCA) { toast.error('Pedido ainda não foi ao CA'); return; }
        setSyncing(contaId);
        try {
            const r = await contasReceberService.syncCA(contaId);
            toast.success(r.message);
            fetchData();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro na sincronização CA');
        } finally { setSyncing(null); }
    };

    const handleBaixaLote = async () => {
        if (sel.size === 0) return;
        setSalvando(true);
        try {
            const r = await contasReceberService.darBaixaLote({
                parcelaIds: [...sel],
                formaPagamento: baixaLoteForm.formaPagamento || null,
                dataPagamento: baixaLoteForm.dataPagamento || null,
                observacao: baixaLoteForm.observacao || null
            });
            toast.success(r.message);
            setBaixaLoteOpen(false);
            setSel(new Set());
            fetchData();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao baixar');
        } finally { setSalvando(false); }
    };

    const exportarCSV = () => {
        const header = ['Pedido','Cliente','Vendedor','Condição','Origem','Status Conta','Parcela','Valor','Vencimento','Status Parcela','Pagamento','Forma','Baixado por'];
        const rows = linhasOrdenadas.map(l => [
            l.pedidoNumero || '',
            l.clienteNome,
            l.vendedorNome || '',
            l.condicaoPagamento || '',
            l.origem,
            l.statusConta,
            `${l.numeroParcela}/${l.parcelasTotal}`,
            Number(l.valor).toFixed(2).replace('.', ','),
            fmtData(l.dataVencimento),
            l.statusParcela,
            fmtData(l.dataPagamento),
            l.formaPagamento || '',
            l.baixadoPorNome || ''
        ]);
        const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
        const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `contas-receber-${new Date().toISOString().split('T')[0]}.csv`;
        a.click(); URL.revokeObjectURL(url);
    };

    const filtrosAtivos = useMemo(() =>
        Object.values(filtros).filter(v => Array.isArray(v) ? v.length > 0 : Boolean(v)).length
    , [filtros]);

    const MultiSelect = ({ label, options, value, onChange }) => {
        const [open, setOpen] = useState(false);
        const ref = React.useRef(null);
        useEffect(() => {
            const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
            document.addEventListener('mousedown', h);
            return () => document.removeEventListener('mousedown', h);
        }, []);
        const toggle = (opt) => {
            onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt]);
        };
        const summary = value.length === 0 ? label : value.length === 1 ? value[0] : `${value.length} selec.`;
        return (
            <div className="relative" ref={ref}>
                <button type="button" onClick={() => setOpen(v => !v)} className="w-full border rounded px-2 py-1.5 text-sm text-left flex items-center justify-between hover:bg-gray-50">
                    <span className={value.length === 0 ? 'text-gray-500' : 'text-gray-900'}>{summary}</span>
                    <ChevronDown className="w-3 h-3 text-gray-400" />
                </button>
                {open && (
                    <div className="absolute z-20 mt-1 w-full bg-white border rounded shadow-lg max-h-64 overflow-y-auto">
                        {value.length > 0 && (
                            <button type="button" onClick={() => onChange([])} className="w-full text-left text-xs text-blue-600 px-2 py-1 border-b hover:bg-gray-50">Limpar seleção</button>
                        )}
                        {options.length === 0 && <div className="px-2 py-2 text-xs text-gray-400">Sem opções</div>}
                        {options.map(opt => (
                            <label key={opt} className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                                <input type="checkbox" checked={value.includes(opt)} onChange={() => toggle(opt)} className="cursor-pointer" />
                                <span className="truncate">{opt}</span>
                            </label>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const Th = ({ col, children, className = '' }) => (
        <th className={`px-2 py-2 text-left text-xs font-semibold text-gray-600 select-none ${className}`}>
            <button onClick={() => toggleSort(col)} className="inline-flex items-center gap-1 hover:text-gray-900">
                {children} <ArrowUpDown className="w-3 h-3 opacity-50" />
            </button>
        </th>
    );

    return (
        <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <DollarSign className="w-6 h-6 text-green-600" />
                    <h1 className="text-xl md:text-2xl font-bold">Contas a Receber — Tabela</h1>
                </div>
                <div className="flex gap-2">
                    <Link to="/financeiro/contas-receber" className="text-sm px-3 py-1.5 rounded border hover:bg-gray-50">
                        Ver resumo ↗
                    </Link>
                    {podeBaixar && (
                        <button
                            onClick={handleSyncCATodas}
                            disabled={syncingTodas}
                            title="Verifica no Conta Azul todas as contas abertas e aplica as baixas que já foram pagas lá"
                            className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 inline-flex items-center gap-1"
                        >
                            <RefreshCw className={`w-4 h-4 ${syncingTodas ? 'animate-spin' : ''}`} />
                            {syncingTodas ? 'Baixando...' : 'Baixar parcelas do CA'}
                        </button>
                    )}
                    <button onClick={exportarCSV} className="text-sm px-3 py-1.5 rounded border hover:bg-gray-50 inline-flex items-center gap-1">
                        <Download className="w-4 h-4" /> CSV
                    </button>
                </div>
            </div>

            {/* Indicadores */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-white border rounded-lg p-3">
                    <div className="text-xs text-gray-500">Total em Aberto</div>
                    <div className="text-lg font-bold">R$ {fmt(indicadores.totalEmAberto)}</div>
                </div>
                <div className="bg-white border rounded-lg p-3">
                    <div className="text-xs text-red-600">Vencidas</div>
                    <div className="text-lg font-bold text-red-600">R$ {fmt(indicadores.totalVencidas)}</div>
                </div>
                <div className="bg-white border rounded-lg p-3">
                    <div className="text-xs text-yellow-700">A vencer (7d)</div>
                    <div className="text-lg font-bold text-yellow-700">R$ {fmt(indicadores.totalAVencer7d)}</div>
                </div>
                <div className="bg-white border rounded-lg p-3">
                    <div className="text-xs text-green-700">Quitadas no mês</div>
                    <div className="text-lg font-bold text-green-700">R$ {fmt(indicadores.totalQuitadasMes)}</div>
                </div>
            </div>

            {/* Filtros */}
            <div className="bg-white border rounded-lg mb-4">
                <button
                    onClick={() => setFiltrosAbertos(v => !v)}
                    className="w-full flex items-center justify-between p-3 lg:hidden"
                >
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                        <Filter className="w-4 h-4" /> Filtros
                        {filtrosAtivos > 0 && (
                            <span className="bg-blue-600 text-white text-[10px] rounded-full px-1.5 py-0.5">{filtrosAtivos}</span>
                        )}
                    </span>
                    {filtrosAbertos ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                <div className={`p-3 ${filtrosAbertos ? 'block' : 'hidden'} lg:block`}>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    <div className="col-span-2">
                        <label className="text-xs text-gray-500">Cliente</label>
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-2 top-2.5 text-gray-400" />
                            <input
                                value={filtros.busca}
                                onChange={e => setFiltros(f => ({ ...f, busca: e.target.value }))}
                                onKeyDown={e => e.key === 'Enter' && aplicarFiltros()}
                                placeholder="Buscar..."
                                className="w-full border rounded pl-8 pr-2 py-1.5 text-sm"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">Status Conta</label>
                        <MultiSelect
                            label="Todos"
                            options={['ABERTO', 'PARCIAL', 'QUITADO', 'CANCELADO']}
                            value={filtros.status}
                            onChange={(v) => setFiltros(f => ({ ...f, status: v }))}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">Status Parcela</label>
                        <MultiSelect
                            label="Todas"
                            options={['PENDENTE', 'PAGO', 'VENCIDO', 'CANCELADO']}
                            value={filtros.statusParcela}
                            onChange={(v) => setFiltros(f => ({ ...f, statusParcela: v }))}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">Origem</label>
                        <select value={filtros.origem} onChange={e => setFiltros(f => ({ ...f, origem: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-sm">
                            <option value="">Todas</option>
                            <option value="FATURADO_CA">Faturado CA</option>
                            <option value="ESPECIAL">Especial</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">Vendedor</label>
                        <select value={filtros.vendedorId} onChange={e => setFiltros(f => ({ ...f, vendedorId: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-sm">
                            <option value="">Todos</option>
                            {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">Condição Pgto</label>
                        <MultiSelect
                            label="Todas"
                            options={condicoes}
                            value={filtros.condicaoPagamento}
                            onChange={(v) => setFiltros(f => ({ ...f, condicaoPagamento: v }))}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">Forma Pgto (baixa)</label>
                        <MultiSelect
                            label="Todas"
                            options={[...new Set([...FORMAS, ...formasUsadas])]}
                            value={filtros.formaPagamento}
                            onChange={(v) => setFiltros(f => ({ ...f, formaPagamento: v }))}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">Venc. de</label>
                        <input type="date" value={filtros.vencDe} onChange={e => setFiltros(f => ({ ...f, vencDe: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">Venc. até</label>
                        <input type="date" value={filtros.vencAte} onChange={e => setFiltros(f => ({ ...f, vencAte: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">Pgto de</label>
                        <input type="date" value={filtros.pagDe} onChange={e => setFiltros(f => ({ ...f, pagDe: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">Pgto até</label>
                        <input type="date" value={filtros.pagAte} onChange={e => setFiltros(f => ({ ...f, pagAte: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                </div>
                <div className="flex items-center justify-end gap-2 mt-3">
                    <button onClick={limparFiltros} className="text-sm px-3 py-1.5 rounded border hover:bg-gray-50 inline-flex items-center gap-1">
                        <X className="w-4 h-4" /> Limpar
                    </button>
                    <button onClick={aplicarFiltros} className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1">
                        <Filter className="w-4 h-4" /> Filtrar
                    </button>
                </div>
                </div>
            </div>

            {/* Barra de seleção */}
            {sel.size > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 flex items-center justify-between">
                    <div className="text-sm">
                        <strong>{sel.size}</strong> parcela(s) selecionada(s) — Total <strong>R$ {fmt(valorSel)}</strong>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setSel(new Set())} className="text-sm px-3 py-1.5 rounded border hover:bg-white">Limpar</button>
                        {podeBaixar && (
                            <button
                                onClick={() => {
                                    setBaixaLoteForm({ formaPagamento: '', dataPagamento: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }), observacao: '' });
                                    setBaixaLoteOpen(true);
                                }}
                                className="text-sm px-3 py-1.5 rounded bg-green-600 text-white hover:bg-green-700 inline-flex items-center gap-1"
                            >
                                <CheckCircle className="w-4 h-4" /> Baixar em lote
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Cards (< xl) */}
            <div className="xl:hidden space-y-2">
                {loading && <div className="bg-white border rounded-lg p-6 text-center text-gray-500">Carregando...</div>}
                {!loading && linhasOrdenadas.length === 0 && (
                    <div className="bg-white border rounded-lg p-6 text-center text-gray-500">Nenhuma parcela encontrada.</div>
                )}
                {!loading && linhasOrdenadas.map(l => {
                    const eleg = elegivel(l);
                    const atrasada = l.statusParcela === 'VENCIDO';
                    return (
                        <div
                            key={l.parcelaId}
                            className={`bg-white border rounded-lg p-3 ${atrasada ? 'border-red-200' : 'border-gray-200'} ${sel.has(l.parcelaId) ? 'ring-2 ring-blue-300' : ''}`}
                        >
                            <div className="flex items-start gap-2">
                                {eleg && (
                                    <button onClick={(e) => { e.stopPropagation(); toggleOne(l.parcelaId); }} className="mt-1 flex-shrink-0">
                                        {sel.has(l.parcelaId) ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5 text-gray-400" />}
                                    </button>
                                )}
                                <button
                                    onClick={() => setDetalheLinha(l)}
                                    className="flex-1 min-w-0 text-left"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1 text-sm">
                                                <span className="text-gray-400 font-mono">{l.pedidoNumero ? `#${l.pedidoNumero}` : (l.pedidoEspecial ? 'Esp.' : '-')}</span>
                                                <span className="font-medium text-gray-900 truncate" title={l.clienteNome}>{l.clienteNome}</span>
                                            </div>
                                            <div className="text-xs text-gray-500 mt-0.5 truncate">
                                                {l.condicaoPagamento || '-'}{l.vendedorNome ? ` · ${l.vendedorNome}` : ''}
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <div className="font-bold text-gray-900 text-sm tabular-nums whitespace-nowrap">R$ {fmt(l.valor)}</div>
                                            <div className="text-[11px] text-gray-500 whitespace-nowrap">Parc. {l.numeroParcela}/{l.parcelasTotal}</div>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_PARC[l.statusParcela] || ''}`}>{l.statusParcela}</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_CONTA[l.statusConta] || ''}`}>{l.statusConta}</span>
                                        <span className="text-[11px] text-gray-500 tabular-nums">
                                            Venc: {fmtData(l.dataVencimento)}
                                        </span>
                                        {l.dataPagamento && (
                                            <span className="text-[11px] text-green-700 tabular-nums">
                                                Pago: {fmtData(l.dataPagamento)} {l.formaPagamento ? `(${l.formaPagamento})` : ''}
                                            </span>
                                        )}
                                    </div>
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setDetalheLinha(l); }}
                                    className="p-1.5 rounded hover:bg-gray-100 flex-shrink-0"
                                    title="Ver detalhes e ações"
                                >
                                    <MoreVertical className="w-4 h-4 text-gray-500" />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Tabela (xl+) */}
            <div className="hidden xl:block bg-white border rounded-lg">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                        <tr>
                            <th className="px-2 py-2 w-8">
                                <button onClick={toggleTodas} title="Selecionar todas elegíveis">
                                    {todasSelecionadas ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-gray-400" />}
                                </button>
                            </th>
                            <Th col="pedidoNumero">Pedido</Th>
                            <Th col="clienteNome">Cliente</Th>
                            <Th col="vendedorNome">Vendedor</Th>
                            <Th col="valor" className="text-right">Valor</Th>
                            <Th col="vencimento">Venc.</Th>
                            <th className="px-2 py-2 text-xs font-semibold text-gray-600 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={7} className="py-8 text-center text-gray-500">Carregando...</td></tr>
                        )}
                        {!loading && linhasOrdenadas.length === 0 && (
                            <tr><td colSpan={7} className="py-8 text-center text-gray-500">Nenhuma parcela encontrada.</td></tr>
                        )}
                        {!loading && linhasOrdenadas.map(l => {
                            const eleg = elegivel(l);
                            return (
                                <React.Fragment key={l.parcelaId}>
                                    <tr className="hover:bg-gray-50">
                                        <td className="px-2 pt-2 pb-0.5 align-top">
                                            {eleg ? (
                                                <button onClick={() => toggleOne(l.parcelaId)}>
                                                    {sel.has(l.parcelaId) ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-gray-400" />}
                                                </button>
                                            ) : null}
                                        </td>
                                        <td className="px-2 pt-2 pb-0.5 font-mono text-gray-700 whitespace-nowrap">
                                            {l.pedidoNumero ? `#${l.pedidoNumero}` : (l.pedidoEspecial ? 'Esp.' : '-')}
                                        </td>
                                        <td className="px-2 pt-2 pb-0.5 font-medium">{l.clienteNome}</td>
                                        <td className="px-2 pt-2 pb-0.5 text-gray-700">{l.vendedorNome || '-'}</td>
                                        <td className="px-2 pt-2 pb-0.5 text-right font-bold tabular-nums whitespace-nowrap">R$ {fmt(l.valor)}</td>
                                        <td className="px-2 pt-2 pb-0.5 whitespace-nowrap tabular-nums">{fmtData(l.dataVencimento)}</td>
                                        <td className="px-2 pt-2 pb-0.5">
                                            <div className="flex items-center justify-end gap-1">
                                                {podeBaixar && eleg && (
                                                    <button onClick={() => handleBaixar(l)} title="Baixar" className="p-1 rounded hover:bg-green-100 text-green-700">
                                                        <CheckCircle className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {podeBaixar && l.statusParcela === 'PAGO' && (
                                                    <button onClick={() => handleEstornar(l)} title="Estornar" className="p-1 rounded hover:bg-yellow-100 text-yellow-700">
                                                        <Undo2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {podeBaixar && l.idVendaContaAzul && l.statusConta !== 'QUITADO' && l.statusConta !== 'CANCELADO' && (
                                                    <button
                                                        onClick={() => handleSyncCA(l.contaId, l.idVendaContaAzul)}
                                                        disabled={syncing === l.contaId}
                                                        title="Verificar baixas no Conta Azul"
                                                        className="p-1 rounded hover:bg-blue-100 text-blue-700 disabled:opacity-40"
                                                    >
                                                        <RefreshCw className={`w-4 h-4 ${syncing === l.contaId ? 'animate-spin' : ''}`} />
                                                    </button>
                                                )}
                                                {l.pedidoId && (
                                                    <Link to={`/pedidos/${l.pedidoId}`} title="Ver pedido" className="p-1 rounded hover:bg-gray-100 text-gray-600">
                                                        <LinkIcon className="w-4 h-4" />
                                                    </Link>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    <tr className="border-b hover:bg-gray-50">
                                        <td></td>
                                        <td colSpan={6} className="px-2 pt-0 pb-2 text-xs text-gray-500">
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                <span title="Condição"><span className="text-gray-400">Cond.:</span> {l.condicaoPagamento || '-'}</span>
                                                <span title="Origem"><span className="text-gray-400">Orig.:</span> {l.origem === 'FATURADO_CA' ? 'CA' : 'Esp.'}</span>
                                                <span className="inline-flex items-center gap-1"><span className="text-gray-400">Conta:</span>
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${STATUS_CONTA[l.statusConta] || ''}`}>{l.statusConta}</span>
                                                </span>
                                                <span><span className="text-gray-400">Parc.:</span> {l.numeroParcela}/{l.parcelasTotal}</span>
                                                <span className="inline-flex items-center gap-1"><span className="text-gray-400">Status:</span>
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${STATUS_PARC[l.statusParcela] || ''}`}>{l.statusParcela}</span>
                                                </span>
                                                {l.dataPagamento && <span className="tabular-nums"><span className="text-gray-400">Pgto:</span> {fmtData(l.dataPagamento)}</span>}
                                                {l.formaPagamento && <span><span className="text-gray-400">Forma:</span> {l.formaPagamento}</span>}
                                                {l.baixadoPorNome && <span><span className="text-gray-400">Baixado por:</span> {l.baixadoPorNome}</span>}
                                            </div>
                                        </td>
                                    </tr>
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="text-xs text-gray-500 mt-2">
                {linhasOrdenadas.length} linha(s)
            </div>

            {/* Modal baixa em lote */}
            {baixaLoteOpen && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg max-w-md w-full p-5">
                        <h3 className="text-lg font-bold mb-3">Baixar {sel.size} parcela(s) — R$ {fmt(valorSel)}</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-gray-500">Forma de pagamento</label>
                                <select value={baixaLoteForm.formaPagamento} onChange={e => setBaixaLoteForm(f => ({ ...f, formaPagamento: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-sm">
                                    <option value="">—</option>
                                    {FORMAS.map(f => <option key={f}>{f}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500">Data do pagamento</label>
                                <input type="date" value={baixaLoteForm.dataPagamento} onChange={e => setBaixaLoteForm(f => ({ ...f, dataPagamento: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-sm" />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500">Observação</label>
                                <textarea value={baixaLoteForm.observacao} onChange={e => setBaixaLoteForm(f => ({ ...f, observacao: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-sm" rows={2} />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => setBaixaLoteOpen(false)} className="px-3 py-1.5 rounded border">Cancelar</button>
                            <button onClick={handleBaixaLote} disabled={salvando} className="px-3 py-1.5 rounded bg-green-600 text-white disabled:opacity-50">
                                {salvando ? 'Salvando...' : 'Confirmar baixa'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal log sync CA */}
            {syncLog && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
                        <div className="px-4 py-3 border-b flex items-center justify-between">
                            <h3 className="font-bold">
                                Sync CA — {syncLog.progresso}/{syncLog.total}
                                {syncLog.ativo && <RefreshCw className="inline w-4 h-4 ml-2 animate-spin text-blue-600" />}
                            </h3>
                            {!syncLog.ativo && (
                                <button onClick={() => setSyncLog(null)} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
                            )}
                        </div>
                        <div className="px-4 py-2 border-b bg-gray-50 text-xs text-gray-600 flex gap-4">
                            <span>✅ Baixadas: <strong>{syncLog.totalAplicadas}</strong> parcela(s)</span>
                            <span>⚠️ Erros: <strong className={syncLog.erros > 0 ? 'text-red-600' : ''}>{syncLog.erros}</strong></span>
                        </div>
                        <div className="overflow-y-auto flex-1 divide-y">
                            {syncLog.itens.map((it, idx) => (
                                <details key={idx} className="px-4 py-2 text-sm">
                                    <summary className="flex items-start gap-2 cursor-pointer list-none">
                                        <span className="flex-shrink-0 mt-0.5">
                                            {it.status === 'ok' && <span className="text-green-600">✅</span>}
                                            {it.status === 'semmudanca' && <span className="text-gray-400">➖</span>}
                                            {it.status === 'erro' && <span className="text-red-600">❌</span>}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-gray-900">
                                                {it.pedido} <span className="text-gray-500 font-normal">— {it.cliente}</span>
                                            </div>
                                            <div className={`text-xs ${it.status === 'erro' ? 'text-red-600' : 'text-gray-600'}`}>{it.msg}</div>
                                        </div>
                                        {(it.debug || it.raw) && <span className="text-[10px] text-blue-600">▸ debug</span>}
                                    </summary>
                                    {(it.debug || it.raw) && (
                                        <pre className="mt-2 ml-6 p-2 bg-gray-50 border rounded text-[10px] text-gray-700 overflow-x-auto">
{JSON.stringify(it.debug || it.raw, null, 2)}
                                        </pre>
                                    )}
                                </details>
                            ))}
                            {syncLog.ativo && syncLog.itens.length < syncLog.total && (
                                <div className="px-4 py-2 text-sm text-gray-400 italic">Processando...</div>
                            )}
                        </div>
                        {!syncLog.ativo && (
                            <div className="px-4 py-3 border-t flex justify-end gap-2">
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(JSON.stringify(syncLog.itens, null, 2));
                                        toast.success('Log copiado');
                                    }}
                                    className="px-3 py-2 rounded border text-sm hover:bg-gray-50"
                                >
                                    Copiar log
                                </button>
                                <button onClick={() => setSyncLog(null)} className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">Fechar</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal detalhes parcela */}
            {detalheLinha && (() => {
                const l = detalheLinha;
                const eleg = elegivel(l);
                const close = () => setDetalheLinha(null);
                const Field = ({ label, value, valueClass = '' }) => (
                    <div>
                        <div className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</div>
                        <div className={`text-sm ${valueClass}`}>{value || '-'}</div>
                    </div>
                );
                return (
                    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center md:p-4" onClick={close}>
                        <div className="bg-white rounded-t-lg md:rounded-lg max-w-lg w-full max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
                                <h3 className="font-bold text-base">
                                    Parcela {l.numeroParcela}/{l.parcelasTotal}
                                    <span className="ml-2 text-sm font-normal text-gray-500">
                                        {l.pedidoNumero ? `#${l.pedidoNumero}` : (l.pedidoEspecial ? 'Especial' : '')}
                                    </span>
                                </h3>
                                <button onClick={close} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
                            </div>
                            <div className="p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-[11px] text-gray-500 uppercase">Valor</div>
                                        <div className="text-2xl font-bold text-gray-900">R$ {fmt(l.valor)}</div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_PARC[l.statusParcela] || ''}`}>{l.statusParcela}</span>
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_CONTA[l.statusConta] || ''}`}>Conta: {l.statusConta}</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                                    <Field label="Cliente" value={l.clienteNome} />
                                    <Field label="Vendedor" value={l.vendedorNome} />
                                    <Field label="Condição" value={l.condicaoPagamento} />
                                    <Field label="Origem" value={l.origem === 'FATURADO_CA' ? 'Faturado CA' : 'Especial'} />
                                    <Field label="Vencimento" value={fmtData(l.dataVencimento)} valueClass={l.statusParcela === 'VENCIDO' ? 'text-red-600 font-medium' : ''} />
                                    <Field label="Pagamento" value={fmtData(l.dataPagamento)} valueClass={l.dataPagamento ? 'text-green-700 font-medium' : ''} />
                                    <Field label="Valor pago" value={l.valorPago ? `R$ ${fmt(l.valorPago)}` : '-'} />
                                    <Field label="Forma" value={l.formaPagamento} />
                                    <Field label="Baixado por" value={l.baixadoPorNome} />
                                    <Field label="ID CA" value={l.idVendaContaAzul ? '✓ Sincronizado' : 'Não enviado'} />
                                </div>
                            </div>
                            <div className="sticky bottom-0 bg-white border-t px-4 py-3 flex flex-wrap gap-2 justify-end">
                                {l.pedidoId && (
                                    <Link to={`/pedidos/${l.pedidoId}`} onClick={close} className="px-3 py-2 rounded border text-sm inline-flex items-center gap-1 hover:bg-gray-50">
                                        <LinkIcon className="w-4 h-4" /> Ver pedido
                                    </Link>
                                )}
                                {podeBaixar && l.idVendaContaAzul && l.statusConta !== 'QUITADO' && l.statusConta !== 'CANCELADO' && (
                                    <button
                                        onClick={() => { handleSyncCA(l.contaId, l.idVendaContaAzul); close(); }}
                                        disabled={syncing === l.contaId}
                                        className="px-3 py-2 rounded bg-blue-50 text-blue-700 text-sm inline-flex items-center gap-1 hover:bg-blue-100 disabled:opacity-50"
                                    >
                                        <RefreshCw className={`w-4 h-4 ${syncing === l.contaId ? 'animate-spin' : ''}`} /> Sync CA
                                    </button>
                                )}
                                {podeBaixar && l.statusParcela === 'PAGO' && (
                                    <button
                                        onClick={() => { handleEstornar(l); close(); }}
                                        className="px-3 py-2 rounded bg-yellow-50 text-yellow-700 text-sm inline-flex items-center gap-1 hover:bg-yellow-100"
                                    >
                                        <Undo2 className="w-4 h-4" /> Estornar
                                    </button>
                                )}
                                {podeBaixar && eleg && (
                                    <button
                                        onClick={() => { handleBaixar(l); close(); }}
                                        className="px-3 py-2 rounded bg-green-600 text-white text-sm inline-flex items-center gap-1 hover:bg-green-700"
                                    >
                                        <CheckCircle className="w-4 h-4" /> Baixar
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default ContasReceberTabela;
