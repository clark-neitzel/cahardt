// Visual ÚNICO do módulo Como Fazer: badges (cores semânticas do design system) e formatação de data.
// (O dicionário de status de TREINAMENTO fica em services/comoFazerService.js → STATUS_VISUAL.)

export const BADGE_TIPO = {
    ROTINA: 'bg-green-100 text-green-800',
    MAQUINA: 'bg-blue-100 text-blue-800',
    REGRA: 'bg-purple-100 text-purple-700',
    DOSAGEM: 'bg-amber-100 text-amber-700',
};

// Situação do CONTEÚDO (editor/lista do gestor)
export const BADGE_CONTEUDO = {
    PUBLICADO: { rotulo: 'No ar', cls: 'bg-green-100 text-green-800' },
    RASCUNHO: { rotulo: 'Rascunho', cls: 'bg-gray-100 text-gray-700' },
    ARQUIVADO: { rotulo: 'Arquivado', cls: 'bg-red-100 text-red-700' },
};

// Situação de uma VERSÃO (histórico)
export const BADGE_VERSAO = {
    PUBLICADA: { rotulo: 'No ar', cls: 'bg-green-100 text-green-800' },
    RASCUNHO: { rotulo: 'Rascunho', cls: 'bg-gray-100 text-gray-700' },
    SUBSTITUIDA: { rotulo: 'Antiga', cls: 'bg-blue-100 text-blue-800' },
};

// Situação de uma EXECUÇÃO de rotina
export const BADGE_SITUACAO = {
    DESVIO: { rotulo: 'Desvio', cls: 'bg-red-100 text-red-700' },
    NAO_FEITA: { rotulo: 'Não feita', cls: 'bg-amber-100 text-amber-700' },
    OK: { rotulo: 'OK', cls: 'bg-green-100 text-green-800' },
};

export const CLS_BADGE = 'px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap';

export const fmtData = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
};

export const fmtDataHora = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};
