import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from 'lucide-react';
import SelectBusca from '../../components/SelectBusca';

// ─────────────────────────────────────────────────────────────────────────────
// "Montar cada página" do PDF do Como Fazer (mockup aba 6).
// Componente CONTROLADO: quem guarda o arranjo e fala com o servidor é o ModalPdf.
//   passos   : [{ id, numero, texto, fotos? }] na ordem do manual
//   arranjo  : { paginas:[{ uid, titulo, passoIds[] }], compacto }
//   resumo   : paginasResumo da prévia (a ÚNICA fonte de verdade do "cabe / não cabe")
//   aoMudar  : (novoArranjo) => void   (mudança manual do dono)
// Mover por TOQUE ("Mover para…") é o caminho principal (celular/iPad); arrastar só no computador.
// ─────────────────────────────────────────────────────────────────────────────

export const novoUid = () => `pg_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

const COR = {
    OK: { barra: 'bg-green-500', texto: 'text-green-800', caixa: 'border-gray-200' },
    CHEIA: { barra: 'bg-amber-500', texto: 'text-amber-800', caixa: 'border-amber-300' },
    ESTOURADA: { barra: 'bg-red-600', texto: 'text-red-700', caixa: 'border-red-400' },
    VAZIA: { barra: 'bg-gray-300', texto: 'text-red-700', caixa: 'border-red-300' },
};

export const BTN_CHIP = 'min-h-[44px] px-4 rounded-full text-sm font-semibold border disabled:opacity-50 disabled:cursor-not-allowed';

/** Atalhos que pedem um arranjo pronto ao servidor. */
export function AtalhosPaginas({ ativo, onEscolher, umProcessoIndisponivel, ocupado }) {
    const chip = (id, rotulo, extra = {}) => (
        <button key={id} type="button" disabled={ocupado || extra.desligado} onClick={() => onEscolher(extra.corpo)}
            className={`${BTN_CHIP} ${ativo === id ? 'bg-primary border-primary text-white' : 'bg-white border-gray-300 text-gray-800 hover:border-primary'}`}>{rotulo}</button>
    );
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                {chip('automatico', 'Automático', { corpo: { id: 'automatico', modo: 'automatico' } })}
                <span className="text-xs font-bold uppercase tracking-widest text-gray-600 px-1">Passos por página</span>
                {[3, 4, 5, 6].map((k) => chip(`k${k}`, String(k), { corpo: { id: `k${k}`, modo: 'passosPorPagina', passosPorPagina: k } }))}
                {chip('processo', 'Um processo por página', { desligado: !!umProcessoIndisponivel, corpo: { id: 'processo', modo: 'umProcessoPorPagina' } })}
            </div>
            {umProcessoIndisponivel && <p className="text-xs text-gray-600">{umProcessoIndisponivel}</p>}
        </div>
    );
}

export default function MontarPaginas({ passos, arranjo, resumo, limite, formato, aoMudar, ocupado }) {
    const [aberto, setAberto] = useState({}); // uid -> bool (só vale no celular)
    const arrastando = useRef('');
    const [sobre, setSobre] = useState('');
    const mouse = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;

    const porId = useMemo(() => new Map(passos.map((p) => [p.id, p])), [passos]);
    const ordem = useMemo(() => new Map(passos.map((p, i) => [p.id, i])), [passos]);
    const colocados = useMemo(() => new Set(arranjo.paginas.flatMap((p) => p.passoIds)), [arranjo]);
    const fora = useMemo(() => passos.filter((p) => !colocados.has(p.id)), [passos, colocados]);
    const maximo = formato === 'FICHARIO' ? 6 : 8;

    // tira o passo de onde estiver e coloca em `destino` (uid | 'fora'); `antesDe` = id do passo vizinho
    const mover = (passoId, destino, antesDe) => {
        const paginas = arranjo.paginas.map((p) => ({ ...p, passoIds: p.passoIds.filter((x) => x !== passoId) }));
        if (destino !== 'fora') {
            const alvo = paginas.find((p) => p.uid === destino);
            if (!alvo) return;
            const ids = alvo.passoIds;
            let pos = antesDe ? ids.indexOf(antesDe) : -1;
            if (pos < 0) {
                // sem vizinho: respeita a ordem do manual (passo 5 fica depois do 4)
                pos = ids.findIndex((x) => (ordem.get(x) ?? 0) > (ordem.get(passoId) ?? 0));
                if (pos < 0) pos = ids.length;
            }
            ids.splice(pos, 0, passoId);
        }
        aoMudar({ ...arranjo, paginas });
    };
    const renomear = (uid, titulo) => aoMudar({ ...arranjo, paginas: arranjo.paginas.map((p) => (p.uid === uid ? { ...p, titulo: titulo.slice(0, 40) } : p)) });
    const novaPagina = () => {
        if (arranjo.paginas.length >= maximo) return;
        aoMudar({ ...arranjo, paginas: [...arranjo.paginas, { uid: novoUid(), titulo: '', passoIds: [] }] });
    };
    const removerPagina = (uid) => aoMudar({ ...arranjo, paginas: arranjo.paginas.filter((p) => p.uid !== uid) });

    const opcoesDestino = (uidAtual) => [
        ...arranjo.paginas.map((p, i) => ({ v: p.uid, r: `Página ${i + 1}${p.titulo ? ` · ${p.titulo}` : ''}` })).filter((o) => o.v !== uidAtual),
        ...(uidAtual === 'fora' ? [] : [{ v: 'fora', r: 'Fora das páginas' }]),
    ];

    const renderPasso = (p, uidAtual) => (
        <li key={p.id} draggable={mouse} onDragStart={(e) => { arrastando.current = p.id; try { e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'move'; } catch { /* ok */ } }}
            onDragEnd={() => { arrastando.current = ''; setSobre(''); }}
            onDragOver={(e) => { if (arrastando.current && uidAtual !== 'fora') { e.preventDefault(); e.stopPropagation(); } }}
            onDrop={(e) => { if (!arrastando.current || uidAtual === 'fora') return; e.preventDefault(); e.stopPropagation(); mover(arrastando.current, uidAtual, p.id); arrastando.current = ''; setSobre(''); }}
            className="flex items-start gap-2 rounded-lg border border-gray-200 bg-white p-2">
            {mouse && <GripVertical className="h-4 w-4 mt-1 text-gray-500 shrink-0 cursor-grab" aria-hidden="true" />}
            <span className="shrink-0 h-6 min-w-[1.5rem] px-1 rounded-full bg-mint text-primaryDark text-xs font-bold flex items-center justify-center">{p.numero}</span>
            <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 break-words line-clamp-2">{p.texto || 'Passo sem texto'}</p>
                {p.peso > 1 && <span className="text-xs text-amber-800 font-semibold">conta como {p.peso} passos</span>}
            </div>
            <div className="shrink-0 w-[8.5rem]">
                <SelectBusca value="" onChange={(e) => { if (e.target.value) mover(p.id, e.target.value); }} className="w-full h-11" disabled={ocupado}>
                    <option value="">{uidAtual === 'fora' ? 'Colocar em…' : 'Mover para…'}</option>
                    {opcoesDestino(uidAtual).map((o) => <option key={o.v} value={o.v}>{o.r}</option>)}
                </SelectBusca>
            </div>
        </li>
    );

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {arranjo.paginas.map((pg, idx) => {
                    const r = resumo?.find((x) => x.indice === idx + 1);
                    const situ = r?.situacao || (pg.passoIds.length ? 'OK' : 'VAZIA');
                    const cor = COR[situ] || COR.OK;
                    const peso = r?.peso ?? pg.passoIds.length;
                    const lim = r?.limite ?? limite ?? 6;
                    const pct = Math.min(100, Math.round((peso / Math.max(1, lim)) * 100));
                    const abertoMobile = aberto[pg.uid] ?? (idx === 0 || situ === 'ESTOURADA');
                    return (
                        <section key={pg.uid}
                            onDragOver={(e) => { if (arrastando.current) { e.preventDefault(); setSobre(pg.uid); } }}
                            onDragLeave={() => setSobre((s) => (s === pg.uid ? '' : s))}
                            onDrop={(e) => { if (!arrastando.current) return; e.preventDefault(); mover(arrastando.current, pg.uid); arrastando.current = ''; setSobre(''); }}
                            className={`bg-white rounded-xl border-2 shadow-sm ${cor.caixa} ${sobre === pg.uid ? 'ring-2 ring-primary' : ''}`}>
                            <div className="p-3 space-y-2">
                                <div className="flex items-center gap-2">
                                    <button type="button" onClick={() => setAberto((a) => ({ ...a, [pg.uid]: !abertoMobile }))} aria-expanded={abertoMobile}
                                        aria-label={abertoMobile ? 'Recolher página' : 'Abrir página'}
                                        className="md:hidden min-h-[44px] min-w-[44px] rounded-full bg-gray-100 text-gray-700 flex items-center justify-center shrink-0">
                                        {abertoMobile ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                                    </button>
                                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600 shrink-0">Pág. {idx + 1}</span>
                                    <input value={pg.titulo} maxLength={40} onChange={(e) => renomear(pg.uid, e.target.value)} placeholder={`Nome da página ${idx + 1}`} aria-label={`Nome da página ${idx + 1}`}
                                        className="flex-1 min-w-0 h-11 border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                                </div>
                                <div>
                                    <div className="h-2 rounded-full bg-gray-200 overflow-hidden"><div className={`h-full ${cor.barra}`} style={{ width: `${situ === 'VAZIA' ? 0 : pct}%` }} /></div>
                                    <p className={`text-xs font-semibold mt-1 ${cor.texto}`}>{r?.mensagem || (pg.passoIds.length ? `${pg.passoIds.length} passos` : 'Página vazia')}</p>
                                </div>
                            </div>
                            <div className={`${abertoMobile ? 'block' : 'hidden'} md:block px-3 pb-3 space-y-2`}>
                                {pg.passoIds.length === 0 ? (
                                    <p className="rounded-lg border border-dashed border-gray-300 p-3 text-sm text-gray-600 text-center">Página vazia: coloque passos aqui ou remova a página.</p>
                                ) : (
                                    <ul className="space-y-2">{pg.passoIds.map((id) => (porId.get(id) ? renderPasso(porId.get(id), pg.uid) : null))}</ul>
                                )}
                                <button type="button" onClick={() => removerPagina(pg.uid)} className="min-h-[44px] px-3 inline-flex items-center gap-2 rounded-full bg-white border border-gray-300 text-gray-700 text-sm font-semibold">
                                    <Trash2 className="h-4 w-4" /> Remover página
                                </button>
                            </div>
                        </section>
                    );
                })}
            </div>

            <button type="button" onClick={novaPagina} disabled={arranjo.paginas.length >= maximo} className="min-h-[44px] px-4 inline-flex items-center gap-2 rounded-full bg-white border border-primary text-primary text-sm font-semibold disabled:opacity-50">
                <Plus className="h-4 w-4" /> Página
            </button>
            {arranjo.paginas.length >= maximo && <span className="text-xs text-gray-600 ml-2">Máximo de {maximo} páginas.</span>}

            <section onDragOver={(e) => { if (arrastando.current) { e.preventDefault(); setSobre('fora'); } }} onDragLeave={() => setSobre((s) => (s === 'fora' ? '' : s))}
                onDrop={(e) => { if (!arrastando.current) return; e.preventDefault(); mover(arrastando.current, 'fora'); arrastando.current = ''; setSobre(''); }}
                className={`rounded-xl border-2 p-3 space-y-2 ${fora.length ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-dashed border-gray-300'} ${sobre === 'fora' ? 'ring-2 ring-primary' : ''}`}>
                <p className="text-sm font-bold text-gray-900">Fora das páginas ({fora.length})</p>
                {fora.length === 0
                    ? <p className="text-xs text-gray-600">Passos que você tirar de uma página ficam aqui até serem colocados em outra, para nada se perder.</p>
                    : <>
                        <p className="text-xs font-semibold text-amber-800">Passo esquecido: estes passos NÃO vão para o PDF até você colocá-los numa página.</p>
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">{fora.map((p) => renderPasso(p, 'fora'))}</ul>
                    </>}
            </section>
        </div>
    );
}
