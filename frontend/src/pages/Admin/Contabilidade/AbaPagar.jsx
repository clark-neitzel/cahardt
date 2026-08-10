// Contabilidade — aba CONTAS A PAGAR (Fase 2)
// Visões: Contas (competência, com rateio DRE aberto por linha) · Pagamentos (caixa,
// com juros/multa/desconto) · Por categoria (DRE, sempre pelo rateio).
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Filter, Download, Printer, RefreshCw, Search, X } from 'lucide-react';
import api from '../../../services/api';
import SelectBusca from '../../../components/SelectBusca';
import FiltroPeriodo, { usePeriodoSalvo } from '../../../components/FiltroPeriodo';
import { useFiltrosSalvos } from '../../../hooks/useFiltrosSalvos';
import { fmtData, fmtVal, fmtNumCsv, STATUS_BADGE, baixarCsv, csvTexto, imprimirTabela } from './comum';

const DOC_BADGE = {
    NFE: { label: 'NF-e', cls: 'bg-blue-100 text-blue-800' },
    NFSE: { label: 'NFS-e', cls: 'bg-mint text-primaryDark' },
    IMPORTADO_CA: { label: 'Importada do CA', cls: 'bg-gray-100 text-gray-700' },
    SEM_DOC: { label: 'Sem nota', cls: 'bg-amber-100 text-amber-700' },
};
const CLASSIF_BADGE = {
    OPERACIONAL: 'bg-mint text-primaryDark', FINANCEIRO: 'bg-gray-100 text-gray-700',
    FORA_DRE: 'bg-purple-100 text-purple-700', A_CLASSIFICAR: 'bg-amber-100 text-amber-700',
};

export default function AbaPagar() {
    const [filtros, setFiltros] = useFiltrosSalvos('contabilidade-pagar', {
        visao: 'contas', documento: 'todos', forma: 'todos', banco: 'todos', status: 'todos'
    });
    const [perEmissao, ctlEmissao] = usePeriodoSalvo('contabilidade-pagar-emissao', 'mes');
    const [perVenc, ctlVenc] = usePeriodoSalvo('contabilidade-pagar-venc', 'todo');
    const [perPag, ctlPag] = usePeriodoSalvo('contabilidade-pagar-pag', 'todo');
    const [fornecedor, setFornecedor] = useState('');
    const [dados, setDados] = useState({ resumo: null, linhas: [], bancos: [] });
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState('');
    const [qtdVisivel, setQtdVisivel] = useState(50); // 50 + Carregar mais (CSV/impressão saem completos)
    useEffect(() => { setQtdVisivel(50); }, [dados.linhas]);

    const buscar = useCallback(async () => {
        setLoading(true); setErro('');
        try {
            const params = { visao: filtros.visao };
            if (perEmissao.de) params.emissaoDe = perEmissao.de;
            if (perEmissao.ate) params.emissaoAte = perEmissao.ate;
            if (perVenc.de) params.vencDe = perVenc.de;
            if (perVenc.ate) params.vencAte = perVenc.ate;
            if (perPag.de) params.pagDe = perPag.de;
            if (perPag.ate) params.pagAte = perPag.ate;
            if (fornecedor.trim()) params.fornecedor = fornecedor.trim();
            if (filtros.documento !== 'todos') params.documento = filtros.documento;
            if (filtros.forma !== 'todos') params.forma = filtros.forma;
            if (filtros.banco !== 'todos') params.banco = filtros.banco;
            if (filtros.status !== 'todos') params.status = filtros.status;
            const { data } = await api.get('/contabilidade/relatorio-pagar', { params });
            setDados(data);
        } catch (e) {
            setErro(e.response?.data?.error || 'Erro ao carregar o relatório.');
        } finally { setLoading(false); }
    }, [filtros, perEmissao.de, perEmissao.ate, perVenc.de, perVenc.ate, perPag.de, perPag.ate, fornecedor]);
    useEffect(() => { buscar(); }, [buscar]);

    const formasDisponiveis = useMemo(() => [...new Set(dados.linhas.map((l) => l.forma).filter(Boolean))].sort(), [dados.linhas]);
    const ehCategorias = filtros.visao === 'categorias';
    const resumo = dados.resumo;

    const CAB = ehCategorias
        ? ['Categoria', 'Classificação', 'Grupo DRE', 'Contas', 'Valor', '% do total']
        : ['Fornecedor', 'CNPJ', 'Documento', 'Categoria', 'Emissão', 'Parc.', 'Venc.', 'Valor',
            ...(filtros.visao === 'pagamentos' ? ['Pago', 'Juros', 'Multa', 'Desc.'] : ['Pago']),
            'Forma', 'Banco', 'Data baixa', 'Status'];

    const linhaCsv = (l) => ehCategorias
        ? [csvTexto(l.categoria), l.classificacao || '', csvTexto(l.grupoDre), l.contas, fmtNumCsv(l.valor), fmtNumCsv(l.percentual)]
        : [csvTexto(l.fornecedor), csvTexto(l.fornecedorDoc), `${l.documento.tipo}${l.documento.numero ? ' ' + l.documento.numero : ''}`,
            csvTexto(l.categoria), l.emissao ? fmtData(l.emissao) : '', l.numeroParcela ?? '', fmtData(l.vencimento), fmtNumCsv(l.valor),
            ...(filtros.visao === 'pagamentos' ? [fmtNumCsv(l.valorPago), fmtNumCsv(l.juros), fmtNumCsv(l.multa), fmtNumCsv(l.descontoPg)] : [fmtNumCsv(l.valorPago)]),
            csvTexto(l.forma), csvTexto(l.bancoNome), l.dataBaixa ? fmtData(l.dataBaixa) : '', l.status || ''];

    const exportar = () => baixarCsv(`contabilidade-pagar-${filtros.visao}.csv`, CAB, dados.linhas.map(linhaCsv));
    const imprimir = () => imprimirTabela(
        `Contabilidade — Contas a Pagar · ${ehCategorias ? 'Por categoria (DRE)' : filtros.visao === 'pagamentos' ? 'Pagamentos (caixa)' : 'Contas (competência)'}`,
        `${dados.linhas.length} linhas · Total ${fmtVal(resumo?.valorTotal)}`,
        CAB, dados.linhas.map((l) => linhaCsv(l).map((v) => String(v).replace(/^"|"$/g, '').replace(/""/g, '"')))
    );

    const nFiltros = useMemo(() => {
        let n = 0;
        ['documento', 'forma', 'banco', 'status'].forEach((k) => { if (filtros[k] !== 'todos') n++; });
        if (!perEmissao.padrao) n++;
        if (!perVenc.padrao) n++;
        if (!perPag.padrao) n++;
        if (fornecedor.trim()) n++;
        return n;
    }, [filtros, perEmissao.padrao, perVenc.padrao, perPag.padrao, fornecedor]);

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
                <button onClick={exportar} disabled={!dados.linhas.length}
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

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{ehCategorias ? 'Categorias' : 'Linhas'}</div>
                    <div className="text-lg md:text-xl font-bold text-gray-900">{resumo ? resumo.linhas : '—'}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor total</div>
                    <div className="text-lg md:text-xl font-bold text-red-700">{resumo ? fmtVal(resumo.valorTotal) : '—'}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4 col-span-2 md:col-span-1">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pago</div>
                    <div className="text-lg md:text-xl font-bold text-primaryDark">{resumo ? fmtVal(resumo.pagoTotal) : '—'}</div>
                </div>
                <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filtros ativos</div>
                    <div className="text-lg md:text-xl font-bold text-gray-900">{nFiltros}</div>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 flex-wrap">
                    <Filter className="h-4 w-4 text-primaryDark" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Filtros</span>
                    <div className="ml-auto flex items-center gap-1 bg-gray-200 rounded-full p-0.5 flex-wrap">
                        {[['contas', 'Contas (competência)'], ['pagamentos', 'Pagamentos (caixa)'], ['categorias', 'Por categoria (DRE)']].map(([v, rot]) => (
                            <button key={v} onClick={() => setFiltros({ ...filtros, visao: v })}
                                className={`px-3 py-1 rounded-full text-xs font-bold ${filtros.visao === v ? 'bg-white text-primaryDark shadow-sm' : 'text-gray-600'}`}>
                                {rot}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="p-4 md:p-5 grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Emissão / competência</label>
                        <FiltroPeriodo periodo={perEmissao} controle={ctlEmissao} className="w-full" />
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor</label>
                        <div className="relative">
                            <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} placeholder="Buscar…"
                                className="w-full border border-gray-300 rounded px-3 py-2 pl-9 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                        </div>
                    </div>
                    {!ehCategorias && (<>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Documento</label>
                            <SelectBusca value={filtros.documento} onChange={(e) => setFiltros({ ...filtros, documento: e.target.value })} className="w-full">
                                <option value="todos">Todos</option>
                                <option value="NFE">NF-e (produto)</option>
                                <option value="NFSE">NFS-e (serviço)</option>
                                <option value="IMPORTADO_CA">Importada do CA</option>
                                <option value="SEM_DOC">Sem nota</option>
                            </SelectBusca>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Forma de pagamento</label>
                            <SelectBusca value={filtros.forma} onChange={(e) => setFiltros({ ...filtros, forma: e.target.value })} className="w-full">
                                <option value="todos">Todas</option>
                                {formasDisponiveis.map((f) => <option key={f} value={f}>{f}</option>)}
                                {filtros.forma !== 'todos' && !formasDisponiveis.includes(filtros.forma) && <option value={filtros.forma}>{filtros.forma}</option>}
                            </SelectBusca>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Banco do pagamento</label>
                            <SelectBusca value={filtros.banco} onChange={(e) => setFiltros({ ...filtros, banco: e.target.value })} className="w-full">
                                <option value="todos">Todos</option>
                                {dados.bancos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
                            </SelectBusca>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                            <SelectBusca value={filtros.status} onChange={(e) => setFiltros({ ...filtros, status: e.target.value })} className="w-full">
                                <option value="todos">Todos</option>
                                <option value="PENDENTE">Pendente</option>
                                <option value="PARCIAL">Parcial</option>
                                <option value="PAGO">Pago</option>
                            </SelectBusca>
                        </div>
                    </>)}
                </div>
                {nFiltros > 0 && (
                    <div className="px-5 pb-3">
                        <button onClick={() => {
                            setFiltros({ visao: filtros.visao, documento: 'todos', forma: 'todos', banco: 'todos', status: 'todos' });
                            ctlEmissao.limpar(); ctlVenc.limpar(); ctlPag.limpar(); setFornecedor('');
                        }} className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1">
                            <X className="h-3 w-3" /> Limpar filtros
                        </button>
                    </div>
                )}
            </div>

            {erro && <div className="bg-red-100 text-red-700 rounded-xl p-4 text-sm font-medium">{erro}</div>}
            {resumo?.truncado && <div className="bg-amber-100 text-amber-700 rounded-xl p-3 text-xs font-medium">Período grande demais — nem tudo está sendo mostrado; aperte os filtros.</div>}

            {/* Desktop */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="px-5 py-3.5 border-b border-gray-100">
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">
                        {ehCategorias ? 'Resumo por categoria (DRE) — sempre pelo rateio' : `${filtros.visao === 'pagamentos' ? 'Pagamentos (caixa)' : 'Contas (competência)'} — ${dados.linhas.length} linhas`}
                        {loading && <span className="ml-2 text-gray-400 normal-case font-normal">carregando…</span>}
                    </span>
                </div>
                <div className="overflow-x-auto">
                    {ehCategorias ? (
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50"><tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Categoria</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Classificação</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Grupo DRE</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Contas</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">% do total</th>
                            </tr></thead>
                            <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                {dados.linhas.map((l) => (
                                    <tr key={l.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-2.5 font-semibold text-gray-900">{l.categoria}</td>
                                        <td className="px-4 py-2.5">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${CLASSIF_BADGE[l.classificacao] || 'bg-gray-100 text-gray-700'}`}>
                                                {l.classificacao || '—'}{l.natureza && l.natureza !== 'A_DEFINIR' ? ` · ${l.natureza}` : ''}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-gray-600">{l.grupoDre || '—'}</td>
                                        <td className="px-4 py-2.5 text-right">{l.contas}</td>
                                        <td className="px-4 py-2.5 text-right font-semibold">{fmtVal(l.valor)}</td>
                                        <td className="px-4 py-2.5 text-right text-gray-600">{l.percentual?.toFixed(1)}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50"><tr>
                                {CAB.map((c, i) => (
                                    <th key={c} className={`px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap ${i >= 7 && i <= CAB.length - 5 ? 'text-right' : 'text-left'}`}>{c}</th>
                                ))}
                            </tr></thead>
                            <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                {dados.linhas.slice(0, qtdVisivel).map((l) => {
                                    const b = DOC_BADGE[l.documento?.tipo] || DOC_BADGE.SEM_DOC;
                                    return [
                                        <tr key={l.id} className="hover:bg-gray-50">
                                            <td className="px-3 py-2.5"><span className="font-semibold text-gray-900">{l.fornecedor}</span></td>
                                            <td className="px-3 py-2.5 text-xs text-gray-500">{l.fornecedorDoc || '—'}</td>
                                            <td className="px-3 py-2.5">
                                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${b.cls}`}>{b.label}{l.documento?.numero ? ` ${l.documento.numero}` : ''}</span>
                                                {l.temAnexo && <span className="ml-1 text-xs text-gray-400" title="Tem PDF anexado">📎</span>}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                {l.categoria === 'RATEADA'
                                                    ? <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">RATEADA — {l.rateios.length || 'várias'} categorias</span>
                                                    : (l.categoria || '—')}
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">{fmtData(l.emissao)}</td>
                                            <td className="px-3 py-2.5">{l.numeroParcela ?? '—'}</td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">{fmtData(l.vencimento)}</td>
                                            <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">{fmtVal(l.valor)}</td>
                                            {filtros.visao === 'pagamentos' ? (<>
                                                <td className="px-3 py-2.5 text-right whitespace-nowrap">{fmtVal(l.valorPago)}</td>
                                                <td className="px-3 py-2.5 text-right text-xs">{l.juros ? fmtVal(l.juros) : '—'}</td>
                                                <td className="px-3 py-2.5 text-right text-xs">{l.multa ? fmtVal(l.multa) : '—'}</td>
                                                <td className="px-3 py-2.5 text-right text-xs">{l.descontoPg ? fmtVal(l.descontoPg) : '—'}</td>
                                            </>) : (
                                                <td className="px-3 py-2.5 text-right whitespace-nowrap">{l.valorPago ? fmtVal(l.valorPago) : '—'}</td>
                                            )}
                                            <td className="px-3 py-2.5">{l.forma || '—'}</td>
                                            <td className="px-3 py-2.5">{l.bancoNome || '—'}</td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">{l.dataBaixa ? fmtData(l.dataBaixa) : '—'}</td>
                                            <td className="px-3 py-2.5"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[l.status] || 'bg-gray-100 text-gray-700'}`}>{l.status}</span></td>
                                        </tr>,
                                        ...(l.rateios || []).map((r, i) => (
                                            <tr key={`${l.id}-r${i}`} className="bg-stone-50">
                                                <td className="px-3 py-1.5 pl-8 text-xs text-gray-500" colSpan={3}>↳ {r.categoria || 'Sem categoria'}</td>
                                                <td className="px-3 py-1.5 text-xs text-gray-500" colSpan={4}>rateio DRE</td>
                                                <td className="px-3 py-1.5 text-right text-xs text-gray-600">{fmtVal(r.valor)}</td>
                                                <td colSpan={CAB.length - 8}></td>
                                            </tr>
                                        ))
                                    ];
                                })}
                                {!loading && dados.linhas.length === 0 && (
                                    <tr><td colSpan={CAB.length} className="px-4 py-10 text-center text-gray-400 text-sm">Nada encontrado com esses filtros.</td></tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
                {!ehCategorias && dados.linhas.length > qtdVisivel && (
                    <div className="p-4 text-center border-t border-gray-100">
                        <button onClick={() => setQtdVisivel((q) => q + 50)}
                            className="px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm">
                            Carregar mais — mostrando {qtdVisivel} de {dados.linhas.length}
                        </button>
                    </div>
                )}
            </div>

            {/* Mobile: cards */}
            <div className="md:hidden space-y-3">
                {ehCategorias ? dados.linhas.map((l) => (
                    <div key={l.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                        <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-gray-900 truncate">{l.categoria}</span>
                            <span className="font-bold">{fmtVal(l.valor)}</span>
                        </div>
                        <div className="text-xs text-gray-500">{l.classificacao || '—'}{l.grupoDre ? ` · ${l.grupoDre}` : ''} · {l.contas} contas · {l.percentual?.toFixed(1)}%</div>
                    </div>
                )) : dados.linhas.slice(0, qtdVisivel).map((l) => {
                    const b = DOC_BADGE[l.documento?.tipo] || DOC_BADGE.SEM_DOC;
                    return (
                        <div key={l.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                            <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold text-gray-900 truncate">{l.fornecedor}</span>
                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[l.status] || 'bg-gray-100 text-gray-700'}`}>{l.status}</span>
                            </div>
                            <div className="text-xs text-gray-500 mb-2">venc. {fmtData(l.vencimento)}{l.emissao ? ` · emissão ${fmtData(l.emissao)}` : ''}</div>
                            <div className="flex items-center justify-between">
                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${b.cls}`}>{b.label}{l.documento?.numero ? ` ${l.documento.numero}` : ''}</span>
                                <span className="font-bold">{fmtVal(l.valor)}</span>
                            </div>
                            {(l.forma || l.bancoNome) && (
                                <div className="text-xs text-gray-500 mt-2">{l.forma || '—'}{l.bancoNome ? ` · ${l.bancoNome}` : ''}{l.dataBaixa ? ` · baixa ${fmtData(l.dataBaixa)}` : ''}</div>
                            )}
                        </div>
                    );
                })}
                {!loading && dados.linhas.length === 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">Nada encontrado com esses filtros.</div>
                )}
            </div>
        </div>
    );
}
