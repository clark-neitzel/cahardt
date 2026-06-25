
import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import produtoService from '../../services/produtoService';
import configService from '../../services/configService';
import { API_URL } from '../../services/api';
import StatusBadge from '../../components/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { Search, X, ChevronLeft, ChevronRight } from 'lucide-react';

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

    const handleSearch = (e) => setSearch(e.target.value);

    return (
        <div className="container mx-auto px-4 py-6">
            {/* Busca */}
            <div className="mb-4 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                    type="text"
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm text-gray-900"
                    placeholder="Buscar produto por nome ou código..."
                    value={search}
                    onChange={handleSearch}
                />
            </div>

            {/* Pílulas de categoria */}
            {categorias.length > 0 && (
                <div className="mb-5 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                    <Pill active={filtro === 'todos'} onClick={() => setFiltro('todos')}>Todos</Pill>
                    {categorias.map(c => (
                        <Pill key={c.id} cor={c.cor} active={filtro === c.id} onClick={() => setFiltro(c.id)}>
                            {c.nome}
                        </Pill>
                    ))}
                </div>
            )}

            {loading ? (
                <div className="flex justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            ) : secoes.length === 0 ? (
                <div className="text-center py-10 text-gray-500">Nenhum produto encontrado.</div>
            ) : (
                secoes.map(sec => (
                    <section key={sec.id} className="mb-8">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="inline-block w-1.5 h-5 rounded-full" style={{ backgroundColor: sec.cor || '#9ca3af' }} />
                            <h2 className="text-base font-semibold text-gray-800">{sec.nome}</h2>
                            <span className="text-xs text-gray-400">({sec.produtos.length})</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {sec.produtos.map(p => (
                                <CatalogoCard key={p.id} produto={p} onAbrir={() => setFichaId(p.id)} />
                            ))}
                        </div>
                    </section>
                ))
            )}

            {fichaId && <FichaModal produtoId={fichaId} onClose={() => setFichaId(null)} />}
        </div>
    );
};

/* ------- Pílula de categoria ------- */
function Pill({ active, cor, onClick, children }) {
    const base = 'px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition-colors shrink-0';
    if (active) {
        return (
            <button onClick={onClick} className={base + ' text-white'}
                style={{ backgroundColor: cor || '#2563eb', borderColor: cor || '#2563eb' }}>
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
function CatalogoCard({ produto, onAbrir }) {
    const img = produto.imagens && produto.imagens.length > 0 ? imgUrl(produto.imagens[0].url) : null;
    return (
        <button
            type="button"
            onClick={onAbrir}
            title="Ver detalhes do produto"
            className="group text-left bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow flex flex-col"
        >
            <div className="relative aspect-[4/3] bg-gray-100" style={!img ? { background: tileGradient(produto.codigo || produto.nome) } : undefined}>
                {img
                    ? <img src={img} alt={produto.nome} loading="lazy" className="w-full h-full object-cover" />
                    : <span className="absolute inset-0 flex items-center justify-center text-xs text-white/90 px-2 text-center">{produto.nome}</span>}
                <div className="absolute top-2 right-2">
                    <StatusBadge ativo={produto.ativo} estoque={Number(produto.estoqueDisponivel)} />
                </div>
                <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-xs text-center py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    Ver detalhes
                </span>
            </div>
            <div className="p-3 flex flex-col flex-1">
                <p className="text-xs text-gray-400">{produto.codigo}</p>
                <h3 className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">{produto.nome}</h3>
                <div className="mt-auto pt-2 flex items-end justify-between">
                    <span className="text-lg font-bold text-primary">{money(produto.valorVenda)}</span>
                    <span className="text-xs text-gray-500">Disp: {Number(produto.estoqueDisponivel)} {produto.unidade}</span>
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
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-3 sm:p-6" onClick={onClose}>
            <div className="bg-white rounded-2xl w-full max-w-2xl my-4 shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
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
                        <p className="text-center text-gray-500 py-8">Carregando informações…</p>
                    ) : !ficha ? (
                        <p className="text-center text-gray-500 py-8">Não foi possível carregar a ficha do produto.</p>
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

                <div className="p-4 border-t border-gray-200">
                    <button onClick={onClose} className="w-full py-2.5 rounded-lg bg-primary text-white font-medium hover:opacity-90 transition-opacity">
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Catalogo;
