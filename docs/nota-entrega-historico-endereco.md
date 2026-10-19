# Nota de entrega — Histórico do endereço do cliente

**Data:** 19/10/2026
**Veredito do gerente de entrega:** LIBERADO COM PENDÊNCIA (pode commitar e publicar; falta conferir em produção depois do deploy)

---

## O que mudou (para quem usa o app)

Na ficha do cliente, aba **Qualidade dos dados**, logo abaixo do cartão Localização, apareceu o cartão **Histórico do endereço**.

- **Quem e quando.** Cada vez que alguém salva o endereço do cliente (rua, número, bairro, cidade, CEP) ou mexe no ponto do mapa, fica registrado o nome da pessoa, a data/hora e por qual tela foi (cadastro, Rota, tela de entregas, Saúde dos pontos, cadastro novo, restauração). Rua e ponto salvos juntos viram um registro só.
- **Ver no mapa.** Tocar em **Ver no mapa** numa versão antiga faz o mapa do cartão Localização crescer e mostrar a versão antiga em **cinza** e o ponto de hoje em **verde**, com uma linha e a distância entre os dois. Tudo dentro do app, sem abrir Google Maps (o link "Abrir no Google Maps" é opcional). Se a versão antiga não tinha ponto, o app **estima** a posição pelo endereço escrito e avisa que é estimativa. **Voltar ao ponto atual** desfaz a comparação.
- **Restaurar.** Cada versão antiga tem o botão **Restaurar**. Abre uma confirmação mostrando "Hoje" e "Volta para", e dá para escolher restaurar o **endereço escrito**, o **ponto no mapa**, ou os dois. Restaurar não apaga nada: cria uma linha nova no histórico, com quem restaurou. Clicar duas vezes não duplica (a segunda avisa "já estava assim").
- **As mesmas travas de sempre continuam valendo** ao restaurar: ponto em cima de outro cliente ou na empresa é barrado; a menos de 30 m de outro cliente pede senha de quem autoriza; cidade que não existe mais no cadastro e Inscrição Estadual incompatível com a UF também barram — e nesses casos o app oferece restaurar só a outra parte.
- **Permissões (decisão tomada pela equipe, sem perguntar):** quem pode editar o cadastro restaura tudo; motorista (só "Executar entregas") restaura **só o ponto**, nunca o endereço escrito.
- **Limite honesto:** o endereço escrito só começa a ser guardado a partir de agora (19/10/2026). Mudanças de texto anteriores a hoje não existem — a tela avisa a data de início. Mudanças antigas do ponto do mapa aparecem marcadas "Só o ponto (registro antigo)".
- Na aba **Cadastro**, o bloco antigo "Histórico do ponto" virou a versão compacta deste mesmo histórico (2 últimas + "ver todas", que leva para a aba Qualidade).

## O que foi testado e por quem

- **dev-backend:** 12 grupos de chamadas de API (editar texto, editar ponto, os dois juntos = 1 registro, registros antigos do GPS, restaurar e repetir, cidade inativa, IE × UF, ponto duplicado/próximo com e sem senha, permissões admin/motorista/sem permissão, detecção de mudança feita por fora do cadastro, posição estimada, cadastro novo, desfazer na Saúde dos pontos).
- **dev-frontend:** telas provadas contra o backend real (listar, ver no mapa, restaurar, posição estimada, duplo restaurar) e erros simulados; botão X do modal medido em 44×44 px.
- **qa-testador (clicando na tela, backend real):** PASSOU COM RESSALVAS — 18 critérios do plano, com capturas de tela: editar rua gera registro com autor/hora/tela; mover o ponto mostra "N m"; mapa comparativo trocando de versão 5 vezes sem quebrar; posição estimada; restaurar atualiza a aba Cadastro sem recarregar; senha errada barra e senha certa libera; cidade inativa barra; motorista vê só o ponto marcável; celular 375 px e 320 px sem rolagem lateral, botões com 44 px; Saúde dos Pontos GPS continua igual e "desfazer" gera registro; falha de rede mostra "Tentar de novo".
- **revisor-codigo:** reprovou na 1ª leitura (6 achados, 1 bloqueante) e aprovou na 2ª após as correções, que eu confirmei no código.
- **gerente-entrega (eu):** rodei o build do frontend numa cópia limpa do projeto só com esta entrega (`✓ built in 5.44s`), validei o schema do banco (válido), chequei sintaxe dos 4 arquivos do backend, passei o lint do projeto nos 5 arquivos do frontend (nenhuma variável sem importar), conferi que permissão da tela = permissão do servidor (mesma fórmula nos dois lados), que não há `window.open`, que a tabela nova só acrescenta (não remove nada do banco), que a gravação do histórico fica fora da transação e nunca derruba o salvar do cliente, manuais do Clippy atualizados, página de novidade sem `og:image`, sem botão "abrir o app", com os blocos já abertos e com mockups numerados, e `novidades.json` válido.

## O que você precisa conferir (1 minuto, depois do deploy)

1. Abra a ficha de um cliente → aba **Qualidade dos dados**. O cartão **Histórico do endereço** tem que aparecer abaixo de Localização (vazio é normal: "Ainda não há alterações… O registro começou em 19/10/2026").
2. Na aba Cadastro, mude o número do endereço e salve. Volte na aba Qualidade: a mudança tem que aparecer com o seu nome e a hora.
3. Toque em **Ver no mapa** na linha "Era assim antes" e depois em **Restaurar** → marque só "Endereço escrito" → confirme. O número tem que voltar e aparecer uma linha "Restauração".

Se no passo 1 o cartão não aparecer ou der erro vermelho com "Tentar de novo", o backend novo ainda não subiu (a tabela e a rota são criadas no deploy) — espere o deploy terminar e recarregue.

## O que ficou pendente ou de fora

- **Produção:** tabela nova `clientes_endereco_log` e as 3 rotas só são provadas de verdade depois do deploy (criação da tabela pelo `prisma db push`). Prova técnica: `GET /api/clientes/<uuid>/endereco-historico` respondendo 200.
- **iPad real:** testado só em navegador simulado (375/320 px). Falta abrir no iPad da equipe.
- **IE incompatível com a UF na tela:** provado por API, não clicando (a mensagem na tela usa o mesmo caminho da cidade inativa, que foi clicado).
- **Deploy marker:** o arquivo `adminExec.js` está sendo usado por outra entrega em andamento (Como Fazer), então esta entrega **não** muda o marcador de deploy; a conferência do deploy é pela rota acima.
- Endereço escrito anterior a 19/10/2026 **não existe** no histórico (só o ponto do mapa tem registro antigo).

---

## Texto para o grupo do WhatsApp

```
🗺️ *Novidade no Hardt App: histórico do endereço do cliente*

Agora, na ficha do cliente → aba *Qualidade dos dados*, tem o cartão *Histórico do endereço*:

👤 mostra *quem* mudou o endereço ou o ponto no mapa e *quando*
📍 *Ver no mapa*: toca numa versão antiga e o mapa mostra onde ela ficava (cinza) e onde está hoje (verde), com a distância
↩️ *Restaurar*: volta o endereço e/ou o ponto daquela versão, com confirmação antes

Nada é apagado — restaurar cria um registro novo. O endereço escrito começou a ser guardado hoje (19/10); mudanças antigas só do ponto continuam aparecendo.

Veja como funciona: https://cahardt-github.xrqvlq.easypanel.host/novidade-historico-endereco.html
```
