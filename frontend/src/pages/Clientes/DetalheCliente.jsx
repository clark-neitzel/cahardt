import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import clienteService from '../../services/clienteService';
import { ArrowLeft, MapPin, Phone, Mail, Calendar, FileText, Edit2, Save, X, Check } from 'lucide-react';

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
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);

    // State para edição
    const [formData, setFormData] = useState({
        Dia_de_entrega: '',
        Dia_de_venda: '',
        Ponto_GPS: '',
        Observacoes_Gerais: '',
        Condicao_de_pagamento: '' // Agora editável/selecionável
    });

    useEffect(() => {
        fetchData();
    }, [uuid]);

    const fetchData = async () => {
        try {
            const [clienteData, condicoesData] = await Promise.all([
                clienteService.detalhar(uuid),
                clienteService.listarCondicoesPagamento()
            ]);

            setCliente(clienteData);
            setCondicoesPagamento(condicoesData);

            setFormData({
                Dia_de_entrega: clienteData.Dia_de_entrega || '',
                Dia_de_venda: clienteData.Dia_de_venda || '',
                Ponto_GPS: clienteData.Ponto_GPS || '',
                Observacoes_Gerais: clienteData.Observacoes_Gerais || '',
                Condicao_de_pagamento: clienteData.Condicao_de_pagamento || ''
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
            Condicao_de_pagamento: cliente.Condicao_de_pagamento || ''
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
            <div className="bg-white shadow rounded-lg p-4 mb-4 border-l-4 border-primary">
                <div className="flex justify-between items-start">
                    <div className="overflow-hidden">
                        <h1 className="text-xl font-bold text-gray-900 truncate">{cliente.Nome}</h1>
                        {cliente.NomeFantasia && <p className="text-base text-gray-600 font-medium truncate">{cliente.NomeFantasia}</p>}
                        <p className="text-gray-500 text-xs mt-1">
                            {cliente.Tipo_Pessoa === 'JURIDICA' ? 'CNPJ' : 'CPF'}: {cliente.Documento}
                        </p>
                    </div>
                </div>
                <div className="mt-2 text-xs">
                    <span className={`px-2 py-0.5 rounded-full font-medium ${cliente.Ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {cliente.Ativo ? 'ATIVO' : 'INATIVO'}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {/* Cartão de Edição Operacional (Hardt) - MOVED TO TOP for Mobile Priority */}
                <div className="bg-white shadow rounded-lg p-4 relative">
                    <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
                        <h2 className="text-lg font-semibold text-gray-800 flex items-center">
                            <Calendar className="h-5 w-5 mr-2 text-primary" />
                            Operacional
                        </h2>
                        {!editing ? (
                            <button
                                onClick={() => setEditing(true)}
                                className="text-blue-600 hover:text-blue-800 p-2 rounded-full hover:bg-blue-50 transition-colors"
                            >
                                <Edit2 className="h-5 w-5" />
                            </button>
                        ) : (
                            <div className="flex space-x-2">
                                <button
                                    onClick={handleSave}
                                    className="bg-green-600 text-white p-2 rounded-full shadow hover:bg-green-700 transition-colors"
                                >
                                    <Save className="h-5 w-5" />
                                </button>
                                <button
                                    onClick={handleCancel}
                                    className="bg-red-100 text-red-600 p-2 rounded-full hover:bg-red-200 transition-colors"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="space-y-5">
                        {/* Dias - Componente Customizado */}
                        {editing ? (
                            <>
                                <DayPicker
                                    label="Dia de Entrega"
                                    selected={formData.Dia_de_entrega}
                                    onChange={(val) => setFormData({ ...formData, Dia_de_entrega: val })}
                                />
                                <DayPicker
                                    label="Dia de Visita/Venda"
                                    selected={formData.Dia_de_venda}
                                    onChange={(val) => setFormData({ ...formData, Dia_de_venda: val })}
                                />
                            </>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 uppercase">Entrega</label>
                                    <div className="mt-1 font-medium text-gray-900">{cliente.Dia_de_entrega || '-'}</div>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 uppercase">Visita</label>
                                    <div className="mt-1 font-medium text-gray-900">{cliente.Dia_de_venda || '-'}</div>
                                </div>
                            </div>
                        )}

                        {/* Condição de Pagamento */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Condição de Pagamento</label>
                            {editing ? (
                                <select
                                    className="block w-full border border-gray-300 rounded-md shadow-sm p-3 bg-white text-gray-900 text-base focus:ring-primary focus:border-primary"
                                    value={formData.Condicao_de_pagamento}
                                    onChange={(e) => setFormData({ ...formData, Condicao_de_pagamento: e.target.value })}
                                >
                                    <option value="">Selecione...</option>
                                    {condicoesPagamento.map(cp => (
                                        <option key={cp.id} value={cp.id}>{cp.nome}</option>
                                    ))}
                                </select>
                            ) : (
                                <div className="text-gray-900 font-medium bg-gray-50 p-2 rounded border border-gray-200">
                                    {cliente.condicaoPagamento?.nome || 'Não definida'}
                                </div>
                            )}
                        </div>

                        {/* GPS */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Localização GPS</label>
                            {editing ? (
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        className="block w-full border border-gray-300 rounded-md shadow-sm p-3 bg-white text-gray-900 text-sm"
                                        value={formData.Ponto_GPS}
                                        onChange={(e) => setFormData({ ...formData, Ponto_GPS: e.target.value })}
                                        placeholder="lat,lng"
                                    />
                                    <button
                                        type="button"
                                        onClick={getCurrentLocation}
                                        className="bg-gray-100 text-gray-600 px-3 py-2 rounded border border-gray-300 hover:bg-gray-200"
                                        title="Pegar localização atual"
                                    >
                                        <MapPin className="h-5 w-5" />
                                    </button>
                                </div>
                            ) : (
                                <div className="mt-1">
                                    {cliente.Ponto_GPS ? (
                                        <a
                                            href={`https://www.google.com/maps/search/?api=1&query=${cliente.Ponto_GPS}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-md inline-flex items-center text-sm shadow-sm"
                                        >
                                            <MapPin className="h-4 w-4 mr-2" /> Ver no Google Maps
                                        </a>
                                    ) : <span className="text-gray-500 italic">Não capturado</span>}
                                </div>
                            )}
                        </div>

                        {/* Observações */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Observações Gerais</label>
                            {editing ? (
                                <textarea
                                    className="w-full border border-gray-300 rounded-md shadow-sm p-3 bg-white text-gray-900 text-sm h-24"
                                    value={formData.Observacoes_Gerais}
                                    onChange={(e) => setFormData({ ...formData, Observacoes_Gerais: e.target.value })}
                                />
                            ) : (
                                <p className="text-sm text-gray-700 bg-yellow-50 p-3 rounded border border-yellow-200 min-h-[60px] whitespace-pre-wrap">
                                    {cliente.Observacoes_Gerais || 'Sem observações.'}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Dados Cadastrais (Read Only section moved down) */}
                <div className="bg-white shadow rounded-lg p-4 collapsed-mobile">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                        <FileText className="h-5 w-5 mr-2 text-gray-400" />
                        Dados Cadastrais
                    </h2>
                    <div className="grid grid-cols-1 gap-2 text-sm text-gray-600">
                        <p><strong className="font-medium text-gray-900">E-mail:</strong> {cliente.Email || '-'}</p>
                        <p><strong className="font-medium text-gray-900">Telefone:</strong> {cliente.Telefone || '-'}</p>
                        <p><strong className="font-medium text-gray-900">Endereço:</strong> <br />
                            {cliente.End_Logradouro}, {cliente.End_Numero}<br />
                            {cliente.End_Bairro} - {cliente.End_Cidade}/{cliente.End_Estado}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DetalheCliente;
