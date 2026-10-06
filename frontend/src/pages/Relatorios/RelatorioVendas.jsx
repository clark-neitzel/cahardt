import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { BarChart2, Download, Printer, ChevronUp, ChevronDown, ChevronsUpDown, X, ListFilter, Search, RefreshCw, SlidersHorizontal } from 'lucide-react';
import toast from 'react-hot-toast';
import SelectBusca from '../../components/SelectBusca';
import MultiSelect from '../../components/MultiSelect';
import FiltroPeriodo, { usePeriodoSalvo } from '../../components/FiltroPeriodo';
import PageHeader from '../../components/PageHeader';
import EstadoVazio from '../../components/EstadoVazio';
import { opcoesVendedorFiltro } from '../../utils/vendedoresFiltro';
import { useFiltrosSalvos, useFiltroSalvo } from '../../hooks/useFiltrosSalvos';

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = (v) => v ? new Date(v + 'T12:00:00').toLocaleDateString('pt-BR') : '-';
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FILTROS_PADRAO = {
    vendedorId: '', situacaoCA: 'FATURADO', excluirBonificacao: 'true',
    cidade: [], condicao: [], categoria: [], tipo: [],
};
const TIPOS_PADRAO = ['Normal', 'Especial', 'Bonificação'];

const COLUNAS = [
    { id: 'criacao',  label: 'Criação',   field: 'dataCriacao',           tipo: 'data',   filtravel: false },
    { id: 'data',     label: 'Dt Venda',  field: 'dataVenda',             tipo: 'data',   filtravel: false },
    { id: 'cliente',   label: 'Cliente',   field: 'clienteNome',           tipo: 'texto',  filtravel: true  },
    { id: 'produto',   label: 'Produto',   field: 'produto',               tipo: 'texto',  filtravel: true  },
    { id: 'quantidade',label: 'Qtd',       field: 'quantidade',            tipo: 'numero', filtravel: false, align: 'right' },
    { id: 'valorUnit', label: 'Vl Unit',   field: 'valorUnit',             tipo: 'numero', filtravel: false, align: 'right' },
    { id: 'valor',     label: 'Valor',     field: 'valorTotal',            tipo: 'numero', filtravel: false, align: 'right' },
    { id: 'precoCusto',label: 'Vl Custo',  field: 'precoCusto',            tipo: 'numero', filtravel: false, align: 'right' },
    { id: 'custoTotal',label: 'Custo Total',field: 'custoTotal',           tipo: 'numero', filtravel: false, align: 'right' },
    { id: 'condicao', label: 'Condição',  field: 'nomeCondicaoPagamento', tipo: 'texto',  filtravel: true  },
    { id: 'categoria',label: 'Categoria', field: 'categoriaComercial',    tipo: 'texto',  filtravel: true  },
    { id: 'tipo',     label: 'Tipo',      field: 'tipo',                  tipo: 'texto',  filtravel: true  },
    { id: 'cidade',   label: 'Cidade',    field: 'cidade',                tipo: 'texto',  filtravel: true  },
    { id: 'bairro',   label: 'Bairro',    field: 'bairro',                tipo: 'texto',  filtravel: true  },
    { id: 'vendedor', label: 'Vendedor',  field: 'vendedorNome',          tipo: 'texto',  filtravel: true  },
    { id: 'vendedorTel', label: 'Tel Vendedor', field: 'vendedorTelefone', tipo: 'texto', filtravel: false },
    { id: 'indicacao',label: 'Indicação', field: 'indicacao',             tipo: 'texto',  filtravel: true  },
];

const TIPO_BADGE = {
    'Normal':      'bg-gray-100 text-gray-700',
    'Especial':    'bg-purple-100 text-purple-700',
    'Bonificação': 'bg-amber-100 text-amber-700',
};

const SortIcon = ({ col, sortCol, sortDir }) => {
    if (sortCol !== col.id) return <ChevronsUpDown className="h-3 w-3 text-gray-400 flex-shrink-0" />;
    return sortDir === 'asc'
        ? <ChevronUp className="h-3 w-3 text-primary flex-shrink-0" />
        : <ChevronDown className="h-3 w-3 text-primary flex-shrink-0" />;
};

// Dropdown de filtro por coluna (estilo Excel)
// Usa estado local pendente — só aplica o filtro ao clicar OK (evita salto de layout durante seleção)
function FilterDropdown({ col, allData, selecao, onChange, onClose, pos }) {
    const ref = useRef();
    const [busca, setBusca] = useState('');

    const todosValores = useMemo(() => {
        const map = new Map();
        allData.forEach(r => {
            const v = String(r[col.field] ?? '');
            const key = v.toLowerCase();
            if (!map.has(key)) map.set(key, v);
        });
        return [...map.values()].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    }, [allData, col.field]);

    // Estado local — não afeta a tabela até clicar OK
    const [pendente, setPendente] = useState(() =>
        selecao ? new Set(selecao) : new Set(todosValores.map(v => v.toLowerCase()))
    );

    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) {
                // Fechar sem aplicar (clique fora = cancela)
                onClose();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    const valoresFiltrados = busca.trim()
        ? todosValores.filter(v => v.toLowerCase().includes(busca.toLowerCase()))
        : todosValores;

    const todosMarcados = pendente.size >= todosValores.length;

    const toggle = (val) => {
        const next = new Set(pendente);
        const key = val.toLowerCase();
        next.has(key) ? next.delete(key) : next.add(key);
        setPendente(next);
    };

    const toggleTodos = () => {
        setPendente(todosMarcados
            ? new Set()
            : new Set(todosValores.map(v => v.toLowerCase()))
        );
    };

    const aplicar = () => {
        onChange(col.id, pendente.size >= todosValores.length ? undefined : pendente);
        onClose();
    };

    const limpar = () => {
        onChange(col.id, undefined);
        onClose();
    };

    return (
        <div ref={ref}
            className="fixed z-[100] bg-white border border-gray-200 rounded-xl shadow-2xl w-64 normal-case tracking-normal font-normal"
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0 }}
            onClick={e => e.stopPropagation()}>

            {/* Busca */}
            <div className="p-2 border-b">
                <div className="relative">
                    <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-gray-500" />
                    <input
                        autoFocus
                        type="text"
                        value={busca}
                        onChange={e => setBusca(e.target.value)}
                        placeholder="Buscar..."
                        className="w-full pl-7 pr-2 py-1.5 text-xs border rounded-md bg-gray-50 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>
            </div>

            {/* Selecionar todos */}
            <div className="px-3 py-1.5 border-b bg-gray-50 flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={todosMarcados}
                        onChange={toggleTodos}
                        className="rounded text-primary"
                    />
                    <span className="text-xs font-medium text-gray-600">Selecionar todos</span>
                </label>
                <span className="text-[10px] text-gray-500">{pendente.size}/{todosValores.length}</span>
            </div>

            {/* Lista de valores */}
            <div className="max-h-56 overflow-y-auto py-1">
                {valoresFiltrados.length === 0 && (
                    <p className="text-xs text-gray-500 text-center py-4">Nenhum resultado</p>
                )}
                {valoresFiltrados.map(val => (
                    <label key={val} className="flex items-center gap-2 px-3 py-1.5 hover:bg-mint/40 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={pendente.has(val.toLowerCase())}
                            onChange={() => toggle(val)}
                            className="rounded text-primary flex-shrink-0"
                        />
                        <span className="text-xs text-gray-700 truncate">{val || '(vazio)'}</span>
                    </label>
                ))}
            </div>

            {/* Rodapé */}
            <div className="p-2 border-t bg-gray-50 flex justify-between">
                <button
                    onClick={limpar}
                    className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">
                    Limpar
                </button>
                <button
                    onClick={aplicar}
                    className="text-xs bg-primary text-white px-3 py-1 rounded-full hover:bg-primaryDark font-medium">
                    OK
                </button>
            </div>
        </div>
    );
}

// Estilos da folha impressa (escopados em #area-impressao)
const PRINT_CSS = `
@page { size: A4 landscape; margin: 6mm 5mm 5mm 5mm; }
#area-impressao, #area-impressao * { font-family: 'Courier New', Courier, monospace !important; color:#000; box-sizing:border-box; }
#area-impressao table { width: 100%; table-layout: auto; border-collapse: collapse; margin-top: 6px; }
#area-impressao th, #area-impressao td { border: 1px solid #000; padding: 2px 3px; text-align: left; font-size: 7px; line-height: 1.15; white-space: nowrap; }
#area-impressao td.txt { white-space: normal; overflow-wrap: break-word; word-break: normal; }
#area-impressao th { background-color: #f3f4f6; font-weight: bold; }
#area-impressao td.num { text-align: right; }
#area-impressao h1 { font-size: 14px; font-weight: bold; margin: 0 0 2px; text-transform: uppercase; }
#area-impressao .sub { font-size: 9px; color: #444; margin-bottom: 6px; }
#area-impressao tfoot td { font-weight: bold; background-color: #f3f4f6; }
`;

// Imprime NA PRÓPRIA PÁGINA (padrão do CLAUDE.md — nunca window.open nem iframe: iPad sai em branco)
function imprimirConteudo(estilos, corpoHtml, larguraMm = 186) {
    const MODO = 'modo-impressao';
    document.getElementById('area-impressao')?.remove();
    document.getElementById('estilo-impressao')?.remove();
    document.documentElement.classList.remove(MODO);
    const style = document.createElement('style');
    style.id = 'estilo-impressao';
    const estilosSemPage = (estilos || '').replace(/@page\s*{[^}]*}/g, '');
    const regraPage = ((estilos || '').match(/@page\s*{[^}]*}/) || ['@page { size: A4 portrait; margin: 12mm; }'])[0];
    style.textContent = `
        ${regraPage}
        html.${MODO}, html.${MODO} body {
            margin:0!important; padding:0!important; background:#fff!important;
            width:auto!important; min-width:0!important; max-width:none!important;
            height:auto!important; min-height:0!important; overflow:visible!important;
        }
        html.${MODO} body > *:not(#area-impressao) { display:none!important; }
        html.${MODO} #area-impressao { display:block; width:${larguraMm}mm; max-width:100%; margin:0 auto; }
        ${estilosSemPage}
        @media print {
            html.${MODO} body > *:not(#area-impressao) { display:none!important; visibility:hidden!important; }
            html.${MODO} #area-impressao, html.${MODO} #area-impressao * { visibility:visible!important; }
            #area-impressao * { -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
        }`;
    document.head.appendChild(style);
    const area = document.createElement('div');
    area.id = 'area-impressao';
    area.innerHTML = corpoHtml;
    document.body.appendChild(area);
    document.documentElement.classList.add(MODO);
    let momentoPrint = 0, timerFallback = 0;
    const limpar = () => {
        area.remove(); style.remove(); document.documentElement.classList.remove(MODO);
        window.removeEventListener('afterprint', limpar);
        window.removeEventListener('focus', aoVoltar);
        window.removeEventListener('pointerdown', aoVoltar);
        document.removeEventListener('visibilitychange', aoVoltar);
        clearTimeout(timerFallback);
    };
    const aoVoltar = () => { if (momentoPrint && Date.now() - momentoPrint > 1200) limpar(); };
    window.addEventListener('afterprint', limpar);
    window.addEventListener('focus', aoVoltar);
    window.addEventListener('pointerdown', aoVoltar);
    document.addEventListener('visibilitychange', aoVoltar);
    timerFallback = setTimeout(limpar, 60000);
    void area.offsetHeight;
    momentoPrint = Date.now();
    try { window.print(); } catch { limpar(); }
}


export default function RelatorioVendas() {
    const { user } = useAuth();

    const [pedidos, setPedidos] = useState([]);
    const [resumo, setResumo] = useState({});
    const [loading, setLoading] = useState(false);
    const [gerado, setGerado] = useState(false);
    const [vendedores, setVendedores] = useState([]);
    const [opcoesServ, setOpcoesServ] = useState({ cidades: [], condicoes: [], categorias: [], tipos: [] });
    const [showFiltros, setShowFiltros] = useFiltroSalvo('relatorio-vendas:painelAberto', true);

    // Filtros persistidos por usuário (objeto) + dois períodos (preset persistido, datas recalculadas)
    const [filtros, setFiltros] = useFiltrosSalvos('relatorio-vendas', FILTROS_PADRAO);
    const [periodoVenda, periodoVendaCtl] = usePeriodoSalvo('relatorio-vendas-venda', 'todo');
    const [periodoCriacao, periodoCriacaoCtl] = usePeriodoSalvo('relatorio-vendas-criacao', 'mes');
    const setF = (campo, valor) => setFiltros(prev => ({ ...prev, [campo]: valor }));
    const lista = (campo) => (Array.isArray(filtros[campo]) ? filtros[campo] : []);

    const [sortCol, setSortCol] = useFiltroSalvo('relatorio-vendas:sortCol', 'dataVenda');
    const [sortDir, setSortDir] = useFiltroSalvo('relatorio-vendas:sortDir', 'desc');
    const [colsVisiveis, setColsVisiveis] = useState(() => new Set(COLUNAS.map(c => c.id)));
    const [colOrdem, setColOrdem] = useState(() => COLUNAS.map(c => c.id));
    // Filtros de coluna (Sets) — persistidos como objeto de arrays via hook
    const [filtrosAtivosSalvos, setFiltrosAtivosSalvos] = useFiltroSalvo('relatorio-vendas:filtrosAtivos', {});
    const [filtrosAtivos, setFiltrosAtivos] = useState(() => {
        const out = {};
        if (filtrosAtivosSalvos && typeof filtrosAtivosSalvos === 'object') {
            for (const [k, arr] of Object.entries(filtrosAtivosSalvos)) {
                if (Array.isArray(arr) && arr.length) out[k] = new Set(arr);
            }
        }
        return out;
    });
    const [dropdownAberto, setDropdownAberto] = useState(null); // { colId, top, left }
    const dragColRef = useRef(null);
    const reqRef = useRef(0);
    const [limiteCards, setLimiteCards] = useState(100);
    const [erroCarga, setErroCarga] = useState(false);

    const podeVerTodos = user?.permissoes?.admin || user?.permissoes?.pedidos?.clientes === 'todos';

    useEffect(() => {
        if (podeVerTodos) api.get('/vendedores').then(r => setVendedores(r.data || [])).catch(() => {});
    }, [podeVerTodos]);

    // Opções dos menus (cidade/condição/categoria/tipo) — se falhar, menus ficam vazios sem quebrar a tela
    useEffect(() => {
        api.get('/pedidos/relatorio-vendas/opcoes')
            .then(r => setOpcoesServ({
                cidades: r.data?.cidades || [], condicoes: r.data?.condicoes || [],
                categorias: r.data?.categorias || [], tipos: r.data?.tipos || [],
            }))
            .catch(() => {});
    }, []);

    useEffect(() => {
        const fa = {};
        for (const [k, set] of Object.entries(filtrosAtivos)) {
            if (set && set.size) fa[k] = [...set];
        }
        setFiltrosAtivosSalvos(fa);
    }, [filtrosAtivos]);

    // Fecha o menu de filtro de coluna ao rolar/redimensionar (ele é posicionado em tela)
    useEffect(() => {
        if (!dropdownAberto) return undefined;
        const fechar = () => setDropdownAberto(null);
        window.addEventListener('resize', fechar);
        window.addEventListener('scroll', fechar, true);
        return () => { window.removeEventListener('resize', fechar); window.removeEventListener('scroll', fechar, true); };
    }, [dropdownAberto]);

    const chaveParams = JSON.stringify([
        periodoVenda.de, periodoVenda.ate, periodoCriacao.de, periodoCriacao.ate,
        filtros.vendedorId, filtros.situacaoCA, filtros.excluirBonificacao,
        lista('cidade'), lista('condicao'), lista('categoria'), lista('tipo'),
    ]);

    const fetchRelatorio = useCallback(async () => {
        const meu = ++reqRef.current;
        try {
            setLoading(true);
            const params = {};
            if (periodoVenda.de)    params.dataVendaDe    = periodoVenda.de;
            if (periodoVenda.ate)   params.dataVendaAte   = periodoVenda.ate;
            if (periodoCriacao.de)  params.dataCriacaoDe  = periodoCriacao.de;
            if (periodoCriacao.ate) params.dataCriacaoAte = periodoCriacao.ate;
            if (filtros.vendedorId) params.vendedorId = filtros.vendedorId;
            if (filtros.situacaoCA) params.situacaoCA = filtros.situacaoCA;
            if (filtros.excluirBonificacao) params.excluirBonificacao = filtros.excluirBonificacao;
            ['cidade', 'condicao', 'categoria', 'tipo'].forEach(c => {
                const l = lista(c);
                if (l.length) params[c] = l.join(',');
            });
            const { data } = await api.get('/pedidos/relatorio-vendas', { params });
            if (meu !== reqRef.current) return; // chegou resposta mais nova
            setPedidos(data.pedidos || []);
            setResumo(data.resumo || {});
            setGerado(true);
            setErroCarga(false);
        } catch {
            if (meu === reqRef.current) {
                setPedidos([]); setResumo({}); setErroCarga(true);
                toast.error('Erro ao gerar relatório de vendas.');
            }
        } finally {
            if (meu === reqRef.current) setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chaveParams]);

    // Gera sozinho ao abrir e a cada mudança de filtro (com pequena espera p/ não disparar a cada clique)
    useEffect(() => {
        reqRef.current += 1; // filtro mudou: respostas em voo ficam obsoletas já
        const t = setTimeout(fetchRelatorio, 350);
        return () => clearTimeout(t);
    }, [fetchRelatorio]);

    const limpar = () => {
        setFiltros(FILTROS_PADRAO);
        periodoVendaCtl.limpar();
        periodoCriacaoCtl.limpar();
        setFiltrosAtivos({});
    };

    const handleSort = (col, e) => {
        e.stopPropagation();
        if (sortCol === col.id) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortCol(col.id); setSortDir('asc'); }
    };

    const handleFiltroChange = (colId, novaSelecao) => {
        setFiltrosAtivos(prev => {
            const next = { ...prev };
            if (novaSelecao === undefined || novaSelecao === null) delete next[colId];
            else next[colId] = novaSelecao;
            return next;
        });
    };

    const toggleCol = (colId) => {
        setColsVisiveis(prev => {
            const next = new Set(prev);
            next.has(colId) ? next.delete(colId) : next.add(colId);
            return next;
        });
    };

    const abrirFiltroColuna = (colId, e) => {
        e.stopPropagation();
        if (dropdownAberto?.colId === colId) { setDropdownAberto(null); return; }
        const r = e.currentTarget.getBoundingClientRect();
        setDropdownAberto({ colId, top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 272)) });
    };

    // Opções dos menus: as do servidor; se vierem vazias, cai para o que existe nos dados carregados
    const derivar = useCallback((field) => [...new Set(pedidos.map(r => String(r[field] ?? '')).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })), [pedidos]);
    const opcCidade = useMemo(() => (opcoesServ.cidades.length ? opcoesServ.cidades : derivar('cidade')), [opcoesServ, derivar]);
    const opcCondicao = useMemo(() => (opcoesServ.condicoes.length ? opcoesServ.condicoes : derivar('nomeCondicaoPagamento')), [opcoesServ, derivar]);
    const opcCategoria = useMemo(() => (opcoesServ.categorias.length ? opcoesServ.categorias : derivar('categoriaComercial')), [opcoesServ, derivar]);
    const opcTipo = opcoesServ.tipos.length ? opcoesServ.tipos : TIPOS_PADRAO;

    const dadosFiltrados = useMemo(() => {
        let result = [...pedidos];
        for (const [colId, selecao] of Object.entries(filtrosAtivos)) {
            if (!selecao) continue;
            const col = COLUNAS.find(c => c.id === colId);
            if (!col) continue;
            result = result.filter(row => selecao.has(String(row[col.field] ?? '').toLowerCase()));
        }
        return result;
    }, [pedidos, filtrosAtivos]);

    // Colunas na ordem definida pelo usuário, apenas as visíveis
    const colsAtivas = colOrdem.map(id => COLUNAS.find(c => c.id === id)).filter(c => c && colsVisiveis.has(c.id));
    const todasDimensoesVisiveis = COLUNAS.filter(c => c.tipo !== 'numero').every(c => colsVisiveis.has(c.id));

    const dadosAgrupados = useMemo(() => {
        const dimCols = colsAtivas.filter(c => c.tipo !== 'numero');
        const ordenar = (arr) => {
            const col = COLUNAS.find(c => c.id === sortCol);
            if (!col || !colsVisiveis.has(col.id)) return arr;
            arr.sort((a, b) => {
                let va = a[col.field] ?? '', vb = b[col.field] ?? '';
                if (col.tipo === 'numero') {
                    // nulos (sem valor/custo) sempre no fim, em asc e desc
                    const na = a[col.field] == null, nb = b[col.field] == null;
                    if (na || nb) return na && nb ? 0 : na ? 1 : -1;
                    va = Number(va); vb = Number(vb);
                }
                else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
                if (va < vb) return sortDir === 'asc' ? -1 : 1;
                if (va > vb) return sortDir === 'asc' ? 1 : -1;
                return 0;
            });
            return arr;
        };
        if (todasDimensoesVisiveis) {
            // Vl Unit é cálculo: valor vendido ÷ quantidade (quantidade 0 → "-")
            return ordenar(dadosFiltrados.map(r => {
                const q = Number(r.quantidade || 0), v = Number(r.valorTotal || 0);
                return { ...r, valorUnit: q > 0 ? v / q : null, _count: 1, _key: r.id };
            }));
        }
        // Agrupa por chave das colunas dimensão visíveis
        const map = new Map();
        dadosFiltrados.forEach(row => {
            const key = dimCols.map(c => String(row[c.field] ?? '')).join('\x00');
            if (!map.has(key)) {
                const g = { _key: key, _count: 0, valorTotal: 0, quantidade: 0, valorUnit: null, custoTotal: 0, precoCusto: null, _temCusto: false };
                dimCols.forEach(c => { g[c.field] = row[c.field]; });
                map.set(key, g);
            }
            const g = map.get(key);
            g.valorTotal += Number(row.valorTotal || 0);
            g.quantidade += Number(row.quantidade || 0);
            if (row.custoTotal != null) { g.custoTotal += Number(row.custoTotal); g._temCusto = true; }
            g._count += 1;
        });
        const result = [...map.values()];
        // Custo unitário do grupo = custo total / quantidade. Sem custo no grupo → "-".
        result.forEach(g => {
            // Vl Unit do grupo = média ponderada = total vendido ÷ quantidade
            g.valorUnit = g.quantidade > 0 ? g.valorTotal / g.quantidade : null;
            if (!g._temCusto) { g.custoTotal = null; g.precoCusto = null; }
            else g.precoCusto = g.quantidade > 0 ? g.custoTotal / g.quantidade : null;
        });
        return ordenar(result);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dadosFiltrados, colsOrdemChave(colOrdem, colsVisiveis), todasDimensoesVisiveis, sortCol, sortDir]);

    const totalFiltrado = useMemo(
        () => dadosFiltrados.reduce((s, r) => s + Number(r.valorTotal || 0), 0),
        [dadosFiltrados]
    );
    const custoTotalGeral = useMemo(
        () => dadosAgrupados.reduce((s, r) => s + Number(r.custoTotal || 0), 0),
        [dadosAgrupados]
    );

    // Totais do rodapé: Vl Unit = vendido ÷ qtd; Vl Custo = custo total ÷ qtd das linhas que têm custo
    const totaisRodape = useMemo(() => {
        let qtd = 0, qtdComCusto = 0, custo = 0;
        dadosFiltrados.forEach(r => {
            const q = Number(r.quantidade || 0);
            qtd += q;
            if (r.custoTotal != null) { custo += Number(r.custoTotal); qtdComCusto += q; }
        });
        return {
            qtd,
            valorUnit: qtd > 0 ? totalFiltrado / qtd : null,
            precoCusto: qtdComCusto > 0 ? custo / qtdComCusto : null,
        };
    }, [dadosFiltrados, totalFiltrado]);

    // Chips de coluna (filtros estilo Excel)
    const chipsColuna = useMemo(() => Object.entries(filtrosAtivos)
        .filter(([, sel]) => sel && sel.size > 0)
        .map(([colId, sel]) => {
            const col = COLUNAS.find(c => c.id === colId);
            const total = new Set(pedidos.map(r => String(r[col?.field] ?? '').toLowerCase())).size;
            return { colId, label: col?.label || colId, qtd: sel.size, total };
        }), [filtrosAtivos, pedidos]);

    // Chips dos filtros do painel
    const chipsPainel = [];
    if (periodoVenda.preset !== 'todo' && !periodoVenda.padrao) chipsPainel.push({ id: 'pv', texto: `Venda: ${periodoVenda.de ? `${fmtData(periodoVenda.de)} a ${fmtData(periodoVenda.ate)}` : 'todo o período'}`, remover: () => periodoVendaCtl.limpar() });
    if (!periodoCriacao.padrao) chipsPainel.push({ id: 'pc', texto: `Criação: ${periodoCriacao.de ? `${fmtData(periodoCriacao.de)} a ${fmtData(periodoCriacao.ate)}` : 'todo o período'}`, remover: () => periodoCriacaoCtl.limpar() });
    if (filtros.vendedorId) {
        const v = vendedores.find(x => String(x.id) === String(filtros.vendedorId));
        chipsPainel.push({ id: 'vend', texto: `Vendedor: ${v?.nome || filtros.vendedorId}`, remover: () => setF('vendedorId', '') });
    }
    if (filtros.situacaoCA !== FILTROS_PADRAO.situacaoCA) chipsPainel.push({ id: 'sit', texto: `Situação: ${filtros.situacaoCA || 'Todas'}`, remover: () => setF('situacaoCA', FILTROS_PADRAO.situacaoCA) });
    if (filtros.excluirBonificacao !== FILTROS_PADRAO.excluirBonificacao) chipsPainel.push({ id: 'bon', texto: 'Incluindo bonificações', remover: () => setF('excluirBonificacao', 'true') });
    [['cidade', 'Cidade'], ['condicao', 'Condição'], ['categoria', 'Categoria'], ['tipo', 'Tipo']].forEach(([campo, rotulo]) => {
        const l = lista(campo);
        if (l.length) chipsPainel.push({ id: campo, texto: `${rotulo}: ${l.length <= 2 ? l.join(', ') : `${l.length} selecionados`}`, remover: () => setF(campo, []) });
    });
    const nFiltros = chipsPainel.length + chipsColuna.length;

    const exportarCSV = () => {
        if (!dadosAgrupados.length) { toast.error('Nenhum dado para exportar.'); return; }
        const headers = colsAtivas.map(c => c.label);
        const rows = dadosAgrupados.map(r => colsAtivas.map(c => {
            const v = r[c.field];
            if (c.tipo === 'numero') return v == null || v === '' ? '' : Number(v).toFixed(2).replace('.', ',');
            if (c.tipo === 'data') return fmtData(v);
            return `"${String(v ?? '').replace(/"/g, '""')}"`;
        }));
        const csv = '﻿' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'relatorio-vendas.csv'; a.click();
        URL.revokeObjectURL(url);
        toast.success('CSV exportado!');
    };

    // Impressão: monta a folha na própria página (síncrono no clique)
    const imprimir = () => {
        if (!dadosAgrupados.length) { toast.error('Nenhum dado para imprimir.'); return; }
        const celula = (col, val, row) => {
            if (col.id === 'data' || col.id === 'criacao') return fmtData(val);
            if (col.id === 'valor') return `R$ ${fmt(val)}${row._count > 1 ? ` (${row._count})` : ''}`;
            if (col.id === 'quantidade') return Number(val || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
            if (['valorUnit', 'precoCusto', 'custoTotal'].includes(col.id)) return val != null ? `R$ ${fmt(val)}` : '-';
            return val || '-';
        };
        const sub = [
            periodoVenda.de && `Venda: ${fmtData(periodoVenda.de)} a ${fmtData(periodoVenda.ate || periodoVenda.de)}`,
            periodoCriacao.de && `Criação: ${fmtData(periodoCriacao.de)} a ${fmtData(periodoCriacao.ate || periodoCriacao.de)}`,
            filtros.situacaoCA && `Situação: ${filtros.situacaoCA}`,
            ...chipsPainel.filter(c => ['cidade', 'condicao', 'categoria', 'tipo', 'vend'].includes(c.id)).map(c => c.texto),
            chipsColuna.length && `Filtros: ${chipsColuna.map(c => `${c.label} (${c.qtd}/${c.total})`).join(', ')}`,
            `Total: ${dadosFiltrados.length} itens · ${dadosAgrupados.length} linhas · R$ ${fmt(totalFiltrado)}`,
        ].filter(Boolean).join(' | ');
        const thead = `<tr>${colsAtivas.map(c => `<th style="text-align:${c.align || 'left'}">${esc(c.label)}</th>`).join('')}</tr>`;
        const tbody = dadosAgrupados.map(row => `<tr>${colsAtivas.map(col =>
            `<td class="${col.align === 'right' ? 'num' : ''}${['cliente', 'produto', 'vendedor', 'indicacao', 'bairro'].includes(col.id) ? ' txt' : ''}">${esc(celula(col, row[col.field], row))}</td>`).join('')}</tr>`).join('');
        const tfoot = `<tr>${colsAtivas.map((col, i) => `<td class="${col.align === 'right' ? 'num' : ''}">${
            i === 0 ? `${dadosAgrupados.length} linhas` : ''}${col.id === 'valor' ? `R$ ${fmt(totalFiltrado)}` : ''}${col.id === 'custoTotal' ? `R$ ${fmt(custoTotalGeral)}` : ''}${col.id === 'quantidade' ? totaisRodape.qtd.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : ''}${col.id === 'valorUnit' && totaisRodape.valorUnit != null ? `R$ ${fmt(totaisRodape.valorUnit)}` : ''}${col.id === 'precoCusto' && totaisRodape.precoCusto != null ? `R$ ${fmt(totaisRodape.precoCusto)}` : ''}</td>`).join('')}</tr>`;
        imprimirConteudo(PRINT_CSS, `<h1>RELATÓRIO DE VENDAS</h1><div class="sub">${esc(sub)}</div><table><thead>${thead}</thead><tbody>${tbody}</tbody><tfoot>${tfoot}</tfoot></table>`, 287); // A4 paisagem: 297mm - 2×5mm de margem
    };

    const handleDragStart = (colId) => { dragColRef.current = colId; };
    const handleDragOver = (e, colId) => {
        e.preventDefault();
        if (!dragColRef.current || dragColRef.current === colId) return;
        setColOrdem(prev => {
            const next = [...prev];
            const from = next.indexOf(dragColRef.current);
            const to = next.indexOf(colId);
            if (from < 0 || to < 0) return prev;
            next.splice(from, 1);
            next.splice(to, 0, dragColRef.current);
            return next;
        });
    };
    const handleDragEnd = () => { dragColRef.current = null; };

    useEffect(() => { setLimiteCards(100); }, [pedidos, filtrosAtivos, colsAtivas.length]);

    const temDados = pedidos.length > 0;
    const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-1';
    const btnSec = 'inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] md:min-h-[40px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm disabled:opacity-50';

    // Valor de uma célula no card mobile
    const textoCelula = (col, row) => {
        const val = row[col.field];
        if (col.id === 'data' || col.id === 'criacao') return fmtData(val);
        if (col.id === 'quantidade') return Number(val || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
        if (col.tipo === 'numero') return val != null ? `R$ ${fmt(val)}` : '-';
        return val || '-';
    };

    return (
        <div className="max-w-full overflow-x-hidden">
            <PageHeader
                icon={BarChart2}
                cor="blue"
                titulo="Relatório de Vendas"
                subtitulo="Itens vendidos, linha por linha"
                acoes={<>
                    {temDados && (
                        <>
                            <button type="button" onClick={imprimir} className={btnSec}><Printer className="h-4 w-4" /> <span className="hidden sm:inline">Imprimir</span></button>
                            <button type="button" onClick={exportarCSV} className={btnSec}><Download className="h-4 w-4" /> <span className="hidden sm:inline">CSV</span></button>
                        </>
                    )}
                    <button type="button" onClick={fetchRelatorio} disabled={loading}
                        className="inline-flex items-center justify-center gap-1.5 px-5 min-h-[44px] md:min-h-[40px] bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50">
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Gerando...' : 'Gerar'}
                    </button>
                </>}
            />

            <div className="px-3 md:px-6 pb-6 space-y-3">
                {/* Barra de filtros */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between gap-2 px-3 md:px-4 py-2.5 border-b border-gray-100">
                        <button type="button" onClick={() => setShowFiltros(!showFiltros)}
                            className="flex items-center gap-2 min-h-[44px] md:min-h-[36px] text-xs font-bold uppercase tracking-widest text-gray-600">
                            <SlidersHorizontal className="h-4 w-4 text-primary" /> Filtros
                            <ChevronDown className={`h-4 w-4 transition-transform ${showFiltros ? 'rotate-180' : ''}`} />
                        </button>
                        <div className="flex items-center gap-2">
                            {nFiltros > 0 && (
                                <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-mint text-primaryDark">
                                    {nFiltros} {nFiltros === 1 ? 'filtro ativo' : 'filtros ativos'}
                                </span>
                            )}
                            {nFiltros > 0 && (
                                <button type="button" onClick={limpar}
                                    className="px-3 min-h-[44px] md:min-h-[36px] text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full">
                                    Limpar
                                </button>
                            )}
                        </div>
                    </div>

                    {showFiltros && (
                        <div className="p-3 md:p-4 space-y-3">
                            <div className="flex flex-col md:flex-row md:flex-wrap gap-2 md:gap-3">
                                <FiltroPeriodo periodo={periodoVenda} controle={periodoVendaCtl} rotulo="Venda" className="w-full md:w-auto max-md:!h-[46px] max-md:[&_button]:min-w-[44px]" />
                                <FiltroPeriodo periodo={periodoCriacao} controle={periodoCriacaoCtl} rotulo="Criação" className="w-full md:w-auto max-md:!h-[46px] max-md:[&_button]:min-w-[44px]" />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 max-md:[&_.flex-wrap]:min-h-[44px] max-md:[&_.flex-wrap_button]:min-w-[44px] max-md:[&_.flex-wrap_button]:min-h-[44px] max-md:[&_.flex-wrap_button]:inline-flex max-md:[&_.flex-wrap_button]:items-center max-md:[&_.flex-wrap_button]:justify-center max-md:[&_.flex-wrap_button]:-my-3 max-md:[&_.flex-wrap_button]:-mr-2">
                                <div>
                                    <label className={labelCls}>Cidade</label>
                                    <MultiSelect options={opcCidade} selected={lista('cidade')} onChange={v => setF('cidade', v)}
                                        placeholder="Todas" summary searchable summaryNoun="cidade" />
                                </div>
                                <div>
                                    <label className={labelCls}>Condição de pagamento</label>
                                    <MultiSelect options={opcCondicao} selected={lista('condicao')} onChange={v => setF('condicao', v)}
                                        placeholder="Todas" summary searchable summaryNoun="condição" />
                                </div>
                                <div>
                                    <label className={labelCls}>Categoria comercial</label>
                                    <MultiSelect options={opcCategoria} selected={lista('categoria')} onChange={v => setF('categoria', v)}
                                        placeholder="Todas" summary searchable summaryNoun="categoria" />
                                </div>
                                <div>
                                    <label className={labelCls}>Tipo de pedido</label>
                                    <MultiSelect options={opcTipo} selected={lista('tipo')} onChange={v => setF('tipo', v)}
                                        placeholder="Todos" summary summaryNoun="tipo" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {podeVerTodos && (
                                    <div>
                                        <label className={labelCls}>Vendedor</label>
                                        <SelectBusca value={filtros.vendedorId} onChange={e => setF('vendedorId', e.target.value)} className="w-full max-md:h-[44px]">
                                            <option value="">Todos</option>
                                            {opcoesVendedorFiltro(vendedores)}
                                        </SelectBusca>
                                    </div>
                                )}
                                <div>
                                    <label className={labelCls}>Situação</label>
                                    <SelectBusca value={filtros.situacaoCA} onChange={e => setF('situacaoCA', e.target.value)} className="w-full max-md:h-[44px]">
                                        <option value="">Todas</option>
                                        <option value="FATURADO">Faturado</option>
                                        <option value="APROVADO">Aprovado</option>
                                        <option value="EM_ABERTO">Em Aberto</option>
                                    </SelectBusca>
                                </div>
                                <div>
                                    <label className={labelCls}>Bonificações</label>
                                    <SelectBusca value={filtros.excluirBonificacao} onChange={e => setF('excluirBonificacao', e.target.value)} className="w-full max-md:h-[44px]">
                                        <option value="true">Excluir bonificações</option>
                                        <option value="false">Incluir tudo</option>
                                    </SelectBusca>
                                </div>
                            </div>
                            <p className="text-xs text-gray-500">
                                O relatório atualiza sozinho ao mudar um filtro. Para filtrar por cliente, produto, bairro ou indicação, use o funil no cabeçalho da coluna.
                            </p>
                        </div>
                    )}
                </div>

                {/* Chips dos filtros aplicados */}
                {(chipsPainel.length > 0 || chipsColuna.length > 0) && (
                    <div className="flex flex-wrap items-center gap-1.5">
                        {chipsPainel.map(chip => (
                            <span key={chip.id} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 text-xs bg-mint text-primaryDark rounded-full font-semibold max-w-full">
                                <span className="truncate">{chip.texto}</span>
                                <button type="button" onClick={chip.remover} aria-label="Remover filtro"
                                    className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] md:min-w-[28px] md:min-h-[28px] -my-2 -mr-1.5 rounded-full hover:bg-white/60"><X className="h-3 w-3" /></button>
                            </span>
                        ))}
                        {chipsColuna.map(chip => (
                            <span key={chip.colId} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 text-xs bg-mint text-primaryDark rounded-full font-semibold">
                                <ListFilter className="h-3 w-3" />
                                {chip.label}: {chip.qtd} de {chip.total}
                                <button type="button" onClick={() => handleFiltroChange(chip.colId, undefined)} aria-label="Remover filtro"
                                    className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] md:min-w-[28px] md:min-h-[28px] -my-2 -mr-1.5 rounded-full hover:bg-white/60"><X className="h-3 w-3" /></button>
                            </span>
                        ))}
                    </div>
                )}

                {loading && !temDados && (
                    <div className="flex justify-center items-center py-20 text-sm text-gray-600">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mr-3" />
                        Gerando relatório...
                    </div>
                )}

                {!loading && !temDados && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                        <EstadoVazio
                            icon={BarChart2}
                            titulo={erroCarga ? 'Não foi possível gerar o relatório' : gerado ? 'Nenhuma venda encontrada' : 'Relatório ainda não gerado'}
                            descricao={erroCarga ? 'Os dados não correspondem aos filtros escolhidos. Toque em Gerar para tentar de novo.' : gerado ? 'Nenhum item bate com os filtros escolhidos. Tente ampliar o período ou limpar os filtros.' : 'Escolha os filtros e toque em Gerar.'}
                            acao={erroCarga ? { label: 'Tentar de novo', onClick: fetchRelatorio }
                                : gerado && periodoCriacao.preset !== 'todo' ? { label: 'Ver todo o período', onClick: () => { periodoCriacaoCtl.escolher('todo'); periodoVendaCtl.escolher('todo'); } }
                                : gerado && nFiltros > 0 ? { label: 'Limpar filtros', onClick: limpar } : undefined}
                        />
                    </div>
                )}

                {temDados && (
                    <div className={loading ? 'opacity-60 transition-opacity' : ''}>
                        {/* KPIs */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-3">
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-600">Total geral</p>
                                <p className="text-base md:text-lg font-bold text-gray-900">{resumo.totalPedidos ?? 0} pedidos</p>
                                <p className="text-xs text-gray-600">R$ {fmt(resumo.valorTotalGeral)}</p>
                                <p className="text-xs text-gray-600">Ticket médio (por pedido): R$ {fmt(resumo.ticketMedio)}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-600">Filtrado</p>
                                <p className="text-base md:text-lg font-bold text-primaryDark">{dadosFiltrados.length} itens</p>
                                <p className="text-xs text-primary font-semibold">R$ {fmt(totalFiltrado)}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-600">Média por item</p>
                                <p className="text-base md:text-lg font-bold text-gray-900">
                                    R$ {fmt(dadosFiltrados.length > 0 ? totalFiltrado / dadosFiltrados.length : 0)}
                                </p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-600">Linhas na tabela</p>
                                <p className="text-base md:text-lg font-bold text-gray-900">{dadosAgrupados.length}</p>
                                <p className="text-xs text-gray-600">{chipsColuna.length} {chipsColuna.length === 1 ? 'filtro de coluna' : 'filtros de coluna'}</p>
                            </div>
                        </div>

                        {/* Colunas visíveis — toque liga/desliga; arraste para reordenar (computador) */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 mb-3">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-2">Colunas</p>
                            <div className="flex flex-wrap gap-1.5">
                                {colOrdem.map(id => {
                                    const c = COLUNAS.find(col => col.id === id);
                                    if (!c) return null;
                                    return (
                                        <button type="button" key={c.id} onClick={() => toggleCol(c.id)}
                                            draggable
                                            onDragStart={() => handleDragStart(c.id)}
                                            onDragOver={e => handleDragOver(e, c.id)}
                                            onDragEnd={handleDragEnd}
                                            className={`px-3 py-1.5 min-h-[44px] md:min-h-[36px] text-xs rounded-full border font-semibold transition-colors md:cursor-grab md:active:cursor-grabbing ${
                                                colsVisiveis.has(c.id)
                                                    ? 'bg-primary text-white border-primary'
                                                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                                            }`}>
                                            {c.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Mobile: cards */}
                        <div className="md:hidden space-y-3">
                            {dadosAgrupados.slice(0, limiteCards).map(row => {
                                const tituloCol = colsAtivas.find(c => c.id === 'cliente') || colsAtivas.find(c => c.id === 'produto') || colsAtivas.find(c => c.tipo === 'texto');
                                const colValor = colsAtivas.find(c => c.id === 'valor');
                                const resto = colsAtivas.filter(c => c !== tituloCol && c !== colValor);
                                return (
                                    <div key={row._key} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <span className="font-semibold text-gray-900 text-sm break-words min-w-0">{tituloCol ? (row[tituloCol.field] || '-') : `${row._count} itens`}</span>
                                            {colValor && (
                                                <span className="font-bold text-primaryDark text-sm whitespace-nowrap">
                                                    R$ {fmt(row.valorTotal)}{row._count > 1 && <span className="ml-1 text-[11px] text-gray-500 font-normal">({row._count})</span>}
                                                </span>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                                            {resto.map(col => (
                                                <div key={col.id} className="min-w-0">
                                                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{col.label}</p>
                                                    {col.id === 'tipo' ? (
                                                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${TIPO_BADGE[row.tipo] || 'bg-gray-100 text-gray-700'}`}>{row.tipo || '-'}</span>
                                                    ) : (
                                                        <p className={`text-xs break-words ${col.id === 'custoTotal' ? 'font-semibold text-red-700' : 'text-gray-800'}`}>{textoCelula(col, row)}</p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                            {dadosAgrupados.length > limiteCards && (
                                <button type="button" onClick={() => setLimiteCards(l => l + 100)}
                                    className="w-full min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-semibold text-sm">
                                    Mostrar mais ({limiteCards} de {dadosAgrupados.length})
                                </button>
                            )}
                            {dadosAgrupados.length > 0 && (
                                <div className="bg-mint/40 rounded-xl border border-gray-200 p-3 text-sm font-bold text-primaryDark flex items-center justify-between">
                                    <span>{dadosAgrupados.length} linhas</span>
                                    <span>R$ {fmt(totalFiltrado)}</span>
                                </div>
                            )}
                            <p className="text-xs text-gray-500 text-center">Para ordenar e filtrar por coluna, use o computador ou o iPad.</p>
                        </div>

                        {/* Desktop: tabela */}
                        <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50">
                                    <tr>
                                        {colsAtivas.map(col => {
                                            const temFiltro = filtrosAtivos[col.id] && filtrosAtivos[col.id].size > 0;
                                            return (
                                                <th key={col.id}
                                                    draggable
                                                    onDragStart={() => handleDragStart(col.id)}
                                                    onDragOver={e => handleDragOver(e, col.id)}
                                                    onDragEnd={handleDragEnd}
                                                    className={`px-2 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide select-none cursor-grab active:cursor-grabbing whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                                                    <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                                                        <button type="button" onClick={(e) => handleSort(col, e)}
                                                            className="flex items-center gap-1 hover:text-primaryDark">
                                                            {col.label}
                                                            <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
                                                        </button>
                                                        {col.filtravel && (
                                                            <button type="button"
                                                                onClick={(e) => abrirFiltroColuna(col.id, e)}
                                                                className={`ml-0.5 p-1 rounded-full transition-colors ${temFiltro ? 'text-primary bg-mint' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
                                                                title={`Filtrar por ${col.label}`}>
                                                                <ListFilter className="h-3.5 w-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {dadosAgrupados.map(row => (
                                        <tr key={row._key} className="hover:bg-gray-50">
                                            {colsAtivas.map(col => {
                                                const val = row[col.field];
                                                return (
                                                    <td key={col.id}
                                                        className={`px-2 py-2 text-xs text-gray-800 ${col.align === 'right' ? 'text-right' : ''}`}>
                                                        {(col.id === 'data' || col.id === 'criacao') && fmtData(val)}
                                                        {col.id === 'valor' && (
                                                            <span className="font-semibold">
                                                                R$ {fmt(val)}
                                                                {row._count > 1 && <span className="ml-1 text-[10px] text-gray-500 font-normal">({row._count})</span>}
                                                            </span>
                                                        )}
                                                        {col.id === 'quantidade' && (
                                                            <span>{Number(val || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</span>
                                                        )}
                                                        {(col.id === 'valorUnit' || col.id === 'precoCusto') && (
                                                            val != null ? <span>R$ {fmt(val)}</span> : <span className="text-gray-500">-</span>
                                                        )}
                                                        {col.id === 'custoTotal' && (
                                                            val != null ? <span className="font-semibold text-red-700">R$ {fmt(val)}</span> : <span className="text-gray-500">-</span>
                                                        )}
                                                        {col.id === 'tipo' && (
                                                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${TIPO_BADGE[val] || 'bg-gray-100 text-gray-700'}`}>{val}</span>
                                                        )}
                                                        {!['data', 'criacao', 'valor', 'quantidade', 'valorUnit', 'precoCusto', 'custoTotal', 'tipo'].includes(col.id) && (val || '-')}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                                {dadosAgrupados.length > 0 && (
                                    <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                                        <tr>
                                            {colsAtivas.map((col, i) => (
                                                <td key={col.id} className={`px-2 py-2 text-xs font-semibold text-gray-700 ${col.align === 'right' ? 'text-right' : ''}`}>
                                                    {i === 0 && `${dadosAgrupados.length} linhas`}
                                                    {col.id === 'quantidade' && dadosAgrupados.reduce((s, r) => s + Number(r.quantidade || 0), 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                                                    {col.id === 'valor' && `R$ ${fmt(totalFiltrado)}`}
                                                    {col.id === 'custoTotal' && `R$ ${fmt(custoTotalGeral)}`}
                                                    {col.id === 'valorUnit' && totaisRodape.valorUnit != null && `R$ ${fmt(totaisRodape.valorUnit)}`}
                                                    {col.id === 'precoCusto' && totaisRodape.precoCusto != null && `R$ ${fmt(totaisRodape.precoCusto)}`}
                                                </td>
                                            ))}
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                            {dadosAgrupados.length === 0 && (
                                <EstadoVazio icon={ListFilter} titulo="Nenhum registro com os filtros ativos"
                                    descricao="Os filtros de coluna escondem todas as linhas."
                                    acao={{ label: 'Limpar filtros de coluna', onClick: () => setFiltrosAtivos({}) }} />
                            )}
                        </div>

                        <p className="hidden md:block text-xs text-gray-500 mt-2 text-center">
                            Arraste as pílulas ou os cabeçalhos para reordenar · <ListFilter className="h-3 w-3 inline" /> filtra · clique no nome ordena · ocultar coluna agrupa os dados
                        </p>
                    </div>
                )}
            </div>

            {/* Menu do filtro de coluna (posicionado em tela, não é cortado pela rolagem da tabela) */}
            {dropdownAberto && (() => {
                const col = COLUNAS.find(c => c.id === dropdownAberto.colId);
                return col ? (
                    <FilterDropdown
                        key={col.id}
                        col={col}
                        allData={pedidos}
                        selecao={filtrosAtivos[col.id]}
                        onChange={handleFiltroChange}
                        onClose={() => setDropdownAberto(null)}
                        pos={dropdownAberto}
                    />
                ) : null;
            })()}
        </div>
    );
}

// chave estável p/ memo (ordem + visibilidade das colunas)
function colsOrdemChave(ordem, visiveis) {
    return ordem.filter(id => visiveis.has(id)).join(',');
}
