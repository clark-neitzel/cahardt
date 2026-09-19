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
// · 1.6.1 (2026-09-15) objeto único de produto passa a usar os Dados da Etiqueta do PCP como
// fonte principal quando existir etiqueta ativa: nomeCurto (etiqueta.nomeProduto), pesoUnidadeG/
// embalagemInfo.unidadesPorEmbalagem/pesoG (etiqueta.pesoUnitario/quantidadeEmbalagem/pesoPacote).
// preparoTipo continua vindo SÓ do rótulo curado da categoria (NÃO derivado de etiqueta.modoPreparo
// — revisão de código pegou que um regex sobre texto livre classificava errado frases com negativa,
// ex. "Não fritar, assar..." virava FRITO); campos novos `modoPreparo` (texto literal da etiqueta,
// até 300 chars, para a Ana citar quando preparoTipo vier null) e `etiqueta` (codigoBarras,
// alergenos[], contemGluten, contemLactose, armazenamento — null sem etiqueta cadastrada).
// GET congelados/promocoes ganha `regras` (como promoção PRECO/CONDICIONAL funciona neste
// sistema). GET congelados/indisponiveis ganha `orientacao` (texto fixo, já que não existe
// previsão de retorno no cadastro). Tudo aditivo — nenhum campo removido/renomeado; `tamanho`
// continua vindo só do código/nome (a etiqueta não tem esse campo).
// · 1.6.2 (2026-09-16) POST cliente/buscar e POST cliente/ficha (SÓ PAINEL, nunca tool da IA)
// passam a incluir FORNECEDORES, não só clientes — o painel do bot não achava empresa que só
// existe como fornecedor (ex.: "Karville"), porque a busca só olhava a tabela de clientes. Cada
// item de cliente/buscar ganha o campo novo `tipo` ("CLIENTE" | "FORNECEDOR" — clientes existentes
// passam a trazer "CLIENTE", nada removido); fornecedor usa o mesmo formato do item de cliente
// (documento/nome/nomeFantasia/cidade/ativo/telefones[]/whatsapps[], com vendedor sempre null e
// whatsapps sempre [] — fornecedor não tem essas colunas). Em cliente/ficha, se o documento não é
// de cliente ela agora procura em Fornecedor antes de devolver "não encontrado": resposta ganha
// `tipo` e, quando é fornecedor, os campos diasEntrega/diasVenda/condicaoPagamento/whatsapps vêm
// vazios/null (não existem para fornecedor) e entra um objeto novo `fornecedor` (email/telefone/
// inscricaoEstadual/uf, só com o que existir no cadastro). Documento cadastrado nos dois ao mesmo
// tempo: cliente tem prioridade e a resposta ganha `tambemFornecedor: true`. Tudo aditivo —
// nenhum campo removido/renomeado.
// · 1.6.3 (2026-09-16) novo POST cliente/adicionar-whatsapp (🔒 SÓ PAINEL, nunca tool da IA):
// o painel do bot vincula manualmente uma conversa a um cliente (por documento) e grava esse
// número no cadastro do CA-Hardt (tabela cliente_whatsapps), pro reconhecimento por telefone
// passar a casar automaticamente dali pra frente (inclusive pra Ana). Body { documento, whatsapp,
// origem? } (origem: "painel-bot" padrão ou "ana" — lista fechada); devolve { ok, jaExistia,
// tipo:"CLIENTE", numeroGravado }. Só ACRESCENTA (nunca apaga nem substitui número existente);
// gravação ATÔMICA por SQL parametrizado (INSERT...ON CONFLICT DO UPDATE array_append, com limite
// de 10 e checagem de duplicata exata no próprio WHERE — ler/montar lista em JS tinha corrida sob
// chamadas simultâneas); whatsapp normalizado com a MESMA função da tela de Clientes
// (backend/utils/whatsapp.js, compartilhada com clienteController), sem tirar o DDI 55. Não libera
// nenhum dado do cliente — por isso não fere a regra de segurança "nunca liberar dado só com
// CPF/CNPJ". Endpoint 100% novo — nenhum campo de nenhuma resposta existente foi alterado.
// · 1.6.4 (2026-09-16) decisão do dono: o campo `preparo` do objeto único de produto passa a vir
// da ETIQUETA do PCP (`EtiquetaProduto.modoPreparo`, classificado com segurança por verbo —
// fritar/assar/aquecer/cozinhar — tratando negação por cláusula, ex. "Não fritar, assar em
// forno..." nunca vira "Para fritar") quando ela permitir classificar; o rótulo por categoria do
// admin do site vira RESERVA (usado só sem etiqueta ativa ou texto não reconhecido). Antes o
// contrário: SÓ a categoria, e 25 dos 51 produtos do site mostravam "Somente Aquecer" com a
// etiqueta mandando fritar/assar. `preparoTipo` ganha o valor `COZIDO` (rótulo "Cozinhar") e
// continua `null` para rótulo combinado ("Assar ou fritar" — mais de um verbo na etiqueta,
// ambíguo de propósito). Campo NOVO `preparoOrigem`: "ETIQUETA" | "CATEGORIA" | null. `preparo`
// continua string (contrato inalterado) e `modoPreparo`/`etiqueta` continuam como na 1.6.1. Tudo
// aditivo — nenhum campo removido/renomeado; só o VALOR/fonte de `preparo`/`preparoTipo` muda
// (aviso informativo registrado em AVISOS, já que consumidor que decorou o rótulo antigo por
// categoria vai ver o texto mudar para muitos produtos).
// · 1.6.5 (2026-09-19) Catálogo personalizado pela Ana: novos POST /catalogo/gerar (identifica
// por telefone — nunca CPF/CNPJ sozinho; body { telefone, produtoIds?, todos?, titulo?,
// observacoes?, condicaoId?, idempotencyKey? }; sem reconhecimento devolve { reconhecido:false }),
// GET /catalogo/:token (mesma leitura da página pública, sem telefone — o token já é o segredo) e
// POST /catalogo/listar (catálogos ATIVOS do cliente reconhecido). Reaproveita o mesmo snapshot/
// link público /lista/:token que a tela Produtos → Catálogo já usa. `produtoIds` aceita tanto
// Produto.id quanto o id do site de Congelados (CongeladosProduto.id, mapeado internamente).
// `todos:true` = todo produto ativo e "vendável" (mesma regra que o snapshot já aplicava).
// Dedupe leve (10 min) por telefone+condição+produtos evita catálogo duplicado em retry
// (`idempotencyKey` é aceito no body mas não é o que decide o reaproveitamento — não há coluna
// para guardá-lo; ver ia-consulta-api.md). PODE ser tool da IA (ação transacional a pedido do
// cliente), diferente de /cliente/situacao e /cliente/buscar (só painel). Endpoints 100% novos —
// nenhum campo de nenhuma resposta existente foi alterado.
const VERSAO_API = '1.6.5';

const AVISOS = [
    // AVISO INFORMATIVO (v1.6.4, não é quebra de contrato): nenhum campo removido/renomeado —
    // só a FONTE/VALOR de `preparo` e `preparoTipo` muda (etiqueta passa a mandar, categoria vira
    // reserva). Quem tinha decorado os rótulos antigos por categoria vai ver texto diferente para
    // boa parte do catálogo.
    {
        desde: '2026-09-16',
        mensagem: "GET /congelados/catalogo, /congelados/meu-catalogo e o sub-objeto 'produto' em "
            + "todo lugar que ele aparece: o campo 'preparo' passa a vir da etiqueta do PCP quando ela "
            + "permitir classificar (verbo fritar/assar/aquecer/cozinhar reconhecido com segurança), com "
            + "o texto por categoria do admin do site como reserva. Isso muda o VALOR de 'preparo' (e o "
            + "de 'preparoTipo' correspondente) para boa parte do catálogo — não é mais garantido que ele "
            + "bata com o que estava configurado por categoria. Campo novo 'preparoOrigem' "
            + "('ETIQUETA'|'CATEGORIA'|null) informa de onde veio. Nenhum campo foi removido ou renomeado."
    },
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
