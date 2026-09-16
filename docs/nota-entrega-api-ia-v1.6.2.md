# Nota de entrega — API da IA v1.6.2 (busca e ficha do painel incluem fornecedores)

**Data:** 16/09/2026 · **Veredito do gerente de entrega: LIBERADO COM PENDÊNCIA**

## O que mudou (em termos de uso)

O painel do bot da Ana não achava a empresa "Karville" porque ela existe no sistema só como
**fornecedor**, e a busca do painel olhava apenas a lista de clientes. Agora:

- **Buscar empresa no painel** (`POST /cliente/buscar`) procura em clientes **e** fornecedores, por
  nome ou por CNPJ/CPF. Cada resultado diz se é `CLIENTE` ou `FORNECEDOR`. Clientes aparecem
  primeiro, fornecedores depois.
- **Ficha da empresa** (`POST /cliente/ficha`): se o documento não é de cliente, a ficha mostra o
  fornecedor (nome, documento, cidade, telefone, e-mail, IE, UF quando existirem). Se o mesmo
  documento está cadastrado como cliente **e** fornecedor, a ficha mostra o cliente e avisa
  `tambemFornecedor: true`.
- Só é adição: **nenhum campo que o bot já usava foi removido ou renomeado.** Isso vale apenas
  para o painel da equipe — a IA que conversa com o cliente não usa esses dois endpoints.

## O que foi testado e por quem

- **Dev:** curls locais (busca parcial, por documento, ficha de fornecedor puro, cliente+fornecedor
  com o mesmo documento, erro 400 com 2 letras, erro 401 sem chave).
- **Revisor:** aprovado; única sugestão (`horaCorte: null` na ficha de fornecedor, para o formato
  ficar igual ao da ficha de cliente) foi aplicada e conferida no diff.
- **Gerente de entrega (conferência própria, backend local com banco `hardt_local`):**
  - `node --check` nos dois arquivos alterados: OK.
  - Busca por nome de fornecedor → devolve item com `tipo: "FORNECEDOR"`.
  - Ficha de fornecedor puro → `tipo: "FORNECEDOR"`, `horaCorte: null`, objeto `fornecedor`.
  - Ficha de cliente → `tipo: "CLIENTE"` e todos os campos antigos intactos (`horaCorte` continua
    vindo, ex.: `"17:00"`).
  - Busca de cliente → mesmos campos de antes + `tipo: "CLIENTE"`.
  - Documento nos dois cadastros → ficha do cliente com `tambemFornecedor: true`; busca traz os dois
    itens.
  - 2 caracteres → 400; sem chave → 401; documento inexistente → `encontrado: false`.
  - Guia do bot (`docs/api-ia-v1.6.2-para-o-bot.md`): base de produção correta, nomes de campo
    iguais ao código, curls corretos, exemplos fictícios (nenhum número do banco local apresentado
    como real), **nenhuma chave ou segredo** no arquivo.
  - Manual/Clippy e página de novidade: não se aplicam (mudança só na API, sem tela no app).

## O que o dono precisa fazer

1. Mandar o arquivo `docs/api-ia-v1.6.2-para-o-bot.md` para o time do bot.
2. Mandar a chave da API **por fora** (WhatsApp/ligação), nunca dentro do documento nem do repositório.

## Pendência (só se prova depois do deploy)

- Após publicar o backend, o painel do bot precisa buscar "Karville" **em produção** e ver a
  empresa aparecer com o tipo `FORNECEDOR`. O teste daqui foi no banco local; a base de produção é
  outra. Como conferir em um minuto: pedir para o time do bot buscar "Karville" no painel — ou rodar
  o curl "busca de fornecedor" do guia contra a base de produção.

## Fora do escopo (observação, não bloqueia)

- Na ficha e na busca de cliente, o mesmo telefone pode aparecer duas vezes em `telefones` quando o
  cadastro tem o número repetido em dois campos (Telefone e Celular). Já era assim antes desta
  entrega; não foi alterado.
