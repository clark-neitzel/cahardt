const prisma = require('../config/database');

const webhookService = {
    /**
     * Envia notificação de pedido para o BotConversa via webhook.
     * Chamado automaticamente após criação de pedido com statusEnvio = 'ENVIAR'.
     */
    notificarPedido: async (pedidoId) => {
        try {
            // Buscar URL do webhook na config
            const configWebhook = await prisma.appConfig.findUnique({ where: { chave: 'webhook_botconversa_url' } });
            const webhookUrl = configWebhook?.valor;
            if (!webhookUrl) {
                console.log('[Webhook] URL do BotConversa não configurada. Pulando notificação.');
                return;
            }

            // Buscar pedido completo com cliente e itens
            const pedido = await prisma.pedido.findUnique({
                where: { id: pedidoId },
                include: {
                    cliente: true,
                    itens: {
                        include: { produto: { select: { nome: true } } }
                    }
                }
            });

            if (!pedido || !pedido.cliente) {
                console.warn('[Webhook] Pedido ou cliente não encontrado:', pedidoId);
                return;
            }

            // Verificar se cliente aceita notificações
            if (pedido.cliente.recebeAvisoPedido === false) {
                console.log(`[Webhook] Cliente ${pedido.cliente.Nome} optou por não receber avisos.`);
                return;
            }

            // Buscar telefone celular do cliente (prioridade: Celular > Telefone)
            const telefoneRaw = pedido.cliente.Telefone_Celular || pedido.cliente.Telefone;
            if (!telefoneRaw) {
                console.warn(`[Webhook] Cliente ${pedido.cliente.Nome} sem telefone cadastrado.`);
                return;
            }

            // Formatar telefone: remover tudo que não é número e adicionar DDI 55 se necessário
            let phone = telefoneRaw.replace(/\D/g, '');
            if (phone.length < 10) {
                console.warn(`[Webhook] Telefone inválido para ${pedido.cliente.Nome}: ${telefoneRaw}`);
                return;
            }
            // Garantir DDI 55 no início
            if (!phone.startsWith('55')) {
                phone = '55' + phone;
            }

            // Nome do cliente
            const nome = pedido.cliente.NomeFantasia || pedido.cliente.Nome;

            // Formatar datas (dd.mm.yyyy para BotConversa)
            const formatDate = (d) => {
                if (!d) return '-';
                const dt = new Date(d);
                const dd = String(dt.getDate()).padStart(2, '0');
                const mm = String(dt.getMonth() + 1).padStart(2, '0');
                const yyyy = dt.getFullYear();
                return `${dd}.${mm}.${yyyy}`;
            };
            // Formato legível para a mensagem (dd/mm/yyyy)
            const formatDateMsg = (d) => {
                if (!d) return '-';
                const dt = new Date(d);
                return dt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            };

            // Montar lista de itens
            const linhasItens = pedido.itens.map(i => {
                const nomeProd = i.produto?.nome || 'Produto';
                const qtd = i.quantidade;
                const val = Number(i.valor || 0).toFixed(2).replace('.', ',');
                return `- ${nomeProd} - ${qtd}x - R$ ${val}`;
            }).join('\n');

            // Calcular total
            const total = pedido.itens.reduce((sum, i) => sum + (Number(i.valor || 0) * i.quantidade), 0);
            const totalStr = total.toFixed(2);

            // Condição de pagamento
            const condicao = pedido.nomeCondicaoPagamento || `${pedido.tipoPagamento || ''} ${pedido.opcaoCondicaoPagamento || ''}`.trim();

            // Montar mensagem
            const mensagem = [
                `Olá, ${nome}!`,
                '',
                'Segue abaixo o seu pedido da Hardt Salgados',
                '',
                `Data Pedido: ${formatDateMsg(pedido.createdAt)}`,
                `Data Entrega: ${formatDateMsg(pedido.dataVenda)}`,
                '',
                'Itens:',
                linhasItens,
                '',
                `Total: R$ ${totalStr.replace('.', ',')}`,
                '',
                `Condição: ${condicao}`,
                pedido.observacoes ? `Observação: ${pedido.observacoes}` : '',
                '',
                'Obrigado pela preferência!'
            ].filter(l => l !== undefined).join('\n');

            // Payload para o BotConversa
            const payload = {
                phone,
                nome,
                mensagem,
                data_pedido: formatDate(pedido.createdAt),
                data_entrega: formatDate(pedido.dataVenda),
                total: totalStr,
                condicao
            };

            // Enviar webhook
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                console.log(`[Webhook] Notificação enviada para ${nome} (${phone}) - Pedido #${pedido.numero || pedido.id.substring(0, 8)}`);
            } else {
                const errorText = await response.text();
                console.error(`[Webhook] Erro ${response.status}: ${errorText}`);
            }
        } catch (error) {
            // Não deve travar o fluxo do pedido se o webhook falhar
            console.error('[Webhook] Erro ao enviar notificação:', error.message);
        }
    }
};

module.exports = webhookService;
