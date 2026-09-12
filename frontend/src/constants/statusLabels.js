// Glossário único de rótulos de status (Linguagem visual v2, CLAUDE.md, aprovado
// 12/09/2026): o mesmo estado tem o mesmo texto em todas as telas. Levantado a
// partir do vocabulário já em uso — `ListaPedidos.jsx` (statusEnvio, notas de
// bonificação), `NotasFiscais.jsx` (status da nota), `ContasReceberTabela.jsx`
// (statusParcela) e o quadro de Badges de Status do CLAUDE.md — sem mudar
// nenhuma cor semântica.
//
// Uso:
//   import { PEDIDO_ENVIO, NF_STATUS, PARCELA_STATUS, corBadge } from '.../statusLabels';
//   <span className={`px-2 py-1 text-xs font-semibold rounded-full ${corBadge(PARCELA_STATUS, l.statusParcela)}`}>
//     {PEDIDO_ENVIO[p.statusEnvio]?.label || p.statusEnvio}
//   </span>

// ─── Pedido — statusEnvio (fluxo de sincronização com o Conta Azul) ───────────
// Fonte: frontend/src/pages/Pedidos/ListaPedidos.jsx (bloco de cores ~L679-684).
export const PEDIDO_ENVIO = {
    ABERTO: { label: 'Aberto', cor: 'bg-gray-100 text-gray-800' },
    ENVIAR: { label: 'Enviar', cor: 'bg-blue-100 text-blue-800' },
    SINCRONIZANDO: { label: 'Sincronizando', cor: 'bg-yellow-100 text-yellow-800' },
    RECEBIDO: { label: 'Faturado', cor: 'bg-green-100 text-green-800' },
    ERRO: { label: 'Erro', cor: 'bg-red-100 text-red-800' },
    EXCLUIDO: { label: 'Excluído', cor: 'bg-red-100 text-red-700' },
};

// ─── Pedido — status da amostra ───────────────────────────────────────────────
export const AMOSTRA_STATUS = {
    SOLICITADA: { label: 'Solicitada', cor: 'bg-blue-100 text-blue-800' },
    PREPARACAO: { label: 'Em preparação', cor: 'bg-yellow-100 text-yellow-800' },
    LIBERADO: { label: 'Liberado', cor: 'bg-emerald-100 text-emerald-800' },
    ENTREGUE: { label: 'Entregue', cor: 'bg-green-100 text-green-800' },
    CANCELADA: { label: 'Cancelada', cor: 'bg-red-100 text-red-700' },
};

// ─── NF-e — status da nota (venda ou bonificação) ─────────────────────────────
// Fonte: frontend/src/pages/Financeiro/NotasFiscais.jsx (~L60-76) e
// `estadoNotaBonificacao` em ListaPedidos.jsx (~L36-42) — os dois já usavam o
// mesmo vocabulário, unificado aqui num só lugar.
export const NF_STATUS = {
    PROCESSANDO: { label: 'Processando', cor: 'bg-blue-100 text-blue-800' },
    AUTORIZADO: { label: 'Autorizada', cor: 'bg-green-100 text-green-800' },
    ERRO: { label: 'Rejeitada', cor: 'bg-red-100 text-red-700' },
    CANCELADO: { label: 'Cancelada', cor: 'bg-red-100 text-red-700' },
    SEM_NOTA: { label: 'Sem nota', cor: 'bg-gray-100 text-gray-700' },
    AGUARDANDO_EMISSAO: { label: 'Aguardando emissão', cor: 'bg-amber-100 text-amber-700' },
};

// ─── Contas a Receber — status da parcela ─────────────────────────────────────
// Fonte: frontend/src/pages/Financeiro/ContasReceberTabela.jsx (filtros L997,
// leituras de `statusParcela` ao longo do arquivo).
export const PARCELA_STATUS = {
    PENDENTE: { label: 'Pendente', cor: 'bg-gray-100 text-gray-700' },
    PARCIAL: { label: 'Parcial', cor: 'bg-yellow-100 text-yellow-800' },
    PAGO: { label: 'Pago', cor: 'bg-green-100 text-green-800' },
    VENCIDO: { label: 'Vencido', cor: 'bg-red-100 text-red-700' },
    CANCELADO: { label: 'Cancelado', cor: 'bg-red-100 text-red-700' },
};

// Contas a Pagar/Receber — status da conta (agregado, distinto da parcela)
export const CONTA_STATUS = {
    ABERTO: { label: 'Aberto', cor: 'bg-blue-100 text-blue-800' },
    QUITADO: { label: 'Quitado', cor: 'bg-green-100 text-green-800' },
    CANCELADO: { label: 'Cancelado', cor: 'bg-red-100 text-red-700' },
};

// ─── Estoque — situação do produto ────────────────────────────────────────────
// Fonte: quadro "Badges de Status" do CLAUDE.md (cores semânticas do design
// system) — vocabulário de referência para quando a tela precisar do badge.
export const ESTOQUE_STATUS = {
    ATIVO: { label: 'Ativo', cor: 'bg-green-100 text-green-800' },
    BAIXO: { label: 'Baixo estoque', cor: 'bg-yellow-100 text-yellow-800' },
    SEM_ESTOQUE: { label: 'Sem estoque', cor: 'bg-gray-100 text-gray-700' },
    INATIVO: { label: 'Inativo', cor: 'bg-red-100 text-red-700' },
};

/**
 * Devolve a classe de cor do badge para `status` dentro do glossário `mapa`.
 * Nunca muda a cor semântica — só lê o que já está definido acima. Se o status
 * não existir no glossário, cai no cinza neutro (nunca quebra a tela por um
 * valor inesperado vindo do backend).
 * @param {Record<string, {label: string, cor: string}>} mapa
 * @param {string} status
 * @returns {string} classes Tailwind do badge
 */
export function corBadge(mapa, status) {
    return mapa?.[status]?.cor || 'bg-gray-100 text-gray-700';
}

/**
 * Devolve o rótulo humano para `status` dentro do glossário `mapa`, com
 * fallback para o próprio valor cru (nunca "undefined" na tela).
 * @param {Record<string, {label: string, cor: string}>} mapa
 * @param {string} status
 * @returns {string}
 */
export function rotuloStatus(mapa, status) {
    return mapa?.[status]?.label || status || '—';
}
