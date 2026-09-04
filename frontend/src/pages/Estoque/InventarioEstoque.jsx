import { useState, useEffect, useCallback, useRef } from 'react';
import { ClipboardCheck, Search, WifiOff, Wifi, ChevronLeft, Loader2, CheckCircle2, Package, AlertTriangle, X, PauseCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import estoqueService from '../../services/estoqueService';

// Contagem física de estoque feita para a câmara fria: a lista de produtos é baixada
// com internet, a contagem funciona 100% offline (cada toque salvo em localStorage)
// e o envio fica na fila até o celular reconectar. NUNCA depender de rede entre
// o início e o envio — é o requisito central desta tela.

const DRAFT_KEY = 'inventario_estoque_v1';

function lerDraft() {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch { return null; }
}
function gravarDraft(d) {
    try {
        if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
        else localStorage.removeItem(DRAFT_KEY);
    } catch { /* localStorage cheio/indisponível: a contagem segue em memória */ }
}
function novoInventarioId() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `inv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
const fmt = (n) => {
    const v = Number(n || 0);
    return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/\.?0+$/, '').replace('.', ',');
};

// ─── Pílula de conexão ────────────────────────────────────────────────────────

function PilulaConexao({ online }) {
    return online ? (
        <div className="flex items-center gap-2 rounded-full bg-green-100 text-green-800 px-4 py-2 text-sm font-semibold mb-4">
            <Wifi className="h-4 w-4 shrink-0" /> Com internet
        </div>
    ) : (
        <div className="flex items-center gap-2 rounded-full bg-amber-100 text-amber-800 px-4 py-2 text-sm font-semibold mb-4">
            <WifiOff className="h-4 w-4 shrink-0" /> Sem internet — contagem salva no celular
        </div>
    );
}

// ─── Linha de produto na contagem ─────────────────────────────────────────────

function LinhaProduto({ item, valor, caixas, onMudar, onCaixa }) {
    const contado = valor !== undefined;
    const mudar = (novo) => onMudar(item.id, novo);
    // Produto com "qtd. por caixa" no cadastro: o botão da direita soma a caixa inteira.
    // Sem o campo, continua somando 10 (valor padrão), mas em cinza para sinalizar.
    const porCaixa = Number(item.quantidadePorCaixa);
    const temCaixa = Number.isFinite(porCaixa) && porCaixa >= 1;
    const passo = temCaixa ? porCaixa : 10;
    return (
        <div className={`rounded-2xl border p-3.5 mb-2.5 ${contado ? 'bg-mint/60 border-primary/40' : 'bg-white border-gray-200'}`}>
            <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold text-gray-900 text-[15px] leading-tight">
                    {contado && <CheckCircle2 className="inline h-4 w-4 text-primary mr-1 -mt-0.5" />}
                    {item.nome}
                </p>
                <span className="text-xs text-gray-500 whitespace-nowrap text-right">
                    sistema: {fmt(item.sistema)} {item.unidade || 'un'}
                    {item.reservado > 0 && (
                        <span className="block text-amber-700 font-medium">reservado: {fmt(item.reservado)} (pedidos a faturar)</span>
                    )}
                </span>
            </div>
            <div className="flex items-center gap-2 mt-3">
                <button
                    onClick={() => mudar(Math.max(0, (valor || 0) - 1))}
                    className="h-14 w-14 shrink-0 rounded-2xl bg-gray-100 active:bg-gray-200 text-gray-800 text-3xl font-extrabold leading-none"
                    aria-label="Diminuir 1"
                >−</button>
                <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={contado ? valor : ''}
                    placeholder="0"
                    onChange={e => {
                        const v = e.target.value;
                        if (v === '') return mudar(undefined);
                        const num = parseFloat(v);
                        if (!isNaN(num) && num >= 0) mudar(num);
                    }}
                    className="flex-1 min-w-0 h-14 text-center text-2xl font-extrabold border-2 border-gray-300 rounded-2xl bg-white focus:border-primary focus:outline-none"
                />
                <button
                    onClick={() => mudar((valor || 0) + 1)}
                    className="h-14 w-14 shrink-0 rounded-2xl bg-primary active:bg-primaryDark text-white text-3xl font-extrabold leading-none"
                    aria-label="Aumentar 1"
                >+</button>
                <button
                    onClick={() => onCaixa(item.id, passo, temCaixa)}
                    className={`h-14 shrink-0 px-3 rounded-2xl text-sm font-extrabold ${
                        temCaixa ? 'bg-mint text-primaryDark' : 'bg-gray-200 text-gray-500'
                    }`}
                    aria-label={temCaixa ? `Somar 1 caixa (${passo})` : 'Somar 10'}
                >+{passo}</button>
                {temCaixa && (
                    <span className="shrink-0 rounded-full bg-house text-white text-xs font-bold px-2.5 py-1.5 whitespace-nowrap tabular-nums">
                        {caixas || 0} cx
                    </span>
                )}
            </div>
            {contado && (
                <div className="text-right mt-1">
                    <button onClick={() => mudar(undefined)} className="text-xs font-semibold text-gray-500 underline p-2">
                        limpar contagem
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function InventarioEstoque() {
    const [online, setOnline] = useState(() => navigator.onLine !== false);
    const [draft, setDraft] = useState(() => lerDraft());
    const [fase, setFase] = useState(() => {
        const d = lerDraft();
        if (!d) return 'inicio';
        return d.status === 'aguardando' || d.status === 'revisao' ? 'revisao' : 'contagem';
    });

    // Tela início
    const [produtos, setProdutos] = useState([]);
    const [permissoes, setPermissoes] = useState(null);
    const [loadingInicio, setLoadingInicio] = useState(false);
    const [catSel, setCatSel] = useState(null);

    // Tela contagem
    const [busca, setBusca] = useState('');
    const [filtro, setFiltro] = useState('todos');
    const [confirmSair, setConfirmSair] = useState(false);

    // Envio
    const [enviando, setEnviando] = useState(false);
    const [resultado, setResultado] = useState(null);
    const autoEnvioRef = useRef(false);

    // Persiste o rascunho a cada mudança — é isso que segura a contagem na câmara fria
    useEffect(() => { gravarDraft(draft); }, [draft]);

    // Conexão
    useEffect(() => {
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    }, []);

    // Carrega produtos e permissões (só precisa de internet AQUI)
    const carregarInicio = useCallback(async () => {
        setLoadingInicio(true);
        try {
            const [pos, perms] = await Promise.all([
                estoqueService.getPosicao(),
                estoqueService.getPermissoes()
            ]);
            setProdutos(Array.isArray(pos) ? pos : []);
            setPermissoes(perms);
        } catch {
            if (navigator.onLine !== false) toast.error('Erro ao carregar produtos.');
        } finally {
            setLoadingInicio(false);
        }
    }, []);

    useEffect(() => { if (fase === 'inicio') carregarInicio(); }, [fase, carregarInicio]);

    // Inventário exige poder adicionar E diminuir na categoria
    const categoriaPermitida = useCallback((cat) => {
        if (!permissoes) return false;
        if (permissoes.admin) return true;
        const regras = permissoes.regras || [];
        return regras.some(r => {
            const catOk = !r.categoria || r.categoria === cat;
            return catOk && Array.isArray(r.pode) && r.pode.includes('adicionar') && r.pode.includes('diminuir');
        });
    }, [permissoes]);

    // Agrupa por categoria de estoque
    const categorias = [];
    {
        const mapa = new Map();
        produtos.forEach(p => {
            const cat = p.categoria || 'Sem categoria';
            if (!mapa.has(cat)) mapa.set(cat, { nome: cat, n: 0 });
            mapa.get(cat).n++;
        });
        [...mapa.values()]
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
            .forEach(c => categorias.push({ ...c, permitida: categoriaPermitida(c.nome) }));
    }

    const contadosN = draft ? Object.keys(draft.cont).length : 0;

    // ── Ações ──────────────────────────────────────────────────────────────────

    const iniciar = () => {
        if (!catSel) return;
        const itens = produtos
            .filter(p => (p.categoria || 'Sem categoria') === catSel)
            .map(p => ({
                id: p.id,
                nome: p.nome,
                codigo: p.codigo,
                unidade: p.unidade,
                sistema: parseFloat(p.estoqueTotal || 0),
                reservado: parseFloat(p.estoqueReservado || 0),
                quantidadePorCaixa: p.quantidadePorCaixa ?? null
            }));
        if (itens.length === 0) return toast.error('Nenhum produto nesta categoria.');
        setDraft({
            inventarioId: novoInventarioId(),
            categoria: catSel,
            itens,
            cont: {},
            caixas: {},
            obs: '',
            status: 'contagem',
            iniciadoEm: new Date().toISOString()
        });
        setBusca('');
        setFiltro('todos');
        setConfirmSair(false);
        setFase('contagem');
    };

    const mudarContagem = (produtoId, valor) => {
        setDraft(d => {
            if (!d) return d;
            const cont = { ...d.cont };
            if (valor === undefined) delete cont[produtoId];
            else cont[produtoId] = valor;
            // Contagem zerada/limpa → o contador de caixas daquele produto zera junto
            const caixas = { ...(d.caixas || {}) };
            if (valor === undefined || valor === 0) delete caixas[produtoId];
            return { ...d, cont, caixas, status: 'contagem' };
        });
    };

    // Botão da caixa: soma o passo (qtd. da caixa, ou 10 no padrão) e, se o produto
    // tem caixa cadastrada, incrementa o contador "N cx" — que vive no rascunho
    // (localStorage) para não perder a conta ao fechar o app na câmara fria.
    const somarCaixa = (produtoId, passo, temCaixa) => {
        setDraft(d => {
            if (!d) return d;
            const cont = { ...d.cont, [produtoId]: (d.cont[produtoId] || 0) + passo };
            const caixas = { ...(d.caixas || {}) };
            if (temCaixa) caixas[produtoId] = (caixas[produtoId] || 0) + 1;
            return { ...d, cont, caixas, status: 'contagem' };
        });
    };

    const descartar = () => {
        setDraft(null);
        setConfirmSair(false);
        setFase('inicio');
    };

    const enviar = useCallback(async () => {
        const d = lerDraft();
        if (!d || enviando) return;
        const itens = Object.entries(d.cont).map(([produtoId, contado]) => ({ produtoId, contado }));
        if (itens.length === 0) return;

        setEnviando(true);
        try {
            const res = await estoqueService.enviarInventario({
                inventarioId: d.inventarioId,
                itens,
                observacao: d.obs || undefined
            });
            if (res.falhas?.length > 0) {
                toast.error(`${res.falhas.length} produto(s) falharam — toque em enviar de novo para tentar só eles.`);
                setDraft(prev => prev ? { ...prev, status: 'revisao' } : prev);
            } else {
                setResultado(res);
                setDraft(null);
                setFase('enviado');
                toast.success('Inventário enviado!');
            }
        } catch (err) {
            if (err.response) {
                toast.error(err.response.data?.error || 'Erro ao enviar inventário.');
                setDraft(prev => prev ? { ...prev, status: 'revisao' } : prev);
            } else {
                // Sem rede: fica na fila e sai sozinho quando conectar
                setDraft(prev => prev ? { ...prev, status: 'aguardando' } : prev);
            }
        } finally {
            setEnviando(false);
        }
    }, [enviando]);

    // Envio automático ao reconectar (uma tentativa por reconexão)
    useEffect(() => {
        if (!online) { autoEnvioRef.current = false; return; }
        if (draft?.status === 'aguardando' && !autoEnvioRef.current) {
            autoEnvioRef.current = true;
            enviar();
        }
    }, [online, draft, enviar]);

    // ── Telas ──────────────────────────────────────────────────────────────────

    if (fase === 'enviado' && resultado) {
        return (
            <div className="w-full max-w-lg mx-auto px-4 py-6">
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
                    <div className="mx-auto mb-4 h-20 w-20 rounded-full bg-primary text-white flex items-center justify-center">
                        <CheckCircle2 className="h-10 w-10" />
                    </div>
                    <h1 className="text-xl font-bold text-gray-900">Inventário enviado!</h1>
                    <p className="text-sm text-gray-600 mt-2">
                        {resultado.ajustados.length} ajuste(s) de estoque · {resultado.semDiferenca} produto(s) conferiam com o sistema.
                    </p>
                    {resultado.ajustados.length > 0 && (
                        <div className="mt-4 text-left border-t border-gray-100 pt-3 space-y-2 max-h-72 overflow-y-auto">
                            {resultado.ajustados.map(a => (
                                <div key={a.produtoId} className="flex items-center justify-between gap-2 text-sm">
                                    <span className="text-gray-800 font-medium truncate">{a.nome}</span>
                                    <span className={`shrink-0 font-bold tabular-nums ${a.delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {fmt(a.antes)} → {fmt(a.depois)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="text-xs text-gray-500 mt-4">Cada ajuste ficou registrado no Histórico de Estoque com o motivo “Inventário”.</p>
                    <button
                        onClick={() => { setResultado(null); setCatSel(null); setFase('inicio'); }}
                        className="mt-5 w-full min-h-[52px] px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-base"
                    >
                        Fazer novo inventário
                    </button>
                </div>
            </div>
        );
    }

    if (fase === 'inicio') {
        return (
            <div className="w-full max-w-lg mx-auto px-4 py-6">
                <div className="flex items-center gap-2 mb-4">
                    <div className="bg-mint p-2 rounded-lg"><ClipboardCheck className="h-5 w-5 text-primaryDark" /></div>
                    <div>
                        <h1 className="text-lg md:text-2xl font-bold text-gray-900">Inventário</h1>
                        <p className="text-xs text-gray-500">Contagem física do estoque</p>
                    </div>
                </div>

                <PilulaConexao online={online} />

                {draft && (
                    <div className="rounded-2xl border-2 border-primary bg-mint/60 p-4 mb-4">
                        <div className="flex items-center gap-2 text-primaryDark font-bold text-sm">
                            <PauseCircle className="h-4 w-4" /> Contagem em andamento
                        </div>
                        <p className="text-sm text-gray-700 mt-1">
                            {draft.categoria} — {contadosN} de {draft.itens.length} produtos contados
                        </p>
                        <button
                            onClick={() => { setFase(draft.status === 'aguardando' || draft.status === 'revisao' ? 'revisao' : 'contagem'); }}
                            className="mt-3 w-full min-h-[52px] px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-base"
                        >
                            Continuar contagem
                        </button>
                        <div className="text-center mt-1">
                            <button onClick={descartar} className="text-xs font-semibold text-gray-500 underline p-2">
                                descartar esta contagem
                            </button>
                        </div>
                    </div>
                )}

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                        <Package className="h-4 w-4 text-primaryDark" />
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-600">O que você vai contar?</span>
                    </div>
                    <div className="p-4">
                        {loadingInicio ? (
                            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-300" /></div>
                        ) : categorias.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-6">
                                {online ? 'Nenhum produto disponível para inventário.' : 'Conecte-se à internet para carregar os produtos.'}
                            </p>
                        ) : (
                            <div className="space-y-2.5">
                                {categorias.map(c => (
                                    <button
                                        key={c.nome}
                                        disabled={!c.permitida}
                                        onClick={() => setCatSel(c.nome)}
                                        className={`w-full flex items-center justify-between gap-2 rounded-2xl border-2 p-4 min-h-[56px] text-left ${
                                            !c.permitida ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                                            : catSel === c.nome ? 'border-primary bg-mint/70'
                                            : 'border-gray-200 bg-white active:bg-gray-50'
                                        }`}
                                    >
                                        <span>
                                            <span className="block font-bold text-gray-900">{c.nome}</span>
                                            <span className="block text-xs text-gray-500">
                                                {c.n} produto(s){!c.permitida ? ' · sem permissão' : ''}
                                            </span>
                                        </span>
                                        <span className={`h-6 w-6 shrink-0 rounded-full border-2 flex items-center justify-center ${
                                            catSel === c.nome ? 'border-primary bg-primary text-white' : 'border-gray-300 text-transparent'
                                        }`}>
                                            <CheckCircle2 className="h-4 w-4" />
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <button
                    onClick={iniciar}
                    disabled={!catSel || !online || loadingInicio}
                    className="mt-4 w-full min-h-[54px] px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-bold text-base disabled:bg-gray-300 disabled:shadow-none"
                >
                    Baixar produtos e iniciar
                </button>
                <p className="text-xs text-gray-500 mt-3 flex gap-1.5">
                    <span>🔒</span>
                    <span>
                        {online
                            ? 'Ao iniciar, a lista fica guardada no seu celular — a partir daí a contagem funciona sem internet (câmara fria).'
                            : 'É preciso internet só para baixar a lista. Conecte-se, inicie, e depois pode entrar na câmara fria sem sinal.'}
                    </span>
                </p>
            </div>
        );
    }

    if (!draft) { setFase('inicio'); return null; }

    if (fase === 'contagem') {
        if (confirmSair) {
            return (
                <div className="w-full max-w-lg mx-auto px-4 py-6">
                    <PilulaConexao online={online} />
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
                        <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
                        <h2 className="text-lg font-bold text-gray-900">Sair da contagem?</h2>
                        <p className="text-sm text-gray-600 mt-1 mb-5">
                            Você já contou <b>{contadosN} produto(s)</b> de {draft.categoria}.
                        </p>
                        <div className="grid gap-2.5">
                            <button
                                onClick={() => { setConfirmSair(false); setFase('inicio'); }}
                                className="min-h-[52px] px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold"
                            >
                                Guardar e continuar depois
                            </button>
                            <button
                                onClick={descartar}
                                className="min-h-[48px] px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-full font-semibold text-sm"
                            >
                                Apagar contagem e sair
                            </button>
                            <button
                                onClick={() => setConfirmSair(false)}
                                className="min-h-[48px] px-4 py-2 bg-white border border-primary text-primary rounded-full font-medium text-sm"
                            >
                                ← Voltar a contar
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        const q = busca.trim().toLowerCase();
        const visiveis = draft.itens.filter(it => {
            const feito = draft.cont[it.id] !== undefined;
            if (q && !it.nome.toLowerCase().includes(q) && !(it.codigo || '').toLowerCase().includes(q)) return false;
            if (filtro === 'faltam' && feito) return false;
            if (filtro === 'feitos' && !feito) return false;
            return true;
        });

        return (
            <div className="w-full max-w-lg mx-auto px-4 py-4 pb-28">
                <PilulaConexao online={online} />

                <button
                    onClick={() => (contadosN === 0 ? setFase('inicio') : setConfirmSair(true))}
                    className="mb-3 inline-flex items-center gap-1.5 min-h-[48px] px-5 bg-white border border-primary text-primaryDark rounded-full font-bold text-sm active:bg-mint/40"
                >
                    <ChevronLeft className="h-4 w-4" /> Voltar para categorias
                </button>

                <div className="flex items-baseline justify-between mb-1.5">
                    <h1 className="text-base font-bold text-gray-900">{draft.categoria}</h1>
                    <span className="text-sm font-bold text-primaryDark tabular-nums">{contadosN} de {draft.itens.length}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-200 overflow-hidden mb-3.5">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${draft.itens.length ? (100 * contadosN / draft.itens.length) : 0}%` }} />
                </div>

                <div className="relative mb-2.5">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        type="search"
                        placeholder="Buscar produto..."
                        value={busca}
                        onChange={e => setBusca(e.target.value)}
                        className="w-full min-h-[48px] pl-11 pr-10 border border-gray-300 rounded-full text-[15px] bg-white focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                    {busca && (
                        <button onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-gray-100">
                            <X className="h-4 w-4 text-gray-400" />
                        </button>
                    )}
                </div>

                <div className="flex gap-2 mb-3.5">
                    {[['todos', 'Todos'], ['faltam', 'Faltam contar'], ['feitos', 'Contados']].map(([k, lbl]) => (
                        <button
                            key={k}
                            onClick={() => setFiltro(k)}
                            className={`px-4 min-h-[40px] rounded-full text-[13px] font-bold border ${
                                filtro === k ? 'bg-house text-white border-house' : 'bg-white text-gray-600 border-gray-300'
                            }`}
                        >{lbl}</button>
                    ))}
                </div>

                {visiveis.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-10">Nenhum produto neste filtro.</p>
                ) : (
                    visiveis.map(it => (
                        <LinhaProduto
                            key={it.id}
                            item={it}
                            valor={draft.cont[it.id]}
                            caixas={draft.caixas?.[it.id]}
                            onMudar={mudarContagem}
                            onCaixa={somarCaixa}
                        />
                    ))
                )}

                <div className="fixed bottom-0 left-0 right-0 bg-secondary/95 backdrop-blur border-t border-gray-200 px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
                    <div className="max-w-lg mx-auto">
                        <button
                            onClick={() => { setDraft(d => ({ ...d, status: 'revisao' })); setFase('revisao'); }}
                            disabled={contadosN === 0}
                            className="w-full min-h-[54px] px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-bold text-base disabled:bg-gray-300 disabled:shadow-none"
                        >
                            {contadosN === 0 ? 'Conte ao menos 1 produto' : `Revisar e enviar (${contadosN})`}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // fase === 'revisao'
    const contItens = draft.itens.filter(it => draft.cont[it.id] !== undefined);
    const difs = contItens.filter(it => (draft.cont[it.id] - it.sistema) !== 0);
    const naoContados = draft.itens.length - contItens.length;
    const aguardando = draft.status === 'aguardando';

    return (
        <div className="w-full max-w-lg mx-auto px-4 py-4">
            <PilulaConexao online={online} />

            <div className="grid grid-cols-2 gap-2.5 mb-3">
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                    <p className="text-2xl font-extrabold text-primaryDark tabular-nums">{contItens.length}</p>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">contados</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                    <p className={`text-2xl font-extrabold tabular-nums ${difs.length > 0 ? 'text-amber-600' : 'text-primaryDark'}`}>{difs.length}</p>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">diferenças</p>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-3">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                    <ClipboardCheck className="h-4 w-4 text-primaryDark" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Conferência — {draft.categoria}</span>
                </div>
                <div className="px-5 py-1 max-h-[45vh] overflow-y-auto">
                    {contItens.map(it => {
                        const v = draft.cont[it.id];
                        const d = v - it.sistema;
                        return (
                            <div key={it.id} className="flex items-center justify-between gap-2 py-2.5 border-b border-gray-50 last:border-0">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 truncate">{it.nome}</p>
                                    <p className="text-xs text-gray-500 tabular-nums">sistema {fmt(it.sistema)} → contado <b className="text-gray-800">{fmt(v)}</b></p>
                                </div>
                                <span className={`shrink-0 px-2 py-1 text-xs font-semibold rounded-full ${
                                    d === 0 ? 'bg-green-100 text-green-800' : d > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                                }`}>
                                    {d === 0 ? 'confere ✓' : d > 0 ? `+${fmt(d)}` : fmt(d)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {naoContados > 0 && (
                <p className="text-xs text-gray-500 mb-3">
                    ℹ️ <b>{naoContados} produto(s) não contado(s)</b> ficam de fora — o estoque deles não muda.
                </p>
            )}

            <input
                type="text"
                value={draft.obs || ''}
                onChange={e => setDraft(d => ({ ...d, obs: e.target.value }))}
                placeholder="Observação (opcional)"
                className="w-full border border-gray-300 rounded-full px-4 py-3 text-sm bg-white focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none mb-3"
            />

            {aguardando && (
                <div className="rounded-2xl bg-amber-100 text-amber-800 p-4 text-sm font-medium mb-3">
                    <p className="font-bold mb-0.5">📥 Inventário guardado no celular</p>
                    Sem internet agora. Assim que o celular conectar, ele será enviado sozinho — pode guardar o celular no bolso.
                </div>
            )}

            <div className="flex gap-2.5">
                <button
                    onClick={() => { setDraft(d => ({ ...d, status: 'contagem' })); setFase('contagem'); }}
                    disabled={enviando}
                    className="flex-1 min-h-[52px] px-4 py-2 bg-white border border-primary text-primary rounded-full font-semibold text-sm"
                >
                    ← Ajustar
                </button>
                <button
                    onClick={enviar}
                    disabled={enviando || contItens.length === 0}
                    className="flex-[2] min-h-[52px] px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-bold text-base disabled:bg-gray-300 disabled:shadow-none flex items-center justify-center gap-2"
                >
                    {enviando ? (<><Loader2 className="h-5 w-5 animate-spin" /> Enviando…</>)
                        : aguardando ? 'Tentar enviar agora'
                        : 'Enviar inventário'}
                </button>
            </div>
        </div>
    );
}
