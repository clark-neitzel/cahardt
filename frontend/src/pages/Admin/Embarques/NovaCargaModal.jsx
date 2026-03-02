import React, { useState } from 'react';
import { X, Save, Calendar, User } from 'lucide-react';
import toast from 'react-hot-toast';
import embarqueService from '../../../services/embarqueService';

const NovaCargaModal = ({ onClose, vendedores, onSuccess }) => {
    const [dataSaida, setDataSaida] = useState(() => {
        const today = new Date();
        return today.toISOString().split('T')[0];
    });
    const [responsavelId, setResponsavelId] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!dataSaida || !responsavelId) {
            return toast.error('Preencha a data e o motorista!');
        }

        try {
            setSaving(true);
            await embarqueService.criar({ dataSaida, responsavelId });
            onSuccess();
        } catch (error) {
            console.error(error);
            toast.error(error.response?.data?.error || 'Erro ao criar a carga.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900">Novo Embarque (Carga)</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                        <X className="h-6 w-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                <Calendar className="inline h-4 w-4 mr-1 text-gray-400" />
                                Data Programada de Saída
                            </label>
                            <input
                                type="date"
                                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500 p-2 border"
                                value={dataSaida}
                                onChange={(e) => setDataSaida(e.target.value)}
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                <User className="inline h-4 w-4 mr-1 text-gray-400" />
                                Motorista / Responsável
                            </label>
                            <select
                                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500 p-2 border"
                                value={responsavelId}
                                onChange={(e) => setResponsavelId(e.target.value)}
                                required
                            >
                                <option value="" disabled>Selecione quem vai entregar...</option>
                                {vendedores.map((v) => (
                                    <option key={v.id} value={v.id}>{v.nome}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end space-x-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50"
                        >
                            <Save className="h-4 w-4 mr-2" />
                            {saving ? 'Gerando...' : 'Montar Carga'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default NovaCargaModal;
