import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import clienteService from '../../services/clienteService';
import vendedorService from '../../services/vendedorService';
import { ArrowLeft, MapPin, Phone, Mail, Calendar, FileText, Edit2, Save, X, Check, User } from 'lucide-react';

const DIAS_SEMANA = ['SEG', 'TER', 'QUA', 'QUI', 'SEX']; // Sábado e Domingo opcional se precisar

const DayPicker = ({ label, selected, onChange }) => {
    const selectedDays = selected ? selected.split(',').map(d => d.trim()) : [];

    const toggleDay = (day) => {
        let newDays;
        if (selectedDays.includes(day)) {
            newDays = selectedDays.filter(d => d !== day);
        } else {
            newDays = [...selectedDays, day];
            // Ordenar dias (opcional, mas bom para UX)
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
                            ? 'bg-blue-600 text-white border-blue-600'
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
    const [editing, setEditing] = useState(false);

    // State para edição
    const [formData, setFormData] = useState({
        Dia_de_entrega: '',
        Dia_de_venda: '',
        Ponto_GPS: '',
        Observacoes_Gerais: '',
        Condicao_de_pagamento: '', // Agora editável/selecionável
        idVendedor: ''
    });

    useEffect(() => {
        fetchData();
    }, [uuid]);

    const fetchData = async () => {
        try {
            const [clienteData, condicoesData, vendedoresData] = await Promise.all([
                clienteService.detalhar(uuid),
                clienteService.listarCondicoesPagamento(),
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
                idVendedor: clienteData.idVendedor || ''
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
            setEditing(false);
            // Recarregar dados para atualizar view (especialmente nome da condição)
            const updated = await clienteService.detalhar(uuid);
            setCliente(updated);
        } catch (error) {
            alert('Erro ao salvar alterações');
            console.error(error);
        }
    };

    const handleCancel = () => {
        setEditing(false);
        setFormData({
            Dia_de_entrega: cliente.Dia_de_entrega || '',
            Dia_de_venda: cliente.Dia_de_venda || '',
            Ponto_GPS: cliente.Ponto_GPS || '',
            Observacoes_Gerais: cliente.Observacoes_Gerais || '',
            Condicao_de_pagamento: cliente.Condicao_de_pagamento || '',
            idVendedor: cliente.idVendedor || ''
        });
    };

    // Helper para GPS manual se precisar, mas o foco é o input
    const getCurrentLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const gps = `${position.coords.latitude},${position.coords.longitude}`;
                    setFormData(prev => ({ ...prev, Ponto_GPS: gps }));
                },
                (error) => alert('Erro ao obter localização: ' + error.message)
            );
        } else {
            alert('Geolocalização não suportada neste navegador.');
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-600">Carregando detalhes...</div>;
    if (!cliente) return <div className="p-8 text-center text-gray-600">Cliente não encontrado.</div>;

    return (
        <div className="container mx-auto px-4 py-4 max-w-lg md:max-w-4xl"> {/* Container mais estreito em mobile */}
            <button
                onClick={() => navigate('/clientes')}
                className="mb-4 flex items-center text-gray-600 hover:text-gray-900"
            >
                <ArrowLeft className="h-5 w-5 mr-1" /> Voltar
            </button>

            {/* Cabeçalho */}
            <div className="bg-white shadow rounded-lg p-6 mb-4 border-l-4 border-primary">
                <div className="flex justify-between items-start">
                    <div className="overflow-hidden">
                        <h1 className="text-xl font-bold text-gray-900 truncate">{cliente.Nome}</h1>
                        {cliente.NomeFantasia && <p className="text-base text-gray-600 font-medium truncate">{cliente.NomeFantasia}</p>}
                        <p className="text-gray-500 text-xs mt-1">
                            {cliente.Tipo_Pessoa === 'JURIDICA' ? 'CNPJ' : 'CPF'}: {cliente.Documento}
                        </p>
                    </div>
                    {!editing ? (
                        <button
                            onClick={() => setEditing(true)}
                            className="bg-primary text-white p-2 rounded-full hover:bg-blue-700 transition"
                            title="Editar Dados Operacionais"
                        >
                            <Edit2 className="h-4 w-4" />
                        </button>
                    ) : (
                        <div className="flex space-x-2">
                            <button
                                onClick={handleSave}
                                className="bg-green-600 text-white p-2 rounded-full hover:bg-green-700 transition"
                                title="Salvar"
                            >
                                <Check className="h-4 w-4" />
                            </button>
                            <button
                                onClick={handleCancel}
                                className="bg-gray-400 text-white p-2 rounded-full hover:bg-gray-500 transition"
                                title="Cancelar"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Formulário de Edição / Visualização */}
            <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">Dados Operacionais</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Vendedor Responsável */}
                    <div className="col-span-full md:col-span-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Vendedor Responsável</label>
                        {editing ? (
                            <select
                                className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                                value={formData.idVendedor}
                                onChange={e => setFormData({ ...formData, idVendedor: e.target.value })}
                            >
                                <option value="">Selecione um vendedor...</option>
                                {vendedores.map(v => (
                                    <option key={v.id} value={v.id}>{v.nome}</option>
                                ))}
                            </select>
                        ) : (
                            <div className="flex items-center text-gray-900 bg-gray-50 px-3 py-2 rounded border border-gray-200">
                                <User className="h-4 w-4 mr-2 text-gray-400" />
                                {vendedores.find(v => v.id === cliente.idVendedor)?.nome || <span className="text-gray-400 italic">Não atribuído</span>}
                            </div>
                        )}
                    </div>

                    {/* Condição de Pagamento */}
                    <div className="col-span-full md:col-span-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Condição de Pagamento</label>
                        {editing ? (
                            <select
                                className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                                value={formData.Condicao_de_pagamento}
                                onChange={e => setFormData({ ...formData, Condicao_de_pagamento: e.target.value })}
                            >
                                <option value="">Padrão (Conta Azul)</option>
                                {condicoesPagamento.map(c => (
                                    <option key={c.id} value={c.id}>{c.nome}</option>
                                ))}
                            </select>
                        ) : (
                            <div className="flex items-center text-gray-900 bg-gray-50 px-3 py-2 rounded border border-gray-200">
                                <FileText className="h-4 w-4 mr-2 text-gray-400" />
                                {condicoesPagamento.find(c => c.id === cliente.Condicao_de_pagamento)?.nome || <span className="text-gray-400 italic">Padrão</span>}
                            </div>
                        )}
                    </div>

                    {/* Dia de Venda */}
                    <div className="col-span-full">
                        {editing ? (
                            <DayPicker
                                label="Dias de Visita / Venda *"
                                selected={formData.Dia_de_venda}
                                onChange={val => setFormData({ ...formData, Dia_de_venda: val })}
                            />
                        ) : (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Dias de Venda</label>
                                <div className="text-gray-900 bg-gray-50 px-3 py-2 rounded border border-gray-200">
                                    {cliente.Dia_de_venda || <span className="text-gray-400 italic">Não definido</span>}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Dia de Entrega */}
                    <div className="col-span-full">
                        {editing ? (
                            <DayPicker
                                label="Dias de Entrega *"
                                selected={formData.Dia_de_entrega}
                                onChange={val => setFormData({ ...formData, Dia_de_entrega: val })}
                            />
                        ) : (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Dias de Entrega</label>
                                <div className="text-gray-900 bg-gray-50 px-3 py-2 rounded border border-gray-200">
                                    {cliente.Dia_de_entrega || <span className="text-gray-400 italic">Não definido</span>}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Observações */}
                    <div className="col-span-full">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Observações Gerais</label>
                        {editing ? (
                            <textarea
                                className="w-full border border-gray-300 rounded px-3 py-2 bg-white text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                                rows="3"
                                value={formData.Observacoes_Gerais}
                                onChange={e => setFormData({ ...formData, Observacoes_Gerais: e.target.value })}
                            />
                        ) : (
                            <div className="text-gray-900 bg-gray-50 px-3 py-2 rounded border border-gray-200 min-h-[50px] whitespace-pre-wrap">
                                {cliente.Observacoes_Gerais || <span className="text-gray-400 italic">Sem observações</span>}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DetalheCliente;
