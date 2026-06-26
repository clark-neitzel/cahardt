# Diretrizes do Projeto CA-Hardt

## Stack
- **Frontend:** React + Vite + Tailwind CSS (PWA)
- **Backend:** Node.js + Express + Prisma (PostgreSQL)
- **Deploy:** EasyPanel (IP 76.13.160.151), acesso via `/api/admin-exec` com header `x-admin-secret: hardt-admin-2026`

---

## Integração WhatsApp / BotConversa (NÃO ESQUECER)

Todo envio de WhatsApp do sistema (pedido normal, especial, amostra, delivery e Kit Festa) passa por **um único webhook do BotConversa**, cuja URL fica no banco em `app_configs` chave `webhook_botconversa_url` (configurável em **Configurações → Notificação WhatsApp**). O código fica em `backend/services/webhookService.js`.

### O webhook RECUSA com HTTP 400 se faltar qualquer campo esperado

A automação do BotConversa ("catch" webhook, painel **Automação → AppHardt**) captura uma estrutura fixa de campos. Se o `POST` não enviar **todos** eles, o BotConversa responde **HTTP 400 com corpo vazio** e a mensagem **não é enviada**.

**Campos obrigatórios no payload (todos):**
```js
{ phone, nome, mensagem, data_pedido, data_entrega, total, condicao }
```
- `phone`: só dígitos, **com DDI 55** (ex.: `5547999999999`).
- `total`: string com ponto decimal (ex.: `"110.00"`), via `.toFixed(2)`.
- `data_pedido` / `data_entrega`: via `formatDate()` → `DD.MM.YYYY`.

**Regra:** qualquer função nova que dispare mensagem **deve mandar o conjunto completo** acima — espelhe o `notificarPedido` (envio que comprovadamente funciona). Omitir um campo (ex.: `data_pedido`) = 400 silencioso.

### Diagnóstico quando "a mensagem não chega"

1. Confira o toggle **Configurações → Notificação WhatsApp** (`whatsapp_ativo`). Pausado = pedido normal não envia e **não loga nada** (`webhookService.js` retorna cedo).
2. Veja o motivo gravado no pedido (`whatsappErro`) ou os logs `[Webhook...]`.
3. Para Kit Festa, reenviar um pedido: `POST /api/admin-exec/kitfesta-reenviar-whatsapp/:numero` (header `x-admin-secret`). A resposta traz `{ ok, motivo }` — `HTTP 400` = falta campo ou BotConversa recusando.
4. O Kit Festa **não** depende do toggle `whatsapp_ativo` (confirmação transacional, sempre envia).

---

## Regras de CSS e Animações

### NÃO animar `box-shadow` em mobile
Animar `box-shadow` via `@keyframes` força repaint completo a cada frame no Android Chrome.
Isso causa artefatos visuais durante o scroll (cards "fantasma", conteúdo duplicado na tela).

**Errado:**
```css
@keyframes pulse {
  50% { box-shadow: 0 0 0 4px rgba(255,0,0,0.3); }
}
```

**Certo — usar apenas propriedades GPU-composited:**
```css
@keyframes pulse {
  50% { opacity: 0.45; }
}
.animate-pulse {
  will-change: opacity;
}
```

Propriedades seguras para animação (GPU-composited): **`opacity`**, **`transform`**.
Propriedades que causam repaint (evitar em animações): `box-shadow`, `border`, `color`, `background-color`, `outline`.

---

## Regras de Layout Mobile

### Nunca usar `position: absolute` com offset negativo em elementos dentro de CSS Grid sem `gap`
Isso causa sobreposição de cards no Android Chrome.

**Errado:**
```jsx
<div className="grid grid-cols-1">
  <div className="relative">
    <div className="absolute -top-1.5 -left-1.5 z-10">badge</div>
    <Card />
  </div>
</div>
```

**Certo — badge inline no fluxo normal:**
```jsx
<div className="grid grid-cols-1 gap-2">
  <div>
    <div className="flex items-center gap-2">
      <span>badge</span>
      <span>conteúdo ETA</span>
    </div>
    <Card />
  </div>
</div>
```

### Sempre incluir `gap` em grids mobile
Grids com `lg:gap-3` mas sem gap no breakpoint mobile (`grid-cols-1`) deixam cards sem espaçamento, agravando problemas de layout.

---

## Regras de Dados / Template Strings

### Sempre guardar campos opcionais antes de interpolar em strings
Campos do backend podem chegar `null` ou `undefined`. Interpolar diretamente produz a string `"undefined"` visível ao usuário.

**Errado:**
```js
`${dias}d sem comprar · ciclo ${ciclo}d`  // → "6d sem comprar · ciclo undefinedd"
```

**Certo:**
```js
`${dias}d sem comprar${ciclo != null ? ` · ciclo ${ciclo}d` : ''}`
```

---

## Regras de Schema Prisma (NUNCA QUEBRAR O DEPLOY)

### Nunca remover campos do schema.prisma que já existem no banco

O deploy usa `prisma db push` (sem `--accept-data-loss`). Se um campo for removido do schema e a coluna ainda existir no banco, o Prisma recusa o push e o servidor **não sobe**.

**Errado — causa falha de deploy:**
```prisma
// Antes:
tipoFlex String @default("NORMAL") @map("tipo_flex")
// Depois (removido):
// (campo deletado do schema)
```

**Certo — manter o campo legado no schema:**
```prisma
tipoFlex     String  @default("NORMAL") @map("tipo_flex")  // legado — mantido para não dropar a coluna
flexPositivo Boolean @default(true) @map("flex_positivo")
flexNegativo Boolean @default(true) @map("flex_negativo")
```

**Regra:** ao substituir um campo por outro, **sempre manter o campo antigo** no schema com um comentário `// legado`. Só é seguro remover após confirmar que a coluna foi dropada manualmente no banco de produção.

Isso se aplica a qualquer campo que já existia em produção — mesmo que não seja mais usado no código.

---

## PWA / Atualização

O app é PWA. Sempre que fizer deploy de mudanças visíveis, incluir o ícone de refresh na UI e o hook `useVersionCheck` para que o usuário seja notificado automaticamente.

---

## Regras de Impressão (PWA / iPad) — imprimir NA PRÓPRIA PÁGINA, nunca `window.open` nem iframe

O app roda instalado na tela inicial (PWA standalone) e é muito usado em **iPad/iOS**. Duas abordagens que **NÃO funcionam** e estão proibidas:
- `window.open(..., '_blank')` → abre aba/janela externa e tira o usuário de dentro do app (ele precisa fechar e reabrir).
- `<iframe>` oculto + `iframe.contentWindow.print()` → no **iOS/iPad** sai **página em branco só com o endereço do site** (o Safari imprime a página principal, não o iframe) e às vezes trava as próximas impressões.

**Padrão correto:** montar o conteúdo **na própria página** e usar `@media print` para esconder o app e mostrar só a folha; depois limpar. Funciona em desktop e iPad.

```js
function imprimirConteudo(estilos, corpoHtml) {
    document.getElementById('area-impressao')?.remove();
    document.getElementById('estilo-impressao')?.remove();
    const style = document.createElement('style');
    style.id = 'estilo-impressao';
    const estilosSemPage = (estilos||'').replace(/@page\s*{[^}]*}/g, ''); // @page só no nível raiz (iOS)
    style.textContent = `
        @page { size: A4 portrait; margin: 12mm; }
        #area-impressao { display: none; }
        @media print {
            html, body { margin:0!important; padding:0!important; background:#fff!important; height:auto!important; }
            body > *:not(#area-impressao) { display: none !important; }     /* remove o app do LAYOUT */
            #root { display: none !important; }
            #area-impressao { display: block !important; }
            #area-impressao * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            ${estilosSemPage}
        }`;
    document.head.appendChild(style);
    const area = document.createElement('div');
    area.id = 'area-impressao';
    area.innerHTML = corpoHtml;
    document.body.appendChild(area);
    const limpar = () => { area.remove(); style.remove(); window.removeEventListener('afterprint', limpar); };
    window.addEventListener('afterprint', limpar);
    setTimeout(limpar, 60000); // fallback
    void area.offsetHeight;             // força layout
    window.print();                     // SÍNCRONO no clique (senão iOS bloqueia "imprimir automaticamente")
}
// Para HTML completo (com <style>): extrair estilos + corpo e remover <script> (não roda via innerHTML).
```

**Regras:**
- Impressão (folha A4, etiqueta, comprovante, recibo) → sempre `@media print` na própria página. Referência: `frontend/src/pages/PCP/ReceitaDetalhe.jsx` (`imprimirConteudo` / `imprimirHtml`).
- Esconder o app com **`display:none`** (`body > *:not(#area-impressao)` + `#root`) — **NÃO usar `visibility:hidden`**, pois ela mantém a altura do app no layout e gera **páginas em branco** extras. Também não pôr `#area-impressao` em `position:absolute` (deixe fluir, para a altura do documento ser só a da folha = 1 página).
- `print()` **síncrono no clique** (sem `setTimeout`) — senão o iOS bloqueia com "site proibido de imprimir automaticamente".
- `@page` no **nível raiz**, fora do `@media` (iOS não lida bem com `@page` aninhado).
- Incluir `print-color-adjust: exact` para imprimir fundos/cores (ex.: cabeçalhos pretos).
- Limpar sempre o `#area-impressao` e o `<style>` no `afterprint` (+ fallback por timeout), senão sobra lixo no DOM e a próxima impressão falha.
- `window.open` continua **OK apenas para links externos** (mapa/Google Maps, site de terceiro), que devem mesmo abrir fora do app.
- Pontos legados ainda usando `window.open` para imprimir (migrar quando tocar neles): `frontend/src/pages/Pedidos/ImpressaoPedido.jsx`, `frontend/src/pages/Financeiro/ContasReceberTabela.jsx`.

---

## Manual das Abas e Clippy — atualizar SEMPRE (não esperar o usuário pedir)

Cada aba/tela do app tem um manual em `backend/manuais/abas/<slug>.md` (índice em `backend/manuais/abas/README.md`). Esses manuais são a **fonte de conhecimento do assistente Clippy** (`backend/services/copilotoService.js` lê os arquivos em runtime + a tabela `ABAS` com as rotas/permissões reais). O Clippy passa a usar a versão nova **ao publicar o backend**.

**CHECKLIST OBRIGATÓRIO ao final de TODA alteração no sistema** (faça por conta própria, sem o usuário precisar pedir):
1. Pergunte-se: esta mudança **cria ou altera** alguma função, tela, fluxo ou permissão visível ao usuário?
2. Se SIM:
   - Atualize o manual da aba correspondente (analise a aba inteira; edite só o que mudou; NÃO remova itens importantes).
   - Se for tela/função **NOVA**: crie o manual (`backend/manuais/abas/<slug>.md`), adicione a linha no índice `README.md` e adicione a entrada na tabela `ABAS` em `backend/services/copilotoService.js` (rota real + permissão real).
   - Se a **rota ou permissão** mudou: atualize a tabela `ABAS`.
   - Cubra TODAS as funções e TODAS as sub-abas da tela.
3. Baseie-se no comportamento REAL do código, não no nome das rotas.
4. Ao final, **avise o usuário** o que foi atualizado no manual/Clippy (ou diga que nada precisou).
