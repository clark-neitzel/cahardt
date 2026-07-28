# CA-Hardt — Architecture Case Study

> **Documento de apoio para perfil profissional (LinkedIn) e apresentações técnicas.**
> Elaborado a partir da análise direta do código-fonte, do schema do banco, do histórico de
> 1.648 commits e da documentação interna do repositório em 28/07/2026.
>
> **Legenda de confiabilidade usada em todo o documento:**
> - ✅ **Confirmado** — verificado diretamente no código, banco ou histórico do repositório.
> - 🔎 **Inferido** — conclusão técnica razoável a partir das evidências, sem confirmação explícita.
> - ❓ **Não confirmado** — precisa ser respondido pelo dono do sistema (lista completa na seção 16).
>
> **Privacidade:** este documento não contém nomes de clientes, telefones, documentos,
> credenciais, chaves, tokens, endereços de servidor nem valores financeiros reais.

---

## 1. Visão geral do sistema

| Item | Descrição | Status |
|---|---|---|
| Nome | **CA-Hardt** — ERP operacional da Hardt Salgados (indústria de salgados congelados) | ✅ |
| Problema que resolve | Operar de ponta a ponta uma indústria/distribuidora de alimentos: venda em campo, produção (PCP), estoque, expedição, entrega com cobrança na porta, caixa diário, financeiro completo (receber, pagar, conciliação bancária, DRE), nota fiscal, RH/ponto e atendimento ao cliente por WhatsApp | ✅ |
| Origem | Nasceu como camada complementar ao ERP comercial Conta Azul e evoluiu até assumir a operação: desde 07/2026 o cadastro de clientes, o faturamento e a numeração de pedidos são 100% do app (o Conta Azul passou a ser consultado em modo somente leitura) | ✅ |
| Quem utiliza | Vendedores em campo, motoristas/entregadores, equipe de escritório/caixa, produção, RH e gestão — além de **clientes finais** via páginas públicas (site Kit Festa, site B2B de congelados, catálogo de preços por link) e de uma **IA de atendimento via WhatsApp** que consome uma API dedicada | ✅ |
| Status | **Em produção, 24h por dia**, sustentando a operação diária da empresa | ✅ |
| Escala do código | ~68.400 linhas no backend + ~82.700 no frontend (JavaScript/JSX, sem dependências); 141 tabelas no banco; 72 grupos de rotas de API; 68 serviços de domínio; 146 telas | ✅ |
| Ritmo de desenvolvimento | 1.648 commits entre 10/02/2026 e 28/07/2026 (~5,5 meses) | ✅ |
| Como foi construído | Desenvolvimento conduzido por uma única pessoa **usando IA (Claude Code) como ferramenta principal de engenharia**, com regras de qualidade codificadas no repositório (CLAUDE.md) que a IA é obrigada a seguir: build antes de todo commit, teste em produção para gravação de arquivos, padrões de transação de banco, design system documentado | ✅ |
| Número de usuários ativos | — | ❓ |
| Volume de pedidos/mês | — | ❓ |

---

## 2. Usuários e perfis

| Perfil | Principais tarefas | Dispositivo típico | Status |
|---|---|---|---|
| **Vendedor de campo** | Criar pedidos e amostras na rua, consultar clientes/preços/estoque, registrar atendimentos e diário de visitas, acompanhar metas e comissão em dashboard próprio | Celular (PWA instalado) | ✅ |
| **Motorista/entregador** | Ver a rota do dia, dar checkout de entrega na porta (formas de pagamento reais, devoluções item a item, PIX gerado na hora via Asaas), registrar ponto GPS/foto de fachada do cliente | Celular (PWA) | ✅ |
| **Escritório / Caixa** | Conferir entregas e devoluções fisicamente, fechar o caixa diário, dar baixas, emitir boletos, conciliar extratos bancários, importar notas de entrada | iPad e desktop | ✅ |
| **Produção (PCP)** | Receitas versionadas, ordens de produção, agenda de produção, sugestões automáticas, etiquetas com código de barras | Desktop/tablet | ✅ |
| **RH** | Cadastro de funcionários, jornada, registro de ponto (com página pública), documentos, exames, atestados, currículos recebidos | Desktop | ✅ |
| **Gestão/dono** | Dashboard por perfil com abas de gestão, financeiro gerencial (DRE), saldos por conta, metas, auditoria | Desktop/celular | ✅ |
| **Cliente final** | Site público do Kit Festa (pedido com agenda de retirada/entrega, cupons, créditos, avaliação), site B2B de congelados com preço por cliente, catálogo de preços via link de WhatsApp | Celular | ✅ |
| **IA de atendimento (sistema externo)** | Bot de WhatsApp de outro projeto consulta catálogo, agenda, histórico e cria leads através de uma API dedicada e versionada (`/api/ia-consulta/v1`) | — | ✅ |

**Controle de acesso:** sistema próprio com **99 chaves de permissão granulares** (ex.: dar desconto na baixa, alterar adiantamento alheio), agrupáveis em perfis, com edição em lote e **histórico de alterações com "desfazer"**. A regra do projeto exige que o frontend espelhe exatamente a checagem do backend. ✅

---

## 3. Arquitetura de alto nível

```
Cliente final          Equipe (campo/escritório)         IA de WhatsApp (projeto externo)
   │                          │                                   │
   │  páginas públicas        │  PWA instalado (standalone)       │  API dedicada /ia-consulta/v1
   ▼                          ▼                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  FRONTEND — React 19 + Vite + Tailwind (PWA)                        │
│  servido por nginx (estáticos com hash imutável; index.html         │
│  no-cache; proxy /api e /uploads → mesma origem, sem CORS)          │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  BACKEND — Node.js + Express (monolito modular)                     │
│  72 routers · 68 services de domínio · autenticação JWT             │
│  worker interno (scheduler) com ~12 rotinas periódicas              │
│  filas persistidas em tabelas do próprio banco (retry + backoff)    │
└──────┬──────────────────────────────────────────────┬───────────────┘
       ▼                                              ▼
┌──────────────────┐        ┌───────────────────────────────────────┐
│  PostgreSQL      │        │  INTEGRAÇÕES EXTERNAS                 │
│  via Prisma ORM  │        │  · WhatsApp (bot próprio / Z-API)     │
│  141 modelos     │        │  · Asaas (boleto, PIX, webhooks)      │
│  + volume de     │        │  · Conta Azul (API v2, OAuth2)        │
│  uploads         │        │  · SEFAZ (DFe NF-e, certificado A1)   │
│  persistente     │        │  · Focus NFe (emissão de NF-e)        │
└──────────────────┘        │  · Google Drive (XML p/ contador)     │
                            │  · SMTP (e-mail de cobrança)          │
                            │  · OpenAI (assistente de ajuda)       │
                            └───────────────────────────────────────┘

Infraestrutura: containers Docker orquestrados pelo EasyPanel em VPS;
deploy por push no GitHub (build automático); banco PostgreSQL gerenciado
no mesmo painel. ✅
```

Pontos estruturais relevantes:

- **PWA de verdade, pensado para iOS:** service worker com estratégia "rede primeiro com prazo de 6s" para navegação (nunca prende o usuário em versão velha), cache imutável só para assets com hash, `/api` nunca interceptada e toda resposta de API com `Cache-Control: no-store` (o Safari em modo standalone congelava dados sem isso). ✅
- **Resiliência a deploy no cliente:** todo carregamento de tela usa um `lazy` com retry que, ao detectar chunk removido por deploy, limpa cache e recarrega uma única vez — elimina a "tela vermelha" clássica de SPA após publicação. ✅
- **Trabalho offline pontual:** inventário de estoque na câmara fria funciona sem sinal (rascunho em localStorage + envio idempotente por identificador de inventário — reenviar não duplica). ✅
- **Monitoramento:** logs estruturados por assunto no servidor + telas de diagnóstico internas (status da fila de WhatsApp, saúde de pontos GPS, rotas administrativas de diagnóstico). Não há APM/observabilidade de terceiros. ✅
- **Backup:** ❓ política de backup do banco não confirmada no repositório (presumivelmente do painel de hospedagem — 🔎).

---

## 4. Stack tecnológica

Todas as tecnologias abaixo foram verificadas nos `package.json` e no código. ✅

### Frontend
| Tecnologia | Onde/para quê |
|---|---|
| React 19 + React Router 7 | SPA com 146 telas, rotas carregadas sob demanda |
| Vite 5 | Build e dev server; assets com hash para cache imutável |
| Tailwind CSS 3 | Design system próprio documentado (tokens, botões, badges, tabelas, regras mobile-first) |
| lucide-react | Ícones |
| Leaflet | Mapas (rota de entregas, GPS de clientes) |
| FullCalendar | Agendas (produção, Kit Festa) |
| jsbarcode / qrcode / jsQR | Etiquetas de produção com código de barras, QR de conferência de embarque (gera e lê) |
| qz-tray | Impressão térmica de etiquetas direto na impressora |
| react-hot-toast | Feedback de ações |
| nginx | Servir estáticos + proxy de mesma origem para a API |

### Backend
| Tecnologia | Onde/para quê |
|---|---|
| Node.js + Express 4 | API REST monolítica modular (72 routers) |
| Prisma ORM 6 + PostgreSQL | 141 modelos; transações com timeout configurado; `db push` sem perda de dados como política de deploy |
| jsonwebtoken + bcryptjs | Autenticação (JWT) e hash de senhas |
| helmet + cors | Cabeçalhos de segurança |
| multer | Uploads (fotos, PDFs, XML) em volume persistente |
| node-mde | Distribuição DF-e da SEFAZ — busca automática de NF-e emitidas contra o CNPJ |
| node-forge | Manuseio do certificado digital A1 |
| fast-xml-parser / adm-zip | Processamento de XML de NF-e |
| @alexssmusica/node-pdf-nfe + pdf-lib | Geração de DANFE em PDF dentro do próprio app |
| googleapis | Envio automático de XML das notas para o Google Drive da contabilidade (OAuth) |
| nodemailer | E-mail de cobrança (régua) via SMTP |
| openai | Assistente de ajuda interno ("Clippy") que responde com base nos 67 manuais de tela mantidos no repositório |
| axios | Clientes HTTP das integrações |

### Ferramentas de desenvolvimento
- **Claude Code (IA)** como ferramenta central de desenvolvimento, governada por um arquivo de regras versionado no repositório (build obrigatório antes de commit, padrões de transação, regras de upload, design system, atualização automática de manuais). ✅
- ESLint, nodemon, patch-package. ✅

---

## 5. Módulos do ERP

Módulos verificados nas telas e rotas (todos ✅):

| Módulo | Objetivo | Observações de arquitetura |
|---|---|---|
| **Pedidos** | Venda com 4 tipos (Normal, Especial, Bonificação, Encaixe), fluxo de aprovação, numeração própria | Paginação incremental para listas grandes; validações de preço por tabela/condição |
| **Clientes** | Cadastro completo (busca automática por CNPJ na Receita + IE na SEFAZ via certificado), GPS com foto de fachada, insights de recompra | Desde 07/2026 o cadastro nasce no app |
| **Produtos / Preços / Promoções** | Catálogo, tabelas de preço, promoções com condições em grupo, margem por produto | Histórico de custo |
| **Estoque** | Movimentações, inventário offline, categorias | Correções retroativas auditáveis |
| **PCP (produção)** | Receitas **versionadas**, ordens com consumo de insumos, agenda, sugestões automáticas de produção, etiquetas | Versionamento evita "receita mudou depois da ordem" |
| **Expedição / Embarques** | Folha de embarque **versionada com QR code** — conferência só dentro do app; alerta de reimpressão | Controle de versão impresso vs. sistema |
| **Rota / Entregas** | Rota do motorista, checkout na porta (pagamento real, devolução item a item), cobrança em rota, roteirização | PIX gerado na hora sem baixa automática (baixa só na conferência do caixa — evita baixa em dobro) |
| **Caixa diário** | Conferência física de entregas e devoluções, adiantamentos protegidos por permissão + auditoria, fechamento | Caixa não fecha sem conferir devoluções |
| **Financeiro — Contas a Receber** | Parcelas, baixa parcial com ledger de pagamentos, desconto com permissão, boletos/PIX | Ledger `PagamentoParcela` (nunca sobrescreve, sempre registra) |
| **Financeiro — Contas a Pagar** | Espelho do receber + rateio por categoria de despesa, importação de histórico do ERP anterior | Classificação para DRE |
| **Conciliação bancária** | Importação de extrato OFX, matching com baixas (inclusive por identificador de transação do gateway), grupos de conciliação, transferências entre contas | Estorno de baixa desfaz a conciliação presa (integridade) |
| **DRE / Financeiro gerencial** | Grupos de DRE, categorias de despesa, visão por conta bancária | |
| **Notas fiscais — entrada** | Busca automática na SEFAZ (DF-e), entrada com vínculo fornecedor-produto, atualização de estoque e contas a pagar, XML para o Drive do contador | |
| **Notas fiscais — saída** | Emissão via Focus NFe (webhook de eventos), DANFE gerada no app | Migração forçada após bloqueio do ERP anterior |
| **Cobrança (régua)** | Régua configurável por forma de recebimento, worker diário, WhatsApp + e-mail, tarefa automática quando falha | |
| **WhatsApp** | Toda mensagem transacional (pedido, entrega, cobrança, boleto, código de verificação) via bot próprio com **fila persistida, idempotência por referência e backoff** | Regra de compliance rígida: só mensagem transacional provocada por ato recente do cliente |
| **RH / Ponto** | Funcionários, jornadas, ponto com página pública, documentos, exames, atestados, avaliações, currículos | |
| **Tarefas** | Tarefas de equipe com recorrência e anexos | |
| **Metas / Comissões** | Metas por vendedor/produto/cidade/promoção, configuração de comissão | |
| **Dashboards** | Tela inicial por perfil (gestão, vendedor, entregador) | |
| **Delivery** | Categorias, status e permissões próprias + webhook | |
| **Kit Festa (site público)** | E-commerce de encomendas com agenda de horários, bairros, cupons, créditos, avaliações e admin completo | |
| **Congelados B2B (site público)** | Catálogo com preço/condição por cliente, autenticação por telefone + código | |
| **Catálogo personalizado** | Vendedor gera link público com snapshot de preços para mandar no WhatsApp | |
| **Amostras, Veículos, Leads/Atendimentos, Análises com IA, Administração** | Módulos de apoio à operação | |

---

## 6. Fluxos críticos (ponta a ponta)

### 6.1 Pedido → entrega → caixa ✅
1. Vendedor cria o pedido no celular (validação de preço/condição/estoque conforme o tipo).
2. Pedido aprovado entra no embarque; folha impressa carrega **QR + número de versão** — se o embarque mudar depois de impresso, o app avisa para reimprimir.
3. Motorista faz o checkout na porta: registra a forma de pagamento **real** (dinheiro, PIX na hora, boleto), devoluções item a item.
4. Caixa confere fisicamente entregas e devoluções (divergência de devolução cobra do motorista; desconsiderar exige senha) e só então fecha o dia.
5. Baixa financeira acontece na conferência — nunca automática na rua — justamente para impedir baixa em dobro.

### 6.2 Boleto/PIX → confirmação ✅
1. App emite a cobrança no gateway (Asaas) e envia o link por WhatsApp.
2. Pagamento dispara **webhook** → baixa automática da parcela no app (e replicação da baixa no ERP contábil enquanto o vínculo existir).
3. Diferenças de centavos/juros são tratadas com regras explícitas (excedente vira juros; centavo a menos vira desconto) para a parcela sempre quitar de forma consistente.
4. Boleto vencido continua pagável — o sistema é proibido de tratá-lo como "sem boleto" e reemitir (regra criada após incidente real).

### 6.3 Mensagem de WhatsApp (qualquer fluxo) ✅
1. Serviço monta a mensagem e envia ao bot com `tipo` (auditável) e `referencia` única (**idempotência**: repetir não reenvia).
2. Falha reagendável (limite de envio/hora, instabilidade, modo de emergência) **não perde a mensagem**: entra em fila no banco como pendente e um worker reenvia com backoff progressivo (5min → 6h, até 6 tentativas).
3. Tela administrativa mostra conexão, envios da última hora e tamanho da fila.

### 6.4 Nota fiscal de entrada (SEFAZ → estoque → contas a pagar) ✅
1. Worker consulta periodicamente a distribuição DF-e da SEFAZ com o certificado A1.
2. Nota encontrada entra para triagem: vínculo fornecedor-produto, entrada de estoque, duplicatas viram contas a pagar.
3. XML é salvo automaticamente no Google Drive da contabilidade.

### 6.5 Cliente → atendimento por IA ✅
1. Bot externo de WhatsApp consulta a API dedicada (`/api/ia-consulta/v1`): catálogo, agenda, reconhecimento de cliente, histórico, criação de lead.
2. Contrato protegido por regras de versionamento: campo nunca é removido sem aviso prévio publicado na própria resposta da API; mudança incompatível exige `/v2`.
3. Identificação do cliente exige telefone do WhatsApp batendo com o cadastro (ou código enviado ao telefone já cadastrado) — CPF/CNPJ digitado sozinho **não** libera dado comercial.

---

## 7. Integrações

| Serviço | Finalidade | Autenticação | Tratamento de falha | Status |
|---|---|---|---|---|
| **WhatsApp (bot próprio sobre Z-API)** | Todas as mensagens transacionais ao cliente e avisos internos | Chave de API em variável de ambiente | Fila persistida + retry com backoff + idempotência por referência; auditoria por tipo de mensagem | ✅ |
| **Asaas** | Boleto e PIX; webhook de pagamento | Chave em env; webhook validado | Tabela de eventos de webhook; regras de juros/centavos; diagnóstico de cobranças órfãs | ✅ |
| **Conta Azul (API v2)** | Histórico: sync de produtos/pedidos/baixas; desde 07/2026 somente leitura + importação de contas | OAuth2 com refresh | Fila de envio com conferência periódica; modo somente-leitura por chave de configuração | ✅ |
| **SEFAZ (DF-e)** | Busca automática de NF-e contra o CNPJ; consulta de IE no cadastro | Certificado digital A1 | Trava de intervalo entre consultas; fila de buscas agendadas | ✅ |
| **Focus NFe** | Emissão de NF-e de venda | Token em env; webhook com segredo próprio | Tabela de eventos; emissão em implantação (webhook pronto e testado) | ✅ |
| **Google Drive** | Arquivo do XML de cada nota para a contabilidade | OAuth (conta Google) | Registro de erro sem travar a entrada da nota | ✅ |
| **SMTP** | E-mail da régua de cobrança | Credenciais em env | Falha gera tarefa automática para humano cobrar manualmente | ✅ |
| **OpenAI** | Assistente de ajuda interno que lê os manuais das telas | Chave em env | Recurso não crítico — indisponibilidade não afeta a operação | ✅ |
| **Receita Federal / consulta CNPJ** | Preenchimento automático do cadastro de cliente | — | Fallback manual | ✅ |

Risco estrutural assumido e documentado: o número de WhatsApp é um ativo crítico (já foi banido uma vez) — por isso a integração é limitada, por regra escrita, a mensagens transacionais provocadas por ação recente do cliente. ✅

---

## 8. Banco de dados

- **PostgreSQL com Prisma ORM — 141 modelos.** ✅
- Entidades principais: Cliente (+ fiscal, GPS, arquivos), Produto (+ custo histórico, imagens, categorias), Pedido/PedidoItem, Embarque (+ log de versões), Entrega (pagamento real, devoluções), CaixaDiario (+ conferências), ContaReceber/Parcela/**PagamentoParcela (ledger)**, ContaPagar/Rateio/Parcelas, ExtratoLancamento/ConciliacaoGrupo, NotaEntrada (+ itens, duplicatas), NotaFiscalApp, Fornecedor, Vendedor (+ histórico de permissões), Funcionario (+ jornada, ponto, documentos), Receita (+ versões)/OrdemProducao/OrdemConsumo, Tarefa, Lead/Atendimento, e as famílias Kit Festa, Congelados e Delivery. ✅
- **Padrões de integridade adotados:**
  - Dinheiro é **ledger**, não campo sobrescrito: cada baixa/estorno é um registro em `PagamentoParcela` — nada se perde. ✅
  - **Auditoria**: `AuditLog` para ações sensíveis (ex.: adiantamentos do caixa), histórico de permissões com desfazer, logs de versão de embarque e receita. ✅
  - **Idempotência** em todos os pontos de duplicidade possível: envio de WhatsApp (referência única), inventário offline (id do inventário), webhooks (tabelas de eventos). ✅
  - **Transações** com timeout ampliado (20s) e regra escrita: só o atômico dentro da transação; logs e chamadas externas fora. ✅
  - Política de schema que **nunca remove coluna existente em produção** (campos legados permanecem marcados) — deploy jamais quebra por perda de dados. ✅
- Crescimento futuro provável: listas grandes já ganharam paginação incremental (piloto em Pedidos) — padrão a espalhar. ✅

---

## 9. Segurança

- **Autenticação:** JWT; senhas com bcrypt; sessão nunca é derrubada por falha de rede (token só é descartado quando o servidor responde 401/403 — decisão tomada após vendedores serem deslogados em campo por instabilidade). ✅
- **Autorização:** 99 permissões granulares checadas no backend e espelhadas no frontend; perfis; histórico de mudanças com desfazer. ✅
- **Segredos:** exclusivamente em variáveis de ambiente do painel de deploy (chaves de WhatsApp, gateway, OAuth, certificado); nada no repositório nem no banco. ✅
- **Cabeçalhos e superfícies:** helmet; API com `no-store`; rotas administrativas protegidas por segredo próprio via header; páginas públicas (Kit Festa, congelados, ponto) com escopo mínimo. ✅
- **Proteção de dado de cliente na API de IA:** identificação por telefone autenticado pelo próprio WhatsApp ou código enviado ao telefone já cadastrado — nunca por CPF/CNPJ digitado (documento não é segredo). ✅
- **Anti-duplicidade:** idempotência em pagamentos, mensagens e inventário (ver seção 8). ✅
- **Riscos conhecidos (descritos de forma responsável):** ausência de rate limiting global de API 🔎; ausência de 2FA para usuários internos 🔎; backup do banco não verificável pelo repositório ❓.

---

## 10. Confiabilidade e operação

| Prática | Como funciona | Status |
|---|---|---|
| Build obrigatório antes de commit | Regra inegociável do repositório: frontend só sobe se `npm run build` passar — nasceu de um incidente real (import faltando derrubou uma tela em produção) | ✅ |
| Deploy | Push no GitHub → build de containers no painel → `prisma db push` sem aceitar perda de dados (deploy falha em vez de dropar coluna) | ✅ |
| Teste em produção para persistência | Regra escrita: funcionalidade que grava arquivo só é "pronta" após gravar → **novo deploy** → ler, em produção (nasceu da perda real de 14 PDFs em volume efêmero) | ✅ |
| Filas e retry | WhatsApp, envio ao ERP contábil, buscas SEFAZ e régua de cobrança rodam por filas em tabelas com retry/backoff — falha transitória nunca perde trabalho | ✅ |
| Timeouts | Transações de banco com timeout de 20s (banco compartilhado fica lento em pico; o padrão de 5s causava falhas intermitentes) | ✅ |
| Disponibilidade no cliente | Service worker tolerante a falha de rede na abertura (crítico no iOS standalone, que não tem botão de recarregar), retry de chunks após deploy, tela offline com "tentar novamente" | ✅ |
| Operação 24h | App é a operação diária da empresa; janelas de deploy não derrubam usuários ativos (estratégias acima) | ✅ |
| Rollback | Reverter commit + novo push 🔎; sem pipeline formal de rollback | 🔎 |
| Testes automatizados | Não há suíte de testes automatizados; a qualidade é sustentada por build obrigatório, checklist de verificação manual em tela real e regras codificadas para a IA de desenvolvimento | ✅ |

---

## 11. Decisões de arquitetura (com trade-offs)

1. **Monolito modular em vez de microserviços** — um deploy, transações locais, complexidade compatível com equipe de uma pessoa. Trade-off: escala vertical; aceitável para o porte. ✅
2. **PWA em vez de app nativo** — um código só para celular do vendedor, iPad do caixa e desktop; deploy instantâneo sem loja de aplicativos. Exigiu engenharia real de cache/service worker para o iOS. Trade-off: limitações de plataforma (impressão, push). ✅
3. **API na mesma origem via proxy nginx** — eliminou CORS e acoplamento a domínio; o app funciona em qualquer domínio apontado. ✅
4. **Filas em tabelas do banco em vez de message broker** — sem infraestrutura extra (Redis/RabbitMQ); visibilidade total via SQL; volume atual não exige broker. Trade-off: polling por intervalo, não tempo real. ✅
5. **Faturamento local após bloqueio do ERP anterior** — quando o acesso de escrita ao ERP comercial foi bloqueado (07/2026), o sistema assumiu numeração própria e emissão via provedor independente em dias, sem parar a operação — possível porque os dados já eram locais. ✅
6. **Bot de WhatsApp próprio em vez de plataforma terceirizada** — controle de idempotência, auditoria por tipo e compliance rígido de uso transacional (o número já foi banido uma vez; a regra protege o ativo). ✅
7. **Dinheiro como ledger** — baixas parciais, estornos e descontos são registros imutáveis, nunca sobrescrita de saldo. ✅
8. **`db push` sem migrations formais + política de nunca dropar coluna** — simplicidade de deploy com proteção explícita contra perda de dados. Trade-off: sem histórico formal de migração. ✅
9. **Regras de engenharia codificadas no repositório para a IA** — o arquivo de diretrizes funciona como "pipeline de qualidade em prosa": cada incidente de produção vira regra escrita que o desenvolvimento assistido por IA passa a seguir obrigatoriamente. É o mecanismo central de qualidade do projeto. ✅

---

## 12. Impacto no negócio

Impactos **qualitativos com evidência no código** (sem métricas inventadas):

- **Operação inteira em um sistema só** — venda, produção, estoque, entrega, caixa, financeiro, fiscal e RH deixaram de viver em sistemas/planilhas separados (a existência de importadores de histórico e a substituição progressiva do ERP anterior evidenciam a centralização). ✅
- **Continuidade do negócio comprovada** — quando o ERP comercial bloqueou o acesso, a operação não parou: faturamento e cadastro já eram locais. ✅
- **Menos erro de dinheiro** — conferência física obrigatória no caixa, baixa única (nunca na rua e no caixa), idempotência de cobrança, ledger de pagamentos, auditoria de adiantamentos. ✅
- **Rastreabilidade** — versionamento de embarque e receita, logs de auditoria, histórico de permissões. ✅
- **Cobrança automatizada** — régua por forma de recebimento com WhatsApp/e-mail e fallback para tarefa humana. ✅
- **Atendimento ao cliente ampliado** — sites públicos de pedido e IA de WhatsApp consumindo API dedicada. ✅
- Métricas quantitativas (tempo economizado, redução de inadimplência, pedidos/dia): ❓ — a confirmar com o dono antes de publicar.

---

## 13. Desafios reais enfrentados (e o que ficou de aprendizado)

Todos documentados no histórico do repositório: ✅

| Desafio | O que aconteceu | Solução / regra que ficou |
|---|---|---|
| Import faltando derrubou tela em produção | `ReferenceError` em tela usada pela operação | Build obrigatório antes de todo commit — sem exceções |
| 14 PDFs perdidos após deploy | Upload gravado fora do volume persistente; sumiu no deploy seguinte **sem erro na hora** | Regra de caminho de upload + teste obrigatório "gravar → deploy → ler" em produção |
| Baixa financeira falhando "às vezes" | Timeout de 5s da transação em banco compartilhado lento — funcionava na 2ª tentativa | Timeout de 20s + só o atômico dentro da transação + logs fora |
| App do iPhone preso em versão velha | Cache do `index.html` + service worker no PWA standalone | Política de cache por camada (no-cache no HTML, imutável nos assets) + retry de chunks |
| Impressão em iPad saía em branco | iframe/`window.open` não funcionam no Safari/PWA | Impressão na própria página com `@media print` e técnica específica para iOS |
| Número de WhatsApp banido | Automação em massa no passado | Bot próprio com compromisso escrito: só mensagem transacional provocada pelo cliente; auditoria por tipo |
| ERP comercial bloqueou acesso de escrita | Dependência externa crítica cortada da noite para o dia | Faturamento local + emissão via provedor independente; dados já eram do app |
| Extrato bancário derrubava a listagem | Número de documento maior que INT4 no arquivo OFX | Validação de faixa + rota de diagnóstico |
| Valor sumiu do caixa | Adiantamento alterado sem rastro | Permissão específica + confirmação + audit log |
| Bot externo quebrou ao acessar o banco direto | SQL cru com nomes de coluna errados, fora das proteções | API dedicada versionada com contrato protegido; acesso direto ao banco proibido |

---

## 14. Diagrama recomendado (instruções para versão visual)

Um diagrama em três faixas horizontais:

1. **Faixa superior — pessoas:** vendedor (celular), motorista (celular), escritório (iPad/desktop), cliente final (site), IA de WhatsApp (externo).
2. **Faixa central — aplicação:** bloco "PWA React 19" (nginx, service worker) → seta para bloco "API Node.js/Express" contendo três sub-blocos: *72 routers*, *68 services*, *worker de rotinas (filas/retry)*; ao lado, "PostgreSQL (Prisma, 141 modelos)" e "volume de uploads".
3. **Faixa inferior — integrações:** WhatsApp/Z-API, Asaas, Conta Azul, SEFAZ, Focus NFe, Google Drive, SMTP, OpenAI — setas indicando direção (webhook entra, consulta sai).
4. Moldura anotando: **Docker + EasyPanel, deploy por push no GitHub, produção 24h**.

---

## 15. Case study — versão resumida (pronta para adaptar ao LinkedIn)

**Título:** CA-Hardt — ERP completo em produção 24h para uma indústria de alimentos, construído do zero em 5 meses com desenvolvimento assistido por IA

**Resumo executivo:** Sistema que opera de ponta a ponta uma indústria/distribuidora de salgados congelados: venda em campo, produção, estoque, expedição, entrega com cobrança na porta, caixa, financeiro completo, nota fiscal, RH e atendimento ao cliente. PWA React + API Node.js + PostgreSQL, com 8 integrações externas, ~151 mil linhas de código próprio, 141 tabelas e 146 telas, sustentando a operação diária da empresa.

**Problema:** operação fragmentada e dependente de um ERP comercial que não cobria o chão da operação (rota, caixa físico, produção, WhatsApp) — dependência que se provou frágil quando o fornecedor bloqueou o acesso.

**Solução:** ERP próprio, mobile-first, que começou complementando o ERP comercial e o substituiu progressivamente sem parar a operação — incluindo a virada do faturamento em dias após o bloqueio.

**Arquitetura:** monolito modular Node.js/Express + Prisma/PostgreSQL; PWA React 19 servido por nginx na mesma origem; filas persistidas no banco com retry/backoff; worker interno de rotinas; Docker/EasyPanel com deploy por push.

**Diferenciais técnicos:** engenharia de PWA para iOS (cache por camada, recuperação automática pós-deploy, offline pontual idempotente); dinheiro como ledger imutável; idempotência em todos os pontos de duplicidade; contrato de API versionado para consumo por IA; compliance de WhatsApp que protege um ativo já banido uma vez.

**Método:** desenvolvimento solo assistido por IA (Claude Code), com regras de engenharia codificadas no repositório — cada incidente de produção vira regra escrita e obrigatória. 1.648 commits em ~5,5 meses.

**Aprendizados:** confiabilidade nasce de processo (build obrigatório, teste em produção, idempotência), não de framework; dependência externa crítica precisa de plano B com os dados em casa; para operação em campo, tolerância a rede ruim vale mais que features.

**Próximos passos:** emissão de NF-e concluída no provedor independente; centro de custo; espalhar paginação para todas as listas grandes. ✅ (roadmap real do projeto)

---

## 16. Perguntas pendentes (responder antes de publicar)

1. **Quantos usuários ativos** usam o sistema hoje (vendedores, motoristas, escritório)?
2. **Volume operacional:** pedidos/mês, entregas/dia ou notas/mês que você se sinta confortável em citar publicamente (pode ser faixa aproximada).
3. **Havia qual processo antes** (planilhas? só o Conta Azul? papel?) — para o "antes vs. depois" do case.
4. **Backup do banco:** existe rotina configurada no painel de hospedagem? Com qual frequência?
5. **Quer citar o nome da empresa** (Hardt Salgados) no LinkedIn ou prefere "indústria de alimentos de médio porte"?
6. **Quer citar que o desenvolvimento foi assistido por IA?** (Recomendo que sim — é diferencial atual e é verdade verificável; mas a decisão é sua.)
7. Alguma **métrica de resultado** que você tenha de fato observado (ex.: tempo de fechamento de caixa, inadimplência, horas de digitação economizadas)? Sem número real, o case fica só qualitativo — o que também é aceitável.
