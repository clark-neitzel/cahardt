# Revisão de Segurança — CA-Hardt (12/09/2026)

Revisão defensiva, somente leitura, feita em `~/Projetos/CA-Hardt`. Nenhum arquivo foi
alterado e a produção não foi chamada — só leitura de código local e `npm audit` (que
não faz nenhuma chamada de rede além de checar versões contra o índice do npm).

---

## 1. Resumo para o dono (leigo)

**Nota geral: 7,5 / 10.** Para um sistema construído por uma pessoa só nesse ritmo, o
nível de cuidado com segurança está bem acima da média — login com força bruta travada,
senha com hash forte, certificado digital criptografado, segredos fora do código,
webhooks com segredo próprio. Os problemas que achei são pontuais, não estruturais.

**As 3 coisas mais urgentes:**
1. **Uma senha só (`ADMIN_SECRET`) abre 213 operações de manutenção em produção** —
   incluindo corrigir estoque, corrigir NF, mexer em caixa e financeiro — sem limite de
   tentativas. Se essa senha vazar (notebook roubado, print de tela, etc.), quem a tem
   controla o sistema inteiro sem precisar nem de login de usuário.
2. **O backup para o Google Drive leva o `.env` e a senha do admin junto**, sem
   criptografia — qualquer pessoa com acesso a essa pasta do Drive (ou à conta Google)
   pega todas as senhas de uma vez.
3. **Bibliotecas desatualizadas com falhas críticas conhecidas** (`tar`, `fast-xml-parser`
   no backend; várias "high" no frontend) — não são falhas do seu código, mas ficam
   abertas até alguém rodar a atualização.

Nada disso é "o app está vulnerável agora" — é "esses são os 3 primeiros buracos a
tapar". O restante do relatório detalha e dá o passo a passo.

---

## 2. Achados por gravidade

### CRÍTICO

**C1 — `ADMIN_SECRET` único controla 213 endpoints de produção, sem trava de força bruta**
- Onde: `backend/routes/adminExec.js` (12.018 linhas, 213 rotas, todas atrás de um único
  middleware em `router.use(...)`, linha ~41-52).
- O que pode acontecer: o header `x-admin-secret` é comparado com `timingSafeEqual`
  (bom, evita ataque de timing) e falha fechado se a env não estiver setada (bom). Mas
  não existe limite de tentativas por IP nem alerta de uso incomum — diferente do login
  normal, que tem `loginRateLimit` (8 tentativas/10min). Se o segredo vazar (ex.: ficou
  num script antigo, num print, num notebook), o invasor não precisa de usuário/senha
  de ninguém: com um `curl` ele já corrige estoque, reverte caixa, apaga importação de
  extrato, dispara cobrança em massa, etc. — 213 operações, muitas irreversíveis.
- Como corrigir:
  - Adicionar rate-limit por IP nesse router (mesmo padrão do `loginRateLimit.js`, 5-10
    tentativas/10min bloqueando o IP, não só a chave).
  - Registrar em log (ou no futuro `AuditLog`) toda chamada bem-sucedida a `admin-exec`
    com rota + IP + timestamp — hoje não há rastro de quem usou o quê.
  - Considerar restringir por IP de origem (seu IP de casa/escritório) via variável de
    ambiente, já que é uso interno seu.
- Esforço: **P** (rate-limit + log) a **M** (allowlist de IP).

**C2 — Backup para o Drive carrega segredos em texto puro**
- Onde: `scripts/backup-para-drive.sh` (compacta o projeto inteiro, incluindo `.env` e
  `backend/scripts/.admin-secret`, propositalmente — comentário do próprio script diz
  "leva também o que o git ignora").
- O que pode acontecer: o `.tgz` fica na pasta `CA-Hardt-Backups` do Google Drive sem
  senha nem criptografia. Qualquer pessoa/app com acesso a essa pasta do Drive (ou se a
  conta Google for comprometida) baixa o arquivo e tem, de uma vez: `JWT_SECRET`,
  `ADMIN_SECRET`, `CERT_ENC_KEY`, chaves do Asaas/Focus NFe/Z-API/Conta Azul e a
  `DATABASE_URL` do banco de produção.
- Como corrigir: criptografar o `.tgz` antes de copiar para o Drive (ex.:
  `gpg --symmetric` ou `openssl enc -aes-256-gcm` com uma senha guardada só localmente/
  gerenciador de senhas), ou separar o `.env`/`.admin-secret` num arquivo à parte
  criptografado, fora do pacote geral.
- Esforço: **P**.

### ALTO

**A1 — Upload de imagem de produto usa o `:id` da URL direto no caminho do arquivo**
- Onde: `backend/middlewares/uploadMiddleware.js:8` —
  `path.join(__dirname, '../uploads/produtos', produtoId)` com `produtoId = req.params.id`,
  usado sem sanitização antes de `fs.mkdirSync`. A rota é
  `POST /api/produtos/:id/imagens` (`backend/routes/produtoRoutes.js:36`) e o multer
  roda **antes** do controller validar se o produto existe.
- O que pode acontecer: como o Express decodifica `%2e%2e%2f` dentro do parâmetro antes
  de virar `req.params.id`, um usuário autenticado com permissão de editar produto
  (`produtos.edit`) poderia, em tese, mandar um `id` forjado contendo `..` e gravar um
  arquivo fora de `uploads/produtos/<id>/` (ex.: sobrescrever algo em `uploads/`).
  Precisa de permissão de edição de produto para explorar — não é anônimo — mas ainda
  assim é uma escrita de arquivo fora do previsto.
- Como corrigir: validar que `req.params.id` é um UUID (regex) antes do multer usar,
  ou usar `path.basename(produtoId)` na hora de montar o diretório, e confirmar que o
  caminho final resolvido continua dentro de `uploads/produtos` (`path.resolve` +
  checagem de prefixo).
- Esforço: **P**.

**A2 — Dependências com vulnerabilidades críticas/altas conhecidas**
- Onde: `npm audit` (rodado localmente, sem chamar produção):
  - Backend: **2 críticas** (`tar`, `fast-xml-parser`), **18 altas** (`axios`,
    `node-forge`, `form-data`, `@xmldom/xmldom`, `adm-zip`, `node-mde`, `nodemailer`,
    `path-to-regexp`, `pdfjs-dist`, `prisma`/`@prisma/config` versões dev, entre outras),
    5 moderadas.
  - Frontend: 14 altas (`axios`, `vite`, `rollup`, `react-router`/`react-router-dom`,
    `postcss`, `js-yaml`, `nanoid`, `browserslist`, `form-data`, `minimatch`,
    `picomatch`, `brace-expansion`, `flatted`), 5 moderadas, 2 baixas.
- O que pode acontecer: varia por pacote — de negação de serviço a manipulação de XML
  (relevante porque o projeto processa XML de NF-e via `node-mde`/`xml-crypto`) e
  falhas em parsing de PDF (`pdfjs-dist`, usado na impressão/DANFE). `node-forge` é o
  que lê o certificado A1 — vale checar o changelog da versão fixa antes de atualizar,
  por ser caminho sensível.
- Como corrigir: `npm audit fix` nos dois projetos (testar build depois — regra do
  projeto já cobre isso), revisando manualmente os que pedem major version
  (`node-mde`, `react-router`, `vite`) porque podem quebrar algo.
- Esforço: **M** (checar builds + regressão manual nos módulos fiscais e de impressão).

**A3 — CORS totalmente aberto**
- Onde: `backend/index.js:87-90` — `app.use(cors())` sem allowlist, com comentário no
  próprio código dizendo que é temporário ("revertido para destravar o app").
- O que pode acontecer: qualquer site pode fazer requisição ao backend a partir do
  navegador de um usuário logado (o token vem do `localStorage`/header `Authorization`,
  então CORS aberto sozinho não vaza o token — mas facilita phishing/clonagem de tela
  de login e ataques que dependem de CORS para ler resposta).
- Como corrigir: restringir a `origin` à lista real de domínios do app (produção +
  `localhost` em dev), como o próprio comentário já planeja.
- Esforço: **P**, mas exige testar com cuidado (é fácil travar o app pelo domínio errado).

### MÉDIO

**M1 — Token do webhook Asaas comparado sem `timingSafeEqual`**
- Onde: `backend/routes/asaasRoutes.js:55-57` —
  `req.headers['asaas-access-token'] !== token` (comparação direta), diferente do
  padrão usado no admin-exec e no webhook da Focus NFe (que usam hash + comparação em
  tempo constante).
- O que pode acontecer: ataque de timing teórico para descobrir o token caractere a
  caractere. Na prática, pela variação de latência de rede, é um risco baixo — mas é
  inconsistente com o padrão que o próprio projeto já adotou em dois outros lugares.
- Como corrigir: usar a mesma função `segredoConfere` (hash SHA-256 + `timingSafeEqual`)
  já existente em `adminExec.js`/`focusNfeWebhookRoutes.js` — vale extrair para um
  util compartilhado (`backend/utils/segredoConfere.js`) e reusar nos três lugares.
- Esforço: **P**.

**M2 — Chave de criptografia do certificado A1 cai para o `JWT_SECRET` se `CERT_ENC_KEY` não estiver setada**
- Onde: `backend/services/certificadoService.js:25-27`.
- O que pode acontecer: não é uma falha imediata (o `/ping` do admin-exec já mostra se
  `CERT_ENC_KEY` está configurada — `certEncKeyConfigurada`), mas se nunca foi setada,
  a senha do certificado A1 está protegida pela mesma chave que assina os tokens de
  login — comprometer uma expõe a outra.
- Como corrigir: confirmar no EasyPanel que `CERT_ENC_KEY` está definida (o próprio
  `/api/admin-exec/ping` já informa isso — vale checar uma vez) e, se não estiver,
  gerar uma chave nova e re-criptografar o certificado já salvo.
- Esforço: **P**.

**M3 — `npm audit` não roda em CI/checklist** — depende de alguém lembrar de rodar.
- Como corrigir: adicionar ao checklist de entrega (ou a um hook) rodar `npm audit`
  periodicamente — não precisa ser a cada commit, mas mensal é razoável.
- Esforço: **P**.

### BAIXO

**B1 — Log de todo request (`console.log` do método+URL) em produção**
- Onde: `backend/index.js:101-105` — loga método e URL de toda chamada `/api`, o que
  inclui querystrings com CPF/CNPJ, telefone e tokens de link público
  (`/lista/:token`, `/ponto-publico/:token`) nos logs do servidor.
- O que pode acontecer: dado pessoal (LGPD) e tokens de acesso público acabam nos logs
  do EasyPanel, que podem ter retenção/acesso mais amplo do que o banco.
- Como corrigir: mascarar querystring/token nesse log, ou logar só o path sem query.
- Esforço: **P**.

**B2 — Link público do Catálogo Personalizado (`/lista/:token`)**
- Onde: `backend/routes/catalogoPersonalizadoPublicRoutes.js` +
  `catalogoPersonalizadoService.js` — token aleatório de 7 caracteres nas primeiras
  tentativas, crescendo para 9 em colisão (`crypto.randomBytes`, bom uso). Sem rate
  limit dedicado nessa rota específica.
- O que pode acontecer: token de 7 caracteres alfanuméricos tem espaço grande o
  suficiente para não ser adivinhado por tentativa manual, mas não há limite de
  requisições — um scanner automatizado poderia, em tese, varrer tokens. Risco baixo
  na prática (o problema seria alguém varrer *muitos* tokens de uma vez).
- Como corrigir: rate-limit leve por IP nessa rota pública (mesmo padrão de outras
  rotas públicas do projeto).
- Esforço: **P**.

**B3 — Certificado de dependência dev/beta em produção**
- `@prisma/config`/`prisma` apareceram no `npm audit` numa faixa de versão de
  pré-release (`6.13.0-dev.1 - 8.1.0-dev.4`) — provavelmente uma dependência transitiva
  de alguma ferramenta de dev, não a versão real do Prisma usada (confirmar).
- Como corrigir: `npm ls prisma @prisma/config` para confirmar que não é a versão
  instalada de fato, só ruído do audit.
- Esforço: **P** (é só conferir).

---

## 3. O que já está bem feito (preservar)

- **Login**: senha com `bcryptjs`, JWT sem fallback hardcoded (derruba o servidor se
  `JWT_SECRET` faltar — decisão correta), trava de força bruta por IP+login
  (`loginRateLimit.js`), permissões revalidadas no banco a cada request (revogação
  imediata, sem esperar o token expirar).
- **Permissões objeto, não booleano**: o bug histórico (`!!permissoes.produtos`) foi
  corrigido e generalizado — `backend/middlewares/permissaoProdutos.js` e
  `permissaoCategoriasProduto.js` já usam o padrão correto (`permissoes.produtos?.edit`)
  com comentário explicando o motivo. Não achei mais nenhum lugar com o padrão antigo
  nas rotas revisadas.
- **Certificado digital A1**: nunca servido por `/uploads/certificado` (bloqueado
  explicitamente com 403 em `index.js`), armazenado com AES-256-GCM, chave derivada de
  variável de ambiente.
- **Webhooks (Focus NFe, Asaas)**: segredo próprio por integração, falha fechada se a
  variável não estiver configurada, comparação em tempo constante na Focus NFe.
- **`admin-exec`**: comparação do segredo com hash + `timingSafeEqual` (evita timing
  attack), fail-closed se `ADMIN_SECRET` não estiver setado.
- **Segredos fora do git**: `.gitignore` cobre `.env`, `.env.*`, `.admin-secret`; não
  encontrei nenhuma chave/senha real versionada no código (busca por padrões de chave
  de API, PEM, tokens Slack, segredo hardcoded — só falsos positivos em comentário/log).
- **API de IA externa**: chave própria (`x-ia-api-key`), separada do `ADMIN_SECRET`,
  com identificação de cliente por telefone batendo (nunca só CNPJ/CPF) — bom contrato
  de privacidade documentado.
- **Uploads sensíveis**: rotas de `certificado`, `notas-xml` e `cache-fiscal` bloqueadas
  explicitamente antes do `express.static` genérico.

---

## 4. Proposta — tela "Central de Segurança" (Configurações)

Uma tela nova, só para quem tem `permissoes.admin`, reunindo o que hoje está espalhado
entre banco, logs de servidor e memória do dono. Blocos sugeridos:

**Bloco 1 — Usuários e acesso**
- Tabela: nome, login, status (ativo/inativo), último login (precisa gravar
  `ultimoLoginEm` no `Vendedor` — hoje não existe), perfil de permissão.
- Filtro: "logou nos últimos 30 dias" / "nunca logou" / "inativo com permissão sensível".

**Bloco 2 — Permissões sensíveis (quem pode o quê)**
- Lista fixa das permissões "de risco" já existentes no sistema (`Pode_Dar_Desconto_
  Baixa`, `Pode_Autorizar_Diferenca_Caixa`, `Pode_Excluir_*`, `admin`, `produtos.edit`)
  e, para cada uma, quem tem hoje — puxando do `BOOL_INDEX`/painel de permissões que já
  existe. Alerta visual se alguém inativo ainda aparecer com permissão sensível.

**Bloco 3 — Histórico de ações críticas (audit log)**
- Lista cronológica do `AuditLog` (hoje grava caixa/produtos/contas a receber/config-
  notas/canhotos/pedidos) + o que for adicionado das chamadas `admin-exec` (achado C1).
  Colunas: quando, quem, ação, entidade afetada, detalhe. Filtro por usuário/ação/data.

**Bloco 4 — Backup**
- Status do último backup do banco (15 min) e uploads (diário) — já existe rota de
  diagnóstico conforme memória do projeto; só precisa de card visual: "última cópia:
  há X min, OK" / "FALHOU — última tentativa Y".
- Status do backup para o Drive (`scripts/backup-para-drive.sh`) — data do último
  `.tgz`, tamanho, se está criptografado (depois do achado C2 ser corrigido).

**Bloco 5 — Certificado digital A1**
- Validade (já extraída no upload — `certificadoService.js` lê isso do PFX), dias
  restantes, alerta em amarelo/vermelho a partir de 30/7 dias antes de vencer.
  `CERT_ENC_KEY` configurada ou não (booleano, sem mostrar o valor).

**Bloco 6 — Integrações e segredos (saúde, não valor)**
- Grade com cada integração (Conta Azul, Focus NF-e, Asaas, Z-API/bot WhatsApp, Google
  Drive) mostrando só: configurada (sim/não) e último uso com sucesso/erro — reusando o
  que `/api/admin-exec/ping` já expõe como booleano. **Nunca mostrar o valor do
  segredo na tela**, só o status.

**Bloco 7 — Sessões ativas** (opcional, exige mudança maior)
- Como hoje o JWT não é revogável antes de expirar, esse bloco ficaria como "não
  disponível ainda" ou exigiria migrar para sessão com registro em banco — marcar como
  item futuro, não bloquear a entrega dos outros blocos por causa dele.

---

## 5. Plano de 30 dias (ordem de prioridade)

**Semana 1 — parar o sangramento (C1, C2)**
1. Criptografar o `.tgz` do backup para o Drive (ou tirar `.env`/`.admin-secret` dele).
2. Rate-limit por IP em `admin-exec` (reusar `loginRateLimit.js` como modelo) + log de
   toda chamada bem-sucedida.
3. Conferir se `CERT_ENC_KEY` está de fato setada em produção (`/api/admin-exec/ping`).

**Semana 2 — fechar brechas concretas (A1, A3, M1)**
4. Validar/sanear `:id` no upload de imagem de produto (A1).
5. Trocar comparação do token do webhook Asaas para `timingSafeEqual` (M1) — e extrair
   `segredoConfere` para um util compartilhado.
6. Restringir CORS à lista real de domínios (A3) — testar com cuidado em homologação
   antes de subir.

**Semana 3 — dependências (A2)**
7. `npm audit fix` no backend e no frontend, rodar o build (`cd frontend && npm run
   build`) e testar manualmente os módulos que tocam nos pacotes afetados: impressão/
   DANFE (`pdfjs-dist`), certificado (`node-forge`), captura de XML SEFAZ (`node-mde`,
   `xml-crypto`), rotas (`react-router`).

**Semana 4 — Central de Segurança (mockup → tela real) + LGPD**
8. Implementar a tela descrita na seção 4 (começar pelos blocos 1, 3 e 5 — os que já
   têm dado pronto no banco).
9. Mascarar querystring nos logs de request (B1).
10. Adicionar rate-limit leve na rota pública do Catálogo Personalizado (B2).

**Item recorrente, não é tarefa única:** rodar `npm audit` uma vez por mês e revisar o
que apareceu de novo.

---

## Confirmação

Esta revisão foi **somente leitura**: nenhum arquivo do projeto foi criado, editado ou
apagado, nenhuma rota de produção foi chamada (só `npm audit`, que consulta o índice
público do npm a partir das dependências locais do projeto), e nenhum valor de segredo
foi copiado para este relatório — onde um padrão de segredo apareceu em busca, cito só
o arquivo e o nome da variável.
