# Categorias de Despesa

**Rota:** `/financeiro/categorias-despesa`
**Permissão:** `Pode_Acessar_Financeiro_Gerencial` (mesma da DRE e do Fluxo de Caixa)

## Para que serve

As despesas vêm com uma **categoria** do Conta Azul (Matéria Prima, Combustíveis, Salários, Antecipação de Lucros...). Esta tela é onde o usuário faz as **duas escolhas** que montam a DRE:

1. **Bloco** — em qual grupo da DRE a categoria aparece (Custos variáveis, Pessoal, Administrativas...), ou **Fora da DRE** para o que não é resultado.
2. **Fixa ou Variável** — a natureza da despesa, que calcula a **Margem de Contribuição** na DRE.

## Blocos da DRE (o usuário cria e organiza)

Card **"Blocos da DRE"** no topo da tela:

- **Criar bloco**: campo de nome + botão "Criar bloco" (ex.: Marketing).
- **Renomear**: ícone de lápis na linha do bloco.
- **Reordenar**: setas ↑/↓ — a ordem daqui é a ordem em que os blocos aparecem na DRE.
- **Excluir**: ícone de lixeira; as categorias do bloco excluído ficam "sem bloco" para reclassificar (nada é perdido).

Na primeira vez, o sistema cria os blocos padrão: **Impostos sobre vendas, Custos variáveis, Pessoal, Veículos e entregas, Administrativas, Financeiras, Sócios** — podem ser renomeados, reordenados ou excluídos à vontade.

## Criar categoria nova (card "Nova categoria")

Card logo abaixo dos blocos. Serve para ter a categoria **antes** de ela aparecer numa despesa —
até 20/08/2026 só dava para classificar as que já tinham nascido de um lançamento.

- Digite o **nome**, escolha o **bloco** e **Fixa/Variável** (os dois opcionais — dá para definir depois na lista) e clique em **Criar categoria**.
- A categoria criada **já aparece no campo "Categoria"** ao lançar uma despesa em Contas a Pagar.
- Salva na hora (não depende do botão Salvar do topo).
- **Nome repetido é recusado**, mesmo escrito com outras maiúsculas ("Aluguel" x "aluguel") — evita duas categorias iguais dividindo o mesmo gasto na DRE.
- Escolhendo **Fora da DRE** na criação, a categoria nasce sem bloco e a marcação entra no **próximo Salvar** (a linha já aparece marcada na tela).

### Apagar categoria

Ícone de lixeira na linha, **só nas categorias sem nenhum gasto** (serve para desfazer um nome
digitado errado). Categoria que já tem lançamento **nunca é apagada** — nem pela tela nem pela API;
se ela não deve entrar no resultado, o caminho é marcar **Fora da DRE**.

## Bloco de cada categoria

Cada linha tem um menu suspenso (com busca) para escolher:

- Um dos **blocos** criados → a categoria entra na DRE dentro dele.
- **🚫 Fora da DRE (não é resultado)** — só saiu do caixa. Ex.: Antecipação de Lucros (retirada dos sócios), Empréstimos, Aplicações em cotas, compra de veículos/móveis/computadores (bens).
- **Sem bloco (a classificar)** — ainda conta na DRE, mas cai no grupo "Sem bloco" e fica sinalizada.

> Por que isso importa: se uma retirada de lucro ou uma parcela de empréstimo for contada como "despesa", a DRE mente dizendo que a empresa teve prejuízo. Colocando no lugar certo, o resultado fica real.

## Fixa ou Variável (natureza)

A pergunta-chave: **"se eu vender o dobro, esse gasto dobra?"**

- **Variável** (azul) — sim, cresce junto com a venda. Ex.: matéria-prima, embalagens, comissões, fretes, GLP.
- **Fixa** (verde) — não, é o custo de existir. Ex.: salários, contador, IPTU, telefone.
- Clicar de novo no chip ativo volta para "sem definição". Categorias Fora da DRE não pedem natureza.

É essa marcação que gera o quadro **Fixo × Variável (Margem de Contribuição)** na DRE.

## Como usar

1. Cada categoria aparece com o **total já gasto** (para priorizar as maiores). As **pendentes** (sem bloco ou sem fixa/variável — ícone de atenção) vêm no topo.
2. Escolha o bloco e marque Fixa/Variável em cada linha; depois **Salvar** (topo). A DRE usa a nova divisão na hora.
3. Mudanças nos **blocos** (criar/renomear/reordenar/excluir) salvam sozinhas, sem precisar do botão Salvar.
4. Criar e apagar **categorias** também salvam sozinhas.

## De onde vêm as categorias

- **Criadas à mão** no card "Nova categoria" desta tela (ver acima).
- São criadas sozinhas conforme as contas entram (lançamento manual, nota fiscal ou **Importar do Conta Azul**).
- Toda categoria nova nasce com um **palpite** de bloco + natureza (para as categorias conhecidas); as desconhecidas nascem "a classificar" (sinalizadas) para o usuário revisar. O palpite **nunca sobrescreve** o que o usuário já escolheu.

## Relacionado

- **Importar do Conta Azul** (dentro de *Contas a Pagar*): traz o histórico de despesas do CA por CSV.
- **DRE — Resultado**: usa blocos e natureza; mostra a matriz por blocos, o quadro Fixo × Variável e avisa quando há categorias a classificar.
