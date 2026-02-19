import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import clienteService from '../../services/clienteService';
import vendedorService from '../../services/vendedorService';
import tabelaPrecoService from '../../services/tabelaPrecoService'; // New
import { ArrowLeft, MapPin, Phone, Mail, Calendar, FileText, Save, X, User, Building, DollarSign, MessageCircle } from 'lucide-react';

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
    const [vendedores, setVendedores] = useState([]);
    const [loading, setLoading] = useState(true);

    // State para edição (apenas campos editáveis)
    const [formData, setFormData] = useState({
        Dia_de_entrega: '',
        Dia_de_venda: '',
        Ponto_GPS: '',
        Observacoes_Gerais: '',
        Condicao_de_pagamento: '',
        idVendedor: '',
        Formas_Atendimento: []
    });

    useEffect(() => {
        fetchData();
    }, [uuid]);

    const fetchData = async () => {
        try {
            const [clienteData, condicoesData, vendedoresData] = await Promise.all([
                clienteService.detalhar(uuid),
                tabelaPrecoService.listar(), // Changed
                vendedorService.listar()
            ]);

            setCliente(clienteData);
            setCondicoesPagamento(condicoesData);
            setVendedores(vendedoresData);

            setFormData({
                Dia_de_entrega: clienteData.Dia_de_entrega || '',
                Dia_de_venda: clienteData.Dia_de_venda || '',
                Ponto_GPS: clienteData.Ponto_GPS || '',
                Observacoes_Gerais: clienteData.Observacoes_Gerais || '',
                Condicao_de_pagamento: clienteData.Condicao_de_pagamento || '',
                idVendedor: clienteData.idVendedor || '',
                Formas_Atendimento: clienteData.Formas_Atendimento || []
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
                        <h1 className="text-2xl font-bold text-gray-900">{cliente.NomeFantasia || cliente.Nome}</h1>
                        {cliente.NomeFantasia && cliente.NomeFantasia !== cliente.Nome && (
                            <p className="text-lg text-gray-600 font-medium">{cliente.Nome}</p>
                        )}
                        <p className="text-gray-500 text-sm mt-1">
                            {cliente.Tipo_Pessoa === 'Jurídica' ? 'CNPJ' : 'CPF'}: {cliente.Documento}
                        </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full font-medium text-sm ${cliente.Ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {cliente.Ativo ? 'ATIVO' : 'INATIVO'}
                    </span>
                </div>
            </div>

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
                                <div>
                                    <span className="text-gray-500">Email:</span>
                                    <p className="text-gray-900">{cliente.Email || '-'}</p>
                                </div>
                                <div>
                                    <span className="text-gray-500">Telefone:</span>
                                    <p className="text-gray-900">{cliente.Telefone || '-'}</p>
                                </div>
                                <div>
                                    <span className="text-gray-500">Celular:</span>
                                    <p className="text-gray-900">{cliente.Telefone_Celular || '-'}</p>
                                </div>
                                <div>
                                    <span className="text-gray-500">Comercial:</span>
                                    <p className="text-gray-900">{cliente.Telefone_Comercial || '-'}</p>
                                </div>
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
                                <div>
                                    <span className="text-gray-500">Atrasos Pagamentos:</span>
                                    <p className="text-gray-900">{cliente.Atrasos_Pagamentos || '0'}</p>
                                </div>
                                <div>
                                    <span className="text-gray-500">Atrasos Recebimentos:</span>
                                    <p className="text-gray-900">{cliente.Atrasos_Recebimentos || '0'}</p>
                                </div>
                                <div>
                                    <span className="text-gray-500">Pagamentos Mês:</span>
                                    <p className="text-gray-900">{cliente.Pagamentos_Mes_Atual || '0'}</p>
                                </div>
                                <div>
                                    <span className="text-gray-500">Recebimentos Mês:</span>
                                    <p className="text-gray-900">{cliente.Recebimentos_Mes_Atual || '0'}</p>
                                </div>
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

                        {/* Canais de Atendimento Preference */}
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
                                Condição de Pagamento
                            </label>
                            <select
                                className="block w-full border border-gray-300 rounded-md shadow-sm p-3 bg-white text-gray-900 focus:ring-primary focus:border-primary"
                                value={formData.Condicao_de_pagamento}
                                onChange={(e) => setFormData({ ...formData, Condicao_de_pagamento: e.target.value })}
                            >
                                <option value="">Selecione uma condição...</option>
                                {condicoesPagamento.map(c => (
                                    <option key={c.id} value={c.idCondicao}>{c.nomeCondicao}</option>
                                ))}
                            </select>
                        </div>

                        {/* Localização GPS */}
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

                        {/* Observações Gerais */}
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

                        {/* Botões de Ação */}
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
        </div>
    );
};

export default DetalheCliente;
