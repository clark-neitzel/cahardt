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
- Filtrar por busca (descrição, nota, fornecedor), status da conta, categoria e mês
- Criar uma conta a pagar: fornecedor, descrição, categoria de despesa (vem do Conta Azul), número da nota, competência, observações e parcelas (valor + vencimento de cada uma)
- Contas também **chegam sozinhas via NF-e** (origem NFE): a aba **Notas Recebidas** captura as notas dos fornecedores na SEFAZ e gera a conta a pagar já com número da nota, chave da NF-e, fornecedor e parcelas das duplicatas (ver manual [notas-recebidas.md](notas-recebidas.md))
- Escolher se a conta **vai para o Conta Azul** (opção "enviar ao CA") ou fica só no app
- Editar uma conta (campos e parcelas ainda não pagas — bloqueado se quitada/cancelada; parcelas não podem mais ser alteradas depois que a conta já foi enviada ao CA)
- Dar **baixa manual** numa parcela: valor pago, juros, multa, desconto e forma de pagamento (baixa parcial deixa a parcela como PARCIAL)
- **Estornar** um pagamento manual específico (baixas vindas do Conta Azul não podem ser estornadas no app — exclua a baixa no próprio CA)
- Cancelar uma conta (só se não tiver pagamento registrado; estorne antes se precisar)
- Reenviar ao Conta Azul uma conta cujo envio deu erro (botão de reenvio, só aparece com status de envio ERRO)

---

## Fluxo com o Conta Azul (como funciona por trás)

1. Ao criar a conta com "enviar ao CA", ela entra numa **fila** — um robô envia ao Conta Azul em até 1 minuto.
2. O fornecedor precisa existir no Conta Azul: se ele foi criado no app, o robô cria o fornecedor no CA primeiro e a despesa espera na fila até isso concluir.
3. O Conta Azul processa a despesa de forma **assíncrona** (protocolo): o app acompanha até receber o número do lançamento e vincular cada parcela.
4. A cada 30 minutos o app **confere as baixas no Conta Azul**: parcela paga lá (ex.: DDA, conciliação bancária) vira parcela paga aqui automaticamente, com a marca "baixado via CA".

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
| `backend/routes/contasPagar.js` | Rotas da API (listar, criar, editar, baixar, estornar, cancelar, reenviar) |
| `backend/services/contasPagarCaSyncService.js` | Robôs de envio ao CA e conferência de baixas |
| `frontend/src/pages/Financeiro/ContasPagar*` | Telas do módulo |
