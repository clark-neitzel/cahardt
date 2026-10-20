# Nota de entrega — Cadastro de Setores

> Pedido do dono em 20/10/2026: "cadastrar os setores, editar, e assim mudar em todo lugar o nome do setor."
> Veredito do gerente de entrega: **LIBERADO**. Publicado em 20/10/2026 às 10:42 (commit d36ce64e). Conferência em produção abaixo.

## O que mudou (em termos de uso)

**Tela nova: Configurações → Setores.** Antes os setores (Cozinha, Estoque, Expedição, Motorista) eram fixos no sistema. Agora é um cadastro: dá para **criar** setor novo, **renomear** (o nome novo vale na hora em todo lugar), trocar o **ícone**, mudar a **ordem** (setas para cima/baixo), **desativar/reativar** e **excluir** (só setor que não tem ninguém nem nenhum conteúdo).

**Onde o nome novo aparece:** ficha do funcionário (RH), página inicial do Como Fazer (chips e subtítulo), página de cada conteúdo, todas as abas do Painel Como Fazer (Treinamentos, Rotinas, Conteúdos, Aparelhos, Relatório) e no título do tablet do setor.

**Renomear não quebra nada.** Por baixo, cada setor tem um código interno que nunca muda (mostrado em cinza na tela, só para leitura). Os funcionários, os conteúdos e o tablet já pareado continuam ligados ao setor — o tablet não pede novo link.

**Desativar um setor em uso:** o sistema avisa quantos funcionários e conteúdos ele tem e pede confirmação. Depois, o setor some das listas de escolha e o tablet dele mostra "Este setor foi desativado pelo RH". Ninguém é apagado: a ficha do funcionário mostra o setor como "(desativado)" e continua podendo ser editada; reativar devolve tudo como estava.

**Quem pode:** ver a lista, qualquer pessoa logada (o RH precisa dela na ficha). Criar, renomear, ordenar, desativar e excluir só quem **edita Configurações** (ou admin). O menu Configurações → Setores só aparece para quem tem Configurações.

**Bug antigo corrigido de carona:** na página inicial do Como Fazer o chip do setor escolhido nunca ficava destacado e não mostrava o ícone. Agora fica.

**O que NÃO muda:** nenhum dado foi migrado; os 4 setores atuais são criados automaticamente na primeira vez que o servidor sobe. Nada de WhatsApp, nota fiscal, financeiro ou API da Ana.

## O que foi testado e por quem

- **Dev backend:** cadastro, seed dos 4 setores no boot, validação do setor na ficha e nos conteúdos pela tabela, tablet e renovação de sessão recusando setor desativado.
- **Revisor (servidor):** aprovado, 3 sugestões aplicadas.
- **Dev frontend:** tela de Setores e troca da lista fixa pela do servidor em 12 pontos do app; correção do chip.
- **Revisor (telas):** aprovado, 4 sugestões aplicadas.
- **QA (navegador automatizado, computador e 375 px):** aprovado com ressalvas cosméticas, todas aplicadas. Provado clicando: criar, renomear, ordenar, desativar com aviso, excluir, "último setor" bloqueado, permissões por perfil; "Cozinha Quente" aparecendo na ficha, na Home (chip destacado), no documento, no painel e **no tablet com a chave pareada antes do rename**; setor "Limpeza" novo atribuído a funcionário e conteúdo; setor desativado → "(desativado)" na ficha sem zerar, tablet "Este setor não existe mais", sessão não renova; Como Fazer sem regressão; erro simulado do servidor não quebra as telas; build.
- **Gerente de entrega:** mudança conferida arquivo a arquivo (só o escopo de Setores; nada de outras entregas; nenhuma senha ou chave no código); build do frontend passou; checagem de sintaxe dos 10 arquivos do servidor e validação do banco ok; banco só ganhou uma tabela (nada removido); nenhuma lista fixa de setor sobrou no Como Fazer; o tablet (sem login) não consulta o cadastro, lê os nomes pelas próprias telas do Como Fazer; permissão igual na tela e no servidor (objeto, não booleano); manuais do Clippy, página de novidade (sem imagem no preview, seções abertas, telas desenhadas marcadas como exemplo) e marcador de deploy.

## Conferido em produção

Feito pelo gerente de projeto em 20/10 às 10:42, logo após o deploy (servidor reiniciado há 20 segundos na hora da conferência):

- [x] **Servidor novo no ar** — responde com o marcador desta entrega.
- [x] **Telas novas no ar** — o app publicado já carrega a rota Configurações → Setores.
- [x] **Cadastro de setores existe** — sem login responde "token não fornecido" (401), não "não encontrado"; tentar reordenar sem login também é recusado.
- [x] **Os 4 setores foram semeados no banco** — os endereços do tablet de Cozinha, Estoque, Expedição e Motorista respondem "aparelho não autorizado" (setor existe e está ativo); um setor que não existe ("limpeza") responde "setor não encontrado" — ou seja, a lista vem da tabela nova, não de valor fixo.
- [x] **Página de novidade abre sem login**; a entrada do Clippy está no topo da lista de novidades.
- [ ] **Renomear um setor e ver o nome novo na ficha, no Como Fazer e no tablet** — exige login; provado no ambiente de testes pelo QA. Fica para você (abaixo).

## O que você precisa fazer / conferir (um minuto)

1. **Configurações → Setores:** conferir que os 4 setores estão lá com os nomes de sempre. Se quiser, já ajustar o ícone de algum.
2. **Renomear um e ver:** mude "Cozinha" para o nome que quiser, abra o Como Fazer e a ficha de alguém da Cozinha — o nome novo tem que estar lá. (Pode voltar o nome depois.)
3. **No tablet real da Cozinha** (se já estiver pareado): abrir e ver se o título mostra o nome novo sem pedir novo link.

## O que ficou pendente ou de fora

- **Tablet real:** o teste do rename com tablet pareado foi feito no navegador; no aparelho físico fica por sua conta (passo 3).
- **Os 4 setores nascem com os ícones padrão** (🍳 🧊 📦 🚚); edite na tela se preferir outros.
- O setor continua sendo escolhido por funcionário na ficha do RH — não há tela de "mover várias pessoas de uma vez" (não foi pedido).
