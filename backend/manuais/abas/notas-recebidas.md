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
- Abrir o **detalhe da nota**: itens (código do fornecedor, EAN, descrição, quantidade, valores) e duplicatas (vencimentos)
- **Baixar o XML** completo da nota
- **Ignorar** uma nota (e **reativar** depois, se mudar de ideia)
- **Gerar a conta a pagar** a partir da nota:
  - As **parcelas vêm sugeridas pelas duplicatas** da nota (pode ajustar; a soma precisa bater com o total da nota)
  - Escolher a **categoria de despesa** (do Conta Azul) e se a conta **vai para o Conta Azul**
  - **Vincular cada item da nota a um item do PCP** (matéria-prima/embalagem) com fator de conversão — o sistema **lembra o vínculo** nas próximas notas do mesmo fornecedor (de-para automático)
  - Se o insumo ainda não existe no PCP, dá para **criar o item PCP na hora** (nome, tipo e unidade)
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
- **PCP → Itens** — o de-para liga itens da nota aos insumos do PCP (base para entrada de estoque no futuro)

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `backend/services/sefazDfeService.js` | Robô de captura na SEFAZ (Distribuição DF-e + manifestação 210210) |
| `backend/routes/notasEntrada.js` | Rotas da API (listar, detalhar, XML, gerar conta, ignorar, consultar agora) |
| `backend/routes/configNotas.js` | Certificado digital + liga/desliga da captura |
| `frontend/src/pages/Financeiro/NotasRecebidas*` | Telas do módulo |
