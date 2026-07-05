# Categorias de Despesa

**Rota:** `/financeiro/categorias-despesa`
**Permissão:** `Pode_Acessar_Financeiro_Gerencial` (mesma da DRE e do Fluxo de Caixa)

## Para que serve

As despesas vêm com uma **categoria** do Conta Azul (Matéria Prima, Combustíveis, Salários, Antecipação de Lucros...). Mas o Conta Azul não diz se aquilo é uma **despesa de operação** ou não. Esta tela é onde o usuário coloca cada categoria num **"balde"**, e é isso que faz a **DRE** mostrar o lucro certo.

## Os três baldes

- **Operação** (verde) — custo/despesa do dia a dia. **Entra na DRE.** Ex.: Matéria Prima, Salários, Energia, Combustível, Fretes.
- **Financeiro** (azul) — juros e tarifas de banco. **Entra na DRE**, pensado como despesa financeira. Ex.: Tarifas Bancárias, Juros, Tarifas de Boletos.
- **Fora da DRE** (cinza) — **não é resultado**, só saiu do caixa. Ex.: Antecipação de Lucros (retirada dos sócios), Empréstimos, Aplicações em cotas, compra de veículos/móveis/computadores (bens).

> Por que isso importa: se uma retirada de lucro ou uma parcela de empréstimo for contada como "despesa", a DRE mente dizendo que a empresa teve prejuízo. Colocando no balde certo, o resultado fica real.

## Como usar

1. Cada categoria aparece com o **total já gasto** (para priorizar as maiores) e o balde atual.
2. As **sem balde definido** (ícone de atenção) aparecem no topo. Enquanto não forem classificadas, **contam na DRE como Operação**.
3. Clique no balde desejado em cada linha e depois em **Salvar** (topo). A DRE passa a usar a nova divisão na hora.

## De onde vêm as categorias

- São criadas sozinhas conforme as contas entram (lançamento manual, nota fiscal ou **Importar do Conta Azul**).
- Toda categoria nova nasce com um **palpite** de classificação; categorias desconhecidas nascem como "a classificar" (sinalizadas) para o usuário revisar.

## Relacionado

- **Importar do Conta Azul** (dentro de *Contas a Pagar*): traz o histórico de despesas do CA por CSV.
- **DRE — Resultado**: usa esta classificação; mostra à parte a linha *Fora da DRE* e avisa quando há categorias a classificar.
