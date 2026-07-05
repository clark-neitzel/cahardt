# Product

## Register

product

## Users

Sistema interno de gestão da **Hardt Salgados**, usado por três perfis com contextos bem diferentes:

- **Vendedores em campo** — no celular, muitas vezes na rua, entre visitas. Registram pedidos, consultam clientes e catálogo. Contexto de pressa, tela pequena, uma mão.
- **Motoristas / expedição** — no celular ou tablet, conferindo rotas e entregas.
- **Escritório** — no iPad e desktop, cuidam de financeiro (contas a pagar/receber, DRE, fluxo de caixa), estoque, compras, PCP e aprovação de pedidos. Muitos são **leigos em sistemas** — não são técnicos, e o app precisa ser autoexplicativo.

O trabalho de todos eles é operacional e diário: o sistema é a ferramenta que faz a empresa rodar, não algo que se usa por lazer.

## Product Purpose

App PWA (React + Vite + Tailwind, backend Node/Express/Prisma) que centraliza a operação da Hardt: pedidos (normal, especial, bonificação, Kit Festa, congelados), clientes, produtos, estoque, compras (NF-e), financeiro completo (contas a pagar/receber, DRE, fluxo de caixa), PCP e expedição. Roda 24h em produção — qualquer tela quebrada trava a operação real da empresa. Sucesso = as três equipes conseguem fazer seu trabalho rápido, sem erro e sem precisar de treinamento.

## Brand Personality

**Simples, acolhedor, confiável.** A prioridade número um é não intimidar o usuário leigo: linguagem clara em português, botões e alvos de toque confortáveis, hierarquia óbvia (sempre dá pra saber onde clicar). É uma ferramenta de trabalho séria e organizada — transmite cuidado e competência da empresa — mas nunca fria, técnica ou cheia de jargão. Amigável sem ser brincalhão.

## Anti-references

O sistema **não pode parecer**:

- **Planilha / Excel** — telas cinzas, números apertados sem hierarquia, tudo com o mesmo peso visual.
- **Sistema antigo / travado** — cara de software dos anos 2000, menus infinitos, lento e feio.
- **Poluído / confuso** — informação e botões demais na mesma tela sem foco; usuário sem saber onde clicar.
- **Infantil** — cores berrantes, emojis, animações exageradas. Nada que faça parecer brincadeira em vez de ferramenta de trabalho.

## Design Principles

1. **Leigo em primeiro lugar.** Toda tela deve ser autoexplicativa para quem nunca viu um sistema. Rótulos claros, sem jargão, um caminho óbvio para a ação principal de cada tela.
2. **Legibilidade acima de elegância.** Texto pequeno e fino é um problema real relatado pelos usuários. Preferir peso de fonte mais firme e cor de texto mais escura a "cinza clarinho por estética" — especialmente em corpo de texto, valores e tabelas. Nada de texto essencial em fonte fina de baixo contraste.
3. **Uma tela, um foco.** Combater o "poluído": destacar a ação e a informação principal de cada tela; secundário fica secundário. Menos coisa competindo por atenção.
4. **Mobile é o caso principal, não o secundário.** Vendedor na rua com uma mão e sol na tela é o teste real: contraste alto, alvos de toque grandes, sem scroll horizontal, tabela vira card no celular.
5. **Confiável e consistente.** Reusar o design system existente (cards, badges de status, botões, cores) em vez de inventar padrões novos a cada tela. Consistência transmite organização.

## Accessibility & Inclusion

- Meta prática: **WCAG AA** de contraste — corpo de texto ≥ 4.5:1, texto grande ≥ 3:1.
- **Problema conhecido e prioritário:** os usuários relatam que letras pequenas ficam **finas demais e difíceis de ler**. Ao tocar em qualquer tela, revisar peso de fonte (evitar `font-light`/thin em texto de leitura) e cor (evitar cinza claro em corpo de texto). Melhorar legibilidade é ganho direto de acessibilidade aqui.
- Contexto de uso na rua/sol reforça a necessidade de **alto contraste** e **alvos de toque ≥ 44px** no mobile.
- Motion: respeitar `prefers-reduced-motion`; nada de animação essencial para entender a tela.
