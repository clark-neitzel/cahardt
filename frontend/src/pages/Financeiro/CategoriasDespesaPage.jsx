import React, { useEffect, useMemo, useState } from 'react';
import { Tags, Loader2, Save, CheckCircle2, AlertTriangle, Plus, Pencil, Trash2, ChevronUp, ChevronDown, Check, X, Blocks } from 'lucide-react';
import toast from 'react-hot-toast';
import financeiroGerencialService from '../../services/financeiroGerencialService';
import SelectBusca from '../../components/SelectBusca';

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

// Valor especial do seletor de bloco para "não entra na DRE"
const FORA = '__FORA__';

// Chips de natureza: a pergunta é "se eu vender o dobro, esse gasto dobra?"
const NATUREZAS = [
    { valor: 'VARIAVEL', label: 'Variável', ajuda: 'Cresce junto com a venda (matéria-prima, embalagem, comissão, frete).', ativo: 'bg-blue-600 text-white border-blue-600', cls: 'bg-blue-100 text-blue-800 border-blue-300' },
    { valor: 'FIXA', label: 'Fixa', ajuda: 'Custo de existir: paga vendendo ou não (salário, aluguel, contador).', ativo: 'bg-primary text-white border-primary', cls: 'bg-mint text-primaryDark border-primary/30' }
];

const SeletorNatureza = ({ valor, onChange }) => (
    <div className="flex gap-1.5">
        {NATUREZAS.map((n) => {
            const ativo = valor === n.valor;
            return (
                <button
                    key={n.valor}
                    onClick={() => onChange(ativo ? 'A_DEFINIR' : n.valor)}
                    title={n.ajuda}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border min-h-[32px] transition-colors ${ativo ? n.ativo : `${n.cls} hover:opacity-80`}`}
                >
                    {n.label}
                </button>
            );
        })}
    </div>
);

const CategoriasDespesaPage = () => {
    const [linhas, setLinhas] = useState([]);
    const [grupos, setGrupos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [alterado, setAlterado] = useState(false);
    // Gerenciar blocos
    const [novoNome, setNovoNome] = useState('');
    const [criando, setCriando] = useState(false);
    const [editandoId, setEditandoId] = useState(null);
    const [nomeEdit, setNomeEdit] = useState('');

    const carregar = async () => {
        setLoading(true);
        try {
            const [dados, gs] = await Promise.all([
                financeiroGerencialService.categoriasDespesa(),
                financeiroGerencialService.gruposDre()
            ]);
            // sem definição primeiro; depois maior gasto primeiro
            const pend = (l) => (l.classificacao !== 'FORA_DRE' && (!l.grupoDreId || l.natureza === 'A_DEFINIR')) ? 0 : 1;
            const ord = [...dados].sort((a, b) => pend(a) - pend(b) || (b.total || 0) - (a.total || 0));
            setLinhas(ord);
            setGrupos(gs);
            setAlterado(false);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar categorias.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { carregar(); }, []);

    // valor do seletor de bloco de uma linha
    const blocoDe = (l) => (l.classificacao === 'FORA_DRE' ? FORA : (l.grupoDreId || ''));

    const mudarBloco = (nome, valor) => {
        setLinhas((prev) => prev.map((l) => {
            if (l.nome !== nome) return l;
            if (valor === FORA) return { ...l, classificacao: 'FORA_DRE', grupoDreId: null };
            if (!valor) return { ...l, classificacao: 'A_CLASSIFICAR', grupoDreId: null };
            return { ...l, classificacao: l.classificacao === 'FORA_DRE' || l.classificacao === 'A_CLASSIFICAR' ? 'OPERACIONAL' : l.classificacao, grupoDreId: valor };
        }));
        setAlterado(true);
    };

    const mudarNatureza = (nome, natureza) => {
        setLinhas((prev) => prev.map((l) => (l.nome === nome ? { ...l, natureza } : l)));
        setAlterado(true);
    };

    const pendentes = useMemo(
        () => linhas.filter((l) => l.classificacao !== 'FORA_DRE' && (!l.grupoDreId || l.natureza === 'A_DEFINIR')).length,
        [linhas]
    );

    const salvar = async () => {
        setSalvando(true);
        try {
            await financeiroGerencialService.salvarCategoriasDespesa(
                linhas.map((l) => ({ nome: l.nome, classificacao: l.classificacao, grupoDreId: l.grupoDreId, natureza: l.natureza }))
            );
            toast.success('Classificação salva! A DRE já usa a nova divisão.');
            setAlterado(false);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao salvar.');
        } finally {
            setSalvando(false);
        }
    };

    // ── Blocos: criar, renomear, reordenar, excluir (salvam na hora) ──
    const criarBloco = async () => {
        const nome = novoNome.trim();
        if (!nome) return;
        setCriando(true);
        try {
            const g = await financeiroGerencialService.criarGrupoDre(nome);
            setGrupos((prev) => [...prev, g]);
            setNovoNome('');
            toast.success(`Bloco "${g.nome}" criado!`);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao criar o bloco.');
        } finally {
            setCriando(false);
        }
    };

    const renomear = async (id) => {
        const nome = nomeEdit.trim();
        if (!nome) return;
        try {
            const g = await financeiroGerencialService.renomearGrupoDre(id, nome);
            setGrupos((prev) => prev.map((x) => (x.id === id ? g : x)));
            setEditandoId(null);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao renomear.');
        }
    };

    const mover = async (id, delta) => {
        const i = grupos.findIndex((g) => g.id === id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= grupos.length) return;
        const novo = [...grupos];
        [novo[i], novo[j]] = [novo[j], novo[i]];
        setGrupos(novo);
        try {
            await financeiroGerencialService.reordenarGruposDre(novo.map((g) => g.id));
        } catch (e) {
            toast.error('Erro ao salvar a ordem.');
            carregar();
        }
    };

    const excluir = async (g) => {
        const qtd = linhas.filter((l) => l.grupoDreId === g.id).length;
        const msg = qtd > 0
            ? `Excluir o bloco "${g.nome}"? As ${qtd} categoria(s) dele ficarão sem bloco (você reclassifica depois).`
            : `Excluir o bloco "${g.nome}"?`;
        if (!window.confirm(msg)) return;
        try {
            await financeiroGerencialService.excluirGrupoDre(g.id);
            setGrupos((prev) => prev.filter((x) => x.id !== g.id));
            setLinhas((prev) => prev.map((l) => (l.grupoDreId === g.id ? { ...l, grupoDreId: null } : l)));
            toast.success('Bloco excluído.');
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao excluir o bloco.');
        }
    };

    return (
        <div className="max-w-full overflow-x-hidden -mx-4 sm:-mx-6 lg:-mx-8">
            {/* Topbar */}
            <div className="flex items-center justify-between p-3 md:p-6 bg-white border-b border-gray-200">
                <div className="flex items-center gap-2">
                    <div className="bg-amber-100 p-1.5 md:p-2 rounded-lg">
                        <Tags className="h-4 w-4 md:h-5 md:w-5 text-amber-600" />
                    </div>
                    <h1 className="text-base md:text-2xl font-bold text-gray-900">Categorias de Despesa</h1>
                </div>
                <button
                    onClick={salvar}
                    disabled={salvando || !alterado}
                    className="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm text-xs md:text-sm font-semibold disabled:opacity-50"
                >
                    {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar
                </button>
            </div>

            <div className="p-3 md:p-6 space-y-4">
                {/* Explicação */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-5">
                    <p className="text-sm text-gray-600">
                        Cada categoria precisa de duas escolhas para a <b>DRE</b> contar a história certa:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                        <div className="rounded-lg border border-gray-200 p-3">
                            <div className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-1">1 · Bloco</div>
                            <p className="text-xs text-gray-600">Em qual grupo da DRE ela aparece (Custos variáveis, Pessoal, Administrativas…). Escolha <b>Fora da DRE</b> para o que não é resultado: retirada de lucro, empréstimo, compra de bem.</p>
                        </div>
                        <div className="rounded-lg border border-gray-200 p-3">
                            <div className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-1">2 · Fixa ou Variável</div>
                            <p className="text-xs text-gray-600">Pergunte: <b>"se eu vender o dobro, esse gasto dobra?"</b> Sim = <b>Variável</b>. Não = <b>Fixa</b>. É isso que calcula a Margem de Contribuição na DRE.</p>
                        </div>
                    </div>
                    {pendentes > 0 && (
                        <div className="flex items-center gap-2 mt-3 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span><b>{pendentes}</b> categoria(s) ainda sem bloco ou sem fixa/variável definidos.</span>
                        </div>
                    )}
                </div>

                {/* Gerenciar blocos */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                        <Blocks className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Blocos da DRE</span>
                    </div>
                    <div className="p-4 md:p-5 space-y-3">
                        <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                            {grupos.map((g, i) => (
                                <div key={g.id} className="flex items-center gap-2 px-3 py-2">
                                    <div className="flex flex-col shrink-0">
                                        <button onClick={() => mover(g.id, -1)} disabled={i === 0} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30" title="Subir">
                                            <ChevronUp className="h-4 w-4" />
                                        </button>
                                        <button onClick={() => mover(g.id, 1)} disabled={i === grupos.length - 1} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30" title="Descer">
                                            <ChevronDown className="h-4 w-4" />
                                        </button>
                                    </div>
                                    {editandoId === g.id ? (
                                        <>
                                            <input
                                                value={nomeEdit}
                                                onChange={(e) => setNomeEdit(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') renomear(g.id); if (e.key === 'Escape') setEditandoId(null); }}
                                                autoFocus
                                                className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                            />
                                            <button onClick={() => renomear(g.id)} className="p-2 text-green-600 hover:text-green-700 rounded-full hover:bg-green-50" title="Confirmar">
                                                <Check className="h-4 w-4" />
                                            </button>
                                            <button onClick={() => setEditandoId(null)} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100" title="Cancelar">
                                                <X className="h-4 w-4" />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <span className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">{g.nome}</span>
                                            <span className="text-xs text-gray-500 shrink-0">{linhas.filter((l) => l.grupoDreId === g.id).length} categoria(s)</span>
                                            <button onClick={() => { setEditandoId(g.id); setNomeEdit(g.nome); }} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100" title="Renomear">
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            <button onClick={() => excluir(g)} className="p-2 text-gray-400 hover:text-red-600 rounded-full hover:bg-red-50" title="Excluir">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            ))}
                            {grupos.length === 0 && (
                                <div className="text-center text-gray-500 py-6 text-sm">Nenhum bloco ainda — crie o primeiro abaixo.</div>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <input
                                value={novoNome}
                                onChange={(e) => setNovoNome(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') criarBloco(); }}
                                placeholder="Nome do bloco novo (ex.: Marketing)"
                                className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                            <button
                                onClick={criarBloco}
                                disabled={criando || !novoNome.trim()}
                                className="flex items-center gap-1.5 px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm disabled:opacity-50 shrink-0"
                            >
                                {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                Criar bloco
                            </button>
                        </div>
                        <p className="text-xs text-gray-500">A ordem daqui é a ordem em que os blocos aparecem na DRE.</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center gap-2 text-gray-500 py-16">
                        <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
                    </div>
                ) : (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
                        {linhas.map((l) => {
                            const fora = l.classificacao === 'FORA_DRE';
                            const ok = fora || (l.grupoDreId && l.natureza !== 'A_DEFINIR');
                            return (
                                <div key={l.nome} className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 px-4 py-3">
                                    <div className="flex items-center gap-2 min-w-0 md:flex-1">
                                        {ok
                                            ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                                            : <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}
                                        <span className="font-medium text-gray-900 text-sm truncate">{l.nome}</span>
                                    </div>
                                    <div className="text-xs text-gray-500 md:w-36 md:text-right shrink-0">
                                        R$ {fmt(l.total)} <span className="text-gray-500">acumulado</span>
                                    </div>
                                    <div className="w-full md:w-56 shrink-0">
                                        <SelectBusca value={blocoDe(l)} onChange={(e) => mudarBloco(l.nome, e.target.value)} className="w-full">
                                            <option value="">— Sem bloco (a classificar) —</option>
                                            {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
                                            <option value={FORA}>🚫 Fora da DRE (não é resultado)</option>
                                        </SelectBusca>
                                    </div>
                                    <div className="md:shrink-0 md:w-[152px]">
                                        {!fora && <SeletorNatureza valor={l.natureza} onChange={(v) => mudarNatureza(l.nome, v)} />}
                                    </div>
                                </div>
                            );
                        })}
                        {linhas.length === 0 && (
                            <div className="text-center text-gray-500 py-12 text-sm">
                                Nenhuma categoria ainda. Importe as contas do Conta Azul para elas aparecerem aqui.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CategoriasDespesaPage;
