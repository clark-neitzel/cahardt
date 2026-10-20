# Proposta — "Como Fazer": POPs, manuais de máquina, uniforme, dosagem e treinamento no CA-Hardt

> Versão 2.1 · 19/10/2026 · Status: APROVADA, Fase 1 em desenvolvimento · Mockup: `docs/pop/mockup-pop.html` · Plano: `docs/pop/plano-fase1-como-fazer.md`
> v2.1: o dono escolheu o jeito da versão 1 para a Biblioteca (lista em cartões com código, versão e selos) e para o conteúdo aberto (documento inteiro numa página, passos numerados com foto + Ouvir, treinamento no rodapé). O resto da v2 continua.
> Mudanças da v1 → v2 (pedido do dono em 19/10): escopo passa de "POP" para todo conteúdo que ensina a
> equipe a fazer; só Cozinha · Estoque · Expedição · Motorista (sem administrativo); tudo desenhado para
> pessoas leigas e avessas a tecnologia; treinamento e execução sempre registrados.

## A ideia em uma frase

Um lugar no app chamado **"Como Fazer"** onde cada coisa que a equipe precisa saber (rotina, máquina, regra
de uniforme/higiene, dosagem) é mostrada como **uma foto + uma frase + botão Ouvir**, por passo. A pessoa
entra no **tablet do setor tocando na própria foto + 4 números**, treina vendo e fazendo na prática (ela e o
encarregado confirmam), e as rotinas chegam pela **agenda de Tarefas** como checklist de toque. Tudo fica
registrado para a gestão e para a Vigilância Sanitária.

## Quem usa e onde

| Pessoa | Como entra | O que vê |
|---|---|---|
| Cozinha, Estoque, Expedição | Tablet fixo no setor, sempre na tela "Quem é você?" (foto + PIN de 4 números, o mesmo do ponto) | Só o "Como Fazer" do setor. Nenhuma outra tela do sistema. |
| Motorista | Celular, já logado no app como hoje | "Como Fazer" do motorista + checklists na agenda |
| Encarregado | Tablet (PIN dele) ou celular | O mesmo que a equipe + botão de confirmar treinamento |
| Gestão / RH | Computador | Painel: quem treinou em quê, rotinas, cadastro dos conteúdos, relatório |

## Os quatro tipos de conteúdo

| Tipo | Exemplo | Como se aprende | Como se registra |
|---|---|---|---|
| 🔁 **Rotina** | temperatura dos freezers, limpeza do fim do turno, carregamento da rota, veículo antes de sair | passo a passo + "Li e entendi" | **checklist** na agenda, no horário; números, Sim/Não, foto; desvio avisa o encarregado |
| ⚙️ **Máquina** | fritadeira, seladora, masseira | Montar · Usar · Limpar · Deu problema; treino com prática | funcionário "Aprendi" + encarregado confirma com PIN; "Limpar" pode virar rotina |
| 👕 **Regra** | higiene e uniforme, etiqueta e validade, PEPS no estoque | passo a passo no 1º dia + reciclagem | "Aprendi" + confirmação do encarregado; nova versão pede de novo |
| 🥄 **Dosagem** | massa da coxinha, sanitizante da bancada | foto da medida real + número grande | "Li e entendi"; impressa e colada na parede |

## Regras de ouro para gente leiga (valem para toda tela)

1. Cada passo = **uma foto grande + uma frase curta**. Vídeo de 20 s gravado no celular quando a foto não basta.
2. **Botão Ouvir** em todo passo: o tablet/celular lê em voz alta (voz do aparelho, sem internet).
3. **Sem usuário e senha**: toca na própria foto e digita 4 números. Errou 3×? Chama o encarregado, não bloqueia.
4. Documento inteiro numa página (passos numerados, foto ao lado), botões grandes (mínimo 56 px). **Nunca digitar texto**:
   só toque (Sim/Não), número em teclado grande, ou foto pela câmera. No checklist, uma pergunta por linha.
5. **Treinamento = ver no tablet + fazer na prática + os dois confirmam** (funcionário toca "Aprendi", encarregado
   digita o PIN). Fica com data/hora e versão do conteúdo.
6. **QR colado na máquina e no freezer** abre o manual daquela máquina na hora.
7. **Rotina chega pela agenda** (alerta sonoro que já existe). Ninguém precisa lembrar.
8. **Quem monta o conteúdo também é leigo**: criar passo = tirar foto + escrever uma frase, pelo celular.
9. Código curto e versão aparecem no cartão (`HIG-001 · v3`) — ajuda a falar "o HIG-001" na cozinha. Sem prefixo "POP-".
10. Fotos reais do próprio lugar (a fritadeira de verdade, a concha marcada com fita). Nada de desenho genérico.

## Por onde começar (ordem de importância)

1. **👕 Higiene e uniforme — todo mundo, 1º dia.** Primeira coisa que a Vigilância pergunta; mais simples de
   montar (uns 10 passos com foto); já cria o hábito de "treinar no tablet".
2. **🧊 Temperatura dos freezers — rotina 2× ao dia.** Piloto do "fazer e registrar": ler visor, digitar número, foto.
3. **⚙️ A máquina que mais dá problema ou mais machuca** (fritadeira, seladora ou masseira, a escolher).
4. **🥄 Dosagens** da cozinha (padrão e custo) e da limpeza (item de Vigilância).
5. **📦 Estoque e Expedição** — PEPS, etiqueta/validade, separação e carregamento (liga com o Embarque).
6. **🚚 Motorista** — checklist do veículo antes de sair e da entrega.

## Fases de construção

| Fase | Entrega | Esforço estimado |
|---|---|---|
| **1 — Piloto na cozinha** | Tela "Como Fazer" + tablet do setor (foto + PIN) + passo a passo com Ouvir + treinamento com dupla confirmação + cadastro simples (foto + frase) + painel "quem treinou" + 3 conteúdos reais: Higiene e uniforme, Temperatura dos freezers (com checklist na agenda), 1 máquina | 2 semanas de equipe |
| **2 — Estoque, Expedição e Dosagem** | Rotinas diárias dos dois setores, dosagem ligada à Receita do PCP, QR por máquina/freezer, impressão A4 (dosagem na parede e relatório p/ Vigilância) | 1 semana |
| **3 — Motorista e reciclagem** | "Como Fazer" no celular do motorista com checklist do veículo/entrega; reciclagem automática (6/12 meses); "Chamar o encarregado"; Clippy respondendo pelos conteúdos | 1 semana |

O conteúdo (fotos, frases, vídeos) é trabalho do dono e dos encarregados, não dos devs. Na Fase 1 a equipe
de devs monta os 3 primeiros junto com o dono para validar o jeito de cadastrar.

## Regras de negócio

- Só conteúdo **Publicado** aparece nos tablets; Rascunho só no painel.
- Nova versão publicada **zera o treinamento** daquele conteúdo (volta 🟡 para todos do cargo).
- Funcionário novo (ativado no RH) nasce com todos os conteúdos do cargo em 🟡.
- Treinamento de Máquina e Regra exige **duas confirmações** (funcionário + encarregado com PIN). Rotina e
  Dosagem exigem só "Li e entendi".
- Rotina com frequência gera a tarefa recorrente **sozinha** (reaproveitando a recorrência das Tarefas);
  concluir = preencher o checklist; obrigatório não preenchido trava o "Pronto".
- Valor fora do limite = **desvio**: fica vermelho na tela com frase simples e cria tarefa na agenda do
  encarregado na hora. Rotina vencida sem checklist = **não feita** (aparece no painel).
- Tablet do setor: sessão expira em 2 min parado; só enxerga "Como Fazer" do setor; nunca o resto do sistema.
- Impressão sempre pelo padrão do app (na própria página, funciona no iPad).
- QR abre o conteúdo **dentro do app** (tablet ou celular logado), mesma lógica do QR do embarque.

## Permissões (novas)

| Permissão | Quem | Libera |
|---|---|---|
| (nenhuma) | todos logados / tablet do setor | ver "Como Fazer" do setor, treinar, executar rotina |
| `Pode_Confirmar_Treinamento` | encarregados | confirmar com PIN que o funcionário fez na prática |
| `Pode_Editar_Como_Fazer` | dono / RH | criar, editar rascunho, publicar versão |
| `Pode_Ver_Painel_Como_Fazer` | gestão | painel de treinamentos, rotinas, relatório |

## Esboço técnico (para a equipe de devs)

- **Tabelas Prisma:** `conteudos` (tipo ROTINA/MAQUINA/REGRA/DOSAGEM, setor, cargos, frequência, reciclagem,
  status), `conteudo_versoes` (passos JSON: texto, fotoUrl, videoUrl, perigo, pergunta {tipo NUMERO/SIMNAO/FOTO,
  min, max, obrigatoria}; seções da máquina MONTAR/USAR/LIMPAR/PROBLEMA; itens de dosagem), `treinamentos`
  (versão × funcionário × aprendeuEm × confirmadoPorId × confirmadoEm × validoAte), `execucoes` (conteúdo ×
  tarefa × usuário × respostas JSON × fotos × desvio bool).
- **Tablet do setor:** rota `/setor/:slug` sem login tradicional; lista funcionários do setor com foto (RH) e
  valida PIN (reaproveitar o PIN/link pessoal do Ponto); emite token curto restrito ao "Como Fazer"; expira em 2 min
  de inatividade. Permissões no back espelhadas no front.
- **Rotas:** `/api/como-fazer/*`. Fotos/vídeos em `backend/uploads/como-fazer/` (regra do volume persistente;
  testar gravar → deploy → ler). Vídeo limitado a 20 s / tamanho máximo definido.
- **Frontend:** `pages/ComoFazer/*` (tela do setor, viewer de passos, checklist) e `pages/RH/ComoFazerPainel*.jsx`;
  `lazyComRetry`; botões ≥ 56 px; `speechSynthesis` pt-BR no Ouvir (sem rede).
- **Recorrência:** reaproveita `tarefaService` com `origem: 'COMO_FAZER'`; concluir a tarefa abre o checklist em
  vez de concluir direto. Desvio cria tarefa para o encarregado (sem WhatsApp).
- **Impressão:** `imprimirConteudo` de `PCP/ReceitaDetalhe.jsx`. **Dosagem:** opcionalmente lê ingredientes da
  Receita do PCP e deixa a gestão escolher a "medida caseira" + foto.
- **Clippy:** manual `backend/manuais/abas/como-fazer.md` + `rh-como-fazer-painel.md`, entradas na tabela `ABAS`.
  Na Fase 3 o Clippy também lê os conteúdos publicados.
- **Entrega:** `novidade-como-fazer.html` + entrada em `novidades.json`; manuais do Clippy; teste no iPad real
  (tablet do setor) antes de dizer pronto.
