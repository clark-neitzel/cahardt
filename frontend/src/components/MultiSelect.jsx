import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Check } from 'lucide-react';

const MultiSelect = ({ options, selected, onChange, placeholder = "Selecione..." }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (option) => {
        if (selected.includes(option)) {
            onChange(selected.filter(item => item !== option));
        } else {
            onChange([...selected, option]);
        }
    };

    const removeOption = (e, option) => {
        e.stopPropagation();
        onChange(selected.filter(item => item !== option));
    };

    return (
        <div className="relative w-full" ref={dropdownRef}>
            <div
                className="w-full bg-white border border-gray-300 rounded-md shadow-sm pl-3 pr-10 py-2 text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm min-h-[38px] flex flex-wrap gap-1 items-center"
                onClick={() => setIsOpen(!isOpen)}
            >
                {selected.length === 0 ? (
                    <span className="text-gray-500 block truncate">{placeholder}</span>
                ) : (
                    selected.map(item => (
                        <span key={item} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            {item}
                            <button
                                onClick={(e) => removeOption(e, item)}
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
                    {options.length === 0 ? (
                        <div className="py-2 px-4 text-gray-500">Nenhuma opção disponível</div>
                    ) : (
                        options.map((option) => (
                            <div
                                key={option}
                                className={`cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-gray-100 ${selected.includes(option) ? 'bg-blue-50 text-blue-900' : 'text-gray-900'}`}
                                onClick={() => toggleOption(option)}
                            >
                                <span className={`block truncate ${selected.includes(option) ? 'font-semibold' : 'font-normal'}`}>
                                    {option}
                                </span>
                                {selected.includes(option) && (
                                    <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-primary">
                                        <Check className="h-4 w-4" />
                                    </span>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default MultiSelect;
