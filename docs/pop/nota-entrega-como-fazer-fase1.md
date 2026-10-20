# Nota de entrega — Como Fazer, fase 1 (piloto na Cozinha)

> Publicado em 20/10/2026 de manhã. Veredito do gerente de entrega: **LIBERADO COM PENDÊNCIA** — está no ar e provado; o que depende do seu login e do aparelho real está listado no fim, para você conferir.

## O que mudou (em termos de uso)

**Um menu novo, "Como Fazer", para toda a equipe.** É a biblioteca do jeito certo de fazer as coisas na empresa: regras (higiene e uniforme), máquinas (como ligar, usar, limpar e o que é perigoso), dosagens e rotinas de conferência. Cada item tem foto, uma frase curta e um botão **Ouvir** que lê o texto em voz alta — pensado para quem não gosta de ler. Dá para imprimir a folha direto da tela.

**Treinamento registrado.** Quando a pessoa termina de ver um conteúdo, toca em "Aprendi". Nos conteúdos que exigem, o encarregado confirma na hora digitando a senha dele de 4 números. Fica registrado quem aprendeu o quê, em qual versão e quando. Se o texto for republicado, o treinamento daquele item zera e todo mundo precisa ver de novo.

**Rotinas com checklist.** A primeira é a temperatura dos freezers. Nos horários combinados aparece uma tarefa na agenda do encarregado com o botão **Fazer agora** (no lugar de "Concluir"). Ele preenche o checklist, com foto se quiser. Se uma resposta sai do esperado (temperatura fora da faixa), o sistema cria sozinho uma tarefa de **desvio** para o responsável. Rotina que passou 60 minutos do horário sem checklist conta como **não feita** no painel — só a partir do dia em que o horário foi combinado, nunca para trás.

**Tablet do setor.** Um aparelho fixo na Cozinha abre a tela do setor sem login do app: a pessoa toca na própria foto e digita 4 números. A sessão dura 2 minutos. Errou 3 vezes, espera 30 segundos; muitas tentativas seguidas no mesmo aparelho travam por 5 minutos. O RH libera o aparelho uma única vez pelo link de pareamento (Painel Como Fazer → Aparelhos). A senha do tablet não serve para entrar em nenhuma outra parte do app.

**Painel no RH (Painel Como Fazer).** Quadro de quem já treinou e quem falta (com botão "Lembrar", que cria uma tarefa para a pessoa), rotinas feitas / com desvio / não feitas por dia, editor dos conteúdos (rascunho → publicar), pareamento do tablet e relatório imprimível para a Vigilância.

**Ficha do funcionário (RH → Funcionários).** Ganhou o setor (Cozinha, Estoque, Expedição ou Motorista), a foto que aparece no tablet e um selo dizendo se a senha serve para o tablet. A senha de 4 números é a mesma do ponto.

**Permissões novas (Admin → Usuários → Permissões → seção "Como Fazer"):**
- *Ver o painel do Como Fazer* — vê treinamentos, rotinas e o relatório.
- *Criar e editar o Como Fazer* — cria/publica conteúdos e libera o tablet.
- *Confirmar treinamento (encarregado)* — aparece na lista de encarregados e confirma com a senha de 4 números (o usuário precisa estar vinculado ao cadastro de funcionário).

A aba "Como Fazer" em si é visível para todo mundo que entra no app. O Clippy já sabe explicar o módulo e o painel.

**O que NÃO muda:** a agenda de Tarefas continua igual para as tarefas que já existiam (as regras de repetição foram apenas movidas de lugar, sem alterar o comportamento). Nenhuma mensagem de WhatsApp sai deste módulo. Nota fiscal, financeiro e o atendimento da Ana não foram tocados.

## O que foi testado e por quem

- **Dev backend:** todas as funções do servidor chamadas uma a uma; agenda de Tarefas comparada antes e depois da mudança (idêntica); os 3 conteúdos de exemplo criados duas vezes seguidas (não duplicam).
- **Revisor de código (servidor):** aprovado. Dois pontos obrigatórios encontrados e corrigidos: "não feita" não pode valer para trás, e publicar uma rotina exige um encarregado ativo.
- **Revisor de código (telas):** reprovou na primeira leitura (senha errada no tablet derrubava a sessão do app; editar sem o painel caía em "acesso negado"; rascunho sem data; botões pequenos; tablet mostrava o menu do app). Tudo corrigido e aprovado na segunda leitura.
- **QA (duas rodadas, navegador automatizado em tela de celular e de computador, banco de testes):** aprovado com ressalvas pequenas, já corrigidas. Provado na tela: entrar no tablet (liberação do aparelho, grade de fotos, senha, freio de tentativas, sessão de 2 min, senha de tablet recusada no resto do app), biblioteca e documento, treinamento com confirmação (não duplica), máquina (perigo, chamar o encarregado sem repetir), checklist (desvio vira tarefa; servidor fora do ar → reenvio sem duplicar), agenda de Tarefas sem regressão, painel com os quatro perfis de permissão, ficha do RH, página de novidade, build.
- **Gerente de entrega:** conferiu a mudança arquivo a arquivo (só o Como Fazer, nada de outras entregas misturado, nenhuma senha ou chave gravada no código), rodou o build (passou), a checagem de sintaxe dos 16 arquivos do servidor e a validação do banco (ok); checou que o banco só ganhou tabelas e colunas (nada removido), que os arquivos enviados vão para a pasta que sobrevive ao deploy, que as permissões são iguais na tela e no servidor, impressão na própria página, manuais do Clippy, página de novidade.

## Conferido em produção (20/10, depois do deploy)

Feito pelo gerente de projeto, com duas publicações seguidas de propósito (a segunda para provar que nada se perde quando o servidor reinicia):

- [x] **Servidor novo no ar** — a versão publicada responde com o marcador desta entrega; reiniciou às 09:22 (1ª publicação) e às 09:24 (2ª).
- [x] **Telas novas no ar** — o app publicado já carrega as rotas do Como Fazer e do tablet, antes e depois da 2ª publicação.
- [x] **Tabelas criadas no banco** — a criação dos conteúdos de exemplo funcionou, o que só é possível com as tabelas novas no lugar.
- [x] **Conteúdos de exemplo criados, em rascunho** — Higiene e uniforme, Temperatura dos freezers (com o aviso "falta escolher o encarregado") e a máquina de exemplo. Rodado uma 2ª vez: não duplicou. Depois da 2ª publicação: os 3 continuavam lá.
- [x] **Sem login, o módulo recusa** — a tela do tablet sem aparelho liberado responde "aparelho não autorizado"; o restante responde "entre para continuar". Ninguém vê nada sem foto + senha ou sem login do app.
- [x] **Pasta de arquivos sobrevive ao deploy** — um arquivo de teste foi gravado na pasta persistente antes da 2ª publicação e continuava lá depois do reinício (apagado em seguida). As fotos do Como Fazer e dos funcionários vão para essa mesma pasta.
- [x] **Página de novidade abre sem login**; o aviso do Clippy (balãozinho de novidade) está registrado.
- [ ] **Foto enviada pela tela → continua abrindo depois de uma nova publicação** — *não feito*: exige login de RH, que a equipe de agentes não tem. Veja "O que você precisa conferir".
- [ ] **Parear o tablet e entrar com foto + senha em produção** — *não feito* pelo mesmo motivo (provado no ambiente de testes pelo QA).
- [ ] **Perguntar ao Clippy sobre "Como Fazer"** — *não feito* (exige login); os manuais foram publicados junto com o servidor.

## O que você precisa fazer para começar a usar (uns 15 minutos)

1. **RH → Funcionários**, para cada pessoa da Cozinha: escolher o setor **Cozinha**, enviar uma **foto** do rosto e definir uma **senha de 4 números** (a mesma vale para o ponto). O selo tem que ficar verde: "Tablet: pronto".
2. **Admin → Usuários → Permissões**, no usuário do encarregado: ligar *Confirmar treinamento* (e *Ver o painel* / *Criar e editar*, conforme o caso). O usuário dele precisa estar vinculado ao cadastro de funcionário.
3. **RH → Painel Como Fazer → Conteúdos:** abrir os 3 conteúdos de exemplo. Eles nascem como rascunho — ninguém da equipe vê até você publicar. Revisar o texto de Higiene, trocar a máquina de exemplo pela máquina real da Cozinha, e na rotina dos freezers escolher o **encarregado** e os horários. Depois **Publicar** cada um.
4. **Painel Como Fazer → Aparelhos:** gerar o link de liberação da Cozinha e abri-lo uma vez no tablet. Pronto: o tablet mostra a grade de fotos.

## O que você precisa conferir (um minuto cada)

- **A foto sobrevive à próxima publicação:** depois de enviar a foto de um funcionário (passo 1), na próxima vez que eu publicar qualquer coisa, abra a ficha dele de novo e veja se a foto ainda aparece. É o único teste de arquivo que a equipe não conseguiu fazer por você. (Se sumir, me avise — é exatamente o problema que já tivemos com os PDFs do Contas a Pagar.)
- **Tablet de verdade:** tocar na foto, digitar os 4 números, ver a tela do setor.
- **No iPad/iPhone:** tocar em **Ouvir** (voz), tirar uma **foto** no checklist e **imprimir** uma folha. Só dá para provar no aparelho real — a equipe testou no navegador do computador.
- **Clippy:** perguntar "como funciona o Como Fazer?" e ver se ele explica.

## O que ficou pendente ou de fora

- **Fase 1 só.** Reciclagem automática (treinar de novo depois de N meses) e os outros setores entram nas próximas fases; a estrutura já suporta.
- **iPad/iPhone reais** (voz, câmera, impressão): dependem de você, como acima.
- **Menu lateral simplificado:** quem tem só a permissão de painel não vê "Painel Como Fazer" na barra curta; chega pelo botão "Painel" dentro do Como Fazer ou pelo menu completo.
- **Fotos e arquivos ficam em endereço sem login** (mesmo padrão que os anexos do RH já usavam): quem tiver o link exato abre. O endereço é um código aleatório longo, não dá para adivinhar — mas é bom saber.
