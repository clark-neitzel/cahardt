import React, { useState } from 'react';
import { X, Save, Calendar, User, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import embarqueService from '../../../services/embarqueService';

const NovaCargaModal = ({ onClose, vendedores, onSuccess }) => {
    const [dataSaida, setDataSaida] = useState(() => {
        return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="bg-sky-100 p-1.5 rounded-lg">
                            <Truck className="h-4 w-4 text-sky-600" />
                        </div>
                        <h3 className="text-sm font-bold text-gray-900">Novo Embarque (Carga)</h3>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" /> Data Programada de Saída
                            </label>
                            <input
                                type="date"
                                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-1 focus:ring-sky-500 focus:border-sky-500 focus:outline-none"
                                value={dataSaida}
                                onChange={(e) => setDataSaida(e.target.value)}
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                                <User className="h-3.5 w-3.5" /> Motorista / Responsável
                            </label>
                            <select
                                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-1 focus:ring-sky-500 focus:border-sky-500 focus:outline-none"
                                value={responsavelId}
                                onChange={(e) => setResponsavelId(e.target.value)}
                                required
                            >
                                <option value="" disabled>Selecione quem vai entregar…</option>
                                {vendedores.map((v) => (
                                    <option key={v.id} value={v.id}>{v.nome}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="mt-5 flex justify-end gap-3 pt-4 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 transition-colors shadow-sm"
                        >
                            <Save className="h-4 w-4" />
                            {saving ? 'Gerando…' : 'Montar Carga'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default NovaCargaModal;
