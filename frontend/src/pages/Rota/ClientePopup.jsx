import React, { useState, useEffect, useRef } from 'react';
import {
    X, MapPin, Navigation, Phone, Mail, Package,
    Calendar, DollarSign, User, FileText, Save,
    Loader, CheckCircle, ExternalLink, AlertCircle
} from 'lucide-react';
import clienteService from '../../services/clienteService';
import toast from 'react-hot-toast';

const formatDoc = (doc) => {
    if (!doc) return null;
    const d = doc.replace(/\D/g, '');
    if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    return doc;
};

const DataRow = ({ label, value, icon: Icon }) => {
    if (!value) return null;
    return (
        <div className="flex items-start gap-2 py-2 border-b border-gray-50 last:border-0">
            {Icon && <Icon className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />}
            <div className="min-w-0 flex-1">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{label}</p>
                <p className="text-[13px] text-gray-800 font-medium break-words">{value}</p>
            </div>
        </div>
    );
};

const ClientePopup = ({ cliente, onClose, onAtualizado }) => {
    const isLead = !!(cliente?.nomeEstabelecimento); // distingue Lead de Cliente
    const nome = isLead ? cliente.nomeEstabelecimento : (cliente.Nome || '');
    const fantasia = isLead ? null : cliente.NomeFantasia;
    const doc = !isLead ? formatDoc(cliente.Documento) : null;
    const tipoPessoa = !isLead ? cliente.Tipo_Pessoa : null;

    const [gpsInput, setGpsInput] = useState(
        (isLead ? cliente.pontoGps : cliente.Ponto_GPS) || ''
    );
    const [capturando, setCapturando] = useState(false);
    const [salvandoGps, setSalvandoGps] = useState(false);
    const [gpsSalvo, setGpsSalvo] = useState(false);

    const capturarGpsAtual = () => {
        if (!navigator.geolocation) {
            toast.error('GPS não disponível neste dispositivo.');
            return;
        }
        setCapturando(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const coords = `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`;
                setGpsInput(coords);
                setCapturando(false);
                toast.success('Localização capturada!');
            },
            () => {
                setCapturando(false);
                toast.error('Não foi possível capturar o GPS. Verifique as permissões.');
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    const salvarGps = async () => {
        if (!gpsInput.trim()) return;
        try {
            setSalvandoGps(true);
            if (isLead) {
                const leadService = (await import('../../services/leadService')).default;
                await leadService.atualizar(cliente.id, { pontoGps: gpsInput.trim() });
            } else {
                await clienteService.atualizar(cliente.UUID, { Ponto_GPS: gpsInput.trim() });
            }
            setGpsSalvo(true);
            toast.success('Localização salva com sucesso!');
            if (onAtualizado) onAtualizado({ ...cliente, Ponto_GPS: gpsInput.trim(), pontoGps: gpsInput.trim() });
            setTimeout(() => setGpsSalvo(false), 3000);
        } catch {
            toast.error('Erro ao salvar localização.');
        } finally {
            setSalvandoGps(false);
        }
    };

    const abrirMapa = () => {
        const gps = gpsInput || (isLead ? cliente.pontoGps : cliente.Ponto_GPS);
        if (!gps) return;
        const [lat, lng] = gps.split(',');
        window.open(`https://maps.google.com/?q=${lat},${lng}`, '_blank');
    };

    // Endereço formatado  
    const endereco = !isLead ? [
        cliente.End_Logradouro,
        cliente.End_Numero,
        cliente.End_Complemento
    ].filter(Boolean).join(', ') : null;
    const cidadeEstado = !isLead ? [cliente.End_Cidade, cliente.End_Estado].filter(Boolean).join(' - ') : null;

    return (
        <div className="fixed inset-0 z-[80] flex">
            {/* Overlay */}
            <div className="flex-1 bg-black/40" onClick={onClose} />

            {/* Drawer */}
            <div className="w-full max-w-sm h-full bg-white shadow-2xl flex flex-col overflow-hidden animate-slide-left">

                {/* Header com nome */}
                <div className="bg-gray-900 text-white px-4 pt-5 pb-4 shrink-0">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            {/* Razão Social */}
                            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">
                                {isLead ? 'Lead' : (tipoPessoa === 'F' ? 'Pessoa Física' : 'Razão Social')}
                            </p>
                            <h2 className="text-[15px] font-bold text-white leading-tight break-words">{nome}</h2>

                            {/* Nome Fantasia */}
                            {fantasia && fantasia !== nome && (
                                <p className="text-[12px] text-blue-300 mt-1 font-semibold">
                                    Fantasia: <span className="text-white">{fantasia}</span>
                                </p>
                            )}

                            {/* CNPJ/CPF */}
                            {doc && (
                                <p className="text-[11px] text-gray-400 mt-1.5">
                                    {tipoPessoa === 'F' ? 'CPF' : 'CNPJ'}: <span className="font-mono text-gray-300">{doc}</span>
                                </p>
                            )}
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-white p-1.5 -mr-1 mt-0.5">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Conteúdo scrollável */}
                <div className="flex-1 overflow-y-auto">

                    {/* ── Contato ── */}
                    <div className="px-4 pt-4 pb-2">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Contato</p>
                        <div className="space-y-0">
                            <DataRow label="Telefone" value={isLead ? cliente.whatsapp : cliente.Telefone} icon={Phone} />
                            <DataRow label="Celular" value={!isLead ? cliente.Telefone_Celular : null} icon={Phone} />
                            <DataRow label="WhatsApp" value={!isLead ? cliente.Telefone_Celular || cliente.Telefone : null} icon={Phone} />
                            <DataRow label="E-mail" value={!isLead ? cliente.Email : cliente.contato} icon={Mail} />
                        </div>
                    </div>

                    {/* ── Endereço (só clientes) ── */}
                    {!isLead && (endereco || cidadeEstado) && (
                        <div className="px-4 pt-3 pb-2 border-t border-gray-100">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Endereço</p>
                            {endereco && <p className="text-[13px] text-gray-800 font-medium">{endereco}</p>}
                            {cliente.End_Bairro && <p className="text-[12px] text-gray-500">{cliente.End_Bairro}</p>}
                            {cidadeEstado && <p className="text-[12px] text-gray-500">{cidadeEstado}{cliente.End_CEP ? ` · CEP ${cliente.End_CEP}` : ''}</p>}
                        </div>
                    )}

                    {/* ── Configurações de Venda ── */}
                    {!isLead && (
                        <div className="px-4 pt-3 pb-2 border-t border-gray-100">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Atendimento & Entregas</p>
                            <DataRow label="Dia(s) de Venda" value={cliente.Dia_de_venda} icon={Calendar} />
                            <DataRow label="Horário Atendimento" value={cliente.Horario_Atendimento} icon={Calendar} />
                            <DataRow label="Dia(s) de Entrega" value={cliente.Dia_de_entrega} icon={Package} />
                            <DataRow label="Horário Entrega" value={cliente.Horario_Entrega} icon={Package} />
                            <DataRow label="Condição de Pagamento" value={cliente.Condicao_de_pagamento} icon={DollarSign} />
                        </div>
                    )}

                    {/* ── Lead info ── */}
                    {isLead && (
                        <div className="px-4 pt-3 pb-2 border-t border-gray-100">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Visita</p>
                            <DataRow label="Dias de Visita" value={cliente.diasVisita} icon={Calendar} />
                            <DataRow label="Horário" value={cliente.horarioAtendimento} icon={Calendar} />
                            <DataRow label="Próxima Visita" value={cliente.proximaVisita ? new Date(cliente.proximaVisita).toLocaleDateString('pt-BR') : null} icon={Calendar} />
                            <DataRow label="Etapa" value={cliente.etapa} icon={User} />
                        </div>
                    )}

                    {/* ── GPS / Localização ── */}
                    <div className="px-4 pt-3 pb-4 border-t border-gray-100">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">📍 Localização GPS</p>

                        <div className="space-y-2">
                            {/* Input de coordenadas */}
                            <div className="relative">
                                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <input
                                    type="text"
                                    value={gpsInput}
                                    onChange={e => setGpsInput(e.target.value)}
                                    placeholder="-26.123456,-48.912345"
                                    className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-[12px] font-mono focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none"
                                />
                            </div>

                            {/* Botões de ação */}
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={capturarGpsAtual}
                                    disabled={capturando}
                                    className="flex items-center justify-center gap-1.5 py-2 text-[12px] font-semibold text-blue-600 border border-blue-200 rounded-lg bg-blue-50 hover:bg-blue-100 disabled:opacity-50 transition-colors"
                                >
                                    {capturando ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
                                    {capturando ? 'Capturando...' : 'Minha localização'}
                                </button>

                                {gpsInput && (
                                    <button
                                        onClick={abrirMapa}
                                        className="flex items-center justify-center gap-1.5 py-2 text-[12px] font-semibold text-gray-600 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                                    >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                        Ver no Mapa
                                    </button>
                                )}
                            </div>

                            {/* Salvar GPS */}
                            <button
                                onClick={salvarGps}
                                disabled={salvandoGps || !gpsInput.trim()}
                                className={`w-full py-2.5 text-[13px] font-bold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${gpsSalvo ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                            >
                                {salvandoGps ? (
                                    <><Loader className="h-4 w-4 animate-spin" /> Salvando...</>
                                ) : gpsSalvo ? (
                                    <><CheckCircle className="h-4 w-4" /> Localização Salva!</>
                                ) : (
                                    <><Save className="h-4 w-4" /> Salvar Localização</>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* ── Observações ── */}
                    {(cliente.Observacoes_Gerais || cliente.observacoes) && (
                        <div className="px-4 pt-3 pb-4 border-t border-gray-100">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Observações</p>
                            <p className="text-[12px] text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 border border-gray-100">
                                {cliente.Observacoes_Gerais || cliente.observacoes}
                            </p>
                        </div>
                    )}

                    {/* ── Situação Serasa ── */}
                    {cliente.Situacao_serasa && (
                        <div className="px-4 pt-3 pb-4 border-t border-gray-100">
                            <div className={`flex items-center gap-2 p-3 rounded-lg ${cliente.Situacao_serasa === 'REGULAR' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                {cliente.Situacao_serasa === 'REGULAR' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wide">Situação Serasa</p>
                                    <p className="text-[13px] font-semibold">{cliente.Situacao_serasa}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="h-6" />
                </div>
            </div>
        </div>
    );
};

export default ClientePopup;
