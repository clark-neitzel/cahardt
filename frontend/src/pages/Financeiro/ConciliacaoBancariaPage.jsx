import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import conciliacaoService from '../../services/conciliacaoBancariaService';
import contasReceberService from '../../services/contasReceberService';
import SelectBusca from '../../components/SelectBusca';
import { Landmark, Loader2, RefreshCw, Upload, Wand2, Check, X, Undo2, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtData = (ymd) => `${ymd.slice(8)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
const hojeYMD = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const somaDiasYMD = (ymd, n) => {
    const d = new Date(`${ymd}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
const fimDoMes = (ym) => {
    const [a, m] = ym.split('-').map(Number);
    const prox = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
    return somaDiasYMD(`${prox}-01`, -1);
};
const periodos = () => {
    const hoje = hojeYMD();
    const mes = hoje.slice(0, 7);
    return [
        { key: 'MES', label: 'Este mês', de: `${mes}-01`, ate: fimDoMes(mes) },
        { key: 'ULT30', label: 'Últimos 30 dias', de: somaDiasYMD(hoje, -29), ate: hoje },
        { key: 'ULT60', label: 'Últimos 60 dias', de: somaDiasYMD(hoje, -59), ate: hoje },
        { key: 'ULT90', label: 'Últimos 90 dias', de: somaDiasYMD(hoje, -89), ate: hoje }
    ];
};

const STATUS_BADGE = {
    PENDENTE: 'bg-yellow-100 text-yellow-800',
    CONCILIADO: 'bg-green-100 text-green-800',
    IGNORADO: 'bg-gray-100 text-gray-700'
};
const STATUS_LABEL = { PENDENTE: 'Pendente', CONCILIADO: 'Conciliado', IGNORADO: 'Ignorado' };

const KpiCard = ({ titulo, valor, cor = 'text-gray-900', sub, subCor = 'text-gray-500' }) => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{titulo}</div>
        <div className={`text-lg md:text-2xl font-bold mt-1 ${cor}`}>{valor}</div>
        {sub && <div className={`text-xs mt-0.5 ${subCor}`}>{sub}</div>}
    </div>
);

const ValorCell = ({ tipo, valor }) => (
    <span className={`font-semibold ${tipo === 'CREDITO' ? 'text-green-700' : 'text-red-700'}`}>
        {tipo === 'CREDITO' ? '+' : '−'} R$ {fmt(valor)}
    </span>
);

const ConciliacaoBancariaPage = () => {
    const opcoesPeriodo = useMemo(periodos, []);
    const [contas, setContas] = useState([]);
    const [contaId, setContaId] = useState('');
    const [periodo, setPeriodo] = useState(opcoesPeriodo[1]); // últimos 30 dias
    const [statusFiltro, setStatusFiltro] = useState('todos');
    const [dados, setDados] = useState(null);
    const [loading, setLoading] = useState(false);
    const [agindo, setAgindo] = useState(null); // id do lançamento com ação em andamento
    const [importando, setImportando] = useState(false);
    const [autoRodando, setAutoRodando] = useState(false);
    const [escolhas, setEscolhas] = useState({}); // lancamentoId → id do pagamento escolhido
    const [mostrarSoNoApp, setMostrarSoNoApp] = useState(false);
    const inputArquivo = useRef(null);

    useEffect(() => {
        contasReceberService.contasFinanceiras()
            .then(cf => {
                setContas(cf);
                const padrao = cf.find(c => c.padrao) || cf[0];
                if (padrao) setContaId(padrao.id);
            })
            .catch(() => toast.error('Não consegui carregar as contas (bancos/caixas).'));
    }, []);

    const carregar = useCallback(async () => {
        if (!contaId) return;
        setLoading(true);
        try {
            const d = await conciliacaoService.lancamentos(contaId, periodo.de, periodo.ate, statusFiltro);
            setDados(d);
            setEscolhas({});
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar o extrato');
        } finally {
            setLoading(false);
        }
    }, [contaId, periodo, statusFiltro]);

    useEffect(() => { carregar(); }, [carregar]);

    const importar = async (arquivo) => {
        if (!arquivo) return;
        setImportando(true);
        try {
            const r = await conciliacaoService.importar(contaId, arquivo);
            toast.success(r.message);
            (r.avisos || []).slice(0, 3).forEach(a => toast(a, { icon: '⚠️' }));
            carregar();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao importar o arquivo OFX');
        } finally {
            setImportando(false);
            if (inputArquivo.current) inputArquivo.current.value = '';
        }
    };

    const conciliarAuto = async () => {
        setAutoRodando(true);
        try {
            const r = await conciliacaoService.conciliarAuto(contaId, periodo.de, periodo.ate);
            toast.success(r.message);
            carregar();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro na conciliação automática');
        } finally {
            setAutoRodando(false);
        }
    };

    const agir = async (id, fn, ok) => {
        setAgindo(id);
        try {
            const r = await fn();
            toast.success(r.message || ok);
            carregar();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Não deu certo — tente de novo');
        } finally {
            setAgindo(null);
        }
    };

    const conciliarLinha = (l) => {
        const escolhido = escolhas[l.id] || l.sugestoes?.[0]?.id;
        if (!escolhido) { toast.error('Nenhuma sugestão para conciliar.'); return; }
        const payload = l.tipo === 'CREDITO' ? { pagamentoParcelaId: escolhido } : { pagamentoParcelaPagarId: escolhido };
        agir(l.id, () => conciliacaoService.conciliar(l.id, payload), 'Conciliado!');
    };

    const ignorarLinha = (l) => {
        const obs = window.prompt('Por que ignorar? (ex.: tarifa bancária, transferência entre contas)') || '';
        agir(l.id, () => conciliacaoService.ignorar(l.id, obs), 'Ignorado.');
    };

    const desfazerLinha = (l) => agir(l.id, () => conciliacaoService.desfazer(l.id), 'Voltou para pendente.');

    const resumo = dados?.resumo;
    const lancamentos = dados?.lancamentos || [];
    const soNoApp = dados?.soNoApp || { entradas: [], saidas: [] };
    const totalSoNoApp = (soNoApp.entradas?.length || 0) + (soNoApp.saidas?.length || 0);

    // Painel de ação de uma linha pendente (compartilhado entre tabela e card)
    const AcoesPendente = ({ l }) => (
        (l.sugestoes || []).length > 0 ? (
            <div className="flex flex-col gap-1.5 min-w-0">
                {l.sugestoes.length > 1 ? (
                    <SelectBusca value={escolhas[l.id] || l.sugestoes[0].id} onChange={e => setEscolhas(s => ({ ...s, [l.id]: e.target.value }))} className="w-full">
                        {l.sugestoes.map(s => <option key={s.id} value={s.id}>{fmtData(s.data)} — {s.label}</option>)}
                    </SelectBusca>
                ) : (
                    <div className="text-xs text-gray-600 truncate" title={l.sugestoes[0].label}>
                        {fmtData(l.sugestoes[0].data)} — {l.sugestoes[0].label}
                    </div>
                )}
                <div className="flex gap-1.5">
                    <button
                        onClick={() => conciliarLinha(l)}
                        disabled={agindo === l.id}
                        className="px-3 py-1.5 bg-primary hover:bg-primaryDark text-white rounded-full text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                    >
                        <Check className="h-3.5 w-3.5" /> Conciliar
                    </button>
                    <button
                        onClick={() => ignorarLinha(l)}
                        disabled={agindo === l.id}
                        className="px-3 py-1.5 bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-full text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50"
                    >
                        <X className="h-3.5 w-3.5" /> Ignorar
                    </button>
                </div>
            </div>
        ) : (
            <div className="flex flex-col gap-1.5">
                <div className="text-xs text-gray-500">Sem baixa parecida no app</div>
                <button
                    onClick={() => ignorarLinha(l)}
                    disabled={agindo === l.id}
                    className="self-start px-3 py-1.5 bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-full text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50"
                >
                    <X className="h-3.5 w-3.5" /> Ignorar
                </button>
            </div>
        )
    );

    const AcoesLinha = ({ l }) => {
        if (l.status === 'PENDENTE') return <AcoesPendente l={l} />;
        if (l.status === 'CONCILIADO') return (
            <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-gray-600 truncate" title={l.conciliadoCom}>
                    {l.conciliadoAuto ? '🪄 ' : ''}{l.conciliadoCom}
                </span>
                <button onClick={() => desfazerLinha(l)} disabled={agindo === l.id} className="shrink-0 p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100" title="Desfazer">
                    <Undo2 className="h-4 w-4" />
                </button>
            </div>
        );
        return (
            <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-gray-500 truncate">{l.obs || 'Ignorado'}</span>
                <button onClick={() => desfazerLinha(l)} disabled={agindo === l.id} className="shrink-0 p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100" title="Desfazer">
                    <Undo2 className="h-4 w-4" />
                </button>
            </div>
        );
    };

    return (
        <div className="max-w-full overflow-x-hidden -mx-4 sm:-mx-6 lg:-mx-8">
            {/* Topbar */}
            <div className="flex items-center justify-between p-3 md:p-6 bg-white border-b border-gray-200 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="bg-amber-100 p-1.5 md:p-2 rounded-lg shrink-0">
                        <Landmark className="h-4 w-4 md:h-5 md:w-5 text-amber-600" />
                    </div>
                    <h1 className="text-base md:text-2xl font-bold text-gray-900 truncate">Conciliação Bancária</h1>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <input ref={inputArquivo} type="file" accept=".ofx,.OFX,.qfx" className="hidden" onChange={e => importar(e.target.files?.[0])} />
                    <button
                        onClick={() => contaId ? inputArquivo.current?.click() : toast.error('Escolha o banco/caixa primeiro.')}
                        disabled={importando}
                        className="px-3 py-1.5 md:px-4 md:py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm text-xs md:text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                        {importando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        Importar OFX
                    </button>
                    <button
                        onClick={carregar}
                        disabled={loading}
                        className="p-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full disabled:opacity-50"
                        title="Atualizar"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="p-3 md:p-6 space-y-4">
                {/* Conta + período + status */}
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                    <SelectBusca value={contaId} onChange={e => setContaId(e.target.value)} className="w-full md:w-72">
                        <option value="" disabled>Escolha o banco/caixa…</option>
                        {contas.map(c => <option key={c.id} value={c.id}>{c.nome}{c.padrao ? ' (padrão)' : ''}</option>)}
                    </SelectBusca>
                    <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                        {opcoesPeriodo.map(p => (
                            <button
                                key={p.key}
                                onClick={() => setPeriodo(p)}
                                className={`shrink-0 px-3 py-1.5 min-h-[36px] rounded-full text-xs transition-colors ${
                                    periodo.key === p.key
                                        ? 'bg-primary text-white font-semibold'
                                        : 'bg-white border border-gray-300 text-gray-700 font-medium hover:bg-gray-50'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <div className="md:ml-auto">
                        <SelectBusca value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)} className="w-full md:w-44">
                            <option value="todos">Todos os status</option>
                            <option value="PENDENTE">Pendentes</option>
                            <option value="CONCILIADO">Conciliados</option>
                            <option value="IGNORADO">Ignorados</option>
                        </SelectBusca>
                    </div>
                </div>

                {!contaId && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-sm text-gray-500">
                        Escolha o banco/caixa acima, depois importe o extrato OFX exportado do banco.
                    </div>
                )}

                {contaId && (
                    <>
                        {/* KPIs */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <KpiCard
                                titulo="Pendentes"
                                valor={String(resumo?.pendentes ?? '—')}
                                cor={Number(resumo?.pendentes) > 0 ? 'text-amber-700' : 'text-gray-900'}
                                sub={`R$ ${fmt(resumo?.valorPendente)} a conferir`}
                            />
                            <KpiCard
                                titulo="Conciliados"
                                valor={String(resumo?.conciliados ?? '—')}
                                cor="text-green-700"
                                sub={`R$ ${fmt(resumo?.valorConciliado)} batidos`}
                            />
                            <KpiCard titulo="Ignorados" valor={String(resumo?.ignorados ?? '—')} sub="tarifas, transferências…" />
                            <KpiCard
                                titulo="Só no app"
                                valor={String(totalSoNoApp)}
                                cor={totalSoNoApp > 0 ? 'text-amber-700' : 'text-gray-900'}
                                sub="baixas sem par no extrato"
                            />
                        </div>

                        {/* Ação em massa */}
                        {Number(resumo?.pendentes) > 0 && (
                            <button
                                onClick={conciliarAuto}
                                disabled={autoRodando || loading}
                                className="px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
                            >
                                {autoRodando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                                Conciliar automático (casos com 1 só candidato)
                            </button>
                        )}

                        {loading && (
                            <div className="text-center text-gray-500 text-sm py-2 flex items-center justify-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                            </div>
                        )}

                        {!loading && lancamentos.length === 0 && (
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-sm text-gray-500">
                                Nenhum lançamento do extrato neste período. Importe o arquivo OFX do banco (botão verde no topo).
                            </div>
                        )}

                        {lancamentos.length > 0 && (
                            <>
                                {/* Mobile: cards */}
                                <div className="md:hidden space-y-3">
                                    {lancamentos.map(l => (
                                        <div key={l.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs text-gray-500">{fmtData(l.data)}</span>
                                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[l.status]}`}>{STATUS_LABEL[l.status]}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2 mb-2">
                                                <span className="text-sm text-gray-900 truncate" title={l.descricao || ''}>{l.descricao || '(sem descrição)'}</span>
                                                <ValorCell tipo={l.tipo} valor={l.valor} />
                                            </div>
                                            <AcoesLinha l={l} />
                                        </div>
                                    ))}
                                </div>

                                {/* Desktop: tabela */}
                                <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</th>
                                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Descrição no banco</th>
                                                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-96">Conciliação</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                            {lancamentos.map(l => (
                                                <tr key={l.id} className="hover:bg-gray-50 align-top">
                                                    <td className="px-5 py-3 text-gray-900 whitespace-nowrap">{fmtData(l.data)}</td>
                                                    <td className="px-5 py-3 text-gray-700 max-w-xs"><span className="line-clamp-2">{l.descricao || '(sem descrição)'}</span></td>
                                                    <td className="px-5 py-3 text-right whitespace-nowrap"><ValorCell tipo={l.tipo} valor={l.valor} /></td>
                                                    <td className="px-5 py-3"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[l.status]}`}>{STATUS_LABEL[l.status]}</span></td>
                                                    <td className="px-5 py-3 w-96"><AcoesLinha l={l} /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}

                        {/* Só no app: baixas sem par no extrato */}
                        {totalSoNoApp > 0 && (
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                                <button
                                    onClick={() => setMostrarSoNoApp(v => !v)}
                                    className="w-full flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 text-left"
                                >
                                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600 flex-1">
                                        Baixas do app sem par no extrato ({totalSoNoApp})
                                    </span>
                                    {mostrarSoNoApp ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                                </button>
                                {mostrarSoNoApp && (
                                    <div className="p-5 space-y-1.5 text-sm">
                                        <p className="text-xs text-gray-500 mb-2">
                                            Estão registradas no app nesta conta, mas nenhum lançamento do extrato bateu com elas.
                                            Pode ser data/valor diferente, conta errada na baixa, ou extrato ainda não importado.
                                        </p>
                                        {(soNoApp.entradas || []).map(p => (
                                            <div key={p.id} className="flex items-center justify-between gap-2">
                                                <span className="text-gray-700 truncate">{fmtData(p.data)} — {p.label}</span>
                                                <span className="font-semibold text-green-700 whitespace-nowrap">+ R$ {fmt(p.valor)}</span>
                                            </div>
                                        ))}
                                        {(soNoApp.saidas || []).map(p => (
                                            <div key={p.id} className="flex items-center justify-between gap-2">
                                                <span className="text-gray-700 truncate">{fmtData(p.data)} — {p.label}</span>
                                                <span className="font-semibold text-red-700 whitespace-nowrap">− R$ {fmt(p.valor)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <p className="text-xs text-gray-500">
                            Como funciona: exporte o extrato do banco em OFX e importe aqui (importar de novo não duplica).
                            O sistema sugere a baixa do app com o mesmo valor e data próxima (±3 dias) na mesma conta;
                            "Conciliar automático" fecha sozinho os casos sem ambiguidade. Tarifas e transferências entre contas podem ser marcadas como ignoradas.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
};

export default ConciliacaoBancariaPage;
