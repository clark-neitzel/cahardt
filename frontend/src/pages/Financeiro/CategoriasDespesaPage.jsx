import React, { useEffect, useMemo, useState } from 'react';
import { Tags, Loader2, Save, CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import financeiroGerencialService from '../../services/financeiroGerencialService';

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

// Os três "baldes" que o usuário escolhe (A_CLASSIFICAR = ainda não escolhido)
const BALDES = [
    { valor: 'OPERACIONAL', label: 'Operação', ajuda: 'Custo/despesa do dia a dia. Entra na DRE.', cls: 'bg-green-100 text-green-800 border-green-300', ativo: 'bg-green-600 text-white border-green-600' },
    { valor: 'FINANCEIRO', label: 'Financeiro', ajuda: 'Juros e tarifas de banco. Entra na DRE, em linha à parte.', cls: 'bg-blue-100 text-blue-800 border-blue-300', ativo: 'bg-blue-600 text-white border-blue-600' },
    { valor: 'FORA_DRE', label: 'Fora da DRE', ajuda: 'Retirada de lucro, empréstimo, compra de bem. NÃO é resultado.', cls: 'bg-gray-100 text-gray-700 border-gray-300', ativo: 'bg-gray-700 text-white border-gray-700' }
];

// Botões de escolha do balde (segmentado)
const SeletorBalde = ({ valor, onChange }) => (
    <div className="flex gap-1.5 flex-wrap">
        {BALDES.map((b) => {
            const ativo = valor === b.valor;
            return (
                <button
                    key={b.valor}
                    onClick={() => onChange(b.valor)}
                    title={b.ajuda}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border min-h-[32px] transition-colors ${ativo ? b.ativo : `${b.cls} hover:opacity-80`}`}
                >
                    {b.label}
                </button>
            );
        })}
    </div>
);

const CategoriasDespesaPage = () => {
    const [linhas, setLinhas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [alterado, setAlterado] = useState(false);

    const carregar = async () => {
        setLoading(true);
        try {
            const dados = await financeiroGerencialService.categoriasDespesa();
            // "a classificar" primeiro; depois maior gasto primeiro
            const ord = [...dados].sort((a, b) => {
                const na = a.classificacao === 'A_CLASSIFICAR' ? 0 : 1;
                const nb = b.classificacao === 'A_CLASSIFICAR' ? 0 : 1;
                return na - nb || (b.total || 0) - (a.total || 0);
            });
            setLinhas(ord);
            setAlterado(false);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar categorias.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { carregar(); }, []);

    const mudar = (nome, classificacao) => {
        setLinhas((prev) => prev.map((l) => (l.nome === nome ? { ...l, classificacao } : l)));
        setAlterado(true);
    };

    const naoClassificadas = useMemo(() => linhas.filter((l) => l.classificacao === 'A_CLASSIFICAR').length, [linhas]);

    const salvar = async () => {
        setSalvando(true);
        try {
            await financeiroGerencialService.salvarCategoriasDespesa(
                linhas.map((l) => ({ nome: l.nome, classificacao: l.classificacao }))
            );
            toast.success('Classificação salva! A DRE já usa a nova divisão.');
            setAlterado(false);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao salvar.');
        } finally {
            setSalvando(false);
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
                    className="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-primary hover:bg-blue-700 text-white rounded-md shadow-sm text-xs md:text-sm font-semibold disabled:opacity-50"
                >
                    {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar
                </button>
            </div>

            <div className="p-3 md:p-6 space-y-4">
                {/* Explicação */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-5">
                    <p className="text-sm text-gray-600">
                        Coloque cada categoria num "balde". É isso que faz a <b>DRE</b> mostrar o lucro certo:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
                        {BALDES.map((b) => (
                            <div key={b.valor} className="flex items-start gap-2 rounded-lg border border-gray-200 p-3">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border shrink-0 ${b.cls}`}>{b.label}</span>
                                <span className="text-xs text-gray-600">{b.ajuda}</span>
                            </div>
                        ))}
                    </div>
                    {naoClassificadas > 0 && (
                        <div className="flex items-center gap-2 mt-3 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span><b>{naoClassificadas}</b> categoria(s) ainda sem balde definido. Elas contam na DRE como operação até você escolher.</span>
                        </div>
                    )}
                </div>

                {loading ? (
                    <div className="flex items-center justify-center gap-2 text-gray-500 py-16">
                        <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
                    </div>
                ) : (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
                        {linhas.map((l) => (
                            <div key={l.nome} className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 px-4 py-3">
                                <div className="flex items-center gap-2 min-w-0 md:flex-1">
                                    {l.classificacao === 'A_CLASSIFICAR'
                                        ? <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                                        : <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                                    <span className="font-medium text-gray-900 text-sm truncate">{l.nome}</span>
                                </div>
                                <div className="text-xs text-gray-500 md:w-40 md:text-right shrink-0">
                                    R$ {fmt(l.total)} <span className="text-gray-500">acumulado</span>
                                </div>
                                <div className="md:shrink-0">
                                    <SeletorBalde valor={l.classificacao} onChange={(v) => mudar(l.nome, v)} />
                                </div>
                            </div>
                        ))}
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
