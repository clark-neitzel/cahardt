# Comissões — Manual

**Rota:** `/config/comissoes`  
**Permissão:** `configuracoes`

---

## O que é

Tela para configurar e calcular as comissões dos vendedores a cada mês.

---

## Aba: Configuração

Mostra a tabela de comissão de cada vendedor que tem meta cadastrada no mês selecionado.

**Colunas:**
- **Mínimo**: percentual mínimo da meta que o vendedor precisa atingir para ter direito a qualquer comissão no mês. Abaixo desse mínimo, a comissão inteira (faixas e bônus) fica zerada. "—" significa sem mínimo (comissiona qualquer valor).
- **% Abaixo**: percentual aplicado sobre o total vendido quando o vendedor não atingiu a meta
- **% Na Meta**: percentual aplicado sobre o valor integral da meta quando bate ou supera
- **% Excedente**: percentual aplicado apenas sobre o valor que ultrapassou a meta
- **Bônus Cidades**: acréscimo sobre o total vendido se bater a meta em TODAS as cidades
- **Bônus/Produto**: acréscimo por cada produto que atingiu a meta de quantidade
- **Bônus Flex**: acréscimo se o uso de flex ficou abaixo do limite configurado
- **Limite Flex**: percentual máximo de uso do flex para ganhar o bônus flex

Clique no lápis para editar as configurações de um vendedor. As configurações são salvas por vendedor + mês.

**Herança do mês anterior:** ao abrir um mês novo, a configuração do último mês configurado já vale automaticamente — aparece com o selo azul **"herdada de mês/ano"**. Não é preciso reconfigurar todo mês; só editar quando algo mudar (ao salvar, a configuração passa a ser própria do mês selecionado e o selo some).

---

## Aba: Apuração

Calcula automaticamente a comissão de todos os vendedores com meta no mês selecionado.

**Colunas da tabela resumo:**
- Meta, Realizado, % da Meta
- Comissão Base, Bônus Total, Total

Clique no ícone de gráfico para ver o **detalhamento** de um vendedor:
- Indica se cada bônus foi conquistado (✓) ou não (✗)
- Mostra quantas cidades e produtos bateram a meta
- Mostra o uso de flex vs. o limite configurado
- Exibe o total de cada componente da comissão

---

Na apuração, quem ficou abaixo do **mínimo da meta** aparece com o selo vermelho "% · sem comissão" e total R$ 0,00; o detalhamento mostra um aviso explicando.

**Projeção por dia da semana:** a projeção do fim do mês usa os dias de trabalho selecionados na meta. Cada dia de venda que ainda falta é estimado pela média das últimas ocorrências daquele mesmo dia da semana (últimas segundas para projetar segundas, últimas terças para terças…), olhando os dias trabalhados do mês atual e dos 2 meses anteriores com meta. Dia da semana sem histórico suficiente usa a média diária simples. O vendedor vê a própria comissão e essa projeção no dashboard dele (card "Minha comissão" + popup às 08:00/18:00).

---

## Fórmula de cálculo

**Mínimo para comissionar (se configurado):** se o realizado ficar abaixo de X% da meta, a comissão inteira do mês é zerada (faixas e todos os bônus). Só passando do mínimo as regras abaixo se aplicam.

**Se realizado < meta:**
> Comissão = realizado × % abaixo

**Se realizado ≥ meta:**
> Comissão = (valor da meta × % na meta) + (excedente × % excedente)

**Bônus** (somados ao resultado acima):
- Cidades: total vendido × % bônus cidades (somente se todas cidades bateram)
- Produtos: total vendido × (% por produto × qtd produtos batidos)
- Flex: total vendido × % bônus flex (somente se uso ≤ limite configurado)

---

## Observações

- Pedidos cancelados e devolvidos são excluídos do cálculo
- Bonificações não contam para o realizado
- A configuração de comissão é independente da meta — é possível apurar sem configuração, mas o resultado não será calculado
- Precisa primeiro cadastrar as metas em **Config → Metas de Vendas**
