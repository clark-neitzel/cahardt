import React, { Children, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';

// Drop-in para o <select> nativo (menu escuro do sistema, sem busca).
// Uso idêntico ao <select>: value, onChange({target:{value}}), <option>/<optgroup> como filhos.
//   <SelectBusca value={x} onChange={e => setX(e.target.value)} className="...">
//     <option value="todos">Todos</option>
//     {lista.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
//   </SelectBusca>
// Visual no tema (branco, pílula/borda do projeto) + campo de busca no topo quando há muitas opções.

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
                    out.push({ value: o.props.value != null ? o.props.value : '', label: textoDoNo(o.props.children), disabled: !!o.props.disabled });
                }
            });
        } else if (child.type === 'option') {
            out.push({ value: child.props.value != null ? child.props.value : '', label: textoDoNo(child.props.children), disabled: !!child.props.disabled });
        }
    });
    return out;
}

// Limiar para exibir o campo de busca (menus curtos não precisam).
const LIMIAR_BUSCA = 6;

const SelectBusca = ({ value, onChange, children, className = '', disabled = false, placeholder = 'Selecionar…', buscaPlaceholder = 'Buscar…' }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [hi, setHi] = useState(0);
    const [alinharDireita, setAlinharDireita] = useState(false);
    const boxRef = useRef(null);
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
    // índices navegáveis (ignora cabeçalhos de grupo e desabilitados)
    const navegaveis = filtrados.map((o, i) => (!o.grupo && !o.disabled ? i : -1)).filter(i => i >= 0);

    useEffect(() => { setHi(navegaveis[0] ?? 0); }, [query, open]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);
    useEffect(() => { if (open && mostrarBusca && inputRef.current) inputRef.current.focus(); }, [open, mostrarBusca]);

    const abrir = () => {
        if (disabled) return;
        if (!open && boxRef.current) {
            const r = boxRef.current.getBoundingClientRect();
            setAlinharDireita(r.left > window.innerWidth / 2);
        }
        setOpen(o => !o);
        setQuery('');
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

    return (
        <div className={`relative ${className}`} ref={boxRef}>
            <button
                type="button"
                disabled={disabled}
                onClick={abrir}
                className={`w-full h-full flex items-center justify-between gap-1.5 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white text-left focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:bg-gray-100 disabled:text-gray-400 ${open ? 'border-primary ring-1 ring-primary' : ''}`}
            >
                <span className={`truncate ${selecionado ? 'text-gray-800' : 'text-gray-400'}`}>{selecionado ? selecionado.label : placeholder}</span>
                <ChevronDown className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className={`absolute z-40 mt-1 min-w-full w-max max-w-[calc(100vw-1.5rem)] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden ${alinharDireita ? 'right-0' : 'left-0'}`}>
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
                    <div className="max-h-64 overflow-y-auto py-1">
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
                                    <span className="break-words">{o.label || ' '}</span>
                                    {String(o.value) === String(value) && <Check className="h-4 w-4 text-primary shrink-0" />}
                                </button>
                            )
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SelectBusca;
