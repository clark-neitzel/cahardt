---
name: verify
description: Receita para verificar mudanças do CA-Hardt clicando na tela de verdade (backend local + Vite + Chrome via puppeteer-core)
---

# Verificar clicando (CA-Hardt)

Regra do dono (07/2026): funcionalidade nova de tela só está pronta depois de **clicar no fluxo de verdade** — curl e build não pegam seletor vazio nem campo de resposta errado.

## Subir o app local

```bash
# Backend (porta 3000; JWT_SECRET não está no .env local)
cd backend && JWT_SECRET=teste-local-claude node index.js &
# Frontend dev (porta 5173; api.js em DEV aponta p/ localhost:3000)
cd frontend && npm run dev -- --port 5173 --strictPort &
```

Banco local `hardt_local` (fora de sync com produção; seguro para testes). Usuária de teste: login **Josi** — defina a senha local antes:
`prisma.vendedor.update({ where: { id: '8818c4b9-d832-4bc0-8b64-ebec1ad43be5' }, data: { senha: await bcrypt.hash('teste-local-123', 10) } })`.
Token direto (pular login): `jwt.sign({ id, nome }, 'teste-local-claude')`.

## Navegador

Sem playwright no repo. Usar **puppeteer-core** com o Chrome do Mac (instalar no scratchpad, nunca no repo):

```bash
mkdir -p "$SCRATCH/puppet" && cd "$SCRATCH/puppet" && npm init -y && npm i puppeteer-core
```

```js
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--window-size=1440,1000']
});
```

- Login: `input[name="login"]` / `input[name="senha"]` + Enter em `/login`.
- Filtros do Caixa sem clicar no SelectBusca: `sessionStorage.setItem('@CAHardt:CaixaFiltros', JSON.stringify({ data, vendedorId }))` antes de ir a `/caixa`.
- `SelectBusca` NÃO usa `[role=option]`: abrir clicando no elemento com o placeholder, digitar no teclado (a busca foca sozinha) e clicar no nó de texto da opção.
- Tirar screenshot em cada passo e LER as imagens para confirmar visualmente.

## Gotchas conhecidos

- `GET /api/produtos` devolve `{ data, meta }` **paginado (limit=10)** — passar `limit` alto e ler `.data`.
- Dia de teste com devoluções no banco local: **12/05/2026, vendedor Jociel** (`2eebf9f2-6dda-49be-aa9f-8b853476c4cd`) — pedidos 855 (parcial) e 881 (devolvido total).
- Sobras da conferência só persistem ao clicar "Confirmar conferência" — teste de clique sem confirmar não suja o banco.
- Matar servidores ao final: `lsof -ti:3000 -sTCP:LISTEN | xargs kill`; idem 5173.
