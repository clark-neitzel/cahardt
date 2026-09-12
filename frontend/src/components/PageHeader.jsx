import React from 'react';

// Cabeçalho ÚNICO de tela (Linguagem visual v2, CLAUDE.md, aprovado 12/09/2026).
// Toda tela de nível 1 usa este componente: cápsula de cor do módulo + ícone + <h1>
// + subtítulo opcional + slot de ações à direita (1 botão primário + o resto em
// menu "⋯"/secundário — a tela decide o que passar em `acoes`, o componente não
// impõe quantidade).
//
// Cor por módulo (padrão já em uso nas telas corretas — Embarques, Financeiro):
// Pedidos azul, Clientes verde, Produtos roxo, Financeiro âmbar, Expedição sky,
// Dashboard vermelho, Rota laranja, PCP teal. No tema Starbucks o chip AZUL vira
// `bg-mint` (fundo azul + ícone verde brigava — o ícone `text-blue-600` já é
// remapeado para verde pela camada global do `index.css`).
const CHIP_BG = {
    blue: 'bg-mint',
    green: 'bg-green-100',
    purple: 'bg-purple-100',
    amber: 'bg-amber-100',
    sky: 'bg-sky-100',
    red: 'bg-red-100',
    orange: 'bg-orange-100',
    teal: 'bg-teal-100',
};

const ICON_COLOR = {
    blue: 'text-blue-600', // remapeado para verde pela camada do tema em index.css
    green: 'text-green-600',
    purple: 'text-purple-600',
    amber: 'text-amber-600',
    sky: 'text-sky-600',
    red: 'text-red-600',
    orange: 'text-orange-600',
    teal: 'text-teal-600',
};

/**
 * @param {object} props
 * @param {React.ComponentType} props.icon - ícone lucide do módulo
 * @param {'blue'|'green'|'purple'|'amber'|'sky'|'red'|'orange'|'teal'} [props.cor='blue'] - cor do módulo
 * @param {string} props.titulo
 * @param {string} [props.subtitulo]
 * @param {React.ReactNode} [props.acoes] - slot de ações à direita (botão primário + menu/secundário)
 * @param {React.ReactNode} [props.children] - alternativa a `acoes` (mesmo slot)
 * @param {string} [props.className]
 */
export default function PageHeader({ icon: Icon, cor = 'blue', titulo, subtitulo, acoes, children, className = '' }) {
    const bgChip = CHIP_BG[cor] || CHIP_BG.blue;
    const corIcone = ICON_COLOR[cor] || ICON_COLOR.blue;
    const conteudoAcoes = acoes || children;

    return (
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 md:p-6 ${className}`}>
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
                {Icon && (
                    <div className={`${bgChip} p-1.5 md:p-2 rounded-lg flex-shrink-0`}>
                        <Icon className={`h-4 w-4 md:h-5 md:w-5 ${corIcone}`} />
                    </div>
                )}
                <div className="min-w-0">
                    <h1 className="text-base md:text-2xl font-bold text-gray-900 truncate">{titulo}</h1>
                    {subtitulo && <p className="text-xs md:text-sm text-gray-500 truncate">{subtitulo}</p>}
                </div>
            </div>
            {conteudoAcoes && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {conteudoAcoes}
                </div>
            )}
        </div>
    );
}
