import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import {
    Users, TrendingUp, BarChart3, ListChecks, Crown, AlertTriangle, MessageCircle,
    HelpCircle, ArrowUpDown, Tag, Boxes, RefreshCw, X, Search, ChevronDown, Target, Layers
} from 'lucide-react';
import api from '../../services/api';
import clienteService from '../../services/clienteService';
import SelectBusca from '../../components/SelectBusca';
import { useFiltrosSalvos } from '../../hooks/useFiltrosSalvos';
import { Card, fmtRS0, fmtBR, fmtInt } from './dashUi';
import FichaClienteCarteira from './FichaClienteCarteira';

/* ─────────────── utilitários ─────────────── */
const MINUSC = new Set(['de', 'da', 'do', 'e', 'dos', 'das']);
const nomeBonito = (n) => String(n || '').toLowerCase().split(/\s+/).filter(Boolean).map((p, i) => {
    if (i && MINUSC.has(p)) return p;
    if (/^(ltda|me|br|d|epp|sa)$/.test(p)) return p.toUpperCase();
    return p.charAt(0).toUpperCase() + p.slice(1);
}).join(' ');
const TIPO_CURTO = {
    'Posto de Combustível / Loja de Posto': 'Posto', 'Mercado / Supermercado': 'Mercado',
    'Casa de Festas / Eventos / Buffet de Festa': 'Casa de festas', 'Restaurante / Buffet': 'Restaurante'
};
const tipoCurto = (t) => (t ? (TIPO_CURTO[t] || String(t).trim()) : '');
const primeiroNome = (n) => (n ? String(n).split(' ')[0] : '');
const dm = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
const dmy = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const fmtMil = (v) => fmtBR(Number(v || 0) / 1000, 1);
const pl = (n, s, p) => `${fmtInt(n)} ${Number(n) === 1 ? s : p}`;
const erroMsg = (e, padrao) => e?.response?.data?.error || padrao;

const ABAS_ATENCAO = [
    { key: 'paradoAna', label: 'Parados, Ana chama' },
    { key: 'paradoVisita', label: 'Parados, visita' },
    { key: 'atrasoLeve', label: 'Atraso leve' },
    { key: 'inativar', label: 'Inativar' },
    { key: 'enfraquecendo', label: 'Enfraquecendo' }
];

/* ─────────────── peças pequenas ─────────────── */
const Seg = ({ valor, onChange, opcoes, rotulo }) => (
    <div role="group" aria-label={rotulo} className="inline-flex bg-white border border-gray-300 rounded-full p-0.5">
        {opcoes.map((o) => (
            <button
                key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={valor === o.value}
                className={`px-3.5 min-h-[44px] rounded-full text-sm font-semibold transition-colors ${valor === o.value ? 'bg-primary text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
            >{o.label}</button>
        ))}
    </div>
);

const Pill = ({ cor = 'gray', children }) => {
    const mapa = {
        gray: 'bg-gray-100 text-gray-700', green: 'bg-green-100 text-green-800', amber: 'bg-amber-100 text-amber-700',
        red: 'bg-red-100 text-red-700', blue: 'bg-blue-100 text-blue-800', mint: 'bg-mint text-primaryDark'
    };
    return <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full ${mapa[cor]}`}>{children}</span>;
};

const Delta = ({ atual, anterior, pct, inverso = false }) => {
    const a = Number(atual || 0); const b = Number(anterior || 0);
    if (a === b) return <span className="text-xs font-bold text-gray-500">igual</span>;
    const sobe = a > b; const bom = inverso ? !sobe : sobe;
    const txt = pct != null ? `${fmtBR(Math.abs(pct), 1)}%` : fmtInt(Math.abs(a - b));
    return <span className={`text-xs font-bold ${bom ? 'text-green-700' : 'text-red-700'}`}>{sobe ? '▲' : '▼'} {txt}</span>;
};

const Vazio = ({ children }) => <p className="text-sm text-gray-500 font-medium py-3 text-center">{children}</p>;

const Rodape = ({ texto, botao }) => (
    <div className="flex items-center justify-between gap-3 px-4 md:px-5 py-3 border-t border-gray-100">
        <span className="text-xs font-semibold text-gray-500">{texto}</span>
        {botao}
    </div>
);

const BotaoPilula = ({ children, onClick, primario = false, disabled = false, className = '' }) => (
    <button
        type="button" onClick={onClick} disabled={disabled}
        className={`min-h-[44px] px-4 rounded-full text-sm font-semibold disabled:opacity-50 ${primario
            ? 'bg-primary hover:bg-primaryDark text-white shadow-sm'
            : 'bg-white border border-primary text-primary hover:bg-mint/40'} ${className}`}
    >{children}</button>
);

/* ─────────────── diálogo "Já sei" ─────────────── */
const JaSeiDialog = ({ cliente, modo, onClose, onFeito }) => {
    const [busca, setBusca] = useState('');
    const [achados, setAchados] = useState([]);
    const [buscando, setBuscando] = useState(false);
    const [escolhido, setEscolhido] = useState(null);
    const [dias, setDias] = useState(30);
    const [gravando, setGravando] = useState(false);
    const [erroBusca, setErroBusca] = useState('');
    const trava = useRef(false); // evita duplo clique antes do React re-renderizar

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    useEffect(() => {
        if (modo !== 'mesmo' || escolhido) return undefined;
        const termo = busca.trim();
        setErroBusca('');
        if (termo.length < 3) { setAchados([]); return undefined; }
        let cancelado = false;
        const t = setTimeout(async () => {
            setBuscando(true);
            try {
                const r = await api.get('/dashboards/geral/carteira/buscar-clientes', { params: { q: termo } });
                if (!cancelado) setAchados((r.data?.data || []).filter((c) => c.id !== cliente.clienteId));
            } catch (e) { if (!cancelado) { setAchados([]); setErroBusca(erroMsg(e, 'Não foi possível buscar agora.')); } }
            finally { if (!cancelado) setBuscando(false); }
        }, 350);
        return () => { cancelado = true; clearTimeout(t); };
    }, [busca, modo, escolhido, cliente.clienteId]);

    const juntar = async () => {
        if (trava.current) return;
        trava.current = true; setGravando(true);
        try {
            const r = await api.post('/dashboards/geral/carteira/mesmo-cliente', { antigoId: cliente.clienteId, atualId: escolhido.id, origem: 'MANUAL' });
            const id = r.data?.id;
            onFeito(`${nomeBonito(cliente.nome)} agora conta junto com ${nomeBonito(escolhido.nome)}.`,
                id ? () => api.delete(`/dashboards/geral/carteira/mesmo-cliente/${id}`) : null);
        } catch (e) { toast.error(erroMsg(e, 'Não foi possível juntar os cadastros.')); trava.current = false; setGravando(false); }
    };
    const silenciar = async () => {
        if (trava.current) return;
        trava.current = true; setGravando(true);
        try {
            await api.post('/dashboards/geral/carteira/silencio', { clienteId: cliente.clienteId, dias });
            onFeito(`Não vou mais avisar sobre ${nomeBonito(cliente.nome)} por ${dias} dias.`,
                () => api.delete(`/dashboards/geral/carteira/silencio/${cliente.clienteId}`));
        } catch (e) { toast.error(erroMsg(e, 'Não foi possível silenciar este cliente.')); trava.current = false; setGravando(false); }
    };

    const titulo = modo === 'mesmo' ? 'É o mesmo cliente de outro cadastro' : 'Não avisar por um tempo';

    return (
        <div className="fixed inset-0 z-[999] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4" onClick={onClose}>
            <div role="dialog" aria-modal="true" aria-label={titulo}
                className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-4 md:p-5 space-y-3"
                onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Já sei</p>
                        <h3 className="text-base font-bold text-gray-900">{titulo}</h3>
                        <p className="text-sm text-gray-600 font-medium truncate">{nomeBonito(cliente.nome)}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Fechar" className="p-2.5 -m-1 rounded-full text-gray-500 hover:bg-gray-100 flex-none"><X className="h-5 w-5" /></button>
                </div>

                {modo === 'mesmo' && !escolhido && (
                    <>
                        <p className="text-sm text-gray-600">Procure o outro cadastro deste mesmo cliente. Os pedidos dos dois passam a contar juntos e ele para de aparecer como parado. A busca também acha cadastros inativos.</p>
                        <div className="relative">
                            <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, documento ou código…"
                                className="w-full border border-gray-300 rounded-full pl-9 pr-3 min-h-[44px] text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                        </div>
                        <div className="space-y-1.5">
                            {buscando && <p className="text-xs text-gray-500 font-medium px-1">Buscando…</p>}
                            {busca.trim().length > 0 && busca.trim().length < 3 && <p className="text-xs text-gray-500 font-medium px-1">Digite pelo menos 3 letras.</p>}
                            {erroBusca && <p className="text-sm text-red-700 font-medium px-1">{erroBusca}</p>}
                            {!buscando && !erroBusca && busca.trim().length >= 3 && achados.length === 0 && <p className="text-sm text-gray-500 px-1">Nenhum cadastro encontrado</p>}
                            {achados.map((c) => (
                                <button key={c.id} type="button" onClick={() => setEscolhido(c)}
                                    className="w-full text-left bg-gray-50 hover:bg-mint/40 border border-gray-100 rounded-lg px-3 py-2.5 min-h-[44px]">
                                    <p className="text-sm font-semibold text-gray-900 break-words">{nomeBonito(c.nome)} {c.ativo === false && <Pill cor="gray">inativo</Pill>}</p>
                                    <p className="text-xs text-gray-500 font-medium break-words">
                                        {c.fantasia ? `${nomeBonito(c.fantasia)} · ` : ''}{c.cidade || 'sem cidade'}
                                    </p>
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {modo === 'mesmo' && escolhido && (
                    <>
                        <div className="bg-mint/40 border border-mint rounded-lg px-3 py-2.5 text-sm text-gray-800">
                            <b>{nomeBonito(cliente.nome)}</b> e <b>{nomeBonito(escolhido.nome)}</b>{escolhido.ativo === false && <> (inativo)</>} passam a ser um cliente só.
                            O histórico, o ritmo e o vendedor vêm do cadastro <b>{nomeBonito(escolhido.nome)}</b>. Dá para desfazer logo depois.
                        </div>
                        <div className="flex flex-col-reverse md:flex-row gap-2 md:justify-end">
                            <BotaoPilula onClick={() => setEscolhido(null)} disabled={gravando}>Escolher outro</BotaoPilula>
                            <BotaoPilula primario onClick={juntar} disabled={gravando}>{gravando ? 'Juntando…' : 'Juntar cadastros'}</BotaoPilula>
                        </div>
                    </>
                )}

                {modo === 'silencio' && (
                    <>
                        <p className="text-sm text-gray-600">O gerente para de apontar este cliente nas listas e nos alertas até a data. Depois volta ao normal.</p>
                        <Seg valor={dias} onChange={setDias} rotulo="Por quanto tempo" opcoes={[{ value: 30, label: '30 dias' }, { value: 90, label: '90 dias' }]} />
                        <div className="flex flex-col-reverse md:flex-row gap-2 md:justify-end">
                            <BotaoPilula onClick={onClose} disabled={gravando}>Cancelar</BotaoPilula>
                            <BotaoPilula primario onClick={silenciar} disabled={gravando}>{gravando ? 'Gravando…' : `Não avisar por ${dias} dias`}</BotaoPilula>
                        </div>
                    </>
                )}

            </div>
        </div>
    );
};

const BotoesJaSei = ({ cliente, abrir }) => (
    <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-200">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-500 w-full md:w-auto">Já sei:</span>
        <button type="button" onClick={() => abrir(cliente, 'mesmo')} className="min-h-[44px] px-3 rounded-full bg-white border border-primary text-primary text-sm font-semibold hover:bg-mint/40">É o mesmo cliente de outro cadastro</button>
        <button type="button" onClick={() => abrir(cliente, 'silencio')} className="min-h-[44px] px-3 rounded-full bg-white border border-primary text-primary text-sm font-semibold hover:bg-mint/40">Não avisar por 30 dias</button>
        <button type="button" onClick={() => abrir(cliente, 'inativar')} className="min-h-[44px] px-3 rounded-full bg-white border border-primary text-primary text-sm font-semibold hover:bg-mint/40">Não compra mais</button>
    </div>
);

const AvisoFechou = ({ c }) => (Array.isArray(c?.avisos) && c.avisos.includes('VENDEDOR_ANOTOU_FECHOU')
    ? <span className="inline-block mt-1"><Pill cor="amber">vendedor anotou que fechou</Pill></span> : null);

const TextoGerente = ({ texto }) => (
    <div className="bg-gray-50 border border-gray-200 rounded-lg px-3.5 py-3 text-sm text-gray-800 leading-relaxed">
        <span className="block text-xs font-bold uppercase tracking-widest text-primaryDark mb-1">O gerente escreve</span>
        {texto}
    </div>
);

/* ─────────────── blocos ─────────────── */
const BlocoResumo = ({ resumo, rotulo }) => (
    <Card icon={ListChecks} titulo="Resumo do gerente" direita={resumo.rotulo || rotulo}>
        <div className="space-y-2">
            {(resumo.frases || []).map((f, i) => <p key={i} className="text-sm md:text-[15px] text-gray-800 leading-relaxed">{f}</p>)}
        </div>
        {resumo.parcial && <p className="text-xs font-semibold text-gray-500 mt-3 pt-3 border-t border-gray-100">{resumo.parcial}</p>}
    </Card>
);

const BlocoProjecao = ({ p, vendedorId }) => {
    const semMeta = !p.meta || p.pctMeta == null;
    const real = Math.min(100, Math.max(0, Number(p.pctRealizado || 0)));
    const proj = Math.min(100, Math.max(0, Number(p.pctMeta || 0)));
    let vends = Array.isArray(p.porVendedor) ? p.porVendedor : [];
    if (vendedorId && vendedorId !== 'todos') vends = vends.filter((v) => v.vendedorId === vendedorId);
    const corProj = proj >= 80 ? 'bg-yellow-200' : 'bg-blue-200';
    const corReal = proj >= 80 ? 'bg-yellow-500' : 'bg-blue-500';
    return (
        <Card icon={Target} titulo={`Para onde ${p.mesRotulo || 'o mês'} está indo`}
            direita={p.diasTrabalho ? `${p.diasTrabalho.passados} de ${pl(p.diasTrabalho.total, 'dia de trabalho', 'dias de trabalho')}` : null}>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4 md:text-left">
                <div><p className="text-base md:text-2xl font-extrabold text-gray-900 tabular-nums">{fmtRS0(p.jaEntrou)}</p><p className="text-xs font-semibold text-gray-500">já entrou até o dia {p.diaHoje}</p></div>
                <div><p className="text-base md:text-2xl font-extrabold text-gray-900 tabular-nums">{fmtRS0(p.fechaNoRitmo)}</p><p className="text-xs font-semibold text-gray-500">fecha no ritmo atual</p></div>
                <div><p className="text-base md:text-2xl font-extrabold text-gray-900 tabular-nums">{p.meta > 0 ? fmtRS0(p.meta) : '—'}</p><p className="text-xs font-semibold text-gray-500">{p.meta > 0 ? 'é a meta do mês' : 'sem meta cadastrada'}</p></div>
            </div>
            {!semMeta && (
                <>
                    <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden mt-4" role="img" aria-label={`Realizado ${fmtBR(p.pctRealizado, 0)}% da meta, projeção ${fmtBR(p.pctMeta, 0)}% da meta`}>
                        <div className={`absolute inset-y-0 left-0 ${corProj}`} style={{ width: `${proj}%` }} />
                        <div className={`absolute inset-y-0 left-0 ${corReal}`} style={{ width: `${real}%` }} />
                    </div>
                    <div className="flex justify-between gap-3 text-xs font-semibold text-gray-500 mt-1.5">
                        <span>Cor forte: já entrou. Cor clara: até onde chega no ritmo atual.</span>
                        <span className="whitespace-nowrap">{fmtBR(p.pctMeta, 0)}% da meta</span>
                    </div>
                </>
            )}
            {p.frase && <p className="text-sm text-gray-700 leading-relaxed mt-3">{p.frase}</p>}
            {vends.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-100 space-y-3">
                    {vends.map((v) => {
                        const pr = Math.min(100, Math.max(0, Number(v.pctMeta || 0)));
                        const re = Math.min(100, Math.max(0, Number(v.pctRealizado || 0)));
                        return (
                            <div key={v.vendedorId || v.nome}>
                                <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                                    <b className="text-gray-900">{v.nome}</b>
                                    <span className="text-xs font-semibold text-gray-500">
                                        {v.meta > 0 ? `fecha em ${fmtRS0(v.projecao)} de ${fmtRS0(v.meta)} · ${fmtBR(v.pctMeta, 0)}% da meta` : `fecha em ${fmtRS0(v.projecao)} · sem meta`}
                                    </span>
                                </div>
                                {v.meta > 0 && (
                                    <div className="relative h-2.5 bg-gray-100 rounded-full overflow-hidden mt-1">
                                        <div className={`absolute inset-y-0 left-0 ${pr >= 80 ? 'bg-yellow-200' : 'bg-blue-200'}`} style={{ width: `${pr}%` }} />
                                        <div className={`absolute inset-y-0 left-0 ${pr >= 80 ? 'bg-yellow-500' : 'bg-blue-500'}`} style={{ width: `${re}%` }} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
};

const BlocoNumeros = ({ n, antes }) => {
    const itens = [
        { k: 'pedidosReais', label: 'Vendas líquidas', fmt: fmtRS0, pct: true },
        { k: 'clientesCompraram', label: 'Clientes que compraram', fmt: fmtInt },
        { k: 'ticket', label: 'Ticket médio', fmt: fmtRS0, pct: true },
        { k: 'novos', label: 'Clientes novos', fmt: fmtInt },
        { k: 'voltaram', label: 'Voltaram a comprar', fmt: fmtInt },
        { k: 'pararam', label: 'Pararam', fmt: fmtInt, inverso: true }
    ].filter((i) => n[i.k]);
    if (!itens.length) return null;
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {itens.map((i) => {
                const x = n[i.k];
                return (
                    <div key={i.k} className="bg-white rounded-xl border border-gray-200 shadow-sm px-3.5 py-3 min-w-0">
                        <p className="text-xs font-bold text-gray-500">{i.label}</p>
                        <p className="text-lg md:text-xl font-extrabold text-gray-900 mt-0.5 tabular-nums truncate">{i.fmt(x.atual)}</p>
                        <p className="mt-0.5"><Delta atual={x.atual} anterior={x.anterior} pct={i.pct ? x.variacaoPct : null} inverso={i.inverso} /></p>
                        <p className="text-[11px] font-medium text-gray-500 leading-tight mt-0.5">{antes}: {i.fmt(x.anterior)}</p>
                    </div>
                );
            })}
        </div>
    );
};

const BlocoGrafico = ({ g, onIrPara }) => {
    const itens = Array.isArray(g.itens) ? g.itens : [];
    if (!itens.length) return null;
    const max = Math.max(1, ...itens.map((i) => Number(i.valor || 0)));
    const curto = (r) => String(r || '').slice(0, 3);
    return (
        <Card icon={BarChart3} titulo={g.titulo || 'Evolução'} direita="vendas líquidas, em R$ mil">
            <div className="flex items-end gap-1.5 md:gap-3 h-40">
                {itens.map((i, idx) => {
                    const ult = idx === itens.length - 1;
                    const h = Math.max(2, (Math.max(0, Number(i.valor || 0)) / max) * 100);
                    return (
                        <div key={`${i.de}-${idx}`} className="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1">
                            <span className="text-[10px] md:text-[11px] font-bold text-gray-700 tabular-nums">{fmtMil(i.valor)}</span>
                            <div className={`w-full max-w-[56px] rounded-t-md ${ult ? 'bg-primary' : 'bg-primary/40'}`} style={{ height: `${h}%` }} />
                            <span className="text-[10px] md:text-[11px] font-semibold text-gray-500 truncate max-w-full">
                                {g.tipo === 'mensal' ? <><span className="md:hidden">{curto(i.rotulo)}</span><span className="hidden md:inline">{i.rotulo}</span></> : i.rotulo}
                            </span>
                        </div>
                    );
                })}
            </div>
            <p className="text-xs font-medium text-gray-500 mt-2">A barra mais escura é o período de agora, ainda em andamento.{onIrPara && g.tipo === 'semanal' && <> Série de 12 semanas em <button type="button" onClick={() => onIrPara('vendas')} className="text-primary font-bold underline">Vendas &amp; Pedidos</button>.</>}</p>
        </Card>
    );
};

const BlocoDecisoes = ({ decisoes, resolver, semVendedor, pendentes, abrirFicha }) => {
    const [aberto, setAberto] = useState(null);
    const [ocupado, setOcupado] = useState(null);
    const lista = decisoes.filter((x) => x && x.qtd > 0);
    const total = pendentes != null ? pendentes : lista.reduce((s, x) => s + x.qtd, 0);
    const trava = useRef(false);

    const executar = async (it, fn) => {
        if (trava.current) return;
        trava.current = true; setOcupado(it.sugestaoId);
        try { await fn(it); } finally { trava.current = false; setOcupado(null); }
    };
    const juntar = (it) => executar(it, resolver.juntar);
    const dispensar = (it) => executar(it, resolver.dispensar);

    return (
        <Card icon={ListChecks} titulo="Suas decisões de hoje" direita={`${pl(total, 'pendente', 'pendentes')} hoje${lista.some((x) => x.tipo === 'SEM_VENDEDOR' && x.total != null && x.total > x.qtd) ? ' · sem vendedor: só os do dia' : ''}`} semPadding>
            {lista.length === 0 && <div className="p-4"><Vazio>Nada pendente por enquanto.</Vazio></div>}
            <div className="divide-y divide-gray-100">
                {lista.map((dc) => {
                    const mesmo = dc.tipo === 'MESMO_CLIENTE';
                    const semV = dc.tipo === 'SEM_VENDEDOR';
                    const itens = semV && Array.isArray(semVendedor?.hoje) ? semVendedor.hoje : (Array.isArray(dc.itens) ? dc.itens : []);
                    const totalReal = dc.total != null ? dc.total : dc.qtd;
                    const abre = aberto === dc.tipo;
                    const nomes = itens.slice(0, 3).map((i) => nomeBonito(i.nome || i.atualNome || '')).filter(Boolean).join(', ');
                    return (
                        <div key={dc.tipo} className="px-4 md:px-5 py-3">
                            <div className="flex items-center gap-3">
                                <span className="flex-none w-9 h-9 rounded-lg bg-mint text-primaryDark flex items-center justify-center font-extrabold text-sm tabular-nums">{fmtInt(dc.qtd)}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-gray-900">{dc.titulo}{semV && totalReal > dc.qtd && <span className="font-semibold text-gray-500"> · {fmtInt(dc.qtd)} de {fmtInt(totalReal)}</span>}</p>
                                    {!mesmo && nomes && <p className="text-xs font-medium text-gray-500 truncate">{nomes}{itens.length > 3 ? ` e mais ${itens.length - 3}` : ''}</p>}
                                </div>
                                {!mesmo && (
                                    <button type="button" onClick={() => setAberto(abre ? null : dc.tipo)} aria-expanded={abre}
                                        className="flex-none min-h-[44px] px-4 rounded-full text-sm font-semibold bg-white border border-primary text-primary hover:bg-mint/40">
                                        {abre ? 'Fechar' : 'Ver'}
                                    </button>
                                )}
                            </div>
                            {mesmo && (
                                <div className="mt-2 space-y-2">
                                    {itens.map((it) => (
                                        <div key={it.sugestaoId} className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
                                            <p className="text-sm text-gray-800"><b>{nomeBonito(it.antigoNome)}</b> e <b>{nomeBonito(it.atualNome)}</b>: {it.motivo}.</p>
                                            <p className="text-xs font-medium text-gray-500 mt-0.5">
                                                {it.antigoUltimoPedido ? `Um parou em ${dmy(it.antigoUltimoPedido)}` : ''}{it.atualPrimeiroPedido ? `${it.antigoUltimoPedido ? ' e o outro começou' : 'O outro começou'} em ${dmy(it.atualPrimeiroPedido)}.` : ''}
                                                {it.reais90d != null ? ` Juntos compraram ${fmtRS0(it.reais90d)} nos últimos 90 dias.` : ''}
                                            </p>
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                <BotaoPilula primario onClick={() => juntar(it)} disabled={ocupado === it.sugestaoId}>Juntar</BotaoPilula>
                                                <BotaoPilula onClick={() => dispensar(it)} disabled={ocupado === it.sugestaoId}>Não é o mesmo</BotaoPilula>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {!mesmo && abre && (
                                <ul className="mt-2 space-y-1.5 max-h-72 overflow-y-auto">
                                    {itens.map((it) => (
                                        <li key={it.clienteId}>
                                            <button type="button" onClick={() => abrirFicha(it.clienteId)} className="w-full text-left flex items-center justify-between gap-3 bg-gray-50 hover:bg-mint/40 border border-gray-100 rounded-lg px-3 py-2.5 min-h-[44px]">
                                                <span className="min-w-0">
                                                    <span className="block text-sm font-semibold text-gray-900 break-words">{nomeBonito(it.nome)}</span>
                                                    <span className="block text-xs font-medium text-gray-500">
                                                        {it.detalhe || (it.diasSemComprar != null ? `${pl(it.diasSemComprar, 'dia', 'dias')} sem comprar${it.motivo ? ` · ${it.motivo}` : ''}` : (it.pedidosNoApp != null ? `${pl(it.pedidosNoApp, 'pedido', 'pedidos')} no app` : ''))}
                                                        <AvisoFechou c={it} />
                                                    </span>
                                                </span>
                                                <span className="text-primary text-xs font-bold whitespace-nowrap">abrir →</span>
                                            </button>
                                        </li>
                                    ))}
                                    {totalReal > itens.length && <li className="text-xs font-medium text-gray-500 px-1">Mostrando {itens.length} de {fmtInt(totalReal)}{semV ? '. Os primeiros são os que já pediram.' : '.'}</li>}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </div>
        </Card>
    );
};

const BlocoResultadoDecisoes = ({ r }) => {
    const zerado = !r.aprovados && !r.responderam && !r.voltaram && !r.reais;
    const v = (x, f = fmtInt) => (zerado ? '—' : f(x));
    return (
        <Card icon={TrendingUp} titulo="O que deram as suas decisões" direita={zerado ? 'ainda sem números' : null}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[['resgates aprovados', v(r.aprovados)], ['clientes responderam', v(r.responderam)], ['voltaram a comprar', v(r.voltaram)], ['reais de volta', v(r.reais, fmtRS0)]].map(([l, x]) => (
                    <div key={l} className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5"><p className="text-lg font-extrabold text-gray-900 tabular-nums">{x}</p><p className="text-xs font-semibold text-gray-500">{l}</p></div>
                ))}
            </div>
            <p className="text-xs font-medium text-gray-500 mt-3">Este quadro começa a contar no primeiro resgate da Ana. Vai mostrar também quais sugestões aceitas deram resultado.</p>
        </Card>
    );
};

/* Linha expansível de cliente (atenção e top 20 faltando) */
const LinhaClienteAtencao = ({ c, aba, cheia, aberto, onToggle, abrirJaSei, abrirFicha }) => {
    const enf = aba === 'enfraquecendo';
    const sub = [tipoCurto(c.tipo), primeiroNome(c.vendedor), c.cidade].filter(Boolean).join(' · ');
    return (
        <div className="border-b border-gray-100 last:border-b-0">
            <button type="button" onClick={onToggle} aria-expanded={aberto}
                className="w-full text-left px-4 md:px-5 py-3 min-h-[56px] flex items-start gap-3 hover:bg-gray-50">
                <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-gray-900 break-words">{nomeBonito(c.nome)}</span>
                    <span className="block text-xs font-medium text-gray-500 break-words">{sub || 'sem detalhes'}</span>
                    <AvisoFechou c={c} />
                    {c.silenciadoAte && <span className="mt-1 ml-1 inline-block"><Pill cor="blue">sem aviso até {dm(c.silenciadoAte)}</Pill></span>}
                    {cheia && (
                        <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs font-medium text-gray-600">
                            <span>Ritmo: a cada {c.ritmoDias != null ? pl(Math.round(c.ritmoDias), 'dia', 'dias') : '—'}</span>
                            {c.ultimoPedido && <span>Último pedido: {dmy(c.ultimoPedido)}</span>}
                            {c.pedidosValidos != null && <span>{pl(c.pedidosValidos, 'pedido', 'pedidos')}</span>}
                        </span>
                    )}
                </span>
                <span className="flex-none text-right">
                    {enf ? (
                        <span className="block text-sm font-extrabold text-amber-700 tabular-nums">−{fmtBR(Math.abs(c.variacaoTicketPct || 0), 0)}%<small className="block text-[11px] font-semibold text-gray-500">no ticket</small></span>
                    ) : (
                        <span className="block text-sm font-extrabold text-gray-900 tabular-nums">{c.diasSemComprar != null ? pl(c.diasSemComprar, 'dia', 'dias') : '—'}<small className="block text-[11px] font-semibold text-gray-500">{c.ticketMedio != null ? `${fmtRS0(c.ticketMedio)} por pedido` : ''}</small></span>
                    )}
                </span>
                <ChevronDown className={`h-4 w-4 text-gray-400 flex-none mt-1 transition-transform ${aberto ? 'rotate-180' : ''}`} />
            </button>
            {aberto && (
                <div className="px-4 md:px-5 pb-4">
                    {enf && <p className="text-sm text-gray-700 mb-2">O ticket caiu {fmtBR(Math.abs(c.variacaoTicketPct || 0), 0)}%{c.produtoAusente ? ` e ${nomeBonito(c.produtoAusente)} sumiu da cesta` : ''}.</p>}
                    {c.textoGerente && <TextoGerente texto={c.textoGerente} />}
                    {Array.isArray(c.cadastrosUnidos) && c.cadastrosUnidos.length > 0 && <p className="text-xs font-medium text-gray-500 mt-2">Cadastros unidos: {c.cadastrosUnidos.map(nomeBonito).join(', ')}.</p>}
                    <div className="mt-2"><button type="button" onClick={() => abrirFicha(c.clienteId)} className="min-h-[44px] px-4 rounded-full text-sm font-semibold bg-primary hover:bg-primaryDark text-white shadow-sm">Abrir a ficha</button></div>
                    <BotoesJaSei cliente={{ clienteId: c.clienteId, nome: c.nome }} abrir={abrirJaSei} />
                </div>
            )}
        </div>
    );
};

const BlocoAtencao = ({ atencao, cheia, setCheia, abrirJaSei, abrirFicha, aba, setAba }) => {
    const [aberto, setAberto] = useState(null);
    const abas = ABAS_ATENCAO.filter((a) => atencao[a.key]);
    const atual = abas.find((a) => a.key === aba) ? aba : (abas[0]?.key || 'paradoAna');
    const bloco = atencao[atual] || { total: 0, itens: [] };
    const itens = Array.isArray(bloco.itens) ? bloco.itens : [];
    const ver = cheia ? itens : itens.slice(0, 5);
    return (
        <Card icon={AlertTriangle} titulo="Clientes que pedem atenção" direita={`${pl(bloco.total, 'cliente', 'clientes')} · pelo valor parado`} semPadding>
            <div className="flex gap-2 overflow-x-auto hide-scrollbar px-4 md:px-5 py-3 border-b border-gray-100">
                {abas.map((a) => (
                    <button key={a.key} type="button" onClick={() => { setAba(a.key); setAberto(null); }} aria-pressed={atual === a.key}
                        className={`flex-none min-h-[44px] px-3.5 rounded-full text-sm font-semibold border ${atual === a.key ? 'bg-primary border-primary text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                        {a.label} · {fmtInt(atencao[a.key].total)}
                    </button>
                ))}
            </div>
            {ver.length === 0 && <div className="p-4"><Vazio>Nenhum cliente nesta lista.</Vazio></div>}
            {ver.map((c) => (
                <LinhaClienteAtencao key={c.clienteId} c={c} aba={atual} cheia={cheia}
                    aberto={aberto === c.clienteId} onToggle={() => setAberto(aberto === c.clienteId ? null : c.clienteId)} abrirJaSei={abrirJaSei} abrirFicha={abrirFicha} />
            ))}
            <Rodape texto={`Mostrando ${ver.length} de ${fmtInt(bloco.total)}`}
                botao={bloco.total > 5 ? <BotaoPilula onClick={() => setCheia(!cheia)}>{cheia ? 'Encurtar a lista' : `Ver todos os ${fmtInt(bloco.total)}`}</BotaoPilula> : null} />
        </Card>
    );
};

const BlocoTop20 = ({ t, listaCompleta, abrirJaSei, abrirFicha }) => {
    const [todos, setTodos] = useState(false);
    const [aberto, setAberto] = useState(null);
    const itens = (Array.isArray(t.itens) ? t.itens : []).map((m, i) => ({ ...m, pos: i + 1 }));
    if (!itens.length) return null;
    const cheia = listaCompleta || todos;
    const falt = itens.filter((m) => m.status === 'FALTANDO');
    const ok = itens.filter((m) => m.status !== 'FALTANDO');
    const curta = [...falt, ...ok.slice(0, Math.max(0, 5 - Math.min(falt.length, 5)))].sort((a, b) => a.pos - b.pos);
    const ver = cheia ? itens : curta;
    return (
        <Card icon={Crown} titulo="Os 20 maiores clientes"
            direita={`${itens.length - falt.length} em dia · ${falt.length} com ${falt.length === 1 ? 'pedido faltando' : 'pedidos faltando'}${t.pctDaVenda90d != null ? ` · ${fmtBR(t.pctDaVenda90d, 0)}% da venda de 90 dias` : ''}`} semPadding>
            {ver.map((m) => {
                const faltando = m.status === 'FALTANDO';
                const ab = aberto === m.clienteId;
                const sub = [primeiroNome(m.vendedor), m.ritmoDias != null ? `compra a cada ${pl(Math.round(m.ritmoDias), 'dia', 'dias')}` : '', m.cadastrosUnidos?.length ? `${m.cadastrosUnidos.length + 1} cadastros do mesmo cliente` : ''].filter(Boolean).join(' · ');
                return (
                    <div key={m.clienteId} className="border-b border-gray-100 last:border-b-0">
                        <button type="button" onClick={() => (faltando ? setAberto(ab ? null : m.clienteId) : abrirFicha(m.clienteId))} aria-expanded={faltando ? ab : undefined}
                            className="w-full text-left px-4 md:px-5 py-3 min-h-[56px] flex items-center gap-3 hover:bg-gray-50">
                            <span className="flex-none w-7 text-xs font-extrabold text-gray-400 tabular-nums">{m.pos}</span>
                            <span className="flex-1 min-w-0">
                                <span className="block text-sm font-bold text-gray-900 break-words">{nomeBonito(m.nome)}</span>
                                <span className="block text-xs font-medium text-gray-500 break-words">{sub}</span>
                            </span>
                            <span className="flex-none text-right">
                                <span className="block text-sm font-extrabold text-gray-900 tabular-nums">{fmtRS0(m.reais90d)}</span>
                                {faltando ? <Pill cor="amber">{pl(m.diasSemComprar, 'dia', 'dias')} sem pedir</Pill> : m.silenciadoAte ? <Pill cor="blue">sem aviso até {dm(m.silenciadoAte)}</Pill> : <Pill cor="green">em dia</Pill>}
                            </span>
                        </button>
                        {faltando && ab && (
                            <div className="px-4 md:px-5 pb-4">
                                {m.textoGerente && <TextoGerente texto={m.textoGerente} />}
                                <div className="mt-2"><button type="button" onClick={() => abrirFicha(m.clienteId)} className="min-h-[44px] px-4 rounded-full text-sm font-semibold bg-primary hover:bg-primaryDark text-white shadow-sm">Abrir a ficha</button></div>
                                <BotoesJaSei cliente={{ clienteId: m.clienteId, nome: m.nome }} abrir={abrirJaSei} />
                            </div>
                        )}
                    </div>
                );
            })}
            <Rodape texto={`Mostrando ${ver.length} de ${itens.length} · comprado em 90 dias`}
                botao={itens.length > 5 && !listaCompleta ? <BotaoPilula onClick={() => setTodos(!todos)}>{todos ? 'Encurtar' : `Ver os ${itens.length}`}</BotaoPilula> : null} />
        </Card>
    );
};

const TextoSemPedido = ({ r }) => {
    if (!r || !r.total) return <>nenhum registro</>;
    const partes = [`${fmtInt(r.whatsapp)} WhatsApp`, `${fmtInt(r.presencial)} presencial`, `${fmtInt(r.semVisita)} sem visita`];
    if (r.outros > 0) partes.push(`${fmtInt(r.outros)} outros`);
    return <>{pl(r.total, 'registro', 'registros')} ({partes.join(', ')})</>;
};

const BlocoCarteiraVendedor = ({ linhas }) => {
    if (!linhas.length) return null;
    const soma = (k) => linhas.reduce((s, l) => s + Number(l[k] || 0), 0);
    const cols = [['total', 'Total'], ['noRitmo', 'No ritmo'], ['atrasoLeve', 'Atraso leve'], ['paradoAna', 'Parado, Ana chama'], ['paradoVisita', 'Parado, visita'], ['inativar', 'Inativar'], ['novos', 'Novos']];
    const cel = (l, k) => {
        const v = Number(l[k] || 0);
        const cls = (k === 'atrasoLeve' && v) ? 'text-amber-700 font-bold' : ((k === 'paradoAna' || k === 'paradoVisita') && v) ? 'text-red-700 font-bold' : 'text-gray-800';
        return <td key={k} className={`px-3 py-3 text-right tabular-nums ${cls}`}>{fmtInt(v)}</td>;
    };
    return (
        <Card icon={Users} titulo="Carteira por vendedor" direita="situação de hoje, pelo ritmo de cada cliente" semPadding>
            <div className="hidden md:block">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Vendedor</th>
                            {cols.map(([k, l]) => <th key={k} className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">{l}</th>)}
                            <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Em risco/mês</th>
                            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Sem pedido no período</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200 text-sm">
                        {linhas.map((l) => (
                            <tr key={l.vendedorId || 'sem'} className="hover:bg-gray-50">
                                <td className="px-5 py-3 font-semibold text-gray-900">{l.nome}</td>
                                {cols.map(([k]) => cel(l, k))}
                                <td className="px-3 py-3 text-right tabular-nums font-bold text-gray-900">{fmtRS0(l.valorEmRiscoMes)}</td>
                                <td className="px-3 py-3 text-xs font-medium text-gray-600"><TextoSemPedido r={l.registrosSemPedido} /></td>
                            </tr>
                        ))}
                        {linhas.length > 1 && (
                            <tr className="bg-gray-50 font-bold">
                                <td className="px-5 py-3 text-gray-900">Total</td>
                                {cols.map(([k]) => <td key={k} className="px-3 py-3 text-right tabular-nums">{fmtInt(soma(k))}</td>)}
                                <td className="px-3 py-3 text-right tabular-nums">{fmtRS0(soma('valorEmRiscoMes'))}</td>
                                <td />
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            <div className="md:hidden space-y-3 p-3">
                {linhas.map((l) => (
                    <div key={l.vendedorId || 'sem'} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <b className="text-gray-900 truncate">{l.nome}</b>
                            <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">{pl(l.total, 'cliente', 'clientes')}</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {cols.filter(([k]) => k !== 'total').map(([k, lab]) => (
                                <div key={k} className="bg-gray-50 rounded-lg px-2 py-1.5"><p className="text-base font-extrabold text-gray-900 tabular-nums">{fmtInt(l[k])}</p><p className="text-[11px] font-semibold text-gray-500 leading-tight">{lab}</p></div>
                            ))}
                        </div>
                        <p className="text-xs font-semibold text-gray-600 mt-2">Em risco por mês: <b className="text-gray-900">{fmtRS0(l.valorEmRiscoMes)}</b></p>
                        <p className="text-xs font-medium text-gray-600 mt-1">Sem pedido no período: <TextoSemPedido r={l.registrosSemPedido} /></p>
                    </div>
                ))}
            </div>
        </Card>
    );
};

const BlocoEquipe = ({ eq, vendedorId, antes }) => {
    let lista = Array.isArray(eq.porVendedor) ? eq.porVendedor : [];
    if (vendedorId && vendedorId !== 'todos') lista = lista.filter((v) => v.vendedorId === vendedorId);
    if (!lista.length) return null;
    const rot = eq.janela?.atual ? `${dm(eq.janela.atual.de)} a ${dm(eq.janela.atual.ate)}` : null;
    return (
        <Card icon={MessageCircle} titulo="O que a equipe fez" direita={rot}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                {lista.map((v) => {
                    const a = v.atual || {}; const b = v.anterior || {};
                    const sp = a.semPedido || { whatsapp: 0, presencial: 0, semVisita: 0, outros: 0, total: 0 };
                    const bs = b.semPedido || {};
                    const baldes = [
                        { k: 'whatsapp', l: 'WhatsApp', cor: 'bg-primary' },
                        { k: 'presencial', l: 'Visita presencial', cor: 'bg-[#cba258]' },
                        { k: 'semVisita', l: 'Sem visita', cor: 'bg-gray-400' },
                        { k: 'outros', l: 'Outros', cor: 'bg-blue-300' }
                    ].filter((x) => x.k !== 'outros' || Number(sp.outros) > 0);
                    const tot = Math.max(1, baldes.reduce((t, x) => t + Number(sp[x.k] || 0), 0));
                    const w = (x) => `${((x || 0) / tot) * 100}%`;
                    return (
                        <div key={v.vendedorId || v.nome} className="bg-gray-50 border border-gray-100 rounded-xl p-3.5">
                            <div className="flex items-baseline justify-between gap-2"><b className="text-gray-900 break-words">{v.nome}</b><span className="text-xs font-semibold text-gray-500">{pl(sp.total, 'registro sem pedido', 'registros sem pedido')}</span></div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2 text-center">
                                <div><p className="text-base font-extrabold text-gray-900 tabular-nums">{fmtInt(a.pedidos)}</p><p className="text-[11px] font-semibold text-gray-500">{Number(a.pedidos) === 1 ? 'pedido' : 'pedidos'}</p></div>
                                <div><p className="text-base font-extrabold text-gray-900 tabular-nums">{fmtRS0(a.reais)}</p><p className="text-[11px] font-semibold text-gray-500">lançados</p></div>
                                <div><p className="text-base font-extrabold text-gray-900 tabular-nums">{fmtInt(a.clientes)}</p><p className="text-[11px] font-semibold text-gray-500">{Number(a.clientes) === 1 ? 'cliente comprou' : 'clientes compraram'}</p></div>
                            </div>
                            {sp.total > 0 && (
                                <>
                                    <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-200 mt-3" role="img" aria-label="Divisão dos registros sem pedido">
                                        {baldes.map((x) => <i key={x.k} className={x.cor} style={{ width: w(sp[x.k]) }} />)}
                                    </div>
                                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-semibold text-gray-600 mt-1.5">
                                        {baldes.map((x) => <span key={x.k}><i className={`inline-block w-2 h-2 rounded-full mr-1 ${x.cor}`} />{x.l} {fmtInt(sp[x.k])}</span>)}
                                    </div>
                                    <p className="text-[11px] font-medium text-gray-600 mt-1.5">À parte da barra (não somam com ela): {fmtInt(sp.atendidoSemPedido)} marcados como atendido sem pedido e {fmtInt(sp.semResposta)} sem resposta.</p>
                                </>
                            )}
                            <p className="text-[11px] font-medium text-gray-500 mt-2">
                                {antes}: {pl(b.pedidos, 'pedido', 'pedidos')} · {fmtRS0(b.reais)} · {pl(bs.total, 'registro sem pedido', 'registros sem pedido')} · {pl(bs.presencial, 'visita presencial', 'visitas presenciais')}
                            </p>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
};

const BlocoMotivos = ({ m }) => {
    const itens = Array.isArray(m.itens) ? m.itens : [];
    const max = Math.max(1, ...itens.map((i) => Number(i.qtd || 0)));
    return (
        <Card icon={HelpCircle} titulo="Por que não compraram" direita={`últimos 30 dias · ${pl(m.totalRegistros, 'registro', 'registros')}`}>
            {itens.length === 0 && <Vazio>Nenhum registro sem pedido no período.</Vazio>}
            <div className="space-y-1.5">
                {itens.map((i) => (
                    <div key={i.motivo} className="flex items-center gap-2">
                        <span className={`w-32 md:w-36 flex-none text-[13px] font-semibold truncate ${i.semMotivo ? 'text-gray-500' : 'text-gray-800'}`}>{i.motivo}</span>
                        <span className="flex-1 h-3 bg-gray-100 rounded-md overflow-hidden"><i className={`block h-full rounded-md ${i.semMotivo ? 'bg-gray-300' : 'bg-primary'}`} style={{ width: `${Math.max(2, (i.qtd / max) * 100)}%` }} /></span>
                        <span className="w-10 flex-none text-right text-[13px] font-bold text-gray-900 tabular-nums">{fmtInt(i.qtd)}</span>
                    </div>
                ))}
            </div>
            {Array.isArray(m.porAcao) && m.porAcao.length > 0 && (
                <p className="text-xs font-medium text-gray-600 mt-3">Pelo tipo de registro: {m.porAcao.map((a) => `${a.label} ${fmtInt(a.qtd)}`).join(' · ')}.</p>
            )}
            {m.aviso && <p className="text-xs font-medium text-gray-500 mt-2">{m.aviso}</p>}
        </Card>
    );
};

const BlocoQuemMudou = ({ q, rotAtual, rotAnt, abrirFicha }) => {
    const cairam = Array.isArray(q.cairam) ? q.cairam : [];
    const subiram = Array.isArray(q.subiram) ? q.subiram : [];
    if (!cairam.length && !subiram.length) return null;
    const Linha = ({ c }) => {
        const d = Number(c.diferenca || 0);
        const Raiz = c.clienteId ? 'button' : 'div';
        return (
            <Raiz {...(c.clienteId ? { type: 'button', onClick: () => abrirFicha(c.clienteId) } : {})}
                className={`w-full text-left flex items-center justify-between gap-3 px-4 md:px-5 py-2.5 min-h-[44px] border-b border-gray-100 last:border-b-0 ${c.clienteId ? 'hover:bg-gray-50' : ''}`}>
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{nomeBonito(c.nome)}</p>
                    <p className="text-xs font-medium text-gray-500 truncate">{[primeiroNome(c.vendedor), tipoCurto(c.tipo), c.cadastrosUnidos?.length ? 'cadastros unidos' : ''].filter(Boolean).join(' · ')} · de {fmtRS0(c.anterior)} para {fmtRS0(c.atual)}</p>
                </div>
                <span className={`flex-none text-sm font-extrabold tabular-nums ${d < 0 ? 'text-red-700' : 'text-green-700'}`}>{d < 0 ? '− ' : '+ '}{fmtRS0(Math.abs(d))}</span>
            </Raiz>
        );
    };
    return (
        <Card icon={ArrowUpDown} titulo="Quem mais caiu e quem mais subiu" direita={`${rotAtual} contra ${rotAnt}`} semPadding>
            {cairam.length > 0 && <p className="px-4 md:px-5 pt-3 pb-1 text-xs font-bold uppercase tracking-widest text-red-700">Quem mais caiu</p>}
            {cairam.map((c) => <Linha key={`c-${c.clienteId}`} c={c} />)}
            {subiram.length > 0 && <p className="px-4 md:px-5 pt-3 pb-1 text-xs font-bold uppercase tracking-widest text-green-700">Quem mais subiu</p>}
            {subiram.map((c) => <Linha key={`s-${c.clienteId}`} c={c} />)}
        </Card>
    );
};

const TabelaComparativa = ({ icon, titulo, rotulo, linhas, chave, rotAtual, rotAnt }) => {
    if (!linhas.length) return null;
    return (
        <Card icon={icon} titulo={titulo} direita={`${rotAtual} contra ${rotAnt}`} semPadding>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-3 px-4 md:px-5 py-2 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                <span>{rotulo}</span><span className="text-right w-16 md:w-20">Antes</span><span className="text-right w-16 md:w-20">Agora</span><span className="text-right w-16 md:w-20">Diferença</span>
            </div>
            {linhas.map((l) => {
                const d = Number(l.diferenca || 0);
                return (
                    <div key={l[chave]} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-3 px-4 md:px-5 py-2.5 border-b border-gray-100 last:border-b-0 text-sm items-center">
                        <span className="font-semibold text-gray-800 truncate">{tipoCurto(l[chave])}</span>
                        <span className="text-right w-16 md:w-20 tabular-nums text-gray-600 text-[13px]">{fmtInt(l.anterior)}</span>
                        <span className="text-right w-16 md:w-20 tabular-nums text-gray-900 text-[13px] font-semibold">{fmtInt(l.atual)}</span>
                        <span className={`text-right w-16 md:w-20 tabular-nums text-[13px] font-bold ${d < 0 ? 'text-red-700' : 'text-green-700'}`}>{d < 0 ? '−' : '+'}{fmtInt(Math.abs(d))}</span>
                    </div>
                );
            })}
        </Card>
    );
};

/* ─────────────── aba ─────────────── */
const AbaCarteira = ({ tick = 0, onAtualizado, onIrPara }) => {
    const [filtros, setFiltros] = useFiltrosSalvos('carteira', { periodo: 'semana', vendedorId: 'todos', lista: 'curta' });
    const periodo = filtros.periodo === 'mes' ? 'mes' : 'semana';
    const vendedorId = filtros.vendedorId || 'todos';
    const listaCompleta = filtros.lista === 'completa';
    const [d, setD] = useState(null);
    const [erro, setErro] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const [abaAtencao, setAbaAtencao] = useState('paradoAna');
    const [jaSei, setJaSei] = useState(null); // { cliente, modo }
    const [ficha, setFicha] = useState(null); // { id, inativar }
    const [fichaVersao, setFichaVersao] = useState(0);
    const reqRef = useRef(0);
    const ultimaBuscaRef = useRef(0);
    const abrirFicha = (id, inativar = false) => { if (id) setFicha({ id, inativar }); };
    const abrirJaSei = (cliente, modo) => (modo === 'inativar' ? abrirFicha(cliente.clienteId, true) : setJaSei({ cliente, modo }));

    // silencioso = busca em segundo plano: não pisca a tela, não mexe na rolagem nem em listas abertas
    const carregar = useCallback(async ({ fresh = false, silencioso = false } = {}) => {
        const id = ++reqRef.current;
        ultimaBuscaRef.current = Date.now();
        if (!silencioso) setCarregando(true);
        try {
            const res = await api.get('/dashboards/geral/carteira', { params: { periodo, vendedorId, ...(fresh ? { fresh: 1 } : {}) } });
            if (id !== reqRef.current) return;
            setD(res.data); setErro(null);
            if (onAtualizado) onAtualizado(new Date());
        } catch (e) {
            if (id !== reqRef.current) return;
            if (!silencioso) setErro(erroMsg(e, 'Não foi possível carregar a Carteira.'));
        } finally {
            if (id === reqRef.current) setCarregando(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [periodo, vendedorId]);

    useEffect(() => { carregar(); }, [carregar]);

    // Gatilho do painel (voltar ao app, 5 min): busca em silêncio
    const tickAnterior = useRef(tick);
    useEffect(() => {
        if (tickAnterior.current === tick) return;
        tickAnterior.current = tick;
        if (Date.now() - ultimaBuscaRef.current >= 30000) carregar({ silencioso: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tick]);

    // Voltou para a aba do navegador / a janela ganhou foco: atualiza em silêncio (no mínimo 30 s entre buscas)
    useEffect(() => {
        const revalidar = () => {
            if (document.visibilityState !== 'visible') return;
            if (Date.now() - ultimaBuscaRef.current < 30000) return;
            carregar({ silencioso: true });
        };
        document.addEventListener('visibilitychange', revalidar);
        window.addEventListener('focus', revalidar);
        return () => { document.removeEventListener('visibilitychange', revalidar); window.removeEventListener('focus', revalidar); };
    }, [carregar]);

    // Vendedor salvo que não existe mais: volta para "Todos"
    useEffect(() => {
        if (!d || vendedorId === 'todos' || vendedorId === 'sem-vendedor') return;
        if (Array.isArray(d.vendedores) && !d.vendedores.some((v) => v.id === vendedorId)) setFiltros({ ...filtros, vendedorId: 'todos' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [d]);

    const avisarComDesfazer = (msg, desfazer) => {
        toast((t) => (
            <span className="flex items-center gap-3 text-sm font-medium">
                <span>{msg}</span>
                {desfazer && (
                    <button type="button" className="font-bold text-primary underline min-h-[44px] px-2 flex-none"
                        onClick={async () => {
                            toast.dismiss(t.id);
                            try { await desfazer(); toast.success('Desfeito.'); carregar({ silencioso: true }); setFichaVersao((v) => v + 1); }
                            catch (e) { toast.error(erroMsg(e, 'Não foi possível desfazer.')); }
                        }}>Desfazer</button>
                )}
            </span>
        ), { duration: 10000 });
    };

    const aoFeito = (msg, desfazer) => { setJaSei(null); avisarComDesfazer(msg, desfazer); carregar({ silencioso: true }); setFichaVersao((v) => v + 1); };

    const resolver = {
        juntar: async (it) => {
            try {
                const r = await api.post('/dashboards/geral/carteira/mesmo-cliente', { antigoId: it.antigoId, atualId: it.atualId, origem: 'SUGESTAO' });
                const id = r.data?.id;
                avisarComDesfazer(`${nomeBonito(it.antigoNome)} e ${nomeBonito(it.atualNome)} agora são um cliente só.`, id ? () => api.delete(`/dashboards/geral/carteira/mesmo-cliente/${id}`) : null);
                carregar({ silencioso: true });
            } catch (e) { toast.error(erroMsg(e, 'Não foi possível juntar os cadastros.')); }
        },
        dispensar: async (it) => {
            try {
                const r = await api.post('/dashboards/geral/carteira/sugestao-dispensar', { antigoId: it.antigoId, atualId: it.atualId });
                const id = r.data?.id;
                avisarComDesfazer('Combinado, não vou sugerir juntar estes dois de novo.', id ? () => api.delete(`/dashboards/geral/carteira/mesmo-cliente/${id}`) : null);
                carregar({ silencioso: true });
            } catch (e) { toast.error(erroMsg(e, 'Não foi possível dispensar a sugestão.')); }
        }
    };

    const antes = periodo === 'mes' ? 'Mês anterior' : 'Semana anterior';
    const antesMin = antes.toLowerCase();
    const rotAtual = d?.resumo?.rotulo || (periodo === 'mes' ? 'este mês' : 'esta semana');
    const rotJanelaAtual = d?.janela?.atual ? `${dm(d.janela.atual.de)} a ${dm(d.janela.atual.ate)}` : rotAtual;
    const rotJanelaAnt = d?.janela?.anterior ? `${dm(d.janela.anterior.de)} a ${dm(d.janela.anterior.ate)}` : antesMin;

    const vendedoresOpc = Array.isArray(d?.vendedores) ? d.vendedores : [];

    return (
        <div className="space-y-3 md:space-y-4">
            {/* Controles */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4 flex flex-col md:flex-row md:flex-wrap md:items-center gap-3">
                <Seg valor={periodo} onChange={(v) => setFiltros({ ...filtros, periodo: v })} rotulo="Período" opcoes={[{ value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mês' }]} />
                <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-gray-500 flex-none" />
                    <SelectBusca value={vendedorId} onChange={(e) => setFiltros({ ...filtros, vendedorId: e.target.value })} className="w-full md:w-60 h-[44px] md:h-10">
                        <option value="todos">Todos os vendedores</option>
                        {vendedoresOpc.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                        <option value="sem-vendedor">Sem vendedor</option>
                    </SelectBusca>
                </div>
                <Seg valor={listaCompleta ? 'completa' : 'curta'} onChange={(v) => setFiltros({ ...filtros, lista: v })} rotulo="Tamanho das listas" opcoes={[{ value: 'curta', label: 'Lista curta' }, { value: 'completa', label: 'Completa' }]} />
                <div className="md:ml-auto flex items-center gap-2 text-xs font-semibold text-gray-500">
                    {d && <span>Foto de hoje{d.hoje ? `, ${dm(d.hoje)}` : ''}{d.cacheIdadeSegundos > 60 ? ` · calculada há ${Math.round(d.cacheIdadeSegundos / 60)} min` : ''}</span>}
                    <button type="button" onClick={() => carregar({ fresh: true })} disabled={carregando} aria-label="Recalcular agora"
                        className="p-2.5 rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center">
                        <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {carregando && !d && (
                <div className="flex justify-center items-center h-48"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" /></div>
            )}

            {erro && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3" role="alert">
                    <p className="text-sm font-semibold text-red-800 flex-1">{erro}{d ? ' Os números abaixo são da última vez que carregou.' : ''}</p>
                    <BotaoPilula primario onClick={() => carregar({ fresh: true })}>Tentar novamente</BotaoPilula>
                </div>
            )}

            {d && (
                <div className={`space-y-3 md:space-y-4 transition-opacity ${carregando ? 'opacity-60' : ''}`}>
                    {d.resumo && <BlocoResumo resumo={d.resumo} rotulo={rotAtual} />}
                    {d.projecao && <BlocoProjecao p={d.projecao} vendedorId={vendedorId} />}
                    {d.numeros && <BlocoNumeros n={d.numeros} antes={antes} />}
                    {d.grafico && <BlocoGrafico g={d.grafico} onIrPara={onIrPara} />}
                    {Array.isArray(d.decisoes) && <BlocoDecisoes decisoes={d.decisoes} resolver={resolver} semVendedor={d.semVendedor} pendentes={d.decisoesPendentes} abrirFicha={abrirFicha} />}
                    {d.resultadoDecisoes && <BlocoResultadoDecisoes r={d.resultadoDecisoes} />}
                    {d.top20 && <BlocoTop20 t={d.top20} listaCompleta={listaCompleta} abrirJaSei={abrirJaSei} abrirFicha={abrirFicha} />}
                    {Array.isArray(d.carteiraPorVendedor) && <BlocoCarteiraVendedor linhas={d.carteiraPorVendedor} />}
                    {d.atencao && <BlocoAtencao atencao={d.atencao} cheia={listaCompleta} setCheia={(v) => setFiltros({ ...filtros, lista: v ? 'completa' : 'curta' })}
                        abrirJaSei={abrirJaSei} abrirFicha={abrirFicha} aba={abaAtencao} setAba={setAbaAtencao} />}
                    {d.equipe && <BlocoEquipe eq={d.equipe} vendedorId={vendedorId} antes={antes} />}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4 items-start">
                        {d.motivos && <BlocoMotivos m={d.motivos} />}
                        {d.quemMudou && <BlocoQuemMudou q={d.quemMudou} rotAtual={rotJanelaAtual} rotAnt={rotJanelaAnt} abrirFicha={abrirFicha} />}
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4 items-start">
                        {Array.isArray(d.porTipoCliente) && <TabelaComparativa icon={Tag} titulo="Por tipo de cliente" rotulo="Tipo" linhas={d.porTipoCliente} chave="tipo" rotAtual={rotJanelaAtual} rotAnt={rotJanelaAnt} />}
                        {Array.isArray(d.porGrupoProduto) && <TabelaComparativa icon={Boxes} titulo="Por grupo de produto" rotulo="Grupo" linhas={d.porGrupoProduto} chave="grupo" rotAtual={rotJanelaAtual} rotAnt={rotJanelaAnt} />}
                    </div>

                    {/* Extras herdados da antiga aba Recorrência */}
                    {(d.movimento || d.valorEmRiscoMes != null) && (
                        <Card icon={Layers} titulo="Movimento da carteira" direita={d.movimento ? `${pl(d.movimento.totalAtivos, 'cliente ativo acompanhado', 'clientes ativos acompanhados')}` : null}>
                            {d.valorEmRiscoMes != null && (
                                <p className="text-sm text-gray-700 mb-3">Os clientes parados e em atraso leve compravam juntos cerca de <b className="text-gray-900">{fmtRS0(d.valorEmRiscoMes)} por mês</b>. É essa venda que está em risco.</p>
                            )}
                            {d.movimento && (
                                <div className="grid grid-cols-2 gap-3 text-center">
                                    <div className="bg-gray-50 rounded-lg px-3 py-2.5"><p className="text-2xl font-extrabold text-red-700 tabular-nums">{fmtInt(d.movimento.semCompra90d)}</p><p className="text-xs font-bold text-gray-500">sem compra há mais de 90 dias</p></div>
                                    <div className="bg-gray-50 rounded-lg px-3 py-2.5"><p className="text-2xl font-extrabold text-amber-700 tabular-nums">{fmtInt(d.movimento.primeiraCompraSemRecompra)}</p><p className="text-xs font-bold text-gray-500">1ª compra sem recompra</p></div>
                                </div>
                            )}
                            <p className="text-xs font-medium text-gray-500 mt-3">A 2ª compra é o que fideliza. Acompanhe de perto quem fez só uma.</p>
                        </Card>
                    )}
                    {onIrPara && (
                        <p className="text-sm text-gray-600 font-medium px-1">
                            Mais detalhe em <button type="button" onClick={() => onIrPara('vendas')} className="text-primary font-bold underline min-h-[44px] px-1">Vendas &amp; Pedidos</button> e <button type="button" onClick={() => onIrPara('atendimentos')} className="text-primary font-bold underline min-h-[44px] px-1">Atendimentos</button>.
                        </p>
                    )}
                </div>
            )}

            {ficha && (
                <FichaClienteCarteira key={ficha.id} clienteId={ficha.id} inativarInicial={ficha.inativar} versao={fichaVersao} bloqueado={!!jaSei}
                    onClose={() => setFicha(null)}
                    onSalvo={(msg, desfazer) => { avisarComDesfazer(msg, desfazer); carregar({ silencioso: true }); }}
                    onMudou={(msg) => { toast.success(msg); carregar({ silencioso: true }); }}
                    onAbrirJaSei={abrirJaSei} />
            )}
            {jaSei && <JaSeiDialog cliente={jaSei.cliente} modo={jaSei.modo} onClose={() => setJaSei(null)} onFeito={aoFeito} />}
        </div>
    );
};

export default AbaCarteira;
