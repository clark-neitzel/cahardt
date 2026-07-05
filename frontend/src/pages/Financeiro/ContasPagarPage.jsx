import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import contasPagarService from '../../services/contasPagarService';
import fornecedorService from '../../services/fornecedorService';
import {
    Wallet, X, Trash2, FileText, RefreshCw, MoreVertical, Loader2, Undo2
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Helpers ──
const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
const toYMD = (d) => d ? new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : '';
const hojeYMD = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const parseNum = (v) => parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0;

const STATUS_PARCELA = {
    ABERTO: { label: 'Aberto', cls: 'bg-blue-100 text-blue-800' },
    PENDENTE: { label: 'Aberto', cls: 'bg-blue-100 text-blue-800' },
    VENCIDO: { label: 'Vencido', cls: 'bg-red-100 text-red-700' },
    PARCIAL: { label: 'Parcial', cls: 'bg-yellow-100 text-yellow-800' },
    PAGO: { label: 'Pago', cls: 'bg-green-100 text-green-800' },
    CANCELADO: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-700' }
};

const FORMAS_PGTO = ['PIX', 'Boleto', 'Transferência', 'Dinheiro', 'Cartão'];

const STATUS_OPCOES = [
    { value: '', label: 'Status: Todos' },
    { value: 'ABERTO', label: 'Aberto' },
    { value: 'VENCIDO', label: 'Vencido' },
    { value: 'PARCIAL', label: 'Parcial' },
    { value: 'PAGO', label: 'Pago' },
    { value: 'CANCELADO', label: 'Cancelado' }
];

// Nome do fornecedor com fallback seguro (nunca "undefined")
const nomeFornecedor = (f) => f?.nomeFantasia || f?.razaoSocial || 'Sem fornecedor';

// Parcela vencida e ainda em aberto?
const parcelaVencida = (p) => {
    if (!p) return false;
    if (p.status === 'VENCIDO') return true;
    const emAberto = p.status === 'ABERTO' || p.status === 'PENDENTE' || p.status === 'PARCIAL';
    return emAberto && toYMD(p.dataVencimento) !== '' && toYMD(p.dataVencimento) < hojeYMD();
};

// Badge da coluna "Conta Azul" (envio da conta + baixa via DDA da parcela)
const BadgeCA = ({ conta, parcela }) => {
    if (parcela?.baixadoViaCA) {
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 whitespace-nowrap">Baixado via DDA ✓</span>;
    }
    const s = String(conta?.statusEnvioCA || '').toUpperCase();
    if (s === 'ENVIADO' || s === 'SINCRONIZADO') {
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 whitespace-nowrap">Enviado ✓</span>;
    }
    if (s === 'ERRO') {
        return (
            <span
                className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700 whitespace-nowrap cursor-help"
                title={conta?.erroEnvioCA || 'Erro ao enviar para a Conta Azul'}
            >
                Erro
            </span>
        );
    }
    if (s === 'ENVIANDO' || s === 'PENDENTE') {
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700 whitespace-nowrap">Enviando…</span>;
    }
    return <span className="text-gray-400 text-xs">—</span>;
};

const BadgeStatusParcela = ({ parcela }) => {
    const status = parcelaVencida(parcela) ? 'VENCIDO' : (parcela?.status || 'ABERTO');
    const cfg = STATUS_PARCELA[status] || STATUS_PARCELA.ABERTO;
    return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${cfg.cls}`}>{cfg.label}</span>;
};

// Opções de mês (12 últimos meses, mais recente primeiro)
const mesesOpcoes = () => {
    const ops = [];
    const agora = new Date();
    for (let i = 0; i < 12; i++) {
        const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
        const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        let label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        label = label.charAt(0).toUpperCase() + label.slice(1).replace(' de ', '/');
        ops.push({ value, label });
    }
    return ops;
};

const nomeMes = (mesYM) => {
    if (!mesYM) return 'no mês';
    const [ano, mes] = mesYM.split('-');
    const d = new Date(Number(ano), Number(mes) - 1, 1);
    return d.toLocaleDateString('pt-BR', { month: 'long' });
};

// ═══════════════════════════════════════════════════════════
// PÁGINA
// ═══════════════════════════════════════════════════════════
const ContasPagarPage = () => {
    const { hasPermission } = useAuth();
    const podeBaixar = hasPermission('Pode_Baixar_Contas_Pagar');

    const [kpis, setKpis] = useState({});
    const [contas, setContas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [categorias, setCategorias] = useState([]);
    const [categoriasErro, setCategoriasErro] = useState(false);
    const [fornecedores, setFornecedores] = useState([]);

    const [filtros, setFiltros] = useState({ busca: '', status: '', categoria: '', mes: hojeYMD().slice(0, 7) });
    const [buscaInput, setBuscaInput] = useState('');

    // Modais
    const [despesaModal, setDespesaModal] = useState(null); // { conta: null } = nova | { conta } = editar
    const [baixaModal, setBaixaModal] = useState(null);     // { conta, parcela }
    const [detalheConta, setDetalheConta] = useState(null); // conta

    const meses = useMemo(() => mesesOpcoes(), []);

    // Debounce da busca
    useEffect(() => {
        const t = setTimeout(() => setFiltros(f => ({ ...f, busca: buscaInput })), 400);
        return () => clearTimeout(t);
    }, [buscaInput]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (filtros.busca) params.busca = filtros.busca;
            if (filtros.status) params.status = filtros.status;
            if (filtros.categoria) params.categoria = filtros.categoria;
            if (filtros.mes) params.mes = filtros.mes;
            const data = await contasPagarService.listar(params);
            setKpis(data?.kpis || {});
            setContas(data?.contas || []);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar contas a pagar');
        } finally {
            setLoading(false);
        }
    }, [filtros]);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        contasPagarService.categorias()
            .then(cats => { setCategorias(Array.isArray(cats) ? cats : []); setCategoriasErro(false); })
            .catch(() => setCategoriasErro(true));
        fornecedorService.listar().then(f => setFornecedores(Array.isArray(f) ? f : [])).catch(() => {});
    }, []);

    // Uma linha por parcela
    const linhas = useMemo(() => {
        const flat = [];
        contas.forEach(c => {
            const totalParcelas = (c.parcelas || []).length;
            (c.parcelas || []).forEach(p => flat.push({ conta: c, parcela: p, totalParcelas }));
        });
        let rows = flat;
        if (filtros.status) {
            rows = rows.filter(({ parcela }) => {
                const st = parcelaVencida(parcela) ? 'VENCIDO' : (parcela.status === 'PENDENTE' ? 'ABERTO' : parcela.status);
                return st === filtros.status;
            });
        }
        return rows.sort((a, b) => String(a.parcela.dataVencimento || '').localeCompare(String(b.parcela.dataVencimento || '')));
    }, [contas, filtros.status]);

    const abrirBaixa = (conta, parcela) => setBaixaModal({ conta, parcela });

    const podeBaixarParcela = (conta, parcela) =>
        podeBaixar && conta.status !== 'CANCELADO' &&
        parcela.status !== 'PAGO' && parcela.status !== 'CANCELADO';

    const recarregarFornecedores = () =>
        fornecedorService.listar().then(f => setFornecedores(Array.isArray(f) ? f : [])).catch(() => {});

    return (
    <div className="max-w-full overflow-x-hidden -mx-4 sm:-mx-6 lg:-mx-8">
            {/* Topbar */}
            <div className="flex items-center justify-between p-3 md:p-6 bg-white border-b border-gray-200">
                <div className="flex items-center gap-2">
                    <div className="bg-amber-100 p-1.5 md:p-2 rounded-lg">
                        <Wallet className="h-4 w-4 md:h-5 md:w-5 text-amber-600" />
                    </div>
                    <h1 className="text-base md:text-2xl font-bold text-gray-900">Contas a Pagar</h1>
                </div>
                {podeBaixar && (
                    <button
                        onClick={() => setDespesaModal({ conta: null })}
                        className="px-3 py-1.5 md:px-4 md:py-2 bg-primary hover:bg-blue-700 text-white rounded-md shadow-sm text-xs md:text-sm font-semibold"
                    >
                        + Nova Despesa
                    </button>
                )}
            </div>

            <div className="p-3 md:p-6 space-y-4">
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                        <div className="text-xs font-semibold text-red-600 uppercase tracking-wide">Vencidas</div>
                        <div className="text-lg md:text-2xl font-bold text-red-600 mt-1">R$ {fmt(kpis?.vencidas?.valor)}</div>
                        <div className="text-xs text-gray-500">{Number(kpis?.vencidas?.qtd || 0)} parcela(s)</div>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Próximos 7 dias</div>
                        <div className="text-lg md:text-2xl font-bold text-gray-900 mt-1">R$ {fmt(kpis?.proximos7?.valor)}</div>
                        <div className="text-xs text-gray-500">{Number(kpis?.proximos7?.qtd || 0)} parcela(s)</div>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Em aberto ({nomeMes(filtros.mes)})</div>
                        <div className="text-lg md:text-2xl font-bold text-gray-900 mt-1">R$ {fmt(kpis?.abertoMes?.valor)}</div>
                        <div className="text-xs text-gray-500">{Number(kpis?.abertoMes?.qtd || 0)} parcela(s)</div>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                        <div className="text-xs font-semibold text-green-600 uppercase tracking-wide">Pago no mês</div>
                        <div className="text-lg md:text-2xl font-bold text-green-600 mt-1">R$ {fmt(kpis?.pagoMes?.valor)}</div>
                        <div className="text-xs text-gray-500">{Number(kpis?.pagoMes?.qtd || 0)} parcela(s)</div>
                    </div>
                </div>

                {/* Filtros */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 flex flex-col md:flex-row gap-2">
                    <input
                        value={buscaInput}
                        onChange={e => setBuscaInput(e.target.value)}
                        placeholder="Buscar fornecedor ou descrição…"
            className="w-full md:w-64 border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                    <select
                        value={filtros.status}
                        onChange={e => setFiltros(f => ({ ...f, status: e.target.value }))}
            className="w-full md:w-44 border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 focus:border-primary focus:outline-none"
                    >
                        {STATUS_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select
                        value={filtros.categoria}
                        onChange={e => setFiltros(f => ({ ...f, categoria: e.target.value }))}
            className="w-full md:w-44 border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 focus:border-primary focus:outline-none"
                    >
                        <option value="">Categoria: Todas</option>
                        {categorias.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                    </select>
                    <select
                        value={filtros.mes}
                        onChange={e => setFiltros(f => ({ ...f, mes: e.target.value }))}
            className="w-full md:w-44 border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 focus:border-primary focus:outline-none"
                    >
                        <option value="">Todos os meses</option>
                        {meses.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                </div>

                {loading && (
                    <div className="text-center text-gray-400 text-sm py-2 flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                    </div>
                )}

                {/* Mobile: cards */}
                <div className="md:hidden space-y-3">
                    {linhas.length === 0 && !loading && (
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center text-sm text-gray-400">
                            Nenhuma parcela encontrada.
                        </div>
                    )}
                    {linhas.map(({ conta, parcela, totalParcelas }) => (
                        <div key={parcela.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4" onClick={() => setDetalheConta(conta)}>
                            <div className="flex items-center justify-between mb-1 gap-2">
                                <span className="font-semibold text-gray-900 truncate">{nomeFornecedor(conta.fornecedor)}</span>
                                <BadgeStatusParcela parcela={parcela} />
                            </div>
                            <div className="text-sm text-gray-500 truncate">
                                {conta.descricao || 'Sem descrição'}
                                {conta.numeroNota ? ` · Nota ${conta.numeroNota}` : ''}
                                {` · parc. ${parcela.numeroParcela}/${totalParcelas}`}
                            </div>
                            <div className="flex items-center justify-between mt-2">
                                <div>
                                    <div className={`text-xs ${parcelaVencida(parcela) ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                                        {parcela.status === 'PAGO'
                                            ? `Pago ${fmtData(parcela.dataPagamento)}`
                                            : `${parcelaVencida(parcela) ? 'Venceu' : 'Vence'} ${fmtData(parcela.dataVencimento)}`}
                                    </div>
                                    <div className="font-bold text-gray-900">R$ {fmt(parcela.valor)}</div>
                                </div>
                                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                    <BadgeCA conta={conta} parcela={parcela} />
                                    {podeBaixarParcela(conta, parcela) && (
                                        <button
                                            onClick={() => abrirBaixa(conta, parcela)}
                                            className="px-3 py-2 min-h-[44px] bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-xs"
                                        >
                                            Baixar
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Desktop: tabela */}
                <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                        <FileText className="h-4 w-4 text-blue-600" />
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-600">
                            {filtros.mes ? `DESPESAS DE ${meses.find(m => m.value === filtros.mes)?.label?.toUpperCase() || filtros.mes}` : 'DESPESAS'}
                        </span>
                    </div>
                    <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Fornecedor</th>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Descrição</th>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Nota</th>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Parcela</th>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Vencimento</th>
                                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Conta Azul</th>
                                    <th className="px-5 py-3"></th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                {linhas.length === 0 && !loading && (
                                    <tr><td colSpan={9} className="px-5 py-8 text-center text-gray-400">Nenhuma parcela encontrada.</td></tr>
                                )}
                                {linhas.map(({ conta, parcela, totalParcelas }) => (
                                    <tr key={parcela.id} className={`hover:bg-gray-50 ${parcela.status === 'PAGO' ? 'bg-green-50/40' : ''}`}>
                                        <td className="px-5 py-3 text-gray-900 font-medium">{nomeFornecedor(conta.fornecedor)}</td>
                                        <td className="px-5 py-3 text-gray-600">
                                            {conta.descricao || '—'}
                                            {conta.categoria ? <span className="text-gray-400"> · {conta.categoria}</span> : null}
                                        </td>
                                        <td className="px-5 py-3 text-gray-600">{conta.numeroNota || <span className="text-gray-400">—</span>}</td>
                                        <td className="px-5 py-3 text-gray-600">{parcela.numeroParcela}/{totalParcelas}</td>
                                        <td className={`px-5 py-3 ${parcelaVencida(parcela) ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                                            {fmtData(parcela.dataVencimento)}
                                        </td>
                                        <td className="px-5 py-3 text-right font-semibold text-gray-900">R$ {fmt(parcela.valor)}</td>
                                        <td className="px-5 py-3"><BadgeStatusParcela parcela={parcela} /></td>
                                        <td className="px-5 py-3"><BadgeCA conta={conta} parcela={parcela} /></td>
                                        <td className="px-5 py-3 text-right whitespace-nowrap">
                                            {podeBaixarParcela(conta, parcela) && (
                                                <button
                                                    onClick={() => abrirBaixa(conta, parcela)}
                                                    className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-xs"
                                                >
                                                    Baixar
                                                </button>
                                            )}
                                            <button
                                                onClick={() => setDetalheConta(conta)}
                                                title="Detalhes e ações"
                                                className="ml-1 p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                                            >
                                                <MoreVertical className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Banner explicativo do ciclo DDA */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
                    <span className="font-semibold">Como funciona a baixa automática:</span>{' '}
                    a despesa criada aqui é enviada à Conta Azul → lá você vincula ao DDA e paga como hoje → o sistema confere as baixas na Conta Azul a cada 30 minutos e marca como <span className="font-semibold">Pago</span> sozinho (igual o Contas a Receber já faz).
                </div>
            </div>

            {/* Modal Nova/Editar Despesa */}
            {despesaModal && (
                <DespesaModal
                    conta={despesaModal.conta}
                    categorias={categorias}
                    categoriasErro={categoriasErro}
                    fornecedores={fornecedores}
                    onFornecedoresChanged={recarregarFornecedores}
                    onClose={() => setDespesaModal(null)}
                    onSuccess={() => { setDespesaModal(null); setDetalheConta(null); fetchData(); }}
                />
            )}

            {/* Modal Baixar parcela */}
            {baixaModal && (
                <BaixaParcelaModal
                    conta={baixaModal.conta}
                    parcela={baixaModal.parcela}
                    onClose={() => setBaixaModal(null)}
                    onSuccess={() => { setBaixaModal(null); setDetalheConta(null); fetchData(); }}
                />
            )}

            {/* Modal detalhes da conta (ações secundárias) */}
            {detalheConta && (
                <DetalheContaModal
                    conta={detalheConta}
                    podeBaixar={podeBaixar}
                    onClose={() => setDetalheConta(null)}
                    onEditar={(c) => setDespesaModal({ conta: c })}
                    onBaixar={(c, p) => setBaixaModal({ conta: c, parcela: p })}
                    onChanged={() => { setDetalheConta(null); fetchData(); }}
                />
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
// MODAL NOVA / EDITAR DESPESA
// ═══════════════════════════════════════════════════════════
const DespesaModal = ({ conta, categorias, categoriasErro, fornecedores, onFornecedoresChanged, onClose, onSuccess }) => {
    const editando = !!conta;

    const [fornecedorId, setFornecedorId] = useState(conta?.fornecedor?.id || '');
    const [buscaForn, setBuscaForn] = useState('');
    const [descricao, setDescricao] = useState(conta?.descricao || '');
    const [categoria, setCategoria] = useState(conta?.categoria || '');
    const [numeroNota, setNumeroNota] = useState(conta?.numeroNota || '');
    const [competencia, setCompetencia] = useState(conta?.competencia || '');
    const [observacoes, setObservacoes] = useState(conta?.observacoes || '');
    const [enviarCA, setEnviarCA] = useState(true);
    const [valorTotal, setValorTotal] = useState(conta?.valorTotal != null ? fmt(conta.valorTotal) : '');
    const [salvando, setSalvando] = useState(false);

    // Parcelas: em edição, parcelas pagas ficam travadas
    const [parcelas, setParcelas] = useState(() => {
        if (conta?.parcelas?.length) {
            return conta.parcelas.map(p => ({
                id: p.id,
                dataVencimento: toYMD(p.dataVencimento),
                valor: fmt(p.valor),
                paga: p.status === 'PAGO' || p.status === 'PARCIAL'
            }));
        }
        return [{ dataVencimento: hojeYMD(), valor: '', paga: false }];
    });

    const fornecedoresFiltrados = useMemo(() => {
        const q = buscaForn.trim().toLowerCase();
        if (!q) return fornecedores;
        return fornecedores.filter(f =>
            String(f.razaoSocial || '').toLowerCase().includes(q) ||
            String(f.nomeFantasia || '').toLowerCase().includes(q) ||
            String(f.cnpjCpf || '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§')
        );
    }, [fornecedores, buscaForn]);

    const somaParcelas = parcelas.reduce((s, p) => s + parseNum(p.valor), 0);
    const totalInformado = parseNum(valorTotal);
    const somaDiverge = totalInformado > 0 && Math.abs(somaParcelas - totalInformado) > 0.01;

    const setParcela = (idx, campo, valor) =>
        setParcelas(prev => prev.map((p, i) => (i === idx ? { ...p, [campo]: valor } : p)));

    const addParcela = () => setParcelas(prev => [...prev, { dataVencimento: hojeYMD(), valor: '', paga: false }]);
    const removeParcela = (idx) => setParcelas(prev => prev.filter((_, i) => i !== idx));

    const salvar = async () => {
        if (!fornecedorId) { toast.error('Selecione o fornecedor.'); return; }
        if (!descricao.trim()) { toast.error('Informe a descrição.'); return; }
        const parcelasValidas = parcelas.filter(p => !p.paga);
        if (parcelas.length === 0 || parcelas.some(p => !p.paga && (!p.dataVencimento || parseNum(p.valor) <= 0))) {
            toast.error('Preencha data e valor de todas as parcelas.');
            return;
        }
        if (somaDiverge) { toast.error('A soma das parcelas não bate com o valor total informado.'); return; }
        setSalvando(true);
        try {
            const payload = {
                fornecedorId,
                descricao: descricao.trim(),
                categoria: categoria || undefined,
                numeroNota: numeroNota.trim() || undefined,
                competencia: competencia || undefined,
                observacoes: observacoes.trim() || undefined,
                enviarCA,
                parcelas: parcelasValidas.map(p => ({ valor: parseNum(p.valor), dataVencimento: p.dataVencimento }))
            };
            if (editando) {
                await contasPagarService.atualizar(conta.id, payload);
                toast.success('Despesa atualizada!');
            } else {
                await contasPagarService.criar(payload);
                toast.success('Despesa criada!');
            }
            if (onFornecedoresChanged) onFornecedoresChanged();
            onSuccess();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao salvar despesa');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-w-2xl w-full max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
                    <h2 className="font-bold text-gray-900">{editando ? 'Editar Despesa' : 'Nova Despesa'}</h2>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Fornecedor com busca */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor *</label>
                        <input
                            value={buscaForn}
                            onChange={e => setBuscaForn(e.target.value)}
                            placeholder="Digite para filtrar fornecedores…"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-2 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                        <select
                            value={fornecedorId}
                            onChange={e => setFornecedorId(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        >
                            <option value="">Selecionar fornecedor…</option>
                            {fornecedoresFiltrados.map(f => (
                                <option key={f.id} value={f.id}>
                                    {f.razaoSocial || f.nomeFantasia || 'Sem nome'}{f.nomeFantasia && f.razaoSocial ? ` (${f.nomeFantasia})` : ''}
                                </option>
                            ))}
                        </select>
                        {fornecedoresFiltrados.length === 0 && (
                            <p className="text-xs text-gray-400 mt-1">Nenhum fornecedor encontrado — cadastre na tela Fornecedores.</p>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
                            <input
                                value={descricao}
                                onChange={e => setDescricao(e.target.value)}
                                placeholder="Ex.: Farinha de trigo"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                            {categoriasErro ? (
                                <input
                                    value={categoria}
                                    onChange={e => setCategoria(e.target.value)}
                                    placeholder="Ex.: Matéria-prima"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                />
                            ) : (
                                <select
                                    value={categoria}
                                    onChange={e => setCategoria(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                >
                                    <option value="">Selecionar…</option>
                                    {categorias.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                                    {categoria && !categorias.some(c => c.nome === categoria) && (
                                        <option value={categoria}>{categoria}</option>
                                    )}
                                </select>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Número da nota (opcional)</label>
                            <input
                                value={numeroNota}
                                onChange={e => setNumeroNota(e.target.value)}
                                placeholder="Ex.: NF-e 48.213"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Competência (opcional)</label>
                            <input
                                type="month"
                                value={competencia}
                                onChange={e => setCompetencia(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                        <textarea
                            rows={2}
                            value={observacoes}
                            onChange={e => setObservacoes(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                    </div>

                    {/* Parcelas dinâmicas */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-bold uppercase tracking-widest text-gray-600">Parcelas</div>
                            <button
                                onClick={addParcela}
                                className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-xs"
                            >
                                + Adicionar parcela
                            </button>
                        </div>
                        <div className="space-y-2">
                            {parcelas.map((p, idx) => (
                                <div key={p.id || `nova-${idx}`} className={`border rounded-lg px-3 py-2.5 flex flex-wrap items-center gap-2 md:gap-3 ${p.paga ? 'border-green-200 bg-green-50/40' : 'border-gray-200'}`}>
                                    <span className="text-sm font-medium text-gray-900 w-20">Parcela {idx + 1}</span>
                                    <input
                                        type="date"
                                        value={p.dataVencimento}
                                        disabled={p.paga}
                                        onChange={e => setParcela(idx, 'dataVencimento', e.target.value)}
                                        className="border border-gray-300 rounded px-2 py-2 text-sm text-gray-700 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
                                    />
                                    <div className="flex items-center gap-1">
                                        <span className="text-sm text-gray-500">R$</span>
                                        <input
                                            value={p.valor}
                                            disabled={p.paga}
                                            onChange={e => setParcela(idx, 'valor', e.target.value)}
                                            placeholder="0,00"
                                            className="w-28 border border-gray-300 rounded px-2 py-2 text-sm text-right focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
                                        />
                                    </div>
                                    {p.paga ? (
                                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">já paga</span>
                                    ) : (
                                        <button
                                            onClick={() => removeParcela(idx)}
                                            disabled={parcelas.length <= 1}
                                            title="Excluir parcela"
                                            className="ml-auto p-2 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100 disabled:opacity-30"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Valor total da despesa (opcional, para conferência)</label>
                                <div className="flex items-center border border-gray-300 rounded overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-primary bg-white">
                                    <span className="px-3 py-2 bg-gray-50 border-r border-gray-300 text-sm text-gray-500">R$</span>
                                    <input value={valorTotal} onChange={e => setValorTotal(e.target.value)} placeholder="0,00" className="flex-1 px-3 py-2 text-sm outline-none" />
                                </div>
                            </div>
                            <div className={`text-sm rounded-lg px-3 py-2 border ${somaDiverge ? 'bg-red-50 border-red-200 text-red-700 font-medium' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                                Soma das parcelas: <span className="font-semibold">R$ {fmt(somaParcelas)}</span>
                                {somaDiverge && <span> — não bate com o total informado (R$ {fmt(totalInformado)})</span>}
                            </div>
                        </div>
                    </div>

                    {!editando && (
                        <label className="flex items-start gap-2 text-sm text-gray-700 bg-blue-50 border border-blue-200 rounded-lg p-3 cursor-pointer">
                            <input type="checkbox" checked={enviarCA} onChange={e => setEnviarCA(e.target.checked)} className="rounded mt-0.5" />
                            <span><span className="font-semibold">Enviar para a Conta Azul</span> (para pagar via DDA)</span>
                        </label>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
                    <button onClick={onClose} className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm">Cancelar</button>
                    <button
                        onClick={salvar}
                        disabled={salvando || somaDiverge}
                        className="flex-1 px-4 py-2 bg-primary hover:bg-blue-700 text-white rounded-md shadow-sm font-semibold text-sm disabled:opacity-50"
                    >
                        {salvando ? 'Salvando…' : (editando ? 'Salvar alterações' : 'Criar despesa')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
// MODAL BAIXAR PARCELA
// ═══════════════════════════════════════════════════════════
const BaixaParcelaModal = ({ conta, parcela, onClose, onSuccess }) => {
    const saldo = Math.max(0, Number(parcela.valor || 0) - Number(parcela.valorPago || 0));
    const [dataPagamento, setDataPagamento] = useState(hojeYMD());
    const [valorPago, setValorPago] = useState(saldo.toFixed(2).replace('.', ','));
    const [juros, setJuros] = useState('');
    const [multa, setMulta] = useState('');
    const [desconto, setDesconto] = useState('');
    const [formaPagamento, setFormaPagamento] = useState('PIX');
    const [observacao, setObservacao] = useState('');
    const [salvando, setSalvando] = useState(false);

    const confirmar = async () => {
        const vp = parseNum(valorPago);
        if (vp <= 0) { toast.error('Informe o valor pago.'); return; }
        setSalvando(true);
        try {
            await contasPagarService.baixarParcela(conta.id, parcela.id, {
                dataPagamento,
                valorPago: vp,
                juros: parseNum(juros),
                multa: parseNum(multa),
                desconto: parseNum(desconto),
                formaPagamento,
                observacao: observacao.trim() || undefined
            });
            toast.success('Baixa registrada!');
            onSuccess();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao dar baixa');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-w-md w-full max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-gray-500">Baixar parcela {parcela.numeroParcela}{conta.parcelas?.length ? `/${conta.parcelas.length}` : ''}</p>
                        <h2 className="font-bold text-gray-900">{nomeFornecedor(conta.fornecedor)}{conta.descricao ? ` · ${conta.descricao}` : ''}</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                            <p className="text-xs text-gray-500 mb-1">Valor da parcela</p>
                            <p className="font-bold text-base text-gray-900">R$ {fmt(parcela.valor)}</p>
                        </div>
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                            <p className="text-xs text-gray-500 mb-1">Saldo restante</p>
                            <p className="font-bold text-base text-amber-700">R$ {fmt(saldo)}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Data do pagamento</label>
              <input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Valor pago</label>
                            <div className="flex items-center border border-gray-300 rounded overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-primary bg-white">
                                <span className="px-3 py-2 bg-gray-50 border-r border-gray-300 text-sm text-gray-500">R$</span>
                                <input value={valorPago} onChange={e => setValorPago(e.target.value)} className="flex-1 min-w-0 px-3 py-2 text-sm outline-none" />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Juros</label>
              <input value={juros} onChange={e => setJuros(e.target.value)} placeholder="0,00" className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-right focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Multa</label>
              <input value={multa} onChange={e => setMulta(e.target.value)} placeholder="0,00" className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-right focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Desconto</label>
              <input value={desconto} onChange={e => setDesconto(e.target.value)} placeholder="0,00" className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-right focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Forma de pagamento</label>
            <select value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none">
                            {FORMAS_PGTO.map(f => <option key={f}>{f}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Observação (opcional)</label>
            <textarea rows={2} value={observacao} onChange={e => setObservacao(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                    </div>
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
                    <button onClick={onClose} className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm">Cancelar</button>
                    <button onClick={confirmar} disabled={salvando} className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md shadow-sm font-semibold text-sm disabled:opacity-50">
                        {salvando ? 'Salvando…' : 'Confirmar baixa'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
// MODAL DETALHES DA CONTA (cancelar / reenviar CA / estornar)
// ═══════════════════════════════════════════════════════════
const DetalheContaModal = ({ conta, podeBaixar, onClose, onEditar, onBaixar, onChanged }) => {
    const [executando, setExecutando] = useState(null); // 'cancelar' | 'reenviar' | pagamentoId

    const totalParcelas = (conta.parcelas || []).length;
    const statusEnvio = String(conta.statusEnvioCA || '').toUpperCase();

    const cancelarConta = async () => {
        if (!window.confirm('Cancelar esta despesa? As parcelas em aberto serão canceladas.')) return;
        setExecutando('cancelar');
        try {
            await contasPagarService.cancelar(conta.id);
            toast.success('Despesa cancelada.');
            onChanged();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao cancelar');
        } finally {
            setExecutando(null);
        }
    };

    const reenviarCA = async () => {
        setExecutando('reenviar');
        try {
            await contasPagarService.reenviarCA(conta.id);
            toast.success('Reenvio à Conta Azul solicitado.');
            onChanged();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao reenviar');
        } finally {
            setExecutando(null);
        }
    };

    const estornar = async (parcela, pagamento) => {
        if (!window.confirm('Estornar este pagamento? A parcela volta a ficar em aberto.')) return;
        setExecutando(pagamento.id);
        try {
            await contasPagarService.estornarPagamento(conta.id, parcela.id, pagamento.id);
            toast.success('Pagamento estornado.');
            onChanged();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao estornar');
        } finally {
            setExecutando(null);
        }
    };

    // Só baixa manual pode ser estornada aqui (baixa via CA/DDA é conferida lá)
    const podeEstornarPag = (p) => {
        if (p.estornado) return false;
        const origem = String(p.origem || '').toUpperCase();
        return origem !== 'CA' && origem !== 'DDA' && origem !== 'CONTA_AZUL';
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-w-lg w-full max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="min-w-0">
                        <p className="text-xs text-gray-500">Despesa{conta.numeroNota ? ` · Nota ${conta.numeroNota}` : ''}</p>
                        <h2 className="font-bold text-gray-900 truncate">{nomeFornecedor(conta.fornecedor)}</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 shrink-0"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-5 space-y-4">
                    <div className="text-sm text-gray-600">
                        {conta.descricao || 'Sem descrição'}
                        {conta.categoria ? <span className="text-gray-400"> · {conta.categoria}</span> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-gray-500">Total:</span>
                        <span className="font-bold text-gray-900">R$ {fmt(conta.valorTotal)}</span>
                        <BadgeCA conta={conta} />
                        {conta.status === 'CANCELADO' && (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">Cancelado</span>
                        )}
                    </div>
                    {statusEnvio === 'ERRO' && conta.erroEnvioCA && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                            <span className="font-semibold">Erro no envio à Conta Azul:</span> {conta.erroEnvioCA}
                        </div>
                    )}
                    {conta.observacoes && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600">{conta.observacoes}</div>
                    )}

                    {/* Parcelas + pagamentos */}
                    <div>
                        <div className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Parcelas</div>
                        <div className="space-y-2">
                            {(conta.parcelas || []).map(p => (
                                <div key={p.id} className="border border-gray-200 rounded-lg p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="text-sm text-gray-700">
                                            <span className="font-medium text-gray-900">Parcela {p.numeroParcela}/{totalParcelas}</span>
                                            <span className="text-gray-500"> · vence {fmtData(p.dataVencimento)}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-gray-900 text-sm">R$ {fmt(p.valor)}</span>
                                            <BadgeStatusParcela parcela={p} />
                                        </div>
                                    </div>
                                    {(p.pagamentos || []).filter(pg => !pg.estornado).length > 0 && (
                                        <div className="mt-2 space-y-1.5 border-t border-gray-100 pt-2">
                                            {(p.pagamentos || []).filter(pg => !pg.estornado).map(pg => (
                                                <div key={pg.id} className="flex items-center justify-between text-xs text-gray-600 gap-2">
                                                    <span className="truncate">
                                                        Pago R$ {fmt(pg.valorPago)} em {fmtData(pg.dataPagamento)}
                                                        {pg.formaPagamento ? ` · ${pg.formaPagamento}` : ''}
                                                        {String(pg.origem || '').toUpperCase() === 'CA' || String(pg.origem || '').toUpperCase() === 'DDA' ? ' · via Conta Azul' : ''}
                                                    </span>
                                                    {podeBaixar && podeEstornarPag(pg) && (
                                                        <button
                                                            onClick={() => estornar(p, pg)}
                                                            disabled={executando === pg.id}
                                                            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs text-amber-700 border border-amber-300 rounded hover:bg-amber-50 disabled:opacity-50"
                                                        >
                                                            <Undo2 className="h-3 w-3" /> Estornar
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {podeBaixar && conta.status !== 'CANCELADO' && p.status !== 'PAGO' && p.status !== 'CANCELADO' && (
                                        <div className="mt-2">
                                            <button
                                                onClick={() => onBaixar(conta, p)}
                                                className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-xs"
                                            >
                                                Baixar parcela
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {podeBaixar && (
                    <div className="px-5 py-4 border-t border-gray-100 flex flex-col md:flex-row gap-2">
                        {conta.status !== 'CANCELADO' && (
                            <button
                                onClick={() => onEditar(conta)}
                className="w-full md:w-auto px-4 py-2 min-h-[44px] md:min-h-0 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm"
                            >
                                Editar
                            </button>
                        )}
                        {statusEnvio === 'ERRO' && (
                            <button
                                onClick={reenviarCA}
                                disabled={executando === 'reenviar'}
                className="w-full md:w-auto px-4 py-2 min-h-[44px] md:min-h-0 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                                <RefreshCw className={`h-4 w-4 ${executando === 'reenviar' ? 'animate-spin' : ''}`} />
                                Reenviar à Conta Azul
                            </button>
                        )}
                        {conta.status !== 'CANCELADO' && (
                            <button
                                onClick={cancelarConta}
                                disabled={executando === 'cancelar'}
                className="w-full md:w-auto md:ml-auto px-4 py-2 min-h-[44px] md:min-h-0 bg-red-600 hover:bg-red-700 text-white rounded-md font-semibold text-sm disabled:opacity-50"
                            >
                                {executando === 'cancelar' ? 'Cancelando…' : 'Cancelar despesa'}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ContasPagarPage;
