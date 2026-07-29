# Notas Fiscais (emissão de NF-e)

**Rota:** `/notas-fiscais` · **Menu:** Financeiro → Notas Fiscais
**Permissões:** `Pode_Acessar_Notas_Fiscais` (ver a tela) · `Pode_Emitir_NF` (emitir/reemitir) · `Pode_Configurar_NF` (reservada para o painel de configuração, em breve)

## O que é

Desde 23/07/2026 a NF-e de venda é emitida **pelo próprio app**, via Focus NFe (a emissão pelo Conta Azul foi descontinuada — o CA bloqueou o acesso). A nota continua sendo autorizada pela SEFAZ normalmente, com a mesma numeração de sempre (série 1, continuando da última nota do CA, 84843 → 84844 em diante), os mesmos impostos (Simples Nacional) e a mesma DANFE.

## A tela (fila de emissão)

- **Cartões no topo:** Sem nota · Processando · Autorizadas · Com erro (contagens do período filtrado).
- **Filtro de período** (pílula "Hoje", com presets) e **filtro de status**: "A emitir" (sem nota + com erro + processando), "Emitidas", "Todas". Os filtros ficam salvos por usuário — a tela reabre do jeito que a pessoa deixou. Padrão: Hoje + A emitir.
- **Lista de pedidos** com cliente (badge CPF/CNPJ), valor e status da nota:
  - **Sem nota** (cinza) — ainda não emitida; botão "Emitir NF-e".
  - **⏳ Processando** (azul) — enviada, aguardando a SEFAZ (segundos); a tela atualiza sozinha a cada 10s; botão "Atualizar" força a consulta.
  - **✓ NF 84xxx** (verde) — autorizada; botões **DANFE** (PDF) e **XML**.
  - **✕ Rejeitada** (vermelho) — a SEFAZ recusou; o motivo aparece embaixo (ex.: cadastro do cliente incompleto). Corrigiu a causa → clicar "Emitir NF-e" de novo (não duplica).
  - **Emitida no CA** (cinza) — nota antiga da era Conta Azul; sem ações aqui (imprime pela tela de Pedidos).

## Como emitir

1. **Uma nota:** botão "Emitir NF-e" na linha do pedido.
2. **Várias:** marcar os **checkboxes** dos pedidos desejados → botão do topo vira "Emitir selecionadas (N)". O checkbox do cabeçalho marca/desmarca todas as elegíveis.
3. **Todas:** sem nada marcado, o botão do topo é "Emitir todas (N)" — emite uma a uma, mostrando o progresso.

Quando a nota é **autorizada**, o pedido correspondente vira **FATURADO** na aba Pedidos automaticamente — e lá o botão DANFE já imprime a nota nova (o mesmo fluxo de impressão de sempre).

## Proteções automáticas (importante)

- **Nunca emite em dobro:** pedido com nota já autorizada (do app ou do CA) é bloqueado. Para pedidos antigos da era CA sem registro local, o app **confere no Conta Azul antes** de emitir.
- **Pedido especial e bonificação não aparecem** na fila (não geram nota).
- Nota rejeitada pode ser reenviada à vontade — a referência única na Focus impede duplicidade.
- Pedido faturado pelo app fica **imune ao sync do Conta Azul** (o status FATURADO não é revertido).
- **Venda para outro estado (interestadual):** o app ajusta a nota sozinho pela UF do cliente — usa **CFOP 6101/6102** e marca a operação como **interestadual** (dentro de SC continua 5101/5102). Para sair certa, o cliente precisa estar cadastrado com a **UF correta** e, se for contribuinte de ICMS, com a **Inscrição Estadual** preenchida. Os impostos do Simples (CSOSN 101 + crédito) e os demais campos são os mesmos da venda interna.

## Erros comuns e o que fazer

- **"Cliente ... sem CPF/CNPJ"** ou **"cadastro incompleto: falta CEP/rua/número..."** → completar o cadastro do cliente (aba Clientes) e emitir de novo.
- **"IE do destinatário não informada"** → cliente PJ contribuinte sem inscrição estadual no cadastro; preencher a IE do cliente (ou rodar o sync do CA que puxa a IE) e reemitir.
- **Nota presa em "Processando"** por mais de alguns minutos → botão "Atualizar"; persistindo, avisar o suporte.

## XMLs para a contabilidade

Botão **"XMLs (contabilidade)"** na barra de filtros da fila: baixa um **ZIP com todos os XMLs do período** filtrado (notas de venda e devolução emitidas pelo app + notas antigas do CA disponíveis), com nomes amigáveis (`nfe-84844-venda-pedido-2269.xml`). Requer período com início e fim (ex.: "Este mês"). Se algum XML não puder ser incluído, vai um `_avisos.txt` dentro do ZIP explicando.

## Notas antigas (era Conta Azul)

Continuam disponíveis: a DANFE sai pela aba Pedidos (botão DANFE) como sempre. Os XMLs estão sendo copiados para dentro do app em segundo plano — impressão não depende mais do CA depois disso.

## NF-e de DEVOLUÇÃO de venda

Na aba **Pedidos → Devoluções**, ao expandir uma devolução de pedido **com nota** (tipo Conta Azul/normal), aparece o bloco verde da NF de devolução:
- Botão **"Emitir NF de devolução"** (permissão `Pode_Emitir_NF`) — o app monta tudo sozinho: itens e valores da devolução registrada, cliente, e a **referência à NF-e original da venda** (exigência da SEFAZ). CFOP 1201 (produção própria) / 1202 (revenda) dentro de SC — ou **2201/2202** quando a devolução é de cliente de outro estado (ajuste automático pela UF), sem pagamento.
- Status igual ao da venda: Processando → ✓ Autorizada (com botão **DANFE**) ou ✕ Rejeitada (motivo + "Emitir novamente").
- **Devolução de pedido ESPECIAL não gera nota** (pedido sem nota) — o botão nem aparece; o fluxo especial segue como sempre.
- Devolução que já teve nota emitida pelo CA (campo "Nota Devolução" preenchido) também não emite de novo.
