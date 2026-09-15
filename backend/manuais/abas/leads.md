---
aba: Leads
rota: /leads
permissao: todos (vendedor vê os próprios; admin vê todos)
---

# Leads

## O que é

Gestão completa dos leads (prospecções) do sistema. Um lead é um potencial cliente ainda não cadastrado como cliente ativo. A aba exibe todos os leads com suas etapas de funil, permite editar dados, tirar fotos da fachada, converter em cliente e acompanhar o progresso da prospecção.

> A criação de novos leads também pode ser feita diretamente na aba **Rota**, no botão "+ Lead".

---

## O que dá pra fazer aqui

- Listar todos os leads com filtros de busca, etapa do funil e vendedor (o filtro de vendedor mostra também os **inativos**, no fim da lista e marcados "(inativo)", para achar lead de quem já saiu; ao criar lead novo só aparecem os ativos)
- Ver cards resumidos com nome, endereço, telefone, etapa e data de cadastro
- Expandir um lead para ver detalhes completos: foto da fachada, atendimentos, histórico
- Adicionar ou trocar a foto de fachada (câmera ou galeria)
- Criar um novo lead
- Editar dados do lead (nome, endereço, telefone, dias de visita, observações)
- Referenciar o lead a um cliente existente (quando descobrir que o lead já é um cliente cadastrado)
- Mudar a etapa do funil do lead

---

> **Campo Cidade só aceita cidade do cadastro oficial (desde 09/2026):** ao tocar em **Cidade** abre a
> lista oficial de cidades (Configurações → Cidades), com a UF ao lado e busca no topo. A busca
> **ignora acento, cedilha e maiúscula/minúscula** — digitar `itapoa` acha `Itapoá`, `sao fran` acha
> `São Francisco do Sul`. Escolhendo da lista, a cidade entra com a **grafia oficial**. Se a cidade
> ainda não existe, aparece **"Cadastrar nova cidade…"**: abre um modal com o nome e a UF (padrão SC)
> e, se houver cidade parecida, pergunta **"Você quis dizer Itapoá?"** — *Usar esta* escolhe a
> existente, *Cadastrar mesmo assim* cria a nova. Quem pode cadastrar cidade: admin, Clientes → editar
> ou Rota → editar; quem não pode vê "Peça ao escritório para cadastrar" e só escolhe da lista.
> Não existe mais o botão **Usar "…"** com texto livre: cidade fora da lista é recusada ao salvar
> (aviso "A cidade 'X' não está no cadastro", com sugestões). Se a lista não carregar (sem rede), o
> campo mostra "tentar de novo" — não volta a texto livre.
> Essa mesma busca sem acento vale para **todos os menus com busca do app** (cliente, produto,
> vendedor, filtros de cidade, condição de pagamento).
>
> **Consulta de CNPJ:** a cidade que a Receita devolve é conferida com a lista antes de entrar no
> formulário. Conhecida → preenche direto (grafia oficial). Desconhecida → modal "A Receita informou
> X / UF. Cadastrar esta cidade ou escolher outra?" com sugestões; os outros campos entram normalmente
> e só a Cidade fica vazia e marcada até você decidir.
>
> **Grafia da cidade (desde 08/2026):** o nome da cidade é gravado sempre na forma oficial, não
> importa como for digitado. `JOINVILLE`, `joinville` e `Joinville ` (com espaço no fim) viram
> todos `Joinville`; `ITAPOA` vira `Itapoá`; `JARAGUA DO SUL` vira `Jaraguá do Sul`. Erros de
> digitação já conhecidos e aprovados pelo dono também são corrigidos (`Joiville`, `Joinvile`,
> `Joinvlle`, `Noinville`, `Joinvillevile` → `Joinville`), e `São Francisco` incompleto vira
> `São Francisco do Sul`. Você **não precisa** se preocupar com maiúscula/minúscula ou acento —
> digite como preferir. Isso vale também para a cidade que vem da consulta por CNPJ (a Receita
> devolve tudo em MAIÚSCULA) e para o que chega do Conta Azul. Cidade que chega do Conta Azul ou da
> IA de atendimento e **não está no cadastro** é gravada mesmo assim e vira uma **pendência** em
> Configurações → Cidades (o automático nunca trava) — ver [config-cidades.md](config-cidades.md).
> **Por que isso importa:** metas por cidade, comissão e dashboards casam a cidade pelo nome
> exato — antes, meta em `Itapoá` e cliente em `ITAPOA` simplesmente não se encontravam, e o
> vendedor perdia bônus sem nenhum erro aparecer.

## Etapas do funil

| Etapa | Cor | Significado |
|-------|-----|-------------|
| NOVO | Azul | Acabou de ser cadastrado |
| VISITA | Roxo | Já foi visitado |
| PEDIDO | Verde | Fez algum pedido |
| CONVERTIDO | Verde escuro | Virou cliente ativo |
| FINALIZADO | Cinza | Descartado ou encerrado |

---

## Como fazer (passo a passo real)

### Criar um lead novo
1. Clique no botão **+ Novo Lead**
2. Preencha: nome do estabelecimento, endereço, telefone, observações
3. Salve — o lead entra na etapa NOVO

### Ver detalhes de um lead
1. Clique na linha do lead na lista
2. O painel de detalhes expande abaixo do card
3. Você vê: foto, atendimentos registrados, dados completos e histórico

### Tirar foto da fachada
1. Expanda o lead
2. Clique em **Câmera** (abre câmera do celular) ou **Galeria** (escolhe da memória)
3. A foto é salva automaticamente

### Editar dados do lead
1. Clique no ícone de edição no card do lead
2. O modal de edição abre com todos os campos
3. Ajuste e salve

### Referenciar a um cliente existente
1. Clique no ícone de "referenciar" (ícone de pessoas)
2. O modal permite buscar e vincular o lead a um cliente já cadastrado
3. Útil quando você descobre que o lead já compra mas está cadastrado com outro nome

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| Qualquer usuário logado | Vê os próprios leads |
| `pedidos.clientes = "todos"` | Pode filtrar por vendedor e ver leads de toda a equipe |

---

## Depende de / Interfere em

- **Rota** — leads aparecem nos cards de rota misturados com os clientes
- **Atendimentos** — atendimentos registrados no card do lead via Rota aparecem aqui nos detalhes
- **Clientes** — ao converter, o lead vira um cliente ativo no cadastro

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Leads/ListaLeads.jsx` | Lista principal com filtros e expansão |
| `frontend/src/pages/Leads/ModalEditarLead.jsx` | Modal de edição do lead |
| `frontend/src/pages/Leads/ModalReferenciarCliente.jsx` | Modal de vinculação a cliente |
| `frontend/src/pages/Rota/ModalNovoLead.jsx` | Modal de criação (também usado na Rota) |
| `frontend/src/services/leadService.js` | Chamadas de API para leads |
