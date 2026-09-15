---
aba: Fornecedores
rota: /fornecedores
permissao: Pode_Acessar_Fornecedores
---

# Fornecedores

## O que é

Cadastro de fornecedores da empresa, usado pelo módulo de Contas a Pagar. Desde 07/2026 os fornecedores ficam **só no app** (não são mais enviados ao Conta Azul). O botão de importar do Conta Azul foi removido em 09/2026 (plano de remoção do CA) — fornecedor novo é cadastrado direto aqui.

---

## O que dá pra fazer aqui

- Ver e buscar fornecedores (por nome, nome fantasia ou CNPJ/CPF). A busca por CNPJ/CPF funciona com ou sem pontuação (tanto faz digitar `08.766.459/0001-02` ou `08766459000102`).
- **A busca da tela de Clientes também encontra fornecedores**: se alguém procurar um cadastro na aba Clientes e ele existir só como fornecedor (ex.: importado do Conta Azul), aparece um bloco "Encontrado nos Fornecedores" embaixo da lista, com atalho que abre esta aba já filtrada. Só aparece para quem tem a permissão `Pode_Acessar_Fornecedores`.
- Cadastrar fornecedor: CNPJ/CPF, razão social, nome fantasia, inscrição estadual, e-mail, telefone, cidade/UF e observações. O campo CNPJ/CPF **já aplica a máscara enquanto você digita** e **confere o dígito verificador** — se o número estiver errado, o app avisa e não salva. Aceita o **CNPJ alfanumérico novo** (com letras, ex.: `12.ABC.345/01DE-35`) que a Receita passa a emitir a partir de 07/2026.

> **Grafia da cidade (desde 08/2026):** o nome da cidade é gravado sempre na forma oficial, não
> importa como for digitado. `JOINVILLE`, `joinville` e `Joinville ` (com espaço no fim) viram
> todos `Joinville`; `ITAPOA` vira `Itapoá`; `JARAGUA DO SUL` vira `Jaraguá do Sul`. Erros de
> digitação já conhecidos e aprovados pelo dono também são corrigidos (`Joiville`, `Joinvile`,
> `Joinvlle`, `Noinville`, `Joinvillevile` → `Joinville`), e `São Francisco` incompleto vira
> `São Francisco do Sul`. Você **não precisa** se preocupar com maiúscula/minúscula ou acento —
> digite como preferir. Isso vale também para a cidade que vem da consulta por CNPJ (a Receita
> devolve tudo em MAIÚSCULA) e para o que chega do Conta Azul.
> **Por que isso importa:** metas por cidade, comissão e dashboards casam a cidade pelo nome
> exato — antes, meta em `Itapoá` e cliente em `ITAPOA` simplesmente não se encontravam, e o
> vendedor perdia bônus sem nenhum erro aparecer.
>
> **Também vale ao criar o cadastro de pessoa do fornecedor** (usado em Usuários, no
> "Vincular cadastro"/"Novo Usuário"): a cidade do fornecedor é copiada **já na grafia
> oficial**, mesmo que o fornecedor seja antigo e esteja com o nome torto. A **UF** só é
> copiada quando já está como sigla de 2 letras (`SC`, `PR`); fornecedor antigo com o estado
> por extenso (`SANTA CATARINA`, como o Conta Azul às vezes manda) entra **sem UF** — basta
> completar na ficha do cliente. É de propósito: cortar `SANTA CATARINA` em duas letras daria
> `SA`, um estado que não existe, e isso quebraria em silêncio a conferência da inscrição
> estadual.
- Editar um fornecedor
- Ativar/inativar fornecedor
- **Excluir um fornecedor** (botão "Excluir" dentro do "Abrir"/editar): se ele **não tiver** despesas nem notas ligadas, é excluído direto. Se **tiver**, o app oferece **mesclar** — move as despesas e notas para outro fornecedor **de mesmo CNPJ** (útil para juntar cadastros duplicados) e então exclui o duplicado. A exclusão é só no app; o cadastro no Conta Azul não é apagado.

---

## Relação com o Conta Azul

- **Envio desligado (07/2026):** fornecedor criado no app fica **só no app** — não é mais enviado ao Conta Azul.
- **Importação desligada (09/2026):** o botão "Importar do Conta Azul" foi removido — não busca mais nada de lá. Fornecedores que já tinham sido importados antes continuam no cadastro normalmente (com `contaAzulId` preenchido, campo legado).
- Fornecedores que estavam "presos" tentando ser enviados ao CA foram convertidos automaticamente para **"só no app"**.

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `Pode_Acessar_Fornecedores` | Ver a lista de fornecedores |
| `Pode_Editar_Fornecedores` | Criar e editar |
| `admin` | Tudo acima |

---

## Depende de / Interfere em

- **Contas a Pagar** — o fornecedor identifica a quem se paga cada despesa
- **Conta Azul** — legado: fornecedores importados até 09/2026 guardam `contaAzulId`; não há mais leitura nem escrita ativa nessa API

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `backend/routes/fornecedores.js` | Rotas da API (listar, criar, editar) |
| `backend/services/contasPagarCaSyncService.js` | Robô do CA: envio de fornecedor **desligado** por `CA_SOMENTE_LEITURA` (drena fila p/ "só no app") |
| `frontend/src/pages/Financeiro/Fornecedores*` | Telas do módulo |
