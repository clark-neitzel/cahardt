import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { abrirLinkExterno } from '../../utils/linkExterno';
import { useAuth } from '../../contexts/AuthContext';
import atendimentoService from '../../services/atendimentoService';
import vendedorService from '../../services/vendedorService';
import SelectBusca from '../../components/SelectBusca';
import SeloWhatsappCliente, { LegendaSeloWhatsapp } from '../../components/SeloWhatsappCliente';
import whatsappClientesService from '../../services/whatsappClientesService';
import { useFiltrosSalvos } from '../../hooks/useFiltrosSalvos';
import ClientePopup from '../Rota/ClientePopup';
// Popup SÓ DE CONSULTA do pedido (leitura + fechar). A popup COMPLETA, com as ações do
// pedido, continua sendo a da aba Pedidos — ver o cabeçalho de ModalPedidoConsulta.jsx.
import ModalPedidoConsulta from './ModalPedidoConsulta';
import {
    Search, RefreshCw, ChevronLeft, ChevronRight,
    User, MapPin, ArrowLeftRight, Bell, Clock,
    X, Download,
    ClipboardList, Eye, MessageCircle, Phone, Truck, Trash2,
    Building2, ShoppingCart
} from 'lucide-react';
import toast from 'react-hot-toast';

const TIPOS_ATENDIMENTO = [
    { value: '', label: 'Todos os tipos' },
    { value: 'PRESENCIAL', label: 'Presencial' },
    { value: 'VISITA', label: 'Visita' },
    { value: 'WHATSAPP', label: 'WhatsApp' },
    { value: 'LIGACAO', label: 'Ligação' },
    { value: 'PEDIDO', label: 'Só pedidos' },
    { value: 'SITE', label: 'Site / Kit Festa' },
    { value: 'AMOSTRA', label: 'Amostra' },
    { value: 'RETORNO', label: 'Retorno' },
    { value: 'FINANCEIRO', label: 'Financeiro' },
];

const TIPO_BADGE = {
    PRESENCIAL: 'bg-purple-100 text-purple-700',
    VISITA: 'bg-purple-100 text-purple-700',
    WHATSAPP: 'bg-green-100 text-green-700',
    LIGACAO: 'bg-blue-100 text-blue-700',
    PEDIDO: 'bg-sky-100 text-sky-700',
    SITE: 'bg-teal-100 text-teal-700',
    AMOSTRA: 'bg-amber-100 text-amber-700',
    RETORNO: 'bg-indigo-100 text-indigo-700',
    FINANCEIRO: 'bg-gray-100 text-gray-600',
};

const TIPO_ICON = {
    PRESENCIAL: User,
    VISITA: User,
    WHATSAPP: MessageCircle,
    LIGACAO: Phone,
    PEDIDO: ShoppingCart,
    SITE: Building2,
    AMOSTRA: Truck,
    RETORNO: Clock,
    FINANCEIRO: ClipboardList,
};

const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-';
const fmtHora = (d) => d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '';
const fmtDataHora = (d) => d ? `${fmtData(d)} ${fmtHora(d)}` : '-';
const fmtMoeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// No select de ações, todo pedido conta como uma opção só ("Pedido") — senão cada
// venda viraria uma opção diferente ("Pedido #123", "Pedido #124"...).
const rotuloAcao = (a) => a.origemPedido ? 'Pedido' : a.acaoLabel;

const PainelAtendimentos = () => {
    const { user } = useAuth();
    const isAdmin = !!user?.permissoes?.admin;

    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    const [data, setData] = useState([]);
    const [clientesComPedido, setClientesComPedido] = useState(new Set());
    const [resumo, setResumo] = useState({ total: 0, porTipo: {}, porVendedor: {}, comPedido: 0, semPedido: 0, lead: 0 });
    const [loading, setLoading] = useState(false);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [vendedores, setVendedores] = useState([]);
    const [expandedRow, setExpandedRow] = useState(null);
    const [clientePopup, setClientePopup] = useState(null);
    // Linha do painel cuja pílula "Pedido #NNNN" foi clicada (popup de consulta)
    const [pedidoPopup, setPedidoPopup] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [deletando, setDeletando] = useState(false);
    // Tipos de atendimento são configuráveis (Configurações), então o select junta a lista
    // fixa com o que realmente aparece. Acumula ao longo da sessão: se limpasse a cada
    // busca, ao filtrar por um tipo os outros sumiriam do menu e não daria para trocar.
    const [tiposVistos, setTiposVistos] = useState([]);

    // Filtros persistidos por usuário (busca livre, datas — padrão "hoje" — e paginação ficam de fora)
    const [filtrosSalvos, setFiltrosSalvos] = useFiltrosSalvos('painel-atendimentos', {
        vendedorId: '',
        tipo: '',
        filtroEspecial: '',
        cidade: '',
        acao: '',
    });
    const [filtros, setFiltros] = useState({
        ...filtrosSalvos,
        busca: '',
        dataInicio: hoje,
        dataFim: hoje,
        page: 1,
        limit: 50,
    });

    // Selo de WhatsApp na linha — aqui é SOMENTE LEITURA (acompanhamento do
    // escritório, não campo de cadastro). Falha na leitura = selo não aparece,
    // em silêncio.
    const [mostrarSeloWhats, setMostrarSeloWhats] = useState(false);
    useEffect(() => {
        whatsappClientesService.config()
            .then(cfg => setMostrarSeloWhats(cfg?.mostrarSeloNasListas === true))
            .catch(() => setMostrarSeloWhats(false));
    }, []);

    // Carregar vendedores (todos, incluindo inativos)
    useEffect(() => {
        vendedorService.listar().then(v => {
            setVendedores(v.sort((a, b) => {
                if (a.ativo && !b.ativo) return -1;
                if (!a.ativo && b.ativo) return 1;
                return a.nome.localeCompare(b.nome);
            }));
        }).catch(console.error);
    }, []);

    const carregar = useCallback(async () => {
        try {
            setLoading(true);
            const params = {};
            if (filtros.vendedorId) params.vendedorId = filtros.vendedorId;
            if (filtros.tipo) params.tipo = filtros.tipo;
            if (filtros.dataInicio) params.dataInicio = filtros.dataInicio;
            if (filtros.dataFim) params.dataFim = filtros.dataFim;
            params.page = filtros.page;
            params.limit = filtros.limit;

            const result = await atendimentoService.listarComFiltros(params);
            setData(result.data || []);
            setClientesComPedido(new Set(result.clientesComPedido || []));
            setTotal(result.total || 0);
            setTotalPages(result.totalPages || 1);
            if (result.resumo) {
                setResumo(result.resumo);
                const vistos = Object.keys(result.resumo.porTipo || {});
                setTiposVistos(prev => (vistos.every(t => prev.includes(t)) ? prev : [...new Set([...prev, ...vistos])]));
            }
        } catch (error) {
            console.error(error);
            toast.error('Erro ao carregar atendimentos.');
        } finally {
            setLoading(false);
        }
    }, [filtros]);

    useEffect(() => { carregar(); }, [carregar]);

    useEffect(() => {
        const { busca, dataInicio, dataFim, page, limit, ...persistiveis } = filtros;
        setFiltrosSalvos(persistiveis);
    }, [filtros]);

    const handleFiltro = (campo, valor) => {
        setFiltros(prev => ({ ...prev, [campo]: valor, page: 1 }));
    };

    const limparFiltros = () => {
        setFiltros({
            vendedorId: '',
            tipo: '',
            busca: '',
            filtroEspecial: '',
            cidade: '',
            acao: '',
            dataInicio: hoje,
            dataFim: hoje,
            page: 1,
            limit: 50,
        });
    };

    const navegarPeriodo = (direcao) => {
        const inicio = new Date(filtros.dataInicio + 'T00:00:00');
        const fim = new Date(filtros.dataFim + 'T00:00:00');
        const diffMs = fim.getTime() - inicio.getTime();
        const diffDias = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);

        const novoInicio = new Date(inicio);
        const novoFim = new Date(fim);
        novoInicio.setDate(novoInicio.getDate() + (direcao * diffDias));
        novoFim.setDate(novoFim.getDate() + (direcao * diffDias));

        setFiltros(prev => ({
            ...prev,
            dataInicio: novoInicio.toISOString().split('T')[0],
            dataFim: novoFim.toISOString().split('T')[0],
            page: 1,
        }));
    };

    const labelPeriodo = useMemo(() => {
        if (filtros.dataInicio === filtros.dataFim) {
            const hj = new Date().toISOString().split('T')[0];
            if (filtros.dataInicio === hj) return 'Hoje';
            const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
            if (filtros.dataInicio === ontem.toISOString().split('T')[0]) return 'Ontem';
            const d = new Date(filtros.dataInicio + 'T12:00:00');
            return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
        }
        const di = new Date(filtros.dataInicio + 'T12:00:00');
        const df = new Date(filtros.dataFim + 'T12:00:00');
        return `${di.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} - ${df.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
    }, [filtros.dataInicio, filtros.dataFim]);

    // Opções do select de tipo: lista fixa + tipos configurados que apareceram
    const opcoesTipo = useMemo(() => {
        const fixos = TIPOS_ATENDIMENTO.map(t => t.value);
        const extras = tiposVistos.filter(t => t && !fixos.includes(t)).sort();
        return [...TIPOS_ATENDIMENTO, ...extras.map(v => ({ value: v, label: v.charAt(0) + v.slice(1).toLowerCase() }))];
    }, [tiposVistos]);

    // Valores únicos de ação para o select
    const acoesDisponiveis = useMemo(() => {
        const set = new Set();
        data.forEach(a => { const r = rotuloAcao(a); if (r) set.add(r); });
        return [...set].sort();
    }, [data]);

    // Filtro local por busca, cidade, ação e filtro especial
    const dataFiltrada = useMemo(() => {
        let lista = data;
        if (filtros.busca.trim()) {
            const termo = filtros.busca.toLowerCase();
            lista = lista.filter(a => {
                const nomeCliente = (a.cliente?.NomeFantasia || a.cliente?.Nome || '').toLowerCase();
                const nomeLead = (a.lead?.nomeEstabelecimento || '').toLowerCase();
                const nomeVendedor = (a.vendedor?.nome || '').toLowerCase();
                const obs = (a.observacao || '').toLowerCase();
                return nomeCliente.includes(termo) || nomeLead.includes(termo) || nomeVendedor.includes(termo) || obs.includes(termo);
            });
        }
        if (filtros.cidade.trim()) {
            const termo = filtros.cidade.toLowerCase();
            lista = lista.filter(a => (a.cliente?.End_Cidade || '').toLowerCase().includes(termo));
        }
        if (filtros.acao) {
            lista = lista.filter(a => rotuloAcao(a) === filtros.acao);
        }
        if (filtros.filtroEspecial === 'com_pedido') lista = lista.filter(a => a.origemPedido || (a.clienteId && clientesComPedido.has(a.clienteId)));
        if (filtros.filtroEspecial === 'sem_pedido') lista = lista.filter(a => !a.origemPedido && a.clienteId && !clientesComPedido.has(a.clienteId));
        if (filtros.filtroEspecial === 'lead') lista = lista.filter(a => !!a.leadId);
        return lista;
    }, [data, filtros.busca, filtros.cidade, filtros.acao, filtros.filtroEspecial, clientesComPedido]);

    const handleDelete = async (id) => {
        try {
            setDeletando(true);
            await atendimentoService.excluir(id);
            toast.success('Atendimento excluído.');
            setConfirmDelete(null);
            setExpandedRow(null);
            carregar();
        } catch (err) {
            toast.error('Erro ao excluir atendimento.');
            console.error(err);
        } finally {
            setDeletando(false);
        }
    };

    const exportarCSV = () => {
        if (dataFiltrada.length === 0) return;
        const headers = ['Data', 'Hora', 'Vendedor', 'Tipo', 'Cliente/Lead', 'Cidade', 'Acao', 'Pedido', 'Valor', 'Observacao', 'Data Retorno', 'Assunto Retorno', 'Transferido Para', 'GPS'];
        const rows = dataFiltrada.map(a => [
            fmtData(a.criadoEm),
            fmtHora(a.criadoEm),
            a.vendedor?.nome || '',
            a.tipo || '',
            a.cliente ? (a.cliente.NomeFantasia || a.cliente.Nome) : (a.lead?.nomeEstabelecimento || ''),
            a.cliente?.End_Cidade || '',
            a.acaoLabel || '',
            a.origemPedido ? a.rotuloPedido : '',
            a.origemPedido ? Number(a.valorPedido || 0).toFixed(2).replace('.', ',') : '',
            (a.observacao || '').replace(/[\n\r]/g, ' '),
            a.dataRetorno ? fmtData(a.dataRetorno) : '',
            a.assuntoRetorno || '',
            a.transferidoPara?.nome || '',
            a.gpsVendedor || '',
        ]);
        const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `atendimentos_${filtros.dataInicio}_${filtros.dataFim}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const temFiltroAtivo = filtros.vendedorId || filtros.tipo || filtros.busca || filtros.filtroEspecial || filtros.cidade || filtros.acao;

    const TipoIcon = ({ tipo }) => {
        const Icon = TIPO_ICON[tipo] || ClipboardList;
        return <Icon className="h-3.5 w-3.5" />;
    };

    return (
        <div className="py-4 sm:py-6 space-y-3">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <ClipboardList className="h-6 w-6 text-blue-600" />
                        Painel de Atendimentos
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {total} atendimento{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
                        {resumo.pedidos > 0 && <span className="text-green-700 font-medium"> · {resumo.pedidos} com pedido registrado</span>}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={carregar} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
                    </button>
                    <button onClick={exportarCSV} disabled={dataFiltrada.length === 0} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
                        <Download className="h-4 w-4" /> CSV
                    </button>
                </div>
            </div>

            {/* ── FILTROS FIXOS ── */}
            <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 bg-gray-50 py-2">
                <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm space-y-2">

                    {/* Linha 1: período + atalhos + vendedor + tipo */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Navegação data */}
                        <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => navegarPeriodo(-1)} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                                <ChevronLeft className="h-4 w-4 text-gray-600" />
                            </button>
                            <input type="date" value={filtros.dataInicio} onChange={e => handleFiltro('dataInicio', e.target.value)}
                                className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-[120px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                            <span className="text-gray-400 text-sm">-</span>
                            <input type="date" value={filtros.dataFim} onChange={e => handleFiltro('dataFim', e.target.value)}
                                className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-[120px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                            <button onClick={() => navegarPeriodo(1)} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                                <ChevronRight className="h-4 w-4 text-gray-600" />
                            </button>
                        </div>

                        {/* Atalhos período */}
                        <div className="flex gap-1 shrink-0">
                            <button onClick={() => setFiltros(prev => ({ ...prev, dataInicio: hoje, dataFim: hoje, page: 1 }))}
                                className={`px-2 py-1 text-xs font-semibold rounded-lg border transition-colors ${filtros.dataInicio === hoje && filtros.dataFim === hoje ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
                                Hoje
                            </button>
                            <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - 1); const o = d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); setFiltros(prev => ({ ...prev, dataInicio: o, dataFim: o, page: 1 })); }}
                                className="px-2 py-1 text-xs font-semibold bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                                Ontem
                            </button>
                            <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - 7); setFiltros(prev => ({ ...prev, dataInicio: d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }), dataFim: hoje, page: 1 })); }}
                                className="px-2 py-1 text-xs font-semibold bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                                7d
                            </button>
                            <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - 30); setFiltros(prev => ({ ...prev, dataInicio: d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }), dataFim: hoje, page: 1 })); }}
                                className="px-2 py-1 text-xs font-semibold bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                                30d
                            </button>
                        </div>

                        {/* Vendedor */}
                        <SelectBusca value={filtros.vendedorId} onChange={e => handleFiltro('vendedorId', e.target.value)}
                            className="min-w-[130px] flex-1">
                            <option value="">Todos vendedores</option>
                            {vendedores.map(v => (
                                <option key={v.id} value={v.id}>
                                    {v.nome}{!v.ativo ? ' (inativo)' : ''}
                                </option>
                            ))}
                        </SelectBusca>

                        {/* Tipo */}
                        <SelectBusca value={filtros.tipo} onChange={e => handleFiltro('tipo', e.target.value)}
                            className="min-w-[120px] flex-1">
                            {opcoesTipo.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </SelectBusca>

                        {/* Limpar filtros */}
                        {temFiltroAtivo && (
                            <button onClick={limparFiltros} className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors shrink-0">
                                <X className="h-3.5 w-3.5" /> Limpar
                            </button>
                        )}
                    </div>

                    {/* Linha 2: busca + cidade + ação */}
                    <div className="flex flex-wrap gap-2">
                        {/* Busca geral */}
                        <div className="relative flex-1 min-w-[160px]">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                            <input type="text" placeholder="Cliente, lead, vendedor ou obs..." value={filtros.busca} onChange={e => handleFiltro('busca', e.target.value)}
                                className="w-full border border-gray-300 rounded-lg pl-8 pr-7 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                            {filtros.busca && (
                                <button onClick={() => handleFiltro('busca', '')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>

                        {/* Cidade */}
                        <div className="relative min-w-[110px] flex-shrink-0">
                            <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                            <input type="text" placeholder="Cidade..." value={filtros.cidade} onChange={e => handleFiltro('cidade', e.target.value)}
                                className="w-full border border-gray-300 rounded-lg pl-8 pr-7 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                            {filtros.cidade && (
                                <button onClick={() => handleFiltro('cidade', '')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>

                        {/* Ação */}
                        <SelectBusca value={filtros.acao} onChange={e => handleFiltro('acao', e.target.value)}
                            className="min-w-[130px]">
                            <option value="">Todas as ações</option>
                            {acoesDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
                        </SelectBusca>
                    </div>
                </div>
            </div>

            {/* Resumo cards - tipos */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-gray-900">{resumo.total}</p>
                    <p className="text-[11px] text-gray-500 font-medium">Total</p>
                </div>
                {Object.entries(resumo.porTipo).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tipo, count]) => (
                    <div key={tipo} className={`bg-white border rounded-lg p-3 text-center cursor-pointer transition-colors ${filtros.tipo === tipo ? 'border-blue-400 ring-1 ring-blue-400' : 'border-gray-200 hover:border-blue-300'}`}
                        onClick={() => handleFiltro('tipo', filtros.tipo === tipo ? '' : tipo)}>
                        <p className="text-2xl font-bold text-gray-900">{count}</p>
                        <p className={`text-[11px] font-semibold px-1.5 py-0.5 rounded inline-block ${TIPO_BADGE[tipo] || 'bg-gray-100 text-gray-600'}`}>{tipo}</p>
                    </div>
                ))}
            </div>

            {/* Resumo cards - pedidos, com/sem pedido e lead */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className={`border rounded-lg p-3 text-center cursor-pointer transition-colors ${filtros.tipo === 'PEDIDO' ? 'border-sky-400 bg-sky-50 ring-1 ring-sky-400' : 'bg-white border-gray-200 hover:border-sky-300'}`}
                    onClick={() => handleFiltro('tipo', filtros.tipo === 'PEDIDO' ? '' : 'PEDIDO')}>
                    <p className="text-2xl font-bold text-sky-700">{resumo.pedidos || 0}</p>
                    <p className="text-[11px] font-semibold text-sky-600">Pedidos</p>
                </div>
                <div className={`border rounded-lg p-3 text-center cursor-pointer transition-colors ${filtros.filtroEspecial === 'com_pedido' ? 'border-green-400 bg-green-50 ring-1 ring-green-400' : 'bg-white border-gray-200 hover:border-green-300'}`}
                    onClick={() => handleFiltro('filtroEspecial', filtros.filtroEspecial === 'com_pedido' ? '' : 'com_pedido')}>
                    <p className="text-2xl font-bold text-green-700">{resumo.comPedido}</p>
                    <p className="text-[11px] font-semibold text-green-600">Com Pedido</p>
                </div>
                <div className={`border rounded-lg p-3 text-center cursor-pointer transition-colors ${filtros.filtroEspecial === 'sem_pedido' ? 'border-orange-400 bg-orange-50 ring-1 ring-orange-400' : 'bg-white border-gray-200 hover:border-orange-300'}`}
                    onClick={() => handleFiltro('filtroEspecial', filtros.filtroEspecial === 'sem_pedido' ? '' : 'sem_pedido')}>
                    <p className="text-2xl font-bold text-orange-700">{resumo.semPedido}</p>
                    <p className="text-[11px] font-semibold text-orange-600">Sem Pedido</p>
                </div>
                <div className={`border rounded-lg p-3 text-center cursor-pointer transition-colors ${filtros.filtroEspecial === 'lead' ? 'border-purple-400 bg-purple-50 ring-1 ring-purple-400' : 'bg-white border-gray-200 hover:border-purple-300'}`}
                    onClick={() => handleFiltro('filtroEspecial', filtros.filtroEspecial === 'lead' ? '' : 'lead')}>
                    <p className="text-2xl font-bold text-purple-700">{resumo.lead}</p>
                    <p className="text-[11px] font-semibold text-purple-600">Lead</p>
                </div>
            </div>

            {/* Resumo por vendedor */}
            {Object.keys(resumo.porVendedor).length > 1 && (
                <div className="bg-white border border-gray-200 rounded-xl p-3">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Por Vendedor</p>
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(resumo.porVendedor).sort((a, b) => b[1] - a[1]).map(([nome, count]) => (
                            <span key={nome} className="inline-flex items-center gap-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
                                <User className="h-3 w-3 text-gray-400" />
                                <span className="font-semibold text-gray-700">{nome.split(' ')[0]}</span>
                                <span className="font-bold text-blue-600">{count}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Legenda do selo — o tooltip não abre no toque */}
            <LegendaSeloWhatsapp mostrar={mostrarSeloWhats} />

            {/* ── TABELA DESKTOP ── */}
            <div className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm table-fixed">
                    <colgroup>
                        <col style={{ width: '9%' }} />
                        <col style={{ width: '8%' }} />
                        <col style={{ width: '9%' }} />
                        <col style={{ width: '23%' }} />
                        <col style={{ width: '9%' }} />
                        <col style={{ width: '13%' }} />
                        <col style={{ width: '21%' }} />
                        <col style={{ width: '8%' }} />
                    </colgroup>
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Data/Hora</th>
                            <th className="text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Vendedor</th>
                            <th className="text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Tipo</th>
                            <th className="text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Cliente / Lead</th>
                            <th className="text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Cidade</th>
                            <th className="text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Ação</th>
                            <th className="text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Observação</th>
                            <th className="text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Retorno</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading && (
                            <tr><td colSpan={8} className="text-center py-12 text-gray-400">Carregando...</td></tr>
                        )}
                        {!loading && dataFiltrada.length === 0 && (
                            <tr><td colSpan={8} className="text-center py-12 text-gray-400">Nenhum atendimento encontrado.</td></tr>
                        )}
                        {!loading && dataFiltrada.map(a => {
                            const nomeItem = a.cliente ? (a.cliente.NomeFantasia || a.cliente.Nome) : (a.lead ? `Lead #${a.lead.numero} - ${a.lead.nomeEstabelecimento}` : '-');
                            const isExpanded = expandedRow === a.id;
                            return (
                                <React.Fragment key={a.id}>
                                    <tr className={`hover:bg-gray-50 cursor-pointer transition-colors ${a.origemPedido ? 'bg-green-50/50' : ''} ${a.transferidoParaId ? 'bg-indigo-50/30' : ''} ${a.alertaVisualAtivo ? 'bg-amber-50/30' : ''}`}
                                        onClick={() => setExpandedRow(isExpanded ? null : a.id)}>
                                        <td className="px-3 py-2.5">
                                            <div className="text-xs font-medium text-gray-900">{fmtData(a.criadoEm)}</div>
                                            <div className="text-[11px] text-gray-500">{fmtHora(a.criadoEm)}</div>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <span className="text-xs font-medium text-gray-700 block truncate">{a.vendedor?.nome?.split(' ')[0] || '-'}</span>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${TIPO_BADGE[a.tipo] || 'bg-gray-100 text-gray-600'}`}>
                                                <TipoIcon tipo={a.tipo} /> {a.tipo}
                                            </span>
                                            {a.origemPedido && (
                                                <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700">
                                                    <ShoppingCart className="h-3 w-3" /> PEDIDO
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-start gap-1.5">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (a.cliente) setClientePopup(a.cliente);
                                                        else if (a.lead) setClientePopup(a.lead);
                                                    }}
                                                    className="text-xs font-semibold text-blue-700 hover:text-blue-900 text-left min-w-0 flex-initial line-clamp-2 leading-tight"
                                                    title={nomeItem}
                                                >
                                                    {nomeItem}
                                                </button>
                                                {/* Linha de LEAD não tem cliente: o selo devolve null */}
                                                <SeloWhatsappCliente cliente={a.cliente} mostrar={mostrarSeloWhats} className="mt-0.5" />
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 text-xs text-gray-500 truncate">
                                            {a.cliente?.End_Cidade || '-'}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            {a.origemPedido ? (
                                                <div>
                                                    {/* Pílula clicável: abre a popup SÓ DE CONSULTA do pedido.
                                                        stopPropagation porque a linha inteira já tem clique (expandir). */}
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); setPedidoPopup(a); }}
                                                        title="Ver os detalhes deste pedido"
                                                        className="inline-flex items-center gap-1 max-w-full text-[10px] font-bold text-green-800 bg-green-100 hover:bg-green-200 px-2 py-1 rounded-full transition-colors cursor-pointer"
                                                    >
                                                        <span className="truncate">Pedido {a.rotuloPedido}</span>
                                                        <Eye className="h-3 w-3 shrink-0" />
                                                    </button>
                                                    {a.cancelado && <span className="block text-[10px] font-bold text-red-700">cancelado</span>}
                                                </div>
                                            ) : a.acaoLabel ? (
                                                <span className="text-[10px] font-semibold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded block truncate">{a.acaoLabel}</span>
                                            ) : <span className="text-xs text-gray-400">-</span>}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            {a.origemPedido && (
                                                <p className="text-xs font-bold text-gray-900 tabular-nums">
                                                    {a.bonificacao ? 'Bonificação' : fmtMoeda(a.valorPedido)}
                                                    {!a.bonificacao && a.condicaoPagamento && <span className="font-normal text-gray-500"> · {a.condicaoPagamento}</span>}
                                                </p>
                                            )}
                                            <p className="text-xs text-gray-600 line-clamp-2 leading-tight">{a.observacao || (!a.origemPedido && <span className="text-gray-400">-</span>)}</p>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            {a.dataRetorno ? (
                                                <div>
                                                    <div className="text-[11px] font-semibold text-amber-700">{fmtData(a.dataRetorno)}</div>
                                                    {a.assuntoRetorno && <div className="text-[10px] text-gray-500 truncate">{a.assuntoRetorno}</div>}
                                                </div>
                                            ) : <span className="text-xs text-gray-400">-</span>}
                                        </td>
                                    </tr>
                                    {/* Detalhes expandidos */}
                                    {isExpanded && (
                                        <tr>
                                            <td colSpan={8} className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                                                    {a.observacao && (
                                                        <div className="lg:col-span-2">
                                                            <p className="text-xs font-bold text-gray-500 uppercase mb-1">Observação</p>
                                                            <p className="text-gray-700 whitespace-pre-wrap bg-white rounded-lg border border-gray-200 p-3">{a.observacao}</p>
                                                        </div>
                                                    )}
                                                    <div className="space-y-2">
                                                        <div>
                                                            <p className="text-xs font-bold text-gray-500 uppercase mb-1">Vendedor</p>
                                                            <p className="text-gray-700">{a.vendedor?.nome || '-'}</p>
                                                        </div>
                                                        {a.origemPedido && (
                                                            <div>
                                                                <p className="text-xs font-bold text-gray-500 uppercase mb-1">Pedido</p>
                                                                <p className="text-gray-700 font-semibold">
                                                                    {a.rotuloPedido} · {a.bonificacao ? 'Bonificação' : fmtMoeda(a.valorPedido)}
                                                                </p>
                                                                {!a.bonificacao && a.condicaoPagamento && <p className="text-[12px] text-gray-500">{a.condicaoPagamento}</p>}
                                                                <p className="text-[12px] text-gray-500">
                                                                    Tipo de atendimento informado na venda: {a.canalOrigem || 'não informado'}
                                                                    {a.statusEnvio ? ` · ${a.statusEnvio}` : ''}
                                                                    {a.cancelado ? ' · CANCELADO' : ''}
                                                                </p>
                                                                {/* No mobile a linha expandida tem "Ver detalhes do pedido"; aqui só havia
                                                                    texto morto. Mesmo caminho para a popup de consulta nos dois tamanhos. */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setPedidoPopup(a)}
                                                                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-[12px] font-semibold text-green-800 bg-green-50 hover:bg-green-100 rounded-full transition-colors"
                                                                >
                                                                    <Eye className="h-3.5 w-3.5" /> Ver detalhes do pedido
                                                                </button>
                                                            </div>
                                                        )}
                                                        {a.transferidoParaId && (
                                                            <div>
                                                                <p className="text-xs font-bold text-gray-500 uppercase mb-1">Transferido para</p>
                                                                <div className="flex items-center gap-1.5">
                                                                    <ArrowLeftRight className="h-3.5 w-3.5 text-indigo-500" />
                                                                    <span className="text-indigo-700 font-semibold">{a.transferidoPara?.nome || '-'}</span>
                                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${a.transferenciaFinalizada ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                        {a.transferenciaFinalizada ? 'Finalizada' : 'Pendente'}
                                                                    </span>
                                                                </div>
                                                                {a.transferenciaFinalizadaEm && (
                                                                    <p className="text-[11px] text-gray-500 mt-0.5">Finalizada em {fmtDataHora(a.transferenciaFinalizadaEm)}</p>
                                                                )}
                                                            </div>
                                                        )}
                                                        {a.dataRetorno && (
                                                            <div>
                                                                <p className="text-xs font-bold text-gray-500 uppercase mb-1">Retorno</p>
                                                                <p className="text-amber-700 font-semibold">{fmtData(a.dataRetorno)}</p>
                                                                {a.assuntoRetorno && <p className="text-gray-600 text-[12px]">{a.assuntoRetorno}</p>}
                                                            </div>
                                                        )}
                                                        {a.alertaVisualAtivo && (
                                                            <div className="flex items-center gap-1.5">
                                                                <Bell className="h-3.5 w-3.5" style={{ color: a.alertaVisualCor || '#ef4444' }} />
                                                                <span className="text-[12px] font-semibold" style={{ color: a.alertaVisualCor || '#ef4444' }}>
                                                                    Alerta visual {a.alertaVisualVisto ? '(visto)' : '(ativo)'}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {a.gpsVendedor && (
                                                            <div>
                                                                <p className="text-xs font-bold text-gray-500 uppercase mb-1">GPS</p>
                                                                <button onClick={() => {
                                                                    const [lat, lng] = a.gpsVendedor.split(',');
                                                                    abrirLinkExterno(`https://www.google.com/maps?q=${lat},${lng}`);
                                                                }} className="text-blue-600 hover:text-blue-800 text-[12px] font-semibold flex items-center gap-1">
                                                                    <MapPin className="h-3 w-3" /> Ver no mapa
                                                                </button>
                                                            </div>
                                                        )}
                                                        {a.amostra && (
                                                            <div>
                                                                <p className="text-xs font-bold text-gray-500 uppercase mb-1">Amostra</p>
                                                                <p className="text-gray-700">#{a.amostra.numero} - {a.amostra.status}</p>
                                                            </div>
                                                        )}
                                                        {a.etapaNova && (
                                                            <div>
                                                                <p className="text-xs font-bold text-gray-500 uppercase mb-1">Etapa</p>
                                                                <p className="text-gray-700">{a.etapaAnterior || '?'} &rarr; {a.etapaNova}</p>
                                                            </div>
                                                        )}
                                                        {/* Botão desfazer (admin) — linha de pedido não é lançamento de atendimento */}
                                                        {isAdmin && !a.origemPedido && (
                                                            <div className="pt-2 border-t border-gray-200">
                                                                {confirmDelete === a.id ? (
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <span className="text-sm text-red-600 font-medium">Confirmar exclusão?</span>
                                                                        <button
                                                                            onClick={() => handleDelete(a.id)}
                                                                            disabled={deletando}
                                                                            className="px-2.5 py-1 text-xs font-bold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                                                                        >
                                                                            {deletando ? 'Excluindo...' : 'Sim, excluir'}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setConfirmDelete(null)}
                                                                            className="px-2.5 py-1 text-xs font-semibold bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                                                                        >
                                                                            Cancelar
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(a.id); }}
                                                                        className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-lg transition-colors"
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" /> Desfazer lançamento
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* ── CARDS MOBILE ── */}
            <div className="md:hidden space-y-2">
                {loading && <div className="text-center py-12 text-gray-400">Carregando...</div>}
                {!loading && dataFiltrada.length === 0 && <div className="text-center py-12 text-gray-400">Nenhum atendimento encontrado.</div>}
                {!loading && dataFiltrada.map(a => {
                    const nomeItem = a.cliente ? (a.cliente.NomeFantasia || a.cliente.Nome) : (a.lead ? `Lead #${a.lead.numero} - ${a.lead.nomeEstabelecimento}` : '-');
                    const isExpanded = expandedRow === a.id;
                    return (
                        <div key={a.id} className={`bg-white border rounded-xl overflow-hidden ${a.origemPedido ? 'border-green-200' : a.transferidoParaId ? 'border-indigo-200' : 'border-gray-200'}`}>
                            <button className="w-full text-left p-3 space-y-2" onClick={() => setExpandedRow(isExpanded ? null : a.id)}>
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-[11px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded shrink-0">
                                            {a.vendedor?.nome?.split(' ')[0] || '?'}
                                        </span>
                                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${TIPO_BADGE[a.tipo] || 'bg-gray-100 text-gray-600'}`}>
                                            <TipoIcon tipo={a.tipo} /> {a.tipo}
                                        </span>
                                        {a.origemPedido && (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 bg-sky-100 text-sky-700">
                                                <ShoppingCart className="h-2.5 w-2.5" /> PEDIDO
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[11px] text-gray-500 shrink-0">{fmtData(a.criadoEm)} {fmtHora(a.criadoEm)}</span>
                                </div>
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <p className="text-sm font-bold text-gray-900 truncate">{nomeItem}</p>
                                    <SeloWhatsappCliente cliente={a.cliente} mostrar={mostrarSeloWhats} />
                                </div>
                                {a.cliente?.End_Cidade && <p className="text-[11px] text-gray-500">{a.cliente.End_Cidade}</p>}
                                <div className="flex items-center gap-2 flex-wrap">
                                    {!a.origemPedido && a.acaoLabel && <span className="text-[10px] font-semibold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">{a.acaoLabel}</span>}
                                    {a.transferidoParaId && (
                                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                            <ArrowLeftRight className="h-2.5 w-2.5" /> {a.transferidoPara?.nome?.split(' ')[0] || '?'}
                                        </span>
                                    )}
                                    {a.dataRetorno && (
                                        <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                            <Clock className="h-2.5 w-2.5" /> {fmtData(a.dataRetorno)}
                                        </span>
                                    )}
                                </div>
                                {a.observacao && <p className="text-[12px] text-gray-500 line-clamp-2">{a.observacao}</p>}
                            </button>
                            {/* Pílula do pedido: IRMÃ do botão de expandir, nunca dentro dele.
                                Antes era um <span role="button"> aninhado no <button> do card — o
                                toque funcionava, mas o leitor de tela achata o conteúdo do botão e
                                não anuncia a pílula como um segundo comando. Como <button> irmão,
                                ela vira um comando próprio ("Pedido ZZ#123, ver detalhes") e o
                                HTML deixa de ter botão dentro de botão. */}
                            {a.origemPedido && (
                                <div className="flex items-center gap-2 flex-wrap px-3 pb-3 -mt-1">
                                    <button
                                        type="button"
                                        onClick={() => setPedidoPopup(a)}
                                        aria-label={`Ver detalhes do pedido ${a.rotuloPedido}`}
                                        className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 text-[13px] font-bold text-green-800 bg-green-100 active:bg-green-200 rounded-full"
                                    >
                                        {a.rotuloPedido} <Eye className="h-3.5 w-3.5 shrink-0" />
                                    </button>
                                    <span className="text-[12px] font-bold text-green-800 tabular-nums">
                                        {a.bonificacao ? 'Bonificação' : fmtMoeda(a.valorPedido)}
                                        {a.cancelado && <span className="text-red-700"> · cancelado</span>}
                                    </span>
                                </div>
                            )}
                            {isExpanded && (
                                <div className="border-t border-gray-100 bg-gray-50 p-3 space-y-2 text-sm">
                                    {a.observacao && (
                                        <div>
                                            <p className="text-xs font-bold text-gray-500 uppercase mb-1">Observação completa</p>
                                            <p className="text-gray-700 whitespace-pre-wrap bg-white rounded-lg border p-2 text-[12px]">{a.observacao}</p>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <p className="text-[10px] font-bold text-gray-500 uppercase">Vendedor</p>
                                            <p className="text-[12px] text-gray-700">{a.vendedor?.nome || '-'}</p>
                                        </div>
                                        {a.transferidoParaId && (
                                            <div>
                                                <p className="text-[10px] font-bold text-gray-500 uppercase">Transferido para</p>
                                                <p className="text-[12px] text-indigo-700 font-semibold">{a.transferidoPara?.nome || '-'}</p>
                                                <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${a.transferenciaFinalizada ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                    {a.transferenciaFinalizada ? 'Finalizada' : 'Pendente'}
                                                </span>
                                            </div>
                                        )}
                                        {a.dataRetorno && (
                                            <div>
                                                <p className="text-[10px] font-bold text-gray-500 uppercase">Retorno</p>
                                                <p className="text-[12px] text-amber-700 font-semibold">{fmtData(a.dataRetorno)}</p>
                                                {a.assuntoRetorno && <p className="text-[11px] text-gray-500">{a.assuntoRetorno}</p>}
                                            </div>
                                        )}
                                        {a.gpsVendedor && (
                                            <div>
                                                <button onClick={(e) => {
                                                    e.stopPropagation();
                                                    const [lat, lng] = a.gpsVendedor.split(',');
                                                    abrirLinkExterno(`https://www.google.com/maps?q=${lat},${lng}`);
                                                }} className="text-blue-600 text-[11px] font-semibold flex items-center gap-1">
                                                    <MapPin className="h-3 w-3" /> Ver GPS
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    {a.etapaNova && (
                                        <p className="text-[11px] text-gray-600">Etapa: {a.etapaAnterior || '?'} &rarr; {a.etapaNova}</p>
                                    )}
                                    <button onClick={() => {
                                        if (a.cliente) setClientePopup(a.cliente);
                                        else if (a.lead) setClientePopup(a.lead);
                                    }} className="w-full text-center text-[12px] font-semibold text-blue-600 bg-blue-50 rounded-lg py-2.5 min-h-[44px] hover:bg-blue-100 transition-colors">
                                        <Eye className="h-3.5 w-3.5 inline mr-1" /> Ver detalhes do cliente
                                    </button>
                                    {/* Linha de pedido: 2º caminho para a popup de consulta (o 1º é a pílula do topo) */}
                                    {a.origemPedido && (
                                        <button onClick={() => setPedidoPopup(a)}
                                            className="w-full text-center text-[12px] font-semibold text-green-800 bg-green-50 rounded-lg py-2.5 min-h-[44px] hover:bg-green-100 transition-colors">
                                            <ShoppingCart className="h-3.5 w-3.5 inline mr-1" /> Ver detalhes do pedido
                                        </button>
                                    )}
                                    {/* Desfazer mobile (admin) — não vale para linha de pedido */}
                                    {isAdmin && !a.origemPedido && (
                                        <div className="pt-1">
                                            {confirmDelete === a.id ? (
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleDelete(a.id)} disabled={deletando}
                                                        className="flex-1 text-xs font-bold bg-red-600 text-white rounded-lg py-1.5 hover:bg-red-700 disabled:opacity-50 transition-colors">
                                                        {deletando ? 'Excluindo...' : 'Sim, excluir'}
                                                    </button>
                                                    <button onClick={() => setConfirmDelete(null)}
                                                        className="flex-1 text-xs font-semibold bg-gray-100 text-gray-700 rounded-lg py-1.5 hover:bg-gray-200 transition-colors">
                                                        Cancelar
                                                    </button>
                                                </div>
                                            ) : (
                                                <button onClick={() => setConfirmDelete(a.id)}
                                                    className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 rounded-lg py-1.5 hover:bg-red-100 transition-colors">
                                                    <Trash2 className="h-3.5 w-3.5" /> Desfazer lançamento
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <p className="text-sm text-gray-500">
                        Página {filtros.page} de {totalPages} ({total} registro{total !== 1 ? 's' : ''})
                    </p>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setFiltros(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                            disabled={filtros.page <= 1}
                            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button onClick={() => setFiltros(prev => ({ ...prev, page: Math.min(totalPages, prev.page + 1) }))}
                            disabled={filtros.page >= totalPages}
                            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Popup do PEDIDO — só consulta (nenhuma ação sobre o pedido).
                A popup completa, com as ações, é a da aba Pedidos. */}
            {pedidoPopup?.pedidoId && (
                <ModalPedidoConsulta
                    pedidoId={pedidoPopup.pedidoId}
                    resumo={pedidoPopup}
                    onClose={() => setPedidoPopup(null)}
                />
            )}

            {/* Popup de Cliente */}
            {clientePopup && (
                <ClientePopup
                    cliente={clientePopup}
                    onClose={() => setClientePopup(null)}
                />
            )}
        </div>
    );
};

export default PainelAtendimentos;
