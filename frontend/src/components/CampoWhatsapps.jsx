// Lista de números de WhatsApp vinculados ao cadastro do cliente (tabela cliente_whatsapps).
// Além do celular/fixo, o cliente pode ter vários WhatsApps (sócio, comprador, caixa...) — o
// atendimento automático (bot) reconhece o cliente por qualquer número desta lista, e o painel
// do bot mostra a ficha certa. Números só dígitos, com DDD (10 a 13 dígitos, aceita DDI 55).
import React, { useState } from 'react';
import { MessageCircle, Plus, X } from 'lucide-react';

const CampoWhatsapps = ({ numeros, onChange, inputClassName }) => {
    const [novo, setNovo] = useState('');
    const lista = Array.isArray(numeros) ? numeros : [];

    const adicionar = () => {
        const n = novo.replace(/\D/g, '');
        if (!n) return;
        if (n.length < 10 || n.length > 13) {
            alert('Número inválido — informe DDD + número (10 a 13 dígitos).');
            return;
        }
        if (!lista.includes(n)) onChange([...lista, n]);
        setNovo('');
    };

    return (
        <div>
            <div className="flex gap-2">
                <input type="tel" inputMode="numeric" maxLength={13}
                    className={inputClassName}
                    placeholder="47999998888"
                    value={novo}
                    onChange={(e) => setNovo(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }}
                />
                <button type="button" onClick={adicionar}
                    className="px-3 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm flex items-center gap-1 whitespace-nowrap min-h-[40px]">
                    <Plus className="h-4 w-4" /> Adicionar
                </button>
            </div>
            {lista.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                    {lista.map(n => (
                        <span key={n} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-mint text-primaryDark">
                            <MessageCircle className="h-3 w-3" /> {n}
                            <button type="button" onClick={() => onChange(lista.filter(x => x !== n))}
                                className="p-0.5 rounded-full hover:bg-primary/10" aria-label={`Remover ${n}`}>
                                <X className="h-3 w-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
            <p className="text-xs text-gray-400 mt-1">
                WhatsApps do cliente além do celular/fixo. O atendimento automático reconhece o cliente por qualquer número desta lista.
            </p>
        </div>
    );
};

export default CampoWhatsapps;
