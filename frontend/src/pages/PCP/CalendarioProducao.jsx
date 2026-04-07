import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, X, Loader2, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import pcpAgendaService from '../../services/pcpAgendaService';
import pcpOrdemService from '../../services/pcpOrdemService';

const STATUS_CORES_BG = {
    PLANEJADA: '#3B82F6',
    EM_PRODUCAO: '#EAB308',
    FINALIZADA: '#22C55E',
    CANCELADA: '#EF4444',
};

export default function CalendarioProducao() {
    const calendarRef = useRef(null);
    const [eventos, setEventos] = useState([]);
    const [modalCriar, setModalCriar] = useState(null); // { start, end }
    const [ordens, setOrdens] = useState([]);
    const [formEvento, setFormEvento] = useState({ ordemProducaoId: '', titulo: '', cor: '#3B82F6', observacoes: '' });
    const [salvando, setSalvando] = useState(false);
    const [modalDetalhe, setModalDetalhe] = useState(null);

    const carregarEventos = useCallback(async (info) => {
        try {
            const params = {};
            if (info) {
                params.dataInicio = info.startStr || info.start?.toISOString();
                params.dataFim = info.endStr || info.end?.toISOString();
            }
            const data = await pcpAgendaService.listar(params);
            setEventos(data.map(ev => ({
                id: ev.id,
                title: ev.titulo,
                start: ev.dataInicio,
                end: ev.dataFim,
                backgroundColor: ev.cor || STATUS_CORES_BG[ev.ordemProducao?.status] || '#3B82F6',
                borderColor: ev.cor || STATUS_CORES_BG[ev.ordemProducao?.status] || '#3B82F6',
                extendedProps: {
                    agendaId: ev.id,
                    ordemProducao: ev.ordemProducao,
                    observacoes: ev.observacoes,
                    cor: ev.cor
                }
            })));
        } catch (err) {
            toast.error('Erro ao carregar agenda');
        }
    }, []);

    useEffect(() => { carregarEventos(); }, [carregarEventos]);

    // Drag-and-drop: mover evento
    const handleEventDrop = async (info) => {
        try {
            await pcpAgendaService.atualizar(info.event.id, {
                dataInicio: info.event.start.toISOString(),
                dataFim: info.event.end?.toISOString() || new Date(info.event.start.getTime() + 3600000).toISOString()
            });
            toast.success('Evento movido');
        } catch (err) {
            info.revert();
            toast.error('Erro ao mover evento');
        }
    };

    // Resize evento
    const handleEventResize = async (info) => {
        try {
            await pcpAgendaService.atualizar(info.event.id, {
                dataInicio: info.event.start.toISOString(),
                dataFim: info.event.end.toISOString()
            });
            toast.success('Evento redimensionado');
        } catch (err) {
            info.revert();
            toast.error('Erro ao redimensionar');
        }
    };

    // Clique em slot vazio -> abrir modal criar
    const handleDateSelect = async (info) => {
        setModalCriar({ start: info.startStr, end: info.endStr });
        setFormEvento({ ordemProducaoId: '', titulo: '', cor: '#3B82F6', observacoes: '' });
        // Carregar ordens pendentes
        try {
            const res = await pcpOrdemService.listar({ status: 'PLANEJADA', tamanhoPagina: 100 });
            const res2 = await pcpOrdemService.listar({ status: 'EM_PRODUCAO', tamanhoPagina: 100 });
            setOrdens([...res.items, ...res2.items]);
        } catch { }
    };

    // Clique em evento -> detalhe
    const handleEventClick = (info) => {
        setModalDetalhe({
            id: info.event.id,
            titulo: info.event.title,
            start: info.event.start,
            end: info.event.end,
            ...info.event.extendedProps
        });
    };

    const criarEvento = async () => {
        if (!formEvento.ordemProducaoId || !formEvento.titulo) {
            toast.error('Selecione uma ordem e informe o titulo');
            return;
        }
        setSalvando(true);
        try {
            await pcpAgendaService.criar({
                ordemProducaoId: formEvento.ordemProducaoId,
                titulo: formEvento.titulo,
                dataInicio: modalCriar.start,
                dataFim: modalCriar.end,
                cor: formEvento.cor,
                observacoes: formEvento.observacoes || null
            });
            toast.success('Evento criado');
            setModalCriar(null);
            carregarEventos();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        } finally {
            setSalvando(false);
        }
    };

    const excluirEvento = async (id) => {
        if (!confirm('Remover este evento da agenda?')) return;
        try {
            await pcpAgendaService.excluir(id);
            toast.success('Evento removido');
            setModalDetalhe(null);
            carregarEventos();
        } catch (err) {
            toast.error('Erro ao remover');
        }
    };

    // Auto-preencher titulo quando seleciona ordem
    const handleOrdemChange = (ordemId) => {
        setFormEvento(prev => {
            const ordem = ordens.find(o => o.id === ordemId);
            return {
                ...prev,
                ordemProducaoId: ordemId,
                titulo: ordem ? `OP #${ordem.numero} - ${ordem.receita?.nome || ''}` : prev.titulo,
                cor: ordem ? (STATUS_CORES_BG[ordem.status] || '#3B82F6') : prev.cor
            };
        });
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Calendario de Producao</h1>
                    <p className="text-sm text-gray-500 mt-1">Arraste e solte para reorganizar o planejamento</p>
                </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
                <FullCalendar
                    ref={calendarRef}
                    plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                    initialView="timeGridWeek"
                    headerToolbar={{
                        left: 'prev,next today',
                        center: 'title',
                        right: 'timeGridWeek,timeGridDay,dayGridMonth'
                    }}
                    locale="pt-br"
                    events={eventos}
                    editable={true}
                    selectable={true}
                    selectMirror={true}
                    droppable={true}
                    eventDrop={handleEventDrop}
                    eventResize={handleEventResize}
                    select={handleDateSelect}
                    eventClick={handleEventClick}
                    datesSet={carregarEventos}
                    slotMinTime="05:00:00"
                    slotMaxTime="22:00:00"
                    allDaySlot={false}
                    height="auto"
                    expandRows={true}
                    slotDuration="00:30:00"
                    buttonText={{
                        today: 'Hoje',
                        month: 'Mes',
                        week: 'Semana',
                        day: 'Dia'
                    }}
                    eventTimeFormat={{
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    }}
                />
            </div>

            {/* Modal Criar Evento */}
            {modalCriar && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-800">Agendar Producao</h3>
                            <button onClick={() => setModalCriar(null)} className="p-1 text-gray-400 hover:text-gray-600">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="text-xs text-gray-400 mb-4">
                            {new Date(modalCriar.start).toLocaleString('pt-BR')} — {new Date(modalCriar.end).toLocaleString('pt-BR')}
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Ordem de Producao *</label>
                                <select
                                    value={formEvento.ordemProducaoId}
                                    onChange={e => handleOrdemChange(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                >
                                    <option value="">Selecione...</option>
                                    {ordens.map(o => (
                                        <option key={o.id} value={o.id}>
                                            #{o.numero} - {o.receita?.nome} ({o.status})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Titulo *</label>
                                <input
                                    type="text"
                                    value={formEvento.titulo}
                                    onChange={e => setFormEvento(prev => ({ ...prev, titulo: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Cor</label>
                                    <input
                                        type="color"
                                        value={formEvento.cor}
                                        onChange={e => setFormEvento(prev => ({ ...prev, cor: e.target.value }))}
                                        className="w-full h-9 rounded-lg border border-gray-300 cursor-pointer"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Observacoes</label>
                                    <input
                                        type="text"
                                        value={formEvento.observacoes}
                                        onChange={e => setFormEvento(prev => ({ ...prev, observacoes: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setModalCriar(null)} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
                            <button
                                onClick={criarEvento}
                                disabled={salvando}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                            >
                                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
                                Agendar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Detalhe Evento */}
            {modalDetalhe && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-800">{modalDetalhe.titulo}</h3>
                            <button onClick={() => setModalDetalhe(null)} className="p-1 text-gray-400 hover:text-gray-600">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="space-y-2 text-sm text-gray-600">
                            <p><strong>Inicio:</strong> {modalDetalhe.start?.toLocaleString('pt-BR')}</p>
                            <p><strong>Fim:</strong> {modalDetalhe.end?.toLocaleString('pt-BR')}</p>
                            {modalDetalhe.ordemProducao && (
                                <>
                                    <p><strong>OP:</strong> #{modalDetalhe.ordemProducao.numero} — {modalDetalhe.ordemProducao.status}</p>
                                    <p><strong>Receita:</strong> {modalDetalhe.ordemProducao.receita?.nome}</p>
                                    <p><strong>Qtd:</strong> {parseFloat(modalDetalhe.ordemProducao.quantidadePlanejada).toFixed(1)} {modalDetalhe.ordemProducao.receita?.itemPcp?.unidade}</p>
                                </>
                            )}
                            {modalDetalhe.observacoes && <p><strong>Obs:</strong> {modalDetalhe.observacoes}</p>}
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => excluirEvento(modalDetalhe.id)}
                                className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                            >
                                Remover
                            </button>
                            <button onClick={() => setModalDetalhe(null)} className="px-4 py-2 text-sm bg-gray-100 rounded-lg">Fechar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
