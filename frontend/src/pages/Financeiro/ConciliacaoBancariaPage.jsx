import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import conciliacaoService from '../../services/conciliacaoBancariaService';
import contasReceberService from '../../services/contasReceberService';
import SelectBusca from '../../components/SelectBusca';
import { Landmark, Loader2, RefreshCw, Upload, Wand2, Check, X, Undo2, ChevronDown, ChevronUp, Layers, Search, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useFiltroSalvo } from '../../hooks/useFiltrosSalvos';

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

// ── Modal de conciliação em GRUPO: N lançamentos do extrato ↔ M baixas (soma exata) ──
// Cobre 1 PIX pagando várias notas, 2 PIX pagando uma baixa, e PIX parcial
// (a parte da nota precisa estar registrada como baixa parcial no app).
const GrupoModal = ({ lancamento, pendentes, contaId, periodo, onClose, onSuccess }) => {
    const [disponiveis, setDisponiveis] = useState(null); // null = carregando
    const [selLanc, setSelLanc] = useState(new Set([lancamento.id]));
    const [selPag, setSelPag] = useState(new Set());
    const [busca, setBusca] = useState('');
    const [salvando, setSalvando] = useState(false);

    const outrosPendentes = pendentes.filter(p => p.tipo === lancamento.tipo);

    useEffect(() => {
        conciliacaoService.baixasDisponiveis(contaId, periodo.de, periodo.ate, lancamento.tipo)
            .then(setDisponiveis)
            .catch(() => { toast.error('Não consegui carregar as baixas do app.'); setDisponiveis([]); });
    }, [contaId, periodo, lancamento.tipo]);

    const alternar = (setFn, id) => setFn(prev => {
        const s = new Set(prev);
        if (s.has(id)) s.delete(id); else s.add(id);
        return s;
    });

    const somaLanc = outrosPendentes.filter(p => selLanc.has(p.id)).reduce((s, p) => s + p.valor, 0);
    const somaPag = (disponiveis || []).filter(p => selPag.has(p.id)).reduce((s, p) => s + p.valor, 0);
    const diferenca = Math.round((somaLanc - somaPag) * 100) / 100;
    const somaBate = Math.abs(diferenca) <= 0.01 && selLanc.size > 0 && selPag.size > 0;

    const listaBaixas = (disponiveis || []).filter(p =>
        !busca.trim() || p.label.toLowerCase().includes(busca.trim().toLowerCase())
    );

    const confirmar = async () => {
        setSalvando(true);
        try {
            const r = await conciliacaoService.conciliarGrupo(contaId, [...selLanc], [...selPag]);
            toast.success(r.message);
            onSuccess();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao conciliar o grupo');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
            <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-w-2xl w-full max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <div>
                        <p className="text-xs text-gray-500">Conciliar em grupo — {lancamento.tipo === 'CREDITO' ? 'entrada' : 'saída'}</p>
                        <h2 className="font-bold text-gray-900">A soma dos dois lados precisa bater</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto">
                    {/* Lado do banco */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Lançamentos do extrato</p>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {outrosPendentes.map(p => (
                                <label key={p.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer ${selLanc.has(p.id) ? 'border-primary bg-mint/30' : 'border-gray-200 hover:bg-gray-50'}`}>
                                    <input type="checkbox" checked={selLanc.has(p.id)} onChange={() => alternar(setSelLanc, p.id)} className="accent-[#00754A]" />
                                    <span className="text-xs text-gray-500 shrink-0">{fmtData(p.data)}</span>
                                    <span className="text-sm text-gray-800 truncate flex-1">{p.descricao || '(sem descrição)'}</span>
                                    <span className="text-sm font-semibold whitespace-nowrap">R$ {fmt(p.valor)}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Lado do app */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Baixas do app (marque as que este dinheiro cobre)</p>
                        <div className="relative mb-2">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                value={busca}
                                onChange={e => setBusca(e.target.value)}
                                placeholder="Buscar cliente/fornecedor..."
                                className="w-full border border-gray-300 rounded pl-9 pr-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                        </div>
                        {disponiveis === null && (
                            <div className="text-center text-gray-500 text-sm py-3 flex items-center justify-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" /> Carregando baixas…
                            </div>
                        )}
                        {disponiveis !== null && listaBaixas.length === 0 && (
                            <p className="text-sm text-gray-500 py-2">
                                Nenhuma baixa livre encontrada no período. Se o pagamento cobriu parte de uma nota,
                                registre primeiro a <strong>baixa parcial</strong> com esse valor em Contas a {lancamento.tipo === 'CREDITO' ? 'Receber' : 'Pagar'}.
                            </p>
                        )}
                        <div className="space-y-1.5 max-h-56 overflow-y-auto">
                            {listaBaixas.map(p => (
                                <label key={p.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer ${selPag.has(p.id) ? 'border-primary bg-mint/30' : 'border-gray-200 hover:bg-gray-50'}`}>
                                    <input type="checkbox" checked={selPag.has(p.id)} onChange={() => alternar(setSelPag, p.id)} className="accent-[#00754A]" />
                                    <span className="text-xs text-gray-500 shrink-0">{fmtData(p.data)}</span>
                                    <span className="text-sm text-gray-800 truncate flex-1">{p.label}</span>
                                    <span className="text-sm font-semibold whitespace-nowrap">R$ {fmt(p.valor)}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Rodapé com a soma ao vivo */}
                <div className="px-5 py-4 border-t border-gray-100 shrink-0 space-y-2">
                    <div className={`rounded-xl border p-3 flex items-center justify-between text-sm ${somaBate ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                        <span className={somaBate ? 'text-green-800' : 'text-amber-800'}>
                            Extrato R$ {fmt(somaLanc)} × Baixas R$ {fmt(somaPag)}
                        </span>
                        <span className={`font-bold ${somaBate ? 'text-green-800' : 'text-amber-800'}`}>
                            {somaBate ? '✓ Soma bate' : `Diferença R$ ${fmt(Math.abs(diferenca))}`}
                        </span>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-medium text-sm">Cancelar</button>
                        <button
                            onClick={confirmar}
                            disabled={!somaBate || salvando}
                            className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            Conciliar grupo ({selLanc.size} ↔ {selPag.size})
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── Modal: criar a despesa que faltava, direto do extrato ──
// O dinheiro já saiu do banco, então a despesa nasce PAGA: data, valor e banco vêm do
// próprio lançamento (campos travados). Ao salvar, a baixa criada vira o candidato da
// linha — o usuário volta para a lista e clica em "Conciliar".
const DespesaModal = ({ lancamento, onClose, onSuccess }) => {
    const [opcoes, setOpcoes] = useState(null); // { fornecedores, categorias, metodosPagamento }
    const [salvando, setSalvando] = useState(false);
    const [novoFornecedor, setNovoFornecedor] = useState(false);
    const [form, setForm] = useState({
        fornecedorId: '',
        fornecedorNovo: '',
        descricao: '',
        categoriaCaId: '',
        numeroNota: lancamento.detalhes?.documento || '',
        dataVencimento: lancamento.data,
        metodoPagamento: 'BOLETO_BANCARIO',
        juros: '',
        multa: '',
        observacoes: ''
    });
    const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }));

    useEffect(() => {
        conciliacaoService.opcoesDespesa()
            .then(o => {
                setOpcoes(o);
                // Sugere a descrição a partir do que o banco mandou (beneficiário, quando existe)
                setForm(f => ({
                    ...f,
                    descricao: f.descricao || lancamento.detalhes?.nome || lancamento.descricao || ''
                }));
            })
            .catch(() => { toast.error('Não consegui carregar fornecedores/categorias.'); setOpcoes({ fornecedores: [], categorias: [], metodosPagamento: [] }); });
    }, [lancamento]);

    const total = Number(lancamento.valor || 0);
    const jur = Math.max(0, Number(String(form.juros).replace(',', '.')) || 0);
    const mul = Math.max(0, Number(String(form.multa).replace(',', '.')) || 0);
    const valorBoleto = Math.round((total - jur - mul) * 100) / 100;
    const valorValido = valorBoleto > 0;
    const temFornecedor = novoFornecedor ? !!form.fornecedorNovo.trim() : !!form.fornecedorId;
    const podeSalvar = temFornecedor && form.descricao.trim() && form.metodoPagamento && valorValido && !salvando;

    const salvar = async () => {
        setSalvando(true);
        try {
            const r = await conciliacaoService.criarDespesa(lancamento.id, {
                fornecedorId: novoFornecedor ? null : form.fornecedorId,
                fornecedorNovo: novoFornecedor ? form.fornecedorNovo.trim() : null,
                descricao: form.descricao.trim(),
                categoriaCaId: form.categoriaCaId || null,
                categoria: opcoes?.categorias?.find(c => c.id === form.categoriaCaId)?.nome || null,
                numeroNota: form.numeroNota.trim() || null,
                dataVencimento: form.dataVencimento || null,
                metodoPagamento: form.metodoPagamento,
                juros: jur,
                multa: mul,
                observacoes: form.observacoes.trim() || null
            });
            toast.success(r.message);
            onSuccess();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao criar a despesa');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
            <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-w-lg w-full max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <div className="min-w-0">
                        <p className="text-xs text-gray-500">Saída do banco sem despesa lançada</p>
                        <h2 className="font-bold text-gray-900">Cadastrar a despesa</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto">
                    {/* O que o banco disse — tudo o que temos do lançamento */}
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm space-y-1">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-600">{fmtData(lancamento.data)}</span>
                            <span className="font-bold text-red-700">− R$ {fmt(total)}</span>
                        </div>
                        <div className="text-gray-800 break-words">{lancamento.descricao || '(sem descrição)'}</div>
                        {lancamento.detalhes?.nome && <div className="text-gray-600 text-xs">Beneficiário no banco: <strong>{lancamento.detalhes.nome}</strong></div>}
                        {lancamento.detalhes?.documento && <div className="text-gray-600 text-xs">Documento: {lancamento.detalhes.documento}</div>}
                    </div>

                    {opcoes === null ? (
                        <div className="text-center text-gray-500 text-sm py-4 flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                        </div>
                    ) : (
                        <>
                            {/* Fornecedor */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-sm font-medium text-gray-700">Fornecedor *</label>
                                    <button
                                        type="button"
                                        onClick={() => setNovoFornecedor(v => !v)}
                                        className="text-xs font-medium text-primary hover:underline"
                                    >
                                        {novoFornecedor ? 'Escolher um já cadastrado' : '+ Cadastrar novo'}
                                    </button>
                                </div>
                                {novoFornecedor ? (
                                    <input
                                        value={form.fornecedorNovo}
                                        onChange={set('fornecedorNovo')}
                                        placeholder="Nome / razão social do fornecedor"
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                    />
                                ) : (
                                    <SelectBusca value={form.fornecedorId} onChange={set('fornecedorId')} className="w-full">
                                        <option value="">Escolha o fornecedor…</option>
                                        {(opcoes.fornecedores || []).map(f => (
                                            <option key={f.id} value={f.id}>{f.nomeFantasia || f.razaoSocial}</option>
                                        ))}
                                    </SelectBusca>
                                )}
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-700 block mb-1">Descrição *</label>
                                <input
                                    value={form.descricao}
                                    onChange={set('descricao')}
                                    placeholder="Ex.: Energia elétrica — julho"
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-700 block mb-1">Categoria (DRE)</label>
                                    <SelectBusca value={form.categoriaCaId} onChange={set('categoriaCaId')} className="w-full">
                                        <option value="">Sem categoria</option>
                                        {(opcoes.categorias || []).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                    </SelectBusca>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700 block mb-1">Forma de pagamento *</label>
                                    <SelectBusca value={form.metodoPagamento} onChange={set('metodoPagamento')} className="w-full">
                                        {(opcoes.metodosPagamento || []).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                    </SelectBusca>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700 block mb-1">Vencimento do boleto</label>
                                    <input
                                        type="date"
                                        value={form.dataVencimento}
                                        onChange={set('dataVencimento')}
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-700 block mb-1">Nº da nota/documento</label>
                                    <input
                                        value={form.numeroNota}
                                        onChange={set('numeroNota')}
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                    />
                                </div>
                            </div>

                            {/* Juros/multa: o extrato traz o TOTAL que saiu; aqui a gente separa */}
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Pagou juros ou multa?</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 block mb-1">Juros (R$)</label>
                                        <input
                                            inputMode="decimal"
                                            value={form.juros}
                                            onChange={set('juros')}
                                            placeholder="0,00"
                                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 block mb-1">Multa (R$)</label>
                                        <input
                                            inputMode="decimal"
                                            value={form.multa}
                                            onChange={set('multa')}
                                            placeholder="0,00"
                                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                        />
                                    </div>
                                </div>
                                <div className={`mt-2 rounded-xl border p-3 text-sm ${valorValido ? 'border-gray-200 bg-gray-50' : 'border-red-200 bg-red-50'}`}>
                                    {valorValido ? (
                                        <span className="text-gray-700">
                                            Valor da despesa <strong>R$ {fmt(valorBoleto)}</strong>
                                            {(jur > 0 || mul > 0) && <> + juros/multa <strong>R$ {fmt(jur + mul)}</strong></>}
                                            {' = '}<strong>R$ {fmt(total)}</strong> que saiu do banco.
                                        </span>
                                    ) : (
                                        <span className="text-red-700">Juros + multa não podem chegar ao valor total que saiu do banco.</span>
                                    )}
                                </div>
                            </div>

                            <p className="text-xs text-gray-500">
                                A despesa é criada <strong>já paga</strong> em {fmtData(lancamento.data)}, no banco deste extrato, e vai para o Conta Azul.
                                Depois de salvar, a linha volta com a baixa como sugestão — aí é só clicar em <strong>Conciliar</strong>.
                            </p>
                        </>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 shrink-0 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-medium text-sm">Cancelar</button>
                    <button
                        onClick={salvar}
                        disabled={!podeSalvar}
                        className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Cadastrar despesa
                    </button>
                </div>
            </div>
        </div>
    );
};

const ConciliacaoBancariaPage = () => {
    const opcoesPeriodo = useMemo(periodos, []);
    const [contas, setContas] = useState([]);
    // Filtros persistidos por usuário/tela. Do período salvamos só a CHAVE
    // ('ULT30' etc.) — as datas são recalculadas a partir de hoje a cada visita.
    const [contaId, setContaId] = useFiltroSalvo('conciliacao-bancaria:contaId', '');
    const [periodoKey, setPeriodoKey] = useFiltroSalvo('conciliacao-bancaria:periodoKey', 'ULT30'); // últimos 30 dias
    const periodo = useMemo(
        () => opcoesPeriodo.find(p => p.key === periodoKey) || opcoesPeriodo[1],
        [opcoesPeriodo, periodoKey]
    );
    const setPeriodo = (p) => setPeriodoKey(p.key);
    const [statusFiltro, setStatusFiltro] = useFiltroSalvo('conciliacao-bancaria:statusFiltro', 'todos');
    const [dados, setDados] = useState(null);
    const [loading, setLoading] = useState(false);
    const [agindo, setAgindo] = useState(null); // id do lançamento com ação em andamento
    const [importando, setImportando] = useState(false);
    const [autoRodando, setAutoRodando] = useState(false);
    const [escolhas, setEscolhas] = useState({}); // lancamentoId → id do pagamento escolhido
    const [mostrarSoNoApp, setMostrarSoNoApp] = useState(false);
    const [grupoModal, setGrupoModal] = useState(null); // lançamento que abriu o modal de grupo
    const [despesaModal, setDespesaModal] = useState(null); // lançamento que abriu o modal de nova despesa
    const inputArquivo = useRef(null);

    useEffect(() => {
        contasReceberService.contasFinanceiras()
            .then(cf => {
                setContas(cf);
                const padrao = cf.find(c => c.padrao) || cf[0];
                // Mantém a conta salva do usuário se ela ainda existir; senão, usa a padrão
                setContaId(prev => (prev && cf.some(c => c.id === prev)) ? prev : (padrao ? padrao.id : ''));
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
                <div className="flex flex-wrap gap-1.5">
                    <button
                        onClick={() => conciliarLinha(l)}
                        disabled={agindo === l.id}
                        className="px-3 py-1.5 bg-primary hover:bg-primaryDark text-white rounded-full text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                    >
                        <Check className="h-3.5 w-3.5" /> Conciliar
                    </button>
                    <button
                        onClick={() => setGrupoModal(l)}
                        disabled={agindo === l.id}
                        className="px-3 py-1.5 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50"
                        title="Um pagamento cobrindo várias baixas (ou o contrário)"
                    >
                        <Layers className="h-3.5 w-3.5" /> Várias…
                    </button>
                    {l.tipo === 'DEBITO' && (
                        <button
                            onClick={() => setDespesaModal(l)}
                            disabled={agindo === l.id}
                            className="px-3 py-1.5 bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-full text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50"
                            title="Nenhuma dessas serve? Cadastre a despesa deste pagamento"
                        >
                            <Plus className="h-3.5 w-3.5" /> Despesa
                        </button>
                    )}
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
                <div className="flex flex-wrap gap-1.5">
                    {/* Saída sem par = despesa que ninguém lançou. Cadastrar aqui é a ação principal. */}
                    {l.tipo === 'DEBITO' && (
                        <button
                            onClick={() => setDespesaModal(l)}
                            disabled={agindo === l.id}
                            className="px-3 py-1.5 bg-primary hover:bg-primaryDark text-white rounded-full text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                            title="Lançar esta saída no Contas a Pagar (já paga) e depois conciliar"
                        >
                            <Plus className="h-3.5 w-3.5" /> Criar despesa
                        </button>
                    )}
                    <button
                        onClick={() => setGrupoModal(l)}
                        disabled={agindo === l.id}
                        className="px-3 py-1.5 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50"
                        title="Um pagamento cobrindo várias baixas (ou o contrário)"
                    >
                        <Layers className="h-3.5 w-3.5" /> Conciliar várias…
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
        )
    );

    // Descrição do banco + o que mais o OFX trouxe (beneficiário, nº do documento).
    // "DÉB.TIT.COMPE EFETIVADO" sozinho não diz nada — o beneficiário, quando o banco
    // manda, é a única pista de do que se trata.
    const DescricaoBanco = ({ l }) => (
        <div className="min-w-0">
            <span className="line-clamp-2 text-gray-700">{l.descricao || '(sem descrição)'}</span>
            {(l.detalhes?.nome || l.detalhes?.documento) && (
                <div className="text-xs text-gray-500 mt-0.5 truncate">
                    {l.detalhes.nome && <span className="text-gray-600 font-medium">{l.detalhes.nome}</span>}
                    {l.detalhes.nome && l.detalhes.documento && ' · '}
                    {l.detalhes.documento && <span>doc {l.detalhes.documento}</span>}
                </div>
            )}
        </div>
    );

    const AcoesLinha = ({ l }) => {
        if (l.status === 'PENDENTE') return <AcoesPendente l={l} />;
        if (l.status === 'CONCILIADO') return (
            <div className="flex items-center gap-2 min-w-0">
                <div className="min-w-0">
                    <span className="text-xs text-gray-600 truncate block" title={l.conciliadoCom}>
                        {l.conciliadoAuto ? '🪄 ' : ''}{l.conciliadoCom}
                    </span>
                    {(l.grupoBaixas || []).length > 0 && (
                        <span className="text-xs text-gray-500 truncate block" title={l.grupoBaixas.join(' · ')}>
                            {l.grupoBaixas.join(' · ')}
                        </span>
                    )}
                </div>
                <button onClick={() => desfazerLinha(l)} disabled={agindo === l.id} className="shrink-0 p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100" title="Desfazer (desfaz o grupo inteiro, se houver)">
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
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <div className="text-sm min-w-0"><DescricaoBanco l={l} /></div>
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
                                                    <td className="px-5 py-3 max-w-xs"><DescricaoBanco l={l} /></td>
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
                            Como funciona: exporte o extrato do banco em OFX e importe aqui (importar de novo não duplica —
                            só atualiza a descrição das linhas que já existiam). Conciliar <strong>não dá baixa</strong>: ela só
                            confere que a saída/entrada do banco corresponde a uma baixa <em>já registrada</em> no app.
                            O sistema sugere a baixa com o mesmo valor (juros e multa incluídos) e data próxima (±3 dias) na mesma conta;
                            "Conciliar automático" fecha sozinho os casos sem ambiguidade. Saída sem par no app = despesa que ninguém
                            lançou: use <strong>"Criar despesa"</strong> para cadastrá-la já paga (vai para o Conta Azul) e conciliar em seguida.
                            Um PIX que pagou várias notas (ou parte de uma nota registrada como baixa parcial) usa o botão <strong>"Várias…"</strong> —
                            a soma dos dois lados precisa bater. Tarifas e transferências entre contas podem ser marcadas como ignoradas.
                        </p>
                    </>
                )}
            </div>

            {grupoModal && (
                <GrupoModal
                    lancamento={grupoModal}
                    pendentes={lancamentos.filter(x => x.status === 'PENDENTE')}
                    contaId={contaId}
                    periodo={periodo}
                    onClose={() => setGrupoModal(null)}
                    onSuccess={() => { setGrupoModal(null); carregar(); }}
                />
            )}

            {/* Cadastrar a despesa que faltava. Ao salvar, volta para a lista com a baixa
                já sugerida na linha — o usuário confere e clica em "Conciliar". */}
            {despesaModal && (
                <DespesaModal
                    lancamento={despesaModal}
                    onClose={() => setDespesaModal(null)}
                    onSuccess={() => { setDespesaModal(null); carregar(); }}
                />
            )}
        </div>
    );
};

export default ConciliacaoBancariaPage;
