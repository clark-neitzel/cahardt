import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Check } from 'lucide-react';

// Supports string arrays OR object arrays { value, label }
// `summary`: ao invés de listar todos os chips selecionados, mostra um resumo
//   compacto ("N selecionado(s)") para economizar espaço.
// `searchable`: exibe um campo de busca dentro do dropdown.
const MultiSelect = ({ options, selected, onChange, placeholder = "Selecione...", valueKey, labelKey, summary = false, searchable = false, summaryNoun = 'selecionado' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const dropdownRef = useRef(null);

    const getValue = (opt) => valueKey ? opt[valueKey] : opt;
    const getLabel = (opt) => labelKey ? opt[labelKey] : opt;

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (opt) => {
        const val = getValue(opt);
        if (selected.includes(val)) {
            onChange(selected.filter(item => item !== val));
        } else {
            onChange([...selected, val]);
        }
    };

    const removeOption = (e, val) => {
        e.stopPropagation();
        onChange(selected.filter(item => item !== val));
    };

    const getLabelForValue = (val) => {
        if (!valueKey) return val;
        const opt = options.find(o => getValue(o) === val);
        return opt ? getLabel(opt) : val;
    };

    return (
        <div className="relative w-full" ref={dropdownRef}>
            <div
                className="w-full bg-white border border-gray-300 rounded-md shadow-sm pl-3 pr-10 py-2 text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm min-h-[38px] flex flex-wrap gap-1 items-center"
                onClick={() => setIsOpen(!isOpen)}
            >
                {selected.length === 0 ? (
                    <span className="text-gray-500 block truncate">{placeholder}</span>
                ) : summary ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        {selected.length} {summaryNoun}{selected.length !== 1 ? 's' : ''}
                        <button
                            onClick={(e) => { e.stopPropagation(); onChange([]); }}
                            className="ml-1 text-blue-600 hover:text-blue-800 focus:outline-none"
                            title="Limpar"
                        >
                            <X size={12} />
                        </button>
                    </span>
                ) : (
                    selected.map(val => (
                        <span key={val} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            {getLabelForValue(val)}
                            <button
                                onClick={(e) => removeOption(e, val)}
                                className="ml-1 text-blue-600 hover:text-blue-800 focus:outline-none"
                            >
                                <X size={12} />
                            </button>
                        </span>
                    ))
                )}
                <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                </span>
            </div>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
                    {searchable && (
                        <div className="sticky top-0 bg-white px-2 pt-1 pb-2 border-b border-gray-100">
                            <input
                                autoFocus
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="Buscar..."
                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-primary focus:border-primary"
                            />
                        </div>
                    )}
                    {options.length === 0 ? (
                        <div className="py-2 px-4 text-gray-500">Nenhuma opção disponível</div>
                    ) : (
                        options
                            .filter((option) => !searchable || !query.trim() || String(getLabel(option)).toLowerCase().includes(query.trim().toLowerCase()))
                            .map((option) => {
                            const val = getValue(option);
                            const label = getLabel(option);
                            const isSelected = selected.includes(val);
                            return (
                                <div
                                    key={val}
                                    className={`cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-gray-100 ${isSelected ? 'bg-blue-50 text-blue-900' : 'text-gray-900'}`}
                                    onClick={() => toggleOption(option)}
                                >
                                    <span className={`block truncate ${isSelected ? 'font-semibold' : 'font-normal'}`}>
                                        {label}
                                    </span>
                                    {isSelected && (
                                        <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-primary">
                                            <Check className="h-4 w-4" />
                                        </span>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
};

export default MultiSelect;
