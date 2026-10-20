# Nota de entrega — E3: etiquetas direto na Zebra ("Imprimir na Zebra")

**Data:** 20/10/2026 · **Veredito do portão de entrega:** LIBERADO COM PENDÊNCIA
(pode publicar; o que só se prova na Zebra de verdade está listado no roteiro abaixo).

---

## O que mudou (em termos de uso)

Nos três lugares onde a equipe imprime etiqueta hoje, o botão único "Imprimir" virou **dois botões**:

| Onde | Botão verde cheio | Botão de contorno verde |
|---|---|---|
| PCP → Etiquetas → tela de imprimir um produto | **Imprimir na Zebra** | **Imprimir pelo navegador** |
| PCP → Etiquetas → janela "Imprimir" da lista | **Imprimir na Zebra** | **Imprimir pelo navegador** |
| Pedidos Online → Kit Festa → Etiquetas das caixas, e o ícone de impressora no card do Delivery | **Imprimir na Zebra** | **Imprimir pelo navegador** |

- **Imprimir na Zebra** (novo): a etiqueta vai direto para a impressora da cozinha, pela mesma fila que já imprime as etiquetas de recheio/massa (E1/E2). **Não abre janela de impressão, não pede papel nem escala.** O desenho é exatamente o de hoje: o app "fotografa" a etiqueta que aparece no preview em preto-e-branco, na resolução da Zebra, e manda a foto. A tela mostra o andamento: *Preparando → Na fila → Imprimindo → Saiu*. Deu erro ou a fila travou: aparecem **Tentar de novo** e **Cancelar e imprimir pelo navegador** (cancela antes, para não sair em dobro quando o PC voltar).
- **Imprimir pelo navegador** (antigo): é o caminho de ontem, sem nenhuma alteração. Continua abrindo a janela de impressão, com as mesmas regras de papel e escala 100%.

**O que fica desabilitado no botão da Zebra, e por quê:**
- Tamanho **80 × 100** — não existe impressora cadastrada para esse rolo. Aparece um aviso com o atalho **"Usar 100×120"**.
- Modelo **Clássico** — esse desenho só existe em 80 × 100. Aviso com o atalho **"Usar ANVISA"**.
- Nos dois casos o **Imprimir pelo navegador continua funcionando** igual a antes.
- Caixas: acima de 60 etiquetas pede confirmação; acima de 240 (rolo de 2 colunas) não vai pela Zebra — divide em dois envios ou usa o navegador.

**Em Configurações → Impressoras** (só administrador):
- Novo botão **Teste de imagem** em cada impressora: prova que ela aceita etiqueta em imagem.
- Em Editar → **Ajustes finos (imagem)**: *Inverter imagem* (se a pequena sair em negativo), *Compressão* Z64/HEX (se a grande não imprimir nada), *Deslocar para a direita/para baixo*. Tudo isso se corrige **sem publicar nada novo**.
- A Fila agora diz o que é cada trabalho ("Etiqueta de produto — COXINHA FRANGO · fab 20/10", "Caixa Kit Festa/Delivery — Pedido #1234").

Quem pode usar: a mesma permissão de cada tela (Etiquetas do PCP, Kit Festa, Delivery). O servidor confere por área; o botão não libera nada a mais.

---

## O que foi testado, e por quem

- **Build do frontend**: passou (5,8 s). **90 testes do backend**: 90/90. **Schema**: válido, só acrescenta um campo (`referencia` na fila); nada removido.
- **Caminho antigo**: o arquivo que imprime pelo navegador e o que monta as etiquetas das caixas **não têm uma linha alterada** (diff vazio). O QA conferiu que o "Imprimir pelo navegador" chama `window.print` uma vez, como antes.
- **Comparação do desenho** (spike, `evidencias-e3/spike/`): referência × imagem sobrepostas, para ANVISA 100×120 (nome curto e longo), 80×100, Clássico, deitada e as 5 etiquetas de caixa. Diferença medida: no máximo 2 pontos da impressora (0,25 mm); na maioria, zero.
- **QA clicando** (`evidencias-e3/qa/`, 80+ capturas): fluxo completo no desktop, em 375 px e no iPad simulado, com um agente de impressão simulado; os bitmaps que chegaram à fila foram **decodificados de volta em imagem** e conferidos (nome, tabela nutricional, ingredientes, datas, EAN, QR das caixas, deitada girada). Erro de impressora, PC desligado, fila expirada, cancelar-e-imprimir-pelo-navegador, 80×100 e Clássico bloqueados com atalho, toque duplo, permissão 403 por área (curl, `evidencias-e3/curl-post-etiquetas.txt`). Regressão: etiquetas da cozinha (E2) intactas.
- **Revisor de código**: aprovou backend (2 rodadas) e frontend (3 rodadas), ressalvas aplicadas.
- **Gerente de entrega**: refez build, testes e validação do schema; leu rota, hook e componente; olhou as evidências; conferiu manuais, Clippy, novidade e `novidades.json`; nenhum segredo no repositório.

---

## ROTEIRO DE AMANHÃ CEDO (20/10) — em ordem, ~25 minutos no total

Antes de começar: o computador da cozinha ligado, o agente de impressão rodando (igual ontem para as etiquetas de recheio), as duas Zebras com rolo.

**1) Teste de imagem nas duas impressoras — 5 min**
Configurações → Impressoras → na **grande (100×120)** clique **Teste de imagem**; depois o mesmo na **pequena (40×25)**. Tire **foto** das duas.
- O que deve sair: uma **moldura**, um **quadrado preto no canto superior esquerdo**, a letra **F**, **dois códigos de barras** e um **QR**. Na pequena saem 2 etiquetas lado a lado (as duas colunas).
- **Saiu em negativo na pequena** (fundo preto, desenho branco)? Editar a impressora → **Ajustes finos (imagem)** → ligar **Inverter imagem** → Salvar → **Teste de imagem** de novo.
- **A grande não imprimiu nada** (ou saiu lixo/cortada)? Editar → Ajustes finos → **Compressão: HEX** → Salvar → Teste de imagem de novo.
- O quadrado preto fora do canto / imagem deslocada? Me mande a foto; o ajuste é "Deslocar" (8 pontos = 1 mm) e não precisa de deploy.

**2) Uma etiqueta ANVISA 100×120, pelos dois caminhos — 8 min**
PCP → Etiquetas → escolha um produto, Tamanho **100×120**, Modelo **ANVISA**, 1 cópia.
- Clique **Imprimir na Zebra**. Espere a tela mostrar **"Saiu na impressora"**.
- Clique **Imprimir pelo navegador** e imprima como sempre.
- Ponha as duas **lado a lado** e compare: nome, tabela nutricional, ingredientes, modo de preparo, selos, Fabricação e Validade, código de barras. Tem que ser a mesma etiqueta. Foto das duas juntas.
- **Bipe o código de barras** da etiqueta da Zebra com o leitor, na tela **Ajuste de Estoque** (é o mesmo bipe de sempre). Se ler, está aprovado.
- **Não leu?** Me avise. Eu troco a espessura das barras de 2 para 3 pontos — o código fica um pouco **mais largo** (cerca de 1,5×), ainda cabe na etiqueta, e a troca é feita no aparelho, sem publicar nada. Enquanto isso, use o navegador para esse produto.

**3) Uma etiqueta deitada — 3 min**
Escolha um produto cadastrado como **deitada** → **Imprimir na Zebra**. Confira se o desenho saiu **no sentido certo** (nome e tabela lidos ao girar a etiqueta como se faz hoje). Se saiu de cabeça para baixo, me mande a foto — é uma constante só para inverter o giro.

**4) Caixas do Kit Festa / Delivery — 5 min**
Pedidos Online → Kit Festa → abra um pedido → **Etiquetas** → **Imprimir na Zebra** (ou pelo ícone de impressora no card do Delivery). Confira: 1 etiqueta por caixa com sabor, QR, "Pedido #", unidades e a frase; a cada 4 caixas a etiqueta do pedido com cliente e entrega. **Leia o QR com a câmera do celular**: tem que abrir a página do Kit Festa.

**5) Se algo falhar**
Use **Imprimir pelo navegador** — é exatamente o de ontem, a produção não para. Me mande **foto** do que saiu (ou da tela de erro) e eu ajusto; quase tudo desta entrega se corrige por configuração, sem publicar de novo.

---

## O que fica pendente (declarado, não entregue como pronto)

- **Zebra física** — tudo que só a impressora prova: polaridade da pequena, compressão da grande, posição na etiqueta, leitura do EAN a 2 pontos e do QR, sentido do giro da deitada, 2 etiquetas por formulário na TLP 2844. É o roteiro acima.
- **Safari/iPad de verdade** — o QA usou iPad simulado. Testar "Imprimir na Zebra" no iPad da cozinha depois que a Zebra passar.
- **Rolo 80×100 e modelo Clássico** — só pelo navegador (não há impressora para esse rolo; decisão combinada).
- **Ressalvas do QA, pequenas**: o aviso global "Pedidos novos" pode cobrir a tela de impressão (já era assim); na Fila, o teste de imagem aparece só como "Teste de impressão"; nas caixas, a coluna Etiquetas da Fila mostra cópias do trabalho e não o total de caixas; sair do Clássico 80×100 leva 2 toques (um por atalho); Kit Festa/Delivery não foram medidos em 375 px/iPad.
- **Como Fazer / RH / Tarefas** — alterações de outra sessão no mesmo repositório; **não fazem parte desta entrega** e não foram conferidas aqui.

---

## Texto para o grupo do WhatsApp (mandar SÓ depois que o teste de amanhã passar)

```
🏷️ *Novidade no Hardt App: etiquetas saem direto na Zebra*

Etiqueta do produto e das caixas do Kit Festa/Delivery agora têm o botão verde *Imprimir na Zebra*: 1 toque, sem janela de impressão, sem escolher papel. A etiqueta é a mesma de sempre.

O botão *Imprimir pelo navegador* continua ao lado — é o jeito de antes, igualzinho.

Só vale em 100×120 ANVISA e deitada; 80×100 e Clássico seguem pelo navegador.

Veja como funciona 👇
https://cahardt-github.xrqvlq.easypanel.host/novidade-etiquetas-direto.html
```
