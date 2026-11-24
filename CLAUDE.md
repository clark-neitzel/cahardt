# Diretrizes do Projeto CA-Hardt

> **Como ler (reorganizado em 24/11/2026 — pedido do dono: regras mais simples e rápidas para os agentes).**
> Aqui fica só o que vale para TODA tarefa. As regras de cada assunto moram em `docs/regras/` e
> **cada regra existe em um lugar só**. Antes de mexer num assunto, leia o arquivo dele (seção
> "Mapa das regras"). Regra nova entra no arquivo do assunto **alterando a regra que já trata do
> tema** — nunca empilhar outra por cima, nem repetir em ficha, habilidade ou memória (foi a
> repetição que criou as contradições encontradas em 24/11/2026).

---

## ONDE FICA CADA COISA (definido pelo dono em 14/08/2026)

Três lugares, três papéis — não confundir:

| Lugar | Papel |
|---|---|
| **GitHub** (`clark-neitzel/cahardt`) | **O projeto mora aqui.** Fonte oficial, com todo o histórico. É de onde o EasyPanel puxa para publicar. Trabalho que não foi enviado para cá não existe. |
| **Mac** (`~/Projetos/CA-Hardt`) | **Bancada de trabalho e teste local.** Onde se edita, builda, roda o app e testa — e de onde se envia (push) para o GitHub. Nada deve ficar só aqui — única exceção: mudança só de regra/documento espera o próximo envio de código (seção "Enviar ao GitHub"). |
| **Google Drive** (`.../Conta Azul/CA-Hardt-Backups/completo_<data>.tgz`) | **Backup de segurança.** Pacote único gerado por `scripts/backup-para-drive.sh`; guarda as 5 cópias mais recentes e leva também o que o GitHub não pode guardar (`.env`, `.admin-secret`). Espaço sobrando e fácil de abrir. |

- **NUNCA trabalhar dentro da pasta do Drive.** Lá cada arquivo é baixado da nuvem na hora do uso:
  o build do frontend levava **31 minutos** (contra ~5 segundos no disco local) e comandos de git
  travavam por minutos. Se alguém abrir uma sessão lá, mudar para `~/Projetos/CA-Hardt` antes de
  qualquer coisa. A pasta `Conta Azul/CA-Hardt` do Drive está **congelada** desde 14/08/2026 (só
  arquivo morto); o backup vivo é o `.tgz` na pasta `CA-Hardt-Backups`.
- **Nunca espelhar pasta (rsync) para o Drive**: o espelhamento precisa varrer o destino e força o
  Drive a materializar tudo — travou 60 min sem gravar nada. Pacote único = 1 escrita = 1 segundo.

---

## FORMA DE TRABALHO — equipe de agentes (REGRA PERMANENTE, pedido do dono em 08/2026)

> Antes era um agente só fazendo tudo e conferindo o próprio trabalho — resultado: serviço entregue
> pela metade e bug voltando (a impressão do iPad foi "corrigida" mais de uma vez). A partir de agora o
> projeto trabalha como uma empresa: **quem faz não é quem confere, e nada chega ao dono sem passar
> pelo portão de entrega.**

### A equipe (fichas em `.claude/agents/`)

| Agente | Papel |
|---|---|
| **thread principal** | **Gerente de projeto.** Fala com o dono, entende o pedido, distribui, cobra e entrega. Não faz sozinho o trabalho do dev. Espera longa (build/deploy) é responsabilidade dele, não do agente. |
| `arquiteto` | Desenha o plano antes de codificar (arquivos, ordem, riscos, critérios de aceite). Somente leitura. |
| `dev-backend` | Implementa rota, service, worker, schema, integração. Não commita. |
| `dev-frontend` | Implementa tela, componente, filtro, impressão. Roda o build. Não commita. |
| `qa-testador` | Prova que funciona **clicando na tela de verdade** (app local + navegador automatizado), inclusive erro e mobile. Não corrige. |
| `revisor-codigo` | Lê o diff procurando bug, violação das regras do projeto e efeito colateral. Não corrige. |
| `gerente-entrega` | Portão final: confere tudo, cobra o checklist, dá o veredito e escreve a nota de entrega. |

### O fluxo

```
pedido do dono → (arquiteto, se médio/grande) → dev-backend / dev-frontend
   → qa-testador  +  revisor-codigo   (em paralelo)
   → reprovou? volta pro dev → repete até passar
   → gerente-entrega → entrega ao dono
```

### Porte da tarefa define o tamanho da equipe

- **Pequena** (texto, cor, campo simples): `dev` → `revisor-codigo` → `gerente-entrega`. Sem QA. O gerente recebe um **pacote curto** (o diff, o veredito do revisor e a saída do build) — é conferência rápida, não reunião.
- **Média** (tela nova, correção de bug, relatório): `dev` → `qa-testador` + `revisor-codigo` → `gerente-entrega`. *(padrão)*
- **Grande** (módulo novo; qualquer coisa em fiscal, financeiro, NF-e, WhatsApp, permissões, migração): `arquiteto` antes, equipe completa depois.
- **Entrega rápida** (só quando o DONO pedir: "urgente", "entrega rápida", "manda direto" ou parecido): o dev faz, roda a verificação automática (build do frontend / `node --check`) e a thread principal publica **sem esperar a conferência**. As regras dos processos protegidos continuam valendo. **Depois de entregue**, a thread principal diz em uma frase o que ficou sem conferir e **sugere a conferência completa** do que foi feito (revisor + QA + gerente) — o dono decide se roda. Urgência não é desculpa para esquecer a conferência: ela só muda de hora.

### Regras do fluxo

1. **Quem faz não confere.** Dev não aprova o próprio trabalho.
2. **Relatório sem evidência = não feito.** Saída de comando, estado do DOM, resposta de API, PDF, captura de tela.
3. **Nada é entregue ao dono sem o veredito do `gerente-entrega` — em TODO porte, inclusive tarefa pequena** (decisão do dono em 24/11/2026). Única exceção: a entrega rápida pedida por ele (acima).
4. **A entrega final é a nota de entrega**: português simples — o que mudou, o que foi testado, o que ele precisa conferir, o que ficou pendente.
5. **Quem commita é a thread principal**, e só **depois** do veredito do `gerente-entrega` — exceto na entrega rápida (os agentes nunca commitam nem publicam). O build tem que ter passado — a regra da seção seguinte continua valendo.
6. **Depois de commitar, rode `scripts/backup-para-drive.sh`** — o agendamento das 12h/20h só funciona se o macOS tiver dado permissão ao cron para escrever na pasta do Drive; rodar pela sessão sempre funciona.
7. **Não vale para** pergunta, consulta ou diagnóstico que não altera arquivo — nesses casos, responda direto.
8. **Dispensa**: se o dono escrever **"sem agentes"** (ou equivalente), execute direto, sozinho — mantendo todos os padrões deste arquivo.
9. **Correção de bug segue a skill `depuracao-sistematica`** (`.claude/skills/`, adotada em 11/2026): causa raiz com evidência **antes** de corrigir; bug que voltou nunca é tarefa pequena; **3 correções falhas do mesmo bug = parar**, chamar o `arquiteto` e contar ao dono.
10. **Diário de bordo em tarefa média/grande**: a thread principal mantém `.claude/diario/<AAAA-MM-DD>-<slug>.md` (fora do git) com o pedido do dono **palavra por palavra**, o porte, cada agente acionado com o veredito, as pendências e os commits. Depois de uma compactação da conversa, **releia o diário antes de acionar qualquer agente** — é o que impede refazer trabalho já feito ou esquecer uma reprovação.

### Equipe sempre, gastando pouco (sugestão aplicada em 24/11/2026 — o dono perguntou qual era a sugestão; se ele quiser outra, muda aqui)

Conferir tudo e economizar deixam de brigar quando **cada agente lê só a parte dele**:

- Este arquivo ficou curto de propósito — ele é carregado por TODO agente, toda vez. Regra de assunto mora em `docs/regras/` e só é lida por quem vai mexer naquele assunto (ver "Mapa das regras").
- Ao acionar um agente, a thread principal passa **o pedido do dono, os arquivos envolvidos e o nome do arquivo de regra** — não cola regra no prompt nem manda reler o projeto.
- QA, revisor e gerente recebem **o diff e os relatórios**, não a história da conversa.
- Pergunta, consulta e diagnóstico continuam sem equipe (regra 7).

### Ativação automática (não depende de ninguém lembrar)

1. **Hook `UserPromptSubmit`** — `.claude/hooks/equipe-agentes.py`, ligado em `.claude/settings.json`:
   roda a cada mensagem do dono e injeta esta regra no contexto; sinaliza o "sem agentes" (o gancho só avisa — quem aplica a dispensa é a thread principal).
2. **Esta seção do `CLAUDE.md`** — lida no início de toda sessão.
3. **As fichas em `.claude/agents/`** — carregam o papel e as regras críticas dentro de cada agente.

---

## MAPA DAS REGRAS — leia o arquivo do assunto ANTES de mexer

| Vai mexer em… | Leia antes | O que nunca pode quebrar (resumo — o arquivo manda) |
|---|---|---|
| Qualquer tela, componente, modal, filtro, relatório na tela | `docs/regras/telas.md` | Tema verde, botão em pílula, celular obrigatório, computador usa a largura, **botões de ação nunca cobertos e presos quando a tela rola**, filtro lembra a escolha, cursor nunca some. |
| Impressão (folha, etiqueta, recibo) | `docs/regras/impressao.md` | Sempre pela peça única `utils/imprimirNaPagina.js`. Nunca `window.open`, nunca iframe, nunca só `@media print`, nunca copiar a função. |
| Banco, `$transaction`, schema, upload, função que grava no servidor | `docs/regras/backend.md` | Nunca remover campo do schema; transação com `{ timeout: 20000, maxWait: 10000 }` e sem API externa dentro; upload só em `backend/uploads`; o que grava no servidor só está pronto depois de testado em produção atravessando um deploy. |
| Envio de WhatsApp | `docs/regras/whatsapp.md` | Só mensagem transacional provocada por ato recente do cliente; `tipo` + `referencia`; 2000 caracteres; teto e fila são do bot (consultar o status). |
| Devolução / NF-e de devolução | `docs/regras/nfe-devolucao.md` | Emissão automática no clique; erro de nota nunca desfaz a devolução; pedido especial nunca emite. |
| Caixa, baixa, Pix, cartão, conciliação, soma de pagamentos | `docs/regras/pix-cartao.md` | Pix comum e cartão não quitam sozinhos; o Caixa nunca trava por causa deles; cliente aguardando conciliação não é inadimplente. |
| `/api/ia-consulta/v1` (IA de atendimento) | `docs/regras/api-ia.md` | Nunca remover/renomear campo; dado de cliente só com o telefone batendo, nunca só CPF/CNPJ. |
| PWA, `sw.js`, rota nova no `App.jsx`, login/token | `docs/regras/pwa.md` | `lazyComRetry` (nunca `React.lazy`); `index.html` e `sw.js` sem cache; nunca deslogar por erro de rede. |
| Qualquer mudança visível para a equipe | `docs/regras/novidades-e-manual.md` | Página de novidade + `novidades.json` + texto pronto para o grupo; manual da aba e tabela `ABAS` do Clippy atualizados. |

Assunto que toca dois arquivos: leia os dois. Correção de defeito: habilidade `depuracao-sistematica` antes de qualquer correção.

---

## REGRA INEGOCIÁVEL — Verificação antes de todo commit

**Toda alteração em arquivos frontend (JSX/JS) deve passar pelo build antes do commit.**

```bash
cd frontend && npm run build
```

- Se o build **falhar** → corrigir o erro antes de commitar. Jamais subir código que não compila.
- Se o build **passar** → commitar e fazer push normalmente.
- **Não há exceções.** Nem para mudanças "pequenas" de CSS, ícone ou import.

### Por que isso é crítico
O app roda em produção 24h. Um import faltando (`ReferenceError: Can't find variable`) derruba toda a tela para todos os usuários — vendedores em campo, motoristas, escritório. Uma linha esquecida para toda a operação da empresa.

### O que o build detecta
- Variável/componente usado mas não importado (`Can't find variable: Truck`)
- Import de arquivo que não existe
- JSX mal formado
- Erro de sintaxe JavaScript

---

## Tela ou função nova SEMPRE nasce com permissão (regra do dono, 24/11/2026)

Toda tela, aba, rota, botão de ação ou relatório novo define **quem pode acessar** antes de ser dado como pronto:

1. **Servidor primeiro.** A rota nova confere a permissão do usuário e devolve 403 para quem não tem. Tela escondida com rota aberta não é permissão.
2. **A tela espelha o servidor com a MESMA expressão** — item de menu, rota no `App.jsx`, botão e parâmetro de filtro. Expressão diferente = o servidor ignora o filtro em silêncio (caso real: `RotaLeads.jsx`).
3. **Permissão é OBJETO, não sim/não** (`{ view, edit, … }`): usar `perms.X?.edit === true` no servidor e `hasPermission('x', 'view')` na tela. `!!perms.X` libera até quem é somente-leitura (defeito que apareceu 3 vezes numa mesma entrega).
4. **Permissão nova** entra no painel `frontend/src/pages/Admin/Vendedores/PermissoesModal.jsx` (o JSX da seção **e** a entrada no `BOOL_INDEX`); chave de risco nunca é ligada por perfil rápido nem por "Marcar tudo".
5. **Clippy:** a tabela `ABAS` de `backend/services/copilotoService.js` recebe a rota e a permissão REAIS.
6. **Prova:** o QA abre a tela e chama a rota com um usuário SEM a permissão (o perfil "Producao" é o mais restrito ativo) e mostra o bloqueio.
7. Se o pedido não diz quem acessa, a thread principal **pergunta ao dono antes de construir** — não assume "todo mundo".

---

## Enviar ao GitHub = publicar e reiniciar o sistema (decisão do dono em 24/11/2026)

- **O envio (push) continua autorizado a qualquer hora, sem pedir** — a maioria dos consertos é urgente e atualizar no meio do dia nunca deu problema.
- **Todo envio publica e reinicia o sistema em produção** (cerca de 1 minuto). Por isso, **na hora de enviar, avisar o dono que o app vai ser atualizado**: uma linha dizendo o que está subindo. É aviso, não pedido de autorização. A equipe é avisada pelo próprio app (`useVersionCheck` + ícone de atualizar).
- **Mudança só de regra ou de documento** (`CLAUDE.md`, `docs/`, `.claude/` — nada que o app carrega) **não é enviada sozinha**: commita local e vai junto no próximo envio normal de código. Reiniciar a produção por causa de texto não se justifica. *(Manual das abas em `backend/manuais/` e página de novidade em `frontend/public/` SÃO parte do app — esses sobem normalmente.)*

---

## Stack
- **Frontend:** React + Vite + Tailwind CSS (PWA)
- **Backend:** Node.js + Express + Prisma (PostgreSQL)
- **Deploy:** EasyPanel (IP 76.13.160.151), acesso via `/api/admin-exec` com header `x-admin-secret: <ADMIN_SECRET>`. **O valor NÃO fica no repositório** — vem da variável de ambiente `ADMIN_SECRET` (EasyPanel); localmente, do arquivo gitignored `backend/scripts/.admin-secret`.
- **Integrações vivas (padrão a espelhar em integração nova):** **Asaas** (`backend/services/asaasService.js` — boleto, Pix, extrato) e **Focus NFe** (`focusNfeService.js` / `focusNfeEmissaoService.js`). **O Conta Azul não existe mais como integração** — sobraram só os dados importados, em somente leitura (`backend/config/contaAzulModo.js`). Não usar código `contaAzul*`/`ca*` como modelo (decisão do dono em 24/11/2026).

---

## Habilidades de apoio (decisão do dono em 24/11/2026)

- **`i-have-adhd`** — liga sozinha em toda sessão; molda as respostas ao dono (começa pela ação, passos curtos).
- **`impeccable`** — **obrigatória em tela nova e em mudança visual** (porte médio ou grande): o `dev-frontend` passa a tela por ela antes de entregar (`critique` e `audit` na tela tocada), para pegar o que o dono mais reclama — **texto cortado, barra de rolagem sobrando (lateral ou dentro de quadro), hierarquia e espaçamento**. O design system do projeto (`docs/regras/telas.md`) tem precedência sobre qualquer sugestão dela. Ajuste pequeno (texto, cor) dispensa.
- `awesome-design-md`, `archify`, `mindmap` — **fora do fluxo deste projeto** (avaliadas pelo dono: não fazem sentido aqui). Só se ele pedir pelo nome.
