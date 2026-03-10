import React, { useState, useRef } from 'react';
import { X, MapPin, Loader, Mic, MicOff } from 'lucide-react';
import leadService from '../../services/leadService';
import toast from 'react-hot-toast';

const DIAS_OPCOES = ['SEG', 'TER', 'QUA', 'QUI', 'SEX'];
const CANAIS = [
    { value: 'PRESENCIAL', label: 'Presencial' },
    { value: 'WHATSAPP', label: 'WhatsApp' },
    { value: 'TELEFONE', label: 'Telefone' },
];

const ModalEditarLead = ({ lead, onClose, onSalvo }) => {
    const diasIniciais = lead.diasVisita
        ? lead.diasVisita.split(',').map(d => d.trim()).filter(Boolean)
        : [];

    const [form, setForm] = useState({
        nomeEstabelecimento: lead.nomeEstabelecimento || '',
        contato: lead.contato || '',
        whatsapp: lead.whatsapp || '',
        diasVisita: diasIniciais,
        horarioAtendimento: lead.horarioAtendimento || '',
        horarioEntrega: lead.horarioEntrega || '',
        formasAtendimento: lead.formasAtendimento || [],
        pontoGps: lead.pontoGps || '',
        observacoes: lead.observacoes || '',
    });

    const [capturandoGps, setCapturandoGps] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef(null);
    const originalTextRef = useRef('');
    const stoppedRef = useRef(false);

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

    const toggleMicrophone = () => {
        if (isListening) {
            stoppedRef.current = true;
            if (recognitionRef.current) recognitionRef.current.stop();
            recognitionRef.current = null;
            setIsListening(false);
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            toast.error('Reconhecimento de voz não suportado neste navegador/dispositivo.');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'pt-BR';
        recognition.continuous = true;
        recognition.interimResults = true;

        stoppedRef.current = false;
        originalTextRef.current = form.observacoes;

        recognition.onstart = () => setIsListening(true);

        recognition.onresult = (event) => {
            if (stoppedRef.current) return;
            let finalTranscript = '';
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) finalTranscript += transcript + ' ';
                else interimTranscript += transcript;
            }
            setForm(f => {
                const updatedBase = (originalTextRef.current + ' ' + finalTranscript).replace(/\s+/g, ' ').trim();
                return { ...f, observacoes: (updatedBase + ' ' + interimTranscript).trim() };
            });
            if (finalTranscript !== '') {
                originalTextRef.current = (originalTextRef.current + ' ' + finalTranscript).replace(/\s+/g, ' ').trim();
            }
        };

        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => { recognitionRef.current = null; setIsListening(false); };

        recognitionRef.current = recognition;
        try { recognition.start(); } catch (e) { console.error(e); }
    };

    const handleSalvar = async () => {
        if (!form.nomeEstabelecimento.trim()) {
            toast.error('Informe o nome do estabelecimento.');
            return;
        }
        try {
            setSaving(true);
            await leadService.atualizar(lead.id, {
                ...form,
                diasVisita: form.diasVisita.join(','),
            });
            toast.success('Lead atualizado!');
            onSalvo && onSalvo();
        } catch (e) {
            console.error(e);
            toast.error('Erro ao salvar lead.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end" onClick={onClose}>
            <div className="bg-white w-full rounded-t-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 sticky top-0 bg-white">
                    <h2 className="font-bold text-[16px] text-gray-900">Editar Lead #{lead.numero}</h2>
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
                            className="block w-full border border-gray-300 rounded-lg p-3 bg-white text-gray-900 text-[14px] focus:ring-orange-500 focus:border-orange-500"
                        />
                    </div>

                    {/* Contato + WhatsApp */}
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
                        <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Dia(s) de Visita</label>
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

                    {/* Horários */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[13px] font-semibold text-gray-700 mb-1">Horário Atendimento</label>
                            <input type="text" value={form.horarioAtendimento} onChange={e => setForm(f => ({ ...f, horarioAtendimento: e.target.value }))}
                                placeholder="09:00 - 11:00"
                                className="block w-full border border-gray-300 rounded-lg p-3 bg-white text-gray-900 text-[14px] focus:ring-orange-500 focus:border-orange-500" />
                        </div>
                        <div>
                            <label className="block text-[13px] font-semibold text-gray-700 mb-1">Horário Entrega</label>
                            <input type="text" value={form.horarioEntrega} onChange={e => setForm(f => ({ ...f, horarioEntrega: e.target.value }))}
                                placeholder="08:00 - 10:00"
                                className="block w-full border border-gray-300 rounded-lg p-3 bg-white text-gray-900 text-[14px] focus:ring-orange-500 focus:border-orange-500" />
                        </div>
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
                        <div className="flex items-center justify-between mb-1">
                            <label className="block text-[13px] font-semibold text-gray-700">Observações</label>
                            <button
                                type="button"
                                onClick={toggleMicrophone}
                                className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors ${isListening
                                    ? 'bg-red-50 text-red-600 border-red-200 animate-pulse'
                                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                            >
                                {isListening ? <><MicOff className="h-3 w-3" /> Ouvindo...</> : <><Mic className="h-3 w-3" /> Ditar por Voz</>}
                            </button>
                        </div>
                        <textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                            rows={3} placeholder={isListening ? 'Fale agora...' : 'Informações sobre o estabelecimento...'}
                            className={`block w-full border rounded-lg p-3 text-[14px] resize-none transition-colors ${isListening
                                ? 'border-red-400 bg-red-50/30 ring-1 ring-red-400'
                                : 'border-gray-300 bg-white focus:ring-orange-500 focus:border-orange-500'}`} />
                    </div>

                    <button onClick={handleSalvar} disabled={saving}
                        className="w-full bg-orange-500 text-white font-bold py-3.5 rounded-xl text-[15px] flex items-center justify-center gap-2 disabled:opacity-70">
                        {saving ? <Loader className="h-5 w-5 animate-spin" /> : null}
                        {saving ? 'Salvando...' : 'Salvar Alterações'}
                    </button>

                    <div className="h-4" />
                </div>
            </div>
        </div>
    );
};

export default ModalEditarLead;
