import { useState, useEffect, useCallback, Fragment } from 'react';
import {
    BellRing, RefreshCw, Send, Plus, Trash2, ChevronDown, ChevronUp,
    MessageCircle, Mail, Smartphone, AlertTriangle, CheckCircle2, XCircle,
    Eye, Settings2, History, Users, Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import cobrancaService from '../../services/cobrancaService';
import SelectBusca from '../../components/SelectBusca';

const fmtMoeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '-';
const fmtDataHora = (d) => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';

const SITUACAO_LABEL = {
    SEM_CONFIG: { txt: 'Sem régua configurada', cls: 'bg-gray-100 text-gray-700' },
    DESATIVADA: { txt: 'Régua desativada', cls: 'bg-gray-100 text-gray-700' },
    NAO_COBRA_VENCIDA: { txt: 'Não cobra vencida', cls: 'bg-gray-100 text-gray-700' },
    AGUARDANDO_PRIMEIRO: { txt: 'Aguardando 1º aviso', cls: 'bg-blue-100 text-blue-800' },
    AGUARDANDO_FREQUENCIA: { txt: 'Aguardando repetição', cls: 'bg-blue-100 text-blue-800' },
    LIMITE_ATINGIDO: { txt: 'Limite de avisos', cls: 'bg-amber-100 text-amber-700' },
    ENVIAR: { txt: 'Envia no próximo disparo', cls: 'bg-green-100 text-green-800' },
    SEM_VENCIDAS: { txt: 'Sem vencidas', cls: 'bg-gray-100 text-gray-700' }
};

const CANAL_ICONE = { WHATSAPP: MessageCircle, EMAIL: Mail, SMS: Smartphone };

const BadgeEnvio = ({ envio }) => {
    if (!envio) return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">Nunca cobrado</span>;
    const Icone = CANAL_ICONE[envio.canal] || Send;
    const ok = envio.status === 'ENVIADO';
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full ${ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
            <Icone className="h-3 w-3" />
            {ok ? 'Enviado' : 'Erro'} · {fmtDataHora(envio.createdAt)}
        </span>
    );
};

// ══════════════════ ABA: INADIMPLENTES ══════════════════

function AbaInadimplentes() {
    const [dados, setDados] = useState(null);
    const [global, setGlobal] = useState(null);
    const [loading, setLoading] = useState(true);
    const [cobrando, setCobrando] = useState(null);
    const [executando, setExecutando] = useState(false);
    const [detalhe, setDetalhe] = useState(null); // item aberto (mobile/desktop)

    const carregar = useCallback(async () => {
        setLoading(true);
        try {
            const [painel, cfgGlobal] = await Promise.all([
                cobrancaService.painel(),
                cobrancaService.getConfigGlobal()
            ]);
            setDados(painel);
            setGlobal(cfgGlobal);
        } catch (e) {
            toast.error('Erro ao carregar inadimplentes');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { carregar(); }, [carregar]);

    const salvarGlobal = async (mudanca, msg) => {
        const novo = { ...global, ...mudanca };
        setGlobal(novo);
        try {
            await cobrancaService.salvarConfigGlobal(novo);
            if (msg) toast.success(msg);
        } catch (e) { toast.error('Erro ao salvar'); carregar(); }
    };

    const toggleRegua = () => salvarGlobal({ ativo: !global.ativo }, !global.ativo ? 'Régua automática LIGADA' : 'Régua automática pausada');

    const toggleDia = (sigla) => {
        const atual = global.diasSemana || [];
        const novo = atual.includes(sigla) ? atual.filter(d => d !== sigla) : [...atual, sigla];
        if (!novo.length) { toast.error('Deixe ao menos um dia de envio'); return; }
        salvarGlobal({ diasSemana: novo });
    };

    const executarAgora = async () => {
        if (!window.confirm('Iniciar a fila de cobrança AGORA? Os envios saem 1 por minuto, conferindo no Conta Azul antes de cada um.')) return;
        setExecutando(true);
        try {
            const r = await cobrancaService.executarRegua();
            if (r.ok) toast.success('Fila iniciada! Os envios saem 1 por minuto — acompanhe pelo Histórico.');
            else toast.error(r.motivo || 'Falha ao iniciar a fila');
            carregar();
        } catch (e) { toast.error('Erro ao executar a régua'); }
        finally { setExecutando(false); }
    };

    const cobrarAgora = async (item) => {
        if (!window.confirm(`Enviar a cobrança de ${item.cliente.nome} agora?`)) return;
        setCobrando(item.cliente.id);
        try {
            const r = await cobrancaService.cobrarCliente(item.cliente.id);
            if (r.ok) toast.success('Cobrança enviada!');
            else toast.error('Envio falhou — veja o painel (se WhatsApp falhou, a tarefa foi gerada)');
            carregar();
        } catch (e) { toast.error('Erro ao enviar cobrança'); }
        finally { setCobrando(null); }
    };

    if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    if (!dados) return null;

    const { totais, itens } = dados;

    return (
        <div className="space-y-4">
            {/* Controle da régua automática */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <button onClick={toggleRegua}
                        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${global?.ativo ? 'bg-primary' : 'bg-gray-300'}`}>
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${global?.ativo ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                    <div className="flex-1">
                        <div className="text-sm font-semibold text-gray-900">
                            Cobrança automática {global?.ativo ? 'LIGADA' : 'desligada'}
                        </div>
                        <div className="text-xs text-gray-500">Dispara nos dias marcados, a partir do horário abaixo (horário de São Paulo).</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-700">Horário:</label>
                        <input type="time" value={global?.horaEnvio || '08:30'} onChange={e => salvarGlobal({ horaEnvio: e.target.value })}
                            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                    </div>
                    <button onClick={executarAgora} disabled={executando}
                        className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-60 min-h-[44px] md:min-h-0">
                        {executando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Executar agora
                    </button>
                </div>
                <div className="flex flex-col md:flex-row md:items-center gap-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium text-gray-700 mr-1">Envia em:</span>
                        {['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'].map(d => (
                            <button key={d} onClick={() => toggleDia(d)}
                                className={`px-2.5 py-1.5 rounded-full text-xs font-bold min-w-[42px] ${global?.diasSemana?.includes(d) ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                                {d}
                            </button>
                        ))}
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-700 md:ml-auto">
                        <input type="checkbox" checked={global?.prorrogarFimDeSemana !== false}
                            onChange={e => salvarGlobal({ prorrogarFimDeSemana: e.target.checked }, 'Regra de fim de semana salva')}
                            className="h-4 w-4 accent-[#00754A]" />
                        Vencimento no fim de semana só conta como vencido na segunda
                    </label>
                </div>
            </div>

            {/* Fila em andamento */}
            {dados.execucao?.executando && (
                <div className="bg-mint/50 border border-primary/20 rounded-xl p-3 flex items-center gap-3 text-sm text-primaryDark">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    <span>Fila de envio em andamento: <b>{dados.execucao.processados}/{dados.execucao.total}</b> (1 mensagem por minuto, conferindo no Conta Azul antes de cada envio)</span>
                    <button onClick={carregar} className="ml-auto p-1.5 text-primaryDark hover:bg-mint rounded-full"><RefreshCw className="h-4 w-4" /></button>
                </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <div className="text-xs font-bold uppercase tracking-widest text-gray-600">Valor vencido</div>
                    <div className="text-xl md:text-2xl font-bold text-red-600 mt-1">{fmtMoeda(totais.valorVencido)}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <div className="text-xs font-bold uppercase tracking-widest text-gray-600">Clientes</div>
                    <div className="text-xl md:text-2xl font-bold text-gray-900 mt-1">{totais.clientes}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <div className="text-xs font-bold uppercase tracking-widest text-gray-600">Erro no envio</div>
                    <div className="text-xl md:text-2xl font-bold text-amber-600 mt-1">{totais.comErro}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <div className="text-xs font-bold uppercase tracking-widest text-gray-600">Sem celular</div>
                    <div className="text-xl md:text-2xl font-bold text-amber-600 mt-1">{totais.semCelular}</div>
                </div>
            </div>

            {/* Lista */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                    <Users className="h-4 w-4 text-amber-600" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">CLIENTES COM PARCELAS VENCIDAS</span>
                    <button onClick={carregar} className="ml-auto p-1.5 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100">
                        <RefreshCw className="h-4 w-4" />
                    </button>
                </div>

                {itens.length === 0 && (
                    <div className="p-8 text-center text-sm text-gray-500">
                        Nenhum cliente inadimplente. 🎉
                    </div>
                )}

                {/* Mobile: cards */}
                <div className="md:hidden space-y-3 p-3">
                    {itens.map((item, idx) => {
                        const sit = SITUACAO_LABEL[item.situacao] || SITUACAO_LABEL.SEM_CONFIG;
                        return (
                            <div key={idx} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-semibold text-gray-900 truncate">{item.cliente.nome}</span>
                                    <span className="font-bold text-red-600 whitespace-nowrap ml-2">{fmtMoeda(item.valorTotal)}</span>
                                </div>
                                <div className="text-xs text-gray-500 mb-2">
                                    {item.forma !== 'PADRAO' ? item.forma : 'Forma padrão'} · {item.parcelas.length} parcela(s) · {item.diasAtrasoMax} dia(s) de atraso
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                                    <BadgeEnvio envio={item.ultimoEnvio} />
                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${sit.cls}`}>{sit.txt}</span>
                                    {!item.cliente.celular && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700 inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Sem celular</span>}
                                    {item.tarefaAberta && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-700">Tarefa aberta</span>}
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => setDetalhe(detalhe === item ? null : item)}
                                        className="flex-1 px-3 py-2 bg-white border border-primary text-primary rounded-full font-medium text-xs min-h-[44px]">
                                        {detalhe === item ? 'Fechar' : 'Detalhes'}
                                    </button>
                                    <button onClick={() => cobrarAgora(item)} disabled={cobrando === item.cliente.id}
                                        className="flex-1 px-3 py-2 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-xs disabled:opacity-60 min-h-[44px]">
                                        {cobrando === item.cliente.id ? 'Enviando...' : 'Cobrar agora'}
                                    </button>
                                </div>
                                {detalhe === item && <DetalheParcelas item={item} />}
                            </div>
                        );
                    })}
                </div>

                {/* Desktop: tabela */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Forma</th>
                                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Vencido</th>
                                <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Atraso</th>
                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Último envio</th>
                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Situação na régua</th>
                                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 text-sm">
                            {itens.map((item, idx) => {
                                const sit = SITUACAO_LABEL[item.situacao] || SITUACAO_LABEL.SEM_CONFIG;
                                return (
                                    <Fragment key={idx}>
                                        <tr className="hover:bg-gray-50">
                                            <td className="px-5 py-3 text-gray-900">
                                                <div className="font-medium">{item.cliente.nome}</div>
                                                <div className="text-xs text-gray-500 flex items-center gap-2">
                                                    {item.cliente.celular
                                                        ? <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3 text-green-600" />{item.cliente.celular}</span>
                                                        : <span className="inline-flex items-center gap-1 text-red-600 font-semibold"><AlertTriangle className="h-3 w-3" />sem celular</span>}
                                                    {item.cliente.email ? <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3 text-gray-500" />{item.cliente.email}</span> : null}
                                                </div>
                                            </td>
                                            <td className="px-5 py-3 text-gray-600">{item.forma !== 'PADRAO' ? item.forma : <span className="text-gray-500 italic">Padrão</span>}</td>
                                            <td className="px-5 py-3 text-right font-semibold text-red-600">{fmtMoeda(item.valorTotal)}<div className="text-xs font-normal text-gray-500">{item.parcelas.length} parcela(s)</div></td>
                                            <td className="px-5 py-3 text-center"><span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">{item.diasAtrasoMax}d</span></td>
                                            <td className="px-5 py-3">
                                                <BadgeEnvio envio={item.ultimoEnvio} />
                                                {item.ultimoEnvio?.erro ? <div className="text-xs text-red-600 mt-1 max-w-[220px] truncate" title={item.ultimoEnvio.erro}>{item.ultimoEnvio.erro}</div> : null}
                                                {item.tarefaAberta && <div className="mt-1"><span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-700">Tarefa aberta p/ resolver</span></div>}
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${sit.cls}`}>{sit.txt}</span>
                                                {item.proximoEnvio ? <div className="text-xs text-gray-500 mt-1">próximo: {fmtData(item.proximoEnvio)}</div> : null}
                                                {item.numeroAviso > 0 && item.situacao !== 'SEM_CONFIG' ? <div className="text-xs text-gray-500 mt-0.5">aviso nº {item.numeroAviso}</div> : null}
                                            </td>
                                            <td className="px-5 py-3 text-right whitespace-nowrap">
                                                <button onClick={() => setDetalhe(detalhe === item ? null : item)}
                                                    className="p-1.5 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 mr-1" title="Ver parcelas">
                                                    <Eye className="h-4 w-4" />
                                                </button>
                                                <button onClick={() => cobrarAgora(item)} disabled={cobrando === item.cliente.id}
                                                    className="px-3 py-1.5 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-xs disabled:opacity-60">
                                                    {cobrando === item.cliente.id ? 'Enviando...' : 'Cobrar agora'}
                                                </button>
                                            </td>
                                        </tr>
                                        {detalhe === item && (
                                            <tr>
                                                <td colSpan={7} className="px-5 pb-4 bg-gray-50"><DetalheParcelas item={item} /></td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

const DetalheParcelas = ({ item }) => (
    <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Parcelas vencidas</div>
        <div className="divide-y divide-gray-100 bg-white">
            {item.parcelas.map((p, i) => (
                <div key={i} className="px-3 py-2 flex items-center justify-between text-sm">
                    <span className="text-gray-600">
                        {p.pedidoNumero != null ? `Pedido ${p.pedidoNumero} · ` : ''}venceu {fmtData(p.vencimento)}
                    </span>
                    <span className="flex items-center gap-3">
                        <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-700">{p.diasAtraso}d</span>
                        <span className="font-semibold text-gray-900">{fmtMoeda(p.valor)}</span>
                    </span>
                </div>
            ))}
        </div>
    </div>
);

// ══════════════════ ABA: RÉGUA (configuração por forma) ══════════════════

const CONFIG_VAZIA = {
    formaRecebimento: '', ativo: true, diasPrimeiroAviso: 1, repetirCadaDias: 7, maxAvisos: 5,
    enviarVencida: true, lembreteAntes: false, diasLembrete: 3,
    canalWhatsapp: true, canalEmail: false, canalSms: false,
    templates: [], templateLembrete: '', responsavelTarefaId: '', horaEnvio: ''
};

function CardConfig({ config, formas, equipe, onSalvar, onExcluir, novo = false }) {
    const [expandido, setExpandido] = useState(novo);
    const [dados, setDados] = useState({ ...CONFIG_VAZIA, ...config, responsavelTarefaId: config?.responsavelTarefaId || '', horaEnvio: config?.horaEnvio || '' });
    const [salvando, setSalvando] = useState(false);
    const [previewTexto, setPreviewTexto] = useState(null);

    const set = (campo, valor) => setDados(d => ({ ...d, [campo]: valor }));

    const salvar = async () => {
        if (!dados.formaRecebimento) { toast.error('Escolha a forma de recebimento'); return; }
        if (dados.canalWhatsapp && !dados.responsavelTarefaId) {
            toast.error('Escolha o responsável pela tarefa quando o WhatsApp falhar');
            return;
        }
        setSalvando(true);
        try {
            await onSalvar({ ...dados, responsavelTarefaId: dados.responsavelTarefaId || null, horaEnvio: dados.horaEnvio || null });
            if (novo) setDados({ ...CONFIG_VAZIA });
        } finally { setSalvando(false); }
    };

    const verPreview = async (texto) => {
        try {
            const r = await cobrancaService.preview(texto);
            setPreviewTexto(r.preview);
        } catch (e) { toast.error('Erro ao gerar preview'); }
    };

    const addTemplate = () => set('templates', [...(dados.templates || []), { nome: `Aviso ${(dados.templates?.length || 0) + 1}`, texto: '' }]);
    const setTemplate = (i, texto) => set('templates', dados.templates.map((t, idx) => idx === i ? { ...t, texto } : t));
    const rmTemplate = (i) => set('templates', dados.templates.filter((_, idx) => idx !== i));

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <button onClick={() => setExpandido(!expandido)} className="w-full flex items-center gap-3 px-5 py-3.5 text-left min-h-[44px]">
                {novo ? <Plus className="h-4 w-4 text-primary" /> : (
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dados.ativo ? 'bg-green-500' : 'bg-gray-300'}`} />
                )}
                <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 text-sm truncate">
                        {novo ? 'Adicionar forma de recebimento' : (dados.formaRecebimento === 'PADRAO' ? 'PADRÃO (todas as demais formas)' : dados.formaRecebimento)}
                    </div>
                    {!novo && (
                        <div className="text-xs text-gray-500">
                            1º aviso {dados.diasPrimeiroAviso}d após vencer · repete a cada {dados.repetirCadaDias}d · máx {dados.maxAvisos} avisos
                            {dados.lembreteAntes ? ` · lembrete ${dados.diasLembrete}d antes` : ''}
                            {dados.horaEnvio ? ` · envia às ${dados.horaEnvio}` : ''}
                        </div>
                    )}
                </div>
                {!novo && (
                    <div className="hidden md:flex items-center gap-1">
                        {dados.canalWhatsapp && <MessageCircle className="h-4 w-4 text-green-600" />}
                        {dados.canalEmail && <Mail className="h-4 w-4 text-blue-600" />}
                        {dados.canalSms && <Smartphone className="h-4 w-4 text-purple-600" />}
                    </div>
                )}
                {expandido ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
            </button>

            {expandido && (
                <div className="border-t border-gray-100 p-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-medium text-gray-700 block mb-1">Forma de recebimento</label>
                            <SelectBusca value={dados.formaRecebimento} onChange={e => set('formaRecebimento', e.target.value)} className="w-full" disabled={!novo && dados.formaRecebimento === 'PADRAO'}>
                                <option value="">Selecione...</option>
                                {formas.map(f => <option key={f} value={f}>{f === 'PADRAO' ? 'PADRÃO (todas as demais formas)' : f}</option>)}
                            </SelectBusca>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 block mb-1">Responsável pela tarefa (falha no WhatsApp)</label>
                            <SelectBusca value={dados.responsavelTarefaId} onChange={e => set('responsavelTarefaId', e.target.value)} className="w-full">
                                <option value="">Selecione quem resolve...</option>
                                {equipe.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                            </SelectBusca>
                            <p className="text-xs text-gray-500 mt-1">Sem celular ou bot recusou → cria tarefa com alerta para essa pessoa cadastrar o número, iniciar a conversa no bot e cobrar manualmente.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label className="text-sm font-medium text-gray-700 block mb-1">1º aviso (dias após vencer)</label>
                            <input type="number" min="0" value={dados.diasPrimeiroAviso} onChange={e => set('diasPrimeiroAviso', e.target.value)}
                                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 block mb-1">Repetir a cada (dias)</label>
                            <input type="number" min="1" value={dados.repetirCadaDias} onChange={e => set('repetirCadaDias', e.target.value)}
                                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 block mb-1">Máximo de avisos</label>
                            <input type="number" min="1" value={dados.maxAvisos} onChange={e => set('maxAvisos', e.target.value)}
                                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 block mb-1">Horário de envio</label>
                            <input type="time" value={dados.horaEnvio || ''} onChange={e => set('horaEnvio', e.target.value)}
                                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                            <p className="text-xs text-gray-500 mt-1">Vazio = usa o horário geral</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="flex items-center gap-2 text-sm text-gray-700 min-h-[44px] md:min-h-0">
                            <input type="checkbox" checked={dados.enviarVencida} onChange={e => set('enviarVencida', e.target.checked)} className="h-4 w-4 accent-[#00754A]" />
                            Cobrar faturas vencidas
                        </label>
                        <div className="flex items-center gap-2 flex-wrap">
                            <label className="flex items-center gap-2 text-sm text-gray-700 min-h-[44px] md:min-h-0">
                                <input type="checkbox" checked={dados.lembreteAntes} onChange={e => set('lembreteAntes', e.target.checked)} className="h-4 w-4 accent-[#00754A]" />
                                Lembrete antes de vencer
                            </label>
                            {dados.lembreteAntes && (
                                <span className="flex items-center gap-1 text-sm text-gray-700">
                                    <input type="number" min="1" value={dados.diasLembrete} onChange={e => set('diasLembrete', e.target.value)}
                                        className="w-16 border border-gray-300 rounded px-2 py-1 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                                    dia(s) antes
                                </span>
                            )}
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-700 block mb-2">Canais de envio</label>
                        <div className="flex flex-wrap gap-3">
                            <label className={`flex items-center gap-2 px-3 py-2 rounded-full border text-sm cursor-pointer min-h-[44px] md:min-h-0 ${dados.canalWhatsapp ? 'border-primary bg-mint/40 text-primaryDark font-semibold' : 'border-gray-300 text-gray-600'}`}>
                                <input type="checkbox" className="hidden" checked={dados.canalWhatsapp} onChange={e => set('canalWhatsapp', e.target.checked)} />
                                <MessageCircle className="h-4 w-4" /> WhatsApp
                            </label>
                            <label className={`flex items-center gap-2 px-3 py-2 rounded-full border text-sm cursor-pointer min-h-[44px] md:min-h-0 ${dados.canalEmail ? 'border-primary bg-mint/40 text-primaryDark font-semibold' : 'border-gray-300 text-gray-600'}`}>
                                <input type="checkbox" className="hidden" checked={dados.canalEmail} onChange={e => set('canalEmail', e.target.checked)} />
                                <Mail className="h-4 w-4" /> E-mail
                            </label>
                            <label className={`flex items-center gap-2 px-3 py-2 rounded-full border text-sm cursor-pointer min-h-[44px] md:min-h-0 ${dados.canalSms ? 'border-primary bg-mint/40 text-primaryDark font-semibold' : 'border-gray-300 text-gray-600'}`}>
                                <input type="checkbox" className="hidden" checked={dados.canalSms} onChange={e => set('canalSms', e.target.checked)} />
                                <Smartphone className="h-4 w-4" /> SMS
                            </label>
                        </div>
                    </div>

                    {/* Mensagens */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium text-gray-700">Mensagens de cobrança (aviso 1, 2, 3... — a última repete)</label>
                            <button onClick={addTemplate} className="px-3 py-1.5 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-xs inline-flex items-center gap-1">
                                <Plus className="h-3 w-3" /> Adicionar mensagem
                            </button>
                        </div>
                        {(!dados.templates || dados.templates.length === 0) && (
                            <p className="text-xs text-gray-500 mb-2">Sem mensagens próprias — será usada a mensagem padrão do sistema. Variáveis: {'{nome}'} {'{valor_total}'} {'{parcelas}'} {'{qtd_parcelas}'} {'{dias_atraso}'} {'{vencimento}'}</p>
                        )}
                        <div className="space-y-3">
                            {(dados.templates || []).map((t, i) => (
                                <div key={i} className="border border-gray-200 rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Aviso nº {i + 1}</span>
                                        <div className="flex gap-1">
                                            <button onClick={() => verPreview(t.texto)} className="p-1.5 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100" title="Ver como o cliente recebe">
                                                <Eye className="h-4 w-4" />
                                            </button>
                                            <button onClick={() => rmTemplate(i)} className="p-1.5 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-100" title="Remover">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <textarea rows={4} value={t.texto} onChange={e => setTemplate(i, e.target.value)}
                                        placeholder={'Olá, *{nome}*! Consta em aberto R$ {valor_total}:\n\n{parcelas}\n\nQualquer dúvida estamos à disposição!'}
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none font-mono" />
                                </div>
                            ))}
                        </div>
                    </div>

                    {dados.lembreteAntes && (
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-sm font-medium text-gray-700">Mensagem do lembrete (antes de vencer)</label>
                                <button onClick={() => verPreview(dados.templateLembrete)} className="p-1.5 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100" title="Preview">
                                    <Eye className="h-4 w-4" />
                                </button>
                            </div>
                            <textarea rows={3} value={dados.templateLembrete || ''} onChange={e => set('templateLembrete', e.target.value)}
                                placeholder="Vazio = mensagem padrão do sistema"
                                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none font-mono" />
                        </div>
                    )}

                    {/* Preview estilo WhatsApp */}
                    {previewTexto != null && (
                        <div className="bg-[#e5ddd5] rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Como o cliente recebe (exemplo)</span>
                                <button onClick={() => setPreviewTexto(null)} className="p-1 text-gray-500 hover:text-gray-700 rounded-full"><XCircle className="h-4 w-4" /></button>
                            </div>
                            <div className="bg-white rounded-lg rounded-tl-none shadow-sm p-3 max-w-md text-sm text-gray-800 whitespace-pre-wrap">{previewTexto}</div>
                        </div>
                    )}

                    <div className="flex flex-col md:flex-row gap-2 md:justify-between pt-2 border-t border-gray-100">
                        {!novo ? (
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                <input type="checkbox" checked={dados.ativo} onChange={e => set('ativo', e.target.checked)} className="h-4 w-4 accent-[#00754A]" />
                                Régua ativa para esta forma
                            </label>
                        ) : <span />}
                        <div className="flex gap-2">
                            {!novo && onExcluir && (
                                <button onClick={onExcluir} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-full font-semibold text-sm min-h-[44px] md:min-h-0">
                                    Excluir
                                </button>
                            )}
                            <button onClick={salvar} disabled={salvando}
                                className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-60 min-h-[44px] md:min-h-0">
                                {salvando ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function AbaConfiguracao() {
    const [configs, setConfigs] = useState([]);
    const [formas, setFormas] = useState([]);
    const [equipe, setEquipe] = useState([]);
    const [loading, setLoading] = useState(true);

    const carregar = useCallback(async () => {
        setLoading(true);
        try {
            const [c, f, e] = await Promise.all([
                cobrancaService.listarConfigs(),
                cobrancaService.listarFormas(),
                cobrancaService.listarEquipe()
            ]);
            setConfigs(c.configs || []);
            setFormas(f.formas || []);
            setEquipe(e.equipe || []);
        } catch (err) { toast.error('Erro ao carregar configurações'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { carregar(); }, [carregar]);

    const criar = async (dados) => {
        try {
            await cobrancaService.criarConfig(dados);
            toast.success('Configuração criada!');
            carregar();
        } catch (e) { toast.error(e.response?.data?.error || 'Erro ao criar'); throw e; }
    };

    const atualizar = (id) => async (dados) => {
        try {
            await cobrancaService.atualizarConfig(id, dados);
            toast.success('Configuração salva!');
            carregar();
        } catch (e) { toast.error(e.response?.data?.error || 'Erro ao salvar'); throw e; }
    };

    const excluir = (config) => async () => {
        if (!window.confirm(`Excluir a régua de "${config.formaRecebimento}"?`)) return;
        try {
            await cobrancaService.excluirConfig(config.id);
            toast.success('Excluída');
            carregar();
        } catch (e) { toast.error('Erro ao excluir'); }
    };

    if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    const formasDisponiveis = formas.filter(f => !configs.some(c => c.formaRecebimento === f));

    return (
        <div className="space-y-3">
            <div className="bg-mint/50 border border-primary/20 rounded-xl p-4 text-sm text-primaryDark">
                Cada <b>forma de recebimento</b> tem sua régua: quantos dias depois do vencimento sai o 1º aviso,
                de quanto em quanto tempo repete, por quais canais e quem resolve quando o WhatsApp falha.
                A linha <b>PADRÃO</b> vale para todas as formas sem régua própria.
            </div>
            {configs.map(c => (
                <CardConfig key={c.id} config={c} formas={[c.formaRecebimento, ...formasDisponiveis]} equipe={equipe}
                    onSalvar={atualizar(c.id)} onExcluir={excluir(c)} />
            ))}
            <CardConfig novo config={CONFIG_VAZIA} formas={formasDisponiveis} equipe={equipe} onSalvar={criar} />
        </div>
    );
}

// ══════════════════ ABA: CANAIS ══════════════════

function AbaCanais() {
    const [canais, setCanais] = useState(null);
    const [salvando, setSalvando] = useState(false);
    const [testando, setTestando] = useState(false);
    const [emailTeste, setEmailTeste] = useState('');

    const carregar = useCallback(async () => {
        try { setCanais(await cobrancaService.getCanais()); }
        catch (e) { toast.error('Erro ao carregar canais'); }
    }, []);
    useEffect(() => { carregar(); }, [carregar]);

    if (!canais) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    const setEmail = (campo, valor) => setCanais(c => ({ ...c, email: { ...c.email, [campo]: valor } }));
    const setSms = (campo, valor) => setCanais(c => ({ ...c, sms: { ...c.sms, [campo]: valor } }));

    const salvarEmail = async () => {
        setSalvando(true);
        try { await cobrancaService.salvarCanalEmail(canais.email); toast.success('E-mail salvo!'); }
        catch (e) { toast.error('Erro ao salvar'); }
        finally { setSalvando(false); }
    };

    const testarEmail = async () => {
        setTestando(true);
        try {
            const r = await cobrancaService.testarEmail(emailTeste || undefined);
            if (r.conexao?.ok) toast.success(`Conexão SMTP OK${r.envio?.ok ? ' — e-mail de teste enviado!' : ''}`);
            else toast.error(`Falhou: ${r.conexao?.motivo || 'erro'}`);
        } catch (e) { toast.error('Erro no teste'); }
        finally { setTestando(false); }
    };

    const salvarSms = async () => {
        setSalvando(true);
        try { await cobrancaService.salvarCanalSms(canais.sms); toast.success('SMS salvo!'); }
        catch (e) { toast.error('Erro ao salvar'); }
        finally { setSalvando(false); }
    };

    const inputCls = "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none";

    return (
        <div className="space-y-4">
            {/* WhatsApp */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                    <MessageCircle className="h-4 w-4 text-green-600" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">WHATSAPP (BOTCONVERSA)</span>
                    <span className="ml-auto px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Já configurado</span>
                </div>
                <div className="p-5 text-sm text-gray-600 space-y-1">
                    <p>Usa o mesmo bot dos avisos de pedido (Configurações → Notificação WhatsApp). Nada a configurar aqui.</p>
                    <p className="flex items-start gap-2 text-amber-700 bg-amber-50 rounded-lg p-3 mt-2">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>O bot só entrega para cliente <b>com celular cadastrado</b> e que <b>já conversou com o bot</b> alguma vez. Quando falha, o sistema cria automaticamente uma tarefa para o responsável configurado na régua.</span>
                    </p>
                </div>
            </div>

            {/* E-mail */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                    <Mail className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">E-MAIL (SMTP)</span>
                    <span className={`ml-auto px-2 py-1 text-xs font-semibold rounded-full ${canais.email.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                        {canais.email.ativo ? 'Ativo' : 'Desligado'}
                    </span>
                </div>
                <div className="p-5 space-y-4">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={canais.email.ativo} onChange={e => setEmail('ativo', e.target.checked)} className="h-4 w-4 accent-[#00754A]" />
                        Enviar cobranças também por e-mail
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-medium text-gray-700 block mb-1">Servidor SMTP</label>
                            <input className={inputCls} placeholder="smtp.hostinger.com" value={canais.email.host} onChange={e => setEmail('host', e.target.value)} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-gray-700 block mb-1">Porta</label>
                                <input className={inputCls} type="number" value={canais.email.port} onChange={e => setEmail('port', e.target.value)} />
                            </div>
                            <label className="flex items-end gap-2 text-sm text-gray-700 pb-2.5">
                                <input type="checkbox" checked={canais.email.secure} onChange={e => setEmail('secure', e.target.checked)} className="h-4 w-4 accent-[#00754A]" />
                                SSL (porta 465)
                            </label>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 block mb-1">Usuário (e-mail)</label>
                            <input className={inputCls} placeholder="atendimento@hardtsalgados.com.br" value={canais.email.user} onChange={e => setEmail('user', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 block mb-1">Senha</label>
                            <input className={inputCls} type="password" value={canais.email.pass} onChange={e => setEmail('pass', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 block mb-1">Nome do remetente</label>
                            <input className={inputCls} value={canais.email.fromName} onChange={e => setEmail('fromName', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 block mb-1">E-mail p/ teste (opcional)</label>
                            <input className={inputCls} placeholder="voce@gmail.com" value={emailTeste} onChange={e => setEmailTeste(e.target.value)} />
                        </div>
                    </div>
                    <div className="flex flex-col md:flex-row gap-2 md:justify-end">
                        <button onClick={testarEmail} disabled={testando}
                            className="px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm disabled:opacity-60 min-h-[44px] md:min-h-0">
                            {testando ? 'Testando...' : 'Testar conexão / enviar teste'}
                        </button>
                        <button onClick={salvarEmail} disabled={salvando}
                            className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-60 min-h-[44px] md:min-h-0">
                            Salvar e-mail
                        </button>
                    </div>
                </div>
            </div>

            {/* SMS */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                    <Smartphone className="h-4 w-4 text-purple-600" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">SMS (TWILIO)</span>
                    <span className={`ml-auto px-2 py-1 text-xs font-semibold rounded-full ${canais.sms.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                        {canais.sms.ativo ? 'Ativo' : 'Desligado'}
                    </span>
                </div>
                <div className="p-5 space-y-4">
                    <p className="flex items-start gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                        <span>SMS exige contratar um provedor (recomendado: <b>Twilio</b> — twilio.com, paga por mensagem enviada, ~R$ 0,35/SMS no Brasil). Depois de criar a conta, cole aqui o Account SID, o Auth Token e o número remetente.</span>
                    </p>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={canais.sms.ativo} onChange={e => setSms('ativo', e.target.checked)} className="h-4 w-4 accent-[#00754A]" />
                        Enviar cobranças também por SMS
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="text-sm font-medium text-gray-700 block mb-1">Account SID</label>
                            <input className={inputCls} value={canais.sms.accountSid} onChange={e => setSms('accountSid', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 block mb-1">Auth Token</label>
                            <input className={inputCls} type="password" value={canais.sms.authToken} onChange={e => setSms('authToken', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 block mb-1">Número remetente</label>
                            <input className={inputCls} placeholder="+15551234567" value={canais.sms.from} onChange={e => setSms('from', e.target.value)} />
                        </div>
                    </div>
                    <div className="flex md:justify-end">
                        <button onClick={salvarSms} disabled={salvando}
                            className="w-full md:w-auto px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-60 min-h-[44px] md:min-h-0">
                            Salvar SMS
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ══════════════════ ABA: HISTÓRICO ══════════════════

function AbaHistorico() {
    const [dados, setDados] = useState(null);
    const [filtros, setFiltros] = useState({ canal: '', status: '', pagina: 1 });
    const [loading, setLoading] = useState(true);

    const carregar = useCallback(async (f) => {
        setLoading(true);
        try {
            const params = { pagina: f.pagina };
            if (f.canal) params.canal = f.canal;
            if (f.status) params.status = f.status;
            setDados(await cobrancaService.listarEnvios(params));
        } catch (e) { toast.error('Erro ao carregar histórico'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { carregar(filtros); }, [filtros, carregar]);

    const setF = (campo, valor) => setFiltros(f => ({ ...f, [campo]: valor, pagina: 1 }));

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-2">
                <SelectBusca value={filtros.canal} onChange={e => setF('canal', e.target.value)} className="w-full md:w-48">
                    <option value="">Todos os canais</option>
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="EMAIL">E-mail</option>
                    <option value="SMS">SMS</option>
                </SelectBusca>
                <SelectBusca value={filtros.status} onChange={e => setF('status', e.target.value)} className="w-full md:w-48">
                    <option value="">Enviados e erros</option>
                    <option value="ENVIADO">Só enviados</option>
                    <option value="ERRO">Só erros</option>
                </SelectBusca>
            </div>

            {loading ? <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> : (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                    {(!dados || dados.envios.length === 0) && <div className="p-8 text-center text-sm text-gray-500">Nenhum envio registrado ainda.</div>}

                    {/* Mobile */}
                    <div className="md:hidden space-y-3 p-3">
                        {dados?.envios.map(env => {
                            const Icone = CANAL_ICONE[env.canal] || Send;
                            return (
                                <div key={env.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-semibold text-gray-900 truncate">{env.cliente?.NomeFantasia || env.cliente?.Nome}</span>
                                        {env.status === 'ENVIADO'
                                            ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                                            : <XCircle className="h-4 w-4 text-red-600 shrink-0" />}
                                    </div>
                                    <div className="text-xs text-gray-500 flex items-center gap-2">
                                        <Icone className="h-3 w-3" /> {env.canal} · {env.tipo} · {fmtDataHora(env.createdAt)} · {fmtMoeda(env.valorTotal)}
                                    </div>
                                    {env.erro && <div className="text-xs text-red-600 mt-1">{env.erro}</div>}
                                </div>
                            );
                        })}
                    </div>

                    {/* Desktop */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</th>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Canal</th>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Resultado</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                {dados?.envios.map(env => {
                                    const Icone = CANAL_ICONE[env.canal] || Send;
                                    return (
                                        <tr key={env.id} className="hover:bg-gray-50">
                                            <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{fmtDataHora(env.createdAt)}</td>
                                            <td className="px-5 py-3 text-gray-900 font-medium">{env.cliente?.NomeFantasia || env.cliente?.Nome}</td>
                                            <td className="px-5 py-3 text-gray-600"><span className="inline-flex items-center gap-1"><Icone className="h-4 w-4" />{env.canal}</span></td>
                                            <td className="px-5 py-3">
                                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${env.tipo === 'LEMBRETE' ? 'bg-blue-100 text-blue-800' : env.tipo === 'MANUAL' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>
                                                    {env.tipo === 'COBRANCA' ? `Aviso ${env.numeroAviso}` : env.tipo === 'LEMBRETE' ? 'Lembrete' : 'Manual'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-right text-gray-900">{fmtMoeda(env.valorTotal)}</td>
                                            <td className="px-5 py-3">
                                                {env.status === 'ENVIADO'
                                                    ? <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Enviado</span>
                                                    : <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700" title={env.erro || ''}>Erro</span>}
                                                {env.erro && <div className="text-xs text-red-600 mt-1 max-w-[260px] truncate" title={env.erro}>{env.erro}</div>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {dados && dados.total > dados.porPagina && (
                        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 text-sm text-gray-600">
                            <span>{dados.total} envio(s)</span>
                            <div className="flex gap-2">
                                <button disabled={filtros.pagina <= 1} onClick={() => setFiltros(f => ({ ...f, pagina: f.pagina - 1 }))}
                                    className="px-3 py-1.5 bg-white border border-gray-300 rounded-full text-xs font-medium disabled:opacity-40">Anterior</button>
                                <button disabled={filtros.pagina * dados.porPagina >= dados.total} onClick={() => setFiltros(f => ({ ...f, pagina: f.pagina + 1 }))}
                                    className="px-3 py-1.5 bg-white border border-gray-300 rounded-full text-xs font-medium disabled:opacity-40">Próxima</button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ══════════════════ PÁGINA ══════════════════

const ABAS = [
    { id: 'inadimplentes', label: 'Inadimplentes', icon: Users },
    { id: 'regua', label: 'Régua', icon: Settings2 },
    { id: 'canais', label: 'Canais', icon: Send },
    { id: 'historico', label: 'Histórico', icon: History }
];

export default function ReguaCobrancaPage() {
    const [aba, setAba] = useState('inadimplentes');

    return (
        <div className="max-w-full overflow-x-hidden min-h-screen bg-secondary">
            <div className="flex items-center justify-between p-3 md:p-6 bg-white border-b border-gray-200">
                <div className="flex items-center gap-2">
                    <div className="bg-amber-100 p-1.5 md:p-2 rounded-lg">
                        <BellRing className="h-4 w-4 md:h-5 md:w-5 text-amber-600" />
                    </div>
                    <h1 className="text-base md:text-2xl font-bold text-gray-900">Régua de Cobrança</h1>
                </div>
            </div>

            <div className="p-3 md:p-6 space-y-4">
                <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                    {ABAS.map(a => (
                        <button key={a.id} onClick={() => setAba(a.id)}
                            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap min-h-[44px] md:min-h-0 ${aba === a.id ? 'bg-primary text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                            <a.icon className="h-4 w-4" /> {a.label}
                        </button>
                    ))}
                </div>

                {aba === 'inadimplentes' && <AbaInadimplentes />}
                {aba === 'regua' && <AbaConfiguracao />}
                {aba === 'canais' && <AbaCanais />}
                {aba === 'historico' && <AbaHistorico />}
            </div>
        </div>
    );
}
