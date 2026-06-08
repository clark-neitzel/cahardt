---
aba: PCP — Painel Operacional
rota: /pcp/painel
permissao: admin ou acesso ao módulo PCP
---

# PCP — Painel Operacional

## O que é

Tela de execução das ordens de produção. É aqui que o operador da fábrica trabalha no dia a dia: vê as ordens pendentes, inicia a produção, registra o consumo real de materiais e finaliza (apontando a quantidade efetivamente produzida). As ordens são exibidas agrupadas por status.

---

## O que dá pra fazer aqui

- Ver ordens separadas em três grupos: Em Produção, Planejadas, Finalizadas (últimas 10)
- Expandir uma ordem para ver os ingredientes (consumos previstos)
- Editar as quantidades reais de consumo antes de finalizar
- Iniciar uma ordem (muda de PLANEJADA para EM_PRODUCAO)
- Salvar os consumos apontados
- Finalizar uma ordem (informa a quantidade produzida, baixa os estoques)
- Cancelar uma ordem (se tiver permissão)

---

## Como fazer (passo a passo real)

### Iniciar uma ordem
1. Localize a ordem na seção **Planejadas**
2. Clique em **Iniciar** (ícone de play)
3. A ordem muda para **Em Produção** e sobe para a seção de cima

### Registrar consumo real
1. Expanda a ordem clicando nela (ícone de expand)
2. A lista de ingredientes aparece com a quantidade prevista pré-preenchida
3. Ajuste os campos de quantidade real conforme o consumo efetivo
4. Clique em **Salvar Consumos**

### Finalizar uma ordem
1. Com a ordem expandida, clique em **Finalizar**
2. Um modal aparece pedindo a quantidade produzida
3. Informe o valor real (pode ser diferente do planejado)
4. Confirme — os estoques são baixados (materiais) e adicionados (produto)

### Cancelar
- Clique no ícone X na ordem (apenas quem tem `pcp.cancelarOrdens`)

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` ou acesso ao módulo PCP | Opera o painel |
| `pcp.cancelarOrdens` | Pode cancelar ordens |

---

## Depende de / Interfere em

- **PCP — Ordens** — as ordens são criadas lá e executadas aqui
- **PCP — Estoque** — ao finalizar, o consumo baixa os estoques de MP/SUB/EMB e adiciona ao PA
- **PCP — Calendário** — as ordens podem ser agendadas no calendário

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/PCP/PainelOperacional.jsx` | Tela principal do painel |
| `frontend/src/services/pcpOrdemService.js` | Chamadas de API (iniciar, consumo, finalizar) |
| `backend/src/routes/pcp/ordens.js` | Rotas do backend |
