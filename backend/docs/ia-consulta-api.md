# API de Consulta para IA Externa (WhatsApp / Antigravity)

API somente-leitura para um assistente de IA externo (hoje, o projeto "Antigravity", em outra pasta)
consultar dados do Hardt em tempo real e responder clientes no WhatsApp. Não cria pedidos ainda —
só consulta catálogo, agenda e condições de entrega do Kit Festa.

## Acesso

- **Base:** `https://<dominio-do-backend>/api/ia-consulta/v1`
- **Autenticação:** header `x-ia-api-key: <chave>` em toda requisição. A chave fica na env var
  `IA_WHATSAPP_API_KEY` (backend) — nunca reaproveitar o `ADMIN_SECRET`.
- **Limite:** 60 requisições/minuto por chave (429 se exceder).
- Sem a chave configurada no servidor → `503`. Chave errada/ausente → `401`.

## Formato de toda resposta

```json
{
  "meta": { "versaoApi": "1.0.0", "avisos": [], "geradoEm": "2026-07-02T00:00:00.000Z" },
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

## Regra de contrato — NUNCA quebrar o app consumidor sem aviso

Esta API tem consumidor externo fora deste repositório. As regras abaixo são obrigatórias para
qualquer alteração em `backend/routes/iaConsultaRoutes.js`, `backend/controllers/kitFestaController.js`
(nas funções usadas aqui) ou nos serviços que eles chamam:

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
```

## Próximos passos previstos (ainda não implementados)

- Endpoints equivalentes para o catálogo de Congelados/pedidos "normais" (fora do Kit Festa).
- Criação de pedido pela IA (hoje o escopo é só consulta — confirmação humana decide o pedido).
- Programa de fidelidade para cliente B2B comum (hoje só existe indicação/crédito/cupom no Kit Festa).
