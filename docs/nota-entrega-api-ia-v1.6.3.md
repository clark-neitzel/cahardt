# Nota de entrega — API da IA v1.6.3 (painel grava o WhatsApp no cadastro do cliente)

**Data:** 16/09/2026 · **Veredito do gerente de entrega: LIBERADO COM PENDÊNCIA**
(a pendência é só a conferência em produção depois de publicar — está no fim desta nota).

## O que mudou (em termos de uso)

Hoje, quando alguém manda mensagem de um número que o CA-Hardt não conhece, a equipe vincula a
conversa ao cliente manualmente no painel do bot — e na próxima mensagem daquele número precisa
vincular de novo, porque nada ficava salvo no cadastro.

Agora o painel do bot pode chamar a API do CA-Hardt (`POST /cliente/adicionar-whatsapp`) e o
número passa a ficar gravado na lista de WhatsApps do cliente — a mesma que aparece na tela de
Clientes. Da próxima vez, o reconhecimento por telefone acontece sozinho, inclusive para a Ana.

Regras que valem:
- **Só acrescenta.** Nunca apaga nem substitui um número que já estava no cadastro. Remover
  continua sendo só pela tela de Clientes.
- Se o número já estava lá (mesmo escrito diferente: com/sem 55, com/sem o 9), não grava de novo.
- Máximo de 10 WhatsApps por cliente. Documento que não é de cliente é recusado.
- Toda gravação fica registrada na auditoria (quem gravou: `painel-bot` ou `ana`).
- **Nada muda para a Ana responder cliente** — este endpoint é só do painel da equipe; nenhum
  dado do cliente é devolvido, só se grava um número.
- Nenhuma tela do app mudou. Nenhuma resposta antiga da API mudou (só endpoint novo).

## O que foi testado e por quem

- **Dev:** novo / repetido / 9º dígito / limite / reconhecimento depois / 5 chamadas simultâneas.
- **Revisor de código:** aprovado; as 3 ressalvas (gravação atômica, `origem` fechada, mesmo
  formato de número da tela de Clientes) foram corrigidas no código, não só respondidas.
- **Gerente de entrega (conferência própria, backend local com banco `hardt_local`):**
  - `node --check` nos 6 arquivos: OK. Versão respondida pela API: `1.6.3`.
  - Número novo → gravado; repetido exato → `jaExistia`; sem 55 e sem 9 → `jaExistia`; número que
    já era o Telefone do cadastro → `jaExistia`; `reconhecer-telefone` com o número novo →
    `reconhecido: true`; origem inválida → 400 `ORIGEM_INVALIDA`; sem chave → 401; número curto →
    400 `WHATSAPP_INVALIDO`; documento inexistente → 404 `CLIENTE_NAO_ENCONTRADO`; 11º número →
    400 `LIMITE_WHATSAPPS`.
  - Banco após o 1º teste: lista com exatamente 1 número e 1 registro de auditoria. Depois de 5
    chamadas em paralelo: 6 números, 6 auditorias — nenhum perdido.
  - SQL é parametrizado de verdade (tagged template do Prisma, sem string concatenada).
  - Tela de Clientes continua igual: editar com números (com máscara e repetido) grava a lista
    limpa; número inválido é recusado com a mesma mensagem; editar sem mexer em WhatsApps não toca
    na lista. A função de normalização nova dá resultado idêntico à antiga em 12 casos testados.
  - Guia do bot: base de produção correta, campos e códigos de erro batem com o código, sem chave
    e sem número do banco local.
  - Banco local revertido ao fim (lista e auditorias de teste apagadas).

## Aviso importante sobre a chave da API

Até hoje a chave da API da IA só **lia** dados. A partir desta versão ela também **grava** no
cadastro: quem tiver a chave consegue colocar um número de WhatsApp em qualquer cliente e, depois,
ser reconhecido como aquele cliente ao mandar mensagem. Ou seja: **a chave agora vale mais**.

O que já está feito para reduzir o risco: mesma chave e mesma confiança dos endpoints que já eram
só do painel, tudo auditado, limite de 60 chamadas por minuto, nunca vira ferramenta da Ana.

O que depende de você e do time do bot: **a chave fica só no backend do painel do bot** — nunca
em página, aplicativo, planilha, grupo ou repositório. Se um dia ela vazar, é trocar a variável
`IA_WHATSAPP_API_KEY` no EasyPanel e avisar o time do bot.

## O que você faz

1. Mandar ao time do bot o guia `docs/api-ia-v1.6.3-para-o-bot.md` (é autocontido).
2. Mandar a chave **por fora** (não está no guia, de propósito) — só se eles ainda não tiverem.
3. Depois do deploy, conferir em 1 minuto: pedir ao time do bot que vincule uma conversa de teste
   e abrir a tela de Clientes → o número deve aparecer na lista de WhatsApps do cliente.

## Pendente / fora desta entrega

- **Só se prova em produção:** o fluxo real (painel do bot chamando a API publicada) só vai ser
  visto depois do deploy e depois que o time do bot implementar a chamada do lado deles.
- Não precisou de manual do Clippy nem de página de novidade: não há tela nova nem mudança visível
  para a equipe no app.
- Ao commitar, incluir **apenas** os 8 arquivos desta entrega (o restante do `git status` é de
  outra sessão).
