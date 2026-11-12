# Pedido ao bot da Ana — resgate de clientes e Gerente de Carteira

De: CA-Hardt · Para: projeto `hardt-wpp-bot` · Data: 11/11/2026
Decisões do Clarkson tomadas em 11/11/2026. Plano completo: `docs/plano-fila-resgate-ana.md` (repo CA-Hardt).

**Situação:** os endpoints abaixo AINDA NÃO EXISTEM. O CA-Hardt está construindo primeiro a tela Carteira (uso do dono). A API v1.8 vem depois e será avisada em `meta.avisos` e na `ia-consulta-api.md`. Este documento serve para o bot se preparar. Nomes de campo podem mudar até a publicação: vale o que estiver na doc da API no dia.

## 1. O que muda, em uma frase

Um serviço no CA-Hardt (o "Gerente de Carteira") decide todo dia quais clientes parados a Ana deve procurar. O dono aprova no app. A Ana busca só os aprovados, conversa e devolve o que o cliente disse. A Ana nunca escolhe sozinha quem procurar.

## 2. O que o CA-Hardt vai entregar (API v1.8, tudo aditivo)

| Entrega | Para quê |
|---|---|
| Bloco `recompra` nos dois `reconhecer-telefone` | situação do cliente pela régua do app (no ritmo, atraso, parado), ritmo real em dias, produtos que ele levava e parou, grupos que clientes do mesmo tipo levam e ele não |
| `GET /resgate/fila` (só bot/painel, NUNCA tool da IA) | resgates aprovados pelo dono para hoje. Por cliente: telefone e whatsapps, nome, cidade, vendedor, dia de venda, motivo, dias sem comprar, ritmo, "o de sempre", produtos que sumiram, grupos sugeridos, `resgateId` |
| `POST /resgate/desfecho` (só bot/painel) | devolver o resultado: `RESPONDEU`, `NAO_RESPONDEU`, `OPT_OUT`; motivo em lista fechada; se pediu de novo; `idempotencyKey` |

Nunca virão na API: valor devido, título, preço negociado, ticket em reais. Cliente com título vencido não entra na fila.

## 3. O que o bot precisa fazer

1. **Chave própria.** `ana_resgate_ativo`, nasce `'0'`. Desliga só o resgate, sem parar os pedidos.
2. **Reescrever a regra "Nada de proativo"** (`CLAUDE.md` ~l.682, `PRD.md` l.28 e notas ~l.729 e ~l.985). Texto novo: proativo só no trilho do piloto, motivo `resgate`, só cliente com 3 ou mais pedidos, só o que veio aprovado na fila do CA-Hardt, teto de 3 por dia. Prospecção e lista fria continuam proibidas. Registrar a decisão do dono de 11/11/2026.
3. **Não pedir permissão pelo WhatsApp.** A aprovação é no app do CA-Hardt. Se o cliente não está na fila, a Ana não chama.
4. **Buscar a fila** em horário comercial, no máximo a cada 30 minutos (uma chamada, a chave é a mesma do atendimento, 60 req/min). Falha da API = não manda nada.
5. **Teto de 3 envios de resgate por dia**, somando tudo. Respeitar feriado, pausa da empresa, bot pausado e humano na conversa.
6. **Novo motivo `resgate` em `ana_pedidos_contatos`**, chave `(conversa, resgateId)`, visível na tela do piloto com tipo próprio.
7. **Primeira mensagem:** uma só, sem link, sem carrossel, sem preço, sem cobrança, sem dizer que ele sumiu ou atrasou. Pergunta como está e oferece o de sempre, citando o dia de venda. Mesmas travas da abertura do piloto. Exemplo aprovado: "Oi Elisiane, aqui é a Ana da Hardt. Segunda tem entrega em Garuva. Como está o movimento por aí? Quer que eu separe a mini coxinha e o travesseiro de pizza de sempre?"
8. **Depois que o cliente responder:** mostrar o que ele comprava e mais produtos. Pode mandar carrossel (hoje é ação humana, §8c do PRD; o dono liberou para a Ana neste fluxo), a lista personalizada com o preço dele (`POST /catalogo/gerar`) ou indicar o site, explicando que entrando com CPF ou CNPJ ele vê a tabela dele. Sem desconto e sem negociar preço.
9. **Resgate aprovado = cliente passa a ser atendido pela Ana** (`aderirAoPiloto`). O dono pode tirar. O CA-Hardt avisa o vendedor.
10. **Se o cliente disser que não vai pedir, perguntar o motivo** e classificar: `ESTOQUE_CHEIO`, `MOVIMENTO_FRACO`, `PRECO`, `CONCORRENTE`, `QUALIDADE`, `ENTREGA`, `FECHOU`, `OUTRO` (com texto curto). Enviar no desfecho. Preço, concorrente, qualidade e entrega: a Ana agradece e não argumenta; quem decide é o dono ou o vendedor.
11. **Movimento fraco:** a Ana chama de novo na semana seguinte, no dia de venda dele, para saber como está.
12. **Sem resposta em 48 horas:** enviar `NAO_RESPONDEU`. O CA-Hardt avisa o vendedor. Nova tentativa só se o cliente voltar na fila no próximo dia de venda (não volta se o vendedor assumiu). Teto de tentativas seguidas: pendente do dono, recomendação 2.
13. **"Não quero receber":** opt-out local na hora e desfecho `OPT_OUT`.
14. **Oferta dentro da conversa de pedido** (motor do PRD "Ana oferece e negocia"): usar os produtos que sumiram e os grupos do tipo do cliente vindos em `recompra`. Uma oferta por contato, depois do carrinho.
15. **Retry com a mesma `idempotencyKey`.** Nunca SQL direto no banco do CA-Hardt.
16. **A Ana continua sem falar de cobrança.**

## 4. O que não muda

- Preço e total vêm do servidor. Nenhum número de desconto na boca da Ana.
- A integração de envio CA-Hardt → bot continua só transacional.
- RF-J (prospecção de quem nunca comprou) continua arquivada.

## 5. Ordem

1. CA-Hardt publica a tela Carteira (em construção).
2. CA-Hardt publica a API v1.8 (`recompra`, fila, desfecho) e avisa.
3. Bot implementa os itens da seção 3, com `ana_resgate_ativo='0'`.
4. Piloto: 5 clientes de um vendedor, 2 semanas, o dono aprovando cada um.

O bot já pode adiantar sem depender da API: itens 1, 2, 6 e o carrossel como ferramenta da Ana (item 8).

## 6. Pendências do dono

- Teto de tentativas da Ana sem resposta (recomendação: 2 seguidas).
- Lista personalizada primeiro ou site com CNPJ primeiro (recomendação: lista).
