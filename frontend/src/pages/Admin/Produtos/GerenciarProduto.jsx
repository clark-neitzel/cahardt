import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import produtoService from '../../../services/produtoService';
import produtoServiceFront from '../../../services/produtoService';
import configService from '../../../services/configService';
import promocaoService from '../../../services/promocaoService';
import { API_URL } from '../../../services/api';
import {
    ArrowLeft, Loader, AlertCircle, Camera, Tag, Plus, X,
    CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Trash2
} from 'lucide-react';

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

    // Form nova promoção
    const [novaPromo, setNovaPromo] = useState({
        nome: '',
        tipo: 'SIMPLES',
        precoPromocional: '',
        dataInicio: '',
        dataFim: '',
    });

    // Grupos de condições (para tipo CONDICIONAL)
    const [grupos, setGrupos] = useState([{ id: Date.now(), condicoes: [] }]);

    const carregarPromocoes = useCallback(async () => {
        setLoadingPromo(true);
        setErro('');
        try {
            const [hist, ativa] = await Promise.all([
                promocaoService.listarPorProduto(produtoId),
                promocaoService.buscarAtiva(produtoId)
            ]);
            setPromocoes(hist || []);
            setPromoAtiva(ativa);
        } catch (e) {
            setErro('Erro ao carregar promoções.');
        } finally {
            setLoadingPromo(false);
        }
    }, [produtoId]);

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
            setNovaPromo({ nome: '', tipo: 'SIMPLES', precoPromocional: '', dataInicio: '', dataFim: '' });
            setGrupos([{ id: Date.now(), condicoes: [] }]);
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
                                                    {g.condicoes.map((c, ci) => (
                                                        <span key={c.id} className={ci > 0 ? 'ml-1' : ''}>
                                                            {ci > 0 && <span className="text-gray-400"> E </span>}
                                                            {c.tipo === 'PRODUTO_QUANTIDADE'
                                                                ? `Produto ${c.produtoId} ≥ ${c.quantidadeMinima} un`
                                                                : `Total ≥ R$ ${c.valorMinimo}`}
                                                        </span>
                                                    ))}
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
                                                    <span className="text-xs text-gray-500 shrink-0">Produto ID:</span>
                                                    <input type="text" value={cond.produtoId} placeholder="ID do produto"
                                                        onChange={e => atualizarCondicao(grupo.id, cond.id, 'produtoId', e.target.value)}
                                                        className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-900" />
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

    // Form State
    const [formData, setFormData] = useState({
        nome: '',
        codigo: '',
        valorVenda: '',
        custoMedio: '',
        unidade: '',
        categoria: '',
        ean: '',
        ncm: '',
        pesoLiquido: '',
        descricao: '',
        contaAzulUpdatedAt: '',
        ativo: true
    });

    useEffect(() => {
        const fetchDetalhe = async () => {
            try {
                const data = await produtoService.detalhar(id);
                setProduto(data);
                setFormData({
                    nome: data.nome || '',
                    codigo: data.codigo || '',
                    valorVenda: data.valorVenda ? Number(data.valorVenda).toFixed(2) : '0.00',
                    custoMedio: data.custoMedio ? Number(data.custoMedio).toFixed(2) : '0.00',
                    unidade: data.unidade || '',
                    categoria: data.categoria || '',
                    ean: data.ean || '',
                    ncm: data.ncm || '',
                    pesoLiquido: data.pesoLiquido || '',
                    descricao: data.descricao || '',
                    contaAzulUpdatedAt: data.contaAzulUpdatedAt || '',
                    ativo: data.ativo
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
            navigate(`/admin/produtos?${params.toString()}`);
        } else {
            navigate(-1);
        }
    };

    if (loading) return (
        <div className="flex justify-center items-center h-screen bg-gray-50">
            <Loader className="animate-spin h-8 w-8 text-primary" />
        </div>
    );

    if (!produto) return <div className="p-8 text-center text-red-500">Produto não encontrado.</div>;

    const imagens = produto.imagens?.length > 0 ? produto.imagens : [{ url: null }];

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header Sticky */}
            <div className="sticky top-0 z-10 bg-white border-b shadow-sm px-4 py-4 mb-6">
                <div className="container mx-auto max-w-5xl flex justify-between items-center">
                    <div className="flex items-center space-x-4">
                        <button onClick={handleBack} className="text-gray-500 hover:text-gray-800 transition-colors p-1 rounded-full hover:bg-gray-100">
                            <ArrowLeft className="h-6 w-6" />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900 leading-tight">{formData.nome || 'Produto'}</h1>
                            <div className="flex items-center space-x-2 text-sm">
                                <span className="text-gray-500">Código: {formData.codigo}</span>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${formData.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                    {formData.ativo ? 'Ativo' : 'Inativo'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                {/* Tabs no header */}
                <div className="container mx-auto max-w-5xl mt-3 flex gap-0 border-b border-gray-200">
                    <button
                        onClick={() => setAbaAtiva('dados')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${abaAtiva === 'dados' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                        Dados
                    </button>
                    <button
                        onClick={() => setAbaAtiva('promocoes')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 ${abaAtiva === 'promocoes' ? 'border-green-500 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                        <Tag className="h-4 w-4" /> Promoções
                    </button>
                </div>
            </div>

            <div className="container mx-auto max-w-5xl px-4">
                {error && (
                    <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 flex items-center">
                        <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
                        <p className="text-red-700">{error}</p>
                    </div>
                )}

                {/* ABA DADOS */}
                {abaAtiva === 'dados' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Esquerda: Imagem + Estoque */}
                        <div className="space-y-6">
                            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                    <h3 className="font-semibold text-gray-700">Imagens</h3>
                                    <Camera className="h-4 w-4 text-gray-400" />
                                </div>
                                <div className="aspect-square bg-gray-100 relative">
                                    <img
                                        src={imagens[imagemAtual].url ? `${API_URL}${imagens[imagemAtual].url}` : 'https://via.placeholder.com/400?text=Sem+Imagem'}
                                        alt="Produto"
                                        className="w-full h-full object-contain p-4"
                                        onError={(e) => { e.target.src = 'https://via.placeholder.com/400?text=Erro'; }}
                                    />
                                </div>
                                {imagens.length > 1 && (
                                    <div className="p-4 flex gap-2 overflow-x-auto">
                                        {imagens.map((img, idx) => (
                                            <button key={idx} onClick={() => setImagemAtual(idx)}
                                                className={`h-16 w-16 flex-shrink-0 rounded border-2 overflow-hidden ${idx === imagemAtual ? 'border-primary' : 'border-transparent'}`}>
                                                <img src={`${API_URL}${img.url}`} className="w-full h-full object-cover" alt="" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                                <div className="p-4 border-b border-gray-100 bg-gray-50">
                                    <h3 className="font-semibold text-gray-700">Estoque</h3>
                                </div>
                                <div className="p-4 grid grid-cols-2 gap-4">
                                    <div className="bg-green-50 p-3 rounded border border-green-100">
                                        <p className="text-xs text-green-700 uppercase font-semibold">Disponível</p>
                                        <p className="text-2xl font-bold text-green-800">{produto.estoqueDisponivel}</p>
                                    </div>
                                    <div className="bg-blue-50 p-3 rounded border border-blue-100">
                                        <p className="text-xs text-blue-700 uppercase font-semibold">Total</p>
                                        <p className="text-xl font-bold text-blue-800">{produto.estoqueTotal}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Direita: Formulário read-only */}
                        <div className="md:col-span-2 space-y-6">
                            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                                <div className="p-4 border-b border-gray-100 bg-gray-50">
                                    <h3 className="font-semibold text-gray-700">Identificação</h3>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Produto</label>
                                        <input type="text" value={formData.nome} readOnly
                                            className="w-full rounded-md border-gray-300 shadow-sm py-2 px-3 border bg-gray-50 text-gray-700 cursor-not-allowed" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Código (SKU)</label>
                                            <input type="text" value={formData.codigo} readOnly
                                                className="w-full rounded-md border-gray-300 shadow-sm py-2 px-3 border bg-gray-50 text-gray-700 cursor-not-allowed" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">EAN / GTIN</label>
                                            <input type="text" value={formData.ean} readOnly
                                                className="w-full rounded-md border-gray-300 shadow-sm py-2 px-3 border bg-gray-50 text-gray-700 cursor-not-allowed" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                                <div className="p-4 border-b border-gray-100 bg-gray-50">
                                    <h3 className="font-semibold text-gray-700">Valores e Classificação</h3>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Valor de Venda (R$)</label>
                                            <div className="relative rounded-md shadow-sm">
                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                    <span className="text-gray-500 sm:text-sm">R$</span>
                                                </div>
                                                <input type="number" value={formData.valorVenda} readOnly
                                                    className="w-full pl-10 rounded-md border-gray-300 shadow-sm py-2 px-3 border font-bold bg-gray-50 text-gray-700 cursor-not-allowed" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Custo Médio (R$)</label>
                                            <div className="relative rounded-md shadow-sm">
                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                    <span className="text-gray-500 sm:text-sm">R$</span>
                                                </div>
                                                <input type="number" value={formData.custoMedio} readOnly
                                                    className="w-full pl-10 rounded-md border-gray-300 py-2 px-3 border bg-gray-100 text-gray-500 cursor-not-allowed" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Unidade</label>
                                            <input type="text" value={formData.unidade} readOnly
                                                className="w-full rounded-md border-gray-300 py-2 px-3 border uppercase bg-gray-50 text-gray-700 cursor-not-allowed" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                                            <input type="text" value={formData.categoria} readOnly
                                                className="w-full rounded-md border-gray-300 py-2 px-3 border bg-gray-50 text-gray-700 cursor-not-allowed" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">NCM</label>
                                            <input type="text" value={formData.ncm} readOnly
                                                className="w-full rounded-md border-gray-300 py-2 px-3 border bg-gray-50 text-gray-700 cursor-not-allowed" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Peso Líquido (kg)</label>
                                            <input type="number" value={formData.pesoLiquido} readOnly
                                                className="w-full rounded-md border-gray-300 py-2 px-3 border bg-gray-50 text-gray-700 cursor-not-allowed" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                                <div className="p-4 border-b border-gray-100 bg-gray-50">
                                    <h3 className="font-semibold text-gray-700">Descrição/Obs</h3>
                                </div>
                                <div className="p-4">
                                    <textarea rows={4} value={formData.descricao} readOnly
                                        className="w-full rounded-md border-gray-300 py-2 px-3 border bg-gray-50 text-gray-700 cursor-not-allowed" />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ABA PROMOÇÕES */}
                {abaAtiva === 'promocoes' && (
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                        <div className="p-4 border-b border-gray-100 bg-green-50 flex items-center gap-2">
                            <Tag className="h-5 w-5 text-green-600" />
                            <h3 className="font-semibold text-green-800">Promoções — {formData.nome}</h3>
                        </div>
                        <div className="p-6">
                            <SecaoPromocoes produtoId={id} valorVendaBase={formData.valorVenda} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GerenciarProduto;
