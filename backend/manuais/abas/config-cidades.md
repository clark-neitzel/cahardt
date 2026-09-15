---
aba: Config — Cidades
rota: /config/cidades
permissao: configuracoes (ver); admin ou configuracoes.edit (editar, inativar, fundir, resolver pendências)
---

# Config — Cidades (cadastro oficial de cidades)

## O que é

A lista oficial de cidades do sistema (desde 09/2026). Todo campo **Cidade** do app — cliente, lead (Rota e aba Leads), fornecedor, bairro do Kit Festa e meta por cidade — só aceita uma cidade desta lista. Acabou a cidade digitada de qualquer jeito: "Joinville", "JOINVILLE" e "Joinvile" não convivem mais como três cidades diferentes, porque só existe **uma** linha Joinville e todo cadastro aponta para ela.

Pedido do dono: *"não quero cidades repetidas, isso bagunça tudo. Se a Receita Federal trouxer alguma cidade nova, perguntar para cadastrar antes; se trouxer nome diferente, perguntar para cadastrar ou escolher outra."*

---

## O que dá pra fazer aqui

- Ver todas as cidades cadastradas (nome, UF, quantos registros usam cada uma — clientes, leads, metas, fornecedores, bairros, catálogos), com busca que ignora acento e maiúscula
- Ver quais cidades estão **sem UF** (a semente inicial não conseguiu decidir — nome que existe em mais de um estado, como "Campo Alegre") e completar a UF
- **Editar** nome ou UF de uma cidade. Renomear reescreve o nome em **todos os registros** que usam aquela cidade (a tela avisa quantos). Fica um arquivo de segurança (snapshot) no servidor para desfazer.
- **Inativar** uma cidade que não é mais usada. Cidade **em uso não pode ser inativada** — primeiro funda-a em outra.
- **Reativar** uma cidade inativa
- **Fundir** duas cidades (A → B): tudo que estava em A passa a ficar em B (clientes, leads, fornecedores, bairros, catálogos e metas). Antes de fundir de verdade, o botão **Simular** mostra quantas linhas mudam em cada tabela e se alguma meta por cidade vai ser somada (mesma meta mensal com linha em A e em B: os valores são **somados** e os dias de visita **unidos**, igual à regra da tela de Metas). Depois da fusão, A fica inativa e "aponta" para B — se alguém ainda mandar "A", o sistema grava "B" sozinho.
- **Pendências**: cidades que chegaram por caminho automático (sincronização do Conta Azul, IA de atendimento no WhatsApp) e **não existem na lista**. O registro foi gravado normalmente (o automático nunca trava), e a cidade ficou aqui para você decidir: **Cadastrar** (vira cidade nova) ou **Apontar para…** (era erro de grafia: escolhe a cidade certa e os registros são corrigidos).

---

## Como usar

### Cadastrar uma cidade nova (de qualquer tela)

1. No campo **Cidade** (cliente, lead, fornecedor, bairro, meta), digite o nome. Se não está na lista, aparece **"Cadastrar nova cidade…"**
2. Abre um modal com o nome já preenchido e a **UF** (padrão SC, ou a que a Receita informou)
3. Se existe cidade parecida, o modal pergunta **"Você quis dizer Itapoá?"** — **Usar esta** escolhe a existente (não cria nada); **Cadastrar mesmo assim** cria a nova
4. Ao salvar, a cidade entra na lista e já fica selecionada no campo

> Quem pode cadastrar cidade nova: **admin**, quem tem **Clientes → editar** ou **Rota → editar** (o vendedor que prospecta em cidade nova não trava). Quem não tem, vê o aviso "Peça ao escritório para cadastrar" e só escolhe da lista.

### Consulta de CNPJ (Receita Federal)

Ao buscar o CNPJ no cadastro de cliente, a cidade que a Receita devolve é conferida com a lista **antes** de entrar no formulário:

- cidade conhecida → preenche direto (com a grafia oficial, mesmo que a Receita mande em MAIÚSCULA)
- cidade desconhecida → abre o modal **"A Receita informou X / UF. Cadastrar esta cidade ou escolher outra?"**, com sugestões parecidas clicáveis. Os demais campos (endereço, IE, nome) entram normalmente; só o campo Cidade fica vazio e marcado até você decidir

### Fundir duas cidades (ex.: "Itapua" digitada errada → "Itapoá")

1. Configurações → **Cidades** → linha da cidade errada → **Fundir**
2. Escolha a cidade de destino (a certa)
3. **Simular**: confira as linhas por tabela e as fusões de meta
4. **Fundir** e confirme. O resultado mostra o nome do snapshot (arquivo de segurança)

### Resolver pendências

1. Aba **Pendências**: cada linha mostra como a cidade chegou (Conta Azul / IA), quantas vezes, e sugestões parecidas
2. **Cadastrar** → cria a cidade com o nome e a UF que você confirmar
3. **Apontar para…** → escolhe a cidade certa; os registros que estavam com a grafia da pendência são corrigidos

---

## Regras e permissões

| Ação | Quem pode |
|---|---|
| Ver a lista / usar o campo Cidade | qualquer usuário logado |
| Cadastrar cidade nova (modal do campo) | admin, ou Clientes → editar, ou Rota → editar |
| Editar, inativar, reativar, fundir, resolver pendências | admin, ou Configurações → **editar** (quem só vê Configurações não altera) |

- O nome é sempre gravado na forma oficial (primeira letra maiúscula, `do/da/de` minúsculo, acentos) — `itapoa` vira `Itapoá` quando a cidade já existe com acento
- Erros de digitação já conhecidos e aprovados (`Joinvile`, `Joiville`, `Noinville`… → Joinville; `São Francisco` → São Francisco do Sul) continuam sendo corrigidos sozinhos, sem precisar cadastrar
- **"Sem cidade" não é cidade** e não pode ser cadastrada — deixe o campo em branco
- Cidade em branco continua permitida onde já era (lead sem cidade, por exemplo)
- Dois municípios com o **mesmo nome em estados diferentes** não podem coexistir (a lista é pelo nome): se um dia acontecer, o segundo entra com nome desambiguado (decisão do dono na hora)
- Fusão e renomeação sempre gravam um snapshot em `backend/uploads/backfill-cidades/` (sobrevive ao deploy); a reversão é feita pelo escritório técnico (`POST /api/admin-exec/backfill-cidades/reverter`)

---

## Perguntas frequentes

**Digitei a cidade e o sistema disse "não está no cadastro". E agora?**
Use **"Cadastrar nova cidade…"** no próprio campo (ou peça ao escritório se você não tem permissão). Antes, confira as sugestões: na maioria das vezes a cidade já existe com outra grafia.

**O Conta Azul trouxe um cliente com cidade estranha. Deu erro?**
Não. O cliente entrou normalmente e a cidade ficou em **Pendências** nesta tela, para o escritório cadastrar ou apontar para a certa.

**Fundi errado. Dá para desfazer?**
Sim: cada fusão gera um snapshot; o escritório técnico reverte pelo arquivo (rota administrativa). Depois, reative a cidade de origem nesta tela.

**Por que não posso inativar uma cidade?**
Porque ainda há registros usando ela. Funda-a na cidade certa primeiro — a inativação acontece sozinha ao fundir.

**Por que isso importa?**
Metas por cidade, comissão, bônus por cidade e dashboards casam a cidade pelo nome exato. Cidade repetida com grafia diferente dividia o número em duas linhas e zerava bônus de vendedor sem erro nenhum aparecer.

---

## Arquivos relacionados

| Arquivo | Função |
|---|---|
| `frontend/src/pages/Configuracoes/Cidades.jsx` | Tela: lista, editar, inativar, fundir (com simulação), pendências |
| `frontend/src/components/CampoCidade.jsx` | Campo Cidade de todas as telas (só aceita da lista; "Cadastrar nova cidade…") |
| `frontend/src/components/ModalNovaCidade.jsx` | Modal de cadastro com "Você quis dizer…" |
| `frontend/src/components/ModalCidadeReceita.jsx` | Modal da consulta de CNPJ quando a Receita traz cidade desconhecida |
| `backend/routes/cidades.js` | API `/api/cidades` (listar, resolver, sugestões, criar, editar, inativar, reativar, fundir, pendências) |
| `backend/services/cidadeService.js` | Regras: resolver estrito/tolerante, sugestões, pendências, cache |
| `backend/services/backfillCidadesService.js` | Motor de fusão/renomeação com snapshot e reversão |
| `backend/utils/ufPorCidade.js` | UF sugerida (295 municípios de SC + os de outras UFs já vistos) |
