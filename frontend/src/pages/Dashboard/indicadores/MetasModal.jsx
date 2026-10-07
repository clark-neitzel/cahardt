import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, Target, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { buscarIndicador, salvarMetas } from '../../../services/indicadoresGestaoApi';

// Metas dos indicadores (só admin). O servidor manda o catálogo (rótulo, unidade, sentido, padrões);
// aqui só se digita alvo e tolerâncias. Quem decide o semáforo é o servidor.
const aTxt = (v) => (v === null || v === undefined || v === '' ? '' : String(v).replace('.', ','));
const aNum = (t) => {
    const x = String(t ?? '').trim().replace(',', '.');
    if (x === '') return null;
    const n = Number(x);
    return Number.isFinite(n) ? n : NaN;
};
const campo = 'w-full border border-gray-300 rounded px-3 py-2.5 min-h-[44px] text-sm tabular-nums focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:bg-gray-50';

export default function MetasModal({ visaoDono, onFechar, onSalvou }) {
    const [itens, setItens] = useState([]);       // catálogo vindo do servidor
    const [form, setForm] = useState({});         // { [indicador]: { alvo, atencao, agir } } em texto
    const [orig, setOrig] = useState({});
    const [obs, setObs] = useState({});           // observação das sugestões sem base
    const [carregando, setCarregando] = useState(true);
    const [erroCarga, setErroCarga] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [sugerindo, setSugerindo] = useState(false);
    const [pendenteSug, setPendenteSug] = useState(null); // sugestões aguardando "substituir?"
    const [erros, setErros] = useState({});

    useEffect(() => {
        let vivo = true;
        buscarIndicador('metas', {})
            .then(({ dados }) => {
                if (!vivo) return;
                const lista = Array.isArray(dados?.metas) ? dados.metas : [];
                const f = {};
                lista.forEach((m) => { f[m.indicador] = { alvo: aTxt(m.alvo), atencao: aTxt(m.toleranciaAtencao), agir: aTxt(m.toleranciaAgir) }; });
                setItens(lista); setForm(f); setOrig(JSON.parse(JSON.stringify(f)));
            })
            .catch((e) => { if (vivo) setErroCarga(e?.response?.data?.error || 'Não foi possível carregar as metas; tente de novo.'); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, []);

    // visão produção mostra só os indicadores de produção; visão dono mostra todos
    const visiveis = useMemo(() => itens.filter((m) => visaoDono || m.escopo === 'producao'), [itens, visaoDono]);
    const mudou = (ind) => { const a = form[ind], b = orig[ind]; return !!a && !!b && (a.alvo !== b.alvo || a.atencao !== b.atencao || a.agir !== b.agir); };
    const nMudou = visiveis.filter((m) => mudou(m.indicador)).length;

    const [avisoSair, setAvisoSair] = useState(false);
    const tentarFechar = () => { if (nMudou > 0) setAvisoSair(true); else onFechar(); };
    const fecharRef = React.useRef(tentarFechar);
    fecharRef.current = tentarFechar;
    useEffect(() => {
        const tecla = (e) => { if (e.key === 'Escape') fecharRef.current(); };
        document.addEventListener('keydown', tecla);
        const anterior = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', tecla); document.body.style.overflow = anterior; };
    }, []);

    const set = (ind, k, v) => { setForm((f) => ({ ...f, [ind]: { ...f[ind], [k]: v } })); setErros((e) => ({ ...e, [ind]: null })); };

    const aplicarSugestoes = (lista) => {
        setForm((f) => {
            const n = { ...f };
            lista.forEach((s) => { if (s.alvoSugerido != null && n[s.indicador]) n[s.indicador] = { ...n[s.indicador], alvo: aTxt(s.alvoSugerido) }; });
            return n;
        });
        setPendenteSug(null);
    };

    const sugerir = async () => {
        setSugerindo(true);
        try {
            const { dados } = await buscarIndicador('metas/sugestao', {});
            const lista = (Array.isArray(dados?.sugestoes) ? dados.sugestoes : []).filter((s) => visiveis.some((m) => m.indicador === s.indicador));
            const o = {};
            lista.forEach((s) => { if (s.alvoSugerido == null) o[s.indicador] = s.observacao || 'sem base'; });
            setObs(o);
            const comValor = lista.filter((s) => s.alvoSugerido != null);
            if (!comValor.length) { toast('Ainda não há base para sugerir. Preencha manualmente.'); return; }
            if (comValor.some((s) => (form[s.indicador]?.alvo || '') !== '')) setPendenteSug(comValor);
            else aplicarSugestoes(comValor);
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Não foi possível calcular a sugestão.');
        } finally { setSugerindo(false); }
    };

    const salvar = async () => {
        const novos = {}, envio = [];
        for (const m of visiveis) {
            if (!mudou(m.indicador)) continue;
            const f = form[m.indicador], o = orig[m.indicador];
            const alvo = aNum(f.alvo), at = aNum(f.atencao), ag = aNum(f.agir);
            if (alvo === null) { if (o.alvo !== '') envio.push({ indicador: m.indicador, alvo: null }); continue; } // remover
            if (Number.isNaN(alvo) || Number.isNaN(at) || Number.isNaN(ag)) { novos[m.indicador] = 'Use só números, por exemplo 35 ou 1,5.'; continue; }
            if ((at ?? 0) < 0 || (ag ?? 0) < 0 || (at != null && ag != null && at > ag)) { novos[m.indicador] = 'Atenção acima de deve ser menor ou igual a Agir acima de (nenhum negativo).'; continue; }
            envio.push({ indicador: m.indicador, alvo, ...(at != null ? { toleranciaAtencao: at } : {}), ...(ag != null ? { toleranciaAgir: ag } : {}) }); // apagado = servidor usa o padrão
        }
        setErros(novos);
        if (Object.keys(novos).length) { toast.error('Corrija os campos marcados.'); return; }
        if (!envio.length) { onFechar(); return; }
        setSalvando(true);
        try {
            await salvarMetas(envio);
            toast.success('Metas salvas. Os semáforos já usam as novas metas.');
            onSalvou?.();
            onFechar();
        } catch (e) {
            const st = e?.response?.status;
            toast.error(st === 404 ? 'Este recurso ainda não está disponível no servidor.' : (e?.response?.data?.error || e?.response?.data?.message || 'Não foi possível salvar as metas.'));
        } finally { setSalvando(false); }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Metas dos indicadores" onClick={tentarFechar}>
            <div className="bg-white w-full sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 px-4 md:px-5 py-3.5 border-b border-gray-100 flex-none">
                    <Target className="h-4 w-4 text-primary flex-none" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600 flex-1">Metas dos indicadores</span>
                    <button type="button" onClick={tentarFechar} aria-label="Fechar" className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
                </div>

                <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-5 space-y-3">
                    <p className="text-xs text-gray-600 leading-relaxed">
                        Com meta, o semáforo compara o número com o alvo: até a folga de <b>atenção</b> ainda é "no alvo"; acima dela vira <b>atenção</b>; acima do ponto de <b>agir</b> fica vermelho. Sem meta, vale a comparação de sempre (média de 3 meses). A folga é em pontos percentuais (ou dias).
                    </p>
                    <button type="button" onClick={sugerir} disabled={carregando || sugerindo || !!erroCarga}
                        className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-sm font-medium disabled:opacity-50">
                        {sugerindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Sugerir pela média
                    </button>
                    {pendenteSug && (
                        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2.5 text-sm space-y-2">
                            <p>Substituir as metas que você já digitou pelas sugestões?</p>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => aplicarSugestoes(pendenteSug)} className="px-4 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full text-sm font-semibold">Substituir</button>
                                <button type="button" onClick={() => aplicarSugestoes(pendenteSug.filter((s) => (form[s.indicador]?.alvo || '') === ''))} className="px-4 min-h-[44px] bg-white border border-primary text-primary rounded-full text-sm font-medium">Só os vazios</button>
                                <button type="button" onClick={() => setPendenteSug(null)} className="px-3 min-h-[44px] text-sm text-gray-600">Cancelar</button>
                            </div>
                        </div>
                    )}

                    {avisoSair && (
                        <div role="alert" className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2.5 text-sm space-y-2">
                            <p>Há alterações não salvas.</p>
                            <div className="flex gap-2">
                                <button type="button" onClick={onFechar} className="px-4 min-h-[44px] bg-red-600 hover:bg-red-700 text-white rounded-full text-sm font-semibold">Descartar</button>
                                <button type="button" onClick={() => setAvisoSair(false)} className="px-4 min-h-[44px] bg-white border border-primary text-primary rounded-full text-sm font-medium">Continuar editando</button>
                            </div>
                        </div>
                    )}

                    {carregando ? (
                        <div className="flex items-center justify-center gap-2 text-gray-500 text-sm py-10"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
                    ) : erroCarga ? (
                        <p className="text-sm text-gray-700 text-center py-8">{erroCarga}</p>
                    ) : visiveis.map((m) => {
                        const f = form[m.indicador] || { alvo: '', atencao: '', agir: '' };
                        const un = m.unidade === 'dias' ? 'dias' : '%';
                        const unTol = m.unidade === 'dias' ? 'dias' : 'pt';
                        const menor = m.sentido === 'MENOR_MELHOR';
                        const id = `meta-${m.indicador}`;
                        return (
                            <div key={m.indicador} className={`rounded-xl border p-3.5 ${erros[m.indicador] ? 'border-red-300' : 'border-gray-200'}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="text-sm font-bold text-gray-900 break-words">{m.rotulo}</div>
                                        <div className="text-xs text-gray-600">{menor ? 'Quanto menor, melhor' : 'Quanto maior, melhor'}{m.vigenciaInicio && m.atualizadoPorNome ? ` · definida por ${m.atualizadoPorNome}` : ''}</div>
                                    </div>
                                    {f.alvo !== '' && (
                                        <button type="button" onClick={() => set(m.indicador, 'alvo', '')} className="flex-none px-3 min-h-[44px] -my-1.5 rounded-full text-xs font-semibold text-red-700 hover:bg-red-50">Remover meta</button>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-2.5">
                                    <div>
                                        <label htmlFor={`${id}-alvo`} className="text-xs font-medium text-gray-700">Meta ({un})</label>
                                        <input id={`${id}-alvo`} inputMode="decimal" value={f.alvo} onChange={(e) => set(m.indicador, 'alvo', e.target.value)} placeholder="sem meta" className={campo} />
                                    </div>
                                    <div>
                                        <label htmlFor={`${id}-at`} className="text-xs font-medium text-gray-700">Atenção acima de ({unTol})</label>
                                        <input id={`${id}-at`} inputMode="decimal" value={f.atencao} disabled={f.alvo === ''} onChange={(e) => set(m.indicador, 'atencao', e.target.value)} className={campo} />
                                    </div>
                                    <div>
                                        <label htmlFor={`${id}-ag`} className="text-xs font-medium text-gray-700">Agir acima de ({unTol})</label>
                                        <input id={`${id}-ag`} inputMode="decimal" value={f.agir} disabled={f.alvo === ''} onChange={(e) => set(m.indicador, 'agir', e.target.value)} className={campo} />
                                    </div>
                                </div>
                                {f.alvo === '' && orig[m.indicador]?.alvo === '' && !obs[m.indicador] && <p className="text-[11px] text-gray-500 mt-1.5">Sem meta: o semáforo compara com a média dos últimos 3 meses.</p>}
                                {obs[m.indicador] && <p className="text-xs text-gray-600 mt-1.5">Sem base para sugerir: {obs[m.indicador]}</p>}
                                {erros[m.indicador] && <p role="alert" className="text-xs font-semibold text-red-700 mt-1.5">{erros[m.indicador]}</p>}
                            </div>
                        );
                    })}
                </div>

                <div className="flex gap-3 px-4 md:px-5 py-3.5 border-t border-gray-100 flex-none bg-white">
                    <button type="button" onClick={tentarFechar} className="flex-1 px-4 py-3 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-sm font-medium">Cancelar</button>
                    <button type="button" onClick={salvar} disabled={salvando || carregando || !!erroCarga} className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-3 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full text-sm font-semibold disabled:opacity-50">
                        {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar{nMudou > 0 ? ` (${nMudou})` : ''}
                    </button>
                </div>
            </div>
        </div>
    );
}
