# Nota de entrega — "Começar com a IA" (Como Fazer), fase 1

> Pedido do dono: a IA monta o primeiro rascunho do manual (POP) no editor do Como Fazer, usando o ChatGPT que o sistema já tem.
> Veredito do gerente de entrega em 21/10/2026: **LIBERADO** para publicar. A seção "Conferido em produção" fica em branco até o deploy.

## O que mudou (em termos de uso)

**Cartão "✨ Começar com a IA" ao criar um conteúdo** (Painel Como Fazer → Conteúdos → Novo). Você conta, digitando ou **falando no microfone**, o que quer ensinar; escolhe o tipo (máquina, rotina, regra, dosagem), o setor, o título e o tamanho (curto ou completo); clica em **Montar o POP**. O texto vai **aparecendo aos poucos** na tela, com um cronômetro. No fim aparece a **prévia** do manual inteiro: seções, passos em frases curtas, aviso de perigo, "o que NÃO fazer", "se der errado" e, nas rotinas, as perguntas do checklist (número com mínimo e máximo, sim/não ou foto).

**Em cada passo a IA diz qual foto tirar** ("Mostre o painel com a temperatura…"). A dica aparece no botão de foto do editor para orientar quem vai fotografar, some quando a foto é enviada e **nunca aparece para o funcionário no tablet**.

**Você decide o que fazer com o rascunho:** *Usar este rascunho* cria o conteúdo como **rascunho**, com um selo âmbar "feito com ajuda da IA — confira antes de publicar"; *Pedir diferente* gera outra versão com a sua observação; *Cancelar* descarta. **A IA nunca publica nada** e o selo some quando você publica.

**Ajuda dentro do editor:** em cada passo, botões **✨ Melhorar** e **✨ Mais simples**; no documento, sugestões de "o que NÃO fazer", "se der errado", perguntas (só em rotina) e passos que faltam. Nada entra sozinho — você escolhe Usar ou Descartar em cada sugestão.

**Tela nova: Configurações → Inteligência artificial.** Liga/desliga a IA do Como Fazer, escolhe o modelo (por enquanto só o ChatGPT funciona; o Claude aparece desabilitado), define o **limite de usos por dia** (vale para todo mundo), cadastra o preço do modelo e mostra o uso do mês: quantas montagens, quantas foram usadas/descartadas, tokens e custo estimado. Sem preço cadastrado, a tela pede para preencher em vez de mostrar "R$ 0,00".

**Quem pode:** os botões ✨ só aparecem para quem **cria e edita o Como Fazer** e quando a IA está ligada com chave no servidor. A tela de Configurações → IA segue a permissão de Configurações (ver / editar). Tablet nunca tem acesso à IA.

**Proteções:** limite diário; uma montagem por pessoa de cada vez; se a resposta vier quebrada o sistema tenta consertar uma vez e, se não der, avisa e **não cria nada**; se o ChatGPT recusar, idem; cancelar no meio preserva o que você digitou; se a conexão cair, "A conexão caiu" e nenhum rascunho pela metade.

**O que NÃO muda:** o Clippy e a análise de fotos do checklist de veículos usam o mesmo ChatGPT de antes, sem alteração de comportamento. A chave do ChatGPT continua só no servidor (variável de ambiente), nunca no banco nem na tela. O sistema **não guarda o que você escreveu nem o texto que a IA devolveu** — só registra quem usou, quando, quantos tokens e o custo.

## O que foi testado e por quem

- **Dev backend:** tabela de uso, streaming, limite, reparo de resposta quebrada, recusa, cancelamento; proteção das chaves de configuração da IA.
- **Revisor (servidor):** aprovado; 2 obrigatórios corrigidos (reparo cancelável; preço vazio vira "sem preço", não zero) e 6 sugestões aplicadas; corpo errado na configuração → erro claro.
- **Dev frontend:** modal, prévia, ditado por voz, selo, dica da foto, botões ✨, tela de Configurações → IA, página de novidade.
- **Revisor (telas):** aprovado; 1 obrigatório corrigido (sugerir passos num editor vazio preserva o que já estava digitado) e 6 sugestões aplicadas.
- **QA (navegador automatizado, com a IA de verdade, computador e 375 px):** aprovado, 18 de 18 critérios: montar máquina e rotina com texto chegando aos poucos; pedir diferente; usar → selo, dica, publicar, tablet limpo; melhorar/simplificar/sugerir; limite diário; IA desligada; sem chave; resposta quebrada e recusa sem criar nada; cancelar; rede caída; duplo clique; permissões por perfil; Configurações → IA com números batendo com o banco; ditado; sem regressão no Clippy, no checklist de veículos nem no tablet; build.
- **Gerente de entrega:** mudança conferida arquivo a arquivo (só o escopo; nada de outras entregas; nenhuma chave no código); build passou; checagem de sintaxe dos 9 arquivos do servidor e validação do banco; banco só ganhou uma tabela; o registro de uso não tem campo de pedido/resposta; a consulta de status não devolve a chave; a configuração rejeita corpo inválido; o contexto enviado à IA não leva telefone, CPF, e-mail, salário ou endereço; o tablet recebe o documento sem a marca da IA nem a dica da foto; publicar apaga a marca; permissões iguais na tela e no servidor (objeto, não booleano); manuais do Clippy, página de novidade (sem imagem no preview, seções abertas, telas marcadas como exemplo, "diz qual foto tirar") e marcador de deploy.

## Conferido em produção

_(preencher depois do deploy)_

- [ ] Servidor novo no ar (marcador desta entrega respondendo)
- [ ] Telas novas no ar (app publicado carrega a rota de Configurações → IA)
- [ ] Consulta de status da IA sem login → "entre para continuar" (rota existe)
- [ ] Configuração da IA sem login → "entre para continuar" (rota existe, protegida)
- [ ] Página de novidade abre sem login; aviso do Clippy registrado
- [ ] **Texto chegando aos poucos em produção** — só dá para ver com login: dono ou gerente abre Novo conteúdo → Começar com a IA → Montar e observa o texto aparecendo antes do fim. Se vier tudo de uma vez no final, registrar aqui (não bloqueia: o rascunho chega do mesmo jeito).

## O que você precisa fazer / conferir (uns 5 minutos)

1. **Configurações → Inteligência artificial:** conferir que está **ligada**, ver o limite por dia (ajuste se quiser) e **cadastrar o preço do modelo** (entrada e saída por milhão de tokens, e a cotação do dólar) para a tela mostrar o custo em reais.
2. **Painel Como Fazer → Conteúdos → Novo → ✨ Começar com a IA:** conte uma máquina ou rotina real da Cozinha e veja o texto chegar aos poucos. Use *Pedir diferente* uma vez para sentir o fluxo.
3. **Confira o rascunho antes de publicar:** a IA pode errar temperaturas, tempos e medidas, e não conhece a sua máquina. Quem conhece o processo revisa.
4. No **iPad/iPhone**, testar o **microfone** (ditado) — a equipe testou no Chrome do computador.

## O que ficou pendente ou de fora

- **Foto da máquina no "montar"** (mandar uma foto para a IA descrever): fase 1b.
- **Claude como modelo alternativo:** aparece desabilitado até existir a chave no servidor.
- **Streaming em produção** e **ditado no iPhone/iPad**: só se provam com login e aparelho real (itens acima).
- As demais chaves genéricas de configuração do sistema continuam gravadas por qualquer usuário logado (comportamento antigo); só as chaves da IA ganharam proteção agora. Fica registrado para uma próxima rodada de segurança.
