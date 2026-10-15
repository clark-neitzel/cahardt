# Nota de entrega — E1: impressão direta nas Zebras (sem janela de impressão)

**Data:** 15/10/2026
**Veredito do gerente de entrega:** **LIBERADO COM PENDÊNCIA** — pode publicar. A prova final só acontece na cozinha, com o PC PRODUCAO e as duas Zebras de verdade, e isso só você consegue fazer (passo a passo abaixo).

---

## 1. O que mudou (em termos de uso)

Hoje, para imprimir uma etiqueta, o navegador abre a janela de impressão e alguém precisa clicar em OK no aparelho certo. A partir desta entrega existe um caminho novo, **sem janela nenhuma**:

1. Você clica em "Imprimir" no iPad, no celular ou em qualquer computador.
2. O sistema anota o pedido numa **fila**.
3. Um programinha instalado no PC da cozinha (o **agente**) pega o pedido em até 3 segundos e manda direto para a Zebra.
4. A tela mostra "Enviando… → Imprimindo… → Saiu" (ou o motivo do erro: impressora desligada, sem etiqueta, tampa aberta…).

Nesta etapa (E1) entra só a **infraestrutura** e a tela de administração **Configurações → Impressoras** (só aparece para administrador):

- **Computador da cozinha (agente):** criar o agente, baixar o instalador, ver se ele está **online (verde) / instável (amarelo) / offline (vermelho)**, trocar a senha, revogar.
- **Impressoras:** cadastrar cada Zebra escolhendo da lista que o próprio Windows do PC enviou, com linguagem (EPL2 ou ZPL) e tamanho (40x25 ou 100x120). A impressora nasce **inativa** e só entra em uso depois que você clicar em **Ativar** (após o teste sair certo).
- **Três botões de teste** por impressora: *Teste de texto (EPL2)*, *Teste de texto (ZPL)* e *Etiqueta de exemplo* (uma etiqueta fictícia "RECHEIO DE TESTE" no layout real).
- **Fila de impressão:** tudo que foi pedido, com status, quem pediu, mensagem de erro, botões **Reenviar** e **Cancelar**.

**A aba "Etiquetas da Cozinha" (escolher recheio/massa, validade, quantidade e imprimir) é a próxima etapa (E2)** e só começa depois que esta sair certa nas Zebras.

O que **não** mudou: Kit Festa e etiqueta de produto continuam imprimindo como antes (pela janela do navegador). O QA conferiu que nada mudou ali.

---

## 2. O que foi testado e por quem

| Quem | O que provou | Evidência |
|---|---|---|
| dev-backend | 58 testes automáticos passando (15 novos, da geração da etiqueta: 2 colunas, nome longo, acentos, caracteres especiais); recusa sem senha (401) sem vazar nada; um agente não vê a fila do outro; dois pedidos ao mesmo tempo não imprimem em dobro; pedido velho expira e nunca sai; reenviar com clique duplo cria um só | `npm test` 58/58 (rodei de novo hoje) |
| dev-frontend | tela desktop e celular (375 px), build passando | `cd frontend && npm run build` OK em 5 s (rodei de novo hoje); 29 capturas em `docs/etiquetas-cozinha/evidencias/` |
| qa-testador | clicou em tudo com um agente **simulado**: criar agente, senha aparece uma vez, baixar .bat, bolinha verde/amarela/vermelha, cadastrar impressora da lista do Windows, 3 testes (saiu / erro "impressora offline: sem etiqueta" / expirado), fila com filtro, reenviar e cancelar, trocar senha, revogar, permissão (menu some e tela nega para quem não é admin), Kit Festa e etiqueta de produto iguais a antes | 52 capturas em `docs/etiquetas-cozinha/evidencias/qa/` |
| revisor-codigo | leu o código inteiro; 12 ressalvas, todas corrigidas e reconferidas (inclusive 2 obrigatórias no programa do agente) | relatório do revisor |
| gerente-entrega (eu) | refiz build, testes e validação do banco; conferi que **nenhum campo foi removido** do banco (só acréscimos); **nenhuma senha/token real** no repositório; sem `window.open`/iframe; manual da aba + Clippy atualizados; marcador de deploy novo; subi o backend local e provei o 401 sem token / com token falso; olhei a fila pelo diagnóstico (bate com as capturas) | este documento |

**O que NÃO foi testado (e por isso a pendência):** o programa do agente (`agente.ps1` + instalador `.bat`) foi escrito para Windows e **nunca rodou num Windows** — não há Windows na máquina de desenvolvimento. Todo o teste de tela usou um agente simulado. **A primeira execução de verdade é a sua, no PC PRODUCAO.**

---

## 3. O que você precisa fazer: instalar e testar na cozinha (uns 15 minutos)

### Antes de começar
- O PC da cozinha (PRODUCAO, Windows 10) precisa estar ligado, com internet e com as duas Zebras ligadas e com rolo.
- O instalador **desliga sozinho a suspensão e a hibernação** do PC (ele precisa ficar acordado para o agente trabalhar). Se o PC tiver alguma política própria de energia, confira depois em *Configurações do Windows → Sistema → Energia* que "Suspender" está em **Nunca**.

### Passo 1 — criar o agente e baixar o instalador (no PC da cozinha)
1. **No próprio PC da cozinha**, abra o sistema **pelo mesmo endereço que o iPad usa** (isso importa: o instalador grava dentro dele o endereço que o navegador estava usando).
2. Entre com seu usuário de administrador → menu **Configurações → Impressoras**.
3. Clique em **Novo agente**, dê um nome (ex.: *PC da cozinha*) e confirme.
4. Vai abrir a janela com a **senha do computador (token)**. Ela só aparece **uma vez** — não precisa copiar nada, o instalador já vai com ela dentro. Clique em **Baixar instalador (.bat)**.
5. Clique em **Já copiei, fechar**.

### Passo 2 — rodar o instalador
1. Abra a pasta **Downloads** e ache o arquivo `instalar-agente-….bat`.
2. Clique nele com o **botão direito** → **Executar como administrador**.
3. Se o Windows mostrar o aviso azul "O Windows protegeu o computador", clique em **Mais informações** → **Executar assim mesmo**.
4. Uma janela preta vai mostrar 6 passos. No final ela fica **verde** com a frase **"Agente instalado e funcionando"**.
   - Ela pergunta se quer **apagar o instalador** (ele tem a senha dentro): responda **S**.
   - Se ficar **vermelha** com "ERRO", **tire uma foto da tela** e me mande — não tente de novo às cegas.
5. Volte ao sistema: em até **10 segundos** a bolinha do agente fica **verde** e aparece "Computador: PRODUCAO". **Isso é o sinal de que deu certo.**

### Passo 3 — cadastrar as duas impressoras
1. Clique em **Atualizar lista de impressoras** (o agente manda a lista do Windows).
2. **Nova impressora** → *Zebra pequena 40x25*: escolha o agente, escolha **Zebra TLP 2844** na lista do Windows, linguagem **EPL2**, tamanho **40x25**, colunas **2**. Salvar.
3. **Nova impressora** → *Zebra grande 100x120*: escolha a **ZDesigner** na lista, linguagem **ZPL** (vamos confirmar no teste), tamanho **100x120**, colunas **1**. Salvar.
4. As duas nascem **inativas** — é normal. Só ative depois do teste.

### Passo 4 — descobrir a linguagem da Zebra grande
Na linha da **grande**, clique em **Teste de texto (EPL2)** e depois em **Teste de texto (ZPL)**.
- A que sair com **3 linhas de texto legível** é a linguagem certa. A outra pode sair em branco, sair lixo ou não sair nada — **é assim mesmo que se descobre**.
- Se a certa não for a cadastrada, clique em **Editar** e troque a linguagem.
- Na **pequena (TLP 2844)** é EPL2; vale fazer o mesmo teste só para confirmar.

### Passo 5 — etiqueta de exemplo nas duas
Clique em **Etiqueta de exemplo** em cada impressora e confira no papel:
- **Pequena 40x25:** saem **duas etiquetas lado a lado** (uma em cada coluna do rolo), faixa preta com o dia à esquerda, validade dentro de uma caixa, rodapé inteiro, **nada cortado e sem pular etiqueta**.
- **Grande 100x120:** faixa preta no topo, nome grande (até 3 linhas), validade em caixa, orientação certa.
- Faça o teste **do iPad ou do celular**, não só do PC — a graça é justamente não precisar estar perto da impressora. Em nenhum aparelho pode aparecer janela de impressão ou pedir OK.

Se sair **cortado, deslocado, fraco ou só numa coluna**: **tire uma foto da etiqueta ao lado de uma régua** e me mande. Tem ajustes finos (posição das colunas, deslocamento, densidade) que eu calibro **sem mexer em código** — não tente ajustar sozinho.

### Passo 6 — ativar
Quando a etiqueta de exemplo sair certa, clique em **Ativar** na linha de cada impressora. A partir daí elas ficam disponíveis para a E2.

### Testes extras (valem a pena, 5 minutos)
- **Reiniciar o PC sem logar:** reinicie o PRODUCAO e **não entre com usuário nenhum**. Em até 2 minutos a bolinha volta a ficar verde — prova que o agente liga sozinho com o Windows.
- **Internet caiu:** desligue o cabo/Wi-Fi do PC, peça um teste pelo iPad, religue antes de 15 minutos → sai **uma** etiqueta. Se religar depois de 15 minutos → **não sai nada** e a fila mostra "Expirado" (etiqueta velha nunca sai sozinha horas depois).

---

## 4. O que ficou pendente / de fora

1. **Prova real nas Zebras (esta pendência).** Até você fazer o Passo 5, a entrega está "publicada", não "pronta".
2. **Calibração das etiquetas** nas duas impressoras: só dá para fazer com foto do papel (Passo 5).
3. **Endereço errado no instalador.** Se o instalador terminar em ERRO logo no passo "[3/6] Baixando o agente" ou "[6/6] Testando a conexão", o endereço gravado no `.bat` pode estar errado. A solução é eu definir a variável `IMPRESSAO_URL_PUBLICA` no EasyPanel com o endereço do sistema e você baixar um novo instalador por **Trocar senha**. Me avise com a foto.
4. **E2 — aba Etiquetas da Cozinha** (recheios/massas, validade, "Hoje na cozinha", reimprimir): começa depois que a E1 estiver provada.
5. **D5 (já existia antes):** o aviso "Pedidos novos" do app às vezes aparece por cima das janelas desta tela. Não é desta entrega; fica anotado.
6. **Novidade no grupo do WhatsApp / Clippy balançando:** **não** fiz de propósito — a E1 é uma tela só de administrador, a equipe não vê nada ainda. A novidade sai junto com a E2, que é o que muda a rotina da cozinha.

---

## 5. Para quem for publicar (resumo técnico)

- Commit **com `git add` explícito** dos arquivos da E1 (há arquivos soltos no repositório que **não** são desta entrega e não devem ir junto: `skills/`, `docs/proposta-central-cobranca.html`, `docs/proposta-layout-mapa-entregas.html`, `docs/qr-site-congelados.jpg`).
- Banco: só acréscimos (3 tabelas novas `impressao_agentes`, `impressoras`, `impressao_fila` + 4 colunas em `itens_pcp`, todas opcionais ou com padrão). `prisma db push` não remove nada.
- Depois do deploy, conferir `GET /api/admin-exec/ping` → `deployMarker: impressao-direta-e1-2026-10-15` e `GET /api/admin-exec/diag-impressao`.
- Variável opcional no EasyPanel: `IMPRESSAO_URL_PUBLICA` (só se o `.bat` sair com endereço errado).
