import React, { Children, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Check } from 'lucide-react';

// Drop-in para o <select> nativo (menu escuro do sistema, sem busca).
// Uso idêntico ao <select>: value, onChange({target:{value}}), <option>/<optgroup> como filhos.
//   <SelectBusca value={x} onChange={e => setX(e.target.value)} className="...">
//     <option value="todos">Todos</option>
//     {lista.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
//   </SelectBusca>
// Menu no tema (branco) com busca no topo quando há muitas opções. O menu é renderizado
// num portal (position:fixed) para NUNCA ser cortado por modais/containers com overflow,
// e abre para cima quando não há espaço abaixo.

// Extrai texto legível de qualquer children de <option> (string, número, array de nós).
function textoDoNo(node) {
    if (node == null || node === false) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(textoDoNo).join('');
    if (node.props && node.props.children != null) return textoDoNo(node.props.children);
    return '';
}

function coletarOpcoes(children) {
    const out = [];
    Children.forEach(children, (child) => {
        if (!child || typeof child !== 'object') return;
        if (child.type === 'optgroup') {
            out.push({ grupo: child.props.label });
            Children.forEach(child.props.children, (o) => {
                if (o && o.type === 'option') {
                    const label = textoDoNo(o.props.children);
                    // Igual ao <select> nativo: sem value, o texto da <option> vira o value.
                    out.push({ value: o.props.value != null ? o.props.value : label, label, disabled: !!o.props.disabled });
                }
            });
        } else if (child.type === 'option') {
            const label = textoDoNo(child.props.children);
            // Igual ao <select> nativo: sem value, o texto da <option> vira o value.
            out.push({ value: child.props.value != null ? child.props.value : label, label, disabled: !!child.props.disabled });
        }
    });
    return out;
}

// Limiar para exibir o campo de busca (menus curtos não precisam).
const LIMIAR_BUSCA = 6;
const ALTURA_MENU = 288; // estimativa p/ decidir abrir p/ cima

const SelectBusca = ({ value, onChange, children, className = '', disabled = false, placeholder = 'Selecionar…', buscaPlaceholder = 'Buscar…' }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [hi, setHi] = useState(0);
    const [coords, setCoords] = useState(null);
    const btnRef = useRef(null);
    const menuRef = useRef(null);
    const inputRef = useRef(null);

    const opcoes = useMemo(() => coletarOpcoes(children), [children]);
    const selecionavel = opcoes.filter(o => !o.grupo);
    const selecionado = selecionavel.find(o => String(o.value) === String(value));
    const mostrarBusca = selecionavel.length > LIMIAR_BUSCA;

    const filtrados = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return opcoes;
        const termos = q.split(/\s+/);
        return opcoes.filter(o => o.grupo || termos.every(t => (o.label || '').toLowerCase().includes(t)));
    }, [opcoes, query]);
    const navegaveis = filtrados.map((o, i) => (!o.grupo && !o.disabled ? i : -1)).filter(i => i >= 0);

    const posicionar = useCallback(() => {
        const el = btnRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;
        const espacoAbaixo = vh - r.bottom, espacoAcima = r.top;
        const abrirCima = espacoAbaixo < ALTURA_MENU && espacoAcima > espacoAbaixo;
        const maxH = Math.max(160, Math.min(ALTURA_MENU, (abrirCima ? espacoAcima : espacoAbaixo) - 12));
        const width = Math.min(Math.max(r.width, 224), vw - 16);
        let left = r.left;
        if (left + width > vw - 8) left = Math.max(8, vw - 8 - width);
        if (left < 8) left = 8;
        setCoords({ left, top: r.bottom + 4, bottom: vh - r.top + 4, width, abrirCima, maxH });
    }, []);

    useEffect(() => { setHi(navegaveis[0] ?? 0); }, [query, open]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!open) return;
        posicionar();
        const onScrollResize = () => posicionar();
        window.addEventListener('scroll', onScrollResize, true);
        window.addEventListener('resize', onScrollResize);
        const onDoc = (e) => {
            if (btnRef.current && btnRef.current.contains(e.target)) return;
            if (menuRef.current && menuRef.current.contains(e.target)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => {
            window.removeEventListener('scroll', onScrollResize, true);
            window.removeEventListener('resize', onScrollResize);
            document.removeEventListener('mousedown', onDoc);
        };
    }, [open, posicionar]);

    useEffect(() => { if (open && mostrarBusca && inputRef.current) inputRef.current.focus(); }, [open, mostrarBusca]);

    const abrir = () => {
        if (disabled) return;
        if (!open) { posicionar(); setQuery(''); }
        setOpen(o => !o);
    };

    const escolher = (o) => {
        if (o.disabled || o.grupo) return;
        onChange?.({ target: { value: o.value } });
        setOpen(false);
        setQuery('');
    };

    const moverHi = (dir) => {
        if (!navegaveis.length) return;
        const pos = navegaveis.indexOf(hi);
        const prox = pos === -1 ? 0 : Math.min(Math.max(pos + dir, 0), navegaveis.length - 1);
        setHi(navegaveis[prox]);
    };
    const onKey = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); moverHi(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); moverHi(-1); }
        else if (e.key === 'Enter') { e.preventDefault(); if (filtrados[hi]) escolher(filtrados[hi]); }
        else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    };

    const menu = open && coords ? createPortal(
        <div
            ref={menuRef}
            style={{
                position: 'fixed',
                left: coords.left,
                width: coords.width,
                ...(coords.abrirCima ? { bottom: coords.bottom } : { top: coords.top }),
            }}
            className="z-[9999] bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
        >
            {mostrarBusca && (
                <div className="p-2 border-b border-gray-100">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={onKey}
                            placeholder={buscaPlaceholder}
                            className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                    </div>
                </div>
            )}
            <div className="overflow-y-auto py-1" style={{ maxHeight: coords.maxH }}>
                {filtrados.length === 0 && <div className="px-3 py-3 text-sm text-gray-400">Nada encontrado.</div>}
                {filtrados.map((o, i) => (
                    o.grupo ? (
                        <div key={`g${i}`} className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">{o.grupo}</div>
                    ) : (
                        <button
                            key={`${String(o.value)}-${i}`}
                            type="button"
                            disabled={o.disabled}
                            onMouseEnter={() => setHi(i)}
                            onClick={() => escolher(o)}
                            className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 disabled:text-gray-300 disabled:cursor-not-allowed ${i === hi && !o.disabled ? 'bg-mint/50' : 'hover:bg-gray-50'} ${String(o.value) === String(value) ? 'font-semibold text-primary' : 'text-gray-800'}`}
                        >
                            <span className="break-words">{o.label || ' '}</span>
                            {String(o.value) === String(value) && <Check className="h-4 w-4 text-primary shrink-0" />}
                        </button>
                    )
                ))}
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <div className={`relative ${className}`}>
            <button
                ref={btnRef}
                type="button"
                disabled={disabled}
                onClick={abrir}
                className={`w-full h-full flex items-center justify-between gap-1.5 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white text-left focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:bg-gray-100 disabled:text-gray-400 ${open ? 'border-primary ring-1 ring-primary' : ''}`}
            >
                <span className={`truncate ${selecionado ? 'text-gray-800' : 'text-gray-400'}`}>{selecionado ? selecionado.label : placeholder}</span>
                <ChevronDown className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {menu}
        </div>
    );
};

export default SelectBusca;
