---
aba: Atendimentos
rota: /atendimentos
permissao: todos (admin vê todos os vendedores; vendedor vê os próprios)
---

# Atendimentos

## O que é

Painel de consulta e auditoria de todos os atendimentos registrados no sistema. Um atendimento é qualquer contato feito com um cliente ou lead: visita, WhatsApp, ligação, pedido, amostra, retorno ou financeiro. A tela permite filtrar por período, tipo, vendedor e outras dimensões, e visualizar os detalhes de cada registro.

**A tela mostra DUAS coisas na mesma linha do tempo:**

1. **Atendimentos registrados à mão** — o que o vendedor lançou no modal de atendimento da Rota (ou no modal de lead).
2. **Os PEDIDOS do período** — toda venda vira uma linha automaticamente, porque ao criar o pedido o
   vendedor já informa o **Tipo de Atendimento** que gerou a venda (Visita Presencial / Ligação /
   WhatsApp / Outros). Antes disso, quem vendia direto pelo app não aparecia no painel e o dia dele
   ficava com "0 com pedido".

A linha de pedido tem fundo verde, o selo **PEDIDO** ao lado do tipo, o número da venda na coluna Ação
(`Pedido #920`, `ZZ#` para especial, `BN#` para bonificação) e o valor na coluna Observação. Ela **não
é um lançamento de atendimento**: não pode ser excluída pelo painel (para tirá-la, é o pedido que
precisa ser cancelado/excluído).

---

## O que dá pra fazer aqui

- Ver todos os atendimentos e todos os pedidos do período, misturados por hora (50 por vez)
- Filtrar por: data (período), tipo de atendimento, vendedor, cidade, ação e filtros especiais
- Filtrar **"Só pedidos"** no menu de tipo (ou clicar no cartão **Pedidos**) para ver apenas as vendas
- Filtrar por canal (ex.: WhatsApp) — traz os atendimentos **e** os pedidos feitos por aquele canal
- Navegar entre períodos com as setas (avança/recua o mesmo número de dias)
- Buscar por nome do cliente ou texto nas observações
- Expandir uma linha para ver todos os detalhes (na linha de pedido: valor, condição de pagamento,
  canal informado na venda, status de envio e GPS de onde o pedido foi feito)
- Abrir o popup do cliente diretamente do atendimento
- Excluir um atendimento (admin) — **não vale para linha de pedido**
- Ver resumo: total, por tipo, por vendedor, pedidos, com/sem pedido, lead
- Exportar CSV (inclui as colunas Pedido e Valor)
- Ver o **selo de WhatsApp** do cliente na própria linha, quando a chave estiver ligada (seção abaixo)

---

## Selo de WhatsApp na linha (novo — 08/2026)

Quando a chave **"Mostrar selo nas listas"** (Clientes → Pendências de WhatsApp) está ligada, cada
linha de cliente mostra, ao lado do nome, se aquele cliente **tem número de WhatsApp no cadastro** e
se **já saiu mensagem nossa** para esse número — sem precisar abrir a ficha.

> **O que o selo NÃO é.** O sistema **não confere** se o número é do cliente nem se ele está certo.
> Verde quer dizer "já mandamos mensagem para esse número", **não** "número conferido". Na dúvida,
> confirme o número com o cliente do mesmo jeito.

| Na tela | O que quer dizer |
|---|---|
| **Ícone verde** | Já saiu mensagem do sistema para esse número nos últimos 180 dias. Quer dizer que **a mensagem saiu daqui** — não que tenha chegado, não que o cliente leu. |
| **Ícone cinza** | Tem número no cadastro, mas ainda não saiu mensagem para ele. **Não é problema** — só falta histórico. |
| **Chip âmbar "Sem WhatsApp"** | O cadastro do cliente está sem número nenhum. |
| **Chip vermelho "WhatsApp com problema"** | O número está no cadastro, mas o WhatsApp da empresa tentou mandar e o número foi recusado. |

Abaixo da barra de abas aparece uma **legenda** explicando as cores e lembrando que a informação é
**atualizada de madrugada** (o recálculo roda às 04:20).

São **essas quatro marcas e mais nenhuma**. Não existe marca de "dispensado": cliente com
justificativa registrada e sem número mostra o mesmo chip âmbar "Sem WhatsApp" que qualquer outro —
a justificativa serve para destravar o ENVIAR do pedido, não para sumir da lista de quem ainda
precisa dar o número. Quem está dispensado aparece separado na tela **Pendências de WhatsApp**.

**Aqui os chips são só leitura.** Diferente da **Rota** — onde o chip âmbar "Sem WhatsApp" é um botão
que abre o cadastro do número na hora —, neste painel **nenhum chip é clicável**: esta é uma tela de
consulta. Para acertar o número de um cliente visto aqui, abra o cadastro dele (ou faça pela Rota, na
próxima visita). O chip vermelho "com problema" não é clicável em tela nenhuma: o número existe e foi
recusado, então redigitar o mesmo número não resolve — é caso para o escritório apurar com o cliente.

Vale igual para as **duas espécies de linha** do painel: o atendimento registrado pelo vendedor e a
linha da venda (pedido). Linha de **lead** não tem selo — lead ainda não é cliente cadastrado.

A chave vem **desligada de fábrica** e é **independente** da chave "Exigir WhatsApp": ligar o selo
**não** trava o envio de pedido nem torna o número obrigatório no cadastro.

---

## Tipos de atendimento

A lista de tipos é **configurável** em Configurações → Gerais, então o menu do filtro mostra a lista
fixa mais os tipos que realmente aparecem nos dados (hoje o cadastro usa PRESENCIAL e TELEFONE).

| Tipo | Cor | Quando usar |
|------|-----|-------------|
| PRESENCIAL / VISITA | Roxo | Visita presencial ao cliente |
| WHATSAPP | Verde | Contato via WhatsApp |
| LIGACAO / TELEFONE | Azul | Ligação telefônica |
| PEDIDO | Azul claro | Venda cujo canal não foi informado; no filtro, "Só pedidos" |
| SITE | Verde-água | Pedido nascido no site (Kit Festa / Congelados) |
| AMOSTRA | Âmbar | Envio de amostra |
| RETORNO | Índigo | Retorno agendado cumprido |
| FINANCEIRO | Cinza | Cobrança ou assunto financeiro (fica escondido por padrão) |

O tipo da linha de pedido vem do canal informado na venda: Visita Presencial → PRESENCIAL,
WhatsApp → WHATSAPP, Ligação → TELEFONE, Kit Festa/site → SITE.

---

## Cartões de resumo

| Cartão | O que conta |
|--------|-------------|
| **Pedidos** | Quantas vendas foram feitas no período (clicar filtra só elas) |
| **Com Pedido** | Linhas ligadas a venda: os próprios pedidos + atendimentos de cliente que comprou no período |
| **Sem Pedido** | Atendimentos de cliente que não comprou no período |
| **Lead** | Atendimentos de lead (ainda não é cliente) |

---

## Como fazer (passo a passo real)

### Consultar atendimentos do dia
1. Abra a aba Atendimentos
2. O filtro padrão já está com a data de hoje
3. A lista mostra todos os atendimentos registrados no dia

### Mudar o período
- Use as setas `<` e `>` ao lado do período para navegar
- Ou altere diretamente os campos de data início e fim

### Filtrar por vendedor (admin)
- Selecione o vendedor no filtro de vendedores
- A lista atualiza para mostrar apenas os atendimentos daquele vendedor

### Ver detalhes de um atendimento
- Clique na linha do atendimento para expandir
- Você vê: hora, observações, ação registrada, data de retorno (se houver) e dados do cliente
- Na linha de **pedido**: número, valor, condição de pagamento, tipo de atendimento informado na
  venda, status de envio ao Conta Azul e GPS de onde a venda foi lançada

### Ver só as vendas do dia
1. Clique no cartão **Pedidos** (ou escolha "Só pedidos" no menu de tipo)
2. A lista fica só com as vendas do período, na ordem em que foram feitas
3. Clique de novo no cartão para voltar a ver tudo

### Exportar (download)
- O botão de download (ícone) exporta os atendimentos filtrados em CSV, com as colunas Pedido e Valor

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| Qualquer usuário logado | Vê os próprios atendimentos |
| `admin` | Vê todos os vendedores, pode excluir atendimentos |

---

## Depende de / Interfere em

- **Rota** — os atendimentos registrados à mão são criados pela Rota (modal de atendimento)
- **Pedidos** — toda venda do período vira linha aqui; o canal vem do campo "Tipo de Atendimento"
  preenchido na tela de Novo Pedido (é obrigatório para enviar o pedido)
- **Leads** — atendimentos de leads também aparecem aqui
- **Configurações → Gerais** — a lista de tipos de atendimento sai de lá
- **Dashboard** — o número de atendimentos do dia é usado em análises de desempenho
- **Análise IA** — cada atendimento pode disparar uma análise da IA

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Atendimentos/PainelAtendimentos.jsx` | Componente principal |
| `frontend/src/services/atendimentoService.js` | Chamadas de API |
| `backend/routes/atendimentoRoutes.js` + `controllers/atendimentoController.js` | Rotas do backend |
| `backend/services/atendimentoService.js` (`listarComFiltros`) | Junta atendimentos + pedidos na mesma lista |
