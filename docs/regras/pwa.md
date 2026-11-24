# PWA, atualização e login — CA-Hardt

> **Fonte ÚNICA deste assunto** (saiu do `CLAUDE.md` em 24/11/2026 — pedido do dono: regras mais
> simples e rápidas para os agentes). Regra nova entra AQUI, **alterando a regra que já trata do
> tema** — nunca empilhar outra por cima, nem copiar para ficha, habilidade ou memória.

---

## PWA / Atualização

O app é PWA. Sempre que fizer deploy de mudanças visíveis, incluir o ícone de refresh na UI e o hook `useVersionCheck` para que o usuário seja notificado automaticamente.

**Cache do `index.html` (NÃO cachear):** o frontend é servido por nginx (`frontend/Dockerfile`). O `index.html` deve sair com `Cache-Control: no-cache` (sempre revalida via ETag); só `/assets/` (arquivos com hash no nome) podem ter cache longo/imutável. Se o `index.html` for cacheado, o app instalado no iOS (atalho/standalone) fica preso numa versão antiga e **nunca pega o JS novo** após o deploy (sintoma: comportamento antigo persiste mesmo após publicar). Se um usuário ficar preso numa versão velha, orientar a **remover e re-adicionar o atalho** na tela inicial (uma vez) para limpar o cache heurístico. **O `sw.js` também nunca pode ter cache longo** (fica em `location /` do nginx = `no-cache`) — senão o service worker velho nunca é substituído.

### Service worker (`frontend/public/sw.js`) — não remover

No iPhone o app roda como atalho standalone: **sem barra de endereço e sem botão de recarregar**. Sem service worker, qualquer falha de rede na abertura mostrava o erro do Safari ("não foi possível abrir a página") e o usuário ficava preso — tinha que fechar e reabrir várias vezes. Estratégias do SW (registrado em `main.jsx`, só em `import.meta.env.PROD`):
- **Navegação:** rede primeiro (prazo de 6s), cache só como rede de segurança → continua sempre pegando a versão nova após deploy.
- **`/assets/`:** cache primeiro (nome com hash = imutável).
- **Ícones/manifest/fontes:** cache primeiro, revalidando em segundo plano.
- **`/api`: NUNCA interceptado** — dado de pedido/financeiro sempre vem fresco da rede (casa com o `Cache-Control: no-store` do backend).

Ao mudar as estratégias, **subir a constante `VERSAO`** no topo do `sw.js` (é ela que limpa os caches antigos no `activate`).

### Tela nova no `App.jsx` — usar `lazyComRetry`, nunca `React.lazy`

As telas são carregadas sob demanda, em arquivos com hash no nome. Quando sai um deploy o servidor troca esses arquivos e **os antigos deixam de existir** — quem estava com a aba aberta (desktop) ou o app aberto no celular continua com o `index.html` velho e, ao trocar de tela, estoura `TypeError: Failed to fetch dynamically imported module` (tela vermelha "Algo deu errado").

Por isso toda rota lazy usa `frontend/src/utils/lazyComRetry.js`, que tenta de novo e, persistindo, limpa o cache do service worker e recarrega a página **uma vez** (trava em `sessionStorage` evita laço):

```jsx
import { lazyComRetry } from './utils/lazyComRetry';
const MinhaTela = lazyComRetry(() => import('./pages/Area/MinhaTela'));  // NÃO usar lazy() do React
```

`main.jsx` faz a mesma recuperação no `ErrorBoundary`, no `window.onerror` e no `unhandledrejection`, como rede de segurança para imports dinâmicos fora das rotas.

**Nunca deslogar o usuário por erro de rede:** em `AuthContext.jsx`, o `/auth/me` da abertura só apaga o token em **401/403** (o servidor dizendo que o token não vale). Qualquer outra falha (rede, 500, backend reiniciando no deploy) mantém o token, tenta 3 vezes e cai na tela `TelaSemConexao` com botão "Tentar novamente". Antes, um blip de rede apagava o token e jogava o vendedor na tela de login — não reintroduzir um `logout()` genérico no `catch`.
