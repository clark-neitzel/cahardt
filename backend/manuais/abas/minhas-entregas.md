---
aba: Minhas Entregas
rota: /minhas-entregas
permissao: Pode_Executar_Entregas
---

# Minhas Entregas

## O que é

Tela exclusiva do motorista, usada no celular. Mostra o roteiro de entrega do dia e permite dar baixa em cada pedido entregue. É aqui que o motorista registra o que aconteceu em cada parada: entregou tudo, entregou parcialmente ou devolveu. Também registra o pagamento recebido na hora.

> Esta tela é voltada para celular — layout compacto, sem filtros avançados. Para ver e gerenciar os embarques, o responsável logístico usa a aba **Embarque** (`/admin/embarques`).

---

## O que dá pra fazer aqui

- Ver a lista de entregas pendentes do dia (pedidos faturados incluídos em um embarque para este motorista)
- Ver as entregas já concluídas do dia
- Marcar prioridade de entrega com estrela (ordena a sequência de visitas)
- Abrir o endereço do cliente no Google Maps (usa GPS cadastrado ou o endereço completo)
- Dar baixa na entrega via modal de checkout (informar status físico e pagamento recebido)
- **Conferir a folha impressa** (botão **Folha** no header): escaneia o QR do romaneio e o app diz se aquela impressão ainda é a versão atual da carga
- **Cobrar títulos em rota** (sub-aba **Cobranças**, exige `Pode_Cobrar_Titulo_Rota`): cobrar na rua parcelas em aberto que o escritório pendurou na carga, ou buscar um cliente e cobrar um título na hora
  > Na prática a equipe cobra pela tela **Rota → Entregas** (seção "Cobranças a fazer"), que é onde o roteiro do dia é trabalhado. Aqui é a mesma função, para quem usa esta tela.

---

## Como fazer (passo a passo real)

### Ver entregas do dia
1. Acesse `/minhas-entregas`
2. O header mostra "Meu Roteiro" com a contagem de entregas restantes
3. A sub-aba **A Entregar** carrega automaticamente com as entregas pendentes

### Marcar prioridade de entrega
1. Na sub-aba "A Entregar", localize a entrega
2. Clique em **Prioridade** (ícone de estrela) — o backend calcula o número sequencial automaticamente
3. O card fica com borda âmbar e exibe o número de prioridade em destaque
4. Para remover: clique em **Tirar**
5. O total de entregas com prioridade aparece no header (badge âmbar)

### Abrir endereço no Google Maps
1. No card da entrega pendente, clique em **Maps** (botão azul)
2. Se o cliente tem GPS cadastrado (lat,lng), o Maps abre diretamente na coordenada
3. Se não tem GPS, o Maps abre com o endereço completo como busca de texto

### Dar baixa em uma entrega (Check-in)
1. Clique em **Fazer Check-in (Entregar)** no card da entrega pendente
2. O modal de checkout abre em tela cheia com 4 etapas:

**Etapa 1 — Status Físico**
Escolha o que aconteceu na entrega:
- **Entregue** (tudo entregue) → avança para o pagamento (ou direto ao GPS se for boleto)
- **Entregue Parcial** → avança para registrar devoluções
- **Devolvido** (100% devolvido) → avança para informar motivo

> **Marcar "Devolvido" não mexe na cobrança do cliente.** O status da entrega é só o registro
> do que aconteceu na porta — as parcelas e o boleto continuam como estavam. Quem encerra a
> cobrança, devolve a mercadoria ao estoque e emite a NF-e de devolução é o **registro da
> devolução na conferência do Caixa**. Isso é de propósito: o motorista pode marcar errado e
> pedir para voltar atrás.

**Etapa 2 — Devoluções (apenas para Entregue Parcial)**
- Para cada produto, informe a quantidade devolvida (+ para aumentar, - para diminuir)
- Informe o motivo da devolução (campo de texto ou gravação de voz)
- Clique em avançar — o sistema calcula o saldo líquido a receber

**Etapa 3 — Caixa (pagamento recebido)**
- Não aparece para pedidos de boleto ou condições que não debitam caixa (esses pulam para o GPS)
- O valor já vem preenchido com o saldo calculado (total menos devoluções)
- Selecione a forma de pagamento (formas disponíveis dependem da condição de pagamento do pedido)
- Adicione mais de uma forma se o cliente pagou de formas diferentes
- Cada forma só pode aparecer uma vez; o total deve fechar exatamente (tolerância de R$ 0,05)
- Marque o toggle de divergência se percebeu diferença em relação ao combinado

**Quem vai cobrar este valor? — Etapa 3 (a partir de 19/08/2026)**

Algumas formas de pagamento **não são dinheiro entrando agora**: são o registro de que o cliente ficou devendo e alguém ficou de cobrar depois (é o cadastro da forma, na aba Formas de Pagamento da Entrega, que diz isso). Ao escolher uma dessas formas, aparece embaixo da linha o bloco **"Quem vai cobrar este valor?"**, com três botões:

- **Eu mesmo** — fica no seu nome. Vem **já marcado**, porque é o caso comum. A frase embaixo confirma com o seu nome ("Fica no seu nome (Fulano) para cobrar depois.")
- **Escritório** — fica com o escritório
- **Vendedor** — fica com o vendedor daquele cliente. Ao escolher, abre o campo **"Qual vendedor?"**: uma lista com busca, só com **vendedores ativos** (quem saiu da empresa não aparece)

Pontos importantes:

- **Escolheu "Vendedor" e não escolheu a pessoa?** A tela avisa em vermelho embaixo do campo ("Escolha o vendedor para poder finalizar") e o botão Finalizar recusa com o aviso *"Escolha QUAL vendedor fica responsável por cobrar este valor."* — o erro aparece **antes**, na sua mão, e não vira erro do servidor na porta do cliente
- **Você pode marcar qualquer um dos três, inclusive você mesmo.** Não existe trava aqui: quem confere é **quem fecha o caixa**, depois
- **Esse valor NÃO é recebimento.** Ele **não quita** o título e **não entra no seu "a prestar"** — o dinheiro não passou pela sua mão. O título fica **em aberto no nome de quem assumiu**, e some do seu acerto do dia
- A frase em português embaixo dos botões mostra exatamente o que vai ser gravado — confira antes de finalizar
- **Errou?** Quem confere o caixa corrige depois, na aba **Auditoria de Entregas** (trocar a pessoa, trocar o papel ou tirar a marcação). O que você marca aqui não é definitivo
- O bloco **não aparece** na linha de **PIX Asaas** confirmado pelo banco (ali o dinheiro já entrou) nem nas formas normais de recebimento

> **O que mudou:** até 19/08/2026 esta tela mandava **você mesmo** para o sistema, mas gravado na coluna do *vendedor*, e quem decidia era a caixinha marcada no cadastro da forma de pagamento — um cadastro invertido bastava para a dívida sair no nome errado, e você nunca via. Agora quem lança **escolhe**, os três aparecem na tela e dá para conferir na hora.

**Receber com PIX (QR Code) — Etapa 3**
- Se a integração Asaas estiver configurada no servidor, aparece o botão verde **Receber com PIX (QR Code)**
- O motorista informa o valor (já vem sugerido com o saldo; pode ser menor se parte for em dinheiro ou houver devolução) e toca em **Gerar QR Code**
- O cliente escaneia o QR na tela do celular do motorista (ou usa o botão **Copiar código PIX** para pagar pelo copia-e-cola)
- A confirmação aparece na tela em poucos segundos, direto do banco — não precisa de comprovante de WhatsApp
- O PIX confirmado entra como uma linha verde travada ("PIX Asaas — Confirmado pelo banco") na lista de pagamentos e abate automaticamente o valor das outras linhas
- Combinações aceitas: só PIX, dinheiro + PIX, devolução + PIX, ou os três juntos — a conta precisa fechar como sempre
- A linha do PIX confirmado não pode ser removida pelo motorista (estorno só pelo escritório, no painel do Asaas)
- Se o motorista fechar o QR sem o cliente pagar, a cobrança é cancelada automaticamente
- **Pedido ESPECIAL + PIX = vira nota fiscal**: antes de gerar o QR aparece um aviso vermelho — ao receber o PIX, o pedido especial é convertido automaticamente em pedido normal (com NF-e). Se o cliente não quiser nota, receber em dinheiro

**Etapa 4 — GPS e Conclusão**
- Clique em **Capturar GPS** para registrar a localização no momento da entrega
- O navegador pedirá permissão de localização
- Clique em **Finalizar** para confirmar — a entrega é salva, o caixa é atualizado e a entrega some da lista de pendentes
- **O que a finalização faz com o título:** ela **registra o que o motorista recebeu**, e só. Desde 08/2026 nem o pedido especial é quitado sozinho aqui — o título continua em aberto até alguém **conferir e dar a baixa no Caixa**. O dinheiro entra normalmente no "a prestar" do motorista — **menos** o que foi marcado no bloco "Quem vai cobrar este valor?", que não é recebimento e fica de fora do acerto do dia (ver Etapa 3)

### Conferir a folha impressa (QR code)
1. Antes de carregar o caminhão, toque no botão **Folha** (ícone de QR, no header verde da tela)
2. A câmera abre dentro do próprio app — aponte para o **QR no cabeçalho do romaneio impresso**
3. O app compara a versão da folha com a versão atual da carga no sistema:
   - **Verde — "Folha confere!"**: a folha é a versão atual (pode carregar/separar/conferir com ela)
   - **Amarelo — "Folha desatualizada!"**: alguém mexeu na carga depois da impressão; a tela mostra exatamente o que mudou (pedido que entrou/saiu, data/motorista alterado). Peça a folha nova na expedição — o que vale é o que está no app
   - O veredito verde/amarelo aparece para **qualquer pessoa** que escaneie (motorista, separação, conferência). Se a carga for de outro motorista, aparece um **aviso complementar** ("Esta carga é do motorista X") — útil para não sair com a folha trocada quando várias cargas saem juntas
4. Se o motorista tem duas cargas no dia, escaneia uma folha de cada vez ("Escanear outra folha")
5. Se a câmera não abrir, libere o acesso à câmera para o app nas configurações do celular

### Cobrar um título em rota (sub-aba Cobranças)
1. Toque na sub-aba **Cobranças** (só aparece para quem tem `Pode_Cobrar_Titulo_Rota`)
2. As cobranças que o escritório pendurou na sua carga já aparecem na lista, com cliente, parcela e valor
3. Toque em **Cobrar** e escolha:
   - **Total** (valor cheio) ou **Parcial** (digite quanto recebeu — o restante continua em aberto)
   - Forma de pagamento: **Dinheiro** (entra no seu caixa do dia, no valor a prestar), Pix, Cartão ou Outro
4. Confirme — a cobrança fica registrada como **"aguarda caixa"**. **Nada é baixado na rua**: a baixa oficial da parcela sai no Caixa Diário, quando o escritório confere e marca o box
5. **Não consegui cobrar**: toque em "😕 Não consegui cobrar" e marque quem fica responsável (**Escritório** ou **Vendedor** da carteira do cliente). É só registro — o título continua em aberto e nada entra no caixa. *(São só duas opções aqui, e é um registro à parte do bloco "Quem vai cobrar este valor?" da entrega — este é sobre uma cobrança que o escritório pendurou na carga, aquele é sobre o pagamento da entrega em si.)*
6. **Busca livre** (imprevisto): se um cliente quiser pagar um título na hora, digite o nome dele em "Buscar cliente para cobrar…", toque em **Cobrar** no título e registre normal — não precisa estar na carga
7. Registro errado? Na lista "Registradas hoje", toque na seta de **desfazer** (só antes da baixa no caixa)

### Ver entregas já concluídas
1. Clique na sub-aba **Já Finalizadas**
2. A lista carrega do backend com as entregas concluídas
3. Cada card mostra:
   - Status físico: ENTREGUE (verde), PARCIAL (âmbar) ou DEVOLVIDO 100% (vermelho)
   - Se houve divergência de pagamento apontada
   - Horário e data do check-in

---

## Sub-abas

### A Entregar
Lista de entregas **pendentes** do motorista logado. Mostra apenas pedidos em embarques atribuídos a este motorista que ainda não foram baixados.

Cada card mostra:
- Nome fantasia do cliente (em destaque)
- Endereço completo
- Número do embarque (badge cinza)
- Badge de prioridade (número âmbar, se definido)
- Botão estrela para marcar/desmarcar prioridade
- Botões **Maps** e **Fazer Check-in (Entregar)**

### Já Finalizadas
Lista de entregas **concluídas** pelo motorista. Carregada do backend ao clicar na aba.

Cada card mostra:
- Nome fantasia do cliente
- Número do embarque
- Status físico da entrega (badge colorido)
- Aviso de divergência de pagamento (se houver)
- Horário e data da conclusão

### Cobranças (exige `Pode_Cobrar_Titulo_Rota`)
Títulos em aberto para cobrar na rua. Mostra:
- Campo de **busca livre** por cliente (cobrar um título na hora, sem carga)
- Cobranças **pendentes** penduradas nas cargas deste motorista (botão **Cobrar**)
- **Registradas hoje**: cobradas (aguardando o caixa ou já baixadas) e não-cobradas, com botão de desfazer

---

## Permissões necessárias

| Ação | Permissão necessária |
|------|----------------------|
| Ver a tela | `Pode_Executar_Entregas` |
| Dar baixa nas entregas | `Pode_Executar_Entregas` |
| Marcar prioridade | `Pode_Executar_Entregas` |
| Ver a sub-aba Cobranças e cobrar títulos em rota | `Pode_Cobrar_Titulo_Rota` |
| Ver entregas de outro motorista | Não disponível nesta tela — use a aba Rota com `Pode_Ver_Todas_Entregas` |

---

## Depende de / Interfere em

- **Embarque** — as entregas desta tela vêm dos embarques criados na aba Embarque pelo responsável logístico
- **Caixa Diário** — cada check-in com pagamento registrado alimenta o caixa do motorista naquele dia
- **Rota** — a Rota também tem as sub-abas Entregas e Entregues para o motorista; o fluxo de checkout é idêntico
- **Contas a Receber** — o pagamento registrado no checkout gera/atualiza a baixa da parcela correspondente

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Motorista/Entregas/PainelMotorista.jsx` | Tela principal com sub-abas e cards de entrega |
| `frontend/src/pages/Motorista/Entregas/CheckoutEntregaModal.jsx` | Modal de checkout em 4 etapas (status, devolução, caixa, GPS) |
| `frontend/src/pages/Motorista/Entregas/PixAsaasModal.jsx` | Modal do QR Code PIX (Asaas) com confirmação automática |
| `frontend/src/pages/Motorista/Entregas/CobrancasRotaAba.jsx` | Sub-aba Cobranças: títulos a cobrar em rota + busca livre + modal de cobrança |
| `backend/routes/cobrancasRota.js` | API da Cobrança em Rota (inserir na carga, cobrar, não-cobrada, desfazer) |
| `frontend/src/services/entregasService.js` | Chamadas de API para entregas do motorista |
| `frontend/src/services/asaasService.js` | Chamadas de API da integração Asaas (PIX) |
| `backend/services/asaasService.js` | Integração com a API do Asaas (cliente, cobrança, webhook) |

## Pergunta "Você está na porta do cliente?" (novo — 07/2026)

Ao concluir uma entrega **longe do ponto GPS cadastrado** do cliente (ou de cliente sem ponto), o app faz uma pergunta de 1 toque: *"Você está na porta do cliente agora?"*

- **Não** → nada acontece (você só registrou a entrega de outro lugar).
- **Sim** → o app pede uma **foto da fachada** do cliente (obrigatória). A confirmação vira um sinal de correção do cadastro; se o cliente não tinha ponto nenhum, o lugar já vira o primeiro ponto dele. A foto fica no cadastro para o próximo entregador reconhecer a loja.

Quem conclui a entrega no lugar certo nunca vê essa pergunta. Sem internet, a confirmação fica guardada e sobe quando o sinal voltar.
