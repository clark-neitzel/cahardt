const prisma = require('../config/database');

// Helpers compartilhados
const getWebhookUrl = async () => {
    const config = await prisma.appConfig.findUnique({ where: { key: 'webhook_botconversa_url' } });
    const raw = config?.value;
    return typeof raw === 'string' ? raw : (raw ? String(raw) : null);
};

const formatPhone = (cliente) => {
    const telefoneRaw = cliente.Telefone_Celular;
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
    notificarPedido: async (pedidoId, { forceManual = false } = {}) => {
        const salvarStatus = async (ok, motivo) => {
            try {
                await prisma.pedido.update({
                    where: { id: pedidoId },
                    data: { whatsappEnviado: ok, whatsappErro: ok ? null : (motivo || null) }
                });
            } catch (e) { console.error('[Webhook] Erro ao salvar status:', e.message); }
        };

        try {
            // Verificar se WhatsApp está ativo (pula verificação em envio manual pelo botão)
            if (!forceManual) {
                const whatsappConfig = await prisma.appConfig.findUnique({ where: { key: 'whatsapp_ativo' } });
                const whatsappValue = whatsappConfig?.value;
                const isDesativado = whatsappValue === false || (typeof whatsappValue === 'object' && whatsappValue?.value === false);
                if (whatsappConfig && isDesativado) {
                    return { ok: false, motivo: 'WhatsApp pausado pelo administrador' };
                }
            }

            const webhookUrl = await getWebhookUrl();
            if (!webhookUrl) { await salvarStatus(false, 'Webhook não configurado'); return { ok: false, motivo: 'URL do webhook não configurada' }; }

            const pedido = await prisma.pedido.findUnique({
                where: { id: pedidoId },
                include: {
                    cliente: true,
                    itens: { include: { produto: { select: { nome: true } } } }
                }
            });

            if (!pedido || !pedido.cliente) { await salvarStatus(false, 'Pedido/cliente não encontrado'); return { ok: false, motivo: 'Pedido ou cliente não encontrado' }; }
            if (pedido.cliente.recebeAvisoPedido === false) { await salvarStatus(false, 'Cliente não recebe avisos'); return { ok: false, motivo: 'Cliente optou por não receber avisos' }; }

            const phone = formatPhone(pedido.cliente);
            if (!phone) { await salvarStatus(false, 'Sem celular cadastrado'); return { ok: false, motivo: 'Cliente sem telefone celular válido' }; }

            const nome = pedido.cliente.NomeFantasia || pedido.cliente.Nome;

            const linhasItens = pedido.itens.map(i => {
                const nomeProd = i.produto?.nome || 'Produto';
                const qtd = Number(i.quantidade);
                const valorUn = Number(i.valor || 0).toFixed(2).replace('.', ',');
                return `\`${nomeProd}\`\n${qtd} un x R$ ${valorUn}`;
            }).join('\n\n');

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
            await salvarStatus(true, null);
            console.log(`[Webhook] Pedido enviado para ${nome} (${phone}) - #${pedido.numero || pedidoId.substring(0, 8)}`);
            return { ok: true };
        } catch (error) {
            console.error('[Webhook] Erro pedido:', error.message);
            await salvarStatus(false, `Erro BotConversa: ${error.message}`);
            return { ok: false, motivo: error.message };
        }
    },

    /**
     * Envia notificação de amostra para o BotConversa via webhook.
     * Retorna { ok: true } ou { ok: false, motivo: '...' }
     */
    notificarAmostra: async (amostraId, { forceManual = false } = {}) => {
        try {
            // Verificar se WhatsApp está ativo (pula verificação em envio manual pelo botão)
            if (!forceManual) {
                const whatsappConfig = await prisma.appConfig.findUnique({ where: { key: 'whatsapp_ativo' } });
                const whatsappValue = whatsappConfig?.value;
                const isDesativado = whatsappValue === false || (typeof whatsappValue === 'object' && whatsappValue?.value === false);
                if (whatsappConfig && isDesativado) {
                    return { ok: false, motivo: 'WhatsApp pausado pelo administrador' };
                }
            }

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
                return `\`${i.nomeProduto}\`\n${qtd} un`;
            }).join('\n\n');

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
    },

    /**
     * Notifica movimentação de etapa no Delivery (Kit Festa).
     * Envia pro Bot interno (se configurado em delivery_bot_phone)
     * e pro cliente via WhatsApp. Log salvo em delivery_webhook_logs.
     */
    notificarDelivery: async (pedidoId, novaEtapa) => {
        const ETAPAS_LABEL = {
            PEDIDO: 'Pedido Criado',
            PRODUCAO: 'Em Produção',
            SAINDO: 'Saindo para Entrega',
            ENTREGUE: 'Entregue'
        };

        const registrarLog = async (destino, status, mensagem) => {
            try {
                await prisma.deliveryWebhookLog.create({
                    data: { pedidoId, etapa: novaEtapa, destino, status, mensagem: (mensagem || '').slice(0, 500) }
                });
            } catch (e) { console.error('[Delivery-Webhook] log fail:', e.message); }
        };

        try {
            const webhookUrl = await getWebhookUrl();
            if (!webhookUrl) return { ok: false, motivo: 'Webhook não configurado' };

            const pedido = await prisma.pedido.findUnique({
                where: { id: pedidoId },
                include: {
                    cliente: true,
                    itens: { include: { produto: { select: { nome: true } } } }
                }
            });
            if (!pedido || !pedido.cliente) return { ok: false, motivo: 'Pedido/cliente não encontrado' };

            const nome = pedido.cliente.NomeFantasia || pedido.cliente.Nome;
            const etapaLabel = ETAPAS_LABEL[novaEtapa] || novaEtapa;

            const linhasItens = pedido.itens.map(i => {
                const nomeProd = i.produto?.nome || 'Produto';
                const qtd = Number(i.quantidade);
                const valorUn = Number(i.valor || 0).toFixed(2).replace('.', ',');
                return `\`${nomeProd}\`\n${qtd} un x R$ ${valorUn}`;
            }).join('\n\n');
            const total = pedido.itens.reduce((s, i) => s + Number(i.valor || 0) * Number(i.quantidade), 0) + Number(pedido.valorFrete || 0);
            const totalStr = total.toFixed(2).replace('.', ',');

            const resumoPartes = [
                `\uD83D\uDCC5 *Entrega:* ${formatDateMsg(pedido.dataVenda)}`,
                '',
                '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
                linhasItens,
            ];
            if (Number(pedido.valorFrete || 0) > 0) {
                resumoPartes.push(`\n\`Frete\`\nR$ ${Number(pedido.valorFrete).toFixed(2).replace('.', ',')}`);
            }
            resumoPartes.push('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
            resumoPartes.push('', `\uD83D\uDCB0 *Total: R$ ${totalStr}*`);
            const resumo = resumoPartes.join('\n');

            // ── BOT (interno) ──
            // Resumo completo em PRODUCAO; só etapa nas demais.
            const botConfig = await prisma.appConfig.findUnique({ where: { key: 'delivery_bot_phone' } });
            const botPhoneRaw = botConfig?.value;
            const botPhone = typeof botPhoneRaw === 'string' ? botPhoneRaw.replace(/\D/g, '') : null;

            if (botPhone) {
                const cabecalhoBot = `\uD83D\uDE9A *DELIVERY — ${etapaLabel}*\nPedido #${pedido.numero || pedidoId.slice(0, 8)} — ${nome}`;
                const mensagemBot = novaEtapa === 'PRODUCAO'
                    ? `${cabecalhoBot}\n\n${resumo}`
                    : cabecalhoBot;
                try {
                    await enviarWebhook(webhookUrl, {
                        phone: botPhone,
                        nome: 'Bot Delivery',
                        mensagem: mensagemBot,
                        total: totalStr
                    });
                    await registrarLog('BOT', 'OK', `Etapa ${novaEtapa}`);
                } catch (e) {
                    await registrarLog('BOT', 'ERRO', e.message);
                }
            }

            // ── CLIENTE ──
            // PRODUCAO: mensagem com resumo + data entrega
            // SAINDO / ENTREGUE: só numero do pedido + etapa
            if (novaEtapa !== 'PEDIDO') {
                const phone = formatPhone(pedido.cliente);
                if (phone && pedido.cliente.recebeAvisoPedido !== false) {
                    const numeroPedido = pedido.numero || pedidoId.slice(0, 8);
                    const mensagemCliente = novaEtapa === 'PRODUCAO'
                        ? [
                            `Olá, *${nome}*! \uD83D\uDC4B`,
                            '',
                            `Seu pedido *#${numeroPedido}* está *${etapaLabel}* \u2728`,
                            '',
                            resumo,
                            '',
                            'Obrigado pela preferência! \uD83D\uDE4F'
                        ].join('\n')
                        : [
                            `Olá, *${nome}*! \uD83D\uDC4B`,
                            '',
                            `Seu pedido *#${numeroPedido}* — *${etapaLabel}* \u2728`
                        ].join('\n');
                    try {
                        await enviarWebhook(webhookUrl, {
                            phone, nome,
                            mensagem: mensagemCliente,
                            data_entrega: formatDate(pedido.dataVenda),
                            total: totalStr
                        });
                        await registrarLog('WHATSAPP', 'OK', `Etapa ${novaEtapa}`);
                        console.log(`[Delivery-Webhook] Cliente ${nome} (${phone}) - ${novaEtapa}`);
                    } catch (e) {
                        await registrarLog('WHATSAPP', 'ERRO', e.message);
                    }
                }
            }

            return { ok: true };
        } catch (error) {
            console.error('[Delivery-Webhook] Erro:', error.message);
            return { ok: false, motivo: error.message };
        }
    }
};

module.exports = webhookService;
