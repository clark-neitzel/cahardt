// Aviso no WhatsApp (tipo interno) quando uma amostra nasce — vai para os usuários ativos
// marcados em Administração → Usuários (avisoAmostraWhatsapp), exceto quem criou.
// Best-effort: NUNCA lança e NUNCA usa $transaction.
const prisma = require('../config/database');

const soDigitos = (t) => String(t || '').replace(/\D/g, '');
const cortar = (texto, max) => { const t = String(texto || ''); return t.length <= max ? t : `${t.slice(0, max - 1)}…`; };
const trunc = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length <= n ? s : `${s.slice(0, n - 1)}…`; };

const MAX_ITENS = 5;

const formatarDia = (dataEntrega) => {
    if (!dataEntrega) return null;
    const ymd = new Date(dataEntrega).toISOString().slice(0, 10); // mesma regra do amostraService.diaEntrega
    const [, m, d] = ymd.split('-');
    return `${d}/${m}`;
};

async function montarTexto(amostra) {
    // Cidade: consulta própria (o include de `criar` não traz).
    let cidade = null;
    try {
        if (amostra.clienteId) {
            const c = await prisma.cliente.findUnique({ where: { UUID: amostra.clienteId }, select: { End_Cidade: true } });
            cidade = c?.End_Cidade || null;
        } else if (amostra.leadId) {
            const l = await prisma.lead.findUnique({ where: { id: amostra.leadId }, select: { cidade: true } });
            cidade = l?.cidade || null;
        }
    } catch (e) {
        console.error('[AvisoAmostra] cidade indisponível:', e.message);
    }

    let nomeDest = amostra.cliente ? (amostra.cliente.NomeFantasia || amostra.cliente.Nome) : null;
    if (!nomeDest && amostra.lead?.nomeEstabelecimento) nomeDest = `${amostra.lead.nomeEstabelecimento} (lead)`;
    nomeDest = nomeDest || 'destinatário não informado';
    if (cidade) nomeDest += ` — ${String(cidade).trim()}`;

    const itens = Array.isArray(amostra.itens) ? amostra.itens : [];
    const linhas = itens.slice(0, MAX_ITENS).map(i => `• ${i.quantidade ?? ''} × ${i.produto?.nome || i.nomeProduto || 'item'}`.replace('•  ×', '• ×'));

    const partes = [
        `📦 *Nova amostra AM#${amostra.numero}*`,
        `*Para:* ${nomeDest}`,
        `*Entrega:* ${formatarDia(amostra.dataEntrega) || 'sem data'}`,
        `*Pedida por:* ${amostra.solicitadoPor?.nome || '—'}`,
        `*Itens:*`,
        ...linhas,
    ];
    if (itens.length > MAX_ITENS) partes.push(`_+${itens.length - MAX_ITENS} itens_`);
    if (amostra.observacao && String(amostra.observacao).trim()) partes.push(`*Obs:* ${trunc(amostra.observacao, 120)}`);
    partes.push('Ela já aparece em *Expedição → Cargas* (faixa Amostras fora de carga) e em *Pedidos → Amostras*.');
    return partes.join('\n');
}

async function avisarNovaAmostra(amostra) {
    let enviados = 0;
    let falhas = 0;
    try {
        if (!amostra || !amostra.id) return { enviados, falhas };
        const dests = await prisma.vendedor.findMany({
            where: { ativo: true, avisoAmostraWhatsapp: true, id: { not: amostra.solicitadoPorId } },
            select: { id: true, nome: true, telefone: true },
        });
        if (!dests.length) return { enviados, falhas };

        const texto = cortar(await montarTexto(amostra), 1990);
        const webhookService = require('./webhookService');
        for (const d of dests) {
            if (!d.telefone || soDigitos(d.telefone).length < 10) {
                console.warn(`[AvisoAmostra] ${d.nome} sem telefone válido: pulado`);
                falhas++;
                continue;
            }
            try {
                const r = await webhookService.enviarMensagemCustom(d.telefone, d.nome, texto, {
                    tipo: 'interno', origem: 'amostra', referencia: `amostra-nova-${amostra.id}-${d.id}`,
                });
                if (r && r.ok) enviados++;
                else { falhas++; console.warn(`[AvisoAmostra] envio para ${d.nome} não saiu:`, r?.motivo || 'falha'); }
            } catch (e) {
                falhas++;
                console.error('[AvisoAmostra] erro ao enviar para', d.nome, e.message);
            }
        }
        console.log(`[AvisoAmostra] AM#${amostra.numero}: ${enviados} enviado(s), ${falhas} falha(s)/pulado(s)`);
    } catch (e) {
        console.error('[AvisoAmostra]', e.message);
    }
    return { enviados, falhas };
}

module.exports = { avisarNovaAmostra };
