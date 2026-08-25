import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Package, Loader2, Plus, Info, AlertTriangle, Lock } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

// Interruptor de uma coluna da linha da categoria.
// A largura casa com a do cabeçalho e a altura garante 44px de área de toque no celular.
function Interruptor({ ligado, cor, ocupado, aoClicar, titulo, bloqueado }) {
    return (
        <button
            type="button"
            onClick={aoClicar}
            disabled={ocupado || bloqueado}
            title={bloqueado ? 'Só administrador pode alterar' : titulo}
            aria-label={titulo}
            aria-pressed={ligado}
            className={`w-16 md:w-20 h-11 flex items-center justify-center shrink-0 focus:outline-none
                ${bloqueado ? 'opacity-40 cursor-not-allowed' : ocupado ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
            <span
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                    ${ligado ? cor : 'bg-gray-200'}`}
            >
                {ocupado ? (
                    <Loader2 className="h-3.5 w-3.5 text-white animate-spin mx-auto" />
                ) : (
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${ligado ? 'translate-x-6' : 'translate-x-1'}`} />
                )}
            </span>
        </button>
    );
}

export default function CategoriasEstoque() {
    const [categorias, setCategorias] = useState([]);
    const [loading, setLoading] = useState(true);
    const [salvando, setSalvando] = useState(null); // nome da categoria sendo salva
    const [criando, setCriando] = useState(false);

    // A rota PATCH /categorias-estoque exige permissoes.admin — a tela precisa
    // espelhar isso, senão o usuário clica e leva "Apenas administradores.".
    const { user } = useAuth();
    const ehAdmin = user?.permissoes?.admin === true;

    // Desligar "Vende" tira os produtos do catálogo na hora, para todo mundo:
    // confirma antes, dizendo QUANTOS produtos serão afetados.
    // { nome, total } — total null = contando; undefined = não deu para contar.
    const [confirmacao, setConfirmacao] = useState(null);

    useEffect(() => { carregar(); }, []);

    const carregar = async () => {
        try {
            setLoading(true);
            const data = await api.get('/categorias-estoque').then(r => r.data);
            setCategorias(data);
        } catch {
            toast.error('Erro ao carregar categorias.');
        } finally {
            setLoading(false);
        }
    };

    // Nova categoria: nasce aqui e já aparece para escolher na tela de Produtos
    const criarCategoria = async () => {
        const nome = window.prompt('Nome da nova categoria (ex.: Produto Acabado, Matéria Prima):');
        const limpo = (nome || '').trim();
        if (!limpo) return;
        if (categorias.some(c => c.nome.toLowerCase() === limpo.toLowerCase())) {
            toast.error(`A categoria "${limpo}" já existe.`);
            return;
        }
        setCriando(true);
        try {
            const res = await api.patch(`/categorias-estoque/${encodeURIComponent(limpo)}`, {
                controlaEstoque: false
            }).then(r => r.data);
            setCategorias(prev => [...prev, res].sort((a, b) => a.nome.localeCompare(b.nome)));
            toast.success(`Categoria "${limpo}" criada! Agora é só escolher ela nos produtos.`);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erro ao criar a categoria.');
        } finally {
            setCriando(false);
        }
    };

    const toggleControla = async (nome, valorAtual) => {
        setSalvando(nome + '_estoque');
        try {
            const res = await api.patch(`/categorias-estoque/${encodeURIComponent(nome)}`, {
                controlaEstoque: !valorAtual
            }).then(r => r.data);
            setCategorias(prev => prev.map(c =>
                c.nome === nome ? { ...c, controlaEstoque: res.controlaEstoque, id: res.id } : c
            ));
            toast.success(`${nome}: controle de estoque ${res.controlaEstoque ? 'ativado' : 'desativado'}.`);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erro ao salvar.');
        } finally {
            setSalvando(null);
        }
    };

    // "Vende" desligado = categoria de bem próprio (freezer, painel, móveis):
    // tem estoque e custo, mas nunca aparece no catálogo nem em pedidos.
    // Contagem pelo endpoint dedicado: igualdade exata no nome (categoria com vírgula
    // era picada ao meio pelo split(',') do /produtos) e separa ativos de inativos.
    // impacto: null = contando · undefined = não deu para contar.
    const pedirConfirmacaoDesligar = async (nome) => {
        setConfirmacao({ nome, impacto: null });
        try {
            const r = await api.get(`/categorias-estoque/${encodeURIComponent(nome)}/impacto`);
            const ativos = Number(r?.data?.produtosAtivos);
            const total = Number(r?.data?.produtosTotal);
            const impacto = Number.isFinite(ativos)
                ? { ativos, total: Number.isFinite(total) ? total : ativos }
                : undefined;
            // guarda de nome: resposta atrasada de outra categoria é descartada
            setConfirmacao(c => (c && c.nome === nome ? { ...c, impacto } : c));
        } catch {
            setConfirmacao(c => (c && c.nome === nome ? { ...c, impacto: undefined } : c));
        }
    };

    const toggleVendavel = async (nome, valorAtual) => {
        setConfirmacao(null);
        setSalvando(nome + '_vende');
        try {
            const res = await api.patch(`/categorias-estoque/${encodeURIComponent(nome)}`, {
                vendavel: !valorAtual
            }).then(r => r.data);
            // Se o backend ainda não devolver o campo, mantém o valor que acabamos de pedir
            const novoValor = res?.vendavel !== undefined ? res.vendavel : !valorAtual;
            setCategorias(prev => prev.map(c =>
                c.nome === nome ? { ...c, vendavel: novoValor, id: res?.id ?? c.id } : c
            ));
            toast.success(novoValor
                ? `${nome}: volta a aparecer no catálogo e nos pedidos.`
                : `${nome}: não aparece mais no catálogo nem nos pedidos.`);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erro ao salvar.');
        } finally {
            setSalvando(null);
        }
    };

    const toggleFlex = async (nome, valorAtual) => {
        setSalvando(nome + '_flex');
        try {
            const res = await api.patch(`/categorias-estoque/${encodeURIComponent(nome)}`, {
                contabilizaFlex: !valorAtual
            }).then(r => r.data);
            setCategorias(prev => prev.map(c =>
                c.nome === nome ? { ...c, contabilizaFlex: res.contabilizaFlex, id: res.id } : c
            ));
            toast.success(`${nome}: flex ${res.contabilizaFlex ? 'incluído' : 'excluído'}.`);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erro ao salvar.');
        } finally {
            setSalvando(null);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Carregando categorias...</div>;

    return (
        <div className="w-full max-w-full overflow-x-hidden px-3 py-6 md:px-4 md:py-8 md:max-w-3xl">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                    <h1 className="text-lg md:text-2xl font-bold text-gray-900">Categorias de Estoque</h1>
                    <p className="text-gray-600 text-sm mt-1">
                        As categorias são controladas aqui no app. Configure, por categoria, se ela controla estoque,
                        se pode ser vendida e se entra no cálculo do flex.
                    </p>
                </div>
                <button
                    onClick={criarCategoria}
                    disabled={criando || !ehAdmin}
                    title={ehAdmin ? '' : 'Só administrador pode criar categoria'}
                    className="shrink-0 min-h-[44px] px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                    {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Nova categoria
                </button>
            </div>

            {categorias.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                    <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Nenhuma categoria encontrada nos produtos cadastrados.</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden">
                    {/* Cabeçalho */}
                    <div className="flex items-center justify-between px-3 md:px-5 py-2 bg-gray-50 text-[10px] md:text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        <span className="min-w-0">Categoria</span>
                        <div className="flex items-center shrink-0">
                            <span className="w-16 md:w-20 text-center">Estoque</span>
                            <span className="w-16 md:w-20 text-center">Vende</span>
                            <span className="w-16 md:w-20 text-center">Flex</span>
                        </div>
                    </div>
                    {categorias.map(cat => {
                        const contabilizaFlex = cat.contabilizaFlex !== false; // default true
                        const vendavel = cat.vendavel !== false;               // default true
                        return (
                            <div key={cat.nome} className="flex items-center justify-between gap-2 px-3 md:px-5 py-3">
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium text-gray-900 break-words">{cat.nome}</p>
                                    {cat.naoSalva && (
                                        <p className="text-xs text-gray-500">Detectada nos produtos — ainda não configurada</p>
                                    )}
                                    {!vendavel && (
                                        <p className="text-xs text-amber-700 font-medium">
                                            Não aparece no catálogo nem em pedidos
                                        </p>
                                    )}
                                    {!contabilizaFlex && (
                                        <p className="text-xs text-orange-600 font-medium">Excluída do cálculo de flex</p>
                                    )}
                                </div>
                                <div className="flex items-center shrink-0">
                                    <Interruptor
                                        ligado={!!cat.controlaEstoque}
                                        cor="bg-green-500"
                                        ocupado={salvando === cat.nome + '_estoque'}
                                        bloqueado={!ehAdmin}
                                        aoClicar={() => toggleControla(cat.nome, cat.controlaEstoque)}
                                        titulo={cat.controlaEstoque ? 'Estoque: ativo' : 'Estoque: inativo'}
                                    />
                                    <Interruptor
                                        ligado={vendavel}
                                        cor="bg-primary"
                                        ocupado={salvando === cat.nome + '_vende'}
                                        bloqueado={!ehAdmin}
                                        aoClicar={() => vendavel
                                            ? pedirConfirmacaoDesligar(cat.nome)   // desligar: confirma antes
                                            : toggleVendavel(cat.nome, vendavel)}  // religar: direto
                                        titulo={vendavel
                                            ? 'Vende: aparece no catálogo e nos pedidos'
                                            : 'Vende: desligado — não aparece no catálogo nem nos pedidos'}
                                    />
                                    <Interruptor
                                        ligado={contabilizaFlex}
                                        cor="bg-violet-500"
                                        ocupado={salvando === cat.nome + '_flex'}
                                        bloqueado={!ehAdmin}
                                        aoClicar={() => toggleFlex(cat.nome, contabilizaFlex)}
                                        titulo={contabilizaFlex ? 'Flex: incluído no cálculo' : 'Flex: excluído do cálculo'}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Legenda — o que cada interruptor faz, em português simples */}
            <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 px-4 md:px-5 py-3.5 border-b border-gray-100">
                    <Info className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">O que cada chave faz</span>
                </div>
                <div className="p-4 md:p-5 space-y-4 text-sm text-gray-600">
                    <div className="flex items-start gap-3">
                        <span className="mt-1 h-3 w-6 shrink-0 rounded-full bg-green-500" />
                        <p>
                            <span className="font-semibold text-gray-900">Estoque</span> — ligado, o app conta entradas e
                            saídas dessa categoria e ela aparece no Inventário.
                        </p>
                    </div>
                    <div className="flex items-start gap-3">
                        <span className="mt-1 h-3 w-6 shrink-0 rounded-full bg-primary" />
                        <p>
                            <span className="font-semibold text-gray-900">Vende</span> — ligado, os produtos dessa categoria
                            aparecem normalmente para vender.{' '}
                            <span className="font-semibold text-gray-900">Desligado, eles NÃO aparecem no catálogo,
                            nem em pedido, amostra ou pedido especial</span> — mas continuam com estoque e custo.
                            É o que se usa para bens da empresa (freezer, painel de LED, móveis), na categoria
                            <span className="font-semibold text-gray-900"> Imobilizado</span>.
                        </p>
                    </div>
                    {!ehAdmin && (
                        <div className="flex items-start gap-3 rounded-lg bg-gray-50 border border-gray-200 p-3">
                            <Lock className="h-4 w-4 shrink-0 text-gray-500 mt-0.5" />
                            <p className="text-gray-700">
                                <span className="font-semibold">Só leitura.</span> Você consegue ver como cada categoria
                                está configurada, mas <span className="font-semibold">só um administrador pode mudar
                                estas chaves</span>. Peça a quem administra o sistema.
                            </p>
                        </div>
                    )}
                    <div className="flex items-start gap-3">
                        <span className="mt-1 h-3 w-6 shrink-0 rounded-full bg-violet-500" />
                        <p>
                            <span className="font-semibold text-gray-900">Flex</span> — ligado, os acréscimos e descontos
                            dessa categoria entram no cálculo do saldo flex do vendedor.
                        </p>
                    </div>
                </div>
            </div>

            {/* Confirmação de DESLIGAR "Vende" — some do catálogo na hora, para todo mundo */}
            {confirmacao && (
                <div
                    className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 p-0 md:p-4"
                    role="dialog" aria-modal="true"
                    onClick={() => setConfirmacao(null)}
                >
                    <div
                        className="w-full md:max-w-md bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-h-full overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-3 p-4 md:p-5 border-b border-gray-100">
                            <div className="bg-amber-100 p-2 rounded-lg shrink-0">
                                <AlertTriangle className="h-5 w-5 text-amber-700" />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-base md:text-lg font-bold text-gray-900">Tirar da venda?</h2>
                                <p className="text-sm text-gray-600 break-words">Categoria {confirmacao.nome}</p>
                            </div>
                        </div>

                        <div className="p-4 md:p-5 space-y-3 text-sm text-gray-600">
                            {confirmacao.impacto === null ? (
                                <p className="flex items-center gap-2 text-gray-600">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Contando os produtos desta categoria...
                                </p>
                            ) : confirmacao.impacto === undefined ? (
                                <p className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                                    Não foi possível contar os produtos desta categoria agora.
                                    <span className="font-semibold text-gray-900"> Confira quantos itens ela tem antes de continuar.</span>
                                </p>
                            ) : (
                                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-900">
                                    <span className="text-2xl font-bold block leading-tight">{confirmacao.impacto.ativos}</span>
                                    <span>
                                        {confirmacao.impacto.ativos === 1
                                            ? 'produto ativo sai da venda'
                                            : 'produtos ativos saem da venda'}
                                    </span>
                                    {/* inativos só entram como informação secundária: já não apareciam em lugar nenhum */}
                                    {confirmacao.impacto.total > confirmacao.impacto.ativos && (
                                        <span className="block text-xs mt-1 text-amber-800/80">
                                            {(() => {
                                                const inativos = confirmacao.impacto.total - confirmacao.impacto.ativos;
                                                return `A categoria tem ${confirmacao.impacto.total} produtos no total — ${inativos === 1 ? 'o outro está inativo e já não aparecia' : `os outros ${inativos} estão inativos e já não apareciam`} para vender.`;
                                            })()}
                                        </span>
                                    )}
                                </div>
                            )}
                            <p>
                                Eles <span className="font-semibold text-gray-900">somem na hora do catálogo, do pedido,
                                da amostra e do pedido especial</span>, para todos os vendedores.
                            </p>
                            <p>
                                Continuam com estoque e custo, e seguem aparecendo em Produtos e no Inventário.
                                Dá para religar esta chave quando quiser.
                            </p>
                        </div>

                        <div className="flex flex-col-reverse md:flex-row md:justify-end gap-2 p-4 md:p-5 border-t border-gray-100">
                            <button
                                onClick={() => setConfirmacao(null)}
                                className="min-h-[44px] px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-medium text-sm"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => toggleVendavel(confirmacao.nome, true)}
                                disabled={confirmacao.impacto === null}
                                className="min-h-[44px] px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50"
                            >
                                Sim, tirar da venda
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
