# Diretrizes do Projeto CA-Hardt

## Stack
- **Frontend:** React + Vite + Tailwind CSS (PWA)
- **Backend:** Node.js + Express + Prisma (PostgreSQL)
- **Deploy:** EasyPanel (IP 76.13.160.151), acesso via `/api/admin-exec` com header `x-admin-secret: hardt-admin-2026`

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

## PWA / Atualização

O app é PWA. Sempre que fizer deploy de mudanças visíveis, incluir o ícone de refresh na UI e o hook `useVersionCheck` para que o usuário seja notificado automaticamente.

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
