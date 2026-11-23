# PLANO-ONDA-2 (conteúdo completo para a thread principal gravar em `docs/separacao-carga/PLANO-ONDA-2.md`)

Minha ficha é somente leitura, então não criei o arquivo. O texto abaixo é o plano inteiro. Li o pedido e o código real: hook, página, `BarraCarga`, `config.js`, `textos.js`, `separacaoCalculo.js`, `AvisoCargaMudou.jsx`, `separacaoStorage.js`, a Conferência (página, serviço e rota), `separacaoCargaService.js`, `routes/separacaoCarga.js`, o schema das tabelas `separacao_carga*` e `conferencia_motorista_*`, `routes/embarques.js` (remover pedido) e `cargaSeparadaGuard.js`.

Legenda: **[confirmado]** = li a linha. **[suposição]** = não li, ou o trecho deve ser conferido pelo dev.

---

## 1. Resumo de 10 linhas para o dono

1. **Pedido que sai da carga.** O aviso "A carga mudou" já existe, mas só mostra o nome do cliente. Vai passar a mostrar, por pedido, quais mercadorias saíram (ex.: "10 Coxinha, 6 Bolinha"). Quando você já tinha separado a mais, ele diz quanto tirar de volta.
2. **O aviso não some.** Depois do "OK" fica uma faixa na tela: "Saiu o pedido X" com a lista, até alguém tocar em "Já tirei".
3. **Quem abre a carga depois** (o motorista, por exemplo) também vê o pedido que saiu. Para isso o servidor passa a guardar o que saiu. Essa parte é opcional (pergunta 3).
4. **Trava do modo.** Começou a contar em "Carga inteira" ou em "Por pedido": o outro modo fica travado, com um cadeado e uma explicação em português simples.
5. **Destravar.** Só destrava quando a contagem volta a zero. Vai existir um botão grande "Zerar a contagem desta carga", com confirmação.
6. **Cada ferramenta decide sozinha.** Separação e Conferência têm contagens separadas. O separador pode usar "carga" e o motorista "pedido".
7. **A trava vale no servidor.** Dois aparelhos não conseguem contar de jeitos diferentes. O aparelho recusado mostra o motivo e não perde o que não conflita.
8. **Tour de balões** nas duas telas. Cada balão tem um modelo de tela, letra grande, e o botão "Entendi" só libera depois de 10 segundos. Não avança sozinho.
9. **Quem já usa também vê o tour.** Aparece para quem nunca viu, mesmo tendo contagem em andamento, e dá para rever no botão "?".
10. **Porte grande** (regra no servidor, tela em uso real). Cerca de 8 a 9 dias-pessoa, uns 5 dias corridos com backend e frontend em paralelo. Ficam 4 perguntas para você no fim.

---

## 2. Mapa do código atual (o que existe hoje)

### Frontend: `frontend/src/pages/Logistica/SeparacaoCarga/`

- **O modo hoje NÃO está no servidor.** Ele é um `useFiltroSalvo('separacao-carga:modo','carga')`, no localStorage, por usuário, igual para todas as cargas e por aparelho. [confirmado: `SeparacaoCargaPage.jsx:26`]
  - A Conferência faz igual, com a chave `'conferencia-motorista:modo'`. [confirmado: `ConferenciaMotoristaPage.jsx:54`]
  - O botão de trocar de modo está sempre livre. [confirmado: `BarraCarga.jsx:78-81`, `escolherModo` em `SeparacaoCargaPage.jsx:101`]
- **O modo vira dado de conclusão.** `fazerConcluir` manda `'CARGA'` ou `'PEDIDO'`. [confirmado: `SeparacaoCargaPage.jsx:166-170`]
- **Cada linha de contagem** tem a chave `c:<produto>` ou `p:<pedido>:<produto>` e os campos `{q, t, m, c, por}`. [confirmado: `separacaoCalculo.js:1-10`]
- **Bolsas** ficam em `estado.pedidos[pedidoId].b`, e só existem no "Por pedido". [confirmado: `useSeparacaoCarga.js:511-526`]
- **Zerar uma linha pela tela:** o botão "Separei tudo" desliga `t` e `q` apenas quando a linha está completa (`useSeparacaoCarga.js:504-507`). O "−" até 0 deixa `t=true` e `q=0`. [confirmado: `:503`] Por isso a definição de "zerado" abaixo NÃO pode depender de `tocada`.
- **Aviso "A carga mudou".**
  - `diffCarga` está em `separacaoCalculo.js:176`. [confirmado]
  - `sairam` é `antiga.pedidos.filter(...)`, ou seja, os objetos de pedido inteiros, e cada um já traz `itens` com nome, unidade e quantidade. [confirmado: `separacaoCalculo.js:176-186`]
  - O modal `AvisoCargaMudou.jsx` mostra só `p.cliente — p.etiqueta` em "Pedidos que saíram". [confirmado: linhas 18-20]
  - **Conclusão:** o item 1 é basicamente de frontend. O dado já está no aparelho, só não é desenhado.
- **O que o aviso faz hoje.**
  - `registrarMudanca` guarda a nova carga em `R.dados.mudou`. [confirmado: `useSeparacaoCarga.js:172-186`]
  - `confirmarMudanca` tira dos "toques pendentes" os de pedido que saiu e faz `mesclarEstado`. Os outros pedidos NÃO são apagados. [confirmado: `:197-213`]
  - O servidor devolve `assinatura` no sync e o hook confere (`conferirAssinatura`, `:188-195`). [confirmado]
  - Se só mudou ordem ou assinatura, ele adota a nova carga sem incomodar. [confirmado: `:175-181`]
- **Fila de envio.**
  - `montarOps` (`:216-231`) e `sincronizar` (`:234-310`). [confirmado]
  - Depois da resposta, o hook tira da fila tudo que foi no lote e adota o estado do servidor (`:253-270`). [confirmado]
  - Importante: `resp.ignoradas` hoje NÃO é lida. Um toque ignorado pelo servidor some da fila, mas continua na tela do aparelho. Para `MAIS_NOVO_NO_SERVIDOR` isso se resolve sozinho, porque o servidor devolve a linha. Para a trava (`MODO_TRAVADO`) o servidor NÃO tem a linha, então o aparelho ficaria mostrando uma contagem que o servidor não tem.
- **`mesclarEstado` descarta chaves desconhecidas.** Ele só devolve `{ordem, linhas, pedidos, conclusao}` (`separacaoCalculo.js:151-169`). [confirmado] Um campo novo `estado.modo` precisa ser repassado de forma explícita.
- **Armazenamento local.** `dadosVazios` e `lerDados` (`separacaoStorage.js:21,33-40`) fazem spread do que estava guardado. Campos novos (`saidas`, `recusadas`) são seguros para dados antigos. [confirmado]
- **A tela usa o `.sepc` e a letra A−/A+.** `letra` é limitada pela largura (`SeparacaoCargaPage.jsx:47-48`). O bloco fixo usa `letraFixo` (`:51`). [confirmado]
- **Modais já existentes.** `.mdl-f` (z-index 90) e `.mdl`, em `separacaoCarga.css:190-195`. [confirmado]
- **Classes de CSS para os modelos de tela** (`.it`, `.q`, `.acts`, `.tudo`, `.mot`, `.modo`, `.pc`, `.bd`, `.aviso-a`, `.avs`, `.cab`, `.prog`) existem em `separacaoCarga.css`. [confirmado]
- **Offline:** a rota abre sem internet pelo `rotasOffline.js`, usando o snapshot do usuário (`user.id` e permissões). [confirmado]

### Backend (serviços gêmeos)

- **`separacaoCargaService.js` e `conferenciaMotoristaService.js` são espelhos.** Mudam só nomes de tabela e campo (`quantidadeSeparada` × `quantidadeConferida`), os motivos, o `exigirAcesso` da Conferência e os `avisosSeparacao`. [confirmado por diff]
- **Separação (`separacaoCargaService.js`).**
  - `sincronizar` está em `:227`. `maxPorChave` (linhas válidas da carga) em `:236-242`. A decisão em memória, por chave, em `:253-283`.
  - A leitura das linhas existentes está em `:285-294`. A divisão em `novasLinhas` e `atualizarLinhas` em `:301-316`. A gravação em `:332-354`.
  - As conclusões (`X`) estão em `:405-429`. O retorno em `:435-440`.
  - `estadoDe` está em `:145-159`. [confirmado]
- **Resultado do sync.** O servidor sempre responde 200 com `ignoradas:[{ref,motivo}]`, motivos `CHAVE_INVALIDA`, `FORA_DA_CARGA`, `IGUAL`, `MAIS_NOVO_NO_SERVIDOR`. [confirmado]
- **Sem `$transaction`.** Cada comando é atômico (`createMany skipDuplicates` e `updateMany` com carimbo menor). Não há exclusão mútua entre dois lotes simultâneos. [confirmado]
- **Conferência (`conferenciaMotoristaService.js`).** `sincronizar` está em `:294`. `exigirAcesso` em `:297` (admin ou motorista responsável). O bloco de conclusões tem `opsX.sort` em `:475`. `estadoDe` está em `:212`. [confirmado] As outras linhas do arquivo ficam deslocadas cerca de +70 em relação à Separação. [suposição: o dev confere]
- **Rotas.** `GET /cargas/:id/baixar` devolve `{agora, carga, estado}`. `POST /cargas/:id/sincronizar` valida o corpo (`validarCorpo`, `:169`). [confirmado: `routes/separacaoCarga.js:20-40`; `routes/conferenciaMotorista.js:26-41`]
- **Schema.**
  - `separacao_carga_linhas` e `conferencia_motorista_linhas` têm `escopo` (CARGA|PEDIDO), `quantidade*`, `tocada` e `motivoFalta`. Conclusão tem `modo`. [confirmado: `schema.prisma:5367-5516`]
  - **Não existe campo "modo da carga".**
- **Remoção de pedido da carga.**
  - `DELETE /api/embarques/:id/pedidos/:pedidoId` em `routes/embarques.js:501-545`. [confirmado]
  - O log `PEDIDO_REMOVIDO` (`:531`) grava só `{numero, cliente}`, sem itens nem `pedidoId`. A tabela de log é `embarque_versao_log`. [confirmado]
  - Os consumidores do log (`DetalhesCargaModal.jsx:22,44` e `ConferirFolhaModal.jsx:10,21`) só leem `acao`, então campos extras no JSON são seguros. [confirmado]
- **Outros caminhos que soltam pedido da carga** (`pedidoController.js:1889`, `adminExec.js:8676/8741/8808`, `embarques.js:144/183`) não foram lidos. Cancelamento e devolução também tiram o pedido da carga pelo `FILTRO_PEDIDO_PENDENTE`. [suposição: ver Riscos]
- **Não existe nenhum componente de tour/popover reaproveitável.** Busquei `tour|coachmark|joyride|onboarding|spotlight|jaViu` e o único achado relevante é o Clippy, que guarda `clippy_novidade_vista` só no localStorage (`Clippy.jsx:55,68`). [confirmado]
- **Não existe campo de preferência por usuário** no `Vendedor` (nenhum JSON de UI). [confirmado por grep]

---

## 3. ITEM 1: pedido que sai da carga (aviso + produtos)

### Decisão de desenho

São três camadas, da mais obrigatória para a mais opcional.

- **Camada A (frontend, obrigatória, sem backend).**
  - O modal "A carga mudou" passa a listar, por pedido que saiu, os produtos e as quantidades. Os dados já estão em `diff.sairam[].itens`.
  - Novo helper `sobrasDaSaida(antiga, nova, estado)`: para cada produto, calcula `max(0, contado − novoTotal)` na "Carga inteira". Na mesma tela mostra "Você já tinha separado X, agora a carga pede Y. Tire Z".
  - No "Por pedido", se o pedido que saiu tinha bolsas (`estado.pedidos[id].b`) ou itens contados, avisa "Este pedido tinha N bolsa(s) pronta(s) — tire da carga".
- **Camada A2 (frontend): faixa persistente "Saiu da carga".**
  - Hoje, depois do "OK", a informação some. Em `confirmarMudanca` o hook acrescenta `d.saidas[]` com `{pedidoId, etiqueta, cliente, cidade, itens, em, visto:false}`.
  - A página mostra uma faixa (reaproveitando `.aviso-a`) por saída, com o botão "Já tirei" (44px ou mais).
  - Fica só no aparelho (localStorage dentro de `dados.saidas`). Funciona sem internet.
- **Camada B (backend, aditiva, pode ser cortada sem afetar o resto).**
  - O servidor passa a gravar os itens do pedido removido no log existente `PEDIDO_REMOVIDO`: `pedidos:[{pedidoId, numero, cliente, itens:[{nome, unidade, quantidade}]}]`. Isso é só mais JSON no mesmo registro, sem schema novo.
  - `montarCarga` (nos dois serviços) devolve `retirados:[{pedidoId, etiqueta, cliente, cidade, retiradoEm, retiradoPorNome, itens}]`.
  - Os `retirados` são as remoções dos últimos 7 dias. Saem da lista se o pedido já voltou para a mesma carga (compara pelo `numero`/etiqueta, único por tipo).
  - **Isto NÃO entra no cálculo da `assinatura`.** Se entrasse, geraria o modal "A carga mudou" em loop.
  - Serve ao aparelho que nunca teve a cópia antiga, como o motorista que abre a Conferência depois. A faixa A2 também lê `carga.retirados`, sem duplicar o que A já registrou (chave `pedidoId` + `retiradoEm`).
  - Remoções antigas, anteriores ao deploy, não têm itens. Mostrar só "Pedido X saiu desta carga (sem lista de produtos)".

### Arquivos por camada

| Camada | Arquivo | Mudança |
|---|---|---|
| Front A | `separacaoCalculo.js` | `diffCarga` ganha `saidasDetalhe` (aditivo) ou helper `sobrasDaSaida`. Não alterar o retorno atual. |
| Front A | `AvisoCargaMudou.jsx:18-20` | Renderizar `p.itens` em cada pedido que saiu. Texto novo em `textos.js` (`saiuTitulo`, `saiuTire`, `saiuBolsas`). |
| Front A2 | `useSeparacaoCarga.js:197-213` (`confirmarMudanca`) | Registrar `d.saidas`. |
| Front A2 | `useSeparacaoCarga.js:633-643` (retorno) | Expor `saidas` e `marcarSaidaVista(id)`. |
| Front A2 | `separacaoStorage.js:21` | `dadosVazios` ganha `saidas: []`. |
| Front A2 | `SeparacaoCargaPage.jsx` e `ConferenciaMotoristaPage.jsx` | Faixa de saídas abaixo de `AvisosCarga`. Componente novo `SaidasDaCarga.jsx` reaproveitado nas duas. |
| Back B | `routes/embarques.js:531` | Incluir `pedidoId` e `itens` no `registrarVersaoEmbarque`. A consulta de `itens` vai ANTES do `update` que zera o `embarqueId` (hoje o `select` do pedido, `:507-510`, não pega itens). Falha continua best-effort. |
| Back B | `separacaoCargaService.js:74-129` e `conferenciaMotoristaService.js` (`montarCarga`) | Campo `retirados`. Lógica em helper comum novo `backend/services/cargaRetiradosHelper.js`. |

### Contrato de API (todo aditivo)

- `GET .../baixar` e `carga` do sync: `carga.retirados` é opcional. Se o campo não vier, o front trata como `[]`.
- Nenhum campo existente é removido ou renomeado. Não existe `/v2`.

### Casos de borda

- **Carga com separação concluída.** O aviso e a faixa funcionam igual. A conclusão antiga continua no histórico. A faixa diz "A separação já tinha sido concluída — confira a falta".
- **Aparelho offline.** O aviso aparece no primeiro sync depois do retorno do sinal, porque a assinatura só chega nessa hora. Toque que era de pedido removido vai para `FORA_DA_CARGA` (já existe). O que foi contado nos outros pedidos NÃO é apagado. O teste QA precisa provar isso.
- **Mercadoria que "saiu" por cancelamento ou devolução.** A camada A cobre, porque o diff é entre cópias. A camada B cobre só a remoção pelo DELETE de embarque.
- **Pedido trocado de carga.** Na carga destino ele aparece como pedido que "entrou" (o aviso já tem `entraram`). Mostrar também os itens nesse caso.
- **Dois avisos seguidos** (R.dados.mudou já ocupado): comportamento atual mantido, a nova carga é conferida no próximo ciclo.

---

## 4. ITEM 2: travar o modo

### Decisão de desenho

**O modo travado é DERIVADO das linhas, sem campo novo no schema.**

Por que não um campo: um campo `modoTravado` precisaria ser destravado quando zera. Isso criaria mais um estado a sincronizar entre aparelhos e um segundo lugar para ficar fora de sincronia. Derivar das linhas se corrige sozinho. Mantém o schema intocado (regra: nunca remover campo, e aqui nem adicionar).

**Definições (valem no servidor e no aparelho, com a mesma função):**

- **Linha ativa** = `q > 0` OU `motivo ≠ null`. Não conto só `tocada`, porque o "−" até 0 deixa `t=true` e a pessoa nunca conseguiria zerar.
  - "Não tem" com `q=0` conta como ativa, pois é uma decisão registrada.
- **Só valem as chaves que existem na carga de hoje** (`maxPorChave` no servidor, `idx.pedir` no aparelho). Sem isso, linhas de pedido que saiu ficariam travando o modo e nunca poderiam ser zeradas, porque o toque nelas é ignorado por `FORA_DA_CARGA`.
- **Modo travado** = o escopo das linhas ativas (`CARGA` ou `PEDIDO`). Sem linha ativa = livre.
- **Se houver linha ativa nos dois escopos** (dado legado ou corrida), o modo travado é o escopo da linha ativa com `carimbo` mais recente. As linhas do outro escopo não são apagadas, só deixam de contar.
- **Bolsas** (`estado.pedidos[].b`) NÃO travam sozinhas. Mas com a carga travada em `CARGA` o servidor recusa bolsa maior que 0 (`MODO_TRAVADO`), e o botão "Zerar" também zera as bolsas.
- **Ordem manual/regra de ordem NÃO conta** como "começou". É preferência de lista, sem contagem.
- **Zerar** = o botão "Zerar a contagem desta carga", que zera os DOIS escopos (todas as linhas com q=0, `tocada=false`, sem motivo) e as bolsas. Por que os dois: se zerar só o escopo travado, linhas antigas do outro escopo virariam o novo travamento sem a pessoa entender.
  - Implementação sem rota nova: gera ops `L` e `P` com valor zero e carimbo novo, pelo mesmo `sincronizar`. Funciona offline e é idempotente.
  - Etiquetas AGUARDANDO na fila local desses pedidos são removidas. As já impressas não têm como desfazer. O texto da confirmação diz isso.
- **Carga já concluída.** A conclusão é um evento append-only (modo gravado nela). Não trava por si só. Se a pessoa zerar depois de concluir, o modo destrava e a conclusão antiga continua no histórico. Ver pergunta 4.
- **Cada ferramenta é independente:** lock da Separação nas tabelas `separacao_carga*`, lock da Conferência nas `conferencia_motorista*`, cada uma com seu serviço.

### Servidor: `modoContagem.js` (módulo puro, compartilhado)

Arquivo novo `backend/services/modoContagem.js` (funções puras, sem Prisma):

- `linhaAtiva({q, m})`
- `modoDe(linhasAtivas)` (aplica a regra do carimbo mais recente)
- `decidirLote({ativasBanco, candidatos, bolsas, conclusoes})`, que devolve `{modoFinal, rejeitar:[chaves], motivo:'MODO_TRAVADO'}`

Cada serviço chama no `sincronizar`, **depois** da leitura de `linhasExist` (`separacaoCargaService.js:285-294`) e **antes** de gravar (`:332`). O passo antes da gravação precisa de uma leitura nova: as linhas ativas do banco, com `quantidade>0` OU `motivoFalta` não nulo (uma query com `select chave, escopo, carimboEm`), filtradas por `maxPorChave.has(chave)`.

Algoritmo:

1. Lock antes do lote = `modoDe(ativasBanco)`.
2. Aplica o lote hipoteticamente (só as linhas que realmente seriam gravadas: novas, ou existentes com carimbo menor).
3. Se havia lock `X`: confere se sobra linha ativa em `X` depois do lote. Se não sobra, o lote destrava `X`. Nesse caso as linhas ativas do outro escopo no mesmo lote passam, e o lock vira esse outro.
4. Se havia lock e continua: toda op que ATIVA linha do escopo oposto é rejeitada. Op que zera (`q=0`, sem motivo) do escopo oposto é sempre aceita (limpeza).
5. Se não havia lock: ganha o escopo da op ativa de carimbo mais antigo no lote. As ativas do outro escopo vão para rejeitadas.
6. `P` com `b>0` quando o lock é `CARGA`: rejeitada.
7. `X` (conclusão): se o `modo` for o oposto ao lock final, ignorar com `MODO_TRAVADO`. Se não houver lock, aceita (comportamento de hoje, concluir com tudo zerado já é possível).

Rejeitadas saem de `novasLinhas`/`atualizarLinhas`/`novosPed` e entram em `ignoradas` com `{ref, motivo:'MODO_TRAVADO'}`.

**Corrida entre dois aparelhos.** Não há transação no sync (`separacaoCargaService.js:1-4`). Se dois aparelhos começam modos opostos no mesmo milissegundo, os dois lotes podem passar. A regra "carimbo mais recente" do `modoDe` faz os dois aparelhos convergirem para o mesmo modo na próxima leitura, sem apagar nada. A janela é de milissegundos. Aceitar e documentar. Não usar `$transaction` com a carga inteira.

### Contrato de API

- **Sem status novo de erro.** O sync continua devolvendo 200, porque cliente antigo trata 4xx no sync como "envio parado" e fica em laço.
- **Resposta do `sincronizar` (campos novos, todos aditivos):**
  - `ignoradas[]` pode conter `{ref, motivo:'MODO_TRAVADO'}`.
  - `modoTravado`: `'CARGA' | 'PEDIDO' | null`, na raiz.
  - `estado.modo`: `{travado:'CARGA'|'PEDIDO'|null, desde: iso|null, por: nome|null}`.
- **`baixar`** devolve `estado.modo` (vem do `lerEstado`/`estadoDe`).
- **`estadoDe`** (`separacaoCargaService.js:145-159` e `conferenciaMotoristaService.js:212`) calcula `modo` e o devolve. `lerEstado` precisa filtrar as linhas pelas chaves da carga de hoje. Isso exige `montarCarga` ou uma lista de chaves no `lerEstado`. O dev escolhe o menor custo, pois `sincronizar` já tem `maxPorChave` e `baixar` já chama `montarCarga`.

### Frontend

- **`separacaoCalculo.js`:**
  - `modoTravadoDe(estado, idx)` (mesma regra do servidor, somente chaves de `idx.pedir`).
  - `estadoVazio()` ganha `modo: null`.
  - `mesclarEstado` repassa `modo` (o do servidor vence).
- **Hook `useSeparacaoCarga.js`:**
  - `modoTravado` é calculado do estado local, e se `estado.modo.travado` do servidor vier preenchido, ele também vale.
  - O estado local é a única fonte quando o aparelho está offline.
  - Nova função `zerarContagem()`, que usa `mutar` + `agendarEnvio` + `carimbo` e limpa a fila de etiquetas dos pedidos. Reaproveita o padrão de `tocarLinha` (`:485-500`) e `mudarBolsas` (`:511-526`).
  - Tratamento de `MODO_TRAVADO` no `sincronizar`, logo depois da linha 253 (ver "Lotes offline antigos" abaixo).
- **Páginas (`SeparacaoCargaPage.jsx:26,101` e `ConferenciaMotoristaPage.jsx:54`):**
  - `modo = h.modoTravado ? (h.modoTravado === 'CARGA' ? 'carga' : 'pedido') : modoEscolhido`.
  - O `useFiltroSalvo` do modo passa a valer só como preferência para cargas ainda não iniciadas.
  - Se o modo travado chegar de outro aparelho e for diferente do aberto, troca sozinho e mostra um toast.
  - `escolherModo` do modo oposto, quando travado, abre um modal em vez de ficar mudo.
- **`BarraCarga.jsx:29-32,78-81`:**
  - Props opcionais `modoTravado` e `onModoTravado`. O botão do modo oposto ganha cadeado e a legenda "travado".
  - **Sem as props, o comportamento é idêntico ao de hoje** (a Conferência e qualquer outro uso ficam intactos).
- **`ModalModoTravado.jsx` (novo, componente compartilhado).** Usa as classes `.mdl-f` e `.mdl` já existentes. Botões `.big` de pelo menos 44px.

**Textos (português simples, vão para `textos.js`, com as variantes de cada tela):**

- Título: "Este modo está travado".
- Corpo da Separação: "Você já começou a separar esta carga por 'Carga inteira'. Para não contar a mesma coisa duas vezes, ela continua assim até o fim."
- Corpo da Conferência: o mesmo, com "conferir" no lugar de "separar" e o modo correspondente.
- "Para trocar o jeito, é preciso zerar a contagem desta carga."
- Botões: "Entendi" e "Zerar a contagem".
- Confirmação do zerar: "Apagar toda a contagem desta carga? As bolsas voltam para 0. Etiquetas que já saíram na impressora não voltam atrás." Botões "Voltar" e "Sim, zerar".

### Lotes offline antigos e o servidor

Cenário: o aparelho B ficou sem internet contando "Por pedido", enquanto o aparelho A (com internet) travou a carga em "Carga inteira".

- O servidor rejeita só as ops que ativam linhas do modo oposto. Ignora com `MODO_TRAVADO` e aplica todo o resto do lote (bolsas zero, ordem, concluir do modo certo, e tudo que não conflita).
- **O aparelho B precisa tratar isso** (hoje descartaria a op da fila e deixaria a contagem fantasma na tela):
  - Em `sincronizar`, depois de receber `resp.ignoradas`, as de `MODO_TRAVADO` são removidas de `d.estado.linhas`/`d.estado.pedidos` local e guardadas em `d.recusadas` (`{chave, nome, q, motivo, modoRecusado}`).
  - Mostra o modal "Este aparelho foi recusado" (componente novo `AvisoModoRecusado.jsx`): "Outra pessoa já começou esta carga por 'Carga inteira'. O que você contou 'Por pedido' neste aparelho não entrou. Conte de novo no modo travado." Lista o que foi recusado (produto, pedido, quantidade) para a pessoa poder refazer.
  - O modal só fecha com "Entendi". `d.recusadas` limpa depois.
- **Cliente antigo** (PWA com JS em cache): ele não lê `ignoradas`, então o toque some da fila e fica só na tela dele. O servidor continua correto (garantia de integridade), mas a tela dele fica com um número que o servidor não tem. O service worker atualiza na abertura, então a janela é curta. Documentar na nota de entrega. Não é possível proteger o cliente velho no servidor sem quebrar o contrato.

### Casos de borda

- **Dois aparelhos, mesma carga, mesmo modo.** Sem nenhuma mudança de comportamento.
- **Zerar enquanto outro aparelho ainda tem toque na fila.** O toque do outro aparelho com carimbo mais novo reativa a linha. O lock reaparece, com o modo da linha reativada. Isso é coerente, o servidor decide.
- **Carga concluída.** Ver pergunta 4.
- **Legado "misto"** (cargas que o dono testou nos dois modos): o `modoDe` pega o escopo da linha ativa mais recente. **Antes de publicar, o dev-backend roda um diagnóstico read-only** que lista cargas com linhas ativas nos dois escopos, para ninguém ser surpreendido.
- **Conferência:** `exigirAcesso` permanece como está. Admin vê e escreve em qualquer carga. O motorista só na dele.

---

## 5. ITEM 3: balões de apresentação (tour)

### Decisão de desenho

- **Componente único**: `frontend/src/components/TourBaloes/TourBaloes.jsx` (genérico, sem nada de Separação dentro).
  - Props: `passos[]`, `aberto`, `titulo`, `segundosLeitura` (padrão 10), `onFim`, `onPular`, `modoRever` (no modo "rever", o botão libera na hora).
  - Passos são dados: `{id, desde, titulo, texto, modelo}`, onde `modelo` é um componente React com a mini-tela.
- **Hook** `useTourVisto(tourId, versao)`: devolve `{deveMostrar, marcarVisto, adiar, rever}`. Mora em `frontend/src/components/TourBaloes/useTourVisto.js`.
- **Conteúdo** (passos e modelos) em arquivos separados: `.../SeparacaoCarga/tourSeparacao.jsx` e `.../SeparacaoCarga/tourConferencia.jsx`. Os modelos usam o CSS `.sepc` que já existe.
- **Sem seta apontando para elementos reais da tela.** O balão é um cartão grande com o modelo ilustrado dentro dele. Os modelos são HTML/CSS próprios, não o DOM real. Por isso o tour independe de ter carga aberta, de estar com dados e de layout, e nunca toca nos dados reais. Isso importa porque quem já tem contagem em andamento também vê o tour.
- **Temporização: SEM avanço automático. Botão "Entendi" só libera depois de 10 s.**
  - Justificativa: o dono tem visão ruim e a pergunta é "Entendeu?". Auto-avanço em 15 s tiraria o balão de quem lê devagar, e a pergunta perderia o sentido. O texto do balão não some.
  - Mostrar um anel/barra de contagem ("Leia com calma… 7") e o botão desabilitado com legenda "Entendi (libera em 7 s)".
  - Depois de liberado: **"Entendi, próximo ▸"** (primário) e **"◂ Voltar"** (secundário).
  - Também **"Não entendi, ler de novo"**, que reinicia a contagem e a animação do modelo.
  - Ao rever pelo "?", os botões já nascem liberados.
  - A contagem usa `Date.now()` e só conta com a aba visível (pausa em `visibilitychange`).
  - Animação só com `opacity`/`transform` (regra do CLAUDE.md), com `prefers-reduced-motion` respeitado. Sem animar `box-shadow`.
- **"Pular":** link pequeno (44px) depois do 1º balão. Abre confirmação "Sem ver, você pode perder regras importantes, como a trava do modo. Pular mesmo?". Pular conta como adiado: o tour volta nas próximas 2 aberturas da tela e depois é marcado como visto (pergunta 1).
- **Quando mostra:**
  - Ao abrir a tela, se `deveMostrar` for verdadeiro, **depois** de `h.abrindo === false` e sem `dados.mudou` nem `confirmar` abertos.
  - Funciona na tela de escolher carga e na carga aberta.
  - Quem já tem contagem em andamento recebe o balão 1 com variante: "Você já usa esta tela. Vamos mostrar rapidinho como funciona, incluindo uma regra nova."
- **Rever depois: botão "?"** no `.prog .l1`, ao lado de "Só o que falta" (círculo de 2.6em, mesmo estilo do `.vt`), e também no cabeçalho da tela "sem carga aberta" (`SeparacaoCargaPage.jsx:117`). Se o teste em 320px com A+ no máximo mostrar aperto, o plano B é um botão "Instruções" dentro do painel da barra (`BarraCarga.jsx`, perto de "Tamanho da letra"). O QA decide.
- **Entra no cache offline:** o componente e os dois tours entram por `import` estático (no mesmo chunk da página). NÃO usar `import()` dinâmico para eles, senão não estariam no cache do service worker quando a pessoa abrir a tela sem internet. Se por tamanho tiver que ser dinâmico, adicionar no `aquecerCache` (`useSeparacaoCarga.js:47-63`).
- **Versão do tour.** Cada passo tem `desde: <versão>`. Se um dia entrar um passo novo, quem já viu a versão anterior só vê os novos. A versão inicial é 1.

### Onde guardar "já viu" (por usuário)

**Recomendação: híbrido, localStorage como fonte principal e espelho no servidor.**

- **localStorage** (`tour:v1:<userId>:<tourId>` com `{versao, vistoEm, adiadoAte, pulos}`):
  - Obrigatório. O separador na câmara não tem internet, e o aparelho sempre sabe se já mostrou.
  - Usa o `user.id` do snapshot offline, que existe (`rotasOffline.js`).
- **Servidor** (espelho, melhor esforço): para o usuário que usa **2 aparelhos** ou limpou o cache.
  - Tabela nova **aditiva** `UsuarioTourVisto` (`id`, `vendedorId`, `tourId`, `versao`, `vistoEm`, `@@unique([vendedorId, tourId])`).
  - Rotas `GET /api/tour/vistos` e `POST /api/tour/visto` (upsert idempotente). Só `authMiddleware`, sem permissão extra (então não há o que espelhar entre front e back).
  - Rota nova em `backend/routes/tourRoutes.js`, montada em `backend/index.js` com uma linha. `index.js` hoje tem alteração não commitada, então o dev adiciona só a linha dele e confere `git diff` antes.
  - Fluxo: local diz "já viu" = não mostra. Local diz "não viu" e está online = espera até 2 s a resposta do `GET`. Se o servidor diz "viu", copia para o local e não mostra. Offline = decide só pelo local, sem esperar.
  - Ao marcar como visto, grava local na hora e tenta o `POST`. Se falhar, marca `pendenteEnvio` e tenta de novo na próxima abertura.
- **Alternativa mais enxuta (se o dono quiser menos código):** só localStorage. A consequência é o tour reaparecer uma vez em aparelho novo ou depois de limpar o cache. Não quebra nada.
- O `tourId` é `'separacao'` ou `'conferencia'`, e cada um é independente, como o dono pediu.

### Textos dos balões

Regra de escrita: frases curtas (até uns 25 palavras), sem jargão, no máximo 3 frases. O texto herda o `font-size` do `.sepc` (A−/A+), então escala com o tamanho de letra que a pessoa escolheu.

**Tour da SEPARAÇÃO (10 balões)**

1. **"Bem-vindo à Separação"** (modelo: tela de escolher carga com 2 cartões "Carga #12 · João · sai 24/11 · 8 pedidos").
   "Aqui você separa a carga na câmara fria. Vamos ver, em poucos passos, como funciona."
   - Variante para quem já usa: "Você já usa esta tela. Vamos mostrar rapidinho como funciona, com uma regra nova."
2. **"Abra com internet"** (modelo: barra verde escura "Carga #12 · João" com o texto "baixada no aparelho").
   "Antes de entrar na câmara, toque na carga com internet. O aparelho guarda tudo e você pode ficar sem sinal."
3. **"Os três números"** (modelo: linha "Coxinha — SEPARAR 10 · SEPAREI 4 · FALTA 6", com pins 1 a 3).
   "SEPARAR é o que a carga pede. SEPAREI é o que você já pegou. FALTA é o que ainda não pegou."
4. **"Como contar"** (modelo: botões − , + e "✓ Separei tudo").
   "Toque no + para somar um. Pegou tudo? Toque em 'Separei tudo'. Também dá para digitar o número."
5. **"Faltou alguma coisa?"** (modelo: linha âmbar com "Falta 6. Por quê?" e os botões "Vem depois" / "Não tem").
   "Diga o motivo: 'Vem depois' ou 'Não tem'. Isso só fica anotado. Não mexe em pedido nem em nota."
6. **"Dois jeitos de separar"** (modelo: os dois botões de modo lado a lado).
   "'Carga inteira' soma tudo por produto. 'Por pedido' separa um cliente por vez, em bolsa térmica."
7. **"Escolheu, fica"** (modelo: os dois botões de modo, um com cadeado e a legenda "travado").
   "Começou a contar em um jeito? O outro fica travado, para não contar duas vezes. Para trocar, toque em 'Zerar a contagem'."
8. **"Bolsas e etiquetas"** (modelo: bloco "Quantas bolsas deu este pedido?" com o número 3 e "Imprimir 3 etiquetas").
   "No 'Por pedido', diga quantas bolsas deu. Sai uma etiqueta para cada bolsa."
9. **"Sem internet"** (modelo: faixa escura "sem internet · 5 toques guardados" e faixa "3 etiquetas guardadas").
   "Sem sinal tudo bem: o aparelho guarda. Ao sair da câmara, ele envia sozinho. As etiquetas só saem quando você tocar em 'Imprimir agora'."
10. **"Se mudarem a carga" e "Concluir"** (modelo: o aviso "A carga mudou" com "Saiu: 10 Coxinha, 6 Bolinha"; embaixo o botão "Concluir separação da carga").
    "Se o escritório tirar um pedido, aparece um aviso mostrando a mercadoria que saiu. O que você já contou nos outros pedidos fica. Terminou? Toque em 'Concluir separação'. Para rever, toque no '?' no alto."

**Tour da CONFERÊNCIA (motorista) (10 balões)**

1. **"Bem-vindo à Conferência"** (modelo: cartões de carga).
   "Aqui você confere, antes de sair, se o que está no caminhão é o que a carga pede."
   - Variante para quem já usa: "Você já usa esta tela. Vamos mostrar rapidinho como funciona, com uma regra nova."
2. **"Abra com internet"** (modelo: barra verde escura "baixada no aparelho").
   "Abra a sua carga com internet. Depois pode ficar sem sinal que o aparelho guarda tudo."
3. **"Os três números"** (modelo: "Coxinha — LEVAR 10 · CONFERI 4 · FALTA 6").
   "LEVAR é o que o pedido manda. CONFERI é o que você já viu no caminhão. FALTA é o que ainda não viu."
4. **"Como conferir"** (modelo: botões −, + e "✓ Conferi tudo").
   "Toque no + para somar um. Viu tudo? Toque em 'Conferi tudo'. Também dá para digitar o número."
5. **"O que a separação avisou"** (modelo: faixa âmbar na linha: "Separação avisou: falta 6 — não tem").
   "Quando a câmara fria avisou que faltou algo, aparece uma faixa amarela na linha. Ela mostra só o que faltou, não quanto foi separado."
6. **"Faltou alguma coisa?"** (modelo: botões "Vem depois" / "Não veio").
   "Se não veio, escolha 'Não veio' ou 'Vem depois'. Isso fica anotado para o escritório."
7. **"Escolheu, fica"** (modelo: botões de modo com cadeado).
   "'Carga inteira' soma por produto. 'Por pedido' confere um cliente por vez. Começou em um? O outro trava. Para trocar, 'Zerar a contagem'."
8. **"Bolsas e etiquetas"** (modelo: bloco de bolsas).
   "No 'Por pedido', diga quantas bolsas leva cada pedido. Sai uma etiqueta por bolsa."
9. **"Sem internet e carga que mudou"** (modelo: faixa escura + aviso "A carga mudou").
   "Sem sinal, o aparelho guarda e envia sozinho depois. Se o escritório tirar um pedido da sua carga, aparece um aviso com o que saiu. Essa nota pode ser devolvida no caixa ou ir para outra carga."
10. **"Concluir"** (modelo: botão "Concluir conferência da carga").
    "Terminou? Toque em 'Concluir conferência'. As faltas ficam registradas. Para rever, toque no '?' no alto."

### Descrição dos modelos de tela (mini-telas)

Cada modelo é uma função React pequena que devolve HTML estático dentro de `<div className="sepc-q" aria-hidden>`, reaproveitando as classes que já existem:

- **Linha de contagem** (balões 3, 4, 5): `.it` com `.nm`, três `.q`, `.acts` com `.rd` e `.tudo`, e `.mot` para o motivo. Pins numerados dourados (classe nova `.pin` em `TourBaloes.css`) sobre os elementos.
- **Barra da carga:** `.cab` (verde-escuro) com `.tx` e `.tr`, e `.prog` com a barra de progresso.
- **Modos:** `.modo` com 2 botões, um com `.on`. O cadeado é um ícone do lucide-react (`Lock`) no botão oposto, com a legenda "travado".
- **Faixas:** `.aviso-a` (âmbar), `.fila.off` (escura), `.avs` (aviso da Separação).
- **Modal "A carga mudou":** `.mdl` com `<ul>`, mostrando "Saiu o pedido #1234 · Padaria Central" e "10 Coxinha / 6 Bolinha".
- **Bolsas:** `.bol` com `.nb` e o botão de imprimir.
- **Cartão de carga:** `.cg`.

Os modelos vivem dentro do tour (nunca tocam dados reais) e são estáticos, sem timers próprios. A única animação é um pulso de `opacity` no elemento destacado do balão. O CSS novo fica em `TourBaloes.css`, escopado em `.tour` (sem estilo global).

### Telas pequenas e A+

- O balão é um cartão com `max-height: calc(100dvh - 2rem)` e rolagem interna. Texto em cima e modelo embaixo (ou o modelo recolhido quando a altura da tela for menor que 520px, mostrando só o texto).
- Botões com pelo menos 44px, `width:100%` no celular, em coluna: "Entendi, próximo" em cima, "Voltar" embaixo.
- O texto usa o `em` herdado do `.sepc`, então A+ funciona. O `letra` já é limitado por largura (`SeparacaoCargaPage.jsx:48`), então em 375px com A+ máximo o cartão não estoura.
- `z-index` acima de `.mdl-f` (90), por exemplo 100, e com o fundo escurecido.
- O QA testa em 320, 375 e 768px com a letra no mínimo e no máximo.

---

## 6. O que muda na Separação em uso (idealmente só aditivo) e como provar que nada quebra

**O que mexe no que está em uso:**

- `SeparacaoCargaPage.jsx`: o `modo` deixa de ser só a preferência salva e passa a obedecer o travamento.
- `BarraCarga.jsx`: botões de modo com props opcionais.
- `useSeparacaoCarga.js`: tratamento de `MODO_TRAVADO`, `zerarContagem`, `saidas`.
- `AvisoCargaMudou.jsx`: mais texto.
- Servidor: filtro de lote no `sincronizar`, que é o ponto de maior risco.

**Todo o resto é aditivo:** campos novos na resposta, tabela nova do tour, nenhuma coluna removida, nenhuma rota removida, nenhum campo renomeado.

**Prova de que nada quebra:**

1. **Contrato.** `curl` do `sincronizar` com um lote exatamente igual ao que o app atual manda (sem modo, só linhas de um escopo). Resposta idêntica à de hoje, mais os campos aditivos. Salvar as duas respostas e comparar.
2. **Teste de unidade da regra.** Script `backend/scripts/teste-modo-contagem.js` (mesmo padrão do `teste-conferencia-carga.js`), cobrindo os casos da seção 4: lote que começa, lote que conflita, lote que zera e destrava, lote com `X` do modo oposto, bolsas, linhas fora da carga, legado misto.
3. **Regressão da Separação.** Reexecutar o roteiro QA existente (`docs/separacao-carga/qa`) inteiro: dois modos, ordem, falta com motivo, bolsas, concluir, duas pessoas, carga mudando, offline com reload.
4. **Dados antigos.** Abrir, num aparelho de teste, uma carga guardada antes do deploy (sem `saidas`, sem `modo`). A tela tem que abrir normal e continuar de onde parou.
5. **Cliente velho × servidor novo.** Mandar um lote "antigo" por `curl` e conferir que o servidor responde 200, aplica o que não conflita e devolve `MODO_TRAVADO`.
6. **Build do frontend** (`cd frontend && npm run build`) antes de qualquer commit.
7. **Diagnóstico read-only em produção, antes de publicar:** quantas cargas têm linhas ativas nos dois escopos. Se houver, avisar o dono antes.

---

## 7. Frentes (dev-backend ∥ dev-frontend) e o contrato exato entre elas

### dev-backend

1. `backend/services/modoContagem.js` (puro) + `backend/scripts/teste-modo-contagem.js`.
2. Integrar o filtro nos DOIS serviços (`separacaoCargaService.sincronizar` e `conferenciaMotoristaService.sincronizar`), mais `estadoDe`/`lerEstado` com `modo`.
3. Camada B (opcional): `embarques.js:501-545` e `cargaRetiradosHelper.js`, `retirados` em `montarCarga` dos dois serviços.
4. Tour: tabela `UsuarioTourVisto` (aditiva, `schema.prisma`), `backend/routes/tourRoutes.js` e uma linha em `backend/index.js`. `prisma db push` sem `--accept-data-loss`.
5. Docs: atualizar `docs/separacao-carga/PLANO.md`, `docs/conferencia-motorista/PLANO.md` (contrato) e os manuais `backend/manuais/abas/separacao-carga.md` e o equivalente da Conferência. A tabela `ABAS` em `copilotoService.js` só muda se rota ou permissão mudar (não muda).
6. Diagnóstico read-only de "cargas com modo misto".

### dev-frontend

1. `TourBaloes` (componente, hook, CSS) + `tourSeparacao.jsx` + `tourConferencia.jsx` + botão "?".
2. `separacaoCalculo.js` (`modoTravadoDe`, `mesclarEstado` com `modo`, helper de sobras), `textos.js`, `ModalModoTravado.jsx`, `AvisoModoRecusado.jsx`, `SaidasDaCarga.jsx`.
3. `useSeparacaoCarga.js` (`zerarContagem`, `MODO_TRAVADO`, `saidas`), `BarraCarga.jsx`, as duas páginas.
4. Build e verificação em 320, 375 e 768px.
5. `frontend/public/novidade-separacao-onda-2.html` (com mockups e legendas numeradas, accordions abertos, sem `og:image`, sem botão "Abrir o app") e entrada no topo de `frontend/public/novidades.json`.

### Contrato exato entre as frentes

**Resposta do sync** (`POST .../sincronizar`):
```
{ ok, agora, versao, assinatura, aplicadas,
  ignoradas: [ { ref, motivo } ],        // motivo novo: 'MODO_TRAVADO'
  modoTravado: 'CARGA' | 'PEDIDO' | null, // novo, aditivo
  conclusaoRegistrada, estado }
```

**`estado.modo`** (em `baixar` e no sync): `{ travado: 'CARGA'|'PEDIDO'|null, desde: iso|null, por: string|null }`. Novo, aditivo. O front trata ausência como `null`.

**`carga.retirados[]`** (em `baixar` e no sync), opcional: `{ pedidoId, etiqueta, cliente, cidade, retiradoEm: iso, retiradoPorNome, itens: [ { nome, unidade, quantidade } ] }`. O front trata ausência como `[]`.

**`POST /api/tour/visto`** com `{ tourId: 'separacao'|'conferencia', versao: int }` → `200 { ok: true }`, idempotente. **`GET /api/tour/vistos`** → `{ vistos: [ { tourId, versao, vistoEm } ] }`.

**Semântica de "linha ativa", "zerar" e do `modo`:** a da seção 4. O front e o back usam a mesma definição. O dev-backend publica os exemplos do teste de unidade e o dev-frontend usa os mesmos casos no seu helper.

**Ordem:** o back sai primeiro, porque o front depende do contrato. O front pode começar em paralelo com mocks desses campos. O tour e o aviso (itens A) do front não dependem do back.

---

## 8. Critérios de aceite (clicáveis)

**Item 1 (aviso e produtos que saíram):**
1. Com a Separação aberta e um pedido tirado da carga pelo escritório, o aparelho abre o aviso "A carga mudou" e mostra, para o pedido que saiu, o cliente, a etiqueta e a lista "10 Coxinha, 6 Bolinha".
2. Em "Carga inteira", com mais separado do que a carga agora pede, o aviso diz quanto tirar de volta.
3. Em "Por pedido", se o pedido que saiu tinha bolsas, o aviso diz quantas.
4. Depois do "OK", a faixa "Saiu o pedido X" continua na tela até tocar em "Já tirei". Reabrir a tela não a faz sumir.
5. O que foi contado nos outros pedidos continua igual depois do aviso.
6. Mesma coisa com a separação já concluída e com o aparelho que voltou do modo offline.
7. Na Conferência, o motorista que abre a carga depois da remoção vê o pedido que saiu (se a camada B for aprovada).

**Item 2 (trava):**
1. Começar a contar em "Carga inteira": o botão "Por pedido" mostra cadeado e, ao tocar, abre o modal com a explicação. A contagem não é perdida.
2. O inverso também.
3. Tocar em "Zerar a contagem" e confirmar: tudo volta a 0, bolsas a 0, os dois botões de modo ficam livres.
4. Zerar tudo "no braço" (linha por linha) até 0 também destrava.
5. Em outro aparelho, com a mesma carga, o botão do modo oposto também aparece travado (depois do sync).
6. Lote offline de modo oposto: o servidor responde 200, aplica o que não conflita, e o aparelho mostra o modal "Este aparelho foi recusado" com a lista.
7. Separação travada em "carga" e Conferência do motorista em "pedido" na mesma carga: as duas funcionam, porque são independentes.
8. A mensagem aparece em português simples, nas duas telas, com o verbo certo ("separar" ou "conferir").

**Item 3 (tour):**
1. Primeira abertura (usuário sem registro): o balão 1 aparece e o botão "Entendi" só libera depois de 10 s. O balão não some nem avança sozinho.
2. Quem já tem contagem em andamento e nunca viu o tour também vê, com a variante do balão 1, e a contagem não é alterada.
3. "Não entendi, ler de novo" reinicia a contagem. "Voltar" volta ao balão anterior.
4. "Pular" pede confirmação e, nas 2 aberturas seguintes, o tour reaparece.
5. Terminar o tour: não aparece mais, nem depois de fechar e abrir, nem em outro aparelho do mesmo usuário (com internet).
6. O botão "?" reabre o tour e libera o "Entendi" na hora.
7. O tour funciona sem internet (modo avião) depois de aberto uma vez com sinal.
8. Separação e Conferência têm tours independentes: ver um não marca o outro.
9. Em 375px e com A+ no máximo, o cartão cabe na tela, o texto é legível e os botões têm pelo menos 44px, sem rolagem horizontal.

---

## 9. Cenários de QA

1. **Trava, 1 aparelho:** contar 1 linha em "Carga inteira", tentar "Por pedido" (barrado). Zerar e trocar (liberado).
2. **Trava, 2 aparelhos:** A trava em "carga"; B (sem sinal, já tinha a carga) conta em "pedido"; religar o sinal em B. Esperado: o modal de recusa, e nada de A foi perdido.
3. **Destravar ao zerar:** tanto pelo botão quanto linha por linha. Conferir o caso "Não tem" (q=0 com motivo), que mantém o travamento.
4. **Offline:** travar sem internet, fechar o app, reabrir sem sinal. A trava continua. Religar e enviar: o servidor concorda.
5. **Carga já concluída:** zerar uma carga concluída e conferir o comportamento (pergunta 4). Concluir de novo.
6. **Pedido que sai com a Separação em andamento:** conferir se o aviso lista os produtos, se a contagem dos outros pedidos fica, e se a faixa persiste.
7. **Pedido sai com a separação concluída e com o aparelho offline** (voltar o sinal depois).
8. **Pedido que sai, e o pedido some do lock:** contar só um pedido no "Por pedido", remover o pedido da carga e conferir que o modo destrava (linhas de pedido que não existe mais não travam).
9. **Tour para quem já tem contagem:** usuário com carga em andamento abre a tela e vê o tour. Concluir o tour. A contagem segue intacta.
10. **Tour, 2 aparelhos:** ver no aparelho A e abrir no B, online. Não deve reaparecer.
11. **Tour offline:** primeiro uso sem internet. Aparece, e o "visto" é enviado quando o sinal voltar.
12. **Regressão** do roteiro completo da Separação e da Conferência.
13. **320, 375, 768px, letra mínima e máxima:** tour, modais novos, o "?" no `.prog`, a faixa "Saiu da carga".
14. **Cliente antigo:** lote antigo via `curl`, esperando 200 e `MODO_TRAVADO` sem erro.

---

## 10. Riscos

1. **Filtro de lote no servidor.** É o ponto mais sensível, porque a Separação está em uso real. Mitigação: módulo puro com teste de unidade, comparação de respostas antes/depois, e publicar fora de horário de pico. Se der problema, um interruptor por variável de ambiente (`MODO_TRAVADO_ATIVO`, padrão ligado) desliga só a rejeição no servidor, sem derrubar o resto. Sugestão ao dev-backend; confirmar antes de implementar.
2. **Cliente antigo em cache.** Ele não lê `MODO_TRAVADO` e fica com contagem fantasma na tela. O servidor continua íntegro. Janela curta (o SW atualiza).
3. **Corrida de milissegundos** entre dois aparelhos que começam modos opostos. A convergência pelo `modoDe` evita o travamento, sem perda de dados. Aceito.
4. **Dado legado "misto".** Diagnóstico antes de publicar. O botão "Zerar" zera os dois escopos para evitar o travamento surpresa.
5. **Camada B** edita `routes/embarques.js`, que é de outra área e tem alteração não commitada na árvore. O dev edita só o trecho do `DELETE` e confere `git diff` antes e depois. Se ficar arriscado, cortar a camada B e ficar só com A + A2 (o aviso continua útil).
6. **Remoções fora do DELETE** (cancelamento, devolução, `pedidoController.js:1889`, `adminExec.js`) só aparecem pela camada A. Não li esses pontos.
7. **O tour no cache offline.** Se o componente for carregado de forma preguiçosa, não abre sem internet. Usar `import` estático (ver seção 5).
8. **Layout apertado do "?"** no `.prog .l1` em 320px com A+ no máximo. QA decide, com plano B no painel.
9. **`index.js` com mudança não commitada** (sessões paralelas). O dev adiciona só a linha da rota do tour, usando `git add` explícito e conferindo `git diff --cached --stat` vazio antes.
10. **Esquema.** Só uma tabela nova (aditiva). `prisma db push` sem `--accept-data-loss`. Nenhum campo removido.

### O que NÃO fazer (armadilhas desta área)

- **Não** tirar a lógica de "tirar pedido da carga" da liberdade em que está. O pedido do dono é só avisar.
- **Não** apagar a contagem dos outros pedidos quando um pedido sai.
- **Não** devolver 409/4xx no `sincronizar` para a trava (cliente antigo entra em laço de "envio parado").
- **Não** contar `tocada` como "começou" (impede de destravar com o "−").
- **Não** contar linhas de pedido que já saiu da carga como travamento.
- **Não** colocar `retirados` na `assinatura` (gera o modal "A carga mudou" em loop).
- **Não** criar campo novo "modo da carga" no schema, nem remover ou renomear campo.
- **Não** usar `window.open` ou iframe para nada do tour. É só um overlay na própria página.
- **Não** animar `box-shadow` no balão (regra de CSS do projeto).
- **Não** carregar o tour com `import()` dinâmico sem aquecer o cache.
- **Não** usar `<select>` nativo novo (se algum seletor surgir, usar `SelectBusca`).
- **Não** esquecer: manual da aba (`backend/manuais/abas/`), Clippy, `novidade-*.html` e `novidades.json`.

---

## 11. Porte, estimativa e o que só se prova em aparelho real

**Porte: GRANDE.** Regra no servidor sobre tela em uso real, schema aditivo, fluxo offline. Equipe completa: arquiteto → dev-backend ∥ dev-frontend → qa-testador + revisor-codigo → gerente-entrega.

**Estimativa (dias-pessoa):**

| Parte | Dias |
|---|---|
| Backend: `modoContagem` + teste + integração nos 2 serviços + diagnóstico | 1,5 |
| Backend: tour (tabela + 2 rotas) | 0,5 |
| Backend: camada B (`retirados` + log com itens) | 0,5 |
| Frontend: trava (cálculo, hook, `BarraCarga`, 2 páginas, 2 modais, "Zerar") | 1,5 |
| Frontend: aviso (itens, sobras, faixa persistente) | 1 |
| Frontend: componente do tour + 2 tours (20 balões e modelos) + "?" | 3 |
| QA (inclusive offline, 2 aparelhos, 3 larguras) | 2 |
| Revisão de código + gerente + novidade + manuais | 1 |
| **Total** | **~8 a 9 (≈ 5 dias corridos com backend e frontend em paralelo)** |

**Só se prova em aparelho real (o navegador automatizado não substitui):**

- iPhone/iPad (PWA instalada): o tour em tela pequena e A+; o toque nos botões de 44px; o contador do tour com a tela apagando e voltando (pausa e retoma).
- Sem sinal de verdade na câmara fria: o tour de primeira vez offline; o envio ao voltar o sinal; o modal de lote recusado.
- Dois aparelhos reais na mesma carga com modos opostos.
- Impressora Zebra: continuar saindo "BOLSA n de N" depois do "Zerar" (a fila de etiquetas é mexida).
- Legibilidade com a visão do dono, em A+ máximo. Só ele valida.
- **Regra do projeto de teste em produção:** o tour grava no servidor (tabela nova). Testar gravar → publicar de novo → ler, como pede o CLAUDE.md. O tour não grava arquivo, mas a tabela e as rotas são do servidor.

---

## 12. Perguntas ao dono (só o que depende dele)

1. **Dá para pular o tour?** Recomendo: sim, com confirmação, e o tour volta nas próximas 2 aberturas (depois disso considera visto). Assim ninguém fica preso, mas ninguém escapa de ver as regras novas. Alternativa: não deixar pular nunca (risco: um separador com pressa e a fila parada).
2. **O botão "Zerar a contagem" pode apagar também as bolsas já informadas?** Recomendo: sim, com uma confirmação grande ("Apagar toda a contagem desta carga?"). As etiquetas que já saíram na impressora não voltam atrás, e a tela avisa isso. Sem apagar as bolsas, a pessoa zera as linhas mas continua vendo bolsas de uma contagem que não existe mais.
3. **O aviso de pedido que saiu deve ser guardado no servidor, para o motorista que abrir a carga depois também ver?** Recomendo: sim (camada B, cerca de meio dia a mais). Sem isso, só vê quem já estava com a carga aberta no aparelho. É o caso do motorista que a separação já deixou separada para um pedido que depois foi tirado.
4. **Carga com separação já concluída: pode zerar a contagem e trocar de modo?** Recomendo: sim, como já é permitido ajustar e concluir de novo, com a mensagem "A separação já estava concluída. Será preciso concluir de novo." Alternativa: bloquear o zerar depois de concluída (mais rígido, mas aí o dono tem de pedir ajuda ao escritório para corrigir).

---

## Arquivos relevantes (todos em `~/Projetos/CA-Hardt`)

- `docs/separacao-carga/PEDIDO-ONDA-2.md` (pedido original, com as palavras do dono)
- `frontend/src/pages/Logistica/SeparacaoCarga/useSeparacaoCarga.js`
- `frontend/src/pages/Logistica/SeparacaoCarga/SeparacaoCargaPage.jsx`
- `frontend/src/pages/Logistica/SeparacaoCarga/BarraCarga.jsx`
- `frontend/src/pages/Logistica/SeparacaoCarga/AvisoCargaMudou.jsx`
- `frontend/src/pages/Logistica/SeparacaoCarga/separacaoCalculo.js`
- `frontend/src/pages/Logistica/SeparacaoCarga/separacaoStorage.js`
- `frontend/src/pages/Logistica/SeparacaoCarga/textos.js`
- `frontend/src/pages/Logistica/SeparacaoCarga/separacaoCarga.css`
- `frontend/src/pages/Logistica/ConferenciaMotorista/ConferenciaMotoristaPage.jsx`
- `backend/services/separacaoCargaService.js`
- `backend/services/conferenciaMotoristaService.js`
- `backend/routes/separacaoCarga.js`
- `backend/routes/conferenciaMotorista.js`
- `backend/routes/embarques.js` (remoção de pedido, linhas 501-545)
- `backend/prisma/schema.prisma` (linhas 5367-5516)
- `frontend/src/utils/rotasOffline.js`
- `frontend/src/components/Clippy/Clippy.jsx` (padrão de "visto" só local)