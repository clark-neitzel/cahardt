# Nota de entrega — Etiquetas do funcionário (pasta, aba e armário)

**Data:** 29/10/2026 · **Veredito do gerente de entrega:** LIBERADO COM PENDÊNCIA
(pendência: impressão na Zebra física e no iPad só o dono consegue conferir — roteiro abaixo).

## O que mudou (como usar)

Caminho na tela: **RH → Funcionários → abrir a ficha → aba Dados → card "Contrato e desligamento"**.

1. No card agora ficam juntos: **Admissão, Demissão, Motivo do desligamento, Aviso prévio e Observação**.
   Salvam com o mesmo botão Salvar da ficha. Preencher a demissão NÃO inativa a pessoa sozinho (continua manual).
2. No mesmo card há **três botões de etiqueta**:
   - **Etiqueta da pasta (100×120)** — para o saco/pasta de documentos de quem saiu: nome grande, cargo, CPF,
     admissão e demissão lado a lado, tempo de casa, motivo e aviso prévio. Se faltar demissão ou motivo, avisa, mas imprime.
   - **Etiqueta da aba (40×25)** — para a aba da pasta suspensa: nome em cima e o mesmo nome de cabeça para baixo
     embaixo, com linha tracejada no meio. Dobra, cola com cola, enfia no plástico da aba: lê certo dos dois lados.
   - **Etiqueta do armário** — só o nome, no centro, uma face. Serve para qualquer funcionário, ativo ou não. No modal há dois chips: **Pequena 40×25** (padrão, Zebra pequena) e **Grande 100×120** (Zebra grande); o app lembra a última escolha.
3. Cada botão abre a **prévia em tamanho real**, com controle de **Cópias**, e dois jeitos de imprimir:
   **Imprimir na Zebra** (vai para a fila da impressora, 100×120 ou 40×25) ou **Imprimir pelo navegador**
   (na própria tela, sem abrir aba nova — funciona no iPad).
4. Na lista de funcionários, quem tem demissão mostra **"Saiu em dd/mm/aaaa"**.
5. Na fila de impressão (Configurações → Impressoras) o tipo aparece como **"Etiqueta de funcionário"**.

Quem usa: vê o card e imprime quem tem permissão **Ver Ponto** ou **Editar Ponto** (ou admin);
salvar os campos exige **Editar Ponto** (ou admin). Quem só vê recebe aviso claro ao tentar salvar.

## O que foi testado (e por quem)

- **Dev:** build do frontend OK; 105/105 testes do backend; schema Prisma válido (só 3 colunas novas, opcionais — nada removido).
- **QA (2 rodadas, clicando no app local, desktop e celular 375px):** card salva e recarrega; os 3 modais abrem;
  bitmaps gerados para a Zebra conferidos pixel a pixel — a parte de baixo da aba está **girada 180° de verdade**
  (na 1ª rodada saía espelhada; foi refeito e provado); nome de 76 letras cabe inteiro; alvos de toque com 44px;
  2 cópias geram 1 bitmap + sequência repetida; regressão nas etiquetas do PCP, lista e fila de impressão OK.
- **Revisor de código:** aprovado; ressalvas menores sem impacto no uso (classe de altura no seletor, observação sem limite no servidor).
- **Gerente de entrega (esta nota):** rodou o build (2714 módulos, sem erro) e os testes de novo; olhou os 3 bitmaps;
  conferiu que a permissão do frontend é igual à do backend; nenhum segredo e nenhum arquivo de `backend/uploads` entra no commit;
  `window.open` zero nos arquivos novos; página de novidade sem `og:image` e sem botão "Abrir o app"; manual do Clippy atualizado.

## O que o dono precisa conferir (roteiro de ~10 min, depois de publicar)

Na **Zebra** (com o agente de impressão ligado):
1. RH → Funcionários → abrir a ficha de alguém que já saiu → aba Dados → card "Contrato e desligamento".
2. Clicar **Etiqueta da pasta** → Imprimir na Zebra. Conferir: nome, cargo, CPF, datas, motivo e aviso prévio legíveis, nada cortado.
3. Clicar **Etiqueta da aba** → 1 cópia → Imprimir na Zebra. **Dobrar na linha tracejada, colar e enfiar no plástico da aba**
   da pasta suspensa: o nome tem que ler certo dos dois lados (não espelhado).
4. Clicar **Etiqueta do armário** → (padrão **Pequena 40×25**) → Imprimir na Zebra pequena. Só o nome, uma face, sem dobra. Se quiser, trocar o chip para **Grande 100×120** e imprimir na Zebra grande.

No **iPad** (app instalado na tela inicial):
5. Mesmo caminho → **Imprimir pelo navegador** na etiqueta da pasta. O app não pode abrir aba nova nem sair em branco.
   Na tela de impressão do iPad, escolher o papel **120×100 paisagem** (as grandes) — as pequenas (aba e armário) usam 84×25. ("84×25" é só o papel de 2 colunas no navegador: duas etiquetas de 40 mm lado a lado; a etiqueta em si continua 40×25.)

## Pendências e o que ficou de fora

- **Não testado em aparelho real:** Zebra física (agente estava offline no teste) e iPad/Safari real — só o dono consegue.
- **Produção:** as 3 colunas novas entram sozinhas no deploy (`db push`, só adição). Conferir depois que o card abre e salva.
- Kit Festa e Delivery não foram clicados nesta entrega (não foram alterados; a regressão clicada foi PCP, lista e fila).
- Ressalvas do revisor, sem impacto para o usuário: observação de desligamento sem limite de tamanho no servidor;
  nome muito longo diminui a letra e, no limite, a prévia avisa que vai cortar.

## Texto para o grupo do WhatsApp

🗂️ *Novidade no RH: etiquetas da pasta do funcionário*

Agora na *ficha do funcionário* (aba Dados → bloco *Contrato e desligamento*) dá para registrar *demissão, motivo e aviso prévio* e imprimir direto:
📄 *Etiqueta da pasta* (100×120) — saco de documentos de quem saiu
🏷️ *Etiqueta da aba* (40×25) — dobra no meio e vai no plástico da pasta suspensa
🔒 *Etiqueta do armário* — só o nome (40×25 ou 100×120)

Imprime na Zebra ou pelo navegador (funciona no iPad). Veja como usar:
https://cahardt-github.xrqvlq.easypanel.host/novidade-etiqueta-pasta-funcionario.html
