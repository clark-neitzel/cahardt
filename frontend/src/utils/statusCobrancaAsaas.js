// ─────────────────────────────────────────────────────────────────────────────
// MAPA ÚNICO — status da cobrança Asaas (PIX/boleto) → o que a tela mostra.
//
// POR QUE ESTE ARQUIVO EXISTE
// Cada tela escrevia o rótulo por conta própria e uma delas mentia: o modal do PIX
// dizia "Este QR Code expirou.". Não expirou. `EXPIRADO` aqui é a tradução de
// `OVERDUE` do Asaas (backend/services/asaasService.js:101) — quer dizer VENCIDO, e
// uma cobrança vencida CONTINUA PAGÁVEL no banco do cliente (o QR com vencimento
// vale ~12 meses). Foi esse rótulo que fez todo mundo achar que a cobrança estava
// morta — e cliente pagou em dobro.
//
// Regra: rótulo de status de cobrança sai daqui. Nenhuma tela escreve o dela.
//
// ⚠️ ISTO É SÓ RÓTULO. As condicionais que decidem COMPORTAMENTO continuam lendo o
//    valor cru (`status === 'EXPIRADO'`) nas telas — não troque uma pela outra.
//
// Valores possíveis (schema.prisma:4212 + mapearStatus do asaasService):
//   PENDENTE | RECEBIDO | EXPIRADO | ESTORNADO | CANCELADO
// ─────────────────────────────────────────────────────────────────────────────

// `badge` repete EXATAMENTE as cores que já estavam em cada tela — este arquivo
// unifica texto, não semântica de cor. Não trocar sem pedido explícito.
const MAPA = {
    PENDENTE: {
        rotulo: 'Aguardando pagamento',
        curto: 'Aguardando',
        badge: 'bg-blue-100 text-blue-800',
        pagavel: true,
    },
    RECEBIDO: {
        rotulo: 'Pago',
        curto: 'Pago',
        badge: 'bg-green-100 text-green-800',
        pagavel: false,
    },
    EXPIRADO: {
        // O rótulo que importa. "Vencido" sozinho já era lido como "morto".
        rotulo: 'Vencido — ainda pagável',
        curto: 'Vencido (ainda pagável)',
        badge: 'bg-red-100 text-red-700',
        pagavel: true,
    },
    ESTORNADO: {
        rotulo: 'Devolvido (estornado)',
        curto: 'Devolvido',
        badge: 'bg-red-100 text-red-700',
        pagavel: false,
    },
    CANCELADO: {
        rotulo: 'Cancelada',
        curto: 'Cancelada',
        badge: 'bg-gray-100 text-gray-700',
        pagavel: false,
    },
};

// Status desconhecido (backend novo, front antigo) não pode virar "undefined" na
// tela: cai no valor cru em minúsculas, que é o que a linha do tempo já fazia.
const bruto = (status) => String(status ?? '').trim().toUpperCase();

export function statusCobrancaAsaas(status) {
    return MAPA[bruto(status)] || null;
}

/** Rótulo completo, para frase corrida. Ex.: 'Vencido — ainda pagável'. */
export function rotuloCobrancaAsaas(status) {
    const s = bruto(status);
    return MAPA[s]?.rotulo || s.toLowerCase() || '—';
}

/** Rótulo curto, para badge/espaço apertado. Ex.: 'Vencido (ainda pagável)'. */
export function rotuloCurtoCobrancaAsaas(status) {
    const s = bruto(status);
    return MAPA[s]?.curto || s.toLowerCase() || '—';
}

/** Classes de cor do badge — as MESMAS que a tela já usava. */
export function badgeCobrancaAsaas(status) {
    return MAPA[bruto(status)]?.badge || 'bg-gray-100 text-gray-700';
}

/**
 * O cliente ainda consegue pagar esta cobrança?
 * Só informativo (texto de tela). Quem decide emitir/cancelar continua olhando o
 * status cru, igual ao backend.
 */
export function cobrancaAindaPagavel(status) {
    return MAPA[bruto(status)]?.pagavel === true;
}
