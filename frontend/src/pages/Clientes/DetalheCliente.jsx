import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import clienteService from '../../services/clienteService';
import vendedorService from '../../services/vendedorService';
import tabelaPrecoService from '../../services/tabelaPrecoService';
import condicaoPagamentoService from '../../services/condicaoPagamentoService';
import MultiSelect from '../../components/MultiSelect';
import atendimentoService from '../../services/atendimentoService';
import pedidoService from '../../services/pedidoService';
import categoriaClienteService from '../../services/categoriaClienteService';
import clienteInsightService from '../../services/clienteInsightService';
import leadService from '../../services/leadService';
import { API_URL } from '../../services/api';
import { ArrowLeft, MapPin, Phone, Mail, Calendar, FileText, Save, X, User, Building, DollarSign, MessageCircle, Clock, ClipboardList, ShoppingCart, Package, Sparkles, RefreshCw, Image, UserPlus, Search } from 'lucide-react';

const DIAS_SEMANA = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM', 'N/D'];

const DayPicker = ({ label, selected, onChange }) => {
    const selectedDays = selected ? selected.split(',').map(d => d.trim()) : [];

    const toggleDay = (day) => {
        let newDays;
        if (selectedDays.includes(day)) {
            newDays = selectedDays.filter(d => d !== day);
        } else {
            newDays = [...selectedDays, day];
            newDays.sort((a, b) => DIAS_SEMANA.indexOf(a) - DIAS_SEMANA.indexOf(b));
        }
        onChange(newDays.join(', '));
    };

    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
            <div className="flex flex-wrap gap-2">
                {DIAS_SEMANA.map(day => (
                    <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={`px-3 py-2 text-xs font-bold rounded border transition-colors ${selectedDays.includes(day)
                            ? 'bg-primary text-white border-primary'
                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                            }`}
                    >
                        {day}
                    </button>
                ))}
            </div>
        </div>
    );
};

const DetalheCliente = () => {
    const { uuid } = useParams();
    const navigate = useNavigate();
    const [cliente, setCliente] = useState(null);
    const [condicoesPagamento, setCondicoesPagamento] = useState([]);
    const [condicoesPagamentoCA, setCondicoesPagamentoCA] = useState([]);
    const [vendedores, setVendedores] = useState([]);
    const [categoriasCliente, setCategoriasCliente] = useState([]);
    const [loading, setLoading] = useState(true);
    const [abaAtiva, setAbaAtiva] = useState('dados');
    const [atendimentos, setAtendimentos] = useState([]);
    const [pedidosCliente, setPedidosCliente] = useState([]);

    // Stage 2: Insights
    const [insight, setInsight] = useState(null);
    const [recalculandoInsight, setRecalculandoInsight] = useState(false);

    // Leads vinculados
    const [leadsCliente, setLeadsCliente] = useState([]);

    const [formData, setFormData] = useState({
        Dia_de_entrega: '',
        Dia_de_venda: '',
        Ponto_GPS: '',
        Observacoes_Gerais: '',
        Condicao_de_pagamento: '',
        idVendedor: '',
        Formas_Atendimento: [],
        condicoes_pagamento_permitidas: [],
        indicacaoId: '',
        categoriaClienteId: '',
        cicloCompraPersonalizadoDias: '',
        insightAtivo: true,
        observacaoComercialFixa: ''
    });

    // Indicação (busca de cliente)
    const [indicacaoSearch, setIndicacaoSearch] = useState('');
    const [indicacaoResultados, setIndicacaoResultados] = useState([]);
    const [indicacaoNome, setIndicacaoNome] = useState('');
    const [showIndicacaoDropdown, setShowIndicacaoDropdown] = useState(false);

    useEffect(() => {
        fetchData();
    }, [uuid]);

    const fetchData = async () => {
        try {
            const [clienteData, condicoesData, condicoesCAData, vendedoresData, categoriasCli] = await Promise.all([
                clienteService.detalhar(uuid),
                tabelaPrecoService.listar(),
                condicaoPagamentoService.listar(),
                vendedorService.listar(),
                categoriaClienteService.listar().catch(() => [])
            ]);

            setCliente(clienteData);
            setCondicoesPagamento(condicoesData);
            setCondicoesPagamentoCA(condicoesCAData);
            setVendedores(vendedoresData);
            setCategoriasCliente(categoriasCli);

            try {
                const atends = await atendimentoService.listarPorCliente(uuid);
                setAtendimentos(atends);
            } catch (e) {
                console.groupCollapsed('⚠️ Erro ao listar atendimentos');
                console.error(e);
                console.groupEnd();
            }

            try {
                const insightsData = await clienteInsightService.obterInsightPorCliente(uuid);
                setInsight(insightsData);
            } catch (e) {
                console.groupCollapsed('⚠️ Erro ao buscar insights do cliente');
                console.error(e);
                console.groupEnd();
            }
            try {
                const peds = await pedidoService.listar({ clienteId: uuid });
                const pedsSorted = (Array.isArray(peds) ? peds : []).sort(
                    (a, b) => new Date(b.dataVenda || b.createdAt) - new Date(a.dataVenda || a.createdAt)
                );
                setPedidosCliente(pedsSorted);
            } catch (_) { setPedidosCliente([]); }

            try {
                const leadsData = await leadService.buscarPorCliente(uuid);
                setLeadsCliente(leadsData || []);
            } catch (_) { setLeadsCliente([]); }

            setFormData({
                Dia_de_entrega: clienteData.Dia_de_entrega || '',
                Dia_de_venda: clienteData.Dia_de_venda || '',
                Ponto_GPS: clienteData.Ponto_GPS || '',
                Observacoes_Gerais: clienteData.Observacoes_Gerais || '',
                Condicao_de_pagamento: clienteData.Condicao_de_pagamento || '',
                idVendedor: clienteData.idVendedor || '',
                Formas_Atendimento: clienteData.Formas_Atendimento || [],
                condicoes_pagamento_permitidas: clienteData.condicoes_pagamento_permitidas || [],
                indicacaoId: clienteData.indicacaoId || '',
                categoriaClienteId: clienteData.categoriaClienteId || '',
                cicloCompraPersonalizadoDias: clienteData.cicloCompraPersonalizadoDias || '',
                insightAtivo: clienteData.insightAtivo !== undefined ? clienteData.insightAtivo : true,
                observacaoComercialFixa: clienteData.observacaoComercialFixa || ''
            });

            // Setar nome da indicação se existir
            if (clienteData.indicacao) {
                setIndicacaoNome(clienteData.indicacao.NomeFantasia || clienteData.indicacao.Nome);
            }

        } catch (error) {
            console.error('Erro ao carregar dados:', error);
        } finally {
            setLoading(false);
        }
    };

    // Buscar clientes para indicação
    const handleBuscarIndicacao = async (texto) => {
        setIndicacaoSearch(texto);
        if (texto.length < 2) {
            setIndicacaoResultados([]);
            setShowIndicacaoDropdown(false);
            return;
        }
        try {
            const res = await clienteService.listar({ search: texto, limit: 8 });
            const lista = (res.data || res || []).filter(c => c.UUID !== uuid);
            setIndicacaoResultados(lista);
            setShowIndicacaoDropdown(lista.length > 0);
        } catch {
            setIndicacaoResultados([]);
        }
    };

    const handleSelecionarIndicacao = (cli) => {
        setFormData({ ...formData, indicacaoId: cli.UUID });
        setIndicacaoNome(cli.NomeFantasia || cli.Nome);
        setIndicacaoSearch('');
        setIndicacaoResultados([]);
        setShowIndicacaoDropdown(false);
    };

    const handleLimparIndicacao = () => {
        setFormData({ ...formData, indicacaoId: '' });
        setIndicacaoNome('');
        setIndicacaoSearch('');
    };

    const handleSave = async () => {
        try {
            await clienteService.atualizar(uuid, formData);
            alert('Dados atualizados com sucesso!');
            fetchData();
        } catch (error) {
            alert('Erro ao atualizar cliente: ' + (error.response?.data?.error || error.message));
        }
    };

    const handleRecalcularInsight = async () => {
        if (!window.confirm('Forçar o recálculo imediato dos indicadores deste cliente?')) return;
        setRecalculandoInsight(true);
        try {
            const novoInsight = await clienteInsightService.recalcularManual(uuid);
            setInsight(novoInsight);
            alert('Insights recalculados com sucesso!');
        } catch (error) {
            alert('Erro ao recalcular insights: ' + (error.response?.data?.error || error.message));
        } finally {
            setRecalculandoInsight(false);
        }
    };

    const handleCancel = () => {
        navigate('/clientes');
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Carregando detalhes do cliente...</div>;
    if (!cliente) return <div className="p-8 text-center text-gray-600">Cliente não encontrado.</div>;

    return (
        <div className="container mx-auto px-4 py-4 max-w-6xl">
            <button
                onClick={() => navigate('/clientes')}
                className="mb-4 flex items-center text-gray-600 hover:text-gray-900"
            >
                <ArrowLeft className="h-5 w-5 mr-1" /> Voltar
            </button>

            {/* Cabeçalho */}
            <div className="bg-white shadow rounded-lg p-6 mb-6 border-l-4 border-primary">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">
                            <span className="text-sm font-normal text-gray-500 block mb-1">Razão Social</span>
                            {cliente.Nome}
                        </h1>
                        {cliente.NomeFantasia && (
                            <p className="text-lg text-gray-600 font-medium mt-1">
                                <span className="text-sm font-normal text-gray-400">Fantasia:</span> {cliente.NomeFantasia}
                            </p>
                        )}
                        <p className="text-gray-500 text-sm mt-3">
                            <span className="font-medium text-gray-600">
                                {String(cliente.Tipo_Pessoa).toUpperCase().includes('JUR') ? 'CNPJ' : 'CPF'}:
                            </span> {cliente.Documento}
                        </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full font-medium text-sm ${cliente.Ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {cliente.Ativo ? 'ATIVO' : 'INATIVO'}
                    </span>
                </div>
            </div>

            {/* Abas */}
            <div className="flex border-b border-gray-200 mb-5">
                <button
                    onClick={() => setAbaAtiva('dados')}
                    className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${abaAtiva === 'dados' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}
                >
                    Dados
                </button>
                <button
                    onClick={() => setAbaAtiva('historico')}
                    className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${abaAtiva === 'historico' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}
                >
                    Histórico ({atendimentos.length + pedidosCliente.length + leadsCliente.reduce((acc, l) => acc + (l.atendimentos?.length || 0), 0)})
                </button>
                {leadsCliente.length > 0 && (
                    <button
                        onClick={() => setAbaAtiva('lead')}
                        className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${abaAtiva === 'lead' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500'}`}
                    >
                        Lead ({leadsCliente.length})
                    </button>
                )}
            </div>

            {abaAtiva === 'historico' && (() => {
                // Unificar atendimentos (cliente + leads) e pedidos em um único histórico ordenado por data
                const leadAtendimentos = leadsCliente.flatMap(lead =>
                    (lead.atendimentos || []).map(a => ({ ...a, _leadNome: lead.nomeEstabelecimento || `Lead #${lead.numero}`, _leadId: lead.id }))
                );
                const itensHistorico = [
                    ...atendimentos.map(a => ({ ...a, _tipo: 'ATENDIMENTO', _data: new Date(a.criadoEm) })),
                    ...leadAtendimentos.map(a => ({ ...a, _tipo: 'ATENDIMENTO_LEAD', _data: new Date(a.criadoEm) })),
                    ...pedidosCliente.map(p => ({ ...p, _tipo: 'PEDIDO', _data: new Date(p.dataVenda || p.createdAt) }))
                ].sort((a, b) => b._data - a._data);

                return (
                    <div className="space-y-3 pb-8">
                        {itensHistorico.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                <ClipboardList className="h-10 w-10 mx-auto mb-2" />
                                <p className="font-semibold">Nenhum histórico registrado ainda.</p>
                            </div>
                        ) : (
                            itensHistorico.map(item => {
                                if (item._tipo === 'PEDIDO') {
                                    const pedido = item;
                                    const totalPedido = pedido.itens?.reduce((acc, i) => acc + (Number(i.valor) * Number(i.quantidade)), 0) || 0;

                                    const fmtCanal = (c) => {
                                        switch (c) {
                                            case 'VISITA': return 'Visita Presencial';
                                            case 'AMOSTRA': return 'Amostra';
                                            case 'LIGACAO': return 'Ligação';
                                            case 'WHATSAPP': return 'WhatsApp';
                                            case 'OUTROS': return 'Outros';
                                            default: return c || 'Direto / Sistema';
                                        }
                                    };

                                    return (
                                        <div key={`ped-${pedido.id}`} className="bg-white border border-blue-100 rounded-xl p-4 shadow-sm">
                                            {/* Header do Pedido */}
                                            <div className="flex items-center justify-between mb-3 border-b border-blue-50 pb-2">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={`text-xs font-bold text-white px-2 py-0.5 rounded flex items-center gap-1 shadow-sm ${pedido.especial ? 'bg-purple-600' : 'bg-blue-600'}`}>
                                                        <ShoppingCart className="h-3 w-3" />
                                                        {pedido.especial ? 'ESPECIAL' : 'PEDIDO'} {pedido.numero ? (pedido.especial ? `ZZ#${pedido.numero}` : `#${pedido.numero}`) : ''}
                                                    </span>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${pedido.statusEnvio === 'RECEBIDO' ? 'bg-green-100 text-green-700' :
                                                        pedido.statusEnvio === 'ERRO' ? 'bg-red-100 text-red-700' :
                                                            pedido.statusEnvio === 'ENVIAR' ? 'bg-blue-100 text-blue-700' :
                                                                'bg-gray-100 text-gray-600'
                                                        }`}>{pedido.statusEnvio}</span>
                                                    {/* Badge entrega */}
                                                    {pedido.statusEntrega && pedido.statusEntrega !== 'PENDENTE' && (
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase flex items-center gap-0.5 ${pedido.statusEntrega === 'ENTREGUE' ? 'bg-green-50 text-green-700 border border-green-200' :
                                                            pedido.statusEntrega === 'ENTREGUE_PARCIAL' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                                                'bg-red-50 text-red-700 border border-red-200'
                                                            }`}>
                                                            <Package className="h-2.5 w-2.5" />
                                                            {pedido.statusEntrega === 'ENTREGUE' ? 'Entregue' : pedido.statusEntrega === 'ENTREGUE_PARCIAL' ? 'Parcial' : 'Devolvido'}
                                                            {pedido.dataEntrega && ` · ${new Date(pedido.dataEntrega).toLocaleDateString('pt-BR')}`}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Meta do pedido */}
                                            <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-1 mb-3 bg-white p-2 rounded border border-gray-100">
                                                <div className="text-[10px] text-gray-500 flex items-center gap-1">
                                                    <Calendar className="h-3 w-3 text-gray-400" />
                                                    <span className="font-medium text-gray-700">Criado em:</span> {new Date(pedido.createdAt).toLocaleDateString('pt-BR')} {new Date(pedido.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                                <div className="text-[10px] text-gray-500 flex items-center gap-1">
                                                    <Clock className="h-3 w-3 text-gray-400" />
                                                    <span className="font-medium text-gray-700">Entrega:</span> {pedido.dataVenda ? new Date(pedido.dataVenda).toLocaleDateString('pt-BR') : '-'}
                                                </div>
                                                <div className="text-[10px] text-gray-500 flex items-center gap-1">
                                                    <User className="h-3 w-3 text-gray-400" />
                                                    <span className="font-medium text-gray-700">Vendedor:</span> {pedido.vendedor?.nome || 'N/D'}
                                                </div>
                                                <div className="text-[10px] text-gray-500 flex items-center gap-1">
                                                    <Phone className="h-3 w-3 text-gray-400" />
                                                    <span className="font-medium text-gray-700">Tipo de Atendimento:</span> {fmtCanal(pedido.canalOrigem)}
                                                </div>
                                                {pedido.usuarioLancamento?.nome && (
                                                    <div className="text-[10px] text-gray-500 flex items-center gap-1 col-span-2">
                                                        <User className="h-3 w-3 text-gray-400" />
                                                        <span className="font-medium text-gray-700">Digitado por:</span> {pedido.usuarioLancamento.nome}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Itens do pedido */}
                                            {pedido.itens && pedido.itens.length > 0 && (
                                                <div className="mt-2 space-y-1">
                                                    {pedido.itens.map(it => {
                                                        const qtdDevolvida = pedido.itensDevolvidos?.filter(d => d.produtoId === it.produtoId)?.reduce((s, d) => s + Number(d.quantidade), 0) || 0;
                                                        const qtdEntregue = Number(it.quantidade) - qtdDevolvida;
                                                        return (
                                                            <div key={it.id} className="flex items-center justify-between text-xs text-gray-700 bg-gray-50 px-2 py-1 rounded">
                                                                <span className="flex items-center gap-1">
                                                                    <Package className="h-3 w-3 text-gray-400" />
                                                                    {it.produto?.nome || it.descricao || 'Produto'}
                                                                </span>
                                                                <span className="font-semibold text-gray-800 shrink-0 ml-2">
                                                                    {qtdDevolvida > 0
                                                                        ? <>{qtdEntregue}x <span className="text-green-600">entregue</span> · <span className="text-red-500 line-through">{Number(it.quantidade)}x</span></>
                                                                        : <>{Number(it.quantidade)}x</>
                                                                    } R$ {Number(it.valor).toFixed(2).replace('.', ',')}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* Pagamentos Reais (se entregue) */}
                                            {pedido.pagamentosReais && pedido.pagamentosReais.length > 0 && (
                                                <div className="mt-3 bg-green-50 border border-green-100 rounded-lg p-2">
                                                    <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                                                        <DollarSign className="h-3 w-3" /> Pagamentos Recebidos
                                                    </p>
                                                    {pedido.pagamentosReais.map((pg, idx) => (
                                                        <div key={idx} className="flex justify-between text-xs text-green-800 font-medium">
                                                            <span>{pg.formaPagamentoNome}</span>
                                                            <span>R$ {Number(pg.valor).toFixed(2).replace('.', ',')}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Itens Devolvidos (se parcial) */}
                                            {pedido.itensDevolvidos && pedido.itensDevolvidos.length > 0 && (
                                                <div className="mt-2 bg-red-50 border border-red-100 rounded-lg p-2">
                                                    <p className="text-[10px] font-bold text-red-600 uppercase tracking-wide mb-1 flex items-center gap-1">
                                                        <Package className="h-3 w-3" /> Itens Devolvidos
                                                    </p>
                                                    {pedido.itensDevolvidos.map((d, idx) => (
                                                        <div key={idx} className="text-xs text-red-700">
                                                            {d.produto?.nome || d.produtoId} · {Number(d.quantidade)}x (R$ {Number(d.valorBaseItem).toFixed(2).replace('.', ',')}/un)
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Motivo da Devolução */}
                                            {pedido.motivoDevolucao && (
                                                <div className="mt-2 bg-amber-50 border border-amber-100 rounded-lg p-2">
                                                    <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide mb-0.5">Motivo da Devolução</p>
                                                    <p className="text-xs text-amber-800 italic">"{pedido.motivoDevolucao}"</p>
                                                </div>
                                            )}

                                            {/* Total e observações */}
                                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                                                {pedido.observacoes ? (
                                                    <p className="text-xs text-gray-500 italic flex-1 mr-3">{pedido.observacoes}</p>
                                                ) : <span />}
                                                <span className="text-sm font-bold text-blue-700 shrink-0">
                                                    Total: R$ {totalPedido.toFixed(2).replace('.', ',')}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                }

                                // ATENDIMENTO (cliente direto ou via lead)
                                const a = item;
                                const isFromLead = item._tipo === 'ATENDIMENTO_LEAD';
                                return (
                                    <div key={`atend-${a.id}`} className={`bg-white border rounded-xl p-4 shadow-sm ${isFromLead ? 'border-orange-200' : 'border-gray-200'}`}>
                                        {/* Header: tipo + ação + vendedor + data */}
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${isFromLead ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-blue-700'}`}>
                                                    {a.tipo || 'ATENDIMENTO'}
                                                </span>
                                                {isFromLead && (
                                                    <span className="text-[10px] font-medium text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200">
                                                        Lead: {a._leadNome}
                                                    </span>
                                                )}
                                                {a.acaoLabel && (
                                                    <span
                                                        className="text-xs font-bold px-2 py-0.5 rounded"
                                                        style={a.alertaVisualCor
                                                            ? { backgroundColor: a.alertaVisualCor + '20', color: a.alertaVisualCor, border: `1px solid ${a.alertaVisualCor}40` }
                                                            : { backgroundColor: '#f3f4f6', color: '#374151' }
                                                        }
                                                    >
                                                        {a.acaoLabel}
                                                    </span>
                                                )}
                                                {a.vendedor?.nome && (
                                                    <span className="text-xs text-gray-500 flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                                                        <User className="h-3 w-3" />
                                                        {a.vendedor.nome}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-xs text-gray-400 flex items-center gap-1 shrink-0">
                                                <Clock className="h-3 w-3" />
                                                {new Date(a.criadoEm).toLocaleDateString('pt-BR')} {new Date(a.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>

                                        {/* Etapa (para atendimentos de lead) */}
                                        {a.etapaNova && (
                                            <div className="flex items-center gap-1 mb-1">
                                                <span className="text-[10px] text-gray-400">{a.etapaAnterior || '—'}</span>
                                                <span className="text-[10px] text-gray-400">→</span>
                                                <span className="text-[10px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded">{a.etapaNova}</span>
                                            </div>
                                        )}

                                        {/* Observação */}
                                        {a.observacao
                                            ? <p className="text-sm text-gray-700 mt-1">{a.observacao}</p>
                                            : <p className="text-xs text-gray-300 italic mt-1">Sem observação registrada</p>
                                        }

                                        {/* Meta: data retorno, assunto, transferência, amostra */}
                                        {(a.dataRetorno || a.assuntoRetorno || a.transferidoPara?.nome || a.amostra || a.proximaVisita) && (
                                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                                                {a.dataRetorno && (
                                                    <span className="text-[11px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        Retorno: {new Date(a.dataRetorno).toLocaleDateString('pt-BR')}
                                                    </span>
                                                )}
                                                {a.assuntoRetorno && (
                                                    <span className="text-[11px] text-gray-600 bg-gray-50 px-2 py-0.5 rounded border border-gray-200 italic">
                                                        {a.assuntoRetorno}
                                                    </span>
                                                )}
                                                {a.transferidoPara?.nome && (
                                                    <span className="text-[11px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 flex items-center gap-1">
                                                        <User className="h-3 w-3" />
                                                        Transferido para: {a.transferidoPara.nome}
                                                    </span>
                                                )}
                                                {a.amostra && (
                                                    <span className="text-[11px] text-orange-700 bg-orange-50 px-2 py-0.5 rounded border border-orange-200 flex items-center gap-1">
                                                        <Package className="h-3 w-3" />
                                                        Amostra AM#{a.amostra.numero} · {a.amostra.status}
                                                    </span>
                                                )}
                                                {a.proximaVisita && (
                                                    <span className="text-[11px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        Próx. visita: {new Date(a.proximaVisita).toLocaleDateString('pt-BR')}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                );
            })()}

            {abaAtiva === 'lead' && leadsCliente.length > 0 && (
                <div className="space-y-6 pb-8">
                    {leadsCliente.map(lead => (
                        <div key={lead.id} className="bg-white rounded-lg border border-orange-200 overflow-hidden">
                            {/* Dados do Lead */}
                            <div className="p-4 bg-orange-50 border-b border-orange-200">
                                <div className="flex gap-4">
                                    {lead.fotoFachada ? (
                                        <img
                                            src={`${API_URL}${lead.fotoFachada}`}
                                            alt="Fachada"
                                            className="h-20 w-20 rounded-lg object-cover border border-orange-200 flex-shrink-0"
                                        />
                                    ) : (
                                        <div className="h-20 w-20 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                                            <Image className="h-6 w-6 text-orange-300" />
                                        </div>
                                    )}
                                    <div className="flex-1">
                                        <h3 className="font-bold text-gray-900">{lead.nomeEstabelecimento}</h3>
                                        <p className="text-xs text-gray-400 font-mono">#{lead.numero}</p>
                                        <div className="flex flex-wrap gap-2 mt-1.5 text-xs text-gray-600">
                                            {lead.contato && <span className="flex items-center gap-1"><User className="h-3 w-3" /> {lead.contato}</span>}
                                            {lead.whatsapp && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {lead.whatsapp}</span>}
                                            {lead.diasVisita && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {lead.diasVisita}</span>}
                                        </div>
                                        <div className="flex gap-2 mt-1.5">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${lead.etapa === 'CONVERTIDO' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                                                {lead.etapa}
                                            </span>
                                            <span className="text-[10px] text-gray-400">Criado em {new Date(lead.createdAt).toLocaleDateString('pt-BR')}</span>
                                        </div>
                                        {lead.observacoes && <p className="text-xs text-gray-500 mt-1.5 italic">{lead.observacoes}</p>}
                                    </div>
                                </div>
                            </div>

                            {/* Histórico de atendimentos do Lead */}
                            <div className="p-4">
                                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                                    <ClipboardList className="h-4 w-4 text-orange-500" />
                                    Histórico do Lead ({lead.atendimentos?.length || 0})
                                </h4>
                                {(!lead.atendimentos || lead.atendimentos.length === 0) ? (
                                    <p className="text-xs text-gray-400 text-center py-4">Nenhum atendimento registrado para este lead.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {lead.atendimentos
                                            .slice()
                                            .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm))
                                            .map(atend => (
                                            <div key={atend.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold">{atend.tipo}</span>
                                                        {atend.acaoLabel && (
                                                            <span
                                                                className="px-2 py-0.5 rounded text-[10px] font-bold"
                                                                style={atend.alertaVisualCor
                                                                    ? { backgroundColor: atend.alertaVisualCor + '20', color: atend.alertaVisualCor }
                                                                    : { backgroundColor: '#f3f4f6', color: '#374151' }
                                                                }
                                                            >
                                                                {atend.acaoLabel}
                                                            </span>
                                                        )}
                                                        {atend.etapaNova && (
                                                            <span className="text-[10px] text-gray-500">
                                                                {atend.etapaAnterior} → {atend.etapaNova}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-[10px] text-gray-400 shrink-0">{new Date(atend.criadoEm).toLocaleDateString('pt-BR')} {new Date(atend.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                                {atend.observacao && <p className="text-xs text-gray-600">{atend.observacao}</p>}
                                                {(atend.dataRetorno || atend.assuntoRetorno || atend.transferidoPara || atend.amostra || atend.proximaVisita) && (
                                                    <div className="mt-1.5 flex flex-wrap gap-1">
                                                        {atend.dataRetorno && (
                                                            <span className="text-[10px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100">
                                                                Retorno: {new Date(atend.dataRetorno).toLocaleDateString('pt-BR')}
                                                            </span>
                                                        )}
                                                        {atend.assuntoRetorno && (
                                                            <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded italic">{atend.assuntoRetorno}</span>
                                                        )}
                                                        {atend.transferidoPara?.nome && (
                                                            <span className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                                                Transferido: {atend.transferidoPara.nome}
                                                            </span>
                                                        )}
                                                        {atend.amostra && (
                                                            <span className="text-[10px] text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200">
                                                                AM#{atend.amostra.numero} · {atend.amostra.status}
                                                            </span>
                                                        )}
                                                        {atend.proximaVisita && (
                                                            <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                                                Próx. visita: {new Date(atend.proximaVisita).toLocaleDateString('pt-BR')}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                                {atend.vendedor && <p className="text-[10px] text-gray-400 mt-1">Por: {atend.vendedor.nome}</p>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {abaAtiva === 'dados' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* SEÇÃO 1: DADOS DO CONTA AZUL (SOMENTE LEITURA) */}
                    <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                        <h2 className="text-lg font-semibold text-gray-700 mb-4 flex items-center">
                            <Building className="h-5 w-5 mr-2 text-gray-600" />
                            📋 Dados do Conta Azul (Somente Leitura)
                        </h2>

                        <div className="space-y-4">
                            {/* Identificação */}
                            <div className="border-b border-gray-200 pb-3">
                                <h3 className="text-sm font-semibold text-gray-600 mb-2">Identificação</h3>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <span className="text-gray-500">UUID:</span>
                                        <p className="text-gray-900 font-mono text-xs">{cliente.UUID}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Código:</span>
                                        <p className="text-gray-900">{cliente.Codigo || '-'}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Tipo Pessoa:</span>
                                        <p className="text-gray-900">{cliente.Tipo_Pessoa || '-'}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Perfis:</span>
                                        <p className="text-gray-900">{cliente.Perfis || '-'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Contato */}
                            <div className="border-b border-gray-200 pb-3">
                                <h3 className="text-sm font-semibold text-gray-600 mb-2 flex items-center">
                                    <Phone className="h-4 w-4 mr-1" /> Contato
                                </h3>
                                <div className="space-y-2 text-sm">
                                    <div><span className="text-gray-500">Email:</span><p className="text-gray-900">{cliente.Email || '-'}</p></div>
                                    <div><span className="text-gray-500">Telefone:</span><p className="text-gray-900">{cliente.Telefone || '-'}</p></div>
                                    <div><span className="text-gray-500">Celular:</span><p className="text-gray-900">{cliente.Telefone_Celular || '-'}</p></div>
                                    <div><span className="text-gray-500">Comercial:</span><p className="text-gray-900">{cliente.Telefone_Comercial || '-'}</p></div>
                                </div>
                            </div>

                            {/* Endereço */}
                            <div className="border-b border-gray-200 pb-3">
                                <h3 className="text-sm font-semibold text-gray-600 mb-2 flex items-center">
                                    <MapPin className="h-4 w-4 mr-1" /> Endereço
                                </h3>
                                <div className="text-sm text-gray-900">
                                    <p>{cliente.End_Logradouro}, {cliente.End_Numero}</p>
                                    {cliente.End_Complemento && <p>{cliente.End_Complemento}</p>}
                                    <p>{cliente.End_Bairro}</p>
                                    <p>{cliente.End_Cidade} - {cliente.End_Estado}</p>
                                    <p>CEP: {cliente.End_CEP}</p>
                                    <p>{cliente.End_Pais}</p>
                                </div>
                            </div>

                            {/* Financeiro */}
                            <div className="border-b border-gray-200 pb-3">
                                <h3 className="text-sm font-semibold text-gray-600 mb-2 flex items-center">
                                    <DollarSign className="h-4 w-4 mr-1" /> Dados Financeiros
                                </h3>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div><span className="text-gray-500">Atrasos Pagamentos:</span><p className="text-gray-900">{cliente.Atrasos_Pagamentos || '0'}</p></div>
                                    <div><span className="text-gray-500">Atrasos Recebimentos:</span><p className="text-gray-900">{cliente.Atrasos_Recebimentos || '0'}</p></div>
                                    <div><span className="text-gray-500">Pagamentos Mês:</span><p className="text-gray-900">{cliente.Pagamentos_Mes_Atual || '0'}</p></div>
                                    <div><span className="text-gray-500">Recebimentos Mês:</span><p className="text-gray-900">{cliente.Recebimentos_Mes_Atual || '0'}</p></div>
                                </div>
                            </div>

                            {/* Fiscal */}
                            <div className="border-b border-gray-200 pb-3">
                                <h3 className="text-sm font-semibold text-gray-600 mb-2">Fiscal</h3>
                                <div className="text-sm">
                                    <span className="text-gray-500">Indicador Inscrição Estadual:</span>
                                    <p className="text-gray-900">{cliente.Indicador_Inscricao_Estadual || '-'}</p>
                                </div>
                            </div>

                            {/* Auditoria */}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-600 mb-2 flex items-center">
                                    <Calendar className="h-4 w-4 mr-1" /> Auditoria
                                </h3>
                                <div className="space-y-1 text-sm">
                                    <div>
                                        <span className="text-gray-500">Data Criação:</span>
                                        <p className="text-gray-900">{cliente.Data_Criacao ? new Date(cliente.Data_Criacao).toLocaleDateString('pt-BR') : '-'}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Data Alteração:</span>
                                        <p className="text-gray-900">{cliente.Data_Alteracao ? new Date(cliente.Data_Alteracao).toLocaleDateString('pt-BR') : '-'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* SEÇÃO 2: DADOS OPERACIONAIS (EDITÁVEIS) */}
                    <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
                        {/* INTELIGÊNCIA COMERCIAL: ADMIN DEBUG BLOCK */}
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-5 mb-8">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-md font-semibold text-gray-800 flex items-center">
                                    <Sparkles className="h-5 w-5 mr-2 text-purple-600" />
                                    [Admin] Motor Analítico (Inteligência Comercial)
                                </h3>
                                <button
                                    onClick={handleRecalcularInsight}
                                    disabled={recalculandoInsight}
                                    className="flex items-center px-3 py-1.5 bg-white border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                                >
                                    <RefreshCw className={`h-4 w-4 mr-1 ${recalculandoInsight ? 'animate-spin' : ''}`} />
                                    {recalculandoInsight ? 'Recalculando...' : 'Forçar Recálculo'}
                                </button>
                            </div>

                            {!insight ? (
                                <p className="text-sm text-gray-500">Nenhum cálculo efetuado para este cliente ainda.</p>
                            ) : (
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                                    <div className="p-3 bg-white border rounded">
                                        <span className="block text-xs text-gray-500 mb-1">Status Recompra</span>
                                        <span className={`font-semibold ${insight.statusRecompra === 'NO_PRAZO' ? 'text-green-600' :
                                                insight.statusRecompra === 'ATENCAO' ? 'text-yellow-600' :
                                                    insight.statusRecompra === 'ATRASADO' ? 'text-orange-600' :
                                                        insight.statusRecompra === 'CRITICO' ? 'text-red-600' : 'text-gray-600'
                                            }`}>{insight.statusRecompra}</span>
                                        <div className="text-xs text-gray-500 mt-1">
                                            Ciclo: {insight.cicloReferenciaDias}d ({insight.origemCiclo})<br />
                                            Dias s/ compra: {insight.diasSemComprar ?? '-'}
                                        </div>
                                    </div>

                                    <div className="p-3 bg-white border rounded">
                                        <span className="block text-xs text-gray-500 mb-1">Ticket Médio Histórico</span>
                                        <span className="font-semibold text-gray-800">
                                            R$ {Number(insight.ticketMedioBase || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                        <div className="text-xs text-gray-500 mt-1">
                                            Recente: R$ {Number(insight.ticketMedioRecente || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}<br />
                                            Variação: <span className={Number(insight.variacaoTicketPct) < 0 ? 'text-red-600' : 'text-green-600'}>
                                                {Number(insight.variacaoTicketPct || 0).toFixed(1)}%
                                            </span>
                                        </div>
                                    </div>

                                    <div className="p-3 bg-white border rounded">
                                        <span className="block text-xs text-gray-500 mb-1">Oportunidade (Upsell)</span>
                                        <span className="font-semibold text-gray-800">
                                            Score: {insight.scoreOportunidade}/100
                                        </span>
                                        <div className="text-xs text-gray-500 mt-1">
                                            {insight.produtoAusenteId ? (
                                                <span className="text-purple-600">Produto Parou de Sair (ID: {insight.produtoAusenteId.substring(0, 8)}...)</span>
                                            ) : 'Sem oportunidade clara gerada nativamente'}
                                        </div>
                                    </div>

                                    <div className="p-3 bg-white border rounded">
                                        <span className="block text-xs text-gray-500 mb-1">Risco (Churn)</span>
                                        <span className="font-semibold text-gray-800">
                                            Score: {insight.scoreRisco}/100
                                        </span>
                                        <div className="text-xs text-gray-500 mt-1 flex flex-col gap-0.5">
                                            {insight.teveDevolucaoRecente && <span className="text-red-600">• Teve devolução (30d)</span>}
                                            {insight.qtdAtendimentosSemPedido30d > 1 && <span className="text-orange-600">• {insight.qtdAtendimentosSemPedido30d} visitas s/ pedido</span>}
                                            {(!insight.teveDevolucaoRecente && insight.qtdAtendimentosSemPedido30d <= 1) && <span>Risco baixo aparente</span>}
                                        </div>
                                    </div>

                                    <div className="col-span-2 lg:col-span-4 p-2 bg-gray-100 rounded text-xs text-gray-500 flex justify-between items-center">
                                        <span>Este é um painel de debug. O vendedor não verá estes dados desta forma.</span>
                                        <span>Último cálculo: {new Date(insight.recalculadoEm).toLocaleString('pt-BR')}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <h2 className="text-lg font-semibold text-primary mb-4 flex items-center">
                            <FileText className="h-5 w-5 mr-2" />
                            ✏️ Dados Operacionais (Editáveis)
                        </h2>

                        <div className="space-y-5">
                            {/* Vendedor Responsável */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <User className="h-4 w-4 inline mr-1" />
                                    Vendedor Responsável
                                </label>
                                <select
                                    className="block w-full border border-gray-300 rounded-md shadow-sm p-3 bg-white text-gray-900 focus:ring-primary focus:border-primary"
                                    value={formData.idVendedor}
                                    onChange={(e) => setFormData({ ...formData, idVendedor: e.target.value })}
                                >
                                    <option value="">Selecione um vendedor...</option>
                                    {vendedores.filter(v => v.ativo !== false || v.id === formData.idVendedor).map(v => (
                                        <option key={v.id} value={v.id}>{v.nome}{v.ativo === false ? ' (INATIVO)' : ''}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Indicação */}
                            <div className="relative">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <UserPlus className="h-4 w-4 inline mr-1" />
                                    Indicação (quem indicou este cliente)
                                </label>
                                {formData.indicacaoId && indicacaoNome ? (
                                    <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
                                        <UserPlus className="h-4 w-4 text-green-600 shrink-0" />
                                        <span className="text-sm font-medium text-green-800 flex-1">{indicacaoNome}</span>
                                        <button type="button" onClick={handleLimparIndicacao} className="p-1 text-gray-400 hover:text-red-500">
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Search className="h-4 w-4 text-gray-400" />
                                        </div>
                                        <input
                                            type="text"
                                            value={indicacaoSearch}
                                            onChange={(e) => handleBuscarIndicacao(e.target.value)}
                                            onFocus={() => indicacaoResultados.length > 0 && setShowIndicacaoDropdown(true)}
                                            onBlur={() => setTimeout(() => setShowIndicacaoDropdown(false), 200)}
                                            className="block w-full border border-gray-300 rounded-md shadow-sm pl-10 p-3 bg-white text-gray-900 focus:ring-primary focus:border-primary"
                                            placeholder="Buscar cliente que indicou..."
                                        />
                                    </div>
                                )}
                                {showIndicacaoDropdown && indicacaoResultados.length > 0 && (
                                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                                        {indicacaoResultados.map(cli => (
                                            <button
                                                key={cli.UUID}
                                                type="button"
                                                onMouseDown={() => handleSelecionarIndicacao(cli)}
                                                className="w-full text-left px-4 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-0"
                                            >
                                                <p className="text-sm font-medium text-gray-900">{cli.NomeFantasia || cli.Nome}</p>
                                                <p className="text-xs text-gray-500">{cli.Nome}{cli.End_Cidade ? ` · ${cli.End_Cidade}` : ''}</p>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Dia de Entrega */}
                            <DayPicker
                                label="Dia de Entrega"
                                selected={formData.Dia_de_entrega}
                                onChange={(val) => setFormData({ ...formData, Dia_de_entrega: val })}
                            />

                            {/* Dia de Venda */}
                            <DayPicker
                                label="Dia de Visita/Venda"
                                selected={formData.Dia_de_venda}
                                onChange={(val) => setFormData({ ...formData, Dia_de_venda: val })}
                            />

                            {/* Canais de Atendimento */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <Phone className="h-4 w-4 inline mr-1" />
                                    Canais de Atendimento Preferenciais
                                </label>
                                <div className="flex flex-wrap gap-3">
                                    {['Presencial', 'Whatsapp', 'Telefone'].map(canal => {
                                        const isSelected = (formData.Formas_Atendimento || []).includes(canal);
                                        return (
                                            <button
                                                key={canal}
                                                type="button"
                                                onClick={() => {
                                                    const atuais = formData.Formas_Atendimento || [];
                                                    const novos = isSelected
                                                        ? atuais.filter(c => c !== canal)
                                                        : [...atuais, canal];
                                                    setFormData({ ...formData, Formas_Atendimento: novos });
                                                }}
                                                className={`px-4 py-2 rounded-md border text-sm font-medium transition-all flex items-center gap-2 ${isSelected
                                                    ? 'bg-primary text-white border-primary shadow-sm'
                                                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                                                    }`}
                                            >
                                                {canal === 'Presencial' && <User className="h-4 w-4" />}
                                                {canal === 'Whatsapp' && <MessageCircle className="h-4 w-4" />}
                                                {canal === 'Telefone' && <Phone className="h-4 w-4" />}
                                                {canal}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Condição de Pagamento */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <DollarSign className="h-4 w-4 inline mr-1" />
                                    Condição de Pagamento Padrão
                                </label>
                                <select
                                    className="block w-full border border-gray-300 rounded-md shadow-sm p-3 bg-white text-gray-900 focus:ring-primary focus:border-primary mb-4"
                                    value={formData.Condicao_de_pagamento}
                                    onChange={(e) => setFormData({ ...formData, Condicao_de_pagamento: e.target.value })}
                                >
                                    <option value="">Selecione uma condição padrão...</option>
                                    {condicoesPagamento.map(c => (
                                        <option key={c.id} value={c.id}>{c.nomeCondicao}</option>
                                    ))}
                                </select>

                                <label className="block text-sm font-medium text-gray-700 mb-2 mt-4">
                                    <DollarSign className="h-4 w-4 inline mr-1" />
                                    Condições de Pagamento Permitidas (Flex/App)
                                </label>
                                <div className="border border-gray-300 rounded-md">
                                    <MultiSelect
                                        options={condicoesPagamento.map(c => c.nomeCondicao)}
                                        selected={formData.condicoes_pagamento_permitidas.map(id => {
                                            const c = condicoesPagamento.find(cond => cond.idCondicao === id);
                                            return c ? c.nomeCondicao : id;
                                        }).filter(Boolean)}
                                        onChange={(selectedNames) => {
                                            const ids = selectedNames.map(name => {
                                                const c = condicoesPagamento.find(cond => cond.nomeCondicao === name);
                                                return c ? c.idCondicao : null;
                                            }).filter(Boolean);
                                            setFormData({ ...formData, condicoes_pagamento_permitidas: ids });
                                        }}
                                        placeholder="Selecione as condições permitidas no App..."
                                    />
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Selecione as condições que aparecerão no App de Vendas para este cliente.
                                </p>

                                {formData.Condicao_de_pagamento && (() => {
                                    const selected = condicoesPagamento.find(c => c.idCondicao === formData.Condicao_de_pagamento);
                                    if (selected) {
                                        return (
                                            <div className="mt-4 p-3 bg-blue-50/50 rounded-md border border-blue-100 text-sm grid grid-cols-3 gap-2">
                                                <div>
                                                    <span className="block text-xs text-gray-500">Parcelas (Padrão)</span>
                                                    <span className="font-semibold text-gray-900">{selected.qtdParcelas}x</span>
                                                </div>
                                                <div>
                                                    <span className="block text-xs text-gray-500">Dias</span>
                                                    <span className="font-semibold text-gray-900">{selected.parcelasDias} dias</span>
                                                </div>
                                                <div>
                                                    <span className="block text-xs text-gray-500">Acréscimo</span>
                                                    <span className={`font-semibold ${Number(selected.acrescimoPreco) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                        {Number(selected.acrescimoPreco) > 0 ? `+${selected.acrescimoPreco}%` : '0%'}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    }
                                })()}
                            </div>

                            {/* GPS */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <MapPin className="h-4 w-4 inline mr-1" />
                                    Localização GPS (lat,lng)
                                </label>
                                <input
                                    type="text"
                                    className="block w-full border border-gray-300 rounded-md shadow-sm p-3 bg-white text-gray-900 focus:ring-primary focus:border-primary"
                                    placeholder="Ex: -23.550520,-46.633308"
                                    value={formData.Ponto_GPS}
                                    onChange={(e) => setFormData({ ...formData, Ponto_GPS: e.target.value })}
                                />
                            </div>

                            {/* INTELIGÊNCIA COMERCIAL */}
                            <div className="pt-4 border-t border-gray-200">
                                <h3 className="text-md font-semibold text-purple-700 mb-4 flex items-center">
                                    <Sparkles className="h-4 w-4 mr-2" /> Inteligência Comercial
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Categoria (Segmento)</label>
                                        <select
                                            className="block w-full border border-gray-300 rounded-md shadow-sm p-2 bg-white text-gray-900 focus:ring-primary focus:border-primary"
                                            value={formData.categoriaClienteId}
                                            onChange={(e) => setFormData({ ...formData, categoriaClienteId: e.target.value })}
                                        >
                                            <option value="">Selecione a categoria...</option>
                                            {categoriasCliente.map(c => (
                                                <option key={c.id} value={c.id}>{c.nome} (Ciclo: {c.cicloPadraoDias} dias)</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Sobrescrever Ciclo (Dias)</label>
                                        <input
                                            type="number"
                                            className="block w-full border border-gray-300 rounded-md shadow-sm p-2 bg-white text-gray-900 focus:ring-primary focus:border-primary"
                                            placeholder="Ex: 5"
                                            value={formData.cicloCompraPersonalizadoDias}
                                            onChange={(e) => setFormData({ ...formData, cicloCompraPersonalizadoDias: e.target.value ? parseInt(e.target.value) : '' })}
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Deixe em branco para usar o da categoria.</p>
                                    </div>
                                </div>
                                <div className="mt-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Aviso Comercial Fixado</label>
                                    <textarea
                                        className="block w-full border border-gray-300 rounded-md shadow-sm p-2 bg-white text-gray-900 focus:ring-primary focus:border-primary"
                                        rows="2"
                                        placeholder="Alerta importante sobre venda/negociação para este cliente..."
                                        value={formData.observacaoComercialFixa}
                                        onChange={(e) => setFormData({ ...formData, observacaoComercialFixa: e.target.value })}
                                    />
                                </div>
                                <label className="flex items-center space-x-2 mt-4">
                                    <input
                                        type="checkbox"
                                        checked={formData.insightAtivo}
                                        onChange={(e) => setFormData({ ...formData, insightAtivo: e.target.checked })}
                                        className="h-4 w-4 text-primary bg-white focus:ring-primary border-gray-300 rounded"
                                    />
                                    <span className="text-gray-900 text-sm font-medium">Insights Ativos (Sugerir produtos na venda)</span>
                                </label>
                            </div>

                            {/* Observações */}
                            <div className="pt-4 border-t border-gray-200">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <FileText className="h-4 w-4 inline mr-1" />
                                    Observações Gerais (Backend)
                                </label>
                                <textarea
                                    className="block w-full border border-gray-300 rounded-md shadow-sm p-3 bg-white text-gray-900 focus:ring-primary focus:border-primary"
                                    rows="4"
                                    placeholder="Observações sobre o cliente..."
                                    value={formData.Observacoes_Gerais}
                                    onChange={(e) => setFormData({ ...formData, Observacoes_Gerais: e.target.value })}
                                />
                            </div>

                            {/* Botões */}
                            <div className="flex space-x-3 pt-4 border-t border-gray-200">
                                <button
                                    onClick={handleCancel}
                                    className="flex-1 bg-gray-100 text-gray-700 px-4 py-3 rounded-md font-medium hover:bg-gray-200 transition-colors flex items-center justify-center"
                                >
                                    <X className="h-5 w-5 mr-2" />
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSave}
                                    className="flex-1 bg-primary text-white px-4 py-3 rounded-md font-medium hover:bg-blue-700 transition-colors flex items-center justify-center shadow-sm"
                                >
                                    <Save className="h-5 w-5 mr-2" />
                                    Salvar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DetalheCliente;
