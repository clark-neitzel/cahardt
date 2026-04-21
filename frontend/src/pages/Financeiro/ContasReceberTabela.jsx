import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import contasReceberService from '../../services/contasReceberService';
import vendedorService from '../../services/vendedorService';
import pedidoService from '../../services/pedidoService';
import clienteService from '../../services/clienteService';
import categoriaClienteService from '../../services/categoriaClienteService';
import ClientePopup from '../Rota/ClientePopup';
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
    const [pedidoPopup, setPedidoPopup] = useState(null); // pedido completo
    const [pedidoLoading, setPedidoLoading] = useState(false);
    const [clientePopup, setClientePopup] = useState(null);

    const [vendedores, setVendedores] = useState([]);
    const [categorias, setCategorias] = useState([]);

    // Filtros — status/statusParcela/condicao/forma são ARRAYS (multi-select)
    const asArr = (v) => Array.isArray(v) ? v : (v ? [v] : []);
    const [filtros, setFiltros] = useState({
        busca: saved.busca || '',
        status: asArr(saved.status),
        statusParcela: asArr(saved.statusParcela),
        origem: saved.origem || '',
        vendedorId: saved.vendedorId || '',
        categoriaClienteId: saved.categoriaClienteId || '',
        condicaoPagamento: asArr(saved.condicaoPagamento),
        formaPagamento: asArr(saved.formaPagamento),
        vencDe: saved.vencDe || '',
        vencAte: saved.vencAte || '',
        pagDe: saved.pagDe || '',
        pagAte: saved.pagAte || ''
    });
    const [relatorioFiltros, setRelatorioFiltros] = useState({ vencDe: '', vencAte: '', categoriaClienteId: '' });

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
    const [relatorioOpen, setRelatorioOpen] = useState(false);
    const [relatorioData, setRelatorioData] = useState(null);
    const [relatorioLoading, setRelatorioLoading] = useState(false);
    const [relatorioAgrupamento, setRelatorioAgrupamento] = useState('pedido'); // pedido | cliente | vendedor | nenhum

    // Carrega aux
    useEffect(() => {
        vendedorService.listarAtivos().then(setVendedores).catch(() => {});
        categoriaClienteService.listar().then(setCategorias).catch(() => {});
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
            if (filtros.categoriaClienteId) params.categoriaClienteId = filtros.categoriaClienteId;
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

    // Auto-refresh quando qualquer filtro muda (exceto "busca", que usa Enter/botão).
    // Stringifica arrays/strings pra evitar trigger por nova ref a cada render.
    const didMount = useRef(false);
    const filtrosKey = JSON.stringify({
        status: filtros.status, statusParcela: filtros.statusParcela, origem: filtros.origem,
        vendedorId: filtros.vendedorId, categoriaClienteId: filtros.categoriaClienteId,
        condicaoPagamento: filtros.condicaoPagamento,
        formaPagamento: filtros.formaPagamento, vencDe: filtros.vencDe, vencAte: filtros.vencAte,
        pagDe: filtros.pagDe, pagAte: filtros.pagAte
    });
    useEffect(() => {
        if (!didMount.current) { didMount.current = true; return; }
        fetchData();
    }, [filtrosKey]); // eslint-disable-line

    const aplicarFiltros = () => fetchData();
    const limparFiltros = () => {
        setFiltros({
            busca: '', status: [], statusParcela: [], origem: '', vendedorId: '', categoriaClienteId: '',
            condicaoPagamento: [], formaPagamento: [], vencDe: '', vencAte: '', pagDe: '', pagAte: ''
        });
        localStorage.removeItem(LS_KEY);
        // fetchData é disparado pelo useEffect acima quando filtrosKey muda.
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

    const buscarRelatorio = async (rf) => {
        setRelatorioLoading(true);
        setRelatorioData(null);
        try {
            const params = {};
            if (filtros.busca) params.busca = filtros.busca;
            if (filtros.status.length) params.status = filtros.status.join(',');
            if (filtros.statusParcela.length) params.statusParcela = filtros.statusParcela.join(',');
            if (filtros.origem) params.origem = filtros.origem;
            if (filtros.vendedorId) params.vendedorId = filtros.vendedorId;
            if (filtros.condicaoPagamento.length) params.condicaoPagamento = filtros.condicaoPagamento.join(',');
            if (filtros.formaPagamento.length) params.formaPagamento = filtros.formaPagamento.join(',');
            if (filtros.pagDe) params.pagamentoDe = filtros.pagDe;
            if (filtros.pagAte) params.pagamentoAte = filtros.pagAte;
            // Filtros do próprio modal de relatório
            if (rf.vencDe) params.vencimentoDe = rf.vencDe;
            if (rf.vencAte) params.vencimentoAte = rf.vencAte;
            if (rf.categoriaClienteId) params.categoriaClienteId = rf.categoriaClienteId;
            const data = await contasReceberService.relatorioItens(params);
            setRelatorioData(data);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao gerar relatório');
        } finally {
            setRelatorioLoading(false);
        }
    };

    const abrirRelatorio = () => {
        const rf = { vencDe: filtros.vencDe, vencAte: filtros.vencAte, categoriaClienteId: filtros.categoriaClienteId || '' };
        setRelatorioFiltros(rf);
        setRelatorioOpen(true);
        buscarRelatorio(rf);
    };

    // Agrupa pedidos conforme seleção
    const gerarGrupos = (pedidos, agrupamento) => {
        if (agrupamento === 'cliente' || agrupamento === 'vendedor') {
            const map = new Map();
            pedidos.forEach(p => {
                const key = agrupamento === 'cliente' ? p.clienteNome : (p.vendedorNome || '-');
                if (!map.has(key)) map.set(key, { chave: key, total: 0, pedidos: [] });
                const g = map.get(key);
                g.pedidos.push(p);
                g.total += p.subtotal;
            });
            return [...map.values()].sort((a, b) => a.chave.localeCompare(b.chave, 'pt-BR'));
        }
        // 'pedido' e 'nenhum' — sem grupos, usa pedidos diretamente
        return [{ chave: null, total: pedidos.reduce((s, p) => s + p.subtotal, 0), pedidos }];
    };

    const exportarRelatorioCSV = () => {
        if (!relatorioData?.pedidos) return;
        const header = agrupamento => agrupamento === 'nenhum'
            ? ['Pedido', 'Cliente', 'Vendedor', 'Data Venda', 'Produto', 'Qtd', 'Valor Unit.', 'Total']
            : ['Grupo', 'Pedido', 'Cliente', 'Vendedor', 'Data Venda', 'Produto', 'Qtd', 'Valor Unit.', 'Total'];
        const rows = [];
        const grupos = gerarGrupos(relatorioData.pedidos, relatorioAgrupamento);
        grupos.forEach(g => {
            if (g.chave) rows.push([g.chave, '', '', '', '', `--- Total: R$ ${fmt(g.total)}`, '', '', '']);
            g.pedidos.forEach(p => {
                (p.itens || []).forEach(it => {
                    const base = [
                        p.pedidoNumero ? `#${p.pedidoNumero}` : (p.pedidoEspecial ? 'Especial' : '-'),
                        p.clienteNome, p.vendedorNome, fmtData(p.dataVenda),
                        it.produtoNome,
                        Number(it.quantidade).toFixed(3).replace('.', ','),
                        Number(it.valorUnitario).toFixed(2).replace('.', ','),
                        Number(it.total).toFixed(2).replace('.', ',')
                    ];
                    rows.push(g.chave ? [g.chave, ...base] : base);
                });
                const sub = ['', '', '', '', '', 'SUBTOTAL', '', '', Number(p.subtotal).toFixed(2).replace('.', ',')];
                rows.push(g.chave ? [g.chave, ...sub.slice(1)] : sub.slice(1));
            });
        });
        const h = header(relatorioAgrupamento);
        const csv = [h, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
        const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `relatorio-itens-${new Date().toISOString().split('T')[0]}.csv`;
        a.click(); URL.revokeObjectURL(url);
    };

    const imprimirRelatorio = () => {
        if (!relatorioData?.pedidos) return;
        const grupos = gerarGrupos(relatorioData.pedidos, relatorioAgrupamento);
        const grandTotal = relatorioData.pedidos.reduce((s, p) => s + p.subtotal, 0);
        const labelAgrup = { pedido: 'Por Pedido', cliente: 'Por Cliente', vendedor: 'Por Vendedor', nenhum: 'Sem Agrupamento' };
        const tabelaItens = (pedidos, mostrarCliente, mostrarVendedor) => pedidos.map(p => `
            <div class="pedido-bloco">
                <div class="pedido-header">
                    <span class="pedido-num">${p.pedidoNumero ? '#' + p.pedidoNumero : (p.pedidoEspecial ? 'Especial' : '—')}</span>
                    ${mostrarCliente ? `<span>${p.clienteNome}</span>` : ''}
                    ${mostrarVendedor ? `<span class="dim">${p.vendedorNome}</span>` : ''}
                    <span class="dim">${fmtData(p.dataVenda)}</span>
                    <span class="subtotal">R$ ${fmt(p.subtotal)}</span>
                </div>
                <table><thead><tr>
                    <th>Produto</th><th class="r">Qtd</th><th class="r">Valor Unit.</th><th class="r">Total</th>
                </tr></thead><tbody>
                ${(p.itens || []).length === 0
                    ? '<tr><td colspan="4" class="sem-itens">Nenhum item registrado</td></tr>'
                    : (p.itens || []).map(it => `<tr>
                        <td>${it.produtoNome}</td>
                        <td class="r">${Number(it.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</td>
                        <td class="r">R$ ${fmt(it.valorUnitario)}</td>
                        <td class="r bold">R$ ${fmt(it.total)}</td>
                    </tr>`).join('')}
                </tbody></table>
            </div>`).join('');

        const corpoGrupos = relatorioAgrupamento === 'pedido'
            ? tabelaItens(grupos[0].pedidos, true, true)
            : relatorioAgrupamento === 'nenhum'
            ? `<table class="flat"><thead><tr>
                <th>Pedido</th><th>Cliente</th><th>Vendedor</th><th>Data</th>
                <th>Produto</th><th class="r">Qtd</th><th class="r">Val. Unit.</th><th class="r">Total</th>
               </tr></thead><tbody>
               ${grupos[0].pedidos.flatMap(p => (p.itens || []).map(it => `<tr>
                <td>${p.pedidoNumero ? '#' + p.pedidoNumero : '—'}</td>
                <td>${p.clienteNome}</td><td>${p.vendedorNome}</td><td>${fmtData(p.dataVenda)}</td>
                <td>${it.produtoNome}</td>
                <td class="r">${Number(it.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</td>
                <td class="r">R$ ${fmt(it.valorUnitario)}</td>
                <td class="r bold">R$ ${fmt(it.total)}</td>
               </tr>`)).join('')}
               </tbody></table>`
            : grupos.map(g => `
                <div class="grupo-bloco">
                    <div class="grupo-header">
                        <span>${g.chave}</span>
                        <span class="subtotal">R$ ${fmt(g.total)}</span>
                    </div>
                    ${tabelaItens(g.pedidos, relatorioAgrupamento !== 'cliente', relatorioAgrupamento !== 'vendedor')}
                </div>`).join('');

        const html = `<!DOCTYPE html><html lang="pt-BR"><head>
        <meta charset="UTF-8"><title>Relatório de Itens</title>
        <style>
            body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 20px; }
            h1 { font-size: 14px; margin-bottom: 2px; }
            .sub { font-size: 10px; color: #555; margin-bottom: 12px; }
            .grupo-bloco { margin-bottom: 16px; }
            .grupo-header { background: #e5e7eb; padding: 5px 8px; font-weight: bold; display: flex; justify-content: space-between; border-radius: 4px; margin-bottom: 4px; }
            .pedido-bloco { margin-bottom: 10px; border: 1px solid #d1d5db; border-radius: 4px; overflow: hidden; }
            .pedido-header { background: #f3f4f6; padding: 4px 8px; display: flex; gap: 12px; align-items: center; font-size: 11px; border-bottom: 1px solid #d1d5db; }
            .pedido-num { font-weight: bold; font-family: monospace; }
            .dim { color: #6b7280; }
            .subtotal { margin-left: auto; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; font-size: 10px; }
            table.flat { border: 1px solid #d1d5db; border-radius: 4px; overflow: hidden; }
            th { background: #f9fafb; padding: 3px 6px; text-align: left; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #374151; }
            td { padding: 3px 6px; border-bottom: 1px solid #f3f4f6; }
            .r { text-align: right; }
            .bold { font-weight: bold; }
            .sem-itens { text-align: center; color: #9ca3af; font-style: italic; padding: 6px; }
            .grand-total { margin-top: 12px; padding: 6px 10px; background: #f3f4f6; border-radius: 4px; display: flex; justify-content: space-between; font-weight: bold; font-size: 12px; }
            @media print { body { margin: 10mm; } }
        </style></head><body>
        <h1>Relatório de Itens por Pedido</h1>
        <div class="sub">
            Agrupamento: ${labelAgrup[relatorioAgrupamento]} &nbsp;|&nbsp;
            ${relatorioFiltros.vencDe || relatorioFiltros.vencAte ? `Venc. ${relatorioFiltros.vencDe || '...'} até ${relatorioFiltros.vencAte || '...'} &nbsp;|&nbsp;` : ''}
            Gerado em: ${new Date().toLocaleString('pt-BR')}
        </div>
        ${corpoGrupos}
        <div class="grand-total">
            <span>${relatorioData.pedidos.length} pedido(s)</span>
            <span>Total Geral: R$ ${fmt(grandTotal)}</span>
        </div>
        </body></html>`;

        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        setTimeout(() => win.print(), 400);
    };

    const filtrosAtivos = useMemo(() =>
        Object.values(filtros).filter(v => Array.isArray(v) ? v.length > 0 : Boolean(v)).length
    , [filtros]);

    const abrirPedido = async (pedidoId) => {
        if (!pedidoId) return;
        setPedidoLoading(true);
        setPedidoPopup({ carregando: true });
        try {
            const p = await pedidoService.detalhar(pedidoId);
            setPedidoPopup(p);
        } catch (e) {
            toast.error('Erro ao buscar pedido');
            setPedidoPopup(null);
        } finally {
            setPedidoLoading(false);
        }
    };

    const abrirCliente = async (clienteId) => {
        if (!clienteId) return;
        try {
            const c = await clienteService.detalhar(clienteId);
            setClientePopup(c);
        } catch (e) {
            toast.error('Erro ao buscar cliente');
        }
    };

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
                    <button onClick={abrirRelatorio} className="text-sm px-3 py-1.5 rounded border hover:bg-gray-50 inline-flex items-center gap-1" title="Relatório de itens por pedido (filtros atuais)">
                        <Download className="w-4 h-4" /> Relatório
                    </button>
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
                        <label className="text-xs text-gray-500">Categoria Cliente</label>
                        <select value={filtros.categoriaClienteId} onChange={e => setFiltros(f => ({ ...f, categoriaClienteId: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-sm">
                            <option value="">Todas</option>
                            {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
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
                                                <span
                                                    className="font-medium text-blue-700 hover:underline truncate"
                                                    title={l.clienteNome}
                                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); abrirCliente(l.clienteId); }}
                                                >{l.clienteNome}</span>
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
                                        <td className="px-2 pt-2 pb-0.5 font-medium">
                                            <button
                                                onClick={() => abrirCliente(l.clienteId)}
                                                className="text-blue-700 hover:underline text-left"
                                                title="Ver cliente"
                                            >{l.clienteNome}</button>
                                        </td>
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
                                                    <button onClick={() => abrirPedido(l.pedidoId)} title="Ver pedido" className="p-1 rounded hover:bg-gray-100 text-gray-600">
                                                        <LinkIcon className="w-4 h-4" />
                                                    </button>
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
                                    <button onClick={() => { abrirPedido(l.pedidoId); close(); }} className="px-3 py-2 rounded border text-sm inline-flex items-center gap-1 hover:bg-gray-50">
                                        <LinkIcon className="w-4 h-4" /> Ver pedido
                                    </button>
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

            {/* Modal pedido completo */}
            {pedidoPopup && (() => {
                const p = pedidoPopup;
                const close = () => setPedidoPopup(null);
                if (p.carregando) {
                    return (
                        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={close}>
                            <div className="bg-white rounded-lg p-6 inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
                                <span className="text-sm text-gray-700">Carregando pedido...</span>
                            </div>
                        </div>
                    );
                }
                const totalItens = (p.itens || []).reduce((s, it) => s + Number(it.quantidade || 0) * Number(it.valor || 0), 0);
                const statusEntregaMap = {
                    PENDENTE: 'bg-gray-100 text-gray-700',
                    ENTREGUE: 'bg-green-100 text-green-700',
                    ENTREGUE_PARCIAL: 'bg-yellow-100 text-yellow-800',
                    DEVOLVIDO: 'bg-red-100 text-red-700'
                };
                return (
                    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center md:p-4" onClick={close}>
                        <div className="bg-white rounded-t-lg md:rounded-lg max-w-3xl w-full max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10">
                                <div>
                                    <h3 className="font-bold text-base">
                                        Pedido {p.numero ? `#${p.numero}` : (p.especial ? 'Especial' : '—')}
                                    </h3>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                        {fmtData(p.dataVenda)} · {p.vendedor?.nome || '—'}
                                        {p.especial && <span className="ml-2 text-purple-700">• Especial</span>}
                                        {p.bonificacao && <span className="ml-2 text-amber-700">• Bonificação</span>}
                                    </div>
                                </div>
                                <button onClick={close} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
                            </div>

                            <div className="p-4 space-y-4">
                                {/* Cliente */}
                                <div className="bg-gray-50 rounded-lg p-3">
                                    <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">Cliente</div>
                                    <button
                                        onClick={() => abrirCliente(p.clienteId)}
                                        className="text-sm font-semibold text-blue-700 hover:underline text-left"
                                    >
                                        {p.cliente?.Nome || p.cliente?.NomeFantasia || '—'}
                                    </button>
                                    {p.cliente?.NomeFantasia && p.cliente?.Nome && p.cliente.NomeFantasia !== p.cliente.Nome && (
                                        <div className="text-xs text-gray-500">{p.cliente.NomeFantasia}</div>
                                    )}
                                </div>

                                {/* Resumo financeiro */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    <div className="border rounded p-2">
                                        <div className="text-[10px] text-gray-500 uppercase">Itens</div>
                                        <div className="text-sm font-bold">R$ {fmt(totalItens)}</div>
                                    </div>
                                    {Number(p.valorFrete || 0) > 0 && (
                                        <div className="border rounded p-2">
                                            <div className="text-[10px] text-gray-500 uppercase">Frete</div>
                                            <div className="text-sm font-bold">R$ {fmt(p.valorFrete)}</div>
                                        </div>
                                    )}
                                    {Number(p.flexTotal || 0) > 0 && (
                                        <div className="border rounded p-2">
                                            <div className="text-[10px] text-gray-500 uppercase">Flex</div>
                                            <div className="text-sm font-bold">R$ {fmt(p.flexTotal)}</div>
                                        </div>
                                    )}
                                    <div className="border rounded p-2">
                                        <div className="text-[10px] text-gray-500 uppercase">Condição</div>
                                        <div className="text-xs font-medium">{p.nomeCondicaoPagamento || '—'}</div>
                                    </div>
                                </div>

                                {/* Itens */}
                                <div>
                                    <div className="text-xs font-semibold text-gray-700 mb-1.5">Itens ({(p.itens || []).length})</div>
                                    <div className="border rounded overflow-x-auto">
                                        <table className="w-full text-xs">
                                            <thead className="bg-gray-50 border-b">
                                                <tr>
                                                    <th className="px-2 py-1.5 text-left font-semibold text-gray-600">Produto</th>
                                                    <th className="px-2 py-1.5 text-right font-semibold text-gray-600">Qtd</th>
                                                    <th className="px-2 py-1.5 text-right font-semibold text-gray-600">Unit.</th>
                                                    <th className="px-2 py-1.5 text-right font-semibold text-gray-600">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(p.itens || []).map(it => (
                                                    <tr key={it.id} className="border-b last:border-0">
                                                        <td className="px-2 py-1">{it.produto?.nome || '—'}</td>
                                                        <td className="px-2 py-1 text-right tabular-nums">{Number(it.quantidade)}</td>
                                                        <td className="px-2 py-1 text-right tabular-nums">R$ {fmt(it.valor)}</td>
                                                        <td className="px-2 py-1 text-right tabular-nums font-medium">R$ {fmt(Number(it.quantidade) * Number(it.valor))}</td>
                                                    </tr>
                                                ))}
                                                {(p.itens || []).length === 0 && (
                                                    <tr><td colSpan={4} className="px-2 py-3 text-center text-gray-400">Sem itens</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Entrega / Embarque */}
                                <div>
                                    <div className="text-xs font-semibold text-gray-700 mb-1.5">Entrega</div>
                                    <div className="border rounded p-3 grid grid-cols-2 gap-2 text-xs">
                                        <div>
                                            <div className="text-[10px] text-gray-500 uppercase">Status</div>
                                            <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[11px] font-medium ${statusEntregaMap[p.statusEntrega] || 'bg-gray-100 text-gray-700'}`}>
                                                {p.statusEntrega || 'PENDENTE'}
                                            </span>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-gray-500 uppercase">Data Entrega</div>
                                            <div>{fmtData(p.dataEntrega)}</div>
                                        </div>
                                        {p.embarque && (
                                            <>
                                                <div>
                                                    <div className="text-[10px] text-gray-500 uppercase">Embarque</div>
                                                    <div>#{p.embarque.numero} · {fmtData(p.embarque.dataSaida)}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-gray-500 uppercase">Motorista</div>
                                                    <div>{p.embarque.responsavel?.nome || '—'}</div>
                                                </div>
                                            </>
                                        )}
                                        {p.observacaoEntrega && (
                                            <div className="col-span-2">
                                                <div className="text-[10px] text-gray-500 uppercase">Obs. do Motorista</div>
                                                <div className="text-gray-700">{p.observacaoEntrega}</div>
                                            </div>
                                        )}
                                        {p.motivoDevolucao && (
                                            <div className="col-span-2">
                                                <div className="text-[10px] text-gray-500 uppercase">Motivo Devolução</div>
                                                <div className="text-red-700">{p.motivoDevolucao}</div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Devoluções */}
                                {(p.devolucoes || []).length > 0 && (
                                    <div>
                                        <div className="text-xs font-semibold text-gray-700 mb-1.5">Devoluções ({p.devolucoes.length})</div>
                                        <div className="space-y-2">
                                            {p.devolucoes.map(d => (
                                                <div key={d.id} className={`border rounded p-3 ${d.status === 'REVERTIDA' ? 'bg-gray-50 opacity-70' : ''}`}>
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                                                <span className="font-semibold">Dev. #{d.numero}</span>
                                                                <span className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 text-[10px]">{d.tipo}</span>
                                                                <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px]">{d.escopo}</span>
                                                                {d.status === 'REVERTIDA' && <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px]">REVERTIDA</span>}
                                                                <span className="text-gray-500 tabular-nums">{fmtData(d.dataDevolucao)}</span>
                                                                <span className="text-gray-500">por {d.registradoPor?.nome}</span>
                                                            </div>
                                                            <div className="text-xs text-gray-700 mt-1">{d.motivo}</div>
                                                        </div>
                                                        <div className="text-right flex-shrink-0">
                                                            <div className="text-xs text-gray-500">Total</div>
                                                            <div className="font-bold text-sm">R$ {fmt(d.valorTotal)}</div>
                                                        </div>
                                                    </div>
                                                    {(d.itens || []).length > 0 && (
                                                        <div className="mt-2 pt-2 border-t text-[11px] space-y-0.5">
                                                            {d.itens.map(it => (
                                                                <div key={it.id} className="flex justify-between">
                                                                    <span className="truncate">{Number(it.quantidade)}× {it.produto?.nome}</span>
                                                                    <span className="tabular-nums text-gray-600">R$ {fmt(it.valorTotal)}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Contas a receber / parcelas */}
                                {p.contaReceber && (
                                    <div>
                                        <div className="text-xs font-semibold text-gray-700 mb-1.5">
                                            Financeiro
                                            <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_CONTA[p.contaReceber.status] || ''}`}>
                                                {p.contaReceber.status}
                                            </span>
                                        </div>
                                        <div className="border rounded overflow-x-auto">
                                            <table className="w-full text-xs">
                                                <thead className="bg-gray-50 border-b">
                                                    <tr>
                                                        <th className="px-2 py-1.5 text-left font-semibold text-gray-600">Parc.</th>
                                                        <th className="px-2 py-1.5 text-right font-semibold text-gray-600">Valor</th>
                                                        <th className="px-2 py-1.5 text-left font-semibold text-gray-600">Venc.</th>
                                                        <th className="px-2 py-1.5 text-left font-semibold text-gray-600">Status</th>
                                                        <th className="px-2 py-1.5 text-left font-semibold text-gray-600">Pgto</th>
                                                        <th className="px-2 py-1.5 text-left font-semibold text-gray-600">Forma</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(p.contaReceber.parcelas || []).map(pc => (
                                                        <tr key={pc.id} className="border-b last:border-0">
                                                            <td className="px-2 py-1 tabular-nums">{pc.numeroParcela}</td>
                                                            <td className="px-2 py-1 text-right tabular-nums font-medium">R$ {fmt(pc.valor)}</td>
                                                            <td className="px-2 py-1 tabular-nums">{fmtData(pc.dataVencimento)}</td>
                                                            <td className="px-2 py-1">
                                                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${STATUS_PARC[pc.status] || ''}`}>{pc.status}</span>
                                                            </td>
                                                            <td className="px-2 py-1 tabular-nums">{fmtData(pc.dataPagamento)}</td>
                                                            <td className="px-2 py-1">{pc.formaPagamento || '-'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {p.observacoes && (
                                    <div>
                                        <div className="text-xs font-semibold text-gray-700 mb-1">Observações</div>
                                        <div className="border rounded p-2 text-xs text-gray-700 whitespace-pre-wrap">{p.observacoes}</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Popup cliente (reuso do Rota) */}
            {clientePopup && (
                <ClientePopup cliente={clientePopup} onClose={() => setClientePopup(null)} />
            )}

            {/* Modal Relatório de Itens por Pedido */}
            {relatorioOpen && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] flex flex-col">
                        {/* Header */}
                        <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0">
                            <div>
                                <h3 className="font-bold text-base">Relatório de Itens por Pedido</h3>
                                {filtrosAtivos > 0 && (
                                    <div className="text-xs text-blue-600 mt-0.5">{filtrosAtivos} filtro(s) ativo(s)</div>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {relatorioData && !relatorioLoading && (<>
                                    <button onClick={imprimirRelatorio}
                                        className="text-sm px-3 py-1.5 rounded border hover:bg-gray-50 inline-flex items-center gap-1">
                                        🖨 Imprimir
                                    </button>
                                    <button onClick={exportarRelatorioCSV}
                                        className="text-sm px-3 py-1.5 rounded border hover:bg-gray-50 inline-flex items-center gap-1">
                                        <Download className="w-4 h-4" /> CSV
                                    </button>
                                </>)}
                                <button onClick={() => setRelatorioOpen(false)} className="p-1 rounded hover:bg-gray-100">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Filtros do relatório */}
                        <div className="px-4 py-2 border-b bg-gray-50 flex flex-wrap items-center gap-x-3 gap-y-2">
                            <div className="flex items-center gap-1.5">
                                <label className="text-xs text-gray-500 whitespace-nowrap">Venc. de</label>
                                <input type="date" value={relatorioFiltros.vencDe}
                                    onChange={e => setRelatorioFiltros(f => ({ ...f, vencDe: e.target.value }))}
                                    className="border rounded px-2 py-1 text-sm" />
                            </div>
                            <div className="flex items-center gap-1.5">
                                <label className="text-xs text-gray-500 whitespace-nowrap">até</label>
                                <input type="date" value={relatorioFiltros.vencAte}
                                    onChange={e => setRelatorioFiltros(f => ({ ...f, vencAte: e.target.value }))}
                                    className="border rounded px-2 py-1 text-sm" />
                            </div>
                            <div className="flex items-center gap-1.5">
                                <label className="text-xs text-gray-500 whitespace-nowrap">Categoria</label>
                                <select value={relatorioFiltros.categoriaClienteId}
                                    onChange={e => setRelatorioFiltros(f => ({ ...f, categoriaClienteId: e.target.value }))}
                                    className="border rounded px-2 py-1 text-sm">
                                    <option value="">Todas</option>
                                    {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                </select>
                            </div>
                            <button onClick={() => buscarRelatorio(relatorioFiltros)}
                                className="text-sm px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1">
                                <Filter className="w-3 h-3" /> Filtrar
                            </button>
                            <div className="flex items-center gap-1 ml-auto">
                                <span className="text-xs text-gray-500 whitespace-nowrap">Agrupar:</span>
                                {[['pedido','Por Pedido'],['cliente','Por Cliente'],['vendedor','Por Vendedor'],['nenhum','Sem Agrup.']].map(([val, label]) => (
                                    <button key={val} onClick={() => setRelatorioAgrupamento(val)}
                                        className={`text-xs px-2 py-1 rounded border ${relatorioAgrupamento === val ? 'bg-gray-800 text-white border-gray-800' : 'hover:bg-gray-100'}`}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Body */}
                        <div className="overflow-y-auto flex-1 p-4">
                            {relatorioLoading && (
                                <div className="flex items-center justify-center py-12 text-gray-500">
                                    <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Gerando relatório...
                                </div>
                            )}
                            {!relatorioLoading && relatorioData && relatorioData.pedidos.length === 0 && (
                                <div className="text-center py-12 text-gray-400">Nenhum pedido encontrado com os filtros atuais.</div>
                            )}
                            {!relatorioLoading && relatorioData && relatorioData.pedidos.length > 0 && (() => {
                                const grupos = gerarGrupos(relatorioData.pedidos, relatorioAgrupamento);
                                const PedidoCard = ({ p, mostrarCliente = true, mostrarVendedor = true }) => (
                                    <div className="border rounded-lg overflow-hidden">
                                        <div className="bg-gray-50 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm border-b">
                                            <span className="font-mono font-semibold text-gray-800">
                                                {p.pedidoNumero ? `#${p.pedidoNumero}` : (p.pedidoEspecial ? 'Especial' : '—')}
                                            </span>
                                            {mostrarCliente && <span className="font-medium text-gray-900">{p.clienteNome}</span>}
                                            {mostrarVendedor && <span className="text-gray-500">{p.vendedorNome}</span>}
                                            <span className="text-gray-500 tabular-nums">{fmtData(p.dataVenda)}</span>
                                            <span className="ml-auto font-bold text-gray-900 tabular-nums">R$ {fmt(p.subtotal)}</span>
                                        </div>
                                        <table className="w-full text-xs">
                                            <thead className="bg-gray-50/50 border-b">
                                                <tr>
                                                    <th className="px-3 py-1.5 text-left font-semibold text-gray-600">Produto</th>
                                                    <th className="px-3 py-1.5 text-right font-semibold text-gray-600 w-20">Qtd</th>
                                                    <th className="px-3 py-1.5 text-right font-semibold text-gray-600 w-24">Valor Unit.</th>
                                                    <th className="px-3 py-1.5 text-right font-semibold text-gray-600 w-24">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(p.itens || []).length === 0 ? (
                                                    <tr><td colSpan={4} className="px-3 py-2 text-center text-xs text-gray-400 italic">Nenhum item registrado</td></tr>
                                                ) : (p.itens || []).map((it, idx) => (
                                                    <tr key={idx} className="border-b last:border-0 hover:bg-gray-50">
                                                        <td className="px-3 py-1.5 text-gray-800">{it.produtoNome}</td>
                                                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{Number(it.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</td>
                                                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">R$ {fmt(it.valorUnitario)}</td>
                                                        <td className="px-3 py-1.5 text-right tabular-nums font-medium text-gray-900">R$ {fmt(it.total)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                );

                                if (relatorioAgrupamento === 'nenhum') {
                                    const todosItens = relatorioData.pedidos.flatMap(p =>
                                        (p.itens || []).map(it => ({ ...it, pedidoNumero: p.pedidoNumero, pedidoEspecial: p.pedidoEspecial, clienteNome: p.clienteNome, vendedorNome: p.vendedorNome, dataVenda: p.dataVenda }))
                                    );
                                    return (
                                        <div className="border rounded-lg overflow-hidden">
                                            <table className="w-full text-xs">
                                                <thead className="bg-gray-50 border-b">
                                                    <tr>
                                                        <th className="px-3 py-1.5 text-left font-semibold text-gray-600">Pedido</th>
                                                        <th className="px-3 py-1.5 text-left font-semibold text-gray-600">Cliente</th>
                                                        <th className="px-3 py-1.5 text-left font-semibold text-gray-600">Vendedor</th>
                                                        <th className="px-3 py-1.5 text-left font-semibold text-gray-600">Produto</th>
                                                        <th className="px-3 py-1.5 text-right font-semibold text-gray-600 w-20">Qtd</th>
                                                        <th className="px-3 py-1.5 text-right font-semibold text-gray-600 w-24">Val. Unit.</th>
                                                        <th className="px-3 py-1.5 text-right font-semibold text-gray-600 w-24">Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {todosItens.map((it, idx) => (
                                                        <tr key={idx} className="border-b last:border-0 hover:bg-gray-50">
                                                            <td className="px-3 py-1.5 font-mono text-gray-700">{it.pedidoNumero ? `#${it.pedidoNumero}` : '—'}</td>
                                                            <td className="px-3 py-1.5 text-gray-800">{it.clienteNome}</td>
                                                            <td className="px-3 py-1.5 text-gray-500">{it.vendedorNome}</td>
                                                            <td className="px-3 py-1.5 text-gray-800">{it.produtoNome}</td>
                                                            <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{Number(it.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</td>
                                                            <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">R$ {fmt(it.valorUnitario)}</td>
                                                            <td className="px-3 py-1.5 text-right tabular-nums font-medium text-gray-900">R$ {fmt(it.total)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    );
                                }

                                if (relatorioAgrupamento === 'pedido') {
                                    return <div className="space-y-3">{grupos[0].pedidos.map(p => <PedidoCard key={p.pedidoId} p={p} />)}</div>;
                                }

                                // cliente | vendedor
                                return (
                                    <div className="space-y-5">
                                        {grupos.map(g => (
                                            <div key={g.chave}>
                                                <div className="flex items-center justify-between bg-gray-200 rounded px-3 py-1.5 mb-2">
                                                    <span className="font-semibold text-gray-800 text-sm">{g.chave}</span>
                                                    <span className="font-bold text-gray-900 tabular-nums text-sm">R$ {fmt(g.total)}</span>
                                                </div>
                                                <div className="space-y-2 pl-2">
                                                    {g.pedidos.map(p => (
                                                        <PedidoCard key={p.pedidoId} p={p}
                                                            mostrarCliente={relatorioAgrupamento !== 'cliente'}
                                                            mostrarVendedor={relatorioAgrupamento !== 'vendedor'} />
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Footer — total geral */}
                        {!relatorioLoading && relatorioData && relatorioData.pedidos.length > 0 && (() => {
                            const grandTotal = relatorioData.pedidos.reduce((s, p) => s + p.subtotal, 0);
                            return (
                                <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between flex-shrink-0 text-sm">
                                    <span className="text-gray-600">{relatorioData.pedidos.length} pedido(s)</span>
                                    <span className="font-bold text-gray-900 tabular-nums text-base">
                                        Total Geral: R$ {fmt(grandTotal)}
                                    </span>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ContasReceberTabela;
