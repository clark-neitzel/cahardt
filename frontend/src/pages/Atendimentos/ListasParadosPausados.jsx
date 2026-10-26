import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import leadService from '../../services/leadService';
import atendimentoService from '../../services/atendimentoService';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import ModalEditarLead from '../Leads/ModalEditarLead';

const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-';
// pausadoAte vem como ISO de fim do dia em -03:00: converte para o dia de São Paulo
const fmtDia = (d) => {
    if (!d) return '-';
    const s = new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
};
const lista = (r) => Array.isArray(r) ? r : (r?.data || []);

const TH = 'text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide';

// "Leads parados" (gestão): leads ativos sem visita/atendimento há tempo
export const LeadsParados = () => {
    const { user } = useAuth();
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editar, setEditar] = useState(null);

    const carregar = useCallback(async () => {
        setLoading(true);
        try {
            setLeads(lista(await leadService.listar({ parados: 1, limit: 500 })));
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar leads parados.');
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { carregar(); }, [carregar]);

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Leads parados ({leads.length})</span>
                <button onClick={carregar} disabled={loading} className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 disabled:opacity-50" title="Atualizar">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Mobile: cards */}
            <div className="md:hidden space-y-3 p-3">
                {loading && <p className="text-center py-8 text-gray-500 text-sm">Carregando...</p>}
                {!loading && leads.length === 0 && <p className="text-center py-8 text-gray-500 text-sm">Nenhum lead parado.</p>}
                {!loading && leads.map(l => (
                    <div key={l.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                        <div className="font-semibold text-gray-900 truncate">{l.nomeEstabelecimento || `Lead #${l.numero}`}</div>
                        <div className="text-sm text-gray-500 mt-1">
                            {[l.cidade, l.vendedor?.nome].filter(Boolean).join(' · ') || '-'}
                        </div>
                        {l.ultimoAtendimento && <div className="text-xs text-gray-500 mt-1">Último atend.: {fmtData(l.ultimoAtendimento)}{l.ultimoAtendimentoAcao ? ` · ${l.ultimoAtendimentoAcao}` : ''}</div>}
                        <div className="text-xs text-gray-500 mt-1">Criado em {fmtData(l.createdAt || l.criadoEm)} · Próxima visita {fmtData(l.proximaVisita)}</div>
                        <button onClick={() => setEditar(l)} className="mt-3 w-full min-h-[44px] px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm">Abrir</button>
                    </div>
                ))}
            </div>

            {/* Desktop: tabela */}
            <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className={TH}>Lead</th><th className={TH}>Cidade</th><th className={TH}>Vendedor</th>
                            <th className={TH}>Criado em</th><th className={TH}>Próxima visita</th><th className={TH}>Último atend.</th><th className={TH}></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200 text-sm">
                        {loading && <tr><td colSpan={7} className="text-center py-12 text-gray-500">Carregando...</td></tr>}
                        {!loading && leads.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-gray-500">Nenhum lead parado.</td></tr>}
                        {!loading && leads.map(l => (
                            <tr key={l.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2.5 font-medium text-gray-900">{l.nomeEstabelecimento || `Lead #${l.numero}`}</td>
                                <td className="px-3 py-2.5 text-gray-600">{l.cidade || '-'}</td>
                                <td className="px-3 py-2.5 text-gray-600">{l.vendedor?.nome || '-'}</td>
                                <td className="px-3 py-2.5 text-gray-600">{fmtData(l.createdAt || l.criadoEm)}</td>
                                <td className="px-3 py-2.5 text-gray-600">{fmtData(l.proximaVisita)}</td>
                                <td className="px-3 py-2.5 text-gray-600">{l.ultimoAtendimento ? `${fmtData(l.ultimoAtendimento)}${l.ultimoAtendimentoAcao ? ` · ${l.ultimoAtendimentoAcao}` : ''}` : '-'}</td>
                                <td className="px-3 py-2.5 text-right">
                                    <button onClick={() => setEditar(l)} className="px-4 py-1.5 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm">Abrir</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {editar && (
                <ModalEditarLead
                    lead={editar}
                    user={user}
                    onClose={() => setEditar(null)}
                    onSalvo={() => { setEditar(null); carregar(); }}
                    onExcluido={() => { setEditar(null); carregar(); }}
                />
            )}
        </div>
    );
};

// "Pausados" (gestão): clientes com visitas pausadas e botão para retomar
export const ClientesPausados = () => {
    const [clientes, setClientes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [retomando, setRetomando] = useState(null);

    const carregar = useCallback(async () => {
        setLoading(true);
        try {
            setClientes(lista(await atendimentoService.listarComFiltros({ pausados: 1 })));
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar clientes pausados.');
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { carregar(); }, [carregar]);

    const retomar = async (c) => {
        if (retomando) return;
        setRetomando(c.UUID);
        try {
            await api.patch(`/clientes/${c.UUID}/retomar-visitas`);
            toast.success('Visitas retomadas.');
            await carregar();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao retomar visitas.');
        } finally {
            setRetomando(null);
        }
    };

    const nome = (c) => c.NomeFantasia || c.Nome || '-';
    const obs = (c) => c.observacao || '';

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Clientes pausados ({clientes.length})</span>
                <button onClick={carregar} disabled={loading} className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 disabled:opacity-50" title="Atualizar">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="md:hidden space-y-3 p-3">
                {loading && <p className="text-center py-8 text-gray-500 text-sm">Carregando...</p>}
                {!loading && clientes.length === 0 && <p className="text-center py-8 text-gray-500 text-sm">Nenhum cliente pausado.</p>}
                {!loading && clientes.map(c => (
                    <div key={c.UUID} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-gray-900 truncate">{nome(c)}</span>
                            <span className="shrink-0 px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">até {fmtDia(c.pausadoAte)}</span>
                        </div>
                        <div className="text-sm text-gray-500 mt-1">{[c.End_Cidade, c.vendedor?.nome].filter(Boolean).join(' · ') || '-'}</div>
                        {obs(c) && <div className="text-xs text-gray-600 mt-1 line-clamp-3">{obs(c)}</div>}
                        <button onClick={() => retomar(c)} disabled={retomando === c.UUID} className="mt-3 w-full min-h-[44px] px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm disabled:opacity-60">
                            {retomando === c.UUID ? 'Retomando...' : 'Retomar visitas'}
                        </button>
                    </div>
                ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className={TH}>Cliente</th><th className={TH}>Cidade</th><th className={TH}>Vendedor</th>
                            <th className={TH}>Pausado até</th><th className={TH}>Observação</th><th className={TH}></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200 text-sm">
                        {loading && <tr><td colSpan={6} className="text-center py-12 text-gray-500">Carregando...</td></tr>}
                        {!loading && clientes.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-gray-500">Nenhum cliente pausado.</td></tr>}
                        {!loading && clientes.map(c => (
                            <tr key={c.UUID} className="hover:bg-gray-50">
                                <td className="px-3 py-2.5 font-medium text-gray-900">{nome(c)}</td>
                                <td className="px-3 py-2.5 text-gray-600">{c.End_Cidade || '-'}</td>
                                <td className="px-3 py-2.5 text-gray-600">{c.vendedor?.nome || '-'}</td>
                                <td className="px-3 py-2.5 text-gray-600">{fmtDia(c.pausadoAte)}</td>
                                <td className="px-3 py-2.5 text-gray-600 max-w-xs truncate" title={obs(c)}>{obs(c) || '-'}</td>
                                <td className="px-3 py-2.5 text-right">
                                    <button onClick={() => retomar(c)} disabled={retomando === c.UUID} className="px-4 py-1.5 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm disabled:opacity-60">
                                        {retomando === c.UUID ? 'Retomando...' : 'Retomar visitas'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
