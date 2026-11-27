// CLASSIFICAÇÃO das funções de ESCRITA do agente: chave do catálogo -> qual AÇÃO da matriz ela é.
// Fonte: docs/agente-classificacao-escrita.md (183 funções, lidas no código uma a uma) + as 2 prévias `avaliar-custo`.
//
// Mapa do doc para a matriz (plano, seção 5):
//   CRIAR -> criar · MODIFICAR -> editar · EXCLUIR -> excluir · ESTORNAR -> estornar · BAIXAR_FATURAR e CONCILIAR -> baixar
//   PREVIA sem chamada externa -> ver · OUTRO -> editar
//   ENVIO_EXTERNO e PREVIA com chamada externa -> NÃO ficam aqui: são bloqueio FIXO por chave
//   (config/agentePoliticaPadrao.js, BLOQUEIO_CHAVES_MATRIZ).
//
// GET não é listado: GET de família com módulo vale `ver` (EXCECOES_LEITURA continuam sendo exceção).
//
// ROTA DE ESCRITA NOVA: o teste tests/agenteClassificacao.test.js FALHA listando a chave sem classificação.
// Classifique aqui no mesmo PR. Enquanto não classificada, ela nasce em PEDE (se `editar` do módulo não for NÃO)
// e NUNCA em SIM — não ganha autonomia sozinha.
//
// Marcas:
//   soAdmin    — a rota só passa com `admin` (o agente nunca é admin): 403 AGENTE_SO_ADMIN na hora, fora da matriz.
//   semprePede — mesmo com a célula em SIM, vira pedido de autorização (texto = o motivo mostrado ao dono).
//   aviso      — a rota tem efeito EXTERNO que o agente não dispara (assertNaoAgente corta): a resposta ganha `avisosAgente`.
//   morta      — rota desativada: bloqueada.
const AV = {
    SEFAZ_DRIVE: 'A confirmação da operação na SEFAZ e a cópia do XML no Drive NÃO são feitas pelo agente — se couberem a esta nota, precisam ser feitas por uma pessoa na tela (Notas Recebidas → Confirmar operação).',
    DRIVE: 'A cópia do XML no Drive da contabilidade NÃO é feita pelo agente — precisa ser feita por uma pessoa na tela.',
    ASAAS: 'O cancelamento do boleto/PIX no Asaas NÃO é feito pelo agente: o QR/boleto pode continuar vivo até a faxina automática passar. Confira no Asaas se for urgente.',
    CA_ASAAS: 'Baixas no Conta Azul e cancelamentos no Asaas NÃO são feitos pelo agente — confira na tela do Caixa.',
    WHATSAPP: 'O aviso de pedido por WhatsApp ao cliente NÃO é enviado pelo agente — se precisar, uma pessoa envia pela tela do pedido.',
    NFE: 'A emissão da NF-e NÃO é feita pelo agente — precisa ser feita por uma pessoa na tela.',
    ZAPI: 'A conferência do número no WhatsApp NÃO é feita pelo agente — o selo do WhatsApp do cliente fica para uma pessoa conferir.',
    RECEITA: 'A consulta à Receita/BrasilAPI NÃO é feita pelo agente — o regime tributário precisa ser atualizado por uma pessoa na tela.',
    CA: 'Nada é enviado nem desfeito no Conta Azul pelo agente — se esta operação tinha vínculo com o Conta Azul, confira lá.',
};

const f = (acao, marcas) => Object.freeze({ acao, ...(marcas || {}) });

const CLASSIFICACAO = Object.freeze({
    // prévias que só calculam (já eram LIBERADAS como leitura — POST_LEITURA do seed)
    'POST /api/contas-pagar/avaliar-custo': f('ver'),
    'POST /api/notas-entrada/:p/avaliar-custo': f('ver'),
    // /api/contas-pagar
    'POST /api/contas-pagar/:p/anexos': f('criar'),
    'POST /api/contas-pagar/:p/pdf': f('editar'),
    'DELETE /api/contas-pagar/:p/pdf': f('excluir'),
    'POST /api/contas-pagar': f('criar'),
    'PUT /api/contas-pagar/:p': f('editar'),
    'PUT /api/contas-pagar/:p/itens': f('editar'),
    'POST /api/contas-pagar/:p/cancelar': f('excluir'),
    'POST /api/contas-pagar/:p/parcelas/:p/baixar': f('baixar'),
    'POST /api/contas-pagar/baixar-lote': f('baixar'),
    'PUT /api/contas-pagar/:p/parcelas/:p/pagamentos/:p': f('editar'),
    'POST /api/contas-pagar/:p/parcelas/:p/estorno': f('estornar', { aviso: AV.CA }),
    // /api/anexos
    'PATCH /api/anexos/:p': f('editar'),
    'DELETE /api/anexos/:p': f('excluir'),
    // /api/fornecedores
    'POST /api/fornecedores/da-pessoa/:p': f('criar'),
    'POST /api/fornecedores': f('criar', { aviso: AV.CA }),
    'PUT /api/fornecedores/:p': f('editar'),
    'POST /api/fornecedores/:p/excluir': f('excluir'),
    'POST /api/fornecedores/:p/cadastro-pessoa': f('criar'),
    // /api/notas-entrada
    'POST /api/notas-entrada/importar-xml': f('criar'),
    'POST /api/notas-entrada/lancar-manual': f('criar'),
    'POST /api/notas-entrada/:p/vincular-parcelas': f('baixar', { aviso: AV.SEFAZ_DRIVE }),
    'POST /api/notas-entrada/:p/desvincular-parcelas': f('estornar'),
    'POST /api/notas-entrada/:p/criar-produto': f('criar'),
    'POST /api/notas-entrada/:p/gerar-conta': f('criar', { aviso: AV.SEFAZ_DRIVE }),
    'POST /api/notas-entrada/:p/registrar-entrada': f('criar', { semprePede: 'classificar errado esconde uma dívida', aviso: AV.SEFAZ_DRIVE }),
    'POST /api/notas-entrada/:p/desfazer-entrada': f('estornar'),
    'POST /api/notas-entrada/:p/ignorar': f('excluir', { aviso: AV.DRIVE }),
    'POST /api/notas-entrada/:p/reativar': f('estornar'),
    'POST /api/notas-entrada/:p/cancelar-conferencia': f('estornar'),
    'POST /api/notas-entrada/:p/corrigir-entrada-estoque': f('editar'),
    // /api/conciliacao-bancaria
    'POST /api/conciliacao-bancaria/importar': f('criar'),
    'POST /api/conciliacao-bancaria/conciliar-auto': f('baixar'),
    'POST /api/conciliacao-bancaria/corrigir-conta-baixa': f('editar', { aviso: AV.CA }),
    'POST /api/conciliacao-bancaria/conciliar-unificado': f('baixar'),
    'POST /api/conciliacao-bancaria/:p/conciliar': f('baixar'),
    'POST /api/conciliacao-bancaria/:p/ignorar': f('excluir'),
    'POST /api/conciliacao-bancaria/confirmar-identificadas': f('baixar'),
    'POST /api/conciliacao-bancaria/:p/transferencia': f('baixar'),
    'POST /api/conciliacao-bancaria/:p/desfazer': f('estornar'),
    'POST /api/conciliacao-bancaria/:p/conciliar-varios': f('baixar'),
    'POST /api/conciliacao-bancaria/:p/desfazer-titulo': f('estornar'),
    'POST /api/conciliacao-bancaria/:p/criar-despesa': f('criar', { semprePede: 'cria despesa JÁ PAGA e o lançamento do extrato continua pendente (repetir duplicaria)' }),
    'POST /api/conciliacao-bancaria/despesas-lote': f('criar', { semprePede: 'lote de despesas' }),
    'DELETE /api/conciliacao-bancaria/importacoes/:p': f('excluir'),
    // /api/financeiro-gerencial
    'PUT /api/financeiro-gerencial/por-conta/lancamento-banco': f('editar'),
    'POST /api/financeiro-gerencial/por-conta/ajuste': f('criar', { semprePede: 'ajuste manual fabrica saldo' }),
    'DELETE /api/financeiro-gerencial/por-conta/ajuste/:p': f('excluir'),
    'PUT /api/financeiro-gerencial/categorias-despesa': f('editar'),
    'POST /api/financeiro-gerencial/categorias-despesa': f('criar'),
    'DELETE /api/financeiro-gerencial/categorias-despesa/:p': f('excluir'),
    'POST /api/financeiro-gerencial/grupos-dre': f('criar', { semprePede: 'mexe na estrutura da DRE' }),
    'PUT /api/financeiro-gerencial/grupos-dre/ordem': f('editar'),
    'PUT /api/financeiro-gerencial/grupos-dre/:p': f('editar'),
    'DELETE /api/financeiro-gerencial/grupos-dre/:p': f('excluir'),
    // /api/contas-receber
    'POST /api/contas-receber/baixa-lote': f('baixar', { aviso: AV.ASAAS }),
    'POST /api/contas-receber/:p/baixa': f('baixar', { aviso: AV.ASAAS }),
    'DELETE /api/contas-receber/:p/pagamentos/:p': f('estornar'),
    'DELETE /api/contas-receber/:p/baixa': f('estornar'),
    'PATCH /api/contas-receber/:p/cancelar': f('excluir'),
    'PATCH /api/contas-receber/:p/reverter-cancelamento': f('estornar'),
    'PUT /api/contas-receber/:p/reverter-quitacao': f('estornar'),
    'POST /api/contas-receber/admin/sincronizar': f('criar', { soAdmin: true }),
    // /api/estoque
    'POST /api/estoque/ajuste': f('editar'),
    'POST /api/estoque/codigo-barras/vincular': f('editar'),
    'PATCH /api/estoque/produto/:p/minimo': f('editar'),
    'POST /api/estoque/produto/:p/recalcular': f('editar', { soAdmin: true }),
    'POST /api/estoque/inventario': f('editar'),
    // /api/categorias-estoque
    'PATCH /api/categorias-estoque/:p': f('editar', { soAdmin: true }),
    // /api/produtos
    'POST /api/produtos': f('criar'),
    'PUT /api/produtos/:p': f('editar'),
    'PATCH /api/produtos/:p/status': f('excluir'),
    'PATCH /api/produtos/:p/custo-ca': f('editar'),
    'POST /api/produtos/:p/imagens': f('criar'),
    'DELETE /api/produtos/imagens/:p': f('excluir'),
    'PATCH /api/produtos/:p/imagens/reordenar': f('editar'),
    'PATCH /api/produtos/:p/imagens/:p/principal': f('editar'),
    // /api/pcp/itens
    'POST /api/pcp/itens': f('criar'),
    'POST /api/pcp/itens/importar': f('criar'),
    'POST /api/pcp/itens/importar-lote': f('criar'),
    'PUT /api/pcp/itens/:p': f('editar'),
    'POST /api/pcp/itens/:p/promover-produto': f('editar'),
    'PATCH /api/pcp/itens/:p/ativo': f('editar'),
    'DELETE /api/pcp/itens/:p': f('excluir'),
    // /api/pcp/receitas
    'POST /api/pcp/receitas/:p/link-impressao': f('ver'),
    'POST /api/pcp/receitas': f('criar'),
    'PUT /api/pcp/receitas/:p': f('editar'),
    'POST /api/pcp/receitas/:p/nova-versao': f('editar'),
    'POST /api/pcp/receitas/:p/clonar': f('criar', { semprePede: 'o clone nasce como receita ATIVA (não há como criar em rascunho)' }),
    'POST /api/pcp/receitas/:p/escalonar': f('ver'),
    'PATCH /api/pcp/receitas/:p/status': f('editar'),
    'DELETE /api/pcp/receitas/:p': f('excluir'),
    // /api/pcp/estoque
    'POST /api/pcp/estoque/ajuste': f('editar'),
    // /api/indicadores-gestao
    'PUT /api/indicadores-gestao/config': f('editar', { soAdmin: true }),
    'PUT /api/indicadores-gestao/metas': f('editar', { soAdmin: true }),
    // /api/pedidos
    'PUT /api/pedidos/:p/local-entrega': f('editar'),
    'DELETE /api/pedidos/:p/local-entrega': f('excluir'),
    'POST /api/pedidos/avisos-convertidos/:p/ciente': f('editar'),
    'POST /api/pedidos/avisos-pagamento-apos-quitacao/:p/ciente': f('editar', { soAdmin: true }),
    'POST /api/pedidos': f('criar', { aviso: AV.WHATSAPP }),
    'PUT /api/pedidos/:p': f('editar'),
    'PUT /api/pedidos/:p/revisado': f('editar'),
    'PUT /api/pedidos/:p/aprovar-especial': f('baixar'),
    'PUT /api/pedidos/:p/reverter-especial': f('estornar'),
    'POST /api/pedidos/:p/converter-especial': f('baixar', { aviso: AV.NFE }),
    'PUT /api/pedidos/:p/aprovar-bonificacao': f('baixar'),
    'PUT /api/pedidos/:p/reverter-bonificacao': f('estornar'),
    'PATCH /api/pedidos/:p/nf-bonificacao': f('editar'),
    'PUT /api/pedidos/:p/cancelar': f('excluir'),
    'DELETE /api/pedidos/:p': f('excluir'),
    'PUT /api/pedidos/:p/reatribuir-vendedor': f('editar'),
    'PUT /api/pedidos/:p/impresso': f('editar'),
    // /api/clientes
    'PUT /api/clientes/:p/local-entrega': f('editar'),
    'DELETE /api/clientes/:p/local-entrega': f('excluir'),
    'PUT /api/clientes/:p/local-entrega/ponto': f('editar'),
    'POST /api/clientes': f('criar', { aviso: AV.ZAPI }),
    'POST /api/clientes/sync': f('editar', { morta: true }),
    'PUT /api/clientes/lote': f('editar'),
    'POST /api/clientes/:p/atualizar-regime': f('editar', { aviso: AV.RECEITA }),
    'POST /api/clientes/:p/endereco-historico/:p/restaurar': f('estornar'),
    'PATCH /api/clientes/:p/retomar-visitas': f('editar'),
    'PUT /api/clientes/:p/telefones/ordem': f('editar'),
    'PUT /api/clientes/:p/telefones/ddd55': f('editar'),
    'POST /api/clientes/:p/contatos': f('criar'),
    'PATCH /api/clientes/:p/contatos/:p': f('editar'),
    'DELETE /api/clientes/:p/contatos/:p': f('excluir'),
    'PATCH /api/clientes/:p': f('editar'),
    // /api/embarques
    'POST /api/embarques/aplicar-divisao': f('editar'),
    'PATCH /api/embarques/:p': f('editar'),
    'POST /api/embarques': f('criar'),
    'POST /api/embarques/:p/pedidos': f('editar'),
    'DELETE /api/embarques/:p/pedidos/:p': f('excluir'),
    'POST /api/embarques/:p/amostras': f('editar'),
    'DELETE /api/embarques/:p/amostras/:p': f('excluir'),
    'POST /api/embarques/:p/impressao': f('editar'),
    'POST /api/embarques/:p/conferir': f('criar'),
    'DELETE /api/embarques/:p/conferir/:p/:p': f('excluir'),
    'POST /api/embarques/:p/conferencia/concluir': f('baixar'),
    // /api/entregas
    'POST /api/entregas/conferir-folha': f('ver'),
    'POST /api/entregas/amostra/:p/concluir': f('baixar'),
    'POST /api/entregas/:p/concluir': f('baixar', { aviso: AV.ASAAS }),
    'PATCH /api/entregas/:p/editar': f('editar', { aviso: AV.ASAAS }),
    'DELETE /api/entregas/:p/estorno': f('estornar'),
    'PATCH /api/entregas/:p/prioridade': f('editar'),
    'POST /api/entregas/reordenar-prioridades': f('editar'),
    // /api/caixa
    'POST /api/caixa/autorizacoes-devolucao/:p/responder': f('baixar'),
    'PUT /api/caixa/conferencia-dinheiro/config': f('editar', { soAdmin: true }),
    'PATCH /api/caixa/adiantamento': f('editar'),
    'POST /api/caixa/conferencia-dinheiro/enviar': f('baixar'),
    'POST /api/caixa/conferencia-dinheiro/conferir': f('baixar'),
    'POST /api/caixa/contagem-dinheiro': f('criar'),
    'POST /api/caixa/conferencia-dinheiro/desfazer': f('estornar'),
    'POST /api/caixa/fechar': f('baixar'),
    'POST /api/caixa/conferir': f('baixar'),
    'POST /api/caixa/reverter-conferencia': f('estornar'),
    'POST /api/caixa/reabrir': f('estornar'),
    'POST /api/caixa/reabrir-pendentes': f('estornar', { soAdmin: true }),
    'PATCH /api/caixa/entrega-conferir': f('baixar'),
    'POST /api/caixa/conferencia-devolucao/autorizar': f('baixar'),
    'POST /api/caixa/conferencia-devolucao/solicitar-autorizacao': f('criar'),
    'POST /api/caixa/conferencia-devolucao/cancelar-solicitacao': f('excluir'),
    'POST /api/caixa/conferencia-devolucao/confirmar': f('baixar'),
    'POST /api/caixa/conferencia-devolucao/reabrir': f('estornar'),
    'POST /api/caixa/cobrancas-rota/baixar': f('baixar', { aviso: AV.CA_ASAAS }),
    'POST /api/caixa/quitar-ca': f('baixar', { aviso: AV.CA_ASAAS }),
    // /api/dashboards
    'PATCH /api/dashboards/geral/carteira/cliente/:p': f('editar'),
    'POST /api/dashboards/geral/carteira/mesmo-cliente': f('criar'),
    'DELETE /api/dashboards/geral/carteira/mesmo-cliente/:p': f('excluir'),
    'POST /api/dashboards/geral/carteira/sugestao-dispensar': f('editar'),
    'POST /api/dashboards/geral/carteira/silencio': f('criar'),
    'DELETE /api/dashboards/geral/carteira/silencio/:p': f('excluir'),
});

/** Classificação de uma chave do catálogo (ou null se não classificada). */
function classificar(chave) { return CLASSIFICACAO[chave] || null; }

/** Aviso de efeito externo (texto) da função, ou null. */
function avisoDe(chave) { const c = CLASSIFICACAO[chave]; return c && c.aviso ? c.aviso : null; }

/**
 * Escritas do catálogo SEM classificação (é o que o teste automático cobra). `rotas`: [{ chave, metodo, exemplo, familia, complexa }].
 * Conta só o que a matriz enxerga: família com módulo, fora de bloqueio fixo (prefixo ou chave) e sem regex no caminho.
 */
function naoClassificadas(rotas) {
    const padrao = require('./agentePoliticaPadrao');
    const { moduloDaFamilia } = require('./agenteModulos');
    return (rotas || [])
        .filter((e) => e.metodo !== 'GET' && !e.complexa && moduloDaFamilia(e.familia))
        .filter((e) => !padrao.ehBloqueioFixo(e.metodo, e.exemplo) && !padrao.ehBloqueioFixoPorChave(e.chave))
        .filter((e) => !CLASSIFICACAO[e.chave])
        .map((e) => e.chave)
        .sort();
}

module.exports = { CLASSIFICACAO, AV, classificar, avisoDe, naoClassificadas };
