# Regras de IMPRESSÃO — CA-Hardt

> **Fonte ÚNICA deste assunto** (saiu do `CLAUDE.md` em 24/11/2026 — pedido do dono: regras mais
> simples e rápidas para os agentes). Regra nova entra AQUI, **alterando a regra que já trata do
> tema** — nunca empilhar outra por cima, nem copiar para ficha, habilidade ou memória.

---

## Regras de Impressão (PWA / iPad) — imprimir NA PRÓPRIA PÁGINA, pela peça única `imprimirNaPagina`

O app roda instalado na tela inicial (PWA standalone) e é muito usado em **iPad/iOS**. Duas abordagens que **NÃO funcionam** e estão proibidas:
- `window.open(..., '_blank')` → abre aba/janela externa e tira o usuário de dentro do app (ele precisa fechar e reabrir).
- `<iframe>` oculto + `iframe.contentWindow.print()` → no **iOS/iPad** sai **página em branco só com o endereço do site** (o Safari imprime a página principal, não o iframe) e às vezes trava as próximas impressões.

### O padrão (corrigido em 24/11/2026 — o texto antigo daqui ensinava uma versão já abandonada)

**Toda impressão nova ou tocada chama a peça única** `frontend/src/utils/imprimirNaPagina.js`:

```js
import { imprimirNaPagina, escaparHtml } from '../../utils/imprimirNaPagina'; // ajuste o caminho
imprimirNaPagina(estilosCss, corpoHtml);   // chamar DIRETO no clique (síncrono)
```

- **Nunca copiar a função para dentro da tela** nem reescrever a restauração. Foi assim que o defeito do iPad voltou várias vezes: cada cópia ficou numa versão diferente. Precisa de um comportamento novo? Altere a peça única.
- **`@media print` sozinho NÃO é o padrão.** A peça esconde o app em **QUALQUER media** (classe `modo-impressao` no `<html>` com `display:none`) e a folha vira o conteúdo normal do documento. Motivo: no iPad (AirPrint/prévia do Safari, PWA standalone) o snapshot de impressão às vezes usa a renderização de **TELA**, ou aplica o print media pela metade — com o padrão antigo saía **a tela do app** no lugar da folha. As regras de `@media print` ficam só como **reforço**.

### O que a peça garante (e por que não simplificar)

- **`focus` / `blur` / `visibilitychange` NÃO restauram o app.** O WebKit do iPad dispara os três com a prévia ainda aberta; restaurar ali faz o app voltar e **é ele que sai impresso**. Guarda de tempo não resolve (tempo não separa abrir de fechar). Restauram só: `afterprint`, interação real do usuário (`pointerdown`/`keydown`, com as travas da peça) e o teto de segurança de 10 minutos. O media `print` ligar não restaura nada: só prova que imprimiu e reduz de dois toques para um. **Cancelar a impressão também restaura** (no próximo toque ou pelo teto) — o app nunca fica preso na folha. **Consequência aceita:** no iPad a folha fica na tela até o usuário tocar.
- **`limpezaPendente`**: a impressão seguinte desarma os listeners da anterior (senão a 2ª impressão sai como tela do app).
- **Larguras explícitas e coerentes em mm**: `#area-impressao` com a largura da área útil da folha (ex.: 186mm p/ A4 com margem 12mm) e html/body sem largura forçada — irmãos colapsados a `width:0` fazem o WebKit **ampliar** a impressão (scale-to-fit sobre largura indefinida). Etiqueta/folha de outro tamanho: sobrescrever `html.modo-impressao #area-impressao { width: … }` nos estilos passados (exemplos: `pages/KitFesta/etiquetasCaixas.js`, `pages/RH/etiquetasFuncionario.js`).
- **`print()` síncrono no clique** (sem `setTimeout`) — senão o iOS bloqueia com "site proibido de imprimir automaticamente".
- **`@page` no nível raiz**, fora do `@media` (iOS não lida bem com `@page` aninhado); a peça iça o `@page` dos estilos e preserva as margens de cada folha.
- **`print-color-adjust: exact`** para imprimir fundos/cores (ex.: cabeçalhos pretos).
- HTML completo (com `<style>`): extrair estilos + corpo e remover `<script>` (não roda via `innerHTML`).

### Regras
- Impressão (folha A4, etiqueta, comprovante, recibo) → sempre na própria página, pela peça única.
- Mexeu na peça → testar no **iPad real** (Chrome do computador não reproduz o AirPrint) e avisar o dono para fechar e reabrir o app (PWA guarda versão antiga).
- `window.open` continua **OK apenas para links externos** (mapa/Google Maps, site de terceiro), que devem mesmo abrir fora do app.
- A tela de Receitas (`pages/PCP/ReceitaDetalhe.jsx`) tem cópia própria com diagnóstico (pílula "IMPR v10") — é rede de segurança de propósito; não é modelo para tela nova.
- Pontos legados ainda usando `window.open` para imprimir (migrar para a peça única quando tocar neles): `frontend/src/pages/Pedidos/ImpressaoPedido.jsx`, `frontend/src/pages/Financeiro/ContasReceberTabela.jsx`.
- Cópias do padrão ANTIGO que devem migrar para a peça única quando forem tocadas: `Admin/Contabilidade/ContabilidadePage.jsx`, `Admin/Contabilidade/comum.js` (ainda restaura por `visibilitychange` — risco de sair a tela do app no iPad), `Financeiro/NotasRecebidasPage.jsx`, `Financeiro/ContasPagarPage.jsx`, `RH/imprimirCartaoPonto.js` (tem uma função local com o MESMO nome `imprimirNaPagina`, mas é cópia antiga — não confundir com a peça única), `PCP/EtiquetaLabel.jsx`, `Tarefas/TarefasParecer.jsx`.
