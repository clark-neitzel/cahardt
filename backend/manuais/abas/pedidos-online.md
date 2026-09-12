# Pedidos Online

**Rota:** `/pedidos-online` (aba escolhida via `?aba=site` ou `?aba=kit-festa`, lembrada por usuário)
**Permissão:** `admin` ou `kitFesta` (mesma dos dois canais).

Casca de navegação criada em 09/2026 (plano de navegação/design): antes o Site (Congelados) e o Kit
Festa eram duas entradas separadas no menu, embora sejam a mesma tarefa — uma fila de pedidos chegando
de fora que alguém precisa vincular a um cliente e virar pedido de verdade. Agora existe **uma única
entrada de menu**, "Pedidos Online", com uma aba em pílula para cada canal.

**Isto é só casca visual — a lógica de negócio de cada canal não mudou em nada.** Catálogo, regras de
entrega, vínculo de cliente, conversão em pedido normal/especial/bonificação: tudo continua exatamente
como descrito nos manuais de cada canal.

- **Aba "Site (Congelados)"** → ver [site-congelados.md](site-congelados.md) para o funcionamento completo.
- **Aba "Kit Festa"** → ver [kit-festa.md](kit-festa.md) para o funcionamento completo.

## Compatibilidade com links/favoritos antigos

As rotas antigas continuam no ar como **redirecionamento automático**:
- `/site-admin` → `/pedidos-online?aba=site`
- `/kit-festa-admin` → `/pedidos-online?aba=kit-festa`

Um favorito do menu salvo apontando para `/site-admin` ou `/kit-festa-admin` continua levando à aba
certa dentro de Pedidos Online.

## Como abrir cada aba

1. No menu, clique em **Pedidos Online**.
2. No topo da tela, escolha a pílula **Site (Congelados)** ou **Kit Festa**.
3. A última aba escolhida fica lembrada (por usuário) na próxima vez que a tela for aberta, a não ser
   que o link usado já traga `?aba=...` explícito (caso dos redirects acima).
