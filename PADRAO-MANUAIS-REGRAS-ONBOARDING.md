# Padrão de Manuais, Regras e Onboarding — guia para aplicar em outro projeto

> **Para quem é este documento:** o agente de IA que trabalha no **projeto de WhatsApp** (bot de atendimento).
> **De onde ele vem:** do sistema CA-Hardt (app de gestão React + Node da Hardt Salgados), onde esses três padrões já rodam em produção há meses e funcionam bem.
> **O que fazer com ele:** implantar os mesmos padrões no projeto de WhatsApp, **adaptando ao contexto de lá** — a seção final lista o que NÃO cabe num projeto de WhatsApp e não deve ser copiado.

O sistema aqui usa **quatro pilares de documentação viva**. Cada um tem dono, formato e gatilho de atualização claros:

| Pilar | O que é | Quem consome |
|---|---|---|
| 1. Arquivo de regras (`CLAUDE.md`) | Regras inegociáveis do projeto que o agente lê em TODA sessão | O agente de IA |
| 2. Manuais por funcionalidade (`manuais/`) | Um `.md` por tela/função explicando o que ela faz e como usar | O assistente de ajuda embutido no app (e humanos) |
| 3. Páginas de novidade (onboarding HTML) | Uma página pública por novidade, enviada no WhatsApp da equipe | Os usuários finais |
| 4. Habilidades (skills) do agente | Padrões e processo de trabalho encodados em `.claude/skills/` (+ skills globais de criação já instaladas) | O agente de IA, ativadas por tipo de tarefa |

---

## Pilar 1 — Arquivo de regras do projeto (`CLAUDE.md` na raiz)

Um único arquivo markdown na raiz do repositório com as regras que o agente deve seguir **sempre**, sem depender de o dono do projeto lembrar de pedir. O agente lê esse arquivo automaticamente no início de cada sessão.

### O que aprendemos sobre COMO escrever essas regras (isto é o mais importante)

1. **Toda regra nasce de um erro real.** Não escreva regras genéricas de "boas práticas". Cada regra do nosso `CLAUDE.md` existe porque algo quebrou em produção. Quando um erro acontecer no projeto de WhatsApp, transforme-o em regra no mesmo dia.
2. **Toda regra explica o PORQUÊ.** Uma seção "Por que isso é crítico" com o cenário real de dano (ex.: "o cliente manda mensagem e o bot não responde"). Regra sem porquê é ignorada com o tempo.
3. **Toda regra mostra o ERRADO e o CERTO** com exemplo de código real, lado a lado. Isso vale mais que três parágrafos de explicação.
4. **Regras de verificação antes de publicar são INEGOCIÁVEIS e vêm primeiro.** Aqui, a primeira regra do arquivo é "rodar o build antes de todo commit, sem exceção". No projeto de WhatsApp, o equivalente é: **testar o fluxo de mensagem de ponta a ponta (ou os testes automatizados que existirem) antes de publicar** — uma resposta quebrada do bot é como uma tela caída, mas na cara do cliente.
5. **Checklists de "fazer por conta própria".** As melhores regras são as que dizem "ao terminar qualquer mudança, faça X sem o usuário pedir" (ex.: atualizar o manual, gerar a página de novidade). O dono do projeto é leigo em programação — ele não vai lembrar de pedir; o agente tem que se cobrar sozinho.

### Estrutura sugerida do `CLAUDE.md` do projeto de WhatsApp

```markdown
# Diretrizes do Projeto <nome>

## REGRA INEGOCIÁVEL — verificação antes de publicar
(como testar o bot de ponta a ponta antes de qualquer deploy; sem exceções)

## Stack e deploy
(o que roda onde, como publicar, onde ficam segredos — nunca no repositório)

## Regras de integração
(contratos de API que não podem quebrar — ver seção "Regra que JÁ EXISTE" abaixo)

## Manual das funções — atualizar SEMPRE
(checklist do Pilar 2)

## Anúncio de novidades no WhatsApp
(checklist do Pilar 3)
```

### ⚠️ Regra que JÁ EXISTE entre os dois projetos e deve constar no `CLAUDE.md` de lá

O projeto de WhatsApp consome dados do sistema Hardt **exclusivamente pela API `/api/ia-consulta/v1`** (documentada em `backend/docs/ia-consulta-api.md` no repositório do Hardt). Regras que o agente de lá deve gravar:

- **NUNCA acessar o banco de dados do Hardt diretamente** (`DATABASE_URL`, SQL cru). Isso já aconteceu, quebrou quando os nomes de coluna mudaram, e ignora as proteções de privacidade (identificação por telefone, nunca só por CPF/CNPJ).
- Se o bot precisar de um dado que a API ainda não oferece, a solução é **pedir a criação de um endpoint novo no projeto Hardt**, nunca contornar.
- Toda resposta da API traz `meta.avisos` com mudanças programadas de contrato — o bot deve logar/observar esses avisos.

---

## Pilar 2 — Manuais por funcionalidade (`manuais/`)

### Como funciona aqui

- Uma pasta `backend/manuais/abas/` com **um arquivo `.md` por tela do app** (~50 arquivos) + um `README.md` que é o índice (tabela: nome, rota, descrição de uma frase, link).
- Cada manual tem **frontmatter** (metadados no topo) e seções fixas:

```markdown
---
aba: Tarefas da Equipe
rota: /tarefas
permissao: todos (funções extras exigem permissões específicas)
---

# Tarefas da Equipe

## O que é
(um parágrafo, linguagem simples, sem jargão técnico)

## O que dá pra fazer aqui
(lista de TODAS as ações possíveis, com as permissões exigidas em negrito)

## Como funciona <comportamento importante>
(uma seção por comportamento que gera dúvida: alertas, cores, regras de negócio)

## Perguntas frequentes / casos especiais
```

- **Linguagem de usuário, não de programador.** O manual descreve o comportamento REAL do código ("o pop-up volta a cada 5 minutos até concluir"), mas em palavras que qualquer funcionário entende. Nunca cite nome de função, rota de API ou tabela do banco no corpo do manual.
- Esses manuais são a **fonte de conhecimento de um assistente de ajuda com IA embutido no app** (aqui chamado "Clippy"): um service lê os arquivos em tempo de execução, monta um índice curto de tudo + o conteúdo completo só dos manuais relevantes à pergunta (seleção por palavras-chave), filtra por permissão do usuário, e responde "onde e como fazer X". As rotas dos botões "Ir para" vêm de uma tabela no código (validada contra as rotas reais), não do frontmatter — porque frontmatter desatualiza.

### Como adaptar ao projeto de WhatsApp

- O equivalente de "aba" lá é **fluxo/intenção do bot** (ex.: "consultar catálogo", "fazer pedido", "reconhecer cliente", "falar com humano"). Um `.md` por fluxo, com: o que o fluxo faz, o que o cliente pode pedir, o que o bot responde, quando ele transfere para humano, limitações conhecidas.
- Se o projeto tiver painel/admin, cada tela do painel também ganha manual.
- O ganho é duplo: (a) o próprio bot pode usar esses manuais para responder "o que você consegue fazer?"; (b) o dono do projeto tem onde consultar sem ler código.

### CHECKLIST obrigatório (copiar para o `CLAUDE.md` de lá)

Ao final de **toda** alteração:
1. Esta mudança cria ou altera algum fluxo, resposta ou comportamento visível ao usuário?
2. Se SIM: atualizar o manual do fluxo (ou criar, se for novo, + linha no índice `README.md`).
3. Basear-se no comportamento REAL do código, não no nome das coisas.
4. Avisar o dono do projeto o que foi atualizado (ou dizer que nada precisou).

---

## Pilar 3 — Páginas de novidade (onboarding em HTML via WhatsApp)

### A ideia

Toda mudança visível para os usuários gera **uma página HTML pública** explicando a novidade, e o dono do projeto manda **só o link + um texto curto** no grupo de WhatsApp. A página faz o onboarding sozinha: o que mudou, para que serve, passo a passo de como usar, e quando faz sentido uma **demonstração interativa** (aqui já fizemos página com botão que toca o som real do alerta, por exemplo).

### Regras do padrão (comprovadas em ~17 páginas publicadas)

1. **Arquivo:** `novidade-<slug>.html` numa pasta de estáticos públicos servida **sem login** (aqui: `frontend/public/`, que o nginx serve direto). O link precisa abrir para qualquer pessoa que receber no WhatsApp.
2. **HTML completo e independente** (`<!DOCTYPE html>` até `</html>`): CSS inline no próprio arquivo, sem depender de framework nem de build. Mobile-first — vai ser aberta 95% das vezes no celular, dentro do navegador do WhatsApp.
3. **Meta tags Open Graph são OBRIGATÓRIAS** — são elas que fazem o link virar um cartão bonito no WhatsApp (título com emoji, descrição de uma frase, imagem com **URL absoluta** da logo):

```html
<meta property="og:title" content="📋 Novidade no App: Tarefas da Equipe">
<meta property="og:description" content="Agenda com alerta sonoro que insiste até você concluir. Veja como funciona!">
<meta property="og:image" content="https://<dominio-do-projeto>/logo-512.png">
<meta property="og:type" content="website">
```

4. **Anatomia da página** (nesta ordem): hero com a identidade visual do projeto (selo "NOVIDADE", título grande, uma frase de benefício) → mock/imagem da funcionalidade → seções explicativas curtas (accordion clicável funciona bem para não assustar com texto) → passos numerados "para começar a usar" → demo interativa quando fizer sentido.
5. **Tom:** benefício primeiro, linguagem do dia a dia da equipe, zero jargão. Título diz o que a pessoa GANHA, não o que foi programado.
6. **Entregar sempre junto:** o link pronto + **texto pronto para copiar/colar no grupo** usando a formatação do WhatsApp (`*negrito*`, emojis, 3–5 linhas no máximo, terminando com o link).
7. **NÃO colocar botão "Abrir o app"** na página quando os usuários acessam o sistema por atalho instalado (PWA) — o link abriria fora do atalho e confundiria. A página é só leitura. *(Avaliar se essa restrição se aplica no projeto de lá; se os usuários acessam por navegador comum, um botão pode até ajudar.)*
8. **Página velha se apaga.** Quando a novidade deixa de ser nova, remover o arquivo — não acumular.
9. **É obrigação do agente, não do dono.** A regra no `CLAUDE.md` diz: ao finalizar qualquer mudança visível, gerar a página e o texto **por conta própria**, sem esperar pedido.

### Adaptação ao projeto de WhatsApp

- Os "usuários" de lá podem ser dois públicos: a **equipe interna** (novidades do painel/bot) e os **clientes finais** (ex.: "agora dá para consultar o catálogo pelo WhatsApp"). O padrão serve para os dois — muda só o tom e para qual grupo o link vai.
- Se o projeto ainda não tem onde servir HTML público, esse é o primeiro pré-requisito a resolver (qualquer pasta de estáticos no serviço já hospedado resolve; não precisa de nada novo).
- Usar a identidade visual do projeto de lá — **não** copiar as cores daqui (ver seção final).

---

## Pilar 4 — Habilidades (skills) do agente

Além dos documentos, aqui os padrões críticos ficam **encodados em skills** — arquivos que o agente carrega quando vai fazer um tipo de tarefa, garantindo que as regras sejam seguidas mesmo sem ninguém pedir.

### Skills do projeto (criar equivalente no projeto de lá)

Ficam em `.claude/skills/<nome>/SKILL.md` dentro do repositório, com frontmatter `name` + `description` (a description diz QUANDO usar — é ela que faz o agente ativar a skill sozinho). Aqui temos duas:

- **`backend-engineer`** — ativada em qualquer tarefa de backend. Contém: processo de trabalho em ordem fixa (entender o negócio → ler código parecido antes de criar → planejar em passos testáveis → implementar → **testar antes de commitar** → checklist final de manuais/docs), os padrões inegociáveis e os **arquivos de referência** do repo para espelhar em cada tipo de tarefa.
- **`frontend-engineer`** — o mesmo para telas: design system, responsividade, build antes do commit, preview aprovado pelo dono antes de mudar design.

**Recomendação para o projeto de WhatsApp:** criar uma skill equivalente (ex.: `bot-engineer`) encodando os padrões DE LÁ — teste de ponta a ponta do fluxo de mensagem antes de publicar, dados do Hardt só via API `/v1`, checklist de manuais (Pilar 2) e de página de novidade (Pilar 3), e os arquivos de referência do repositório de lá para espelhar. A estrutura das duas skills daqui serve de molde; o conteúdo tem que nascer do projeto de lá.

Pontos que fazem essas skills funcionarem bem (copiar o jeito, não o conteúdo):
1. **Processo em ordem numerada fixa** — o agente segue passo a passo, sem pular o teste.
2. **"Ler código parecido antes de criar"** com a lista dos arquivos-referência por tipo de tarefa — evita reinventar padrão.
3. **Registrar no topo que o dono do projeto é leigo** — explicar decisões em linguagem simples e executar a parte técnica por ele.
4. **O checklist final da skill repete os Pilares 2 e 3** — assim manual e página de novidade saem sem ninguém pedir.

### Skills globais de criação (já instaladas na máquina, valem para os dois projetos)

Instaladas no perfil do usuário (não no repositório), então o agente do projeto de WhatsApp **já tem acesso** a elas:

- **`impeccable`** — design/polimento de interface. Usar ao criar ou refinar qualquer página HTML (inclusive as páginas de novidade do Pilar 3) e telas de painel.
- **`awesome-design-md`** — 74 design systems de marcas reais (tokens exatos de cor, tipografia, espaçamento). Usar como inspiração ao definir/registrar a identidade visual do projeto de lá.
- **`dataviz`** — padrões para gráficos e dashboards. Usar se o painel do projeto de lá tiver indicadores.

**Regra de precedência (vale nos dois projetos):** quando o projeto tem design system próprio documentado, ele **ganha** das skills globais — as skills ajudam na execução, mas cores/tokens/componentes vêm do projeto.

---

## ❌ O que NÃO copiar — coisas do CA-Hardt que não cabem num projeto de WhatsApp

O `CLAUDE.md` daqui tem muitas regras que são **específicas deste app** e seriam ruído (ou erro) no projeto de lá. Ao implantar os padrões, **ignorar tudo isto**:

| Regra daqui | Por que NÃO levar |
|---|---|
| Design system "Starbucks" (cores `#00754A`, tokens, botões-pílula, badges) | É a identidade visual DESTE app. O projeto de lá usa a identidade dele. Copiar só o *conceito* de ter um design system documentado, nunca os valores. |
| Regras de responsividade de telas, tabelas-viram-cards, `SelectBusca`, `useFiltrosSalvos` | São componentes e padrões do frontend React daqui. Só fariam sentido se o projeto de lá tiver painel web próprio — e mesmo assim com os componentes de lá. |
| Regras de impressão em iPad/PWA (`@media print`, nunca `window.open`) | Específico de app instalado que imprime. Bot de WhatsApp não imprime. |
| Regras de PWA (cache do `index.html`, `useVersionCheck`, `no-store`) | Específico de app instalado na tela inicial. |
| Regras de Prisma (`$transaction` com timeout, nunca dropar coluna do schema) | Específicas do banco e do deploy daqui. Se o projeto de lá usa outro ORM/banco, as regras equivalentes devem nascer dos erros DE LÁ. O princípio que viaja é: "operação crítica atômica + logs e chamadas externas fora da transação". |
| Payload de 7 campos do webhook BotConversa | É o contrato do webhook de ENVIO daqui. O projeto de lá tem os próprios contratos — o padrão que viaja é "documentar todo contrato que dá erro silencioso". |
| Rotas de admin (`/api/admin-exec`), segredos, IPs | Infraestrutura daqui. Nunca copiar segredos entre projetos. |

**Resumo do que viaja de um projeto para o outro:** os três *padrões* (regras vivas nascidas de erros reais, manuais por funcionalidade em linguagem de usuário, onboarding por página HTML no WhatsApp) e a *regra de fronteira* (dados do Hardt só via API `/v1`). Os *valores* — cores, componentes, contratos, segredos — ficam cada um no seu projeto.
