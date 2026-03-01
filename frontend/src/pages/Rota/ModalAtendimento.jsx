import React, { useState, useEffect } from 'react';
import { X, MapPin, Navigation, Loader } from 'lucide-react';
import atendimentoService from '../../services/atendimentoService';
import toast from 'react-hot-toast';

const TIPOS = [
    { value: 'VISITA', label: 'Visita Presencial' },
    { value: 'AMOSTRA', label: 'Amostra' },
    { value: 'LIGACAO', label: 'Ligação' },
    { value: 'WHATSAPP', label: 'WhatsApp' },
    { value: 'OUTROS', label: 'Outros' },
];

const ETAPAS = ['NOVO', 'AMOSTRA', 'VISITA', 'PEDIDO', 'FINALIZADO'];

const ModalAtendimento = ({ dados, onClose, onSalvo, vendedorId }) => {
    const { tipo, item } = dados; // tipo: 'lead' | 'cliente'
    const isLead = tipo === 'lead';

    const [form, setForm] = useState({
        tipoAtendimento: 'VISITA',
        observacao: '',
        etapaNova: isLead ? item.etapa : '',
        proximaVisita: '',
    });
    const [gps, setGps] = useState(null);
    const [loadingGps, setLoadingGps] = useState(false);
    const [saving, setSaving] = useState(false);

    // Captura GPS automaticamente ao abrir
    useEffect(() => {
        if (navigator.geolocation) {
            setLoadingGps(true);
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setGps(`${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`);
                    setLoadingGps(false);
                },
                () => {
                    setLoadingGps(false);
                    toast.error('Não foi possível capturar o GPS. Permita a localização.', { duration: 4000 });
                },
                { enableHighAccuracy: true, timeout: 8000 }
            );
        }
    }, []);

    const handleSalvar = async () => {
        if (!form.tipoAtendimento) {
            toast.error('Selecione o tipo de atendimento.');
            return;
        }
        if (form.proximaVisita) {
            const pv = new Date(form.proximaVisita);
            const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
            if (pv < hoje) {
                toast.error('A próxima visita não pode ser uma data passada.');
                return;
            }
        }
        try {
            setSaving(true);
            await atendimentoService.registrar({
                tipo: form.tipoAtendimento,
                observacao: form.observacao || null,
                etapaAnterior: isLead ? item.etapa : null,
                etapaNova: isLead && form.etapaNova !== item.etapa ? form.etapaNova : null,
                proximaVisita: form.proximaVisita || null,
                gpsVendedor: gps,
                leadId: isLead ? item.id : null,
                clienteId: !isLead ? item.UUID : null,
                idVendedor: vendedorId
            });
            onSalvo();
        } catch (e) {
            console.error(e);
            toast.error('Erro ao registrar atendimento.', { duration: 5000 });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end">
            <div className="bg-white w-full rounded-t-2xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 sticky top-0 bg-white">
                    <div>
                        <h2 className="font-bold text-[16px] text-gray-900">Registrar Atendimento</h2>
                        <p className="text-[12px] text-gray-500 mt-0.5 truncate max-w-xs">
                            {isLead ? `Lead #${item.numero} · ${item.nomeEstabelecimento}` : (item.NomeFantasia || item.Nome)}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="px-4 py-4 space-y-4">
                    {/* GPS Status */}
                    <div className={`flex items-center gap-2 text-[12px] rounded-lg px-3 py-2 ${gps ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
                        {loadingGps ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
                        {loadingGps ? 'Capturando localização...' : gps ? `GPS capturado: ${gps}` : 'GPS não disponível'}
                    </div>

                    {/* Tipo */}
                    <div>
                        <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Tipo de Atendimento *</label>
                        <div className="flex flex-wrap gap-2">
                            {TIPOS.map(t => (
                                <button
                                    key={t.value}
                                    onClick={() => setForm(f => ({ ...f, tipoAtendimento: t.value }))}
                                    className={`px-3 py-1.5 rounded-full text-[13px] font-semibold border transition-colors ${form.tipoAtendimento === t.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Etapa (só para leads) */}
                    {isLead && (
                        <div>
                            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Etapa do Lead</label>
                            <select
                                value={form.etapaNova}
                                onChange={e => setForm(f => ({ ...f, etapaNova: e.target.value }))}
                                className="block w-full border border-gray-300 rounded-lg p-3 bg-white text-gray-900 text-[14px] focus:ring-blue-500 focus:border-blue-500"
                            >
                                {ETAPAS.map(e => <option key={e} value={e}>{e}</option>)}
                            </select>
                        </div>
                    )}

                    {/* Próxima Visita */}
                    <div>
                        <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Próxima Visita (opcional)</label>
                        <input
                            type="date"
                            min={new Date().toISOString().split('T')[0]}
                            value={form.proximaVisita}
                            onChange={e => setForm(f => ({ ...f, proximaVisita: e.target.value }))}
                            className="block w-full border border-gray-300 rounded-lg p-3 bg-white text-gray-900 text-[14px] focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    {/* Observação */}
                    <div>
                        <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Observação</label>
                        <textarea
                            value={form.observacao}
                            onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
                            rows={3}
                            placeholder="O que aconteceu neste atendimento?"
                            className="block w-full border border-gray-300 rounded-lg p-3 bg-white text-gray-900 text-[14px] focus:ring-blue-500 focus:border-blue-500 resize-none"
                        />
                    </div>

                    {/* Botão */}
                    <button
                        onClick={handleSalvar}
                        disabled={saving}
                        className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl text-[15px] flex items-center justify-center gap-2 mt-2 disabled:opacity-70"
                    >
                        {saving ? <Loader className="h-5 w-5 animate-spin" /> : null}
                        {saving ? 'Salvando...' : 'Confirmar Atendimento'}
                    </button>

                    <div className="h-4" />
                </div>
            </div>
        </div>
    );
};

export default ModalAtendimento;
