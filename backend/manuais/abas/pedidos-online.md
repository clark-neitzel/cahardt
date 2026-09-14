# Pedidos Online

**Rota:** `/pedidos-online` (aba escolhida via `?aba=site` ou `?aba=kit-festa`, lembrada por usuário)
**Permissão:** `admin` ou `kitFesta` (mesma dos dois canais).

Casca de navegação criada em 09/2026 (plano de navegação/design): antes o Site (Congelados) e o Kit
Festa eram duas entradas separadas no menu, embora sejam a mesma tarefa — uma fila de pedidos chegando
de fora que alguém precisa vincular a um cliente e virar pedido de verdade. Agora existe **uma única
entrada de menu**, "Pedidos Online", com uma aba para cada canal.

**Visual (14/09/2026):** a tela segue o mesmo desenho da aba de Pedidos — um único cabeçalho no topo
("Pedidos Online") com os botões **Abrir site** e **Copiar link do cliente** do canal escolhido à
direita; abaixo, as abas em "pasta" **Site (Congelados)** | **Kit Festa**; e logo abaixo as sub-abas do
canal (Pedidos, Produtos, Configurações no Site; Pedidos, Agenda, Produtos, Bairros, Cupons, Indicações,
Configurações no Kit Festa) como chips arredondados. Não há mais o segundo cabeçalho do canal dentro da tela.

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
2. Logo abaixo do título, escolha a aba **Site (Congelados)** ou **Kit Festa**; os botões "Abrir site" e
   "Copiar link do cliente" no cabeçalho passam a valer para o canal escolhido.
3. A última aba escolhida fica lembrada (por usuário) na próxima vez que a tela for aberta, a não ser
   que o link usado já traga `?aba=...` explícito (caso dos redirects acima).
