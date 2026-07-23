import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import FiltroPeriodo, { usePeriodoSalvo } from '../../components/FiltroPeriodo';
import { useFiltroSalvo } from '../../hooks/useFiltrosSalvos';
import { formatarDoc } from '../../utils/documento';
import {
    FileText, Loader2, RefreshCw, Send, FileDown, FileCode2, AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Helpers ──
const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';

const msgErroApi = (e, padrao) => e?.response?.data?.error || padrao;

// Badge de status da nota do pedido (cores semânticas do design system — não mudar)
const BadgeNota = ({ pedido }) => {
    const { nota, notaCA } = pedido;
    if (notaCA) {
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">Emitida no CA</span>;
    }
    if (!nota) {
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">Sem nota</span>;
    }
    if (nota.status === 'PROCESSANDO') {
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">⏳ Processando</span>;
    }
    if (nota.status === 'AUTORIZADO') {
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">✓ NF {nota.numero != null ? nota.numero : ''}</span>;
    }
    if (nota.status === 'ERRO') {
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700" title={nota.mensagemSefaz || ''}>✕ Rejeitada</span>;
    }
    if (nota.status === 'CANCELADO') {
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">Cancelada</span>;
    }
    return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">{nota.status || '—'}</span>;
};

const BadgeDoc = ({ cliente }) => {
    if (!cliente?.documento) return null;
    return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-semibold rounded bg-gray-100 text-gray-600">
            {cliente.tipoDoc || 'Doc'}
            <span className="font-normal">{formatarDoc(cliente.documento)}</span>
        </span>
    );
};

const NotasFiscais = () => {
    const { hasPermission } = useAuth();
    const podeEmitir = hasPermission('Pode_Emitir_NF');

    const [periodo, periodoCtl] = usePeriodoSalvo('notas-fiscais', 'hoje');
    const [filtroStatus, setFiltroStatus] = useFiltroSalvo('notas-fiscais:status', 'a-emitir');
    const [ambiente, setAmbiente] = useState(null);
    const [pedidos, setPedidos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [emitindo, setEmitindo] = useState(null);       // pedidoId em emissão
    const [consultando, setConsultando] = useState(null); // notaId em consulta
    const [baixando, setBaixando] = useState(null);       // `${notaId}:danfe|xml`
    const [progressoLote, setProgressoLote] = useState(null); // { atual, total }
    const [selecionados, setSelecionados] = useState(() => new Set()); // pedidoIds marcados p/ emitir
    const loteAtivoRef = useRef(false);

    const carregar = useCallback(async (silencioso = false) => {
        if (!silencioso) setLoading(true);
        try {
            const params = {};
            if (periodo.de) params.de = periodo.de;
            if (periodo.ate) params.ate = periodo.ate;
            const resp = await api.get('/notas-fiscais/fila', { params });
            setAmbiente(resp.data?.ambiente || null);
            setPedidos(Array.isArray(resp.data?.pedidos) ? resp.data.pedidos : []);
        } catch (e) {
            if (!silencioso) toast.error(msgErroApi(e, 'Erro ao carregar a fila de notas.'));
        } finally {
            if (!silencioso) setLoading(false);
        }
    }, [periodo.de, periodo.ate]);

    useEffect(() => { carregar(); }, [carregar]);

    // KPIs da fila carregada
    const kpis = useMemo(() => {
        let semNota = 0, processando = 0, autorizadas = 0, comErro = 0;
        for (const p of pedidos) {
            if (p.notaCA) continue; // notas antigas do CA não entram na fila de emissão
            if (!p.nota) semNota++;
            else if (p.nota.status === 'PROCESSANDO') processando++;
            else if (p.nota.status === 'AUTORIZADO') autorizadas++;
            else if (p.nota.status === 'ERRO') comErro++;
        }
        return { semNota, processando, autorizadas, comErro };
    }, [pedidos]);

    const pedidosSemNota = useMemo(
        () => pedidos.filter(p => !p.notaCA && !p.nota),
        [pedidos]
    );

    // Filtro de status (salvo por usuário): a emitir (sem nota/erro/processando) · emitidas · todas
    const pedidosVisiveis = useMemo(() => {
        if (filtroStatus === 'emitidas') return pedidos.filter(p => p.notaCA || p.nota?.status === 'AUTORIZADO');
        if (filtroStatus === 'todas') return pedidos;
        return pedidos.filter(p => !p.notaCA && (!p.nota || ['ERRO', 'PROCESSANDO'].includes(p.nota.status)));
    }, [pedidos, filtroStatus]);

    // Seleção por checkbox: só pedidos elegíveis (sem nota ou com erro) podem ser marcados
    const elegivel = (p) => !p.notaCA && (!p.nota || p.nota.status === 'ERRO');
    const visiveisElegiveis = useMemo(() => pedidosVisiveis.filter(elegivel), [pedidosVisiveis]);
    const selecionadosValidos = useMemo(
        () => visiveisElegiveis.filter(p => selecionados.has(p.id)),
        [visiveisElegiveis, selecionados]
    );
    const alternarSelecao = (id) => setSelecionados(prev => {
        const novo = new Set(prev);
        if (novo.has(id)) novo.delete(id); else novo.add(id);
        return novo;
    });
    const alternarTodos = () => setSelecionados(prev =>
        selecionadosValidos.length === visiveisElegiveis.length && visiveisElegiveis.length > 0
            ? new Set()
            : new Set(visiveisElegiveis.map(p => p.id))
    );

    const temProcessando = useMemo(
        () => pedidos.some(p => p.nota?.status === 'PROCESSANDO'),
        [pedidos]
    );

    // Auto-refresh: enquanto houver nota PROCESSANDO, repolla a fila a cada 10s
    useEffect(() => {
        if (!temProcessando) return;
        const id = setInterval(() => {
            if (!loteAtivoRef.current) carregar(true);
        }, 10000);
        return () => clearInterval(id);
    }, [temProcessando, carregar]);

    // ── Ações ──
    const emitir = async (pedido) => {
        setEmitindo(pedido.id);
        try {
            await api.post(`/notas-fiscais/emitir/${pedido.id}`);
            toast.success(`NF-e do pedido ${pedido.numero != null ? pedido.numero : ''} enviada para emissão.`);
            await carregar(true);
        } catch (e) {
            toast.error(msgErroApi(e, 'Erro ao emitir a NF-e.'));
        } finally {
            setEmitindo(null);
        }
    };

    const emitirTodas = async () => {
        // Com checkboxes marcados emite SÓ os selecionados; sem marcação, todas as elegíveis
        const fila = selecionadosValidos.length > 0 ? selecionadosValidos : pedidosSemNota;
        if (fila.length === 0) return;
        loteAtivoRef.current = true;
        let erros = 0;
        try {
            // Sequencial de propósito (uma por vez) para não sobrecarregar a emissão
            let i = 0;
            for (const pedido of fila) {
                i++;
                setProgressoLote({ atual: i, total: fila.length });
                try {
                    await api.post(`/notas-fiscais/emitir/${pedido.id}`);
                } catch (e) {
                    erros++;
                    toast.error(`Pedido ${pedido.numero != null ? pedido.numero : pedido.id}: ${msgErroApi(e, 'erro ao emitir')}`);
                }
            }
        } finally {
            loteAtivoRef.current = false;
            setProgressoLote(null);
        }
        if (erros === 0) toast.success(`${fila.length} nota(s) enviada(s) para emissão.`);
        else toast(`${fila.length - erros} enviada(s), ${erros} com erro.`, { icon: '⚠️' });
        setSelecionados(new Set());
        await carregar(true);
    };

    const consultar = async (nota) => {
        setConsultando(nota.id);
        try {
            await api.post(`/notas-fiscais/${nota.id}/consultar`);
            await carregar(true);
        } catch (e) {
            toast.error(msgErroApi(e, 'Erro ao consultar o status da nota.'));
        } finally {
            setConsultando(null);
        }
    };

    // DANFE: mesmo padrão do handleDanfe de ListaPedidos.jsx (fetch blob autenticado + abrir)
    const abrirDanfe = async (nota) => {
        setBaixando(`${nota.id}:danfe`);
        try {
            const resp = await api.get(`/notas-fiscais/${nota.id}/danfe`, { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }));
            window.open(url, '_blank'); // visualização de documento (como link externo)
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (e) {
            let msg = 'Erro ao gerar a DANFE.';
            try { msg = JSON.parse(await e.response.data.text()).error || msg; } catch (_) { /* mantém genérica */ }
            toast.error(msg);
        } finally {
            setBaixando(null);
        }
    };

    // XML: download do arquivo (para mandar à contabilidade)
    const baixarXml = async (nota) => {
        setBaixando(`${nota.id}:xml`);
        try {
            const resp = await api.get(`/notas-fiscais/${nota.id}/xml`, { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/xml' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `nfe-${nota.chave || nota.numero || nota.id}.xml`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (e) {
            let msg = 'Erro ao baixar o XML.';
            try { msg = JSON.parse(await e.response.data.text()).error || msg; } catch (_) { /* mantém genérica */ }
            toast.error(msg);
        } finally {
            setBaixando(null);
        }
    };

    // Botões de ação de uma linha/card (compartilhado entre tabela e card mobile)
    const Acoes = ({ pedido }) => {
        const { nota, notaCA } = pedido;
        if (notaCA) return <span className="text-xs text-gray-500">—</span>;

        const btnOutline = 'inline-flex items-center gap-1.5 px-3 py-1.5 md:py-1.5 min-h-[36px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-xs disabled:opacity-50';
        const btnCinza = 'inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-medium text-xs disabled:opacity-50';

        if (!nota || nota.status === 'ERRO') {
            if (!podeEmitir) return <span className="text-xs text-gray-500">—</span>;
            const ocupado = emitindo === pedido.id || progressoLote != null;
            return (
                <button
                    onClick={() => emitir(pedido)}
                    disabled={ocupado}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-xs disabled:opacity-50"
                >
                    {emitindo === pedido.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    {nota ? 'Reemitir NF-e' : 'Emitir NF-e'}
                </button>
            );
        }
        if (nota.status === 'PROCESSANDO') {
            return (
                <button onClick={() => consultar(nota)} disabled={consultando === nota.id} className={btnCinza}>
                    {consultando === nota.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Atualizar
                </button>
            );
        }
        if (nota.status === 'AUTORIZADO') {
            return (
                <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => abrirDanfe(nota)} disabled={baixando === `${nota.id}:danfe`} className={btnOutline}>
                        {baixando === `${nota.id}:danfe` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                        DANFE
                    </button>
                    <button onClick={() => baixarXml(nota)} disabled={baixando === `${nota.id}:xml`} className={btnOutline}>
                        {baixando === `${nota.id}:xml` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileCode2 className="h-3.5 w-3.5" />}
                        XML
                    </button>
                </div>
            );
        }
        return <span className="text-xs text-gray-500">—</span>;
    };

    return (
        <div className="max-w-full overflow-x-hidden -mx-4 sm:-mx-6 lg:-mx-8">
            {/* Topbar */}
            <div className="flex items-center justify-between gap-2 p-3 md:p-6 bg-white border-b border-gray-200">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="bg-amber-100 p-1.5 md:p-2 rounded-lg">
                        <FileText className="h-4 w-4 md:h-5 md:w-5 text-amber-600" />
                    </div>
                    <h1 className="text-base md:text-2xl font-bold text-gray-900 truncate">Notas Fiscais</h1>
                </div>
                {podeEmitir && (pedidosSemNota.length > 0 || selecionadosValidos.length > 0) && (
                    <button
                        onClick={emitirTodas}
                        disabled={progressoLote != null || emitindo != null}
                        className="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 min-h-[36px] bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm text-xs md:text-sm font-semibold disabled:opacity-50"
                    >
                        {progressoLote != null
                            ? (<><Loader2 className="h-4 w-4 animate-spin" /> {progressoLote.atual}/{progressoLote.total}…</>)
                            : selecionadosValidos.length > 0
                                ? (<><Send className="h-4 w-4" /> Emitir selecionadas ({selecionadosValidos.length})</>)
                                : (<><Send className="h-4 w-4" /> Emitir todas ({pedidosSemNota.length})</>)}
                    </button>
                )}
            </div>

            {/* Banner de homologação */}
            {ambiente === 'homologacao' && (
                <div className="mx-3 md:mx-6 mt-3 md:mt-4 flex items-start gap-2 bg-amber-100 border border-amber-300 text-amber-800 rounded-lg px-4 py-3 text-sm font-medium">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>Ambiente de TESTE (homologação) — notas sem valor fiscal.</span>
                </div>
            )}

            <div className="p-3 md:p-6 space-y-4">
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sem nota</div>
                        <div className="text-lg md:text-2xl font-bold text-gray-900 mt-1">{kpis.semNota}</div>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                        <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Processando</div>
                        <div className="text-lg md:text-2xl font-bold text-blue-600 mt-1">{kpis.processando}</div>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                        <div className="text-xs font-semibold text-green-600 uppercase tracking-wide">Autorizadas</div>
                        <div className="text-lg md:text-2xl font-bold text-green-600 mt-1">{kpis.autorizadas}</div>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                        <div className="text-xs font-semibold text-red-600 uppercase tracking-wide">Com erro</div>
                        <div className="text-lg md:text-2xl font-bold text-red-600 mt-1">{kpis.comErro}</div>
                    </div>
                </div>

                {/* Filtros */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 flex flex-col md:flex-row md:items-center gap-2">
                    <FiltroPeriodo periodo={periodo} controle={periodoCtl} className="w-full md:w-auto" />
                    <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
                        {[
                            ['a-emitir', `A emitir (${kpis.semNota + kpis.comErro + kpis.processando})`],
                            ['emitidas', `Emitidas (${kpis.autorizadas})`],
                            ['todas', 'Todas'],
                        ].map(([valor, rotulo]) => (
                            <button
                                key={valor}
                                onClick={() => setFiltroStatus(valor)}
                                className={`px-3 py-1.5 min-h-[36px] rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${filtroStatus === valor
                                    ? 'bg-primary text-white shadow-sm'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                            >
                                {rotulo}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Lista */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                        <FileText className="h-4 w-4 text-amber-600" />
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Fila de emissão</span>
                        {temProcessando && (
                            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-gray-500">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> atualizando a cada 10s
                            </span>
                        )}
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center gap-2 py-12 text-gray-500 text-sm">
                            <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
                        </div>
                    ) : pedidosVisiveis.length === 0 ? (
                        <div className="py-12 text-center text-sm text-gray-500">
                            {pedidos.length === 0 ? 'Nenhum pedido no período selecionado.' : 'Nada neste filtro — troque o filtro acima para ver os demais.'}
                        </div>
                    ) : (
                        <>
                            {/* Mobile: cards */}
                            <div className="md:hidden space-y-3 p-3">
                                {pedidosVisiveis.map(p => (
                                    <div key={p.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                            <span className="flex items-center gap-2 font-semibold text-gray-900">
                                                {podeEmitir && elegivel(p) && (
                                                    <input
                                                        type="checkbox"
                                                        className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
                                                        checked={selecionados.has(p.id)}
                                                        onChange={() => alternarSelecao(p.id)}
                                                    />
                                                )}
                                                Pedido {p.numero != null ? p.numero : '—'}
                                            </span>
                                            <BadgeNota pedido={p} />
                                        </div>
                                        <div className="text-sm text-gray-900">{p.cliente?.nome || '—'}</div>
                                        <div className="mt-1"><BadgeDoc cliente={p.cliente} /></div>
                                        <div className="flex items-center justify-between mt-2 text-sm">
                                            <span className="text-gray-500">
                                                {fmtData(p.dataVenda)}{p.tipoPagamento ? ` · ${p.tipoPagamento}` : ''}
                                            </span>
                                            <span className="font-semibold text-gray-900">R$ {fmt(p.total)}</span>
                                        </div>
                                        {p.nota?.status === 'ERRO' && p.nota?.mensagemSefaz && (
                                            <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                                {p.nota.mensagemSefaz}
                                            </div>
                                        )}
                                        <div className="mt-3">
                                            <Acoes pedido={p} />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Desktop: tabela */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            {podeEmitir && (
                                                <th className="pl-4 pr-1 py-3 w-8">
                                                    <input
                                                        type="checkbox"
                                                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                                                        checked={visiveisElegiveis.length > 0 && selecionadosValidos.length === visiveisElegiveis.length}
                                                        onChange={alternarTodos}
                                                        title="Marcar/desmarcar todas"
                                                    />
                                                </th>
                                            )}
                                            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Pedido #</th>
                                            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                                            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor (R$)</th>
                                            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status da nota</th>
                                            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                        {pedidosVisiveis.map(p => (
                                            <tr key={p.id} className="hover:bg-gray-50">
                                                {podeEmitir && (
                                                    <td className="pl-4 pr-1 py-3 w-8">
                                                        {elegivel(p) && (
                                                            <input
                                                                type="checkbox"
                                                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                                                                checked={selecionados.has(p.id)}
                                                                onChange={() => alternarSelecao(p.id)}
                                                            />
                                                        )}
                                                    </td>
                                                )}
                                                <td className="px-5 py-3 text-gray-900">
                                                    <div className="font-semibold">{p.numero != null ? p.numero : '—'}</div>
                                                    <div className="text-xs text-gray-500">
                                                        {fmtData(p.dataVenda)}{p.tipoPagamento ? ` · ${p.tipoPagamento}` : ''}
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3 text-gray-900">
                                                    <div>{p.cliente?.nome || '—'}</div>
                                                    <div className="mt-0.5"><BadgeDoc cliente={p.cliente} /></div>
                                                </td>
                                                <td className="px-5 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">{fmt(p.total)}</td>
                                                <td className="px-5 py-3">
                                                    <BadgeNota pedido={p} />
                                                    {p.nota?.status === 'AUTORIZADO' && p.nota?.serie != null && (
                                                        <div className="text-xs text-gray-500 mt-1">Série {p.nota.serie}</div>
                                                    )}
                                                    {p.nota?.status === 'ERRO' && p.nota?.mensagemSefaz && (
                                                        <div className="text-xs text-red-700 mt-1 max-w-md">{p.nota.mensagemSefaz}</div>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3"><Acoes pedido={p} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NotasFiscais;
