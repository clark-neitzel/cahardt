import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import contasReceberService from '../../services/contasReceberService';
import vendedorService from '../../services/vendedorService';
import {
    DollarSign, Search, Filter, X, RefreshCw, CheckCircle, Undo2,
    Download, ArrowUpDown, CheckSquare, Square, Ban, Link as LinkIcon
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

    const [vendedores, setVendedores] = useState([]);

    // Filtros
    const [filtros, setFiltros] = useState({
        busca: saved.busca || '',
        status: saved.status || '',
        statusParcela: saved.statusParcela || '',
        origem: saved.origem || '',
        vendedorId: saved.vendedorId || '',
        condicaoPagamento: saved.condicaoPagamento || '',
        formaPagamento: saved.formaPagamento || '',
        vencDe: saved.vencDe || '',
        vencAte: saved.vencAte || '',
        pagDe: saved.pagDe || '',
        pagAte: saved.pagAte || ''
    });

    // Ordenação client-side
    const [sort, setSort] = useState({ col: 'vencimento', dir: 'asc' });

    // Seleção
    const [sel, setSel] = useState(new Set());

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
            if (filtros.status) params.status = filtros.status;
            if (filtros.statusParcela) params.statusParcela = filtros.statusParcela;
            if (filtros.origem) params.origem = filtros.origem;
            if (filtros.vendedorId) params.vendedorId = filtros.vendedorId;
            if (filtros.condicaoPagamento) params.condicaoPagamento = filtros.condicaoPagamento;
            if (filtros.formaPagamento) params.formaPagamento = filtros.formaPagamento;
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
            if (filtros.statusParcela) filtered = filtered.filter(l => l.statusParcela === filtros.statusParcela);
            if (filtros.formaPagamento) filtered = filtered.filter(l => (l.formaPagamento || '') === filtros.formaPagamento);
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
            busca: '', status: '', statusParcela: '', origem: '', vendedorId: '',
            condicaoPagamento: '', formaPagamento: '', vencDe: '', vencAte: '', pagDe: '', pagAte: ''
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
        if (!window.confirm('Verificar no Conta Azul todas as contas abertas e aplicar as baixas já pagas? Pode levar alguns minutos.')) return;
        setSyncingTodas(true);
        try {
            const r = await contasReceberService.syncCATodas();
            toast.success(r.message || `Sync concluído: ${r.totalParcelasBaixadas || 0} parcela(s) baixadas.`, { duration: 6000 });
            fetchData();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro no sync em lote');
        } finally {
            setSyncingTodas(false);
        }
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
            <div className="bg-white border rounded-lg p-3 mb-4">
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
                        <select value={filtros.status} onChange={e => setFiltros(f => ({ ...f, status: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-sm">
                            <option value="">Todos</option>
                            <option>ABERTO</option><option>PARCIAL</option><option>QUITADO</option><option>CANCELADO</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">Status Parcela</label>
                        <select value={filtros.statusParcela} onChange={e => setFiltros(f => ({ ...f, statusParcela: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-sm">
                            <option value="">Todas</option>
                            <option>PENDENTE</option><option>PAGO</option><option>VENCIDO</option><option>CANCELADO</option>
                        </select>
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
                        <select value={filtros.condicaoPagamento} onChange={e => setFiltros(f => ({ ...f, condicaoPagamento: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-sm">
                            <option value="">Todas</option>
                            {condicoes.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-gray-500">Forma Pgto (baixa)</label>
                        <select value={filtros.formaPagamento} onChange={e => setFiltros(f => ({ ...f, formaPagamento: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-sm">
                            <option value="">Todas</option>
                            {[...new Set([...FORMAS, ...formasUsadas])].map(f => <option key={f}>{f}</option>)}
                        </select>
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

            {/* Tabela */}
            <div className="bg-white border rounded-lg overflow-x-auto">
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
                            <Th col="vendedorNome" className="hidden lg:table-cell">Vendedor</Th>
                            <Th col="condicaoPagamento" className="hidden xl:table-cell">Condição</Th>
                            <Th col="origem" className="hidden lg:table-cell">Origem</Th>
                            <Th col="statusConta">Conta</Th>
                            <Th col="numeroParcela">Parc.</Th>
                            <Th col="valor" className="text-right">Valor</Th>
                            <Th col="vencimento">Vencimento</Th>
                            <Th col="statusParcela">Status</Th>
                            <Th col="pagamento" className="hidden lg:table-cell">Pagamento</Th>
                            <Th col="formaPagamento" className="hidden xl:table-cell">Forma</Th>
                            <Th col="baixadoPorNome" className="hidden xl:table-cell">Baixado por</Th>
                            <th className="px-2 py-2 text-xs font-semibold text-gray-600">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={14} className="py-8 text-center text-gray-500">Carregando...</td></tr>
                        )}
                        {!loading && linhasOrdenadas.length === 0 && (
                            <tr><td colSpan={14} className="py-8 text-center text-gray-500">Nenhuma parcela encontrada.</td></tr>
                        )}
                        {!loading && linhasOrdenadas.map(l => {
                            const eleg = elegivel(l);
                            return (
                                <tr key={l.parcelaId} className="border-b hover:bg-gray-50">
                                    <td className="px-2 py-1.5">
                                        {eleg ? (
                                            <button onClick={() => toggleOne(l.parcelaId)}>
                                                {sel.has(l.parcelaId) ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-gray-400" />}
                                            </button>
                                        ) : null}
                                    </td>
                                    <td className="px-2 py-1.5">
                                        {l.pedidoNumero ? `#${l.pedidoNumero}` : (l.pedidoEspecial ? 'Esp.' : '-')}
                                    </td>
                                    <td className="px-2 py-1.5 max-w-[200px] xl:max-w-[280px] truncate" title={l.clienteNome}>{l.clienteNome}</td>
                                    <td className="px-2 py-1.5 hidden lg:table-cell truncate max-w-[140px]" title={l.vendedorNome || ''}>{l.vendedorNome || '-'}</td>
                                    <td className="px-2 py-1.5 hidden xl:table-cell truncate max-w-[160px]" title={l.condicaoPagamento || ''}>{l.condicaoPagamento || '-'}</td>
                                    <td className="px-2 py-1.5 text-xs hidden lg:table-cell whitespace-nowrap">{l.origem === 'FATURADO_CA' ? 'CA' : 'Esp.'}</td>
                                    <td className="px-2 py-1.5 whitespace-nowrap">
                                        <span className={`px-2 py-0.5 rounded text-xs ${STATUS_CONTA[l.statusConta] || ''}`}>{l.statusConta}</span>
                                    </td>
                                    <td className="px-2 py-1.5 text-xs whitespace-nowrap">{l.numeroParcela}/{l.parcelasTotal}</td>
                                    <td className="px-2 py-1.5 text-right font-medium tabular-nums whitespace-nowrap">R$ {fmt(l.valor)}</td>
                                    <td className="px-2 py-1.5 whitespace-nowrap">{fmtData(l.dataVencimento)}</td>
                                    <td className="px-2 py-1.5 whitespace-nowrap">
                                        <span className={`px-2 py-0.5 rounded text-xs ${STATUS_PARC[l.statusParcela] || ''}`}>{l.statusParcela}</span>
                                    </td>
                                    <td className="px-2 py-1.5 hidden lg:table-cell whitespace-nowrap">{fmtData(l.dataPagamento)}</td>
                                    <td className="px-2 py-1.5 text-xs hidden xl:table-cell truncate max-w-[120px]" title={l.formaPagamento || ''}>{l.formaPagamento || '-'}</td>
                                    <td className="px-2 py-1.5 text-xs hidden xl:table-cell truncate max-w-[140px]" title={l.baixadoPorNome || ''}>{l.baixadoPorNome || '-'}</td>
                                    <td className="px-2 py-1.5">
                                        <div className="flex items-center gap-1">
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
        </div>
    );
};

export default ContasReceberTabela;
