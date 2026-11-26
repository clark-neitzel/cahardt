import React from 'react';
import { AlertTriangle } from 'lucide-react';

// Selo "Corrigir cadastro" das listas de clientes.
// `info` = cliente.cadastroACorrigir (null | { tipo, campo, mensagem, bloqueia }).
// Vermelho quando o cadastro já BLOQUEIA venda (CPF sem sobrenome com a chave ligada);
// âmbar quando é só aviso. Não muda as cores semânticas dos demais badges.
export default function SeloCorrigirCadastro({ info, className = '' }) {
    if (!info) return null;
    const bloqueia = !!info.bloqueia;
    const titulo = info.mensagem || 'Cadastro a corrigir';
    return (
        <span
            data-selo-corrigir-cadastro={bloqueia ? 'vermelho' : 'ambar'}
            title={titulo}
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full whitespace-nowrap ${bloqueia ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'} ${className}`}
        >
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Corrigir cadastro
        </span>
    );
}
