import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import notasEntradaService from '../../services/notasEntradaService';
import contasPagarService from '../../services/contasPagarService';
import { Inbox, Trash2, Loader2, RefreshCw, X, FileDown } from 'lucide-react';
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
            toast.error('Erro ao carregar a lista de produtos do PCP');
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

// ═══════════════════════════════════════════════════════════
// CONFERÊNCIA (nota NOVA, com permissão)
// ═══════════════════════════════════════════════════════════
const ConferenciaNota = ({ nota, itensPcp, categorias, categoriasErro, onChanged }) => {
    const itensNota = useMemo(() => Array.isArray(nota.itens) ? nota.itens : [], [nota]);

    // Vínculo por item: pré-preenchido quando o backend lembrou
    const [vinculos, setVinculos] = useState(() => itensNota.map(it => ({
        itemId: it.id,
        itemPcpId: it.vinculo?.itemPcpId || '',
        fator: it.vinculo?.fatorConversao != null ? String(it.vinculo.fatorConversao).replace('.', ',') : '',
        novo: null // { nome, tipo, unidade } quando "+ Criar produto novo…"
    })));

    // Parcelas: pré-preenchidas das duplicatas do XML
    const [parcelas, setParcelas] = useState(() => {
        const dups = Array.isArray(nota.duplicatas) ? nota.duplicatas : [];
        if (dups.length > 0) {
            return dups.map(d => ({ dataVencimento: toYMD(d.vencimento), valor: fmt(d.valor), doXml: true }));
        }
        return [{ dataVencimento: hojeYMD(), valor: fmt(nota.valorTotal), doXml: false }];
    });

    const [categoria, setCategoria] = useState('');
    const [observacoes, setObservacoes] = useState('');
    const [enviarCA, setEnviarCA] = useState(true);
    const [gerando, setGerando] = useState(false);
    const [ignorando, setIgnorando] = useState(false);

    const setVinculo = (idx, patch) =>
        setVinculos(prev => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)));

    const setParcela = (idx, campo, valor) =>
        setParcelas(prev => prev.map((p, i) => (i === idx ? { ...p, [campo]: valor } : p)));
    const addParcela = () => setParcelas(prev => [...prev, { dataVencimento: hojeYMD(), valor: '', doXml: false }]);
    const removeParcela = (idx) => setParcelas(prev => prev.filter((_, i) => i !== idx));

    const somaParcelas = parcelas.reduce((s, p) => s + parseNum(p.valor), 0);
    const totalNota = Number(nota.valorTotal || 0);
    const somaDiverge = Math.abs(somaParcelas - totalNota) > 0.01;

    const infoItem = (idx) => {
        const it = itensNota[idx];
        const v = vinculos[idx];
        const pcp = v.novo ? null : itensPcp.find(p => String(p.id) === String(v.itemPcpId));
        const unidadeNossa = v.novo ? (v.novo.unidade || '?') : (pcp?.unidade || '?');
        const vinculado = !!v.novo || !!v.itemPcpId;
        const fator = parseFator(v.fator);
        const entrada = fator > 0 ? Number(it.quantidade || 0) * fator : 0;
        const custo = entrada > 0 ? Number(it.valorTotal || 0) / entrada : 0;
        return { it, v, pcp, unidadeNossa, vinculado, fator, entrada, custo };
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
        setGerando(true);
        try {
            const categoriaCaId = categorias.find(c => c.nome === categoria)?.id || null;
            await notasEntradaService.gerarConta(nota.id, {
                categoria: categoria || undefined,
                categoriaCaId,
                enviarCA,
                observacoes: observacoes.trim() || undefined,
                parcelas: parcelas.map(p => ({ valor: parseNum(p.valor), dataVencimento: p.dataVencimento })),
                itens: vinculos.map(v => ({
                    itemId: v.itemId,
                    itemPcpId: v.novo ? null : (v.itemPcpId || null),
                    fatorConversao: parseFator(v.fator) > 0 ? parseFator(v.fator) : null,
                    criarItemPcp: v.novo
                        ? { nome: v.novo.nome.trim(), tipo: v.novo.tipo, unidade: v.novo.unidade.trim() }
                        : null
                }))
            });
            toast.success(
                <span>
                    Conta a Pagar gerada!{' '}
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
                                                    onClick={() => setVinculo(idx, { novo: null, itemPcpId: '' })}
                                                    className="text-xs text-gray-500 hover:text-gray-700 underline"
                                                >
                                                    Cancelar produto novo
                                                </button>
                                            </div>
                                        ) : (
                                            <select
                                                value={v.itemPcpId || ''}
                                                onChange={e => {
                                                    if (e.target.value === '__novo__') {
                                                        setVinculo(idx, { novo: { nome: it.descricao || '', tipo: 'MP', unidade: '' }, itemPcpId: '' });
                                                    } else {
                                                        setVinculo(idx, { itemPcpId: e.target.value });
                                                    }
                                                }}
                                                className={`mt-1 w-full border rounded px-3 py-2 text-sm bg-white focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none ${vinculado ? 'border-gray-300' : 'border-amber-300'}`}
                                            >
                                                <option value="">Selecionar produto…</option>
                                                {itensPcp.map(p => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.nome}{p.unidade ? ` (${p.unidade})` : ''}{p.tipo ? ` — ${tipoItemLabel(p.tipo)}` : ''}
                                                    </option>
                                                ))}
                                                <option value="__novo__">+ Criar produto novo…</option>
                                            </select>
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
                    <label className="text-sm font-medium text-gray-700">Categoria da despesa</label>
                    {categoriasErro ? (
                        <input
                            value={categoria}
                            onChange={e => setCategoria(e.target.value)}
                            placeholder="Ex.: Matéria-prima"
                            className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                    ) : (
                        <select
                            value={categoria}
                            onChange={e => setCategoria(e.target.value)}
                            className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        >
                            <option value="">Selecionar…</option>
                            {categorias.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                        </select>
                    )}
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

            <label className="flex items-start gap-2 text-sm text-gray-700 bg-blue-50 border border-blue-200 rounded-lg p-3 cursor-pointer">
                <input type="checkbox" checked={enviarCA} onChange={e => setEnviarCA(e.target.checked)} className="rounded mt-0.5" />
                <span><span className="font-semibold">Enviar para a Conta Azul</span> (para pagar via DDA)</span>
            </label>

            {/* Ações */}
            <div className="flex flex-col md:flex-row gap-3 pt-1">
                <button
                    onClick={gerar}
                    disabled={gerando || somaDiverge}
                    className="w-full md:w-auto px-4 py-3 md:py-2 bg-primary hover:bg-blue-700 text-white rounded-md shadow-sm font-semibold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                    {gerando && <Loader2 className="h-4 w-4 animate-spin" />}
                    {gerando ? 'Gerando…' : `Gerar Conta a Pagar (${parcelas.length} parcela${parcelas.length !== 1 ? 's' : ''})`}
                </button>
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
                            {it.vinculo?.itemPcpNome && (
                                <div className="text-xs text-gray-600 mt-1">
                                    → vinculado a <span className="font-semibold">{it.vinculo.itemPcpNome}</span>
                                    {it.vinculo.fatorConversao != null
                                        ? ` (1 ${it.unidade || 'un'} = ${fmtQtd(it.vinculo.fatorConversao)} ${it.vinculo.itemPcpUnidade || 'un'})`
                                        : ''}
                                </div>
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
            </div>
        </div>
    );
};

export default NotasRecebidasPage;
