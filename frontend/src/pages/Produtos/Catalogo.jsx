
import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import produtoService from '../../services/produtoService';
import configService from '../../services/configService';
import clienteService from '../../services/clienteService';
import tabelaPrecoService from '../../services/tabelaPrecoService';
import catalogoPersonalizadoService from '../../services/catalogoPersonalizadoService';
import { API_URL } from '../../services/api';
import StatusBadge from '../../components/StatusBadge';
import SelectBusca from '../../components/SelectBusca';
import { useAuth } from '../../contexts/AuthContext';
import { Search, X, ChevronLeft, ChevronRight, Package, ListPlus, Check, ArrowRight, Link2, Copy, Send, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';

/* ------- helpers ------- */
const money = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
const imgUrl = (u) => !u ? null : (String(u).startsWith('http') ? u : `${API_URL}${u}`);
const SEM_CAT = '_sem';
// Fundo quente determinístico para cards sem foto (mesma ideia do site de congelados)
const tileGradient = (seed) => {
    let h = 0; const s = String(seed || 'x');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const hue = 20 + (h % 40); // 20–60: dourado / caramelo / marrom
    return `linear-gradient(150deg, hsl(${hue} 46% 70%), hsl(${hue} 50% 58%))`;
};
// Parsers da etiqueta ("169kcal (12% VD)") — mesma lógica da ficha de congelados
const parseValor = (s) => { if (!s) return null; const m = String(s).replace(',', '.').match(/-?[\d.]+/); return m ? parseFloat(m[0]) : null; };
const parseVD = (s) => { const m = String(s || '').match(/(\d+)\s*%/); return m ? m[1] : null; };
const fmtNum = (n, d) => { if (n == null || isNaN(n)) return '0'; const f = Math.pow(10, d); return String(Math.round(n * f) / f).replace('.', ','); };

const Catalogo = () => {
    const { user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();

    const initialSearch = searchParams.get('search') || '';

    const [produtos, setProdutos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState(initialSearch);
    const [filtro, setFiltro] = useState('todos'); // 'todos' | id da categoria comercial
    const [fichaId, setFichaId] = useState(null);   // produto aberto no popup

    // Configurações (regras de exibição de tipo de produto desta aba — mantidas)
    const [configuredCategories, setConfiguredCategories] = useState([]);
    const [configLoaded, setConfigLoaded] = useState(false);

    // Sync busca -> URL
    useEffect(() => {
        const params = {};
        if (search) params.search = search;
        setSearchParams(params, { replace: true });
    }, [search, setSearchParams]);

    // Carrega config no mount
    useEffect(() => {
        const loadConfig = async () => {
            try {
                const cats = await configService.get('categorias_vendas');
                setConfiguredCategories(Array.isArray(cats) ? cats : []);
            } catch (error) {
                console.error('Erro ao carregar configurações:', error);
            } finally {
                setConfigLoaded(true);
            }
        };
        loadConfig();
    }, []);

    const fetchProdutos = async () => {
        if (!configLoaded) return;
        setLoading(true);
        try {
            // Carrega tudo (sem paginação) para agrupar por categoria no cliente, como no site de congelados.
            const params = { page: 1, limit: 1000, search, ativo: true };

            // REGRAS DE EXIBIÇÃO DE TIPO DE PRODUTO (mantidas) — categorias de venda configuradas
            if (configuredCategories.length > 0) {
                params.categorias = configuredCategories.join(',');
            }
            // REGRAS DE EXIBIÇÃO — categorias comerciais permitidas ao vendedor (vazio = todas)
            const catsComerciais = user?.permissoes?.categoriasComerciais;
            if (Array.isArray(catsComerciais) && catsComerciais.length > 0) {
                params.categoriaProdutoIds = catsComerciais.join(',');
            }

            const data = await produtoService.listar(params);
            setProdutos(data.data || []);
        } catch (error) {
            console.error('Erro ao buscar produtos:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => { if (configLoaded) fetchProdutos(); }, 500);
        return () => clearTimeout(timeoutId);
    }, [search, configLoaded]);

    // Pílulas de categoria: categorias comerciais distintas presentes nos produtos carregados
    const categorias = useMemo(() => {
        const map = new Map();
        produtos.forEach(p => {
            const c = p.categoriaProduto;
            const id = c?.id || SEM_CAT;
            if (!map.has(id)) map.set(id, { id, nome: c?.nome || 'Sem categoria', cor: c?.corTag || null });
        });
        return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt', { sensitivity: 'base' }));
    }, [produtos]);

    // Se o filtro selecionado some (ex.: após busca), volta para "Todos"
    useEffect(() => {
        if (filtro !== 'todos' && !categorias.some(c => c.id === filtro)) setFiltro('todos');
    }, [categorias, filtro]);

    // Produtos agrupados por categoria (respeitando o filtro das pílulas)
    const secoes = useMemo(() => {
        const base = filtro === 'todos'
            ? produtos
            : produtos.filter(p => (p.categoriaProduto?.id || SEM_CAT) === filtro);
        const porCat = {};
        base.forEach(p => { const k = p.categoriaProduto?.id || SEM_CAT; (porCat[k] = porCat[k] || []).push(p); });
        return categorias.filter(c => porCat[c.id]).map(c => ({ ...c, produtos: porCat[c.id] }));
    }, [produtos, filtro, categorias]);

    // ── Montar catálogo personalizado (seleção → cliente/condição → link) ──
    const [montarMode, setMontarMode] = useState(false);
    const [selecionados, setSelecionados] = useState(() => new Set());
    const [gerarOpen, setGerarOpen] = useState(false);
    const [clientes, setClientes] = useState([]);
    const [condicoes, setCondicoes] = useState([]);
    const [baseCarregada, setBaseCarregada] = useState(false);

    const entrarMontar = async () => {
        setMontarMode(true);
        if (baseCarregada) return;
        try {
            const [cli, cond] = await Promise.all([
                clienteService.listar({ limit: 2000 }),
                tabelaPrecoService.listar(true),
            ]);
            const listaCli = (cli.data || cli || []).filter(c => c.Ativo);
            setClientes(listaCli);
            setCondicoes(Array.isArray(cond) ? cond : []);
            setBaseCarregada(true);
        } catch (e) {
            console.error('Erro ao carregar clientes/condições do catálogo personalizado:', e);
        }
    };
    const sairMontar = () => { setMontarMode(false); setSelecionados(new Set()); setGerarOpen(false); };
    const toggleSel = (id) => setSelecionados(prev => {
        const n = new Set(prev);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
    });
    const produtosSelecionados = useMemo(() => produtos.filter(p => selecionados.has(p.id)), [produtos, selecionados]);

    const handleSearch = (e) => setSearch(e.target.value);

    return (
        <div className="px-3 py-4 md:px-6 md:py-6">
            {/* Topbar */}
            {!montarMode ? (
                <div className="flex items-center gap-3 mb-4">
                    <div className="bg-purple-100 p-2 rounded-lg">
                        <Package className="h-5 w-5 text-purple-600" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-lg font-bold text-gray-900 leading-tight">Catálogo</h1>
                        {!loading && <p className="text-xs text-gray-500">{produtos.length} produtos</p>}
                    </div>
                    <button
                        onClick={entrarMontar}
                        className="ml-auto inline-flex items-center gap-2 px-3 py-2 md:px-4 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-xs md:text-sm whitespace-nowrap"
                    >
                        <ListPlus className="h-4 w-4" /> Montar catálogo
                    </button>
                </div>
            ) : (
                <div className="flex items-center gap-3 mb-4">
                    <button onClick={sairMontar} className="p-1.5 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100" title="Cancelar">
                        <X className="h-5 w-5" />
                    </button>
                    <div className="min-w-0">
                        <h1 className="text-lg font-bold text-gray-900 leading-tight">Montar catálogo</h1>
                        <p className="text-xs text-gray-500">Toque nos produtos para selecionar</p>
                    </div>
                    <span className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-mint text-primaryDark rounded-full text-sm font-bold whitespace-nowrap">
                        {selecionados.size} <span className="font-medium">selec.</span>
                    </span>
                </div>
            )}

            {/* Busca */}
            <div className="mb-3 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                    type="text"
                    className="block w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl bg-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm text-gray-900"
                    placeholder="Buscar por nome ou código…"
                    value={search}
                    onChange={handleSearch}
                />
            </div>

            {/* Pílulas de categoria */}
            {categorias.length > 0 && (
                <div className="mb-5 flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                    <Pill active={filtro === 'todos'} onClick={() => setFiltro('todos')}>Todos</Pill>
                    {categorias.map(c => (
                        <Pill key={c.id} cor={c.cor} active={filtro === c.id} onClick={() => setFiltro(c.id)}>
                            {c.nome}
                        </Pill>
                    ))}
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-16 gap-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    <span className="text-sm text-gray-500">Carregando produtos…</span>
                </div>
            ) : secoes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <Package className="h-12 w-12 text-gray-200" />
                    <p className="text-sm text-gray-400">Nenhum produto encontrado.</p>
                    {search && (
                        <button onClick={() => setSearch('')} className="text-xs text-primary hover:underline">
                            Limpar busca
                        </button>
                    )}
                </div>
            ) : (
                secoes.map(sec => (
                    <section key={sec.id} className="mb-7">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="inline-block w-1.5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: sec.cor || '#9ca3af' }} />
                            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">{sec.nome}</h2>
                            <span className="text-xs text-gray-400 font-medium">({sec.produtos.length})</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                            {sec.produtos.map(p => (
                                <CatalogoCard
                                    key={p.id}
                                    produto={p}
                                    montarMode={montarMode}
                                    selecionado={selecionados.has(p.id)}
                                    onAbrir={() => setFichaId(p.id)}
                                    onToggle={() => toggleSel(p.id)}
                                />
                            ))}
                        </div>
                    </section>
                ))
            )}

            {/* Espaçador para a barra flutuante não cobrir o último card */}
            {montarMode && <div className="h-24" />}

            {/* Barra flutuante de seleção */}
            {montarMode && (
                <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 py-3 flex items-center gap-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)]">
                    <div className="leading-tight">
                        <p className="text-sm font-bold text-gray-900">{selecionados.size} {selecionados.size === 1 ? 'item' : 'itens'}</p>
                        <p className="text-xs text-gray-500">selecionados</p>
                    </div>
                    <button
                        disabled={selecionados.size === 0}
                        onClick={() => setGerarOpen(true)}
                        className="ml-auto inline-flex items-center gap-2 px-5 py-3 bg-primary hover:bg-primaryDark disabled:bg-gray-300 text-white rounded-full font-bold text-sm"
                    >
                        Cliente e condição <ArrowRight className="h-4 w-4" />
                    </button>
                </div>
            )}

            {gerarOpen && (
                <GerarCatalogoModal
                    produtos={produtosSelecionados}
                    clientes={clientes}
                    condicoes={condicoes}
                    onClose={() => setGerarOpen(false)}
                    onConcluir={() => { setGerarOpen(false); sairMontar(); }}
                />
            )}

            {fichaId && <FichaModal produtoId={fichaId} onClose={() => setFichaId(null)} />}
        </div>
    );
};

/* ------- helpers de condição ------- */
// Condições "normais" ativas (as mesmas que valem para um pedido comum), da mais barata p/ a mais cara
function condicoesNormais(todasCondicoes) {
    return (todasCondicoes || [])
        .filter(c => c.ativo !== false && c.permitePedido !== false && c.permiteBonificacao !== true)
        .slice()
        .sort((a, b) => (Number(a.acrescimoPreco) || 0) - (Number(b.acrescimoPreco) || 0) || (Number(a.parcelasDias) || 0) - (Number(b.parcelasDias) || 0));
}
// A condição está aprovada para este cliente? (lista de permitidas ou, na falta, só a padrão)
function condAprovadaParaCliente(cliente, c) {
    if (!cliente) return false;
    let ids = [];
    if (Array.isArray(cliente.condicoes_pagamento_permitidas)) ids = cliente.condicoes_pagamento_permitidas;
    else if (typeof cliente.condicoes_pagamento_permitidas === 'string' && cliente.condicoes_pagamento_permitidas.trim())
        ids = cliente.condicoes_pagamento_permitidas.split(',').map(s => s.trim());
    if (ids.length) return ids.includes(c.idCondicao) || ids.includes(c.id);
    return c.idCondicao === cliente.Condicao_de_pagamento || c.id === cliente.Condicao_de_pagamento;
}

/* ------- Modal: gerar catálogo personalizado ------- */
function GerarCatalogoModal({ produtos, clientes, condicoes, onClose, onConcluir }) {
    const [destMode, setDestMode] = useState('cliente'); // 'cliente' | 'outro'
    const [clienteId, setClienteId] = useState('');
    const [nomeAvulso, setNomeAvulso] = useState('');
    const [condId, setCondId] = useState('');
    const [gerando, setGerando] = useState(false);
    const [erro, setErro] = useState('');
    const [resultado, setResultado] = useState(null);
    const [copiado, setCopiado] = useState(false);

    const cliente = useMemo(() => clientes.find(c => c.UUID === clienteId) || null, [clientes, clienteId]);
    const conds = useMemo(() => condicoesNormais(condicoes), [condicoes]);
    const cond = useMemo(() => conds.find(c => c.id === condId) || null, [conds, condId]);

    const aprovada = (c) => destMode === 'cliente' && condAprovadaParaCliente(cliente, c);
    const precisaAprovacao = (c) => !!c && !aprovada(c) && (Number(c.parcelasDias) || 0) > 0;

    // condição padrão inicial: do cliente (se cadastrado) ou a mais barata (à vista) p/ avulso
    useEffect(() => {
        let padrao = null;
        if (destMode === 'cliente' && cliente)
            padrao = conds.find(c => c.idCondicao === cliente.Condicao_de_pagamento || c.id === cliente.Condicao_de_pagamento);
        setCondId((padrao || conds[0])?.id || '');
    }, [clienteId, destMode]); // eslint-disable-line react-hooks/exhaustive-deps

    const acr = cond ? Number(cond.acrescimoPreco) || 0 : 0;
    const itens = produtos.map(p => ({ ...p, precoFinal: Number(p.valorVenda) * (1 + acr / 100) }));
    const subtotal = itens.reduce((s, it) => s + it.precoFinal, 0);
    const valorMin = cond && cond.valorMinimo != null ? Number(cond.valorMinimo) : 0;
    const nomeDestino = destMode === 'cliente' ? (cliente ? (cliente.NomeFantasia || cliente.Nome) : '') : nomeAvulso.trim();
    const destinoOk = destMode === 'cliente' ? !!clienteId : nomeAvulso.trim().length >= 2;

    const gerar = async () => {
        if (!destinoOk || !cond) return;
        setGerando(true); setErro('');
        try {
            const r = await catalogoPersonalizadoService.gerar({
                clienteUuid: destMode === 'cliente' ? cliente.UUID : undefined,
                clienteNome: destMode === 'outro' ? nomeAvulso.trim() : undefined,
                condicaoId: cond.id,
                produtoIds: produtos.map(p => p.id),
            });
            setResultado({ token: r.token, link: `${window.location.origin}/lista/${r.token}`, aprovacao: precisaAprovacao(cond) });
        } catch (e) {
            setErro(e?.response?.data?.error || 'Não foi possível gerar o link. Tente de novo.');
        } finally {
            setGerando(false);
        }
    };

    const copiar = () => {
        if (!resultado || !navigator.clipboard) return;
        navigator.clipboard.writeText(resultado.link)
            .then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); })
            .catch(() => { });
    };

    // Envio do vendedor: cliente cadastrado → conversa dele; avulso → tela de compartilhar
    const telCliente = destMode === 'cliente' && cliente ? String(cliente.Telefone_Celular || cliente.Telefone || '').replace(/\D/g, '') : '';
    const telDDI = telCliente ? (telCliente.startsWith('55') ? telCliente : '55' + telCliente) : '';
    const waMsg = resultado ? encodeURIComponent(`Olá! 😊 Preparei uma lista de preços da Hardt Salgados especialmente pra você. É só abrir:\n\n${resultado.link}\n\nQualquer dúvida, me chama!`) : '';
    const waHref = resultado ? `https://wa.me/${telDDI}?text=${waMsg}` : '#';

    return (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
            <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
                {/* header */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-base font-bold text-gray-900">{resultado ? 'Catálogo pronto!' : 'Gerar catálogo personalizado'}</h3>
                        <p className="text-xs text-gray-500">{resultado ? 'Copie o link ou envie no WhatsApp' : `${produtos.length} ${produtos.length === 1 ? 'produto selecionado' : 'produtos selecionados'}`}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"><X className="h-5 w-5" /></button>
                </div>

                {/* body */}
                <div className="overflow-y-auto px-5 py-4 flex-1">
                    {resultado ? (
                        <div>
                            <div className="flex flex-col items-center text-center gap-2 py-2">
                                <div className="w-14 h-14 rounded-full bg-mint flex items-center justify-center">
                                    <CheckCircle2 className="h-8 w-8 text-primary" />
                                </div>
                                <h4 className="text-lg font-bold text-gray-900">Link gerado!</h4>
                                <p className="text-sm text-gray-500 max-w-xs">
                                    Lista de <b className="text-gray-700">{nomeDestino}</b> em <b className="text-gray-700">{cond?.nomeCondicao}</b>{resultado.aprovacao ? ' (mediante aprovação de crédito)' : ''}, válida por 7 dias.
                                </p>
                            </div>
                            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 mt-2">
                                <Link2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
                                <span className="flex-1 min-w-0 text-xs font-mono text-gray-600 truncate">{resultado.link.replace(/^https?:\/\//, '')}</span>
                                <button onClick={copiar} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 whitespace-nowrap">
                                    <Copy className="h-3.5 w-3.5" /> {copiado ? 'Copiado!' : 'Copiar'}
                                </button>
                            </div>
                            <p className="text-[11px] text-gray-400 text-center mt-2">Preços congelados neste momento — se o produto mudar depois, o cliente continua vendo o que você enviou.</p>
                        </div>
                    ) : (
                        <>
                            {/* Destinatário: cliente cadastrado ou nome avulso */}
                            <div className="mb-4">
                                <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Enviar para</label>
                                <div className="flex bg-gray-100 rounded-xl p-1 gap-1 mb-2.5">
                                    <button type="button" onClick={() => setDestMode('cliente')}
                                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${destMode === 'cliente' ? 'bg-white text-primaryDark shadow-sm' : 'text-gray-500'}`}>Cliente cadastrado</button>
                                    <button type="button" onClick={() => setDestMode('outro')}
                                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${destMode === 'outro' ? 'bg-white text-primaryDark shadow-sm' : 'text-gray-500'}`}>Outro destinatário</button>
                                </div>
                                {destMode === 'cliente' ? (
                                    <SelectBusca value={clienteId} onChange={e => setClienteId(e.target.value)} className="w-full">
                                        <option value="">Selecione o cliente…</option>
                                        {clientes.map(c => (
                                            <option key={c.UUID} value={c.UUID}>
                                                {(c.NomeFantasia || c.Nome)}{c.End_Cidade ? ` — ${c.End_Cidade}` : ''}
                                            </option>
                                        ))}
                                    </SelectBusca>
                                ) : (
                                    <>
                                        <input value={nomeAvulso} onChange={e => setNomeAvulso(e.target.value)}
                                            placeholder="Nome da pessoa ou empresa…"
                                            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                                        <p className="text-[11px] text-gray-400 mt-1.5">Para quem ainda não é cliente. Condições com prazo entram como “mediante aprovação de crédito”.</p>
                                    </>
                                )}
                            </div>

                            {/* Condição de pagamento — todas as condições, marcando aprovação */}
                            <div className="mb-4">
                                <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Condição de pagamento</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {conds.map(c => {
                                        const on = c.id === condId;
                                        const a = Number(c.acrescimoPreco) || 0;
                                        const isStd = destMode === 'cliente' && cliente && (c.idCondicao === cliente.Condicao_de_pagamento || c.id === cliente.Condicao_de_pagamento);
                                        const apr = precisaAprovacao(c);
                                        const lbl = a > 0 ? `+${a}% no preço` : (a < 0 ? `${a}% (desconto)` : 'preço de tabela');
                                        const cls = a > 0 ? 'text-amber-700' : (a < 0 ? 'text-emerald-700' : 'text-gray-500');
                                        return (
                                            <button key={c.id} type="button" onClick={() => setCondId(c.id)}
                                                className={`text-left rounded-xl border px-3 py-2 transition-colors ${on ? 'border-primary bg-mint' : 'border-gray-200 hover:border-gray-300'}`}>
                                                <div className="text-[13px] font-bold text-gray-900 flex items-center gap-1.5 flex-wrap">
                                                    {c.nomeCondicao}
                                                    {isStd && <span className="text-[8px] font-extrabold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full uppercase tracking-wide">padrão</span>}
                                                    {apr && <span className="text-[8px] font-extrabold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full uppercase tracking-wide">aprov. crédito</span>}
                                                </div>
                                                <div className={`text-[11px] font-semibold mt-0.5 ${cls}`}>{lbl}</div>
                                            </button>
                                        );
                                    })}
                                </div>
                                {precisaAprovacao(cond) && (
                                    <div className="flex gap-2 items-start bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl px-3 py-2.5 mt-2">
                                        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                        <span>Essa condição não está aprovada para este destinatário. A lista sai marcada como <b>“mediante aprovação de crédito”</b>.</span>
                                    </div>
                                )}
                            </div>

                            {cond && (
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">{produtos.length} {produtos.length === 1 ? 'item' : 'itens'} · preço em {cond.nomeCondicao}</label>
                                    <div className="border border-gray-100 rounded-xl overflow-hidden">
                                        {itens.map(it => {
                                            const diff = Math.abs(it.precoFinal - Number(it.valorVenda)) > 0.005;
                                            return (
                                                <div key={it.id} className="flex items-center gap-3 px-3 py-2 border-b border-gray-50 last:border-0">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[13px] font-medium text-gray-900 truncate">{it.nome}</p>
                                                        <p className="text-[10px] text-gray-400 font-mono">{it.codigo}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-[13px] font-bold text-primary">{money(it.precoFinal)}</p>
                                                        {diff && <p className="text-[9.5px] text-gray-400 line-through">{money(it.valorVenda)}</p>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="flex items-center justify-between mt-3 px-1">
                                        <span className="text-sm text-gray-500 font-medium">Total <span className="text-gray-400 font-normal">(só o vendedor vê)</span></span>
                                        <span className="text-base font-bold text-gray-900">{money(subtotal)}</span>
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-1 px-1">O cliente vê só a lista com o preço de cada item.</p>
                                    {valorMin > 0 && subtotal < valorMin && (
                                        <div className="flex gap-2 items-start bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl px-3 py-2.5 mt-2">
                                            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                            <span>O pedido mínimo para <b>{cond.nomeCondicao}</b> é {money(valorMin)}. A lista pode ser enviada mesmo assim — é só um lembrete.</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {erro && <p className="text-sm text-red-600 mt-3">{erro}</p>}
                        </>
                    )}
                </div>

                {/* footer */}
                <div className="px-5 py-4 border-t border-gray-100">
                    {resultado ? (
                        <div className="flex flex-col gap-2">
                            <a href={waHref} target="_blank" rel="noopener noreferrer"
                                className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-bold text-sm"
                                style={{ backgroundColor: '#25d366' }}>
                                <Send className="h-4 w-4" /> Enviar no WhatsApp
                            </a>
                            <button onClick={onConcluir} className="w-full py-2.5 rounded-2xl bg-white border border-gray-300 text-gray-600 font-semibold text-sm hover:bg-gray-50">Concluir</button>
                        </div>
                    ) : (
                        <button
                            onClick={gerar}
                            disabled={!destinoOk || !cond || gerando}
                            className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary hover:bg-primaryDark disabled:bg-gray-300 text-white font-bold text-sm"
                        >
                            {gerando ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando…</> : <><Link2 className="h-4 w-4" /> Gerar link do catálogo</>}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ------- Pílula de categoria ------- */
function Pill({ active, cor, onClick, children }) {
    const base = 'px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors shrink-0';
    if (active) {
        return (
            <button onClick={onClick} className={base + ' text-white'}
                style={{ backgroundColor: cor || '#00754A', borderColor: cor || '#00754A' }}>
                {children}
            </button>
        );
    }
    return (
        <button onClick={onClick}
            className={base + ' bg-white text-gray-700 border-gray-300 hover:border-gray-400'}
            style={cor ? { color: cor, borderColor: `${cor}66` } : undefined}>
            {children}
        </button>
    );
}

/* ------- Card do produto ------- */
function CatalogoCard({ produto, onAbrir, montarMode, selecionado, onToggle }) {
    const img = produto.imagens && produto.imagens.length > 0 ? imgUrl(produto.imagens[0].url) : null;
    return (
        <button
            type="button"
            onClick={montarMode ? onToggle : onAbrir}
            title={montarMode ? 'Selecionar para o catálogo' : 'Ver detalhes do produto'}
            className={`group text-left bg-white rounded-xl shadow-sm border overflow-hidden hover:shadow-md active:scale-[0.98] transition-all flex flex-col ${selecionado ? 'border-primary ring-2 ring-primary' : 'border-gray-200'}`}
        >
            <div className="relative aspect-[4/3] bg-gray-100" style={!img ? { background: tileGradient(produto.codigo || produto.nome) } : undefined}>
                {img
                    ? <img src={img} alt={produto.nome} loading="lazy" className="w-full h-full object-cover" />
                    : <span className="absolute inset-0 flex items-center justify-center text-xs text-white/90 px-2 text-center leading-snug font-medium">{produto.nome}</span>}
                {montarMode && (
                    <div className={`absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center border-2 shadow ${selecionado ? 'bg-primary border-primary' : 'bg-white/85 border-white'}`}>
                        <Check className={`h-4 w-4 ${selecionado ? 'text-white' : 'text-transparent'}`} />
                    </div>
                )}
                <div className="absolute top-2 right-2">
                    <StatusBadge ativo={produto.ativo} estoque={Number(produto.estoqueDisponivel)} />
                </div>
                {!montarMode && (
                    <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-xs text-center py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        Ver detalhes
                    </span>
                )}
            </div>
            <div className="p-3 flex flex-col flex-1">
                <p className="text-[10px] text-gray-400 font-mono">{produto.codigo}</p>
                <h3 className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug mt-0.5">{produto.nome}</h3>
                <div className="mt-auto pt-2 flex items-end justify-between gap-1">
                    <span className="text-base font-bold text-primary">{money(produto.valorVenda)}</span>
                    <span className="text-[10px] text-gray-400 text-right">{Number(produto.estoqueDisponivel)} {produto.unidade}</span>
                </div>
            </div>
        </button>
    );
}

/* ------- Popup da ficha (dados + tabela nutricional ANVISA) ------- */
function FichaModal({ produtoId, onClose }) {
    const [ficha, setFicha] = useState(null);
    const [loading, setLoading] = useState(true);
    const [idx, setIdx] = useState(0);

    useEffect(() => {
        let vivo = true;
        produtoService.ficha(produtoId)
            .then(f => { if (vivo) setFicha(f); })
            .catch(() => { if (vivo) setFicha(null); })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
    }, [produtoId]);

    const imgs = useMemo(() => {
        if (!ficha) return [];
        return (ficha.imagens?.length ? ficha.imagens : (ficha.imagem ? [ficha.imagem] : [])).map(imgUrl);
    }, [ficha]);
    const multi = imgs.length > 1;
    const cur = imgs.length ? idx % imgs.length : 0;
    const prev = (e) => { e.stopPropagation(); setIdx(i => (i - 1 + imgs.length) % imgs.length); };
    const next = (e) => { e.stopPropagation(); setIdx(i => (i + 1) % imgs.length); };

    const et = ficha?.etiqueta;
    const nut = et?.nutricional || {};
    const pesoPorc = Number(et?.pesoPorcao) || 0;
    const linhasNut = [
        { label: 'Valor energético (kcal)', raw: nut.valorEnergetico, dec: 0, indent: 0 },
        { label: 'Carboidratos totais (g)', raw: nut.carboidratos, dec: 1, indent: 0 },
        { label: 'Açúcares totais (g)', raw: nut.acucaresTotais, dec: 1, indent: 1, always: true },
        { label: 'Açúcares adicionados (g)', raw: nut.acucaresAdicionados, dec: 1, indent: 2, always: true },
        { label: 'Proteínas (g)', raw: nut.proteinas, dec: 1, indent: 0 },
        { label: 'Gorduras totais (g)', raw: nut.gordurasTotais, dec: 1, indent: 0 },
        { label: 'Gorduras saturadas (g)', raw: nut.gordurasSaturadas, dec: 1, indent: 1 },
        { label: 'Gorduras trans (g)', raw: nut.gordurasTrans, dec: 1, indent: 1 },
        { label: 'Fibras alimentares (g)', raw: nut.fibraAlimentar, dec: 1, indent: 0 },
        { label: 'Sódio (mg)', raw: nut.sodio, dec: 0, indent: 0 },
    ].filter(r => r.always || r.raw);
    const temNut = !!et && pesoPorc > 0 && linhasNut.some(r => r.raw);

    const alergenos = (Array.isArray(et?.alergenos) ? et.alergenos.filter(Boolean) : []).map(a => {
        if (a === 'Crustáceos' && et.especieCrustaceos) return `${a} (${et.especieCrustaceos})`;
        if (a === 'Peixes' && et.especiePeixes) return `${a} (${et.especiePeixes})`;
        return a;
    });
    const indentCls = (n) => n === 1 ? 'pl-6' : n === 2 ? 'pl-10' : '';

    return (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-3 sm:p-6" onClick={onClose}>
            <div className="bg-white rounded-2xl w-full max-w-2xl my-4 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Hero / carrossel */}
                <div className="relative aspect-[16/10] bg-gray-100"
                    style={!imgs.length ? { background: tileGradient(ficha?.codigo || ficha?.nome) } : undefined}>
                    {imgs.length ? (
                        <div className="flex h-full transition-transform duration-300" style={{ transform: `translateX(-${cur * 100}%)` }}>
                            {imgs.map((u, i) => <img key={i} src={u} alt={ficha?.nome} className="w-full h-full object-cover shrink-0" />)}
                        </div>
                    ) : (
                        <span className="absolute inset-0 flex items-center justify-center text-white/90 text-sm">{ficha?.nome || 'Carregando…'}</span>
                    )}
                    <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/45 hover:bg-black/65 text-white flex items-center justify-center">
                        <X className="w-5 h-5" />
                    </button>
                    {multi && (
                        <>
                            <button onClick={prev} className="absolute top-1/2 -translate-y-1/2 left-2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center">
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <button onClick={next} className="absolute top-1/2 -translate-y-1/2 right-2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center">
                                <ChevronRight className="w-5 h-5" />
                            </button>
                            <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1.5">
                                {imgs.map((_, i) => (
                                    <span key={i} onClick={(e) => { e.stopPropagation(); setIdx(i); }}
                                        className={'w-2 h-2 rounded-full cursor-pointer ' + (i === cur ? 'bg-white' : 'bg-white/50')} />
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <div className="p-5 max-h-[calc(100vh-16rem)] overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center gap-2 py-10">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                            <span className="text-sm text-gray-500">Carregando…</span>
                        </div>
                    ) : !ficha ? (
                        <p className="text-center text-sm text-gray-400 py-10">Não foi possível carregar a ficha do produto.</p>
                    ) : (
                        <>
                            {/* Cabeçalho */}
                            <div className="flex items-start gap-2 flex-wrap">
                                <div className="flex-1 min-w-0">
                                    <h2 className="text-lg font-bold text-gray-900 leading-tight">{ficha.nome}</h2>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        Cód. {ficha.codigo}{ficha.grupoNome ? ` · ${ficha.grupoNome}` : ''}
                                        {et?.pesoUnitario ? ` · ${et.pesoUnitario}g/un` : ''}
                                    </p>
                                </div>
                                <StatusBadge ativo={ficha.ativo} estoque={Number(ficha.estoqueDisponivel)} />
                            </div>

                            {/* Preço + estoque */}
                            <div className="mt-3 flex items-end justify-between bg-gray-50 rounded-xl px-4 py-3">
                                <div>
                                    <p className="text-xs text-gray-500">Preço de venda</p>
                                    <p className="text-2xl font-bold text-primary leading-none mt-0.5">{money(ficha.valorVenda)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-gray-500">Disponível</p>
                                    <p className="text-base font-semibold text-gray-800">{Number(ficha.estoqueDisponivel)} {ficha.unidade}</p>
                                </div>
                            </div>

                            {ficha.descricao && <p className="mt-3 text-sm text-gray-600">{ficha.descricao}</p>}

                            {!et && (
                                <p className="mt-4 text-sm text-gray-400 italic">Ficha técnica deste produto ainda não cadastrada.</p>
                            )}

                            {/* Tabela nutricional — padrão ANVISA (IN 75/2020) */}
                            {temNut && (
                                <div className="mt-4">
                                    <div className="border border-gray-300 rounded-lg overflow-hidden">
                                        <div className="bg-gray-800 text-white text-sm font-semibold px-3 py-2">Informação Nutricional</div>
                                        <table className="w-full text-[13px]" style={{ tableLayout: 'fixed' }}>
                                            <colgroup>
                                                <col style={{ width: '44%' }} /><col style={{ width: '18%' }} />
                                                <col style={{ width: '24%' }} /><col style={{ width: '14%' }} />
                                            </colgroup>
                                            <tbody>
                                                <tr className="text-xs text-gray-500">
                                                    <td colSpan={4} className="px-3 py-2 border-b border-gray-200">
                                                        Porções por embalagem: {et.quantidadeEmbalagem}{et.quantidadeAproximada ? '±' : ''} porções<br />
                                                        Porção: {pesoPorc} g (1 unidade)
                                                    </td>
                                                </tr>
                                                <tr className="font-semibold text-gray-700 bg-gray-50">
                                                    <td className="px-3 py-1.5 border-b-2 border-gray-300"></td>
                                                    <td className="px-3 py-1.5 border-b-2 border-gray-300 text-right">100 g</td>
                                                    <td className="px-3 py-1.5 border-b-2 border-gray-300 text-right">Porção {pesoPorc} g</td>
                                                    <td className="px-3 py-1.5 border-b-2 border-gray-300 text-right">%VD*</td>
                                                </tr>
                                                {linhasNut.map(r => {
                                                    const porc = parseValor(r.raw);
                                                    const cem = (porc != null && pesoPorc) ? (porc / pesoPorc) * 100 : null;
                                                    const vd = parseVD(r.raw);
                                                    return (
                                                        <tr key={r.label} className="border-b border-gray-100">
                                                            <td className={'px-3 py-1.5 text-gray-700 ' + indentCls(r.indent)}>{r.label}</td>
                                                            <td className="px-3 py-1.5 text-right text-gray-700">{fmtNum(cem, r.dec)}</td>
                                                            <td className="px-3 py-1.5 text-right text-gray-700">{fmtNum(porc, r.dec)}</td>
                                                            <td className="px-3 py-1.5 text-right text-gray-700">{vd != null ? vd : '—'}</td>
                                                        </tr>
                                                    );
                                                })}
                                                <tr className="text-[11px] text-gray-400">
                                                    <td colSpan={4} className="px-3 py-2">*Percentual de valores diários fornecidos pela porção.</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Ingredientes + alérgenos */}
                            {et?.composicao && (
                                <div className="mt-4">
                                    <h4 className="text-sm font-semibold text-gray-800 mb-1">Ingredientes</h4>
                                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                        <p className="text-sm text-gray-700">{et.composicao}</p>
                                        <p className="text-xs font-semibold text-gray-800 mt-2">
                                            {et.contemGluten ? 'CONTÉM GLÚTEN' : 'NÃO CONTÉM GLÚTEN'}
                                            {et.contemLactose ? ' · CONTÉM LACTOSE' : ''}
                                            {alergenos.length > 0 ? ` · ALÉRGICOS: CONTÉM ${alergenos.join(', ').toUpperCase()}.` : ''}
                                            {et.avisosRotulo ? ` ${String(et.avisosRotulo).toUpperCase()}` : ''}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Modo de preparo */}
                            {et?.modoPreparo && (
                                <div className="mt-4">
                                    <h4 className="text-sm font-semibold text-gray-800 mb-1">Modo de preparo</h4>
                                    <p className="text-sm text-gray-700">{et.modoPreparo}</p>
                                </div>
                            )}

                            {/* Validade + conservação */}
                            {(et?.validadeDias != null || et?.armazenamento) && (
                                <div className="mt-4 grid grid-cols-2 gap-3">
                                    {et?.validadeDias != null && (
                                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 text-center">
                                            <p className="text-base font-bold text-gray-800">{et.validadeDias} dias</p>
                                            <p className="text-xs text-gray-500">validade</p>
                                        </div>
                                    )}
                                    {et?.armazenamento && (
                                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 text-center">
                                            <p className="text-base font-bold text-gray-800">{et.armazenamento}</p>
                                            <p className="text-xs text-gray-500">conservação</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
                    <button onClick={onClose} className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Catalogo;
