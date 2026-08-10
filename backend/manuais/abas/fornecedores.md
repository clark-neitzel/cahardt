---
aba: Fornecedores
rota: /fornecedores
permissao: Pode_Acessar_Fornecedores
---

# Fornecedores

## O que é

Cadastro de fornecedores da empresa, usado pelo módulo de Contas a Pagar. Desde 07/2026 os fornecedores ficam **só no app** (não são mais enviados ao Conta Azul). Quem já existe no CA ainda pode ser **importado** de uma vez com um botão, para não redigitar.

---

## O que dá pra fazer aqui

- Ver e buscar fornecedores (por nome, nome fantasia ou CNPJ/CPF). A busca por CNPJ/CPF funciona com ou sem pontuação (tanto faz digitar `08.766.459/0001-02` ou `08766459000102`).
- **A busca da tela de Clientes também encontra fornecedores**: se alguém procurar um cadastro na aba Clientes e ele existir só como fornecedor (ex.: importado do Conta Azul), aparece um bloco "Encontrado nos Fornecedores" embaixo da lista, com atalho que abre esta aba já filtrada. Só aparece para quem tem a permissão `Pode_Acessar_Fornecedores`.
- Cadastrar fornecedor: CNPJ/CPF, razão social, nome fantasia, inscrição estadual, e-mail, telefone, cidade/UF e observações. O campo CNPJ/CPF **já aplica a máscara enquanto você digita** e **confere o dígito verificador** — se o número estiver errado, o app avisa e não salva. Aceita o **CNPJ alfanumérico novo** (com letras, ex.: `12.ABC.345/01DE-35`) que a Receita passa a emitir a partir de 07/2026.
- Editar um fornecedor
- **Importar do Conta Azul**: busca todos os cadastros com perfil "Fornecedor" no CA e cria/atualiza aqui (casa por vínculo com o CA ou, se não houver, pelo CNPJ/CPF). Mostra quantos foram importados e quantos atualizados
- Ativar/inativar fornecedor
- **Excluir um fornecedor** (botão "Excluir" dentro do "Abrir"/editar): se ele **não tiver** despesas nem notas ligadas, é excluído direto. Se **tiver**, o app oferece **mesclar** — move as despesas e notas para outro fornecedor **de mesmo CNPJ** (útil para juntar cadastros duplicados) e então exclui o duplicado. A exclusão é só no app; o cadastro no Conta Azul não é apagado.

---

## Relação com o Conta Azul

- **Envio desligado (07/2026):** fornecedor criado no app fica **só no app** — não é mais enviado ao Conta Azul.
- **Importar do Conta Azul** continua funcionando: traz os cadastros com perfil "Fornecedor" que já existem lá (casa por vínculo com o CA ou pelo CNPJ/CPF).
- Fornecedores que estavam "presos" tentando ser enviados ao CA foram convertidos automaticamente para **"só no app"**.

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `Pode_Acessar_Fornecedores` | Ver a lista de fornecedores |
| `Pode_Editar_Fornecedores` | Criar, editar e importar do CA |
| `admin` | Tudo acima |

---

## Depende de / Interfere em

- **Contas a Pagar** — o fornecedor identifica a quem se paga cada despesa
- **Conta Azul** — cadastro espelhado via API (`/v1/pessoas`, perfil Fornecedor)

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `backend/routes/fornecedores.js` | Rotas da API (listar, criar, editar, importar do CA) |
| `backend/services/contasPagarCaSyncService.js` | Robô de envio ao CA e importação |
| `frontend/src/pages/Financeiro/Fornecedores*` | Telas do módulo |
