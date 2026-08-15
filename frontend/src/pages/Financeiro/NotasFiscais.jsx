import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import FiltroPeriodo, { usePeriodoSalvo } from '../../components/FiltroPeriodo';
import { useFiltroSalvo } from '../../hooks/useFiltrosSalvos';
import { formatarDoc } from '../../utils/documento';
import { explicarRejeicao } from '../../utils/rejeicaoNfe';
import clienteService from '../../services/clienteService';
import CanhotosTab from './CanhotosTab';
import {
    FileText, Loader2, RefreshCw, Send, FileDown, FileCode2, AlertTriangle, HelpCircle, Search, Ban
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

// Rejeição da SEFAZ explicada: a mensagem oficial + o que fazer + consulta do
// cadastro do cliente na Receita/SEFAZ na hora (é o que resolve a maioria dos casos).
const AvisoRejeicao = ({ pedido }) => {
    const [aberto, setAberto] = useState(false);
    const [consultando, setConsultando] = useState(false);
    const [consulta, setConsulta] = useState(null);

    const msg = pedido.nota?.mensagemSefaz || '';
    const guia = useMemo(() => explicarRejeicao(msg), [msg]);
    const doc = (pedido.cliente?.documento || '').replace(/[^0-9A-Za-z]/g, '');
    const podeConsultar = guia.conferirCliente && doc.length === 14;

    const conferir = async () => {
        setConsultando(true);
        try {
            setConsulta(await clienteService.consultarCnpj(doc));
        } catch (e) {
            toast.error(msgErroApi(e, 'Não foi possível consultar agora.'));
        } finally {
            setConsultando(false);
        }
    };

    return (
        <div className="mt-2 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2 max-w-xl">
            <div className="text-red-700 font-medium">{msg}</div>
            <button
                type="button"
                onClick={() => setAberto(a => !a)}
                className="mt-1.5 inline-flex items-center gap-1 font-semibold text-red-800 underline underline-offset-2 min-h-[32px]"
            >
                <HelpCircle className="h-3.5 w-3.5" />
                {aberto ? 'Ocultar' : 'O que fazer?'}
            </button>

            {aberto && (
                <div className="mt-2 pt-2 border-t border-red-200 text-gray-700 space-y-2">
                    <div className="font-semibold text-gray-900">{guia.titulo}</div>
                    <ul className="list-disc pl-4 space-y-1">
                        {guia.passos.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>

                    {podeConsultar && (
                        <button
                            type="button"
                            onClick={conferir}
                            disabled={consultando}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium min-h-[36px] disabled:opacity-50"
                        >
                            {consultando
                                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Consultando…</>
                                : <><Search className="h-3.5 w-3.5" /> Conferir na Receita/SEFAZ</>}
                        </button>
                    )}

                    {consulta && (
                        <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 space-y-0.5">
                            {!consulta.encontrado ? (
                                <div className="text-gray-700">CNPJ não encontrado na Receita Federal.</div>
                            ) : (
                                <>
                                    <div className="font-semibold text-gray-900">{consulta.razaoSocial || '—'}</div>
                                    <div>
                                        CNPJ: <strong className={consulta.ativa ? 'text-green-700' : 'text-red-700'}>
                                            {consulta.situacao || '—'}
                                        </strong>
                                    </div>
                                    <div>
                                        Inscrição estadual: <strong className={consulta.ieConsulta?.situacao === 'HABILITADO' ? 'text-green-700' : 'text-red-700'}>
                                            {consulta.ieConsulta?.situacao
                                                ? consulta.ieConsulta.situacao.replace(/_/g, ' ').toLowerCase()
                                                : (consulta.inscricaoEstadual || 'não informada')}
                                        </strong>
                                        {consulta.inscricaoEstadual ? ` (${consulta.inscricaoEstadual})` : ''}
                                    </div>
                                    {(!consulta.ativa || consulta.ieConsulta?.situacao === 'NAO_HABILITADO') && (
                                        <div className="pt-1 text-red-700">
                                            É este o motivo da recusa. Não adianta reemitir: a empresa do cliente
                                            está encerrada ou bloqueada na SEFAZ. Fale com o cliente para conseguir
                                            o CNPJ novo — ou faturar no CPF dele.
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
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
    const podeCancelarPedido = hasPermission('Pode_Excluir_Pedido');

    // A fila de emissão é uma tela de HOJE ("o que falta emitir agora").
    const [periodo, periodoCtl] = usePeriodoSalvo('notas-fiscais', 'hoje');
    /**
     * A aba Canhotos tem MEMÓRIA DE PERÍODO PRÓPRIA, com padrão 'mes'.
     *
     * Ela é sobre a pasta física do MÊS. Nascendo em 'hoje' (o padrão certo da fila), o
     * mutirão quebrava de três jeitos, todos silenciosos: a barra dizia "100% no arquivo"
     * contando só as notas do dia, enquanto o cabeçalho anunciava a pasta do mês inteiro;
     * "Colocar o mês em dia" respondia "já estava em dia" sem trazer nada; e bipar pelo
     * NÚMERO uma folha de anteontem voltava "não encontrada" (o backend usa de/ate como
     * janela de busca). A pessoa abria com a pasta do mês na mão, via tudo verde e
     * concluía que o sistema estava quebrado.
     *
     * São dois `usePeriodoSalvo`, mas só UM controle é renderizado por vez (o da aba
     * ativa) — a tela continua com um seletor só, e cada contexto lembra o seu. Forçar o
     * preset no período compartilhado mudaria o filtro das outras abas pelas costas.
     */
    const [periodoCanhotos, periodoCanhotosCtl] = usePeriodoSalvo('notas-fiscais-canhotos', 'mes');
    const [filtroStatus, setFiltroStatus] = useFiltroSalvo('notas-fiscais:status', 'a-emitir');
    const [totalCanhotos, setTotalCanhotos] = useState(null); // contador da aba Canhotos
    const [ambiente, setAmbiente] = useState(null);
    const [truncado, setTruncado] = useState(false);
    const [pedidos, setPedidos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [emitindo, setEmitindo] = useState(null);       // pedidoId em emissão
    const [consultando, setConsultando] = useState(null); // notaId em consulta
    const [baixando, setBaixando] = useState(null);       // `${notaId}:danfe|xml`
    const [progressoLote, setProgressoLote] = useState(null); // { atual, total }
    const [cancelando, setCancelando] = useState(null);   // pedidoId em cancelamento
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
            setTruncado(Boolean(resp.data?.truncado));
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

    // Contador da aba "Emitidas": mesmo critério do filtro (inclui as antigas do CA)
    const totalEmitidas = useMemo(
        () => pedidos.filter(p => p.notaCA || p.nota?.status === 'AUTORIZADO').length,
        [pedidos]
    );

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

    // Auto-refresh: enquanto houver nota PROCESSANDO, repolla a fila a cada 10s.
    // NÃO roda na aba Canhotos: `/fila` é o endpoint pesado (sincroniza e traz até 2000
    // pedidos) e ficaria batendo a cada 10s durante um mutirão de 20 minutos, sem que
    // nada dele apareça nessa aba.
    useEffect(() => {
        if (!temProcessando || filtroStatus === 'canhotos') return;
        const id = setInterval(() => {
            if (!loteAtivoRef.current) carregar(true);
        }, 10000);
        return () => clearInterval(id);
    }, [temProcessando, carregar, filtroStatus]);

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

    // Cancelar o pedido quando a venda não vai acontecer (cliente baixado na Receita,
    // desistência): sai desta fila e nunca mais emite NF-e. Só enquanto não há nota emitida.
    const cancelarPedido = async (pedido) => {
        const motivo = window.prompt(
            `Cancelar o pedido ${pedido.numero != null ? `nº ${pedido.numero}` : ''} de ${pedido.cliente?.nome || 'cliente'}?\n\n` +
            'O pedido continua no histórico, mas sai desta fila e não vai mais emitir NF-e.\n\n' +
            'Motivo do cancelamento:'
        );
        if (motivo === null) return;
        setCancelando(pedido.id);
        try {
            await api.put(`/pedidos/${pedido.id}/cancelar`, { motivo });
            toast.success('Pedido cancelado — saiu da fila de emissão.');
            await carregar(true);
        } catch (e) {
            toast.error(msgErroApi(e, 'Erro ao cancelar o pedido.'));
        } finally {
            setCancelando(null);
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

    // ZIP com os XMLs do período (p/ mandar à contabilidade)
    const [baixandoXmls, setBaixandoXmls] = useState(false);
    const baixarXmlsZip = async () => {
        if (!periodo.de || !periodo.ate) {
            toast.error('Escolha um período com início e fim (ex.: Este mês) para exportar os XMLs.');
            return;
        }
        setBaixandoXmls(true);
        try {
            const resp = await api.get('/notas-fiscais/xmls-zip', {
                params: { de: periodo.de, ate: periodo.ate },
                responseType: 'blob',
            });
            const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/zip' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `xmls-nfe-${periodo.de}-a-${periodo.ate}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (e) {
            toast.error(msgErroApi(e, 'Erro ao exportar os XMLs.'));
        } finally {
            setBaixandoXmls(false);
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
            if (!podeEmitir && !podeCancelarPedido) return <span className="text-xs text-gray-500">—</span>;
            const ocupado = emitindo === pedido.id || progressoLote != null;
            return (
                <div className="flex items-center gap-2 flex-wrap">
                    {podeEmitir && (
                        <button
                            onClick={() => emitir(pedido)}
                            disabled={ocupado}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-xs disabled:opacity-50"
                        >
                            {emitindo === pedido.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            {nota ? 'Reemitir NF-e' : 'Emitir NF-e'}
                        </button>
                    )}
                    {podeCancelarPedido && (
                        <button
                            onClick={() => cancelarPedido(pedido)}
                            disabled={cancelando === pedido.id || progressoLote != null}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] bg-white border border-amber-500 text-amber-700 hover:bg-amber-50 rounded-full font-medium text-xs disabled:opacity-50"
                            title="A venda não vai acontecer: tira o pedido da fila e trava a emissão da NF-e"
                        >
                            {cancelando === pedido.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                            Cancelar pedido
                        </button>
                    )}
                </div>
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
                {filtroStatus !== 'canhotos' && podeEmitir && (pedidosSemNota.length > 0 || selecionadosValidos.length > 0) && (
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

            {/* Período grande demais: a lista veio cortada — avisar em vez de esconder notas.
                Só nas abas da fila: a aba Canhotos mostra o aviso equivalente dela, e os
                dois juntos viravam dois banners âmbar quase idênticos na mesma tela. */}
            {filtroStatus !== 'canhotos' && truncado && (
                <div className="mx-3 md:mx-6 mt-3 md:mt-4 flex items-start gap-2 bg-amber-100 border border-amber-300 text-amber-800 rounded-lg px-4 py-3 text-sm font-medium">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>O período escolhido tem pedidos demais — mostrando só os {pedidos.length} mais recentes. Escolha um período menor (ex.: um mês) para ver tudo.</span>
                </div>
            )}

            <div className="p-3 md:p-6 space-y-4">
                {/* KPIs — da fila de emissão; a aba Canhotos traz os contadores dela */}
                {filtroStatus !== 'canhotos' && (
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
                )}

                {/* Filtros */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 flex flex-col md:flex-row md:items-center gap-2">
                    {/* UM seletor por vez — o da aba ativa. A aba Canhotos usa a memória
                        própria dela (padrão "Este mês"); "Todo o período" fica escondido
                        porque devolve datas vazias e o arquivo é organizado por mês. */}
                    {filtroStatus === 'canhotos' ? (
                        <FiltroPeriodo
                            periodo={periodoCanhotos}
                            controle={periodoCanhotosCtl}
                            className="w-full md:w-auto"
                            ocultarPresets={['todo']}
                        />
                    ) : (
                        <FiltroPeriodo periodo={periodo} controle={periodoCtl} className="w-full md:w-auto" />
                    )}
                    <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
                        {[
                            ['a-emitir', `A emitir (${kpis.semNota + kpis.comErro + kpis.processando})`],
                            ['emitidas', `Emitidas (${totalEmitidas})`],
                            ['canhotos', totalCanhotos == null ? 'Canhotos' : `Canhotos (${totalCanhotos})`],
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
                    {/* Some na aba Canhotos: `baixarXmlsZip` usa o período da FILA, e ali o
                        único seletor visível é o dos Canhotos. A pessoa veria "Este mês",
                        clicaria, e receberia o ZIP de UM DIA — mandando para a contabilidade
                        um mês incompleto sem nada na tela denunciar. É ação da fila de
                        emissão, então acompanha o resto da barra. */}
                    {filtroStatus !== 'canhotos' && (
                    <button
                        onClick={baixarXmlsZip}
                        disabled={baixandoXmls}
                        title="Baixa um ZIP com todos os XMLs do período (para a contabilidade)"
                        className="md:ml-auto flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] bg-white border border-primary text-primary rounded-full text-xs font-bold hover:bg-mint/40 disabled:opacity-50 whitespace-nowrap"
                    >
                        {baixandoXmls ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                        XMLs (contabilidade)
                    </button>
                    )}
                </div>

                {/* Aba Canhotos: o arquivo do mês. Reaproveita o MESMO FiltroPeriodo acima
                    — dois seletores de data na mesma tela fariam a equipe errar o mês. */}
                {filtroStatus === 'canhotos' ? (
                    <CanhotosTab periodo={periodoCanhotos} onTotal={setTotalCanhotos} />
                ) : (
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
                                            <AvisoRejeicao pedido={p} />
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
                                                        <AvisoRejeicao pedido={p} />
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
                )}
            </div>
        </div>
    );
};

export default NotasFiscais;
