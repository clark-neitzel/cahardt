import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { GUIA } from './guia';

// Accordion JÁ ABERTO por padrão (regra do projeto: a equipe não clica para expandir).
export default function GuiaLeitura({ visao }) {
    const [aberto, setAberto] = useState(true);
    const itens = GUIA.filter((g) => visao === 'dono' || g.escopo === 'todos');
    return (
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <button type="button" onClick={() => setAberto((a) => !a)} aria-expanded={aberto} className="w-full flex items-center gap-2 px-4 md:px-5 py-3 min-h-[44px] text-left">
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-600 flex-1">Como ler cada número</h2>
                <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${aberto ? 'rotate-180' : ''}`} />
            </button>
            {aberto && (
                <div className="border-t border-gray-100 p-3 md:p-4 grid gap-2.5">
                    {itens.map((g) => (
                        <div key={g.chave} className="rounded-xl border border-gray-200 p-3 grid gap-1 md:grid-cols-[200px_1fr_1fr] md:gap-4">
                            <b className="text-sm text-gray-900">{g.t}</b>
                            <span className="text-[13px] text-gray-700"><b className="text-gray-600">Conta: </b>{g.conta}</span>
                            <span className="text-[13px] text-gray-600"><b className="text-primaryDark">Como ler: </b>{g.ler}</span>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
