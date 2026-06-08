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
import devolucaoService from '../../services/devolucaoService';
import { API_URL } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeft, MapPin, Phone, Mail, Calendar, FileText, Save, X, User, Building, DollarSign, MessageCircle, Clock, ClipboardList, ShoppingCart, Package, Sparkles, RefreshCw, Image, UserPlus, Search, ExternalLink, Truck, CreditCard, AlertTriangle } from 'lucide-react';

// Toggle switch inline
const Toggle = ({ checked, onChange }) => (
    <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}
    >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
);

// Card section wrapper
const SectionCard = ({ icon: Icon, title, badge, children }) => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
            <Icon className="h-4 w-4 text-blue-600 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-widest text-gray-600">{title}</span>
            {badge && <span className="ml-auto">{badge}</span>}
        </div>
        <div className="p-5">{children}</div>
    </div>
);

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
    const { user } = useAuth();
    const perms = user?.permissoes || {};
    // Espelha o gate do backend (clienteController.atualizar): quem pode editar o cadastro sincronizado com o CA
    const podeEditarCadastroCA = perms.admin || perms.clientes?.edit || perms.Pode_Editar_GPS;
    const [cliente, setCliente] = useState(null);
    const [condicoesPagamento, setCondicoesPagamento] = useState([]);
    const [condicoesPagamentoCA, setCondicoesPagamentoCA] = useState([]);
    const [vendedores, setVendedores] = useState([]);
    const [categoriasCliente, setCategoriasCliente] = useState([]);
    const [loading, setLoading] = useState(true);
    const [abaAtiva, setAbaAtiva] = useState('operacional');
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
        observacaoComercialFixa: '',
        recebeAvisoPedido: true,
        // Cadastro Conta Azul (sincronizado)
        Email: '',
        Telefone_Celular: '',
        Inscricao_Estadual: '',
        Indicador_Inscricao_Estadual: ''
    });

    // Indicação (busca de cliente)
    const [indicacaoSearch, setIndicacaoSearch] = useState('');
    const [indicacaoResultados, setIndicacaoResultados] = useState([]);
    const [indicacaoNome, setIndicacaoNome] = useState('');
    const [showIndicacaoDropdown, setShowIndicacaoDropdown] = useState(false);
    const [devolucoesCliente, setDevolucoesCliente] = useState([]);

    useEffect(() => {
        fetchData();
    }, [uuid]);

    const fetchData = async () => {
        try {
            const [clienteData, condicoesData, condicoesCAData, vendedoresData, categoriasCli] = await Promise.all([
                clienteService.detalhar(uuid),
                tabelaPrecoService.listar(true),
                condicaoPagamentoService.listar(),
                vendedorService.listarAtivos(),
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

            try {
                const devsData = await devolucaoService.listar({ clienteId: uuid, tamanhoPagina: 100 });
                setDevolucoesCliente(devsData.items || []);
            } catch (_) { setDevolucoesCliente([]); }

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
                observacaoComercialFixa: clienteData.observacaoComercialFixa || '',
                recebeAvisoPedido: clienteData.recebeAvisoPedido !== undefined ? clienteData.recebeAvisoPedido : true,
                Email: clienteData.Email || '',
                Telefone_Celular: clienteData.Telefone_Celular || '',
                Inscricao_Estadual: clienteData.Inscricao_Estadual || '',
                Indicador_Inscricao_Estadual: clienteData.Indicador_Inscricao_Estadual || ''
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

    // Consulta da IE no Sintegra SC: a página não aceita CNPJ pela URL,
    // então copiamos o CNPJ para a área de transferência e abrimos a consulta (basta colar).
    const abrirSintegra = async () => {
        const cnpj = (cliente?.Documento || '').replace(/\D/g, '');
        try {
            if (cnpj) await navigator.clipboard.writeText(cnpj);
        } catch { /* clipboard pode falhar sem HTTPS; segue abrindo */ }
        window.open('https://sat.sef.sc.gov.br/tax.NET/Sat.Cadastro.Web/ComprovanteIE/Consulta.aspx', '_blank');
        if (cnpj) alert('CNPJ copiado! Cole no campo do Sintegra SC e clique em Buscar.');
    };

    const handleSave = async () => {
        // Validação dos campos sincronizados com o CA (espelha o backend)
        const email = (formData.Email || '').trim();
        const celular = (formData.Telefone_Celular || '').replace(/\D/g, '');
        const ie = (formData.Inscricao_Estadual || '').replace(/\D/g, '');
        const erros = [];
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erros.push('E-mail inválido');
        if (celular && (celular.length < 10 || celular.length > 11)) erros.push('Celular deve ter 10 ou 11 dígitos (com DDD)');
        if (ie && ie.length !== 9) erros.push('Inscrição Estadual (SC) deve ter 9 dígitos');
        if (erros.length) {
            alert('Corrija antes de salvar:\n• ' + erros.join('\n• '));
            return;
        }

        try {
            // Envia já normalizado (celular/IE só dígitos)
            await clienteService.atualizar(uuid, { ...formData, Email: email, Telefone_Celular: celular, Inscricao_Estadual: ie });
            alert('Dados atualizados com sucesso!');
            navigate('/clientes');
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
        <div className="container mx-auto px-3 sm:px-4 py-4 max-w-screen-2xl">
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
            <div className="flex flex-wrap border-b border-gray-200 mb-5 gap-0">
                <button
                    onClick={() => setAbaAtiva('operacional')}
                    className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${abaAtiva === 'operacional' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}
                >
                    ✏️ Cadastro
                </button>
                <button
                    onClick={() => setAbaAtiva('admin')}
                    className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${abaAtiva === 'admin' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500'}`}
                >
                    ⚙️ Admin
                </button>
                <button
                    onClick={() => setAbaAtiva('historico')}
                    className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${abaAtiva === 'historico' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}
                >
                    Histórico ({atendimentos.length + pedidosCliente.length + devolucoesCliente.length + leadsCliente.reduce((acc, l) => acc + (l.atendimentos?.length || 0), 0)})
                </button>
                {leadsCliente.length > 0 && (
                    <button
                        onClick={() => setAbaAtiva('lead')}
                        className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${abaAtiva === 'lead' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500'}`}
                    >
                        Lead ({leadsCliente.length})
                    </button>
                )}
            </div>

            {/* ============================= ABA: HISTÓRICO ============================= */}
            {abaAtiva === 'historico' && (() => {
                // Unificar atendimentos (cliente + leads) e pedidos em um único histórico ordenado por data
                const leadAtendimentos = leadsCliente.flatMap(lead =>
                    (lead.atendimentos || []).map(a => ({ ...a, _leadNome: lead.nomeEstabelecimento || `Lead #${lead.numero}`, _leadId: lead.id }))
                );
                const itensHistorico = [
                    ...atendimentos.map(a => ({ ...a, _tipo: 'ATENDIMENTO', _data: new Date(a.criadoEm) })),
                    ...leadAtendimentos.map(a => ({ ...a, _tipo: 'ATENDIMENTO_LEAD', _data: new Date(a.criadoEm) })),
                    ...pedidosCliente.map(p => ({ ...p, _tipo: 'PEDIDO', _data: new Date(p.dataVenda || p.createdAt) })),
                    ...devolucoesCliente.map(d => ({ ...d, _tipo: 'DEVOLUCAO', _data: new Date(d.dataDevolucao) }))
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
                                if (item._tipo === 'DEVOLUCAO') {
                                    const dev = item;
                                    const numPedido = dev.pedidoOriginal?.numero
                                        ? (dev.pedidoOriginal.especial ? `ZZ#${dev.pedidoOriginal.numero}` : `#${dev.pedidoOriginal.numero}`)
                                        : '';
                                    return (
                                        <div key={`dev-${dev.id}`} className="border border-red-200 rounded-lg p-3 bg-red-50">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-200 text-red-800">DEVOLUÇÃO DEV#{dev.numero}</span>
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">{dev.escopo}</span>
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${dev.status === 'ATIVA' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>{dev.status}</span>
                                                {dev.tipo === 'CONTA_AZUL' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">CA</span>}
                                            </div>
                                            <p className="text-sm font-semibold text-red-900">
                                                Pedido {numPedido} · R$ {Number(dev.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </p>
                                            <p className="text-xs text-red-700 mt-0.5">
                                                <span className="font-medium">Motivo:</span> {dev.motivo}
                                            </p>
                                            <div className="text-[11px] text-gray-600 mt-1 space-y-0.5">
                                                {dev.itens?.map(it => (
                                                    <p key={it.id}>• {it.produto?.nome || it.produtoId}: {Number(it.quantidade)} × R$ {Number(it.valorUnitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                                ))}
                                            </div>
                                            <div className="flex flex-wrap gap-3 text-[10px] text-gray-500 mt-2">
                                                <span>Motorista: {dev.motorista?.nome || '-'}</span>
                                                <span>Entrega: {dev.dataEntregaOriginal ? new Date(dev.dataEntregaOriginal).toLocaleDateString('pt-BR') : '-'}</span>
                                                <span>Caixa: {dev.caixaDataReferencia || '-'}</span>
                                                <span>Registrado por: {dev.registradoPor?.nome || '-'}</span>
                                                <span>{new Date(dev.dataDevolucao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                                            </div>
                                            {dev.notaDevolucaoCA && <p className="text-[10px] text-blue-600 mt-1">Nota CA: {dev.notaDevolucaoCA}</p>}
                                            {dev.status === 'REVERTIDA' && (
                                                <p className="text-[10px] text-amber-600 mt-1">Revertida por {dev.revertidoPor?.nome || '-'} em {new Date(dev.revertidoEm).toLocaleDateString('pt-BR')}</p>
                                            )}
                                        </div>
                                    );
                                }
                                if (item._tipo === 'PEDIDO') {
                                    const pedido = item;
                                    const totalItens = pedido.itens?.reduce((acc, i) => acc + (Number(i.valor) * Number(i.quantidade)), 0) || 0;
                                    const freteValor = Number(pedido.valorFrete || 0);
                                    const totalPedido = totalItens + freteValor;

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
                                                    <span className={`text-xs font-bold text-white px-2 py-0.5 rounded flex items-center gap-1 shadow-sm ${pedido.bonificacao ? 'bg-green-600' : pedido.especial ? 'bg-purple-600' : 'bg-blue-600'}`}>
                                                        <ShoppingCart className="h-3 w-3" />
                                                        {pedido.bonificacao ? 'BONIFICAÇÃO' : pedido.especial ? 'ESPECIAL' : 'PEDIDO'} {pedido.numero ? (pedido.bonificacao ? `BN#${pedido.numero}` : pedido.especial ? `ZZ#${pedido.numero}` : `#${pedido.numero}`) : ''}
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

                                            {/* Frete */}
                                            {freteValor > 0 && (
                                                <div className="flex items-center justify-between text-xs text-gray-700 bg-gray-50 px-2 py-1 rounded mt-1">
                                                    <span className="flex items-center gap-1 font-semibold">
                                                        <Package className="h-3 w-3 text-gray-400" /> Frete
                                                    </span>
                                                    <span className="font-semibold text-gray-800">R$ {freteValor.toFixed(2).replace('.', ',')}</span>
                                                </div>
                                            )}

                                            {/* Total e observações */}
                                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                                                {pedido.observacoes ? (
                                                    <p className="text-xs text-gray-500 italic flex-1 mr-3">{pedido.observacoes}</p>
                                                ) : <span />}
                                                <span className="text-sm font-bold text-blue-700 shrink-0">
                                                    Total: R$ {totalPedido.toFixed(2).replace('.', ',')}{freteValor > 0 ? ` (itens R$ ${totalItens.toFixed(2).replace('.', ',')} + frete R$ ${freteValor.toFixed(2).replace('.', ',')})` : ''}
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

            {/* ============================= ABA: OPERACIONAL ============================= */}
            {abaAtiva === 'operacional' && (
              <div className="flex flex-col xl:flex-row gap-5 pb-24 items-start">

                {/* ===================== CONTEÚDO PRINCIPAL ===================== */}
                <div className="flex-1 min-w-0 space-y-4">

                {/* ─── CARD: VENDEDOR E INDICAÇÃO ─── */}
                <SectionCard icon={User} title="Vendedor e Indicação">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Vendedor Responsável</label>
                            <select
                                className="block w-full border border-gray-200 rounded-lg p-2.5 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                value={formData.idVendedor}
                                onChange={(e) => setFormData({ ...formData, idVendedor: e.target.value })}
                            >
                                <option value="">Selecione um vendedor...</option>
                                {vendedores.filter(v => v.ativo !== false || v.id === formData.idVendedor).map(v => (
                                    <option key={v.id} value={v.id}>{v.nome}{v.ativo === false ? ' (INATIVO)' : ''}</option>
                                ))}
                            </select>
                        </div>
                        <div className="relative">
                            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Indicação (quem indicou)</label>
                            {formData.indicacaoId && indicacaoNome ? (
                                <div className="flex items-center gap-2 p-2.5 bg-green-50 border border-green-200 rounded-lg">
                                    <UserPlus className="h-4 w-4 text-green-600 shrink-0" />
                                    <span className="text-sm font-medium text-green-800 flex-1">{indicacaoNome}</span>
                                    <button type="button" onClick={handleLimparIndicacao} className="p-1 text-gray-400 hover:text-red-500">
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                                    <input
                                        type="text"
                                        value={indicacaoSearch}
                                        onChange={(e) => handleBuscarIndicacao(e.target.value)}
                                        onFocus={() => indicacaoResultados.length > 0 && setShowIndicacaoDropdown(true)}
                                        onBlur={() => setTimeout(() => setShowIndicacaoDropdown(false), 200)}
                                        className="block w-full border border-gray-200 rounded-lg pl-9 p-2.5 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                        placeholder="Buscar cliente que indicou..."
                                    />
                                </div>
                            )}
                            {showIndicacaoDropdown && indicacaoResultados.length > 0 && (
                                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                    {indicacaoResultados.map(cli => (
                                        <button key={cli.UUID} type="button" onMouseDown={() => handleSelecionarIndicacao(cli)}
                                            className="w-full text-left px-4 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-0">
                                            <p className="text-sm font-medium text-gray-900">{cli.NomeFantasia || cli.Nome}</p>
                                            <p className="text-xs text-gray-500">{cli.Nome}{cli.End_Cidade ? ` · ${cli.End_Cidade}` : ''}</p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </SectionCard>

                {/* ─── CARD: LOGÍSTICA ─── */}
                <SectionCard icon={Truck} title="Logística">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <DayPicker label="Dia de Visita/Venda" selected={formData.Dia_de_venda} onChange={(val) => setFormData({ ...formData, Dia_de_venda: val })} />
                        <DayPicker label="Dia de Entrega" selected={formData.Dia_de_entrega} onChange={(val) => setFormData({ ...formData, Dia_de_entrega: val })} />
                    </div>
                    <div className="mt-4">
                        <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide"><MapPin className="h-3.5 w-3.5 inline mr-1" />Localização GPS (lat,lng)</label>
                        <input type="text"
                            className="block w-full border border-gray-200 rounded-lg p-2.5 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            placeholder="Ex: -23.550520,-46.633308"
                            value={formData.Ponto_GPS}
                            onChange={(e) => setFormData({ ...formData, Ponto_GPS: e.target.value })}
                        />
                    </div>
                </SectionCard>

                {/* ─── CARD: CANAIS E PAGAMENTO ─── */}
                <SectionCard icon={CreditCard} title="Canais e Pagamento">
                    <div className="mb-5">
                        <label className="block text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">Canais de Atendimento Preferenciais</label>
                        <div className="flex flex-wrap gap-3">
                            {[
                                { nome: 'Presencial', icon: User },
                                { nome: 'Whatsapp', icon: MessageCircle },
                                { nome: 'Telefone', icon: Phone },
                            ].map(({ nome, icon: Icon }) => {
                                const isSelected = (formData.Formas_Atendimento || []).includes(nome);
                                return (
                                    <button key={nome} type="button"
                                        onClick={() => {
                                            const atuais = formData.Formas_Atendimento || [];
                                            setFormData({ ...formData, Formas_Atendimento: isSelected ? atuais.filter(c => c !== nome) : [...atuais, nome] });
                                        }}
                                        className={`flex flex-col items-center justify-center gap-1.5 w-28 sm:w-32 py-3.5 rounded-xl border-2 text-sm font-medium transition-all ${
                                            isSelected ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                                        }`}
                                    >
                                        <Icon className="h-5 w-5" />
                                        {nome}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Condição de Pagamento Padrão</label>
                            <select
                                className="block w-full border border-gray-200 rounded-lg p-2.5 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                value={formData.Condicao_de_pagamento}
                                onChange={(e) => setFormData({ ...formData, Condicao_de_pagamento: e.target.value })}
                            >
                                <option value="">Selecione uma condição padrão...</option>
                                {condicoesPagamento.map(c => (
                                    <option key={c.id} value={c.id}>{c.nomeCondicao}</option>
                                ))}
                            </select>
                            {formData.Condicao_de_pagamento && (() => {
                                const sel = condicoesPagamento.find(c => c.idCondicao === formData.Condicao_de_pagamento);
                                if (!sel) return null;
                                return (
                                    <div className="mt-2 p-2.5 bg-blue-50 rounded-lg border border-blue-100 text-xs grid grid-cols-3 gap-2">
                                        <div><span className="block text-gray-500">Parcelas</span><span className="font-semibold text-gray-900">{sel.qtdParcelas}x</span></div>
                                        <div><span className="block text-gray-500">Dias</span><span className="font-semibold text-gray-900">{sel.parcelasDias}d</span></div>
                                        <div><span className="block text-gray-500">Acréscimo</span><span className={`font-semibold ${Number(sel.acrescimoPreco) > 0 ? 'text-red-600' : 'text-green-600'}`}>{Number(sel.acrescimoPreco) > 0 ? `+${sel.acrescimoPreco}%` : '0%'}</span></div>
                                    </div>
                                );
                            })()}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Condições Permitidas (Flex/App)</label>
                            <div className="border border-gray-200 rounded-lg overflow-hidden">
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
                                    placeholder="Selecione as condições..."
                                />
                            </div>
                            <p className="text-xs text-gray-400 mt-1">Condições visíveis no App de Vendas.</p>
                        </div>
                    </div>
                </SectionCard>

                {/* ─── CARD: INTELIGÊNCIA COMERCIAL ─── */}
                <SectionCard icon={Sparkles} title="Inteligência Comercial">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Categoria (Segmento)</label>
                            <select
                                className="block w-full border border-gray-200 rounded-lg p-2.5 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
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
                            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Sobrescrever Ciclo (Dias)</label>
                            <input type="number"
                                className="block w-full border border-gray-200 rounded-lg p-2.5 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                placeholder="Ex: 5"
                                value={formData.cicloCompraPersonalizadoDias}
                                onChange={(e) => setFormData({ ...formData, cicloCompraPersonalizadoDias: e.target.value ? parseInt(e.target.value) : '' })}
                            />
                            <p className="text-xs text-gray-400 mt-1">Deixe em branco para usar o da categoria.</p>
                        </div>
                    </div>
                    <div className="mt-4">
                        <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Aviso Comercial Fixado</label>
                        <textarea
                            className="block w-full border border-gray-200 rounded-lg p-2.5 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
                            rows="2"
                            placeholder="Alerta importante sobre venda/negociação para este cliente..."
                            value={formData.observacaoComercialFixa}
                            onChange={(e) => setFormData({ ...formData, observacaoComercialFixa: e.target.value })}
                        />
                    </div>
                    <div className="mt-4 space-y-3 pt-4 border-t border-gray-100">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-700">Insights Ativos (sugerir produtos na venda)</span>
                            <Toggle checked={formData.insightAtivo} onChange={(v) => setFormData({ ...formData, insightAtivo: v })} />
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-700">Recebe aviso de pedido via WhatsApp</span>
                            <Toggle checked={formData.recebeAvisoPedido} onChange={(v) => setFormData({ ...formData, recebeAvisoPedido: v })} />
                        </div>
                    </div>
                </SectionCard>

                {/* ─── CARD: CONTATO / FISCAL ─── */}
                <SectionCard icon={Mail} title="Contato / Fiscal"
                    badge={podeEditarCadastroCA && <span className="flex items-center gap-1 text-xs text-blue-500 font-normal"><RefreshCw className="h-3 w-3" /> sincroniza com o Conta Azul</span>}
                >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">E-mail</label>
                            <input type="email"
                                className={`block w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${podeEditarCadastroCA ? 'bg-white text-gray-900' : 'bg-gray-50 text-gray-700 cursor-default'}`}
                                placeholder="cliente@email.com"
                                readOnly={!podeEditarCadastroCA}
                                value={formData.Email}
                                onChange={(e) => podeEditarCadastroCA && setFormData({ ...formData, Email: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Celular</label>
                            <input type="tel" inputMode="numeric" maxLength={11}
                                className={`block w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${podeEditarCadastroCA ? 'bg-white text-gray-900' : 'bg-gray-50 text-gray-700 cursor-default'}`}
                                placeholder="47999126739"
                                readOnly={!podeEditarCadastroCA}
                                value={formData.Telefone_Celular}
                                onChange={(e) => podeEditarCadastroCA && setFormData({ ...formData, Telefone_Celular: e.target.value.replace(/\D/g, '') })}
                            />
                            <p className="text-xs text-gray-400 mt-1">Só números com DDD (10–11 dígitos).</p>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Inscrição Estadual (SC)</label>
                            <input type="text" inputMode="numeric" maxLength={9}
                                className={`block w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${podeEditarCadastroCA ? 'bg-white text-gray-900' : 'bg-gray-50 text-gray-700 cursor-default'}`}
                                placeholder="9 dígitos"
                                readOnly={!podeEditarCadastroCA}
                                value={formData.Inscricao_Estadual}
                                onChange={(e) => podeEditarCadastroCA && setFormData({ ...formData, Inscricao_Estadual: e.target.value.replace(/\D/g, '') })}
                            />
                            {podeEditarCadastroCA && (
                                <button type="button" onClick={abrirSintegra}
                                    className="mt-1 inline-flex items-center text-xs text-blue-600 hover:text-blue-800 font-medium">
                                    <ExternalLink className="h-3 w-3 mr-1" /> Consultar no Sintegra SC
                                </button>
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Indicador de IE</label>
                            <select
                                className={`block w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${podeEditarCadastroCA ? 'bg-white text-gray-900' : 'bg-gray-50 text-gray-700 cursor-default'}`}
                                disabled={!podeEditarCadastroCA}
                                value={formData.Indicador_Inscricao_Estadual}
                                onChange={(e) => setFormData({ ...formData, Indicador_Inscricao_Estadual: e.target.value })}
                            >
                                <option value="">— Selecionar —</option>
                                <option value="CONTRIBUINTE">Contribuinte</option>
                                <option value="CONTRIBUINTE_ISENTO">Contribuinte Isento</option>
                                <option value="NAO_CONTRIBUINTE">Não Contribuinte</option>
                            </select>
                        </div>
                    </div>
                </SectionCard>

                {/* ─── CARD: OBSERVAÇÕES ─── */}
                <SectionCard icon={FileText} title="Observações Gerais">
                    <textarea
                        className="block w-full border border-gray-200 rounded-lg p-2.5 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
                        rows="4"
                        placeholder="Observações sobre o cliente (sincroniza com o Conta Azul)..."
                        value={formData.Observacoes_Gerais}
                        onChange={(e) => setFormData({ ...formData, Observacoes_Gerais: e.target.value })}
                    />
                </SectionCard>

                {/* ─── CONTA AZUL: visível só no mobile (colapsível) ─── */}
                <details className="xl:hidden bg-gray-50 rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <summary className="flex items-center gap-2 px-5 py-3.5 cursor-pointer select-none">
                        <Building className="h-4 w-4 text-gray-500 shrink-0" />
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Dados da Conta Azul</span>
                        <span className="ml-2 text-xs text-gray-400">(somente leitura)</span>
                    </summary>
                    <div className="px-5 pb-5 space-y-3 border-t border-gray-200">
                        <div className="grid grid-cols-2 gap-4 pt-3 text-sm">
                            <div><span className="text-xs text-gray-400 block">Tipo Pessoa</span><span className="text-gray-900">{cliente.Tipo_Pessoa || '-'}</span></div>
                            <div><span className="text-xs text-gray-400 block">Código</span><span className="text-gray-900">{cliente.Codigo || '-'}</span></div>
                            <div className="col-span-2"><span className="text-xs text-gray-400 block">Email</span><span className="text-gray-900 break-all">{cliente.Email || '-'}</span></div>
                            <div><span className="text-xs text-gray-400 block">Telefone</span><span className="text-gray-900">{cliente.Telefone || '-'}</span></div>
                            <div><span className="text-xs text-gray-400 block">Celular (CA)</span><span className="text-gray-900">{cliente.Telefone_Celular || '-'}</span></div>
                            <div><span className="text-xs text-gray-400 block">Inscrição Estadual</span><span className="text-gray-900">{cliente.Inscricao_Estadual || '-'}</span></div>
                            <div><span className="text-xs text-gray-400 block">Indicador IE</span><span className="text-gray-900">{({ CONTRIBUINTE: 'Contribuinte', CONTRIBUINTE_ISENTO: 'Isento', NAO_CONTRIBUINTE: 'Não contribuinte' })[cliente.Indicador_Inscricao_Estadual] || '-'}</span></div>
                        </div>
                        <div className="text-sm"><span className="text-xs text-gray-400 block">Endereço</span>
                            <span className="text-gray-900">{[cliente.End_Logradouro, cliente.End_Numero, cliente.End_Bairro, cliente.End_Cidade, cliente.End_Estado].filter(Boolean).join(', ')}{cliente.End_CEP ? ` — ${cliente.End_CEP}` : ''}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div><span className="text-xs text-gray-400 block">Atrasos Pag.</span><span className={`font-semibold ${Number(cliente.Atrasos_Pagamentos) > 0 ? 'text-red-600' : 'text-gray-900'}`}>{cliente.Atrasos_Pagamentos || '0'}</span></div>
                            <div><span className="text-xs text-gray-400 block">Atrasos Rec.</span><span className="text-gray-900">{cliente.Atrasos_Recebimentos || '0'}</span></div>
                        </div>
                        <div><span className="text-xs text-gray-400 block">UUID</span><span className="text-gray-700 font-mono text-xs break-all">{cliente.UUID}</span></div>
                    </div>
                </details>

                </div>{/* fim flex-1 */}

                {/* ─── SIDEBAR: CONTA AZUL (desktop only, sticky) ─── */}
                <aside className="hidden xl:block w-72 shrink-0 sticky top-4 self-start space-y-3">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
                            <Building className="h-4 w-4 text-gray-500" />
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Dados da Conta Azul</span>
                            <span className="ml-auto text-xs text-gray-400">somente leitura</span>
                        </div>
                        <div className="p-4 space-y-4 text-sm">
                            {/* Tipo + Perfis */}
                            <div className="grid grid-cols-2 gap-3">
                                <div><span className="block text-xs text-gray-400 mb-0.5">Tipo Pessoa</span><span className="font-medium text-gray-900">{cliente.Tipo_Pessoa || '-'}</span></div>
                                <div><span className="block text-xs text-gray-400 mb-0.5">Código</span><span className="font-medium text-gray-900">{cliente.Codigo || '-'}</span></div>
                            </div>
                            {/* Perfis */}
                            {cliente.Perfis && (() => {
                                let perfis = [];
                                try { perfis = JSON.parse(cliente.Perfis); } catch { perfis = [cliente.Perfis]; }
                                if (!Array.isArray(perfis) || perfis.length === 0) return null;
                                return (
                                    <div>
                                        <span className="block text-xs text-gray-400 mb-1.5">Perfis</span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {perfis.map((p, i) => <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-100">{p}</span>)}
                                        </div>
                                    </div>
                                );
                            })()}
                            <div className="border-t border-gray-100 pt-3 space-y-2">
                                <div><span className="block text-xs text-gray-400 mb-0.5">Email</span><span className="text-gray-900 break-all">{cliente.Email || '-'}</span></div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><span className="block text-xs text-gray-400 mb-0.5">Telefone</span><span className="text-gray-900">{cliente.Telefone || '-'}</span></div>
                                    <div><span className="block text-xs text-gray-400 mb-0.5">Celular</span><span className="text-gray-900">{cliente.Telefone_Celular || '-'}</span></div>
                                </div>
                            </div>
                            <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-3">
                                <div><span className="block text-xs text-gray-400 mb-0.5">IE</span><span className="text-gray-900">{cliente.Inscricao_Estadual || '-'}</span></div>
                                <div><span className="block text-xs text-gray-400 mb-0.5">Indicador IE</span><span className="text-gray-900">{({ CONTRIBUINTE: 'Contribuinte', CONTRIBUINTE_ISENTO: 'Isento', NAO_CONTRIBUINTE: 'Não contrib.' })[cliente.Indicador_Inscricao_Estadual] || '-'}</span></div>
                            </div>
                            <div className="border-t border-gray-100 pt-3">
                                <span className="block text-xs text-gray-400 mb-1"><MapPin className="h-3 w-3 inline mr-0.5" />Endereço</span>
                                <p className="text-gray-900 leading-relaxed">
                                    {cliente.End_Logradouro}{cliente.End_Numero ? `, ${cliente.End_Numero}` : ''}
                                    {cliente.End_Complemento ? <><br/>{cliente.End_Complemento}</> : ''}
                                    {cliente.End_Bairro ? <><br/>{cliente.End_Bairro}</> : ''}
                                    {(cliente.End_Cidade || cliente.End_Estado) ? <><br/>{cliente.End_Cidade}{cliente.End_Estado ? ` - ${cliente.End_Estado}` : ''}</> : ''}
                                    {cliente.End_CEP ? <><br/><span className="text-gray-500">CEP: {cliente.End_CEP}</span></> : ''}
                                </p>
                            </div>
                            <div className="border-t border-gray-100 pt-3">
                                <span className="block text-xs text-gray-400 mb-2"><DollarSign className="h-3 w-3 inline mr-0.5" />Financeiro</span>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className={`p-2 rounded-lg ${Number(cliente.Atrasos_Pagamentos) > 0 ? 'bg-red-50 border border-red-100' : 'bg-gray-50'}`}>
                                        <span className="block text-xs text-gray-400">Atrasos Pag.</span>
                                        <span className={`font-semibold ${Number(cliente.Atrasos_Pagamentos) > 0 ? 'text-red-600' : 'text-gray-900'}`}>{cliente.Atrasos_Pagamentos || '0'}</span>
                                        {Number(cliente.Atrasos_Pagamentos) > 0 && <AlertTriangle className="h-3 w-3 text-red-500 inline ml-1" />}
                                    </div>
                                    <div className="p-2 rounded-lg bg-gray-50">
                                        <span className="block text-xs text-gray-400">Pag. Mês</span>
                                        <span className="font-semibold text-gray-900">{cliente.Pagamentos_Mes_Atual || '0'}</span>
                                    </div>
                                    <div className="p-2 rounded-lg bg-gray-50">
                                        <span className="block text-xs text-gray-400">Atrasos Rec.</span>
                                        <span className="font-semibold text-gray-900">{cliente.Atrasos_Recebimentos || '0'}</span>
                                    </div>
                                    <div className="p-2 rounded-lg bg-gray-50">
                                        <span className="block text-xs text-gray-400">Rec. Mês</span>
                                        <span className="font-semibold text-gray-900">{cliente.Recebimentos_Mes_Atual || '0'}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="border-t border-gray-100 pt-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div><span className="block text-xs text-gray-400 mb-0.5">Criação</span><span className="text-gray-900">{cliente.Data_Criacao ? new Date(cliente.Data_Criacao).toLocaleDateString('pt-BR') : '-'}</span></div>
                                    <div><span className="block text-xs text-gray-400 mb-0.5">Alteração</span><span className="text-gray-900">{cliente.Data_Alteracao ? new Date(cliente.Data_Alteracao).toLocaleDateString('pt-BR') : '-'}</span></div>
                                </div>
                                <div className="mt-2"><span className="block text-xs text-gray-400 mb-0.5">UUID</span><span className="text-gray-500 font-mono text-xs break-all">{cliente.UUID}</span></div>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* ─── BARRA DE AÇÕES (sticky rodapé) ─── */}
                <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-lg px-4 py-3 flex justify-end gap-3 xl:hidden">
                    <button onClick={handleCancel} className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2">
                        <X className="h-4 w-4" /> Descartar
                    </button>
                    <button onClick={handleSave} className="px-6 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm">
                        <Save className="h-4 w-4" /> Salvar Alterações
                    </button>
                </div>
                <div className="hidden xl:flex fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-lg px-6 py-3 justify-end gap-3">
                    <button onClick={handleCancel} className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2">
                        <X className="h-4 w-4" /> Descartar
                    </button>
                    <button onClick={handleSave} className="px-8 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm">
                        <Save className="h-4 w-4" /> Salvar Alterações
                    </button>
                </div>

              </div>
            )}

            {/* ============================= ABA: ADMIN ============================= */}
            {abaAtiva === 'admin' && (
                <div className="bg-white rounded-lg p-6 border border-purple-200 shadow-sm">
                    <div className="flex justify-between items-center mb-5">
                        <h2 className="text-lg font-semibold text-purple-800 flex items-center">
                            <Sparkles className="h-5 w-5 mr-2 text-purple-600" />
                            [Admin] Motor Analítico (Inteligência Comercial)
                        </h2>
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
                                <span className={`font-semibold ${insight.statusRecompra === 'NO_PRAZO' ? 'text-green-600' : insight.statusRecompra === 'ATENCAO' ? 'text-yellow-600' : insight.statusRecompra === 'ATRASADO' ? 'text-orange-600' : insight.statusRecompra === 'CRITICO' ? 'text-red-600' : 'text-gray-600'}`}>{insight.statusRecompra}</span>
                                <div className="text-xs text-gray-500 mt-1">Ciclo: {insight.cicloReferenciaDias}d ({insight.origemCiclo})<br />Dias s/ compra: {insight.diasSemComprar ?? '-'}</div>
                            </div>
                            <div className="p-3 bg-white border rounded">
                                <span className="block text-xs text-gray-500 mb-1">Ticket Médio</span>
                                <span className="font-semibold text-gray-800">R$ {Number(insight.ticketMedioBase || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                <div className="text-xs text-gray-500 mt-1">Recente: R$ {Number(insight.ticketMedioRecente || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}<br />Variação: <span className={Number(insight.variacaoTicketPct) < 0 ? 'text-red-600' : 'text-green-600'}>{Number(insight.variacaoTicketPct || 0).toFixed(1)}%</span></div>
                            </div>
                            <div className="p-3 bg-white border rounded">
                                <span className="block text-xs text-gray-500 mb-1">Oportunidade (Upsell)</span>
                                <span className="font-semibold text-gray-800">Score: {insight.scoreOportunidade}/100</span>
                                <div className="text-xs text-gray-500 mt-1">{insight.produtoAusenteId ? <span className="text-purple-600">Produto Parou de Sair</span> : 'Sem oportunidade clara'}</div>
                            </div>
                            <div className="p-3 bg-white border rounded">
                                <span className="block text-xs text-gray-500 mb-1">Risco (Churn)</span>
                                <span className="font-semibold text-gray-800">Score: {insight.scoreRisco}/100</span>
                                <div className="text-xs text-gray-500 mt-1 flex flex-col gap-0.5">
                                    {insight.teveDevolucaoRecente && <span className="text-red-600">• Teve devolução (30d)</span>}
                                    {insight.qtdAtendimentosSemPedido30d > 1 && <span className="text-orange-600">• {insight.qtdAtendimentosSemPedido30d} visitas s/ pedido</span>}
                                    {(!insight.teveDevolucaoRecente && insight.qtdAtendimentosSemPedido30d <= 1) && <span>Risco baixo aparente</span>}
                                </div>
                            </div>
                            <div className="col-span-2 lg:col-span-4 p-2 bg-gray-100 rounded text-xs text-gray-500 flex justify-between items-center">
                                <span>Painel de debug. O vendedor não verá estes dados desta forma.</span>
                                <span>Último cálculo: {new Date(insight.recalculadoEm).toLocaleString('pt-BR')}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default DetalheCliente;
