---
aba: Contas a Pagar
rota: /contas-pagar
permissao: Pode_Acessar_Contas_Pagar
---

# Contas a Pagar

## O que é

Gestão das despesas da empresa (contas a pagar): lançamento manual de contas com parcelas, envio automático para o Conta Azul e **baixa automática** — quando a conta é paga no Conta Azul (por exemplo via DDA/conexão bancária), o app detecta o pagamento sozinho e marca a parcela como paga aqui, sem trabalho manual. Também é possível dar baixa manualmente no próprio app.

---

## O que dá pra fazer aqui

- Ver todas as contas a pagar do mês com KPIs no topo:
  - **Vencidas** (todas as parcelas em aberto já vencidas, independente do mês)
  - **Próximos 7 dias** (o que vence na semana)
  - **Em aberto no mês** e **Pago no mês**
- Filtrar por busca (descrição, nota, fornecedor), status da conta, categoria e mês. **Os filtros ficam salvos**: ao sair da tela e voltar, continuam aplicados (guardados no próprio navegador/dispositivo). Quando há filtro ativo, aparece uma etiqueta **"N filtros ativos"** e os campos filtrados ficam destacados em azul; o botão **"Limpar filtros"** volta tudo ao padrão (mês corrente, sem busca/status/categoria)
- **Clicar em qualquer despesa abre os detalhes completos**: descrição, categoria, observação, status de envio ao Conta Azul, todas as parcelas com o histórico de pagamentos e — quando a conta veio de uma NF-e — os **itens/produtos da nota** (o que foi comprado: descrição, quantidade, unidade, valor unitário e total de cada item), qual produto do estoque cada item alimentou, e as observações da própria nota fiscal. Serve para tirar dúvida do tipo "essa despesa é de quê?" sem sair da tela
- Criar uma conta a pagar: fornecedor, descrição, categoria de despesa (vem do Conta Azul), número da nota, competência, observações e parcelas (valor + vencimento de cada uma)
- **Lançar os produtos da compra junto com a despesa manual (opcional)**: na tela de Nova Despesa (entre as Observações e as Parcelas) há a seção **"Produtos comprados"** — clique em "Lançar os produtos desta compra", busque o produto **do catálogo de produtos** (insumos do PCP não aparecem nessa busca, igual ao de-para das Notas Recebidas) e informe a **quantidade** (na nossa unidade) e o **valor unitário OU o valor total** — preenchendo um, o outro é calculado sozinho. Fornecedor, categoria e produto usam **busca com filtro** (combobox digitável, não lista gigante). Ao criar a despesa, cada produto:
  - dá **entrada no estoque** (motivo COMPRA) — produto que não controla estoque só atualiza o custo;
  - atualiza o **custo** por média ponderada com o estoque anterior (produto → custo manual; insumo PCP → custo unitário das receitas);
  - entra no **histórico de compras** do produto (fornecedor, quantidade, custo).
  É o mesmo efeito da conferência de uma NF-e, mas para compras sem nota capturada (ex.: compra no mercado, pagamento por PIX sem NF-e). Os produtos aparecem depois nos detalhes da despesa ("Produtos da despesa"). **Cancelar a despesa devolve o estoque** (estorna as entradas); o custo não é revertido. Só dá para lançar produtos ao CRIAR a despesa (não na edição).
- Contas também **chegam sozinhas via NF-e** (origem NFE): a aba **Notas Recebidas** captura as notas dos fornecedores na SEFAZ e gera a conta a pagar já com número da nota, chave da NF-e, fornecedor e parcelas das duplicatas (ver manual [notas-recebidas.md](notas-recebidas.md))
- **Importar do Conta Azul** (botão no topo): traz o histórico de despesas que só existe no Conta Azul (salário, combustível, imposto, pedágio, empréstimo...) a partir do **CSV exportado** lá (Financeiro → Contas a pagar → Exportar). Serve para a **DRE e o Fluxo de Caixa** terem os meses passados.
  - Ao subir o arquivo, aparece uma **prévia** (quantas contas, quanto já pago, categorias novas) antes de confirmar.
  - As contas importadas nascem com origem **IMPORTADO_CA** e **não são reenviadas ao Conta Azul** (já existem lá — não duplica).
  - O próprio arquivo diz se cada conta foi **paga ou não** (não precisa consultar o CA de novo para o histórico).
  - **Reimportar o mesmo mês não duplica**: cada conta tem uma chave (vencimento + fornecedor + descrição). Se algo que estava em aberto passou a pago, a reimportação registra a baixa.
  - As **categorias** vistas na importação viram itens na tela **Categorias de Despesa** (para classificar o que entra ou não na DRE).
- **Categoria "Vários" / rateio:** uma conta pode ter **mais de uma categoria** de despesa quando vem de uma NF-e com itens de categorias diferentes. Nesse caso a categoria aparece como **"Vários"** e a conta guarda o **rateio** (quanto do valor foi para cada categoria) — é esse rateio que é enviado ao Conta Azul
- Escolher se a conta **vai para o Conta Azul** (opção "enviar ao CA") ou fica só no app
- Editar uma conta (campos e parcelas ainda não pagas — bloqueado se quitada/cancelada). **Se a conta ainda não foi enviada ao CA:** edição livre (adicionar/remover parcela, mudar valor e vencimento). **Se a conta já foi enviada ao CA (status ENVIADO):** edição restrita — dá para ajustar **vencimento** e **valor** das parcelas **em aberto**, e a mudança é aplicada **também no Conta Azul** automaticamente (não é preciso corrigir na mão lá). Nesse caso **não** é possível adicionar, excluir nem mexer em parcela já paga. Se a parcela já constar paga no Conta Azul, o app avisa e não altera. Enquanto a conta ainda está "Enviando…" (em trânsito para o CA), a edição de parcelas espera o envio terminar
- Dar **baixa manual** numa parcela: valor pago, juros, multa, desconto e forma de pagamento (baixa parcial deixa a parcela como PARCIAL)
- **Quitar várias de uma vez (baixa em lote)**: marque as caixinhas das parcelas em aberto (há um "selecionar todas" no cabeçalho da tabela) e clique em **"Quitar selecionadas"**. Informe **uma vez só** a data, a forma de pagamento e o banco/caixa — todas as marcadas são quitadas pelo **saldo restante** com essa condição. As despesas que já foram enviadas ao Conta Azul recebem a **baixa lá também** (no banco escolhido); as que são só locais ficam quitadas apenas no app. Útil quando um único PIX/dinheiro pagou várias notas (ex.: nota de serviço + nota de peça) — depois é só juntar essas baixas na conciliação bancária do CA.
- **Estornar** um pagamento manual específico (baixas vindas do Conta Azul não podem ser estornadas no app — exclua a baixa no próprio CA)
- Cancelar uma conta (só se não tiver pagamento registrado; estorne antes se precisar). Se a despesa manual tinha **produtos lançados**, o cancelamento **devolve o estoque** automaticamente
- Reenviar ao Conta Azul uma conta cujo envio deu erro (botão de reenvio, só aparece com status de envio ERRO)

---

## Fluxo com o Conta Azul (como funciona por trás)

1. Ao criar a conta com "enviar ao CA", ela entra numa **fila** — um robô envia ao Conta Azul em até 1 minuto.
2. O fornecedor precisa existir no Conta Azul: se ele foi criado no app, o robô cria o fornecedor no CA primeiro e a despesa espera na fila até isso concluir.
3. O Conta Azul processa a despesa de forma **assíncrona** (protocolo): o app acompanha até receber o número do lançamento e vincular cada parcela.
4. A cada 30 minutos o app **confere as baixas no Conta Azul**: parcela paga lá (ex.: DDA, conciliação bancária) vira parcela paga aqui automaticamente, com a marca "baixado via CA".
5. **Reenviar não duplica:** antes de lançar, o robô verifica no Conta Azul se aquela mesma conta já foi criada (por uma referência única gravada no lançamento). Se já existir, ele **adota o lançamento que já está lá** em vez de criar outro — então reenviar uma conta que deu erro não corre o risco de gerar despesa duplicada no CA.

### Status de envio ao CA

| Status | Significado |
|--------|-------------|
| NAO_ENVIAR | Conta só no app, não vai para o CA |
| ENVIAR | Na fila, será enviada em até 1 min |
| ENVIANDO | Envio em andamento |
| AGUARDANDO_PROTOCOLO | CA recebeu, aguardando processamento (assíncrono) |
| ENVIADO | Lançada no CA com parcelas vinculadas |
| ERRO | Falhou — veja a mensagem de erro e use "Reenviar" |

---

## Status das parcelas e da conta

| Status | Significado |
|--------|-------------|
| PENDENTE | Nada pago ainda |
| PARCIAL | Pagamento parcial registrado |
| PAGO | Parcela quitada (manual ou via CA) |
| CANCELADO | Parcela cancelada |

A conta fica ABERTO / PARCIAL / QUITADO / CANCELADO conforme o conjunto das parcelas.

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `Pode_Acessar_Contas_Pagar` | Ver a tela, as contas e os KPIs |
| `Pode_Baixar_Contas_Pagar` | Criar, editar, baixar, estornar, cancelar e reenviar ao CA |
| `admin` | Tudo acima |

---

## Depende de / Interfere em

- **Fornecedores** — toda conta enviada ao CA precisa de um fornecedor cadastrado (e sincronizado com o CA)
- **Conta Azul** — categorias de despesa e conta financeira padrão vêm do CA; sem o CA conectado, as contas só funcionam localmente
- **Notas Recebidas** — a captura automática de NF-e na SEFAZ (com o certificado digital instalado nas Configurações) gera contas a pagar com origem NFE a partir das notas dos fornecedores

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `backend/routes/contasPagar.js` | Rotas da API (listar, criar, editar, baixar, estornar, cancelar, reenviar, **detalhe com itens da nota**, produtos-opcoes) |
| `backend/services/contasPagarCaSyncService.js` | Robôs de envio ao CA e conferência de baixas |
| `backend/services/compraEstoqueService.js` | Entrada de estoque/custo/histórico das compras (nota conferida e despesa manual com produtos) |
| `frontend/src/pages/Financeiro/ContasPagar*` | Telas do módulo |
