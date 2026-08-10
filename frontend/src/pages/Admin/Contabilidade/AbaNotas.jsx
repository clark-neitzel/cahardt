// Contabilidade — aba NOTAS DE ENTRADA (Fase 4): NF-e de produto e NFS-e de serviço
// com as parcelas a pagar de cada nota (gerou conta / vinculada / sem pagamento).
import { useState, useEffect, useCallback } from 'react';
import { Filter, Download, Printer, RefreshCw, FileDown, FileArchive } from 'lucide-react';
import api from '../../../services/api';
import FiltroPeriodo, { usePeriodoSalvo } from '../../../components/FiltroPeriodo';
import { useFiltrosSalvos } from '../../../hooks/useFiltrosSalvos';
import { fmtData, fmtVal, fmtNumCsv, baixarCsv, csvTexto, imprimirTabela, baixarArquivoApi } from './comum';

const DESTINO_BADGE = {
    GEROU_CP: { label: 'Gerou contas a pagar', cls: 'bg-green-100 text-green-800' },
    VINCULADA: { label: 'Vinculada a parcelas já lançadas', cls: 'bg-blue-100 text-blue-800' },
    SEM_PAGAMENTO: { label: 'Sem pagamento', cls: 'bg-amber-100 text-amber-700' },
    PENDENTE: { label: 'Pendente de conferência', cls: 'bg-gray-100 text-gray-700' },
    IGNORADA: { label: 'Ignorada', cls: 'bg-gray-100 text-gray-700' },
    CANCELADA: { label: 'Cancelada pelo emitente', cls: 'bg-red-100 text-red-700' },
};
const MOTIVO_LABEL = { BONIFICACAO: 'bonificação', AMOSTRA: 'amostra', REMESSA_TROCA: 'remessa/troca', COMODATO: 'comodato', OUTRO: 'outro' };

export default function AbaNotas() {
    const [filtros, setFiltros] = useFiltrosSalvos('contabilidade-notas', { tipo: 'todos' });
    const [periodo, ctlPeriodo] = usePeriodoSalvo('contabilidade-notas-periodo', 'mes');
    const [dados, setDados] = useState({ resumo: null, linhas: [] });
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState('');

    const buscar = useCallback(async () => {
        setLoading(true); setErro('');
        try {
            const params = {};
            if (periodo.de) params.de = periodo.de;
            if (periodo.ate) params.ate = periodo.ate;
            if (filtros.tipo !== 'todos') params.tipo = filtros.tipo;
            const { data } = await api.get('/contabilidade/notas-entrada-relatorio', { params });
            setDados(data);
        } catch (e) {
            setErro(e.response?.data?.error || 'Erro ao carregar as notas.');
        } finally { setLoading(false); }
    }, [filtros.tipo, periodo.de, periodo.ate]);
    useEffect(() => { buscar(); }, [buscar]);

    const CAB = ['Nota', 'Tipo', 'Fornecedor', 'CNPJ', 'Emissão', 'Entrada', 'Valor', 'Financeiro', 'Parcelas'];
    const linhaCsv = (l) => [l.numero || l.chave?.slice(-8) || '', l.tipo, csvTexto(l.fornecedor), csvTexto(l.fornecedorDoc),
        fmtData(l.emissao), l.dataEntrada ? fmtData(l.dataEntrada) : '', fmtNumCsv(l.valor),
        (DESTINO_BADGE[l.destino]?.label || l.destino) + (l.motivoEntrada ? ` (${MOTIVO_LABEL[l.motivoEntrada] || l.motivoEntrada})` : ''),
        csvTexto(l.parcelas.map((p) => `${p.rotulo}: ${fmtNumCsv(p.valor)} venc ${fmtData(p.vencimento)} ${p.status}${p.bancoNome ? ' ' + p.bancoNome : ''}`).join(' | '))];

    const exportar = () => baixarCsv('contabilidade-notas-entrada.csv', CAB, dados.linhas.map(linhaCsv));
    const baixarZip = () => baixarArquivoApi('/contabilidade/notas-entrada-zip',
        { de: periodo.de || undefined, ate: periodo.ate || undefined, tipo: filtros.tipo !== 'todos' ? filtros.tipo : undefined }, 'xmls-entrada.zip')
        .catch((e) => setErro(e.response?.status === 404 ? 'Nenhum XML no período.' : 'Não deu para gerar o ZIP.'));
    const baixarXml = (id) => baixarArquivoApi(`/contabilidade/notas-entrada/${id}/xml`, {}, 'nota.xml')
        .catch(() => setErro('XML indisponível para esta nota.'));
    const imprimir = () => imprimirTabela(
        'Contabilidade — Notas de Entrada',
        `${dados.linhas.length} notas · ${fmtVal(dados.resumo?.valorTotal)}`,
        CAB, dados.linhas.map((l) => linhaCsv(l).map((v) => String(v).replace(/^"|"$/g, '').replace(/""/g, '"')))
    );

    const resumo = dados.resumo;

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
                <button onClick={exportar} disabled={!dados.linhas.length}
                    className="px-3 py-1.5 md:px-4 md:py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-xs md:text-sm inline-flex items-center gap-1.5 disabled:opacity-40">
                    <Download className="h-4 w-4" /> CSV
                </button>
                <button onClick={baixarZip}
                    className="px-3 py-1.5 md:px-4 md:py-2 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-xs md:text-sm inline-flex items-center gap-1.5">
                    <FileArchive className="h-4 w-4" /> ZIP dos XMLs
                </button>
                <button onClick={imprimir} disabled={!dados.linhas.length}
                    className="px-3 py-1.5 md:px-4 md:py-2 bg-white border border-gray-300 text-gray-700 rounded-full font-medium text-xs md:text-sm inline-flex items-center gap-1.5 disabled:opacity-40">
                    <Printer className="h-4 w-4" /> Imprimir / PDF
                </button>
                <button onClick={buscar} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100" title="Atualizar">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">NF-e produto</div>
                    <div className="text-lg md:text-xl font-bold text-gray-900">{resumo ? resumo.nfe : '—'}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">NFS-e serviço</div>
                    <div className="text-lg md:text-xl font-bold text-gray-900">{resumo ? resumo.nfse : '—'}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor total</div>
                    <div className="text-lg md:text-xl font-bold text-gray-900">{resumo ? fmtVal(resumo.valorTotal) : '—'}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sem pagamento</div>
                    <div className="text-lg md:text-xl font-bold text-amber-700">{resumo ? resumo.semPagamento : '—'}</div>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 flex-wrap">
                    <Filter className="h-4 w-4 text-primaryDark" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Filtros</span>
                    <div className="ml-auto flex items-center gap-1 bg-gray-200 rounded-full p-0.5">
                        {[['todos', 'Todas'], ['NFE', 'Produto (NF-e)'], ['NFSE', 'Serviço (NFS-e)']].map(([v, rot]) => (
                            <button key={v} onClick={() => setFiltros({ ...filtros, tipo: v })}
                                className={`px-3 py-1 rounded-full text-xs font-bold ${filtros.tipo === v ? 'bg-white text-primaryDark shadow-sm' : 'text-gray-600'}`}>
                                {rot}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="p-4 md:p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Emissão</label>
                        <FiltroPeriodo periodo={periodo} controle={ctlPeriodo} className="w-full" />
                    </div>
                </div>
            </div>

            {erro && <div className="bg-red-100 text-red-700 rounded-xl p-4 text-sm font-medium">{erro}</div>}

            {/* Desktop */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="px-5 py-3.5 border-b border-gray-100">
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">
                        Notas de entrada — {dados.linhas.length}
                        {loading && <span className="ml-2 text-gray-400 normal-case font-normal">carregando…</span>}
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50"><tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Nota</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Fornecedor</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Emissão</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Entrada</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Financeiro</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">XML</th>
                        </tr></thead>
                        <tbody className="bg-white divide-y divide-gray-200 text-sm">
                            {dados.linhas.map((l) => {
                                const d = DESTINO_BADGE[l.destino] || { label: l.destino, cls: 'bg-gray-100 text-gray-700' };
                                return [
                                    <tr key={l.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-2.5">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${l.tipo === 'NFSE' ? 'bg-mint text-primaryDark' : 'bg-blue-100 text-blue-800'}`}>
                                                {l.tipo === 'NFSE' ? 'NFS-e' : 'NF-e'} {l.numero || ''}
                                            </span>
                                            {l.chave && <div className="text-xs text-gray-400 mt-0.5">chave …{String(l.chave).slice(-6)}</div>}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <span className="font-semibold text-gray-900">{l.fornecedor}</span>
                                            {l.fornecedorDoc && <div className="text-xs text-gray-500">{l.fornecedorDoc}</div>}
                                        </td>
                                        <td className="px-4 py-2.5 whitespace-nowrap">{fmtData(l.emissao)}</td>
                                        <td className="px-4 py-2.5 whitespace-nowrap">{l.dataEntrada ? fmtData(l.dataEntrada) : '—'}</td>
                                        <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">{l.valor != null ? fmtVal(l.valor) : '—'}</td>
                                        <td className="px-4 py-2.5">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${d.cls}`}>
                                                {d.label}{l.motivoEntrada ? ` — ${MOTIVO_LABEL[l.motivoEntrada] || l.motivoEntrada}` : ''}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            {l.temXml ? (
                                                <button onClick={() => baixarXml(l.id)} className="text-primary hover:text-primaryDark text-xs font-semibold inline-flex items-center gap-1">
                                                    <FileDown className="h-3.5 w-3.5" /> Baixar
                                                </button>
                                            ) : <span className="text-xs text-gray-400">—</span>}
                                        </td>
                                    </tr>,
                                    ...l.parcelas.map((p, i) => (
                                        <tr key={`${l.id}-p${i}`} className="bg-stone-50">
                                            <td className="px-4 py-1.5 pl-8 text-xs text-gray-500" colSpan={2}>↳ {p.rotulo} · venc. {fmtData(p.vencimento)}</td>
                                            <td className="px-4 py-1.5 text-xs text-gray-500" colSpan={2}>{p.dataPagamento ? `paga ${fmtData(p.dataPagamento)}` : ''}{p.bancoNome ? ` · ${p.bancoNome}` : ''}</td>
                                            <td className="px-4 py-1.5 text-right text-xs text-gray-600">{fmtVal(p.valor)}</td>
                                            <td className="px-4 py-1.5" colSpan={2}>
                                                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${p.status === 'PAGO' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>{p.status}</span>
                                            </td>
                                        </tr>
                                    ))
                                ];
                            })}
                            {!loading && dados.linhas.length === 0 && (
                                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-sm">Nenhuma nota no período.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Mobile */}
            <div className="md:hidden space-y-3">
                {dados.linhas.map((l) => {
                    const d = DESTINO_BADGE[l.destino] || { label: l.destino, cls: 'bg-gray-100 text-gray-700' };
                    return (
                        <div key={l.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                            <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold text-gray-900 truncate">{l.fornecedor}</span>
                                <span className="font-bold">{l.valor != null ? fmtVal(l.valor) : '—'}</span>
                            </div>
                            <div className="text-xs text-gray-500 mb-2">{l.tipo === 'NFSE' ? 'NFS-e' : 'NF-e'} {l.numero || ''} · emissão {fmtData(l.emissao)}</div>
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${d.cls}`}>{d.label}</span>
                            {l.parcelas.length > 0 && (
                                <div className="text-xs text-gray-500 mt-2">
                                    {l.parcelas.map((p, i) => <div key={i}>↳ {p.rotulo}: {fmtVal(p.valor)} · {p.status}{p.bancoNome ? ` · ${p.bancoNome}` : ''}</div>)}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
