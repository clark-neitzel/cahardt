import api from './api';

// ─────────────────────────────────────────────────────────────────────────────
// Módulo "WhatsApp do cliente obrigatório".
// Espelha o contrato combinado com o backend (rotas /api/whatsapp-clientes).
// O número em si é gravado pelo cadastro do cliente (PATCH /clientes/:uuid) —
// aqui ficam só a configuração da exigência, a dispensa e o painel de pendências.
// ─────────────────────────────────────────────────────────────────────────────
const whatsappClientesService = {
    // { ativo: bool, diasValidadeDispensa: number }
    config: async () => (await api.get('/whatsapp-clientes/config')).data,

    setConfig: async (ativo) =>
        (await api.post('/whatsapp-clientes/config', { ativo })).data,

    // motivo: NAO_TEM_WHATSAPP | NAO_QUIS_INFORMAR | VOU_PEGAR_DEPOIS
    dispensar: async (uuid, motivo) =>
        (await api.post(`/whatsapp-clientes/cliente/${uuid}/dispensa`, { motivo })).data,

    // { ativo, kpis, vendedores: [{ vendedorId, vendedorNome, semNumero, dispensados, clientes: [...] }] }
    pendencias: async () => (await api.get('/whatsapp-clientes/pendencias')).data,

    // Recalcula os selos na hora (o normal é o job diário das 04:20). Demora.
    recalcularSelo: async () => (await api.post('/whatsapp-clientes/recalcular-selo')).data,
};

// Rótulos dos motivos de dispensa — usados no modal e no painel de pendências
export const MOTIVOS_DISPENSA = [
    { valor: 'NAO_TEM_WHATSAPP', rotulo: 'Cliente não tem WhatsApp' },
    { valor: 'NAO_QUIS_INFORMAR', rotulo: 'Cliente não quis informar' },
    { valor: 'VOU_PEGAR_DEPOIS', rotulo: 'Vou pegar depois' },
];

export const rotuloMotivo = (valor) =>
    MOTIVOS_DISPENSA.find(m => m.valor === valor)?.rotulo || valor || '—';

/**
 * O número serve como WhatsApp? Espelho EXATO da regra do backend
 * (whatsappClienteService.numeroValido + botWhatsappService.normalizarTelefone):
 * só dígitos, tira o DDI 55 de cadastros antigos importados, e exige 10 ou 11
 * dígitos. Truthiness NÃO serve: cadastro antigo com "999" ou "-" no campo
 * passaria aqui e o servidor barraria o pedido depois — o vendedor só
 * descobriria no popup vermelho, na frente do cliente.
 */
export const numeroWhatsappValido = (raw) => {
    const d = String(raw ?? '').replace(/\D/g, '');
    if (!d) return false;
    const local = (d.length > 11 && d.startsWith('55')) ? d.slice(2) : d;
    return local.length === 10 || local.length === 11;
};

// Até quando a dispensa vale. Prefere o dispensaValidaAte do backend (pendências e
// detalhe do cliente); se ele não vier (dispensa antiga), calcula pela mesma fórmula.
export const calcularValidaAte = (dispensaValidaAte, dispensaEm, diasValidade) => {
    if (dispensaValidaAte) {
        const d = new Date(dispensaValidaAte);
        return isNaN(d) ? null : d;
    }
    if (!dispensaEm || !diasValidade) return null;
    const base = new Date(dispensaEm);
    if (isNaN(base)) return null;
    return new Date(base.getTime() + diasValidade * 24 * 60 * 60 * 1000);
};

export default whatsappClientesService;
