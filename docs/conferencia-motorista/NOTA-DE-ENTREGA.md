# Nota de entrega — Conferência do motorista e carga já separada

**Data:** 23/11/2026

## O que mudou

**1. O motorista agora tem a tela dele para conferir a carga.**
Chama-se **Conferir Carga (Motorista)**. A contagem dele é separada da sua.
O que você marca na Separação não aparece mais como "conferido" para ele.
Ele conta do zero. Só vê um aviso na linha quando a separação marcou falta.

**2. Carga já separada não recebe mais pedido.**
Depois que alguém aperta **Concluir separação**, a carga fecha para pedido novo.
Quem tentar incluir vê o aviso:
"Esta carga já foi separada na câmara fria, então não dá mais para incluir pedidos nela. Crie uma nova carga para este pedido."
Tirar pedido da carga continua liberado.

**3. Funciona sem internet.**
Fechou o app sem sinal e abriu de novo: volta para a conferência, com os toques guardados.
Vale para a Separação e para a Conferência.

## O que foi testado

Testado clicando na tela, no computador e em tamanho de celular, no ambiente de teste:

- Conferência completa: contar, marcar falta ("Não veio" / "Vem depois"), bolsas, etiquetas, concluir.
- Sem internet: fechar e abrir o app, continuar contando, enviar quando o sinal volta.
- O bloqueio da carga separada nos 3 lugares onde se inclui pedido (Embarque, Mapa das Entregas e bipe da conferência).
- A Separação continua igual ao que era.

## O que você precisa fazer (5 minutos)

**Passo 1 — Ligar a permissão do motorista**
1. Administração → Usuários → escolha o motorista → Permissões.
2. No grupo **Logística**, ligue **Conferir Carga (Motorista)**.
3. No mesmo lugar, **desligue "Separação de Carga"** do motorista. Assim ele não entra mais na sua contagem.
4. Peça para ele fechar e abrir o app.

**Passo 2 — O motorista abre a Conferência**
1. Com internet, abrir **Minhas Entregas** e tocar no botão **Conferir carga** (em cima). Também está no menu Logística.
2. Tocar na carga dele. Ele só vê as cargas em que é o motorista.
3. Contar: **+**, **−** ou **✓ Conferi tudo**. Se faltar, escolher **Não veio** ou **Vem depois**.
4. No fim, tocar em **Concluir conferência da carga**.

**Passo 3 — Teste sem internet (no celular de verdade)**
1. Com internet, abrir a carga na Conferência.
2. Ligar o modo avião.
3. Fechar o app e abrir de novo. Tem que voltar para a carga, com o que já foi contado.
4. Desligar o modo avião. Os toques sobem sozinhos.

**Importante:** depois desta atualização, todo aparelho precisa abrir o app **uma vez com internet** antes de entrar na câmara fria. Se aparecer a faixa amarela "Este aparelho ainda não está pronto para ficar sem sinal", feche e abra o app com internet.

## Bom saber

- Você separa na tela **Separação**. O motorista confere na tela **Conferir Carga**. São duas contagens que não se misturam.
- A carga só fecha para pedido novo quando alguém aperta **Concluir separação**. Separação só começada não fecha.
- Amostra e cobrança ainda podem entrar em carga já separada. Só pedido é bloqueado.
- No Embarque, a carga mostra **"Conferida por (nome) · N faltas"**.
- As cargas antigas vão aparecer com o selo amarelo **"Saiu sem conferência"**. É normal: a tela ainda não existia.
- Nenhuma mensagem de WhatsApp é enviada por essas telas.

## O que ficou pendente

- **Só você consegue testar:** o Passo 3 no iPhone/iPad de verdade e a etiqueta de bolsa saindo na Zebra pela Conferência.
- **Anúncio para a equipe:** a página de novidade está pronta, mas só vai para o grupo e para o Clippy depois do seu teste.
- **Próxima etapa (já planejada):** travar a escolha "carga inteira ou por pedido", aviso com os produtos que saíram da carga e o tour de ajuda com balões.
- No Embarque aparece quantas faltas o motorista apontou, mas ainda não a lista de quais produtos. A lista aparece no cartão da entrega (Minhas Entregas), quando ele confere por pedido.
