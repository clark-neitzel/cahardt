# Plano: Contagem do dinheiro v2 (CampoNumero + modal largo + Contar x Conferir + quebra de caixa)

Base aprovada: `docs/mockups/conferencia-dinheiro-v2.html`. Autor: arquiteto (somente leitura). Porte: GRANDE (toca Caixa/financeiro, schema, 127 campos em ~55 arquivos).

## 1. Entendimento

O dono aprovou 4 pontos + 1 extra:
1. `CampoNumero` único substitui todos os `type="number"` (127 linhas em 56 arquivos; confirmado por `grep -rn 'type="number"' frontend/src`). Não existe `type='number'`, `type={...}` nem `valueAsNumber` no código (grep zerado), então o padrão é uniforme.
2. Modal de contagem largo (3 colunas no desktop; abas no celular).
3. Dois botões no card do Caixa: **Contar** (grava só a contagem, sempre ligado) e **Conferir e fechar** (o de hoje, atrás da chave `caixa_conferencia`).
4. iPad em pé 2 colunas, deitado 3, celular abas.
5. Extra: chips "Quebra de caixa" / "Outro motivo…" acima do motivo, gravados de forma filtrável (`motivoTipo`).

Interpretação adotada: "Contar" NÃO altera `caixa_diario` (nem `dinheiroConferido`, nem estado), só insere linha em tabela nova. "Quebra de caixa" é rótulo do MOTIVO; não muda a regra de limite/senha (`quebraCaixa` do conferente) que continua igual.

## 2. Mapa do código atual (lido de verdade)

Frontend
- `frontend/src/pages/Caixa/ConferenciaDinheiroCard.jsx` (535 linhas): `LinhaContagem` (l.37, FORA do componente de propósito, perde foco se mover), `ModalConferir` (l.67; `max-w-lg` único, uma coluna), `ConferenciaDinheiroCard` (l.333). Único `type="number"` do arquivo está em `LinhaContagem` (l.45). O campo "outros" já é texto com `inputMode="decimal"` e converte `replace(',', '.')` (l.77 e l.108) — padrão que o CampoNumero absorve.
- Estados do card: conferido (l.~380) / sem movimento (l.~409) / caixa fechado (l.~424) / pendente (l.~445). Botão de conferir só aparece com `podeConferir` e some para o dono do caixa (`bloqueadoPorSerDono`).
- Montagem: `frontend/src/pages/Caixa/CaixaDiarioPage.jsx:1318` passa `resumo.conferenciaDinheiro`.
- API client: `frontend/src/services/caixaService.js:49-92` (`conferirDinheiro`, `desfazerConferenciaDinheiro`, config...).
- Exibição do motivo: `ConferenciaDinheiroCard.jsx` (linha "Motivo: ...") e `frontend/src/pages/Caixa/RelatorioCaixaPrint.jsx:333-334` (`relatorio.conferenciaDinheiro.motivoDiferenca`, texto puro — continua funcionando sem mudança).

Backend
- `backend/routes/caixa.js`: rotas de conferência `/conferencia-dinheiro/*`. As GET (l.227-305) ficam ANTES de `router.use(checkAcessoCaixa)` (l.311); as POST `enviar` (l.1169), `conferir` (l.1191), `desfazer` (l.1226) ficam DEPOIS, ou seja, já cobertas por `checkAcessoCaixa` (`admin || Pode_Acessar_Caixa || Pode_Editar_Caixa`, l.82-93) que deixa `req._perms` pronto. `GET /resumo` monta o objeto `conferenciaDinheiro` (l.888-912); `POST /reabrir` zera campos da conferência (l.1519-1530).
- `backend/services/caixaConferenciaService.js`: `conferirDinheiro` (l.263-355) — valida motivo obrigatório se há diferença (l.298), calcula `somarContagem`, limite de quebra/senha, grava em `caixaDiario.update`. `desfazerConferencia` (l.359). `minhasConferencias` (l.549) devolve `motivoDiferenca`. `sugerirTarefaDiferenca` (l.393) usa `caixa.motivoDiferenca` no texto da tarefa.
- Schema: `backend/prisma/schema.prisma:1791` `CaixaDiario` — campos `contagemDinheiro Json`, `valorContado`, `motivoDiferenca @db.Text` etc. `caixa.js` e `caixaConferenciaService.js` NÃO têm `$transaction` hoje (grep) — boy scout não se aplica nesses dois arquivos, mas a regra vale para qualquer transação nova.
- Chave: `backend/config/caixaConferenciaConfig.js` (`caixa_conferencia`, `ativo`). Hoje, o botão "Conferir" aparece mesmo com a chave desligada (a chave só liga a TRAVA do fechamento). Ou seja, "Conferir e fechar" não some com chave off; a decisão do dono ("Contar fora da chave") significa: Contar nunca é afetado por `ativo`/`exigida`. Preservar o texto "opcional por enquanto" quando `ativa === false`.
- Outros usos de `motivoDiferenca`: `conciliacaoBancaria.js`/`contabilidadeRoutes.js` são OUTRO conceito (grupo de conciliação) — NÃO tocar. Em `caixa.js:2516` (relatório) o motivo sai texto puro.
- Manual/Clippy: `backend/manuais/abas/caixa.md` (seção "Conferir o dinheiro", l.228+) e entrada `caixa` em `backend/services/copilotoService.js:64` (rota e permissão não mudam).

## 3. Decisões de arquitetura

### 3.1 CampoNumero (estratégia de valor)
Arquivo: `frontend/src/components/CampoNumero.jsx` (React.forwardRef).

Contrato (drop-in):
- Renderiza `<input type="text" inputMode="numeric|decimal" autoComplete="off">`. Props repassadas: `className, disabled, required, name, id, autoFocus, placeholder, onBlur, onKeyDown, onFocus, onClick, style, title, aria-*, data-*`, `ref`. `type` e `inputMode` recebidos são ignorados (derivados).
- Props de comportamento: `min`, `max`, `step` (como hoje), `decimal` (bool opcional), `casas` (nº máx. de decimais, opcional), `permiteNegativo` (default false).
- Tipo derivado: se `decimal` informado, vale ele; senão `step` com ponto ou `"any"` => decimal; `step` ausente ou inteiro => inteiro. Casas = `casas` ?? casas de `step` (0.01 => 2, 0.001 => 3, 0.5 => 1, any => 4).
- Digitação: filtra a cada tecla; inteiro só `0-9`; decimal `0-9` + UMA vírgula/ponto; `-` só no início e só com `permiteNegativo`. Colar: sanitiza (se vier "1.234,56" => 1234.56; se só um separador, é decimal). Aceita vírgula E ponto na digitação; exibe o que a pessoa digitou (vírgula).
- Scroll do mouse: não faz nada por ser `type="text"` (confirmar no QA; não precisa de `onWheel`).

**Estratégia de conversão (a decisão-chave): o componente ENTREGA `e.target.value` JÁ COM PONTO e sem separador pendente.** Ex.: digitou `12,5` => `"12.5"`; digitou `12,` => `"12"`; digitou só `,` => `""`; vazio => `""`. Assim todo `Number(e.target.value)`, `parseFloat`, `parseInt`, `e.target.value ? x : ''` e envio ao backend continuam EXATAMENTE como hoje (hoje o `type=number` também entrega string com ponto). Nenhum consumidor precisa converter vírgula.
- `onChange` recebe um objeto pseudo-evento: `{ target: { value, name, id, type: 'number' }, currentTarget: (mesmo), preventDefault(){}, stopPropagation(){}, persist(){} }`. NÃO usar o evento real (o DOM mostra a vírgula). Quem usa handler compartilhado com `e.target.name` continua funcionando (name repassado). Quem lê `e.target.checked`/`e.target.files` não existe em número.
- Texto local x valor do pai: o componente guarda `texto` interno. Sincroniza do `value` do pai SOMENTE quando `Number(value)` difere do número do `texto` atual (ou value virou ''/null/undefined). Isso evita apagar "12," (que o pai guardou como "12") e evita o bug do foco perdido. `value` aceita número, string, null, undefined (=> ''). Exibição do valor vindo do pai usa vírgula (`String(v).replace('.', ',')`).
- `min/max`: não bloqueia a digitação (como o number nativo). Para NÃO perder a validação nativa de formulários que usam `required`/`min`/`max` no `<form onSubmit>`, o componente chama `setCustomValidity('Valor mínimo é X')` quando fora da faixa (efeito no `ref`). Sem isso, forms com `min` passariam a salvar valor fora da faixa. Passo (`step`) deixa de validar no submit (type=text não valida); o backend continua sendo a barreira — registrar como mudança aceita.
- Botões −/+ (só quando `botoes` ligado, usado na contagem): incrementam por `passo` (default 1), respeitam `min`, 44px de altura no mobile, `type="button"`, `tabIndex={-1}`, `aria-label`. Componente separado exportado: `CampoNumero` (puro) e `CampoNumeroComBotoes` (wrapper) no mesmo arquivo.
- Enter não é interceptado (o `onKeyDown` do consumidor segue valendo — NovoPedido/PainelEstoque/PosicaoEstoque dependem disso). A navegação "Enter pula para a próxima nota" é do modal, não do componente.
- Tema: manter classes do consumidor; o componente não adiciona borda/padding.

### 3.2 Troca dos 127 campos: codemod + revisão, de uma vez (decisão do dono)
- Codemod com `@babel/parser` (já presente em `frontend/node_modules/@babel/parser`) + edição por posição (não regex: há `=>` e `{}` dentro das tags, e tags multilinha — 44 inputs não têm `min`, vários têm o `type="number"` em linha separada). Rodar a partir de um script temporário FORA do repositório (scratchpad), nunca commitar.
- Regra: todo `JSXOpeningElement` `input` com atributo `type="number"` vira `CampoNumero`; remove `type` e `inputMode`; preserva TODOS os outros atributos; adiciona `import CampoNumero from '<caminho relativo>/components/CampoNumero'` se faltar. Para `inputMode="decimal"`/`step` decimal/`"any"` marca decimal; senão inteiro. O que cair em "inteiro" mas SEM `step` e SEM `inputMode` entra numa lista `REVISAR.txt` (ver 3.3).
- Depois do codemod: `git diff --stat` tem de mostrar só trocas de tag/import; `grep -rn 'type="number"' frontend/src` => 0; `cd frontend && npm run build`.
- Não renomear nada, não alterar `value/onChange` dos consumidores, salvo os casos de 3.3.

### 3.3 Pontos de risco da troca (cada um tem dono e conferência)
1. **Campo inteiro que na verdade aceita fração** (quantidade em kg, litros, estoque mínimo, %). Hoje `type=number` sem `step` aceita decimal digitado. Se o codemod classificar como inteiro, a vírgula some e o usuário perde o decimal. Mitigação: lista `REVISAR` = os campos SEM `step` (levantamento atual: 44 linhas sem `min`; destas as sem `step` incluem VeiculoFicha km, PainelEstoque:848 quantidade, ListaPedidos:986 nº embarque, CaixaDiarioPage:758/767, PCP ItemPcpForm/OrdemProducaoForm/ReceitaForm:577, EstoquePcp, Metas, TabelaPrecos). Dev abre cada um, descobre a unidade e marca `decimal` quando preciso. Regra prática: quantidade de PRODUTO com `controlaEstoque`/peso/kg => decimal; km, dias, parcelas, nº de embarque/pedido, portas SMTP => inteiro.
2. **Negativo**: levantamento: NENHUM `min` negativo no código. Candidatos a conferir antes de ligar `permiteNegativo`: `TabelaPrecos` acréscimo (%)/regra de categoria (l.528, 551, 870 — "Acréscimo" pode ser desconto negativo? conferir no backend/validação do campo antes), `Metas/MetaFormModal` (7 campos), `Comissoes/ConfigModal`, `ListaVendedores` flex (percentualFlex/maxDescontoFlex), `DetalheCliente:1427` (ciclo, inteiro positivo), ajuste de estoque (`EstoquePcp:209` e `PainelEstoque:848` usam botão Entrada/Saída + `parseFloat(...) <= 0` recusa => positivos). Default fica sem negativo; só liga onde o dev provar necessidade e anota no relatório.
3. **`value` controlado com número flutuante** (`0.1+0.2`): exibição igual à de hoje; não é regressão. `value={0}` mostra "0".
4. **Handlers que fazem `Number(e.target.value)` ANTES de guardar** e depois `value={estado}` com número: ex. `NovoPedido.jsx:~75` (`if (v >= 0) onChange(v)`), `DetalheCliente:1429` (`parseInt`). Digitar "5," no decimal: pai guarda 5, componente mantém "5," (regra de sincronização). Digitar "0," => pai guarda 0; mantém. QA digita `0,5`, `1,05`, `10,50` em cada tipo de handler (string, número, parse).
5. **Foco/seleção**: `onFocus={e => e.target.select()}` (NovoPedido, ModalAmostra) continua, pois onFocus passa o evento real. Componente precisa repassar `onFocus` e `ref`.
6. **`ref`** (`quantidadeRef` em PainelEstoque:848 etc.): forwardRef aponta o `<input>` real.
7. **Mobile**: `inputMode="decimal"` no iOS pt-BR mostra vírgula; teclado sem sinal de menos (por isso negativo é exceção e usa `inputMode="text"` + validação).
8. **Validação nativa perdida** (step): aceita — backend valida; registrar.
9. **Já existe um input numérico artesanal** (`NovoPedido.jsx` componente de quantidade, l.40-85: o ramo `permiteFracao` já é `type=text` com vírgula; o ramo inteiro é `type=number`). Trocar só o ramo `number`, mantendo o `commit`/`Enter` deles.
10. **Campos dentro de tabelas/linhas com `key` instável** — não mudar `key`; o componente não deve remontar.
11. **CSS global**: nenhum seletor `input[type=number]`/spinner em `index.css` nem scripts de teste do repo (grep zerado) — nada a ajustar; a camada de tema (botões) não afeta input.
12. **PWA/lazy**: CampoNumero entra no bundle principal por import estático (componente pequeno); sem lazy.

### 3.4 Modal de contagem (ModalConferir)
Arquivo: `ConferenciaDinheiroCard.jsx` (pode extrair o modal para `frontend/src/pages/Caixa/ModalContagemDinheiro.jsx` se o arquivo passar de ~800 linhas; manter `LinhaContagem` FORA de qualquer componente, e os comentários que explicam por quê — foco perdido, total nunca digitado, larguras fixas).
- Prop nova `modo`: `'contar' | 'conferir'`. Mesmo estado de cédulas/moedas/outros; `valorEsperado`, `minhaQuebra`, motivo, autorizador e senha só existem em `conferir`.
- Largura: `md:max-w-lg` vira `md:max-w-3xl lg:max-w-5xl`; grid `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`. iPad em pé (768-1023px) = 2 colunas (cédulas | moedas+outros, resumo em faixa abaixo ou 2ª linha); iPad deitado/desktop (>=1024px) = 3 colunas (cédulas | moedas+outros | resumo). Altura `max-h-[95vh]` com conteúdo sem rolagem em >=lg (conferir em 1280x720 e 1024x768); resumo `sticky`.
- Celular (<md): abas `Cédulas · Moedas · Outros` (estado `aba`), com rodapé fixo (total + botão principal) — `shrink-0` fora da área rolável, `pb-[env(safe-area-inset-bottom)]`. As abas mostram o subtotal em cada rótulo. No modo conferir, o bloco diferença/motivo/autorizador fica numa 4ª seção "Resumo" acima do rodapé (ou dentro da aba Outros) — o dev propõe, QA valida que o botão final está sempre alcançável.
- Linha de nota: `[−] [CampoNumero] [+]` + subtotal; botões 44px no mobile (`min-h-[44px] min-w-[44px]`), no desktop 32px. `CampoNumero` inteiro, `min=0`, `max=9999`.
- Enter pula para a próxima nota: `onKeyDown` do campo => `preventDefault`, focar o próximo `[data-contagem]` do container (ordem DOM: cédulas, moedas, "outros"); na última, focar o botão salvar. Não usar `form submit`.
- Total nunca digitado: preservar `totais` por `useMemo`; "outros" continua texto de valor (agora também `CampoNumero decimal casas=2`, emitindo ponto — remover os `replace(',', '.')` só depois de provar que emite ponto).
- `semMovimento` no modo conferir: igual a hoje (sem tabela). No modo contar, `semMovimento` não se aplica (card nem oferece Contar).
- Pré-preenchimento: prop `inicial={cedulas, moedas, outros, observacao}` usada por "Usar na conferência" (abre modo conferir já preenchido, editável) — o `useEffect` de reset em `aberto` passa a aplicar `inicial` em vez de zerar.
- Textos conforme mock: modo contar mostra faixa "É só uma contagem. Não fecha o caixa, não pede motivo nem senha. Fica anotada no dia do motorista com seu nome e a hora." e botão "Salvar contagem". Header: "Contagem do dinheiro".
- Design system: botões em pílula (`rounded-full`, `bg-primary hover:bg-primaryDark`; secundário outline verde), cards `rounded-xl border-gray-200`, modal `rounded-2xl`, fundo header `bg-house`, tokens do CLAUDE.md; chips de motivo como pílulas (`rounded-full`) com par ativo `bg-mint text-primaryDark border-primary`. Autorizador continua `SelectBusca` (nunca `<select>`). Sem animar box-shadow.

### 3.5 Contar x Conferir no card
- Dois botões no estado pendente (l.~445): `🧮 Contar o dinheiro` (secundário/outline, SEMPRE visível para quem abre o card, inclusive o dono do caixa e quem não tem `Pode_Conferir_Dinheiro_Caixa`) e `✅ Conferir e fechar — R$ X` (primário, igual ao de hoje: continua exigindo `podeConferir`, e `bloqueadoPorSerDono`).
- A mensagem "Só quem tem a permissão 'Conferir Dinheiro do Caixa'..." (l.~478) continua, mas passa a dizer que contar está liberado.
- Contar não aparece: caixa fechado, caixa já conferido (card verde), sem movimento. (Backend recusa também: ver 4.)
- Chip da última contagem (acima dos botões): `🧮 R$ X · N peças · Contado por Fulano às HH:MM` + `Usar na conferência` (só se `podeConferir`; abre modo conferir pré-preenchido) + `Contar de novo` (abre modo contar vazio; a anterior fica como histórico, nunca apagada). Se houver 2+ contagens, o chip mostra a última e um "ver histórico (N)" que expande a lista do dia (simples, só leitura).
- A contagem NÃO muda `estadoDoCaixa`, não destrava fechamento, não aparece em `podeFechar`/`conferenciaDinheiroPendente`. A regra "caixa não fecha sem conferir" fica intocada.
- Dados do card: `resumo.conferenciaDinheiro` ganha `contagens` (ver contrato) para evitar 2ª chamada; recarga via `onAtualizar` (já existe).

### 3.6 Quebra de caixa (extra)
- Front (modo conferir, quando há diferença): linha de 2 chips `Quebra de caixa` | `Outro motivo…` acima do campo motivo. Clique em Quebra: `motivoTipo='QUEBRA_DE_CAIXA'`, motivo = `Quebra de caixa (falta)` ou `(sobra)` conforme `diferenca < 0`, campo `readOnly`. Se a diferença trocar de sinal depois (a pessoa mexeu nas notas), recalcular o texto (efeito dependente de `faltando`). Outro motivo: `motivoTipo='OUTRO'`, campo livre e vazio. Nenhum chip marcado => botão confirmar desabilitado (motivo obrigatório continua; regra de `podeConfirmar` inalterada).
- Back: coluna nova `CaixaDiario.motivoTipo String? @map("motivo_tipo")` (nullable, sem default => nenhum risco no `db push`). `conferirDinheiro` recebe `motivoTipo`; validação: com diferença, `QUEBRA_DE_CAIXA` ou `OUTRO` (ausente => `OUTRO`, compatível com clientes antigos/cache PWA); sem diferença => `null`. Para `QUEBRA_DE_CAIXA` o SERVIDOR monta o texto (`Quebra de caixa (falta|sobra)` pelo sinal da diferença que ele mesmo calculou) — não confia no texto do cliente. O texto fica em `motivoDiferenca` (histórico, relatório impresso, tarefa da agenda continuam funcionando sem alteração).
- Limpar `motivoTipo` junto de `motivoDiferenca` em `desfazerConferencia` e no `POST /reabrir` (`caixa.js:~1519`). Nota: `desfazerConferencia` hoje grava `motivoDiferenca: motivo || null` (aceitável; `motivoTipo: null`).
- Exposição: `GET /resumo` => `conferenciaDinheiro.motivoTipo`; `minhasConferencias` => `motivoTipo`; filtro futuro por `motivoTipo` fica possível por query simples (não há tela de filtro neste pedido).
- Registros antigos: `motivoTipo = null` (NÃO fazer backfill por texto; "null" = anterior ao recurso).

## 4. Backend: schema, rotas e contrato

### 4.1 Schema (`backend/prisma/schema.prisma`)
```prisma
model CaixaContagem {
  id              String   @id @default(uuid())
  vendedorId      String   @map("vendedor_id")        // dono do caixa contado
  dataReferencia  String   @map("data_referencia")    // YYYY-MM-DD
  total           Decimal  @db.Decimal(12, 2)
  pecas           Int
  detalhe         Json                                  // { cedulas:{"200":2}, moedas:{"0.5":3}, outros:[{descricao,valor}] }
  observacao      String?  @db.Text
  contadoPorId    String   @map("contado_por_id")
  contadoPorNome  String?  @map("contado_por_nome")
  criadoEm        DateTime @default(now()) @map("criado_em")

  @@index([vendedorId, dataReferencia])
  @@index([contadoPorId])
  @@map("caixa_contagens")
}
```
- Sem relações Prisma (colunas simples) para não mexer em `Vendedor`/`CaixaDiario`; assim o `db push` só cria tabela nova.
- `id` gerado no cliente (UUID v4, `crypto.randomUUID()`) e enviado: idempotência de duplo clique/retry (ver 4.2).
- `CaixaDiario`: adicionar `motivoTipo String? @map("motivo_tipo")` (comentário `// QUEBRA_DE_CAIXA | OUTRO; null = registro anterior ao recurso`). NÃO remover nem renomear nenhum campo existente. Índices ficam declarados no schema (db push derruba o que não está).

### 4.2 Rotas (em `backend/routes/caixa.js`, DEPOIS de `router.use(checkAcessoCaixa)`, junto das POST de conferência ~l.1226)
Lógica em `caixaConferenciaService.js` (novas funções `registrarContagem`, `listarContagensDoDia`); a rota fica fina.

**POST `/api/caixa/contagem-dinheiro`** — permissão: a do `checkAcessoCaixa` (admin | Pode_Acessar_Caixa | Pode_Editar_Caixa). Sem exigir `Pode_Conferir_Dinheiro_Caixa`; sem olhar a chave `caixa_conferencia`. Para contar o caixa de OUTRA pessoa vale a mesma regra do `/resumo` (l.360): `vendedorId != req.user.id` exige admin | Pode_Editar_Caixa | podeConferir | podeFechar; senão 403. (O dono do caixa pode contar o próprio.)
Request:
```json
{ "id": "uuid-gerado-no-cliente",
  "vendedorId": "…", "data": "2026-10-19",
  "contagem": { "cedulas": {"200":2,"50":1}, "moedas": {"0.5":4}, "outros": [{"descricao":"Cheque","valor":150.0}] },
  "observacao": "texto opcional" }
```
Servidor ignora `total`/`pecas` enviados: recalcula com `somarContagem(contagem)` (já existente, l.~248) — "o total nunca é digitado". Valida: `data` obrigatória; contagem não vazia (total > 0, senão 400 "Conte pelo menos uma nota ou moeda"); quantidades inteiras 0..99999; valores de `outros` > 0; denominações só das listas CEDULAS/MOEDAS (200,100,50,20,10,5,2 / 1,0.5,0.25,0.1,0.05). Se existir `caixaDiario` do par vendedor+data com `status !== 'ABERTO'` => 400 "Caixa já fechado". Caixa conferido (`dinheiroConferido` válido) => 400 "Este caixa já foi conferido". Insere linha com `contadoPorId/Nome` do `req.user`. Idempotência: `create` com `id` do cliente; erro `P2002` => buscar e devolver a existente (`duplicado: true`). Sem `$transaction` (um único insert). Se algum dia precisar de transação: `{ timeout: 20000, maxWait: 10000 }`, log/API externa fora.
Resposta 201 (ou 200 se duplicado):
```json
{ "ok": true, "duplicado": false,
  "contagem": { "id":"…","vendedorId":"…","data":"2026-10-19","total":1320.00,"pecas":41,
                "detalhe":{…},"observacao":null,"contadoPorId":"…","contadoPorNome":"Letícia","criadoEm":"2026-10-19T17:32:00.000Z" } }
```

**GET `/api/caixa/contagem-dinheiro?vendedorId=…&data=YYYY-MM-DD`** — mesma permissão e mesma regra de "caixa de outro". Resposta: `{ "contagens": [ {…mesmo objeto…} ] }` ordenado por `criadoEm desc` (a [0] é a vigente; as demais são histórico). Também exposto de graça em `GET /resumo` como `conferenciaDinheiro.contagens` (mesmos objetos; no máx. 20) para o card não fazer segunda chamada — campo NOVO, aditivo.

**POST `/api/caixa/conferencia-dinheiro/conferir`** (existente) — payload ganha `motivoTipo` (opcional, string `QUEBRA_DE_CAIXA|OUTRO`). Todo o resto idêntico. Resposta ganha `motivoTipo` dentro de `caixa`. Nenhum campo removido.

Nenhuma rota existente muda de nome ou de formato (só campos aditivos).
Não há ligação com `/api/ia-consulta/v1` nem WhatsApp neste escopo.

### 4.3 Permissões (front = back)
- Contar: backend `checkAcessoCaixa` (admin | Acessar | Editar). Front: o card só existe dentro de `/caixa` (rota exige `Pode_Acessar_Caixa`; usuário com SÓ `Pode_Editar_Caixa` passa no backend mas não entra na rota — divergência PRÉ-EXISTENTE, não criar nova). O botão Contar aparece para quem vê o card, exceto quando for caixa de outra pessoa e o usuário não tiver acesso a ele (nesse caso a tela nem carrega o caixa — `/resumo` já 403).
- Conferir e fechar: continua `podeConferir` (do backend) e `bloqueadoPorSerDono`. Nenhuma permissão nova no `BOOL_INDEX`.
- "Usar na conferência" só habilita se `podeConferir && !bloqueadoPorSerDono` (mesmo critério do botão Conferir).

## 5. Ordem de execução e paralelismo

Contrato fechado na seção 4.2 permite trabalhar em paralelo desde a Etapa 1.

| Etapa | Dev | Conteúdo | Depende de |
|---|---|---|---|
| E1 | dev-frontend | `CampoNumero.jsx` + `CampoNumeroComBotoes` + página/teste isolado (sem trocar nada) | — |
| E1b | dev-backend | schema (`CaixaContagem`, `motivoTipo`), service + rotas `contagem-dinheiro`, `motivoTipo` no conferir/desfazer/reabrir/resumo/minhas; testes com curl | — (em paralelo com E1) |
| E2 | dev-frontend | Modal largo/abas/botões −/+/Enter com CampoNumero; chips de motivo; card com 2 botões e chip da contagem; `caixaService.js` (`salvarContagem`, `getContagens`) | E1 (componente) + contrato 4.2 (pode mockar a resposta até E1b ficar pronto) |
| E3 | dev-frontend | Codemod e troca dos ~126 campos restantes + lista REVISAR resolvida | E1 estável e aprovado em QA; fazer DEPOIS de E2 para não conflitar no mesmo arquivo |
| E4 | dev-backend + dev-frontend | Manual do Clippy `backend/manuais/abas/caixa.md` (seções "Contar o dinheiro", "Conferir e fechar", quebra de caixa, abas no celular) + novidade `frontend/public/novidade-contagem-dinheiro.html` (mockups das telas com pins numerados, accordions `acc aberto`, SEM `og:image`, SEM botão "Abrir o app") + entrada no topo de `frontend/public/novidades.json` (`slug: "contagem-dinheiro"`) + bump `deployMarker` do `/admin-exec/ping` | E1-E3 |
| QA / revisão | qa-testador + revisor-codigo em paralelo (após E2 e de novo após E3), depois gerente-entrega | | |

Commits sugeridos (um por etapa, só depois de `cd frontend && npm run build` OK; `git add` explícito e conferir HEAD antes — sessões paralelas): C1 backend (schema+rotas), C2 CampoNumero+modal+card, C3 troca em massa (commit isolado para ser fácil de reverter), C4 manual+novidade.
Deploy: backend e frontend juntos (tabela nova entra por `prisma db push` no deploy; a coluna `motivo_tipo` nullable e a tabela nova não quebram o push). Cliente PWA antigo mandando conferir sem `motivoTipo` continua funcionando (default OUTRO). Esperar o deploy concluir de fato (rota `GET /api/caixa/contagem-dinheiro` respondendo, não 404; `deployMarker`) antes de dizer pronto. Não há upload de arquivo neste escopo (regra `uploads/` não se aplica).

## 6. Riscos gerais e armadilhas
- Mexer em `conferirDinheiro` é área financeira sensível: não alterar fórmula do esperado, limite de quebra, senha do autorizador, trava "dono não confere o próprio caixa" nem "quem conferiu não fecha". Contar NÃO pode marcar `dinheiroConferido`.
- Contagem não pode "sumir" na virada/reabertura: `POST /reabrir` zera conferência mas NÃO deve apagar `caixa_contagens` (histórico).
- Operação que pode rodar duas vezes: salvar contagem com `id` do cliente (idempotente); botão desabilita enquanto `salvando` (padrão atual).
- Contagem velha vs valor mudou: a contagem é só "quanto tem de dinheiro"; não guarda esperado, logo não "cai" como a conferência. O chip mostra hora para o conferente avaliar.
- Chave: não acoplar Contar a `caixa_conferencia`.
- `LinhaContagem` precisa seguir fora do componente (senão perde foco ao digitar). Agora com CampoNumero que tem estado interno, remontar a linha apaga o texto local — reforça a regra.
- Evitar `position:absolute` com offset negativo em grid, sempre `gap` no mobile; sem `box-shadow` animado; sem scroll horizontal em 375px; `SelectBusca` para dropdown; `useFiltrosSalvos` não se aplica (nenhum filtro novo).
- Textos: nunca interpolar campo opcional sem guarda (`pecas`, `contadoPorNome`, `criadoEm`).
- Impressão (`RelatorioCaixaPrint.jsx`): não mudar; texto do motivo já sai certo. Se o dono quiser a contagem na folha, é pedido à parte.
- Manual do Clippy: lembrar a regra do CLAUDE.md (atualizar `caixa.md` e avisar o dono); rota/permissão da aba não mudam => tabela `ABAS` do copiloto fica igual.
- Não commitar o codemod nem arquivos de teste temporários.

## 7. Critérios de aceite por etapa (o que o QA clica)

**E1 CampoNumero (isolado)**
- Em página de teste e depois no modal: digitar `abc`, `e`, `+`, `-` => nada entra. Inteiro: `12,5` => só `125` (vírgula/ponto não entram). Decimal: `12,5`, `12.5`, `12,5,3` => só uma vírgula; colar `1.234,56` => `1234,56`.
- Mouse com foco/hover no campo + scroll: valor não muda; a página rola.
- `onChange` recebe `e.target.value` com ponto (`"12.5"`), `"12"` para `"12,"`, `""` para vazio; `name` presente.
- Controlado por número (`value={5}`) e por string; apagar tudo => `""`; valor externo mudando (reset) atualiza o texto.
- `ref`, `autoFocus`, `onBlur`, `onKeyDown` (Enter), `disabled`, `required` (form nativo bloqueia vazio), `min/max` (form nativo bloqueia fora da faixa com mensagem).
- Celular: teclado numérico abre (iOS e Android).
- Build passa.

**E1b Backend (curl com token local; banco `hardt_local`)**
- POST contagem válida => 201 + total/peças recalculados pelo servidor (enviar total errado de propósito e ver ignorado). Repetir mesmo `id` => 200 `duplicado:true`, 1 linha só.
- Contagem vazia => 400. Caixa fechado/conferido => 400. Denominação inventada (ex. `"3"`) => 400.
- Usuário só com `Pode_Acessar_Caixa` (sem `Pode_Conferir_Dinheiro_Caixa`) consegue contar o próprio caixa; contar caixa de outro sem permissão => 403; sem acesso ao Caixa => 403.
- GET lista ordenado desc; `/resumo` traz `conferenciaDinheiro.contagens` e `motivoTipo`.
- Conferir com diferença: `motivoTipo=QUEBRA_DE_CAIXA` grava texto montado pelo servidor ("falta"/"sobra" correto); sem `motivoTipo` => `OUTRO`; sem diferença => `null`. Desfazer e Reabrir zeram `motivoTipo` e NÃO apagam contagens. Fechar caixa sem conferir continua bloqueado (chave ligada) mesmo com contagem.
- `node --check` nos arquivos; `prisma validate`; conferir que nenhum campo do schema foi removido.

**E2 Modal + card + chips (desktop 1280, iPad 768/1024, iPhone 375)**
- Desktop: modal largo em 3 colunas, SEM barra de rolagem vertical no modo contar e no modo conferir sem diferença; total muda ao digitar; Enter percorre 7 cédulas, 5 moedas e termina no botão; − / + funcionam e respeitam 0.
- Mobile: abas Cédulas/Moedas/Outros; total e botão sempre visíveis no rodapé; botões −/+ >=44px; sem scroll horizontal; subtotais nas abas.
- Contar: sem esperado/motivo/senha; salvar => toast, chip "R$ X · N peças · Contado por Fulano às HH:MM". Contar de novo => nova linha, a anterior continua na lista. "Usar na conferência" abre modo conferir preenchido e editável; usuário sem permissão de conferir NÃO vê o botão, mas vê o chip e Contar.
- Contagem não muda o estado do caixa: continua "a conferir", `Fechar` continua bloqueado.
- Conferir e fechar R$ X: fluxo de hoje intacto — com diferença exige motivo; acima da quebra exige autorizador (SelectBusca) + senha; sem diferença não pede nada. Testar o dono do caixa (botão Conferir bloqueado, Contar liberado) e caixa sem movimento (sem Contar).
- Chips: com falta, clicar "Quebra de caixa" => motivo "Quebra de caixa (falta)" readOnly; com sobra => "(sobra)"; mudar as notas e trocar o sinal => texto acompanha; "Outro motivo…" libera o campo vazio; sem chip, botão confirmar bloqueado. Depois de confirmar, o card verde mostra "Motivo: Quebra de caixa (falta)" e a folha impressa (`RelatorioCaixaPrint`) mostra o mesmo texto.
- Caminho de erro: desligar o backend ou forçar 400 => toast do `error` e modal continua aberto, nada perdido. Duplo clique em Salvar não cria 2 contagens.
- iPad real ou emulado (768x1024 e 1024x768): 2 e 3 colunas. Console sem erros; `npm run build` OK.

**E3 Troca em massa**
- `grep -rn 'type="number"' frontend/src` => 0 (exceto se houver justificativa registrada); build OK.
- Cada tela da seção 8: abrir, digitar valor decimal e inteiro, salvar, reabrir e conferir que o valor gravado é o digitado (vírgula e ponto), rolar o mouse sobre o campo sem alterar, letra não entra. Telas críticas com cuidado extra: Novo Pedido (quantidade + Enter), Caixa (adiantamento, despesa, devolução), Estoque (Enter lança entrada), Financeiro (baixa/PIX), Vendedores/Permissões (limites), Tabela de Preços.
- Revisor confere o diff: só trocas de tag/import; nada em `value/onChange`, exceto casos aprovados do `REVISAR`; todo `decimal`/`permiteNegativo` decidido e justificado.

**E4 Docs**: `caixa.md` descreve Contar x Conferir x quebra de caixa; `novidade-contagem-dinheiro.html` abre (link `https://cahardt-github.xrqvlq.easypanel.host/novidade-contagem-dinheiro.html`) com mocks numerados; `novidades.json` válido (JSON) com a entrada no topo; entregar ao dono o texto pronto para o grupo do WhatsApp.

## 8. Telas afetadas pela troca de CampoNumero (linhas `type="number"` por arquivo; total 127)

Caixa (13 linhas)
- `pages/Caixa/ConferenciaDinheiroCard.jsx` (1: quantidade da cédula/moeda; + "outros" vira CampoNumero)
- `pages/Caixa/CaixaDiarioPage.jsx` (3: 758/767 quantidades, 875 adiantamento)
- `pages/Caixa/ConferenciaDevolucaoCard.jsx` (4: quantidades de devolução com `step="any"`)
- `pages/Caixa/NovaDespesaModal.jsx` (3: valor, km, litros)
- `pages/Admin/Configuracoes/ConferenciaCaixaConfigCard.jsx` (1: dias de atraso)
- `pages/Motorista/Entregas/CobrancasRotaAba.jsx` (1), `PixAsaasModal.jsx` (1), `CheckoutEntregaModal.jsx` (1): valores de cobrança do motorista (R$)

Pedidos (8)
- `pages/Pedidos/NovoPedido.jsx` (3: quantidade inteira l.~76, 1555, 2235), `ListaPedidos.jsx` (1: filtro nº embarque), `ModalAmostra.jsx` (2), `ModalDevolucao.jsx` (1: qtd devolvida), `PixAvulsoModal.jsx` (1: valor)

Estoque (7)
- `pages/Estoque/PosicaoEstoque.jsx` (4: estoque mínimo), `PainelEstoque.jsx` (2: mínimo + quantidade do lançamento com Enter), `InventarioEstoque.jsx` (1: contagem)

PCP (17)
- `ReceitaForm.jsx` (3), `EtiquetaForm.jsx` (4), `EstoquePcp.jsx` (1), `ItemPcpForm.jsx` (2), `PainelOperacional.jsx` (2), `SimuladorEscalonamento.jsx` (2), `OrdemProducaoForm.jsx` (1), `EtiquetasList.jsx` (1), `EtiquetaImprimir.jsx` (1)

Kit Festa (5): `KitFesta/AbaAgenda.jsx` (4), `KitFesta/PainelEtiquetas.jsx` (1)

Financeiro (14)
- `ReguaCobrancaPage.jsx` (7: dias, porta SMTP, limites), `ContasBancosPage.jsx` (1), `ContasPagarPage.jsx` (2), `NotasRecebidasPage.jsx` (1)
- `pages/Admin/Configuracoes/SecaoAsaas.jsx` (2), `VendaInadimplenteConfigCard.jsx` (1)

Configurações / Admin (22)
- `Configuracoes/TabelaPrecos.jsx` (5: parcelas, intervalo, acréscimo %), `Configuracoes/Metas/MetaFormModal.jsx` (7), `Configuracoes/Comissoes/ConfigModal.jsx` (1), `Configuracoes/CategoriasCliente.jsx` (1), `Configuracoes/CategoriasProduto.jsx` (1)
- `Admin/Produtos/GerenciarProduto.jsx` (10: preço promocional, quantidade/valor mínimo, custo manual...)
- `Admin/Vendedores/ListaVendedores.jsx` (4: flex %, desconto máx.), `PermissoesModal.jsx` (1: quebra de caixa)
- `Admin/Embarques/AuditoriaEntregas.jsx` (1), `MapaExpedicao.jsx` (1)

Clientes / Rota (7): `Clientes/DetalheCliente.jsx` (1: ciclo em dias), `Clientes/ListaClientes.jsx` (2), `Clientes/mapaClientes/PainelVizinhos.jsx` (1: raio em metros), `Rota/RotaLeads.jsx` (3: valor do pagamento etc.)

RH / Veículos / Diário (23): `RH/FuncionarioFicha.jsx` (4), `RH/ConfigPonto.jsx` (1), `Veiculos/VeiculoFicha.jsx` (13: km, litros, valor — km sempre inteiro; litros/valor decimal), `Veiculos/Veiculos.jsx` (1), `components/Diario/DiarioCheckout.jsx` (1), `DiarioGateway.jsx` (1), `FormVeiculoPresencial.jsx` (1)

(As contagens por arquivo são as do `grep` de 19/10/2026; o dev usa o `grep -rc` para fechar a lista exata e o revisor usa essa mesma lista como roteiro de tela por tela, agrupada por módulo: Caixa, Pedidos, Estoque, PCP, Kit Festa, Financeiro, Configurações/Admin, Clientes/Rota, RH/Veículos/Diário.)

## 9. O que NÃO fazer
- Não deixar `Contar` gravar em `caixa_diario` (nem `valorContado`, nem `dinheiroConferido`).
- Não amarrar Contar a `caixa_conferencia`/`exigida`/`ativa`.
- Não confiar em total/peças/texto de quebra vindos do cliente.
- Não remover `LinhaContagem` de fora do componente nem o comentário sobre foco/total.
- Não usar `<select>` nativo, `window.open`, `React.lazy`, botões retangulares, azuis legados em código novo.
- Não trocar o `value` do consumidor por número convertido no componente (o contrato é string com ponto).
- Não mexer em `conciliacaoBancaria`/`contabilidadeRoutes` (outro `motivoDiferenca`).
- Não remover campo do schema; não fazer backfill de `motivoTipo` por texto.
- Não commitar o codemod; não rodar o trabalho na cópia do Drive.
- Não declarar pronto sem build + QA clicando (modal em 3 tamanhos) + revisão + veredito do gerente-entrega.

Porte: GRANDE (E1b ~0,5 dia, E1+E2 ~1,5 dia, E3 ~1 dia incluindo revisão, E4 ~0,5 dia).
