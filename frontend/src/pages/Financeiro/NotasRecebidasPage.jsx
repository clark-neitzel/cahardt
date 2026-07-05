import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import notasEntradaService from '../../services/notasEntradaService';
import contasPagarService from '../../services/contasPagarService';
import { Inbox, Trash2, Loader2, RefreshCw, X, FileDown, Printer, ChevronDown, Search } from 'lucide-react';
import toast from 'react-hot-toast';

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

const fmtCnpj = (c) => {
    const d = String(c || '').replace(/\D/g, '');
    if (d.length !== 14) return c || '';
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
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
    { key: 'GERADAS', label: () => 'Despesa gerada' },
    { key: 'IGNORADAS', label: () => 'Ignoradas' },
    { key: 'TODAS', label: () => 'Todas' }
];

const notaPassaChip = (nota, chip) => {
    if (chip === 'GERADAS') return nota.status === 'CONFERIDA';
    if (chip === 'IGNORADAS') return nota.status === 'IGNORADA';
    if (chip === 'TODAS') return true;
    // NOVAS: novas + resumos aguardando o XML completo
    return nota.status === 'NOVA' || nota.status === 'AGUARDANDO_XML';
};

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
    const [notas, setNotas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [chip, setChip] = useState('NOVAS');
    const [consultando, setConsultando] = useState(false);

    const [expandedId, setExpandedId] = useState(null);
    const [detalhe, setDetalhe] = useState(null);
    const [loadingDetalhe, setLoadingDetalhe] = useState(false);

    const [itensPcp, setItensPcp] = useState([]);
    const [itensPcpCarregados, setItensPcpCarregados] = useState(false);
    const [categorias, setCategorias] = useState([]);
    const [categoriasErro, setCategoriasErro] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const data = await notasEntradaService.listar();
            setStatusCaptura(data?.statusCaptura || null);
            setNotas(Array.isArray(data?.notas) ? data.notas : []);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar notas recebidas');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

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
            toast.success(res?.mensagem || res?.message || 'Consulta à SEFAZ solicitada!');
            fetchData();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao consultar a SEFAZ agora');
        } finally {
            setConsultando(false);
        }
    };

    const notasFiltradas = useMemo(
        () => notas.filter(n => notaPassaChip(n, chip)),
        [notas, chip]
    );

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
                    <button
                        onClick={consultarAgora}
                        disabled={consultando}
                        className="px-3 py-1.5 md:px-4 md:py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md text-xs md:text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${consultando ? 'animate-spin' : ''}`} />
                        {consultando ? 'Consultando…' : 'Consultar agora'}
                    </button>
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
                        {qtdNovas === 1 ? '1 nota nova aguardando conferência' : `${qtdNovas} notas novas aguardando conferência`}
                        {qtdAguardando > 0 ? ` · ${qtdAguardando} aguardando XML completo` : ''}
                    </div>
                </div>

                {/* Pausa pedida pela SEFAZ */}
                {emPausaSefaz && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                        <span className="font-semibold">SEFAZ pediu pausa nas consultas</span> — o sistema retoma sozinho às{' '}
                        <span className="font-semibold">{fmtHora(statusCaptura.bloqueadoAte)}</span>
                        {toYMD(statusCaptura.bloqueadoAte) !== hojeYMD() ? ` de ${fmtData(statusCaptura.bloqueadoAte)}` : ''}.
                    </div>
                )}

                {/* Chips de filtro */}
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
                            Nenhuma nota {chip === 'NOVAS' ? 'nova' : 'encontrada'} por aqui.
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
                </div>

                {/* Banner da memorização de vínculos */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
                    <span className="font-semibold">Vínculos memorizados:</span>{' '}
                    o vínculo e a conversão ficam <span className="font-semibold">salvos por fornecedor + código do produto na nota</span> (e código de barras, quando houver). Na próxima nota deste fornecedor, tudo já entra preenchido — mesmo que o trigo venha de 3 empresas diferentes, aqui vira sempre o nosso "Farinha de trigo (kg)".
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
// CARD RESUMIDO DA NOTA
// ═══════════════════════════════════════════════════════════
const NotaCard = ({ nota, podeOperar, onAbrir }) => {
    const aguardandoXml = nota.status === 'AGUARDANDO_XML';
    const conferivel = nota.status === 'NOVA' && podeOperar;
    const finalizada = nota.status === 'CONFERIDA' || nota.status === 'IGNORADA';

    return (
        <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2 ${finalizada ? 'opacity-75' : ''}`}>
            <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 truncate">{nota.fornecedorNome || 'Fornecedor não identificado'}</span>
                    <BadgeStatusNota status={nota.status} />
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700 whitespace-nowrap">
                        {tipoNotaLabel(nota.tipo)}{nota.numero ? ` ${nota.numero}` : ''}
                    </span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                    Emitida {fmtData(nota.emissao)}
                    {nota.fornecedorCnpj ? ` · CNPJ ${fmtCnpj(nota.fornecedorCnpj)}` : ''}
                    {nota.status === 'CONFERIDA' && nota.contaPagarId ? ' · despesa gerada em Contas a Pagar' : ''}
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

// ── Botão "Imprimir DANFE" (busca o HTML autenticado e imprime na própria página) ──
const BotaoImprimirDanfe = ({ id }) => {
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
                toast.error(e.response?.data?.error || 'Não foi possível gerar a DANFE para impressão.');
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
            {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Imprimir DANFE
        </button>
    );
};

// Select de categoria de custo (lista do CA + texto livre como fallback se a API falhar)
// Combobox de busca REUTILIZÁVEL — substitui os <select> nativos grandes do projeto.
// Digite para filtrar (por label + sub); navegação por teclado; rolagem SEM limite de itens.
// options: [{ value, label, sub? }]. extraAction?: { label, onClick } (rodapé, ex.: "criar novo").
const ComboBusca = ({
    value, options, onChange, placeholder = 'Buscar…', buscaPlaceholder = 'Digite para buscar…',
    vazioTexto = 'Nada encontrado.', extraAction, invalido = false, allowClear = true, className = ''
}) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [hi, setHi] = useState(0);
    const boxRef = useRef(null);
    const inputRef = useRef(null);

    const selecionado = options.find(o => String(o.value) === String(value));

    const filtrados = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options;
        const termos = q.split(/\s+/);
        return options.filter(o => {
            const alvo = `${o.label || ''} ${o.sub || ''}`.toLowerCase();
            return termos.every(t => alvo.includes(t));
        });
    }, [options, query]);

    useEffect(() => { setHi(0); }, [query, open]);
    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);
    useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

    const escolher = (o) => { onChange(o.value); setOpen(false); setQuery(''); };
    const onKey = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, filtrados.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); if (filtrados[hi]) escolher(filtrados[hi]); }
        else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    };

    return (
        <div className={`relative ${className}`} ref={boxRef}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={`w-full min-h-[44px] md:min-h-0 flex items-center justify-between gap-2 border rounded px-3 py-2 text-sm bg-white text-left focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none ${invalido ? 'border-amber-300' : 'border-gray-300'}`}
            >
                <span className={`truncate ${selecionado ? 'text-gray-900' : 'text-gray-400'}`}>{selecionado ? selecionado.label : placeholder}</span>
                <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
            </button>
            {open && (
                <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                    <div className="p-2 border-b border-gray-100">
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                            <input
                                ref={inputRef}
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onKeyDown={onKey}
                                placeholder={buscaPlaceholder}
                                className="w-full border border-gray-300 rounded pl-8 pr-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                        </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto py-1">
                        {allowClear && selecionado && (
                            <button type="button" onClick={() => { onChange(''); setOpen(false); setQuery(''); }}
                                className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:bg-gray-50">Limpar seleção</button>
                        )}
                        {filtrados.length === 0 && <div className="px-3 py-3 text-sm text-gray-400">{vazioTexto}</div>}
                        {filtrados.map((o, i) => (
                            <button
                                key={String(o.value)}
                                type="button"
                                onMouseEnter={() => setHi(i)}
                                onClick={() => escolher(o)}
                                className={`w-full text-left px-3 py-2 text-sm flex flex-col gap-0.5 ${i === hi ? 'bg-blue-50' : 'hover:bg-gray-50'} ${String(o.value) === String(value) ? 'font-semibold text-primary' : 'text-gray-800'}`}
                            >
                                <span className="break-words">{o.label}</span>
                                {o.sub && <span className="text-xs text-gray-400">{o.sub}</span>}
                            </button>
                        ))}
                    </div>
                    <div className="px-3 py-1.5 border-t border-gray-100 text-[11px] text-gray-400">
                        {filtrados.length} {filtrados.length === 1 ? 'item' : 'itens'}
                    </div>
                    {extraAction && (
                        <div className="p-2 border-t border-gray-100">
                            <button type="button" onClick={() => { extraAction.onClick(); setOpen(false); setQuery(''); }}
                                className="w-full text-left px-2 py-2 text-sm text-primary font-medium hover:bg-blue-50 rounded">{extraAction.label}</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

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
// CONFERÊNCIA (nota NOVA, com permissão)
// ═══════════════════════════════════════════════════════════
const ConferenciaNota = ({ nota, itensPcp, categorias, categoriasErro, onChanged }) => {
    const itensNota = useMemo(() => Array.isArray(nota.itens) ? nota.itens : [], [nota]);

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

    const [categoriaPadrao, setCategoriaPadrao] = useState('');
    const [observacoes, setObservacoes] = useState('');
    const [enviarCA, setEnviarCA] = useState(true);
    const [gerando, setGerando] = useState(false);
    const [ignorando, setIgnorando] = useState(false);

    // "Já paguei" (compra à vista): marca a despesa como QUITADA no Conta Azul.
    const [modoPagamento, setModoPagamento] = useState('DDA'); // 'DDA' | 'PAGO'
    const [dataPagamento, setDataPagamento] = useState(() => toYMD(nota.emissao) || hojeYMD());
    const [metodoPagamento, setMetodoPagamento] = useState('PIX_PAGAMENTO_INSTANTANEO');
    const [contaFinanceiraCaId, setContaFinanceiraCaId] = useState('');
    const [opcoesBaixa, setOpcoesBaixa] = useState({ contasFinanceiras: [], metodosPagamento: [] });
    const [loadingOpcoes, setLoadingOpcoes] = useState(false);
    const [opcoesCarregadas, setOpcoesCarregadas] = useState(false);
    const pago = enviarCA && modoPagamento === 'PAGO';

    // Carrega bancos + formas do CA só quando o usuário escolhe "Já paguei" (lazy).
    useEffect(() => {
        if (!pago || opcoesCarregadas || loadingOpcoes) return;
        setLoadingOpcoes(true);
        contasPagarService.opcoesBaixa()
            .then(op => {
                const cf = Array.isArray(op?.contasFinanceiras) ? op.contasFinanceiras : [];
                const mp = Array.isArray(op?.metodosPagamento) ? op.metodosPagamento : [];
                setOpcoesBaixa({ contasFinanceiras: cf, metodosPagamento: mp });
                const padrao = cf.find(c => c.padrao) || cf[0];
                setContaFinanceiraCaId(prev => prev || padrao?.id || '');
                setOpcoesCarregadas(true);
            })
            .catch(() => toast.error('Não consegui carregar os bancos do Conta Azul.'))
            .finally(() => setLoadingOpcoes(false));
    }, [pago, opcoesCarregadas, loadingOpcoes]);

    const setVinculo = (idx, patch) =>
        setVinculos(prev => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)));

    const setParcela = (idx, campo, valor) =>
        setParcelas(prev => prev.map((p, i) => (i === idx ? { ...p, [campo]: valor } : p)));
    const addParcela = () => setParcelas(prev => [...prev, { dataVencimento: hojeYMD(), valor: '', doXml: false }]);
    const removeParcela = (idx) => setParcelas(prev => prev.filter((_, i) => i !== idx));

    const somaParcelas = parcelas.reduce((s, p) => s + parseNum(p.valor), 0);
    const totalNota = Number(nota.valorTotal || 0);
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
        // "Já paguei": precisa de data, forma e banco
        if (pago) {
            if (!dataPagamento) { toast.error('Informe a data do pagamento.'); return; }
            if (!metodoPagamento) { toast.error('Escolha a forma de pagamento.'); return; }
            if (!contaFinanceiraCaId) { toast.error('Escolha o banco/caixa de onde saiu o pagamento.'); return; }
        }
        setGerando(true);
        try {
            await notasEntradaService.gerarConta(nota.id, {
                categoriaPadrao: categoriaPadrao || undefined,
                categoriaPadraoCaId: caIdDaCategoria(categoriaPadrao),
                enviarCA,
                observacoes: observacoes.trim() || undefined,
                pagamento: pago
                    ? { dataPagamento, metodoPagamento, contaFinanceiraCaId }
                    : undefined,
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
            toast.success(
                <span>
                    {pago ? 'Conta a Pagar gerada como PAGA!' : 'Conta a Pagar gerada!'}{' '}
                    <a href="/contas-pagar" className="font-semibold underline">Abrir Contas a Pagar</a>
                </span>,
                { duration: 8000 }
            );
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

    return (
        <div className="p-4 md:p-5 space-y-4">
            {/* Observações da nota (infCpl) */}
            <ObservacoesNota observacoes={nota.observacoes} />

            {/* Itens da nota → nossos produtos */}
            <div>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Itens da nota → nossos produtos</div>
                <div className="space-y-3">
                    {itensNota.length === 0 && (
                        <div className="text-sm text-gray-400 border border-gray-200 rounded-lg p-3">Nenhum item encontrado no XML desta nota.</div>
                    )}
                    {itensNota.map((it, idx) => {
                        const { v, vinculado, unidadeNossa, fator, entrada, custo } = infoItem(idx);
                        const lembrado = !!it.vinculo?.lembrado;
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
                                                    <select
                                                        value={v.novo.tipo}
                                                        onChange={e => setVinculo(idx, { novo: { ...v.novo, tipo: e.target.value } })}
                                                        className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-2 text-sm focus:border-primary focus:outline-none"
                                                    >
                                                        {TIPOS_ITEM_PCP.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                                    </select>
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
                    O vínculo e a conversão ficam <span className="font-semibold text-gray-700">salvos por fornecedor + código do produto na nota</span> (e código de barras, quando houver). Na próxima nota deste fornecedor, tudo já entra preenchido. O vínculo é opcional — dá para gerar a despesa sem vincular todos os itens.
                </div>
            </div>

            {/* Parcelas da despesa */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-bold uppercase tracking-widest text-gray-600">Parcelas da despesa</div>
                    <button
                        onClick={addParcela}
                        className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-xs"
                    >
                        + Adicionar parcela
                    </button>
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
                    As parcelas vêm preenchidas do boleto no XML quando existem — mas você pode <span className="font-semibold text-gray-700">corrigir datas e valores, criar ou excluir</span> parcelas antes de gerar a conta.
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

            {/* Envio ao Conta Azul + situação do pagamento */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-3">
                <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={enviarCA} onChange={e => setEnviarCA(e.target.checked)} className="rounded mt-0.5" />
                    <span><span className="font-semibold">Enviar para a Conta Azul</span></span>
                </label>

                {enviarCA && (
                    <>
                        {/* DDA vs Já paguei */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setModoPagamento('DDA')}
                                className={`text-left rounded-lg border p-3 min-h-[44px] transition-colors ${modoPagamento === 'DDA' ? 'border-primary bg-white ring-1 ring-primary' : 'border-gray-300 bg-white hover:bg-gray-50'}`}
                            >
                                <div className="text-sm font-semibold text-gray-900">Ainda vou pagar</div>
                                <div className="text-xs text-gray-500">Entra em aberto para pagar via DDA/boleto.</div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setModoPagamento('PAGO')}
                                className={`text-left rounded-lg border p-3 min-h-[44px] transition-colors ${modoPagamento === 'PAGO' ? 'border-primary bg-white ring-1 ring-primary' : 'border-gray-300 bg-white hover:bg-gray-50'}`}
                            >
                                <div className="text-sm font-semibold text-gray-900">Já paguei</div>
                                <div className="text-xs text-gray-500">Entra quitada (PIX/dinheiro), só para conciliar.</div>
                            </button>
                        </div>

                        {/* Campos do "já paguei" */}
                        {pago && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                                {loadingOpcoes ? (
                                    <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando bancos da Conta Azul…
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <div>
                                            <label className="text-sm font-medium text-gray-700">Data do pagamento</label>
                                            <input
                                                type="date"
                                                value={dataPagamento}
                                                onChange={e => setDataPagamento(e.target.value)}
                                                className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-gray-700">Forma de pagamento</label>
                                            <select
                                                value={metodoPagamento}
                                                onChange={e => setMetodoPagamento(e.target.value)}
                                                className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none bg-white"
                                            >
                                                {opcoesBaixa.metodosPagamento.map(m => (
                                                    <option key={m.value} value={m.value}>{m.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-gray-700">Banco / caixa (de onde saiu)</label>
                                            <select
                                                value={contaFinanceiraCaId}
                                                onChange={e => setContaFinanceiraCaId(e.target.value)}
                                                className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none bg-white"
                                            >
                                                <option value="">Selecionar…</option>
                                                {opcoesBaixa.contasFinanceiras.map(c => (
                                                    <option key={c.id} value={c.id}>{c.nome}{c.padrao ? ' (padrão)' : ''}</option>
                                                ))}
                                            </select>
                                            {opcoesCarregadas && opcoesBaixa.contasFinanceiras.length === 0 && (
                                                <p className="text-xs text-amber-700 mt-1">Nenhum banco encontrado na Conta Azul.</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
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
                <BotaoImprimirDanfe id={nota.id} />
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
    const itensNota = Array.isArray(nota.itens) ? nota.itens : [];
    const duplicatas = Array.isArray(nota.duplicatas) ? nota.duplicatas : [];

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
            toast.success('Entrada cancelada. A nota voltou para conferência.');
            if (r?.avisoCA) {
                toast('Atenção: esta despesa já pode ter chegado à Conta Azul. Se aparecer lá, exclua-a manualmente no CA.', { icon: '⚠️', duration: 8000 });
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
            {nota.status === 'CANCELADA_EMITENTE' && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                    O emitente cancelou esta nota na SEFAZ — ela não deve gerar despesa.
                </div>
            )}

            {/* Observações da nota (infCpl) */}
            <ObservacoesNota observacoes={nota.observacoes} />

            {/* Itens */}
            <div>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Itens da nota</div>
                <div className="space-y-2">
                    {itensNota.length === 0 && (
                        <div className="text-sm text-gray-400 border border-gray-200 rounded-lg p-3">Nenhum item encontrado no XML desta nota.</div>
                    )}
                    {itensNota.map((it, idx) => (
                        <div key={it.id || idx} className="border border-gray-200 rounded-lg p-3">
                            <div className="text-sm font-medium text-gray-900">{it.descricao || `Item ${it.numeroItem || idx + 1}`}</div>
                            <div className="text-xs text-gray-500">
                                {it.codigoFornecedor ? `cód. do fornecedor ${it.codigoFornecedor} · ` : ''}
                                {fmtQtd(it.quantidade)} {it.unidade || 'un'} × R$ {fmt(it.valorUnitario)} = R$ {fmt(it.valorTotal)}
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
                <BotaoImprimirDanfe id={nota.id} />
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
