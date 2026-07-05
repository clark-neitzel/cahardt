---
aba: Notas Recebidas
rota: /notas-recebidas
permissao: Pode_Acessar_Notas_Recebidas
---

# Notas Recebidas

## O que é

Caixa de entrada das **notas fiscais (NF-e) que os fornecedores emitem contra o CNPJ da empresa**. O sistema busca essas notas **automaticamente na SEFAZ a cada 1 hora** (usando o certificado digital A1 instalado nas Configurações) — sem precisar digitar nada. De cada nota dá para gerar a **conta a pagar** com um clique, já com as parcelas sugeridas pelas duplicatas da própria nota.

---

## Como a captura funciona (por trás)

1. A cada hora, um robô consulta a SEFAZ perguntando "tem nota nova emitida contra o nosso CNPJ?".
2. A SEFAZ primeiro devolve um **resumo** da nota (fornecedor, valor, data) → a nota aparece com status **AGUARDANDO XML**.
3. O sistema então registra automaticamente a **Ciência da Operação** (manifestação do destinatário) — é isso que libera o XML completo.
4. Na consulta seguinte vem o **XML completo** (itens, quantidades, duplicatas) → a nota vira **NOVA** e está pronta para conferência.
5. Se o fornecedor **cancelar** a nota depois, ela muda sozinha para **CANCELADA PELO EMITENTE**.
6. Fornecedor que ainda não existe no app é **criado automaticamente** pelo CNPJ da nota (origem NFE, sem enviar ao Conta Azul).

> A manifestação de "Ciência da Operação" é neutra: só diz à SEFAZ "estou sabendo da nota". Não é aceite comercial.

---

## Status das notas

| Status | Significado |
|--------|-------------|
| AGUARDANDO_XML | Só o resumo chegou; o XML completo vem na próxima consulta (após a ciência) |
| NOVA | XML completo baixado — pronta para conferir e gerar a conta a pagar |
| CONFERIDA | Já virou conta a pagar (fica vinculada à conta) |
| IGNORADA | Marcada para ignorar (ex.: nota que não gera conta) — dá para reativar |
| CANCELADA_EMITENTE | O fornecedor cancelou a nota na SEFAZ |

---

## O que dá pra fazer aqui

- Ver todas as notas capturadas com fornecedor, número, emissão, valor e status
- Ver o **status da captura**: ligada/desligada, última consulta, resultado e quantas notas novas aguardam conferência
- **Consultar agora**: dispara uma busca imediata na SEFAZ sem esperar a próxima hora
- Abrir o **detalhe da nota**: itens (código do fornecedor, EAN, descrição, quantidade, valores), **informações adicionais de cada item** (infAdProd — lote, validade etc.), duplicatas (vencimentos) e as **observações da nota** (informações complementares / infCpl do XML)
- **Baixar o XML** completo da nota
- **Imprimir a DANFE** (visão em folha da nota: emitente, chave de acesso, destinatário, itens com NCM/CFOP, totais, duplicatas e observações) — impressa na própria página, funciona no iPad/PWA
- **Ignorar** uma nota (e **reativar** depois, se mudar de ideia)
- **Gerar a conta a pagar** a partir da nota:
  - As **parcelas vêm sugeridas pelas duplicatas** da nota (pode ajustar; a soma precisa bater com o total da nota). Quando a nota **não tem boleto/duplicata no XML** (compra à vista), a parcela já vem com a **data de emissão da nota** (não a data de hoje), para a despesa aparecer no Conta Azul com a data certa.
  - **"Ainda vou pagar" ou "Já paguei"** (ao enviar ao Conta Azul):
    - **Ainda vou pagar** — a despesa entra **em aberto** no Conta Azul, para pagar depois via DDA/boleto (comportamento padrão).
    - **Já paguei** — para compras à vista (PIX, dinheiro, transferência etc.). A despesa entra **já quitada** no Conta Azul, só para **conciliar com o extrato**. Você informa **a data do pagamento** (vem preenchida com a emissão da nota), a **forma de pagamento** e o **banco/caixa de onde saiu** (a lista de bancos vem do próprio Conta Azul). O app cria a despesa e, em seguida, **dá a baixa automaticamente** no Conta Azul.
  - **Conciliação (não duplica)**: se você **já tinha lançado essa mesma nota manualmente** no Conta Azul, ao gerar a conta o sistema **procura pelo número da nota** (dentro do fornecedor/valor) e, se encontrar, **vincula à despesa que já existe** lá em vez de criar outra.
  - **Categoria de despesa por item** (do Conta Azul): pode escolher uma **categoria padrão** para a nota inteira e, se quiser, uma **categoria diferente item a item**. Itens sem categoria própria usam a padrão.
  - Quando a nota tem **mais de uma categoria**, o sistema faz o **rateio automático** — divide o total da nota entre as categorias, **proporcional ao valor dos itens** de cada uma (o último grupo absorve os centavos para a soma bater exatamente com o total da nota). A conta a pagar fica com categoria "Vários" e guarda o rateio.
  - Para **enviar ao Conta Azul**, toda categoria usada precisa ter o **código da categoria do Conta Azul** — se faltar em alguma, o sistema avisa quais itens/categorias corrigir antes de enviar. Sem enviar ao CA, a categoria pode ficar só no app.
  - **Vincular cada item da nota ao "nosso produto"** com fator de conversão — a busca de "Nosso produto" é **unificada**: encontra tanto os **produtos do catálogo** (sincronizados do Conta Azul, ex.: "Espetinho de frango bacon") quanto os **itens do PCP** (matéria-prima/embalagem). Cada opção mostra a origem ("Produto" ou "Matéria-prima/Embalagem/...") e a unidade. O sistema **lembra o vínculo** nas próximas notas do mesmo fornecedor (de-para automático), apontando para o produto OU para o insumo escolhido.
  - O sistema também **lembra a categoria escolhida por produto do fornecedor**, mesmo que o item não seja vinculado a nenhum produto — na próxima nota do mesmo fornecedor a categoria já vem sugerida
  - Se o insumo ainda não existe, dá para **criar um item PCP na hora** (nome, tipo e unidade) pelo botão "Criar produto novo…" — ele vira um vínculo com o PCP
  - A nota vira **CONFERIDA** e fica ligada à conta criada
- Observação: nesta fase o vínculo de itens ainda **não movimenta o estoque** (entrada automática de estoque é uma fase futura)

---

## Configuração da captura

- **Configurações → Notas Fiscais**: instalar o certificado digital A1 (obrigatório) e ligar/desligar a captura automática
- Sem certificado instalado ou com a captura desligada, o robô simplesmente não consulta (nada quebra)
- Se a SEFAZ bloquear por excesso de consultas (erro 656), o sistema pausa sozinho por 1h15 e mostra até quando

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `Pode_Acessar_Notas_Recebidas` | Ver a caixa de entrada, detalhes e XML |
| `Pode_Baixar_Contas_Pagar` | Gerar conta, ignorar/reativar e "Consultar agora" |
| `configuracoes.edit` | Ligar/desligar a captura e instalar o certificado |
| `admin` | Tudo acima |

---

## Depende de / Interfere em

- **Configurações → Certificado Digital** — sem certificado A1 válido não há captura
- **Contas a Pagar** — a conta gerada aparece lá com origem NF-e (e pode ir ao Conta Azul)
- **Fornecedores** — fornecedores novos são criados automaticamente pelo CNPJ da nota
- **Produtos** e **PCP → Itens** — o de-para liga itens da nota tanto aos produtos do catálogo quanto aos insumos do PCP (base para entrada de estoque no futuro)

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `backend/services/sefazDfeService.js` | Robô de captura na SEFAZ (Distribuição DF-e + manifestação 210210) |
| `backend/routes/notasEntrada.js` | Rotas da API (listar, detalhar, XML, DANFE, gerar conta com categoria por item + rateio, ignorar, consultar agora) |
| `backend/services/danfeHtmlService.js` | Monta o HTML da DANFE simplificada (função pura) a partir do XML da nota |
| `backend/routes/configNotas.js` | Certificado digital + liga/desliga da captura |
| `frontend/src/pages/Financeiro/NotasRecebidas*` | Telas do módulo |
