import { Star } from 'lucide-react';
import { emojiDoItem, validadeSugerida } from './util';

// Bloco grande de item (alvo de toque >= 96 px)
export default function BlocoItem({ item, favorito, onClick }) {
    const ref = validadeSugerida(item, 'REFRIGERADO');
    const cong = validadeSugerida(item, 'CONGELADO');
    const linha = ref || cong
        ? [ref ? `${ref} d refrigerado` : null, cong ? `${cong} d congelado` : null].filter(Boolean).join(' · ')
        : 'defina a validade';
    return (
        <button
            type="button"
            onClick={() => onClick(item)}
            className="relative text-left bg-white rounded-2xl border border-gray-200 shadow-sm p-3 min-h-[96px] flex flex-col gap-1 hover:border-primary active:scale-[0.97] transition-transform"
        >
            {favorito && <Star className="absolute top-2 right-2 h-3.5 w-3.5 text-[#cba258] fill-[#cba258]" aria-label="Favorito" />}
            <span className="text-2xl leading-none" aria-hidden="true">{emojiDoItem(item)}</span>
            <span className="font-extrabold text-sm leading-tight text-gray-900 break-words">{item.nome}</span>
            <span className={`text-xs ${ref || cong ? 'text-gray-600' : 'text-amber-700 font-semibold'}`}>{linha}</span>
        </button>
    );
}
