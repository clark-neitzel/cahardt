import React, { useState, useEffect } from 'react';
import { X, Navigation, Loader, Mic, MicOff, ArrowRight, Calendar, Bell } from 'lucide-react';
import atendimentoService from '../../services/atendimentoService';
import configService from '../../services/configService';
import toast from 'react-hot-toast';

const TIPOS_PADRAO = [
    { value: 'VISITA', label: 'Visita Presencial' },
    { value: 'AMOSTRA', label: 'Amostra' },
    { value: 'LIGACAO', label: 'Ligação' },
    { value: 'WHATSAPP', label: 'WhatsApp' },
    { value: 'OUTROS', label: 'Outros' },
];

const ACOES_PADRAO_CLIENTE = [
    { value: 'ATENDIDO_SEM_PEDIDO', label: 'Atendido sem pedido' },
    { value: 'SEM_RESPOSTA', label: 'Sem resposta / Ausente' },
    { value: 'REAGENDADO', label: 'Reagendado' },
    { value: 'PENDENCIA', label: 'Pendencia / Problema' },
    { value: 'MANDA_WHATSAPP', label: 'Manda para WhatsApp' },
    { value: 'AGUARDO_RETORNO', label: 'Amostra pedido', abrePedidoAmostra: true },
    { value: 'ENVIAR_VENDEDOR', label: 'Enviar vendedor' },
];

const ACOES_PADRAO_LEAD = [
    { value: 'NOVO', label: 'Novo' },
    { value: 'VISITAR', label: 'Visitar' },
    { value: 'MANDAR_WHATSAPP', label: 'Mandar WhatsApp' },
    { value: 'LIGAR', label: 'Ligar' },
    { value: 'AGUARDO_RETORNO', label: 'Aguardo retorno' },
    { value: 'SEM_POTENCIAL', label: 'Sem potencial' },
];

const ETAPAS = ['NOVO', 'VISITA', 'PEDIDO', 'FINALIZADO'];

const ModalAtendimento = ({ dados, onClose, onSalvo, vendedorId, onAbrirAmostra }) => {
    const { tipo, item } = dados; // tipo: 'lead' | 'cliente'
    const isLead = tipo === 'lead';

    const [tipos, setTipos] = useState(TIPOS_PADRAO);
    const [acoes, setAcoes] = useState(isLead ? ACOES_PADRAO_LEAD : ACOES_PADRAO_CLIENTE);
    const [vendedores, setVendedores] = useState([]);
    const [form, setForm] = useState({
        tipoAtendimento: '',
        acaoAtendimento: '',
        observacao: '',
        etapaNova: isLead ? item.etapa : '',
        proximaVisita: '',
        dataRetorno: '',
        assuntoRetorno: '',
        transferirParaId: '',
    });
    const [gps, setGps] = useState(null);
    const [loadingGps, setLoadingGps] = useState(false);
    const [saving, setSaving] = useState(false);

    // Ação selecionada (objeto completo com configurações)
    const acaoSelecionada = acoes.find(a => a.value === form.acaoAtendimento) || null;

    // Carrega tipos, ações e vendedores
    useEffect(() => {
        const chaveAcoes = isLead ? 'acoes_lead' : 'acoes_atendimento';
        Promise.all([
            configService.get('tipos_atendimento').catch(() => null),
            configService.get(chaveAcoes).catch(() => null),
        ]).then(([tiposData, acoesData]) => {
            const finalTipos = Array.isArray(tiposData) && tiposData.length > 0 ? tiposData : TIPOS_PADRAO;
            setTipos(finalTipos);
            if (Array.isArray(acoesData) && acoesData.length > 0) {
                // Filtrar apenas ações ativas
                setAcoes(acoesData.filter(a => a.ativo !== false));
            }
        });
    }, []);

    // Speech recognition
    const [isListening, setIsListening] = useState(false);
    const [listeningField, setListeningField] = useState('observacao'); // 'observacao' | 'assuntoRetorno'
    const recognitionRef = React.useRef(null);
    const originalTextRef = React.useRef('');
    const stoppedRef = React.useRef(false);

    const toggleMicrophone = (field = 'observacao') => {
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

        setListeningField(field);
        const recognition = new SpeechRecognition();
        recognition.lang = 'pt-BR';
        recognition.continuous = true;
        recognition.interimResults = true;

        stoppedRef.current = false;
        originalTextRef.current = form[field];

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
                return { ...f, [field]: (updatedBase + ' ' + interimTranscript).trim() };
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
        try { recognition.start(); } catch (e) { console.error(e); }
    };

    // MicButton reutilizável
    const MicButton = ({ field }) => (
        <button
            type="button"
            onClick={() => toggleMicrophone(field)}
            className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors ${isListening && listeningField === field
                ? 'bg-red-50 text-red-600 border-red-200 animate-pulse'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
        >
            {isListening && listeningField === field ? (
                <><MicOff className="h-3 w-3" /> Ouvindo...</>
            ) : (
                <><Mic className="h-3 w-3" /> Ditar</>
            )}
        </button>
    );

    // GPS
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

    // Modo da transferência: fixo (tem responsável pré-definido) ou escolhe (vendedor decide)
    const modoTransferencia = acaoSelecionada?.transfereAtendimento
        ? (acaoSelecionada.modoTransferencia || (acaoSelecionada.responsavelTransferenciaId ? 'fixo' : 'escolhe'))
        : null;

    // ID efetivo do destinatário
    const transferidoParaIdEfetivo = modoTransferencia === 'fixo'
        ? acaoSelecionada?.responsavelTransferenciaId
        : form.transferirParaId || null;

    // Nome do responsável de transferência
    const nomeTransferencia = (() => {
        if (!acaoSelecionada?.transfereAtendimento) return null;
        if (modoTransferencia === 'fixo') {
            if (!acaoSelecionada?.responsavelTransferenciaId) return null;
            const v = vendedores.find(v => v.id === acaoSelecionada.responsavelTransferenciaId);
            return v?.nome || 'Vendedor não encontrado';
        }
        if (form.transferirParaId) {
            const v = vendedores.find(v => v.id === form.transferirParaId);
            return v?.nome || null;
        }
        return null;
    })();

    // Carregar vendedores se alguma ação usa transferência
    useEffect(() => {
        const temTransferencia = acoes.some(a => a.transfereAtendimento);
        if (temTransferencia && vendedores.length === 0) {
            import('../../services/api').then(({ default: api }) => {
                api.get('/vendedores').then(r => {
                    const list = Array.isArray(r.data) ? r.data : r.data?.vendedores || [];
                    setVendedores(list.filter(v => v.ativo !== false));
                }).catch(() => {});
            });
        }
    }, [acoes]);

    const handleSalvar = async () => {
        if (!form.tipoAtendimento) {
            toast.error('Selecione o tipo de atendimento.');
            return;
        }
        // Validações dinâmicas por ação
        if (acaoSelecionada?.obrigaObservacao && !form.observacao?.trim()) {
            toast.error('A observação é obrigatória para esta ação.');
            return;
        }
        // Transferência: obs obrigatória + destinatário obrigatório se modo 'escolhe'
        if (acaoSelecionada?.transfereAtendimento) {
            if (!form.observacao?.trim()) {
                toast.error('A observação é obrigatória ao transferir atendimento.');
                return;
            }
            if (modoTransferencia === 'escolhe' && !form.transferirParaId) {
                toast.error('Selecione para quem transferir o atendimento.');
                return;
            }
        }
        if (acaoSelecionada?.obrigaDataRetorno && !form.dataRetorno) {
            toast.error('A data de retorno é obrigatória para esta ação.');
            return;
        }
        if (form.dataRetorno) {
            const dr = new Date(form.dataRetorno);
            const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
            if (dr < hoje) {
                toast.error('A data de retorno não pode ser uma data passada.');
                return;
            }
        }
        if (form.proximaVisita) {
            const pv = new Date(form.proximaVisita);
            const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
            if (pv < hoje) {
                toast.error('A próxima visita não pode ser uma data passada.');
                return;
            }
        }

        // Se ação abre pedido de amostra, chama callback antes de salvar
        if (acaoSelecionada?.abrePedidoAmostra && onAbrirAmostra) {
            onAbrirAmostra({
                form,
                acaoSelecionada,
                gps,
                isLead,
                item,
                vendedorId,
                finalizarAtendimento: (amostraId) => salvarAtendimento(amostraId),
            });
            return;
        }

        await salvarAtendimento(null);
    };

    const salvarAtendimento = async (amostraId) => {
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
                idVendedor: vendedorId,
                // Campos novos
                acaoKey: acaoSelecionada?.value || null,
                acaoLabel: acaoSelecionada?.label || null,
                transferidoParaId: acaoSelecionada?.transfereAtendimento ? transferidoParaIdEfetivo : null,
                dataRetorno: form.dataRetorno || null,
                assuntoRetorno: form.assuntoRetorno || null,
                alertaVisualAtivo: !!acaoSelecionada?.criaAlertaVisual,
                alertaVisualCor: acaoSelecionada?.criaAlertaVisual ? acaoSelecionada?.cor : null,
                amostraId: amostraId || null,
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

                    {/* Ação do Atendimento */}
                    {acoes.length > 0 && (
                        <div>
                            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Ação do Atendimento</label>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setForm(f => ({ ...f, acaoAtendimento: '' }))}
                                    className={`px-3 py-1.5 rounded-full text-[13px] font-semibold border transition-colors ${!form.acaoAtendimento ? 'bg-gray-600 text-white border-gray-600' : 'bg-white text-gray-500 border-gray-300'}`}
                                >
                                    Nenhuma
                                </button>
                                {acoes.map(a => (
                                    <button
                                        key={a.value}
                                        onClick={() => setForm(f => ({ ...f, acaoAtendimento: a.value }))}
                                        className={`px-3 py-1.5 rounded-full text-[13px] font-semibold border transition-colors`}
                                        style={form.acaoAtendimento === a.value
                                            ? { backgroundColor: a.cor || '#2563eb', color: '#fff', borderColor: a.cor || '#2563eb' }
                                            : { borderColor: a.cor || '#d1d5db', color: a.cor || '#374151' }
                                        }
                                    >
                                        {a.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Campos dinâmicos baseados na ação selecionada ── */}

                    {/* Transferência */}
                    {acaoSelecionada?.transfereAtendimento && modoTransferencia === 'fixo' && nomeTransferencia && (
                        <div className="flex items-center gap-2 text-[12px] rounded-lg px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200">
                            <ArrowRight className="h-3.5 w-3.5" />
                            <span className="font-semibold">Transferido para:</span> {nomeTransferencia}
                        </div>
                    )}
                    {acaoSelecionada?.transfereAtendimento && modoTransferencia === 'escolhe' && (
                        <div>
                            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
                                <ArrowRight className="h-3.5 w-3.5 inline mr-1" />
                                Transferir para *
                            </label>
                            <select
                                value={form.transferirParaId}
                                onChange={e => setForm(f => ({ ...f, transferirParaId: e.target.value }))}
                                className={`block w-full border rounded-lg p-3 bg-white text-gray-900 text-[14px] focus:ring-blue-500 focus:border-blue-500 ${!form.transferirParaId ? 'border-red-300' : 'border-gray-300'}`}
                            >
                                <option value="">Selecione o vendedor...</option>
                                {vendedores.filter(v => v.id !== vendedorId).map(v => (
                                    <option key={v.id} value={v.id}>{v.nome}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Alerta visual info */}
                    {acaoSelecionada?.criaAlertaVisual && (
                        <div className="flex items-center gap-2 text-[12px] rounded-lg px-3 py-2 border"
                            style={{ backgroundColor: (acaoSelecionada.cor || '#ef4444') + '15', borderColor: acaoSelecionada.cor || '#ef4444', color: acaoSelecionada.cor || '#ef4444' }}>
                            <Bell className="h-3.5 w-3.5" />
                            Alerta visual será criado para este atendimento
                        </div>
                    )}

                    {/* Data de Retorno */}
                    {acaoSelecionada?.permiteDataRetorno && (
                        <div>
                            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
                                <Calendar className="h-3.5 w-3.5 inline mr-1" />
                                Data de Retorno {acaoSelecionada.obrigaDataRetorno ? '*' : '(opcional)'}
                            </label>
                            <input
                                type="date"
                                min={new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })}
                                value={form.dataRetorno}
                                onChange={e => setForm(f => ({ ...f, dataRetorno: e.target.value }))}
                                className={`block w-full border rounded-lg p-3 bg-white text-gray-900 text-[14px] focus:ring-blue-500 focus:border-blue-500 ${acaoSelecionada.obrigaDataRetorno && !form.dataRetorno ? 'border-red-300' : 'border-gray-300'}`}
                            />
                        </div>
                    )}

                    {/* Assunto do Retorno */}
                    {acaoSelecionada?.permiteAssuntoRetorno && (
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label className="block text-[13px] font-semibold text-gray-700">Assunto do Retorno</label>
                                <MicButton field="assuntoRetorno" />
                            </div>
                            <input
                                type="text"
                                value={form.assuntoRetorno}
                                onChange={e => setForm(f => ({ ...f, assuntoRetorno: e.target.value }))}
                                placeholder="Sobre o que tratar no retorno..."
                                className={`block w-full border rounded-lg p-3 text-[14px] transition-colors ${isListening && listeningField === 'assuntoRetorno'
                                    ? 'border-red-400 bg-red-50/30 ring-1 ring-red-400'
                                    : 'border-gray-300 bg-white focus:ring-blue-500 focus:border-blue-500'
                                    }`}
                            />
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

                    {/* Próxima Visita */}
                    <div>
                        <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Próxima Visita (opcional)</label>
                        <input
                            type="date"
                            min={new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })}
                            value={form.proximaVisita}
                            onChange={e => setForm(f => ({ ...f, proximaVisita: e.target.value }))}
                            className="block w-full border border-gray-300 rounded-lg p-3 bg-white text-gray-900 text-[14px] focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    {/* Observação */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-[13px] font-semibold text-gray-700">
                                Observação {acaoSelecionada?.obrigaObservacao ? '*' : ''}
                            </label>
                            <MicButton field="observacao" />
                        </div>
                        <textarea
                            value={form.observacao}
                            onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
                            rows={3}
                            placeholder={isListening && listeningField === 'observacao' ? 'Fale agora...' : 'O que aconteceu neste atendimento?'}
                            className={`block w-full border rounded-lg p-3 text-[14px] resize-none transition-colors ${isListening && listeningField === 'observacao'
                                ? 'border-red-400 bg-red-50/30 ring-1 ring-red-400'
                                : acaoSelecionada?.obrigaObservacao && !form.observacao?.trim()
                                    ? 'border-red-300 bg-white focus:ring-red-500 focus:border-red-500'
                                    : 'border-gray-300 bg-white focus:ring-blue-500 focus:border-blue-500'
                                }`}
                        />
                    </div>

                    {/* Botão */}
                    <button
                        onClick={handleSalvar}
                        disabled={saving}
                        className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl text-[15px] flex items-center justify-center gap-2 mt-2 disabled:opacity-70"
                    >
                        {saving ? <Loader className="h-5 w-5 animate-spin" /> : null}
                        {saving ? 'Salvando...' : acaoSelecionada?.abrePedidoAmostra ? 'Prosseguir para Amostra' : 'Confirmar Atendimento'}
                    </button>

                    <div className="h-4" />
                </div>
            </div>
        </div>
    );
};

export default ModalAtendimento;
