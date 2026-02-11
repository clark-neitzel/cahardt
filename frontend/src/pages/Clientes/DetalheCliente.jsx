import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import clienteService from '../../services/clienteService';
import { ArrowLeft, MapPin, Phone, Mail, Calendar, FileText, Edit2, Save, X } from 'lucide-react';

const DetalheCliente = () => {
    const { uuid } = useParams();
    const navigate = useNavigate();
    const [cliente, setCliente] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);

    // State para edição
    const [formData, setFormData] = useState({
        Dia_de_entrega: '',
        Dia_de_venda: '',
        Ponto_GPS: '',
        Observacoes_Gerais: ''
    });

    useEffect(() => {
        fetchDetalhe();
    }, [uuid]);

    const fetchDetalhe = async () => {
        try {
            const data = await clienteService.detalhar(uuid);
            setCliente(data);
            setFormData({
                Dia_de_entrega: data.Dia_de_entrega || '',
                Dia_de_venda: data.Dia_de_venda || '',
                Ponto_GPS: data.Ponto_GPS || '',
                Observacoes_Gerais: data.Observacoes_Gerais || ''
            });
        } catch (error) {
            console.error('Erro ao carregar cliente:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            await clienteService.atualizar(uuid, formData);
            setEditing(false);
            fetchDetalhe(); // Recarrega para confirmar
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
            Observacoes_Gerais: cliente.Observacoes_Gerais || ''
        });
    };

    if (loading) return <div className="p-8 text-center">Carregando detalhes...</div>;
    if (!cliente) return <div className="p-8 text-center">Cliente não encontrado.</div>;

    return (
        <div className="container mx-auto px-4 py-6">
            <button
                onClick={() => navigate('/clientes')}
                className="mb-4 flex items-center text-gray-600 hover:text-gray-900"
            >
                <ArrowLeft className="h-5 w-5 mr-1" /> Voltar para Lista
            </button>

            {/* Cabeçalho */}
            <div className="bg-white shadow rounded-lg p-6 mb-6 border-l-4 border-primary">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">{cliente.Nome}</h1>
                        {cliente.NomeFantasia && <p className="text-lg text-gray-600 font-medium">{cliente.NomeFantasia}</p>}
                        <p className="text-gray-500 text-sm mt-1">{cliente.Tipo_Pessoa === 'JURIDICA' ? 'CNPJ' : 'CPF'}: {cliente.Documento}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${cliente.Ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {cliente.Ativo ? 'ATIVO' : 'INATIVO'}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Coluna 1: Dados Cadastrais (Conta Azul - Read Only) */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white shadow rounded-lg p-6">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                            <FileText className="h-5 w-5 mr-2 text-primary" />
                            Dados Cadastrais
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                                <label className="block text-gray-500 mb-1">E-mail</label>
                                <div className="flex items-center text-gray-900 font-medium">
                                    <Mail className="h-4 w-4 mr-2 text-gray-400" />
                                    {cliente.Email || '-'}
                                </div>
                            </div>
                            <div>
                                <label className="block text-gray-500 mb-1">Telefone Principal</label>
                                <div className="flex items-center text-gray-900 font-medium">
                                    <Phone className="h-4 w-4 mr-2 text-gray-400" />
                                    {cliente.Telefone || '-'}
                                </div>
                            </div>
                            <div>
                                <label className="block text-gray-500 mb-1">Celular / WhatsApp</label>
                                <div className="text-gray-900 font-medium">
                                    {cliente.Telefone_Celular || '-'}
                                </div>
                            </div>
                            <div>
                                <label className="block text-gray-500 mb-1">Código Interno</label>
                                <div className="text-gray-900 font-medium">
                                    {cliente.Codigo || '-'}
                                </div>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-gray-500 mb-1">Condição de Pagamento</label>
                                <div className="text-gray-900 font-bold bg-gray-50 p-2 rounded border border-gray-100 inline-block">
                                    {cliente.condicaoPagamento?.nome || 'Não definida'}
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-gray-100">
                            <h3 className="text-md font-medium text-gray-700 mb-3 flex items-center">
                                <MapPin className="h-4 w-4 mr-2 text-gray-400" />
                                Endereço Principal
                            </h3>
                            <p className="text-gray-600 text-sm">
                                {cliente.End_Logradouro}, {cliente.End_Numero} {cliente.End_Complemento && `- ${cliente.End_Complemento}`}<br />
                                {cliente.End_Bairro}<br />
                                {cliente.End_Cidade} / {cliente.End_Estado}<br />
                                CEP: {cliente.End_CEP}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Coluna 2: Dados Operacionais (Hardt - Editável) */}
                <div className="space-y-6">
                    <div className="bg-white shadow rounded-lg p-6 relative">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-semibold text-gray-800 flex items-center">
                                <Calendar className="h-5 w-5 mr-2 text-primary" />
                                Operacional (Hardt)
                            </h2>
                            {!editing ? (
                                <button
                                    onClick={() => setEditing(true)}
                                    className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50 transition-colors"
                                    title="Editar Dados"
                                >
                                    <Edit2 className="h-5 w-5" />
                                </button>
                            ) : (
                                <div className="flex space-x-2">
                                    <button
                                        onClick={handleSave}
                                        className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50 transition-colors"
                                        title="Salvar"
                                    >
                                        <Save className="h-5 w-5" />
                                    </button>
                                    <button
                                        onClick={handleCancel}
                                        className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition-colors"
                                        title="Cancelar"
                                    >
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Dia de Entrega</label>
                                {editing ? (
                                    <input
                                        type="text"
                                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm"
                                        value={formData.Dia_de_entrega}
                                        onChange={(e) => setFormData({ ...formData, Dia_de_entrega: e.target.value })}
                                        placeholder="Ex: SEG, QUA"
                                    />
                                ) : (
                                    <div className="mt-1 p-2 bg-gray-50 rounded border border-gray-200 text-gray-800 text-sm min-h-[38px]">
                                        {cliente.Dia_de_entrega || 'Não definido'}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Dia de Visita/Venda</label>
                                {editing ? (
                                    <input
                                        type="text"
                                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm"
                                        value={formData.Dia_de_venda}
                                        onChange={(e) => setFormData({ ...formData, Dia_de_venda: e.target.value })}
                                        placeholder="Ex: TER, QUI"
                                    />
                                ) : (
                                    <div className="mt-1 p-2 bg-gray-50 rounded border border-gray-200 text-gray-800 text-sm min-h-[38px]">
                                        {cliente.Dia_de_venda || 'Não definido'}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Localização GPS</label>
                                {editing ? (
                                    <input
                                        type="text"
                                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm"
                                        value={formData.Ponto_GPS}
                                        onChange={(e) => setFormData({ ...formData, Ponto_GPS: e.target.value })}
                                        placeholder="lat,lng"
                                    />
                                ) : (
                                    <div className="mt-1 p-2 bg-gray-50 rounded border border-gray-200 text-gray-800 text-sm min-h-[38px]">
                                        {cliente.Ponto_GPS ? (
                                            <a
                                                href={`https://www.google.com/maps/search/?api=1&query=${cliente.Ponto_GPS}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-blue-600 hover:underline flex items-center"
                                            >
                                                <MapPin className="h-3 w-3 mr-1" /> Ver no Mapa ({cliente.Ponto_GPS})
                                            </a>
                                        ) : 'Não capturado'}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-6">
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Observações Gerais</h4>
                            {editing ? (
                                <textarea
                                    className="w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm h-24"
                                    value={formData.Observacoes_Gerais}
                                    onChange={(e) => setFormData({ ...formData, Observacoes_Gerais: e.target.value })}
                                />
                            ) : (
                                <p className="text-sm text-gray-600 bg-yellow-50 p-3 rounded border border-yellow-100 italic min-h-[60px]">
                                    {cliente.Observacoes_Gerais || 'Sem observações.'}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DetalheCliente;
