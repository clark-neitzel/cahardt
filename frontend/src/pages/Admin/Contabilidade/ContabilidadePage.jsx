/**
 * CONTABILIDADE — área de consulta para o escritório de contabilidade (Fase 1).
 *
 * Fase 1: relatório dinâmico de CONTAS A RECEBER, no estilo do Relatório de
 * Vendas (pílulas ligam/desligam colunas, arrastar reordena, tudo salvo por
 * usuário). Duas visões:
 *   • Títulos (competência) — 1 linha por parcela, pela DATA DE CRIAÇÃO
 *   • Recebimentos (caixa)  — 1 linha por baixa, pela data do recebimento
 * Exportação: CSV (Excel) e impressão/PDF na própria página (padrão iPad).
 *
 * Fases futuras (Pagar, Extratos, Notas, Pacote do Mês) entram como abas aqui.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Landmark, RefreshCw, Filter, Printer, Download, X, ChevronUp, ChevronDown, Search
} from 'lucide-react';
import api from '../../../services/api';
import SelectBusca from '../../../components/SelectBusca';
import FiltroPeriodo, { usePeriodoSalvo } from '../../../components/FiltroPeriodo';
import { useFiltrosSalvos } from '../../../hooks/useFiltrosSalvos';

// ── Colunas disponíveis (id estável = chave salva por usuário) ──
const COLUNAS = [
    { id: 'pedido', label: 'Pedido' },
    { id: 'criacao', label: 'Criação', tipo: 'data' },
    { id: 'cliente', label: 'Cliente / CNPJ' },
    { id: 'documento', label: 'Nota fiscal' },
    { id: 'parcela', label: 'Parc.' },
    { id: 'vencimento', label: 'Venc.', tipo: 'data' },
    { id: 'valor', label: 'Valor', tipo: 'num' },
    { id: 'recebido', label: 'Recebido', tipo: 'num' },
    { id: 'desconto', label: 'Desconto', tipo: 'num' },
    { id: 'forma', label: 'Forma receb.' },
    { id: 'banco', label: 'Banco da baixa' },
    { id: 'baixa', label: 'Data baixa', tipo: 'data' },
    { id: 'baixadopor', label: 'Baixado por' },
    { id: 'conciliado', label: 'Conciliado?' },
    { id: 'status', label: 'Status' },
    { id: 'origem', label: 'Origem' },
    { id: 'condicao', label: 'Condição pgto' },
    { id: 'vendedor', label: 'Vendedor' },
];
const COLS_PADRAO = ['pedido', 'criacao', 'cliente', 'documento', 'vencimento', 'valor', 'forma', 'banco', 'baixa', 'status'];
const ORDEM_PADRAO = COLUNAS.map((c) => c.id);

const DOC_BADGE = {
    NF_CA: { label: 'NF-e CA', cls: 'bg-blue-100 text-blue-800' },
    NF_APP: { label: 'NF-e app', cls: 'bg-mint text-primaryDark' },
    ESPECIAL: { label: 'Especial — sem nota', cls: 'bg-purple-100 text-purple-700' },
    IMPORTADA: { label: 'Importada do CA', cls: 'bg-gray-100 text-gray-700' },
    SEM_NF: { label: 'Sem NF registrada', cls: 'bg-amber-100 text-amber-700' },
};
const STATUS_BADGE = {
    PAGO: 'bg-green-100 text-green-800',
    PENDENTE: 'bg-gray-100 text-gray-700',
    PARCIAL: 'bg-yellow-100 text-yellow-800',
    VENCIDO: 'bg-red-100 text-red-700',
    CANCELADO: 'bg-red-100 text-red-700',
};

const fmtData = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');
const fmtVal = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const fmtNumCsv = (v) => (v == null ? '' : Number(v).toFixed(2).replace('.', ','));

// Valor "cru" de cada coluna (ordenar + CSV + impressão)
function valorColuna(l, id) {
    switch (id) {
        case 'pedido': return l.especial && l.pedidoNumero ? `ZZ#${l.pedidoNumero}`
            : (l.pedidoNumero ? `#${l.pedidoNumero}` : (l.numeroVendaCA ? `CA #${l.numeroVendaCA}` : '—'));
        case 'criacao': return l.criacao;
        case 'cliente': return l.clienteNome;
        case 'documento': {
            const b = DOC_BADGE[l.documento?.tipo] || DOC_BADGE.SEM_NF;
            return l.documento?.numero ? `${b.label} ${l.documento.numero}` : b.label;
        }
        case 'parcela': return l.numeroParcela;
        case 'vencimento': return l.vencimento;
        case 'valor': return l.valor;
        case 'recebido': return l.valorRecebido;
        case 'desconto': return l.desconto;
        case 'forma': return l.forma || '—';
        case 'banco': return l.bancoNome || '—';
        case 'baixa': return l.dataBaixa;
        case 'baixadopor': return l.baixadoPor || '—';
        case 'conciliado': return l.conciliado ? 'Sim' : 'Não';
        case 'status': return l.status;
        case 'origem': return l.origemConta + (l.origemBaixa ? ` · baixa ${l.origemBaixa}` : '');
        case 'condicao': return l.condicao || '—';
        case 'vendedor': return l.vendedor || '—';
        default: return '';
    }
}

// Receita do CLAUDE.md: imprimir NA PRÓPRIA PÁGINA (funciona no iPad/PWA)
function imprimirConteudo(estilos, corpoHtml) {
    document.getElementById('area-impressao')?.remove();
    document.getElementById('estilo-impressao')?.remove();
    const style = document.createElement('style');
    style.id = 'estilo-impressao';
    const estilosSemPage = (estilos || '').replace(/@page\s*{[^}]*}/g, '');
    style.textContent = `
        @page { size: A4 landscape; margin: 10mm; }
        #area-impressao { display: none; }
        @media print {
            html, body { margin:0!important; padding:0!important; background:#fff!important; height:auto!important; }
            body * { visibility: hidden !important; }
            body > *:not(#area-impressao) { position:absolute!important; top:0; left:0; width:0!important; height:0!important; overflow:hidden!important; }
            #area-impressao { display: block !important; }
            #area-impressao, #area-impressao * { visibility: visible !important; }
            #area-impressao * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            ${estilosSemPage}
        }`;
    document.head.appendChild(style);
    const area = document.createElement('div');
    area.id = 'area-impressao';
    area.innerHTML = corpoHtml;
    document.body.appendChild(area);
    const limpar = () => { area.remove(); style.remove(); window.removeEventListener('afterprint', limpar); };
    window.addEventListener('afterprint', limpar);
    setTimeout(limpar, 60000);
    void area.offsetHeight;
    window.print();
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default function ContabilidadePage() {
    // ── Visão + filtros (salvos por usuário) ──
    const [filtros, setFiltros] = useFiltrosSalvos('contabilidade-receber', {
        visao: 'titulos', documento: 'todos', forma: 'todos', banco: 'todos', status: 'todos', origem: 'todos'
    });
    const [perCriacao, ctlCriacao] = usePeriodoSalvo('contabilidade-receber-criacao', 'mes');
    const [perVenc, ctlVenc] = usePeriodoSalvo('contabilidade-receber-venc', 'todos');
    const [perPag, ctlPag] = usePeriodoSalvo('contabilidade-receber-pag', 'todos');
    const [cliente, setCliente] = useState(''); // busca livre: não persiste (regra do projeto)

    // ── Colunas (escolha + ordem salvas — o gap do Relatório de Vendas, corrigido aqui) ──
    const [cols, setCols] = useFiltrosSalvos('contabilidade-receber:cols', { visiveis: COLS_PADRAO, ordem: ORDEM_PADRAO });
    const visiveis = useMemo(() => new Set(cols.visiveis), [cols.visiveis]);
    // colunas novas do código entram no fim da ordem salva sem quebrar o que o usuário arrastou
    const ordem = useMemo(() => [...cols.ordem.filter((id) => ORDEM_PADRAO.includes(id)),
        ...ORDEM_PADRAO.filter((id) => !cols.ordem.includes(id))], [cols.ordem]);
    const colunasAtivas = useMemo(() => ordem.filter((id) => visiveis.has(id)).map((id) => COLUNAS.find((c) => c.id === id)), [ordem, visiveis]);
    const dragId = useRef(null);

    const [sort, setSort] = useFiltrosSalvos('contabilidade-receber:sort', { col: 'vencimento', dir: 'asc' });

    // ── Dados ──
    const [dados, setDados] = useState({ resumo: null, linhas: [], bancos: [] });
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState('');

    const buscar = useCallback(async () => {
        setLoading(true); setErro('');
        try {
            const params = { visao: filtros.visao };
            if (perCriacao.de) params.criacaoDe = perCriacao.de;
            if (perCriacao.ate) params.criacaoAte = perCriacao.ate;
            if (perVenc.de) params.vencDe = perVenc.de;
            if (perVenc.ate) params.vencAte = perVenc.ate;
            if (perPag.de) params.pagDe = perPag.de;
            if (perPag.ate) params.pagAte = perPag.ate;
            if (cliente.trim()) params.cliente = cliente.trim();
            if (filtros.documento !== 'todos') params.documento = filtros.documento;
            if (filtros.forma !== 'todos') params.forma = filtros.forma;
            if (filtros.banco !== 'todos') params.banco = filtros.banco;
            if (filtros.status !== 'todos') params.status = filtros.status;
            if (filtros.origem !== 'todos') params.origem = filtros.origem;
            const { data } = await api.get('/contabilidade/relatorio-receber', { params });
            setDados(data);
        } catch (e) {
            setErro(e.response?.data?.error || 'Erro ao carregar o relatório.');
        } finally {
            setLoading(false);
        }
    }, [filtros, perCriacao.de, perCriacao.ate, perVenc.de, perVenc.ate, perPag.de, perPag.ate, cliente]);

    useEffect(() => { buscar(); /* recarrega ao mudar visão/períodos/selects */ }, [buscar]);

    const linhasOrdenadas = useMemo(() => {
        const arr = [...dados.linhas];
        const { col, dir } = sort;
        arr.sort((a, b) => {
            const va = valorColuna(a, col); const vb = valorColuna(b, col);
            const cmp = (typeof va === 'number' && typeof vb === 'number')
                ? va - vb
                : String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR');
            return dir === 'desc' ? -cmp : cmp;
        });
        return arr;
    }, [dados.linhas, sort]);

    const formasDisponiveis = useMemo(() => [...new Set(dados.linhas.map((l) => l.forma).filter(Boolean))].sort(), [dados.linhas]);

    const nFiltros = useMemo(() => {
        let n = 0;
        ['documento', 'forma', 'banco', 'status', 'origem'].forEach((k) => { if (filtros[k] !== 'todos') n++; });
        if (!perCriacao.padrao) n++;
        if (!perVenc.padrao) n++;
        if (!perPag.padrao) n++;
        if (cliente.trim()) n++;
        return n;
    }, [filtros, perCriacao.padrao, perVenc.padrao, perPag.padrao, cliente]);

    const limparFiltros = () => {
        setFiltros({ visao: filtros.visao, documento: 'todos', forma: 'todos', banco: 'todos', status: 'todos', origem: 'todos' });
        ctlCriacao.limpar(); ctlVenc.limpar(); ctlPag.limpar(); setCliente('');
    };

    const toggleCol = (id) => {
        const set = new Set(cols.visiveis);
        set.has(id) ? set.delete(id) : set.add(id);
        setCols({ ...cols, visiveis: [...set] });
    };
    const soltarColuna = (idAlvo) => {
        const de = dragId.current;
        if (!de || de === idAlvo) return;
        const nova = ordem.filter((id) => id !== de);
        nova.splice(nova.indexOf(idAlvo), 0, de);
        setCols({ ...cols, ordem: nova });
        dragId.current = null;
    };
    const clicarSort = (id) => setSort({ col: id, dir: sort.col === id && sort.dir === 'asc' ? 'desc' : 'asc' });

    // ── Exportações ──
    const tituloRelatorio = filtros.visao === 'recebimentos' ? 'Recebimentos (caixa)' : 'Títulos (competência)';
    const subtituloPeriodos = [
        !perCriacao.padrao || perCriacao.de || perCriacao.ate ? `Criação: ${perCriacao.de || 'início'} a ${perCriacao.ate || 'hoje'}` : null,
        perVenc.de || perVenc.ate ? `Venc.: ${perVenc.de || 'início'} a ${perVenc.ate || 'hoje'}` : null,
        perPag.de || perPag.ate ? `Pagamento: ${perPag.de || 'início'} a ${perPag.ate || 'hoje'}` : null,
    ].filter(Boolean).join(' · ') || 'Todo o período';

    const exportarCSV = () => {
        const cab = colunasAtivas.map((c) => `"${c.label}"`).join(';');
        const linhasCsv = linhasOrdenadas.map((l) => colunasAtivas.map((c) => {
            const v = valorColuna(l, c.id);
            if (c.tipo === 'num') return fmtNumCsv(v);
            if (c.tipo === 'data') return v ? fmtData(v) : '';
            return `"${String(v ?? '').replace(/"/g, '""')}"`;
        }).join(';')).join('\n');
        const blob = new Blob(['﻿' + cab + '\n' + linhasCsv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `contabilidade-receber-${filtros.visao}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const imprimir = () => {
        const ths = colunasAtivas.map((c) => `<th${c.tipo === 'num' ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('');
        const trs = linhasOrdenadas.map((l) => '<tr>' + colunasAtivas.map((c) => {
            const v = valorColuna(l, c.id);
            const txt = c.tipo === 'num' ? fmtVal(v) : (c.tipo === 'data' ? fmtData(v) : String(v ?? '—'));
            return `<td${c.tipo === 'num' ? ' class="num"' : ''}>${esc(txt)}</td>`;
        }).join('') + '</tr>').join('');
        const totV = fmtVal(dados.resumo?.valorTotal); const totR = fmtVal(dados.resumo?.recebidoTotal);
        imprimirConteudo(`
            #area-impressao * { font-family: 'SF Pro Text', -apple-system, Arial, sans-serif; color:#000; }
            #area-impressao h1 { font-size: 14px; margin: 0 0 2px; }
            #area-impressao .sub { font-size: 9px; color: #444; margin-bottom: 6px; }
            #area-impressao table { width: 100%; border-collapse: collapse; }
            #area-impressao th, #area-impressao td { border: 1px solid #000; padding: 3px 5px; font-size: 8.5px; text-align: left; }
            #area-impressao th { background: #eee; }
            #area-impressao .num { text-align: right; }
        `, `
            <h1>Contabilidade — Contas a Receber · ${esc(tituloRelatorio)}</h1>
            <div class="sub">${esc(subtituloPeriodos)} · ${linhasOrdenadas.length} linhas · Valor ${esc(totV)} · Recebido ${esc(totR)} · Emitido em ${new Date().toLocaleString('pt-BR')}</div>
            <table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>
        `);
    };

    // ── Células ──
    const celula = (l, c) => {
        switch (c.id) {
            case 'cliente': return (
                <div>
                    <span className="font-semibold text-gray-900">{l.clienteNome}</span>
                    {l.clienteDoc && <div className="text-xs text-gray-500">{l.clienteDoc}</div>}
                </div>
            );
            case 'documento': {
                const b = DOC_BADGE[l.documento?.tipo] || DOC_BADGE.SEM_NF;
                return (
                    <div>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${b.cls}`}>
                            {b.label}{l.documento?.numero ? ` ${l.documento.numero}` : ''}
                        </span>
                        {l.documento?.chave && <div className="text-xs text-gray-400 mt-0.5">chave …{String(l.documento.chave).slice(-6)}</div>}
                    </div>
                );
            }
            case 'status': return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[l.status] || 'bg-gray-100 text-gray-700'}`}>{l.status}</span>;
            case 'conciliado': return l.conciliado
                ? <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Sim</span>
                : <span className="text-xs text-gray-400">Não</span>;
            case 'valor': case 'recebido': case 'desconto': {
                const v = valorColuna(l, c.id);
                return <span className="font-semibold">{v ? fmtVal(v) : '—'}</span>;
            }
            case 'criacao': case 'vencimento': case 'baixa': return fmtData(valorColuna(l, c.id));
            case 'desconto_motivo': return null;
            default: return String(valorColuna(l, c.id) ?? '—');
        }
    };

    const resumo = dados.resumo;

    return (
        <div className="max-w-full overflow-x-hidden">
            {/* Topbar */}
            <div className="flex items-center justify-between p-3 md:p-6 bg-white border-b border-gray-200 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <div className="bg-mint p-1.5 md:p-2 rounded-lg"><Landmark className="h-4 w-4 md:h-5 md:w-5 text-primaryDark" /></div>
                    <div>
                        <h1 className="text-base md:text-2xl font-bold text-gray-900">Contabilidade</h1>
                        <p className="text-xs text-gray-500 hidden md:block">Relatórios de consulta para o escritório de contabilidade</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={exportarCSV} disabled={!dados.linhas.length}
                        className="px-3 py-1.5 md:px-4 md:py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-xs md:text-sm inline-flex items-center gap-1.5 disabled:opacity-40">
                        <Download className="h-4 w-4" /> CSV
                    </button>
                    <button onClick={imprimir} disabled={!dados.linhas.length}
                        className="px-3 py-1.5 md:px-4 md:py-2 bg-white border border-gray-300 text-gray-700 rounded-full font-medium text-xs md:text-sm inline-flex items-center gap-1.5 disabled:opacity-40">
                        <Printer className="h-4 w-4" /> Imprimir / PDF
                    </button>
                    <button onClick={buscar} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100" title="Atualizar">
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="p-3 md:p-6 space-y-4">
                {/* Sub-abas (fases futuras) */}
                <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                    <span className="px-3 py-1.5 rounded-full bg-primary text-white text-xs font-semibold whitespace-nowrap">Contas a Receber</span>
                    {['Contas a Pagar', 'Extratos', 'Notas de Entrada', 'Pacote do Mês'].map((t) => (
                        <span key={t} className="px-3 py-1.5 rounded-full bg-gray-100 text-gray-400 text-xs font-semibold whitespace-nowrap" title="Em breve">{t} · em breve</span>
                    ))}
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{filtros.visao === 'recebimentos' ? 'Recebimentos' : 'Títulos'}</div>
                        <div className="text-lg md:text-xl font-bold text-gray-900">{resumo ? resumo.linhas : '—'}</div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{filtros.visao === 'recebimentos' ? 'Recebido' : 'Valor total'}</div>
                        <div className="text-lg md:text-xl font-bold text-primaryDark">{resumo ? fmtVal(filtros.visao === 'recebimentos' ? resumo.recebidoTotal : resumo.valorTotal) : '—'}</div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Com nota fiscal</div>
                        <div className="text-lg md:text-xl font-bold text-gray-900">{resumo ? fmtVal(resumo.comNF) : '—'}</div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sem nota (especial)</div>
                        <div className="text-lg md:text-xl font-bold text-amber-700">{resumo ? fmtVal(resumo.semNF) : '—'}</div>
                    </div>
                </div>

                {/* Filtros */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 flex-wrap">
                        <Filter className="h-4 w-4 text-primaryDark" />
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Filtros</span>
                        {nFiltros > 0 && <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-mint text-primaryDark">{nFiltros} ativos</span>}
                        <div className="ml-auto flex items-center gap-1 bg-gray-200 rounded-full p-0.5">
                            <button onClick={() => setFiltros({ ...filtros, visao: 'titulos' })}
                                className={`px-3 py-1 rounded-full text-xs font-bold ${filtros.visao === 'titulos' ? 'bg-white text-primaryDark shadow-sm' : 'text-gray-600'}`}>
                                Títulos (competência)
                            </button>
                            <button onClick={() => setFiltros({ ...filtros, visao: 'recebimentos' })}
                                className={`px-3 py-1 rounded-full text-xs font-bold ${filtros.visao === 'recebimentos' ? 'bg-white text-primaryDark shadow-sm' : 'text-gray-600'}`}>
                                Recebimentos (caixa)
                            </button>
                        </div>
                    </div>
                    <div className="p-4 md:p-5 grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Data de criação</label>
                            <FiltroPeriodo periodo={perCriacao} controle={ctlCriacao} className="w-full" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Vencimento</label>
                            <FiltroPeriodo periodo={perVenc} controle={ctlVenc} className="w-full" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Pagamento (baixa)</label>
                            <FiltroPeriodo periodo={perPag} controle={ctlPag} className="w-full" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                            <div className="relative">
                                <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Buscar…"
                                    className="w-full border border-gray-300 rounded px-3 py-2 pl-9 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Documento fiscal</label>
                            <SelectBusca value={filtros.documento} onChange={(e) => setFiltros({ ...filtros, documento: e.target.value })} className="w-full">
                                <option value="todos">Todos</option>
                                <option value="NF_CA">NF-e do Conta Azul</option>
                                <option value="NF_APP">NF-e do app</option>
                                <option value="ESPECIAL">Especial — sem nota</option>
                                <option value="IMPORTADA">Importada do CA</option>
                                <option value="SEM_NF">Sem NF registrada</option>
                            </SelectBusca>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Forma de recebimento</label>
                            <SelectBusca value={filtros.forma} onChange={(e) => setFiltros({ ...filtros, forma: e.target.value })} className="w-full">
                                <option value="todos">Todas</option>
                                {formasDisponiveis.map((f) => <option key={f} value={f}>{f}</option>)}
                                {filtros.forma !== 'todos' && !formasDisponiveis.includes(filtros.forma) && <option value={filtros.forma}>{filtros.forma}</option>}
                            </SelectBusca>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Banco da baixa</label>
                            <SelectBusca value={filtros.banco} onChange={(e) => setFiltros({ ...filtros, banco: e.target.value })} className="w-full">
                                <option value="todos">Todos</option>
                                {dados.bancos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
                            </SelectBusca>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                                <SelectBusca value={filtros.status} onChange={(e) => setFiltros({ ...filtros, status: e.target.value })} className="w-full">
                                    <option value="todos">Todos</option>
                                    <option value="PENDENTE">Pendente</option>
                                    <option value="PARCIAL">Parcial</option>
                                    <option value="PAGO">Pago</option>
                                    <option value="VENCIDO">Vencido</option>
                                    <option value="CANCELADO">Cancelado</option>
                                </SelectBusca>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Origem</label>
                                <SelectBusca value={filtros.origem} onChange={(e) => setFiltros({ ...filtros, origem: e.target.value })} className="w-full">
                                    <option value="todos">Todas</option>
                                    <option value="FATURADO_CA">Faturada (com pedido)</option>
                                    <option value="ESPECIAL">Especial</option>
                                    <option value="IMPORTADO_CA">Importada do CA</option>
                                </SelectBusca>
                            </div>
                        </div>
                    </div>
                    {nFiltros > 0 && (
                        <div className="px-5 pb-3">
                            <button onClick={limparFiltros} className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1">
                                <X className="h-3 w-3" /> Limpar filtros
                            </button>
                        </div>
                    )}
                </div>

                {/* Colunas */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <div className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Colunas — clique para ligar/desligar, arraste para reordenar (fica salvo)</div>
                    <div className="flex flex-wrap gap-1.5">
                        {ordem.map((id) => {
                            const c = COLUNAS.find((x) => x.id === id);
                            const on = visiveis.has(id);
                            return (
                                <span key={id} draggable
                                    onDragStart={() => { dragId.current = id; }}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={() => soltarColuna(id)}
                                    onClick={() => toggleCol(id)}
                                    className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer select-none border ${on ? 'bg-mint border-primary text-primaryDark' : 'bg-white border-gray-300 text-gray-500'}`}>
                                    {c.label}
                                </span>
                            );
                        })}
                    </div>
                </div>

                {erro && <div className="bg-red-100 text-red-700 rounded-xl p-4 text-sm font-medium">{erro}</div>}
                {resumo?.truncado && (
                    <div className="bg-amber-100 text-amber-700 rounded-xl p-3 text-xs font-medium">
                        O período pedido tem mais linhas do que o relatório mostra de uma vez — aperte o período para ver tudo.
                    </div>
                )}

                {/* Resultado — desktop */}
                <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-600">
                            {tituloRelatorio} — {linhasOrdenadas.length} linhas
                        </span>
                        {loading && <span className="text-xs text-gray-400">carregando…</span>}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    {colunasAtivas.map((c) => (
                                        <th key={c.id} onClick={() => clicarSort(c.id)}
                                            className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer whitespace-nowrap ${c.tipo === 'num' ? 'text-right' : 'text-left'}`}>
                                            <span className="inline-flex items-center gap-1">
                                                {c.label}
                                                {sort.col === c.id && (sort.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                                            </span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                {linhasOrdenadas.map((l) => (
                                    <tr key={l.id} className="hover:bg-gray-50">
                                        {colunasAtivas.map((c) => (
                                            <td key={c.id} className={`px-4 py-2.5 text-gray-900 align-top ${c.tipo === 'num' ? 'text-right' : ''}`}>
                                                {celula(l, c)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                                {!loading && linhasOrdenadas.length === 0 && (
                                    <tr><td colSpan={colunasAtivas.length} className="px-4 py-10 text-center text-gray-400 text-sm">Nada encontrado com esses filtros.</td></tr>
                                )}
                            </tbody>
                            {linhasOrdenadas.length > 0 && (
                                <tfoot>
                                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                                        {colunasAtivas.map((c, i) => (
                                            <td key={c.id} className={`px-4 py-3 font-bold text-sm ${c.tipo === 'num' ? 'text-right' : ''}`}>
                                                {i === 0 ? 'Total' :
                                                    c.id === 'valor' ? fmtVal(resumo?.valorTotal) :
                                                    c.id === 'recebido' ? fmtVal(resumo?.recebidoTotal) :
                                                    c.id === 'desconto' ? fmtVal(linhasOrdenadas.reduce((s, l) => s + (l.desconto || 0), 0)) : ''}
                                            </td>
                                        ))}
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>

                {/* Resultado — mobile (cards) */}
                <div className="md:hidden space-y-3">
                    {linhasOrdenadas.map((l) => {
                        const b = DOC_BADGE[l.documento?.tipo] || DOC_BADGE.SEM_NF;
                        return (
                            <div key={l.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-semibold text-gray-900 truncate">{l.clienteNome}</span>
                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[l.status] || 'bg-gray-100 text-gray-700'}`}>{l.status}</span>
                                </div>
                                <div className="text-xs text-gray-500 mb-2">
                                    {valorColuna(l, 'pedido')} · criada {fmtData(l.criacao)} · venc. {fmtData(l.vencimento)}
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${b.cls}`}>{b.label}{l.documento?.numero ? ` ${l.documento.numero}` : ''}</span>
                                    <span className="font-bold">{fmtVal(l.valor)}</span>
                                </div>
                                {(l.forma || l.bancoNome) && (
                                    <div className="text-xs text-gray-500 mt-2">
                                        {l.forma || '—'}{l.bancoNome ? ` · ${l.bancoNome}` : ''}{l.dataBaixa ? ` · baixa ${fmtData(l.dataBaixa)}` : ''}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {!loading && linhasOrdenadas.length === 0 && (
                        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">Nada encontrado com esses filtros.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
