import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import notasEntradaService from '../../services/notasEntradaService';
import contasPagarService from '../../services/contasPagarService';
import { Inbox, Trash2, Loader2, RefreshCw, X, FileDown, Printer, Search, Upload, Calendar, FilePlus, UploadCloud, Clock, Link2, Unlink } from 'lucide-react';
import toast from 'react-hot-toast';
import ComboBusca from '../../components/ComboBusca';
import SelectBusca from '../../components/SelectBusca';
import { useFiltrosSalvos } from '../../hooks/useFiltrosSalvos';
import FiltroPeriodo, { usePeriodoSalvo } from '../../components/FiltroPeriodo';
// CPF/CNPJ (inclui CNPJ ALFANUMÉRICO) — módulo único do projeto.
import { mascaraDoc, formatarDoc, normalizarDoc } from '../../utils/documento';

// ── Helpers ──
const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtQtd = (v) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const fmtCusto = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
const fmtDataHora = (d) => d
    ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';
const fmtHora = (d) => d ? new Date(d).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }) : '';
const toYMD = (d) => d ? new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : '';
const hojeYMD = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
// Dinheiro pt-BR ("2.425,00") → número
const parseNum = (v) => parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0;
// Fator de conversão ("0,5" / "50") → número (sem tratar ponto como milhar)
const parseFator = (v) => parseFloat(String(v ?? '').trim().replace(',', '.')) || 0;
const round2 = (v) => Math.round(Number(v || 0) * 100) / 100;
// Soma `dias` a uma data 'YYYY-MM-DD' preservando o dia local (sem salto de fuso) → 'YYYY-MM-DD'
const addDiasYMD = (ymd, dias) => {
    const [y, m, d] = String(ymd || '').split('-').map(Number);
    if (!y || !m || !d) return ymd || '';
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + Number(dias || 0));
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
// Divide um total em `n` parcelas que somam EXATO o total (a 1ª absorve os centavos). → [Number]
const dividirValores = (n, total) => {
    const q = Math.max(1, Number(n) || 1);
    const t = round2(total);
    const base = Math.floor((t / q) * 100) / 100;
    const arr = Array(q).fill(base);
    arr[0] = round2(base + (t - base * q));
    return arr;
};

const fmtCnpj = (c) => {
    const d = normalizarDoc(c); // preserva letras do CNPJ alfanumérico
    if (d.length !== 14) return c || '';
    return formatarDoc(d);
};

const fimChave = (chave) => {
    const d = String(chave || '').replace(/\D/g, '');
    if (d.length < 8) return '';
    const f = d.slice(-8);
    return `…${f.slice(0, 4)} ${f.slice(4)}`;
};

const tipoNotaLabel = (tipo) => String(tipo || '').toUpperCase().includes('NFS') ? 'NFS-e' : 'NF-e';

const STATUS_NOTA = {
    AGUARDANDO_XML: {
        label: 'Aguardando XML', cls: 'bg-gray-100 text-gray-700',
        title: 'Resumo recebido, XML completo chega na próxima consulta'
    },
    NOVA: { label: 'Nova', cls: 'bg-blue-100 text-blue-800' },
    CONFERIDA: { label: 'Despesa gerada ✓', cls: 'bg-green-100 text-green-800' },
    VINCULADA: {
        label: 'Vinculada ✓', cls: 'bg-green-100 text-green-800',
        title: 'Anexada a despesa(s) que já estavam lançadas — não gerou despesa nova'
    },
    IGNORADA: { label: 'Ignorada', cls: 'bg-gray-100 text-gray-700' },
    CANCELADA_EMITENTE: { label: 'Cancelada pelo emitente', cls: 'bg-red-100 text-red-700' }
};

const BadgeStatusNota = ({ status }) => {
    const cfg = STATUS_NOTA[status] || { label: status || '—', cls: 'bg-gray-100 text-gray-700' };
    return (
        <span
            className={`px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${cfg.cls} ${cfg.title ? 'cursor-help' : ''}`}
            title={cfg.title || undefined}
        >
            {cfg.label}
        </span>
    );
};

const TIPOS_ITEM_PCP = [
    { value: 'MP', label: 'Matéria-prima' },
    { value: 'EMB', label: 'Embalagem' },
    { value: 'SUB', label: 'Subproduto' },
    { value: 'PA', label: 'Produto acabado' }
];
const tipoItemLabel = (t) => TIPOS_ITEM_PCP.find(x => x.value === t)?.label || t || '';

const CHIPS = [
    { key: 'NOVAS', label: (n) => `Novas${n != null ? ` (${n})` : ''}` },
    { key: 'GERADAS', label: () => 'Despesa gerada / vinculada' },
    { key: 'IGNORADAS', label: () => 'Ignoradas' },
    { key: 'TODAS', label: () => 'Todas' }
];

const notaPassaChip = (nota, chip) => {
    if (chip === 'GERADAS') return nota.status === 'CONFERIDA' || nota.status === 'VINCULADA';
    if (chip === 'IGNORADAS') return nota.status === 'IGNORADA';
    if (chip === 'TODAS') return true;
    // NOVAS: novas + resumos aguardando o XML completo
    return nota.status === 'NOVA' || nota.status === 'AGUARDANDO_XML';
};

// Filtro por tipo de nota (segmentado)
const TIPOS_NOTA = [
    { key: 'TODAS', label: 'Todas' },
    { key: 'NFE', label: 'NF-e (produto)' },
    { key: 'NFSE', label: 'NFS-e (serviço)' }
];

// Nota criada pela opção "Lançar manualmente" (chave sintética, sem XML fiscal)
const ehNotaManual = (nota) => String(nota?.chave || '').startsWith('MANUAL-');

// Baixa o XML autenticado e dispara o download (sem window.open — PWA/iPad)
const baixarXmlNota = async (nota) => {
    try {
        const blob = await notasEntradaService.baixarXml(nota.id);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nota-${nota.numero || nota.id}.xml`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
        toast.error(e.response?.data?.error || 'Não foi possível baixar o XML.');
    }
};

// ── Impressão na PRÓPRIA página (@media print) — NUNCA window.open nem iframe (PWA/iPad) ──
function imprimirConteudo(estilos, corpoHtml) {
    const ID_AREA = 'area-impressao';
    const ID_ESTILO = 'estilo-impressao';
    document.getElementById(ID_AREA)?.remove();
    document.getElementById(ID_ESTILO)?.remove();

    // @page precisa ficar no nível raiz (iOS não lida bem com @page dentro de @media)
    const estilosSemPage = (estilos || '').replace(/@page\s*{[^}]*}/g, '');

    const style = document.createElement('style');
    style.id = ID_ESTILO;
    style.textContent = `
        @page { size: A4 portrait; margin: 10mm; }
        #${ID_AREA} { display: none; }
        @media print {
            html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; height: auto !important; }
            body > *:not(#${ID_AREA}) { display: none !important; }
            #root { display: none !important; }
            #${ID_AREA} { display: block !important; }
            #${ID_AREA} * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            ${estilosSemPage}
        }
    `;
    document.head.appendChild(style);

    const area = document.createElement('div');
    area.id = ID_AREA;
    area.innerHTML = corpoHtml;
    document.body.appendChild(area);

    const limpar = () => {
        area.remove();
        style.remove();
        window.removeEventListener('afterprint', limpar);
    };
    window.addEventListener('afterprint', limpar);
    setTimeout(limpar, 60000); // fallback se afterprint não disparar

    void area.offsetHeight; // força o layout antes de imprimir
    try { window.print(); } catch { limpar(); }
}

// Extrai estilos + corpo de um HTML completo e imprime na própria página (sem aba/iframe).
function imprimirHtml(htmlCompleto) {
    try {
        const doc = new DOMParser().parseFromString(htmlCompleto, 'text/html');
        const estilos = [...doc.querySelectorAll('style')].map(s => s.textContent).join('\n');
        doc.querySelectorAll('script').forEach(s => s.remove()); // scripts não rodam via innerHTML
        imprimirConteudo(estilos, doc.body.innerHTML);
    } catch {
        imprimirConteudo('', htmlCompleto);
    }
}

// ═══════════════════════════════════════════════════════════
// PÁGINA
// ═══════════════════════════════════════════════════════════
const NotasRecebidasPage = () => {
    const { hasPermission } = useAuth();
    const podeOperar = hasPermission('Pode_Baixar_Contas_Pagar');

    const [statusCaptura, setStatusCaptura] = useState(null);
    const [statusNfse, setStatusNfse] = useState(null);
    const [notas, setNotas] = useState([]);
    const [total, setTotal] = useState(0);
    const [pagina, setPagina] = useState(1);
    const [loadingMais, setLoadingMais] = useState(false);
    const TAM_PAGINA = 50;
    const [loading, setLoading] = useState(false);
    const [consultando, setConsultando] = useState(false);

    const [busca, setBusca] = useState('');
    const [buscaAplicada, setBuscaAplicada] = useState('');
    // espera o usuário parar de digitar antes de consultar o servidor
    useEffect(() => {
        const t = setTimeout(() => setBuscaAplicada(busca.trim()), 400);
        return () => clearTimeout(t);
    }, [busca]);

    // Filtros LEMBRADOS por usuário (padrão do sistema — useFiltrosSalvos):
    // situação (chip) e tipo de nota; período de emissão via FiltroPeriodo (persiste o preset).
    const FILTROS_PADRAO = { chip: 'NOVAS', tipo: 'TODAS' };
    const [filtros, setFiltros] = useFiltrosSalvos('notas-recebidas', FILTROS_PADRAO);
    const { chip, tipo: tipoNota } = filtros;
    const [periodo, periodoCtl] = usePeriodoSalvo('notas-recebidas', 'todo');
    const dataInicio = periodo.de;
    const dataFim = periodo.ate;
    const [importarAberto, setImportarAberto] = useState(false);

    const setChip = (v) => setFiltros(f => ({ ...f, chip: v }));
    const setTipoNota = (v) => setFiltros(f => ({ ...f, tipo: v }));
    const limparFiltros = () => { setFiltros(FILTROS_PADRAO); periodoCtl.limpar(); setBusca(''); };
    const filtrosAtivos = tipoNota !== 'TODAS' || !periodo.padrao || !!buscaAplicada;

    const [expandedId, setExpandedId] = useState(null);
    const [detalhe, setDetalhe] = useState(null);
    const [loadingDetalhe, setLoadingDetalhe] = useState(false);

    const [itensPcp, setItensPcp] = useState([]);
    const [itensPcpCarregados, setItensPcpCarregados] = useState(false);
    const [categorias, setCategorias] = useState([]);
    const [categoriasErro, setCategoriasErro] = useState(false);

    // Carrega uma página. pg === 1 reinicia a lista; pg > 1 acrescenta ("Carregar mais").
    // A situação (chip) agora é filtrada no SERVIDOR (junto de busca/tipo/período).
    const fetchData = useCallback(async (pg = 1) => {
        const primeira = pg === 1;
        if (primeira) setLoading(true); else setLoadingMais(true);
        try {
            const params = { pagina: pg, tamanhoPagina: TAM_PAGINA, chip };
            if (buscaAplicada) params.busca = buscaAplicada;
            if (tipoNota && tipoNota !== 'TODAS') params.tipo = tipoNota;
            if (dataInicio) params.dataInicio = dataInicio;
            if (dataFim) params.dataFim = dataFim;
            const data = await notasEntradaService.listar(params);
            setStatusCaptura(data?.statusCaptura || null);
            setStatusNfse(data?.statusCapturaNfse || null);
            setTotal(Number(data?.total || 0));
            const lista = Array.isArray(data?.notas) ? data.notas : [];
            if (primeira) setNotas(lista);
            else setNotas(prev => [...prev, ...lista]);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar notas recebidas');
        } finally {
            setLoading(false);
            setLoadingMais(false);
        }
    }, [chip, buscaAplicada, tipoNota, dataInicio, dataFim]);

    useEffect(() => { setPagina(1); fetchData(1); }, [fetchData]);

    const carregarMais = () => {
        const nova = pagina + 1;
        setPagina(nova);
        fetchData(nova);
    };

    useEffect(() => {
        contasPagarService.categorias()
            .then(cats => { setCategorias(Array.isArray(cats) ? cats : []); setCategoriasErro(false); })
            .catch(() => setCategoriasErro(true));
    }, []);

    const carregarItensPcp = useCallback(async () => {
        try {
            const itens = await notasEntradaService.itensPcp();
            setItensPcp(Array.isArray(itens) ? itens : []);
            setItensPcpCarregados(true);
        } catch {
            toast.error('Erro ao carregar a lista de produtos');
        }
    }, []);

    const abrirNota = async (nota) => {
        setExpandedId(nota.id);
        setDetalhe(null);
        setLoadingDetalhe(true);
        if (!itensPcpCarregados) carregarItensPcp();
        try {
            const d = await notasEntradaService.detalhe(nota.id);
            setDetalhe(d);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar a nota');
            setExpandedId(null);
        } finally {
            setLoadingDetalhe(false);
        }
    };

    const fecharNota = () => { setExpandedId(null); setDetalhe(null); };

    const consultarAgora = async () => {
        setConsultando(true);
        try {
            const res = await notasEntradaService.consultarAgora();
            if (res?.ok === false) {
                // SEFAZ ainda no intervalo de espera — não é erro, só informa quando libera.
                toast(res.motivo || 'A SEFAZ ainda está no intervalo entre consultas.', { icon: '⏳', duration: 6000 });
            } else {
                toast.success('Consulta à SEFAZ solicitada!');
            }
            fetchData();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao consultar a SEFAZ agora');
        } finally {
            setConsultando(false);
        }
    };

    // Situação (chip) agora vem filtrada do servidor — a lista já chega pronta.
    const notasFiltradas = notas;

    const qtdNovas = statusCaptura?.novas != null
        ? Number(statusCaptura.novas)
        : notas.filter(n => n.status === 'NOVA').length;
    const qtdAguardando = Number(statusCaptura?.aguardandoXml || 0);

    const bloqueadoAte = statusCaptura?.bloqueadoAte ? new Date(statusCaptura.bloqueadoAte) : null;
    const emPausaSefaz = bloqueadoAte && bloqueadoAte.getTime() > Date.now();

    return (
        <div className="max-w-full overflow-x-hidden -mx-4 sm:-mx-6 lg:-mx-8">
            {/* Topbar */}
            <div className="flex items-center justify-between p-3 md:p-6 bg-white border-b border-gray-200">
                <div className="flex items-center gap-2">
                    <div className="bg-indigo-100 p-1.5 md:p-2 rounded-lg">
                        <Inbox className="h-4 w-4 md:h-5 md:w-5 text-indigo-600" />
                    </div>
                    <h1 className="text-base md:text-2xl font-bold text-gray-900">Notas Recebidas</h1>
                </div>
                {podeOperar && (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setImportarAberto(true)}
                            className="px-3 py-1.5 md:px-4 md:py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-xs md:text-sm font-medium inline-flex items-center gap-1.5"
                            title="Importar o XML de uma nota que não chegou sozinha, ou lançar manualmente"
                        >
                            <Upload className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Importar XML</span>
                            <span className="sm:hidden">Importar</span>
                        </button>
                        <button
                            onClick={consultarAgora}
                            disabled={consultando}
                            className="px-3 py-1.5 md:px-4 md:py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md text-xs md:text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${consultando ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline">{consultando ? 'Consultando…' : 'Consultar agora'}</span>
                            <span className="sm:hidden">{consultando ? '…' : 'Consultar'}</span>
                        </button>
                    </div>
                )}
            </div>

            <div className="p-3 md:p-6 space-y-4">
                {/* Status do robô */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-6 text-sm">
                    <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${statusCaptura?.ativa ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                        <span className="text-gray-700">
                            Captura automática{' '}
                            {statusCaptura?.ativa
                                ? <span className="font-semibold text-green-700">ativa</span>
                                : <span className="font-semibold text-gray-500">desligada</span>}
                        </span>
                    </div>
                    <div className="text-gray-500">
                        Última consulta à SEFAZ:{' '}
                        <span className="font-medium text-gray-700">
                            {statusCaptura?.ultimaConsulta ? fmtDataHora(statusCaptura.ultimaConsulta) : 'ainda não realizada'}
                        </span>
                    </div>
                    <div className="text-gray-500">
                        NFS-e (serviços):{' '}
                        <span className="font-medium text-gray-700">
                            {statusNfse == null
                                ? '—'
                                : !statusNfse.ativa
                                    ? 'captura desligada'
                                    : statusNfse.ultimaConsulta
                                        ? `consultada ${fmtDataHora(statusNfse.ultimaConsulta)}`
                                        : 'ainda não consultada'}
                        </span>
                    </div>
                    <div className="text-gray-500">
                        {qtdNovas === 1 ? '1 nota nova aguardando conferência' : `${qtdNovas} notas novas aguardando conferência`}
                        {qtdAguardando > 0 ? ` · ${qtdAguardando} aguardando XML completo` : ''}
                    </div>
                    {statusCaptura?.proximaConsultaEm && !emPausaSefaz && new Date(statusCaptura.proximaConsultaEm) > new Date() && (
                        <div className="text-gray-500">
                            Próxima consulta automática:{' '}
                            <span className="font-medium text-gray-700">{fmtHora(statusCaptura.proximaConsultaEm)}</span>
                        </div>
                    )}
                </div>

                {/* Pausa pedida pela SEFAZ */}
                {emPausaSefaz && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                        <span className="font-semibold">SEFAZ pediu pausa nas consultas</span> — o sistema retoma sozinho às{' '}
                        <span className="font-semibold">{fmtHora(statusCaptura.bloqueadoAte)}</span>
                        {toYMD(statusCaptura.bloqueadoAte) !== hojeYMD() ? ` de ${fmtData(statusCaptura.bloqueadoAte)}` : ''}.
                    </div>
                )}

                {/* Busca (vale para todas as abas — consulta o servidor) */}
                <div className="relative md:max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                    <input
                        type="text"
                        value={busca}
                        onChange={e => setBusca(e.target.value)}
                        placeholder="Buscar fornecedor, CNPJ, produto ou nº da nota…"
                        className="w-full bg-white border border-gray-300 rounded-full pl-9 pr-9 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                    {busca && (
                        <button
                            onClick={() => setBusca('')}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                            title="Limpar busca"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Filtros: tipo de nota + período de emissão */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4 flex flex-col md:flex-row md:items-end gap-3 md:gap-6">
                    <div>
                        <div className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Tipo de nota</div>
                        <div className="inline-flex bg-gray-100 rounded-full p-0.5 gap-0.5">
                            {TIPOS_NOTA.map(t => (
                                <button
                                    key={t.key}
                                    onClick={() => { setTipoNota(t.key); fecharNota(); }}
                                    className={`px-3 py-1.5 min-h-[36px] rounded-full text-xs font-semibold transition-colors ${
                                        tipoNota === t.key ? 'bg-white text-primaryDark shadow-sm' : 'text-gray-600 hover:text-gray-800'
                                    }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <div className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Período de emissão</div>
                        <FiltroPeriodo periodo={periodo} controle={periodoCtl} className="w-full md:w-auto" />
                    </div>

                    {filtrosAtivos && (
                        <button
                            onClick={limparFiltros}
                            className="text-xs text-gray-500 hover:text-gray-700 underline self-start md:self-end md:ml-auto"
                        >
                            limpar filtros
                        </button>
                    )}
                </div>

                {/* Chips de situação */}
                <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                    {CHIPS.map(c => (
                        <button
                            key={c.key}
                            onClick={() => { setChip(c.key); fecharNota(); }}
                            className={`shrink-0 px-3 py-1.5 min-h-[36px] rounded-full text-xs transition-colors ${
                                chip === c.key
                                    ? 'bg-primary text-white font-semibold'
                                    : 'bg-white border border-gray-300 text-gray-700 font-medium hover:bg-gray-50'
                            }`}
                        >
                            {c.label(c.key === 'NOVAS' ? qtdNovas : null)}
                        </button>
                    ))}
                </div>

                {loading && (
                    <div className="text-center text-gray-400 text-sm py-2 flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                    </div>
                )}

                {/* Lista de notas */}
                <div className="space-y-3">
                    {notasFiltradas.length === 0 && !loading && (
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center text-sm text-gray-400">
                            {buscaAplicada
                                ? <>Nenhuma nota encontrada para <span className="font-semibold text-gray-500">"{buscaAplicada}"</span> nesta aba.</>
                                : <>Nenhuma nota {chip === 'NOVAS' ? 'nova' : 'encontrada'} por aqui.</>}
                        </div>
                    )}

                    {notasFiltradas.map(nota => (
                        expandedId === nota.id ? (
                            <div key={nota.id} className="bg-white rounded-xl border-2 border-primary shadow-sm overflow-hidden">
                                {loadingDetalhe || !detalhe ? (
                                    <div className="p-6 text-center text-sm text-gray-400 flex items-center justify-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando nota…
                                    </div>
                                ) : (
                                    <NotaExpandida
                                        nota={detalhe}
                                        podeOperar={podeOperar}
                                        itensPcp={itensPcp}
                                        categorias={categorias}
                                        categoriasErro={categoriasErro}
                                        onClose={fecharNota}
                                        onChanged={() => { fecharNota(); fetchData(); }}
                                    />
                                )}
                            </div>
                        ) : (
                            <NotaCard
                                key={nota.id}
                                nota={nota}
                                podeOperar={podeOperar}
                                onAbrir={() => abrirNota(nota)}
                            />
                        )
                    ))}

                    {/* Carregar mais (paginação no servidor) */}
                    {!loading && notasFiltradas.length > 0 && (
                        <div className="flex flex-col items-center gap-2 pt-1">
                            <span className="text-[11px] text-gray-400">Mostrando {notasFiltradas.length} de {total}</span>
                            {notasFiltradas.length < total && (
                                <button
                                    onClick={carregarMais}
                                    disabled={loadingMais}
                                    className="w-full sm:w-auto px-6 py-2.5 rounded-full border border-gray-300 text-sm text-gray-600 font-semibold hover:bg-gray-50 inline-flex items-center justify-center gap-2 disabled:opacity-60"
                                >
                                    {loadingMais && <Loader2 className="h-4 w-4 animate-spin" />}
                                    Carregar mais {Math.min(TAM_PAGINA, total - notasFiltradas.length)}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Banner da memorização de vínculos */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
                    <span className="font-semibold">Vínculos memorizados:</span>{' '}
                    o vínculo e a conversão ficam <span className="font-semibold">salvos por fornecedor + código do produto na nota</span> (e código de barras, quando houver). Na próxima nota deste fornecedor, tudo já entra preenchido — mesmo que o trigo venha de 3 empresas diferentes, aqui vira sempre o nosso "Farinha de trigo (kg)".
                </div>
            </div>

            {importarAberto && podeOperar && (
                <ImportarXmlModal
                    onClose={() => setImportarAberto(false)}
                    onChanged={() => fetchData()}
                />
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
// CARD RESUMIDO DA NOTA
// ═══════════════════════════════════════════════════════════
const NotaCard = ({ nota, podeOperar, onAbrir }) => {
    const aguardandoXml = nota.status === 'AGUARDANDO_XML';
    const conferivel = nota.status === 'NOVA' && podeOperar;
    const finalizada = nota.status === 'CONFERIDA' || nota.status === 'IGNORADA' || nota.status === 'VINCULADA';

    return (
        <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2 ${finalizada ? 'opacity-75' : ''}`}>
            <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 truncate">{nota.fornecedorNome || 'Fornecedor não identificado'}</span>
                    <BadgeStatusNota status={nota.status} />
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${
                        String(nota.tipo || '').toUpperCase().includes('NFS') ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                        {tipoNotaLabel(nota.tipo)}{nota.numero ? ` ${nota.numero}` : ''}
                    </span>
                    {ehNotaManual(nota) && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">lançada manual</span>
                    )}
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-1.5">
                    <span className="inline-flex items-center gap-1 bg-mint text-primaryDark rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap">
                        <Calendar className="h-3 w-3" /> Emitida {fmtData(nota.emissao)}
                    </span>
                    {nota.fornecedorCnpj && <span className="text-xs text-gray-500">CNPJ {fmtCnpj(nota.fornecedorCnpj)}</span>}
                    {nota.status === 'CONFERIDA' && nota.contaPagarId && <span className="text-xs text-gray-500">· despesa gerada em Contas a Pagar</span>}
                    {nota.status === 'VINCULADA' && <span className="text-xs text-gray-500">· anexada a despesa já lançada</span>}
                </div>
            </div>
            <div className="flex items-center justify-between md:justify-end gap-4 shrink-0">
                <span className="font-bold text-gray-900">R$ {fmt(nota.valorTotal)}</span>
                {!aguardandoXml && (
                    <button
                        onClick={onAbrir}
                        className="px-3 py-2 min-h-[44px] md:min-h-0 md:py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-xs"
                    >
                        {conferivel ? 'Conferir' : 'Detalhes'}
                    </button>
                )}
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
// MODAL — IMPORTAR XML  /  LANÇAR NOTA MANUALMENTE
// ═══════════════════════════════════════════════════════════
const ImportarXmlModal = ({ onClose, onChanged }) => {
    const [modo, setModo] = useState('xml'); // 'xml' | 'chave' | 'manual'
    const [enviando, setEnviando] = useState(false);
    const [resultados, setResultados] = useState([]);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef(null);
    const [chave, setChave] = useState(''); // busca pela chave de acesso (44 dígitos)

    // Lançamento manual
    const [mTipo, setMTipo] = useState('NFSE');
    const [mNome, setMNome] = useState('');
    const [mCnpj, setMCnpj] = useState('');
    const [mNumero, setMNumero] = useState('');
    const [mEmissao, setMEmissao] = useState(hojeYMD());
    const [mValor, setMValor] = useState('');

    const pill = (on) => `px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${on ? 'bg-white text-primaryDark shadow-sm' : 'text-gray-600 hover:text-gray-800'}`;
    const inputCls = 'w-full mt-1 border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none';

    const processarArquivos = async (files) => {
        const lista = Array.from(files || []).filter(f => /\.xml$/i.test(f.name) || String(f.type).includes('xml'));
        if (lista.length === 0) { toast.error('Selecione arquivo(s) .xml'); return; }
        setEnviando(true);
        const res = [];
        let algumOk = false;
        for (const f of lista) {
            try {
                const texto = await f.text();
                const r = await notasEntradaService.importarXml(texto);
                algumOk = true;
                res.push({
                    nome: f.name, ok: true,
                    msg: r.jaExistia
                        ? `já estava na lista (${STATUS_NOTA[r.statusAnterior]?.label || r.statusAnterior || 'existente'}) — XML atualizado`
                        : `importada: ${r.nota?.fornecedorNome || 'nota'} · ${tipoNotaLabel(r.nota?.tipo)}${r.nota?.numero ? ' ' + r.nota.numero : ''}`
                });
            } catch (e) {
                res.push({ nome: f.name, ok: false, msg: e.response?.data?.error || 'não foi possível importar' });
            }
        }
        setResultados(res);
        setEnviando(false);
        if (inputRef.current) inputRef.current.value = ''; // permite reescolher o mesmo arquivo
        if (algumOk) { toast.success('Nota(s) importada(s)!'); onChanged(); } // recarrega a lista; modal fica aberto p/ ver o resultado
    };

    const soDigitosChave = String(chave).replace(/\D/g, '');
    const buscarChave = async () => {
        if (soDigitosChave.length !== 44) { toast.error('A chave de acesso precisa ter 44 dígitos.'); return; }
        setEnviando(true);
        setResultados([]);
        try {
            const r = await notasEntradaService.buscarPorChave(soDigitosChave);
            // SEFAZ no intervalo de espera → oferece agendar (busca sozinho ao liberar).
            if (r.ok === false && r.emEspera) {
                setResultados([{ emEspera: true, proximaConsultaEm: r.proximaConsultaEm, msg: r.motivo }]);
                return;
            }
            onChanged(); // recarrega a lista
            const nome = r.nota?.fornecedorNome || 'nota';
            const num = r.nota?.numero ? ' ' + r.nota.numero : '';
            setResultados([{
                ok: true,
                nome: `NF-e${num}`,
                msg: r.aguardandoXml
                    ? `encontrada: ${nome}. Já aparece na lista; o XML completo (itens/parcelas) chega na próxima consulta — clique em "Consultar agora" daqui a pouco.`
                    : `${r.jaExistia ? 'já estava na lista' : 'importada'}: ${nome} — pronta para conferir.`
            }]);
            toast.success('Nota encontrada na SEFAZ!');
        } catch (e) {
            setResultados([{ ok: false, nome: 'Busca', msg: e.response?.data?.error || 'não foi possível buscar a nota' }]);
        } finally {
            setEnviando(false);
        }
    };

    const agendarChave = async () => {
        setEnviando(true);
        try {
            const r = await notasEntradaService.agendarBuscaChave(soDigitosChave);
            if (r.jaExistia) { toast.success('Essa nota já está na lista!'); onChanged(); onClose(); return; }
            const quando = r.proximaConsultaEm ? fmtDataHora(r.proximaConsultaEm) : 'em breve';
            toast.success(`Agendado! A nota aparece sozinha assim que a SEFAZ liberar (${quando}).`, { duration: 8000 });
            setResultados([{ ok: true, nome: 'Agendado ✓', msg: `vou buscar sozinho por volta de ${quando} — a nota aparece na lista automaticamente, sem você precisar voltar aqui.` }]);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Não foi possível agendar a busca.');
        } finally {
            setEnviando(false);
        }
    };

    const enviarManual = async () => {
        if (!mNome.trim()) { toast.error('Informe o nome do fornecedor.'); return; }
        const valorNum = parseNum(mValor);
        if (valorNum <= 0) { toast.error('Informe o valor total da nota (maior que zero).'); return; }
        if (!mEmissao) { toast.error('Informe a data de emissão.'); return; }
        setEnviando(true);
        try {
            await notasEntradaService.lancarManual({
                tipo: mTipo,
                fornecedorNome: mNome.trim(),
                fornecedorCnpj: normalizarDoc(mCnpj) || undefined,
                numero: mNumero.trim() || undefined,
                emissao: mEmissao,
                valorTotal: valorNum
            });
            toast.success('Nota lançada! Já aparece na lista para conferir.');
            onChanged();
            onClose();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Não foi possível lançar a nota.');
        } finally {
            setEnviando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 md:p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                {/* Cabeçalho */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
                    <div className="flex items-center gap-2">
                        <div className="bg-mint p-2 rounded-lg"><Upload className="h-5 w-5 text-primaryDark" /></div>
                        <h2 className="text-lg font-bold text-gray-900">Importar nota</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"><X className="h-5 w-5" /></button>
                </div>

                {/* Alternador de modo */}
                <div className="px-5 pt-4">
                    <div className="flex flex-wrap bg-gray-100 rounded-2xl p-0.5 gap-0.5">
                        <button onClick={() => setModo('xml')} className={pill(modo === 'xml')}>Tenho o XML</button>
                        <button onClick={() => setModo('chave')} className={pill(modo === 'chave')}>Buscar pela chave</button>
                        <button onClick={() => setModo('manual')} className={pill(modo === 'manual')}>Lançar manualmente</button>
                    </div>
                </div>

                <div className="p-5">
                    {modo === 'xml' && (
                        <>
                            <p className="text-sm text-gray-600 mb-3">
                                Anexe o arquivo <b>.xml</b> da nota (NF-e ou NFS-e). Serve para notas que não chegaram sozinhas na captura automática.
                            </p>
                            <label
                                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={e => { e.preventDefault(); setDragOver(false); processarArquivos(e.dataTransfer.files); }}
                                className={`block border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${dragOver ? 'border-primary bg-mint/30' : 'border-gray-300 bg-gray-50 hover:border-primary hover:bg-mint/20'}`}
                            >
                                <input
                                    ref={inputRef}
                                    type="file"
                                    accept=".xml,text/xml,application/xml"
                                    multiple
                                    className="hidden"
                                    onChange={e => processarArquivos(e.target.files)}
                                />
                                <UploadCloud className="h-9 w-9 text-gray-400 mx-auto mb-2" />
                                <div className="text-sm font-semibold text-gray-700">Arraste o XML aqui ou clique para escolher</div>
                                <div className="text-xs text-gray-400 mt-0.5">pode selecionar vários arquivos .xml</div>
                            </label>

                            {enviando && (
                                <div className="mt-3 text-sm text-gray-500 flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Importando…
                                </div>
                            )}

                            {resultados.length > 0 && (
                                <div className="mt-4 space-y-1.5">
                                    {resultados.map((r, i) => (
                                        <div key={i} className={`text-xs rounded-lg px-3 py-2 border ${r.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                            <span className="font-semibold break-all">{r.nome}</span> — {r.msg}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 leading-relaxed">
                                <b>Onde consigo o XML?</b> No e-mail que o fornecedor manda com a nota, ou no site da prefeitura (NFS-e). A nota entra como <b>"Nova"</b>, pronta para conferir. Se já existir, o sistema não duplica.
                            </div>
                        </>
                    )}

                    {modo === 'chave' && (
                        <>
                            <p className="text-sm text-gray-600 mb-3">
                                Não tem o arquivo? Cole a <b>chave de acesso</b> (44 dígitos) da <b>NF-e</b> e o sistema busca a nota direto na SEFAZ.
                            </p>
                            <label className="text-xs font-medium text-gray-500">Chave de acesso (44 dígitos)</label>
                            <input
                                value={chave}
                                onChange={e => setChave(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !enviando) buscarChave(); }}
                                placeholder="0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000"
                                inputMode="numeric"
                                className="w-full mt-1 border border-gray-300 rounded px-3 py-2 text-sm font-mono tracking-tight focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                            <div className={`mt-1 text-xs ${soDigitosChave.length === 44 ? 'text-green-600' : 'text-gray-400'}`}>
                                {soDigitosChave.length}/44 dígitos
                            </div>

                            <button
                                onClick={buscarChave}
                                disabled={enviando || soDigitosChave.length !== 44}
                                className="mt-3 w-full px-4 py-2.5 bg-primary hover:bg-primaryDark text-white rounded-full text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Buscar na SEFAZ
                            </button>

                            {resultados.length > 0 && (
                                <div className="mt-4 space-y-2">
                                    {resultados.map((r, i) => (
                                        r.emEspera ? (
                                            <div key={i} className="rounded-lg px-3 py-3 border bg-amber-50 border-amber-200 text-amber-800 text-xs">
                                                <div className="font-semibold mb-1">⏳ A SEFAZ está no intervalo entre consultas</div>
                                                <div className="mb-2">{r.msg}</div>
                                                <button
                                                    onClick={agendarChave}
                                                    disabled={enviando}
                                                    className="px-3 py-2 bg-primary hover:bg-primaryDark text-white rounded-full text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                                                >
                                                    {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />} Agendar — buscar sozinho ao liberar
                                                </button>
                                            </div>
                                        ) : (
                                            <div key={i} className={`text-xs rounded-lg px-3 py-2 border ${r.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                                <span className="font-semibold">{r.nome}</span> — {r.msg}
                                            </div>
                                        )
                                    ))}
                                </div>
                            )}

                            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 leading-relaxed">
                                A chave está na <b>DANFE</b>, no <b>boleto</b> ou no <b>e-mail</b> da nota (44 números seguidos). Vale só para <b>NF-e</b> em que a sua empresa é a <b>destinatária</b>. Para NFS-e, use "Tenho o XML" ou "Lançar manualmente".
                            </div>
                        </>
                    )}

                    {modo === 'manual' && (
                        <>
                            <p className="text-sm text-gray-600 mb-3">
                                Não tem o XML (ex.: NFS-e de prefeitura que não vem sozinha)? Lance os dados da nota — ela entra como <b>"Nova"</b> para conferir e gerar a despesa.
                            </p>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs font-medium text-gray-500">Tipo</label>
                                    <SelectBusca value={mTipo} onChange={e => setMTipo(e.target.value)} className="w-full mt-1">
                                        <option value="NFSE">NFS-e (serviço)</option>
                                        <option value="NFE">NF-e (produto)</option>
                                    </SelectBusca>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-500">Fornecedor *</label>
                                    <input value={mNome} onChange={e => setMNome(e.target.value)} placeholder="Nome do fornecedor" className={inputCls} />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-medium text-gray-500">CNPJ (opcional)</label>
                                        <input value={mCnpj} onChange={e => setMCnpj(mascaraDoc(e.target.value))} placeholder="CNPJ do fornecedor" autoCapitalize="characters" className={inputCls} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-gray-500">Nº da nota</label>
                                        <input value={mNumero} onChange={e => setMNumero(e.target.value)} placeholder="Ex.: 57454" className={inputCls} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-medium text-gray-500">Emissão *</label>
                                        <input type="date" value={mEmissao} onChange={e => setMEmissao(e.target.value)} className={inputCls} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-gray-500">Valor total *</label>
                                        <div className="mt-1 flex items-center gap-1">
                                            <span className="text-sm text-gray-500">R$</span>
                                            <input value={mValor} onChange={e => setMValor(e.target.value)} placeholder="0,00" inputMode="decimal" className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-right focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-5 flex justify-end gap-2">
                                <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full text-sm font-medium">Cancelar</button>
                                <button
                                    onClick={enviarManual}
                                    disabled={enviando}
                                    className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus className="h-4 w-4" />} Lançar nota
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
// NOTA EXPANDIDA (conferência editável ou detalhes)
// ═══════════════════════════════════════════════════════════
const NotaExpandida = ({ nota, podeOperar, itensPcp, categorias, categoriasErro, onClose, onChanged }) => {
    const emConferencia = nota.status === 'NOVA' && podeOperar;

    return (
        <>
            {/* Cabeçalho da nota */}
            <div className="px-4 md:px-5 py-3.5 border-b border-gray-100 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{nota.fornecedorNome || 'Fornecedor não identificado'}</span>
                        <BadgeStatusNota status={nota.status} />
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700 whitespace-nowrap">
                            {tipoNotaLabel(nota.tipo)}{nota.numero ? ` ${nota.numero}` : ''}
                        </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                        Emitida em {fmtData(nota.emissao)}
                        {nota.fornecedorCnpj ? ` · CNPJ ${fmtCnpj(nota.fornecedorCnpj)}` : ''}
                        {fimChave(nota.chave) ? ` · Chave ${fimChave(nota.chave)}` : ''}
                    </div>
                </div>
                <div className="flex items-start justify-between md:justify-end gap-3 shrink-0">
                    <div className="text-left md:text-right">
                        <div className="text-xs text-gray-500">Valor da nota</div>
                        <div className="text-xl font-bold text-gray-900">R$ {fmt(nota.valorTotal)}</div>
                    </div>
                    <button onClick={onClose} title="Fechar" className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100">
                        <X className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {emConferencia ? (
                <ConferenciaNota
                    nota={nota}
                    itensPcp={itensPcp}
                    categorias={categorias}
                    categoriasErro={categoriasErro}
                    onChanged={onChanged}
                />
            ) : (
                <DetalheNota nota={nota} podeOperar={podeOperar} onChanged={onChanged} />
            )}
        </>
    );
};

// ── Bloco "Observações da nota" (infCpl) — só quando houver ──
const ObservacoesNota = ({ observacoes }) => {
    const txt = String(observacoes || '').trim();
    if (!txt) return null;
    return (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-1.5">Observações da nota</div>
            <div className="text-sm text-gray-600 whitespace-pre-wrap break-words">{txt}</div>
        </div>
    );
};

// ── Botão "Imprimir DANFE / DANFSE" (busca o HTML autenticado e imprime na própria página) ──
const BotaoImprimirDanfe = ({ id, rotulo = 'Imprimir DANFE' }) => {
    const [carregando, setCarregando] = useState(false);
    const imprimir = async () => {
        setCarregando(true);
        try {
            const html = await notasEntradaService.danfe(id);
            imprimirHtml(String(html || ''));
        } catch (e) {
            if (e.response?.status === 404) {
                toast.error('XML da nota ainda não disponível.');
            } else {
                toast.error(e.response?.data?.error || 'Não foi possível gerar a impressão da nota.');
            }
        } finally {
            setCarregando(false);
        }
    };
    return (
        <button
            onClick={imprimir}
            disabled={carregando}
            className="w-full md:w-auto px-4 py-3 md:py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
            {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} {rotulo}
        </button>
    );
};

// Select de categoria de custo (lista do CA + texto livre como fallback se a API falhar)
// O combobox de busca reutilizável do projeto fica em components/ComboBusca.jsx.

// Busca de produto — combobox genérico com opções UNIFICADAS (Produto do catálogo + Item PCP).
// `itens`: [{ value:'PROD:<id>'|'PCP:<id>', nome, unidade, sub }]. O valor selecionado é a string `value`.
const ComboProduto = ({ value, itens, onSelect, onCriarNovo, invalido }) => {
    const options = useMemo(() => itens.map(p => ({
        value: p.value,
        label: `${p.nome}${p.unidade ? ` (${p.unidade})` : ''}`,
        sub: p.sub || (p.tipo ? tipoItemLabel(p.tipo) : '')
    })), [itens]);
    return (
        <ComboBusca
            className="mt-1"
            value={value}
            options={options}
            onChange={(v) => onSelect(v)}
            placeholder="Buscar produto…"
            buscaPlaceholder="Digite: espetinho, óleo, caixa…"
            vazioTexto="Nenhum produto encontrado."
            invalido={invalido}
            extraAction={{ label: '+ Criar produto novo…', onClick: onCriarNovo }}
        />
    );
};

// Busca de categoria — mesmo combobox (texto livre só quando a lista do CA falha).
const SelectCategoria = ({ value, onChange, categorias, categoriasErro, placeholder = 'Selecionar…', className = '' }) => {
    if (categoriasErro) {
        return (
            <input
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder="Ex.: Matéria-prima"
                className={`w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none ${className}`}
            />
        );
    }
    const options = categorias.map(c => ({ value: c.nome, label: c.nome }));
    if (value && !categorias.some(c => c.nome === value)) options.unshift({ value, label: value });
    return (
        <ComboBusca
            className={className}
            value={value}
            options={options}
            onChange={onChange}
            placeholder={placeholder}
            buscaPlaceholder="Digite a categoria…"
            vazioTexto="Nenhuma categoria encontrada."
        />
    );
};

// Rateio proporcional ao valor da nota, agrupado por categoria efetiva — espelha o backend.
// itensCat: [{ vProd:Number, categoria:String|'' }]  → Map<categoria, valor>
const calcularRateio = (itensCat, valorNota, categoriaPadrao) => {
    const total = Number(valorNota || 0);
    // categoria efetiva de cada item
    const efetivos = itensCat.map(it => ({
        vProd: Number(it.vProd || 0),
        categoria: (it.categoria && it.categoria.trim()) || (categoriaPadrao || '').trim() || ''
    }));
    const semCategoria = efetivos.some(e => !e.categoria);
    // agrupar por categoria (preserva ordem de aparição)
    const ordem = [];
    const grupos = new Map();
    let somaTodos = 0;
    for (const e of efetivos) {
        somaTodos += e.vProd;
        const key = e.categoria || '__SEM__';
        if (!grupos.has(key)) { grupos.set(key, 0); ordem.push(key); }
        grupos.set(key, grupos.get(key) + e.vProd);
    }
    const rateio = [];
    let acumulado = 0;
    ordem.forEach((key, i) => {
        const somaGrupo = grupos.get(key);
        let valor;
        if (i === ordem.length - 1) {
            valor = Math.round((total - acumulado) * 100) / 100; // último absorve o resto
        } else {
            valor = somaTodos > 0 ? Math.round((total * somaGrupo / somaTodos) * 100) / 100 : 0;
            acumulado += valor;
        }
        rateio.push({ categoria: key === '__SEM__' ? '' : key, valor });
    });
    return { rateio, semCategoria, temItens: efetivos.length > 0 };
};

// ═══════════════════════════════════════════════════════════
// VÍNCULO COM DESPESA JÁ LANÇADA (contrato de serviço: NF chega DEPOIS do pagamento)
// Anexa os dados fiscais na(s) parcela(s) existente(s) — NÃO cria despesa nova, não vai ao CA.
// ═══════════════════════════════════════════════════════════
const STATUS_PARCELA_PAGAR = {
    ABERTO: { label: 'Aberto', cls: 'bg-blue-100 text-blue-800' },
    PAGO: { label: 'Pago', cls: 'bg-green-100 text-green-800' },
    PARCIAL: { label: 'Parcial', cls: 'bg-yellow-100 text-yellow-800' },
    VENCIDO: { label: 'Vencido', cls: 'bg-red-100 text-red-700' },
    CANCELADO: { label: 'Cancelado', cls: 'bg-red-100 text-red-700' }
};

const BadgeStatusParcelaPagar = ({ status }) => {
    const cfg = STATUS_PARCELA_PAGAR[String(status || '').toUpperCase()]
        || { label: status || '—', cls: 'bg-gray-100 text-gray-700' };
    return <span className={`px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${cfg.cls}`}>{cfg.label}</span>;
};

const ACOES_DIFERENCA = [
    { value: 'NENHUMA', label: 'Deixar como está (vínculo parcial)', ajuda: 'A nota fica anexada e a diferença fica registrada. Use quando a nota cobre só parte da parcela (ex.: parte serviço, parte peça).' },
    { value: 'AJUSTAR_PARCELA', label: 'Ajustar o valor da parcela', ajuda: 'O valor das parcelas ainda NÃO pagas é ajustado para bater com a nota. Parcelas já pagas não são alteradas.' },
    { value: 'DESCONTO', label: 'Registrar como desconto', ajuda: 'A diferença é registrada como desconto concedido pelo fornecedor.' },
    { value: 'ACRESCIMO', label: 'Registrar como acréscimo', ajuda: 'A diferença é registrada como acréscimo (juros, multa, serviço extra).' }
];

const PainelVincularParcelas = ({ nota, onCancelar, onChanged }) => {
    const notaValorProp = Number(nota.valorTotal || 0);

    const [busca, setBusca] = useState('');
    const [buscaAplicada, setBuscaAplicada] = useState('');
    useEffect(() => {
        const t = setTimeout(() => setBuscaAplicada(busca.trim()), 400);
        return () => clearTimeout(t);
    }, [busca]);

    const [dados, setDados] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState('');
    // { [parcelaPagarId]: valorDigitado } — presença da chave = selecionada
    const [selecao, setSelecao] = useState({});
    const [acaoDiferenca, setAcaoDiferenca] = useState('NENHUMA');
    const [observacao, setObservacao] = useState('');
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        let vivo = true;
        setCarregando(true);
        setErro('');
        notasEntradaService.parcelasCompativeis(nota.id, buscaAplicada)
            .then(d => { if (vivo) setDados(d || null); })
            .catch(e => { if (vivo) setErro(e.response?.data?.error || 'Não foi possível carregar as despesas já lançadas.'); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [nota.id, buscaAplicada]);

    const parcelas = Array.isArray(dados?.parcelas) ? dados.parcelas : [];
    const notaValor = dados?.notaValor != null ? Number(dados.notaValor) : notaValorProp;
    const jaVinculadoTotal = Number(dados?.jaVinculadoTotal || 0);
    // Quanto da nota ainda pode ser distribuído (descontando o que já foi vinculado antes)
    const restanteDaNota = round2(Math.max(0, notaValor - jaVinculadoTotal));

    const idsSelecionados = Object.keys(selecao);
    const somaVinculada = idsSelecionados.reduce((s, id) => s + parseNum(selecao[id]), 0);
    const diferenca = round2(restanteDaNota - somaVinculada);
    const diferencaZero = Math.abs(diferenca) < 0.01;

    const saldoDe = (p) => {
        const s = p.saldoDisponivel != null ? Number(p.saldoDisponivel) : Number(p.valor || 0);
        return round2(Math.max(0, s));
    };

    const alternar = (p) => {
        const id = String(p.parcelaPagarId);
        setSelecao(prev => {
            if (Object.prototype.hasOwnProperty.call(prev, id)) {
                const { [id]: _fora, ...resto } = prev;
                return resto;
            }
            // pré-preenche com o menor entre o saldo da parcela e o que falta da nota
            const jaUsado = Object.keys(prev).reduce((s, k) => s + parseNum(prev[k]), 0);
            const falta = round2(Math.max(0, restanteDaNota - jaUsado));
            const sugerido = round2(Math.min(saldoDe(p), falta || saldoDe(p)));
            return { ...prev, [id]: fmt(sugerido) };
        });
    };

    const setValor = (id, v) => setSelecao(prev => ({ ...prev, [String(id)]: v }));

    // Motivo de bloqueio do botão (mensagem clara em cada caso)
    const motivoBloqueio = useMemo(() => {
        if (idsSelecionados.length === 0) return 'Escolha ao menos uma parcela para receber esta nota.';
        for (const id of idsSelecionados) {
            const p = parcelas.find(x => String(x.parcelaPagarId) === String(id));
            const v = parseNum(selecao[id]);
            const rotulo = p ? `"${p.descricao || 'parcela'}"` : 'a parcela selecionada';
            if (v <= 0) return `Informe um valor maior que zero para ${rotulo}.`;
            if (p && v > saldoDe(p) + 0.01) {
                return `O valor de ${rotulo} (R$ ${fmt(v)}) passa do saldo disponível dessa parcela (R$ ${fmt(saldoDe(p))}).`;
            }
        }
        if (somaVinculada > restanteDaNota + 0.01) {
            return `A soma vinculada (R$ ${fmt(somaVinculada)}) passa do valor da nota (R$ ${fmt(restanteDaNota)}).`;
        }
        return '';
    }, [idsSelecionados, selecao, parcelas, somaVinculada, restanteDaNota]);

    const vincular = async () => {
        if (motivoBloqueio) { toast.error(motivoBloqueio); return; }
        setSalvando(true);
        try {
            const resp = await notasEntradaService.vincularParcelas(nota.id, {
                vinculos: idsSelecionados.map(id => ({
                    parcelaPagarId: id,
                    valorVinculado: parseNum(selecao[id])
                })),
                acaoDiferenca: diferencaZero ? 'NENHUMA' : acaoDiferenca,
                observacao: observacao.trim() || undefined
            });
            toast.success(
                <span>
                    {resp?.message || 'Nota vinculada à despesa já lançada!'}{' '}
                    <a href="/contas-pagar" className="font-semibold underline">Abrir Contas a Pagar</a>
                </span>,
                { duration: 8000 }
            );
            for (const aviso of resp?.avisos || []) toast(aviso, { icon: '⚠️', duration: 9000 });
            onChanged();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Não foi possível vincular a nota.');
        } finally {
            setSalvando(false);
        }
    };

    const acaoAtual = ACOES_DIFERENCA.find(a => a.value === acaoDiferenca);

    return (
        <div className="border-2 border-primary rounded-xl overflow-hidden bg-white">
            {/* Cabeçalho */}
            <div className="px-4 md:px-5 py-3.5 border-b border-gray-100 flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <Link2 className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Vincular a despesa já lançada</span>
                    </div>
                    <div className="text-sm text-gray-700 mt-1 break-words">
                        {tipoNotaLabel(nota.tipo)}{nota.numero ? ` ${nota.numero}` : ''} · <span className="font-semibold">R$ {fmt(notaValor)}</span>
                        {nota.fornecedorNome ? ` · ${nota.fornecedorNome}` : ''}
                    </div>
                </div>
                <button onClick={onCancelar} title="Fechar" className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 shrink-0">
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="p-4 md:p-5 space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 leading-relaxed">
                    Use quando a despesa <b>já está lançada</b> no Contas a Pagar (ex.: contrato parcelado) e a nota chegou depois.
                    A nota é <b>anexada</b> à(s) parcela(s) — <b>não gera despesa nova</b> e <b>nada é enviado à Conta Azul</b>.
                </div>

                {/* Busca de parcelas */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                    <input
                        type="text"
                        value={busca}
                        onChange={e => setBusca(e.target.value)}
                        placeholder="Buscar por descrição, fornecedor ou valor…"
                        className="w-full min-h-[44px] bg-white border border-gray-300 rounded-full pl-9 pr-9 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                    {busca && (
                        <button
                            onClick={() => setBusca('')}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                            title="Limpar busca"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                        Sem busca, aparecem as parcelas do <span className="font-medium text-gray-700">mesmo fornecedor</span> (inclusive as já pagas). Busque para achar de outro fornecedor.
                    </p>
                </div>

                {/* Lista de parcelas candidatas */}
                {carregando ? (
                    <div className="text-center text-gray-400 text-sm py-4 flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando despesas…
                    </div>
                ) : erro ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>
                ) : parcelas.length === 0 ? (
                    <div className="border border-gray-200 rounded-lg p-4 text-center text-sm text-gray-500">
                        {buscaAplicada
                            ? <>Nenhuma parcela encontrada para <span className="font-semibold text-gray-600">"{buscaAplicada}"</span>.</>
                            : <>Nenhuma despesa já lançada deste fornecedor. Use a busca para procurar em outro fornecedor.</>}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {parcelas.map(p => {
                            const id = String(p.parcelaPagarId);
                            const marcada = Object.prototype.hasOwnProperty.call(selecao, id);
                            const saldo = saldoDe(p);
                            const confere = Math.abs(Number(p.valor || 0) - notaValor) < 0.01;
                            const vinculadas = Array.isArray(p.notasVinculadas) ? p.notasVinculadas : [];
                            const totalParc = Number(p.totalParcelas || 0);
                            const valorDigitado = parseNum(selecao[id]);
                            const excede = marcada && valorDigitado > saldo + 0.01;
                            return (
                                <div
                                    key={id}
                                    className={`rounded-lg border p-3 ${marcada ? 'border-primary bg-mint/20' : 'border-gray-200 hover:bg-gray-50'}`}
                                >
                                    <label className="flex items-start gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={marcada}
                                            onChange={() => alternar(p)}
                                            className="rounded h-4 w-4 mt-1 shrink-0"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-semibold text-gray-900 break-words">
                                                    {p.descricao || 'Despesa sem descrição'}
                                                </span>
                                                <BadgeStatusParcelaPagar status={p.status} />
                                                {confere && (
                                                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 whitespace-nowrap">
                                                        valor confere
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-0.5 break-words">
                                                {p.fornecedorNome ? `${p.fornecedorNome} · ` : ''}
                                                {p.categoria ? `${p.categoria} · ` : ''}
                                                {p.numeroParcela != null ? `parcela ${p.numeroParcela}${totalParc ? `/${totalParc}` : ''} · ` : ''}
                                                vence {fmtData(p.dataVencimento)}
                                            </div>
                                            <div className="text-sm text-gray-900 font-semibold mt-0.5">
                                                R$ {fmt(p.valor)}
                                                <span className="text-xs font-normal text-gray-500 ml-2">
                                                    saldo p/ vincular R$ {fmt(saldo)}
                                                </span>
                                            </div>
                                            {vinculadas.length > 0 && (
                                                <div className="text-xs text-gray-400 mt-0.5">
                                                    já tem {vinculadas.map((v, i) => (
                                                        <span key={v.notaEntradaId || i}>
                                                            {i > 0 ? ', ' : ''}NF {v.numero || '—'} · R$ {fmt(v.valorVinculado)}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </label>

                                    {marcada && (
                                        <div className="mt-3 ml-7 flex flex-wrap items-center gap-2">
                                            <label className="text-xs font-medium text-gray-500">Valor desta nota nesta parcela</label>
                                            <div className="flex items-center gap-1">
                                                <span className="text-sm text-gray-500">R$</span>
                                                <input
                                                    value={selecao[id]}
                                                    onChange={e => setValor(id, e.target.value)}
                                                    placeholder="0,00"
                                                    inputMode="decimal"
                                                    className={`w-28 border rounded px-2 py-2 text-sm text-right bg-white focus:ring-1 focus:ring-primary focus:outline-none ${excede || valorDigitado <= 0 ? 'border-red-300 focus:border-red-400' : 'border-gray-300 focus:border-primary'}`}
                                                />
                                            </div>
                                            {excede && (
                                                <span className="text-xs text-red-600">passa do saldo (R$ {fmt(saldo)})</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Resumo ao vivo */}
                <div className={`text-sm rounded-lg px-3 py-2.5 border ${
                    diferencaZero ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}>
                    <span className="font-medium">Valor da nota R$ {fmt(notaValor)}</span>
                    {jaVinculadoTotal > 0 && <span> · já vinculado antes R$ {fmt(jaVinculadoTotal)}</span>}
                    <span> · Vinculado agora <span className="font-semibold">R$ {fmt(somaVinculada)}</span></span>
                    <span> · Diferença <span className="font-semibold">R$ {fmt(diferenca)}</span></span>
                    {diferencaZero && <span className="font-semibold"> ✓</span>}
                </div>

                {/* O que fazer com a diferença (só quando houver) */}
                {!diferencaZero && idsSelecionados.length > 0 && (
                    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
                        <label className="text-sm font-medium text-gray-700">O que fazer com a diferença?</label>
                        <SelectBusca value={acaoDiferenca} onChange={e => setAcaoDiferenca(e.target.value)} className="w-full md:max-w-md">
                            {ACOES_DIFERENCA.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                        </SelectBusca>
                        {acaoAtual?.ajuda && <p className="text-xs text-gray-500">{acaoAtual.ajuda}</p>}
                        {acaoDiferenca === 'AJUSTAR_PARCELA' && (
                            <p className="text-xs text-amber-700">
                                Atenção: parcelas <span className="font-semibold">já pagas não são ajustadas</span> — só as que ainda estão em aberto.
                            </p>
                        )}
                        <div>
                            <label className="text-sm font-medium text-gray-700">Observação (opcional)</label>
                            <textarea
                                rows={2}
                                value={observacao}
                                onChange={e => setObservacao(e.target.value)}
                                placeholder="Ex.: nota cobre só a mão de obra; a peça veio em outra NF."
                                className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                        </div>
                    </div>
                )}

                {motivoBloqueio && idsSelecionados.length > 0 && (
                    <div className="text-xs text-red-600">{motivoBloqueio}</div>
                )}

                {/* Ações */}
                <div className="flex flex-col md:flex-row gap-3">
                    <button
                        onClick={vincular}
                        disabled={salvando || !!motivoBloqueio}
                        title={motivoBloqueio || undefined}
                        className="w-full md:w-auto px-4 py-3 md:py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    >
                        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                        {salvando
                            ? 'Vinculando…'
                            : `Vincular (${idsSelecionados.length} parcela${idsSelecionados.length !== 1 ? 's' : ''})`}
                    </button>
                    <button
                        onClick={onCancelar}
                        disabled={salvando}
                        className="w-full md:w-auto px-4 py-3 md:py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-medium text-sm disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
// CONFERÊNCIA (nota NOVA, com permissão)
// ═══════════════════════════════════════════════════════════
const ConferenciaNota = ({ nota, itensPcp, categorias, categoriasErro, onChanged }) => {
    const itensNota = useMemo(() => Array.isArray(nota.itens) ? nota.itens : [], [nota]);
    // NFS-e (serviço tomado): não tem vínculo com produto nem entrada no estoque —
    // a conferência vira só "categoria + parcelas + enviar ao CA".
    const ehServico = String(nota.tipo || '').toUpperCase().includes('NFS');

    // Vínculo por item: pré-preenchido quando o backend lembrou
    // vinculoValue = "PROD:<id>" | "PCP:<id>" | '' (string unificada usada pelo combo)
    const [vinculos, setVinculos] = useState(() => itensNota.map(it => ({
        itemId: it.id,
        vinculoValue: it.vinculo?.value || '',
        fator: it.vinculo?.fatorConversao != null ? String(it.vinculo.fatorConversao).replace('.', ',') : '',
        categoria: it.vinculo?.categoria || '', // categoria de custo por item (lembrada quando houver)
        novo: null // { nome, tipo, unidade } quando "+ Criar produto novo…"
    })));

    // Parcelas: pré-preenchidas das duplicatas do XML
    const [parcelas, setParcelas] = useState(() => {
        const dups = Array.isArray(nota.duplicatas) ? nota.duplicatas : [];
        if (dups.length > 0) {
            return dups.map(d => ({ dataVencimento: toYMD(d.vencimento), valor: fmt(d.valor), doXml: true }));
        }
        // Sem boleto no XML (compra à vista): usa a data de EMISSÃO da NF (não "hoje"),
        // para a despesa aparecer no Conta Azul com a data da nota.
        return [{ dataVencimento: toYMD(nota.emissao) || hojeYMD(), valor: fmt(nota.valorTotal), doXml: false }];
    });
    // Nota com boleto no XML: mantém as parcelas do XML (não redivide/re-sequencia).
    const temDuplicatasXml = (Array.isArray(nota.duplicatas) ? nota.duplicatas : []).length > 0;
    // Intervalo (dias) entre parcelas geradas manualmente — sequencia as datas.
    const [intervaloDias, setIntervaloDias] = useState(30);

    const [categoriaPadrao, setCategoriaPadrao] = useState('');
    const [observacoes, setObservacoes] = useState('');
    const [enviarCA, setEnviarCA] = useState(true);
    const [gerando, setGerando] = useState(false);
    const [ignorando, setIgnorando] = useState(false);
    // Caminho alternativo: a despesa JÁ está lançada — só anexar a nota nela (não gera despesa)
    const [vincularAberto, setVincularAberto] = useState(false);

    // Condição de pagamento (forma + banco) — obrigatória ao enviar ao CA.
    // "Já paguei" (compra à vista) marca a despesa como QUITADA no Conta Azul.
    const [modoPagamento, setModoPagamento] = useState('DDA'); // 'DDA' (ainda vou pagar) | 'PAGO' (já paguei)
    const [dataPagamento, setDataPagamento] = useState(() => toYMD(nota.emissao) || hojeYMD());
    const [metodoPagamento, setMetodoPagamento] = useState(''); // vazio = força escolha consciente
    const [contaFinanceiraCaId, setContaFinanceiraCaId] = useState('');
    const [opcoesBaixa, setOpcoesBaixa] = useState({ contasFinanceiras: [], metodosPagamento: [] });
    const [loadingOpcoes, setLoadingOpcoes] = useState(false);
    const [opcoesCarregadas, setOpcoesCarregadas] = useState(false);
    const pago = enviarCA && modoPagamento === 'PAGO';

    // Carrega bancos + formas do CA quando a despesa vai ao CA (forma+banco são obrigatórios).
    useEffect(() => {
        if (!enviarCA || opcoesCarregadas || loadingOpcoes) return;
        setLoadingOpcoes(true);
        contasPagarService.opcoesBaixa()
            .then(op => {
                const cf = Array.isArray(op?.contasFinanceiras) ? op.contasFinanceiras : [];
                const mp = Array.isArray(op?.metodosPagamento) ? op.metodosPagamento : [];
                setOpcoesBaixa({ contasFinanceiras: cf, metodosPagamento: mp });
                const padrao = cf.find(c => c.padrao) || cf[0];
                setContaFinanceiraCaId(prev => prev || padrao?.id || ''); // banco padrão pré-selecionado
                setOpcoesCarregadas(true);
            })
            .catch(() => toast.error('Não consegui carregar os bancos do Conta Azul.'))
            .finally(() => setLoadingOpcoes(false));
    }, [enviarCA, opcoesCarregadas, loadingOpcoes]);

    const setVinculo = (idx, patch) =>
        setVinculos(prev => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)));

    const setParcela = (idx, campo, valor) =>
        setParcelas(prev => prev.map((p, i) => (i === idx ? { ...p, [campo]: valor } : p)));

    const totalNota = Number(nota.valorTotal || 0);

    // Gera `qtd` parcelas iguais (somando o total da nota), com datas em sequência a partir de `base`.
    const gerarParcelasSeq = (qtd, base) => {
        const valores = dividirValores(qtd, totalNota);
        return Array.from({ length: qtd }, (_, i) => ({
            dataVencimento: i === 0 ? base : addDiasYMD(base, intervaloDias * i),
            valor: fmt(valores[i]),
            doXml: false
        }));
    };

    // + parcela: nota do XML só acrescenta uma vazia; nas demais, redivide igual e sequencia as datas.
    const addParcela = () => setParcelas(prev => {
        if (temDuplicatasXml) return [...prev, { dataVencimento: hojeYMD(), valor: '', doXml: false }];
        const base = prev[0]?.dataVencimento || toYMD(nota.emissao) || hojeYMD();
        return gerarParcelasSeq(prev.length + 1, base);
    });

    const removeParcela = (idx) => setParcelas(prev => {
        const rest = prev.filter((_, i) => i !== idx);
        if (temDuplicatasXml || rest.length === 0) return rest;
        const base = rest[0]?.dataVencimento || toYMD(nota.emissao) || hojeYMD();
        return gerarParcelasSeq(rest.length, base);
    });

    // Ao terminar de digitar o valor de uma parcela, o SALDO restante se divide nas parcelas SEGUINTES.
    const redistribuirSaldo = (idx) => {
        if (temDuplicatasXml) return;
        setParcelas(prev => {
            const restantes = prev.length - (idx + 1);
            if (restantes <= 0) return prev;
            const usado = prev.slice(0, idx + 1).reduce((s, p) => s + parseNum(p.valor), 0);
            const valores = dividirValores(restantes, Math.max(0, round2(totalNota - usado)));
            return prev.map((p, i) => (i > idx ? { ...p, valor: fmt(valores[i - idx - 1]) } : p));
        });
    };

    // Muda o intervalo (dias) e re-sequencia as datas a partir da 1ª parcela (mantém os valores).
    const aplicarIntervalo = (dias) => {
        const n = Math.max(0, parseInt(dias, 10) || 0);
        setIntervaloDias(n);
        if (temDuplicatasXml) return;
        setParcelas(prev => prev.map((p, i) => (
            i === 0 ? p : { ...p, dataVencimento: addDiasYMD(prev[0]?.dataVencimento || toYMD(nota.emissao) || hojeYMD(), n * i) }
        )));
    };

    const somaParcelas = parcelas.reduce((s, p) => s + parseNum(p.valor), 0);
    const somaDiverge = Math.abs(somaParcelas - totalNota) > 0.01;

    // categoriaCaId a partir do nome da categoria (null se for texto livre fora da lista do CA)
    const caIdDaCategoria = useCallback(
        (nome) => (nome ? (categorias.find(c => c.nome === nome)?.id ?? null) : null),
        [categorias]
    );

    // Rateio ao vivo, agrupado por categoria efetiva (item.categoria || padrão)
    const { rateio, semCategoria } = useMemo(
        () => calcularRateio(
            itensNota.map((it, i) => ({ vProd: Number(it.valorTotal || 0), categoria: vinculos[i]?.categoria || '' })),
            totalNota,
            categoriaPadrao
        ),
        [itensNota, vinculos, totalNota, categoriaPadrao]
    );

    const infoItem = (idx) => {
        const it = itensNota[idx];
        const v = vinculos[idx];
        const opcao = v.novo ? null : itensPcp.find(p => String(p.value) === String(v.vinculoValue));
        const unidadeNossa = v.novo ? (v.novo.unidade || '?') : (opcao?.unidade || '?');
        const vinculado = !!v.novo || !!v.vinculoValue;
        const fator = parseFator(v.fator);
        const entrada = fator > 0 ? Number(it.quantidade || 0) * fator : 0;
        const custo = entrada > 0 ? Number(it.valorTotal || 0) / entrada : 0;
        return { it, v, opcao, unidadeNossa, vinculado, fator, entrada, custo };
    };

    const gerar = async () => {
        if (parcelas.length === 0 || parcelas.some(p => !p.dataVencimento || parseNum(p.valor) <= 0)) {
            toast.error('Preencha data e valor de todas as parcelas.');
            return;
        }
        if (somaDiverge) {
            toast.error(`A soma das parcelas (R$ ${fmt(somaParcelas)}) não bate com o valor da nota (R$ ${fmt(totalNota)}).`);
            return;
        }
        // Vínculo é opcional — mas, se vinculou, a conversão precisa estar preenchida
        for (let i = 0; i < vinculos.length; i++) {
            const { v, it, vinculado, fator } = infoItem(i);
            if (v.novo) {
                if (!v.novo.nome.trim() || !v.novo.unidade.trim()) {
                    toast.error(`Preencha nome e unidade do produto novo do item "${it.descricao || i + 1}".`);
                    return;
                }
            }
            if (vinculado && fator <= 0) {
                toast.error(`Informe a conversão de quantidade do item "${it.descricao || i + 1}" (ou desfaça o vínculo).`);
                return;
            }
        }
        // Se vai enviar ao CA, todo grupo do rateio precisa ter categoria da lista do CA (com id)
        if (enviarCA) {
            if (semCategoria) {
                toast.error('Defina a categoria de custo dos itens (ou a categoria padrão) antes de enviar para a Conta Azul.');
                return;
            }
            const semCa = rateio.find(g => caIdDaCategoria(g.categoria) == null);
            if (semCa) {
                toast.error(`A categoria "${semCa.categoria || 'sem categoria'}" não existe na Conta Azul. Escolha uma categoria da lista ou desmarque "Enviar para a Conta Azul".`);
                return;
            }
        }
        // Enviando ao CA: forma + banco são obrigatórios (condição da despesa)
        if (enviarCA) {
            if (!metodoPagamento) { toast.error('Escolha a forma de pagamento.'); return; }
            if (!contaFinanceiraCaId) { toast.error('Escolha o banco/caixa da despesa.'); return; }
            if (pago && !dataPagamento) { toast.error('Informe a data do pagamento.'); return; }
        }
        setGerando(true);
        try {
            const resp = await notasEntradaService.gerarConta(nota.id, {
                categoriaPadrao: categoriaPadrao || undefined,
                categoriaPadraoCaId: caIdDaCategoria(categoriaPadrao),
                enviarCA,
                observacoes: observacoes.trim() || undefined,
                metodoPagamento: enviarCA ? metodoPagamento : undefined,
                contaFinanceiraCaId: enviarCA ? contaFinanceiraCaId : undefined,
                pago: pago || undefined,
                dataPagamento: pago ? dataPagamento : undefined,
                parcelas: parcelas.map(p => ({ valor: parseNum(p.valor), dataVencimento: p.dataVencimento })),
                itens: vinculos.map(v => ({
                    itemId: v.itemId,
                    vinculo: v.novo ? null : (v.vinculoValue || null),
                    fatorConversao: parseFator(v.fator) > 0 ? parseFator(v.fator) : null,
                    categoria: v.categoria || null,
                    categoriaCaId: caIdDaCategoria(v.categoria),
                    criarItemPcp: v.novo
                        ? { nome: v.novo.nome.trim(), tipo: v.novo.tipo, unidade: v.novo.unidade.trim() }
                        : null
                }))
            });
            const qtdEntradas = Number(resp?.estoque?.entradas || 0);
            toast.success(
                <span>
                    {pago ? 'Conta a Pagar gerada como PAGA!' : 'Conta a Pagar gerada!'}
                    {qtdEntradas > 0 ? ` ${qtdEntradas} item(ns) entraram no estoque com custo atualizado.` : ''}{' '}
                    <a href="/contas-pagar" className="font-semibold underline">Abrir Contas a Pagar</a>
                </span>,
                { duration: 8000 }
            );
            for (const aviso of resp?.estoque?.avisos || []) {
                toast(aviso, { icon: '⚠️', duration: 9000 });
            }
            onChanged();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao gerar a Conta a Pagar');
        } finally {
            setGerando(false);
        }
    };

    const ignorar = async () => {
        if (!window.confirm('Ignorar esta nota? Ela não vai gerar despesa (dá para reativar depois na aba Ignoradas).')) return;
        setIgnorando(true);
        try {
            await notasEntradaService.ignorar(nota.id);
            toast.success('Nota ignorada.');
            onChanged();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao ignorar a nota');
        } finally {
            setIgnorando(false);
        }
    };

    // Caminho 2: a despesa já existe no Contas a Pagar — o painel substitui a conferência.
    if (vincularAberto) {
        return (
            <div className="p-4 md:p-5">
                <PainelVincularParcelas
                    nota={nota}
                    onCancelar={() => setVincularAberto(false)}
                    onChanged={onChanged}
                />
            </div>
        );
    }

    return (
        <div className="p-4 md:p-5 space-y-4">
            {/* Observações da nota (infCpl) */}
            <ObservacoesNota observacoes={nota.observacoes} />

            {/* Itens da nota → nossos produtos (NFS-e: só o serviço + categoria) */}
            <div>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">
                    {ehServico ? 'Serviço da nota' : 'Itens da nota → nossos produtos'}
                </div>
                <div className="space-y-3">
                    {itensNota.length === 0 && (
                        <div className="text-sm text-gray-400 border border-gray-200 rounded-lg p-3">Nenhum item encontrado no XML desta nota.</div>
                    )}
                    {itensNota.map((it, idx) => {
                        const { v, vinculado, unidadeNossa, fator, entrada, custo } = infoItem(idx);
                        const lembrado = !!it.vinculo?.lembrado;
                        if (ehServico) {
                            return (
                                <div key={it.id} className="rounded-lg p-3 md:p-4 border border-gray-200">
                                    <div className="text-sm font-medium text-gray-900 whitespace-pre-wrap break-words">
                                        {it.descricao || `Serviço ${it.numeroItem || idx + 1}`}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-0.5">Valor: R$ {fmt(it.valorTotal)}</div>
                                    <div className="mt-3">
                                        <div className="flex items-center gap-2">
                                            <label className="text-xs font-medium text-gray-500">Categoria de custo</label>
                                            {String(it.vinculo?.categoria || '').trim() && (
                                                <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-green-100 text-green-800">lembrado ✓</span>
                                            )}
                                        </div>
                                        <SelectCategoria
                                            value={v.categoria}
                                            onChange={val => setVinculo(idx, { categoria: val })}
                                            categorias={categorias}
                                            categoriasErro={categoriasErro}
                                            placeholder="Usar categoria padrão…"
                                            className="mt-1 md:max-w-md"
                                        />
                                    </div>
                                </div>
                            );
                        }
                        return (
                            <div key={it.id} className={`rounded-lg p-3 md:p-4 border ${vinculado ? 'border-gray-200' : 'border-amber-300 bg-amber-50/40'}`}>
                                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-1">
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-gray-900">{it.descricao || `Item ${it.numeroItem || idx + 1}`}</div>
                                        <div className="text-xs text-gray-500">
                                            {it.codigoFornecedor ? `cód. do fornecedor ${it.codigoFornecedor} · ` : ''}
                                            {fmtQtd(it.quantidade)} {it.unidade || 'un'} × R$ {fmt(it.valorUnitario)} = R$ {fmt(it.valorTotal)}
                                        </div>
                                        {String(it.infAdProd || '').trim() && (
                                            <div className="text-xs text-gray-400 mt-0.5 whitespace-pre-wrap break-words">{String(it.infAdProd).trim()}</div>
                                        )}
                                    </div>
                                    {lembrado ? (
                                        <span className="shrink-0 self-start px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 whitespace-nowrap">vínculo lembrado ✓</span>
                                    ) : (
                                        <span className="shrink-0 self-start px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">novo — escolher produto</span>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                    {/* Nosso produto */}
                                    <div>
                                        <label className="text-xs font-medium text-gray-500">Nosso produto (opcional)</label>
                                        {v.novo ? (
                                            <div className="mt-1 space-y-2 border border-gray-200 rounded-lg p-2 bg-white">
                                                <input
                                                    value={v.novo.nome}
                                                    onChange={e => setVinculo(idx, { novo: { ...v.novo, nome: e.target.value } })}
                                                    placeholder="Nome do produto novo"
                                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                                />
                                                <div className="flex gap-2">
                                                    <SelectBusca
                                                        value={v.novo.tipo}
                                                        onChange={e => setVinculo(idx, { novo: { ...v.novo, tipo: e.target.value } })}
                                                        className="flex-1 min-w-0"
                                                    >
                                                        {TIPOS_ITEM_PCP.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                                    </SelectBusca>
                                                    <input
                                                        value={v.novo.unidade}
                                                        onChange={e => setVinculo(idx, { novo: { ...v.novo, unidade: e.target.value } })}
                                                        placeholder="un. (kg, un, L…)"
                                                        className="w-24 border border-gray-300 rounded px-2 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                                    />
                                                </div>
                                                <button
                                                    onClick={() => setVinculo(idx, { novo: null, vinculoValue: '' })}
                                                    className="text-xs text-gray-500 hover:text-gray-700 underline"
                                                >
                                                    Cancelar produto novo
                                                </button>
                                            </div>
                                        ) : (
                                            <ComboProduto
                                                value={v.vinculoValue || ''}
                                                itens={itensPcp}
                                                invalido={!vinculado}
                                                onSelect={val => setVinculo(idx, { vinculoValue: val })}
                                                onCriarNovo={() => setVinculo(idx, { novo: { nome: it.descricao || '', tipo: 'MP', unidade: '' }, vinculoValue: '' })}
                                            />
                                        )}
                                    </div>

                                    {/* Conversão */}
                                    <div>
                                        <label className="text-xs font-medium text-gray-500">Conversão de quantidade</label>
                                        <div className="mt-1 flex items-center gap-2 text-sm text-gray-700 min-h-[38px]">
                                            <span className="whitespace-nowrap">1 {it.unidade || 'un'} =</span>
                                            <input
                                                value={v.fator}
                                                onChange={e => setVinculo(idx, { fator: e.target.value })}
                                                placeholder="?"
                                                inputMode="decimal"
                                                disabled={!vinculado}
                                                className={`w-20 border rounded px-2 py-2 text-sm text-right bg-white focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:bg-gray-50 disabled:text-gray-400 ${vinculado ? 'border-gray-300' : 'border-amber-300'}`}
                                            />
                                            <span className="truncate">{unidadeNossa}</span>
                                        </div>
                                    </div>

                                    {/* Entrada convertida */}
                                    <div>
                                        <label className="text-xs font-medium text-gray-500">Entrada convertida</label>
                                        <div className="mt-1 text-sm min-h-[38px] flex items-center flex-wrap">
                                            {!vinculado ? (
                                                <span className="text-gray-400">— sem vínculo (só gera a despesa)</span>
                                            ) : fator <= 0 ? (
                                                <span className="text-gray-400">— informe a conversão</span>
                                            ) : (
                                                <>
                                                    <span className="font-semibold text-gray-900">{fmtQtd(entrada)} {unidadeNossa}</span>
                                                    <span className="text-gray-500 ml-2">· custo R$ {fmtCusto(custo)}/{unidadeNossa}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Categoria de custo por item */}
                                <div className="mt-3">
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs font-medium text-gray-500">Categoria de custo</label>
                                        {String(it.vinculo?.categoria || '').trim() && (
                                            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-green-100 text-green-800">lembrado ✓</span>
                                        )}
                                    </div>
                                    <SelectCategoria
                                        value={v.categoria}
                                        onChange={val => setVinculo(idx, { categoria: val })}
                                        categorias={categorias}
                                        categoriasErro={categoriasErro}
                                        placeholder="Usar categoria padrão…"
                                        className="mt-1 md:max-w-md"
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="mt-2 text-xs text-gray-500">
                    {ehServico
                        ? <>A categoria fica <span className="font-semibold text-gray-700">memorizada por prestador</span> — na próxima nota de serviço deste fornecedor ela já vem preenchida.</>
                        : <>Item vinculado <span className="font-semibold text-gray-700">entra no estoque e atualiza o custo</span> do produto ao gerar a conta. O vínculo e a conversão ficam <span className="font-semibold text-gray-700">salvos por fornecedor + código do produto na nota</span> (e código de barras, quando houver) — na próxima nota deste fornecedor, tudo já entra preenchido. O vínculo é opcional: sem ele, só gera a despesa.</>}
                </div>
            </div>

            {/* Parcelas da despesa */}
            <div>
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <div className="text-xs font-bold uppercase tracking-widest text-gray-600">Parcelas da despesa</div>
                    <div className="flex items-center gap-2">
                        {!temDuplicatasXml && parcelas.length > 1 && (
                            <div className="flex items-center gap-1.5 text-xs text-gray-600" title="Dias entre uma parcela e a próxima (sequencia as datas)">
                                <span>a cada</span>
                                <input
                                    type="number"
                                    min="0"
                                    value={intervaloDias}
                                    onChange={e => aplicarIntervalo(e.target.value)}
                                    className="w-14 border border-gray-300 rounded px-2 py-1.5 text-sm text-right focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                />
                                <span>dias</span>
                            </div>
                        )}
                        <button
                            onClick={addParcela}
                            className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-xs whitespace-nowrap"
                        >
                            + Adicionar parcela
                        </button>
                    </div>
                </div>
                <div className="space-y-2">
                    {parcelas.map((p, idx) => (
                        <div key={idx} className="border border-gray-200 rounded-lg px-3 py-2.5 flex flex-wrap items-center gap-2 md:gap-3">
                            <span className="text-sm font-medium text-gray-900 w-20">Parcela {idx + 1}</span>
                            <input
                                type="date"
                                value={p.dataVencimento}
                                onChange={e => setParcela(idx, 'dataVencimento', e.target.value)}
                                className="border border-gray-300 rounded px-2 py-2 text-sm text-gray-700 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                            <div className="flex items-center gap-1">
                                <span className="text-sm text-gray-500">R$</span>
                                <input
                                    value={p.valor}
                                    onChange={e => setParcela(idx, 'valor', e.target.value)}
                                    onBlur={() => redistribuirSaldo(idx)}
                                    placeholder="0,00"
                                    inputMode="decimal"
                                    className="w-28 border border-gray-300 rounded px-2 py-2 text-sm text-right focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                />
                            </div>
                            {p.doXml && (
                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">do XML</span>
                            )}
                            <button
                                onClick={() => removeParcela(idx)}
                                disabled={parcelas.length <= 1}
                                title="Excluir parcela"
                                className="ml-auto p-2 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100 disabled:opacity-30"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    ))}
                </div>
                <div className={`mt-2 text-sm rounded-lg px-3 py-2 border ${somaDiverge ? 'bg-red-50 border-red-200 text-red-700 font-medium' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                    Soma das parcelas: <span className="font-semibold">R$ {fmt(somaParcelas)}</span>
                    {somaDiverge
                        ? <span> — precisa bater com o valor da nota (R$ {fmt(totalNota)}) para gerar a conta.</span>
                        : <span className="text-green-700"> — confere com o valor da nota ✓</span>}
                </div>
                <div className="mt-2 text-xs text-gray-500">
                    {temDuplicatasXml
                        ? <>As parcelas vieram do <span className="font-semibold text-gray-700">boleto no XML</span> — você pode corrigir datas e valores antes de gerar a conta.</>
                        : <>Ao <span className="font-semibold text-gray-700">adicionar parcela</span>, o valor é dividido igualmente e as datas entram na sequência do intervalo. Ao <span className="font-semibold text-gray-700">digitar um valor</span> numa parcela, o saldo se ajusta nas seguintes. Você pode editar qualquer <span className="font-semibold text-gray-700">data</span> manualmente.</>}
                </div>
            </div>

            {/* Classificação */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="text-sm font-medium text-gray-700">Categoria padrão</label>
                    <p className="text-xs text-gray-500 mb-1">Usada nos itens sem categoria própria.</p>
                    <SelectCategoria
                        value={categoriaPadrao}
                        onChange={setCategoriaPadrao}
                        categorias={categorias}
                        categoriasErro={categoriasErro}
                    />
                </div>
                <div>
                    <label className="text-sm font-medium text-gray-700">Observações</label>
                    <textarea
                        rows={2}
                        value={observacoes}
                        onChange={e => setObservacoes(e.target.value)}
                        className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                </div>
            </div>

            {/* Resumo do rateio ao vivo */}
            <div className="text-sm rounded-lg px-3 py-2 border bg-gray-50 border-gray-200 text-gray-600">
                {semCategoria && rateio.some(g => !g.categoria) && !categoriaPadrao ? (
                    <span className="text-amber-700">Defina ao menos a categoria padrão (ou a categoria de cada item) para ratear a despesa.</span>
                ) : (
                    <span>
                        <span className="font-semibold text-gray-700">Rateio:</span>{' '}
                        {rateio.map((g, i) => (
                            <span key={i}>
                                {i > 0 ? ' · ' : ''}
                                {g.categoria || 'sem categoria'} R$ {fmt(g.valor)}
                            </span>
                        ))}
                    </span>
                )}
            </div>

            {/* Forma de pagamento e banco (registro local) + situação do pagamento */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-3">
                <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={enviarCA} onChange={e => setEnviarCA(e.target.checked)} className="rounded mt-0.5" />
                    <span><span className="font-semibold">Registrar forma de pagamento e banco</span></span>
                </label>

                {enviarCA && (
                    <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-3">
                        {loadingOpcoes ? (
                            <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                                <Loader2 className="h-4 w-4 animate-spin" /> Carregando bancos/caixas…
                            </div>
                        ) : (
                            <>
                                {/* Condição (forma + banco) — obrigatória */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Forma de pagamento</label>
                                        <SelectBusca
                                            value={metodoPagamento}
                                            onChange={e => setMetodoPagamento(e.target.value)}
                                            className="mt-1 w-full"
                                        >
                                            <option value="">Selecionar…</option>
                                            {opcoesBaixa.metodosPagamento.map(m => (
                                                <option key={m.value} value={m.value}>{m.label}</option>
                                            ))}
                                        </SelectBusca>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Banco / caixa</label>
                                        <SelectBusca
                                            value={contaFinanceiraCaId}
                                            onChange={e => setContaFinanceiraCaId(e.target.value)}
                                            className="mt-1 w-full"
                                        >
                                            <option value="">Selecionar…</option>
                                            {opcoesBaixa.contasFinanceiras.map(c => (
                                                <option key={c.id} value={c.id}>{c.nome}{c.padrao ? ' (padrão)' : ''}</option>
                                            ))}
                                        </SelectBusca>
                                        {opcoesCarregadas && opcoesBaixa.contasFinanceiras.length === 0 && (
                                            <p className="text-xs text-amber-700 mt-1">Nenhum banco/caixa cadastrado.</p>
                                        )}
                                    </div>
                                </div>

                                {/* Situação: ainda vou pagar vs já paguei */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setModoPagamento('DDA')}
                                        className={`text-left rounded-lg border p-3 min-h-[44px] transition-colors ${modoPagamento === 'DDA' ? 'border-primary bg-blue-50 ring-1 ring-primary' : 'border-gray-300 bg-white hover:bg-gray-50'}`}
                                    >
                                        <div className="text-sm font-semibold text-gray-900">Ainda vou pagar</div>
                                        <div className="text-xs text-gray-500">Entra em aberto (paga depois via DDA/boleto).</div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setModoPagamento('PAGO')}
                                        className={`text-left rounded-lg border p-3 min-h-[44px] transition-colors ${modoPagamento === 'PAGO' ? 'border-primary bg-blue-50 ring-1 ring-primary' : 'border-gray-300 bg-white hover:bg-gray-50'}`}
                                    >
                                        <div className="text-sm font-semibold text-gray-900">Já paguei</div>
                                        <div className="text-xs text-gray-500">Entra quitada, só para conciliar com o extrato.</div>
                                    </button>
                                </div>

                                {/* Data do pagamento (só no "já paguei") */}
                                {pago && (
                                    <div className="md:w-1/2">
                                        <label className="text-sm font-medium text-gray-700">Data do pagamento</label>
                                        <input
                                            type="date"
                                            value={dataPagamento}
                                            onChange={e => setDataPagamento(e.target.value)}
                                            className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                        />
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Ações */}
            <div className="flex flex-col md:flex-row gap-3 pt-1">
                <button
                    onClick={gerar}
                    disabled={gerando || somaDiverge}
                    className="w-full md:w-auto px-4 py-3 md:py-2 bg-primary hover:bg-blue-700 text-white rounded-md shadow-sm font-semibold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                    {gerando && <Loader2 className="h-4 w-4 animate-spin" />}
                    {gerando ? 'Gerando…' : `${pago ? 'Gerar Conta PAGA' : 'Gerar Conta a Pagar'} (${parcelas.length} parcela${parcelas.length !== 1 ? 's' : ''})`}
                </button>
                <button
                    onClick={() => setVincularAberto(true)}
                    title="A despesa já está lançada no Contas a Pagar? Anexe esta nota nela, sem gerar despesa nova."
                    className="w-full md:w-auto px-4 py-3 md:py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm inline-flex items-center justify-center gap-1.5"
                >
                    <Link2 className="h-4 w-4" /> Vincular a despesa já lançada
                </button>
                <BotaoImprimirDanfe id={nota.id} rotulo={ehServico ? 'Imprimir DANFSE' : 'Imprimir DANFE'} />
                <button
                    onClick={() => baixarXmlNota(nota)}
                    className="w-full md:w-auto px-4 py-3 md:py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm inline-flex items-center justify-center gap-1.5"
                >
                    <FileDown className="h-4 w-4" /> Ver XML
                </button>
                <button
                    onClick={ignorar}
                    disabled={ignorando}
                    className="w-full md:w-auto px-4 py-3 md:py-2 bg-white border border-gray-300 text-gray-500 hover:bg-gray-50 rounded-md font-medium text-sm disabled:opacity-50"
                >
                    {ignorando ? 'Ignorando…' : 'Ignorar nota'}
                </button>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
// DETALHES (somente leitura: gerada / ignorada / cancelada / sem permissão)
// ═══════════════════════════════════════════════════════════
const DetalheNota = ({ nota, podeOperar, onChanged }) => {
    const [reativando, setReativando] = useState(false);
    const [cancelando, setCancelando] = useState(false);
    const [desvinculando, setDesvinculando] = useState(''); // '' | 'TODAS' | id da parcela
    const itensNota = Array.isArray(nota.itens) ? nota.itens : [];
    const parcelasVinculadas = Array.isArray(nota.parcelasVinculadas) ? nota.parcelasVinculadas : [];
    const somaVinculada = nota.somaVinculada != null
        ? Number(nota.somaVinculada)
        : parcelasVinculadas.reduce((s, p) => s + Number(p.valorVinculado || 0), 0);

    const desvincular = async (parcelaPagarId) => {
        const tudo = !parcelaPagarId;
        const msg = tudo
            ? 'Desfazer o vínculo desta nota com TODAS as parcelas? Os dados fiscais saem das despesas e a nota volta para conferência.'
            : 'Desfazer o vínculo desta nota com esta parcela?';
        if (!window.confirm(msg)) return;
        setDesvinculando(tudo ? 'TODAS' : String(parcelaPagarId));
        try {
            const r = await notasEntradaService.desvincularParcelas(nota.id, parcelaPagarId);
            toast.success(r?.message || 'Vínculo desfeito.');
            if (r?.aviso) toast(r.aviso, { icon: '⚠️', duration: 9000 });
            onChanged();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Não foi possível desfazer o vínculo.');
        } finally {
            setDesvinculando('');
        }
    };

    const duplicatas = Array.isArray(nota.duplicatas) ? nota.duplicatas : [];
    const ehServico = String(nota.tipo || '').toUpperCase().includes('NFS');

    const reativar = async () => {
        setReativando(true);
        try {
            await notasEntradaService.reativar(nota.id);
            toast.success('Nota reativada! Ela voltou para as novas.');
            onChanged();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao reativar a nota');
        } finally {
            setReativando(false);
        }
    };

    const cancelarEntrada = async () => {
        if (!window.confirm('Cancelar a entrada desta nota? A despesa gerada em Contas a Pagar será cancelada e a nota volta para conferência, para você refazer com o produto/categoria/parcelas corretos.')) return;
        setCancelando(true);
        try {
            const r = await notasEntradaService.cancelarConferencia(nota.id);
            const estornadas = Number(r?.estoque?.estornadas || 0);
            toast.success(`Entrada cancelada. A nota voltou para conferência.${estornadas > 0 ? ` ${estornadas} item(ns) saíram do estoque (estorno).` : ''}`);
            if (r?.avisoCA) {
                toast('Atenção: esta despesa já pode ter chegado à Conta Azul. Se aparecer lá, exclua-a manualmente no CA.', { icon: '⚠️', duration: 8000 });
            }
            for (const aviso of r?.estoque?.avisos || []) {
                toast(aviso, { icon: '⚠️', duration: 9000 });
            }
            onChanged();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao cancelar a entrada');
        } finally {
            setCancelando(false);
        }
    };

    return (
        <div className="p-4 md:p-5 space-y-4">
            {nota.status === 'CONFERIDA' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                    Despesa gerada a partir desta nota.{' '}
                    <Link to="/contas-pagar" className="font-semibold underline">Ver em Contas a Pagar</Link>
                </div>
            )}
            {nota.status === 'VINCULADA' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                    Nota anexada a despesa(s) que já estavam lançadas — <span className="font-semibold">não gerou despesa nova</span>.{' '}
                    <Link to="/contas-pagar" className="font-semibold underline">Ver em Contas a Pagar</Link>
                </div>
            )}
            {nota.status === 'CANCELADA_EMITENTE' && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                    O emitente cancelou esta nota na SEFAZ — ela não deve gerar despesa.
                </div>
            )}

            {/* Observações da nota (infCpl) */}
            <ObservacoesNota observacoes={nota.observacoes} />

            {/* Despesas já lançadas que receberam esta nota */}
            {parcelasVinculadas.length > 0 && (
                <div>
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                        <div className="text-xs font-bold uppercase tracking-widest text-gray-600">Vinculada a</div>
                        {podeOperar && parcelasVinculadas.length > 1 && (
                            <button
                                onClick={() => desvincular()}
                                disabled={!!desvinculando}
                                className="px-3 py-2 min-h-[44px] md:min-h-0 md:py-1.5 bg-white border border-red-300 text-red-700 hover:bg-red-50 rounded-full font-medium text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
                            >
                                <Unlink className="h-3.5 w-3.5" />
                                {desvinculando === 'TODAS' ? 'Desvinculando…' : 'Desvincular tudo'}
                            </button>
                        )}
                    </div>
                    <div className="space-y-2">
                        {parcelasVinculadas.map((p, idx) => {
                            const id = String(p.parcelaPagarId ?? idx);
                            const totalParc = Number(p.totalParcelas || 0);
                            return (
                                <div key={id} className="border border-gray-200 rounded-lg p-3">
                                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-medium text-gray-900 break-words">
                                                    {p.descricao || 'Despesa sem descrição'}
                                                </span>
                                                <BadgeStatusParcelaPagar status={p.statusParcela} />
                                            </div>
                                            <div className="text-xs text-gray-500 mt-0.5">
                                                {p.numeroParcela != null ? `parcela ${p.numeroParcela}${totalParc ? `/${totalParc}` : ''} · ` : ''}
                                                vence {fmtData(p.dataVencimento)} · parcela de R$ {fmt(p.valorParcela)}
                                            </div>
                                            <div className="text-sm text-gray-900 mt-0.5">
                                                Valor desta nota nesta parcela: <span className="font-semibold">R$ {fmt(p.valorVinculado)}</span>
                                            </div>
                                            {p.tipoDiferenca && p.tipoDiferenca !== 'NENHUMA' && (
                                                <div className="text-xs text-amber-700 mt-0.5">
                                                    diferença tratada como{' '}
                                                    <span className="font-semibold">
                                                        {ACOES_DIFERENCA.find(a => a.value === p.tipoDiferenca)?.label || p.tipoDiferenca}
                                                    </span>
                                                </div>
                                            )}
                                            {String(p.observacao || '').trim() && (
                                                <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap break-words">
                                                    obs.: {String(p.observacao).trim()}
                                                </div>
                                            )}
                                        </div>
                                        {podeOperar && p.parcelaPagarId != null && (
                                            <button
                                                onClick={() => desvincular(p.parcelaPagarId)}
                                                disabled={!!desvinculando}
                                                className="shrink-0 px-3 py-2 min-h-[44px] md:min-h-0 md:py-1.5 bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-full font-medium text-xs inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                                            >
                                                <Unlink className="h-3.5 w-3.5" />
                                                {desvinculando === id ? 'Desvinculando…' : 'Desvincular'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                        Total vinculado: <span className="font-semibold text-gray-700">R$ {fmt(somaVinculada)}</span>
                        {' '}de R$ {fmt(nota.valorTotal)} da nota.{' '}
                        <Link to="/contas-pagar" className="font-semibold underline">Abrir Contas a Pagar</Link>
                    </div>
                </div>
            )}

            {/* Itens */}
            <div>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">{ehServico ? 'Serviço da nota' : 'Itens da nota'}</div>
                <div className="space-y-2">
                    {itensNota.length === 0 && (
                        <div className="text-sm text-gray-400 border border-gray-200 rounded-lg p-3">Nenhum item encontrado no XML desta nota.</div>
                    )}
                    {itensNota.map((it, idx) => (
                        <div key={it.id || idx} className="border border-gray-200 rounded-lg p-3">
                            <div className="text-sm font-medium text-gray-900 whitespace-pre-wrap break-words">{it.descricao || `Item ${it.numeroItem || idx + 1}`}</div>
                            <div className="text-xs text-gray-500">
                                {ehServico
                                    ? <>Valor: R$ {fmt(it.valorTotal)}</>
                                    : <>
                                        {it.codigoFornecedor ? `cód. do fornecedor ${it.codigoFornecedor} · ` : ''}
                                        {fmtQtd(it.quantidade)} {it.unidade || 'un'} × R$ {fmt(it.valorUnitario)} = R$ {fmt(it.valorTotal)}
                                    </>}
                            </div>
                            {String(it.infAdProd || '').trim() && (
                                <div className="text-xs text-gray-400 mt-0.5 whitespace-pre-wrap break-words">{String(it.infAdProd).trim()}</div>
                            )}
                            {it.vinculo?.nome && (
                                <div className="text-xs text-gray-600 mt-1">
                                    → vinculado a <span className="font-semibold">{it.vinculo.nome}</span>
                                    {it.vinculo.fatorConversao != null
                                        ? ` (1 ${it.unidade || 'un'} = ${fmtQtd(it.vinculo.fatorConversao)} ${it.vinculo.unidade || 'un'})`
                                        : ''}
                                </div>
                            )}
                            {String(it.vinculo?.categoria || '').trim() && (
                                <div className="text-xs text-gray-500 mt-1">categoria: <span className="font-medium text-gray-700">{it.vinculo.categoria}</span></div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Duplicatas do XML */}
            {duplicatas.length > 0 && (
                <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Parcelas (duplicatas do XML)</div>
                    <div className="space-y-2">
                        {duplicatas.map((d, idx) => (
                            <div key={idx} className="border border-gray-200 rounded-lg px-3 py-2.5 flex items-center justify-between gap-2 text-sm">
                                <span className="text-gray-700">
                                    Parcela {d.numero || idx + 1} · vence {fmtData(d.vencimento)}
                                </span>
                                <span className="font-semibold text-gray-900">R$ {fmt(d.valor)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Ações */}
            <div className="flex flex-col md:flex-row gap-3 pt-1">
                <BotaoImprimirDanfe id={nota.id} rotulo={ehServico ? 'Imprimir DANFSE' : 'Imprimir DANFE'} />
                <button
                    onClick={() => baixarXmlNota(nota)}
                    className="w-full md:w-auto px-4 py-3 md:py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm inline-flex items-center justify-center gap-1.5"
                >
                    <FileDown className="h-4 w-4" /> Ver XML
                </button>
                {nota.status === 'IGNORADA' && podeOperar && (
                    <button
                        onClick={reativar}
                        disabled={reativando}
                        className="w-full md:w-auto px-4 py-3 md:py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm disabled:opacity-50"
                    >
                        {reativando ? 'Reativando…' : 'Reativar nota'}
                    </button>
                )}
                {nota.status === 'CONFERIDA' && podeOperar && (
                    <button
                        onClick={cancelarEntrada}
                        disabled={cancelando}
                        className="w-full md:w-auto px-4 py-3 md:py-2 bg-white border border-red-300 text-red-700 hover:bg-red-50 rounded-md font-medium text-sm disabled:opacity-50"
                    >
                        {cancelando ? 'Cancelando…' : 'Cancelar entrada e refazer'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default NotasRecebidasPage;
