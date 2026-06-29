# Diretrizes do Projeto CA-Hardt

## REGRA INEGOCIÁVEL — Verificação antes de todo commit

**Toda alteração em arquivos frontend (JSX/JS) deve passar pelo build antes do commit.**

```bash
cd frontend && npm run build
```

- Se o build **falhar** → corrigir o erro antes de commitar. Jamais subir código que não compila.
- Se o build **passar** → commitar e fazer push normalmente.
- **Não há exceções.** Nem para mudanças "pequenas" de CSS, ícone ou import.

### Por que isso é crítico
O app roda em produção 24h. Um import faltando (`ReferenceError: Can't find variable`) derruba toda a tela para todos os usuários — vendedores em campo, motoristas, escritório. Uma linha esquecida para toda a operação da empresa.

### O que o build detecta
- Variável/componente usado mas não importado (`Can't find variable: Truck`)
- Import de arquivo que não existe
- JSX mal formado
- Erro de sintaxe JavaScript

---

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

## Padrão Visual do Sistema (Design System)

> Referência visual completa: `design-system.html` na raiz do projeto. Sempre seguir este padrão ao criar ou alterar telas.

### Tokens Principais

| Token | Valor |
|---|---|
| Cor primária | `#005fcc` (classe `primary`) |
| Background geral | `#f3f4f6` (classe `secondary`) |
| Surface (cards) | `#ffffff` |
| Texto principal | `#1f2937` (gray-900) |
| Fonte | SF Pro Text, -apple-system, Roboto, sans-serif |

### Estrutura de Card (padrão de toda seção de conteúdo)
```jsx
<div className="bg-white rounded-xl border border-gray-200 shadow-sm">
  <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
    <Icon className="h-4 w-4 text-blue-600" />
    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">TÍTULO DA SEÇÃO</span>
  </div>
  <div className="p-5">{children}</div>
</div>
```

### Botões
- **Primário:** `px-4 py-2 bg-primary hover:bg-blue-700 text-white rounded-md shadow-sm font-semibold text-sm`
- **Secundário:** `px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm`
- **Perigo:** `px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-semibold text-sm`
- **Ícone sutil:** `p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100`

### Badges de Status
Sempre `px-2 py-1 text-xs font-semibold rounded-full` com as cores:
- Verde (`bg-green-100 text-green-800`): Ativo, Pago, Aprovado
- Azul (`bg-blue-100 text-blue-800`): Aberto, Em Andamento
- Cinza (`bg-gray-100 text-gray-700`): Pendente, Sem Estoque
- Amarelo (`bg-yellow-100 text-yellow-800`): Parcial, Baixo Estoque
- Âmbar (`bg-amber-100 text-amber-700`): Atenção, Faturamento
- Vermelho (`bg-red-100 text-red-700`): Cancelado, Vencido, Inativo
- Roxo (`bg-purple-100 text-purple-700`): Especial

### Tabelas
```jsx
<table className="min-w-full divide-y divide-gray-200">
  <thead className="bg-gray-50">
    <tr><th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Col</th></tr>
  </thead>
  <tbody className="bg-white divide-y divide-gray-200 text-sm">
    <tr className="hover:bg-gray-50"><td className="px-5 py-3 text-gray-900">dado</td></tr>
  </tbody>
</table>
```

### Formulários — inputs
```jsx
<input className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
```

### Ícones de Módulo (topbar)
Sempre: `bg-[cor]-100 p-2 rounded-lg` + ícone `h-5 w-5 text-[cor]-600`. Cada módulo tem sua cor:
- Pedidos: blue | Clientes: green | Produtos: purple | Financeiro: amber
- Expedição: sky | Dashboard: red | Rota: orange | PCP: teal

### Regras de Raio de Borda
- Inputs/botões: `rounded` (4px) ou `rounded-md` (6px)
- Cards simples: `rounded-lg` (8px)
- Cards com header: `rounded-xl` (12px)
- Modais/painéis grandes: `rounded-2xl` (16px)
- Badges: `rounded-full`

### Barras de Progresso (metas) — cor por %
- 0–50%: `bg-red-500` | 50–80%: `bg-blue-500` | 80–99%: `bg-yellow-400` | 100%+: `bg-green-500`

### Tipografia
- Título de página: `text-2xl font-bold text-gray-900` (mobile: `text-lg`)
- Cabeçalho de seção: `text-xs font-bold uppercase tracking-widest text-gray-600`
- Label de campo: `text-sm font-medium text-gray-700`
- Texto corrido: `text-sm text-gray-600`
- Cabeçalho de tabela: `text-xs font-semibold text-gray-500 uppercase tracking-wide`

### OBRIGATÓRIO ao criar ou editar qualquer tela

**Ao criar uma tela nova ou alterar uma existente, SEMPRE:**
1. Usar os tokens e padrões acima (cards com `rounded-xl border border-gray-200 shadow-sm`, botões com as classes definidas, badges com as cores de status corretas, etc.)
2. Garantir que a tela funciona no mobile (ver seção "Responsividade Mobile" abaixo)
3. Não inventar estilos novos — reutilizar os padrões do design system

---

## Responsividade Mobile — OBRIGATÓRIO em toda tela

O app é acessado no celular por vendedores e no iPad pela equipe interna. **Toda tela deve funcionar bem em mobile (≥ 320px)**. Seguir estas regras sem exceção:

### Estrutura geral mobile-first
- Começar sempre pelo layout mobile (sem prefixo) e adaptar para desktop com `md:` e `lg:`
- Nunca deixar scroll horizontal — testar com `max-w-full overflow-x-hidden` no container raiz da página
- Padding de página: `p-3 md:p-6` (compacto no mobile, espaçoso no desktop)

### Listas e grids
- **Tabelas:** em mobile exibir como cards (`block md:hidden` para a versão card, `hidden md:block` para a tabela). Estrutura de card mobile para linha de tabela:
```jsx
{/* Mobile: cards */}
<div className="md:hidden space-y-3 p-3">
  {itens.map(item => (
    <div key={item.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-gray-900">{item.titulo}</span>
        <BadgeStatus status={item.status} />
      </div>
      <div className="text-sm text-gray-500">{item.detalhe}</div>
    </div>
  ))}
</div>
{/* Desktop: tabela */}
<div className="hidden md:block overflow-x-auto">
  <table className="min-w-full divide-y divide-gray-200">...</table>
</div>
```
- **Grids de KPI:** `grid-cols-2 md:grid-cols-4` — nunca `grid-cols-4` sem prefixo `md:`
- **Formulários:** `grid-cols-1 md:grid-cols-2` com `gap-4`

### Topbar de página
```jsx
{/* Mobile: título + botão empilhados ou compactos */}
<div className="flex items-center justify-between p-3 md:p-6 bg-white border-b border-gray-200">
  <div className="flex items-center gap-2">
    <div className="bg-blue-100 p-1.5 md:p-2 rounded-lg">
      <Icon className="h-4 w-4 md:h-5 md:w-5 text-blue-600" />
    </div>
    <h1 className="text-base md:text-2xl font-bold text-gray-900">Título</h1>
  </div>
  <button className="px-3 py-1.5 md:px-4 md:py-2 bg-primary text-white rounded-md text-xs md:text-sm font-semibold">
    Ação
  </button>
</div>
```

### Filtros
- Em mobile: empilhar verticalmente (`flex flex-col gap-2`) ou usar scroll horizontal (`flex gap-2 overflow-x-auto hide-scrollbar`)
- Inputs de filtro: `w-full` no mobile, largura fixa no desktop (`md:w-48`)

### Botões de ação em formulários
- Barra flutuante: `fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-3 md:static md:border-0 md:bg-transparent md:p-0`

### Textos e truncamento
- Títulos longos: `truncate` ou `line-clamp-1` para não quebrar layout
- Evitar `whitespace-nowrap` em colunas que podem ter texto variável

### Toque (tap targets)
- Botões e links clicáveis: mínimo `44px` de altura em mobile (`min-h-[44px]` ou `py-3`)
- Ícones clicáveis: sempre com padding ao redor (`p-2` mínimo)

### Checklist antes de considerar uma tela pronta
- [ ] Funciona em 375px de largura (iPhone SE) sem scroll horizontal?
- [ ] Tabelas viram cards no mobile?
- [ ] Grids não ficam com mais de 2 colunas no mobile?
- [ ] Botões e campos têm tamanho confortável para toque?
- [ ] Textos não saem cortados ou sobrepostos?

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

**Cache do `index.html` (NÃO cachear):** o frontend é servido por nginx (`frontend/Dockerfile`). O `index.html` deve sair com `Cache-Control: no-cache` (sempre revalida via ETag); só `/assets/` (arquivos com hash no nome) podem ter cache longo/imutável. Se o `index.html` for cacheado, o app instalado no iOS (atalho/standalone, **sem service worker** — só `manifest.json`) fica preso numa versão antiga e **nunca pega o JS novo** após o deploy (sintoma: comportamento antigo persiste mesmo após publicar). Se um usuário ficar preso numa versão velha, orientar a **remover e re-adicionar o atalho** na tela inicial (uma vez) para limpar o cache heurístico.

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
