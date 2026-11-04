import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';
import { chaveBusca } from '../utils/cidade';

// Combobox de busca REUTILIZÁVEL — substitui os <select> nativos grandes do projeto.
// Digite para filtrar (por label + sub); navegação por teclado; rolagem SEM limite de itens.
// options: [{ value, label, sub? }]. extraAction?: { label, onClick } (rodapé, ex.: "criar novo").
const ComboBusca = ({
    value, options, onChange, placeholder = 'Buscar…', buscaPlaceholder = 'Digite para buscar…',
    vazioTexto = 'Nada encontrado.', extraAction, invalido = false, allowClear = true, className = '',
    permitirNovo = false, novoTexto = 'Usar'
}) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [hi, setHi] = useState(0);
    const boxRef = useRef(null);
    const inputRef = useRef(null);
    const menuRef = useRef(null);
    const [coords, setCoords] = useState(null);

    // Menu em PORTAL (position:fixed): não é cortado por card/modal com overflow-hidden.
    const posicionar = useCallback(() => {
        const el = boxRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const abaixo = window.innerHeight - r.bottom - 8;
        const acima = r.top - 8;
        const abrirCima = abaixo < 320 && acima > abaixo;
        const maxH = Math.max(200, Math.min(430, abrirCima ? acima : abaixo));
        setCoords({ left: r.left, width: r.width, top: r.bottom + 4, bottom: window.innerHeight - r.top + 4, abrirCima, maxH });
    }, []);

    const selecionado = options.find(o => String(o.value) === String(value));

    const filtrados = useMemo(() => {
        // Busca sem acento e sem caixa: "itapoa" acha "Itapoá", "sao" acha "São".
        const q = chaveBusca(query);
        if (!q) return options;
        const termos = q.split(' ');
        return options.filter(o => {
            const alvo = chaveBusca(`${o.label || ''} ${o.sub || ''}`);
            return termos.every(t => alvo.includes(t));
        });
    }, [options, query]);

    // `permitirNovo`: o que foi digitado pode virar o valor mesmo sem estar na lista
    // (ex.: cidade nova no cadastro). Só aparece quando NENHUMA opção casa exatamente
    // com o texto (comparação sem acento/caixa) — se casar, o usuário escolhe a da lista
    // e a grafia gravada é a que já existe.
    const textoNovo = permitirNovo ? query.trim() : '';
    const podeCriar = !!textoNovo && !options.some(o => chaveBusca(o.label) === chaveBusca(textoNovo));

    useEffect(() => { setHi(0); }, [query, open]);
    useEffect(() => {
        if (!open) return;
        posicionar();
        const onDoc = (e) => {
            if (boxRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
            setOpen(false); setQuery('');
        };
        const onScroll = (e) => { if (menuRef.current?.contains(e.target)) return; posicionar(); };
        document.addEventListener('mousedown', onDoc);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', posicionar);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', posicionar);
        };
    }, [open, posicionar]);
    useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

    const escolher = (o) => { onChange(o.value); setOpen(false); setQuery(''); };
    const usarNovo = () => { if (!podeCriar) return; onChange(textoNovo); setOpen(false); setQuery(''); };
    const onKey = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, filtrados.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            if (filtrados[hi]) escolher(filtrados[hi]);
            else if (podeCriar) usarNovo();
            else if (extraAction && query.trim()) { const q = query.trim(); setOpen(false); setQuery(''); extraAction.onClick(q); }
        }
        else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setQuery(''); }
    };

    return (
        <div className={`relative ${className}`} ref={boxRef}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={`w-full min-h-[44px] md:min-h-0 flex items-center justify-between gap-2 border rounded px-3 py-2 text-sm bg-white text-left focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none ${invalido ? 'border-amber-300' : 'border-gray-300'}`}
            >
                <span className={`truncate ${selecionado || (permitirNovo && value) ? 'text-gray-900' : 'text-gray-400'}`}>
                    {selecionado ? selecionado.label : (permitirNovo && value ? String(value) : placeholder)}
                </span>
                <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
            </button>
            {open && coords && createPortal(
                <div
                    ref={menuRef}
                    style={{ position: 'fixed', left: coords.left, width: coords.width, ...(coords.abrirCima ? { bottom: coords.bottom } : { top: coords.top }) }}
                    className="z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg">
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
                    <div className="overflow-y-auto py-1" style={{ maxHeight: Math.max(120, coords.maxH - 150) }}>
                        {allowClear && selecionado && (
                            <button type="button" onClick={() => { onChange(''); setOpen(false); setQuery(''); }}
                                className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:bg-gray-50">Limpar seleção</button>
                        )}
                        {podeCriar && (
                            <button type="button" onClick={usarNovo}
                                className="w-full text-left px-3 py-2 min-h-[44px] md:min-h-0 text-sm text-primary font-medium hover:bg-gray-50">
                                {novoTexto} “{textoNovo}”
                            </button>
                        )}
                        {filtrados.length === 0 && !podeCriar && <div className="px-3 py-3 text-sm text-gray-500">{vazioTexto}</div>}
                        {filtrados.map((o, i) => (
                            <React.Fragment key={String(o.value)}>
                            {/* Cabeçalho de grupo — só aparece quando as options trazem `grupo`
                                (opcional: quem não usa continua igual). */}
                            {o.grupo && o.grupo !== filtrados[i - 1]?.grupo && (
                                <div className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-500">{o.grupo}</div>
                            )}
                            <button
                                type="button"
                                onMouseEnter={() => setHi(i)}
                                onClick={() => escolher(o)}
                                className={`w-full text-left px-3 py-2 text-sm flex flex-col gap-0.5 ${i === hi ? 'bg-blue-50' : 'hover:bg-gray-50'} ${String(o.value) === String(value) ? 'font-semibold text-primary' : 'text-gray-800'}`}
                            >
                                <span className="break-words">{o.label}</span>
                                {o.sub && <span className="text-xs text-gray-500">{o.sub}</span>}
                            </button>
                            </React.Fragment>
                        ))}
                    </div>
                    <div className="px-3 py-1.5 border-t border-gray-100 text-[11px] text-gray-400">
                        {filtrados.length} {filtrados.length === 1 ? 'item' : 'itens'}
                    </div>
                    {extraAction && (
                        <div className="p-2 border-t border-gray-100">
                            {/* Recebe o texto digitado na busca (ex.: "Cadastrar nova cidade…" já com o nome). */}
                            <button type="button" onClick={() => { const q = query.trim(); setOpen(false); setQuery(''); extraAction.onClick(q); }}
                                className="w-full text-left px-2 py-2 text-sm text-primary font-medium hover:bg-blue-50 rounded">{extraAction.label}</button>
                        </div>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
};

export default ComboBusca;
