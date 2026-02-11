import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import clienteService from '../../services/clienteService';
import { ArrowLeft, MapPin, Phone, Mail, Calendar, FileText } from 'lucide-react';

const DetalheCliente = () => {
    const { uuid } = useParams();
    const navigate = useNavigate();
    const [cliente, setCliente] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDetalhe = async () => {
            try {
                const data = await clienteService.detalhar(uuid);
                setCliente(data);
            } catch (error) {
                console.error('Erro ao carregar cliente:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchDetalhe();
    }, [uuid]);

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
                        <p className="text-gray-500 text-sm mt-1">{cliente.Tipo_Pessoa === 'JURIDICA' ? 'CNPJ' : 'CPF'}: {cliente.Documento}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${cliente.Ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {cliente.Ativo ? 'ATIVO' : 'INATIVO'}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Coluna 1: Dados Cadastrais (Conta Azul) */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white shadow rounded-lg p-6">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                            <FileText className="h-5 w-5 mr-2 text-primary" />
                            Dados Cadastrais
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                                <label className="block text-gray-500 mb-1">E-mail</label>
                                <div className="flex items-center text-gray-900">
                                    <Mail className="h-4 w-4 mr-2 text-gray-400" />
                                    {cliente.Email || '-'}
                                </div>
                            </div>
                            <div>
                                <label className="block text-gray-500 mb-1">Telefone Principal</label>
                                <div className="flex items-center text-gray-900">
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
                                <div className="text-gray-900">
                                    {cliente.Codigo || '-'}
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

                {/* Coluna 2: Dados Operacionais (Hardt) */}
                <div className="space-y-6">
                    <div className="bg-white shadow rounded-lg p-6">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                            <Calendar className="h-5 w-5 mr-2 text-primary" />
                            Operacional (Hardt)
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Dia de Entrega</label>
                                <div className="mt-1 p-2 bg-gray-50 rounded border border-gray-200 text-gray-800 text-sm">
                                    {cliente.Dia_de_entrega || 'Não definido'}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Dia de Visita/Venda</label>
                                <div className="mt-1 p-2 bg-gray-50 rounded border border-gray-200 text-gray-800 text-sm">
                                    {cliente.Dia_de_venda || 'Não definido'}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Localização GPS</label>
                                <div className="mt-1 p-2 bg-gray-50 rounded border border-gray-200 text-gray-800 text-sm">
                                    {cliente.Ponto_GPS ? (
                                        <a
                                            href={`https://www.google.com/maps/search/?api=1&query=${cliente.Ponto_GPS}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-blue-600 hover:underline flex items-center"
                                        >
                                            <MapPin className="h-3 w-3 mr-1" /> Ver no Mapa
                                        </a>
                                    ) : 'Não capturado'}
                                </div>
                            </div>
                        </div>

                        <div className="mt-6">
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Observações Gerais</h4>
                            <p className="text-sm text-gray-600 bg-yellow-50 p-3 rounded border border-yellow-100 italic">
                                {cliente.Observacoes_Gerais || 'Sem observações.'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DetalheCliente;
