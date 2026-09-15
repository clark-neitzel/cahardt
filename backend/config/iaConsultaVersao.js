// Fonte única da versão do contrato da API de consulta para IA externa (Antigravity/WhatsApp).
// Ver regras de uso em backend/docs/ia-consulta-api.md — NUNCA remover/renomear campo de resposta
// sem antes registrar um aviso aqui com antecedência.
//
// Ao dar um AVISO de mudança futura, adicione um objeto em AVISOS com { desde, mensagem }.
// Toda resposta da API inclui esse array em `meta.avisos`, para o app consumidor logar/alertar
// e se ajustar ANTES da mudança acontecer — assim o serviço nunca quebra "do nada" para o cliente.
// Histórico completo em backend/docs/ia-consulta-api.md.
// 1.0.0 (2026-07-01) Kit Festa · 1.1.0 (2026-07-02) + Congelados por CPF sem senha (nunca consumido
// externamente) · 1.2.0 (2026-07-02) corrige a 1.1.0: reconhecimento por telefone + login/senha/código
// com token, removendo o endpoint que aceitava só CPF/CNPJ sem prova de identidade · 1.3.0
// (2026-07-04) + seção /cliente (geral, todas as linhas): reconhecer-telefone, historico-pedidos,
// criar-lead — substitui o SQL direto que o bot da IA rodava contra o banco de produção · 1.4.0
// (2026-07-07) Fase 2 (criação de pedido pela IA): congelados/reconhecer-telefone ganha ultimoPedido[]
// + flag comprado; cliente/historico-pedidos aceita comItens; novos POST congelados/pedido e
// kitfesta/pedido (caem na fila de aprovação, preço recalculado, idempotencyKey, webhook do Kit
// Festa desligado). Tudo aditivo — nenhum campo removido/renomeado. · 1.5.0 (2026-08-10) busca e
// ficha de cliente para o PAINEL da equipe do bot: POST cliente/buscar (razão/fantasia/documento)
// e POST cliente/ficha (por documento); cadastro ganha lista de WhatsApps (cliente_whatsapps) e
// os reconhecer-telefone (geral e congelados) passam a casar também por esses números. Tudo aditivo.
// · 1.5.1 (2026-08-26) padronização de grafia de cidade (Fase 1): a 'cidade' recebida em
// cliente/criar-lead é gravada com o nome oficial. NENHUM campo de resposta removido ou
// renomeado — só o VALOR gravado muda; aviso informativo registrado em AVISOS.
// · 1.6.0 (2026-09-10) dados para a Ana tirar o pedido semanal: objeto ÚNICO de produto
// (somado ao catálogo/reconhecimento; sub-objeto `produto` nos itens de pedido) e de pedido
// (`fonte` PEDIDO|FILA, dataPrevista/entregueEm/entregador/status/emAberto/origem/nfeNumero);
// histórico passa a incluir a FILA de aprovação no topo; reconhecimentos ganham
// ultimoPedidoDetalhe/pedidosEmAberto/proximasEntregas/horaCorte/vendedorInfo/endereco; novos
// GET congelados/promocoes, GET congelados/indisponiveis, POST cliente/produtos-comprados,
// POST cliente/situacao (só painel), GET cliente/pedido/:numero; POST congelados/pedido aceita
// itens[].promocaoId + observacaoInterna + origem e devolve origem + itens[]. Tudo aditivo —
// nenhum campo removido/renomeado/tipo alterado (ultimoPedido segue array, grupo segue ID,
// embalagem segue string, preparo segue rótulo). Aviso informativo sobre a fila em AVISOS.
const VERSAO_API = '1.6.0';

const AVISOS = [
    // AVISO INFORMATIVO (v1.6.0, não é quebra de contrato): nenhum campo removido/renomeado.
    // O histórico passa a INCLUIR entradas novas (fila de aprovação) — um consumidor que lia
    // `pedidos[0].numero` como "último pedido real" precisa olhar `fonte`.
    {
        desde: '2026-09-10',
        mensagem: "POST /cliente/historico-pedidos: a lista passa a incluir, NO TOPO e fora do 'limite', "
            + "os pedidos ainda na fila de aprovação (fonte:'FILA', status AGUARDANDO/PENDENTE_CADASTRO, "
            + "'numero' = número da fila, o mesmo devolvido por POST /congelados/pedido). Entradas antigas "
            + "continuam iguais, com fonte:'PEDIDO'. Nenhum campo foi removido. Note também que 'dataEntrega' "
            + "sempre foi a hora REAL da entrega (null até o motorista entregar) — a data prevista está no "
            + "campo novo 'dataPrevista'."
    },
    // AVISO INFORMATIVO (não é quebra de contrato): nenhum campo de resposta foi removido
    // nem renomeado. O que muda é o VALOR gravado a partir da `cidade` enviada em
    // POST /cliente/criar-lead — por isso está aqui, para o app consumidor não estranhar.
    {
        desde: '2026-08-26',
        mensagem: "POST /cliente/criar-lead: a 'cidade' enviada passa a ser gravada com a grafia oficial "
            + "(ex.: 'JOINVILLE', 'joinvile' e 'Joinville ' viram todas 'Joinville'; 'ITAPOA' vira 'Itapoá'). "
            + "Nenhum campo de resposta mudou — o endpoint continua devolvendo { id, numero, etapa }. "
            + "A IA pode continuar mandando a cidade como o cliente escreveu."
    },
    // Exemplo (remover quando o aviso deixar de ser válido):
    // { desde: '2026-07-01', mensagem: "O campo 'bairros' será removido em 2026-09-01. A verificação de entrega agora é só por CEP/raio — use POST /kitfesta/verificar-entrega." }
];

module.exports = { VERSAO_API, AVISOS };
