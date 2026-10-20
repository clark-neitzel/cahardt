# Proposta — "Começar com a IA": o Claude monta o primeiro rascunho do POP dentro do app

> 20/10/2026 · Status: PROPOSTA (nada implementado) · Mockup: `docs/pop/mockup-ia-pop.html`
> Pedido do dono: a gerente de produção vai montar os manuais e quer uma IA que **sugira o início** do POP. O dono quer
> usar a **API do Claude**, com o modelo **Claude Fable 5.1**, dentro do próprio sistema.

## A ideia em uma frase

No editor do "Como Fazer", um botão **✨ Começar com a IA**: a gerente conta em palavras simples (digitando ou **falando**)
o que quer ensinar; o Claude devolve um **rascunho completo no formato do app** (para que serve, o que precisa, passos
numerados, o que NÃO fazer, se der errado, perguntas do checklist quando for rotina, e **qual foto tirar em cada passo**).
Ela aceita o rascunho e segue no editor que já existe: tira as fotos, muda textos, acrescenta passos. **Nada é publicado
pela IA**; é sempre rascunho, revisado por pessoa.

## Como a gerente usa (fluxo)

1. Painel Como Fazer → Conteúdos → **+ Novo** → botão **✨ Começar com a IA** (também aparece dentro de um conteúdo vazio).
2. Janela **"Conte para a IA"**: tipo (Rotina / Máquina / Regra / Dosagem), setor, título, e um campo grande
   **"O que você quer ensinar?"** com botão **🎤 Falar** (dita pelo microfone, sem digitar). Opcionais: máquina/item do PCP
   relacionado, quem executa, "quero curto / completo", e uma foto da máquina ou do lugar (a IA olha a foto para
   descrever melhor).
3. **Montar o POP** → a IA escreve (10 a 30 segundos; a tela mostra o texto chegando).
4. **Prévia** no formato do documento. Cada passo vem com **📷 "Foto para tirar: …"**. Botões: **Usar este rascunho** ·
   **Pedir diferente** (campo "o que mudar", ex.: "mais curto", "fala do óleo quente") · Cancelar.
5. No editor, o rascunho entra como se ela tivesse digitado. Em cada passo há **✨ Melhorar texto** / **✨ Mais simples**;
   no documento, **✨ Sugerir o que NÃO fazer**, **✨ Sugerir perguntas do checklist** e **✨ Sugerir "se der errado"**.
6. Ela tira as fotos pelo celular (como hoje), ajusta e **publica** (como hoje).

## O que a IA sabe da Hardt (por isso a sugestão sai "com a cara da empresa")

Junto com o pedido, o sistema manda para o Claude, automaticamente: os **setores cadastrados**, a **lista de máquinas/itens
do PCP** do setor, os **conteúdos já publicados** do mesmo tipo (para seguir o mesmo tom: frases curtas, uma ação por
passo, linguagem de quem não gosta de ler), e as **regras de ouro** do Como Fazer. Nada de dado de cliente, financeiro
ou pessoal vai para a IA.

## Guarda-corpos (o que a IA NÃO faz)

- Não publica, não muda conteúdo existente sem a pessoa aceitar, não apaga nada.
- Não afirma conformidade sanitária: pode sugerir "lave as mãos por 20 segundos", mas o texto nasce marcado
  **"Rascunho feito com ajuda da IA — confira antes de publicar"** e o selo some quando a pessoa edita/publica.
- Não inventa fotos: descreve **qual** foto tirar.
- Não tem acesso ao banco: recebe só o que o sistema monta para aquele pedido.
- Chave da API **só no EasyPanel** (variável `ANTHROPIC_API_KEY`), nunca no código nem no banco.
- Limite diário de uso (ex.: 40 chamadas/dia) e registro de cada chamada (quem, quando, tokens, custo estimado).

## Modelo e custo

O dono escolheu o **Claude Fable 5.1**. Fica configurável em **Configurações → IA** (sem redeploy):

| Modelo | Quando usar | Custo estimado por POP montado* |
|---|---|---|
| **Claude Fable 5.1** (`claude-fable-5-1`) — escolhido | melhor texto e mais cuidado com segurança do trabalho | ≈ US$ 0,13 (≈ R$ 0,75) |
| Claude Opus 5.5 (`claude-opus-5-5`) | ótimo e mais barato | ≈ US$ 0,05 (≈ R$ 0,30) |
| Claude Sonnet 5.5 (`claude-sonnet-5-5`) | rápido, para "melhorar texto" | ≈ US$ 0,03 (≈ R$ 0,15) |

\* Estimativa: ~2.500 tokens de entrada (contexto da Hardt + pedido) e ~2.000 de saída (o POP). Preços de lista da API
(Fable 5.1: US$ 10/M entrada, US$ 50/M saída; Opus 5.5: 4/20; Sonnet 5.5: 2/10). **Cem POPs no mês com o Fable ≈ R$ 75.**
Os botões pequenos ("melhorar texto") custam centavos. A tela de Configurações mostra o uso do mês.

Observações técnicas do Fable 5.1 que entram no desenho: o raciocínio é sempre ligado (controla-se o esforço, não um
"orçamento"); a resposta vem em **formato estruturado** (o mesmo JSON de passos do app, validado pelo
`comoFazerSchema.js` antes de virar rascunho); a conta Anthropic precisa estar no padrão de retenção de 30 dias
(padrão das contas normais); respostas longas via streaming (por isso a tela mostra o texto chegando).

## Onde fica no sistema

- **Editor do Como Fazer** (`Painel Como Fazer → Conteúdos`): botões ✨.
- **Configurações → IA** (tela nova, permissão de Configurações): provedor e modelo por função (Clippy pode continuar no
  provedor atual; o Como Fazer usa o Claude), status da chave, ligar/desligar, limite diário, uso do mês e histórico.
- O sistema já tem uma camada `aiProvider` (OpenAI/Gemini) usada pelo Clippy; entra o provedor **Anthropic** nela, com
  modelo escolhido **por função** — assim o Clippy não muda nada.

## Fases

| Fase | Entrega | Esforço |
|---|---|---|
| **1 — Montar o POP** | Provedor Anthropic no `aiProvider`; rota `POST /api/como-fazer/ia/montar` (com streaming); modal "Conte para a IA" com ditado por voz; prévia; "Pedir diferente"; rascunho no editor com selo; Configurações → IA (modelo, chave, limite, uso); registro de uso; manual do Clippy; novidade | 4 a 5 dias |
| **2 — Ajudar dentro do editor** | ✨ Melhorar / Mais simples por passo; Sugerir o que NÃO fazer / perguntas / se der errado; IA lê a foto do passo e propõe a frase | 2 dias |
| **3 — Revisor** | "✨ Revisar este POP": aponta passo confuso, perigo não citado, passo sem foto, frase longa demais | 1 dia |

## Esboço técnico (para a equipe)

- `backend/services/aiProvider.js`: provider `anthropic` com `@anthropic-ai/sdk` (TypeScript/JS oficial); modelo por função
  via `app_configs` (`ia_como_fazer_modelo`, padrão `claude-fable-5-1`); chamada com `thinking` omitido (Fable: sempre
  ligado), `output_config.effort` médio, **saída estruturada** com o schema do documento (`secoes[].passos[]`, `objetivo`,
  `materiais`, `naoFazer`, `seDerErrado`, `perguntas` com min/max para Rotina, `fotoSugerida` por passo); streaming;
  `fallbacks: "default"` para recusa; tratamento de `stop_reason: "refusal"` com mensagem simples.
- `backend/services/comoFazerIaService.js`: monta o contexto (setores, itens PCP do setor, 2 conteúdos publicados do mesmo
  tipo como exemplo de tom, regras de ouro), chama o provider, valida com `comoFazerSchema.processarDoc`, grava o rascunho
  com `origem: 'IA'` e `iaRevisado: false`; tabela `como_fazer_ia_usos` (quem, conteúdo, modelo, tokens in/out, custo
  estimado, duração, ok/erro); limite diário em `app_configs`.
- Rotas: `POST /api/como-fazer/ia/montar` (SSE), `POST /api/como-fazer/ia/passo` (melhorar/simplificar), `POST
  /api/como-fazer/ia/sugerir` (naoFazer | perguntas | seDerErrado), `GET /api/como-fazer/ia/uso`, `GET/PUT /api/config/ia`.
  Todas exigem `Pode_Editar_Como_Fazer`; nunca pelo token do tablet.
- Frontend: `ModalComecarComIA.jsx` (ditado via `webkitSpeechRecognition` pt-BR, com fallback para digitar), `PreviaIA.jsx`
  (reusa `PassoCard`), botões ✨ no `PassoEditor`/`EditorConteudo`, `Configuracoes/IA.jsx`.
- Segurança: chave só em env; rate limit por usuário; log sem o texto completo do prompt (só tamanho); custo mostrado.
