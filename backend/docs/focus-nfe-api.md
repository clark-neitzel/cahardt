# Focus NFe — Guia de implementação (emissão de NF-e de produto)

> **Data:** 2026-07-23
> **Fonte:** documentação oficial em https://doc.focusnfe.com.br (índice completo em https://doc.focusnfe.com.br/llms.txt)
> **Referência completa de TODOS os campos da NF-e 4.00** (com correspondência às tags XML):
> https://campos.focusnfe.com.br/nfe/NotaFiscalXML.html
>
> Este guia foi montado a partir de 20 páginas da documentação oficial baixadas em 23/07/2026.
> Contexto CA-Hardt: o Conta Azul bloqueou a emissão de NF-e; vamos emitir a NF-e de **produto**
> (venda de salgados congelados, modelo 55) direto pelo app via Focus NFe. A NF-e continua sendo
> autorizada pela SEFAZ — a Focus é só o intermediário técnico (assina com nosso certificado A1,
> transmite, controla numeração, gera DANFE e guarda XML).

---

## 1. Visão geral e ambientes

A API é REST + JSON, com prefixo **`/v2`** em todas as rotas.

| Ambiente | URL base | Efeito |
|---|---|---|
| **Homologação** | `https://homologacao.focusnfe.com.br` | Testes de integração; documentos **sem validade fiscal nem tributária** |
| **Produção** | `https://api.focusnfe.com.br` | Documentos com validade fiscal — usar só quando a integração estiver pronta |

- A autenticação é **igual** nos dois ambientes; muda apenas a URL base e o **token** usado.
- Em homologação, a SEFAZ força o nome do destinatário para o texto padrão
  `NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL` (a doc usa exatamente esse texto
  como exemplo de `nome_destinatario`).
- **Exceção importante:** a API de **Empresas** (`/v2/empresas`) opera **exclusivamente no ambiente
  de produção** (`api.focusnfe.com.br`) — mesmo para cadastrar/configurar a empresa que vai emitir
  em homologação. Para testar o cadastro sem persistir, usar o parâmetro `dry_run=1`.
- TLS: conferir se o runtime precisa de configuração extra de HTTPS (em Node.js normalmente não
  precisa de nada; a ressalva da doc é principalmente para Java/truststore).

## 2. Autenticação

**HTTP Basic (RFC 7617)**: o **token** é enviado como **usuário** do Basic Auth e a **senha fica em
branco**. Não existe header de API key separado.

- `Authorization: Basic ` + Base64(`token:`) — note os dois pontos e nada depois.
- Cada empresa cadastrada recebe **dois tokens próprios**: `token_producao` e `token_homologacao`
  (devolvidos na resposta do cadastro da empresa — ver seção 3). Usa-se o token do ambiente
  correspondente à URL base.
- A `ref` (seção 4) é única **dentro do escopo do token**.

```bash
curl -u 'SEU_TOKEN_AQUI:' \
  https://homologacao.focusnfe.com.br/v2/empresas
```

Erro de autenticação devolve **HTTP 401** com corpo `text/html`: `HTTP Basic: Access denied`
(não é JSON — tratar esse caso à parte no client).

## 3. Cadastro da empresa

> A conta na Focus tem um token "de conta" (gerado no painel) que é usado para gerenciar empresas.
> O cadastro da empresa emissora pode ser feito pelo painel web da Focus ou por API.

### Endpoints (sempre em `https://api.focusnfe.com.br` — ver seção 1)

| Operação | Endpoint |
|---|---|
| Criar | `POST /v2/empresas` (query opcional `dry_run=1` para simular sem persistir) |
| Listar | `GET /v2/empresas` (filtros query: `cnpj`, `cpf`; paginação `offset`) |
| Consultar | `GET /v2/empresas/{id}` (`id` numérico interno da Focus) |
| Atualizar | `PUT /v2/empresas/{id}` (também aceita `dry_run=1`) |

### Campos principais do JSON (nomes exatos)

Campos de identificação/endereço (schema `EmpresaCreate`):

| Campo | Tipo | Observação |
|---|---|---|
| `nome` | string | Razão social |
| `nome_fantasia` | string | |
| `cnpj` | string | (ou `cpf` para pessoa física) |
| `inscricao_estadual` | integer | |
| `inscricao_municipal` | integer | (não se aplica à NF-e de produto, mas o campo existe) |
| `regime_tributario` | integer | 1=Simples Nacional · 2=Simples excesso de sublimite · 3=Regime Normal · 4=Simples Nacional MEI |
| `logradouro` | string | |
| `numero` | integer | |
| `complemento` | string | |
| `bairro` | string | |
| `municipio` | string | |
| `uf` | string | |
| `cep` | integer | |
| `telefone` | string | |
| `email` | string | |

Habilitação e comportamento:

| Campo | Tipo | Observação |
|---|---|---|
| **`habilita_nfe`** | boolean | **É este que habilita a emissão de NF-e (modelo 55)** |
| `habilita_nfce` | boolean | NFC-e (modelo 65) — não precisamos |
| `habilita_manifestacao` | boolean | Busca de NF-e recebidas (MDe) — hoje fazemos isso nós mesmos no `sefazDfeService` |
| `discrimina_impostos` | boolean | Cálculo automático dos impostos aproximados (Lei da Transparência) na nota |
| `enviar_email_destinatario` | boolean | Focus envia e-mail ao destinatário após emissão (produção) |
| `enviar_email_homologacao` | boolean | Idem, em homologação |
| `cpf_cnpj_contabilidade` | string | Alguns estados exigem (ex.: BA) |
| `orientacao_danfe` | string | `portrait` ou `landscape` |
| `arquivo_logo_base64` | string | Logo p/ DANFE — PNG até 200x200 px |

### Certificado digital A1 (nomes exatos dos campos)

| Campo | Formato |
|---|---|
| `arquivo_certificado_base64` | Arquivo **PFX/P12 codificado em base64** |
| `senha_certificado` | string — obrigatória apenas se `arquivo_certificado_base64` for informado |

Erros de validação do certificado (HTTP 422, `codigo: "erro_validacao"`, com `campo:
"arquivo_certificado_base64"` no array `erros`): senha errada / formato não-PFX, **certificado não
pertence ao CNPJ informado**, certificado **vencido**.

### O que a resposta devolve (schema `EmpresaResponse`)

Além do eco dos dados: `id` (inteiro — necessário para PUT/GET por id), e principalmente:

- **`token_producao`** e **`token_homologacao`** — os tokens que o nosso backend vai usar em todas
  as chamadas de NF-e (um por ambiente).
- `certificado_valido_de` / `certificado_valido_ate` / `certificado_cnpj` — para monitorar o
  vencimento do A1.
- `proximo_numero_nfe_producao` / `proximo_numero_nfe_homologacao` e `serie_nfe_producao` /
  `serie_nfe_homologacao` — a **numeração é controlada pela Focus**; esses campos podem ser
  definidos no cadastro/atualização (importante: ao migrar do Conta Azul, setar o próximo número
  e a série para continuar a sequência já usada — confirmar a série atual das notas emitidas
  pelo CA).
- `nfe_sincrono` / `nfe_sincrono_homologacao` — indicam se a conta está configurada para emissão
  síncrona (default `false` = fluxo assíncrono).
- `data_ultima_emissao`, `caminho_logo`, e as dezenas de flags de exibição da DANFE.

### Exemplo de criação (adaptado do exemplo oficial)

```bash
curl -u 'TOKEN_DA_CONTA:' -X POST \
  -H 'Content-Type: application/json' \
  -d '{
    "nome": "Nome da empresa Ltda",
    "nome_fantasia": "Nome Fantasia",
    "cnpj": "12345678000123",
    "inscricao_estadual": 1234,
    "regime_tributario": 1,
    "logradouro": "Rua João da Silva",
    "numero": 153,
    "complemento": "Loja 1",
    "bairro": "Vila Isabel",
    "municipio": "Curitiba",
    "uf": "PR",
    "cep": 80210000,
    "telefone": "4130333333",
    "email": "test@example.com",
    "discrimina_impostos": true,
    "enviar_email_destinatario": true,
    "habilita_nfe": true,
    "arquivo_certificado_base64": "MIIj4gIBAzCC...base64-do-pfx...==",
    "senha_certificado": "123456"
  }' \
  'https://api.focusnfe.com.br/v2/empresas?dry_run=1'
```

## 4. Emissão de NF-e — `POST /v2/nfe?ref=REFERENCIA`

### O conceito de `ref` (idempotência — crítico para nós)

- `ref` é query param **obrigatório**: identificador **único por token** que marca a emissão.
- Alfanumérica, **sem caracteres especiais** (sem acento, espaço, `@`, `/`...). O padrão sugerido
  pela doc é usar o **ID interno do nosso sistema** (ex.: id da tabela de notas do app).
- **Reuso:** se a autorização **falhar** (rejeição/erro antes de autorizar), pode-se **reenviar com
  a MESMA `ref`** após corrigir o payload. Depois de **autorizada** (mesmo que cancelada depois), a
  `ref` fica **presa àquele documento para sempre** — nunca reutilizar para outra nota.
- Reenviar uma `ref` cuja nota está em processamento devolve 422 `codigo: "pending_operation"`;
  já autorizada, 422 `codigo: "already_processed"`. Ou seja: **repetir o POST não emite em dobro**
  — mesma filosofia da nossa `referencia` do bot de WhatsApp.

### Fluxo assíncrono (padrão)

1. `POST /v2/nfe?ref=...` com o JSON da nota → API valida o schema e enfileira.
2. Resposta **HTTP 202** com `{ "cnpj_emitente": ..., "ref": ..., "status": "processando_autorizacao" }`.
3. Acompanhar por **consulta** (`GET /v2/nfe/REF`, seção 5) ou **webhook** (seção 9) até virar
   `autorizado` ou `erro_autorizacao`.

Quando o estado e a configuração da conta permitem, a emissão pode ser **síncrona** (flag
`nfe_sincrono` da empresa): a resposta vem **HTTP 201** já com `status: "autorizado"`, chave,
número e caminhos de XML/DANFE. **Implementar sempre tratando os dois casos** (201 e 202).

Respostas de erro imediatas: 400 (`requisicao_invalida`, ex.: falta a `ref`), 401 (token),
415 (`formato_invalido` — Content-Type errado/corpo vazio), 422 (`permissao_negada` = CNPJ do
emitente não autorizado no token; `erro_validacao_schema` = erro de validação com array `erros`
[{`mensagem`, `campo`}]).

### Campos do cabeçalho da nota (nomes exatos, schema `NFeRequest`)

Obrigatórios: **`natureza_operacao`**, **`data_emissao`**, **`tipo_documento`**,
**`finalidade_emissao`**, **`items`**.

| Campo | Tipo | Valores/observação |
|---|---|---|
| `natureza_operacao` | string | ex.: `"Venda de mercadoria"` |
| `data_emissao` | string ISO | ex.: `"2026-07-23T12:00:00-03:00"` |
| `data_entrada_saida` | string ISO | data de saída da mercadoria |
| `tipo_documento` | integer | 0=entrada · **1=saída** |
| `local_destino` | integer | 1=interna · 2=interestadual · 3=exterior |
| `finalidade_emissao` | integer | **1=normal** · 2=complementar · 3=ajuste · 4=devolução |
| `consumidor_final` | integer | 0=normal · 1=consumidor final |
| `presenca_comprador` | integer | 0=não se aplica · 1=presencial · 2=internet · 3=teleatendimento · 4=NFC-e entrega domicílio · 9=outros |
| `cnpj_emitente` | string | (ou `cpf_emitente`) |
| `nome_emitente`, `nome_fantasia_emitente` | string | |
| `logradouro_emitente`, `numero_emitente`, `bairro_emitente`, `municipio_emitente`, `uf_emitente`, `cep_emitente` | string | endereço do emitente |
| `inscricao_estadual_emitente` | string | |
| `regime_tributario_emitente` | integer | 1=Simples · 2=Simples excesso sublimite · 3=Regime Normal |
| `nome_destinatario` | string | |
| `cnpj_destinatario` | string | (ou `cpf_destinatario`) |
| `inscricao_estadual_destinatario` | string | |
| `indicador_inscricao_estadual_destinatario` | integer | 1=contribuinte ICMS · 2=contribuinte isento · 9=não contribuinte |
| `logradouro_destinatario`, `numero_destinatario`, `bairro_destinatario`, `municipio_destinatario`, `uf_destinatario`, `cep_destinatario`, `pais_destinatario`, `telefone_destinatario` | string | endereço do destinatário |
| `valor_frete`, `valor_seguro`, `valor_desconto`, `valor_outras_despesas` | number | totais |
| `valor_produtos` | number | soma dos itens |
| `valor_total` | number | total da nota (a SEFAZ **rejeita** se não bater com o somatório — rejeição 598 no exemplo da doc) |
| `modalidade_frete` | integer | 0=emitente (CIF) · 1=destinatário (FOB) · 2=terceiros · **9=sem frete** |
| `items` | array | itens (abaixo) |

> Campos existentes na API mas fora do resumo do OpenAPI baixado (aparecem no exemplo de consulta
> `completa=1` e na referência completa campos.focusnfe.com.br): `formas_pagamento` (array com
> `forma_pagamento` — `"01"` dinheiro, `"15"` boleto, `"90"` sem pagamento etc. —,
> `valor_pagamento`, `tipo_integracao`), `duplicatas`, `volumes`, `informacoes_adicionais_contribuinte`,
> transporte (transportadora/placa) e e-mail do destinatário (`email_destinatario`). Para nota de
> venda a prazo com boleto, ver a lista exata de valores em
> https://campos.focusnfe.com.br/nfe/NotaFiscalXML.html ("ver doc online").

### Campos de item (nomes exatos, schema `ItemNFe`)

Obrigatórios: **`numero_item`**, **`codigo_produto`**, **`descricao`**, **`cfop`**,
**`quantidade_comercial`**, **`valor_unitario_comercial`**, **`valor_bruto`**, **`codigo_ncm`**.

| Campo | Tipo | Observação |
|---|---|---|
| `numero_item` | integer | sequencial começando em 1 |
| `codigo_produto` | string | nosso código interno do produto |
| `descricao` | string | |
| `cfop` | string | ex.: `5101`/`5102` venda interna, `6101`/`6108` interestadual — **definir com o contador** |
| `codigo_ncm` | string | 8 dígitos (salgados congelados: NCM da tabela — **confirmar com o contador**) |
| `unidade_comercial` / `unidade_tributavel` | string | ex.: `UN`, `KG`, `CX` |
| `quantidade_comercial` / `quantidade_tributavel` | number | |
| `valor_unitario_comercial` / `valor_unitario_tributavel` | number | aceita até 6+ casas decimais |
| `valor_bruto` | number | quantidade × unitário |
| `inclui_no_total` | integer | 0=não · 1=sim (default da nota normal: 1) |
| `icms_origem` | integer | **0=nacional** · 1-7 estrangeira/conteúdo importado |
| `icms_situacao_tributaria` | string | CST/CSOSN — p/ Simples Nacional usa-se CSOSN (ex.: `102`, `500`); **definir com o contador** |
| `pis_situacao_tributaria` | string | ex.: `07` (isenta) / `49` / `99` — contador |
| `cofins_situacao_tributaria` | string | idem |
| `cest` | string | Código Especificador da ST — não consta no resumo OpenAPI baixado; nome do campo na referência completa: ver https://campos.focusnfe.com.br/nfe/NotaFiscalXML.html ("ver doc online") |

> Campos de valores de imposto (base, alíquota, `icms_valor`, `icms_base_calculo`, ST, FCP, IPI...)
> existem todos com o prefixo do tributo (visíveis no retorno `completa=1`); a lista completa está
> na referência de campos online. Para o nosso caso (Simples Nacional — confirmar), normalmente
> basta CSOSN + origem + PIS/COFINS por CST, sem destacar valores.

### Exemplo de JSON de emissão (adaptado da doc para venda de produto)

```bash
curl -u 'TOKEN_HOMOLOGACAO:' -X POST \
  -H 'Content-Type: application/json' \
  -d @nota.json \
  'https://homologacao.focusnfe.com.br/v2/nfe?ref=nf-app-12345'
```

`nota.json`:

```json
{
  "natureza_operacao": "Venda de mercadoria",
  "data_emissao": "2026-07-23T12:00:00-03:00",
  "data_entrada_saida": "2026-07-23T12:00:00-03:00",
  "tipo_documento": 1,
  "finalidade_emissao": 1,
  "local_destino": 1,
  "consumidor_final": 0,
  "presenca_comprador": 9,

  "cnpj_emitente": "12345678000123",
  "nome_emitente": "HARDT SALGADOS LTDA",
  "nome_fantasia_emitente": "Hardt Salgados",
  "logradouro_emitente": "Rua Exemplo",
  "numero_emitente": "100",
  "bairro_emitente": "Centro",
  "municipio_emitente": "Joinville",
  "uf_emitente": "SC",
  "cep_emitente": "89200000",
  "inscricao_estadual_emitente": "123456789",
  "regime_tributario_emitente": 1,

  "nome_destinatario": "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL",
  "cnpj_destinatario": "99887766000155",
  "indicador_inscricao_estadual_destinatario": 9,
  "logradouro_destinatario": "Rua do Cliente",
  "numero_destinatario": "200",
  "bairro_destinatario": "Bairro",
  "municipio_destinatario": "Joinville",
  "uf_destinatario": "SC",
  "cep_destinatario": "89200000",
  "pais_destinatario": "Brasil",

  "modalidade_frete": 9,
  "valor_frete": 0,
  "valor_seguro": 0,
  "valor_desconto": 0,
  "valor_outras_despesas": 0,
  "valor_produtos": 150.00,
  "valor_total": 150.00,

  "items": [
    {
      "numero_item": 1,
      "codigo_produto": "COX-TRAD-CG",
      "descricao": "COXINHA DE FRANGO CONGELADA PCT 50UN",
      "cfop": "5101",
      "codigo_ncm": "16023220",
      "unidade_comercial": "PCT",
      "unidade_tributavel": "PCT",
      "quantidade_comercial": 10,
      "quantidade_tributavel": 10,
      "valor_unitario_comercial": 15.00,
      "valor_unitario_tributavel": 15.00,
      "valor_bruto": 150.00,
      "inclui_no_total": 1,
      "icms_origem": 0,
      "icms_situacao_tributaria": "102",
      "pis_situacao_tributaria": "07",
      "cofins_situacao_tributaria": "07"
    }
  ]
}
```

> CFOP/NCM/CST-CSOSN/CEST acima são **ilustrativos** — os valores reais de cada produto vêm do
> contador (ver seção 11). Dica da doc: usar `dry_run` não existe na emissão; o teste é o próprio
> ambiente de homologação. Existe também a **pré-visualização de DANFE sem valor fiscal**:
> `POST /v2/nfe/danfe` com o mesmo JSON (ou XML), retorna o PDF direto (`application/pdf`) — bom
> para conferir a nota com o contador antes de emitir.

## 5. Consulta — `GET /v2/nfe/REFERENCIA`

Query opcional: **`completa=1`** — inclui `requisicao_nota_fiscal` (o JSON completo da nota como
foi processada, com todos os campos calculados) e `protocolo_nota_fiscal` (dados do protocolo
SEFAZ: `numero_protocolo`, `data_recebimento`, `digest_value`, `status`, `motivo`).

### Status possíveis (campo `status`)

| `status` | Significado |
|---|---|
| `processando_autorizacao` | Na fila/na SEFAZ — consultar de novo depois (payload só tem `cnpj_emitente`, `ref`, `status`) |
| `autorizado` | Nota autorizada (`status_sefaz: "100"`, `mensagem_sefaz: "Autorizado o uso da NF-e"`) |
| `cancelado` | Cancelamento registrado (`status_sefaz: "135"`) — mantém os caminhos do XML/DANFE e ganha `caminho_xml_cancelamento` |
| `erro_autorizacao` | Rejeição/erro — vem `status_sefaz`, `mensagem_sefaz` e array `erros` [{`codigo`, `mensagem`}]. Corrigir e **reenviar com a mesma `ref`** |
| `denegado` | Não aparece nas páginas baixadas do OpenAPI, mas é um status previsto no protocolo NF-e (uso denegado por irregularidade fiscal do emitente/destinatário) — ver doc online: https://doc.focusnfe.com.br |

### Campos devolvidos quando autorizada

`cnpj_emitente`, `ref`, `status`, `status_sefaz`, `mensagem_sefaz`, **`chave_nfe`** (com prefixo
`NFe`, ex.: `NFe41190612345678000123550010000000221923094166`), **`numero`**, **`serie`**,
**`caminho_xml_nota_fiscal`**, **`caminho_danfe`** (e `protocolo` com `completa=1`).

404 = `{ "codigo": "nao_encontrado", "mensagem": "Nota fiscal não encontrada." }` (ref nunca usada).

## 6. Cancelamento — `DELETE /v2/nfe/REFERENCIA`

- **Síncrono** (fala com a SEFAZ na hora).
- **Prazo legal: até 24 horas após a emissão** (alguns estados permitem prazo maior).
- Corpo JSON obrigatório: `{ "justificativa": "..." }` — **15 a 255 caracteres** (400
  `requisicao_invalida` se fora disso).
- Resposta 200: `status` (`cancelado` | `erro_cancelamento`), `status_sefaz` (135 = evento
  registrado), `mensagem_sefaz`, `caminho_xml_cancelamento`.
- 422 `codigo: "nfe_nao_autorizada"` se a nota não estiver autorizada.

## 7. Carta de correção e inutilização de numeração

### Carta de Correção (CCe) — `POST /v2/nfe/REFERENCIA/carta_correcao`

- **Síncrono**. Corpo: `{ "correcao": "..." }` — **15 a 1000 caracteres**; opcional `data_evento`
  (ISO; default = agora).
- **Não pode corrigir:** valores/variáveis de imposto (base de cálculo, alíquota...), dados
  cadastrais que mudem remetente ou destinatário, data de emissão ou de saída. Para isso, o caminho
  é cancelar (dentro do prazo) e reemitir.
- Até **20 correções** por nota; **vale sempre a última**.
- Resposta: `status` (`autorizado` | `erro_autorizacao`), `status_sefaz` (135), `mensagem_sefaz`,
  `caminho_xml_carta_correcao`, `caminho_pdf_carta_correcao`, `numero_carta_correcao`.

### Inutilização — `POST /v2/nfe/inutilizacao`

- Normalmente **desnecessária**: a Focus controla a numeração automaticamente. Usar só em situação
  específica (ex.: buraco de numeração herdado da migração).
- **Síncrono**. Corpo obrigatório: `cnpj`, `serie`, `numero_inicial`, `numero_final`,
  `justificativa` (mín. 15 caracteres).
- Resposta: `status` (`autorizado` | `erro_autorizacao`), `status_sefaz` (102 = "Inutilizacao de
  numero homologado"), `mensagem_sefaz`, `serie`, `numero_inicial`, `numero_final`, `modelo` (55),
  `cnpj`, `caminho_xml`, `protocolo_sefaz`.

## 8. Envio por e-mail e download de XML/DANFE

### E-mail — `POST /v2/nfe/REFERENCIA/email`

- Corpo: `{ "emails": ["a@x.com", "b@y.com"] }` — array obrigatório, **máximo 10 endereços**.
- Envio em segundo plano (a API confirma na hora; o e-mail pode levar minutos).
- Só funciona para nota autorizada (400 `nfe_nao_autorizada` caso contrário).

### Download de XML e DANFE

A consulta devolve **caminhos relativos**:

- `caminho_xml_nota_fiscal` — ex.: `/arquivos/CNPJ/201906/XMLs/CHAVE-nfe.xml`
- `caminho_danfe` — ex.: `/arquivos/CNPJ/201906/DANFEs/CHAVE.pdf`
- `caminho_xml_cancelamento`, `caminho_xml_carta_correcao`, `caminho_pdf_carta_correcao`

O download é feito concatenando a **URL base do ambiente** (sem `/v2`) com o caminho, autenticado
com o mesmo Basic Auth. Ex.:
`https://api.focusnfe.com.br/arquivos/.../41190612345678000123...-nfe.xml`.

> Guardar o XML no nosso lado também (Google Drive da contabilidade, como já fazemos com as notas
> de entrada) — não depender só do armazenamento da Focus.

## 9. Webhooks (gatilhos) — `/v2/hooks`

Notificações automáticas por **POST JSON** na nossa URL quando o documento muda de estado — evita
ficar consultando em loop. Cada acionamento contém os dados de **um** documento.

### Criar — `POST /v2/hooks`

Corpo (`event` e `url` obrigatórios):

```json
{
  "cnpj": "12345678000123",
  "event": "nfe",
  "url": "https://cahardt-github.xrqvlq.easypanel.host/api/webhooks/focus-nfe"
}
```

Campos opcionais de segurança: **`authorization`** (valor a enviar) e **`authorization_header`**
(nome do header HTTP em que enviar) — usar para colocar um segredo nosso e validar no endpoint.

Resposta: objeto `Hook` com `id` (string, ex.: `"Vj5rmkBq"`), `url`, `authorization`,
`authorization_header`, `event`, `cnpj`.

### Eventos disponíveis (enum `event`)

`nfe` · `nfse` · `nfsen` · `nfce_contingencia` · `nfe_recebida` · `nfe_recebida_falha_consulta` ·
`nfse_recebida` · `cte_recebida` · `inutilizacao` · `cte` · `mdfe` · `nfcom` · `nfsen_recebida` · `dce`

Para nós interessa **`nfe`** (mudança de status das notas emitidas: autorizada, erro, cancelada).
`nfe_recebida` notificaria notas emitidas **contra** nosso CNPJ (hoje coberto pelo
`sefazDfeService` próprio).

### Demais operações

- `GET /v2/hooks` — lista todos os gatilhos do token.
- Consultar por id / excluir gatilho: não estão nas páginas baixadas — ver doc online
  (https://doc.focusnfe.com.br, seção Webhooks; presumivelmente `GET/DELETE /v2/hooks/{id}`,
  confirmar antes de usar).

### Payload recebido e política de retry

- O payload do POST é o **JSON com os dados do documento** (mesmo formato da consulta da seção 5 —
  `ref`, `status`, `chave_nfe`, caminhos etc.). Formato exato por evento: ver doc online.
- **Retry:** se a nossa URL falhar (indisponível ou resposta fora da família 2xx), a Focus
  **reenvia** em: **1 min → 30 min → 1 h → 3 h → 24 h**. Depois da última tentativa, **não reenvia
  mais** aquele evento. → Nosso endpoint deve responder 2xx rápido e, como rede de segurança, o
  worker deve ter um **fallback de consulta ativa** (`GET /v2/nfe/REF`) para notas paradas em
  `processando_autorizacao` há muito tempo.

## 10. Erros — códigos HTTP e formato

Formato padrão do JSON de erro:

```json
{
  "codigo": "erro_validacao_schema",
  "mensagem": "Erro na validação do Schema XML, verifique o detalhamento dos erros.",
  "erros": [ { "mensagem": "Tipo documento não pode ser vazio", "campo": "tipo_documento" } ]
}
```

| HTTP | `codigo` típicos | Quando |
|---|---|---|
| 400 | `requisicao_invalida`, `parametros_invalidos`, `nota_ja_existente` | Falta `ref`, justificativa fora do tamanho, JSON malformado, XML já importado |
| 401 | — (corpo `text/html`: `HTTP Basic: Access denied`) | Token errado/ausente — **não é JSON** |
| 404 | `nao_encontrado` | Ref/nota/gatilho inexistente |
| 415 | `formato_invalido` | Content-Type errado ou corpo vazio |
| 422 | `permissao_negada` (CNPJ do emitente não autorizado no token), `pending_operation` (nota ainda em processamento), `already_processed` (nota já autorizada), `erro_validacao_schema`, `erro_validacao` (empresa/certificado), `nfe_nao_autorizada` | Dados válidos sintaticamente mas não processáveis |

**Erros da SEFAZ** chegam como `status: "erro_autorizacao"` na consulta/webhook, com o código de
rejeição em `status_sefaz` e o texto em `mensagem_sefaz`. Exemplos citados na doc:

- `598` — "Total da NF difere do somatório dos valores que compõe o valor total da NF" (nosso
  `valor_total`/`valor_produtos` não bate com os itens — cuidado com arredondamento de centavos,
  mesma classe de problema que já tratamos no Asaas/CA).
- `215` — "Rejeição: Falha no schema XML".
- `102` — (inutilização) "Inutilizacao de numero homologado" (sucesso).
- `100` — "Autorizado o uso da NF-e" (sucesso). · `135` — evento (cancelamento/CCe) registrado.

Rate limit: **não documentado nas páginas baixadas** — ver doc online se necessário.

## 11. Plano de integração no CA-Hardt (esboço)

1. **Service novo `backend/services/focusNfeService.js`** — cliente HTTP (Basic Auth com senha
   vazia) + montagem do JSON da nota a partir do pedido/NF do app; expõe `emitir(ref, nota)`,
   `consultar(ref)`, `cancelar(ref, justificativa)`, `cartaCorrecao(ref, texto)`, `email(ref, emails)`,
   `baixarXml/baixarDanfe(caminho)`.
2. **Tokens em env vars do EasyPanel** (nunca no repo): `FOCUS_NFE_TOKEN_PRODUCAO`,
   `FOCUS_NFE_TOKEN_HOMOLOGACAO`, `FOCUS_NFE_AMBIENTE` (`homologacao`|`producao`) escolhendo a URL
   base. Segredo do webhook: `FOCUS_NFE_WEBHOOK_SECRET` (via `authorization`/`authorization_header`
   do gatilho).
3. **Cadastro da empresa**: uma vez, via painel ou `POST /v2/empresas` (com `dry_run=1` antes);
   certificado A1 já está no app (tabela `certificadoDigital`,
   `certificadoService.descriptografarCertificado()` devolve `{ pfx, senha }` →
   `pfx.toString('base64')` vira `arquivo_certificado_base64`). Setar `habilita_nfe: true` e — na
   virada — `serie_nfe_producao`/`proximo_numero_nfe_producao` continuando a sequência do Conta Azul.
4. **`ref` = id interno da nota no app** (idempotência de graça: reemitir após rejeição usa a mesma
   ref; clique duplo não duplica). Tabela nova tipo `NotaFiscalEmitida` guardando ref, status,
   chave, número, série, caminhos, XML baixado.
5. **Webhook público `POST /api/webhooks/focus-nfe`** (sem auth de usuário, validando o header
   secreto; registrar o gatilho `event: "nfe"`) + **worker de fallback** no `scheduler.js`
   consultando notas presas em `processando_autorizacao`.
6. **Homologação primeiro**, ponta a ponta (emitir → webhook → DANFE → cancelar → CCe), testado
   **em produção do nosso app** atravessando um deploy (regra do projeto), antes de trocar para
   `producao`.
7. **⚠️ Antes de produção: matriz tributária com o contador** — CFOP, NCM, CEST, CSOSN/CST de
   ICMS, PIS e COFINS por produto (salgados congelados podem ter ST de ICMS em SC), campos novos no
   cadastro de Produtos. Sem isso, nota rejeitada ou — pior — autorizada com imposto errado.
8. XML autorizado → salvar também no Google Drive da contabilidade (fluxo já existente das notas de
   entrada) e disponibilizar DANFE na tela do pedido.
