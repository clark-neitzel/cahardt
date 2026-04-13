import React, { useState, useRef, useEffect } from 'react';
import { X, MapPin, Loader, Mic, MicOff, Camera, Upload } from 'lucide-react';
import leadService from '../../services/leadService';
import vendedorService from '../../services/vendedorService';
import configService from '../../services/configService';
import api from '../../services/api';
import toast from 'react-hot-toast';

const DIAS_OPCOES = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM', 'N/D'];
const CANAIS = [
    { value: 'PRESENCIAL', label: 'Presencial' },
    { value: 'WHATSAPP', label: 'WhatsApp' },
    { value: 'TELEFONE', label: 'Telefone' },
];
const ORIGENS_PADRAO = [
    { value: 'VISITA_VENDEDOR', label: 'Visita do vendedor' },
    { value: 'INDICACAO', label: 'Indicação' },
    { value: 'WHATSAPP', label: 'WhatsApp' },
    { value: 'CLIENTE_PEDIU_CONTATO', label: 'Cliente que pediu contato' },
    { value: 'PESQUISA', label: 'Pesquisa' },
    { value: 'REATIVACAO', label: 'Reativação cliente antigo' },
];

const ModalNovoLead = ({ onClose, onSalvo, onCriado, user, vendedorId: propVendedorId, podeEscolherVendedor: propPodeEscolher, vendedores: propVendedores }) => {
    const callback = onSalvo || onCriado;
    const [form, setForm] = useState({
        nomeEstabelecimento: '',
        contato: '',
        whatsapp: '',
        diasVisita: [],
        horarioAtendimento: '',
        formasAtendimento: [],
        pontoGps: '',
        observacoes: '',
        idVendedor: propVendedorId || user?.id || '',
        cidade: '',
        origemLead: '',
        categoriaClienteId: ''
    });
    const [origens, setOrigens] = useState([]);
    const [categoriasCliente, setCategoriasCliente] = useState([]);
    const [fotoFile, setFotoFile] = useState(null);
    const [fotoPreviewUrl, setFotoPreviewUrl] = useState(null);
    const [capturandoGps, setCapturandoGps] = useState(false);
    const [saving, setSaving] = useState(false);
    const [vendedores, setVendedores] = useState(propVendedores || []);
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef(null);
    const originalTextRef = useRef('');
    const stoppedRef = useRef(false);
    const fotoInputRef = useRef(null);
    const fotoGaleriaInputRef = useRef(null);

    const podeEscolherVendedor = propPodeEscolher ?? (user?.permissoes?.pedidos?.clientes === 'todos');

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

    React.useEffect(() => {
        if (podeEscolherVendedor && (!propVendedores || propVendedores.length === 0)) {
            vendedorService.listarAtivos().then(setVendedores).catch(console.error);
        }
    }, [podeEscolherVendedor, propVendedores]);

    useEffect(() => {
        Promise.all([
            configService.get('origens_lead').catch(() => []),
            api.get('/categorias-cliente').then(r => r.data).catch(() => [])
        ]).then(([orig, cats]) => {
            setOrigens(Array.isArray(orig) && orig.length > 0 ? orig : ORIGENS_PADRAO);
            setCategoriasCliente(Array.isArray(cats) ? cats.filter(c => c.ativo) : []);
        });
    }, []);

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
                if (event.results[i].isFinal) {
                    finalTranscript += transcript + ' ';
                } else {
                    interimTranscript += transcript;
                }
            }

            setForm(f => {
                const updatedBase = (originalTextRef.current + ' ' + finalTranscript).replace(/\s+/g, ' ').trim();
                return { ...f, observacoes: (updatedBase + ' ' + interimTranscript).trim() };
            });

            if (finalTranscript !== '') {
                originalTextRef.current = (originalTextRef.current + ' ' + finalTranscript).replace(/\s+/g, ' ').trim();
            }
        };

        recognition.onerror = (event) => {
            if (event.error !== 'aborted') {
                toast.error('Grave de mais perto ou verifique sua conexão.');
            }
            setIsListening(false);
        };

        recognition.onend = () => {
            recognitionRef.current = null;
            setIsListening(false);
        };

        recognitionRef.current = recognition;
        try {
            recognition.start();
        } catch (e) {
            console.error(e);
        }
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

    const handleFotoChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setFotoFile(file);
            setFotoPreviewUrl(URL.createObjectURL(file));
        }
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
        if (!form.origemLead) {
            toast.error('Selecione a origem do lead.');
            return;
        }
        if (!form.cidade.trim()) {
            toast.error('Informe a cidade.');
            return;
        }
        if (!form.categoriaClienteId) {
            toast.error('Selecione a categoria do lead.');
            return;
        }
        if (form.formasAtendimento.length === 0) {
            toast.error('Selecione pelo menos um canal de atendimento.');
            return;
        }
        if (!form.pontoGps) {
            toast.error('Capture a localização GPS.');
            return;
        }
        if (!fotoFile) {
            toast.error('Tire uma foto da fachada do estabelecimento.');
            return;
        }
        try {
            setSaving(true);
            const lead = await leadService.criar({
                ...form,
                diasVisita: form.diasVisita.join(','),
                idVendedor: form.idVendedor || user?.id,
            });

            // Upload da foto
            if (fotoFile) {
                const formData = new FormData();
                formData.append('foto', fotoFile);
                await leadService.uploadFoto(lead.id, formData);
            }

            callback();
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
                    {/* Nome e Vendedor */}
                    <div className="space-y-4">
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

                        {podeEscolherVendedor && (
                            <div>
                                <label className="block text-[13px] font-semibold text-gray-700 mb-1">Vendedor Responsável</label>
                                <select
                                    value={form.idVendedor}
                                    onChange={e => setForm(f => ({ ...f, idVendedor: e.target.value }))}
                                    className="block w-full border border-gray-300 rounded-lg p-3 bg-white text-gray-900 text-[14px] focus:ring-orange-500 focus:border-orange-500"
                                >
                                    <option value="">Selecione um vendedor (Opcional)</option>
                                    {vendedores.map(v => (
                                        <option key={v.id} value={v.id}>{v.nome}</option>
                                    ))}
                                </select>
                            </div>
                        )}
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

                    {/* Cidade, Origem, Categoria */}
                    <div>
                        <label className="block text-[13px] font-semibold text-gray-700 mb-1">Cidade *</label>
                        <input type="text" value={form.cidade} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))}
                            placeholder="Ex: Chapecó"
                            className="block w-full border border-gray-300 rounded-lg p-3 bg-white text-gray-900 text-[14px] focus:ring-orange-500 focus:border-orange-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[13px] font-semibold text-gray-700 mb-1">Origem *</label>
                            <select value={form.origemLead} onChange={e => setForm(f => ({ ...f, origemLead: e.target.value }))}
                                className="block w-full border border-gray-300 rounded-lg p-3 bg-white text-gray-900 text-[14px] focus:ring-orange-500 focus:border-orange-500">
                                <option value="">Selecione...</option>
                                {origens.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[13px] font-semibold text-gray-700 mb-1">Categoria *</label>
                            <select value={form.categoriaClienteId} onChange={e => setForm(f => ({ ...f, categoriaClienteId: e.target.value }))}
                                className="block w-full border border-gray-300 rounded-lg p-3 bg-white text-gray-900 text-[14px] focus:ring-orange-500 focus:border-orange-500">
                                <option value="">Selecione...</option>
                                {categoriasCliente.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                            </select>
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

                    {/* Foto da Fachada */}
                    <div>
                        <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Foto da Fachada *</label>
                        <input
                            ref={fotoInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleFotoChange}
                            className="hidden"
                        />
                        <input
                            ref={fotoGaleriaInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFotoChange}
                            className="hidden"
                        />
                        {fotoPreviewUrl ? (
                            <div className="relative">
                                <img src={fotoPreviewUrl} alt="Fachada" className="w-full h-40 object-cover rounded-lg border border-gray-200" />
                                <div className="absolute bottom-2 right-2 flex gap-2">
                                    <button
                                        onClick={() => fotoGaleriaInputRef.current?.click()}
                                        className="bg-white/90 text-gray-700 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-gray-200 flex items-center gap-1"
                                    >
                                        <Upload className="h-3.5 w-3.5" /> Galeria
                                    </button>
                                    <button
                                        onClick={() => fotoInputRef.current?.click()}
                                        className="bg-white/90 text-gray-700 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-gray-200 flex items-center gap-1"
                                    >
                                        <Camera className="h-3.5 w-3.5" /> Câmera
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => fotoInputRef.current?.click()}
                                    className="h-32 border-2 border-dashed border-orange-300 rounded-lg bg-orange-50/50 flex flex-col items-center justify-center gap-1.5 text-orange-500 hover:bg-orange-50 transition-colors"
                                >
                                    <Camera className="h-6 w-6" />
                                    <span className="text-[13px] font-semibold">Tirar Foto</span>
                                </button>
                                <button
                                    onClick={() => fotoGaleriaInputRef.current?.click()}
                                    className="h-32 border-2 border-dashed border-blue-300 rounded-lg bg-blue-50/50 flex flex-col items-center justify-center gap-1.5 text-blue-500 hover:bg-blue-50 transition-colors"
                                >
                                    <Upload className="h-6 w-6" />
                                    <span className="text-[13px] font-semibold">Escolher da Galeria</span>
                                </button>
                            </div>
                        )}
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
                                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                    }`}
                            >
                                {isListening ? (
                                    <><MicOff className="h-3 w-3" /> Ouvindo...</>
                                ) : (
                                    <><Mic className="h-3 w-3" /> Ditar por Voz</>
                                )}
                            </button>
                        </div>
                        <textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                            rows={3} placeholder={isListening ? 'Fale agora...' : 'Informações relevantes sobre o estabelecimento...'}
                            className={`block w-full border rounded-lg p-3 text-[14px] resize-none transition-colors ${isListening
                                ? 'border-red-400 bg-red-50/30 ring-1 ring-red-400'
                                : 'border-gray-300 bg-white focus:ring-orange-500 focus:border-orange-500'
                                }`} />
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
