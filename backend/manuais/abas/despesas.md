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


### Comprovante da despesa (foto do cupom/nota/recibo) — MODO TESTE: só marca e avisa
- Toda despesa deve ter a **foto do comprovante** (cupom fiscal, nota ou recibo). Se não houver, escolha **"Sem comprovante"** e escreva o motivo (mínimo 5 letras).
- Ao enviar a foto, o sistema **lê o documento** (tipo, valor, data, nome e CNPJ do fornecedor, número; no combustível também litros) e **confere** com o que foi digitado: valor (diferença de até R$ 0,05 passa), data do documento x dia da despesa, litros (até 0,5 L), litros x tamanho do tanque do veículo, e se o fornecedor combina com a categoria (combustível = posto, manutenção = oficina/auto peças, pedágio = pedágio/balsa). Também avisa se o **mesmo cupom** já foi usado em outra despesa nos últimos 90 dias.
- Resultado por despesa: **Conferida** (tudo bate), **Divergente** (algo não bate — a lista de motivos aparece), **Recusada** (foto ilegível ou não é um comprovante), **Leitura indisponível** (IA fora do ar ou PDF; o escritório confere), **Sem comprovante** (com o motivo) ou **Aceita** (o escritório aceitou mesmo assim).
- **Nada trava**: a despesa **sempre salva**, mesmo divergente, sem foto ou com a leitura fora do ar. O valor a prestar do caixa **não muda** por causa do comprovante.
- Quem fecha o caixa vê o selo de cada despesa e, se o fornecedor lido tem CNPJ cadastrado, a sugestão do fornecedor (a confirmação é do escritório).
- **Aceitar** uma despesa divergente/sem comprovante: só `Pode_Editar_Caixa` ou admin, informando o motivo (mínimo 5 letras). Fica registrado quem aceitou e quando.
- **Anexar/trocar a foto depois**: o dono da despesa enquanto o caixa estiver aberto; o escritório (`Pode_Editar_Caixa`/admin) a qualquer momento, inclusive com o caixa fechado (anexar a foto não muda dinheiro). Ao editar valor/litros da despesa, a conferência é refeita com a leitura já guardada.
- A foto só abre por dentro do sistema (nunca por link público): dono da despesa, `Pode_Editar_Caixa` ou admin.
- A mesma regra vale para o abastecimento lançado pela ficha do veículo (lá a foto é opcional).
- O PDF do caixa **não mostra** a leitura da IA.

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Caixa/DespesasPage.jsx` | Tela principal de despesas |
| `frontend/src/pages/Caixa/NovaDespesaModal.jsx` | Modal de criação/edição |
| `frontend/src/services/despesaService.js` | Chamadas de API para despesas |
| `backend/src/routes/despesas.js` | Rotas do backend |
| `backend/routes/despesaComprovante.js` | Comprovante: analisar foto, ver, aceitar, anexar depois |
| `backend/services/cupomDespesaService.js` | Leitura do cupom pela IA e conferência (no servidor) |
