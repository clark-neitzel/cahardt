---
aba: Notas Recebidas
rota: /notas-recebidas
permissao: Pode_Acessar_Notas_Recebidas
---

# Notas Recebidas

## O que é

Caixa de entrada das **notas fiscais que os fornecedores emitem contra o CNPJ da empresa** — tanto **NF-e (mercadorias)** quanto **NFS-e (serviços tomados**: contador, manutenção, fretes de serviço etc.**)**. O sistema busca essas notas **automaticamente a cada 1 hora** (usando o certificado digital A1 instalado nas Configurações) — sem precisar digitar nada:

- **NF-e** → consultada na **SEFAZ** (Distribuição DF-e)
- **NFS-e** → consultada no **Ambiente de Dados Nacional da NFS-e** (nfse.gov.br), com o mesmo certificado

De cada nota dá para gerar a **conta a pagar** com um clique, já com as parcelas sugeridas pelas duplicatas da própria nota (NF-e) ou com a data de emissão (NFS-e, que não tem duplicata).

---

## Como a captura funciona (por trás)

### NF-e (mercadorias — SEFAZ)
1. A cada hora, um robô consulta a SEFAZ perguntando "tem nota nova emitida contra o nosso CNPJ?".
2. A SEFAZ primeiro devolve um **resumo** da nota (fornecedor, valor, data) → a nota aparece com status **AGUARDANDO XML**.
3. O sistema então registra automaticamente a **Ciência da Operação** (manifestação do destinatário) — é isso que libera o XML completo.
4. Na consulta seguinte vem o **XML completo** (itens, quantidades, duplicatas) → a nota vira **NOVA** e está pronta para conferência.
5. Se o fornecedor **cancelar** a nota depois, ela muda sozinha para **CANCELADA PELO EMITENTE**.
6. Fornecedor que ainda não existe no app é **criado automaticamente** pelo CNPJ da nota (origem NFE, sem enviar ao Conta Azul).

> A manifestação de "Ciência da Operação" é neutra: só diz à SEFAZ "estou sabendo da nota". Não é aceite comercial.

### NFS-e (serviços tomados — Ambiente Nacional)
1. A cada hora (defasado da NF-e), o robô consulta o ambiente nacional da NFS-e com o mesmo certificado A1, buscando notas de serviço onde somos o **tomador**.
2. A NFS-e chega **completa de uma vez** (não tem etapa de resumo nem manifestação) → já entra como **NOVA**.
3. O valor da nota é o **valor líquido** (serviço − retenções); quando há retenção, o detalhamento aparece nas observações da nota.
4. Cancelamento da NFS-e pelo prestador → **CANCELADA PELO EMITENTE** (igual à NF-e).
5. Prestador novo é criado automaticamente como fornecedor (origem NFSE).

> **Importante:** só chegam NFS-e de **municípios já integrados ao sistema nacional** (nfse.gov.br). Prefeituras com sistema próprio não compartilhado não aparecem aqui.

---

## Status das notas

| Status | Significado |
|--------|-------------|
| AGUARDANDO_XML | (só NF-e) Só o resumo chegou; o XML completo vem na próxima consulta (após a ciência) |
| NOVA | XML completo baixado — pronta para conferir e gerar a conta a pagar (NFS-e já nasce NOVA) |
| CONFERIDA | Já virou conta a pagar (fica vinculada à conta) |
| IGNORADA | Marcada para ignorar (ex.: nota que não gera conta) — dá para reativar |
| CANCELADA_EMITENTE | O fornecedor/prestador cancelou a nota |

---

## O que dá pra fazer aqui

- Ver todas as notas capturadas (NF-e e NFS-e, com etiqueta do tipo) com fornecedor, número, emissão, valor e status
- Ver o **status da captura**: NF-e (ligada/desligada, última consulta à SEFAZ) e NFS-e (última consulta ao ambiente nacional), além de quantas notas novas aguardam conferência
- **Consultar agora**: dispara uma busca imediata (SEFAZ **e** ambiente nacional) sem esperar a próxima hora
- Abrir o **detalhe da nota**: itens (código do fornecedor, EAN, descrição, quantidade, valores), **informações adicionais de cada item** (infAdProd — lote, validade etc.), duplicatas (vencimentos) e as **observações da nota**. Na NFS-e o detalhe mostra a **discriminação do serviço** e o valor
- **Baixar o XML** completo da nota
- **Imprimir a DANFE** (NF-e: visão em folha com emitente, chave, itens com NCM/CFOP, totais, duplicatas) ou o **DANFSE** (NFS-e: espelho com prestador, tomador, discriminação do serviço, valores e retenções) — impressos na própria página, funciona no iPad/PWA
- **Ignorar** uma nota (e **reativar** depois, se mudar de ideia)
- **Gerar a conta a pagar** a partir da nota:
  - As **parcelas vêm sugeridas pelas duplicatas** da nota (pode ajustar; a soma precisa bater com o total da nota). Quando a nota **não tem boleto/duplicata no XML** (compra à vista e toda NFS-e), a parcela já vem com a **data de emissão da nota** (não a data de hoje), para a despesa aparecer no Conta Azul com a data certa.
  - **Condição de pagamento (forma + banco) — obrigatória ao enviar ao Conta Azul.** Ao marcar "Enviar para a Conta Azul", você escolhe a **forma de pagamento** (Pix, dinheiro, boleto, cartão etc.) e o **banco/caixa** (lista vinda do próprio Conta Azul; o banco padrão já vem pré-selecionado). Essa condição vai junto com a despesa para o CA (forma e conta de cada parcela).
  - **"Ainda vou pagar" ou "Já paguei"**:
    - **Ainda vou pagar** — a despesa entra **em aberto** no Conta Azul, já com a forma/banco definidos, para pagar depois via DDA/boleto.
    - **Já paguei** — para compras à vista (PIX, dinheiro, transferência etc.). Além da forma/banco, você informa **a data do pagamento** (vem preenchida com a emissão da nota). A despesa entra **já quitada** no Conta Azul (o app cria e **dá a baixa automaticamente**), só para **conciliar com o extrato**.
  - **Conciliação (não duplica)**: se você **já tinha lançado essa mesma nota manualmente** no Conta Azul (inclusive como "Compra de produto"), ao gerar a conta o sistema **procura pelo número da nota + valor** e, se encontrar, **vincula à despesa que já existe** lá em vez de criar outra. **Não depende do cadastro do fornecedor** — funciona mesmo que a Conta Azul tenha o fornecedor com nome/CNPJ duplicado ou desatualizado.
  - **Categoria de despesa por item** (do Conta Azul): pode escolher uma **categoria padrão** para a nota inteira e, se quiser, uma **categoria diferente item a item**. Itens sem categoria própria usam a padrão.
  - Quando a nota tem **mais de uma categoria**, o sistema faz o **rateio automático** — divide o total da nota entre as categorias, **proporcional ao valor dos itens** de cada uma (o último grupo absorve os centavos para a soma bater exatamente com o total da nota). A conta a pagar fica com categoria "Vários" e guarda o rateio.
  - Para **enviar ao Conta Azul**, toda categoria usada precisa ter o **código da categoria do Conta Azul** — se faltar em alguma, o sistema avisa quais itens/categorias corrigir antes de enviar. Sem enviar ao CA, a categoria pode ficar só no app.
  - **(Só NF-e) Vincular cada item da nota ao "nosso produto"** com fator de conversão — a busca de "Nosso produto" procura no **catálogo de Produtos** (sincronizado do Conta Azul). O sistema **lembra o vínculo** nas próximas notas do mesmo fornecedor (de-para automático por fornecedor + código do produto na nota, e código de barras quando houver).
  - O sistema também **lembra a categoria escolhida por produto do fornecedor** (e por prestador, na NFS-e), mesmo sem vínculo de produto — na próxima nota do mesmo fornecedor a categoria já vem sugerida
  - Se o insumo ainda não existe, dá para **criar um item PCP na hora** (nome, tipo e unidade) pelo botão "Criar produto novo…"
  - **NFS-e tem conferência simplificada**: serviço não vira estoque, então não há vínculo de produto nem conversão — é só conferir a categoria, as parcelas e enviar ao Conta Azul.
  - A nota vira **CONFERIDA** e fica ligada à conta criada
  - **O XML é salvo automaticamente no Google Drive da Contabilidade** (ver seção abaixo)
- **Cancelar entrada e refazer** (nota CONFERIDA): cancela a conta a pagar gerada e devolve a nota para conferência (se a despesa já chegou ao Conta Azul, o app avisa para excluí-la lá manualmente; com baixa registrada, é preciso estornar antes)
- **(Fase 6) Item vinculado movimenta o estoque e o custo**: ao gerar a conta, cada item com vínculo dá **ENTRADA automática no estoque** (do Produto do catálogo ou do insumo PCP, já na quantidade convertida) e o **custo é atualizado por média ponderada** com o estoque anterior (Produto → custo manual; insumo → custo unitário usado nas receitas). A compra também entra no **histórico de compras** do produto (fornecedor, nota, quantidade, custo). Item sem vínculo continua gerando só a despesa.
- **Cancelar entrada e refazer** também **estorna o estoque** (saída na mesma quantidade); o custo não é revertido — ajuste manualmente se preciso

---

## Salvamento automático do XML na Contabilidade (Google Drive)

Ao **dar entrada** numa nota (gerar a conta a pagar) ou ao **ignorá-la**, o sistema **salva o XML sozinho no Google Drive**, na pasta da contabilidade organizada por mês — sem precisar baixar e arrastar nada. Vale para **NF-e e NFS-e**.

**Como organiza (pela data de EMISSÃO da nota):**

```
Envio Contabilidade
  └── "Julho 2026"            ← pasta do mês (criada sozinha se ainda não existir)
        └── "XML de Julho"     ← subpasta de XML (reaproveita a existente ou cria)
              ├── {chave} - Nota {número} - {Fornecedor}.xml   ← nota dada entrada
              └── Ignoradas/    ← XML das notas ignoradas
```

- **Nome do arquivo:** chave de acesso + número da nota + nome do fornecedor.
- **Nota ignorada** → o XML vai para a subpasta **"Ignoradas"** dentro da pasta de XML do mês.
- **Não duplica:** se o mesmo XML já estiver lá, o sistema não sobe de novo.
- **Nunca trava a operação:** se o Drive estiver fora do ar ou a nota não tiver XML, a entrada acontece normalmente e o problema fica só no log (`[GoogleDrive] ...`).
- Os arquivos ficam **na conta Google do dono** (autorização OAuth feita uma vez), no Drive dele.

**Configuração:** as credenciais do Google ficam em `app_configs` (chave `gdrive_config`: `ativo`, `clientId`, `clientSecret`, `refreshToken`, `envioContabilidadeId`). Para desligar temporariamente, basta `ativo: false`.

---

## Configuração da captura

- **Configurações → Notas Fiscais**: instalar o certificado digital A1 (obrigatório) e ligar/desligar **separadamente** a captura de **NF-e (SEFAZ)** e a de **NFS-e (Ambiente Nacional)** — as duas usam o mesmo certificado
- Sem certificado instalado ou com a captura desligada, o robô simplesmente não consulta (nada quebra)
- Se a SEFAZ bloquear por excesso de consultas (erro 656) ou o ambiente nacional pedir pausa (HTTP 429), o sistema pausa sozinho por 1h15 e mostra até quando

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `Pode_Acessar_Notas_Recebidas` | Ver a caixa de entrada, detalhes e XML |
| `Pode_Baixar_Contas_Pagar` | Gerar conta, ignorar/reativar, cancelar entrada e "Consultar agora" |
| `configuracoes.edit` | Ligar/desligar as capturas e instalar o certificado |
| `admin` | Tudo acima |

---

## Depende de / Interfere em

- **Configurações → Certificado Digital** — sem certificado A1 válido não há captura (nem NF-e nem NFS-e)
- **Contas a Pagar** — a conta gerada aparece lá com origem NF-e/NFS-e (e pode ir ao Conta Azul)
- **Fornecedores** — fornecedores/prestadores novos são criados automaticamente pelo CNPJ da nota
- **Produtos** e **PCP → Itens** — o de-para liga itens da NF-e aos produtos do catálogo ou a itens PCP criados na hora (base para entrada de estoque no futuro)

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `backend/services/sefazDfeService.js` | Robô de captura de NF-e na SEFAZ (Distribuição DF-e + manifestação 210210) |
| `backend/services/nfseAdnService.js` | Robô de captura de NFS-e no Ambiente de Dados Nacional (ADN) + espelho DANFSE |
| `backend/routes/notasEntrada.js` | Rotas da API (listar, detalhar, XML, DANFE/DANFSE, gerar conta com categoria por item + rateio, ignorar, consultar agora) — dispara o salvamento do XML no Drive ao dar entrada/ignorar |
| `backend/services/googleDriveService.js` | Salva o XML da nota no Google Drive da Contabilidade (pasta do mês por emissão; subpasta "Ignoradas"); credenciais OAuth em `app_configs.gdrive_config` |
| `backend/services/danfeHtmlService.js` | Monta o HTML da DANFE simplificada (função pura) a partir do XML da NF-e |
| `backend/routes/configNotas.js` | Certificado digital + liga/desliga das capturas (NF-e e NFS-e) |
| `frontend/src/pages/Financeiro/NotasRecebidas*` | Telas do módulo |
