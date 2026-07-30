# Saúde dos Pontos GPS

**Onde fica:** Clientes → botão "📍 Saúde GPS" (rota `/clientes/saude-gps`). Visível para quem pode cadastrar clientes.

**Para que serve:** é a "faxina" e o painel de controle dos pontos GPS dos clientes. O sistema cruza o ponto cadastrado de cada cliente com os **sinais reais de GPS** (entregas concluídas pelo motorista, atendimentos do vendedor na rua e confirmações "estou na porta") e aponta o que está errado.

## Como o sistema tem certeza de um ponto (selo de confiança)

- **📍✅ Confirmado:** 3 ou mais sinais de GPS, **de dias diferentes**, agrupados num raio de ~100 m, com o ponto cadastrado dentro desse grupo. Não usa Google nem CEP — a certeza vem da repetição das visitas reais.
- **📍⚠️ Suspeito:** existe um grupo de sinais, mas o ponto cadastrado está longe dele (>300 m) ou nem existe. O sistema **sugere o centro do grupo** como ponto correto.
- **Filtros anti-engano:** sinal dentro do raio da empresa nunca conta; "checkout em lote" (motorista concluindo várias entregas paradas no mesmo lugar, em minutos) é descartado; sinais do mesmo dia contam como 1.

## O que a tela mostra

1. **Placar (KPIs):** Repetidos · Na empresa · Suspeitos · Sem GPS (+ chips de confirmados, balcão e total).
2. **Interruptor "Exigir ponto GPS para ENVIAR pedido":** quando LIGADO, pedido de cliente sem ponto (e que não é balcão) não pode ser ENVIADO — só salvo como aberto. Recomendação: ligar só depois de zerar os problemas. Só quem tem a permissão **Autorizar Ponto GPS (Logística)** liga/desliga.
3. **Pendentes de aprovação (legado):** desde 07/2026 a edição manual do ponto **vale na hora** — nenhuma pendência nova é criada. Esta seção só lista pendências antigas (de antes da mudança), que a logística ainda pode **Aprovar** ou **Rejeitar**. Zerou, some do dia a dia. As correções em massa continuam pelas **sugestões** (abaixo).
4. **Suspeitos:** cada um com a distância e o botão **"Aceitar sugestão"** (corrige em 1 clique para o centro das entregas reais) ou "Ver no mapa".
5. **Repetidos/colados:** pares de clientes com ponto idêntico ou a menos de 30 m um do outro.
6. **Na empresa:** pontos gravados dentro do raio da fábrica (erro clássico do botão antigo).
7. **Sem GPS:** clientes ativos sem ponto e que não são balcão.
8. **Clientes balcão:** dispensados de GPS (compram e retiram na empresa).
9. **Histórico de alterações:** toda mudança de ponto com quem/quando/distância movida, e botão **Desfazer** (volta o ponto anterior; exige a permissão de logística).

## Regras ao salvar um ponto (valem em qualquer tela)

- Ponto **idêntico** ao de outro cliente ou **dentro da empresa**: bloqueado sempre.
- Ponto a **menos de 30 m** de outro cliente: só salva com autorização por senha de quem tem a permissão **Autorizar Ponto GPS (Logística)** (casos legítimos: galeria, vizinhos).
- Primeiro ponto de um cliente e ajustes de até 100 m: aplicam na hora.
- Mover ponto **📍✅ confirmado** para mais de 300 m: aplica na hora e **zera o selo** — as próximas entregas reais voltam a confirmar o lugar (desde 07/2026 não gera mais pendência de aprovação).
- Toda mudança fica no histórico (auditada), inclusive de onde a pessoa estava ao mudar.

## Cliente Balcão

Cliente que compra e **retira na empresa** — não precisa de ponto GPS. Marca-se no cadastro do cliente (checkbox "Cliente Balcão", exige a permissão **Liberar Cliente Balcão**). No cadastro novo a regra é: **ou define o ponto no mapa, ou marca balcão**. Marcar/desmarcar fica no histórico.

## Perguntas comuns

- **"Por que o pedido não envia?"** — O bloqueio de GPS está ligado e o cliente não tem ponto nem é balcão. Defina o ponto pelo botão "Definir ponto agora" do próprio aviso, ou marque balcão (com permissão).
- **"O motorista disse que o lugar certo é outro"** — Quando a entrega conclui longe do ponto, o app pergunta ao motorista se ele está na porta; se sim, ele manda foto da fachada e isso vira sinal de correção (aparece aqui como suspeito/sugestão, e avisa o vendedor da carteira na tela inicial dele).
- **"O que significam os emojis no Caixa?"** — 📍✅ entrega concluída no ponto do cliente; 📍❗ concluída longe do ponto; 📍➖ sem GPS na hora; 📍❓ cliente sem ponto cadastrado. Tocar no emoji mostra a distância.
