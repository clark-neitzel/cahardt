# Nota de entrega — Como Fazer, fase 1 (piloto na Cozinha)

> Rascunho escrito pelo gerente de entrega em 20/10/2026, antes da publicação.
> A seção "Conferido em produção" fica em branco até o deploy terminar e ser testado.

## O que mudou (em termos de uso)

**Um menu novo, "Como Fazer", para toda a equipe.** É a biblioteca do jeito certo de fazer as coisas na empresa: regras (higiene e uniforme), máquinas (como ligar, usar, limpar e o que é perigoso), dosagens e rotinas de conferência. Cada item tem foto, uma frase curta e um botão **Ouvir** que lê o texto em voz alta — pensado para quem não gosta de ler. Dá para imprimir a folha direto da tela.

**Treinamento registrado.** Quando a pessoa termina de ver um conteúdo, toca em "Aprendi". Nos conteúdos que exigem, o encarregado confirma na hora digitando a senha dele de 4 números. Fica registrado quem aprendeu o quê, em qual versão e quando. Se o texto for republicado, o treinamento daquele item zera e todo mundo precisa ver de novo.

**Rotinas com checklist.** A primeira é a temperatura dos freezers. Nos horários combinados aparece uma tarefa na agenda do encarregado com o botão **Fazer agora** (no lugar de "Concluir"). Ele preenche o checklist, com foto se quiser. Se uma resposta sai do esperado (temperatura fora da faixa), o sistema cria sozinho uma tarefa de **desvio** para o responsável. Rotina que passou 60 minutos do horário sem checklist conta como **não feita** no painel.

**Tablet do setor.** Um aparelho fixo na Cozinha abre a tela do setor sem login do app: a pessoa toca na própria foto e digita 4 números. A sessão dura 2 minutos. Errou 3 vezes, espera 30 segundos; muitas tentativas no mesmo aparelho travam por 5 minutos. O RH libera o aparelho uma única vez pelo link de pareamento (Painel Como Fazer → Aparelhos).

**Painel no RH (Painel Como Fazer).** Quadro de quem já treinou e quem falta (com botão "Lembrar", que cria uma tarefa para a pessoa), rotinas feitas / com desvio / não feitas por dia, editor dos conteúdos (rascunho → publicar), pareamento do tablet e relatório imprimível para a Vigilância.

**Ficha do funcionário (RH → Funcionários).** Ganhou o setor (Cozinha, Estoque, Expedição ou Motorista), a foto que aparece no tablet e um selo dizendo se a senha serve para o tablet. A senha de 4 números é a mesma do ponto.

**Permissões novas (Admin → Usuários → Permissões → seção "Como Fazer"):**
- *Ver o painel do Como Fazer* — vê treinamentos, rotinas e o relatório.
- *Criar e editar o Como Fazer* — cria/publica conteúdos e libera o tablet.
- *Confirmar treinamento (encarregado)* — aparece na lista de encarregados e confirma com a senha de 4 números (o usuário precisa estar vinculado ao cadastro de funcionário).

A aba "Como Fazer" em si é visível para todo mundo que entra no app.

**O que NÃO muda:** a agenda de Tarefas continua igual para as tarefas que já existiam (as regras de repetição foram apenas movidas de lugar no código, sem alterar o comportamento). Nenhuma mensagem de WhatsApp sai deste módulo. NF-e, financeiro e a API da Ana não foram tocados.

## O que foi testado e por quem

- **Dev backend:** todas as rotas chamadas por `curl`; agenda de Tarefas comparada antes e depois da mudança (idêntica); seed dos 3 conteúdos rodado duas vezes (não duplica).
- **Revisor de código (backend):** aprovado. Dois pontos obrigatórios encontrados e corrigidos: "não feita" não pode ser retroativa (só conta a partir de quando o horário passou a valer) e publicar exige encarregado ativo.
- **Revisor de código (frontend):** reprovou na primeira leitura (senha errada no tablet derrubava a sessão do app; editar sem o painel caía em "acesso negado"; rascunho sem data; botões pequenos; tablet mostrava o menu do app). Tudo corrigido e aprovado na segunda leitura.
- **QA (duas rodadas, navegador automatizado em 375 px e 1280 px, banco local):** aprovado com ressalvas pequenas, já corrigidas. Provado na tela: entrar no tablet (chave do aparelho, grade de fotos, senha, freio de tentativas, sessão de 2 min, senha de tablet não vale em nenhuma rota do app), biblioteca e documento, treinamento com confirmação (não duplica), máquina (perigo, chamar o encarregado sem spam), checklist (desvio vira tarefa; backend parado → reenvio sem duplicar), agenda de Tarefas sem regressão, painel com os quatro perfis de permissão, ficha do RH, página de novidade, build do frontend.
- **Gerente de entrega (20/10):** conferiu o diff arquivo a arquivo (só o Como Fazer, nada de outras entregas misturado, nenhum segredo), rodou o build do frontend (passou), `node --check` nos 16 arquivos de backend (ok) e `prisma validate` (ok); checou schema só aditivo, uploads no volume persistente, permissões iguais no frontend e no backend, impressão na própria página, manuais do Clippy, página de novidade sem imagem no preview e com as telas desenhadas.

## O que você precisa fazer para começar a usar (uns 15 minutos)

1. **RH → Funcionários**, para cada pessoa da Cozinha: escolher o setor **Cozinha**, enviar uma **foto** do rosto e definir uma **senha de 4 números** (a mesma vale para o ponto). O selo tem que ficar verde: "Tablet: pronto".
2. **Admin → Usuários → Permissões**, no usuário do encarregado: ligar *Confirmar treinamento* (e *Ver o painel* / *Criar e editar*, conforme o caso). O usuário dele precisa estar vinculado ao cadastro de funcionário.
3. **RH → Painel Como Fazer → Conteúdos:** abrir os 3 conteúdos de exemplo (Higiene e uniforme, a máquina, Temperatura dos freezers). Eles nascem como rascunho. Revisar o texto de Higiene, trocar a máquina de exemplo pela máquina real da Cozinha, e na rotina dos freezers escolher o **encarregado** e os horários. Depois **Publicar** cada um.
4. **Painel Como Fazer → Aparelhos:** gerar o link de liberação da Cozinha e abri-lo uma vez no tablet. Pronto: o tablet mostra a grade de fotos.

## O que conferir em um minuto, depois que eu avisar que está no ar

- Abrir o app pelo atalho e ver o menu **Como Fazer** na barra lateral.
- Entrar em **RH → Painel Como Fazer**: as abas aparecem conforme a permissão.
- No tablet (depois do passo 4 acima): tocar na foto, digitar os 4 números e ver a tela do setor.
- No iPad/iPhone real: tocar em **Ouvir** (voz), tirar uma **foto** no checklist e **imprimir** uma folha. Isso só dá para provar no aparelho de verdade — a equipe testou no navegador do computador.

## O que ficou pendente ou de fora

- **Fase 1 só.** Reciclagem automática (treinar de novo depois de N meses) e os outros setores entram nas próximas fases; a estrutura já suporta.
- **iPad/iPhone reais** (voz, câmera, impressão AirPrint): não testados pela equipe — depende de você.
- **Foto atravessando um deploy:** será testada em produção pelo gerente de projeto antes de dar como pronto (regra do projeto).
- **Menu lateral simplificado:** quem tem só a permissão de painel não vê "Painel Como Fazer" na barra curta; chega pelo botão "Painel" dentro do Como Fazer ou pelo menu completo.
- **Conteúdos nascem em rascunho:** nada aparece para a equipe até você publicar (de propósito — é você quem revisa o texto antes).

## Conferido em produção

_(preencher depois do deploy)_

- [ ] Backend novo no ar (`deployMarker` = `como-fazer-fase1-2026-10-19`)
- [ ] Frontend novo no ar (chunk do index com as rotas `/como-fazer` e `/setor/`)
- [ ] Tabelas criadas (`db push` do deploy sem erro)
- [ ] Seed rodado — 3 conteúdos em RASCUNHO (segunda chamada não cria nada)
- [ ] Foto de funcionário enviada → novo deploy → foto continua abrindo
- [ ] Foto de passo (conteúdo) enviada → novo deploy → continua abrindo
- [ ] Token do tablet rejeitado em `/api/tarefas` (401)
- [ ] `novidade-como-fazer.html` abre sem login; `novidades.json` com a entrada no topo
- [ ] Clippy responde sobre "Como Fazer"
