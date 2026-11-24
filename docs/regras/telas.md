# Regras de TELA — CA-Hardt (design system, celular, computador, botões)

> **Fonte ÚNICA deste assunto** (saiu do `CLAUDE.md` em 24/11/2026 — pedido do dono: regras mais
> simples e rápidas para os agentes). Regra nova entra AQUI, **alterando a regra que já trata do
> tema** — nunca empilhar outra por cima, nem copiar para ficha, habilidade ou memória.

---

## Padrão Visual do Sistema (Design System)

> **TEMA STARBUCKS aplicado em 07/2026** (aprovado pelo usuário). Tokens abaixo já refletem o tema novo.
> Existe uma **camada de remapeamento global** em `frontend/src/index.css` (seção "TEMA STARBUCKS") que converte azuis de ação legados (`bg-blue-600`, `text-blue-600`, `hover:bg-blue-700`...) para os verdes e transforma `button.rounded/rounded-md` em pílula — código antigo fica verde sem precisar ser editado. **Código NOVO deve usar os tokens diretamente** (`bg-primary hover:bg-primaryDark`, `rounded-full`), não os azuis legados.
> Referência visual completa: `design-system.html` na raiz (atualizado para o tema Starbucks; também publicado como Artifact para a equipe).

### Tokens Principais

| Token | Valor |
|---|---|
| Cor primária (CTA/botões) | `#00754A` (classe `primary`) |
| Primária escura (hover/títulos) | `#006241` (classe `primaryDark`) |
| Verde-escuro (sidebar/bandas) | `#1E3932` (classe `house`) |
| Verde-claro (chips/estados válidos) | `#d4e9e2` (classe `mint`) |
| Background geral | `#f2f0eb` creme quente (classe `secondary`) |
| Surface (cards) | `#ffffff` |
| Texto principal | `rgba(0,0,0,0.87)` |
| Fonte | Manrope (com `letter-spacing: -0.01em` e números tabulares globais via `:root`), fallback SF Pro Text |

**Regras do tema:** botões sempre em pílula (`rounded-full`); dourado `#cba258` reservado só a destaques especiais; NUNCA mudar as cores semânticas dos badges de status (verde=pago, vermelho=vencido etc. — ver seção Badges); barras de progresso mantêm a escala de cor por % (inclusive azul).

### Estrutura de Card (padrão de toda seção de conteúdo)
```jsx
<div className="bg-white rounded-xl border border-gray-200 shadow-sm">
  <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
    <Icon className="h-4 w-4 text-primary" />
    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">TÍTULO DA SEÇÃO</span>
  </div>
  <div className="p-5">{children}</div>
</div>
```

### Botões (tema Starbucks: pílula universal)
- **Primário:** `px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm`
- **Secundário (outline verde):** `px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm`
- **Perigo:** `px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-full font-semibold text-sm`
- **Ícone sutil:** `p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100`
- (Legado: `rounded`/`rounded-md` em `<button>` vira pílula automaticamente pela camada de tema)

### Badges de Status
Sempre `px-2 py-1 text-xs font-semibold rounded-full` com as cores:
- Verde (`bg-green-100 text-green-800`): Ativo, Pago, Aprovado
- Azul (`bg-blue-100 text-blue-800`): Aberto, Em Andamento
- Cinza (`bg-gray-100 text-gray-700`): Pendente, Sem Estoque
- Amarelo (`bg-yellow-100 text-yellow-800`): Parcial, Baixo Estoque
- Âmbar (`bg-amber-100 text-amber-700`): Atenção, Faturamento
- Vermelho (`bg-red-100 text-red-700`): Cancelado, Vencido, Inativo
- Roxo (`bg-purple-100 text-purple-700`): Especial

### Tabelas
```jsx
<table className="min-w-full divide-y divide-gray-200">
  <thead className="bg-gray-50">
    <tr><th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Col</th></tr>
  </thead>
  <tbody className="bg-white divide-y divide-gray-200 text-sm">
    <tr className="hover:bg-gray-50"><td className="px-5 py-3 text-gray-900">dado</td></tr>
  </tbody>
</table>
```

### Formulários — inputs
```jsx
<input className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
```

### Filtros de tela — SEMPRE lembrar a escolha do usuário (`useFiltrosSalvos`)

**Todo filtro de tela (novo ou alterado) deve usar `frontend/src/hooks/useFiltrosSalvos.js`** em vez de `useState` — a última escolha do usuário fica salva (localStorage, por usuário e por tela) e volta ao reabrir a tela. Pedido explícito do usuário (07/2026): isso é o padrão do sistema.

```jsx
import { useFiltrosSalvos, useFiltroSalvo } from '../../hooks/useFiltrosSalvos'; // ajuste o caminho
const [filtros, setFiltros] = useFiltrosSalvos('contas-receber', { status: 'ABERTO' }); // objeto de filtros
const [soAtivos, setSoAtivos] = useFiltroSalvo('produtos:soAtivos', true);              // filtro único
```

- Chave = slug da tela (`'lista-pedidos'`) ou `'slug:campo'` para valor único. Objeto salvo é mesclado sobre o padrão — campo de filtro novo entra com o valor padrão sem quebrar o que já estava salvo.
- **NÃO persistir:** busca por texto livre, paginação, dados carregados, estado de modal/loading, e datas soltas cujo padrão é calculado (hoje/mês corrente — senão o usuário fica preso numa data velha). Filtro de DATA persiste pelo **preset** via `usePeriodoSalvo` (ver seção abaixo), nunca por datas absolutas.
- Botão "limpar filtros" não precisa de tratamento especial (setar os padrões sobrescreve o salvo).

### Filtro de DATA — SEMPRE usar `FiltroPeriodo` (padrão adotado em 07/2026, pedido do usuário)

**Todo filtro de data/período (novo ou tela que estiver sendo mexida) usa `frontend/src/components/FiltroPeriodo.jsx`** — um controle só em pílula `[‹] [Este mês · 01/07 – 31/07 ▾] [›]` com presets (Hoje · Últimos 7 dias · Últimos 30 dias · Este mês · Este ano · Todo o período · Período personalizado com De/Até dentro do menu). NÃO criar mais pares de `<input type="date">` soltos; migrar os existentes conforme cada tela for tocada (primeira tela: Contas a Pagar).

```jsx
import FiltroPeriodo, { usePeriodoSalvo } from '../../components/FiltroPeriodo'; // ajuste o caminho
const [periodo, periodoCtl] = usePeriodoSalvo('contas-pagar');   // preset padrão: 'mes'
// periodo.de / periodo.ate → 'YYYY-MM-DD' resolvidos ('' = sem limite); periodo.padrao → bool
<FiltroPeriodo periodo={periodo} controle={periodoCtl} className="w-full md:w-auto" />
```

- **Setas pulam o período inteiro** (dia / 7d / 30d / mês / ano / tamanho do intervalo personalizado); em "Todo o período" ficam desligadas. A navegação pelas setas **não** é persistida.
- **Persistência por usuário é do PRESET** (recalculado a cada abertura — "Este mês" salvo em julho abre agosto em agosto); só o personalizado salva datas exatas. Isso torna seguro persistir o filtro de data (a proibição acima é só para datas absolutas com padrão calculado).
- Preset padrão da tela = 2º argumento de `usePeriodoSalvo(chave, presetPadrao)` (`'mes'` se omitido); "limpar filtros" chama `periodoCtl.limpar()`.
- No botão "N filtros ativos", conte o período com `if (!periodo.padrao) n++`.

### Dropdowns/menus — usar SEMPRE `SelectBusca`, nunca `<select>` nativo
O `<select>` nativo renderiza como um menu escuro do sistema (macOS/iOS), sem busca — ruim de usar em lista longa. **Todo menu suspenso novo deve usar `frontend/src/components/SelectBusca.jsx`** (menu branco no tema, com busca no topo quando há muitas opções; renderiza em portal, então não é cortado dentro de modais e abre para cima quando falta espaço). É drop-in do `<select>` — mesma API:
```jsx
import SelectBusca from '../../components/SelectBusca'; // ajuste o caminho relativo
<SelectBusca value={x} onChange={e => setX(e.target.value)} className="w-full">
  <option value="todos">Todos</option>
  {lista.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
</SelectBusca>
```
- `onChange` recebe `{ target: { value } }` — só use `e.target.value`. **NÃO** funciona com handler compartilhado que lê `e.target.name`/`e.target.checked`, nem com o truque de resetar via `e.target.value = ''` (nesses casos, mantenha `<select>` nativo).
- No `className` passe só utilitários de largura/margem (`w-full`, `md:w-48`, `flex-1`, `mt-1`…); borda/padding/foco já vêm do componente.
- Suporta `disabled` (no componente e em cada `<option>`) e `<optgroup>` (vira cabeçalho de grupo).
- Para multi-seleção use `MultiSelect.jsx`; para combobox de criação/ação extra use `ComboBusca.jsx`.
- (Jul/2026 os ~143 `<select>` de filtro/formulário existentes já foram migrados; restam ~10 nativos de propósito — handler compartilhado ou chevron próprio.)

### Ícones de Módulo (topbar) — quem monta é o `PageHeader`
Não montar o chip do ícone à mão: passe `cor="…"` ao `PageHeader` (seção "Topbar de página") e ele resolve o fundo e a cor do ícone. Cada módulo tem sua cor:
- Pedidos: blue | Clientes: green | Produtos: purple | Financeiro: amber
- Expedição: sky | Dashboard: red | Rota: orange | PCP: teal
- **Tema Starbucks:** `cor="blue"` sai em verde-claro (`bg-mint`) com ícone verde — fundo azul + ícone verde brigava. As demais cores de módulo permanecem.

### Regras de Raio de Borda
- Inputs: `rounded` (4px) ou `rounded-md` (6px)
- Botões: **sempre pílula** (`rounded-full`) — sem exceção além de segmented control e card-botão (classe `raio-proprio`, ver Linguagem visual v2)
- Cards simples: `rounded-lg` (8px)
- Cards com header: `rounded-xl` (12px)
- Modais/painéis grandes: `rounded-2xl` (16px)
- Badges: `rounded-full`

### Barras de Progresso (metas) — cor por %
- 0–50%: `bg-red-500` | 50–80%: `bg-blue-500` | 80–99%: `bg-yellow-400` | 100%+: `bg-green-500`

### Tipografia
- Título de página: `text-2xl font-bold text-gray-900` (mobile: `text-lg`)
- Cabeçalho de seção: `text-xs font-bold uppercase tracking-widest text-gray-600`
- Label de campo: `text-sm font-medium text-gray-700`
- Texto corrido: `text-sm text-gray-600`
- Cabeçalho de tabela: `text-xs font-semibold text-gray-500 uppercase tracking-wide`

### OBRIGATÓRIO ao criar ou editar qualquer tela

**Ao criar uma tela nova ou alterar uma existente, SEMPRE:**
1. Usar os tokens e padrões acima (cards com `rounded-xl border border-gray-200 shadow-sm`, botões com as classes definidas, badges com as cores de status corretas, etc.)
2. Garantir que a tela funciona no mobile (ver seção "Responsividade Mobile" abaixo)
3. Não inventar estilos novos — reutilizar os padrões do design system

### Linguagem visual v2 (aprovada pelo dono em 12/09/2026)

> Baseado em `docs/melhorias-2026-09/relatorios/design.md` (seções 3 e 4) e `docs/melhorias-2026-09/01-navegacao-design.html` (Propostas 3 e 4).

- **Cabeçalho de página ÚNICO:** todo topo de tela de nível 1 usa o componente `PageHeader` (`frontend/src/components/PageHeader.jsx` — **já existe**; props `icon`, `cor` do módulo, `titulo`, `subtitulo`, `acoes`): cápsula de cor do módulo + ícone + `<h1>` + subtítulo opcional + slot de ações à direita. Nenhuma tela improvisa cabeçalho; nenhuma tela fica sem título.
- **Uma ação principal por tela:** só 1 botão primário verde visível no cabeçalho; as demais ações vão para um menu "⋯" ou botão secundário (outline). Barra com 3-4 botões do mesmo peso é proibida.
- **Botão sempre pílula, inclusive `rounded-lg`/`rounded-xl`** (a camada de remapeamento em `index.css` passa a cobrir esses raios também); o CTA nunca usa a cor do módulo (sky/teal/orange), só `bg-primary`. Exceção: segmented control (abas dentro de um controle, ex. Dados/Promoções/Compras em `GerenciarProduto.jsx`) e card-botão (card inteiro clicável, ex. `FuncionariosLista.jsx`, `Catalogo.jsx`) usam raio de propósito — marcar com a classe `raio-proprio` para ficar fora do remapeamento.
- **Piso de cinza:** `text-gray-400` só em ícone decorativo e placeholder de input. Texto lido (estado vazio, metadado, legenda, subtítulo) usa `text-gray-500` no mínimo; corpo de texto `text-gray-600`+.
- **Estado vazio com o componente `EstadoVazio`** (`frontend/src/components/EstadoVazio.jsx` — **já existe**, usar sempre): ícone em círculo `bg-mint`, frase humana em `text-gray-700`, e quando fizer sentido um botão de ação ("+ Novo cliente", "Limpar filtros"). Proibido "Nenhum registro encontrado" solto em linha de tabela cinza.
- **Duas famílias de card só:** conteúdo `rounded-xl border border-gray-200 shadow-sm` e modal `rounded-2xl shadow-xl`. Eliminar `rounded-lg shadow`/`shadow-md` sem borda ao tocar na tela.
- **Espaçamento em 3 níveis, escolhido de propósito:** compacto (listas densas de campo: Rota, Caixa) `p-3 gap-2`; padrão (maioria) `p-5 gap-3`; respirado (decisão/KPI, dashboards) `p-6 gap-4`. KPI = número em `text-2xl`/`text-3xl font-bold` + rótulo `text-xs uppercase` — o olho pousa no número.
- **Toast (`react-hot-toast`)** com estilo do tema (sucesso verde/mint, erro vermelho), posição única, configurado uma vez no `main.jsx`/`App.jsx`, nunca por chamada.
- **Glossário único de rótulos de status** (`frontend/src/constants/statusLabels.js` — **já existe**, usar sempre): o mesmo estado tem o mesmo texto em todas as telas.

### BOAS PRÁTICAS DE USO — comportamento das telas (pedido do dono em 12/09/2026)

- **Foco/cursor nunca some.** Depois de qualquer ação em sequência (adicionar item, dar entrada, salvar linha, bipar, aplicar filtro), o foco volta para o campo mais óbvio do próximo passo — normalmente o primeiro campo do formulário de linha (ex.: entrada de estoque: após clicar "+", cursor volta para "Quantidade" ou para a busca do produto, com o texto selecionado). Regra prática: todo botão que "consome" um campo e limpa o formulário chama `ref.current?.focus()` (e `select()`) no campo inicial logo após o `setState`. Modal abre com `autoFocus` no primeiro campo. Campo de leitor de código de barras nunca perde o foco (refoca no `onBlur` enquanto a tela de bipe estiver ativa). Nunca deixar o foco num botão desabilitado ou num elemento que foi removido.
- **Enter avança/confirma, Esc cancela.** Em formulário de linha (item de pedido, contagem de inventário, entrada de estoque) Enter no último campo executa a ação principal; Esc fecha modal/limpa.
- **Clique duplo não duplica.** Botão de ação que grava fica desabilitado com estado "salvando…" até a resposta; a operação também deve ser idempotente no backend.
- **Feedback imediato.** Toda gravação mostra toast de sucesso/erro; a linha nova aparece na lista sem recarregar a página; o scroll não pula para o topo.
- **Confirmação só para o irreversível** (excluir, estornar, cancelar NF). Ação comum não pede "tem certeza?".
- **Valor digitado nunca se perde**: erro de rede mantém o formulário preenchido; ao trocar de aba dentro da tela, o rascunho permanece.
- **Mobile**: teclado numérico (`inputMode="decimal"`/`"numeric"`) em campo de quantidade/valor; o botão principal do momento fica acessível sem rolar (ver **Botões de ação — REGRA ÚNICA**).
- Ao mexer em qualquer tela, conferir esses itens nela (boy scout), mesmo que não seja o foco da tarefa.

---

## Responsividade Mobile — OBRIGATÓRIO em toda tela

O app é acessado no celular por vendedores e no iPad pela equipe interna. **Toda tela deve funcionar bem em mobile (≥ 320px)**. Seguir estas regras sem exceção:

### Estrutura geral mobile-first
- Começar sempre pelo layout mobile (sem prefixo) e adaptar para desktop com `md:` e `lg:`
- Nunca deixar scroll horizontal — testar com `max-w-full overflow-x-hidden` no container raiz da página
- Padding de página: `p-3 md:p-6` (compacto no mobile, espaçoso no desktop)

### Desktop: aproveitar a LARGURA da tela (regra de 11/2026, pedido do dono)
Tela larga não é para ficar com uma coluna estreita e comprida — o usuário não quer ficar rolando para cima e para baixo.
- **Formulário/modal no desktop:** usar a largura toda (`max-w-[1400px]` ou mais) em **2–3 colunas** (`grid md:grid-cols-2 xl:grid-cols-3`), de modo que o essencial caiba **sem rolar**. Ex.: dados | parcelas+pagamento | produtos+anexo. No celular vira **1 coluna**.
- **Ações e totais ficam presos (não rolam junto)** — o lugar segue a seção **Botões de ação — REGRA ÚNICA**. Neste caso (formulário/modal comprido de largura total no computador) é o **topo**: barra `sticky top-0` com título, total/resumo e Cancelar/Salvar, porque no rodapé o Clippy cobriria.
- **Textos de ajuda ("Como fazer", "Avisos") vão no FIM da página**, abaixo das colunas — é a única parte que pode exigir rolagem.
- **Nada de letra/número cortado:** nome de produto/fornecedor em linha própria (largura total); campos de valor com largura suficiente; no mobile usar `grid-template-columns: minmax(0,1fr)` (nunca `1fr` puro) para nada passar da largura. Sem rolagem interna em quadro pequeno.
- Ao propor tela nova, **mostrar SEMPRE as duas visões (desktop E mobile) ao dono antes de construir**, no mesmo preview, com botão **Computador / Celular** (o celular aparece numa moldura de 390px dentro do próprio desktop — o dono trabalha no Mac e não abre no celular). Técnica: `container-type:inline-size` no palco + `@container (max-width:760px)` em vez de `@media`, assim a moldura dispara o layout mobile. Para testar mobile em preview HTML use um `<iframe>` de 390px (o Chrome headless não reduz a janela abaixo de ~500px).
- Referência aprovada: preview "Nova Despesa Desktop" (Artifact) para o modal de despesa do Contas a Pagar.

### Listas e grids
- **Tabelas:** em mobile exibir como cards (`block md:hidden` para a versão card, `hidden md:block` para a tabela). Estrutura de card mobile para linha de tabela:
```jsx
{/* Mobile: cards */}
<div className="md:hidden space-y-3 p-3">
  {itens.map(item => (
    <div key={item.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-gray-900">{item.titulo}</span>
        <BadgeStatus status={item.status} />
      </div>
      <div className="text-sm text-gray-500">{item.detalhe}</div>
    </div>
  ))}
</div>
{/* Desktop: tabela */}
<div className="hidden md:block overflow-x-auto">
  <table className="min-w-full divide-y divide-gray-200">...</table>
</div>
```
- **Grids de KPI:** `grid-cols-2 md:grid-cols-4` — nunca `grid-cols-4` sem prefixo `md:`
- **Formulários:** `grid-cols-1 md:grid-cols-2` com `gap-4`

### Topbar de página — sempre o componente `PageHeader`
Não montar cabeçalho à mão (o exemplo antigo daqui era azul com botão de canto 6px — contradizia o tema).
```jsx
import PageHeader from '../../components/PageHeader'; // ajuste o caminho
<PageHeader
  icon={Icon}
  cor="blue"            // cor do módulo; "blue" já sai em verde-claro (bg-mint) dentro do componente
  titulo="Título"
  subtitulo="Opcional"
  acoes={
    <button className="px-3 py-1.5 md:px-4 md:py-2 bg-primary hover:bg-primaryDark text-white rounded-full text-xs md:text-sm font-semibold">
      Ação
    </button>
  }
/>
```

### Tela lista + painel de ação (mestre-detalhe) — a lista rola, o painel não
Telas com uma **lista à esquerda** e um **painel de ação à direita** (ex.: Ajuste de Estoque):
- A partir de `md` (768 px — cobre iPad e zoom 150%/200%) a raiz da tela tem a **altura da janela**: `md:h-[calc(100vh-2.5rem-var(--topo-extra,0px))] md:supports-[height:100dvh]:h-[calc(100dvh-2.5rem-var(--topo-extra,0px))]` (fallback `100vh`, `100dvh` onde existe), com `md:flex md:flex-col`; a área de colunas é `md:flex-1 md:min-h-0`. O `2.5rem` é o `pb-10` do `<main>`; `--topo-extra` é uma variável CSS definida no wrapper do `App.jsx` (38px enquanto a barra de visitantes está visível, 0 quando fechada) — sem ela a página rola 38 px. Conferir: `document.scrollingElement.scrollHeight` == altura da janela.
- **Só a lista rola** (`md:h-full md:overflow-y-auto`; em 1 coluna de cards abaixo de `lg`). O painel da direita **fica parado** — nada de `sticky` + altura solta, que corta o painel quando a janela é pequena.
- **Painel maior que a tela rola POR DENTRO** (`md:overflow-y-auto` na parte de conteúdo) e o **bloco de ação (campo + botões) fica fixo no pé** (`md:shrink-0`), sempre visível.
- Vale **também com zoom do navegador em 150% e 200%** (a janela "encolhe" em pixels CSS): testar em 960×600 e 720×450 — nada cortado, botões acessíveis, sem scroll horizontal.
- Abaixo de `md` (celular / zoom extremo): lista e painel em fluxo normal (lista some ao selecionar, "Voltar à lista" com 44 px) e o **bloco de ação vira barra fixa no rodapé** (`fixed bottom-0 left-0 right-0 bg-white border-t md:static`), com `pb-32` no conteúdo para nada ficar escondido atrás dela.
- Referência: `Estoque/PainelEstoque.jsx`. `Pedidos/NovoPedido.jsx` já respeita. Candidatos a migrar quando forem tocados: `Estoque/PosicaoEstoque.jsx`, `RH/FuncionarioFicha.jsx`, `Admin/Produtos/GerenciarProduto.jsx`.

### Filtros
- Em mobile: empilhar verticalmente (`flex flex-col gap-2`) ou usar scroll horizontal (`flex gap-2 overflow-x-auto hide-scrollbar`)
- Inputs de filtro: `w-full` no mobile, largura fixa no desktop (`md:w-48`)

### Botões de ação — REGRA ÚNICA (decisão do dono em 24/11/2026)

Vale para Salvar / Cancelar / Confirmar / Finalizar e para a barra de total que anda junto. **Substitui as quatro regras antigas que se contradiziam** (rodapé × topo). O dono definiu os dois primeiros itens; o lugar padrão é o mais usado hoje no app.

1. **Nunca cobertos e nunca fora de alcance.** Nada fica por cima do botão: Clippy, teclado do celular, barra do iPhone (somar `env(safe-area-inset-bottom)` ao padding), outra barra fixa, borda do modal. E a barra não esconde conteúdo: quando ela é fixa, o conteúdo ganha folga no fim (`pb-32` ou a altura da barra).
2. **Presos quando a tela rola.** Se o formulário/lista passa de uma tela, os botões ficam fixos — o usuário nunca pode ter que rolar tudo de novo e perder o lugar para achar o botão. Tela ou modal curto, que cabe inteiro: botão no fim, sem fixar.
3. **Lugar padrão: RODAPÉ** — é o mais usado (medido em 24/11/2026: 12 telas e modais com a ação no rodapé).
   - Tela: `fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-3 md:static md:border-0 md:bg-transparent md:p-0` (o `md:static` só quando no computador a tela cabe sem rolar).
   - Modal: pé preso (`sticky bottom-0 bg-white border-t`). Painel do mestre-detalhe: bloco de ação fixo no pé do painel (ver seção "Tela lista + painel de ação").
4. **Topo só quando o rodapé ficaria coberto** (o item 1 ganha do 3). Hoje isso acontece num caso: **formulário/modal comprido de largura total no computador**, porque o Clippy mora no canto inferior direito (`components/Clippy/Clippy.jsx`; só existe em tela de 1024px de largura para cima — no celular ele não aparece). Aí a barra é `sticky top-0` (título, total, Cancelar/Salvar). **Formulário novo no celular = rodapé.** A Nova Despesa do Contas a Pagar já está no ar com a barra no topo também no celular (preview aprovado): fica como está, **não migrar nem copiar para tela nova sem pedido do dono**.
   - **Painel do mestre-detalhe no computador:** o bloco de ação continua no pé do painel (padrão no ar em `Estoque/PainelEstoque.jsx`), mas esse é o mesmo canto do Clippy. O item 1 vale aqui também: ao criar ou tocar numa tela dessas, provar que o botão não fica debaixo do Clippy na posição padrão; se ficar, dar folga ao bloco ou subir o botão. (Em 24/11/2026 isso não foi conferido tela por tela.)
5. **Prova (QA):** em 375px e em 1366px, rolar até o meio da tela e mostrar que o botão principal continua visível, clicável e sem nada por cima (Clippy na posição padrão).

### Textos e truncamento
- Títulos longos: `truncate` ou `line-clamp-1` para não quebrar layout
- Evitar `whitespace-nowrap` em colunas que podem ter texto variável

### Toque (tap targets)
- Botões e links clicáveis: mínimo `44px` de altura em mobile (`min-h-[44px]` ou `py-3`)
- Ícones clicáveis: sempre com padding ao redor (`p-2` mínimo)

### Checklist antes de considerar uma tela pronta
- [ ] Funciona em 375px de largura (iPhone SE) sem scroll horizontal?
- [ ] Tabelas viram cards no mobile?
- [ ] Grids não ficam com mais de 2 colunas no mobile?
- [ ] Botões e campos têm tamanho confortável para toque?
- [ ] Textos não saem cortados ou sobrepostos?

---

## Regras de CSS e Animações

### NÃO animar `box-shadow` em mobile
Animar `box-shadow` via `@keyframes` força repaint completo a cada frame no Android Chrome.
Isso causa artefatos visuais durante o scroll (cards "fantasma", conteúdo duplicado na tela).

**Errado:**
```css
@keyframes pulse {
  50% { box-shadow: 0 0 0 4px rgba(255,0,0,0.3); }
}
```

**Certo — usar apenas propriedades GPU-composited:**
```css
@keyframes pulse {
  50% { opacity: 0.45; }
}
.animate-pulse {
  will-change: opacity;
}
```

Propriedades seguras para animação (GPU-composited): **`opacity`**, **`transform`**.
Propriedades que causam repaint (evitar em animações): `box-shadow`, `border`, `color`, `background-color`, `outline`.

---

## Regras de Layout Mobile

### Nunca usar `position: absolute` com offset negativo em elementos dentro de CSS Grid sem `gap`
Isso causa sobreposição de cards no Android Chrome.

**Errado:**
```jsx
<div className="grid grid-cols-1">
  <div className="relative">
    <div className="absolute -top-1.5 -left-1.5 z-10">badge</div>
    <Card />
  </div>
</div>
```

**Certo — badge inline no fluxo normal:**
```jsx
<div className="grid grid-cols-1 gap-2">
  <div>
    <div className="flex items-center gap-2">
      <span>badge</span>
      <span>conteúdo ETA</span>
    </div>
    <Card />
  </div>
</div>
```

### Sempre incluir `gap` em grids mobile
Grids com `lg:gap-3` mas sem gap no breakpoint mobile (`grid-cols-1`) deixam cards sem espaçamento, agravando problemas de layout.

---

## Regras de Dados / Template Strings

### Sempre guardar campos opcionais antes de interpolar em strings
Campos do backend podem chegar `null` ou `undefined`. Interpolar diretamente produz a string `"undefined"` visível ao usuário.

**Errado:**
```js
`${dias}d sem comprar · ciclo ${ciclo}d`  // → "6d sem comprar · ciclo undefinedd"
```

**Certo:**
```js
`${dias}d sem comprar${ciclo != null ? ` · ciclo ${ciclo}d` : ''}`
```
