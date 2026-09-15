import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { MapPin, Search, Pencil, Merge, Ban, RotateCcw, Plus, X, Loader2, AlertTriangle, Inbox, CheckCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import cidadeService, { UFS, podeGerirCidades, invalidarCacheCidades } from '../../services/cidadeService';
import SelectBusca from '../../components/SelectBusca';
import CampoCidade from '../../components/CampoCidade';
import ModalNovaCidade from '../../components/ModalNovaCidade';
import { useFiltroSalvo } from '../../hooks/useFiltrosSalvos';
import { chaveBusca } from '../../utils/cidade';

// Configurações → Cidades (/config/cidades) — o cadastro oficial de cidades.
// Contrato: docs/cidades/PLANO-CADASTRO.md §4 (GET /cidades, PUT /:id, inativar/reativar,
// fundir com dryRun, pendentes). Listar/buscar sem acento, editar nome/UF, inativar,
// fundir A→B com simulação e confirmação, aba Pendências (cidades vindas do CA/IA).

const ORIGEM_LABEL = { CA_SYNC: 'Conta Azul', IA_LEAD: 'IA (WhatsApp)', CA_FORNECEDOR: 'CA · fornecedor' };

const btnPrim = 'px-4 py-2 min-h-[44px] md:min-h-0 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-1.5';
const btnSec = 'px-4 py-2 min-h-[44px] md:min-h-0 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm disabled:opacity-50 inline-flex items-center justify-center gap-1.5';
const btnGhost = 'px-4 py-2 min-h-[44px] md:min-h-0 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-full';
const btnIcone = 'p-2 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 inline-flex items-center justify-center text-gray-500 hover:text-gray-800 rounded-full hover:bg-gray-100 disabled:opacity-40';
const inputCls = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none';

const erroDe = (e, padrao) => e?.response?.data?.error || e?.response?.data?.erro || e?.response?.data?.message || padrao;

// ── Modal genérico ──
const Modal = ({ titulo, subtitulo, icone: Icone = MapPin, onFechar, children, rodape, largura = 'md:max-w-lg' }) => (
    <div className="fixed inset-0 z-[9999] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4">
        <div className={`bg-white w-full ${largura} rounded-t-2xl md:rounded-2xl shadow-xl max-h-[95vh] flex flex-col`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="bg-mint p-1.5 rounded-lg"><Icone className="h-4 w-4 text-primary" /></div>
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{titulo}</p>
                        {subtitulo && <p className="text-[11px] text-gray-500">{subtitulo}</p>}
                    </div>
                </div>
                <button type="button" onClick={onFechar} className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto">{children}</div>
            {rodape && <div className="px-4 py-3 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">{rodape}</div>}
        </div>
    </div>
);

// Plano da fusão/renomeação vindo do backend (dry-run). O formato exato é do backend —
// aqui renderiza de forma tolerante: números viram linhas, objetos viram sub-listas,
// arrays mostram a contagem; chaves com "colis"/"pendent" ganham destaque âmbar.
const ROTULO_TABELA = { clientes: 'Clientes', leads: 'Leads', fornecedores: 'Fornecedores', kitFestaBairros: 'Bairros (Kit Festa)', catalogos: 'Catálogos personalizados', metaCidades: 'Metas por cidade', Cliente: 'Clientes', Lead: 'Leads', Fornecedor: 'Fornecedores', KitFestaBairro: 'Bairros (Kit Festa)', CatalogoPersonalizado: 'Catálogos personalizados', MetaCidade: 'Metas por cidade' };
const rotulo = (k) => ROTULO_TABELA[k] || k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
// Formato real do backend (fundirCidade dry-run, ver backfillCidadesService.js `planoParaResposta`):
// { resumo: { totalLinhas, registrosQueMudam: {...} }, tabelas: [{ tabela, linhasQueMudam, variantes: [{ de, para, linhas }] }] }
const PlanoFusao = ({ plano }) => {
    if (!plano || typeof plano !== 'object') return null;
    const raiz = plano.plano && typeof plano.plano === 'object' ? plano.plano : plano;
    const tabelas = Array.isArray(raiz.tabelas) ? raiz.tabelas.filter(t => t && t.linhasQueMudam > 0) : [];
    const total = typeof raiz.resumo?.totalLinhas === 'number' ? raiz.resumo.totalLinhas : tabelas.reduce((a, t) => a + t.linhasQueMudam, 0);
    const alertas = [];
    const r = raiz.resumo;
    if (r?.metaFusoesPendentes) alertas.push(`Metas por cidade: ${r.metaFusoesPendentes} ${r.metaFusoesPendentes === 1 ? 'colisão pendente (não será somada)' : 'colisões pendentes (não serão somadas)'}`);
    if (r?.mudancasSemAprovacao) alertas.push(`${r.mudancasSemAprovacao} ${r.mudancasSemAprovacao === 1 ? 'mudança precisa de aprovação e não será aplicada' : 'mudanças precisam de aprovação e não serão aplicadas'}`);
    return (
        <div className="space-y-2">
            {total > 0 ? (
                <div className="bg-gray-50 border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {tabelas.map(t => (
                        <div key={t.tabela} className="px-3 py-2 text-sm">
                            <div className="flex items-center justify-between"><span className="text-gray-700">{rotulo(t.tabela)}</span><span className="font-semibold text-gray-900 tabular-nums">{t.linhasQueMudam}</span></div>
                            {Array.isArray(t.variantes) && t.variantes.length > 0 && (
                                <div className="mt-1 space-y-0.5">
                                    {t.variantes.map(v => (
                                        <div key={v.de} className="flex items-center gap-1.5 text-xs text-gray-500">
                                            <span className="truncate">"{v.de}"</span><ArrowRight className="h-3 w-3 shrink-0" /><span className="truncate">"{v.para}"</span>
                                            <span className="ml-auto tabular-nums shrink-0">{v.linhas} {v.linhas === 1 ? 'registro' : 'registros'}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                    <div className="flex items-center justify-between px-3 py-2 text-sm bg-white rounded-b-lg"><span className="font-semibold text-gray-900">Total de registros</span><span className="font-bold text-gray-900 tabular-nums">{total}</span></div>
                </div>
            ) : (
                <p className="text-sm text-gray-600">Nenhum registro será alterado (a cidade de origem não está em uso).</p>
            )}
            {alertas.map(a => (
                <div key={a} className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" /><span>{a}</span></div>
            ))}
            {raiz.motivo && <p className="text-xs text-gray-500">{String(raiz.motivo)}</p>}
        </div>
    );
};

const BadgeOrigem = ({ origem }) => (
    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">{ORIGEM_LABEL[origem] || origem || 'Automático'}</span>
);

const Cidades = () => {
    const { user } = useAuth();
    const podeGerir = podeGerirCidades(user?.permissoes);

    const [aba, setAba] = useFiltroSalvo('config-cidades:aba', 'cadastro');
    const [mostrarInativas, setMostrarInativas] = useFiltroSalvo('config-cidades:inativas', false);
    const [busca, setBusca] = useState(''); // busca livre: NÃO persiste
    const [cidades, setCidades] = useState([]);
    const [pendentes, setPendentes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingPend, setLoadingPend] = useState(false);
    const [erroLista, setErroLista] = useState('');

    // modais
    const [novaAberto, setNovaAberto] = useState(false);
    const [editando, setEditando] = useState(null);   // cidade
    const [fusao, setFusao] = useState(null);         // { origemId, destinoId, plano, simulando, aplicando }
    const [pendCadastro, setPendCadastro] = useState(null); // pendência → ModalNovaCidade
    const [pendApontar, setPendApontar] = useState(null);   // { pend, nome }
    const [ocupado, setOcupado] = useState(null);      // id em ação (inativar/reativar)

    const carregar = async () => {
        setLoading(true); setErroLista('');
        try {
            const d = await cidadeService.listar({ incluirInativas: true });
            const lista = Array.isArray(d?.detalhe) && d.detalhe.length
                ? d.detalhe.map(x => ({ id: x.id || null, nome: x.cidade, uf: x.uf || null, registros: x.registros ?? 0, ativo: x.ativo !== false, fundidaEmId: x.fundidaEmId || null }))
                : (d?.cidades || []).map(c => ({ id: null, nome: c, uf: null, registros: 0, ativo: true }));
            setCidades(lista);
        } catch (e) {
            setErroLista(erroDe(e, 'Não foi possível carregar as cidades.'));
        } finally { setLoading(false); }
    };
    const carregarPendentes = async () => {
        setLoadingPend(true);
        try { setPendentes(await cidadeService.pendentes()); }
        catch (e) { if (e?.response?.status !== 404) toast.error(erroDe(e, 'Não foi possível carregar as pendências.')); setPendentes([]); }
        finally { setLoadingPend(false); }
    };
    useEffect(() => { carregar(); carregarPendentes(); }, []);

    const filtradas = useMemo(() => {
        const q = chaveBusca(busca);
        return cidades
            .filter(c => mostrarInativas || c.ativo)
            .filter(c => !q || q.split(' ').every(t => chaveBusca(`${c.nome} ${c.uf || ''}`).includes(t)))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }, [cidades, busca, mostrarInativas]);

    const ativas = useMemo(() => cidades.filter(c => c.ativo && c.id), [cidades]);
    const porId = (id) => cidades.find(c => c.id === id);
    const idPorNome = (nome) => cidades.find(c => chaveBusca(c.nome) === chaveBusca(nome))?.id || null;
    const semId = cidades.length > 0 && !cidades.some(c => c.id);

    // ── ações ──
    const inativar = async (c) => {
        if (!window.confirm(`Inativar "${c.nome}"? Ela some das listas. Se estiver em uso, o sistema vai recusar — funda em outra cidade antes.`)) return;
        setOcupado(c.id);
        try { await cidadeService.inativar(c.id); toast.success(`"${c.nome}" inativada.`); await carregar(); }
        catch (e) { toast.error(erroDe(e, 'Não foi possível inativar. Se a cidade está em uso, funda em outra antes.'), { duration: 6000 }); }
        finally { setOcupado(null); }
    };
    const reativar = async (c) => {
        setOcupado(c.id);
        try { await cidadeService.reativar(c.id); toast.success(`"${c.nome}" reativada.`); await carregar(); }
        catch (e) { toast.error(erroDe(e, 'Não foi possível reativar.')); }
        finally { setOcupado(null); }
    };

    const simularFusao = async () => {
        if (!fusao?.origemId || !fusao?.destinoId) return;
        if (fusao.origemId === fusao.destinoId) { toast.error('Origem e destino são a mesma cidade.'); return; }
        setFusao(f => ({ ...f, simulando: true, plano: null }));
        try {
            const plano = await cidadeService.fundir(fusao.origemId, fusao.destinoId, true);
            setFusao(f => ({ ...f, plano, simulando: false }));
        } catch (e) { toast.error(erroDe(e, 'Não foi possível simular a fusão.')); setFusao(f => ({ ...f, simulando: false })); }
    };
    const aplicarFusao = async () => {
        const de = porId(fusao.origemId), para = porId(fusao.destinoId);
        if (!window.confirm(`Fundir "${de?.nome}" em "${para?.nome}"?\n\nTodos os registros com "${de?.nome}" passam a "${para?.nome}" e a cidade de origem fica inativa. Um arquivo de reversão é gravado antes.`)) return;
        setFusao(f => ({ ...f, aplicando: true }));
        try {
            const r = await cidadeService.fundir(fusao.origemId, fusao.destinoId, false);
            const snap = r?.snapshot || r?.arquivo || r?.snapshotArquivo;
            toast.success(`Fusão concluída${snap ? ` · reversão: ${snap}` : ''}.`, { duration: 8000 });
            setFusao(null);
            invalidarCacheCidades();
            await carregar();
        } catch (e) { toast.error(erroDe(e, 'A fusão falhou. Nada foi alterado.'), { duration: 6000 }); setFusao(f => ({ ...f, aplicando: false })); }
    };

    const resolverPendencia = async (pend, corpo) => {
        try {
            await cidadeService.resolverPendente(pend.id, corpo);
            toast.success(`"${pend.nomeBruto || pend.nomeGravado}" resolvida.`);
            setPendCadastro(null); setPendApontar(null);
            await Promise.all([carregarPendentes(), carregar()]);
        } catch (e) { toast.error(erroDe(e, 'Não foi possível resolver a pendência.'), { duration: 6000 }); }
    };

    const nPend = pendentes.length;

    return (
        <div className="max-w-full overflow-x-hidden -mx-4 sm:-mx-6 lg:-mx-8">
            {/* Topbar */}
            <div className="flex items-center justify-between gap-2 p-3 md:p-6 bg-white border-b border-gray-200">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="bg-mint p-1.5 md:p-2 rounded-lg"><MapPin className="h-4 w-4 md:h-5 md:w-5 text-primary" /></div>
                    <div className="min-w-0">
                        <h1 className="text-base md:text-2xl font-bold text-gray-900">Cidades</h1>
                        <p className="hidden md:block text-sm text-gray-600">Lista oficial usada em todos os campos Cidade do app</p>
                    </div>
                </div>
                {podeGerir && (
                    <button type="button" onClick={() => setNovaAberto(true)} className="px-3 py-1.5 md:px-4 md:py-2 min-h-[44px] md:min-h-0 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm text-xs md:text-sm font-semibold inline-flex items-center gap-1.5">
                        <Plus className="h-4 w-4" /> Nova cidade
                    </button>
                )}
            </div>

            <div className="p-3 md:p-6 space-y-4">
                {/* Abas em pílula */}
                <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                    {[['cadastro', 'Cadastro'], ['pendencias', `Pendências${nPend ? ` (${nPend})` : ''}`]].map(([k, l]) => (
                        <button key={k} type="button" onClick={() => setAba(k)}
                            className={`px-4 py-2 min-h-[44px] md:min-h-0 rounded-full text-sm font-semibold whitespace-nowrap border ${aba === k ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
                            {l}
                        </button>
                    ))}
                </div>

                {aba === 'cadastro' && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex flex-col md:flex-row md:items-center gap-2 px-3 md:px-5 py-3 border-b border-gray-100">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cidade (sem acento também acha)…" className={`${inputCls} pl-9 min-h-[44px] md:min-h-0`} />
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-700 min-h-[44px] md:min-h-0 px-1">
                                <input type="checkbox" checked={!!mostrarInativas} onChange={e => setMostrarInativas(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
                                Mostrar inativas
                            </label>
                            {podeGerir && (
                                <button type="button" onClick={() => setFusao({ origemId: '', destinoId: '', plano: null })} disabled={semId} className={btnSec}>
                                    <Merge className="h-4 w-4" /> Fundir cidades
                                </button>
                            )}
                        </div>

                        {loading ? (
                            <div className="p-8 text-center text-gray-500 text-sm"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Carregando…</div>
                        ) : erroLista ? (
                            <div className="p-6 text-center">
                                <p className="text-sm text-red-700 mb-3">{erroLista}</p>
                                <button type="button" onClick={carregar} className={btnSec}><RotateCcw className="h-4 w-4" /> Tentar de novo</button>
                            </div>
                        ) : filtradas.length === 0 ? (
                            <div className="p-8 text-center text-sm text-gray-500">
                                <Inbox className="h-6 w-6 mx-auto mb-2 text-gray-400" />
                                {busca ? `Nenhuma cidade com "${busca}".` : 'Nenhuma cidade cadastrada ainda.'}
                            </div>
                        ) : (
                            <>
                                {semId && (
                                    <div className="mx-3 md:mx-5 mt-3 flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                                        <AlertTriangle className="h-4 w-4 shrink-0" />
                                        <span>O servidor ainda devolve a lista antiga (sem cadastro). Editar, inativar e fundir ficam disponíveis depois que o backend novo for publicado e a semente rodar.</span>
                                    </div>
                                )}
                                {/* Mobile: cards */}
                                <div className="md:hidden divide-y divide-gray-100">
                                    {filtradas.map(c => (
                                        <div key={c.id || c.nome} className="p-3">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="font-semibold text-gray-900 truncate">{c.nome}{c.uf ? <span className="text-gray-500 font-normal"> · {c.uf}</span> : null}</p>
                                                    <p className="text-xs text-gray-500 mt-0.5">{c.registros != null ? `${c.registros} ${c.registros === 1 ? 'registro' : 'registros'}` : '—'}{!c.uf && c.id ? ' · sem UF' : ''}</p>
                                                </div>
                                                <span className={`px-2 py-1 text-xs font-semibold rounded-full shrink-0 ${c.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>{c.ativo ? 'Ativa' : 'Inativa'}</span>
                                            </div>
                                            {podeGerir && c.id && (
                                                <div className="flex gap-1 mt-2 -ml-1">
                                                    <button type="button" onClick={() => setEditando(c)} className={btnIcone} title="Editar"><Pencil className="h-4 w-4" /></button>
                                                    {c.ativo && <button type="button" onClick={() => setFusao({ origemId: c.id, destinoId: '', plano: null })} className={btnIcone} title="Fundir em outra"><Merge className="h-4 w-4" /></button>}
                                                    {c.ativo
                                                        ? <button type="button" onClick={() => inativar(c)} disabled={ocupado === c.id} className={btnIcone} title="Inativar"><Ban className="h-4 w-4" /></button>
                                                        : <button type="button" onClick={() => reativar(c)} disabled={ocupado === c.id} className={btnIcone} title="Reativar"><RotateCcw className="h-4 w-4" /></button>}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                {/* Desktop: tabela */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cidade</th>
                                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">UF</th>
                                                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Registros</th>
                                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                                                {podeGerir && <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>}
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                            {filtradas.map(c => (
                                                <tr key={c.id || c.nome} className="hover:bg-gray-50">
                                                    <td className="px-5 py-3 text-gray-900 font-medium">{c.nome}</td>
                                                    <td className="px-5 py-3 text-gray-700">{c.uf || <span className="text-amber-700 text-xs">sem UF</span>}</td>
                                                    <td className="px-5 py-3 text-right text-gray-700 tabular-nums">{c.registros ?? '—'}</td>
                                                    <td className="px-5 py-3"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${c.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>{c.ativo ? 'Ativa' : 'Inativa'}</span></td>
                                                    {podeGerir && (
                                                        <td className="px-5 py-3 text-right whitespace-nowrap">
                                                            {c.id && (<>
                                                                <button type="button" onClick={() => setEditando(c)} className={btnIcone} title="Editar nome/UF"><Pencil className="h-4 w-4" /></button>
                                                                {c.ativo && <button type="button" onClick={() => setFusao({ origemId: c.id, destinoId: '', plano: null })} className={btnIcone} title="Fundir em outra cidade"><Merge className="h-4 w-4" /></button>}
                                                                {c.ativo
                                                                    ? <button type="button" onClick={() => inativar(c)} disabled={ocupado === c.id} className={btnIcone} title="Inativar"><Ban className="h-4 w-4" /></button>
                                                                    : <button type="button" onClick={() => reativar(c)} disabled={ocupado === c.id} className={btnIcone} title="Reativar"><RotateCcw className="h-4 w-4" /></button>}
                                                            </>)}
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="px-3 md:px-5 py-2 border-t border-gray-100 text-xs text-gray-500">{filtradas.length} {filtradas.length === 1 ? 'cidade' : 'cidades'}</div>
                            </>
                        )}
                    </div>
                )}

                {aba === 'pendencias' && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Cidades que chegaram sozinhas</span>
                        </div>
                        <div className="px-3 md:px-5 pt-3 text-sm text-gray-600">
                            Vieram da Conta Azul ou da IA do WhatsApp com um nome que não está no cadastro. O registro de origem já foi gravado; aqui você decide: <b>cadastrar</b> a cidade ou <b>apontar</b> para uma que já existe (o sistema reescreve os registros).
                        </div>
                        {loadingPend ? (
                            <div className="p-8 text-center text-gray-500 text-sm"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Carregando…</div>
                        ) : pendentes.length === 0 ? (
                            <div className="p-8 text-center text-sm text-gray-500"><CheckCircle className="h-6 w-6 mx-auto mb-2 text-green-500" />Nenhuma pendência. Tudo em dia.</div>
                        ) : (
                            <div className="p-3 md:p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                                {pendentes.map(p => (
                                    <div key={p.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                                        <div className="flex items-start justify-between gap-2 mb-1">
                                            <div className="min-w-0">
                                                <p className="font-semibold text-gray-900 truncate">{p.nomeBruto || p.nomeGravado}{p.uf ? <span className="text-gray-500 font-normal"> · {p.uf}</span> : null}</p>
                                                {p.nomeGravado && p.nomeGravado !== p.nomeBruto && <p className="text-xs text-gray-500">gravada como "{p.nomeGravado}"</p>}
                                            </div>
                                            <BadgeOrigem origem={p.origem} />
                                        </div>
                                        <p className="text-xs text-gray-500 mb-3">
                                            {p.ocorrencias != null ? `${p.ocorrencias} ${p.ocorrencias === 1 ? 'ocorrência' : 'ocorrências'}` : ''}
                                            {p.exemplo ? ` · ex.: ${p.exemplo}` : ''}
                                        </p>
                                        {podeGerir && (
                                            <div className="flex flex-col sm:flex-row gap-2">
                                                <button type="button" onClick={() => setPendCadastro(p)} className={btnPrim}><Plus className="h-4 w-4" /> Cadastrar</button>
                                                <button type="button" onClick={() => setPendApontar({ pend: p, nome: '' })} className={btnSec}><ArrowRight className="h-4 w-4" /> Apontar para…</button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Nova cidade (cadastro direto) */}
            <ModalNovaCidade aberto={novaAberto} nomeInicial="" ufInicial="SC"
                onCriada={(c) => { toast.success(`"${c.nome}" cadastrada.`); carregar(); }}
                onFechar={() => setNovaAberto(false)} />

            {/* Pendência → cadastrar (cria e já resolve a pendência apontando para a criada) */}
            <ModalNovaCidade aberto={!!pendCadastro} nomeInicial={pendCadastro?.nomeGravado || pendCadastro?.nomeBruto || ''} ufInicial={pendCadastro?.uf || 'SC'}
                onCriada={(c) => { const pend = pendCadastro; if (pend) resolverPendencia(pend, c.id ? { cidadeId: c.id } : { criar: { nome: c.nome, uf: c.uf } }); }}
                onFechar={() => setPendCadastro(null)} />

            {/* Pendência → apontar para existente */}
            {pendApontar && (
                <Modal titulo="Apontar para uma cidade" subtitulo={`"${pendApontar.pend.nomeBruto || pendApontar.pend.nomeGravado}" vira…`} icone={ArrowRight} onFechar={() => setPendApontar(null)}
                    rodape={<>
                        <button type="button" onClick={() => setPendApontar(null)} className={btnGhost}>Cancelar</button>
                        <button type="button" disabled={!pendApontar.nome || !idPorNome(pendApontar.nome)} onClick={() => resolverPendencia(pendApontar.pend, { cidadeId: idPorNome(pendApontar.nome) })} className={btnPrim}>Apontar e reescrever</button>
                    </>}>
                    <p className="text-sm text-gray-600">Os registros gravados com "{pendApontar.pend.nomeGravado || pendApontar.pend.nomeBruto}" passam a usar a cidade escolhida (com arquivo de reversão).</p>
                    <CampoCidade value={pendApontar.nome} onChange={(v) => setPendApontar(a => ({ ...a, nome: v }))} ufSugerida={pendApontar.pend.uf || 'SC'} />
                </Modal>
            )}

            {/* Editar nome/UF */}
            {editando && <ModalEditarCidade cidade={editando} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); carregar(); }} />}

            {/* Fundir A → B */}
            {fusao && (
                <Modal titulo="Fundir cidades" subtitulo="Tudo que está na origem passa para o destino; a origem fica inativa" icone={Merge} onFechar={() => !fusao.aplicando && setFusao(null)}
                    rodape={<>
                        <button type="button" onClick={() => setFusao(null)} disabled={fusao.aplicando} className={btnGhost}>Cancelar</button>
                        {!fusao.plano
                            ? <button type="button" onClick={simularFusao} disabled={!fusao.origemId || !fusao.destinoId || fusao.simulando} className={btnPrim}>{fusao.simulando && <Loader2 className="h-4 w-4 animate-spin" />} Simular</button>
                            : <button type="button" onClick={aplicarFusao} disabled={fusao.aplicando} className="px-4 py-2 min-h-[44px] md:min-h-0 bg-red-600 hover:bg-red-700 text-white rounded-full font-semibold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-1.5">{fusao.aplicando && <Loader2 className="h-4 w-4 animate-spin" />} Fundir agora</button>}
                    </>}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Origem (some)</label>
                            <SelectBusca value={fusao.origemId} onChange={e => setFusao(f => ({ ...f, origemId: e.target.value, plano: null }))} className="w-full">
                                <option value="">Escolha…</option>
                                {ativas.map(c => <option key={c.id} value={c.id}>{c.nome}{c.uf ? ` · ${c.uf}` : ''}{c.registros ? ` (${c.registros})` : ''}</option>)}
                            </SelectBusca>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Destino (fica)</label>
                            <SelectBusca value={fusao.destinoId} onChange={e => setFusao(f => ({ ...f, destinoId: e.target.value, plano: null }))} className="w-full">
                                <option value="">Escolha…</option>
                                {ativas.filter(c => c.id !== fusao.origemId).map(c => <option key={c.id} value={c.id}>{c.nome}{c.uf ? ` · ${c.uf}` : ''}{c.registros ? ` (${c.registros})` : ''}</option>)}
                            </SelectBusca>
                        </div>
                    </div>
                    {fusao.origemId && fusao.destinoId && (
                        <p className="text-sm text-gray-700 flex items-center gap-2 flex-wrap"><b>{porId(fusao.origemId)?.nome}</b> <ArrowRight className="h-4 w-4 text-gray-400" /> <b>{porId(fusao.destinoId)?.nome}</b></p>
                    )}
                    {fusao.plano && (
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Simulação — o que vai mudar</p>
                            <PlanoFusao plano={fusao.plano} />
                            <p className="text-xs text-gray-500 mt-2">Nada foi gravado ainda. Confira e clique em <b>Fundir agora</b> para aplicar (um arquivo de reversão é gravado antes).</p>
                        </div>
                    )}
                </Modal>
            )}
        </div>
    );
};

// ── Editar nome/UF ──
const ModalEditarCidade = ({ cidade, onFechar, onSalvo }) => {
    const [nome, setNome] = useState(cidade.nome || '');
    const [uf, setUf] = useState(cidade.uf || '');
    const [salvando, setSalvando] = useState(false);
    const renomeia = nome.trim() !== cidade.nome;
    const salvar = async () => {
        if (!nome.trim()) { toast.error('Informe o nome.'); return; }
        if (renomeia && cidade.registros > 0 && !window.confirm(`Renomear "${cidade.nome}" para "${nome.trim()}" reescreve ${cidade.registros} ${cidade.registros === 1 ? 'registro' : 'registros'} (clientes, leads, metas…). Um arquivo de reversão é gravado antes. Continuar?`)) return;
        setSalvando(true);
        try {
            const dados = {};
            if (renomeia) dados.nome = nome.trim();
            if ((uf || '') !== (cidade.uf || '')) dados.uf = uf || null;
            if (!Object.keys(dados).length) { onFechar(); return; }
            await cidadeService.editar(cidade.id, dados);
            toast.success('Cidade atualizada.');
            onSalvo();
        } catch (e) {
            const d = e.response?.data;
            if (d?.codigo === 'CIDADE_JA_EXISTE') toast.error(`Já existe "${d.cidade?.nome || nome}". Use "Fundir" para juntar as duas.`, { duration: 6000 });
            else toast.error(erroDe(e, 'Não foi possível salvar.'), { duration: 6000 });
        } finally { setSalvando(false); }
    };
    return (
        <Modal titulo="Editar cidade" subtitulo={cidade.nome} icone={Pencil} onFechar={onFechar}
            rodape={<>
                <button type="button" onClick={onFechar} className={btnGhost}>Cancelar</button>
                <button type="button" onClick={salvar} disabled={salvando} className={btnPrim}>{salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar</button>
            </>}>
            <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                    <input value={nome} onChange={e => setNome(e.target.value)} className={`${inputCls} min-h-[44px] md:min-h-0`} />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">UF</label>
                    <SelectBusca value={uf} onChange={e => setUf(e.target.value)} className="w-full">
                        <option value="">—</option>
                        {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                    </SelectBusca>
                </div>
            </div>
            {renomeia && cidade.registros > 0 && (
                <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Renomear reescreve <b>{cidade.registros}</b> {cidade.registros === 1 ? 'registro' : 'registros'} em todas as tabelas. Se a intenção é juntar com outra cidade que já existe, use <b>Fundir</b>.</span>
                </div>
            )}
        </Modal>
    );
};

export default Cidades;
