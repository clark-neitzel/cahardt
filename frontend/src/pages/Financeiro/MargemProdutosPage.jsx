import React, { useEffect, useMemo, useState, useCallback } from 'react';
import financeiroGerencialService from '../../services/financeiroGerencialService';
import SelectBusca from '../../components/SelectBusca';
import { Percent, Loader2, RefreshCw, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import toast from 'react-hot-toast';

// ── Helpers ──
const fmt = (v, casas = 2) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const fmtQtd = (v) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
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

// Períodos pré-definidos
const periodos = () => {
    const hoje = hojeYMD();
    const mes = hoje.slice(0, 7);
    const ano = hoje.slice(0, 4);
    return [
        { key: 'MES', label: 'Este mês', de: `${mes}-01`, ate: fimDoMes(mes) },
        { key: 'ULT30', label: 'Últimos 30 dias', de: somaDiasYMD(hoje, -29), ate: hoje },
        { key: 'ULT90', label: 'Últimos 90 dias', de: somaDiasYMD(hoje, -89), ate: hoje },
        { key: 'ANO', label: 'Este ano', de: `${ano}-01-01`, ate: hoje }
    ];
};

const FONTE_CUSTO = {
    FICHA: { label: 'Ficha técnica', cls: 'bg-green-100 text-green-800' },
    COMPRA: { label: 'Compras', cls: 'bg-blue-100 text-blue-800' },
    CA: { label: 'Conta Azul', cls: 'bg-gray-100 text-gray-700' },
    SEM_CUSTO: { label: 'Sem custo', cls: 'bg-amber-100 text-amber-700' }
};

// Cor da margem % (dado, não status): negativa = vermelho, baixa = âmbar, saudável = verde
const corMargem = (pct) => {
    if (pct == null) return 'text-gray-400';
    if (pct < 0) return 'text-red-700';
    if (pct < 15) return 'text-amber-700';
    return 'text-green-700';
};

const KpiCard = ({ titulo, valor, cor = 'text-gray-900', sub, subCor = 'text-gray-500' }) => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{titulo}</div>
        <div className={`text-lg md:text-2xl font-bold mt-1 ${cor}`}>{valor}</div>
        {sub && <div className={`text-xs mt-0.5 ${subCor}`}>{sub}</div>}
    </div>
);

const BadgeFonte = ({ fonte }) => {
    const f = FONTE_CUSTO[fonte] || FONTE_CUSTO.SEM_CUSTO;
    return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${f.cls}`}>{f.label}</span>;
};

const MargemProdutosPage = () => {
    const opcoesPeriodo = useMemo(periodos, []);
    const [periodo, setPeriodo] = useState(opcoesPeriodo[0]);
    const [dados, setDados] = useState(null);
    const [loading, setLoading] = useState(false);
    const [busca, setBusca] = useState('');
    const [categoria, setCategoria] = useState('todas');
    const [ordem, setOrdem] = useState({ campo: 'receita', dir: 'desc' });

    const carregar = useCallback(async (p) => {
        setLoading(true);
        try {
            const d = await financeiroGerencialService.margemProdutos(p.de, p.ate);
            setDados(d);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar a margem por produto');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { carregar(periodo); }, [periodo, carregar]);

    const categorias = useMemo(() => {
        const set = new Set();
        (dados?.linhas || []).forEach(l => { if (l.categoria) set.add(l.categoria); });
        return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }, [dados]);

    const linhas = useMemo(() => {
        let lista = dados?.linhas || [];
        if (categoria !== 'todas') lista = lista.filter(l => l.categoria === categoria);
        const q = busca.trim().toLowerCase();
        if (q) lista = lista.filter(l => l.nome.toLowerCase().includes(q));
        const { campo, dir } = ordem;
        const mult = dir === 'asc' ? 1 : -1;
        return [...lista].sort((a, b) => {
            const va = a[campo]; const vb = b[campo];
            if (va == null && vb == null) return 0;
            if (va == null) return 1; // nulos sempre no fim
            if (vb == null) return -1;
            if (typeof va === 'string') return va.localeCompare(vb, 'pt-BR') * mult;
            return (va - vb) * mult;
        });
    }, [dados, categoria, busca, ordem]);

    const totais = dados?.totais;

    const alternarOrdem = (campo) => {
        setOrdem(o => o.campo === campo ? { campo, dir: o.dir === 'desc' ? 'asc' : 'desc' } : { campo, dir: 'desc' });
    };

    const Th = ({ campo, children, alinha = 'text-right' }) => (
        <th
            onClick={() => alternarOrdem(campo)}
            className={`px-5 py-3 ${alinha} text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700`}
        >
            <span className="inline-flex items-center gap-1">
                {children}
                {ordem.campo === campo
                    ? (ordem.dir === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)
                    : <ArrowUpDown className="h-3 w-3 opacity-40" />}
            </span>
        </th>
    );

    const exportarCSV = () => {
        const header = ['Produto', 'Categoria', 'Qtd vendida', 'Receita', 'Preço médio', 'Custo unitário', 'Fonte do custo', 'Custo total', 'Margem R$', 'Margem %'];
        const rows = linhas.map(l => [
            l.nome, l.categoria || '', fmtQtd(l.quantidade), fmt(l.receita),
            l.precoMedio != null ? fmt(l.precoMedio) : '',
            l.custoUnitario != null ? fmt(l.custoUnitario, 4) : '',
            FONTE_CUSTO[l.fonteCusto]?.label || '',
            l.custoTotal != null ? fmt(l.custoTotal) : '',
            l.margem != null ? fmt(l.margem) : '',
            l.margemPct != null ? fmt(l.margemPct, 1) : ''
        ]);
        const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
        const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `margem-produtos-${periodo.de}-a-${periodo.ate}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    return (
        <div className="max-w-full overflow-x-hidden -mx-4 sm:-mx-6 lg:-mx-8">
            {/* Topbar */}
            <div className="flex items-center justify-between p-3 md:p-6 bg-white border-b border-gray-200">
                <div className="flex items-center gap-2">
                    <div className="bg-amber-100 p-1.5 md:p-2 rounded-lg">
                        <Percent className="h-4 w-4 md:h-5 md:w-5 text-amber-600" />
                    </div>
                    <h1 className="text-base md:text-2xl font-bold text-gray-900">Margem por Produto</h1>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={exportarCSV}
                        disabled={loading || linhas.length === 0}
                        className="hidden md:inline-flex px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md text-sm font-medium items-center gap-1.5 disabled:opacity-50"
                    >
                        Exportar CSV
                    </button>
                    <button
                        onClick={() => carregar(periodo)}
                        disabled={loading}
                        className="px-3 py-1.5 md:px-4 md:py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md text-xs md:text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
                    </button>
                </div>
            </div>

            <div className="p-3 md:p-6 space-y-4">
                {/* Chips de período */}
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

                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <KpiCard titulo="Receita no período" valor={`R$ ${fmt(totais?.receitaTotal)}`} sub={`${totais?.produtos || 0} produto(s) vendidos`} />
                    <KpiCard titulo="Custo dos vendidos" valor={`R$ ${fmt(totais?.custoTotal)}`} sub="dos produtos com custo conhecido" />
                    <KpiCard
                        titulo="Margem bruta"
                        valor={`R$ ${fmt(totais?.margemTotal)}`}
                        cor={Number(totais?.margemTotal) < 0 ? 'text-red-700' : 'text-green-700'}
                        sub="receita − custo (com custo conhecido)"
                    />
                    <KpiCard
                        titulo="Margem %"
                        valor={totais?.margemPct != null ? `${fmt(totais.margemPct, 1)}%` : '—'}
                        cor={corMargem(totais?.margemPct)}
                        sub={Number(totais?.semCusto) > 0 ? `${totais.semCusto} produto(s) sem custo` : 'todos com custo'}
                        subCor={Number(totais?.semCusto) > 0 ? 'text-amber-700' : 'text-gray-500'}
                    />
                </div>

                {/* Filtros */}
                <div className="flex flex-col md:flex-row gap-2">
                    <div className="relative flex-1 md:max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            value={busca}
                            onChange={e => setBusca(e.target.value)}
                            placeholder="Buscar produto..."
                            className="w-full border border-gray-300 rounded pl-9 pr-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                    </div>
                    <SelectBusca value={categoria} onChange={e => setCategoria(e.target.value)} className="w-full md:w-56">
                        <option value="todas">Todas as categorias</option>
                        {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                    </SelectBusca>
                </div>

                {loading && (
                    <div className="text-center text-gray-500 text-sm py-2 flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                    </div>
                )}

                {!loading && linhas.length === 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-sm text-gray-500">
                        Nenhuma venda encontrada no período{busca || categoria !== 'todas' ? ' com esses filtros' : ''}.
                    </div>
                )}

                {linhas.length > 0 && (
                    <>
                        {/* Mobile: cards */}
                        <div className="md:hidden space-y-3">
                            {linhas.map(l => (
                                <div key={l.produtoId} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                                    <div className="flex items-start justify-between gap-2 mb-1">
                                        <span className="font-semibold text-gray-900 leading-snug">{l.nome}</span>
                                        <span className={`shrink-0 font-bold ${corMargem(l.margemPct)}`}>
                                            {l.margemPct != null ? `${fmt(l.margemPct, 1)}%` : '—'}
                                        </span>
                                    </div>
                                    <div className="text-xs text-gray-500 mb-2">
                                        {fmtQtd(l.quantidade)} {l.unidade || 'un'} · Receita R$ {fmt(l.receita)}
                                        {l.margem != null ? ` · Margem R$ ${fmt(l.margem)}` : ''}
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-500">
                                            {l.custoUnitario != null ? `Custo R$ ${fmt(l.custoUnitario, 4)}/${l.unidade || 'un'}` : 'Custo desconhecido'}
                                        </span>
                                        <BadgeFonte fonte={l.fonteCusto} />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop: tabela */}
                        <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <Th campo="nome" alinha="text-left">Produto</Th>
                                        <Th campo="quantidade">Qtd</Th>
                                        <Th campo="receita">Receita</Th>
                                        <Th campo="precoMedio">Preço médio</Th>
                                        <Th campo="custoUnitario">Custo unit.</Th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Fonte</th>
                                        <Th campo="margem">Margem R$</Th>
                                        <Th campo="margemPct">Margem %</Th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                    {linhas.map(l => (
                                        <tr key={l.produtoId} className="hover:bg-gray-50">
                                            <td className="px-5 py-3 text-gray-900">
                                                <div className="font-medium">{l.nome}</div>
                                                {l.categoria && <div className="text-xs text-gray-500">{l.categoria}</div>}
                                            </td>
                                            <td className="px-5 py-3 text-right text-gray-900">{fmtQtd(l.quantidade)} <span className="text-xs text-gray-500">{l.unidade || ''}</span></td>
                                            <td className="px-5 py-3 text-right text-gray-900 font-medium">R$ {fmt(l.receita)}</td>
                                            <td className="px-5 py-3 text-right text-gray-600">{l.precoMedio != null ? `R$ ${fmt(l.precoMedio)}` : '—'}</td>
                                            <td className="px-5 py-3 text-right text-gray-600">{l.custoUnitario != null ? `R$ ${fmt(l.custoUnitario, 4)}` : '—'}</td>
                                            <td className="px-5 py-3"><BadgeFonte fonte={l.fonteCusto} /></td>
                                            <td className={`px-5 py-3 text-right font-medium ${l.margem != null && l.margem < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                                                {l.margem != null ? `R$ ${fmt(l.margem)}` : '—'}
                                            </td>
                                            <td className={`px-5 py-3 text-right font-bold ${corMargem(l.margemPct)}`}>
                                                {l.margemPct != null ? `${fmt(l.margemPct, 1)}%` : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <p className="text-xs text-gray-500">
                            Custo por prioridade: ficha técnica ativa do PCP (se atualiza sozinha com as notas de compra) → média das compras → custo do Conta Azul.
                            Produtos "Sem custo" entram na receita, mas ficam fora dos totais de custo e margem.
                            Bonificações não entram; devoluções não são descontadas por produto.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
};

export default MargemProdutosPage;
