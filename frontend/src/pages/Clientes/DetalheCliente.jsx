import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import clienteService from '../../services/clienteService';
import vendedorService from '../../services/vendedorService';
import tabelaPrecoService from '../../services/tabelaPrecoService';
import condicaoPagamentoService from '../../services/condicaoPagamentoService';
import MultiSelect from '../../components/MultiSelect';
import atendimentoService from '../../services/atendimentoService';
import pedidoService from '../../services/pedidoService';
import { ArrowLeft, MapPin, Phone, Mail, Calendar, FileText, Save, X, User, Building, DollarSign, MessageCircle, Clock, ClipboardList, ShoppingCart, Package } from 'lucide-react';

const DIAS_SEMANA = ['SEG', 'TER', 'QUA', 'QUI', 'SEX'];

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
    const [loading, setLoading] = useState(true);
    const [abaAtiva, setAbaAtiva] = useState('dados');
    const [atendimentos, setAtendimentos] = useState([]);
    const [pedidosCliente, setPedidosCliente] = useState([]);

    const [formData, setFormData] = useState({
        Dia_de_entrega: '',
        Dia_de_venda: '',
        Ponto_GPS: '',
        Observacoes_Gerais: '',
        Condicao_de_pagamento: '',
        idVendedor: '',
        Formas_Atendimento: [],
        condicoes_pagamento_permitidas: []
    });

    useEffect(() => {
        fetchData();
    }, [uuid]);

    const fetchData = async () => {
        try {
            const [clienteData, condicoesData, condicoesCAData, vendedoresData] = await Promise.all([
                clienteService.detalhar(uuid),
                tabelaPrecoService.listar(),
                condicaoPagamentoService.listar(),
                vendedorService.listar()
            ]);

            setCliente(clienteData);
            setCondicoesPagamento(condicoesData);
            setCondicoesPagamentoCA(condicoesCAData);
            setVendedores(vendedoresData);

            try {
                const atends = await atendimentoService.listarPorCliente(uuid);
                setAtendimentos(Array.isArray(atends) ? atends : []);
            } catch (_) { setAtendimentos([]); }

            try {
                const peds = await pedidoService.listar({ clienteId: uuid });
                // Ordenar por data de entrega decrescente
                const pedsSorted = (Array.isArray(peds) ? peds : []).sort(
                    (a, b) => new Date(b.dataVenda || b.createdAt) - new Date(a.dataVenda || a.createdAt)
                );
                setPedidosCliente(pedsSorted);
            } catch (_) { setPedidosCliente([]); }

            setFormData({
                Dia_de_entrega: clienteData.Dia_de_entrega || '',
                Dia_de_venda: clienteData.Dia_de_venda || '',
                Ponto_GPS: clienteData.Ponto_GPS || '',
                Observacoes_Gerais: clienteData.Observacoes_Gerais || '',
                Condicao_de_pagamento: clienteData.Condicao_de_pagamento || '',
                idVendedor: clienteData.idVendedor || '',
                Formas_Atendimento: clienteData.Formas_Atendimento || [],
                condicoes_pagamento_permitidas: clienteData.condicoes_pagamento_permitidas || []
            });

        } catch (error) {
            console.error('Erro ao carregar dados:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            await clienteService.atualizar(uuid, formData);
            const updated = await clienteService.detalhar(uuid);
            setCliente(updated);
            alert('Dados salvos com sucesso!');
        } catch (error) {
            alert('Erro ao salvar alterações');
            console.error(error);
        }
    };

    const handleCancel = () => {
        navigate('/clientes');
    };

    if (loading) return <div className="p-8 text-center text-gray-600">Carregando detalhes...</div>;
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
                    Histórico ({atendimentos.length + pedidosCliente.length})
                </button>
            </div>

            {abaAtiva === 'historico' && (() => {
                // Unificar atendimentos e pedidos em um único histórico ordenado por data
                const itensHistorico = [
                    ...atendimentos.map(a => ({ ...a, _tipo: 'ATENDIMENTO', _data: new Date(a.criadoEm) })),
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
                                            <div className="flex items-center justify-between mb-3 border-b border-blue-50 pb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold bg-blue-600 text-white px-2 py-0.5 rounded flex items-center gap-1 shadow-sm">
                                                        <ShoppingCart className="h-3 w-3" />
                                                        PEDIDO {pedido.numero ? `#${pedido.numero}` : ''}
                                                    </span>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${pedido.statusEnvio === 'RECEBIDO' ? 'bg-green-100 text-green-700' :
                                                        pedido.statusEnvio === 'ERRO' ? 'bg-red-100 text-red-700' :
                                                            pedido.statusEnvio === 'ENVIAR' ? 'bg-blue-100 text-blue-700' :
                                                                'bg-gray-100 text-gray-600'
                                                        }`}>{pedido.statusEnvio}</span>
                                                </div>
                                            </div>

                                            {/* Detalhes do Pedido (Novo Header 2 colunas) */}
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
                                                <div className="text-[10px] text-gray-500 flex items-center gap-1">
                                                    <User className="h-3 w-3 text-gray-400" />
                                                    <span className="font-medium text-gray-700">Por:</span> {pedido.usuarioLancamento?.nome || 'Lançamento App'}
                                                </div>
                                            </div>

                                            {/* Itens do pedido */}
                                            {pedido.itens && pedido.itens.length > 0 && (
                                                <div className="mt-2 space-y-1">
                                                    {pedido.itens.map(it => (
                                                        <div key={it.id} className="flex items-center justify-between text-xs text-gray-700 bg-gray-50 px-2 py-1 rounded">
                                                            <span className="flex items-center gap-1">
                                                                <Package className="h-3 w-3 text-gray-400" />
                                                                {it.produto?.nome || it.descricao || 'Produto'}
                                                            </span>
                                                            <span className="font-semibold text-gray-800 shrink-0 ml-2">
                                                                {Number(it.quantidade)}x R$ {Number(it.valor).toFixed(2).replace('.', ',')}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Observação e total */}
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

                                // ATENDIMENTO
                                const a = item;
                                return (
                                    <div key={`atend-${a.id}`} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded uppercase">{a.tipo}</span>
                                                {a.vendedor?.nome && (
                                                    <span className="text-xs text-gray-500 flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                                                        <User className="h-3 w-3" />
                                                        {a.vendedor.nome}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-xs text-gray-400 flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {new Date(a.criadoEm).toLocaleDateString('pt-BR')} {new Date(a.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        {a.observacao && <p className="text-sm text-gray-700 mt-1">{a.observacao}</p>}
                                        {a.proximaVisita && (
                                            <p className="text-xs text-blue-600 mt-1 font-semibold">
                                                📅 Próxima visita: {new Date(a.proximaVisita).toLocaleDateString('pt-BR')}
                                            </p>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                );
            })()}

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
                                    {vendedores.map(v => (
                                        <option key={v.id} value={v.id}>{v.nome}</option>
                                    ))}
                                </select>
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

                            {/* Observações */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <FileText className="h-4 w-4 inline mr-1" />
                                    Observações Gerais
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
