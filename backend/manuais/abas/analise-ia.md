---
aba: Análise IA
rota: /analise-ia
permissao: admin
---

# Análise IA

## O que é

Painel de auditoria técnica das análises feitas pela inteligência artificial. Toda vez que o sistema gera uma orientação de IA para um vendedor (baseado no histórico do cliente), isso fica registrado aqui: o prompt enviado, a resposta recebida, quantos tokens foram consumidos, quanto tempo levou e se houve erro.

Esta tela é principalmente para o administrador monitorar o funcionamento e o custo das análises de IA.

---

## O que dá pra fazer aqui

- Ver todos os logs de análise com filtro por período, vendedor, quem disparou e resultado (sucesso/erro)
- Ver o total de tokens consumidos e a duração média das chamadas
- Expandir um log para ver:
  - **Resposta da IA**: o conteúdo gerado (orientação, ação sugerida, etc.)
  - **Prompt enviado**: o texto exato que foi enviado para o modelo
  - **Dados de entrada**: os dados do cliente usados para montar o prompt
- Navegar entre períodos com as setas

---

## Disparadores de análise

| Disparado por | Quando acontece |
|---------------|----------------|
| ATENDIMENTO | Um atendimento foi registrado e o sistema gerou orientação |
| NOTURNO | Scheduler rodou durante a madrugada e gerou análises em lote |
| MANUAL | Admin clicou em "Analisar IA" no card do cliente na Rota |

---

## Como fazer (passo a passo real)

### Ver logs do dia
1. Abra a aba Análise IA
2. O filtro padrão já está com hoje selecionado
3. A lista mostra todos os logs com status (sucesso = verde, erro = vermelho)

### Inspecionar uma análise
1. Clique na linha do log para expandir
2. Use as abas internas:
   - **Resposta da IA**: o que a IA respondeu (campos: metaHoje, acao, seNegar, etc.)
   - **Prompt enviado**: o prompt completo que foi enviado
   - **Dados de entrada**: os dados brutos do cliente (JSON)
3. Veja também: modelo usado, total de tokens, duração em milissegundos

### Filtrar por resultado
- Use o seletor "Todos / Sucesso / Erro" para focar nos logs com problema

---

## Informações técnicas visíveis

| Informação | Descrição |
|------------|-----------|
| Modelo | Nome do modelo de IA usado (ex: gpt-4o-mini) |
| Tokens | Tokens de prompt + tokens de resposta = total |
| Duração | Tempo de resposta em milissegundos ou segundos |
| Erro | Mensagem de erro caso a análise tenha falhado |

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Acesso total à aba |

---

## Depende de / Interfere em

- **Rota** — a análise é disparada quando o vendedor clica em "Analisar IA" no card do cliente
- **Atendimentos** — após registrar atendimento, pode disparar análise automática
- **Clientes** — os dados do cliente (histórico, ciclo, inadimplência) alimentam o prompt

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/AnaliseIA/PainelAnaliseIA.jsx` | Componente principal |
| `frontend/src/services/iaLogService.js` | Chamadas de API para logs de IA |
| `backend/src/routes/insights.js` | Rota de geração de orientação (`/insights/clientes/:id/gerar-ia`) |
