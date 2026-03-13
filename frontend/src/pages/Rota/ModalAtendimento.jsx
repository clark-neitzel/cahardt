import React, { useState, useEffect } from 'react';
import { X, Navigation, Loader, Mic, MicOff, ArrowRight, UserCheck, CalendarClock } from 'lucide-react';
import atendimentoService from '../../services/atendimentoService';
import configService from '../../services/configService';
import vendedorService from '../../services/vendedorService';
import toast from 'react-hot-toast';

const TIPOS_PADRAO = [
    { value: 'VISITA', label: 'Visita Presencial' },
    { value: 'AMOSTRA', label: 'Amostra' },
    { value: 'LIGACAO', label: 'Ligação' },
    { value: 'WHATSAPP', label: 'WhatsApp' },
    { value: 'OUTROS', label: 'Outros' },
];

const ACOES_PADRAO = [
    { value: 'NOVO', label: 'Novo' },
    { value: 'VISITAR', label: 'Visitar' },
    { value: 'MANDAR_WHATSAPP', label: 'Mandar WhatsApp' },
    { value: 'LIGAR', label: 'Ligar' },
    { value: 'LEVAR_AMOSTRA', label: 'Levar amostra' },
    { value: 'AGUARDO_RETORNO', label: 'Aguardo retorno' },
    { value: 'SEM_POTENCIAL', label: 'Sem potencial' },
];

const ETAPAS = ['NOVO', 'AMOSTRA', 'VISITA', 'PEDIDO', 'FINALIZADO'];

const ModalAtendimento = ({ dados, onClose, onSalvo, vendedorId, tarefaId }) => {
    const { tipo, item } = dados; // tipo: 'lead' | 'cliente'
    const isLead = tipo === 'lead';

    const [tipos, setTipos] = useState(TIPOS_PADRAO);
    const [acoes, setAcoes] = useState(ACOES_PADRAO);
    const [vendedores, setVendedores] = useState([]);
    const [form, setForm] = useState({
        tipoAtendimento: '',
        acaoAtendimento: '',
        observacao: '',
        etapaNova: isLead ? item.etapa : '',
        proximaAcaoKey: '',
        proximoResponsavelId: '',
        dataVencimento: '',
    });
    const [gps, setGps] = useState(null);
    const [loadingGps, setLoadingGps] = useState(false);
    const [saving, setSaving] = useState(false);

    // Carrega tipos, ações e vendedores
    useEffect(() => {
        const chaveAcoes = isLead ? 'acoes_lead' : 'acoes_atendimento';
        Promise.all([
            configService.get('tipos_atendimento').catch(() => null),
            configService.get(chaveAcoes).catch(() => null),
            vendedorService.listar().catch(() => [])
        ]).then(([tiposData, acoesData, vendedoresData]) => {
            const finalTipos = Array.isArray(tiposData) && tiposData.length > 0 ? tiposData : TIPOS_PADRAO;
            setTipos(finalTipos);
            if (Array.isArray(acoesData) && acoesData.length > 0) {
                setAcoes(acoesData);
            }
            if (Array.isArray(vendedoresData)) {
                setVendedores(vendedoresData.filter(v => v.ativo));
            }
        });
    }, []);

    // Quando muda a próxima ação, auto-preenche responsável padrão
    useEffect(() => {
        if (form.proximaAcaoKey) {
            const acao = acoes.find(a => a.value === form.proximaAcaoKey);
            if (acao?.responsavelPadraoId) {
                setForm(f => ({ ...f, proximoResponsavelId: acao.responsavelPadraoId }));
            } else {
                setForm(f => ({ ...f, proximoResponsavelId: vendedorId }));
            }
        }
    }, [form.proximaAcaoKey, acoes, vendedorId]);

    const [isListening, setIsListening] = useState(false);
    const recognitionRef = React.useRef(null);
    const originalTextRef = React.useRef('');
    const stoppedRef = React.useRef(false);

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
        originalTextRef.current = form.observacao;

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
                return { ...f, observacao: (updatedBase + ' ' + interimTranscript).trim() };
            });

            if (finalTranscript !== '') {
                originalTextRef.current = (originalTextRef.current + ' ' + finalTranscript).replace(/\s+/g, ' ').trim();
            }
        };

        recognition.onerror = (event) => {
            if (event.error !== 'aborted') {
                toast.error('Grave de mais perto ou verifique sua conexão.');
                console.error('Speech recognition error', event.error);
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
        if (!form.proximaAcaoKey) {
            toast.error('Selecione a próxima ação.');
            return;
        }
        if (!form.dataVencimento) {
            toast.error('Informe a data da próxima ação.');
            return;
        }
        if (!form.proximoResponsavelId) {
            toast.error('Selecione o responsável pela próxima ação.');
            return;
        }
        // Validar data não passada
        const dv = new Date(form.dataVencimento);
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        if (dv < hoje) {
            toast.error('A data da próxima ação não pode ser passada.');
            return;
        }

        try {
            setSaving(true);
            const acaoRealizada = acoes.find(a => a.value === form.acaoAtendimento);
            const proximaAcao = acoes.find(a => a.value === form.proximaAcaoKey);

            await atendimentoService.registrar({
                tipo: form.tipoAtendimento,
                acaoKey: form.acaoAtendimento || null,
                acaoLabel: acaoRealizada?.label || null,
                observacao: form.observacao || null,
                etapaAnterior: isLead ? item.etapa : null,
                etapaNova: isLead && form.etapaNova !== item.etapa ? form.etapaNova : null,
                proximaVisita: form.dataVencimento || null,
                gpsVendedor: gps,
                leadId: isLead ? item.id : null,
                clienteId: !isLead ? item.UUID : null,
                idVendedor: vendedorId,
                // Campos da tarefa
                proximaAcaoKey: form.proximaAcaoKey,
                proximaAcaoLabel: proximaAcao?.label || form.proximaAcaoKey,
                proximoResponsavelId: form.proximoResponsavelId,
                dataVencimento: form.dataVencimento,
                tarefaResolvidaId: tarefaId || null
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
                <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
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
                            {tipos.map(t => (
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

                    {/* Ação Realizada */}
                    {acoes.length > 0 && (
                        <div>
                            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Ação Realizada</label>
                            <select
                                value={form.acaoAtendimento}
                                onChange={e => setForm(f => ({ ...f, acaoAtendimento: e.target.value }))}
                                className="block w-full border border-orange-300 rounded-lg p-3 bg-orange-50 text-gray-900 text-[14px] focus:ring-orange-500 focus:border-orange-500"
                            >
                                <option value="">Nenhuma ação</option>
                                {acoes.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                            </select>
                        </div>
                    )}

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

                    {/* Observação */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-[13px] font-semibold text-gray-700">Observação</label>
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
                        <textarea
                            value={form.observacao}
                            onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
                            rows={3}
                            placeholder={isListening ? 'Fale agora...' : 'O que aconteceu neste atendimento?'}
                            className={`block w-full border rounded-lg p-3 text-[14px] resize-none transition-colors ${isListening
                                ? 'border-red-400 bg-red-50/30 ring-1 ring-red-400'
                                : 'border-gray-300 bg-white focus:ring-blue-500 focus:border-blue-500'
                                }`}
                        />
                    </div>

                    {/* Separador — Próxima Ação */}
                    <div className="border-t border-emerald-200 pt-4 mt-2">
                        <div className="flex items-center gap-2 mb-3">
                            <ArrowRight className="h-4 w-4 text-emerald-600" />
                            <span className="text-[13px] font-bold text-emerald-700 uppercase tracking-wide">Próxima Ação *</span>
                        </div>

                        {/* Próxima Ação */}
                        <div className="mb-3">
                            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">O que fazer a seguir? *</label>
                            <select
                                value={form.proximaAcaoKey}
                                onChange={e => setForm(f => ({ ...f, proximaAcaoKey: e.target.value }))}
                                className="block w-full border border-emerald-300 rounded-lg p-3 bg-emerald-50 text-gray-900 text-[14px] focus:ring-emerald-500 focus:border-emerald-500"
                            >
                                <option value="">Selecione a próxima ação...</option>
                                {acoes.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                            </select>
                        </div>

                        {/* Responsável Próximo */}
                        <div className="mb-3">
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                                <label className="text-[13px] font-semibold text-gray-700">Responsável *</label>
                            </div>
                            <select
                                value={form.proximoResponsavelId}
                                onChange={e => setForm(f => ({ ...f, proximoResponsavelId: e.target.value }))}
                                className="block w-full border border-emerald-300 rounded-lg p-3 bg-emerald-50 text-gray-900 text-[14px] focus:ring-emerald-500 focus:border-emerald-500"
                            >
                                <option value="">Selecione o responsável...</option>
                                {vendedores.map(v => (
                                    <option key={v.id} value={v.id}>
                                        {v.nome} {v.id === vendedorId ? '(eu)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Data Vencimento */}
                        <div>
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <CalendarClock className="h-3.5 w-3.5 text-emerald-600" />
                                <label className="text-[13px] font-semibold text-gray-700">Quando? *</label>
                            </div>
                            <input
                                type="date"
                                min={new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })}
                                value={form.dataVencimento}
                                onChange={e => setForm(f => ({ ...f, dataVencimento: e.target.value }))}
                                className="block w-full border border-emerald-300 rounded-lg p-3 bg-emerald-50 text-gray-900 text-[14px] focus:ring-emerald-500 focus:border-emerald-500"
                            />
                        </div>
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
