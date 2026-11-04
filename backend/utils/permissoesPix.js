// Regras de permissão do QR PIX, num lugar só (usadas por asaasRoutes e pedidoController).
// Sempre booleano direto — NUNCA `!!perms.pedidos` (objeto { view:false } é truthy).

// Cancelar/substituir QR PIX: permissão própria, liberável por usuário
const podeCancelarQr = (perms) => !!(perms && (perms.admin || perms.Pode_Cancelar_QR_Pix === true));

// Ver/enviar o QR do pedido: quem cobra (entrega/financeiro) + quem vê o Painel de Atendimentos
const podeVerPix = (perms) => !!(perms && (
    perms.admin || perms.Pode_Executar_Entregas || perms.Pode_Baixar_Contas_Receber || perms.Pode_Ver_Todas_Entregas
    || perms.Pode_Ver_Atendimentos === true
    || (perms.Pode_Ver_Atendimentos && perms.Pode_Ver_Atendimentos.view === true)));

// "Financeiro" (definição provisória): vê baixas do Caixa e o aviso de divergência
const ehFinanceiro = (perms) => !!(perms && (perms.admin || perms.Pode_Acessar_Contas_Receber || perms.Pode_Baixar_Contas_Receber));

module.exports = { podeCancelarQr, podeVerPix, ehFinanceiro };
