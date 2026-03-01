import React, { useState } from 'react';
import { X, MapPin, Loader } from 'lucide-react';
import leadService from '../../services/leadService';
import toast from 'react-hot-toast';

const DIAS_OPCOES = ['SEG', 'TER', 'QUA', 'QUI', 'SEX'];
const CANAIS = [
    { value: 'PRESENCIAL', label: 'Presencial' },
    { value: 'WHATSAPP', label: 'WhatsApp' },
    { value: 'TELEFONE', label: 'Telefone' },
];

const ModalNovoLead = ({ onClose, onSalvo, vendedorId }) => {
    const [form, setForm] = useState({
        nomeEstabelecimento: '',
        contato: '',
        whatsapp: '',
        diasVisita: [],
        horarioAtendimento: '',
        formasAtendimento: [],
        pontoGps: '',
        observacoes: '',
    });
    const [capturandoGps, setCapturandoGps] = useState(false);
    const [saving, setSaving] = useState(false);

    const toggleDia = (dia) => {
        setForm(f => ({
            ...f,
            diasVisita: f.diasVisita.includes(dia)
                ? f.diasVisita.filter(d => d !== dia)
                : [...f.diasVisita, dia]
        }));
    };

    const toggleCanal = (canal) => {
        setForm(f => ({
            ...f,
            formasAtendimento: f.formasAtendimento.includes(canal)
                ? f.formasAtendimento.filter(c => c !== canal)
                : [...f.formasAtendimento, canal]
        }));
    };

    const capturarGps = () => {
        if (!navigator.geolocation) {
            toast.error('GPS não disponível neste dispositivo.');
            return;
        }
        setCapturandoGps(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const coords = `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`;
                setForm(f => ({ ...f, pontoGps: coords }));
                setCapturandoGps(false);
                toast.success('Localização capturada!', { duration: 2000 });
            },
            () => {
                setCapturandoGps(false);
                toast.error('Não foi possível capturar o GPS.');
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );
    };

    const handleSalvar = async () => {
        if (!form.nomeEstabelecimento.trim()) {
            toast.error('Informe o nome do estabelecimento.');
            return;
        }
        if (form.diasVisita.length === 0) {
            toast.error('Selecione pelo menos um dia de visita.');
            return;
        }
        try {
            setSaving(true);
            await leadService.criar({
                ...form,
                diasVisita: form.diasVisita.join(','),
                idVendedor: vendedorId,
            });
            onSalvo();
        } catch (e) {
            console.error(e);
            toast.error('Erro ao criar lead.', { duration: 5000 });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end">
            <div className="bg-white w-full rounded-t-2xl max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 sticky top-0 bg-white">
                    <h2 className="font-bold text-[16px] text-gray-900">Novo Lead</h2>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="px-4 py-4 space-y-4">
                    {/* Nome */}
                    <div>
                        <label className="block text-[13px] font-semibold text-gray-700 mb-1">Nome do Estabelecimento *</label>
                        <input
                            type="text"
                            value={form.nomeEstabelecimento}
                            onChange={e => setForm(f => ({ ...f, nomeEstabelecimento: e.target.value }))}
                            placeholder="Ex: Padaria do João"
                            className="block w-full border border-gray-300 rounded-lg p-3 bg-white text-gray-900 text-[14px] focus:ring-orange-500 focus:border-orange-500"
                        />
                    </div>

                    {/* Contato */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[13px] font-semibold text-gray-700 mb-1">Responsável</label>
                            <input type="text" value={form.contato} onChange={e => setForm(f => ({ ...f, contato: e.target.value }))}
                                placeholder="Maria Silva"
                                className="block w-full border border-gray-300 rounded-lg p-3 bg-white text-gray-900 text-[14px] focus:ring-orange-500 focus:border-orange-500" />
                        </div>
                        <div>
                            <label className="block text-[13px] font-semibold text-gray-700 mb-1">WhatsApp</label>
                            <input type="tel" value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
                                placeholder="(49) 99999-9999"
                                className="block w-full border border-gray-300 rounded-lg p-3 bg-white text-gray-900 text-[14px] focus:ring-orange-500 focus:border-orange-500" />
                        </div>
                    </div>

                    {/* Dias de Visita */}
                    <div>
                        <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Dia(s) de Visita *</label>
                        <div className="flex gap-2">
                            {DIAS_OPCOES.map(d => (
                                <button
                                    key={d}
                                    onClick={() => toggleDia(d)}
                                    className={`flex-1 py-2 rounded-lg text-[13px] font-bold border transition-colors ${form.diasVisita.includes(d) ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-300'}`}
                                >
                                    {d}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Horário */}
                    <div>
                        <label className="block text-[13px] font-semibold text-gray-700 mb-1">Horário de Atendimento</label>
                        <input type="text" value={form.horarioAtendimento} onChange={e => setForm(f => ({ ...f, horarioAtendimento: e.target.value }))}
                            placeholder="Ex: 09:00 - 11:00"
                            className="block w-full border border-gray-300 rounded-lg p-3 bg-white text-gray-900 text-[14px] focus:ring-orange-500 focus:border-orange-500" />
                    </div>

                    {/* Canais */}
                    <div>
                        <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Canais de Atendimento</label>
                        <div className="flex gap-2">
                            {CANAIS.map(c => (
                                <button key={c.value} onClick={() => toggleCanal(c.value)}
                                    className={`px-3 py-2 rounded-lg text-[13px] font-semibold border transition-colors ${form.formasAtendimento.includes(c.value) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}
                                >
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* GPS */}
                    <div>
                        <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Localização GPS</label>
                        <div className="flex gap-2">
                            <input type="text" value={form.pontoGps} onChange={e => setForm(f => ({ ...f, pontoGps: e.target.value }))}
                                placeholder="lat,lng"
                                className="flex-1 border border-gray-300 rounded-lg p-3 bg-white text-gray-900 text-[14px] focus:ring-orange-500 focus:border-orange-500" />
                            <button onClick={capturarGps} disabled={capturandoGps}
                                className="bg-blue-600 text-white px-3 py-3 rounded-lg flex items-center gap-1.5 font-semibold text-[13px] disabled:opacity-60">
                                {capturandoGps ? <Loader className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                                GPS
                            </button>
                        </div>
                    </div>

                    {/* Observações */}
                    <div>
                        <label className="block text-[13px] font-semibold text-gray-700 mb-1">Observações</label>
                        <textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                            rows={3} placeholder="Informações relevantes sobre o estabelecimento..."
                            className="block w-full border border-gray-300 rounded-lg p-3 bg-white text-gray-900 text-[14px] focus:ring-orange-500 focus:border-orange-500 resize-none" />
                    </div>

                    <button onClick={handleSalvar} disabled={saving}
                        className="w-full bg-orange-500 text-white font-bold py-3.5 rounded-xl text-[15px] flex items-center justify-center gap-2 disabled:opacity-70">
                        {saving ? <Loader className="h-5 w-5 animate-spin" /> : null}
                        {saving ? 'Salvando...' : 'Criar Lead'}
                    </button>

                    <div className="h-4" />
                </div>
            </div>
        </div>
    );
};

export default ModalNovoLead;
