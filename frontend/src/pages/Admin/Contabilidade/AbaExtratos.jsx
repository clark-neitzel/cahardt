// Contabilidade — aba EXTRATOS (Fase 3): o extrato importado de cada conta com a
// coluna "Identificação" (de qual pedido/nota/fornecedor cada linha do banco veio).
// Exporta CSV com conciliação e OFX (formato que sistemas contábeis importam).
import { useState, useEffect, useCallback } from 'react';
import { Filter, Download, Printer, RefreshCw, FileDown } from 'lucide-react';
import api from '../../../services/api';
import SelectBusca from '../../../components/SelectBusca';
import FiltroPeriodo, { usePeriodoSalvo } from '../../../components/FiltroPeriodo';
import { useFiltrosSalvos } from '../../../hooks/useFiltrosSalvos';
import { fmtData, fmtVal, fmtNumCsv, baixarCsv, csvTexto, imprimirTabela, baixarArquivoApi } from './comum';

const SIT_BADGE = {
    CONCILIADO: 'bg-green-100 text-green-800',
    PENDENTE: 'bg-yellow-100 text-yellow-800',
    IGNORADO: 'bg-gray-100 text-gray-700',
    TRANSFERENCIA: 'bg-blue-100 text-blue-800',
};

export default function AbaExtratos() {
    const [filtros, setFiltros] = useFiltrosSalvos('contabilidade-extrato', { banco: '', situacao: 'todas' });
    const [periodo, ctlPeriodo] = usePeriodoSalvo('contabilidade-extrato-periodo', 'mes');
    const [dados, setDados] = useState({ bancos: [], linhas: [], resumo: null });
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState('');

    const buscar = useCallback(async () => {
        setLoading(true); setErro('');
        try {
            const params = {};
            if (filtros.banco) params.banco = filtros.banco;
            if (periodo.de) params.de = periodo.de;
            if (periodo.ate) params.ate = periodo.ate;
            if (filtros.situacao !== 'todas') params.situacao = filtros.situacao;
            const { data } = await api.get('/contabilidade/extrato-conciliado', { params });
            setDados(data);
            // primeira visita: seleciona a primeira conta ativa automaticamente
            if (!filtros.banco && data.bancos?.length) {
                const ativa = data.bancos.find((b) => b.ativo) || data.bancos[0];
                if (ativa) setFiltros((f) => ({ ...f, banco: ativa.id }));
            }
        } catch (e) {
            setErro(e.response?.data?.error || 'Erro ao carregar o extrato.');
        } finally { setLoading(false); }
    }, [filtros.banco, filtros.situacao, periodo.de, periodo.ate]); // eslint-disable-line
    useEffect(() => { buscar(); }, [buscar]);

    const nomeConta = dados.bancos.find((b) => b.id === filtros.banco)?.nomeBanco || '';
    const CAB = ['Data', 'Tipo', 'Valor', 'Lançamento no banco', 'Doc', 'Situação', 'Identificação (conciliação)'];
    const linhaCsv = (l) => [fmtData(l.data), l.tipo, fmtNumCsv(l.valor), csvTexto(l.descricao), csvTexto(l.documento), l.identTipo === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : l.status, csvTexto(l.identificacao)];

    const exportarCsv = () => baixarCsv(`extrato-${nomeConta.replace(/[^\w-]/g, '_')}.csv`, CAB, dados.linhas.map(linhaCsv));
    const exportarOfx = () => baixarArquivoApi('/contabilidade/extrato-ofx',
        { banco: filtros.banco, de: periodo.de || undefined, ate: periodo.ate || undefined }, 'extrato.ofx')
        .catch(() => setErro('Não deu para gerar o OFX.'));
    const imprimir = () => imprimirTabela(
        `Contabilidade — Extrato ${nomeConta}`,
        `${dados.linhas.length} lançamentos · Créditos ${fmtVal(dados.resumo?.creditos)} · Débitos ${fmtVal(dados.resumo?.debitos)}`,
        CAB, dados.linhas.map((l) => linhaCsv(l).map((v) => String(v).replace(/^"|"$/g, '').replace(/""/g, '"')))
    );

    const resumo = dados.resumo;

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
                <button onClick={exportarCsv} disabled={!dados.linhas.length}
                    className="px-3 py-1.5 md:px-4 md:py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-xs md:text-sm inline-flex items-center gap-1.5 disabled:opacity-40">
                    <Download className="h-4 w-4" /> CSV com conciliação
                </button>
                <button onClick={exportarOfx} disabled={!filtros.banco}
                    className="px-3 py-1.5 md:px-4 md:py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-xs md:text-sm inline-flex items-center gap-1.5 disabled:opacity-40">
                    <FileDown className="h-4 w-4" /> OFX
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
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lançamentos</div>
                    <div className="text-lg md:text-xl font-bold text-gray-900">{resumo ? resumo.linhas : '—'}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Créditos</div>
                    <div className="text-lg md:text-xl font-bold text-primaryDark">{resumo ? fmtVal(resumo.creditos) : '—'}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Débitos</div>
                    <div className="text-lg md:text-xl font-bold text-red-700">{resumo ? fmtVal(resumo.debitos) : '—'}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Identificados</div>
                    <div className="text-lg md:text-xl font-bold text-gray-900">
                        {resumo && resumo.linhas > 0 ? `${Math.round((resumo.conciliados / resumo.linhas) * 100)}%` : '—'}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                    <Filter className="h-4 w-4 text-primaryDark" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Filtros</span>
                </div>
                <div className="p-4 md:p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Conta</label>
                        <SelectBusca value={filtros.banco} onChange={(e) => setFiltros({ ...filtros, banco: e.target.value })} className="w-full">
                            <option value="">Escolha a conta…</option>
                            {dados.bancos.map((b) => <option key={b.id} value={b.id}>{b.nomeBanco}{b.ativo === false ? ' (inativa)' : ''}</option>)}
                        </SelectBusca>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Período</label>
                        <FiltroPeriodo periodo={periodo} controle={ctlPeriodo} className="w-full" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Situação</label>
                        <SelectBusca value={filtros.situacao} onChange={(e) => setFiltros({ ...filtros, situacao: e.target.value })} className="w-full">
                            <option value="todas">Todas</option>
                            <option value="CONCILIADO">Conciliado</option>
                            <option value="PENDENTE">Pendente</option>
                            <option value="IGNORADO">Ignorado</option>
                        </SelectBusca>
                    </div>
                </div>
            </div>

            {erro && <div className="bg-red-100 text-red-700 rounded-xl p-4 text-sm font-medium">{erro}</div>}

            {/* Desktop */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="px-5 py-3.5 border-b border-gray-100">
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">
                        Extrato {nomeConta} — {dados.linhas.length} lançamentos
                        {loading && <span className="ml-2 text-gray-400 normal-case font-normal">carregando…</span>}
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50"><tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Lançamento no banco</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Situação</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Identificação (conciliação)</th>
                        </tr></thead>
                        <tbody className="bg-white divide-y divide-gray-200 text-sm">
                            {dados.linhas.map((l) => (
                                <tr key={l.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-2.5 whitespace-nowrap">{fmtData(l.data)}</td>
                                    <td className="px-4 py-2.5">
                                        <span className="font-medium text-gray-900">{l.descricao || '—'}</span>
                                        {l.documento && <div className="text-xs text-gray-400">doc {l.documento}</div>}
                                    </td>
                                    <td className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap ${l.tipo === 'CREDITO' ? 'text-primaryDark' : 'text-red-700'}`}>
                                        {l.tipo === 'CREDITO' ? '+ ' : '− '}{fmtVal(l.valor)}
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${SIT_BADGE[l.identTipo === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : l.status] || 'bg-gray-100 text-gray-700'}`}>
                                            {l.identTipo === 'TRANSFERENCIA' ? 'TRANSFERÊNCIA' : l.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-gray-600 text-xs md:text-sm">
                                        {l.identificacao || <span className="text-gray-400">Ainda sem identificação — pendência da Conciliação Bancária</span>}
                                    </td>
                                </tr>
                            ))}
                            {!loading && dados.linhas.length === 0 && (
                                <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">{filtros.banco ? 'Nenhum lançamento no período.' : 'Escolha a conta.'}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Mobile */}
            <div className="md:hidden space-y-3">
                {dados.linhas.map((l) => (
                    <div key={l.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-500">{fmtData(l.data)}</span>
                            <span className={`font-bold ${l.tipo === 'CREDITO' ? 'text-primaryDark' : 'text-red-700'}`}>
                                {l.tipo === 'CREDITO' ? '+ ' : '− '}{fmtVal(l.valor)}
                            </span>
                        </div>
                        <div className="font-medium text-gray-900 text-sm mb-1">{l.descricao || '—'}</div>
                        <div className="text-xs text-gray-500">{l.identificacao || 'Sem identificação'}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
