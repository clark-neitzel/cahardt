---
aba: Config — Metas de Vendas
rota: /configuracoes/metas
permissao: admin ou Pode_Gerenciar_Metas
---

# Config — Metas de Vendas

## O que é

Cadastro e gestão das metas mensais de vendas por vendedor. Para cada vendedor e mês, é possível definir: meta financeira mensal, limite de Flex, dias de trabalho configurados, metas por produto e por cidade, e metas de promoções. Os dados desta tela alimentam diretamente o Dashboard.

---

## O que dá pra fazer aqui

- Ver todas as metas do mês selecionado
- Navegar entre meses
- Criar nova meta para um vendedor
- Editar uma meta existente (clicando no ícone de lápis)
- Excluir uma meta
- Ver resumo: meta financeira, flex, dias configurados, produtos e cidades com meta

---

## Como fazer (passo a passo real)

### Criar meta para um vendedor
1. Selecione o mês de referência no seletor de data
2. Clique em **+ Nova Meta**
3. Selecione o vendedor
4. Preencha:
   - Valor mensal (meta financeira)
   - Flex Mensal (limite de desconto flex)
   - Dias de trabalho (quais dias da semana o vendedor trabalha)
   - Metas por produto: produto + quantidade ou valor alvo
   - Metas por cidade: cidade + valor alvo + dias de visita
     - **A cidade é gravada com a grafia oficial.** Se você digitar `JOINVILLE`, `joinville`
       ou `Joinville ` (com espaço), o sistema salva `Joinville`. Cidades com acento também são
       corrigidas: `ITAPOA` vira `Itapoá`, `JARAGUA DO SUL` vira `Jaraguá do Sul`.
     - **Se a mesma cidade aparecer duas vezes na mesma meta** (por exemplo `Joinville` e
       `JOINVILLE`), as duas linhas são **juntadas numa só ao salvar**: os valores são
       **somados** e os dias de visita são **unidos**. Ex.: `Joinville R$ 107.132,05 (seg a sex)`
       + `JOINVILLE R$ 231,00` = uma linha `Joinville R$ 107.363,05 (seg a sex)`.
       Isso é de propósito: a meta de uma cidade é uma só, e ficar só com a maior apagaria meta
       de verdade e mudaria o bônus do vendedor.
     - Linha sem cidade preenchida é ignorada ao salvar (não dá para casar com pedido nenhum).
     - **"Preencher cidades" (na sugestão) não cria mais a cidade "Sem cidade".** Cliente cujo
       cadastro está sem cidade **continua contando** no valor sugerido, mas fica de fora da
       lista de cidades — antes ele virava uma linha de meta chamada "Sem cidade", que não é
       cidade nenhuma e nunca casaria com pedido. A sugestão agora avisa na tela:
       *"1 cliente sem cidade no cadastro (R$ 49,56). Não entra em Preencher cidades — complete
       o cadastro do cliente para incluir."* Se você quiser que ele entre, preencha a cidade na
       ficha do cliente e calcule a sugestão de novo.
     - Por isso a soma das metas por cidade pode ficar **menor** que o valor sugerido: a
       diferença é exatamente o valor desses clientes sem cidade.
   - Metas de promoção: nome da promoção + valor alvo
5. Salve

### Ver metas de outro mês
- Clique no seletor de mês e escolha o mês desejado

### Editar uma meta
1. Clique no ícone de lápis na linha da meta
2. Edite os campos no modal
3. Salve

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` ou `Pode_Gerenciar_Metas` | Pode criar, editar e excluir metas |
| Todos os usuários | Podem ver suas próprias metas no Dashboard |

---

## Depende de / Interfere em

- **Dashboard** — as metas definidas aqui são exibidas no dashboard do vendedor como barra de progresso
- **Vendedores** — o Flex Mensal configurado aqui é diferente do Flex Disponível no cadastro do vendedor (este é o limite mensal para descontos)
- **Comissão e Dashboard por cidade** — o realizado por cidade é casado pelo **nome exato** da
  cidade. Era daí que vinha um problema silencioso: meta escrita `Itapoá` e pedidos com
  `ITAPOA` não se encontravam, o realizado ficava zerado e o vendedor perdia bônus sem nenhum
  erro aparecer na tela. Com a grafia padronizada na gravação (08/2026) isso deixa de acontecer
  para o que for cadastrado daqui em diante.

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Configuracoes/Metas/GerenciarMetas.jsx` | Tela principal |
| `frontend/src/pages/Configuracoes/Metas/MetaFormModal.jsx` | Modal de criação/edição |
| `backend/src/routes/metas.js` | Rotas do backend |
