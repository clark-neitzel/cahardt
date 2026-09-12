# Relatório de Conexões Externas — CA-Hardt
**Consultoria de integrações · 12/09/2026 · Leitura de código, sem chamadas à produção**

---

## 1. Diagnóstico em 10 linhas

1. O app tem **17 integrações externas reais** rodando hoje, a maioria concentrada em `backend/services/` com 1 arquivo por integração — organização boa, fácil de auditar.
2. O padrão mais maduro do repo é o **bot WhatsApp da Ana** (`botWhatsappService.js`): timeout, fila com backoff, idempotência por referência, auditoria em tabela própria — é o gabarito a copiar para as outras.
3. **Conta Azul** é a integração mais crítica e mais frágil: 2 segredos hardcoded como fallback no código-fonte, token renovado a cada 45min sem alerta se falhar, e ainda dispara 6 workers automáticos mesmo estando "somente leitura" desde 07/2026.
4. **Webhooks** têm dois padrões diferentes de segurança: Focus NF-e usa comparação em tempo constante (correto); Asaas usa `!==` simples (vulnerável a timing attack, risco baixo mas evitável).
5. **Nenhuma tela única mostra a saúde das integrações.** Cada uma tem seu canto: WhatsApp tem card em Configurações, certificado A1 tem card próprio, Conta Azul tem Painel de Sync, Focus só tem uma rota de diagnóstico sem UI — o dono não tem visão de conjunto.
6. **Certificado A1** já tem alerta proativo de vencimento (bom exemplo). **Token OAuth do CA** e **token do GitHub no EasyPanel** não têm — a falha só aparece quando algo já quebrou.
7. Há **duplicidade de dado de contato do cliente** (telefone antigo × WhatsApp validado) e uma tabela espelho (`cliente_whatsapps`) que depende de disciplina manual para não dessincronizar.
8. O **OSRM** (roteirização) roda hoje no fallback público (`router.project-osrm.org`, "sem SLA") quando `OSRM_URL` não está configurada — risco silencioso de rota parar de funcionar.
9. Código morto de integrações desligadas é pequeno e bem controlado: só sobrou nome de função e documentação, não lógica ativa (BotConversa).
10. O ganho mais barato de valor não é integração nova — é **consolidar visibilidade** (Central de Conexões) e **fechar as 3-4 fragilidades concretas** listadas abaixo antes de somar mais conexões.

---

## 2. Tabela de todas as conexões

| Nome | Para que serve | Direção | Autenticação | Onde está | Fila/retry? | Tela de status? | Alerta se cair? | Risco | Observação |
|---|---|---|---|---|---|---|---|---|---|
| **Conta Azul** | Histórico de vendas/financeiro (somente leitura desde 07/2026); import de XML antigo; sync de baixas de contas antigas | Ambas (leitura ativa; escrita desligada por `CA_SOMENTE_LEITURA`) | OAuth2 (client_id/secret + refresh token em `contaAzulConfig`) | `backend/services/contaAzulService.js`, `contasReceberSyncService.js`, `contasPagarCaSyncService.js` | Sim — workers com `setInterval`, sem fila persistida para leitura | `frontend/src/pages/Admin/Sync/PainelSync.jsx` | Não — falha de refresh só vira log (`syncLog`) e exceção lançada na próxima chamada | **A** | Client ID/Secret com fallback hardcoded no código (ver §3) |
| **Focus NF-e** | Emissão de NF-e (venda, devolução, bonificação) | Sai (emitir) + Entra (webhook de status) | Token por ambiente (env) + segredo do webhook (`x-focus-secret`) | `backend/services/focusNfeEmissaoService.js`, `focusNfeService.js`, `routes/focusNfeWebhookRoutes.js` | Webhook: reenvio automático da Focus (1min→24h) se não responder 2xx; emissão: idempotência por `ref` | Só diagnóstico via `/admin-exec` (sem tela) | Não | **A** | Webhook com comparação em tempo constante — correto |
| **SEFAZ DF-e (certificado A1)** | Captura de NF-e/NFS-e recebidas, manifestação do destinatário, consulta de IE | Entra (consulta) + Sai (manifestação) | Certificado .pfx criptografado (AES-256-GCM) em disco | `backend/services/sefazDfeService.js`, `nfseAdnService.js`, `manifestacaoHomologacaoService.js`, `certificadoService.js` | Trava de intervalo (padrão 3h) evita `cStat 656`; fila de buscas agendadas por chave | `NotasCertificadoConfig.jsx` (Configurações) | **Sim** — alerta de vencimento do certificado (`certificadoService.js:192-252`) | **A** | Único ponto do sistema com alerta proativo de expiração — bom padrão a copiar |
| **Asaas** | Boleto/PIX de cobrança, conciliação de extrato | Ambas (gera cobrança + recebe webhook) | API key (env) + token do webhook (`asaas-access-token`) | `backend/services/asaasService.js`, `asaasBaixaService.js`, `asaasExtratoService.js`, `routes/asaasRoutes.js` | Worker de retentativa de baixas pendentes a cada 10min | Card no Financeiro (parcial) | Não | **A** | Webhook comparado com `!==` simples, não tempo-constante (ver §3) |
| **Bot da Ana (Z-API)** | Todo WhatsApp transacional do sistema | Sai | API key fixa (header `x-api-key`) | `backend/services/botWhatsappService.js`, `webhookService.js` | **Sim, modelo de referência**: fila `bot_whatsapp_envios`, backoff 5min→6h, até 6 tentativas | Configurações → Notificação WhatsApp | Sim — tela mostra status/fila/erros recentes | **M** | Melhor integração do repo em robustez |
| **Google Drive** | Backup automático (banco+uploads) + XML da contabilidade | Sai | OAuth (client id/secret/refresh token em `app_configs.gdrive_config`) | `backend/services/googleDriveService.js`, `backupService.js` | Best-effort, erros só logados, não derruba operação | Card "Backup automático" em Configurações | Parcial — memória do projeto cita alerta de falha 3x no backup | **M** | Desenhado para nunca travar a nota fiscal, mas isso também esconde falha silenciosa se ninguém olhar o log |
| **SMTP Hostinger** | E-mail (régua de cobrança e outros avisos) | Sai | Usuário/senha em `app_configs.email_config` | `backend/services/emailService.js` | Não — 1 tentativa, `enviar()` nunca lança, quem chama decide | Não | Não | **B** | Uso pontual (régua de cobrança); baixo volume, baixo risco |
| **API de consulta p/ IA externa (Antigravity)** | IA de WhatsApp consulta catálogo/cliente/pedido | Entra | API key própria (`x-ia-api-key`, distinta do ADMIN_SECRET) | `backend/routes/iaConsultaRoutes.js` | N/A (leitura) | Não | Não | **A** | Contrato versionado (`/v1`, avisos de depreciação) — bem desenhado, mas sem tela de monitoramento de uso/erros |
| **Receita Federal (busca CNPJ)** | Preenche cadastro de cliente/fornecedor a partir do CNPJ | Entra | Sem chave (consulta pública) | `backend/services/consultaCnpjService.js` | Desconhecido (não lido em detalhe) | Não | Não | **B** | Dependência de disponibilidade de terceiro público |
| **OSRM (roteirização)** | Cálculo de rota/distância p/ motorista e divisão de cargas | Sai | Sem chave | `backend/services/osrmService.js` | Timeout 10s + lock global de 1 uso por vez | Não | Não | **M** | **Usa servidor demo público (`router.project-osrm.org`) quando `OSRM_URL` não está setada — "sem SLA" no próprio comentário do código** |
| **Google Maps** | Link de mapa para endereço/rota (não roteirização) | Sai (link externo) | Sem integração de API paga identificada | Referências no frontend (links) | N/A | N/A | N/A | **B** | Não é API integrada, é `window.open` para link externo — ver §6 para viabilidade de Traffic API |
| **admin-exec** | Canal de operação remota (diagnóstico, scripts administrativos) | Ambas | `ADMIN_SECRET` fixo, comparação em tempo constante | `backend/routes/adminExec.js` | N/A | N/A (é o próprio canal de diagnóstico) | N/A | **A** | Superfície ampla — qualquer rota nova aqui herda o mesmo segredo único |
| **GitHub (deploy EasyPanel)** | Fonte do build de produção | N/A (infra) | Token OAuth do EasyPanel para o repo | Fora do código (config do EasyPanel) | N/A | Não | Não | **A** | Memória do projeto registra que o token **já expirou sem aviso** e travou deploy (`reference_easypanel_github_token.md`) |
| **IA do Clippy / Análise IA** | Assistente de navegação + análise de clientes | Sai (chamadas a LLM) | `OPENAI_API_KEY`/`GEMINI_API_KEY` | `backend/services/copilotoService.js`, `aiProvider.js`, `clienteInsightService.js`, `orientacaoService.js` | Não — falha vira mensagem "IA não configurada" | Não | Não | **B** | Provider trocável por env, bem abstraído |
| **Kit Festa / Site de Congelados (público)** | Vitrine pública + pedido self-service | Entra | Sem auth (rotas públicas) / token de sessão do site | `routes/kitFestaPublicRoutes.js`, `congeladosPublicRoutes.js` | N/A | N/A | N/A | **M** | Superfície pública — validar rate limit não é escopo deste relatório mas vale nota |
| **Backup automático (interno)** | Cópia do banco (15min) e uploads (diário) | Sai (grava no Drive) | Reusa credencial do Google Drive acima | `backend/services/backupService.js` | Sim, com alerta de falha (3x) por WhatsApp segundo memória do projeto | Card em Configurações | Sim | **M** | — |

---

## 3. Fragilidades concretas (com arquivo:linha)

**Segredo do Conta Azul com fallback no código-fonte** — risco alto porque é o par client_id/secret de uma conta OAuth real:
```
backend/services/contaAzulService.js:12
const CLIENT_ID = process.env.CONTA_AZUL_CLIENT_ID || '<valor fixo no código, omitido aqui>';
backend/services/contaAzulService.js:13
const CLIENT_SECRET = process.env.CONTA_AZUL_CLIENT_SECRET || '<valor fixo no código, omitido aqui>';
```
Está commitado no git há tempo (não é vazamento novo desta sessão), mas continua sendo o padrão "segredo em lugar errado" do checklist. Recomendação: girar o secret no painel Conta Azul e remover o fallback, deixando só `process.env.CONTA_AZUL_CLIENT_SECRET` — sem valor, a função já lança erro ("Conta Azul não conectada").

**Webhook Asaas sem comparação em tempo constante:**
```
backend/routes/asaasRoutes.js:55-56
const token = process.env.ASAAS_WEBHOOK_TOKEN;
if (!token || req.headers['asaas-access-token'] !== token) {
```
Comparar com `!==` vaza timing information (diferença de nanosegundos por byte) — risco baixo na prática (rede introduz ruído), mas o próprio Focus webhook ao lado (`focusNfeWebhookRoutes.js:21-25`) já usa `crypto.timingSafeEqual`. Vale replicar o mesmo helper.

**Falha de refresh do token OAuth do Conta Azul não gera alerta proativo** — só grava em `syncLog` e lança exceção na chamada seguinte:
```
backend/services/contaAzulService.js:117-127
console.error('❌ FALHA CRÍTICA AO RENOVAR TOKEN:', data);
throw new Error('Sua sessão com a Conta Azul expirou. Reconecte no painel.');
```
Comparar com o certificado A1, que tem alerta proativo dedicado (`certificadoService.js:192-252`, roda a X dias antes de vencer). O CA não tem equivalente — o dono só descobre quando algo que depende de leitura do CA falha na tela.

**OSRM sem URL própria cai no servidor demo público, silenciosamente:**
```
backend/services/osrmService.js:13-14
// Se o serviço OSRM não estiver configurado, usa o servidor demo público (sem SLA)
const OSRM_URL = process.env.OSRM_URL || 'http://router.project-osrm.org';
```
Não há log de "está usando o servidor demo" nem alerta — se `OSRM_URL` nunca foi setada em produção (não verificado aqui, é leitura de código local), a roteirização inteira depende de um serviço público sem garantia de uptime, sem chave, sem contrato.

**Token do GitHub no EasyPanel expira sem aviso prévio** — não é um bug de código, é ausência de monitoramento de infraestrutura. Confirmado pela própria memória do projeto (`reference_easypanel_github_token.md`): quando o token vence, o sintoma é "Github token invalid" no meio de um deploy, descoberto na hora, não antes.

**Certificado A1 tem alerta de vencimento, mas o alerta é só WhatsApp/e-mail interno** (não verificado o canal exato neste código-fonte além da função) — não há campo na Central de Conexões proposta (§5) mostrando "vence em X dias" de forma visual/consultável a qualquer momento, só o alerta reativo quando o prazo se aproxima.

**API de consulta para IA externa sem tela de monitoramento de uso** — o contrato (`iaConsultaRoutes.js`) está bem versionado e documentado, mas não há onde o dono veja volume de chamadas, erros 4xx/5xx recentes, ou se a Antigravity está batendo na API dentro do esperado — só existe se alguém for ler log de servidor.

**Admin-exec é um segredo único para superfície ampla** — `backend/routes/adminExec.js:40-53` protege corretamente com fail-closed e comparação segura, mas é uma única chave que dá acesso a scripts administrativos variados (a rota tem mais de 11 mil linhas de sub-handlers, `adminExec.js:11066` em diante). Não é um problema de implementação, é um risco de concentração — se esse segredo vazar, o raio de ação é grande.

---

## 4. Duplicidades

**CA somente leitura, mas ainda roda 6 workers automáticos** (`backend/workers/scheduler.js:1-140`): keep-alive de token (45min), auto-sync de produtos (1h), auto-sync de pedidos modificados (15min), worker de fila de pedidos (30s), auto-sync de baixas de contas a receber (1h), workers de fornecedores/despesas/baixas de contas a pagar (60s-30min). Todos legítimos hoje (contas antigas ainda vivem no CA, conforme a chave `contaAzulModo.js` documenta), mas é uma superfície de manutenção grande para uma integração "em saída". Nenhuma ação recomendada além de manter mapeado — o próprio comentário do arquivo já explica por que cada um ainda existe.

**Telefone × WhatsApp do cliente em dois lugares**: `clientes.Telefone` (antigo, texto livre) e `clientes.Telefone_Celular` + tabela espelho `cliente_whatsapps` (`schema.prisma:282-338`) que guarda a situação de validação do WhatsApp. O próprio schema documenta o risco: "quem MAIS grava Telefone_Celular hoje... se um fluxo novo passar a gravar Telefone_Celular, chame `sincronizarTemNumero` junto — senão desincroniza". É duplicidade proposital (histórico + validado), mas depende de disciplina de quem mexe no código, não de garantia estrutural (não há trigger de banco, é convenção).

**Clientes × Leads são modelos Prisma separados** (`model Cliente` linha 154, `model Lead` linha 1416) — arquitetura correta para o propósito (lead ainda não é cliente), sem indício de duplicação indevida de dado nesta leitura.

**Código morto de integração desligada (BotConversa)**: a varredura no repo encontrou só 4 referências, todas documentação ou nome de função preservado por design (`webhookService.js`, `botWhatsappService.js` citam BotConversa apenas em comentário histórico; `.env.example` e `migrationService.js` também são textuais). Não há lógica ativa de BotConversa rodando — a "duplicidade" aqui é só textual/histórica, não redundância de fato.

**Sincronizações que rodam sem necessidade aparente**: o único candidato real é o **auto-sync de produtos do CA a cada 1h** (`scheduler.js:24-37`) — como o CA está em saída, vale o dono confirmar se ainda precisa vir de lá ou se o cadastro de produto já é 100% local (como já é o de clientes desde 07/2026, conforme comentário do próprio `contaAzulService.js:26-27`). Não alterei nada — é uma pergunta para o dono decidir, não uma conclusão fechada.

---

## 5. Proposta de "Central de Conexões"

**O que já existe hoje, espalhado:**
- Configurações → **Notificação WhatsApp** (bot da Ana): status de conexão, envios na última hora, tamanho da fila — o mais completo que existe.
- Configurações → **Notas & Certificado Digital**: validade do certificado A1, alerta de vencimento.
- Configurações → **Backup automático**: status do backup ao Google Drive.
- Admin → **Painel de Sync**: histórico de sincronização com o Conta Azul (`syncLog`).
- `/api/admin-exec/focus-nfe-status` (e afins): diagnóstico da Focus NF-e, mas **só via curl/admin-exec, sem tela**.
- Asaas, SMTP, API de IA externa, OSRM, GitHub/EasyPanel: **sem tela nenhuma** hoje.

**Proposta — uma tela nova em Configurações → "Central de Conexões":**

Um card por integração, em grid responsivo (2 colunas mobile, 4 desktop, seguindo o design system do projeto), cada card com:

1. **Bolinha de status** (verde/amarelo/vermelho) — verde = última troca de dado com sucesso dentro do esperado; amarelo = fila com pendências ou dado desatualizado além do normal; vermelho = erro confirmado ou credencial ausente/expirada.
2. **Nome + ícone da integração** (Conta Azul, Focus NF-e, SEFAZ/Certificado, Asaas, Bot WhatsApp, Google Drive, SMTP, IA externa, OSRM).
3. **"Última troca com sucesso"** — data/hora relativa ("há 4 min", "há 2 dias").
4. **Fila pendente** — número (ex.: "3 mensagens na fila", "1 despesa aguardando envio ao CA") quando a integração tiver fila.
5. **Erros recentes** — últimos 3, resumidos (mensagem curta + hora), expansível para o log completo.
6. **Validade** — quando aplicável (certificado A1: dias até vencer; token do CA: não expira mas mostra "conectado desde"; nenhuma integração hoje expõe token do GitHub, mas caberia aqui também).
7. **Botão "Testar"** — dispara uma chamada leve (ping/health-check) e mostra resultado na hora, sem esperar o próximo ciclo do worker.
8. **Botão "Reprocessar fila"** — só aparece em integrações com fila (Bot WhatsApp, workers do CA, Asaas retentativa) — dispara o processamento imediato em vez de esperar o próximo `setInterval`.

**Fonte de dados**: a maior parte já existe (tabelas `syncLog`, `bot_whatsapp_envios`, `focus_nfe_eventos`, config do certificado) — a tela nova seria principalmente um agregador de leitura, não um sistema de monitoramento do zero. O trabalho real é: (a) criar as rotas de "testar"/"status" que faltam (Asaas, SMTP, OSRM não têm hoje), e (b) um componente de card reutilizável.

---

## 6. Novas conexões — viabilidade e valor

| Ideia | Viabilidade | Valor | Comentário |
|---|---|---|---|
| **WhatsApp oficial (Meta Cloud API)** | Média — exige conta Business verificada, número dedicado (não pode ser o número da Ana) | Alto | É a saída correta para qualquer mensagem proativa (promoção, lembrete de recompra) que o contrato atual do bot da Ana proíbe explicitamente. Não substitui o bot da Ana — complementa. |
| **Pix automático conciliado (Open Finance / extrato bancário direto)** | Média-Alta — depende do banco ter Open Finance habilitado | Alto | Hoje a conciliação de extrato é por importação OFX manual (`caExtratoService`, memória do projeto). Substituir por extrato automático eliminaria um passo manual recorrente — mas é trabalho de integração bancária nova, não pequeno. |
| **E-mail de NF ao cliente (automático no faturamento)** | Alta — SMTP já existe e funciona | Médio | Hoje o `emailService.js` está pronto mas de uso pontual (régua de cobrança). Anexar o XML/DANFE da NF-e ao e-mail automático na emissão é reuso direto da infra existente — baixo esforço, ganho de atendimento. |
| **Impressora térmica de etiqueta em rede** | Média — depende do modelo (ESC/POS vs. driver proprietário) | Alto para PCP | O sistema já tem `EtiquetaLabel.jsx`/`pcpEtiquetaRoutes.js`; imprimir direto numa impressora de rede (sem passar pelo navegador) eliminaria etapa manual na produção. Vale um piloto com 1 impressora antes de generalizar. |
| **Leitor de código de barras (USB/Bluetooth já suportado por navegador como teclado)** | Alta — já parcialmente em uso (`code128.js`, canhoto por bipe) | Médio | Não é bem "integração externa" — leitor USB/BT emula teclado, já funciona sem API. Expandir o uso (conferência de estoque, separação) é mais UX do que integração nova. |
| **Google Agenda do PCP** | Média | Baixo-Médio | PCP já tem `pcpAgendaService.js` próprio; espelhar num Google Agenda compartilhado ajuda só se a equipe já vive dentro do Google Workspace no dia a dia — perguntar ao dono se faz sentido antes de construir. |
| **Google Maps Traffic API** | Alta (API paga por uso) | Baixo | OSRM já resolve distância/rota; trânsito em tempo real teria valor só se a divisão de carga/rota reagisse a ele dinamicamente — hoje não reage. Melhor investir primeiro em configurar `OSRM_URL` própria (fragilidade do §3) do que somar Google Maps. |

**Prioridade sugerida por esforço×valor**: e-mail de NF automático (baixo esforço, já tem a infra) → Pix conciliado automático (alto valor, esforço maior) → impressora térmica em rede (piloto contido) → WhatsApp oficial Meta (só quando houver necessidade real de proativo).

---

## 7. Plano de 60 dias

**Semana 1-2 — Fechar fragilidades de segurança/segredo (baixo esforço, alto retorno):**
- Girar client_id/secret do Conta Azul no painel deles e remover o fallback hardcoded (`contaAzulService.js:12-13`).
- Trocar a comparação do webhook Asaas para `timingSafeEqual` (copiar o helper do Focus).
- Configurar `OSRM_URL` própria em produção (ou confirmar que já está configurada e documentar isso) — eliminar dependência do servidor demo público.

**Semana 2-4 — Alertas proativos que faltam:**
- Alerta de falha de refresh do token OAuth do Conta Azul (mesmo canal do alerta de certificado A1 — reaproveitar o padrão).
- Investigar se dá para monitorar a validade do token do GitHub/EasyPanel (mesmo que seja só um lembrete de calendário para o dono renovar antes de vencer, já corta o sintoma "descobri no meio do deploy").

**Semana 3-6 — Central de Conexões (a tela):**
- Levantar/expor rotas de "status" e "testar" que faltam (Asaas, SMTP, OSRM, IA externa) — a maioria é leitura de dado que já existe em tabela.
- Construir o componente de card e a tela agregadora, reaproveitando os cards que já existem (WhatsApp, certificado, backup) dentro do novo layout.
- Botão "reprocessar fila" ligado às filas que já existem (bot WhatsApp, Asaas retentativa, workers de contas a pagar/CA).

**Semana 5-8 — Primeira conexão nova de valor imediato:**
- E-mail de NF-e ao cliente no faturamento (reuso do `emailService.js` já existente) — menor esforço da lista do §6, ganho direto de atendimento.
- Avaliar com o dono, com números reais de uso, se vale abrir a frente de Pix conciliado automático ou impressora térmica como próximo passo depois do piloto de e-mail.

**Fora do prazo de 60 dias, decisão do dono**: WhatsApp oficial (Meta Cloud) só entra na conversa se surgir necessidade real de mensagem proativa — não é algo para construir preventivamente dado o risco de banimento já vivido pelo número atual.

---

## Confirmação final

Este relatório foi produzido **somente por leitura de código** dentro de `~/Projetos/CA-Hardt` (nunca na cópia do Google Drive). **Nenhum arquivo foi alterado, nenhuma chamada foi feita à produção, e nenhum valor de segredo foi copiado para este documento** — onde um segredo hardcoded foi encontrado (Conta Azul), citei apenas o arquivo e a linha, não o valor.
