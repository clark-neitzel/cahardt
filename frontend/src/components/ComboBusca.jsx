import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

// Combobox de busca REUTILIZÁVEL — substitui os <select> nativos grandes do projeto.
// Digite para filtrar (por label + sub); navegação por teclado; rolagem SEM limite de itens.
// options: [{ value, label, sub? }]. extraAction?: { label, onClick } (rodapé, ex.: "criar novo").
const ComboBusca = ({
    value, options, onChange, placeholder = 'Buscar…', buscaPlaceholder = 'Digite para buscar…',
    vazioTexto = 'Nada encontrado.', extraAction, invalido = false, allowClear = true, className = ''
}) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [hi, setHi] = useState(0);
    const boxRef = useRef(null);
    const inputRef = useRef(null);

    const selecionado = options.find(o => String(o.value) === String(value));

    const filtrados = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options;
        const termos = q.split(/\s+/);
        return options.filter(o => {
            const alvo = `${o.label || ''} ${o.sub || ''}`.toLowerCase();
            return termos.every(t => alvo.includes(t));
        });
    }, [options, query]);

    useEffect(() => { setHi(0); }, [query, open]);
    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);
    useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

    const escolher = (o) => { onChange(o.value); setOpen(false); setQuery(''); };
    const onKey = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, filtrados.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); if (filtrados[hi]) escolher(filtrados[hi]); }
        else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    };

    return (
        <div className={`relative ${className}`} ref={boxRef}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={`w-full min-h-[44px] md:min-h-0 flex items-center justify-between gap-2 border rounded px-3 py-2 text-sm bg-white text-left focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none ${invalido ? 'border-amber-300' : 'border-gray-300'}`}
            >
                <span className={`truncate ${selecionado ? 'text-gray-900' : 'text-gray-400'}`}>{selecionado ? selecionado.label : placeholder}</span>
                <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
            </button>
            {open && (
                <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                    <div className="p-2 border-b border-gray-100">
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                            <input
                                ref={inputRef}
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onKeyDown={onKey}
                                placeholder={buscaPlaceholder}
                                className="w-full border border-gray-300 rounded pl-8 pr-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                        </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto py-1">
                        {allowClear && selecionado && (
                            <button type="button" onClick={() => { onChange(''); setOpen(false); setQuery(''); }}
                                className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:bg-gray-50">Limpar seleção</button>
                        )}
                        {filtrados.length === 0 && <div className="px-3 py-3 text-sm text-gray-400">{vazioTexto}</div>}
                        {filtrados.map((o, i) => (
                            <button
                                key={String(o.value)}
                                type="button"
                                onMouseEnter={() => setHi(i)}
                                onClick={() => escolher(o)}
                                className={`w-full text-left px-3 py-2 text-sm flex flex-col gap-0.5 ${i === hi ? 'bg-blue-50' : 'hover:bg-gray-50'} ${String(o.value) === String(value) ? 'font-semibold text-primary' : 'text-gray-800'}`}
                            >
                                <span className="break-words">{o.label}</span>
                                {o.sub && <span className="text-xs text-gray-400">{o.sub}</span>}
                            </button>
                        ))}
                    </div>
                    <div className="px-3 py-1.5 border-t border-gray-100 text-[11px] text-gray-400">
                        {filtrados.length} {filtrados.length === 1 ? 'item' : 'itens'}
                    </div>
                    {extraAction && (
                        <div className="p-2 border-t border-gray-100">
                            <button type="button" onClick={() => { extraAction.onClick(); setOpen(false); setQuery(''); }}
                                className="w-full text-left px-2 py-2 text-sm text-primary font-medium hover:bg-blue-50 rounded">{extraAction.label}</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ComboBusca;
