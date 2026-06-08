---
aba: Despesas
rota: /caixa/despesas
permissao: todos (vendedor vê as próprias; admin vê todas)
---

# Despesas

## O que é

Registro e consulta das despesas operacionais do dia (combustível, pedágio, hotel, manutenção de veículo, etc.). Quando acessada a partir do Caixa Diário, já vem pré-filtrada pelo vendedor e data do caixa aberto. Pode também ser acessada diretamente para consultas por período.

---

## O que dá pra fazer aqui

- Ver todas as despesas do dia com hora, categoria, descrição e valor
- Registrar nova despesa (categoria + descrição + valor)
- Editar uma despesa já registrada
- Excluir uma despesa
- Ver o total do dia no card de resumo
- Filtrar por data (quando acessada diretamente, não pelo caixa)

---

## Categorias de despesa

| Categoria | Ícone | Exemplos |
|-----------|-------|---------|
| COMBUSTIVEL | Bomba de combustível | Gasolina, diesel, etanol |
| PEDAGIO_BALSA | Cifrão | Pedágio, balsa |
| HOTEL_HOSPEDAGEM | Hotel | Pernoite em rota |
| MANUTENCAO_VEICULO | Chave | Pneu, óleo, borracharia |
| MERCADORIA_EMPRESA | Recibo | Compras para a empresa |
| OUTRO | Elipse | Qualquer outra despesa |

---

## Como fazer (passo a passo real)

### Registrar uma despesa
1. Abra a aba Despesas (ou acesse pelo botão no Caixa)
2. Clique em **+ Nova Despesa**
3. Escolha a categoria
4. Informe a descrição e o valor
5. Salve

### Editar ou excluir
- Clique no ícone de lápis para editar
- Clique no ícone de lixeira para excluir (confirma antes)

### Acesso pelo Caixa
- No Caixa Diário, clique no link de despesas
- A tela abre pré-filtrada para o mesmo dia e vendedor do caixa
- O botão "Voltar ao Caixa" fica visível no topo

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| Qualquer usuário logado | Registra e vê as próprias despesas |
| `admin` ou `Pode_Editar_Caixa` | Pode ver e editar despesas de outros vendedores |

---

## Depende de / Interfere em

- **Caixa Diário** — as despesas aparecem no resumo financeiro do caixa do dia
- **Veículos** — o veículo associado ao caixa do dia é vinculado nas despesas de manutenção

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Caixa/DespesasPage.jsx` | Tela principal de despesas |
| `frontend/src/pages/Caixa/NovaDespesaModal.jsx` | Modal de criação/edição |
| `frontend/src/services/despesaService.js` | Chamadas de API para despesas |
| `backend/src/routes/despesas.js` | Rotas do backend |
