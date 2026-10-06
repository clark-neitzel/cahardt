import React from 'react';

// Mini-curva de tendência (SVG puro). Menos de 2 pontos = não desenha nada.
export default function Sparkline({ valores, cor = '#00754A', className = '' }) {
    const v = Array.isArray(valores) ? valores.filter((x) => x !== null && x !== undefined && x !== '').map(Number).filter(Number.isFinite) : [];
    if (v.length < 2) return <div className={`h-[34px] ${className}`} />;
    const W = 200, H = 34, mn = Math.min(...v), mx = Math.max(...v);
    const pts = v.map((y, i) => [(i / (v.length - 1)) * (W - 6) + 3, H - 4 - ((y - mn) / ((mx - mn) || 1)) * (H - 8)]);
    const ult = pts[pts.length - 1];
    return (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`block w-full h-[34px] ${className}`} aria-hidden="true">
            <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={cor} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <circle cx={ult[0]} cy={ult[1]} r="3" fill={cor} />
        </svg>
    );
}
