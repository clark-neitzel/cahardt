---
aba: Fornecedores
rota: /fornecedores
permissao: Pode_Acessar_Fornecedores
---

# Fornecedores

## O que é

Cadastro de fornecedores da empresa, usado pelo módulo de Contas a Pagar. Os fornecedores ficam sincronizados com o Conta Azul nos dois sentidos: quem é criado no app é enviado automaticamente ao CA, e quem já existe no CA pode ser importado de uma vez com um botão.

---

## O que dá pra fazer aqui

- Ver e buscar fornecedores (por nome, nome fantasia ou CNPJ/CPF). A busca por CNPJ/CPF funciona com ou sem pontuação (tanto faz digitar `08.766.459/0001-02` ou `08766459000102`).
- Cadastrar fornecedor: CNPJ/CPF, razão social, nome fantasia, inscrição estadual, e-mail, telefone, cidade/UF e observações. O campo CNPJ/CPF **já aplica a máscara enquanto você digita** e **confere o dígito verificador** — se o número estiver errado, o app avisa e não salva. Aceita o **CNPJ alfanumérico novo** (com letras, ex.: `12.ABC.345/01DE-35`) que a Receita passa a emitir a partir de 07/2026.
- Editar um fornecedor (se o envio ao CA tinha dado erro, salvar a edição recoloca ele na fila de envio)
- **Importar do Conta Azul**: busca todos os cadastros com perfil "Fornecedor" no CA e cria/atualiza aqui (casa por vínculo com o CA ou, se não houver, pelo CNPJ/CPF). Mostra quantos foram importados e quantos atualizados
- Ativar/inativar fornecedor
- **Excluir um fornecedor** (botão "Excluir" dentro do "Abrir"/editar): se ele **não tiver** despesas nem notas ligadas, é excluído direto. Se **tiver**, o app oferece **mesclar** — move as despesas e notas para outro fornecedor **de mesmo CNPJ** (útil para juntar cadastros duplicados) e então exclui o duplicado. A exclusão é só no app; o cadastro no Conta Azul não é apagado.

---

## Sincronização com o Conta Azul

- Fornecedor criado no app entra na fila e um robô o cria no Conta Azul em até 1 minuto (perfil "Fornecedor").
- Fornecedores importados do CA já nascem sincronizados.
- Uma conta a pagar só é enviada ao CA depois que o fornecedor dela estiver sincronizado.

### Status de envio ao CA

| Status | Significado |
|--------|-------------|
| ENVIAR | Na fila, será criado no CA em até 1 min |
| ENVIANDO | Envio em andamento |
| SINCRONIZADO | Existe no CA e está vinculado |
| ERRO | Falhou — veja a mensagem; editar e salvar tenta de novo |
| NAO_ENVIAR | Não deve ir para o CA |

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `Pode_Acessar_Fornecedores` | Ver a lista de fornecedores |
| `Pode_Editar_Fornecedores` | Criar, editar e importar do CA |
| `admin` | Tudo acima |

---

## Depende de / Interfere em

- **Contas a Pagar** — o fornecedor é obrigatório para enviar uma despesa ao Conta Azul
- **Conta Azul** — cadastro espelhado via API (`/v1/pessoas`, perfil Fornecedor)

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `backend/routes/fornecedores.js` | Rotas da API (listar, criar, editar, importar do CA) |
| `backend/services/contasPagarCaSyncService.js` | Robô de envio ao CA e importação |
| `frontend/src/pages/Financeiro/Fornecedores*` | Telas do módulo |
