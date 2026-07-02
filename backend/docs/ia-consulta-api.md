# API de Consulta para IA Externa (WhatsApp / Antigravity)

API somente-leitura para um assistente de IA externo (hoje, o projeto "Antigravity", em outra pasta)
consultar dados do Hardt em tempo real e responder clientes no WhatsApp. Não cria pedidos ainda —
só consulta catálogo/agenda/entrega do Kit Festa e catálogo/condição comercial dos Congelados.

## Acesso

- **Base:** `https://<dominio-do-backend>/api/ia-consulta/v1`
- **Autenticação:** header `x-ia-api-key: <chave>` em toda requisição. A chave fica na env var
  `IA_WHATSAPP_API_KEY` (backend) — nunca reaproveitar o `ADMIN_SECRET`.
- **Limite:** 60 requisições/minuto por chave (429 se exceder).
- Sem a chave configurada no servidor → `503`. Chave errada/ausente → `401`.

## Formato de toda resposta

```json
{
  "meta": { "versaoApi": "1.2.0", "avisos": [], "geradoEm": "2026-07-02T00:00:00.000Z" },
  "dados": { /* conteúdo específico do endpoint */ }
}
```

Respostas de erro (4xx/5xx) NÃO usam esse envelope — vêm como `{ "error": "mensagem" }`.

### `meta.avisos` — como evitar que uma mudança nossa quebre o app da IA

Sempre que o time do CA-Hardt precisar mudar/remover algo que a IA já consome, o aviso é publicado
com antecedência em `backend/config/iaConsultaVersao.js` (array `AVISOS`) e passa a aparecer em
**toda resposta**, em `meta.avisos`, como `{ desde, mensagem }`.

**Regra para o app consumidor (Antigravity):** a cada chamada (ou pelo menos 1x/dia via `/status`),
verificar se `meta.avisos` não está vazio, logar/alertar o time, e ajustar o código antes da data
mencionada na mensagem. Assim a mudança nunca pega o app de surpresa.

## Endpoints

| Método | Rota | Body/Query | Retorna em `dados` |
|---|---|---|---|
| GET | `/status` | — | `{ ok: true }` — health-check. Chamar antes de responder um cliente crítico; se falhar, usar mensagem de fallback (ver abaixo). |
| GET | `/kitfesta/catalogo` | — | Lista de produtos (nome, preço, unidades por caixa, opções, tags) |
| GET | `/kitfesta/categorias` | — | Categorias de filtro do site |
| GET | `/kitfesta/config` | — | Dados da loja, regras (ex.: mínimo de caixas), textos institucionais |
| GET | `/kitfesta/agenda` | `?inicio=YYYY-MM-DD&fim=YYYY-MM-DD` | Mapa de status por dia: `open`\|`few`\|`full`\|`closed` |
| GET | `/kitfesta/slots` | `?data=YYYY-MM-DD&modo=retirada\|entrega` | Horários daquele dia com capacidade/lotação |
| POST | `/kitfesta/validar-cupom` | `{ codigo, totalCaixas }` | Validação do cupom (tipo, valor, mínimo de caixas) |
| POST | `/kitfesta/verificar-entrega` | `{ cep }` | `{ atende: true\|false\|null, distanciaKm, raioKm, endereco }` |
| GET | `/congelados/catalogo` | — | Catálogo com preço **genérico** (tabela "Site", visitante sem cadastro) |
| GET | `/congelados/grupos` | — | Categorias/grupos do catálogo de congelados |
| GET | `/congelados/config` | — | Dados da loja, mínimo padrão, se atende sábado/domingo (`entregas.sabado/domingo`) |
| GET | `/congelados/produto/:id/ficha` | `:id` = id do produto no site | Ficha técnica/nutricional do produto |
| POST | `/congelados/reconhecer-telefone` | `{ telefone }` | Se o telefone bater com um cliente cadastrado: catálogo já com preço/condição/dias de entrega REAIS dele. Senão: `{ reconhecido: false }` |
| POST | `/congelados/criar-senha-telefone` | `{ telefone, senha }` | Cria a senha do site (mesma conta do login) — só funciona se `telefone` bater com um cadastro. Devolve `{ token, cliente }` |
| POST | `/congelados/check-doc` | `{ documento }` (CPF/CNPJ) | `{ situacao, temCadastroApp, nome }` — descobre se o documento já tem cadastro/senha |
| POST | `/congelados/login` | `{ documento, senha }` | `{ token, cliente }` se a senha bater |
| POST | `/congelados/criar-senha` | `{ documento, senha, nome?, telefone? }` | Cria a senha **só se a conta ainda não tiver uma** (senão erro "já tem senha, use esqueci-senha") |
| POST | `/congelados/esqueci-senha` | `{ documento }` | Manda um código de 6 caracteres pelo WhatsApp — **só para o telefone já cadastrado**, nunca pra quem pediu |
| POST | `/congelados/reset-senha` | `{ documento, codigo, novaSenha }` | Confirma o código e define a nova senha. Devolve `{ token, cliente }` |
| GET | `/congelados/meu-catalogo` | header `Authorization: Bearer <token>` | Catálogo com preço/condição/dias de entrega do cliente autenticado |
| GET | `/congelados/perfil` | header `Authorization: Bearer <token>` | Dados do cliente autenticado (nome, dias de entrega, condição padrão) |

### Como a IA deve reconhecer o cliente de Congelados, do jeito mais simples pro mais seguro

1. **Telefone (automático, sem perguntar nada):** chamar `POST /congelados/reconhecer-telefone` com o
   número de quem mandou a mensagem no WhatsApp. Se `reconhecido: true`, já usar esse catálogo —
   é o preço/condição real do cliente. Isso é seguro porque o número de quem manda mensagem no
   WhatsApp é autenticado pela própria plataforma (ninguém "digita" o número de outra pessoa).
2. **Se não reconheceu por telefone:** perguntar o CPF/CNPJ e chamar `check-doc`.
   - Se já tem senha (`TEM_SENHA`): pedir a senha e chamar `login`. Sucesso → usar o `token` em
     `meu-catalogo`.
   - Se ainda não tem senha (`CRIAR_SENHA` ou `SEM_CADASTRO`): oferecer criar uma senha ali mesmo
     (`criar-senha`) OU, se o cliente esqueceu, `esqueci-senha` (manda código pro WhatsApp já
     cadastrado) seguido de `reset-senha` com o código recebido.
3. **Nunca** liberar preço negociado/dias de entrega/pedidos de um cliente só com o CPF/CNPJ digitado
   sem passar por um dos dois caminhos acima — ver "Por que isso importa" abaixo.

### Por que isso importa (não é regra por regra, é pra não vazar dado de cliente)

CPF e principalmente CNPJ não são segredo — aparecem em nota fiscal, cartão de visita, Google. Uma
versão anterior desta API aceitava só `{ documento }` para devolver o preço negociado do cliente,
o que permitiria qualquer pessoa consultar o preço/pedidos de qualquer cliente sabendo o
CPF/CNPJ dele — **isso foi corrigido antes de qualquer app externo consumir**, e não deve voltar.
A mesma falha existia (e foi corrigida) no próprio `criarSenha` do site público: ele sobrescrevia
a senha de uma conta já existente sem pedir a senha antiga nem um código — ou seja, bastava saber
o CPF/CNPJ de alguém pra tomar conta da conta dela. Agora `criarSenha` recusa se já existir senha.

## Regra de contrato — NUNCA quebrar o app consumidor sem aviso

Esta API tem consumidor externo fora deste repositório. As regras abaixo são obrigatórias para
qualquer alteração em `backend/routes/iaConsultaRoutes.js`, `backend/controllers/kitFestaController.js`,
`backend/controllers/congeladosController.js` (nas funções usadas aqui) ou nos serviços que eles chamam:

1. **Nunca remover ou renomear um campo já existente na resposta de um endpoint de `/v1`.** Só
   adicionar campos novos é seguro sem aviso prévio.
2. **Para remover/renomear algo:** primeiro adicionar um item em `AVISOS`
   (`backend/config/iaConsultaVersao.js`) com prazo (ex.: 30 dias), esperar o prazo passar, só
   então remover.
3. **Mudança que quebra o formato de resposta** (ex.: reestruturar `dados`, mudar tipo de um campo)
   exige criar `/v2` (novo router paralelo ao `v1` em `iaConsultaRoutes.js`) e manter `/v1` no ar até
   confirmar que o app consumidor migrou. Nunca alterar `/v1` de forma incompatível.
4. **Testar com `curl` (ver exemplos abaixo) depois de qualquer mudança, antes de commitar** —
   igual à regra de build do frontend: nunca subir uma mudança nesta API sem testar manualmente.
5. Se o endpoint ficar fora do ar (deploy quebrado, banco fora), o pior cenário aceitável é o app
   da IA cair num fallback tipo "não consegui consultar agora, um atendente confirma em instantes" —
   nunca deixar o cliente sem NENHUMA resposta. Isso depende do app consumidor tratar erros/timeout
   desta API, mas nosso dever aqui é: manter `/status` sempre respondendo rápido para ele detectar a
   falha cedo.

## Exemplos de teste manual

```bash
curl -H "x-ia-api-key: SUACHAVE" https://<dominio>/api/ia-consulta/v1/status
curl -H "x-ia-api-key: SUACHAVE" https://<dominio>/api/ia-consulta/v1/kitfesta/config
curl -H "x-ia-api-key: SUACHAVE" -X POST -H "Content-Type: application/json" \
  -d '{"cep":"89239-000"}' https://<dominio>/api/ia-consulta/v1/kitfesta/verificar-entrega
curl -H "x-ia-api-key: SUACHAVE" -X POST -H "Content-Type: application/json" \
  -d '{"telefone":"5547999998888"}' https://<dominio>/api/ia-consulta/v1/congelados/reconhecer-telefone
curl -H "x-ia-api-key: SUACHAVE" -H "Authorization: Bearer TOKEN_DO_CLIENTE" \
  https://<dominio>/api/ia-consulta/v1/congelados/meu-catalogo
```

## Histórico de versões

- **1.0.0** (2026-07-01) — Kit Festa: catálogo, categorias, config, agenda, slots, cupom, entrega.
- **1.1.0** (2026-07-02) — + Congelados: catálogo, grupos, config, ficha, check-doc, catálogo por
  cliente por CPF/CNPJ sem senha. **Substituído na 1.2.0 por razão de segurança (ver abaixo)** — nunca
  chegou a ser consumido por nenhum app externo.
- **1.2.0** (2026-07-02) — Corrige o design da 1.1.0: reconhecimento automático por telefone
  (`reconhecer-telefone`, `criar-senha-telefone`) + fluxo completo de login/senha/código
  (`login`, `criar-senha`, `esqueci-senha`, `reset-senha`) + catálogo/perfil protegidos por token
  (`meu-catalogo`, `perfil`). Remove o endpoint `cliente-catalogo` que aceitava só CPF/CNPJ sem
  prova de identidade. Também corrige `criarSenha` (Congelados e Kit Festa) para não sobrescrever
  mais uma senha já existente sem verificação.

## Próximos passos previstos (ainda não implementados)

- Criação de pedido pela IA (hoje o escopo é só consulta — confirmação humana decide o pedido).
- Programa de fidelidade para cliente B2B comum (hoje só existe indicação/crédito/cupom no Kit Festa).
