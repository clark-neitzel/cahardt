---
name: depuracao-sistematica
description: Método para corrigir bug no CA-Hardt achando a causa raiz antes de mexer no código. Use em TODA correção de bug, comportamento inesperado, falha intermitente ou bug que voltou — ANTES de propor qualquer correção.
---

# Depuração sistemática — CA-Hardt

Adaptado da skill `systematic-debugging` do projeto Superpowers (obra/superpowers, licença MIT),
enxugado para a realidade deste projeto. Adotado em 11/2026 a pedido do dono.

## A lei

**Nenhuma correção sem causa raiz investigada.** Corrigir o sintoma é o que faz o bug voltar — a
impressão do iPad foi "corrigida" mais de uma vez exatamente assim.

Enquanto você não conseguir completar a frase abaixo, não pode propor correção:

> "O defeito acontece porque ______, e eu sei disso porque ______ (evidência)."

## Fase 0 — Esse bug já foi "corrigido" antes?

- `git log --oneline -i --grep="<palavra do bug>"` e `git log --oneline -- <arquivo do fluxo>`;
  procure também no `CLAUDE.md` (a thread principal consulta ainda a memória do projeto e repassa o que achar).
- Se já houve correção, o bug é **reincidente**: leia o commit anterior e explique no relatório
  **por que aquela correção não segurou**. Bug reincidente nunca é tarefa pequena.

## Fase 1 — Investigar (antes de tocar no código)

1. **Leia o erro inteiro** — mensagem, stack, arquivo e linha, log do servidor. Muitas vezes a
   resposta está escrita ali.
2. **Reproduza** com passos exatos. Local usa o banco `hardt_local`; produção só por leitura
   (`/api/admin-exec` ou o dump de 15 min). Se só acontece em produção ou no iPad, isso já é pista:
   o container não é a máquina local e o Safari não é o Chrome. Não reproduziu → junte mais dados;
   **não chute**.
3. **O que mudou?** `git log` recente dos arquivos do fluxo, último deploy, variável de ambiente.
4. **Ache a camada.** O caminho é tela → chamada da API → rota → service → banco (→ integração
   externa). Confira o dado **entrando e saindo** de cada fronteira (payload real no navegador,
   `curl`, `console.log` temporário, consulta no banco) antes de decidir onde está o defeito.
5. **Siga o dado errado para trás** até onde ele nasce. Corrija na origem, não onde ele aparece.

## Fase 2 — Comparar com o que funciona

Ache no próprio projeto um fluxo parecido que funciona (o `CLAUDE.md` aponta as referências de
cada padrão) e liste as diferenças uma por uma. Não descarte nenhuma com "isso não deve importar".

## Fase 3 — Uma hipótese por vez

- Escreva: "acho que é X, porque Y".
- Teste com a **menor mudança possível**, uma variável por vez.
- Não confirmou → hipótese nova. **Nunca empilhe correção em cima de correção.**
- Não entendeu algo → diga "não entendi X". Não finja.

## Fase 4 — Corrigir

1. **Tenha uma reprodução que falha antes de corrigir**: lógica de service → teste em
   `backend/tests/` (`cd backend && npm test`) quando couber; tela → o passo a passo de clique que
   o QA vai repetir.
2. **Uma correção só, na causa.** Sem "já que estou aqui" — a exceção são as regras de boy-scout
   do `CLAUDE.md`, e elas devem ser declaradas no relatório.
3. **Verifique o sintoma ORIGINAL**, não só que o código novo roda.
4. Remova a instrumentação temporária (`console.log`, rota de diagnóstico).

## Regra das 3 tentativas

Se **3 correções** do mesmo bug já falharam (somando esta sessão e o histórico do git), **não
tente a 4ª**. Pare e devolva para a thread principal com o que foi tentado e por que cada uma
falhou. A essa altura o problema é de desenho: quem repensa é o `arquiteto`, e o dono é avisado.

## Sinais de que você está chutando — volte à Fase 1

- "Deve ser X, vou trocar e ver."
- Várias mudanças de uma vez.
- "Não entendi bem, mas isso deve resolver."
- Propor solução antes de ver o dado nas fronteiras.
- Esconder o sintoma: `try/catch` que engole o erro, `?.` a mais, timeout maior, `setTimeout`.
- Cada correção revela um problema novo em outro lugar.

## Quando a causa não está no código

Rede, lentidão do banco compartilhado, serviço externo fora do ar: documente o que investigou,
trate o caso (nova tentativa, timeout, mensagem clara ao usuário) e deixe log para a próxima vez.
Mas desconfie — quase sempre "não tem causa" é investigação incompleta.

## O que vai no relatório

Causa raiz **com a evidência** · como reproduziu · correções anteriores do mesmo bug (ou "nenhuma
encontrada", com o comando usado) · hipóteses descartadas · como provou que o sintoma original
sumiu · o que só se confirma no aparelho real ou em produção.
