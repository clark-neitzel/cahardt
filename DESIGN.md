---
name: CA-Hardt
description: Sistema interno de gestão da Hardt Salgados — pedidos, financeiro, estoque e rota
colors:
  primary: "#005fcc"
  primary-hover: "#1d4ed8"
  link: "#3b82f6"
  bg: "#f3f4f6"
  surface: "#ffffff"
  ink: "#1f2937"
  ink-muted: "#4b5563"
  border: "#e5e7eb"
  divider: "#f3f4f6"
  success-bg: "#dcfce7"
  success-ink: "#166534"
  warning-bg: "#fef9c3"
  warning-ink: "#854d0e"
  danger-bg: "#fee2e2"
  danger-ink: "#b91c1c"
  info-bg: "#dbeafe"
  info-ink: "#1e40af"
  amber-bg: "#fef3c7"
  amber-ink: "#b45309"
  special-bg: "#f3e8ff"
  special-ink: "#7e22ce"
typography:
  title:
    fontFamily: '"SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  section:
    fontFamily: '"SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.1em"
  body:
    fontFamily: '"SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: '"SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  input: "6px"
  card: "8px"
  card-header: "12px"
  panel: "16px"
  full: "9999px"
spacing:
  page-mobile: "12px"
  page-desktop: "24px"
  card-pad: "20px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.input}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.surface}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.input}"
    padding: "8px 16px"
  button-danger:
    backgroundColor: "{colors.danger-ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.input}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card-header}"
    padding: "{spacing.card-pad}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.input}"
    padding: "8px 12px"
  badge:
    rounded: "{rounded.full}"
    padding: "4px 8px"
---

# Design System: CA-Hardt

## 1. Overview

**Creative North Star: "A Ferramenta que Some no Trabalho"**

Este é um sistema operacional de empresa, usado o dia inteiro por três públicos com pressa: vendedor no celular na rua, motorista na entrega e escritório no iPad. O bom design aqui não chama atenção para si — ele desaparece na tarefa. Cada tela deve ser autoexplicativa para quem **não é técnico**: rótulos em português claro, um caminho óbvio para a ação principal, nada de jargão. A base é o azul Conta Azul (`#005fcc`) sobre um cinza-claro tranquilo (`#f3f4f6`), com cartões brancos que organizam a informação em blocos respiráveis.

O sistema é sóbrio e confiável — transmite que a empresa é organizada — mas nunca frio nem intimidante. Cor é usada com disciplina: o azul carrega ação e navegação; as cores de status (verde/azul/vermelho/âmbar) comunicam estado de forma consistente em todo o app. Fora isso, a tela respira em neutros.

**Este sistema rejeita explicitamente:** cara de **planilha/Excel** (telas cinzas, números apertados sem hierarquia); cara de **sistema antigo/travado** (menus infinitos, feio, lento); telas **poluídas/confusas** (informação e botões demais competindo por atenção); e qualquer coisa **infantil** (cores berrantes, emojis, animação exagerada). É ferramenta de trabalho séria, não brinquedo.

**Key Characteristics:**
- Leigo em primeiro lugar: autoexplicativo, sem jargão.
- Legibilidade acima de elegância: texto firme e escuro, nunca fino e cinza-claro.
- Uma tela, um foco: a ação principal se destaca; o resto recua.
- Mobile é o caso principal: alto contraste, alvos grandes, tabela vira card.
- Consistência antes de surpresa: mesmos padrões em todas as telas.

## 2. Colors

Uma paleta neutra e calma dominada por cinza-claro e branco, com um único azul de marca para ação e um vocabulário fixo de cores de status.

### Primary
- **Azul Conta Azul** (`#005fcc`): cor de marca. Botões primários, links de navegação ativa, ícones de destaque, foco de inputs (`focus:ring-primary`). É a única cor "de ação" — usá-la só onde há ação ou seleção, nunca como decoração.
- **Azul Pressão** (`#1d4ed8`, `hover:bg-blue-700`): estado hover do botão primário.
- **Azul Link** (`#3b82f6`): links de texto em corpo (`a`), levemente mais claro que o azul de marca.

### Neutral
- **Tinta** (`#1f2937`, gray-900/800): cor padrão de todo texto principal. É o piso de contraste — títulos, valores, dados de tabela.
- **Tinta Suave** (`#4b5563`, gray-600): texto secundário e cabeçalhos de seção. **Nunca descer abaixo disto para texto de leitura.**
- **Fundo** (`#f3f4f6`, gray-100): fundo geral de toda página.
- **Superfície** (`#ffffff`): cartões, tabelas, modais, barras.
- **Borda** (`#e5e7eb`, gray-200): contorno de cartões e divisórias de tabela.
- **Divisória** (`#f3f4f6`, gray-100): linha sutil dentro de cabeçalhos de cartão.

### Status (Tertiary — vocabulário fixo de badges)
Sempre pílula `rounded-full`, `px-2 py-1 text-xs font-semibold`. Par fundo-claro + tinta-escura para contraste AA:
- **Verde** (`#dcfce7` / `#166534`): Ativo, Pago, Aprovado.
- **Azul** (`#dbeafe` / `#1e40af`): Aberto, Em Andamento.
- **Cinza** (`#f3f4f6` / `#374151`): Pendente, Sem Estoque.
- **Amarelo** (`#fef9c3` / `#854d0e`): Parcial, Baixo Estoque.
- **Âmbar** (`#fef3c7` / `#b45309`): Atenção, Faturamento.
- **Vermelho** (`#fee2e2` / `#b91c1c`): Cancelado, Vencido, Inativo.
- **Roxo** (`#f3e8ff` / `#7e22ce`): Especial.

### Named Rules
**A Regra da Voz Única.** O azul de marca (`#005fcc`) é a única cor de ação. Aparece em botões primários, seleção ativa e ícones de destaque — nunca como enfeite de fundo ou borda decorativa. Sua raridade é o que faz o usuário saber onde clicar.

**A Regra do Status Consistente.** Uma cor de status significa a mesma coisa em todo o sistema. Verde é sempre "concluído/positivo", vermelho sempre "problema/vencido". Nunca reaproveitar uma cor de status para decorar.

## 3. Typography

**Fonte única:** SF Pro Text (com fallback `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`).

**Character:** uma sans-serif do sistema Apple, limpa e neutra, que carrega tudo — títulos, botões, rótulos, corpo e dados de tabela. Sem fonte de display, sem par de fontes: a hierarquia vem de **peso e tamanho**, não de troca de família. Isso mantém a tela sóbria e a carga leve.

### Hierarchy
- **Título de página** (peso 700, `text-2xl` / mobile `text-lg`, line-height 1.2): topo de cada tela.
- **Cabeçalho de seção** (peso 700, `text-xs` = 12px, `tracking-widest`, MAIÚSCULO, cor gray-600): rótulo do topo de cada cartão.
- **Corpo** (peso 400, `text-sm` = 14px, line-height 1.5): texto de leitura padrão. Cor tinta (gray-800/900).
- **Rótulo de campo** (peso 500, `text-sm`, cor gray-700): labels de formulário.
- **Cabeçalho de tabela** (peso 600, `text-xs`, `uppercase tracking-wide`, cor gray-500): th das tabelas.

### Named Rules
**A Regra da Leitura Firme.** Texto de leitura nunca usa `font-light`/`font-thin` nem cinza mais claro que gray-600. Os usuários relataram que "letras pequenas ficam finas demais" — por isso peso ≥ 400 e cor escura são obrigatórios em qualquer texto que se lê (valores, nomes, descrições). Elegância cinza-clarinha é proibida em conteúdo.

**A Regra do Piso de 12px.** Texto que o usuário precisa ler não desce abaixo de 12px (`text-xs`). Tamanhos menores (`text-[10px]`, `text-[11px]`) só são aceitáveis para metadados densos e não-críticos — e mesmo assim com peso e cor fortes. No mobile, inputs têm no mínimo 16px para não disparar zoom do iOS.

## 4. Elevation

Sistema quase-plano com elevação tonal. A profundidade vem de **cor + borda**, não de sombra pesada: cartão branco sobre fundo cinza-claro, com borda `gray-200` e uma sombra bem sutil. Sombras fortes ficam reservadas para elementos que flutuam sobre o conteúdo (modais, dropdowns, barras fixas).

### Shadow Vocabulary
- **Descanso** (`shadow-sm`): padrão de todo cartão e barra. Praticamente imperceptível — só separa o branco do fundo. É o valor usado em 90% da UI.
- **Flutuante** (`shadow-lg` / `shadow-xl`): modais, painéis grandes, menus suspensos e barras de ação fixas. Sinaliza "isto está acima da tela".

### Named Rules
**A Regra do Plano por Padrão.** Superfícies descansam planas com `shadow-sm`. Sombra forte só aparece quando o elemento realmente flutua sobre o conteúdo (modal, dropdown, barra fixa). Nunca animar `box-shadow` — força repaint e cria artefatos de scroll no Android; animar `opacity`/`transform`.

## 5. Components

### Buttons
- **Shape:** cantos suaves (`rounded-md` = 6px, ou `rounded` = 4px).
- **Primary:** `bg-primary text-white shadow-sm font-semibold text-sm`, padding `px-4 py-2`. Hover → `bg-blue-700`.
- **Secondary:** `bg-white border border-gray-300 text-gray-700 font-medium text-sm`, hover `bg-gray-50`.
- **Danger:** `bg-red-600 text-white font-semibold text-sm`, hover `bg-red-700`.
- **Ícone sutil:** `p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100`.
- **Toque:** no mobile, mínimo 44px de altura (`min-h-[44px]` ou `py-3`).

### Badges (status)
- **Style:** pílula `rounded-full`, `px-2 py-1 text-xs font-semibold`, par fundo-claro + tinta-escura da paleta de status.
- **State:** a cor mapeia o estado (ver seção Colors → Status). Nunca inventar cor nova de status.

### Cards / Containers
- **Corner:** `rounded-xl` (12px) quando tem cabeçalho; `rounded-lg` (8px) quando simples.
- **Background:** branco sobre fundo `gray-100`.
- **Border:** `border border-gray-200`.
- **Shadow:** `shadow-sm` (ver Elevation).
- **Padding interno:** `p-5` (20px). Cabeçalho: `px-5 py-3.5` com divisória `border-b border-gray-100`.
- **Regra:** nunca aninhar cartão dentro de cartão.

### Inputs / Fields
- **Style:** `border border-gray-300 rounded px-3 py-2 text-sm`, fundo branco.
- **Focus:** `focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none`.
- **Mobile:** font-size 16px forçado para evitar zoom do iOS.

### Navigation (topbar de módulo)
- Ícone de módulo em cápsula colorida: `bg-[cor]-100 p-2 rounded-lg` + ícone `h-5 w-5 text-[cor]-600`. Cada módulo tem sua cor: Pedidos azul, Clientes verde, Produtos roxo, Financeiro âmbar, Expedição sky, Dashboard vermelho, Rota laranja, PCP teal.
- Título ao lado: `text-base md:text-2xl font-bold`. No mobile o ícone e o botão de ação encolhem (`p-1.5`, `text-xs`).

### Tabelas → Cards no mobile
Componente-assinatura de responsividade: no desktop, tabela `min-w-full divide-y divide-gray-200` com `thead bg-gray-50`. No mobile (`< md`), cada linha vira um cartão (`block md:hidden` para os cards, `hidden md:block` para a tabela) — nunca scroll horizontal.

### Barras de progresso (metas) — cor por %
0–50% `bg-red-500` · 50–80% `bg-blue-500` · 80–99% `bg-yellow-400` · 100%+ `bg-green-500`.

## 6. Do's and Don'ts

### Do:
- **Do** usar os tokens definidos: cartões `rounded-xl border border-gray-200 shadow-sm`, botões e badges com as classes canônicas. Reusar, não reinventar.
- **Do** manter texto de leitura em peso ≥ 400 e cor ≥ gray-600 (corpo em gray-800/900). Legibilidade acima de elegância.
- **Do** destacar uma ação principal por tela; empurrar o secundário para trás.
- **Do** projetar mobile-first: `p-3 md:p-6`, grids `grid-cols-1 md:grid-cols-2`, KPIs `grid-cols-2 md:grid-cols-4`, alvos de toque ≥ 44px.
- **Do** transformar tabela em card no mobile; testar em 375px sem scroll horizontal.
- **Do** manter o azul `#005fcc` só para ação/seleção, e as cores de status com significado fixo.

### Don't:
- **Don't** parecer **planilha/Excel**: telas cinzas com números apertados e tudo no mesmo peso visual. Dar hierarquia e respiro.
- **Don't** parecer **sistema antigo/travado**: menus infinitos, densidade sem foco, visual dos anos 2000.
- **Don't** poluir a tela: informação e botões demais competindo. Uma tela, um foco.
- **Don't** parecer infantil: nada de cores berrantes, emojis decorativos ou animação exagerada.
- **Don't** usar `font-light`/`font-thin` nem cinza mais claro que gray-500 em texto de leitura — foi exatamente a queixa dos usuários ("letras finas demais").
- **Don't** descer abaixo de 12px em texto que precisa ser lido; `text-[10px]`/`text-[11px]` só para metadados densos e não-críticos.
- **Don't** animar `box-shadow`, `border` ou `background-color` (repaint no Android) — animar só `opacity`/`transform`.
- **Don't** aninhar cartões, nem usar `border-left`/`border-right` colorida grossa como faixa de destaque.
