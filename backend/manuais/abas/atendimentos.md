---
aba: Atendimentos
rota: /atendimentos
permissao: todos (admin vê todos os vendedores; vendedor vê os próprios)
---

# Atendimentos

## O que é

Painel de consulta e auditoria de todos os atendimentos registrados no sistema. Um atendimento é qualquer contato feito com um cliente ou lead: visita, WhatsApp, ligação, pedido, amostra, retorno ou financeiro. A tela permite filtrar por período, tipo, vendedor e outras dimensões, e visualizar os detalhes de cada registro.

---

## O que dá pra fazer aqui

- Ver todos os atendimentos com paginação (50 por vez)
- Filtrar por: data (período), tipo de atendimento, vendedor, cidade, ação e filtros especiais
- Navegar entre períodos com as setas (avança/recua o mesmo número de dias)
- Buscar por nome do cliente ou texto nas observações
- Expandir um atendimento para ver todos os detalhes
- Abrir o popup do cliente diretamente do atendimento
- Excluir um atendimento (admin)
- Ver resumo: total de atendimentos, por tipo, por vendedor, com/sem pedido

---

## Tipos de atendimento

| Tipo | Cor | Quando usar |
|------|-----|-------------|
| VISITA | Roxo | Visita presencial ao cliente |
| WHATSAPP | Verde | Contato via WhatsApp |
| LIGACAO | Azul | Ligação telefônica |
| PEDIDO | Azul claro | Pedido registrado |
| AMOSTRA | Âmbar | Envio de amostra |
| RETORNO | Índigo | Retorno agendado cumprido |
| FINANCEIRO | Cinza | Cobrança ou assunto financeiro |

---

## Como fazer (passo a passo real)

### Consultar atendimentos do dia
1. Abra a aba Atendimentos
2. O filtro padrão já está com a data de hoje
3. A lista mostra todos os atendimentos registrados no dia

### Mudar o período
- Use as setas `<` e `>` ao lado do período para navegar
- Ou altere diretamente os campos de data início e fim

### Filtrar por vendedor (admin)
- Selecione o vendedor no filtro de vendedores
- A lista atualiza para mostrar apenas os atendimentos daquele vendedor

### Ver detalhes de um atendimento
- Clique na linha do atendimento para expandir
- Você vê: hora, observações, ação registrada, data de retorno (se houver) e dados do cliente

### Exportar (download)
- O botão de download (ícone) exporta os atendimentos filtrados em CSV

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| Qualquer usuário logado | Vê os próprios atendimentos |
| `admin` | Vê todos os vendedores, pode excluir atendimentos |

---

## Depende de / Interfere em

- **Rota** — os atendimentos são criados pela Rota (modal de atendimento)
- **Leads** — atendimentos de leads também aparecem aqui
- **Dashboard** — o número de atendimentos do dia é usado em análises de desempenho
- **Análise IA** — cada atendimento pode disparar uma análise da IA

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Atendimentos/PainelAtendimentos.jsx` | Componente principal |
| `frontend/src/services/atendimentoService.js` | Chamadas de API |
| `backend/src/routes/atendimentos.js` | Rotas do backend |
