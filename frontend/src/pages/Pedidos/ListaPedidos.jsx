import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, AlertCircle, Package, ChevronDown, ChevronUp, Printer, CheckSquare, Square, Trash2, Calendar, User, Filter, Pencil, CheckCircle, RotateCcw, MessageCircle, XCircle, Loader2 } from 'lucide-react';
import pedidoService from '../../services/pedidoService';
import amostraService from '../../services/amostraService';
import vendedorService from '../../services/vendedorService';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

const fmtNumero = (pedido) => pedido.bonificacao ? `BN#${pedido.numero}` : pedido.especial ? `ZZ#${pedido.numero}` : `#${pedido.numero}`;

const ListaPedidos = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    
    // Filtros persistentes
    const [filtros, setFiltros] = useState(() => {
        const key = `pedidos_filtros_v2_${user?.id}`; // v2: reseta cache antigo com janela de 30d
        const saved = localStorage.getItem(key);
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error("Erro ao carregar filtros salvos", e);
            }
        }

        const hoje = new Date().toISOString().split('T')[0];
        const noventaDiasAtras = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        return {
            dataEntregaDe: noventaDiasAtras,
            dataEntregaAte: hoje,
            dataCriacaoDe: '',
            dataCriacaoAte: '',
            vendedorId: '',
            busca: ''
        };
    });

    const [pedidos, setPedidos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedPedido, setSelectedPedido] = useState(null);
    const [abaAtiva, setAbaAtiva] = useState(() => {
        return localStorage.getItem('pedidos_aba_ativa') || 'pedidos';
    }); // 'pedidos' | 'especiais' | 'bonificacao' | 'amostras'

    useEffect(() => {
        localStorage.setItem('pedidos_aba_ativa', abaAtiva);
    }, [abaAtiva]);
    const [aprovando, setAprovando] = useState(null);
    const [amostras, setAmostras] = useState([]);
    const [loadingAmostras, setLoadingAmostras] = useState(false);
    const [expandedAmostra, setExpandedAmostra] = useState(null);
    const [todosVendedores, setTodosVendedores] = useState([]);
    const [showFilters, setShowFilters] = useState(false);
    const [filtroStatus, setFiltroStatus] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem(`pedidos_filtro_status_${user?.id}`)) || 'TODOS';
        } catch { return 'TODOS'; }
    });

    useEffect(() => {
        localStorage.setItem(`pedidos_filtro_status_${user?.id}`, JSON.stringify(filtroStatus));
    }, [filtroStatus, user]);

    const podeAprovar = user?.permissoes?.Pode_Aprovar_Especial || user?.permissoes?.admin;
    const podeReverter = user?.permissoes?.Pode_Reverter_Especial || user?.permissoes?.admin;
    const podeAprovarBonificacao = user?.permissoes?.Pode_Aprovar_Bonificacao || user?.permissoes?.admin;
    const podeReverterBonificacao = user?.permissoes?.Pode_Reverter_Bonificacao || user?.permissoes?.admin;
    const podeExcluirPedido = user?.permissoes?.Pode_Excluir_Pedido || user?.permissoes?.admin;
    const podeExcluirEspecial = user?.permissoes?.Pode_Excluir_Especial || user?.permissoes?.admin;
    const podeExcluirBonificacao = user?.permissoes?.Pode_Excluir_Bonificacao || user?.permissoes?.admin;
    const podeExcluirAmostra = user?.permissoes?.Pode_Excluir_Amostra || user?.permissoes?.admin;
    const podeVerTodosVendedores = user?.permissoes?.admin || user?.permissoes?.pedidos?.clientes === 'todos';
    
    const [revertendo, setRevertendo] = useState(null);
    const [selecionados, setSelecionados] = useState(new Set());

    // WhatsApp: { [id]: { status: 'enviando'|'ok'|'erro', motivo?: string } }
    const [whatsappStatus, setWhatsappStatus] = useState({});

    const getWsStatus = (id) => whatsappStatus[id]?.status || whatsappStatus[id]; // compat string ou objeto
    const getWsMotivo = (id) => whatsappStatus[id]?.motivo || '';
    const getWsTitle = (id, pedido) => {
        const st = getWsStatus(id);
        if (st === 'ok') return 'WhatsApp enviado!';
        if (st === 'erro') {
            const motivo = getWsMotivo(id) || pedido?.whatsappErro || 'Falha no envio';
            return `Erro: ${motivo}`;
        }
        return 'Enviar via WhatsApp';
    };

    const handleEnviarWhatsapp = async (id, tipo = 'pedido') => {
        setWhatsappStatus(prev => ({ ...prev, [id]: { status: 'enviando' } }));
        try {
            if (tipo === 'amostra') {
                await amostraService.enviarWhatsapp(id);
            } else {
                await pedidoService.enviarWhatsapp(id);
            }
            setWhatsappStatus(prev => ({ ...prev, [id]: { status: 'ok' } }));
            toast.success('WhatsApp enviado!');
        } catch (error) {
            const motivo = error.response?.data?.motivo || 'Erro ao enviar';
            setWhatsappStatus(prev => ({ ...prev, [id]: { status: 'erro', motivo } }));
            toast.error(motivo);
        }
    };

    // Salvar filtros no localStorage sempre que mudarem
    useEffect(() => {
        const key = `pedidos_filtros_v2_${user?.id}`;
        localStorage.setItem(key, JSON.stringify(filtros));
    }, [filtros, user]);

    const carregarDados = useCallback(async () => {
        try {
            setLoading(true);
            setLoadingAmostras(true);
            
            const params = {
                busca: filtros.busca,
                vendedorId: filtros.vendedorId,
            };

            if (filtros.dataEntregaDe && filtros.dataEntregaAte) {
                params.dataVendaDe = filtros.dataEntregaDe;
                params.dataVendaAte = filtros.dataEntregaAte;
            }

            if (filtros.dataCriacaoDe && filtros.dataCriacaoAte) {
                params.createdAtDe = filtros.dataCriacaoDe;
                params.createdAtAte = filtros.dataCriacaoAte;
            }

            // Se for aba de pedidos, especiais ou bonificacao, busca da tabela de pedidos
            if (abaAtiva === 'pedidos' || abaAtiva === 'especiais' || abaAtiva === 'bonificacao') {
                if (abaAtiva === 'bonificacao') {
                    params.bonificacao = 'true';
                } else {
                    params.especial = abaAtiva === 'especiais' ? 'true' : 'false';
                    params.bonificacao = 'false';
                }
                const data = await pedidoService.listar(params);
                setPedidos(data);
                // Inicializar status WhatsApp a partir dos dados persistidos
                const wsStatus = {};
                data.forEach(p => {
                    if (p.whatsappEnviado) wsStatus[p.id] = { status: 'ok' };
                    else if (p.whatsappErro) wsStatus[p.id] = { status: 'erro', motivo: p.whatsappErro };
                });
                setWhatsappStatus(prev => ({ ...prev, ...wsStatus }));
            } 
            // Se for aba de amostras, busca da tabela de amostras
            else if (abaAtiva === 'amostras') {
                // Adaptando params para amostras
                const amostraParams = { ...params };
                if (filtros.dataEntregaDe && filtros.dataEntregaAte) {
                    amostraParams.dataEntregaDe = filtros.dataEntregaDe;
                    amostraParams.dataEntregaAte = filtros.dataEntregaAte;
                    delete amostraParams.dataVendaDe;
                    delete amostraParams.dataVendaAte;
                }
                const data = await amostraService.listar(amostraParams);
                setAmostras(data);
            }

        } catch (error) {
            console.error("Erro ao carregar dados", error);
            toast.error("Erro ao carregar lista.");
        } finally {
            setLoading(false);
            setLoadingAmostras(false);
        }
    }, [abaAtiva, filtros]);

    useEffect(() => {
        carregarDados();
    }, [carregarDados]);

    useEffect(() => {
        if (podeVerTodosVendedores) {
            vendedorService.listar().then(v => {
                const list = Array.isArray(v) ? v : (v?.vendedores || []);
                setTodosVendedores(list.filter(v => v.ativo !== false));
            }).catch(() => {});
        }
    }, [podeVerTodosVendedores]);

    const handleAprovarEspecial = async (pedidoId) => {
        if (!podeAprovar) return;
        try {
            setAprovando(pedidoId);
            await pedidoService.aprovarEspecial(pedidoId);
            toast.success('Pedido especial aprovado!');
            setPedidos(prev => prev.map(p =>
                p.id === pedidoId ? { ...p, statusEnvio: 'RECEBIDO', situacaoCA: 'FATURADO' } : p
            ));
            if (selectedPedido?.id === pedidoId) {
                setSelectedPedido(prev => ({ ...prev, statusEnvio: 'RECEBIDO', situacaoCA: 'FATURADO' }));
            }
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao aprovar pedido.');
        } finally {
            setAprovando(null);
        }
    };

    const handleReverterEspecial = async (pedidoId) => {
        if (!podeReverter) return;
        if (!window.confirm('Tem certeza que deseja reverter este pedido para ABERTO? A conta a receber será cancelada.')) return;
        try {
            setRevertendo(pedidoId);
            await pedidoService.reverterEspecial(pedidoId);
            toast.success('Pedido revertido para ABERTO!');
            setPedidos(prev => prev.map(p =>
                p.id === pedidoId ? { ...p, statusEnvio: 'ABERTO', situacaoCA: null } : p
            ));
            if (selectedPedido?.id === pedidoId) {
                setSelectedPedido(prev => ({ ...prev, statusEnvio: 'ABERTO', situacaoCA: null }));
            }
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao reverter pedido.');
        } finally {
            setRevertendo(null);
        }
    };

    const handleAprovarBonificacao = async (pedidoId) => {
        if (!podeAprovarBonificacao) return;
        try {
            setAprovando(pedidoId);
            await pedidoService.aprovarBonificacao(pedidoId);
            toast.success('Bonificação aprovada!');
            setPedidos(prev => prev.map(p =>
                p.id === pedidoId ? { ...p, statusEnvio: 'RECEBIDO', situacaoCA: 'FATURADO' } : p
            ));
            if (selectedPedido?.id === pedidoId) {
                setSelectedPedido(prev => ({ ...prev, statusEnvio: 'RECEBIDO', situacaoCA: 'FATURADO' }));
            }
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao aprovar bonificação.');
        } finally {
            setAprovando(null);
        }
    };

    const handleReverterBonificacao = async (pedidoId) => {
        if (!podeReverterBonificacao) return;
        if (!window.confirm('Tem certeza que deseja reverter esta bonificação para ABERTO?')) return;
        try {
            setRevertendo(pedidoId);
            await pedidoService.reverterBonificacao(pedidoId);
            toast.success('Bonificação revertida para ABERTO!');
            setPedidos(prev => prev.map(p =>
                p.id === pedidoId ? { ...p, statusEnvio: 'ABERTO', situacaoCA: null } : p
            ));
            if (selectedPedido?.id === pedidoId) {
                setSelectedPedido(prev => ({ ...prev, statusEnvio: 'ABERTO', situacaoCA: null }));
            }
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao reverter bonificação.');
        } finally {
            setRevertendo(null);
        }
    };

    const handleExcluirPedido = async (pedido) => {
        const tipo = pedido.bonificacao ? 'bonificação' : pedido.especial ? 'pedido especial' : 'pedido';
        if (!window.confirm(`Tem certeza que deseja excluir este ${tipo}? Esta ação não pode ser desfeita.`)) return;
        try {
            await pedidoService.excluir(pedido.id);
            toast.success('Pedido excluído com sucesso!');
            setPedidos(prev => prev.filter(p => p.id !== pedido.id));
            if (selectedPedido?.id === pedido.id) setSelectedPedido(null);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao excluir pedido.');
        }
    };

    const handleExcluirAmostra = async (amostraId) => {
        if (!window.confirm('Tem certeza que deseja excluir esta amostra? Esta ação não pode ser desfeita.')) return;
        try {
            await amostraService.excluir(amostraId);
            toast.success('Amostra excluída com sucesso!');
            setAmostras(prev => prev.filter(a => a.id !== amostraId));
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao excluir amostra.');
        }
    };

    const handleAvancarAmostra = async (amostraId, statusAtual) => {
        const proximoStatus = { 'SOLICITADA': 'PREPARACAO', 'PREPARACAO': 'LIBERADO' };
        const proximo = proximoStatus[statusAtual];
        if (!proximo) return;
        try {
            await amostraService.atualizarStatus(amostraId, proximo);
            setAmostras(prev => prev.map(a => a.id === amostraId ? { ...a, status: proximo } : a));
            toast.success(`Amostra movida para ${proximo}`);
        } catch (error) {
            toast.error('Erro ao atualizar status da amostra.');
        }
    };

    const statusAmostraLabels = {
        'SOLICITADA': 'Solicitada',
        'PREPARACAO': 'Preparação',
        'LIBERADO': 'Liberado',
        'ENTREGUE': 'Entregue',
        'CANCELADA': 'Cancelada',
    };

    const statusAmostraCores = {
        'SOLICITADA': 'bg-blue-100 text-blue-800',
        'PREPARACAO': 'bg-yellow-100 text-yellow-800',
        'LIBERADO': 'bg-emerald-100 text-emerald-800',
        'ENTREGUE': 'bg-green-100 text-green-800',
        'CANCELADA': 'bg-red-100 text-red-700',
    };

    const StatusBadge = ({ status }) => {
        const colors = {
            'ABERTO': 'bg-gray-100 text-gray-800',
            'ENVIAR': 'bg-blue-100 text-blue-800',
            'SINCRONIZANDO': 'bg-yellow-100 text-yellow-800',
            'RECEBIDO': 'bg-green-100 text-green-800',
            'ERRO': 'bg-red-100 text-red-800',
            'EXCLUIDO': 'bg-red-100 text-red-700'
        };
        const colorClass = colors[status] || 'bg-gray-100 text-gray-800';
        return (
            <span className={`px-2 py-1 flex-shrink-0 inline-flex text-[10px] leading-tight font-semibold rounded-full ${colorClass}`}>
                {status}
            </span>
        );
    };

    const toggleSelecao = (id) => {
        setSelecionados(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleTodosFiltrados = () => {
        const pFaturados = pedidos.filter(p => p.situacaoCA === 'FATURADO');
        const ids = pFaturados.map(p => p.id);
        const todosJaSelecionados = ids.length > 0 && ids.every(id => selecionados.has(id));
        if (todosJaSelecionados) setSelecionados(new Set());
        else setSelecionados(new Set(ids));
    };

    const handlePrintPedido = async (pedido) => {
        try {
            await pedidoService.registrarImpressao(pedido.id);
            setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, impressoEm: new Date().toISOString() } : p));
            if (selectedPedido?.id === pedido.id) {
                setSelectedPedido(prev => ({ ...prev, impressoEm: new Date().toISOString() }));
            }
        } catch (error) {
            console.error('Erro ao registrar impressão', error);
        }
        navigate(`/pedidos/imprimir/${pedido.id}`);
    };

    const imprimirSelecionados = async () => {
        if (selecionados.size === 0) return;
        const idsArray = Array.from(selecionados);
        try {
            await Promise.all(idsArray.map(id => pedidoService.registrarImpressao(id)));
            const now = new Date().toISOString();
            setPedidos(prev => prev.map(p => idsArray.includes(p.id) ? { ...p, impressoEm: now } : p));
        } catch (error) {
            console.error('Erro ao registrar impressões em lote', error);
        }
        const ids = idsArray.join(',');
        navigate(`/pedidos/imprimir/lote?ids=${ids}`);
    };

    const filtrosPadrao = React.useMemo(() => {
        const hoje = new Date().toISOString().split('T')[0];
        const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        return { dataEntregaDe: trintaDiasAtras, dataEntregaAte: hoje, dataCriacaoDe: '', dataCriacaoAte: '', vendedorId: '', busca: '' };
    }, []);

    const isFiltroAtivo = React.useMemo(() => {
        if (filtros.vendedorId) return true;
        if (filtros.dataCriacaoDe || filtros.dataCriacaoAte) return true;
        if (filtros.dataEntregaDe !== filtrosPadrao.dataEntregaDe || filtros.dataEntregaAte !== filtrosPadrao.dataEntregaAte) return true;
        return false;
    }, [filtros, filtrosPadrao]);

    const limparFiltros = () => {
        setFiltros({ ...filtrosPadrao });
    };

    // Retorno do render
    return (
        <div className="w-full py-4 sm:py-6 overflow-x-hidden">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-lg sm:text-2xl font-black text-gray-900 flex items-center gap-2">
                    <Package className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                    Pedidos
                </h1>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4 mb-4">
                <div className="flex gap-2 w-full">
                    <div className="relative flex-1 min-w-0">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            autoFocus
                            type="text"
                            placeholder="Buscar cliente, vendedor, nº..."
                            value={filtros.busca}
                            onChange={e => setFiltros(prev => ({ ...prev, busca: e.target.value }))}
                            className="w-full pl-9 pr-8 py-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-primary focus:border-primary text-sm shadow-sm"
                        />
                        {filtros.busca && (
                            <button
                                onClick={() => setFiltros(prev => ({ ...prev, busca: '' }))}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`p-1.5 rounded border transition-colors relative shrink-0 ${showFilters || isFiltroAtivo ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                        title="Filtros avançados"
                    >
                        <Filter className="h-5 w-5" />
                        {isFiltroAtivo && !showFilters && (
                            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 border border-white"></span>
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* Painel de Filtros Avançados */}
            {showFilters && (
                <div className="mb-4 bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200 shadow-sm animate-in fade-in slide-in-from-top-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
                        {/* Data de Entrega */}
                        <div className="space-y-2 lg:col-span-2">
                            <label className="text-[11px] font-bold text-gray-500 uppercase flex items-center gap-1.5">
                                <Calendar className="h-3 w-3" /> Data de Entrega
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <p className="text-[10px] text-gray-400 mb-0.5">De</p>
                                    <input
                                        type="date"
                                        value={filtros.dataEntregaDe}
                                        onChange={e => setFiltros(prev => ({ ...prev, dataEntregaDe: e.target.value }))}
                                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:border-primary focus:ring-0"
                                    />
                                </div>
                                <div>
                                    <p className="text-[10px] text-gray-400 mb-0.5">Até</p>
                                    <input
                                        type="date"
                                        value={filtros.dataEntregaAte}
                                        onChange={e => setFiltros(prev => ({ ...prev, dataEntregaAte: e.target.value }))}
                                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:border-primary focus:ring-0"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Data de Criação */}
                        <div className="space-y-2 lg:col-span-2">
                            <label className="text-[11px] font-bold text-gray-500 uppercase flex items-center gap-1.5">
                                <Calendar className="h-3 w-3" /> Emissão/Criação
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <p className="text-[10px] text-gray-400 mb-0.5">De</p>
                                    <input
                                        type="date"
                                        value={filtros.dataCriacaoDe}
                                        onChange={e => setFiltros(prev => ({ ...prev, dataCriacaoDe: e.target.value }))}
                                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:border-primary focus:ring-0"
                                    />
                                </div>
                                <div>
                                    <p className="text-[10px] text-gray-400 mb-0.5">Até</p>
                                    <input
                                        type="date"
                                        value={filtros.dataCriacaoAte}
                                        onChange={e => setFiltros(prev => ({ ...prev, dataCriacaoAte: e.target.value }))}
                                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:border-primary focus:ring-0"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Vendedor */}
                        <div className="space-y-2 lg:col-span-1">
                            <label className="text-[11px] font-bold text-gray-500 uppercase flex items-center gap-1.5">
                                <User className="h-3 w-3" /> Vendedor
                            </label>
                            <select
                                value={filtros.vendedorId}
                                disabled={!podeVerTodosVendedores}
                                onChange={e => setFiltros(prev => ({ ...prev, vendedorId: e.target.value }))}
                                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:border-primary focus:ring-0 bg-white"
                            >
                                <option value="">Todos</option>
                                {todosVendedores.map(v => (
                                    <option key={v.id} value={v.id}>{v.nome}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    {isFiltroAtivo && (
                        <div className="mt-3 flex justify-end">
                            <button
                                onClick={limparFiltros}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-500 hover:text-white hover:bg-red-500 border border-red-300 rounded-full transition-colors"
                            >
                                <X className="h-3.5 w-3.5" />
                                Limpar filtros
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Abas: Pedidos | Especiais | Bonificação | Amostras */}
            <div className="mb-2">
                <div className="flex overflow-x-auto scrollbar-hide gap-1 pb-0.5">
                    <button
                        onClick={() => setAbaAtiva('pedidos')}
                        className={`flex-shrink-0 px-3 py-1.5 text-[12px] sm:text-[13px] font-bold rounded-t border transition-colors ${abaAtiva === 'pedidos' ? 'bg-white text-blue-700 border-gray-200 border-b-white z-10 -mb-[1px]' : 'bg-gray-100 text-gray-500 border-transparent hover:text-gray-700'}`}
                    >
                        Pedidos
                    </button>
                    <button
                        onClick={() => setAbaAtiva('especiais')}
                        className={`flex-shrink-0 px-3 py-1.5 text-[12px] sm:text-[13px] font-bold rounded-t border transition-colors ${abaAtiva === 'especiais' ? 'bg-white text-purple-700 border-gray-200 border-b-white z-10 -mb-[1px]' : 'bg-gray-100 text-gray-500 border-transparent hover:text-gray-700'}`}
                    >
                        Especiais
                    </button>
                    <button
                        onClick={() => setAbaAtiva('bonificacao')}
                        className={`flex-shrink-0 px-3 py-1.5 text-[12px] sm:text-[13px] font-bold rounded-t border transition-colors ${abaAtiva === 'bonificacao' ? 'bg-white text-green-700 border-gray-200 border-b-white z-10 -mb-[1px]' : 'bg-gray-100 text-gray-500 border-transparent hover:text-gray-700'}`}
                    >
                        Bonificação
                    </button>
                    <button
                        onClick={() => setAbaAtiva('amostras')}
                        className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 text-[12px] sm:text-[13px] font-bold rounded-t border transition-colors ${abaAtiva === 'amostras' ? 'bg-white text-orange-700 border-gray-200 border-b-white z-10 -mb-[1px]' : 'bg-gray-100 text-gray-500 border-transparent hover:text-gray-700'}`}
                    >
                        <Package className="h-3.5 w-3.5" />
                        Amostras
                    </button>
                </div>
                {!['amostras', 'bonificacao'].includes(abaAtiva) && pedidos.filter(p => p.situacaoCA === 'FATURADO').length > 0 && (
                    <button
                        onClick={toggleTodosFiltrados}
                        className="mt-1 px-2 py-1 text-[10px] font-medium text-gray-500 hover:text-purple-600 transition-colors"
                    >
                        {pedidos.filter(p => p.situacaoCA === 'FATURADO').every(p => selecionados.has(p.id)) ? 'Desmarcar todos' : 'Selecionar faturados'}
                    </button>
                )}
            </div>

            {/* Filtro rápido por status */}
            {!['amostras'].includes(abaAtiva) && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                    {[
                        { key: 'TODOS', label: 'Todos', active: 'bg-gray-200 text-gray-800 border-gray-400' },
                        { key: 'ABERTO', label: 'Aberto', active: 'bg-gray-100 text-gray-800 border-gray-300' },
                        { key: 'ENVIAR', label: 'Enviar', active: 'bg-blue-100 text-blue-800 border-blue-300' },
                        { key: 'SINCRONIZANDO', label: 'Sincroniz.', active: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
                        { key: 'RECEBIDO', label: 'Recebido', active: 'bg-green-100 text-green-800 border-green-300' },
                        { key: 'ERRO', label: 'Erro', active: 'bg-red-100 text-red-800 border-red-300' },
                        { key: 'FATURADO', label: 'Faturado', active: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
                    ].map(({ key, label, active }) => {
                        const ativo = filtroStatus === key;
                        const count = key === 'TODOS' ? pedidos.length
                            : key === 'FATURADO' ? pedidos.filter(p => p.situacaoCA === 'FATURADO').length
                            : pedidos.filter(p => p.statusEnvio === key && p.situacaoCA !== 'FATURADO').length;
                        return (
                            <button
                                key={key}
                                onClick={() => setFiltroStatus(key)}
                                className={`px-2.5 py-1 text-[11px] font-bold rounded-full border transition-colors ${ativo
                                    ? active
                                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                                }`}
                            >
                                {label} {count > 0 && <span className="ml-0.5 text-[10px] opacity-70">({count})</span>}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Barra de seleção em lote */}
            {abaAtiva !== 'amostras' && selecionados.size > 0 && (
                <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded px-2 sm:px-3 py-2 mb-2">
                    <div className="flex items-center gap-1.5 text-xs sm:text-sm text-purple-700">
                        <CheckSquare className="h-4 w-4" />
                        <span className="font-bold">{selecionados.size} selecionado{selecionados.size > 1 ? 's' : ''}</span>
                        <button onClick={() => setSelecionados(new Set())} className="text-purple-500 hover:text-purple-700 ml-1">
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    <button
                        onClick={imprimirSelecionados}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-purple-600 text-white rounded hover:bg-purple-700"
                    >
                        <Printer className="h-3.5 w-3.5" />
                        Imprimir {selecionados.size}
                    </button>
                </div>
            )}

            {/* Conteúdo: Amostras */}
            {abaAtiva === 'amostras' ? (
                <div className="bg-white rounded overflow-hidden border border-gray-200">
                    <div className="divide-y divide-gray-200">
                        {loadingAmostras ? (
                            <div className="p-8 text-center text-gray-500">Carregando...</div>
                        ) : amostras.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">Nenhuma amostra encontrada no período.</div>
                        ) : (
                            amostras.map(amostra => {
                                const isExpanded = expandedAmostra === amostra.id;
                                const nomeDestinatario = amostra.cliente?.NomeFantasia || amostra.cliente?.Nome || amostra.lead?.nomeEstabelecimento || 'Destinatário Desconhecido';
                                const cidadeBairro = amostra.cliente ? `${amostra.cliente.End_Cidade || ''} ${amostra.cliente.End_Bairro ? ' - ' + amostra.cliente.End_Bairro : ''}` : '';
                                
                                return (
                                    <div key={amostra.id} className="border-b border-gray-100">
                                        <div
                                            className="p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                                            onClick={() => setExpandedAmostra(isExpanded ? null : amostra.id)}
                                        >
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border text-orange-700 bg-orange-50 border-orange-200 shadow-sm shrink-0">
                                                            AM#{amostra.numero}
                                                        </span>
                                                        <h3 className="text-[14px] font-bold text-gray-900 truncate">
                                                            {nomeDestinatario}
                                                        </h3>
                                                    </div>
                                                    <div className="flex flex-col gap-0.5 text-[11px] text-gray-500 mb-1">
                                                        <div className="flex items-center gap-1 font-medium">
                                                            <span className="text-gray-800">Entrega: {amostra.dataEntrega ? new Date(amostra.dataEntrega).toLocaleDateString('pt-BR') : '-'}</span>
                                                            <span className="text-gray-300">|</span>
                                                            <span>Criação: {new Date(amostra.createdAt).toLocaleDateString('pt-BR')}</span>
                                                        </div>
                                                        {cidadeBairro.trim() && <div className="text-gray-400 capitalize">{cidadeBairro.toLowerCase()}</div>}
                                                        <div className="text-[10px] text-gray-400">Solicitado por: {amostra.solicitadoPor?.nome || '-'}</div>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${statusAmostraCores[amostra.status] || 'bg-gray-100 text-gray-800'}`}>
                                                        {statusAmostraLabels[amostra.status]}
                                                    </span>
                                                    <div className="flex items-center gap-1 mt-1">
                                                        {amostra.clienteId && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleEnviarWhatsapp(amostra.id, 'amostra'); }}
                                                                disabled={getWsStatus(amostra.id) === 'enviando'}
                                                                className={`p-1 rounded hover:bg-gray-100 ${getWsStatus(amostra.id) === 'ok' ? 'text-green-500' : getWsStatus(amostra.id) === 'erro' ? 'text-red-500' : 'text-gray-400 hover:text-green-600'}`}
                                                                title={getWsTitle(amostra.id, amostra)}
                                                            >
                                                                {getWsStatus(amostra.id) === 'enviando' ? <Loader2 className="h-4 w-4 animate-spin" /> : getWsStatus(amostra.id) === 'ok' ? <CheckCircle className="h-4 w-4" /> : getWsStatus(amostra.id) === 'erro' ? <XCircle className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                                                            </button>
                                                        )}
                                                        {podeExcluirAmostra && (amostra.status !== 'ENTREGUE' || user?.permissoes?.admin) && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleExcluirAmostra(amostra.id); }}
                                                                className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100"
                                                                title="Excluir Amostra"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                        {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        {isExpanded && (
                                            <div className="px-3 pb-3 space-y-2 animate-in fade-in transition-all">
                                                {amostra.itens?.map(item => (
                                                    <div key={item.id} className="flex items-center justify-between bg-orange-50/50 px-3 py-1.5 rounded border border-orange-100/50 text-sm">
                                                        <span className="font-medium text-gray-700">{item.nomeProduto}</span>
                                                        <span className="font-bold text-gray-900">{Number(item.quantidade)} un</span>
                                                    </div>
                                                ))}
                                                <div className="flex items-center gap-2 pt-2">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); navigate(`/pedidos/imprimir/${amostra.id}?tipo=amostra`); }}
                                                        className="text-[11px] font-bold px-3 py-1.5 rounded border bg-white border-gray-300 text-gray-600 hover:bg-gray-50 flex items-center gap-1.5"
                                                    >
                                                        <Printer className="h-3.5 w-3.5" /> Imprimir
                                                    </button>
                                                    {['SOLICITADA', 'PREPARACAO'].includes(amostra.status) && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleAvancarAmostra(amostra.id, amostra.status); }}
                                                            className="text-[11px] font-bold px-3 py-1.5 rounded border bg-orange-500 border-orange-600 text-white hover:bg-orange-600 shadow-sm"
                                                        >
                                                            Avançar status
                                                        </button>
                                                    )}
                                                
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            ) : (
                /* Conteúdo: Pedidos e Especiais */
                <div className="bg-white rounded overflow-hidden border border-gray-200">
                    <div className="divide-y divide-gray-200">
                        {loading ? (
                            <div className="p-8 text-center text-gray-500">Carregando pedidos...</div>
                        ) : pedidos.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">Nenhum pedido encontrado nos filtros aplicados.</div>
                        ) : (
                            pedidos.filter(p => {
                                if (filtroStatus === 'TODOS') return true;
                                if (filtroStatus === 'FATURADO') return p.situacaoCA === 'FATURADO';
                                return p.statusEnvio === filtroStatus && p.situacaoCA !== 'FATURADO';
                            }).map((pedido) => (
                                <div key={pedido.id} className="px-3 pt-3 pb-2 hover:bg-gray-50 transition-colors border-b border-gray-100 overflow-hidden">
                                    {/* Linha 1: checkbox + número + cliente + valor */}
                                    <div className="flex items-start gap-2 mb-1">
                                        {pedido.situacaoCA === 'FATURADO' && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); toggleSelecao(pedido.id); }}
                                                className="mt-0.5 flex-shrink-0 text-gray-400 hover:text-primary transition-colors"
                                            >
                                                {selecionados.has(pedido.id) ? <CheckSquare className="h-5 w-5 text-primary" /> : <Square className="h-5 w-5" />}
                                            </button>
                                        )}
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 shadow-sm mt-0.5 ${pedido.especial ? 'text-purple-700 bg-purple-50 border-purple-200' : 'text-blue-700 bg-blue-50 border-blue-100'}`}>
                                            {fmtNumero(pedido)}
                                        </span>
                                        <h3 className="text-[13px] font-bold text-gray-900 truncate flex-1 min-w-0">
                                            {pedido.cliente?.NomeFantasia || pedido.cliente?.Nome || 'Cliente Desconhecido'}
                                        </h3>
                                        <span className="text-[13px] font-black text-gray-900 whitespace-nowrap shrink-0 ml-1">
                                            R$ {Number(pedido.itens?.reduce((acc, i) => acc + (Number(i.valor) * Number(i.quantidade)), 0) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>

                                    {/* Linha 2: infos */}
                                    <div className="flex flex-col gap-0.5 text-[11px] text-gray-500 mb-2 pl-0">
                                        <div className="flex items-center gap-1 font-medium flex-wrap">
                                            <span className="text-gray-800">Entrega: {pedido.dataVenda ? new Date(pedido.dataVenda).toLocaleDateString('pt-BR') : '-'}</span>
                                            <span className="text-gray-300">|</span>
                                            <span>Criação: {new Date(pedido.createdAt).toLocaleDateString('pt-BR')}</span>
                                        </div>
                                        <div className="uppercase text-gray-400">
                                            {pedido.cliente?.End_Cidade || ''}{pedido.cliente?.End_Bairro ? ` - ${pedido.cliente.End_Bairro}` : ''}
                                        </div>
                                        <div className="text-[10px] text-gray-400">Vendedor: {pedido.vendedor?.nome || '-'}</div>
                                    </div>

                                    {/* Linha 3: badges de status + botões de ação */}
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex flex-wrap items-center gap-1 min-w-0">
                                            <StatusBadge status={pedido.statusEnvio} />
                                            {pedido.situacaoCA && (
                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border shadow-sm ${pedido.situacaoCA === 'FATURADO' ? 'text-green-700 bg-green-50 border-green-200' : 'text-blue-700 bg-blue-50 border-blue-100'}`}>
                                                    {pedido.especial ? '' : 'CA: '}{pedido.situacaoCA}
                                                </span>
                                            )}
                                            {pedido.revisaoPendente && <span className="text-[9px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded flex items-center gap-0.5"><AlertCircle className="h-2.5 w-2.5" /> ALT ERP</span>}
                                            {pedido.impressoEm && (
                                                <span className="text-[9px] font-bold text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 shadow-sm flex items-center gap-0.5" title={`Impresso em: ${new Date(pedido.impressoEm).toLocaleString('pt-BR')}`}>
                                                    <Printer className="h-2.5 w-2.5" /> Impresso
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-0.5 shrink-0">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleEnviarWhatsapp(pedido.id, 'pedido'); }}
                                                disabled={getWsStatus(pedido.id) === 'enviando'}
                                                className={`p-1.5 rounded hover:bg-gray-100 ${getWsStatus(pedido.id) === 'ok' ? 'text-green-500' : getWsStatus(pedido.id) === 'erro' ? 'text-red-500' : 'text-gray-400 hover:text-green-600'}`}
                                                title={getWsTitle(pedido.id, pedido)}
                                            >
                                                {getWsStatus(pedido.id) === 'enviando' ? <Loader2 className="h-4 w-4 animate-spin" /> : getWsStatus(pedido.id) === 'ok' ? <CheckCircle className="h-4 w-4" /> : getWsStatus(pedido.id) === 'erro' ? <XCircle className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                                            </button>
                                            {pedido.situacaoCA === 'FATURADO' && (
                                                <button onClick={(e) => { e.stopPropagation(); handlePrintPedido(pedido); }} className="p-1.5 text-gray-400 hover:text-purple-600 rounded hover:bg-gray-100" title="Imprimir Pedido"><Printer className="h-4 w-4" /></button>
                                            )}
                                            {(pedido.bonificacao ? podeExcluirBonificacao : pedido.especial ? podeExcluirEspecial : podeExcluirPedido) && !pedido.embarqueId && (!pedido.statusEntrega || pedido.statusEntrega === 'PENDENTE') && !['FATURADO', 'EM_ABERTO'].includes(pedido.situacaoCA) && (
                                                <button onClick={(e) => { e.stopPropagation(); handleExcluirPedido(pedido); }} className="p-1.5 text-gray-300 hover:text-red-600 rounded hover:bg-gray-100" title="Excluir pedido"><Trash2 className="h-4 w-4" /></button>
                                            )}
                                            <button
                                                onClick={() => {
                                                    const bloq = pedido.statusEnvio === 'RECEBIDO' || ['APROVADO', 'FATURADO', 'EM_ABERTO'].includes(pedido.situacaoCA);
                                                    if (['ABERTO', 'ERRO'].includes(pedido.statusEnvio) && !bloq) navigate(`/pedidos/editar/${pedido.id}`);
                                                    else setSelectedPedido(pedido);
                                                }}
                                                className="px-2.5 py-1.5 text-[11px] font-bold bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 shadow-sm whitespace-nowrap"
                                            >
                                                {(['ABERTO', 'ERRO'].includes(pedido.statusEnvio) && !(['APROVADO', 'FATURADO', 'EM_ABERTO'].includes(pedido.situacaoCA))) ? 'Editar' : 'Detalhes'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Modal de Detalhes */}
            {selectedPedido && (
                <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-end sm:items-center justify-center sm:p-2 z-50 animate-in fade-in">
                    <div className="bg-white rounded-t-xl sm:rounded-lg shadow-2xl w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[90vh] flex flex-col">
                        <div className="flex justify-between items-center p-3 sm:p-4 border-b">
                            <div className="min-w-0">
                                <h2 className="text-base sm:text-lg font-black text-gray-900 truncate">
                                    Pedido {fmtNumero(selectedPedido)}
                                </h2>
                                <p className="text-xs text-gray-500 truncate">{selectedPedido.cliente?.NomeFantasia || selectedPedido.cliente?.Nome}</p>
                            </div>
                            <button onClick={() => setSelectedPedido(null)} className="p-2 text-gray-400 hover:text-gray-700 shrink-0"><X className="h-6 w-6" /></button>
                        </div>
                        <div className="p-3 sm:p-4 overflow-y-auto flex-1 space-y-3 sm:space-y-4">
                            {/* Actions area inside modal */}
                            {selectedPedido.especial && selectedPedido.statusEnvio === 'ENVIAR' && (
                                <div className="bg-purple-50 p-3 rounded border border-purple-200 flex flex-wrap justify-between items-center gap-2">
                                    <span className="text-sm font-bold text-purple-900">Pendente de aprovação</span>
                                    <div className="flex gap-2">
                                        <button onClick={() => { setSelectedPedido(null); navigate(`/pedidos/editar/${selectedPedido.id}`); }} className="px-4 py-2 bg-blue-600 text-white rounded font-bold text-sm shadow-sm flex items-center gap-1">
                                            <Pencil className="h-4 w-4" /> Editar
                                        </button>
                                        {podeAprovar && (
                                            <button onClick={() => handleAprovarEspecial(selectedPedido.id)} className="px-4 py-2 bg-purple-600 text-white rounded font-bold text-sm shadow-sm">Aprovar agora</button>
                                        )}
                                    </div>
                                </div>
                            )}
                            {selectedPedido.especial && selectedPedido.statusEnvio === 'RECEBIDO' && podeReverter && (
                                <div className="bg-orange-50 p-3 rounded border border-orange-200 flex flex-wrap justify-between items-center gap-2">
                                    <span className="text-sm font-bold text-orange-900">Pedido faturado</span>
                                    <button
                                        onClick={() => handleReverterEspecial(selectedPedido.id)}
                                        disabled={revertendo === selectedPedido.id}
                                        className="px-4 py-2 bg-orange-600 text-white rounded font-bold text-sm shadow-sm flex items-center gap-1 hover:bg-orange-700 disabled:opacity-50"
                                    >
                                        <RotateCcw className="h-4 w-4" /> {revertendo === selectedPedido.id ? 'Revertendo...' : 'Reverter para Aberto'}
                                    </button>
                                </div>
                            )}
                            {selectedPedido.especial && ['ABERTO', 'ERRO'].includes(selectedPedido.statusEnvio) && !(['APROVADO', 'FATURADO', 'EM_ABERTO'].includes(selectedPedido.situacaoCA)) && (
                                <div className="bg-blue-50 p-3 rounded border border-blue-200 flex flex-wrap justify-between items-center gap-2">
                                    <span className="text-sm font-bold text-blue-900">Pedido em aberto</span>
                                    <div className="flex gap-2">
                                        <button onClick={() => { setSelectedPedido(null); navigate(`/pedidos/editar/${selectedPedido.id}`); }} className="px-4 py-2 bg-blue-600 text-white rounded font-bold text-sm shadow-sm flex items-center gap-1">
                                            <Pencil className="h-4 w-4" /> Editar
                                        </button>
                                        {podeAprovar && (
                                            <button onClick={() => handleAprovarEspecial(selectedPedido.id)} className="px-4 py-2 bg-green-600 text-white rounded font-bold text-sm shadow-sm flex items-center gap-1">
                                                <CheckCircle className="h-4 w-4" /> Faturar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Bonificação: pendente de aprovação */}
                            {selectedPedido.bonificacao && selectedPedido.statusEnvio === 'ENVIAR' && (
                                <div className="bg-green-50 p-3 rounded border border-green-200 flex flex-wrap justify-between items-center gap-2">
                                    <span className="text-sm font-bold text-green-900">Bonificação pendente de aprovação</span>
                                    <div className="flex gap-2">
                                        <button onClick={() => { setSelectedPedido(null); navigate(`/pedidos/editar/${selectedPedido.id}`); }} className="px-4 py-2 bg-blue-600 text-white rounded font-bold text-sm shadow-sm flex items-center gap-1">
                                            <Pencil className="h-4 w-4" /> Editar
                                        </button>
                                        {podeAprovarBonificacao && (
                                            <button onClick={() => handleAprovarBonificacao(selectedPedido.id)} disabled={aprovando === selectedPedido.id} className="px-4 py-2 bg-green-600 text-white rounded font-bold text-sm shadow-sm disabled:opacity-50">{aprovando === selectedPedido.id ? 'Aprovando...' : 'Aprovar agora'}</button>
                                        )}
                                    </div>
                                </div>
                            )}
                            {/* Bonificação: faturada */}
                            {selectedPedido.bonificacao && selectedPedido.statusEnvio === 'RECEBIDO' && podeReverterBonificacao && (
                                <div className="bg-orange-50 p-3 rounded border border-orange-200 flex flex-wrap justify-between items-center gap-2">
                                    <span className="text-sm font-bold text-orange-900">Bonificação faturada</span>
                                    <button
                                        onClick={() => handleReverterBonificacao(selectedPedido.id)}
                                        disabled={revertendo === selectedPedido.id}
                                        className="px-4 py-2 bg-orange-600 text-white rounded font-bold text-sm shadow-sm flex items-center gap-1 hover:bg-orange-700 disabled:opacity-50"
                                    >
                                        <RotateCcw className="h-4 w-4" /> {revertendo === selectedPedido.id ? 'Revertendo...' : 'Reverter para Aberto'}
                                    </button>
                                </div>
                            )}
                            {/* Bonificação: em aberto */}
                            {selectedPedido.bonificacao && ['ABERTO', 'ERRO'].includes(selectedPedido.statusEnvio) && !(['APROVADO', 'FATURADO', 'EM_ABERTO'].includes(selectedPedido.situacaoCA)) && (
                                <div className="bg-green-50 p-3 rounded border border-green-200 flex flex-wrap justify-between items-center gap-2">
                                    <span className="text-sm font-bold text-green-900">Bonificação em aberto</span>
                                    <div className="flex gap-2">
                                        <button onClick={() => { setSelectedPedido(null); navigate(`/pedidos/editar/${selectedPedido.id}`); }} className="px-4 py-2 bg-blue-600 text-white rounded font-bold text-sm shadow-sm flex items-center gap-1">
                                            <Pencil className="h-4 w-4" /> Editar
                                        </button>
                                        {podeAprovarBonificacao && (
                                            <button onClick={() => handleAprovarBonificacao(selectedPedido.id)} disabled={aprovando === selectedPedido.id} className="px-4 py-2 bg-green-600 text-white rounded font-bold text-sm shadow-sm flex items-center gap-1 disabled:opacity-50">
                                                <CheckCircle className="h-4 w-4" /> Faturar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                            
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                                <div><p className="text-[10px] uppercase font-bold text-gray-400">Entrega</p><p className="font-bold">{new Date(selectedPedido.dataVenda).toLocaleDateString('pt-BR')}</p></div>
                                <div><p className="text-[10px] uppercase font-bold text-gray-400">Emissão</p><p className="font-medium">{new Date(selectedPedido.createdAt).toLocaleDateString('pt-BR')}</p></div>
                                <div className="col-span-2"><p className="text-[10px] uppercase font-bold text-gray-400">Pagamento</p><p className="font-medium">{selectedPedido.nomeCondicaoPagamento || 'N/D'}</p></div>
                            </div>

                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 space-y-2">
                                <p className="text-[10px] uppercase font-bold text-gray-400">Itens</p>
                                {selectedPedido.itens?.map(item => (
                                    <div key={item.id} className="flex justify-between text-sm py-1 border-b border-gray-200 last:border-0">
                                        <div className="pr-4">
                                            <p className="font-bold text-gray-800">{item.produto?.nome || item.descricao}</p>
                                            <p className="text-[10px] text-gray-500">{Number(item.quantidade)} un x R$ {Number(item.valor).toFixed(2).replace('.', ',')}</p>
                                        </div>
                                        <span className="font-bold whitespace-nowrap">R$ {(Number(item.quantidade) * Number(item.valor)).toFixed(2).replace('.', ',')}</span>
                                    </div>
                                ))}
                            </div>

                            {selectedPedido.observacoes && (
                                <div className="bg-yellow-50/50 p-3 rounded border border-yellow-100">
                                    <p className="text-[10px] uppercase font-bold text-yellow-600 mb-1">Observações</p>
                                    <p className="text-sm italic text-gray-700">{selectedPedido.observacoes}</p>
                                </div>
                            )}
                        </div>
                        <div className="p-3 sm:p-4 border-t bg-gray-50 flex justify-between items-center gap-2">
                            <div className="min-w-0">
                                <p className="text-[10px] uppercase font-bold text-gray-400 leading-none">Total Geral</p>
                                <p className="text-xl sm:text-2xl font-black text-primary whitespace-nowrap">R$ {Number(selectedPedido.itens?.reduce((acc, i) => acc + (Number(i.valor) * Number(i.quantidade)), 0) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleEnviarWhatsapp(selectedPedido.id, 'pedido')}
                                    disabled={getWsStatus(selectedPedido.id) === 'enviando'}
                                    className={`p-2 rounded flex items-center gap-1.5 border ${getWsStatus(selectedPedido.id) === 'ok' ? 'border-green-300 bg-green-50 text-green-700' : getWsStatus(selectedPedido.id) === 'erro' ? 'border-red-300 bg-red-50 text-red-700' : 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'}`}
                                    title={getWsTitle(selectedPedido.id, selectedPedido)}
                                >
                                    {getWsStatus(selectedPedido.id) === 'enviando' ? <Loader2 className="h-5 w-5 animate-spin" /> : getWsStatus(selectedPedido.id) === 'ok' ? <CheckCircle className="h-5 w-5" /> : getWsStatus(selectedPedido.id) === 'erro' ? <XCircle className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
                                </button>
                                {selectedPedido.situacaoCA === 'FATURADO' && (
                                    <button onClick={() => handlePrintPedido(selectedPedido)} className="p-2 border border-purple-300 bg-purple-50 text-purple-700 rounded hover:bg-purple-100 flex items-center gap-1.5"><Printer className="h-5 w-5" /></button>
                                )}
                                <button onClick={() => setSelectedPedido(null)} className="px-6 py-2 bg-gray-900 text-white rounded font-bold text-sm">Fechar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ListaPedidos;
