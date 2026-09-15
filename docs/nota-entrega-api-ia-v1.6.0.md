# Nota de entrega — API da IA v1.6.0: dados para a Ana tirar o pedido semanal

**Data:** 15/09/2026 · **Veredito do gerente de entrega:** LIBERADO COM PENDÊNCIA (as pendências só se provam em produção — lista no fim).

---

## O que mudou, em uma frase

A Ana (o bot de WhatsApp) agora enxerga o cliente como a vendedora enxerga: o que ele compra, se já tem pedido na semana, promoção vigente, o que está em falta, hora de corte, se o pedido chegou — e quando ela fecha um pedido, ele cai na **mesma fila de aprovação de sempre** (Pedidos Online → Site), marcado com o selo **WhatsApp IA**, com o combinado interno visível só para a equipe.

**Nada do que o bot já usava mudou de nome, de tipo ou sumiu.** Tudo foi somado.

---

## O que mudou, item por item do pedido do bot

| # | O que o bot pediu | O que foi feito (nome na API) |
|---|---|---|
| 1 | Histórico com itens e pedidos em aberto; reconhecimento devolve o último pedido | `POST /cliente/historico-pedidos` agora traz cada pedido completo (`fonte`, `dataPrevista`, `entregueEm`, `entregador`, `status`, `emAberto`, `origem`, `nfeNumero`, itens com `produto`) e os pedidos **ainda na fila de aprovação entram no topo** (`fonte: "FILA"`). Os dois reconhecimentos (`/cliente/reconhecer-telefone` e `/congelados/reconhecer-telefone`) ganharam `ultimoPedidoDetalhe`, `pedidosEmAberto`, `proximasEntregas`, `horaCorte`, `ultimaCompraEm`, `diasSemComprar`, `vendedorInfo` (e `endereco` no geral). |
| 2 | Produtos que o cliente já comprou (agregado) | Novo `POST /cliente/produtos-comprados` — quantas vezes, quantidade média, última compra, último preço, se ainda está no site (janela de 12 meses, máx. 24). |
| 3 | Promoções vigentes | Novo `GET /congelados/promocoes` — preço promo, preço normal, condição em texto ("a partir de 3 un de…"), validade. Tipos: `PRECO` e `CONDICIONAL`. |
| 4 | Criar pedido com preço promocional por item e origem | `POST /congelados/pedido` aceita `itens[].promocaoId`, `observacaoInterna` e `origem`. **O preço nunca vem do bot**: o servidor confere a promoção (vigente, do produto certo, condição atendida) e recalcula. Erros vêm com código (`PROMOCAO_INVALIDA`, `PROMOCAO_NAO_LIBERADA`, `VISITANTE_SEM_CPF`). |
| 5 | Situação financeira — só para o painel da equipe | Novo `POST /cliente/situacao` — inadimplente sim/não, quantos títulos, valor vencido, dias de atraso. **Não é ferramenta da Ana** (ela não fala de cobrança); é para o painel avisar a equipe. |
| 6 | Disponibilidade / falta | Novo `GET /congelados/indisponiveis` + campo `disponivel` em todo produto. |
| 7 | Hora de corte e entrega realizada | `horaCorte` (vem de uma configuração do banco — ver "o que você precisa fazer"); `entregueEm` e `entregador` em todo pedido. |
| 8 | Um formato único de produto | Todo produto, em qualquer endpoint, sai no mesmo formato (`nomeCurto`, `nomeCompleto`, `embalagemInfo`, `tamanho`, `pesoUnidadeG`, `preparoTipo`, `precoTabela`, `precoCliente`, `disponivel`, `promocao`, …), somado aos campos antigos. |

### O que a equipe vê no app (Pedidos Online → Site)
- Selo roxo **WhatsApp IA** na linha do pedido e no detalhe, quando veio pela Ana.
- No detalhe, um bloco amarelo **"INTERNO · só a equipe vê"** com o que a Ana combinou com o cliente. Esse texto **não vai para o pedido gerado, nem para a nota fiscal, nem para o recibo** — na aprovação só a observação do próprio cliente segue, como sempre.
- Chip verde **"Promo: <nome>"** no item que veio com promoção aplicada.
- Manual do Clippy da aba atualizado; página de novidade `novidade-pedidos-ana.html` registrada (o Clippy vai balançar).

---

## O que foi testado e por quem

- **Dev-backend:** 15 chamadas (A–O) no servidor local com dados semeados; depois uma otimização pedida pelo revisor (menos consultas ao banco por mensagem do bot: 44 → 35) com resultado idêntico antes/depois.
- **QA (clicando na tela):** selo WhatsApp IA na lista e no detalhe, bloco Interno, chip de promoção, aprovação sem vazar o texto interno para o pedido, histórico sem duplicar, tela de celular (375 px). Capturas guardadas.
- **Revisor de código:** aprovado com ressalvas; a única correção obrigatória (consultas repetidas) foi feita e reconferida.
- **Gerente de entrega (esta nota):** li o diff inteiro; `node --check` em todos os arquivos; build do frontend OK (5,5 s); comparei o contrato antigo com o novo — **nenhum campo antigo sumiu** (provado por chamada real: reconhecimento, histórico e catálogo devolvem os campos de antes mais os novos); provei que o **site público não recebeu os campos novos**; rodei 7 chamadas por amostragem no backend local (config com `horaCorte`, reconhecimento, histórico com fila no topo, promoções, erro de promoção não liberada com código, catálogo público × catálogo da IA); conferi que o SQL da hora de corte usa a tabela e as colunas que existem de verdade (`app_configs(key, value)`); nenhum segredo no repositório.

---

## O que você precisa fazer (cada item leva 1 minuto)

1. **Gravar a hora de corte em produção** (sem isso a Ana recebe `horaCorte: null` e não avisa o cliente do limite). No banco de produção (TablePlus/psql), rodar — trocando `17:00` pela hora certa:
   ```sql
   INSERT INTO app_configs(key, value) VALUES ('ia_consulta_config', '{"horaCorte":"17:00"}')
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
   ```
   Para conferir: abrir `https://cahardt-github.xrqvlq.easypanel.host/api/ia-consulta/v1/congelados/config` com a chave da API e ver `"horaCorte":"17:00"`.
2. **Depois do deploy, conferir o número do pedido** gerado na aprovação de um pedido da Ana do tipo NORMAL (ele depende do Conta Azul, que não funciona no computador de teste — no local veio `numero: null`). Aprovar um pedido da fila e ver se ele aparece com número na aba Pedidos.
3. **Mandar a seção "Para o time do bot" (abaixo) para quem cuida da Ana**, para eles ajustarem o bot e testarem contra a produção.
4. **Anunciar no grupo do WhatsApp** (link e texto prontos na entrega do gerente de projeto).

---

## O que ficou pendente ou de fora (combinado, não é defeito)

- `previsaoRetorno` de produto em falta: **sempre `null`** — o cadastro não tem essa informação.
- `tamanho` e `preparoTipo`: derivados do nome do produto e do rótulo de preparo da categoria; quando não dá para derivar com segurança, vêm `null`.
- Promoção tipo `LEVE_MAIS` (leve 10 pague 9): **não existe** neste sistema; só `PRECO` e `CONDICIONAL`.
- Promoção aplicada pela Ana **não é copiada para o pedido gerado** na aprovação: o preço promocional segue (é o que importa), mas o item do pedido final não fica marcado com o nome da promoção. Fica para uma próxima rodada se a equipe sentir falta.
- Tela para a hora de corte: por enquanto só por SQL (você pediu assim).
- Não testado no iPad real nem em produção (só local) — é o que os itens 1 e 2 acima cobrem.

---

## Para o time do bot (v1.6.0)

Base: `https://cahardt-github.xrqvlq.easypanel.host/api/ia-consulta/v1` · header `x-ia-api-key: <chave>` · toda resposta vem em `{ meta: { versao, avisos }, dados }`. Documentação completa: `backend/docs/ia-consulta-api.md` (seção v1.6.0).

**Nada foi removido ou renomeado.** Atenção ao único aviso em `meta.avisos`: o histórico agora inclui, no topo e fora do `limite`, os pedidos ainda na fila (`fonte: "FILA"`); quem lia `pedidos[0]` como "último pedido real" precisa olhar `fonte`. E `dataEntrega` sempre foi a hora REAL da entrega (null até entregar) — a data prevista está em `dataPrevista`.

```bash
B=https://cahardt-github.xrqvlq.easypanel.host/api/ia-consulta/v1
H='x-ia-api-key: <chave>'

# versão + hora de corte
curl -s $B/congelados/config -H "$H"

# reconhecimento geral (último pedido, em aberto, próximas entregas, hora de corte)
curl -s -X POST $B/cliente/reconhecer-telefone -H "$H" -H 'Content-Type: application/json' \
  -d '{"telefone":"5547999999999"}'

# reconhecimento congelados (catálogo com preço do cliente + objeto único de produto)
curl -s -X POST $B/congelados/reconhecer-telefone -H "$H" -H 'Content-Type: application/json' \
  -d '{"telefone":"5547999999999"}'

# histórico com itens (fila no topo)
curl -s -X POST $B/cliente/historico-pedidos -H "$H" -H 'Content-Type: application/json' \
  -d '{"telefone":"5547999999999","limite":10,"comItens":true}'

# o que o cliente costuma comprar (12 meses)
curl -s -X POST $B/cliente/produtos-comprados -H "$H" -H 'Content-Type: application/json' \
  -d '{"telefone":"5547999999999","meses":12}'

# promoções vigentes / produtos em falta
curl -s $B/congelados/promocoes -H "$H"
curl -s $B/congelados/indisponiveis -H "$H"

# "meu pedido chegou?" (telefone obrigatório; fonte=FILA para número da fila)
curl -s "$B/cliente/pedido/883?telefone=5547999999999" -H "$H"

# criar pedido com promoção por item + observação interna (preço é recalculado no servidor)
curl -s -X POST $B/congelados/pedido -H "$H" -H 'Content-Type: application/json' \
  -d '{"telefone":"5547999999999","origem":"WHATSAPP_IA","idempotencyKey":"ana-<conversa>-<n>",
       "itens":[{"id":"<congeladosProdutoId>","quantidade":3,"promocaoId":"<promocaoId>"}],
       "observacoes":"sem cebola","observacaoInterna":"aceitou a promo do bolinho, 3 pct"}'

# SÓ PAINEL da equipe (nunca tool da IA): situação financeira
curl -s -X POST $B/cliente/situacao -H "$H" -H 'Content-Type: application/json' \
  -d '{"telefone":"5547999999999"}'
```

Observações para o bot:
- Em `GET /congelados/promocoes`, `nome` é o nome do **produto** (igual ao exemplo do pedido de vocês); o nome da promoção em si está em `produto.promocao.nome`.
- `precoUnit` no corpo de `POST /congelados/pedido` é ignorado — só `promocaoId` conta, e o servidor valida.
- Erros de negócio vêm `{ error, code }` com HTTP 400; `code` ∈ `PROMOCAO_INVALIDA`, `PROMOCAO_NAO_LIBERADA`, `VISITANTE_SEM_CPF`.
- Máximo de 500 caracteres em `observacaoInterna`.
