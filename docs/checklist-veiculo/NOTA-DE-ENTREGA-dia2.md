# Checklist de veículo, Dia 2, Partes B e C: o motorista vê a própria foto e o escritório é avisado

**Data:** 21/10/2026 · **Veredito do gerente de entrega:** LIBERADO PARA COMMIT/DEPLOY COM PENDÊNCIA (ver "Ressalva de texto antes do commit", "O que o dono precisa fazer" e "Prova em produção")

Esta é a segunda e última fatia do Dia 2. A Parte A (frases de pátio, perguntas Sim/Não, fim do alarme falso) está no ar desde hoje às 11:26. Este pacote entrega o resto: visualizador de fotos, blocos e desenhos, KM lido do painel, "Tá certo assim", foto extra, aviso por WhatsApp, selo no Caixa, Veículos em duas colunas, 4 campos novos no cadastro do veículo e o card de Configurações com a chave de emergência.

---

## O que muda para o motorista

1. **Tocar na foto mostra a foto.** Antes, tocar num quadrinho com foto reabria a câmera e o motorista nunca via o que tinha mandado. Agora abre a foto em tela cheia, com o que a IA viu e o que fazer, em frase curta. Dá para arrastar para a próxima foto, ampliar com dois dedos, e o botão **Tirar de novo** abre a câmera no mesmo toque.
2. **Fotos em blocos, na ordem certa:** 1 · Por fora (capô fechado) · 2 · Painel · 3 · Capô aberto (água e óleo) · 4 · Baú/porta-malas. Se ele tentar abrir o capô antes de tirar as fotos de fora, o app avisa ("Faltam fotos de fora. Tire antes de abrir o capô") mas deixa seguir.
3. **Desenho de como tirar** na tela "Tire assim": posição, distância ("2 passos, uns 3 m") e o que precisa aparecer no quadro. Não depende de foto modelo cadastrada.
4. **KM lido do painel.** Quando a IA lê o KM na foto do painel, aparece "Painel marca 272.767 km. Confirma?" com os botões **Confirma** e **Corrigir**. Não precisa mais digitar. Se o KM lido for menor que o último registrado, o app pede para digitar. Fica gravado se o KM veio do painel confirmado ou foi digitado.
5. **"Tá certo assim, deixa".** Se a IA marcou atenção ou pediu para refazer e o motorista discorda, ele toca nesse botão e segue. Vale só no modo teste, **nunca** para problema grave (reprovação). Fica registrado como "discordância" (foto e hora) e o escritório vê isso na ficha do veículo; o parecer original da IA não é apagado (serve para calibrar).
6. **Foto extra opcional** na água do radiador ("foto de cima, com a tampa aberta") e na vareta ("ponta da vareta, bem de perto"). Nunca trava: tem o botão "Depois". Essa foto não passa pela IA e aparece na ficha como "Foto extra".

## O que muda para o escritório

7. **Aviso por WhatsApp na hora** (só equipe interna, nunca cliente): quando um motorista **segue mesmo assim com checklist reprovado** ou **responde "Não"** a uma pergunta da IA, quem estiver configurado recebe uma mensagem com motorista, placa, o problema e onde ver as fotos.
8. **Resumos às 7h e 13h** (horários configuráveis, até 4): quantos saíram, quem teve problema, quem iniciou o dia Presencial com veículo **sem checklist por foto**, quem está "montando agora" e quantas discordâncias. Domingo sem movimento não manda. Se o bot estiver fora, a mensagem fica na fila e sai depois. Se um horário passar com o servidor parado, aquele resumo sai na próxima rodada **só dentro de 3 horas** do horário; depois disso não sai mais naquele dia.
9. **Caixa:** o card "Diário do Dia" mostra o selo do checklist (Checklist ok · Atenção · Reprovado · "Reprovado · seguiu" · Montando agora · Sem checklist). Clicar no card abre a ficha do veículo já na aba **Checklists**, com o checklist do dia destacado. Quem tem permissão do Caixa passa a ver essa aba (antes só quem tinha acesso a Veículos). O fechamento do caixa **não foi tocado**; se o dado do checklist falhar, o Caixa abre normal, só sem o selo.
10. **Veículos no computador** (tela a partir de 1024 px): lista à esquerda, ficha à direita, sem painel por cima. Busca por placa/modelo, filtro de tipo e "só ativos" (a tela lembra a escolha), coluna **Hoje** com o selo do checklist de cada veículo. No celular e no iPad em pé continua como antes.
11. **Ficha do veículo, aba Checklists:** além dos concluídos, mostra o checklist **em andamento de hoje** (para quem recebe o aviso conseguir ver as fotos antes do motorista iniciar o dia), o número de discordâncias, "Respondeu: Sim/Não" e a origem do KM. As miniaturas abrem em tela cheia com setas do teclado, roda do mouse e Esc. A galeria de fotos modelo também abre em tela cheia.
12. **Cadastro do veículo ganhou 4 campos** (Editar, na aba Resumo, seção "Para a conferência por foto"): tipo de vareta (plástico quadriculada / metal com marcas), reservatório de água opaco (liga/desliga), "o que é normal ter dentro" e "avarias conhecidas" (até 500 caracteres cada). A IA usa isso: lê a vareta pelo tipo certo, no reservatório opaco pergunta em vez de pedir outra foto, não reclama do que é normal no baú e não aponta de novo avaria já conhecida.
13. **Configurações → card "Checklist de veículos"** (só administrador): chave de emergência (Modo teste / Desligar, volta às 6 caixinhas na hora, sem publicar), quem recebe o aviso na hora, quem recebe os resumos, horários, e o botão **"Enviar mensagem de teste para mim"**.

---

## O que foi provado (e por quem)

**QA clicando na tela** (celular 375 px e computador 1440 px, app local + navegador automatizado), 15 critérios na rodada completa e 8 no reteste curto, todos com captura em `evidencias-qa-dia2/` (62 imagens). Conferi por amostragem: visualizador com "Tudo certo nesta foto" e "Tirar de novo" (`m1-viewer-frente`), pergunta da vareta com foto extra opcional e botão "Depois" (`m2-vareta`), grade em blocos com selos ok/aceita/problema/pergunta e "+ foto extra" (`m6-confirmado`, `r7-painel-refeito`), aviso ao abrir o capô antes das fotos de fora (`m5-aviso-capo`), desenho na tela "Tire assim" (`m10-tireassim-modelo`), resposta "Sim" gravada e foto extra visível no visualizador (`m3-sim`), Caixa com selo "Reprovado · seguiu" e ficha abrindo na aba Checklists com discordâncias e "Respondeu: Não/Sim" (`c1-caixa`, `c2-ficha-selo`), zoom/tela cheia no escritório (`g2-zoom`), Veículos em duas colunas com coluna Hoje e os 4 campos novos em edição (`v3-edit`), card de Configurações com chave, destinatários, horários e teste enviado (`k2-desk`, `k3-teste`), perfil restrito barrado ("Acesso Negado", `k1-desk-QA-CHK-MOT`), chave desligada devolvendo as 6 caixinhas (`m12-desligado`), aba Checklists no celular (`g4-mob-checklists`), página de novidade (`n1-desk`, `n1-mob`).

**Revisor de código:** backend 2 rodadas e frontend 2 rodadas, as últimas aprovadas (achados corrigidos: retentativa do resumo em ERRO, fotos principais antes das extras, códigos de erro, texto do cadastro entre aspas no prompt da IA).

**Gerente de entrega (esta nota):**
- `node --check` nos 14 arquivos de backend: OK.
- `npx prisma validate`: OK. O schema já está em HEAD (foi no commit fb455027 da outra sessão): só campos novos, nenhum removido, todos opcionais ou com padrão.
- Build do frontend numa cópia limpa com **só** o HEAD atual (fb455027) + os 18 arquivos deste pacote: **passou** ("built in 6.25s"). Antes disso o mesmo build passou sobre o HEAD anterior. Prova de que o commit compila sozinho.
- Smoke de carga do backend na mesma cópia limpa: todas as rotas e serviços novos carregam (`require`) sem módulo faltando; o `aiProvider` novo em HEAD continua exportando `isConfigured` e `analisarImagem`, que são o que o checklist usa.
- Nenhum arquivo do pacote importa nada de "Como Fazer"/IA-POP; `App.jsx` não é tocado (não há rota nova).
- Upload: as fotos (inclusive a extra) continuam em `backend/uploads/checklists-veiculo` (`../uploads` a partir de `services/`). Nenhuma transação (`$transaction`) nova. Nenhum segredo no diff nem nos documentos.
- WhatsApp: toda mensagem sai com `tipo: 'interno'`, `origem: 'checklist-veiculo'` e referência única por evento e destinatário (repetir a decisão não duplica: o bot devolve "duplicado"); texto cortado em 1.990 caracteres; destinatários só da tabela de usuários do sistema (nunca cliente); o teste manual usa referência nova a cada clique. Envio sempre fora do request do motorista (`setImmediate`) e fora de transação.
- Permissão front = back: card de Configurações e rotas `/config/avisos` só admin; aba Checklists da ficha e `GET /veiculos/:id/checklists` liberados para admin, Pode_Acessar_Veiculos, Pode_Acessar_Caixa e Pode_Editar_Caixa; lista "checklists de hoje" só admin ou Pode_Acessar_Veiculos; "Tá certo assim" só o dono do checklist, só modo TESTE, nunca REPROVA (o app só mostra o botão em modo teste).
- Manuais `veiculos.md`, `caixa.md` e `config-gerais.md` atualizados e coerentes com o código (regras de aviso, janela de 3 h, padrão de destinatários, foto extra, "tá certo assim"). Ver ressalva abaixo.
- Novidade `novidade-checklist-foto-v2.html`: sem `og:image`, 5 accordions já abertos, sem botão "Abrir o app", 7 telas em mock com 50 legendas; cobre as 8 mudanças e o essencial da Parte A. Entrada `checklist-foto-v2` no topo do `novidades.json` (já em HEAD).
- Marcador de deploy: `checklist-dia2-2026-10-22` (`/api/admin-exec/ping`); HEAD hoje está em `ia-pop-fase1-2026-10-21`.

---

## Ressalva de texto antes do commit (manual, sem código)

O manual `backend/manuais/abas/veiculos.md` descreve as regras novas (foto extra, "tá certo assim", KM, avisos, 4 campos), mas **não** diz como o motorista vê a foto nem que a tela de Veículos virou duas colunas. Como o Clippy responde pelo manual, acrescentar na seção "Dia 2: o que mudou para o motorista":

> - **Tocar num quadrinho com foto abre a foto em tela cheia** com o parecer da IA e o que fazer; arrastar para o lado troca de foto, dois dedos ampliam, e o botão "Tirar de novo" abre a câmera no mesmo toque. Quadrinho vazio abre a tela "Tire assim", que agora mostra um **desenho** da posição e distância (vale mesmo sem foto modelo).
> - Os quadrinhos ficam em **blocos na ordem certa**: por fora (capô fechado), painel, capô aberto (água e óleo) e baú/porta-malas. Ao passar para o capô sem as fotos de fora, o app avisa, mas deixa seguir.
> - **KM do painel**: quando a IA lê o KM, o app mostra "Painel marca X km. Confirma?" com Confirma/Corrigir, em vez de pedir para digitar.

E em "Dia 2: o que mudou para o escritório":

> - **Veículos no computador (tela a partir de 1024 px)**: lista à esquerda e ficha à direita, sem painel por cima, com busca por placa/modelo, filtro de tipo, "só ativos" e a coluna **Hoje** com o selo do checklist. No celular e iPad em pé continua com cartões e painel lateral. As miniaturas de checklist e as fotos modelo abrem em tela cheia (setas do teclado, roda do mouse para ampliar, Esc fecha).

Ajuste de texto; não precisa de build nem de novo QA.

---

## O que o dono precisa fazer (depois do deploy)

1. **Conferir quem recebe os avisos** em Configurações → card "Checklist de veículos". Enquanto ninguém for escolhido, o sistema manda para **todos os administradores ativos com telefone cadastrado**. Marque quem deve receber na hora (você e a expedição) e quem recebe os resumos, confira os horários (padrão 07:00 e 13:00) e clique em **"Enviar mensagem de teste para mim"**: a mensagem tem que chegar no seu WhatsApp. Quem aparece em "Sem telefone no cadastro" não recebe até ter o número em Usuários.
2. **Preencher os 4 campos de cada veículo** (Veículos → veículo → Editar, seção "Para a conferência por foto"): tipo de vareta (Uno e Bongo têm varetas diferentes), reservatório opaco (o Uno), o que é normal ter dentro (ex.: "bolsas pretas do mostruário, caixa térmica azul") e avarias conhecidas. Sem isso a IA continua funcionando, só sem esse contexto.
3. **Testar no celular de verdade** (o QA só consegue simular no navegador): abrir uma foto e ampliar com dois dedos, arrastar para a próxima, e tocar em "Tirar de novo" dentro do visualizador: a câmera tem que abrir no mesmo toque. Se no iPhone a câmera não abrir ou abrir a galeria, avise.
4. **Amanhã cedo, na saída:** ver se chega o aviso na hora quando alguém seguir reprovado ou responder "Não", e se o resumo das 7h chega. Se não chegar, me mande a hora e eu olho a fila do bot (`bot_whatsapp_envios`) e o marcador do resumo em `app_configs`.

---

## O que ficou pendente ou de fora

- **Dia 3 (não começou):** checklist de **volta** com foto, **liberação pelo escritório** quando a trava estiver ligada, **cupom** de combustível na despesa, comparação automática com a foto modelo e a **trava** de verdade (hoje tudo é modo teste: ninguém fica travado).
- **Só em aparelho real:** pinça/toque duplo no zoom, câmera no "Tirar de novo" no iOS, foto extra no iPhone.
- **Só em produção:** mensagens de WhatsApp reais (na hora e resumos 7h/13h), persistência da foto extra atravessando um deploy (gravar → publicar → abrir).
- **Ressalvas baixas que ficaram (declaradas pelo QA):** se a consulta do último KM falhar (erro 500), a tela ainda mostra "Confirma?" (comportamento anterior); a origem do KM só é regravada no envio final; repetir a mesma decisão gera 2 linhas na fila local do bot (em produção o bot devolve "duplicado", não manda duas vezes); `GET /veiculos/admin/todos` responde 200 para perfil restrito (já era assim; a tela está barrada).
- **Janela de Clippy sem página:** a outra sessão (IA-POP) já publicou o `novidades.json` com a nossa entrada no topo, mas a página `novidade-checklist-foto-v2.html` só sobe com este deploy. Até lá, quem clicar no Clippy vê 404. Por isso este pacote deve ser publicado **logo em seguida**.
- A página de novidade não repete dois detalhes da Parte A (KM com tolerância de 30 km e no máximo 2 "tira de novo" por foto); eles já foram avisados no grupo hoje de manhã.

---

## Prova em produção

Preenchida pelo gerente de projeto após o deploy.

- [ ] Backend: `GET /api/admin-exec/ping` devolve `deployMarker: checklist-dia2-2026-10-22`.
- [ ] Backend: `GET /api/checklists-veiculo/config/avisos` responde 401 sem token (existe; antes daria 404 ou cairia em `/:id`).
- [ ] Frontend: `https://cahardt-github.xrqvlq.easypanel.host/novidade-checklist-foto-v2.html` abre (200), e o chunk de produção contém "Tá certo assim, deixa".
- [ ] Logs do servidor: "Iniciando Worker dos resumos do checklist de veículos" na subida.
- [ ] Mensagem de teste chegou no WhatsApp do dono (botão em Configurações).
- [ ] Foto extra: gravar numa vareta → novo deploy/restart → a foto extra continua abrindo na ficha.
- [ ] Resumo das 7h de 22/10 chegou (e `app_configs` tem `checklist_avisos_resumo_2026-10-22_0700` com `estado: OK`).

---

## Texto para o grupo do WhatsApp

```
*Checklist do veículo: agora dá pra VER a foto* 📸🚚

Novidades a partir do próximo checklist:

👉 *Toque na foto* e ela abre grande, com o que o app viu e o que fazer. Dá pra arrastar pra próxima e ampliar com dois dedos.
👉 *Tirar de novo* abre a câmera ali mesmo.
👉 As fotos ficaram em *blocos na ordem*: por fora → painel → capô aberto → baú. E a tela "Tire assim" mostra um *desenho* de como tirar.
👉 *KM do painel*: o app lê e você só confirma.
👉 Discorda do aviso? Toque em *"Tá certo assim, deixa"* e siga (não vale pra problema grave).
👉 Água e óleo: dá pra mandar uma *foto extra* (opcional, não trava).

Escritório: o Caixa mostra o selo do checklist, Veículos ficou em duas colunas no computador, e quem for configurado recebe *aviso no WhatsApp* quando alguém seguir reprovado + resumo às 7h e 13h.

Veja as telas aqui 👇
https://cahardt-github.xrqvlq.easypanel.host/novidade-checklist-foto-v2.html
```

---

## Arquivos do commit (`git add`)

**Não entram** (já estão em HEAD pelo commit fb455027): `backend/prisma/schema.prisma`, `frontend/public/novidades.json`.

Backend (modificados): `backend/config/checklistVeiculoAngulos.js`, `backend/controllers/veiculoController.js`, `backend/index.js`, `backend/routes/adminExec.js`, `backend/routes/caixa.js`, `backend/routes/checklistsVeiculo.js`, `backend/routes/veiculos.js`, `backend/services/checklistVeiculoIaService.js`, `backend/services/checklistVeiculoService.js`, `backend/services/veiculoService.js`, `backend/workers/scheduler.js`, `backend/manuais/abas/caixa.md`, `backend/manuais/abas/config-gerais.md`, `backend/manuais/abas/veiculos.md`.
Backend (novos): `backend/routes/checklistAvisosRoutes.js`, `backend/services/checklistAvisosService.js`, `backend/services/checklistCaixaService.js`.
Frontend (modificados): `frontend/src/components/Diario/ChecklistFotos.jsx`, `frontend/src/components/Diario/FormVeiculoPresencial.jsx`, `frontend/src/components/Diario/TireAssimModal.jsx`, `frontend/src/pages/Admin/Configuracoes/Configuracoes.jsx`, `frontend/src/pages/Caixa/CaixaDiarioPage.jsx`, `frontend/src/pages/Veiculos/ChecklistsVeiculoLista.jsx`, `frontend/src/pages/Veiculos/FotosModeloVeiculo.jsx`, `frontend/src/pages/Veiculos/VeiculoFicha.jsx`, `frontend/src/pages/Veiculos/Veiculos.jsx`, `frontend/src/services/checklistVeiculoService.js`.
Frontend (novos): `frontend/public/novidade-checklist-foto-v2.html`, `frontend/src/components/ChecklistVeiculo/VisualizadorFotos.jsx`, `frontend/src/components/ChecklistVeiculo/DesenhosEnquadramento.jsx`, `frontend/src/components/ChecklistVeiculo/SeloChecklist.jsx`, `frontend/src/hooks/useMediaQuery.js`, `frontend/src/pages/Admin/Configuracoes/ChecklistVeiculosConfigCard.jsx`, `frontend/src/services/checklistEscritorioService.js`, `frontend/src/utils/checklistFotos.js`.
Docs: `docs/checklist-veiculo/evidencias-qa-dia2/`, `docs/checklist-veiculo/NOTA-DE-ENTREGA-dia2.md`.
