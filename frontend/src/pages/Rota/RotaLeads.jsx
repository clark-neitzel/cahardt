import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    MapPin, Phone, MessageCircle, User, Plus, ChevronRight,
    Clock, Calendar, Tag, CheckCircle, ClipboardList, Star,
    Package, X, Navigation, Loader, Search, Truck, Edit3,
    DollarSign, Trash2, Save, ChevronDown, ChevronUp, Route, Bell,
    ArrowLeftRight, Check
} from 'lucide-react';
import { Link } from 'react-router-dom';
import leadService from '../../services/leadService';
import clienteService from '../../services/clienteService';
import atendimentoService from '../../services/atendimentoService';
import entregasService from '../../services/entregasService';
import formasPagamentoService from '../../services/formasPagamentoService';
import tabelaPrecoService from '../../services/tabelaPrecoService';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import ModalAtendimento from './ModalAtendimento';
import ModalAmostra from '../Pedidos/ModalAmostra';
import ModalNovoLead from './ModalNovoLead';
import CheckoutEntregaModal from '../Motorista/Entregas/CheckoutEntregaModal';
import ClientePopup from './ClientePopup';
import roteirizacaoService from '../../services/roteirizacaoService';

const DIAS_SIGLA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'N/D'];
const ETAPA_COLORS = {
    NOVO: 'bg-blue-100 text-blue-700',
    AMOSTRA: 'bg-yellow-100 text-yellow-800',
    VISITA: 'bg-purple-100 text-purple-700',
    PEDIDO: 'bg-green-100 text-green-700',
    FINALIZADO: 'bg-gray-100 text-gray-500',
};

// Retorna o índice do dia "base" (seg-sex = hoje, sáb/dom = seg)
const getDiaBase = () => {
    const d = new Date().getDay(); // 0=dom, 6=sáb
    if (d === 0 || d === 6) return 1; // segunda
    return d;
};

const getDiaSigla = (idx) => DIAS_SIGLA[idx];

const itemTemDiaBase = (diasStr) => {
    if (!diasStr) return false;
    const arrayDias = diasStr.toUpperCase().split(',').map(d => d.trim());
    
    const d = new Date().getDay(); // 0=dom, 6=sáb
    const base = getDiaSigla(d === 0 || d === 6 ? 1 : d);
    const diaReal = getDiaSigla(d);
    
    return arrayDias.includes(base) || arrayDias.includes(diaReal);
};

const itemTemND = (diasStr) => {
    if (!diasStr) return false;
    return diasStr.toUpperCase().split(',').map(d => d.trim()).includes('N/D');
};

const getAtendimentoHoje = (atendimentos) => {
    if (!atendimentos || atendimentos.length === 0) return null;
    const hoje = new Date().toDateString();
    return atendimentos.find(a => new Date(a.criadoEm).toDateString() === hoje);
};

const getPedidoHoje = (pedidos) => {
    if (!pedidos || pedidos.length === 0) return null;
    const hoje = new Date().toDateString();
    return pedidos.find(p => p.createdAt && new Date(p.createdAt).toDateString() === hoje);
};

const isAtendidoHoje = (item) => {
    return !!getAtendimentoHoje(item._atendimentos || item.atendimentos) || !!getPedidoHoje(item._pedidos || item.pedidos);
};

const isProximaVisitaHoje = (proximaVisita) => {
    if (!proximaVisita) return false;
    return new Date(proximaVisita).toDateString() === new Date().toDateString();
};

const abrirMapa = (gps) => {
    if (!gps) return;
    const [lat, lng] = gps.split(',');
    window.open(`https://maps.google.com/?q=${lat},${lng}`, '_blank');
};

// ================================================
// Card de Cliente
// ================================================
const CardCliente = ({ cliente, onAtendimento, onNovoPedido, onVerCliente, mostrarAcoes = true, podeEscolherVendedor = false, alerta, onAlertaVisto, onFinalizarTransferencia, onTransferenciaVista }) => {
    const atendHoje = getAtendimentoHoje(cliente._atendimentos);
    const doDia = itemTemDiaBase(cliente.Dia_de_venda); // Cliente do dia
    const vendedorNome = cliente.vendedor?.nome || cliente.Vendedor?.nome;

    return (
        <div
            className={`bg-white rounded-xl border shadow-sm overflow-hidden mb-3 ${alerta?.isHoje ? 'ring-2 animate-pulse-border' : doDia ? 'border-green-500/50 ring-1 ring-green-500/20' : 'border-gray-200'}`}
            style={alerta?.isHoje ? { borderColor: alerta.cor, '--alerta-cor': alerta.cor } : undefined}
        >
            <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-wide">Cliente</span>
                            {atendHoje && (
                                <span className="text-[11px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded flex items-center gap-0.5" title={(atendHoje.usuario?.nome || atendHoje.vendedor?.nome) ? `Atendido por ${atendHoje.usuario?.nome || atendHoje.vendedor?.nome}` : ''}>
                                    <CheckCircle className="h-3 w-3" /> Atendido {(atendHoje.usuario?.nome || atendHoje.vendedor?.nome) && `por ${(atendHoje.usuario?.nome || atendHoje.vendedor?.nome).split(' ')[0]}`}
                                </span>
                            )}
                            {!atendHoje && getPedidoHoje(cliente._pedidos) && (
                                <span className="text-[11px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded flex items-center gap-0.5" title={(getPedidoHoje(cliente._pedidos).usuarioLancamento?.nome || getPedidoHoje(cliente._pedidos).vendedor?.nome) ? `Pedido por ${getPedidoHoje(cliente._pedidos).usuarioLancamento?.nome || getPedidoHoje(cliente._pedidos).vendedor?.nome}` : ''}>
                                    <CheckCircle className="h-3 w-3" /> Com Pedido {(getPedidoHoje(cliente._pedidos).usuarioLancamento?.nome || getPedidoHoje(cliente._pedidos).vendedor?.nome) && `por ${(getPedidoHoje(cliente._pedidos).usuarioLancamento?.nome || getPedidoHoje(cliente._pedidos).vendedor?.nome).split(' ')[0]}`}
                                </span>
                            )}
                        </div>
                        {/* Nome clicável */}
                        {podeEscolherVendedor && vendedorNome && (
                            <div className="mb-0.5 mt-0.5 inline-flex items-center gap-0.5 text-[9px] text-purple-600 bg-purple-50 px-1 py-0.5 rounded font-semibold">
                                <User className="h-2 w-2" /> {vendedorNome.split(' ')[0]}
                            </div>
                        )}
                        <button
                            onClick={() => onVerCliente(cliente)}
                            className="text-left font-bold text-[14px] leading-tight text-gray-900 truncate w-full hover:text-blue-700 transition-colors"
                        >
                            {cliente.NomeFantasia || cliente.Nome}
                        </button>
                        {cliente.End_Cidade && <p className="text-[11px] text-gray-500 mt-0.5">{cliente.End_Cidade}</p>}
                    </div>
                    {cliente.Ponto_GPS && (
                        <button onClick={() => abrirMapa(cliente.Ponto_GPS)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded shrink-0">
                            <MapPin className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>

                {/* Informações de atendimento */}
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                    {cliente.Dia_de_venda && (
                        <span className="text-[12px] text-gray-600 flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-gray-400" />
                            {cliente.Dia_de_venda}
                            {cliente.Horario_Atendimento && ` · ${cliente.Horario_Atendimento}`}
                        </span>
                    )}
                    {cliente.Dia_de_entrega && (
                        <span className="text-[12px] text-gray-600 flex items-center gap-1">
                            <Package className="h-3 w-3 text-gray-400" />
                            Entrega: {cliente.Dia_de_entrega}
                            {cliente.Horario_Entrega && ` · ${cliente.Horario_Entrega}`}
                        </span>
                    )}
                </div>

                {/* Canais de atendimento */}
                {cliente.Formas_Atendimento?.length > 0 && (
                    <div className="flex gap-1.5 mt-2">
                        {cliente.Formas_Atendimento.some(f => f.toUpperCase() === 'PRESENCIAL') && <span className="text-[11px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5"><User className="h-3 w-3" />Presencial</span>}
                        {cliente.Formas_Atendimento.some(f => f.toUpperCase() === 'WHATSAPP') && <span className="text-[11px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />WhatsApp</span>}
                        {cliente.Formas_Atendimento.some(f => f.toUpperCase() === 'TELEFONE') && <span className="text-[11px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5"><Phone className="h-3 w-3" />Telefone</span>}
                    </div>
                )}

                {/* Alerta visual */}
                {alerta?.cor && !alerta.isTransferenciaAtiva && !alerta.isTransferenciaResolvida && (
                    <button
                        onClick={() => onAlertaVisto && onAlertaVisto(alerta.atendimentoId)}
                        className="mt-2 w-full text-left rounded-lg px-3 py-2 border text-[12px] flex items-center gap-2"
                        style={{ backgroundColor: alerta.cor + '15', borderColor: alerta.cor, color: alerta.cor }}
                    >
                        <Bell className="h-3.5 w-3.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                            {alerta.acaoLabel && <span className="font-bold">{alerta.acaoLabel}</span>}
                            {alerta.assuntoRetorno && <span className="ml-1">· {alerta.assuntoRetorno}</span>}
                            {alerta.dataRetorno && <span className="ml-1 text-[11px] opacity-75">({new Date(alerta.dataRetorno).toLocaleDateString('pt-BR')})</span>}
                        </div>
                        <span className="text-[10px] font-bold opacity-60 shrink-0">Marcar visto</span>
                    </button>
                )}

                {/* Transferência ativa (eu sou o receptor) */}
                {alerta?.isTransferenciaAtiva && (
                    <div className="mt-2 rounded-lg border-2 border-indigo-300 bg-indigo-50 p-3 space-y-2">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-700">
                            <ArrowLeftRight className="h-3.5 w-3.5" />
                            Transferido por {alerta.transferenciaDeNome?.split(' ')[0] || '?'}
                            {alerta.transferenciaAcaoLabel && <span className="font-normal ml-1">· {alerta.transferenciaAcaoLabel}</span>}
                        </div>
                        {alerta.transferenciaObs && (
                            <p className="text-[12px] text-indigo-900 bg-white/60 rounded px-2 py-1.5 border border-indigo-200">{alerta.transferenciaObs}</p>
                        )}
                        <button
                            onClick={() => onFinalizarTransferencia && onFinalizarTransferencia(alerta.transferenciaAtendimentoId)}
                            className="w-full text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded py-1.5 flex items-center justify-center gap-1 transition-colors"
                        >
                            <Check className="h-3.5 w-3.5" /> Finalizar Transferência
                        </button>
                    </div>
                )}

                {/* Transferência resolvida (eu sou o remetente) */}
                {alerta?.isTransferenciaResolvida && (
                    <button
                        onClick={() => onTransferenciaVista && onTransferenciaVista(alerta.transferenciaResolvidaId)}
                        className="mt-2 w-full text-left rounded-lg px-3 py-2 border-2 border-green-300 bg-green-50 text-[12px] text-green-700 flex items-center gap-2"
                    >
                        <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-600" />
                        <div className="flex-1 min-w-0">
                            <span className="font-bold">Transferência resolvida</span>
                            {alerta.transferenciaResolvidaPorNome && <span className="ml-1">por {alerta.transferenciaResolvidaPorNome.split(' ')[0]}</span>}
                            {alerta.transferenciaResolvidaEm && <span className="ml-1 text-[11px] opacity-75">({new Date(alerta.transferenciaResolvidaEm).toLocaleDateString('pt-BR')})</span>}
                        </div>
                        <span className="text-[10px] font-bold opacity-60 shrink-0">Dispensar</span>
                    </button>
                )}

                {/* Exibir observação se já atendido */}
                {atendHoje?.observacao && (
                    <div className="mt-2 bg-gray-50 border border-gray-100 rounded p-2">
                        <p className="text-[11px] font-semibold text-gray-700 mb-0.5 flex items-center gap-1">
                            <ClipboardList className="h-3 w-3" />
                            Obs. Atendimento
                        </p>
                        <p className="text-[12px] text-gray-600 line-clamp-2">{atendHoje.observacao}</p>
                    </div>
                )}

                {/* Ações */}
                <div className="flex gap-1.5 mt-2 pt-2 border-t border-gray-100">
                    {mostrarAcoes && (
                        <button
                            onClick={() => onAtendimento({ tipo: 'cliente', item: cliente })}
                            className="flex-1 bg-blue-600 text-white text-[12px] font-semibold py-1.5 rounded flex items-center justify-center gap-1 active:opacity-80"
                        >
                            <ClipboardList className="h-3.5 w-3.5" /> Atender
                        </button>
                    )}
                    <button
                        onClick={() => onNovoPedido(cliente.UUID)}
                        className={`${mostrarAcoes ? 'bg-gray-100 text-gray-700 w-auto' : 'bg-gray-100 text-gray-700 w-full justify-center'} text-[12px] font-semibold px-2 cursor-pointer py-1.5 rounded flex items-center gap-1 active:opacity-80 hover:bg-gray-200 transition-colors`}
                    >
                        <Package className="h-3.5 w-3.5" /> Pedido
                    </button>
                </div>
            </div>
        </div>
    );
};

// ================================================
// Card de Lead
// ================================================
const CardLead = ({ lead, onAtendimento, onVerCliente, mostrarAcoes = true, podeEscolherVendedor = false, alerta, onAlertaVisto, onFinalizarTransferencia, onTransferenciaVista }) => {
    const atendHoje = getAtendimentoHoje(lead.atendimentos);
    const proxHoje = isProximaVisitaHoje(lead.proximaVisita);
    const vendedorNome = lead.vendedor?.nome;

    // Prospectos/Leads ficam com destaque laranja
    return (
        <div
            className={`bg-white rounded-xl border shadow-sm overflow-hidden mb-3 ${alerta?.isHoje ? 'ring-2 animate-pulse-border' : 'border-orange-400/50 ring-1 ring-orange-500/20'}`}
            style={alerta?.isHoje ? { borderColor: alerta.cor, '--alerta-cor': alerta.cor } : undefined}
        >
            <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[11px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded uppercase tracking-wide">Lead #{lead.numero || '?'}</span>
                            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${ETAPA_COLORS[lead.etapa] || 'bg-gray-100 text-gray-600'}`}>{lead.etapa}</span>
                            {atendHoje && (
                                <span className="text-[11px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded flex items-center gap-0.5" title={(atendHoje.usuario?.nome || atendHoje.vendedor?.nome) ? `Atendido por ${atendHoje.usuario?.nome || atendHoje.vendedor?.nome}` : ''}>
                                    <CheckCircle className="h-3 w-3" /> Atendido {(atendHoje.usuario?.nome || atendHoje.vendedor?.nome) && `por ${(atendHoje.usuario?.nome || atendHoje.vendedor?.nome).split(' ')[0]}`}
                                </span>
                            )}
                            {proxHoje && !atendHoje && <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded flex items-center gap-0.5"><Star className="h-3 w-3" /> Visita Hoje!</span>}
                            {!atendHoje && getPedidoHoje(lead._pedidos || lead.pedidos) && (
                                <span className="text-[11px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded flex items-center gap-0.5" title={(getPedidoHoje(lead._pedidos || lead.pedidos).usuarioLancamento?.nome || getPedidoHoje(lead._pedidos || lead.pedidos).vendedor?.nome) ? `Pedido por ${getPedidoHoje(lead._pedidos || lead.pedidos).usuarioLancamento?.nome || getPedidoHoje(lead._pedidos || lead.pedidos).vendedor?.nome}` : ''}>
                                    <CheckCircle className="h-3 w-3" /> Com Pedido {(getPedidoHoje(lead._pedidos || lead.pedidos).usuarioLancamento?.nome || getPedidoHoje(lead._pedidos || lead.pedidos).vendedor?.nome) && `por ${(getPedidoHoje(lead._pedidos || lead.pedidos).usuarioLancamento?.nome || getPedidoHoje(lead._pedidos || lead.pedidos).vendedor?.nome).split(' ')[0]}`}
                                </span>
                            )}
                        </div>
                        {/* Nome do lead clicável */}
                        {podeEscolherVendedor && vendedorNome && (
                            <div className="mb-0.5 mt-0.5 inline-flex items-center gap-0.5 text-[9px] text-purple-600 bg-purple-50 px-1 py-0.5 rounded font-semibold">
                                <User className="h-2 w-2" /> {vendedorNome.split(' ')[0]}
                            </div>
                        )}
                        <button
                            onClick={() => onVerCliente(lead)}
                            className="text-left font-bold text-[14px] leading-tight text-gray-900 truncate w-full hover:text-orange-600 transition-colors"
                        >
                            {lead.nomeEstabelecimento}
                        </button>
                        {lead.contato && <p className="text-[11px] text-gray-500 mt-0.5">{lead.contato}</p>}
                    </div>
                    {lead.pontoGps && (
                        <button onClick={() => abrirMapa(lead.pontoGps)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded shrink-0">
                            <MapPin className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>

                {lead.diasVisita && (
                    <div className="flex items-center gap-1 mt-2">
                        <Calendar className="h-3 w-3 text-gray-400" />
                        <span className="text-[12px] text-gray-600">{lead.diasVisita}
                            {lead.horarioAtendimento && ` · ${lead.horarioAtendimento}`}
                        </span>
                    </div>
                )}

                {lead.proximaVisita && (
                    <div className={`mt-2 inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded ${proxHoje ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600'}`}>
                        <Clock className="h-3 w-3" />
                        Próx. visita: {new Date(lead.proximaVisita).toLocaleDateString('pt-BR')}
                    </div>
                )}

                {lead.formasAtendimento?.length > 0 && (
                    <div className="flex gap-1.5 mt-2">
                        {lead.formasAtendimento.includes('PRESENCIAL') && <span className="text-[11px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5"><User className="h-3 w-3" />Presencial</span>}
                        {lead.formasAtendimento.includes('WHATSAPP') && <span className="text-[11px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />WhatsApp</span>}
                        {lead.formasAtendimento.includes('TELEFONE') && <span className="text-[11px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5"><Phone className="h-3 w-3" />Telefone</span>}
                    </div>
                )}

                {/* Alerta visual */}
                {alerta?.cor && !alerta.isTransferenciaAtiva && !alerta.isTransferenciaResolvida && (
                    <button
                        onClick={() => onAlertaVisto && onAlertaVisto(alerta.atendimentoId)}
                        className="mt-2 w-full text-left rounded-lg px-3 py-2 border text-[12px] flex items-center gap-2"
                        style={{ backgroundColor: alerta.cor + '15', borderColor: alerta.cor, color: alerta.cor }}
                    >
                        <Bell className="h-3.5 w-3.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                            {alerta.acaoLabel && <span className="font-bold">{alerta.acaoLabel}</span>}
                            {alerta.assuntoRetorno && <span className="ml-1">· {alerta.assuntoRetorno}</span>}
                            {alerta.dataRetorno && <span className="ml-1 text-[11px] opacity-75">({new Date(alerta.dataRetorno).toLocaleDateString('pt-BR')})</span>}
                        </div>
                        <span className="text-[10px] font-bold opacity-60 shrink-0">Marcar visto</span>
                    </button>
                )}

                {/* Transferência ativa (eu sou o receptor) */}
                {alerta?.isTransferenciaAtiva && (
                    <div className="mt-2 rounded-lg border-2 border-indigo-300 bg-indigo-50 p-3 space-y-2">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-700">
                            <ArrowLeftRight className="h-3.5 w-3.5" />
                            Transferido por {alerta.transferenciaDeNome?.split(' ')[0] || '?'}
                            {alerta.transferenciaAcaoLabel && <span className="font-normal ml-1">· {alerta.transferenciaAcaoLabel}</span>}
                        </div>
                        {alerta.transferenciaObs && (
                            <p className="text-[12px] text-indigo-900 bg-white/60 rounded px-2 py-1.5 border border-indigo-200">{alerta.transferenciaObs}</p>
                        )}
                        <button
                            onClick={() => onFinalizarTransferencia && onFinalizarTransferencia(alerta.transferenciaAtendimentoId)}
                            className="w-full text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded py-1.5 flex items-center justify-center gap-1 transition-colors"
                        >
                            <Check className="h-3.5 w-3.5" /> Finalizar Transferência
                        </button>
                    </div>
                )}

                {/* Transferência resolvida (eu sou o remetente) */}
                {alerta?.isTransferenciaResolvida && (
                    <button
                        onClick={() => onTransferenciaVista && onTransferenciaVista(alerta.transferenciaResolvidaId)}
                        className="mt-2 w-full text-left rounded-lg px-3 py-2 border-2 border-green-300 bg-green-50 text-[12px] text-green-700 flex items-center gap-2"
                    >
                        <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-600" />
                        <div className="flex-1 min-w-0">
                            <span className="font-bold">Transferência resolvida</span>
                            {alerta.transferenciaResolvidaPorNome && <span className="ml-1">por {alerta.transferenciaResolvidaPorNome.split(' ')[0]}</span>}
                            {alerta.transferenciaResolvidaEm && <span className="ml-1 text-[11px] opacity-75">({new Date(alerta.transferenciaResolvidaEm).toLocaleDateString('pt-BR')})</span>}
                        </div>
                        <span className="text-[10px] font-bold opacity-60 shrink-0">Dispensar</span>
                    </button>
                )}

                {/* Exibir observação se já atendido */}
                {atendHoje?.observacao && (
                    <div className="mt-2 bg-gray-50 border border-gray-100 rounded p-2">
                        <p className="text-[11px] font-semibold text-gray-700 mb-0.5 flex items-center gap-1">
                            <ClipboardList className="h-3 w-3" />
                            Obs. Atendimento
                        </p>
                        <p className="text-[12px] text-gray-600 line-clamp-2">{atendHoje.observacao}</p>
                    </div>
                )}

                {mostrarAcoes && (
                    <div className="flex gap-1.5 mt-2 pt-2 border-t border-gray-100">
                        <button
                            onClick={() => onAtendimento({ tipo: 'lead', item: lead })}
                            className="flex-1 bg-orange-500 text-white text-[12px] font-semibold py-1.5 rounded flex items-center justify-center gap-1 active:opacity-80"
                        >
                            <ClipboardList className="h-3.5 w-3.5" /> Atender
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// ================================================
// Card de Entrega Pendente (Motorista)
// ================================================
const STATUS_ENTREGA_CORES = {
    ENTREGUE: 'bg-green-100 text-green-700',
    ENTREGUE_PARCIAL: 'bg-yellow-100 text-yellow-700',
    DEVOLVIDO: 'bg-red-100 text-red-700',
};

const CardEntregaPendente = ({ pedido, onCheckout, podeCheckout, onVerCliente }) => {
    const totalValor = pedido.itens?.reduce((s, i) => s + (Number(i.valor) * Number(i.quantidade)), 0) || 0;
    const motoristaNome = pedido.embarque?.responsavel?.nome;
    const vendedorNome = pedido.vendedor?.nome;
    const abrirMaps = () => {
        if (!pedido.cliente?.Ponto_GPS) {
            const addr = `${pedido.cliente?.End_Logradouro || ''} ${pedido.cliente?.End_Numero || ''} ${pedido.cliente?.End_Cidade || ''}`;
            window.open(`https://maps.google.com/?q=${encodeURIComponent(addr)}`);
            return;
        }
        const [lat, lng] = pedido.cliente.Ponto_GPS.split(',');
        window.open(`https://maps.google.com/?q=${lat},${lng}`);
    };
    return (
        <div className="bg-white rounded-xl border border-sky-400/50 ring-1 ring-sky-500/20 shadow-sm overflow-hidden mb-2">
            <div className="p-3 md:p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <Link to="/admin/embarques" className="text-[10px] md:text-[11px] font-bold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded uppercase hover:bg-sky-100 transition-colors">
                                Carga #{pedido.embarque?.numero}
                            </Link>
                            {motoristaNome && (
                                <span className="text-[10px] md:text-[11px] text-gray-500 font-semibold flex items-center gap-0.5">
                                    <Truck className="h-3 w-3" /> {motoristaNome.split(' ')[0]}
                                </span>
                            )}
                            {vendedorNome && (
                                <span className="text-[10px] text-purple-600 bg-purple-50 px-1 py-0.5 rounded font-semibold flex items-center gap-0.5">
                                    <User className="h-3 w-3" /> {vendedorNome.split(' ')[0]}
                                </span>
                            )}
                            {pedido.especial && (
                                <span className="text-[10px] font-bold text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded">ESPECIAL</span>
                            )}
                        </div>
                        <button
                            onClick={() => onVerCliente && onVerCliente(pedido.cliente)}
                            className="text-left font-bold text-[13px] md:text-[15px] text-gray-900 leading-tight truncate mt-0.5 w-full hover:text-sky-700 transition-colors"
                        >
                            {pedido.cliente?.NomeFantasia || pedido.cliente?.Nome}
                        </button>
                        {pedido.cliente?.End_Cidade && (
                            <p className="text-[11px] md:text-[12px] text-gray-500 truncate">{pedido.cliente.End_Logradouro} {pedido.cliente.End_Numero} · {pedido.cliente.End_Cidade}</p>
                        )}
                    </div>
                    <button onClick={abrirMaps} className="p-1.5 text-sky-500 hover:bg-sky-50 rounded-lg shrink-0">
                        <Navigation className="h-4 w-4" />
                    </button>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] md:text-[12px] text-gray-600">
                    <span className="flex items-center gap-1"><Package className="h-3 w-3" />{pedido.itens?.length || 0} prod.</span>
                    <span className="font-bold text-gray-900">R$ {totalValor.toFixed(2)}</span>
                </div>
                {podeCheckout && (
                    <button
                        onClick={() => onCheckout(pedido)}
                        className="w-full mt-2 bg-sky-600 text-white text-[12px] md:text-[13px] font-semibold py-1.5 md:py-2 rounded-lg flex items-center justify-center gap-1.5 active:opacity-80"
                    >
                        <CheckCircle className="h-4 w-4" /> Dar Baixa
                    </button>
                )}
            </div>
        </div>
    );
};

// ================================================
// Card de Amostra Pendente (Motorista)
// ================================================
const CardAmostraEntrega = ({ amostra, onEntregarAmostra, podeCheckout }) => {
    const motoristaNome = amostra.embarque?.responsavel?.nome;
    const vendedorNome = amostra.solicitadoPor?.nome;
    const abrirMaps = () => {
        if (!amostra.cliente?.Ponto_GPS) return;
        const [lat, lng] = amostra.cliente.Ponto_GPS.split(',');
        window.open(`https://maps.google.com/?q=${lat},${lng}`);
    };
    return (
        <div className="bg-white rounded-xl border border-orange-400/50 ring-1 ring-orange-500/20 shadow-sm overflow-hidden mb-2">
            <div className="p-3 md:p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] md:text-[11px] font-bold text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded uppercase">
                                AM#{amostra.numero}
                            </span>
                            <Link to="/admin/embarques" className="text-[10px] md:text-[11px] font-bold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded uppercase hover:bg-sky-100 transition-colors">
                                Carga #{amostra.embarque?.numero}
                            </Link>
                            {motoristaNome && (
                                <span className="text-[10px] md:text-[11px] text-gray-500 font-semibold flex items-center gap-0.5">
                                    <Truck className="h-3 w-3" /> {motoristaNome.split(' ')[0]}
                                </span>
                            )}
                            {vendedorNome && (
                                <span className="text-[10px] text-purple-600 bg-purple-50 px-1 py-0.5 rounded font-semibold flex items-center gap-0.5">
                                    <User className="h-3 w-3" /> {vendedorNome.split(' ')[0]}
                                </span>
                            )}
                        </div>
                        <p className="text-left font-bold text-[13px] md:text-[15px] text-gray-900 leading-tight truncate mt-0.5">
                            {amostra.cliente?.NomeFantasia || amostra.cliente?.Nome || '-'}
                        </p>
                        {amostra.cliente?.End_Cidade && (
                            <p className="text-[11px] md:text-[12px] text-gray-500 truncate">{amostra.cliente.End_Logradouro} {amostra.cliente.End_Numero} · {amostra.cliente.End_Cidade}</p>
                        )}
                    </div>
                    {amostra.cliente?.Ponto_GPS && (
                        <button onClick={abrirMaps} className="p-1.5 text-orange-500 hover:bg-orange-50 rounded-lg shrink-0">
                            <Navigation className="h-4 w-4" />
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] md:text-[12px] text-gray-600">
                    <span className="flex items-center gap-1"><Package className="h-3 w-3" />{amostra.itens?.length || 0} itens</span>
                    <span className="font-semibold text-orange-700">Amostra (sem valor)</span>
                </div>
                {amostra.observacao && (
                    <p className="mt-1.5 text-[11px] text-gray-500 italic truncate">{amostra.observacao}</p>
                )}
                {podeCheckout && (
                    <button
                        onClick={() => onEntregarAmostra(amostra.id)}
                        className="w-full mt-2 bg-orange-500 text-white text-[12px] md:text-[13px] font-semibold py-1.5 md:py-2 rounded-lg flex items-center justify-center gap-1.5 active:opacity-80"
                    >
                        <CheckCircle className="h-4 w-4" /> Entregar Amostra
                    </button>
                )}
            </div>
        </div>
    );
};

// ================================================
// Card de Entrega Concluída
// ================================================
const CardEntregaConcluida = ({ pedido, podeAjustar, onEstornar, onEditar, onVerCliente }) => {
    const [aberto, setAberto] = useState(false);
    const cls = STATUS_ENTREGA_CORES[pedido.statusEntrega] || 'bg-gray-100 text-gray-600';
    const labels = { ENTREGUE: 'Entregue', ENTREGUE_PARCIAL: 'Parcial', DEVOLVIDO: 'Devolvido' };
    const totalRecebido = pedido.pagamentosReais?.reduce((s, p) => s + Number(p.valor), 0) || 0;
    const totalBruto = pedido.itens?.reduce((s, i) => s + (Number(i.valor) * Number(i.quantidade)), 0) || 0;
    const motoristaNome = pedido.embarque?.responsavel?.nome;
    const vendedorNome = pedido.vendedor?.nome;

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-2" onClick={() => setAberto(!aberto)}>
            <div className="p-3 md:p-4">
                {/* Resumo compacto (sempre visível) */}
                <div className="flex items-center justify-between gap-2 mb-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] md:text-[11px] font-bold px-1.5 py-0.5 rounded ${cls}`}>{labels[pedido.statusEntrega] || pedido.statusEntrega}</span>
                        {pedido.embarque?.numero && (
                            <Link to="/admin/embarques" onClick={e => e.stopPropagation()} className="text-[10px] md:text-[11px] text-gray-400 hover:text-sky-600 transition-colors">
                                Carga #{pedido.embarque.numero}
                            </Link>
                        )}
                        {motoristaNome && (
                            <span className="text-[10px] text-sky-600 bg-sky-50 px-1 py-0.5 rounded font-semibold flex items-center gap-0.5">
                                <Truck className="h-3 w-3" /> {motoristaNome.split(' ')[0]}
                            </span>
                        )}
                        {/* Vendedor sempre visível no resumo compacto */}
                        {vendedorNome && (
                            <span className="text-[10px] text-purple-600 bg-purple-50 px-1 py-0.5 rounded font-semibold flex items-center gap-0.5">
                                <User className="h-3 w-3" /> {vendedorNome.split(' ')[0]}
                            </span>
                        )}
                        {pedido.especial && (
                            <span className="text-[10px] font-bold text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded">ESPECIAL</span>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        {pedido.dataEntrega && (
                            <span className="text-[10px] md:text-[11px] text-gray-400 flex items-center gap-0.5">
                                <Clock className="h-3 w-3" />
                                {new Date(pedido.dataEntrega).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        )}
                        {aberto ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
                    </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                    <button
                        onClick={e => { e.stopPropagation(); if (onVerCliente && pedido.cliente) onVerCliente(pedido.cliente); }}
                        className="text-left font-bold text-[13px] md:text-[15px] text-gray-900 leading-tight truncate hover:text-sky-700 transition-colors"
                    >
                        {pedido.cliente?.NomeFantasia || pedido.cliente?.Nome}
                    </button>
                    {totalRecebido > 0 && <span className="text-[11px] md:text-[12px] font-bold text-green-700 shrink-0">R$ {totalRecebido.toFixed(2)}</span>}
                </div>
                {!aberto && pedido.pagamentosReais?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                        {pedido.pagamentosReais.map((p, i) => (
                            <span key={i} className="text-[9px] md:text-[10px] bg-gray-100 text-gray-600 px-1 py-0.5 rounded font-mono">
                                {p.formaPagamentoNome}: R$ {Number(p.valor).toFixed(2)}
                            </span>
                        ))}
                    </div>
                )}

                {/* Detalhes expandidos */}
                {aberto && (
                    <div className="mt-3 border-t border-gray-100 pt-3 space-y-2" onClick={e => e.stopPropagation()}>
                        {/* Info geral */}
                        <div className="flex flex-wrap gap-2">
                            {vendedorNome && (
                                <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5">
                                    <User className="h-3 w-3" /> Vend: {vendedorNome.split(' ')[0]}
                                </span>
                            )}
                            {pedido.gpsEntrega && pedido.gpsEntrega !== 'FalhaSinal' && (
                                <a href={`https://maps.google.com/?q=${pedido.gpsEntrega}`} target="_blank" rel="noopener noreferrer"
                                    className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5 hover:bg-blue-100">
                                    <MapPin className="h-3 w-3" /> GPS Entrega
                                </a>
                            )}
                            {pedido.divergenciaPagamento && (
                                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Divergencia Pgto</span>
                            )}
                        </div>

                        {/* Valor do pedido */}
                        {totalBruto > 0 && (
                            <p className="text-[11px] text-gray-500">Valor Pedido: <span className="font-bold text-gray-700">R$ {totalBruto.toFixed(2)}</span></p>
                        )}

                        {/* Itens do pedido */}
                        {pedido.itens?.length > 0 && (
                            <div>
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">Itens do Pedido</p>
                                {pedido.itens.map((it, i) => (
                                    <p key={i} className="text-[11px] text-gray-600">
                                        {it.produto?.nome} — {it.quantidade}x R$ {Number(it.valor).toFixed(2)}
                                    </p>
                                ))}
                            </div>
                        )}

                        {/* Pagamentos */}
                        {pedido.pagamentosReais?.length > 0 && (
                            <div>
                                <p className="text-[10px] font-bold text-green-600 uppercase tracking-wide mb-0.5">Pagamentos Recebidos</p>
                                {pedido.pagamentosReais.map((p, i) => (
                                    <p key={i} className="text-[11px] text-gray-600">
                                        {p.formaPagamentoNome}: <span className="font-bold">R$ {Number(p.valor).toFixed(2)}</span>
                                    </p>
                                ))}
                            </div>
                        )}

                        {/* Itens devolvidos */}
                        {pedido.itensDevolvidos?.length > 0 && (
                            <div>
                                <p className="text-[10px] font-bold text-red-500 uppercase tracking-wide mb-0.5">Itens Devolvidos</p>
                                {pedido.itensDevolvidos.map((item, i) => (
                                    <p key={i} className="text-[11px] text-gray-600">
                                        {item.produto?.nome || 'Produto'} — {item.quantidade}x (R$ {Number(item.valorBaseItem).toFixed(2)}/un)
                                    </p>
                                ))}
                            </div>
                        )}

                        {/* Ações admin */}
                        {podeAjustar && (
                            <div className="flex gap-2 pt-2 border-t border-gray-100">
                                <button
                                    onClick={() => onEditar(pedido)}
                                    className="flex-1 text-[11px] md:text-[12px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors"
                                >
                                    <Edit3 className="h-3.5 w-3.5" /> Editar Lançamento
                                </button>
                                <button
                                    onClick={() => onEstornar(pedido)}
                                    className="text-[11px] md:text-[12px] font-semibold text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 transition-colors"
                                >
                                    Estornar
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// ================================================
// Modal de Edição de Entrega (Admin)
// ================================================
const EditarEntregaModal = ({ pedido, onClose, onSuccess }) => {
    const [statusEntrega, setStatusEntrega] = useState(pedido.statusEntrega || 'ENTREGUE');
    const [divergencia, setDivergencia] = useState(!!pedido.divergenciaPagamento);
    const [pagamentos, setPagamentos] = useState(
        (pedido.pagamentosReais || []).map(p => ({ forma: p.formaPagamentoNome || '', valor: Number(p.valor) || 0 }))
    );
    const [devolvidos, setDevolvidos] = useState(
        (pedido.itensDevolvidos || []).map(d => ({
            produtoId: d.produtoId,
            produtoNome: d.produto?.nome || 'Produto',
            quantidade: d.quantidade,
            valorBaseItem: Number(d.valorBaseItem) || 0
        }))
    );
    const [formasDisp, setFormasDisp] = useState([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const carregarFormas = async () => {
            try {
                const [customForms, tabelaForms] = await Promise.all([
                    formasPagamentoService.listar(),
                    tabelaPrecoService.listar(true)
                ]);
                const nomes = [
                    ...customForms.filter(f => f.ativo).map(f => f.nome),
                    ...tabelaForms.map(t => t.nomeCondicao)
                ];
                setFormasDisp([...new Set(nomes)]);
            } catch {
                // silencia
            }
        };
        carregarFormas();
    }, []);

    const addPagamento = () => setPagamentos([...pagamentos, { forma: formasDisp[0] || '', valor: 0 }]);
    const removePagamento = (i) => setPagamentos(pagamentos.filter((_, idx) => idx !== i));
    const updatePagamento = (i, field, val) => {
        const copy = [...pagamentos];
        copy[i] = { ...copy[i], [field]: field === 'valor' ? Number(val) || 0 : val };
        setPagamentos(copy);
    };

    const updateDevolvido = (i, field, val) => {
        const copy = [...devolvidos];
        copy[i] = { ...copy[i], [field]: Number(val) || 0 };
        setDevolvidos(copy);
    };
    const removeDevolvido = (i) => setDevolvidos(devolvidos.filter((_, idx) => idx !== i));

    // Adicionar produto devolvido da lista de itens do pedido
    const addDevolvido = () => {
        const itensDisponiveis = (pedido.itens || []).filter(it =>
            !devolvidos.some(d => d.produtoId === it.produtoId)
        );
        if (itensDisponiveis.length === 0) {
            toast.error('Todos os itens já estão na lista de devolvidos.');
            return;
        }
        const primeiro = itensDisponiveis[0];
        setDevolvidos([...devolvidos, {
            produtoId: primeiro.produtoId,
            produtoNome: primeiro.produto?.nome || 'Produto',
            quantidade: 1,
            valorBaseItem: Number(primeiro.valor) || 0
        }]);
    };

    const handleSalvar = async () => {
        setSaving(true);
        try {
            await entregasService.editarEntrega(pedido.id, {
                statusEntrega,
                divergenciaPagamento: divergencia,
                pagamentos: pagamentos.map(p => ({
                    formaPagamentoNome: p.forma,
                    valor: p.valor
                })),
                itensDevolvidos: devolvidos.map(d => ({
                    produtoId: d.produtoId,
                    quantidade: d.quantidade,
                    valorBaseItem: d.valorBaseItem
                }))
            });
            toast.success('Lançamento atualizado!');
            onSuccess();
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Erro ao salvar edição.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between rounded-t-xl z-10">
                    <div>
                        <h2 className="text-[15px] font-bold text-gray-900">Editar Lançamento</h2>
                        <p className="text-[12px] text-gray-500">{pedido.cliente?.NomeFantasia || pedido.cliente?.Nome}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
                        <X className="h-5 w-5 text-gray-500" />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    {/* Resumo do Pedido */}
                    <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Dados do Pedido</p>
                        {pedido.itens?.length > 0 && (
                            <div className="space-y-0.5">
                                {pedido.itens.map((it, i) => (
                                    <p key={i} className="text-[12px] text-gray-700">
                                        {it.produto?.nome} — {it.quantidade}x R$ {Number(it.valor).toFixed(2)}
                                    </p>
                                ))}
                            </div>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 border-t border-gray-200">
                            {(() => {
                                const total = pedido.itens?.reduce((s, i) => s + (Number(i.valor) * Number(i.quantidade)), 0) || 0;
                                return total > 0 && <span className="text-[12px] font-bold text-gray-800">Total: R$ {total.toFixed(2)}</span>;
                            })()}
                            {pedido.opcaoCondicaoPagamento && (
                                <span className="text-[12px] text-gray-600">Condição: <span className="font-semibold">{pedido.condicaoNome || pedido.opcaoCondicaoPagamento}</span></span>
                            )}
                            {pedido.vendedor?.nome && (
                                <span className="text-[12px] text-gray-600">Vendedor: <span className="font-semibold">{pedido.vendedor.nome}</span></span>
                            )}
                            {pedido.embarque?.responsavel?.nome && (
                                <span className="text-[12px] text-gray-600">Motorista: <span className="font-semibold">{pedido.embarque.responsavel.nome}</span></span>
                            )}
                        </div>
                    </div>

                    {/* Status */}
                    <div>
                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Status da Entrega</label>
                        <select value={statusEntrega} onChange={e => setStatusEntrega(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] focus:ring-sky-500 focus:border-sky-500 outline-none">
                            <option value="ENTREGUE">Entregue</option>
                            <option value="ENTREGUE_PARCIAL">Entregue Parcial</option>
                            <option value="DEVOLVIDO">Devolvido 100%</option>
                        </select>
                    </div>

                    {/* Divergência */}
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={divergencia} onChange={e => setDivergencia(e.target.checked)}
                            className="w-4 h-4 text-amber-500 border-gray-300 rounded focus:ring-amber-400" />
                        <span className="text-[12px] font-semibold text-gray-700">Divergência de pagamento</span>
                    </label>

                    {/* Pagamentos */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-bold text-green-600 uppercase tracking-wide">Pagamentos Recebidos</label>
                            <button onClick={addPagamento} className="text-[11px] text-sky-600 font-semibold hover:underline flex items-center gap-0.5">
                                <Plus className="h-3 w-3" /> Adicionar
                            </button>
                        </div>
                        {pagamentos.length === 0 && <p className="text-[11px] text-gray-400 italic">Nenhum pagamento registrado.</p>}
                        {pagamentos.map((p, i) => (
                            <div key={i} className="flex items-center gap-2 mb-1.5">
                                <select value={p.forma} onChange={e => updatePagamento(i, 'forma', e.target.value)}
                                    className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-[12px] outline-none focus:border-sky-400">
                                    {formasDisp.map(f => <option key={f} value={f}>{f}</option>)}
                                    {p.forma && !formasDisp.includes(p.forma) && <option value={p.forma}>{p.forma}</option>}
                                </select>
                                <div className="relative w-28">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">R$</span>
                                    <input type="number" step="0.01" value={p.valor || ''} onChange={e => updatePagamento(i, 'valor', e.target.value)}
                                        className="w-full pl-7 pr-2 py-1.5 border border-gray-200 rounded text-[12px] outline-none focus:border-sky-400 text-right" />
                                </div>
                                <button onClick={() => removePagamento(i)} className="text-red-400 hover:text-red-600 p-1">
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Itens Devolvidos */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-bold text-red-500 uppercase tracking-wide">Itens Devolvidos</label>
                            <button onClick={addDevolvido} className="text-[11px] text-sky-600 font-semibold hover:underline flex items-center gap-0.5">
                                <Plus className="h-3 w-3" /> Adicionar
                            </button>
                        </div>
                        {devolvidos.length === 0 && <p className="text-[11px] text-gray-400 italic">Nenhum item devolvido.</p>}
                        {devolvidos.map((d, i) => (
                            <div key={i} className="flex items-center gap-2 mb-1.5">
                                <span className="flex-1 text-[12px] text-gray-700 truncate">{d.produtoNome}</span>
                                <input type="number" min="1" value={d.quantidade} onChange={e => updateDevolvido(i, 'quantidade', e.target.value)}
                                    className="w-16 border border-gray-200 rounded px-2 py-1.5 text-[12px] text-center outline-none focus:border-sky-400" />
                                <span className="text-[10px] text-gray-400 w-16 text-right">R$ {d.valorBaseItem.toFixed(2)}</span>
                                <button onClick={() => removeDevolvido(i)} className="text-red-400 hover:text-red-600 p-1">
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 flex gap-2 rounded-b-xl">
                    <button onClick={onClose} className="flex-1 py-2 text-[13px] font-semibold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                        Cancelar
                    </button>
                    <button onClick={handleSalvar} disabled={saving}
                        className="flex-[2] py-2 text-[13px] font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
                        <Save className="h-4 w-4" />
                        {saving ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ================================================
// Componente principal: Rota / Leads
// ================================================
const RotaLeads = () => {
    const navigate = useNavigate();
    const { user, refreshUser } = useAuth();

    const [aba, setAba] = useState('atendimento');
    const [leads, setLeads] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busca, setBusca] = useState('');
    const [clientePopupItem, setClientePopupItem] = useState(null); // popup de dados

    // Modais
    const [modalAtendimento, setModalAtendimento] = useState(null); // { tipo: 'lead'|'cliente', item }
    const [modalAmostra, setModalAmostra] = useState(null); // { leadId?, clienteId?, nomeDestinatario, vendedorId, finalizarAtendimento }
    const [modalNovoLead, setModalNovoLead] = useState(false);
    const [editarEntregaPedido, setEditarEntregaPedido] = useState(null); // pedido para edição admin

    // Entregas (Motorista)
    const [entregasPendentes, setEntregasPendentes] = useState([]);
    const [entregasConcluidas, setEntregasConcluidas] = useState([]);
    const [loadingEntregas, setLoadingEntregas] = useState(false);
    const [checkoutPedido, setCheckoutPedido] = useState(null);

    // Alertas visuais
    const [alertasAtivos, setAlertasAtivos] = useState([]); // atendimentos com alertaVisualAtivo

    // Roteirizador
    const [rotaOrganizada, setRotaOrganizada] = useState(null); // { sequencia: [...], semGPS: [...], resumo: {...} }
    const [showOrganizarRota, setShowOrganizarRota] = useState(false);
    const [isRoteirizando, setIsRoteirizando] = useState(false);
    const [rotaConfig, setRotaConfig] = useState({
        horaSaida: new Date().toTimeString().slice(0, 5),
        tempoParadaMin: 10,
        vendedorIdRota: ''
    });

    // Mapa pedidoId -> dados da rota para exibição nos cards
    const mapaRota = useMemo(() => {
        if (!rotaOrganizada) return {};
        const mapa = {};
        rotaOrganizada.sequencia.forEach(p => { mapa[p.pedidoId] = p; });
        return mapa;
    }, [rotaOrganizada]);

    const handleOrganizarRota = async () => {
        setIsRoteirizando(true);
        try {
            navigator.geolocation.getCurrentPosition(
                async (pos) => {
                    try {
                        const { latitude: lat, longitude: lng } = pos.coords;
                        const result = await roteirizacaoService.roteirizar({
                            lat, lng,
                            horaSaida: rotaConfig.horaSaida,
                            tempoParadaMin: rotaConfig.tempoParadaMin,
                            vendedorId: rotaConfig.vendedorIdRota || undefined
                        });
                        setRotaOrganizada(result);
                        setShowOrganizarRota(false);
                        const total = result.sequencia?.length || 0;
                        const semGPS = result.semGPS?.length || 0;
                        toast.success(`Rota organizada e salva! ${total} parada${total !== 1 ? 's' : ''} ordenadas.${semGPS > 0 ? ` (${semGPS} sem GPS)` : ''}`);
                    } catch (err) {
                        if (err?.response?.status === 423) {
                            toast.error('Roteirização em uso por outro usuário. Aguarde.');
                        } else {
                            toast.error(err?.response?.data?.error || 'Erro ao roteirizar. Verifique se o serviço OSRM está ativo.');
                        }
                    } finally {
                        setIsRoteirizando(false);
                    }
                },
                (geoErr) => {
                    setIsRoteirizando(false);
                    toast.error('GPS negado. Permita o acesso à localização no navegador.');
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        } catch (e) {
            setIsRoteirizando(false);
            toast.error('Erro ao capturar localização.');
        }
    };


    useEffect(() => { refreshUser(); }, []); // garante permissões frescas do banco

    const vendedorId = user?.id;
    const podeEscolherVendedor = user?.permissoes?.pedidos?.clientes === 'todos';
    const podeEntregas = !!(user?.permissoes?.admin) || !!(user?.permissoes?.Pode_Executar_Entregas);
    const podeAjustar = !!(user?.permissoes?.admin) || !!(user?.permissoes?.Pode_Ajustar_Entregas);

    // Filtro mantido no localStorage para não resetar ao voltar pra tela
    const [vendedorFiltro, setVendedorFiltro] = useState(() => {
        return localStorage.getItem('rota_vendedorFiltro') || 'todos';
    });
    const [vendedores, setVendedores] = useState([]);

    // Se admin, carrega vendedores para o select
    useEffect(() => {
        if (podeEscolherVendedor) {
            import('../../services/vendedorService').then(module => {
                module.default.listar().then(vends => {
                    setVendedores(vends.filter(v => v.ativo));
                }).catch(console.error);
            });
        }
    }, [podeEscolherVendedor]);

    const handleFiltroVendedor = (e) => {
        const val = e.target.value;
        setVendedorFiltro(val);
        localStorage.setItem('rota_vendedorFiltro', val);
    };

    const carregar = useCallback(async () => {
        try {
            setLoading(true);

            // define quem será o alvo das queries
            let idBusca = vendedorId;
            if (podeEscolherVendedor) {
                idBusca = vendedorFiltro === 'todos' ? null : vendedorFiltro;
            }

            const [leadsData, clientesData, atendHojeData] = await Promise.all([
                leadService.listarParaRota(idBusca), // se null, traz de todos no backend
                clienteService.listar({ limit: 2000 }), // cliente traz tudo, filtraremos depois
                idBusca ? atendimentoService.listarHoje(idBusca) : atendimentoService.listarHoje()
            ]);

            // Se quisermos ver pedidos do dia para abater da rota, precisamos buscar do pedidoService
            // Aqui eu faço lazy load do módulo de pedidos para evitar import cíclico se houver, ou apenas import global
            const pedidoService = (await import('../../services/pedidoService')).default;
            const pedidosDeHojeData = await pedidoService.listar({ statusEnvio: undefined, vendedorId: idBusca || undefined });

            // Normaliza resposta — pode vir como array ou { data: [] }
            const listaLeads = Array.isArray(leadsData) ? leadsData : (leadsData?.data || []);
            let listaClientesRaw = Array.isArray(clientesData) ? clientesData : (clientesData?.data || []);
            let listaPedidos = Array.isArray(pedidosDeHojeData) ? pedidosDeHojeData : [];
            const hojeDataRaw = new Date().toDateString();
            listaPedidos = listaPedidos.filter(p => p.createdAt && new Date(p.createdAt).toDateString() === hojeDataRaw);

            // Filtra clientes caso precise (ContaAzul/Prisma)
            if (idBusca) {
                listaClientesRaw = listaClientesRaw.filter(c =>
                    c.idVendedor === idBusca ||
                    c.vendedor?.id === idBusca ||
                    c.VendedorUUID === idBusca
                );
            }
            const listaClientes = listaClientesRaw;
            const listaAtendHoje = Array.isArray(atendHojeData) ? atendHojeData : [];

            // Mapas: clienteId → [atendimentos hoje], leadId → [atendimentos hoje]
            const mapClienteAtend = {};
            const mapLeadAtend = {};
            const mapClientePedidos = {};

            listaAtendHoje.forEach(a => {
                if (a.clienteId) {
                    if (!mapClienteAtend[a.clienteId]) mapClienteAtend[a.clienteId] = [];
                    mapClienteAtend[a.clienteId].push(a);
                }
                if (a.leadId) {
                    if (!mapLeadAtend[a.leadId]) mapLeadAtend[a.leadId] = [];
                    mapLeadAtend[a.leadId].push(a);
                }
            });

            listaPedidos.forEach(p => {
                if (p.clienteId || p.cliente?.UUID) {
                    const cid = p.clienteId || p.cliente?.UUID;
                    if (!mapClientePedidos[cid]) mapClientePedidos[cid] = [];
                    mapClientePedidos[cid].push(p);
                }
            });

            // Injetar atendimentos e pedidos de hoje nos clientes
            const clientesComAtend = listaClientes.map(c => ({
                ...c,
                _atendimentos: mapClienteAtend[c.UUID] || [],
                _pedidos: mapClientePedidos[c.UUID] || []
            }));

            // Injetar atendimentos de hoje nos leads
            const leadsComAtend = listaLeads
                .filter(l => l.etapa !== 'FINALIZADO')
                .map(l => ({
                    ...l,
                    atendimentos: mapLeadAtend[l.id] || l.atendimentos || []
                }));

            setLeads(leadsComAtend);
            setClientes(clientesComAtend);

            // 3. Buscar Roteirização Salva
            const rotaSalva = await roteirizacaoService.getRotaSalva(idBusca); // Busca a do vendedor selecionado no combobox
            if (rotaSalva) {
                setRotaOrganizada(rotaSalva);
            } else {
                setRotaOrganizada(null);
            }

            // 4. Buscar Alertas Visuais Ativos
            try {
                const alertas = await atendimentoService.listarAlertasAtivos();
                const listaAlertas = Array.isArray(alertas) ? alertas : [];
                setAlertasAtivos(listaAlertas);

                // 5. Injetar clientes/leads transferidos que não estão na rota do vendedor
                const clienteIdsAtuais = new Set(clientesComAtend.map(c => c.UUID));
                const leadIdsAtuais = new Set(leadsComAtend.map(l => l.id));
                const clientesFaltantes = [];
                const leadsFaltantes = [];

                for (const a of listaAlertas) {
                    // Transferências ativas para mim
                    if (a.transferidoParaId && !a.transferenciaFinalizada) {
                        if (a.clienteId && !clienteIdsAtuais.has(a.clienteId)) {
                            clientesFaltantes.push(a.clienteId);
                            clienteIdsAtuais.add(a.clienteId);
                        }
                        if (a.leadId && !leadIdsAtuais.has(a.leadId)) {
                            leadsFaltantes.push(a.leadId);
                            leadIdsAtuais.add(a.leadId);
                        }
                    }
                }

                if (clientesFaltantes.length > 0 || leadsFaltantes.length > 0) {
                    const fetchPromises = [];
                    clientesFaltantes.forEach(cid => fetchPromises.push(
                        clienteService.detalhar(cid).then(c => ({ _tipo: 'cliente', ...c, _atendimentos: [], _pedidos: [] })).catch(() => null)
                    ));
                    leadsFaltantes.forEach(lid => fetchPromises.push(
                        leadService.buscarPorId(lid).then(l => l ? ({ _tipo: 'lead', ...l, atendimentos: [] }) : null).catch(() => null)
                    ));
                    const extras = (await Promise.all(fetchPromises)).filter(Boolean);
                    const clientesExtras = extras.filter(e => e._tipo === 'cliente');
                    const leadsExtras = extras.filter(e => e._tipo === 'lead');

                    if (clientesExtras.length > 0) {
                        setClientes(prev => [...prev, ...clientesExtras]);
                    }
                    if (leadsExtras.length > 0) {
                        setLeads(prev => [...prev, ...leadsExtras]);
                    }
                }
            } catch (e) {
                console.warn('Alertas visuais não carregados:', e.message);
            }

        } catch (e) {
            console.error(e);
            toast.error('Erro ao carregar dados da rota.', { duration: 5000 });
        } finally {
            setLoading(false);
        }
    }, [vendedorId, podeEscolherVendedor, vendedorFiltro, user]);

    useEffect(() => { carregar(); }, [carregar]);

    const handleLimparRota = async (mostrarToast = true) => {
        try {
            await roteirizacaoService.limparRota();
            setRotaOrganizada(null);
            if (mostrarToast) toast.success('Rota limpa com sucesso.');
        } catch (error) {
            toast.error('Erro ao limpar a rota.');
        }
    };

    // Mapa de alertas visuais por leadId/clienteId
    const alertasPorItem = useMemo(() => {
        const mapa = {}; // key: leadId ou clienteId → { cor, assuntoRetorno, dataRetorno, atendimentoId, ... }
        const hoje = new Date().toDateString();
        alertasAtivos.forEach(a => {
            const isHoje = a.dataRetorno && new Date(a.dataRetorno).toDateString() === hoje;
            const key = a.leadId || a.clienteId;
            if (!key) return;

            // Transferência ativa (eu sou o receptor)
            if (a.transferidoParaId === vendedorId && !a.transferenciaFinalizada) {
                if (!mapa[key] || !mapa[key].isTransferenciaAtiva) {
                    mapa[key] = {
                        ...(mapa[key] || {}),
                        isTransferenciaAtiva: true,
                        transferenciaAtendimentoId: a.id,
                        transferenciaObs: a.observacao,
                        transferenciaDeNome: a.vendedor?.nome,
                        transferenciaAcaoLabel: a.acaoLabel,
                        transferenciaCriadoEm: a.criadoEm,
                    };
                }
                return;
            }

            // Transferência resolvida (eu sou o remetente, não vi ainda)
            if (a.idVendedor === vendedorId && a.transferenciaFinalizada && !a.transferenciaVistaOrigem) {
                if (!mapa[key] || !mapa[key].isTransferenciaResolvida) {
                    mapa[key] = {
                        ...(mapa[key] || {}),
                        isTransferenciaResolvida: true,
                        transferenciaResolvidaId: a.id,
                        transferenciaResolvidaPorNome: a.transferidoPara?.nome,
                        transferenciaResolvidaEm: a.transferenciaFinalizadaEm,
                    };
                }
                return;
            }

            // Alerta visual normal
            if (a.alertaVisualAtivo && !a.alertaVisualVisto) {
                if (!mapa[key]?.cor || isHoje) {
                    mapa[key] = {
                        ...(mapa[key] || {}),
                        cor: a.alertaVisualCor || '#ef4444',
                        assuntoRetorno: a.assuntoRetorno,
                        dataRetorno: a.dataRetorno,
                        isHoje,
                        atendimentoId: a.id,
                        acaoLabel: a.acaoLabel,
                    };
                }
            }
        });
        return mapa;
    }, [alertasAtivos, vendedorId]);

    // Filtra clientes com rota definida ou com alerta/transferência ativa
    const clientesComAtendimento = useMemo(() => {
        return clientes.filter(c => c.Dia_de_venda || c.Dia_de_entrega || alertasPorItem[c.UUID]);
    }, [clientes, alertasPorItem]);

    const handleMarcarAlertaVisto = async (atendimentoId) => {
        try {
            await atendimentoService.marcarAlertaVisto(atendimentoId);
            setAlertasAtivos(prev => prev.filter(a => a.id !== atendimentoId));
        } catch (e) {
            console.error('Erro ao marcar alerta como visto:', e);
        }
    };

    const handleFinalizarTransferencia = async (atendimentoId) => {
        if (!window.confirm('Finalizar transferência? Este cliente não aparecerá mais como prioridade na sua lista.')) return;
        try {
            await atendimentoService.finalizarTransferencia(atendimentoId);
            setAlertasAtivos(prev => prev.filter(a => a.id !== atendimentoId));
            toast.success('Transferência finalizada!');
        } catch (e) {
            toast.error('Erro ao finalizar transferência.');
        }
    };

    const handleMarcarTransferenciaVista = async (atendimentoId) => {
        try {
            await atendimentoService.marcarTransferenciaVista(atendimentoId);
            setAlertasAtivos(prev => prev.filter(a => a.id !== atendimentoId));
        } catch (e) {
            console.error('Erro ao marcar transferência como vista:', e);
        }
    };

    // Helper: filtro de busca por nome
    const matchBusca = useCallback((nome) => {
        if (!busca.trim()) return true;
        return (nome || '').toLowerCase().includes(busca.toLowerCase());
    }, [busca]);

    // Verifica se o receptor (vendedor logado) já atendeu hoje este item
    const receptorAtendeuHoje = useCallback((item) => {
        const atendimentos = item._atendimentos || item.atendimentos || [];
        const hoje = new Date().toDateString();
        return atendimentos.some(a =>
            new Date(a.criadoEm).toDateString() === hoje && a.idVendedor === vendedorId
        );
    }, [vendedorId]);

    // Ordenar itens da aba "Atendimento" (não atendidos hoje OU com transferência ativa não atendida pelo receptor)
    const itensParaAtender = useMemo(() => {
        const todos = [
            ...clientesComAtendimento.map(c => ({ _tipo: 'cliente', ...c })),
            ...leads.map(l => ({ _tipo: 'lead', ...l }))
        ].filter(i => {
            const key = i._tipo === 'cliente' ? i.UUID : i.id;
            // Transferência ativa: aparece se o receptor ainda não atendeu hoje
            if (alertasPorItem[key]?.isTransferenciaAtiva) {
                return !receptorAtendeuHoje(i);
            }
            return !isAtendidoHoje(i);
        }).filter(i =>
            matchBusca(i._tipo === 'cliente' ? (i.NomeFantasia || i.Nome) : i.nomeEstabelecimento)
        );

        // Transferências ativas para mim ficam no topo absoluto
        const transferidos = todos.filter(i => {
            const key = i._tipo === 'cliente' ? i.UUID : i.id;
            return alertasPorItem[key]?.isTransferenciaAtiva;
        });
        const resto = todos.filter(i => !transferidos.includes(i));

        const prioridade1 = resto.filter(i => i._tipo === 'cliente' && itemTemDiaBase(i.Dia_de_venda));
        const prioridade2 = resto.filter(i => i._tipo === 'lead' && itemTemDiaBase(i.diasVisita) && !isProximaVisitaHoje(i.proximaVisita));
        const prioridade3 = resto.filter(i => i._tipo === 'lead' && isProximaVisitaHoje(i.proximaVisita));
        
        const sobra1 = resto.filter(i => !prioridade1.includes(i) && !prioridade2.includes(i) && !prioridade3.includes(i));
        
        const prioridadeND = sobra1.filter(i => {
            const dias = i._tipo === 'cliente' ? i.Dia_de_venda : i.diasVisita;
            return itemTemND(dias);
        });
        
        const demais = sobra1.filter(i => !prioridadeND.includes(i));

        return [...transferidos, ...prioridade1, ...prioridade2, ...prioridade3, ...prioridadeND, ...demais];
    }, [clientesComAtendimento, leads, matchBusca, alertasPorItem]);

    // Itens atendidos hoje (transferências ativas só aparecem aqui se o receptor já atendeu)
    const itensAtendidos = useMemo(() => {
        const todos = [
            ...clientesComAtendimento.map(c => ({ _tipo: 'cliente', ...c })),
            ...leads.map(l => ({ _tipo: 'lead', ...l }))
        ];
        return todos.filter(i => {
            const key = i._tipo === 'cliente' ? i.UUID : i.id;
            // Transferência ativa: só aparece em Atendidos se o receptor atendeu hoje
            if (alertasPorItem[key]?.isTransferenciaAtiva) {
                return receptorAtendeuHoje(i);
            }
            return isAtendidoHoje(i);
        }).filter(i =>
            matchBusca(i._tipo === 'cliente' ? (i.NomeFantasia || i.Nome) : i.nomeEstabelecimento)
        );
    }, [clientesComAtendimento, leads, matchBusca, alertasPorItem, receptorAtendeuHoje]);

    // Entregas filtradas por busca
    const entregasPendentesFiltradas = useMemo(() =>
        entregasPendentes.filter(p => matchBusca(p.cliente?.NomeFantasia || p.cliente?.Nome)),
        [entregasPendentes, matchBusca]
    );

    // Ordena entregas pendentes conforme a rota calculada (DEVE vir APÓS o filtro)
    const entregasPendentesOrdenadas = useMemo(() => {
        if (!rotaOrganizada || !rotaOrganizada.sequencia?.length) return entregasPendentesFiltradas;
        const ordemIds = rotaOrganizada.sequencia.map(p => p.pedidoId);
        const ordenadas = [...entregasPendentesFiltradas].sort((a, b) => {
            const ia = ordemIds.indexOf(a.id);
            const ib = ordemIds.indexOf(b.id);
            if (ia === -1 && ib === -1) return 0;
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });
        // Appenda ao final os que estão no semGPS
        const semGPSIds = new Set(rotaOrganizada.semGPS?.map(p => p.pedidoId) || []);
        const principal = ordenadas.filter(p => !semGPSIds.has(p.id));
        const semGPSPedidos = ordenadas.filter(p => semGPSIds.has(p.id));
        return [...principal, ...semGPSPedidos];
    }, [rotaOrganizada, entregasPendentesFiltradas]);

    const entregasConcluidasFiltradas = useMemo(() =>
        entregasConcluidas.filter(p => matchBusca(p.cliente?.NomeFantasia || p.cliente?.Nome)),
        [entregasConcluidas, matchBusca]
    );

    const handleAtendimentoSalvo = () => {
        setModalAtendimento(null);
        carregar();
        toast.success('Atendimento registrado!', { duration: 3000 });
    };

    const handleNovoLeadSalvo = () => {
        setModalNovoLead(false);
        carregar();
        toast.success('Lead criado!', { duration: 3000 });
    };

    const handleNovoPedido = (clienteUUID) => {
        navigate(`/pedidos/novo?clienteId=${clienteUUID}`);
    };

    const carregarEntregas = useCallback(async (tipo) => {
        try {
            setLoadingEntregas(true);
            if (tipo === 'pendentes') {
                const data = await entregasService.getPendentes();
                setEntregasPendentes(data);
            } else {
                const data = await entregasService.getConcluidas();
                setEntregasConcluidas(data);
            }
        } catch (e) {
            // 403 = sem permissão (usuário sem entregas atribuídas); silencia, mostra vazio
            if (e?.response?.status !== 403) {
                toast.error('Erro ao carregar entregas.');
            }
        } finally {
            setLoadingEntregas(false);
        }
    }, []);

    const handleEntregarAmostra = async (amostraId) => {
        if (!window.confirm('Confirmar entrega desta amostra?')) return;
        try {
            await entregasService.concluirAmostra(amostraId);
            toast.success('Amostra entregue!');
            carregarEntregas('pendentes');
            carregarEntregas('concluidas');
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Erro ao entregar amostra.');
        }
    };

    const handleEstornar = async (pedido) => {
        if (!window.confirm(`Estornar a entrega de "${pedido.cliente?.NomeFantasia || pedido.cliente?.Nome}"? O pedido voltará ao status PENDENTE.`)) return;
        try {
            await entregasService.estornar(pedido.id);
            toast.success('Entrega estornada. Pedido voltou para PENDENTE.');
            carregarEntregas('concluidas');
            carregarEntregas('pendentes');
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Erro ao estornar entrega.');
        }
    };

    useEffect(() => {
        if (aba === 'entregas') carregarEntregas('pendentes');
        if (aba === 'entregues') carregarEntregas('concluidas');
    }, [aba, carregarEntregas]);

    const renderItem = (item) => {
        const mostrarAcoes = aba === 'atendimento';

        if (item._tipo === 'cliente') {
            return <CardCliente key={item.UUID} cliente={item} onAtendimento={setModalAtendimento} onNovoPedido={handleNovoPedido} onVerCliente={setClientePopupItem} mostrarAcoes={mostrarAcoes} podeEscolherVendedor={podeEscolherVendedor} alerta={alertasPorItem[item.UUID]} onAlertaVisto={handleMarcarAlertaVisto} onFinalizarTransferencia={handleFinalizarTransferencia} onTransferenciaVista={handleMarcarTransferenciaVista} />;
        }
        return <CardLead key={item.id} lead={item} onAtendimento={setModalAtendimento} onVerCliente={setClientePopupItem} mostrarAcoes={mostrarAcoes} podeEscolherVendedor={podeEscolherVendedor} alerta={alertasPorItem[item.id]} onAlertaVisto={handleMarcarAlertaVisto} onFinalizarTransferencia={handleFinalizarTransferencia} onTransferenciaVista={handleMarcarTransferenciaVista} />;
    };

    const diaBase = getDiaSigla(getDiaBase());

    const ABAS = [
        { id: 'atendimento', label: 'Atendimento', icon: ClipboardList, count: itensParaAtender.length, activeColor: 'border-blue-600 text-blue-600' },
        { id: 'atendidos', label: 'Atendidos', icon: CheckCircle, count: itensAtendidos.length, activeColor: 'border-green-600 text-green-600' },
        ...(podeEntregas ? [
            { id: 'entregas', label: 'Entregas', icon: Package, count: entregasPendentesFiltradas.length, activeColor: 'border-sky-600 text-sky-600' },
            { id: 'entregues', label: 'Entregues', icon: Truck, count: entregasConcluidasFiltradas.length, activeColor: 'border-sky-600 text-sky-600' },
        ] : []),
    ];

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
                <div className="px-3 md:px-4 pt-3 md:pt-4 pb-2 md:pb-3 flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                        <h1 className="text-[16px] md:text-[18px] font-bold text-gray-900">Rota / Leads</h1>
                        <p className="text-[11px] md:text-[12px] text-gray-500 mt-0.5">Dia base: {diaBase} · {new Date().toLocaleDateString('pt-BR')}</p>
                    </div>
                    {podeEscolherVendedor && (
                        <select
                            value={vendedorFiltro}
                            onChange={handleFiltroVendedor}
                            className="text-[12px] md:text-[13px] border border-gray-300 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:ring-blue-500 focus:border-blue-500 outline-none max-w-[130px] md:max-w-[150px] truncate"
                        >
                            <option value="todos">Todos Vendedores</option>
                            {vendedores.map(v => (
                                <option key={v.id} value={v.id}>{v.nome.split(' ')[0]}</option>
                            ))}
                        </select>
                    )}
                </div>

                {/* Campo de pesquisa */}
                <div className="px-3 md:px-4 pb-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar por nome..."
                            value={busca}
                            onChange={e => setBusca(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-[12px] md:text-[13px] border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-blue-400 outline-none transition-colors"
                        />
                        {busca && (
                            <button onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Abas com ícones responsivos */}
                <div className="flex border-t border-gray-100">
                    {ABAS.map(tab => {
                        const Icon = tab.icon;
                        const isActive = aba === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setAba(tab.id)}
                                className={`flex-1 py-2.5 md:py-3 text-[11px] md:text-[13px] font-semibold transition-colors border-b-2 flex items-center justify-center gap-1 md:gap-1.5 ${isActive ? tab.activeColor : 'border-transparent text-gray-400'}`}
                            >
                                <Icon className="h-4 w-4" />
                                <span className={`${isActive ? 'inline' : 'hidden md:inline'}`}>{tab.label}</span>
                                <span className="text-[10px] md:text-[11px] opacity-70">({tab.count})</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Conteúdo */}
            <div className="px-3 pt-3 pb-28 max-w-6xl mx-auto">
                {(loading && (aba === 'atendimento' || aba === 'atendidos')) ? (
                    <div className="flex items-center justify-center h-40">
                        <Loader className="h-6 w-6 animate-spin text-blue-600" />
                    </div>
                ) : (loadingEntregas && (aba === 'entregas' || aba === 'entregues')) ? (
                    <div className="flex items-center justify-center h-40">
                        <Loader className="h-6 w-6 animate-spin text-sky-600" />
                    </div>
                ) : (
                    <>
                        {aba === 'atendimento' && (
                            itensParaAtender.length === 0 ? (
                                <div className="text-center py-12 text-gray-500">
                                    <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-2" />
                                    <p className="font-bold text-gray-700">Tudo atendido hoje!</p>
                                    <p className="text-[13px]">Nenhum item pendente na sua rota.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 lg:gap-3">
                                    {itensParaAtender.map(renderItem)}
                                </div>
                            )
                        )}

                        {aba === 'atendidos' && (
                            itensAtendidos.length === 0 ? (
                                <div className="text-center py-12 text-gray-500">
                                    <ClipboardList className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                                    <p className="font-bold text-gray-700">Nenhum atendimento hoje ainda.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 lg:gap-3">
                                    {itensAtendidos.map(renderItem)}
                                </div>
                            )
                        )}

                        {aba === 'entregas' && (
                            <>
                                {/* Botão Organizar Rota + Modal de Configuração */}
                                <div className="mb-3">
                                    {!showOrganizarRota ? (
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setShowOrganizarRota(true)}
                                                className="flex items-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white text-[12px] font-bold rounded-lg shadow-sm transition-colors"
                                            >
                                                <Route className="h-4 w-4" />
                                                Organizar Rota
                                            </button>
                                            {rotaOrganizada && (
                                                <>
                                                    <span className="text-[11px] text-sky-700 font-semibold bg-sky-50 border border-sky-200 px-2 py-1 rounded-lg flex items-center gap-1">
                                                        <span title="Motorista">{rotaOrganizada.resumo?.motorista ? `🚚 ${rotaOrganizada.resumo.motorista.split(' ')[0]} - ` : '🗺️ '}</span>
                                                        {rotaOrganizada.resumo?.totalParadas} paradas · {rotaOrganizada.resumo?.distanciaTotalKm} km · {rotaOrganizada.resumo?.duracaoTotalMin} min est.
                                                    </span>
                                                    <button onClick={() => setRotaOrganizada(null)} className="text-gray-400 hover:text-gray-600 p-1" title="Limpar rota">
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="bg-white border border-sky-200 rounded-xl p-4 shadow-sm">
                                            <div className="flex items-center justify-between mb-3">
                                                <h3 className="text-[13px] font-bold text-sky-800 flex items-center gap-1.5">
                                                    <Route className="h-4 w-4" /> Configurar Rota
                                                </h3>
                                                <button onClick={() => setShowOrganizarRota(false)} className="text-gray-400 hover:text-gray-600">
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3 mb-3">
                                                <div>
                                                    <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Horário de Saída</label>
                                                    <input
                                                        type="time"
                                                        value={rotaConfig.horaSaida}
                                                        onChange={e => setRotaConfig(c => ({ ...c, horaSaida: e.target.value }))}
                                                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-sky-400"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Tempo por Entrega (min)</label>
                                                    <input
                                                        type="number"
                                                        min="1" max="120"
                                                        value={rotaConfig.tempoParadaMin}
                                                        onChange={e => setRotaConfig(c => ({ ...c, tempoParadaMin: Number(e.target.value) }))}
                                                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-sky-400"
                                                    />
                                                </div>
                                            </div>
                                            {podeEscolherVendedor && vendedores.length > 0 && (
                                                <div className="mb-3">
                                                    <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1 block">Motorista</label>
                                                    <select
                                                        value={rotaConfig.vendedorIdRota}
                                                        onChange={e => setRotaConfig(c => ({ ...c, vendedorIdRota: e.target.value }))}
                                                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-sky-400"
                                                    >
                                                        <option value="">Minha rota</option>
                                                        {vendedores.map(v => (
                                                            <option key={v.id} value={v.id}>{v.nome}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                            <button
                                                onClick={handleOrganizarRota}
                                                disabled={isRoteirizando}
                                                className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-[13px] font-bold rounded-lg flex items-center justify-center gap-2 transition-colors"
                                            >
                                                {isRoteirizando ? (
                                                    <><Loader className="h-4 w-4 animate-spin" /> Calculando rota...</>
                                                ) : (
                                                    <><Navigation className="h-4 w-4" /> Capturar GPS e Gerar Rota</>
                                                )}
                                            </button>
                                            <p className="text-[10px] text-gray-400 text-center mt-2">O navegador pedirá permissão de localização</p>
                                        </div>
                                    )}
                                </div>

                                {/* Aviso de clientes sem GPS (quando rota está calculada) */}
                                {rotaOrganizada?.semGPS?.length > 0 && (
                                    <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2">
                                        <MapPin className="h-4 w-4 text-amber-500 shrink-0" />
                                        <p className="text-[11px] text-amber-700">
                                            <strong>{rotaOrganizada.semGPS.length}</strong> entrega{rotaOrganizada.semGPS.length > 1 ? 's' : ''} sem GPS no cadastro (listada{rotaOrganizada.semGPS.length > 1 ? 's' : ''} ao final).
                                        </p>
                                    </div>
                                )}

                                {entregasPendentesFiltradas.length === 0 ? (
                                    <div className="text-center py-12 text-gray-500">
                                        <CheckCircle className="h-10 w-10 text-sky-400 mx-auto mb-2" />
                                        <p className="font-bold text-gray-700">Nenhuma entrega pendente.</p>
                                        <p className="text-[13px]">Todas as entregas do seu roteiro estão concluídas.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                                        {entregasPendentesOrdenadas.map(p => {
                                            const rotaInfo = mapaRota[p.id];
                                            return (
                                                <div key={p.id} className="relative">
                                                    {/* Badge de sequência */}
                                                    {rotaInfo && (
                                                        <div className="absolute -top-1.5 -left-1.5 z-10 flex items-center gap-1">
                                                            <span className="bg-sky-700 text-white text-[11px] font-extrabold w-6 h-6 rounded-full flex items-center justify-center shadow-md">
                                                                {rotaInfo.sequencia}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {/* ETA abaixo do badge */}
                                                    {rotaInfo && (
                                                        <div className="bg-sky-50 border border-sky-100 rounded-t-lg px-3 py-1.5 flex items-center gap-3 text-[10px] text-sky-700 font-semibold">
                                                            <span className="flex items-center gap-0.5">
                                                                <Clock className="h-3 w-3" /> Chegada: {rotaInfo.previsaoChegada}
                                                            </span>
                                                            <span className="text-sky-400">·</span>
                                                            <span className="flex items-center gap-0.5">
                                                                <Navigation className="h-3 w-3" /> {rotaInfo.distanciaKm} km · {rotaInfo.duracaoTrajetoMin} min
                                                            </span>
                                                        </div>
                                                    )}
                                                    {p._tipoEntrega === 'amostra' ? (
                                                        <CardAmostraEntrega
                                                            amostra={p}
                                                            onEntregarAmostra={handleEntregarAmostra}
                                                            podeCheckout={podeEntregas}
                                                        />
                                                    ) : (
                                                        <CardEntregaPendente
                                                            pedido={p}
                                                            onCheckout={setCheckoutPedido}
                                                            podeCheckout={podeEntregas}
                                                            onVerCliente={setClientePopupItem}
                                                        />
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}

                        {aba === 'entregues' && (
                            entregasConcluidasFiltradas.length === 0 ? (
                                <div className="text-center py-12 text-gray-500">
                                    <ClipboardList className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                                    <p className="font-bold text-gray-700">Nenhuma entrega finalizada ainda.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                                    {entregasConcluidasFiltradas.map(p => (
                                        p._tipoEntrega === 'amostra' ? (
                                            <div key={p.id} className="bg-white rounded-xl border border-orange-200 shadow-sm overflow-hidden mb-2">
                                                <div className="p-3 md:p-4">
                                                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                                        <span className="text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">Entregue</span>
                                                        <span className="text-[10px] font-bold text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded">AM#{p.numero}</span>
                                                        {p.embarque?.numero && <span className="text-[10px] text-gray-400">Carga #{p.embarque.numero}</span>}
                                                    </div>
                                                    <p className="font-bold text-[13px] text-gray-900">{p.cliente?.NomeFantasia || p.cliente?.Nome || '-'}</p>
                                                    <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500">
                                                        <span>{p.itens?.length || 0} itens</span>
                                                        <span className="font-semibold text-orange-600">Amostra</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <CardEntregaConcluida
                                                key={p.id}
                                                pedido={p}
                                                podeAjustar={podeAjustar}
                                                onEstornar={handleEstornar}
                                                onEditar={setEditarEntregaPedido}
                                                onVerCliente={setClientePopupItem}
                                            />
                                        )
                                    ))}
                                </div>
                            )
                        )}
                    </>
                )}
            </div>

            {/* Botão flutuante */}
            <button
                onClick={() => setModalNovoLead(true)}
                className="fixed bottom-6 right-4 bg-orange-500 text-white rounded-full w-14 h-14 shadow-lg flex items-center justify-center z-30 active:scale-95 transition-transform"
            >
                <Plus className="h-7 w-7" />
            </button>

            {/* Modal de Atendimento */}
            {modalAtendimento && (
                <ModalAtendimento
                    dados={modalAtendimento}
                    onClose={() => setModalAtendimento(null)}
                    onSalvo={handleAtendimentoSalvo}
                    vendedorId={vendedorId}
                    onAbrirAmostra={({ form, acaoSelecionada, gps, isLead, item, vendedorId: vId, finalizarAtendimento }) => {
                        setModalAmostra({
                            leadId: isLead ? item.id : null,
                            clienteId: !isLead ? item.UUID : null,
                            nomeDestinatario: isLead ? `Lead #${item.numero} · ${item.nomeEstabelecimento}` : (item.NomeFantasia || item.Nome),
                            vendedorId: vId,
                            finalizarAtendimento,
                        });
                    }}
                />
            )}

            {/* Modal de Amostra */}
            {modalAmostra && (
                <ModalAmostra
                    dados={modalAmostra}
                    onClose={() => setModalAmostra(null)}
                    onCriada={(amostraId) => {
                        setModalAmostra(null);
                        if (modalAmostra.finalizarAtendimento) {
                            modalAmostra.finalizarAtendimento(amostraId);
                        }
                    }}
                />
            )}

            {/* Modal Novo Lead */}
            {modalNovoLead && (
                <ModalNovoLead
                    onClose={() => setModalNovoLead(false)}
                    onSalvo={handleNovoLeadSalvo}
                    user={user}
                />
            )}

            {/* Modal Checkout Entrega (Motorista) */}
            {checkoutPedido && (
                <CheckoutEntregaModal
                    pedido={checkoutPedido}
                    onClose={() => setCheckoutPedido(null)}
                    onSuccess={() => {
                        setCheckoutPedido(null);

                        // Automaticamente limpa a rota se foi a ultima entrega
                        if (entregasPendentes.length <= 1) {
                            handleLimparRota(false);
                        } else {
                            setRotaOrganizada(null); // Limpa a rota para forçar recalculo e tirar o concluído
                        }
                        carregarEntregas('pendentes');
                        carregarEntregas('concluidas');
                        toast.success('Entrega registrada com sucesso!');
                    }}
                />
            )}

            {/* Modal Edição de Entrega (Admin) */}
            {editarEntregaPedido && (
                <EditarEntregaModal
                    pedido={editarEntregaPedido}
                    onClose={() => setEditarEntregaPedido(null)}
                    onSuccess={() => {
                        setEditarEntregaPedido(null);
                        setRotaOrganizada(null); // Limpa a rota para evitar dessincronia
                        carregarEntregas('concluidas');
                        carregarEntregas('pendentes');
                    }}
                />
            )}

            {/* Popup de Dados do Cliente/Lead */}
            {clientePopupItem && (
                <ClientePopup
                    cliente={clientePopupItem}
                    onClose={() => setClientePopupItem(null)}
                    onAtualizado={(updated) => {
                        // Atualiza o GPS localmente sem recarregar tudo
                        setClientes(prev => prev.map(c =>
                            c.UUID === updated.UUID ? { ...c, Ponto_GPS: updated.Ponto_GPS } : c
                        ));
                        setClientePopupItem(null);
                    }}
                />
            )}
        </div>
    );
};

export default RotaLeads;
