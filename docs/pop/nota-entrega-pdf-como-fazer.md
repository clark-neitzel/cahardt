# Nota de entrega — PDF do Como Fazer (etapa 1)

> Pedido do dono em 22/10/2026: gerar PDF dos manuais para imprimir, escolhendo quantas páginas e quais passos vão em cada uma, em A4, funcionando no celular e no iPad, e com o botão de imprimir fácil de achar.
> Veredito do gerente de entrega: **LIBERADO COM PENDÊNCIA** (itens que só se provam em produção e no iPad estão no fim). A seção "Conferido em produção" fica em branco até o deploy.

## O que mudou (em termos de uso)

- **Botão "PDF" em 3 lugares:** no manual aberto (ao lado de Imprimir A4 e QR code), na lista de Conteúdos do Painel e na barra do editor. Aparece para quem cria/edita o Como Fazer ou vê o painel; funcionário comum e tablet não geram PDF.
- **Dois formatos:** **Cartaz de parede** (letra e foto grandes, até 6 passos por folha; a opção "Letra e foto menores" libera até 8) e **Folha de fichário** (margem de 28 mm para furar, cabeçalho de controle, tabela de passos, "O que não fazer", "Se der errado", controle de revisões e lista de treinados com linhas para assinar; até 12 passos por folha).
- **Você escolhe as páginas.** Atalhos: "Passos por página", "Um processo por página" (usa as seções do manual) e "Automático". Para ajustar à mão: **Montar as páginas** — cada página tem nome, um medidor ("4 passos · cabe bem" ou "9 passos · não cabe") e botões para mover passos entre páginas ou para "Fora das páginas". Página que não cabe **bloqueia** o PDF e diz quantos passos mover; passo esquecido pede confirmação antes de sair sem ele.
- **Todo cartaz traz:** nome, código e versão, setor, data de aprovação, QR que abre o manual no app, a faixa vermelha **NÃO FAZER** repetida em todas as páginas (cada folha pode ir sozinha para a parede), encarregado, "Revisar até" (um ano após a publicação), "pág. X/N" e quem imprimiu e quando. A numeração dos passos é a do manual em qualquer página.
- **Foto inteira:** a foto aparece completa, sem cortar nenhuma borda (fica centralizada sobre fundo cinza-claro quando não ocupa o quadro todo). Foto que falta sai como quadro tracejado com a dica "foto para tirar", e a tela avisa antes.
- **Ver, imprimir e salvar dentro do app:** o PDF aparece na tela página a página, com zoom por botões e os botões **Imprimir** e **Salvar PDF** (o arquivo já sai com nome certo, por exemplo código-versão-cartaz).
- **O arranjo fica guardado** por manual e formato: quem abrir depois vê as mesmas páginas. Ao publicar uma versão nova, as páginas e nomes são mantidos; passo novo cai em "Fora das páginas" com aviso.

## Limites desta etapa (combinados)

- **Só a versão publicada imprime.** Rascunho ou arquivado deixa o botão desligado; se há rascunho por cima, a tela avisa que o PDF é da versão publicada.
- **No iPad e no iPhone, "Imprimir" abre a folha de compartilhar** (é assim que o aparelho funciona, com ou sem app): dali escolhe-se AirPrint ou salvar. No computador abre a impressão normal.
- **Zoom por pinça** não existe ainda — só pelos botões.
- **Folha de registro (planilha de preenchimento) e até 4 fotos por passo** ficam para as próximas etapas. Hoje cada passo leva uma foto.
- Máximo de 8 páginas no cartaz e 6 no fichário; cada pessoa gera até 20 PDFs por minuto.

## O que foi testado e por quem

- **Arquiteto:** plano e escolhas técnicas (gerador de PDF no servidor, sem navegador escondido).
- **Revisor (servidor):** aprovado; uma falha séria corrigida — o endereço que vai no QR não vem mais do navegador de quem pede, é sempre o do sistema (provado: mesmo mandando um endereço falso, o QR aponta para o sistema).
- **Revisor (telas):** aprovado; 2 correções (alvo de toque de 44 px no "Mover para…" e uma corrida ao trocar de formato).
- **QA (navegador automatizado, computador e celular):** aprovado com ressalvas, 16 de 16 itens testáveis. Provado: os 3 botões e seus estados; permissões (tablet e sem permissão recusados); montar 16 passos em 4 páginas por atalho, à mão e arrastando; um processo por página; página estourada bloqueia na tela e no servidor; passo esquecido; nome por página; os PDFs abertos e vistos página a página; visualizador (zoom, Salvar com nome certo, Imprimir sem abrir outra janela e restaurando a tela, abrir e fechar 10 vezes sem vazar memória); arranjo guardado e troca de versão; mensagens de erro simples; QR; sem regressão em Imprimir A4, QR atual, editor, tablet, trava por cadastro e IA; build; cada PDF leva cerca de 0,2 s. Defeitos achados (foto cortada, mensagem enganosa do fichário, tamanhos de toque, setas, concordância) foram corrigidos.
- **Gerente de entrega:** conferiu a mudança arquivo a arquivo e separou o que é desta entrega do que é de outra sessão (mesmos arquivos de pacotes, banco e novidades); build passou, sintaxe dos arquivos do servidor e banco validados; o banco só ganha uma tabela nova, com índice; nada de `window.open`/janela escondida; telas carregam sob demanda; permissões iguais na tela e no servidor; as fotos só são lidas de dentro da pasta de fotos do Como Fazer; manuais, página de novidade (sem imagem no preview, seções abertas, exemplos marcados "dados de mentira") e entrada no topo do aviso do Clippy.

## Conferido em produção

_(preencher depois do deploy)_

- [ ] Servidor novo no ar (marcador desta entrega respondendo)
- [ ] Telas novas no ar (o app publicado contém o botão PDF / a tela de montar páginas)
- [ ] Rota do PDF existe e pede login (sem login: "entre para continuar", não "não encontrado")
- [ ] Tabela de arranjos criada no banco (o dono ou o gerente salva um arranjo e ele volta ao reabrir)
- [ ] **Foto real no PDF (dono):** gerar um PDF de um manual que tenha foto enviada e conferir que a foto aparece (e não um quadro tracejado)
- [ ] **QR do PDF abre o manual no endereço do sistema** (dono lê com o celular)
- [ ] Página de novidade abre sem login; aviso do Clippy registrado
- [ ] iPad: Imprimir abre a folha de compartilhar; Salvar PDF funciona; ver página a página (dono)

## O que você precisa conferir (uns 5 minutos)

1. Abra um manual **publicado** que tenha foto → botão **PDF** → cartaz de parede → veja a prévia. **Confirme que as fotos aparecem.** Se vier um quadro tracejado e um aviso de que "o servidor não conseguiu preparar as fotos", me avise — é um problema do servidor, não do manual (plano B abaixo).
2. Use **Montar as páginas**: mude um passo de página, dê nome às páginas, salve e feche; abra de novo e veja que as páginas ficaram guardadas.
3. **Salvar PDF**, depois **Imprimir**. No iPad, confira a folha de compartilhar e a impressão pelo AirPrint.
4. Leia o QR do cartaz com o celular: deve abrir o manual no sistema.

## Pendências

- **Foto no servidor (preparação das imagens):** a ferramenta que prepara as fotos só foi provada no computador da equipe; no servidor em produção ela só se prova com um PDF real. Se falhar, o PDF sai com quadros tracejados (nada quebra). Plano B: a equipe técnica ajusta a instalação no servidor e publica de novo, ou troca a ferramenta de imagem; quem aciona é o gerente de projeto.
- **iPad real** (Imprimir, Salvar, compartilhar) e **pinça para zoom**: não testados.
- **Fotos lidas depois de uma nova publicação do sistema:** as fotos ficam na pasta que sobrevive às publicações; confirmar gerando um PDF com foto depois da próxima publicação.
