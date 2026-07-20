# Prompt para o Claude criar a página — clark—teck

> Copie tudo abaixo (da linha "Você é..." até o fim) e cole numa conversa com o Claude.
> Antes de enviar, substitua **[LINK_DO_FORMULARIO]** pelo link do seu Google Forms.

---

Você é um designer/dev front-end sênior. Crie uma **landing page de uma página só**, em **um único arquivo HTML autocontido** (todo CSS e JS inline, sem dependências externas, sem frameworks). Ela é a página de apresentação da minha marca e é pra onde as pessoas vão quando clicam no link da minha bio do Instagram. O objetivo final da página é **fazer a pessoa clicar no botão e preencher meu formulário**.

## Quem sou eu / a marca

- **Marca:** **clark—teck** (grafia: minúsculas, com um travessão entre "clark" e "teck"; o travessão em vermelho quando houver cor). Posicionamento: **tecnologia que simplifica a gestão de negócios**.
- **Eu:** Clarkson, dono de uma indústria de alimentos. **Não sou programador.** Em parceria com IA, construí em **8 meses** o sistema (um ERP completo) que roda a minha empresa inteira — descrevendo as dores da operação e testando tudo na rua, no mesmo dia.
- **A história em uma frase:** "Há 8 meses minha empresa rodava numa planilha, com o mesmo dado digitado três vezes. Hoje é um sistema só: o pedido nasce no celular do vendedor, vira rota de entrega, é pago com PIX na porta do cliente e fecha no caixa — sem digitar nada duas vezes."
- **Números-chave (use como destaque, contando de zero com animação):** 8 meses de construção · 136 telas · 24h em produção · 1 pessoa construindo.

## Para quem é a página / qual ação eu quero

- **Público:** donos de pequenos e médios negócios que vendem, entregam ou fabricam (distribuidoras, indústrias de alimentos, padarias, delivery) e sofrem pra ligar as pontas da operação (pedido, entrega, financeiro).
- **Ação principal:** clicar num botão de destaque (**"Me conta a sua dor"** ou **"Quero conversar"**) que leva ao meu formulário externo: **[LINK_DO_FORMULARIO]**. Repita esse CTA pelo menos 2 vezes (no meio e no fim).
- **Tom:** não é venda agressiva. É "estou documentando meu percurso; se você tem essa dor, fala comigo". Confiança sem arrogância — a força vem dos fatos e números, não de adjetivos.

## Estrutura sugerida (seções, de cima pra baixo)

1. **Topo:** a marca `clark—teck` à esquerda, um selo discreto tipo "TECNOLOGIA PARA NEGÓCIOS · 2026" à direita.
2. **Hero:** título forte com a transformação ("De uma planilha a uma empresa inteira. Em 8 meses."), um subtítulo com a frase da história, e o primeiro CTA. É aqui que fica a animação principal (ver abaixo).
3. **A corrente (o coração):** os 5 elos do sistema em sequência — **Pedido → Rota → PIX na entrega → Nota/Boleto → Caixa** — com uma linha animada de "dados" fluindo por eles conforme a pessoa rola a página. Cada elo com um título curto e uma linha de explicação.
4. **Os números:** 8 meses · 136 telas · 24h · 1 pessoa, grandes, com números tabulares que sobem de 0 ao entrar na tela.
5. **Pra quem é:** 3 ou 4 tipos de negócio ("se você tem uma distribuidora…", "uma indústria de alimentos…", "um delivery…") — pra pessoa se reconhecer.
6. **Fecho + CTA final:** faixa preta, frase de impacto ("8 meses. Uma empresa inteira. Zero redigitação.") e o botão pro formulário.
7. **Rodapé:** assinatura `clark—teck` e uma linha discreta "histórias reais · dados de exemplo fictícios · 2026".

## Identidade visual — tema "Porsche" (siga à risca)

Estética de **engenharia de precisão**: sofisticada, contida, cara. Nada de poluído nem infantil.

- **Fundo:** branco-gelo `#FBFCFF`. **Tinta/preto:** `#010205`. Suporte a modo claro e escuro (dark: fundo `#0a0c0e`).
- **Vermelho:** `#D5001C`, usado com **MUITA parcimônia** — só detalhes de precisão (o travessão da marca, um tique de 2px, a borda de um destaque, o CTA). Nunca em bloco grande.
- **Tipografia:** grotesca limpa (Helvetica Neue / -apple-system / SF), títulos grandes com `letter-spacing` negativo, **labels em CAIXA ALTA com espaçamento largo** (0.2em), números tabulares (`font-variant-numeric: tabular-nums`).
- **Contraste proposital:** a vitrine é "Porsche" (preto/branco/vermelho, minimalista), mas os mocks das telas do app são **verdes** (tema do sistema real: verde `#00754A`, verde-escuro `#1E3932`, menta `#d4e9e2`). Ou seja: página elegante em P&B, com "janelinhas" verdes mostrando o produto real. Esse contraste é intencional.
- **Layout:** muito respiro, linhas finas de 1px separando seções, grid alinhado, sensação de precisão.

## Animação (é o que eu quero de especial — mas com classe)

Quero uma pegada de **IA / cérebro / máquinas / dados fluindo**, mas executada com sofisticação — **engenharia de precisão, não ficção científica brega**. Ideias (escolha e combine com bom gosto):

- **No hero:** uma **rede neural / grafo de nós** em SVG — pontos conectados por linhas finas, pulsando devagar (opacidade), como um "cérebro" de dados em fundo sutil. Monocromático, com um ou dois nós acendendo em vermelho de vez em quando. Discreto, atrás do texto, nunca competindo com a leitura.
- **Na corrente (Pedido→Caixa):** uma **linha de dados que "viaja"** pelos 5 elos conforme o scroll — um pontinho de luz percorrendo o caminho, mostrando o dado fluindo sem redigitação. Cada elo "acende" quando o dado chega.
- **Nos números:** contagem de 0 até o valor (8, 136, 24, 1) ao entrar na tela.
- **Nas seções:** reveal suave (fade + subir 18px) ao rolar.

**Regras técnicas da animação (importante):**
- Animar **apenas `opacity` e `transform`** (são aceleradas por GPU). **Nunca** animar `box-shadow`, `border` ou `background-color` em loop — causa travamento no celular.
- Respeitar `prefers-reduced-motion: reduce` — se ativado, mostrar tudo estático, sem animação.
- Tem que rodar liso no celular (é onde a maioria vai abrir, vindo do Instagram).

## Requisitos técnicos

- **Um único arquivo `.html`**, autocontido, sem CDN, sem bibliotecas externas (SVG e JS puro).
- **Mobile-first**, funcionando bem a partir de 320px de largura, sem scroll horizontal.
- Botões/CTA levando a **[LINK_DO_FORMULARIO]** (abrir em nova aba).
- Incluir **meta tags Open Graph** (`og:title`, `og:description`, `og:image`) pra ficar bonito quando eu compartilhar o link no WhatsApp/Instagram.
- Título da aba: "clark—teck · tecnologia que simplifica a gestão de negócios".
- **Não usar dados reais** de clientes em nenhum mock — se aparecer nome/valor numa telinha, que seja fictício (ex.: "Mercado Bom Preço", "R$ 645,00").

Entregue o arquivo HTML completo, pronto pra abrir no navegador.
