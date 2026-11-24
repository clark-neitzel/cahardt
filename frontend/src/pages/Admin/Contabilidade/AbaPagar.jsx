// Contabilidade — aba CONTAS A PAGAR (Fase 2)
// Visões: Contas (competência, com rateio DRE aberto por linha) · Pagamentos (caixa,
// com juros/multa/desconto) · Por categoria (DRE, sempre pelo rateio).
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Filter, Download, Printer, RefreshCw, Search, X, Info } from 'lucide-react';
import api from '../../../services/api';
import SelectBusca from '../../../components/SelectBusca';
import FiltroPeriodo, { usePeriodoSalvo } from '../../../components/FiltroPeriodo';
import { useFiltrosSalvos } from '../../../hooks/useFiltrosSalvos';
import { fmtData, fmtVal, fmtNumCsv, fmtNumCsvN, STATUS_BADGE, baixarCsv, csvTexto, csvTextoSeguro, csvTextoForcado, imprimirTabela, imprimirArvore } from './comum';
import ArvoreRelatorio from './ArvoreRelatorio';
import {
    NIVEIS, COLUNAS_TELA, cents, reais, filtrarItens, totais, conferirComServidor, construirArvore,
    nosParaTela, linhasImpressao, CABECALHO_CSV, linhasCsv, isoParaBr,
} from './pagarDetalhe';

const DOC_BADGE = {
    NFE: { label: 'NF-e', cls: 'bg-blue-100 text-blue-800' },
    NFSE: { label: 'NFS-e', cls: 'bg-mint text-primaryDark' },
    IMPORTADO_CA: { label: 'Importada (antiga)', cls: 'bg-gray-100 text-gray-700' },
    SEM_DOC: { label: 'Sem nota', cls: 'bg-amber-100 text-amber-700' },
};
const CLASSIF_BADGE = {
    OPERACIONAL: 'bg-mint text-primaryDark', FINANCEIRO: 'bg-gray-100 text-gray-700',
    FORA_DRE: 'bg-purple-100 text-purple-700', A_CLASSIFICAR: 'bg-amber-100 text-amber-700',
};

export default function AbaPagar() {
    const [filtros, setFiltros] = useFiltrosSalvos('contabilidade-pagar', {
        visao: 'contas', documento: 'todos', forma: 'todos', banco: 'todos', status: 'todos', nivel: 2
    });
    const [perEmissao, ctlEmissao] = usePeriodoSalvo('contabilidade-pagar-emissao', 'mes');
    const [perVenc, ctlVenc] = usePeriodoSalvo('contabilidade-pagar-venc', 'todo');
    const [perPag, ctlPag] = usePeriodoSalvo('contabilidade-pagar-pag', 'todo');
    const [fornecedor, setFornecedor] = useState('');
    const [soSemDoc, setSoSemDoc] = useState(false); // não persiste: é um olhar pontual
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
            if (filtros.visao === 'categorias') {
                // período = emissão; busca de fornecedor/produto é feita na tela (sobre os itens), não no servidor
                params.detalhe = 1;
            } else {
                if (perVenc.de) params.vencDe = perVenc.de;
                if (perVenc.ate) params.vencAte = perVenc.ate;
                if (perPag.de) params.pagDe = perPag.de;
                if (perPag.ate) params.pagAte = perPag.ate;
                if (fornecedor.trim()) params.fornecedor = fornecedor.trim();
            }
            if (filtros.visao !== 'categorias') {
                if (filtros.documento !== 'todos') params.documento = filtros.documento;
                if (filtros.forma !== 'todos') params.forma = filtros.forma;
                if (filtros.banco !== 'todos') params.banco = filtros.banco;
                if (filtros.status !== 'todos') params.status = filtros.status;
            }
            const { data } = await api.get('/contabilidade/relatorio-pagar', { params });
            setDados(data);
        } catch (e) {
            setErro(e.response?.data?.error || 'Erro ao carregar o relatório.');
        } finally { setLoading(false); }
    }, [filtros.visao, filtros.documento, filtros.forma, filtros.banco, filtros.status, perEmissao.de, perEmissao.ate, perVenc.de, perVenc.ate, perPag.de, perPag.ate, filtros.visao === 'categorias' ? '' : fornecedor]);
    useEffect(() => { buscar(); }, [buscar]);

    const formasDisponiveis = useMemo(() => [...new Set(dados.linhas.map((l) => l.forma).filter(Boolean))].sort(), [dados.linhas]);
    const ehCategorias = filtros.visao === 'categorias';
    const resumo = dados.resumo;

    // ── Visão "Por categoria" em árvore: tudo calculado a partir de `itens` (centavos inteiros) ──
    const detalhe = ehCategorias && dados.visao === 'categorias' && Array.isArray(dados.itens) ? dados : null;
    const itensVis = useMemo(() => (detalhe ? filtrarItens(detalhe, { busca: fornecedor, soSemDoc }) : []), [detalhe, fornecedor, soSemDoc]);
    const filtrado = !!fornecedor.trim() || soSemDoc;
    const arv = useMemo(() => {
        if (!detalhe) return null;
        const tot = totais(detalhe, itensVis);
        const grupos = construirArvore(detalhe, itensVis);
        return { tot, grupos, nContas: new Set(itensVis.map((i) => i.contaId)).size, nos: nosParaTela(grupos, tot.geral.valor) };
    }, [detalhe, itensVis]);
    const nivel = [1, 2, 3, 4].includes(filtros.nivel) ? filtros.nivel : 2;
    const totaisBatem = !detalhe || filtrado || !arv || conferirComServidor(detalhe, arv.tot.geral);
    const truncado = !!resumo?.truncado;
    // linha cinza "sem nota": calculada dos itens visíveis (acompanha a busca); sem busca = valor do servidor
    const semDoc = useMemo(() => {
        if (!detalhe) return resumo?.semDocumento;
        if (!fornecedor.trim()) return resumo?.semDocumento;
        const ids = new Set(); let v = 0;
        const tipoDe = new Map((detalhe.contas || []).map((c) => [c.id, c.documento?.tipo]));
        itensVis.forEach((i) => { if (tipoDe.get(i.contaId) === 'SEM_DOC') { ids.add(i.contaId); v += cents(i.valor); } });
        return { contas: ids.size, valor: v / 100 };
    }, [detalhe, itensVis, fornecedor, resumo]);
    const nVinculadas = resumo?.avisos?.contasComNotaVinculadaSemProdutos || 0;
    const periodoTxt = perEmissao.de || perEmissao.ate
        ? `${isoParaBr(perEmissao.de) || 'início'} a ${isoParaBr(perEmissao.ate) || 'hoje'}` : 'todo o período';

    const exportarArvore = () => {
        if (!detalhe || truncado || !itensVis.length) return;
        const linhas = linhasCsv(detalhe, itensVis, { texto: csvTextoSeguro, forcado: csvTextoForcado, num: fmtNumCsv, numN: fmtNumCsvN });
        const de = perEmissao.de || 'inicio'; const ate = perEmissao.ate || 'hoje';
        baixarCsv(`contabilidade-pagar-categorias-${de}_${ate}${filtrado ? '-filtrado' : ''}.csv`, CABECALHO_CSV, linhas);
    };
    const imprimirArvoreRel = () => {
        if (!arv) return;
        const nomeNivel = NIVEIS.find((n) => n.v === nivel)?.rot || '';
        imprimirArvore(
            'Contabilidade — Contas a Pagar · Por categoria (DRE)',
            `Emissão ${periodoTxt} · aberto até ${nomeNivel}${filtrado ? ' · FILTRADO' : ''} · Total ${reais(arv.tot.geral.valor)} · Pago (até hoje) ${reais(arv.tot.geral.pago)} · Em aberto ${reais(arv.tot.geral.aberto)}`,
            ['Contas', 'Valor', 'Pago (até hoje)', 'Em aberto', '%'],
            linhasImpressao(arv.grupos, nivel, arv.tot.geral.valor)
        );
    };

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

    const exportar = () => (ehCategorias ? exportarArvore() : baixarCsv(`contabilidade-pagar-${filtros.visao}.csv`, CAB, dados.linhas.map(linhaCsv)));
    const imprimir = () => (ehCategorias ? imprimirArvoreRel() : imprimirTabela(
        `Contabilidade — Contas a Pagar · ${ehCategorias ? 'Por categoria (DRE)' : filtros.visao === 'pagamentos' ? 'Pagamentos (caixa)' : 'Contas (competência)'}`,
        `${dados.linhas.length} linhas · Total ${fmtVal(resumo?.valorTotal)}`,
        CAB, dados.linhas.map((l) => linhaCsv(l).map((v) => String(v).replace(/^"|"$/g, '').replace(/""/g, '"')))
    ));

    const nFiltros = useMemo(() => {
        let n = 0;
        if (!ehCategorias) ['documento', 'forma', 'banco', 'status'].forEach((k) => { if (filtros[k] !== 'todos') n++; });
        if (!perEmissao.padrao) n++;
        if (!ehCategorias && !perVenc.padrao) n++;
        if (!ehCategorias && !perPag.padrao) n++;
        if (fornecedor.trim()) n++;
        if (ehCategorias && soSemDoc) n++;
        return n;
    }, [filtros, ehCategorias, soSemDoc, perEmissao.padrao, perVenc.padrao, perPag.padrao, fornecedor]);
    const semDados = ehCategorias ? !itensVis.length : !dados.linhas.length;

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
                <button onClick={exportar} disabled={semDados || (ehCategorias && truncado)}
                    title={ehCategorias && truncado ? 'Período grande demais — o arquivo sairia incompleto. Escolha um período menor.' : undefined}
                    className="px-3 py-1.5 min-h-[44px] md:min-h-0 md:px-4 md:py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-xs md:text-sm inline-flex items-center gap-1.5 disabled:opacity-40">
                    <Download className="h-4 w-4" /> CSV
                </button>
                <button onClick={imprimir} disabled={semDados}
                    className="px-3 py-1.5 min-h-[44px] md:min-h-0 md:px-4 md:py-2 bg-white border border-gray-300 text-gray-700 rounded-full font-medium text-xs md:text-sm inline-flex items-center gap-1.5 disabled:opacity-40">
                    <Printer className="h-4 w-4" /> Imprimir / PDF
                </button>
                <button onClick={buscar} className="p-2 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 inline-flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100" title="Atualizar">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                {ehCategorias && filtrado && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">filtrado — totais só do que está na tela</span>}
            </div>

            {ehCategorias && arv ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total lançado</div>
                        <div className="text-base sm:text-lg md:text-xl font-bold text-red-700">{reais(arv.tot.geral.valor)}</div>
                        <div className="text-xs text-gray-500">{arv.grupos.reduce((n, g) => n + g.cats.length, 0)} categorias · {arv.nContas} lançamentos</div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Entra no resultado</div>
                        <div className="text-base sm:text-lg md:text-xl font-bold text-gray-900">{reais(arv.tot.dre.valor)}</div>
                        <div className="text-xs text-gray-500">despesa de verdade</div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fora do resultado</div>
                        <div className="text-base sm:text-lg md:text-xl font-bold text-purple-700">{reais(arv.tot.fora.valor)}</div>
                        <div className="text-xs text-gray-500">retirada, empréstimo, imobilizado</div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pago (até hoje)</div>
                        <div className="text-base sm:text-lg md:text-xl font-bold text-primaryDark">{reais(arv.tot.geral.pago)}</div>
                        <div className="text-xs text-gray-500">em aberto <b className="text-blue-700">{reais(arv.tot.geral.aberto)}</b></div>
                    </div>
                </div>
            ) : ehCategorias ? (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-sm text-gray-500">{loading ? 'Carregando…' : '—'}</div>
            ) : (
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
            )}

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 flex-wrap">
                    <Filter className="h-4 w-4 text-primaryDark" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Filtros</span>
                    {nFiltros > 0 && <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-mint text-primaryDark">{nFiltros} {nFiltros === 1 ? 'ativo' : 'ativos'}</span>}
                    <div className="w-full sm:w-auto sm:ml-auto flex flex-col sm:flex-row sm:items-center gap-1 bg-gray-200 rounded-xl sm:rounded-full p-0.5 sm:flex-wrap">
                        {[['contas', 'Contas (competência)'], ['pagamentos', 'Pagamentos (caixa)'], ['categorias', 'Por categoria (DRE)']].map(([v, rot]) => (
                            <button key={v} onClick={() => setFiltros({ ...filtros, visao: v })}
                                className={`w-full sm:w-auto px-3 py-1 min-h-[44px] md:min-h-0 rounded-lg sm:rounded-full text-xs font-bold ${filtros.visao === v ? 'bg-white text-primaryDark shadow-sm' : 'text-gray-600'}`}>
                                {rot}
                            </button>
                        ))}
                    </div>
                </div>
                <div className={ehCategorias ? 'p-4 md:p-5 flex flex-wrap items-end gap-3' : 'p-4 md:p-5 grid grid-cols-1 md:grid-cols-4 gap-3'}>
                    <div className={ehCategorias ? 'w-full sm:w-auto max-w-full' : ''}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Emissão / competência</label>
                        <FiltroPeriodo periodo={perEmissao} controle={ctlEmissao} className={ehCategorias ? 'w-full sm:w-auto' : 'w-full'} />
                    </div>
                    {!ehCategorias && (<>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Vencimento</label>
                            <FiltroPeriodo periodo={perVenc} controle={ctlVenc} className="w-full" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Pagamento (baixa)</label>
                            <FiltroPeriodo periodo={perPag} controle={ctlPag} className="w-full" />
                        </div>
                    </>)}
                    <div className={ehCategorias ? 'flex-1 min-w-full sm:min-w-[220px]' : ''}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{ehCategorias ? 'Fornecedor ou produto' : 'Fornecedor'}</label>
                        <div className="relative">
                            <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} placeholder={ehCategorias ? 'Fornecedor, produto ou nota…' : 'Buscar…'}
                                className="w-full border border-gray-300 rounded px-3 py-2 min-h-[44px] md:min-h-0 pl-9 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                        </div>
                    </div>
                    {ehCategorias && (
                        <div className="w-full sm:w-auto max-w-full">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Abrir até</label>
                            <div className="flex items-center gap-1 bg-gray-200 rounded-full p-0.5">
                                {NIVEIS.map((n) => (
                                    <button key={n.v} onClick={() => setFiltros({ ...filtros, nivel: n.v })}
                                        className={`flex-1 sm:flex-none px-1 sm:px-3 py-2 min-h-[44px] md:min-h-0 md:py-1.5 rounded-full text-[11px] sm:text-xs font-bold ${nivel === n.v ? 'bg-white text-primaryDark shadow-sm' : 'text-gray-600'}`}>
                                        {n.rot}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {!ehCategorias && (<>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Documento</label>
                            <SelectBusca value={filtros.documento} onChange={(e) => setFiltros({ ...filtros, documento: e.target.value })} className="w-full">
                                <option value="todos">Todos</option>
                                <option value="NFE">NF-e (produto)</option>
                                <option value="NFSE">NFS-e (serviço)</option>
                                <option value="IMPORTADO_CA">Importada (antiga)</option>
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
                            setFiltros({ ...filtros, documento: 'todos', forma: 'todos', banco: 'todos', status: 'todos' });
                            ctlEmissao.limpar(); ctlVenc.limpar(); ctlPag.limpar(); setFornecedor(''); setSoSemDoc(false);
                        }} className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1 min-h-[44px] md:min-h-0">
                            <X className="h-3 w-3" /> Limpar filtros
                        </button>
                    </div>
                )}
            </div>

            {erro && <div className="bg-red-100 text-red-700 rounded-xl p-4 text-sm font-medium">{erro}</div>}
            {ehCategorias && truncado && (
                <div className="bg-amber-100 text-amber-700 rounded-xl p-3 text-xs font-medium">
                    Período grande demais — o relatório não coube inteiro, então o arquivo CSV foi bloqueado para não sair incompleto. Escolha um período menor.
                </div>
            )}
            {!ehCategorias && resumo?.truncado && <div className="bg-amber-100 text-amber-700 rounded-xl p-3 text-xs font-medium">Período grande demais — nem tudo está sendo mostrado; aperte os filtros.</div>}
            {ehCategorias && !truncado && !totaisBatem && (
                <div className="bg-amber-100 text-amber-700 rounded-xl p-3 text-xs font-medium">Totais divergentes: a soma dos itens não bate com o total calculado pelo servidor. Avise o suporte antes de enviar o arquivo.</div>
            )}

            {ehCategorias && semDoc?.contas > 0 && (
                <div className="bg-gray-100 text-gray-700 rounded-xl p-3 text-xs md:text-sm flex items-start gap-2">
                    <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-gray-500" />
                    <span className="min-w-0">
                        <b>{semDoc.contas} {semDoc.contas === 1 ? 'lançamento sem nota fiscal' : 'lançamentos sem nota fiscal'}</b> (salários, impostos e contas de consumo entram aqui) — {reais(cents(semDoc.valor))}.{' '}
                        <button onClick={() => setSoSemDoc((v) => !v)} className="underline font-semibold text-primaryDark py-2 min-h-[44px] md:min-h-0 md:py-0">
                            {soSemDoc ? 'Mostrar tudo' : 'Ver só esses'}
                        </button>
                    </span>
                </div>
            )}
            {ehCategorias && nVinculadas > 0 && (
                <div className="text-xs text-gray-500 px-1">{nVinculadas} {nVinculadas === 1 ? 'lançamento tem nota vinculada' : 'lançamentos têm nota vinculada'}, mas os produtos ainda não aparecem aqui.</div>
            )}

            {ehCategorias && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden max-w-full">
                    <div className="px-4 md:px-5 py-3.5 border-b border-gray-100">
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-600">
                            Por categoria (DRE) · emissão {periodoTxt}
                            {loading && <span className="ml-2 text-gray-500 normal-case font-normal">carregando…</span>}
                        </span>
                    </div>
                    {arv && arv.nos.length > 0 && <ArvoreRelatorio nos={arv.nos} colunas={COLUNAS_TELA} nivel={nivel} rotuloPrimeira="Categoria › fornecedor › nota › produto" />}
                    {!loading && !erro && (!arv || arv.nos.length === 0) && (
                        <div className="p-8 text-center text-gray-500 text-sm">Nada encontrado com esses filtros.</div>
                    )}
                </div>
            )}

            {!ehCategorias && (<>
            {/* Desktop */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="px-5 py-3.5 border-b border-gray-100">
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">
                        {`${filtros.visao === 'pagamentos' ? 'Pagamentos (caixa)' : 'Contas (competência)'} — ${dados.linhas.length} linhas`}
                        {loading && <span className="ml-2 text-gray-400 normal-case font-normal">carregando…</span>}
                    </span>
                </div>
                <div className="overflow-x-auto">
                    {(
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
                {dados.linhas.length > qtdVisivel && (
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
                {dados.linhas.slice(0, qtdVisivel).map((l) => {
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
            </>)}
        </div>
    );
}
