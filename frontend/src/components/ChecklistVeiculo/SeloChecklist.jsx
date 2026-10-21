import React from 'react';

/**
 * Selo do checklist por foto do veículo (Caixa, lista e ficha de Veículos).
 *   checklist: { veredito, decisao, status } | null
 *   esperado:  true quando o dia PRESENCIAL deveria ter checklist (sem ele = "Sem checklist")
 * Sem checklist e sem expectativa (caixa antigo, home office) não renderiza nada
 * — ou mostra "—" se `traco` for passado (colunas de tabela).
 */
const VISUAL = {
    APROVADO: { texto: 'Checklist ok', cls: 'bg-green-100 text-green-800' },
    ATENCAO: { texto: 'Atenção', cls: 'bg-amber-100 text-amber-700' },
    REPROVADO: { texto: 'Reprovado', cls: 'bg-red-100 text-red-700' },
    IA_INDISPONIVEL: { texto: 'Sem análise', cls: 'bg-gray-100 text-gray-700' },
};

const SeloChecklist = ({ checklist, esperado = false, traco = false, className = '' }) => {
    const base = `inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${className}`;

    if (!checklist) {
        if (esperado) return <span className={`${base} bg-gray-100 text-gray-700`}>Sem checklist</span>;
        return traco ? <span className="text-gray-500">—</span> : null;
    }
    if (checklist.status === 'RASCUNHO') {
        return <span className={`${base} bg-blue-100 text-blue-800`}>Montando agora</span>;
    }
    const v = VISUAL[checklist.veredito] || { texto: 'Checklist', cls: 'bg-gray-100 text-gray-700' };
    const seguiu = checklist.decisao === 'SEGUIU_TESTE';
    return <span className={`${base} ${v.cls}`}>{v.texto}{seguiu ? ' · seguiu' : ''}</span>;
};

export default SeloChecklist;
