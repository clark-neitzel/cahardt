import React, { useEffect, useRef, useState } from 'react';
import { useTooltip } from './useTooltip';
import { fmtNum, fmtPctSinal, temValor } from './formatos';

// Paleta de séries (a do mock aprovado + 2 extras). Um eixo só: índice base 100 na 1ª semana.
const CORES = ['#00754A', '#cba258', '#2a78d6', '#e34948', '#7c3aed', '#0e7490'];

// null/undefined = semana sem preço conhecido (antes da 1ª compra): NUNCA vira 0
const ok = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

function useLargura(ref) {
    const [w, setW] = useState(600);
    useEffect(() => {
        if (!ref.current) return undefined;
        setW(ref.current.clientWidth || 600);
        if (typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width) || 600));
        ro.observe(ref.current);
        return () => ro.disconnect();
    }, [ref]);
    return w;
}

export default function CurvaInsumos({ d }) {
    const ref = useRef(null);
    const W = Math.max(260, useLargura(ref));
    const { alvo, Tip, esconder } = useTooltip();
    const [cursor, setCursor] = useState(null);
    const sem = Array.isArray(d?.semanas) ? d.semanas : [];
    const series = (Array.isArray(d?.insumos) ? d.insumos : [])
        .filter((s) => Array.isArray(s.indice) && s.indice.filter(ok).length >= 2)
        .slice(0, 6).map((s, i) => ({ ...s, cor: CORES[i % CORES.length] }));
    if (!series.length || sem.length < 2) return <div ref={ref} />;

    const estreito = W < 520;
    const H = estreito ? 220 : 250, pL = 34, pR = estreito ? 12 : 120, pT = 14, pB = 28;
    const todos = series.flatMap((s) => s.indice.filter(ok).map(Number));
    const yMin = Math.floor((Math.min(...todos, 100) - 2) / 5) * 5;
    const yMax = Math.ceil((Math.max(...todos, 100) + 2) / 5) * 5;
    const n = sem.length;
    const X = (i) => pL + (i / (n - 1)) * (W - pL - pR);
    const Y = (v) => pT + (1 - (v - yMin) / ((yMax - yMin) || 1)) * (H - pT - pB);
    const grades = [];
    for (let g = yMin; g <= yMax; g += 5) grades.push(g);
    const passoGrade = grades.length > 7 ? 10 : 5;

    // último ponto conhecido de cada série (para o rótulo final)
    const ultimo = (s) => { for (let i = s.indice.length - 1; i >= 0; i--) if (ok(s.indice[i])) return i; return -1; };
    // rótulos finais sem colisão (só desktop; no celular a legenda já mostra a variação)
    const fins = series.map((s) => {
        const u = ultimo(s);
        return { s, x: X(u), y: Y(Number(s.indice[u])), ly: Y(Number(s.indice[u])) };
    }).sort((a, b) => a.y - b.y);
    for (let k = 1; k < fins.length; k++) if (fins[k].ly - fins[k - 1].ly < 14) fins[k].ly = fins[k - 1].ly + 14;

    // quebra o traço nas lacunas: um segmento "M..L.." para cada trecho contínuo
    const trechos = (s) => {
        const out = []; let atual = [];
        s.indice.forEach((v, i) => { if (ok(v)) atual.push([X(i), Y(Number(v))]); else if (atual.length) { out.push(atual); atual = []; } });
        if (atual.length) out.push(atual);
        return out;
    };

    const mover = (e) => {
        const r = e.currentTarget.ownerSVGElement.getBoundingClientRect();
        const xs = ((e.clientX - r.left) / r.width) * W;
        const i = Math.max(0, Math.min(n - 1, Math.round(((xs - pL) / ((W - pL - pR) || 1)) * (n - 1))));
        setCursor(i);
        return i;
    };
    const conteudo = (i) => (
        <>
            <b className="text-[#cba258]">Semana de {sem[i]?.rotulo || ''}</b>
            {series.map((s) => (
                <div key={s.itemPcpId}>
                    {s.nome}: {temValor(s.valores?.[i]) ? `R$ ${fmtNum(s.valores[i])}${s.unidade ? `/${s.unidade}` : ''}` : 'sem preço ainda'}
                    {s.estimados?.[i] ? ' (estimado)' : ''} {ok(s.indice[i]) && <span className="opacity-70">({fmtNum(s.indice[i], 1)})</span>}
                </div>
            ))}
        </>
    );

    return (
        <div ref={ref}>
            <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full overflow-visible" role="img" aria-label="Evolução do custo dos insumos nas últimas semanas, índice base 100">
                {grades.filter((g) => g % passoGrade === 0).map((g) => (
                    <g key={g}>
                        <line x1={pL} x2={W - pR} y1={Y(g)} y2={Y(g)} stroke={g === 100 ? '#b8b2a6' : '#eceae4'} />
                        <text x={pL - 6} y={Y(g) + 4} textAnchor="end" fontSize="11" fill="#5f6b66">{g}</text>
                    </g>
                ))}
                {sem.map((s, i) => (estreito && i % 2 === 1 && i !== n - 1) ? null : (
                    <text key={i} x={X(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#5f6b66">{s.rotulo}</text>
                ))}
                {series.map((s) => {
                    const u = ultimo(s);
                    return (
                        <g key={s.itemPcpId}>
                            {trechos(s).map((t, k) => (t.length > 1
                                ? <path key={k} d={`M${t.map((p) => p.join(' ')).join(' L')}`} fill="none" stroke={s.cor} strokeWidth="2.25" strokeLinejoin="round" />
                                : <circle key={k} cx={t[0][0]} cy={t[0][1]} r="2.5" fill={s.cor} />))}
                            <circle cx={X(u)} cy={Y(Number(s.indice[u]))} r="4" fill={s.cor} stroke="#fff" strokeWidth="2" />
                        </g>
                    );
                })}
                {!estreito && fins.map((f) => (
                    <text key={f.s.itemPcpId} x={f.x + 9} y={f.ly + 4} fontSize="11" fontWeight="800" fill="#1E3932">
                        {String(f.s.nome).split(' ')[0]} {fmtPctSinal(f.s.variacaoPct)}
                    </text>
                ))}
                {cursor != null && (
                    <g pointerEvents="none">
                        <line x1={X(cursor)} x2={X(cursor)} y1={pT} y2={H - pB} stroke="#1E3932" strokeDasharray="3 3" />
                        {series.map((s) => (ok(s.indice[cursor]) ? <circle key={s.itemPcpId} cx={X(cursor)} cy={Y(Number(s.indice[cursor]))} r="4" fill={s.cor} stroke="#fff" strokeWidth="2" /> : null))}
                    </g>
                )}
                <rect x={pL} y={pT} width={W - pL - pR} height={H - pT - pB} fill="transparent" style={{ touchAction: 'pan-y' }}
                    {...alvo(null)}
                    onPointerEnter={(e) => { const i = mover(e); alvo(conteudo(i)).onPointerEnter(e); }}
                    onPointerMove={(e) => { const i = mover(e); alvo(conteudo(i)).onPointerMove(e); }}
                    onPointerDown={(e) => { const i = mover(e); alvo(conteudo(i)).onPointerDown(e); }}
                    onPointerLeave={(e) => { if (e.pointerType !== 'touch') { setCursor(null); esconder(); } }} />
            </svg>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 text-xs font-bold text-gray-800">
                {series.map((s) => (
                    <li key={s.itemPcpId} className="inline-flex items-center gap-1.5">
                        <i className="w-3.5 h-[3px] rounded inline-block" style={{ background: s.cor }} />
                        {s.nome}
                        <span className={s.variacaoPct > 0 ? 'text-red-700' : 'text-gray-600'}>{fmtPctSinal(s.variacaoPct)}</span>
                    </li>
                ))}
            </ul>
            {Tip}
        </div>
    );
}
