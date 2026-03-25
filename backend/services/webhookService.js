const prisma = require('../config/database');

// Helpers compartilhados
const getWebhookUrl = async () => {
    const config = await prisma.appConfig.findUnique({ where: { key: 'webhook_botconversa_url' } });
    const raw = config?.value;
    return typeof raw === 'string' ? raw : (raw ? String(raw) : null);
};

const formatPhone = (cliente) => {
    const telefoneRaw = cliente.Telefone_Celular || cliente.Telefone;
    if (!telefoneRaw) return null;
    let phone = telefoneRaw.replace(/\D/g, '');
    if (phone.length < 10) return null;
    if (!phone.startsWith('55')) phone = '55' + phone;
    return phone;
};

const formatDate = (d) => {
    if (!d) return '-';
    const dt = new Date(d);
    return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
};

const formatDateMsg = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

const enviarWebhook = async (webhookUrl, payload) => {
    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    return true;
};

const webhookService = {
    /**
     * Envia notificação de pedido para o BotConversa via webhook.
     * Retorna { ok: true } ou { ok: false, motivo: '...' }
     */
    notificarPedido: async (pedidoId) => {
        try {
            const webhookUrl = await getWebhookUrl();
            if (!webhookUrl) return { ok: false, motivo: 'URL do webhook não configurada' };

            const pedido = await prisma.pedido.findUnique({
                where: { id: pedidoId },
                include: {
                    cliente: true,
                    itens: { include: { produto: { select: { nome: true } } } }
                }
            });

            if (!pedido || !pedido.cliente) return { ok: false, motivo: 'Pedido ou cliente não encontrado' };
            if (pedido.cliente.recebeAvisoPedido === false) return { ok: false, motivo: 'Cliente optou por não receber avisos' };

            const phone = formatPhone(pedido.cliente);
            if (!phone) return { ok: false, motivo: 'Cliente sem telefone celular válido' };

            const nome = pedido.cliente.NomeFantasia || pedido.cliente.Nome;

            const linhasItens = pedido.itens.map(i => {
                const nomeProd = i.produto?.nome || 'Produto';
                const qtd = Number(i.quantidade);
                const subtotal = (Number(i.valor || 0) * qtd).toFixed(2).replace('.', ',');
                return `  ${qtd}x  ${nomeProd}\n       R$ ${subtotal}`;
            }).join('\n');

            const total = pedido.itens.reduce((sum, i) => sum + (Number(i.valor || 0) * Number(i.quantidade)), 0);
            const totalStr = total.toFixed(2);
            const condicao = pedido.nomeCondicaoPagamento || `${pedido.tipoPagamento || ''} ${pedido.opcaoCondicaoPagamento || ''}`.trim();

            const partes = [
                `Ola, *${nome}*! \uD83D\uDC4B`,
                '',
                `Segue o resumo do seu pedido \uD83D\uDCCB`,
                '',
                `\uD83D\uDCC5 *Pedido:* ${formatDateMsg(pedido.createdAt)}`,
                `\uD83D\uDE9A *Entrega:* ${formatDateMsg(pedido.dataVenda)}`,
                '',
                '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
                linhasItens,
                '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
                '',
                `\uD83D\uDCB0 *Total: R$ ${totalStr.replace('.', ',')}*`,
                `\uD83D\uDCB3 *Condição:* ${condicao}`,
            ];
            if (pedido.observacoes) {
                partes.push('', `\uD83D\uDCDD *Obs:* ${pedido.observacoes}`);
            }
            partes.push('', 'Obrigado pela preferência! \uD83D\uDE4F');

            const mensagem = partes.join('\n');

            const payload = {
                phone, nome, mensagem,
                data_pedido: formatDate(pedido.createdAt),
                data_entrega: formatDate(pedido.dataVenda),
                total: totalStr, condicao
            };

            await enviarWebhook(webhookUrl, payload);
            console.log(`[Webhook] Pedido enviado para ${nome} (${phone}) - #${pedido.numero || pedidoId.substring(0, 8)}`);
            return { ok: true };
        } catch (error) {
            console.error('[Webhook] Erro pedido:', error.message);
            return { ok: false, motivo: error.message };
        }
    },

    /**
     * Envia notificação de amostra para o BotConversa via webhook.
     * Retorna { ok: true } ou { ok: false, motivo: '...' }
     */
    notificarAmostra: async (amostraId) => {
        try {
            const webhookUrl = await getWebhookUrl();
            if (!webhookUrl) return { ok: false, motivo: 'URL do webhook não configurada' };

            const amostra = await prisma.amostra.findUnique({
                where: { id: amostraId },
                include: {
                    cliente: true,
                    lead: true,
                    itens: true
                }
            });

            if (!amostra) return { ok: false, motivo: 'Amostra não encontrada' };

            const cliente = amostra.cliente;
            if (!cliente) return { ok: false, motivo: 'Amostra sem cliente vinculado' };
            if (cliente.recebeAvisoPedido === false) return { ok: false, motivo: 'Cliente optou por não receber avisos' };

            const phone = formatPhone(cliente);
            if (!phone) return { ok: false, motivo: 'Cliente sem telefone celular válido' };

            const nome = cliente.NomeFantasia || cliente.Nome;

            const linhasItens = amostra.itens.map(i => {
                const qtd = Number(i.quantidade);
                return `  ${qtd}x  ${i.nomeProduto}`;
            }).join('\n');

            const partes = [
                `Ola, *${nome}*! \uD83D\uDC4B`,
                '',
                `Segue sua *amostra* da Hardt Salgados \uD83C\uDF81`,
                '',
            ];
            if (amostra.dataEntrega) {
                partes.push(`\uD83D\uDE9A *Entrega:* ${formatDateMsg(amostra.dataEntrega)}`, '');
            }
            partes.push(
                '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
                linhasItens,
                '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
            );
            if (amostra.observacao) {
                partes.push('', `\uD83D\uDCDD *Obs:* ${amostra.observacao}`);
            }
            partes.push('', 'Obrigado pela preferência! \uD83D\uDE4F');

            const mensagem = partes.join('\n');

            const payload = {
                phone, nome, mensagem,
                data_pedido: formatDate(amostra.createdAt),
                data_entrega: formatDate(amostra.dataEntrega),
                total: '0.00',
                condicao: 'Amostra'
            };

            await enviarWebhook(webhookUrl, payload);
            console.log(`[Webhook] Amostra enviada para ${nome} (${phone}) - AM#${amostra.numero}`);
            return { ok: true };
        } catch (error) {
            console.error('[Webhook] Erro amostra:', error.message);
            return { ok: false, motivo: error.message };
        }
    }
};

module.exports = webhookService;
