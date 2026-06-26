import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import produtoService from '../../../services/produtoService';
import produtoServiceFront from '../../../services/produtoService';
import configService from '../../../services/configService';
import promocaoService from '../../../services/promocaoService';
import { API_URL } from '../../../services/api';
import categoriaProdutoService from '../../../services/categoriaProdutoService';
import toast from 'react-hot-toast';
import {
    ArrowLeft, Loader, AlertCircle, Camera, Tag, Plus, X,
    CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Trash2, Search, Save, Sparkles,
    Star, ArrowUp, ArrowDown, Upload
} from 'lucide-react';

// Componente autocomplete de produto por nome
const BuscaProduto = ({ value, onChange, todosOsProdutos }) => {
    const [busca, setBusca] = useState('');
    const [aberto, setAberto] = useState(false);
    const [nomeSelecionado, setNomeSelecionado] = useState('');
    const ref = useRef(null);

    // Preencher nome quando um ID já existe (edição)
    useEffect(() => {
        if (value && todosOsProdutos.length > 0) {
            const prod = todosOsProdutos.find(p => p.id === value);
            if (prod && !nomeSelecionado) setNomeSelecionado(prod.nome);
        }
    }, [value, todosOsProdutos]);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtrados = busca.length >= 2
        ? todosOsProdutos.filter(p => p.nome.toLowerCase().includes(busca.toLowerCase())).slice(0, 8)
        : [];

    const selecionar = (prod) => {
        setNomeSelecionado(prod.nome);
        setBusca('');
        setAberto(false);
        onChange(prod.id);
    };

    return (
        <div className="relative flex-1" ref={ref}>
            {nomeSelecionado && !aberto ? (
                <div className="flex items-center gap-1">
                    <span className="flex-1 text-xs border border-green-300 rounded px-2 py-1 bg-green-50 text-green-800 truncate">{nomeSelecionado}</span>
                    <button onClick={() => { setNomeSelecionado(''); onChange(''); setAberto(true); }} className="text-gray-400 hover:text-red-500">
                        <X className="h-3 w-3" />
                    </button>
                </div>
            ) : (
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                    <input
                        type="text"
                        value={busca}
                        onChange={e => { setBusca(e.target.value); setAberto(true); }}
                        onFocus={() => setAberto(true)}
                        placeholder="Buscar produto..."
                        className="w-full text-xs border border-gray-300 rounded pl-6 pr-2 py-1 bg-white text-gray-900"
                    />
                    {aberto && filtrados.length > 0 && (
                        <ul className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded shadow-lg max-h-40 overflow-y-auto">
                            {filtrados.map(p => (
                                <li key={p.id}
                                    onMouseDown={() => selecionar(p)}
                                    className="px-2 py-1.5 text-xs hover:bg-blue-50 cursor-pointer truncate">
                                    <span className="font-medium text-gray-800">{p.nome}</span>
                                    <span className="ml-2 text-gray-400">#{p.codigo}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {aberto && busca.length >= 2 && filtrados.length === 0 && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded shadow p-2 text-xs text-gray-400">Nenhum produto encontrado</div>
                    )}
                </div>
            )}
        </div>
    );
};

// -------------------------------------------------------
// Helper: campo informativo compacto (read-only)
// -------------------------------------------------------
const InfoField = ({ label, value }) => (
    <div>
        <div className="text-xs text-gray-400">{label}</div>
        <div className="text-sm font-medium text-gray-800 truncate" title={String(value ?? '')}>{value || '—'}</div>
    </div>
);

// -------------------------------------------------------
// Sub-componente: Seção de Promoções
// -------------------------------------------------------
const SecaoPromocoes = ({ produtoId, valorVendaBase }) => {
    const [tab, setTab] = useState('atual'); // 'atual' | 'nova' | 'historico'
    const [promocoes, setPromocoes] = useState([]);
    const [promoAtiva, setPromoAtiva] = useState(null);
    const [loadingPromo, setLoadingPromo] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');
    const [sucesso, setSucesso] = useState('');
    const [confirmEncerrar, setConfirmEncerrar] = useState(false);

    // Rascunho de nova promoção
    const DRAFT_KEY = `@CAHardt:PromoRascunho_${produtoId}`;
    const carregarRascunho = () => {
        try {
            const raw = localStorage.getItem(DRAFT_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    };

    const draft = carregarRascunho();

    // Form nova promoção
    const [novaPromo, setNovaPromoState] = useState(draft?.novaPromo || {
        nome: '',
        tipo: 'SIMPLES',
        precoPromocional: '',
        dataInicio: '',
        dataFim: '',
    });

    // Grupos de condições (para tipo CONDICIONAL)
    const [grupos, setGruposState] = useState(draft?.grupos || [{ id: Date.now(), condicoes: [] }]);

    // Lista de todos os produtos para autocomplete
    const [todosOsProdutos, setTodosOsProdutos] = useState([]);

    // Proxy setters que também salvam no localStorage
    const setNovaPromo = (updater) => {
        setNovaPromoState(prev => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ novaPromo: next, grupos })); } catch { }
            return next;
        });
    };
    const setGrupos = (updater) => {
        setGruposState(prev => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ novaPromo, grupos: next })); } catch { }
            return next;
        });
    };

    const carregarPromocoes = useCallback(async () => {
        setLoadingPromo(true);
        setErro('');
        try {
            const hist = await promocaoService.listarPorProduto(produtoId);
            setPromocoes(hist || []);
            // Promo ativa = qualquer uma com status ATIVA (inclui futuras/agendadas)
            const ativa = (hist || []).find(p => p.status === 'ATIVA') || null;
            setPromoAtiva(ativa);
        } catch (e) {
            setErro('Erro ao carregar promoções.');
        } finally {
            setLoadingPromo(false);
        }
    }, [produtoId]);

    // Carregar produtos para autocomplete (busca em lote, lazy)
    useEffect(() => {
        produtoService.listar({ limit: 1000, ativo: true })
            .then(r => setTodosOsProdutos(r.data || r || []))
            .catch(() => { });
    }, []);

    useEffect(() => {
        carregarPromocoes();
    }, [carregarPromocoes]);

    const handleEncerrar = async () => {
        setSalvando(true);
        setErro(''); setSucesso('');
        try {
            await promocaoService.encerrar(promoAtiva.id);
            setSucesso('Promoção encerrada com sucesso.');
            setConfirmEncerrar(false);
            await carregarPromocoes();
        } catch (e) {
            setErro(e.response?.data?.error || 'Erro ao encerrar promoção.');
        } finally {
            setSalvando(false);
        }
    };

    const adicionarGrupo = () => setGrupos(g => [...g, { id: Date.now(), condicoes: [] }]);
    const removerGrupo = (gid) => setGrupos(g => g.filter(g2 => g2.id !== gid));
    const adicionarCondicao = (gid, tipo) => {
        setGrupos(g => g.map(gr => gr.id === gid
            ? { ...gr, condicoes: [...gr.condicoes, { id: Date.now(), tipo, produtoId: '', quantidadeMinima: '', valorMinimo: '' }] }
            : gr
        ));
    };
    const removerCondicao = (gid, cid) => {
        setGrupos(g => g.map(gr => gr.id === gid
            ? { ...gr, condicoes: gr.condicoes.filter(c => c.id !== cid) }
            : gr
        ));
    };
    const atualizarCondicao = (gid, cid, campo, valor) => {
        setGrupos(g => g.map(gr => gr.id === gid
            ? { ...gr, condicoes: gr.condicoes.map(c => c.id === cid ? { ...c, [campo]: valor } : c) }
            : gr
        ));
    };

    const handleCriar = async () => {
        setErro(''); setSucesso('');
        if (!novaPromo.nome || !novaPromo.precoPromocional || !novaPromo.dataInicio || !novaPromo.dataFim) {
            setErro('Preencha: Nome, Preço Promocional, Data Início e Data Fim.');
            return;
        }
        // Validação condicional
        if (novaPromo.tipo === 'CONDICIONAL') {
            const semCondicao = grupos.some(g => g.condicoes.length === 0);
            if (semCondicao) { setErro('Cada grupo deve ter pelo menos 1 condição.'); return; }
        }
        setSalvando(true);
        try {
            const payload = {
                produtoId,
                ...novaPromo,
                precoPromocional: parseFloat(novaPromo.precoPromocional),
                grupos: novaPromo.tipo === 'CONDICIONAL' ? grupos.map(g => ({
                    condicoes: g.condicoes.map(c => ({
                        tipo: c.tipo,
                        produtoId: c.tipo === 'PRODUTO_QUANTIDADE' ? c.produtoId : undefined,
                        quantidadeMinima: c.tipo === 'PRODUTO_QUANTIDADE' ? parseFloat(c.quantidadeMinima) : undefined,
                        valorMinimo: c.tipo === 'VALOR_TOTAL' ? parseFloat(c.valorMinimo) : undefined
                    }))
                })) : []
            };
            await promocaoService.criar(payload);
            setSucesso('Promoção criada com sucesso!');
            const resetPromo = { nome: '', tipo: 'SIMPLES', precoPromocional: '', dataInicio: '', dataFim: '' };
            const resetGrupos = [{ id: Date.now(), condicoes: [] }];
            setNovaPromoState(resetPromo);
            setGruposState(resetGrupos);
            try { localStorage.removeItem(DRAFT_KEY); } catch { }
            setTab('atual');
            await carregarPromocoes();
        } catch (e) {
            setErro(e.response?.data?.error || 'Erro ao criar promoção.');
        } finally {
            setSalvando(false);
        }
    };

    const formatData = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '-';

    if (loadingPromo) return <div className="flex justify-center py-8"><Loader className="animate-spin h-6 w-6 text-primary" /></div>;

    return (
        <div>
            {/* Feedback */}
            {erro && <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4" />{erro}</div>}
            {sucesso && <div className="mb-3 bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded text-sm flex items-center gap-2"><CheckCircle className="h-4 w-4" />{sucesso}</div>}

            {/* Abas */}
            <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
                {[
                    { key: 'atual', label: 'Promoção Atual' },
                    !promoAtiva ? { key: 'nova', label: '+ Nova Promoção' } : null,
                    { key: 'historico', label: `Histórico (${promocoes.length})` }
                ].filter(Boolean).map(({ key, label }) => (
                    <button key={key} onClick={() => setTab(key)}
                        className={`flex-1 text-sm py-1.5 px-2 rounded font-medium transition-colors ${tab === key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {/* === ABA ATUAL === */}
            {tab === 'atual' && (
                promoAtiva ? (
                    <div>
                        <div className={`rounded-lg border-2 p-4 ${promoAtiva.status === 'ATIVA' ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-gray-50'}`}>
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <Tag className="h-4 w-4 text-green-600" />
                                        <span className="font-bold text-gray-900">{promoAtiva.nome}</span>
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${promoAtiva.tipo === 'SIMPLES' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                            {promoAtiva.tipo}
                                        </span>
                                    </div>
                                    <div className="mt-2 grid grid-cols-2 gap-3">
                                        <div>
                                            <p className="text-xs text-gray-500">Preço Promocional</p>
                                            <p className="text-xl font-bold text-green-700">R$ {Number(promoAtiva.precoPromocional).toFixed(2)}</p>
                                            {valorVendaBase && (
                                                <p className="text-xs text-gray-400 line-through">R$ {Number(valorVendaBase).toFixed(2)} tabela normal</p>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500">Período</p>
                                            <p className="text-sm font-medium">{formatData(promoAtiva.dataInicio)} → {formatData(promoAtiva.dataFim)}</p>
                                            <p className="text-xs text-gray-400">Criado por: {promoAtiva.criadoPorNome || promoAtiva.criadoPor}</p>
                                        </div>
                                    </div>
                                    {promoAtiva.tipo === 'CONDICIONAL' && promoAtiva.grupos?.length > 0 && (
                                        <div className="mt-3">
                                            <p className="text-xs font-semibold text-gray-600 mb-1">Condições (OU entre grupos / E dentro do grupo):</p>
                                            {promoAtiva.grupos.map((g, gi) => (
                                                <div key={g.id} className="text-xs bg-white border rounded p-2 mb-1">
                                                    <span className="font-medium text-purple-700">Grupo {gi + 1}: </span>
                                                    {g.condicoes.map((c, ci) => {
                                                        const nomeProd = todosOsProdutos.find(p => p.id === c.produtoId)?.nome || c.produtoId;
                                                        return (
                                                            <span key={c.id} className={ci > 0 ? 'ml-1' : ''}>
                                                                {ci > 0 && <span className="text-gray-400"> E </span>}
                                                                {c.tipo === 'PRODUTO_QUANTIDADE'
                                                                    ? <span><span className="font-semibold text-gray-700">{nomeProd}</span> ≥ <span className="font-bold">{c.quantidadeMinima}</span> un</span>
                                                                    : <span>Total do pedido ≥ <span className="font-bold">R$ {c.valorMinimo}</span></span>}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Botão de Encerrar */}
                        {!confirmEncerrar ? (
                            <button onClick={() => setConfirmEncerrar(true)}
                                className="mt-4 w-full py-2 px-4 bg-red-50 border border-red-300 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors flex items-center justify-center gap-2">
                                <XCircle className="h-4 w-4" /> Encerrar Promoção
                            </button>
                        ) : (
                            <div className="mt-4 bg-red-50 border border-red-300 rounded-lg p-4">
                                <p className="text-sm text-red-700 font-medium mb-3">⚠️ Confirmar encerramento? Esta ação não pode ser desfeita. Para ajustar valores, você deve criar uma nova promoção após encerrar.</p>
                                <div className="flex gap-2">
                                    <button onClick={handleEncerrar} disabled={salvando}
                                        className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                                        {salvando ? 'Encerrando...' : 'Sim, Encerrar'}
                                    </button>
                                    <button onClick={() => setConfirmEncerrar(false)}
                                        className="flex-1 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm">
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-8 text-gray-500">
                        <Tag className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                        <p className="font-medium">Nenhuma promoção ativa</p>
                        <p className="text-sm mt-1">Clique em "+ Nova Promoção" para criar.</p>
                    </div>
                )
            )}

            {/* === ABA NOVA PROMOÇÃO === */}
            {tab === 'nova' && (
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Promoção <span className="text-red-500">*</span></label>
                        <input type="text" value={novaPromo.nome}
                            onChange={e => setNovaPromo(p => ({ ...p, nome: e.target.value }))}
                            placeholder="Ex: Promo Julho 2025"
                            className="w-full rounded-md border border-gray-300 shadow-sm py-2 px-3 bg-white text-gray-900 focus:ring-primary focus:border-primary" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                            <select value={novaPromo.tipo}
                                onChange={e => setNovaPromo(p => ({ ...p, tipo: e.target.value }))}
                                className="w-full rounded-md border border-gray-300 py-2 px-3 bg-white text-gray-900 focus:ring-primary focus:border-primary">
                                <option value="SIMPLES">Simples (por período)</option>
                                <option value="CONDICIONAL">Condicional (SE / OU)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Preço Promocional (R$) <span className="text-red-500">*</span></label>
                            <input type="number" step="0.01" min="0" value={novaPromo.precoPromocional}
                                onChange={e => setNovaPromo(p => ({ ...p, precoPromocional: e.target.value }))}
                                placeholder="0,00"
                                className="w-full rounded-md border border-gray-300 py-2 px-3 bg-white text-gray-900 focus:ring-primary focus:border-primary" />
                            {valorVendaBase && <p className="text-xs text-gray-400 mt-0.5">Tabela normal: R$ {Number(valorVendaBase).toFixed(2)}</p>}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Data Início <span className="text-red-500">*</span></label>
                            <input type="date" value={novaPromo.dataInicio}
                                onChange={e => setNovaPromo(p => ({ ...p, dataInicio: e.target.value }))}
                                className="w-full rounded-md border border-gray-300 py-2 px-3 bg-white text-gray-900 focus:ring-primary focus:border-primary" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Data Fim <span className="text-red-500">*</span></label>
                            <input type="date" value={novaPromo.dataFim}
                                onChange={e => setNovaPromo(p => ({ ...p, dataFim: e.target.value }))}
                                className="w-full rounded-md border border-gray-300 py-2 px-3 bg-white text-gray-900 focus:ring-primary focus:border-primary" />
                        </div>
                    </div>

                    {/* Grupos de condições (tipo CONDICIONAL) */}
                    {novaPromo.tipo === 'CONDICIONAL' && (
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <p className="text-sm font-semibold text-gray-700">Grupos de Condições (OU entre grupos, E dentro do grupo)</p>
                                <button onClick={adicionarGrupo}
                                    className="text-xs text-primary bg-primary/10 px-2 py-1 rounded hover:bg-primary/20 transition-colors flex items-center gap-1">
                                    <Plus className="h-3 w-3" /> Novo Grupo
                                </button>
                            </div>

                            {grupos.map((grupo, gi) => (
                                <div key={grupo.id} className="mb-3 border border-purple-200 rounded-lg p-3 bg-purple-50">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-bold text-purple-700">GRUPO {gi + 1} {gi > 0 ? '(OU)' : ''}</span>
                                        {grupos.length > 1 && (
                                            <button onClick={() => removerGrupo(grupo.id)} className="text-red-400 hover:text-red-600">
                                                <Trash2 className="h-3 w-3" />
                                            </button>
                                        )}
                                    </div>

                                    {grupo.condicoes.map((cond, ci) => (
                                        <div key={cond.id} className="flex items-center gap-2 mb-2 bg-white rounded p-2 border border-purple-100">
                                            {ci > 0 && <span className="text-xs text-gray-500 font-bold shrink-0">E</span>}
                                            {cond.tipo === 'PRODUTO_QUANTIDADE' ? (
                                                <>
                                                    <BuscaProduto
                                                        value={cond.produtoId}
                                                        onChange={v => atualizarCondicao(grupo.id, cond.id, 'produtoId', v)}
                                                        todosOsProdutos={todosOsProdutos}
                                                    />
                                                    <span className="text-xs text-gray-500 shrink-0">≥</span>
                                                    <input type="number" min="0" step="1" value={cond.quantidadeMinima} placeholder="Qtd"
                                                        onChange={e => atualizarCondicao(grupo.id, cond.id, 'quantidadeMinima', e.target.value)}
                                                        className="w-20 text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-900" />
                                                    <span className="text-xs text-gray-500">un</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="text-xs text-gray-500 shrink-0">Total do pedido ≥ R$</span>
                                                    <input type="number" min="0" step="0.01" value={cond.valorMinimo} placeholder="Valor"
                                                        onChange={e => atualizarCondicao(grupo.id, cond.id, 'valorMinimo', e.target.value)}
                                                        className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-900" />
                                                </>
                                            )}
                                            <button onClick={() => removerCondicao(grupo.id, cond.id)} className="text-red-400 hover:text-red-600 shrink-0">
                                                <X className="h-3 w-3" />
                                            </button>
                                        </div>
                                    ))}

                                    <div className="flex gap-2 mt-1">
                                        <button onClick={() => adicionarCondicao(grupo.id, 'PRODUTO_QUANTIDADE')}
                                            className="text-xs text-purple-700 bg-white border border-purple-200 px-2 py-1 rounded hover:bg-purple-100 flex items-center gap-1">
                                            <Plus className="h-3 w-3" /> Produto + Qtd
                                        </button>
                                        <button onClick={() => adicionarCondicao(grupo.id, 'VALOR_TOTAL')}
                                            className="text-xs text-purple-700 bg-white border border-purple-200 px-2 py-1 rounded hover:bg-purple-100 flex items-center gap-1">
                                            <Plus className="h-3 w-3" /> Valor Total
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-700">
                        ⚠️ <strong>Imutável após criar:</strong> Preço, datas, nome e condições não podem ser alterados. Para corrigir, encerre e crie novamente.
                    </div>

                    <button onClick={handleCriar} disabled={salvando}
                        className="w-full py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                        {salvando ? 'Criando...' : 'Criar Promoção'}
                    </button>
                </div>
            )}

            {/* === ABA HISTÓRICO === */}
            {tab === 'historico' && (
                <div>
                    {promocoes.length === 0 ? (
                        <p className="text-center text-gray-400 py-6 text-sm">Nenhuma promoção registrada.</p>
                    ) : (
                        <div className="space-y-2">
                            {promocoes.map(p => (
                                <div key={p.id} className={`rounded-lg border p-3 ${p.status === 'ATIVA' ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-gray-900 text-sm">{p.nome}</span>
                                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${p.tipo === 'SIMPLES' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>{p.tipo}</span>
                                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${p.status === 'ATIVA' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>{p.status}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                R$ {Number(p.precoPromocional).toFixed(2)} • {formatData(p.dataInicio)} → {formatData(p.dataFim)}
                                            </p>
                                            <p className="text-xs text-gray-400">Criado por {p.criadoPorNome || p.criadoPor} em {formatData(p.criadoEm)}</p>
                                            {p.status === 'ENCERRADA' && p.encerradoEm && (
                                                <p className={`text-xs mt-0.5 ${p.encerradaAntesPrevisto ? 'text-amber-600' : 'text-gray-400'}`}>
                                                    {p.encerradaAntesPrevisto ? '⚠️ Encerrada antecipadamente' : '✅ Encerrada no prazo'} por {p.encerradoPorNome || p.encerradoPor} em {formatData(p.encerradoEm)}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// -------------------------------------------------------
// Componente Principal
// -------------------------------------------------------
const GerenciarProduto = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [abaAtiva, setAbaAtiva] = useState('dados'); // 'dados' | 'promocoes'

    // Data States
    const [produto, setProduto] = useState(null);
    const [imagemAtual, setImagemAtual] = useState(0);
    const [imagensLocal, setImagensLocal] = useState([]);
    const [uploadingImagem, setUploadingImagem] = useState(false);
    const fileInputRef = useRef(null);
    const [categoriasProduto, setCategoriasProduto] = useState([]);
    const [todosProdutos, setTodosProdutos] = useState([]);
    const [salvandoComercial, setSalvandoComercial] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        nome: '',
        codigo: '',
        valorVenda: '',
        custoMedio: '',
        custoManual: '',
        unidade: '',
        categoria: '',
        ean: '',
        ncm: '',
        pesoLiquido: '',
        descricao: '',
        contaAzulUpdatedAt: '',
        ativo: true,
        // Inteligência Comercial
        categoriaProdutoId: '',
        produtoSubstitutoId: '',
        permiteRecomendacao: true,
        prioridadeRecomendacao: 1
    });

    useEffect(() => {
        const fetchDetalhe = async () => {
            try {
                const [data, cats, todos] = await Promise.all([
                    produtoService.detalhar(id),
                    categoriaProdutoService.listar().catch(() => []),
                    produtoService.listar({ limit: 1000, ativo: true }).catch(() => ({ data: [] }))
                ]);

                setProduto(data);
                setImagensLocal(data.imagens || []);
                setCategoriasProduto(cats);
                setTodosProdutos(todos.data || todos || []);

                setFormData({
                    nome: data.nome || '',
                    codigo: data.codigo || '',
                    valorVenda: data.valorVenda ? Number(data.valorVenda).toFixed(2) : '0.00',
                    custoMedio: data.custoMedio ? Number(data.custoMedio).toFixed(2) : '0.00',
                    custoManual: data.custoManual != null ? Number(data.custoManual).toFixed(2) : '',
                    unidade: data.unidade || '',
                    categoria: data.categoria || '',
                    ean: data.ean || '',
                    ncm: data.ncm || '',
                    pesoLiquido: data.pesoLiquido || '',
                    descricao: data.descricao || '',
                    contaAzulUpdatedAt: data.contaAzulUpdatedAt || '',
                    ativo: data.ativo,
                    categoriaProdutoId: data.categoriaProdutoId || '',
                    produtoSubstitutoId: data.produtoSubstitutoId || '',
                    permiteRecomendacao: data.permiteRecomendacao !== false,
                    prioridadeRecomendacao: data.prioridadeRecomendacao || 1
                });
            } catch (error) {
                console.error('Erro ao carregar produto:', error);
                setError('Erro ao carregar detalhes do produto.');
            } finally {
                setLoading(false);
            }
        };
        fetchDetalhe();
    }, [id]);

    const handleBack = () => {
        if (location.state) {
            const params = new URLSearchParams();
            if (location.state.search) params.set('search', location.state.search);
            if (location.state.page) params.set('page', location.state.page);
            if (location.state.statusFilter) params.set('ativo', location.state.statusFilter);
            if (location.state.selectedCategories?.length > 0) {
                params.set('categorias', location.state.selectedCategories.join(','));
            }
            if (location.state.selectedCatsComerciais?.length > 0) {
                params.set('categoriasComerciais', location.state.selectedCatsComerciais.join(','));
            }
            navigate(`/admin/produtos?${params.toString()}`);
        } else {
            navigate(-1);
        }
    };

    const handleSaveComercial = async () => {
        setSalvandoComercial(true);
        try {
            const unidadeLimpa = (formData.unidade || '').trim();
            if (!unidadeLimpa) {
                toast.error('Informe a unidade do produto (ex.: UN, KG, CX).');
                setSalvandoComercial(false);
                return;
            }
            const custoManualVal = String(formData.custoManual ?? '').trim();
            await produtoService.atualizar(id, {
                unidade: unidadeLimpa,
                custoManual: custoManualVal === '' ? null : parseFloat(custoManualVal.replace(',', '.')),
                categoriaProdutoId: formData.categoriaProdutoId || null,
                produtoSubstitutoId: formData.produtoSubstitutoId || null,
                permiteRecomendacao: formData.permiteRecomendacao,
                prioridadeRecomendacao: parseInt(formData.prioridadeRecomendacao) || 1
            });
            toast.success('Configurações comerciais salvas!');
            handleBack();
        } catch (error) {
            console.error(error);
            toast.error('Erro ao salvar as configurações.');
        } finally {
            setSalvandoComercial(false);
        }
    };

    // ── Handlers de Imagem ──
    const handleUploadImagens = async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        setUploadingImagem(true);
        try {
            const formData = new FormData();
            for (const file of files) formData.append('imagens', file);
            const novas = await produtoService.uploadImagens(id, formData);
            setImagensLocal(prev => [...prev, ...novas]);
            toast.success(`${novas.length} imagem(ns) enviada(s)!`);
        } catch (err) {
            console.error(err);
            toast.error('Erro ao enviar imagens.');
        } finally {
            setUploadingImagem(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleRemoverImagem = async (imagemId) => {
        if (!confirm('Remover esta imagem?')) return;
        try {
            await produtoService.removerImagem(imagemId);
            setImagensLocal(prev => prev.filter(i => i.id !== imagemId));
            setImagemAtual(0);
            toast.success('Imagem removida.');
        } catch (err) {
            console.error(err);
            toast.error('Erro ao remover imagem.');
        }
    };

    const handleDefinirPrincipal = async (imagemId) => {
        try {
            await produtoService.definirPrincipal(id, imagemId);
            setImagensLocal(prev => prev.map(i => ({ ...i, principal: i.id === imagemId })));
            toast.success('Imagem principal definida!');
        } catch (err) {
            console.error(err);
            toast.error('Erro ao definir principal.');
        }
    };

    const handleMoverImagem = async (index, direcao) => {
        const novaLista = [...imagensLocal];
        const targetIndex = index + direcao;
        if (targetIndex < 0 || targetIndex >= novaLista.length) return;
        [novaLista[index], novaLista[targetIndex]] = [novaLista[targetIndex], novaLista[index]];
        setImagensLocal(novaLista);
        try {
            await produtoService.reordenarImagens(id, novaLista.map(i => i.id));
        } catch (err) {
            console.error(err);
            toast.error('Erro ao salvar ordem.');
        }
    };

    if (loading) return (
        <div className="flex justify-center items-center h-screen bg-gray-50">
            <Loader className="animate-spin h-8 w-8 text-primary" />
        </div>
    );

    if (!produto) return <div className="p-8 text-center text-red-500">Produto não encontrado.</div>;

    const imagensExibir = imagensLocal.length > 0 ? imagensLocal : [{ url: null }];
    const estoqueReservado = Math.max(0, (produto.estoqueTotal || 0) - (produto.estoqueDisponivel || 0));
    const margem = Number(formData.custoMedio) > 0 && Number(formData.valorVenda) > 0
        ? (((Number(formData.valorVenda) - Number(formData.custoMedio)) / Number(formData.valorVenda)) * 100).toFixed(1)
        : null;

    return (
        <div className="min-h-screen" style={{ background: '#F4F5FA' }}>
            {/* TOPBAR */}
            <header className="sticky top-0 z-10 bg-white border-b" style={{ borderColor: '#E7E9F2', boxShadow: '0 1px 2px rgba(16,20,40,.04)' }}>
                <div className="flex items-center justify-between gap-4 px-6" style={{ height: 78 }}>
                    <div className="flex items-center gap-3.5 min-w-0">
                        <button onClick={handleBack} className="flex items-center justify-center rounded-xl border flex-shrink-0 transition-colors hover:bg-gray-50" style={{ width: 42, height: 42, borderColor: '#E4E7F2', color: '#5A6072' }}>
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                        {imagensLocal.length > 0 && (
                            <div className="flex-shrink-0 rounded-xl border flex items-center justify-center bg-white overflow-hidden" style={{ width: 46, height: 46, borderColor: '#ECEEF5' }}>
                                <img src={`${API_URL}${imagensLocal.find(i => i.principal)?.url || imagensLocal[0]?.url}`} className="w-full h-full object-contain" alt="" />
                            </div>
                        )}
                        <div className="min-w-0">
                            <h1 className="font-extrabold leading-tight truncate" style={{ fontSize: 19, color: '#16192B' }}>{formData.nome || 'Produto'}</h1>
                            <div className="flex items-center gap-2.5 mt-1">
                                <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full" style={formData.ativo ? { color: '#15A05A', background: '#E6F7EE' } : { color: '#ef4444', background: '#fee2e2' }}>
                                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'currentColor' }} />
                                    {formData.ativo ? 'Ativo' : 'Inativo'}
                                </span>
                                <span className="text-sm font-mono" style={{ color: '#8A90A2' }}>Cód. {formData.codigo}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex rounded-xl p-1 flex-shrink-0" style={{ background: '#EEF0F7', gap: 2 }}>
                        <button onClick={() => setAbaAtiva('dados')}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                            style={abaAtiva === 'dados' ? { background: '#fff', color: '#2563EB', fontWeight: 700, boxShadow: '0 1px 2px rgba(16,20,40,.10)' } : { color: '#7A8094' }}>
                            <Save className="h-3.5 w-3.5" /> Dados
                        </button>
                        <button onClick={() => setAbaAtiva('promocoes')}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                            style={abaAtiva === 'promocoes' ? { background: '#fff', color: '#2563EB', fontWeight: 700, boxShadow: '0 1px 2px rgba(16,20,40,.10)' } : { color: '#7A8094' }}>
                            <Tag className="h-3.5 w-3.5" /> Promoções
                        </button>
                    </div>
                </div>
            </header>

            <main className="px-6 py-5 flex flex-col gap-[18px]" style={{ maxWidth: 1440, margin: '0 auto' }}>

                {error && (
                    <div className="bg-red-50 border-l-4 border-red-500 p-3 flex items-center gap-2 rounded-lg">
                        <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                        <p className="text-red-700 text-sm">{error}</p>
                    </div>
                )}

                {/* ABA DADOS */}
                {abaAtiva === 'dados' && (
                    <>
                        {/* KPI STRIP */}
                        <div className="bg-white rounded-2xl border flex" style={{ borderColor: '#E7E9F2', boxShadow: '0 1px 2px rgba(16,20,40,.04)' }}>
                            {[
                                { label: 'Valor de Venda', value: `R$ ${Number(formData.valorVenda || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, color: '#16192B' },
                                { label: 'Custo (Conta Azul)', value: `R$ ${Number(formData.custoMedio || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, color: '#16192B' },
                                { label: 'Margem', value: margem ? `${margem}%` : '—', color: '#15A05A', showIcon: !!margem },
                                { label: 'Disponível', value: String(produto.estoqueDisponivel ?? 0), color: '#15A05A' },
                                { label: 'Total', value: String(produto.estoqueTotal ?? 0), color: '#2563EB' },
                                { label: 'Reservado', value: String(estoqueReservado), color: '#B0863A' },
                            ].map((kpi, i, arr) => (
                                <div key={kpi.label} className="flex-1 py-4 px-[22px]" style={i < arr.length - 1 ? { borderRight: '1px solid #EEF0F7' } : {}}>
                                    <div className="font-bold tracking-[.05em] uppercase mb-1.5" style={{ fontSize: 11, color: '#9AA0B4' }}>{kpi.label}</div>
                                    <div className="flex items-center gap-1.5 font-extrabold font-mono" style={{ fontSize: 22, color: kpi.color }}>
                                        {kpi.value}
                                        {kpi.showIcon && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17l6-6 4 4 5-7" /></svg>}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* TWO-COLUMN */}
                        <div className="grid gap-[18px]" style={{ gridTemplateColumns: '392px 1fr', alignItems: 'start' }}>

                            {/* LEFT: Images + Dados */}
                            <div className="flex flex-col gap-4">

                                {/* IMAGES */}
                                <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E7E9F2' }}>
                                    <div className="flex items-center justify-between px-[18px] border-b" style={{ height: 58, borderColor: '#EEF0F7' }}>
                                        <div className="flex items-center gap-2.5">
                                            <span className="flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 30, height: 30, background: '#EFF4FF', color: '#2563EB' }}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></svg>
                                            </span>
                                            <span className="font-extrabold" style={{ fontSize: 15, color: '#16192B' }}>Imagens</span>
                                        </div>
                                        <button onClick={() => fileInputRef.current?.click()} disabled={uploadingImagem} className="flex items-center gap-1.5 text-sm font-bold disabled:opacity-50 transition-colors" style={{ color: '#2563EB' }}>
                                            <Upload className="h-3.5 w-3.5" />
                                            {uploadingImagem ? 'Enviando...' : 'Enviar'}
                                        </button>
                                        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={handleUploadImagens} />
                                    </div>
                                    <div className="flex gap-3 p-4">
                                        <div className="relative rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden" style={{ width: 150, height: 150, background: '#F7F8FC', border: '1px solid #ECEEF5' }}>
                                            <img
                                                src={imagensExibir[imagemAtual]?.url ? `${API_URL}${imagensExibir[imagemAtual].url}` : 'https://via.placeholder.com/400?text=Sem+Imagem'}
                                                alt="Produto"
                                                className="object-contain"
                                                style={{ maxWidth: '84%', maxHeight: '80%' }}
                                                onError={(e) => { e.target.src = 'https://via.placeholder.com/400?text=Erro'; }}
                                            />
                                            {imagensExibir[imagemAtual]?.principal && (
                                                <span className="absolute top-2 left-2 flex items-center gap-1 font-extrabold rounded-lg" style={{ fontSize: 10.5, color: '#8a6a00', background: '#FFE08A', padding: '4px 9px' }}>
                                                    <Star className="h-2.5 w-2.5 fill-current" /> CAPA
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex-1 flex flex-col min-w-0">
                                            <div className="font-bold tracking-[.05em] uppercase mb-2" style={{ fontSize: 10.5, color: '#9AA0B4' }}>Ordem · use as setas</div>
                                            <div className="flex flex-col gap-1.5 overflow-y-auto" style={{ maxHeight: 160 }}>
                                                {imagensLocal.length > 0 ? imagensLocal.map((img, idx) => (
                                                    <div key={img.id}
                                                        className="flex items-center gap-2.5 rounded-xl p-2 cursor-pointer transition-all"
                                                        style={idx === imagemAtual ? { border: '1.5px solid #BBD3FF', background: '#EFF5FF' } : { border: '1.5px solid transparent' }}
                                                        onClick={() => setImagemAtual(idx)}>
                                                        <div className="flex-shrink-0 rounded-lg overflow-hidden flex items-center justify-center" style={{ width: 40, height: 40, border: '1px solid #D9E2F2', background: '#fff' }}>
                                                            <img src={`${API_URL}${img.url}`} className="w-full h-full object-contain" alt="" />
                                                        </div>
                                                        <span className="text-sm font-bold flex-1 truncate" style={{ color: '#16192B' }}>#{idx + 1}{img.principal ? ' — Capa' : ''}</span>
                                                        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                                            <button onClick={() => handleMoverImagem(idx, -1)} disabled={idx === 0} className="flex items-center justify-center rounded-lg transition-colors hover:bg-gray-100 disabled:opacity-20" style={{ width: 30, height: 30, color: '#7A8094' }}>
                                                                <ArrowUp className="h-3.5 w-3.5" />
                                                            </button>
                                                            <button onClick={() => handleMoverImagem(idx, 1)} disabled={idx === imagensLocal.length - 1} className="flex items-center justify-center rounded-lg transition-colors hover:bg-gray-100 disabled:opacity-20" style={{ width: 30, height: 30, color: '#7A8094' }}>
                                                                <ArrowDown className="h-3.5 w-3.5" />
                                                            </button>
                                                            <button onClick={() => handleDefinirPrincipal(img.id)} className="flex items-center justify-center rounded-lg transition-colors" style={{ width: 30, height: 30, border: `1px solid ${img.principal ? '#FBE6A8' : '#E4E7F2'}`, background: img.principal ? '#FFFAF0' : 'transparent' }}>
                                                                <Star className={`h-3.5 w-3.5 ${img.principal ? 'fill-current' : ''}`} style={{ color: img.principal ? '#F4B400' : '#9AA0B4' }} />
                                                            </button>
                                                            <button onClick={() => handleRemoverImagem(img.id)} className="flex items-center justify-center rounded-lg transition-colors hover:text-red-500" style={{ width: 30, height: 30, color: '#9AA0B4' }}>
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )) : (
                                                    <div className="text-sm text-center py-6" style={{ color: '#9AA0B4' }}>Nenhuma imagem. Clique em Enviar.</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* DADOS DO PRODUTO */}
                                <div className="bg-white rounded-2xl border" style={{ borderColor: '#E7E9F2' }}>
                                    <div className="p-[18px]">
                                        <div className="flex items-center gap-2.5 mb-4">
                                            <span className="flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 30, height: 30, background: '#EFF4FF', color: '#2563EB' }}>
                                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
                                            </span>
                                            <span className="font-extrabold" style={{ fontSize: 15, color: '#16192B' }}>Dados do Produto</span>
                                            <span className="ml-auto inline-flex items-center gap-1 font-bold rounded-full" style={{ fontSize: 10.5, color: '#2563EB', background: '#EFF4FF', padding: '4px 9px' }}>
                                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                                                CONTA AZUL
                                            </span>
                                        </div>
                                        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                            <div style={{ gridColumn: 'span 2' }}>
                                                <div className="font-bold tracking-[.05em] uppercase mb-1" style={{ fontSize: 10.5, color: '#9AA0B4' }}>Nome</div>
                                                <div className="font-bold" style={{ fontSize: 14, color: '#16192B' }}>{formData.nome}</div>
                                            </div>
                                            <div style={{ gridColumn: 'span 2' }}>
                                                <div className="font-bold tracking-[.05em] uppercase mb-1" style={{ fontSize: 10.5, color: '#9AA0B4' }}>EAN</div>
                                                <div className="font-semibold font-mono" style={{ fontSize: 14, color: '#16192B' }}>{formData.ean || '—'}</div>
                                            </div>
                                            <div>
                                                <div className="font-bold tracking-[.05em] uppercase mb-1" style={{ fontSize: 10.5, color: '#9AA0B4' }}>Código</div>
                                                <div className="font-semibold font-mono" style={{ fontSize: 14, color: '#16192B' }}>{formData.codigo}</div>
                                            </div>
                                            <div>
                                                <div className="font-bold tracking-[.05em] uppercase mb-1" style={{ fontSize: 10.5, color: '#9AA0B4' }}>NCM</div>
                                                <div className="font-semibold font-mono" style={{ fontSize: 14, color: '#16192B' }}>{formData.ncm || '—'}</div>
                                            </div>
                                            <div>
                                                <div className="font-bold tracking-[.05em] uppercase mb-1" style={{ fontSize: 10.5, color: '#9AA0B4' }}>Categoria</div>
                                                <div className="font-semibold" style={{ fontSize: 14, color: '#16192B' }}>{formData.categoria || '—'}</div>
                                            </div>
                                            <div>
                                                <div className="font-bold tracking-[.05em] uppercase mb-1" style={{ fontSize: 10.5, color: '#9AA0B4' }}>Peso</div>
                                                <div className="font-semibold font-mono" style={{ fontSize: 14, color: '#16192B' }}>{formData.pesoLiquido || '0'} <span className="font-sans" style={{ fontSize: 11, color: '#9AA0B4' }}>kg</span></div>
                                            </div>
                                            {formData.contaAzulUpdatedAt && (
                                                <div style={{ gridColumn: 'span 2' }}>
                                                    <div className="font-bold tracking-[.05em] uppercase mb-1" style={{ fontSize: 10.5, color: '#9AA0B4' }}>Atualizado</div>
                                                    <div className="font-semibold font-mono" style={{ fontSize: 14, color: '#16192B' }}>{new Date(formData.contaAzulUpdatedAt).toLocaleDateString('pt-BR')}</div>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px dashed #EEF0F7', color: '#9AA0B4', fontSize: 11.5 }}>
                                            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                                            Sincronizado da Conta Azul — somente leitura.
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT: IC CARD */}
                            <div className="rounded-2xl border flex flex-col" style={{ background: 'linear-gradient(180deg,#FCFBFF,#fff)', borderColor: '#ECE5FB', boxShadow: '0 1px 2px rgba(16,20,40,.04)' }}>
                                <div className="flex items-start gap-3 px-6 pt-[22px] pb-6">
                                    <span className="flex items-center justify-center rounded-[9px] flex-shrink-0" style={{ width: 34, height: 34, background: 'linear-gradient(135deg,#7C3AED,#9F67FF)', color: '#fff' }}>
                                        <Sparkles className="h-[18px] w-[18px]" />
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-extrabold" style={{ fontSize: 16, color: '#16192B', lineHeight: 1.2 }}>Inteligência Comercial</div>
                                        <div className="font-medium mt-0.5" style={{ fontSize: 12, color: '#9AA0B4' }}>Ajustes exclusivos do app — não alteram a Conta Azul</div>
                                    </div>
                                    <span className="flex-shrink-0 font-bold rounded-full" style={{ fontSize: 11, color: '#7C3AED', background: '#F1EAFF', padding: '5px 11px' }}>EXCLUSIVO APP</span>
                                </div>

                                <div className="px-6 flex-1">
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-[22px]">
                                        <div>
                                            <div className="flex items-center mb-2">
                                                <span className="text-sm font-bold" style={{ color: '#3A3F52' }}>Custo Manual (R$)</span>
                                                <span className="ml-2 font-bold rounded-full" style={{ fontSize: 10.5, color: '#7C3AED', background: '#F1EAFF', padding: '2px 7px' }}>EDITÁVEL</span>
                                            </div>
                                            <div className="flex items-center gap-2.5 rounded-xl border" style={{ height: 50, padding: '0 16px', borderColor: '#D8C9FB', background: '#fff' }}>
                                                <span className="text-sm font-medium" style={{ color: '#3A3F52' }}>R$</span>
                                                <input type="number" step="0.01" min="0" value={formData.custoManual}
                                                    onChange={(e) => setFormData({ ...formData, custoManual: e.target.value })}
                                                    placeholder="0,00"
                                                    className="flex-1 bg-transparent outline-none font-medium font-mono"
                                                    style={{ fontSize: 15, color: '#16192B' }} />
                                            </div>
                                            <div className="mt-1.5 text-xs" style={{ color: '#9AA0B4' }}>{parseFloat(formData.custoMedio) > 0 ? 'CA já tem custo — este fica de reserva.' : 'Usado no cálculo de receitas.'}</div>
                                        </div>
                                        <div>
                                            <div className="flex items-center mb-2">
                                                <span className="text-sm font-bold" style={{ color: '#3A3F52' }}>Unidade</span>
                                                <span className="ml-2 font-bold rounded-full" style={{ fontSize: 10.5, color: '#7C3AED', background: '#F1EAFF', padding: '2px 7px' }}>EDITÁVEL</span>
                                            </div>
                                            <div className="flex items-center rounded-xl border" style={{ height: 50, padding: '0 16px', borderColor: '#D8C9FB', background: '#fff' }}>
                                                <input type="text" value={formData.unidade} maxLength={10}
                                                    onChange={(e) => setFormData({ ...formData, unidade: e.target.value.toUpperCase() })}
                                                    placeholder="Ex.: UN, KG, PT"
                                                    className="flex-1 bg-transparent outline-none font-semibold uppercase"
                                                    style={{ fontSize: 15, color: '#16192B' }} />
                                            </div>
                                            <div className="mt-1.5 text-xs" style={{ color: '#9AA0B4' }}>Unidade de venda no app.</div>
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold mb-2" style={{ color: '#3A3F52' }}>Categoria Comercial</div>
                                            <div className="flex items-center rounded-xl border" style={{ height: 50, padding: '0 16px', borderColor: '#E4E7F2', background: '#fff' }}>
                                                <select
                                                    className="flex-1 bg-transparent outline-none font-medium appearance-none truncate"
                                                    style={{ fontSize: 15, color: formData.categoriaProdutoId ? '#16192B' : '#A6ABBD' }}
                                                    value={formData.categoriaProdutoId}
                                                    onChange={(e) => setFormData({ ...formData, categoriaProdutoId: e.target.value })}>
                                                    <option value="">Selecione...</option>
                                                    {categoriasProduto.map(c => (<option key={c.id} value={c.id}>{c.nome}</option>))}
                                                </select>
                                                <ChevronDown className="h-4 w-4 flex-shrink-0 ml-2" style={{ color: '#9AA0B4' }} />
                                            </div>
                                            <div className="mt-1.5 text-xs" style={{ color: '#9AA0B4' }}>Agrupamento dentro do app.</div>
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold mb-2" style={{ color: '#3A3F52' }}>Produto Substituto</div>
                                            <div className="flex items-center rounded-xl border" style={{ minHeight: 50, padding: '6px 12px', borderColor: '#E4E7F2', background: '#fff' }}>
                                                <BuscaProduto
                                                    value={formData.produtoSubstitutoId}
                                                    onChange={(val) => setFormData({ ...formData, produtoSubstitutoId: val })}
                                                    todosOsProdutos={todosProdutos}
                                                />
                                            </div>
                                            <div className="mt-1.5 text-xs" style={{ color: '#9AA0B4' }}>Sugerido em falta de estoque.</div>
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold mb-2" style={{ color: '#3A3F52' }}>Prioridade de Recomendação</div>
                                            <div className="flex items-center justify-between rounded-xl border" style={{ height: 50, padding: '0 8px 0 16px', borderColor: '#E4E7F2', background: '#fff' }}>
                                                <input type="number" min="1" max="99"
                                                    value={formData.prioridadeRecomendacao}
                                                    onChange={(e) => setFormData({ ...formData, prioridadeRecomendacao: e.target.value })}
                                                    className="flex-1 bg-transparent outline-none font-semibold font-mono"
                                                    style={{ fontSize: 15, color: '#16192B' }} />
                                                <div className="flex flex-col gap-[3px] flex-shrink-0">
                                                    <button onClick={() => setFormData({ ...formData, prioridadeRecomendacao: Math.max(1, parseInt(formData.prioridadeRecomendacao || 1) - 1) })} className="flex items-center justify-center rounded-lg" style={{ width: 32, height: 18, background: '#F2F3F8', color: '#9AA0B4' }}>
                                                        <ChevronUp className="h-3 w-3" />
                                                    </button>
                                                    <button onClick={() => setFormData({ ...formData, prioridadeRecomendacao: Math.min(99, parseInt(formData.prioridadeRecomendacao || 1) + 1) })} className="flex items-center justify-center rounded-lg" style={{ width: 32, height: 18, background: '#F2F3F8', color: '#9AA0B4' }}>
                                                        <ChevronDown className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="mt-1.5 text-xs" style={{ color: '#9AA0B4' }}>1 é a mais alta.</div>
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold mb-2" style={{ color: '#3A3F52' }}>Sugestão do Produto</div>
                                            <div className="flex items-center justify-between rounded-xl border" style={{ height: 50, padding: '0 16px', borderColor: '#E4E7F2', background: '#fff' }}>
                                                <span className="font-semibold" style={{ fontSize: 14, color: '#16192B' }}>Permitir sugestão</span>
                                                <button
                                                    onClick={() => setFormData({ ...formData, permiteRecomendacao: !formData.permiteRecomendacao })}
                                                    className="flex items-center rounded-full flex-shrink-0 transition-all"
                                                    style={{ width: 48, height: 27, background: formData.permiteRecomendacao ? '#7C3AED' : '#D1D5DB', padding: '0 3px', justifyContent: formData.permiteRecomendacao ? 'flex-end' : 'flex-start' }}>
                                                    <span className="rounded-full bg-white flex-shrink-0" style={{ width: 21, height: 21, boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
                                                </button>
                                            </div>
                                            <div className="mt-1.5 text-xs" style={{ color: '#9AA0B4' }}>Aparece como alternativa no app.</div>
                                        </div>
                                    </div>
                                </div>

                                {/* IC Footer */}
                                <div className="flex items-center justify-between gap-3 px-6 py-[18px] mt-6 border-t" style={{ borderColor: '#F0EEF7' }}>
                                    <div className="flex items-center gap-2" style={{ fontSize: 11.5, color: '#9AA0B4' }}>
                                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                                        As alterações entram em vigor no próximo sync do app.
                                    </div>
                                    <div className="flex items-center gap-2.5 flex-shrink-0">
                                        <button onClick={handleBack} className="flex items-center font-bold text-sm rounded-xl border transition-colors hover:bg-gray-50" style={{ height: 46, padding: '0 18px', borderColor: '#E4E7F2', color: '#5A6072', background: 'none' }}>
                                            Cancelar
                                        </button>
                                        <button onClick={handleSaveComercial} disabled={salvandoComercial}
                                            className="flex items-center gap-2 font-bold text-white rounded-xl disabled:opacity-50 transition-all"
                                            style={{ height: 46, padding: '0 22px', fontSize: 14.5, background: 'linear-gradient(135deg,#7C3AED,#6D28D9)', boxShadow: '0 6px 18px rgba(124,58,237,.35)' }}>
                                            <Save className="h-[17px] w-[17px]" />
                                            {salvandoComercial ? 'Salvando...' : 'Salvar e Voltar'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* ABA PROMOÇÕES */}
                {abaAtiva === 'promocoes' && (
                    <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E7E9F2' }}>
                        <div className="p-4 border-b flex items-center gap-2" style={{ background: '#F0FDF4', borderColor: '#BBF7D0' }}>
                            <Tag className="h-4 w-4" style={{ color: '#15A05A' }} />
                            <h3 className="font-bold text-sm" style={{ color: '#166534' }}>Promoções — {formData.nome}</h3>
                        </div>
                        <div className="p-6">
                            <SecaoPromocoes produtoId={id} valorVendaBase={formData.valorVenda} />
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default GerenciarProduto;
