# v1.5.0 — Busca de cliente + WhatsApps no cadastro (resposta ao pedido do painel)

De: dev do CA-Hardt
Para: time do bot WhatsApp Hardt Salgados (painel de atendimento)
Data: 2026-08-10
Status: **implementado e no ar** como **v1.5.0** do contrato `ia-consulta-api` (toda resposta agora
sai com `meta.versaoApi: "1.5.0"`). Tudo aditivo — nada da v1.4 mudou.

Mesma auth de sempre: header `x-api-key` de vocês → aqui chega como `x-ia-api-key`, base
`/api/ia-consulta/v1`. Toda resposta vem no envelope `{ meta, dados }` — os JSONs abaixo são o
conteúdo de `dados`.

---

## 1. `POST /cliente/buscar` — busca para o painel

Request (igual ao proposto):

```json
{ "busca": "panificadora joao", "limite": 10 }
```

- `busca` obrigatório, mín. 3 caracteres. Casa com Razão Social, Nome Fantasia **ou** CPF/CNPJ.
  Texto → busca parcial, sem diferenciar maiúsculas/acentos. Com **11+ dígitos** (ignorando
  pontuação) → tratado como documento, comparado ignorando pontuação (CNPJ alfanumérico incluído).
- `limite` opcional: padrão 10, máx. 20.
- Clientes **inativos aparecem** (com `ativo: false`), ordenados depois dos ativos. Cadastro sem
  documento não entra no resultado (documento é a chave do passo 2).

Response (`dados`) — **modelo final, igual ao proposto**:

```json
{
  "clientes": [
    {
      "documento": "12345678000190",
      "nome": "Panificadora Joao Ltda",
      "nomeFantasia": "Padaria do Joao",
      "cidade": "Joinville",
      "vendedor": "Jociel",
      "ativo": true,
      "telefones": ["4733331234"],
      "whatsapps": ["47999991234"]
    }
  ]
}
```

Detalhes de formato:
- `documento` vem **como está gravado no cadastro** (normalizado, sem pontuação; CNPJ alfanumérico
  possível). É única por cliente — usem como chave do passo 2 (o `/cliente/ficha` aceita com ou sem
  pontuação, então tanto faz como guardarem).
- `telefones` e `whatsapps` vêm **só dígitos, sem DDI 55** (ex.: `47999991234`).
- `nomeFantasia`, `cidade` e `vendedor` podem ser `null`.
- Sem preço/condição aqui — só identificação, como combinado.
- Erro de validação (busca curta): HTTP 400 `{ "error": "Informe pelo menos 3 caracteres para buscar." }`.

## 2. `POST /cliente/ficha` — ficha completa por documento

Request:

```json
{ "documento": "12345678000190" }
```

(com ou sem pontuação — comparamos ignorando pontuação)

Response (`dados`) — **modelo final da "ficha do cliente"**:

```json
{
  "encontrado": true,
  "cliente": {
    "nome": "Panificadora Joao Ltda",
    "nomeFantasia": "Padaria do Joao",
    "documento": "12345678000190",
    "cidade": "Joinville",
    "vendedor": "Jociel",
    "ativo": true
  },
  "diasEntrega": ["Terça"],
  "diasVenda": ["Segunda"],
  "condicaoPagamento": { "nome": "Boleto 28d", "valorMinimo": 400 },
  "whatsapps": ["47999991234"],
  "telefones": ["4733331234"]
}
```

Diferenças (pequenas) em relação ao proposto — avisar se atrapalhar:
- `cliente.nome` = **Razão Social** e `cliente.nomeFantasia` = fantasia (no `reconhecer-telefone`
  o `nome` é "fantasia ou razão"; aqui separamos porque o painel mostra os dois).
- Campo extra `cliente.ativo` (a ficha também acha cliente inativo — o painel decide o que mostrar).
- Documento não encontrado: `{ "encontrado": false }` (HTTP 200).
- `condicaoPagamento`, `nomeFantasia`, `cidade`, `vendedor` podem ser `null`; `diasEntrega`/
  `diasVenda`/`whatsapps`/`telefones` podem ser `[]`.

## 3. WhatsApps no cadastro — pronto

- O cadastro de cliente do CA-Hardt ganhou o campo **"WhatsApps do cliente"** (lista), na tela de
  cadastro novo e na ficha do cliente (card Contato/Fiscal). A equipe daqui cadastra os números.
- `POST /cliente/reconhecer-telefone` **e** `POST /congelados/reconhecer-telefone` agora casam
  TAMBÉM por esses números — por dígitos, com/sem o "9" do celular e com/sem DDI 55 (mesma
  tolerância de hoje). Nada muda do lado de vocês: o vínculo automático já melhora sozinho.
- `buscar` e `ficha` devolvem a lista `whatsapps` para conferência, como pedido.

## Segurança (inalterado)

`buscar` e `ficha` são **exclusivos do painel logado da equipe** — não entram nas tools da IA nem
são expostos a cliente final. A IA continua identificando cliente só pelo telefone autenticado do
WhatsApp (regra 🔐 do contrato). E segue valendo: bot nunca acessa o banco direto — dado novo =
endpoint novo nesta API.

## Teste rápido

```bash
curl -H "x-ia-api-key: SUACHAVE" -X POST -H "Content-Type: application/json" \
  -d '{"busca":"panificadora","limite":10}' https://<dominio>/api/ia-consulta/v1/cliente/buscar

curl -H "x-ia-api-key: SUACHAVE" -X POST -H "Content-Type: application/json" \
  -d '{"documento":"12.345.678/0001-90"}' https://<dominio>/api/ia-consulta/v1/cliente/ficha
```
