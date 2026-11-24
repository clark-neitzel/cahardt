import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { useFiltroSalvo } from '../../hooks/useFiltrosSalvos';
import { formatarDoc } from '../../utils/documento';
import {
    FileText, Loader2, RefreshCw, Send, FileDown, FileCode2, AlertTriangle, RotateCcw
} from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Aba "Devoluções" da tela Notas Fiscais: TODAS as devoluções do período, com a situação da
 * NF-e de devolução de cada uma (emitida ou não). A emissão automática do Caixa continua
 * sendo o caminho principal; aqui é a visão geral + o botão de emitir/reemitir.
 * Fonte: GET /api/notas-fiscais/devolucoes (mesma consulta alimenta a pílula e as linhas).
 */

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
const msgErroApi = (e, padrao) => e?.response?.data?.error || padrao;

const FILTROS = [
    ['todas', 'Todas'],
    ['SEM_NOTA', 'Sem nota'],
    ['REJEITADA', 'Rejeitadas'],
    ['AUTORIZADA', 'Autorizadas'],
    ['NAO_EMITE', 'Não emitem'],
];

const btnOutline = 'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 min-h-[44px] md:min-h-[36px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-xs disabled:opacity-50';
const btnPrimario = 'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 min-h-[44px] md:min-h-[36px] bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-xs disabled:opacity-50';

const BadgeDoc = ({ cliente }) => {
    if (!cliente?.documento) return null;
    return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-semibold rounded bg-gray-100 text-gray-600">
            Doc <span className="font-normal">{formatarDoc(cliente.documento)}</span>
        </span>
    );
};

const badge = 'inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full';

// Selo da situação da NF + detalhe (texto pequeno) logo abaixo
const SeloSituacao = ({ d }) => {
    const nota = d.nota;
    switch (d.situacaoNf) {
        case 'AUTORIZADA': {
            const serie = nota?.serie != null && nota.serie !== '' ? ` · Série ${nota.serie}` : '';
            return (
                <div>
                    <span className={`${badge} bg-green-100 text-green-800`}>
                        ✓ NF {nota?.numero != null ? nota.numero : ''}
                    </span>
                    {serie && <div className="text-xs text-gray-500 mt-1">{serie.replace(' · ', '')}</div>}
                </div>
            );
        }
        case 'PROCESSANDO':
            return <span className={`${badge} bg-blue-100 text-blue-800 gap-1`}><Loader2 className="h-3 w-3 animate-spin" /> Processando</span>;
        case 'REJEITADA':
            return (
                <div>
                    <span className={`${badge} bg-red-100 text-red-700`}>✕ Rejeitada</span>
                    {nota?.mensagemSefaz && (
                        <div className="mt-1.5 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2 break-words">
                            {nota.mensagemSefaz}
                        </div>
                    )}
                </div>
            );
        case 'CANCELADA':
            return <span className={`${badge} bg-red-100 text-red-700`}>Cancelada</span>;
        case 'NAO_EMITE':
            return (
                <div>
                    <span className={`${badge} bg-gray-100 text-gray-700`}>Não emite</span>
                    {d.motivoNaoEmite && <div className="text-xs text-gray-500 mt-1">{d.motivoNaoEmite}</div>}
                </div>
            );
        default: // SEM_NOTA
            return (
                <div>
                    <span className={`${badge} bg-gray-100 text-gray-700`}>Sem nota</span>
                    {d.bloqueioEmissao && <div className="text-xs text-gray-500 mt-1">{d.bloqueioEmissao}</div>}
                </div>
            );
    }
};

const SeloRevertida = ({ d }) => d.status === 'REVERTIDA' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-gray-200 text-gray-600">
        <RotateCcw className="h-3 w-3" /> Revertida
    </span>
) : null;

const DevolucoesNfTab = ({ periodo, ativa, onTotal }) => {
    const { hasPermission } = useAuth();
    // Espelha o checkEmitirDevolucao do backend: admin || Pode_Emitir_NF || Pode_Fazer_Devolucao
    // (hasPermission já devolve true para admin e lê o campo como booleano).
    const podeEmitirDev = hasPermission('Pode_Emitir_NF') || hasPermission('Pode_Fazer_Devolucao');

    const [situacao, setSituacao] = useFiltroSalvo('notas-fiscais-devolucoes:situacao', 'todas');
    const [devolucoes, setDevolucoes] = useState([]);
    const [truncado, setTruncado] = useState(false);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState(null);
    const [emitindo, setEmitindo] = useState(null);
    const emitindoRef = useRef(null); // trava síncrona contra clique duplo
    const [baixando, setBaixando] = useState(null);
    const reqRef = useRef(0);

    const carregar = useCallback(async (silencioso = false) => {
        const req = ++reqRef.current;
        if (!silencioso) setLoading(true);
        try {
            const params = {};
            if (periodo?.de) params.de = periodo.de;
            if (periodo?.ate) params.ate = periodo.ate;
            const resp = await api.get('/notas-fiscais/devolucoes', { params });
            if (req !== reqRef.current) return; // resposta de um período antigo
            const lista = Array.isArray(resp.data?.devolucoes) ? resp.data.devolucoes : [];
            setDevolucoes(lista);
            setTruncado(Boolean(resp.data?.truncado));
            setErro(null);
            onTotal?.(lista.length);
        } catch (e) {
            if (req !== reqRef.current) return;
            if (!silencioso) {
                setErro(msgErroApi(e, 'Erro ao carregar as devoluções.'));
                setDevolucoes([]);
                onTotal?.(null);
            }
        } finally {
            if (req === reqRef.current && !silencioso) setLoading(false);
        }
    }, [periodo?.de, periodo?.ate, onTotal]);

    useEffect(() => { carregar(); }, [carregar]);

    const temProcessando = useMemo(() => devolucoes.some(d => d.situacaoNf === 'PROCESSANDO'), [devolucoes]);

    // Enquanto houver NF processando (e a aba aberta), repolla a cada 10s
    useEffect(() => {
        if (!ativa || !temProcessando) return;
        const id = setInterval(() => carregar(true), 10000);
        return () => clearInterval(id);
    }, [ativa, temProcessando, carregar]);

    // As contagens dos chips saem da lista COMPLETA do período (não da filtrada)
    const contagens = useMemo(() => {
        const c = { todas: devolucoes.length };
        for (const d of devolucoes) c[d.situacaoNf] = (c[d.situacaoNf] || 0) + 1;
        return c;
    }, [devolucoes]);

    const visiveis = useMemo(() => {
        if (situacao === 'todas') return devolucoes;
        return devolucoes.filter(d => d.situacaoNf === situacao);
    }, [devolucoes, situacao]);

    const emitir = async (d) => {
        if (emitindoRef.current) return;
        emitindoRef.current = d.id;
        setEmitindo(d.id);
        try {
            await api.post(`/notas-fiscais/emitir-devolucao/${d.id}`);
            toast.success(`NF de devolução${d.numero != null ? ` DEV#${d.numero}` : ''} enviada para emissão.`);
            await carregar(true);
        } catch (e) {
            toast.error(msgErroApi(e, 'Erro ao emitir a NF de devolução.'),
                { duration: 10000, style: { maxWidth: '480px', whiteSpace: 'pre-line', overflowWrap: 'anywhere', wordBreak: 'break-word' } });
        } finally {
            emitindoRef.current = null;
            setEmitindo(null);
        }
    };

    const abrirDanfe = async (nota) => {
        setBaixando(`${nota.id}:danfe`);
        try {
            const resp = await api.get(`/notas-fiscais/${nota.id}/danfe`, { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }));
            window.open(url, '_blank'); // visualização de documento (mesmo padrão das outras abas)
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (e) {
            let msg = 'Erro ao abrir a DANFE da devolução.';
            try { msg = JSON.parse(await e.response.data.text()).error || msg; } catch (_) { /* mantém genérica */ }
            toast.error(msg);
        } finally {
            setBaixando(null);
        }
    };

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

    const Acoes = ({ d }) => {
        const nota = d.nota;
        const botoes = [];
        if (d.situacaoNf === 'AUTORIZADA' && nota) {
            botoes.push(
                <button key="danfe" onClick={() => abrirDanfe(nota)} disabled={baixando === `${nota.id}:danfe`} className={btnOutline}>
                    {baixando === `${nota.id}:danfe` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                    DANFE
                </button>,
                <button key="xml" onClick={() => baixarXml(nota)} disabled={baixando === `${nota.id}:xml`} className={btnOutline}>
                    {baixando === `${nota.id}:xml` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileCode2 className="h-3.5 w-3.5" />}
                    XML
                </button>
            );
        }
        const podeBotao = podeEmitirDev && d.podeEmitir === true
            && ['SEM_NOTA', 'REJEITADA', 'CANCELADA'].includes(d.situacaoNf);
        if (podeBotao) {
            botoes.push(
                <button key="emitir" onClick={() => emitir(d)} disabled={emitindo != null} className={btnPrimario}>
                    {emitindo === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    {d.situacaoNf === 'SEM_NOTA' ? 'Emitir NF de devolução' : 'Emitir novamente'}
                </button>
            );
        }
        if (botoes.length === 0) return <span className="text-xs text-gray-500">—</span>;
        return <div className="flex items-center gap-2 flex-wrap">{botoes}</div>;
    };

    // Fica montada (para a pílula mostrar o número), mas só desenha quando a aba está ativa
    if (!ativa) return null;

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                <RotateCcw className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">NF-e de devolução</span>
                {temProcessando ? (
                    <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-gray-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> atualizando a cada 10s
                    </span>
                ) : (
                    <button onClick={() => carregar()} disabled={loading} className="ml-auto p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 disabled:opacity-50" title="Atualizar">
                        <RefreshCw className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* Filtro de situação — contagens da lista completa do período */}
            <div className="flex gap-1.5 overflow-x-auto hide-scrollbar px-3 md:px-5 py-3 border-b border-gray-100">
                {FILTROS.map(([valor, rotulo]) => (
                    <button
                        key={valor}
                        onClick={() => setSituacao(valor)}
                        className={`px-3 py-1.5 min-h-[36px] rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${situacao === valor
                            ? 'bg-primary text-white shadow-sm'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                        {rotulo} ({contagens[valor] || 0})
                    </button>
                ))}
            </div>

            {truncado && (
                <div className="mx-3 md:mx-5 mt-3 flex items-start gap-2 bg-amber-100 border border-amber-300 text-amber-800 rounded-lg px-4 py-3 text-sm font-medium">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>O período tem devoluções demais — mostrando só as {devolucoes.length} mais recentes. Escolha um período menor (ex.: um mês) para ver tudo.</span>
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-gray-500 text-sm">
                    <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
                </div>
            ) : erro ? (
                <div className="py-12 px-4 text-center text-sm text-red-700">{erro}</div>
            ) : visiveis.length === 0 ? (
                <div className="py-12 px-4 text-center text-sm text-gray-500">
                    <FileText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    {devolucoes.length === 0
                        ? 'Nenhuma devolução no período selecionado.'
                        : 'Nenhuma devolução nesta situação — troque o filtro acima para ver as demais.'}
                </div>
            ) : (
                <>
                    {/* Mobile: cards */}
                    <div className="md:hidden space-y-3 p-3">
                        {visiveis.map(d => (
                            <div key={d.id} className={`rounded-xl border border-gray-200 shadow-sm p-4 ${d.status === 'REVERTIDA' ? 'bg-gray-50' : 'bg-white'}`}>
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="min-w-0">
                                        <div className="font-semibold text-gray-900">
                                            {d.numero != null ? `DEV#${d.numero}` : 'Devolução'}
                                            {d.pedido?.rotulo && <span className="font-normal text-gray-500"> · pedido {d.pedido.rotulo}</span>}
                                        </div>
                                        <div className="text-xs text-gray-500">{fmtData(d.dataDevolucao)}</div>
                                    </div>
                                    <div className="font-bold text-gray-900 whitespace-nowrap">R$ {fmt(d.valorTotal)}</div>
                                </div>
                                <div className="text-sm text-gray-900 break-words">{d.cliente?.nome || '—'}</div>
                                <div className="mt-1 flex flex-wrap gap-1"><BadgeDoc cliente={d.cliente} /><SeloRevertida d={d} /></div>
                                <div className="mt-3"><SeloSituacao d={d} /></div>
                                <div className="mt-3"><Acoes d={d} /></div>
                            </div>
                        ))}
                    </div>

                    {/* Desktop: tabela */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    {['Devolução', 'Pedido', 'Cliente', 'Data', 'Valor', 'NF-e', 'Ações'].map(h => (
                                        <th key={h} className={`px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${h === 'Valor' ? 'text-right' : 'text-left'}`}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                {visiveis.map(d => (
                                    <tr key={d.id} className={`hover:bg-gray-50 align-top ${d.status === 'REVERTIDA' ? 'bg-gray-50' : ''}`}>
                                        <td className="px-5 py-3 font-semibold text-gray-900 whitespace-nowrap">
                                            {d.numero != null ? `DEV#${d.numero}` : '—'}
                                            <div><SeloRevertida d={d} /></div>
                                        </td>
                                        <td className="px-5 py-3 text-gray-900 whitespace-nowrap">{d.pedido?.rotulo || '—'}</td>
                                        <td className="px-5 py-3 text-gray-900">
                                            <div className="break-words">{d.cliente?.nome || '—'}</div>
                                            <div className="mt-0.5"><BadgeDoc cliente={d.cliente} /></div>
                                        </td>
                                        <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{fmtData(d.dataDevolucao)}</td>
                                        <td className="px-5 py-3 text-right text-gray-900 whitespace-nowrap">R$ {fmt(d.valorTotal)}</td>
                                        <td className="px-5 py-3 max-w-xs"><SeloSituacao d={d} /></td>
                                        <td className="px-5 py-3"><Acoes d={d} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
};

export default DevolucoesNfTab;
