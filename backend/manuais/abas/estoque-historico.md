---
aba: Estoque — Histórico
rota: /estoque/historico
permissao: admin ou acesso ao módulo de estoque
---

# Estoque — Histórico

## O que é

Registro completo de todas as movimentações de estoque (entradas e saídas), com seus motivos, responsáveis e quantidades antes/depois. Permite auditoria completa do que aconteceu com o estoque de qualquer produto.

---

## O que dá pra fazer aqui

- Ver todas as movimentações de estoque em ordem cronológica
- Ver os **totais do filtro** no cabeçalho: nº de movimentações, quantas caixas entraram (+), quantas saíram (−) e o saldo do período — somados no servidor, contando todas as páginas (não só o que está carregado na tela)
- Nos títulos das colunas Entradas/Saídas: nº de lançamentos e total de caixas de cada lado
- Filtrar por **produto escolhendo da lista** (menu com busca — não é mais texto digitado solto)
- Filtrar por: tipo (entrada/saída), motivo e **período no padrão do sistema** (pílula com presets: Hoje · 7 dias · 30 dias · Este mês · Este ano · Todo o período · Personalizado, com setas ‹ › para pular de período; a escolha fica salva por usuário; padrão: todo o período)
- Ver para cada movimentação: produto, tipo, quantidade, responsável, motivo, data, estoque antes/depois e status de sync com CA
- Carregar mais registros (paginação infinita — 60 por vez)

---

## Motivos de movimentação

| Motivo | Quando ocorre |
|--------|---------------|
| AJUSTE_MANUAL | Ajuste feito manualmente na tela de Estoque |
| PEDIDO_ESPECIAL | Baixa automática ao aprovar pedido especial (desde jul/2026) |
| PEDIDO_BONIFICACAO | Baixa automática ao aprovar bonificação (desde jul/2026) |
| FATURAMENTO | Baixa automática ao faturar pedido no CA |
| PRODUCAO | Entrada de produto acabado vinda da produção (PCP) |
| COMPRA | Entrada por nota recebida conferida — observação "Entrada NF-e {número} — {fornecedor}". Desde 07/2026 TODA nota conferida em Notas Recebidas soma no estoque: tanto "Gerar conta a pagar" (com atualização de custo) quanto "Registrar entrada sem pagamento" (bonificação/amostra — só quantidade, custo intocado) |
| ESTORNO_COMPRA | Saída quando uma entrada de compra é desfeita. Quatro origens, cada uma com a SUA observação: **(1)** cancelar conferência / desfazer registro de entrada da nota → `Estorno entrada NF-e ...`; **(2)** corrigir a conversão de um item da nota → `Correção — retirada do lançamento errado NF-e ...`; **(3)** **cancelar a despesa** (Contas a Pagar → Cancelar) → `Estorno da compra (nota 777771 · MUSSARELA CAIXA 10KG) — entrada cancelada`, trazendo o número da nota e/ou a descrição do item entre parênteses quando existirem (só o item: `Estorno da compra (PALMITO PUPUNHA) — entrada cancelada`; sem nota e sem descrição sai sem parênteses: `Estorno da compra — entrada cancelada`) — 08/2026: antes saía sempre sem o detalhe, com espaço duplo, sem dizer de qual item era; **(4)** **trocar os produtos de uma despesa já lançada** (Contas a Pagar → Editar → "Produtos desta despesa") → `Correção da despesa "Compra de mercadoria — Frigorífico São Jorge" — retirada do lançamento anterior`, onde entre aspas vai a descrição da despesa (ou o número da nota, quando ela não tem descrição). Nessa origem (4) cada produto sai por esta saída de estorno e volta logo em seguida como entrada COMPRA nova, com a observação `Correção da despesa "..." — {fornecedor}` — é assim que se reconhece uma correção no histórico: o par saída + entrada com o mesmo texto "Correção da despesa" |
| DEVOLUCAO | Entrada por devolução de cliente |
| REVERSAO_DEVOLUCAO | Estorno de devolução |
| CANCELAMENTO | Estorno quando a aprovação de especial/bonificação é revertida |
| CANCELAMENTO_CA | Estorno quando o pedido faturado é cancelado/excluído no Conta Azul |
| EXCLUSAO | Estoque liberado por exclusão de pedido |

**Trava contra duplicidade (jul/2026):** a baixa por pedido é idempotente — se duas rotinas tentarem faturar o mesmo pedido, a segunda não desconta de novo. Antes disso alguns pedidos baixavam em dobro; os casos antigos foram corrigidos com movimentações marcadas "Correção de baixa em dobro" / "Baixa retroativa".

---

## Como fazer (passo a passo real)

### Ver movimentações de um produto
1. Clique no seletor **"Todos os produtos"** no topo da tela
2. Digite parte do nome para filtrar a lista e **escolha o produto**
3. A lista e os totais passam a mostrar só aquele produto (para voltar, escolha "Todos os produtos")

### Filtrar por período
1. Clique em **Filtros**
2. No campo **Período**, escolha um preset (Hoje, Últimos 7 dias, Este mês…) ou "Período personalizado" com De/Até
3. Use as setas **‹ ›** da pílula para pular para o período anterior/seguinte
4. O período aplica na hora (tipo e motivo aplicam no botão **Aplicar**)

### Conferir quantas caixas se movimentaram
- O cabeçalho mostra os totais do filtro atual: `+N entraram · −N saíram · saldo ±N`
- Os chips das colunas mostram `X lançamentos · ±N caixas` de cada lado

### Carregar mais registros
- Clique em **Carregar mais** no rodapé da lista
- Os próximos 60 registros são adicionados

---

## Informações de cada movimentação

| Campo | Significado |
|-------|-------------|
| Produto | Nome do produto |
| Tipo | ENTRADA (verde +) ou SAÍDA (vermelho -) |
| Quantidade | Quantidade movimentada |
| Motivo | Por que aconteceu (ver tabela acima) |
| Responsável | Usuário que fez a movimentação |
| Data | Data e hora do registro |
| Antes → Depois | Estoque antes e depois da movimentação |
| CA | Verde = sincronizado com CA; Âmbar = pendente |

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Acesso total ao histórico |

---

## Depende de / Interfere em

- **Estoque — Ajuste** — todas as movimentações manuais aparecem aqui
- **Pedidos / Conta Azul** — movimentações automáticas por faturamento também são registradas

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Estoque/HistoricoEstoque.jsx` | Tela de histórico |
| `frontend/src/services/estoqueService.js` | Chamadas de API |
| `backend/src/routes/estoque.js` | Rota de histórico |
