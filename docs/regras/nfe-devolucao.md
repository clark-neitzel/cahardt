# NF-e de devolução — processo protegido

> **Fonte ÚNICA deste assunto** (saiu do `CLAUDE.md` em 24/11/2026 — pedido do dono: regras mais
> simples e rápidas para os agentes). Regra nova entra AQUI, **alterando a regra que já trata do
> tema** — nunca empilhar outra por cima, nem copiar para ficha, habilidade ou memória.

---

## NF-e de DEVOLUÇÃO — emissão AUTOMÁTICA no registro (PROCESSO SENSÍVEL, NÃO QUEBRAR)

> Protegido a pedido do dono em 07/2026. Este fluxo está em produção e funcionando — qualquer
> mudança aqui precisa preservar TODOS os comportamentos abaixo.

**Fluxo em funcionamento:** ao registrar a devolução na conferência do Caixa (`ModalDevolucao.jsx`,
`handleSalvar`), o app **emite a NF-e de devolução automaticamente no mesmo clique** — chama
`POST /api/notas-fiscais/emitir-devolucao/:devolucaoId` logo após criar a devolução (commit `78117fb`).
Não existe mais "Número da Nota" digitado do CA.

- **Se a emissão automática falhar** (SEFAZ fora, cadastro incompleto…), a devolução FICA registrada
  e o toast avisa que dá para emitir depois — o botão **"Emitir NF de devolução"** em
  Pedidos → aba Devoluções (`ListaDevolucoes.jsx`) é o **fallback/reemissão**, não o caminho principal.
- **Travas do backend** (`focusNfeEmissaoService.emitirDevolucao`) que devem permanecer:
  - só devolução `ATIVA` (revertida não emite);
  - devolução de pedido **especial nunca emite** (pedido sem nota de origem);
  - devolução que já tem `notaDevolucaoCA` (nota antiga do CA) não emite de novo;
  - idempotência pela `ref` `nfd-<amb>-<devolucaoId>`: se já está `AUTORIZADO`/`PROCESSANDO`, recusa
    (é o que impede NF em dobro no clique repetido);
  - exige a NF-e **original da venda** como referência;
  - **toda NF de devolução referencia a nota de origem POR ITEM** (`chaveAcesso` + `nItem`, campos
    `chave_acesso_dfe_referenciado` / `numero_item_dfe_referenciado` da Focus — NT 2025.002 v1.51,
    regras VC02-14/VC03-20; obrigatório em produção desde **05/10/2026**). Item devolvido que **não
    casa** com nenhum item da nota original **não emite** — mas a **devolução continua registrada**
    (estoque creditado, cobrança cancelada) e o motivo aparece na aba Devoluções. Interruptor:
    chave `nfe_devolucao_ref_item` em `app_configs` (`auto`/`sempre`/`nunca`) — nunca dentro de
    `focus_nfe_config`, que é reescrito inteiro pela tela de Configurações.
- **Regras ao mexer em devolução/fiscal:**
  1. **Nunca remover** a chamada automática do `ModalDevolucao` nem o botão de fallback da aba Devoluções.
  2. **Nunca** fazer devolução de especial gerar NF.
  3. Erro na NF **não pode desfazer nem bloquear** o registro da devolução (estoque/cobrança já ajustados).
  4. Qualquer alteração nesses arquivos deve ser testada com uma devolução real (ou simulada) antes do push.
