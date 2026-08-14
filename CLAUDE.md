# Diretrizes do Projeto CA-Hardt

## ONDE FICA CADA COISA (definido pelo dono em 14/08/2026)

Três lugares, três papéis — não confundir:

| Lugar | Papel |
|---|---|
| **GitHub** (`clark-neitzel/cahardt`) | **O projeto mora aqui.** Fonte oficial, com todo o histórico. É de onde o EasyPanel puxa para publicar. Trabalho que não foi enviado para cá não existe. |
| **Mac** (`~/Projetos/CA-Hardt`) | **Bancada de trabalho e teste local.** Onde se edita, builda, roda o app e testa — e de onde se envia (push) para o GitHub. Nada deve ficar só aqui. |
| **Google Drive** (`.../Conta Azul/CA-Hardt-Backups/completo_<data>.tgz`) | **Backup de segurança.** Pacote único gerado por `scripts/backup-para-drive.sh`; guarda as 5 cópias mais recentes e leva também o que o GitHub não pode guardar (`.env`, `.admin-secret`). Espaço sobrando e fácil de abrir. |

- **NUNCA trabalhar dentro da pasta do Drive.** Lá cada arquivo é baixado da nuvem na hora do uso:
  o build do frontend levava **31 minutos** (contra ~5 segundos no disco local) e comandos de git
  travavam por minutos. Se alguém abrir uma sessão lá, mudar para `~/Projetos/CA-Hardt` antes de
  qualquer coisa. A pasta `Conta Azul/CA-Hardt` do Drive está **congelada** desde 14/08/2026 (só
  arquivo morto); o backup vivo é o `.tgz` na pasta `CA-Hardt-Backups`.
- **Nunca espelhar pasta (rsync) para o Drive**: o espelhamento precisa varrer o destino e força o
  Drive a materializar tudo — travou 60 min sem gravar nada. Pacote único = 1 escrita = 1 segundo.

---

## FORMA DE TRABALHO — equipe de agentes (REGRA PERMANENTE, pedido do dono em 08/2026)

> Antes era um agente só fazendo tudo e conferindo o próprio trabalho — resultado: serviço entregue
> pela metade e bug voltando (a impressão do iPad foi "corrigida" mais de uma vez). A partir de agora o
> projeto trabalha como uma empresa: **quem faz não é quem confere, e nada chega ao dono sem passar
> pelo portão de entrega.**

### A equipe (fichas em `.claude/agents/`)

| Agente | Papel |
|---|---|
| **thread principal** | **Gerente de projeto.** Fala com o dono, entende o pedido, distribui, cobra e entrega. Não faz sozinho o trabalho do dev. Espera longa (build/deploy) é responsabilidade dele, não do agente. |
| `arquiteto` | Desenha o plano antes de codificar (arquivos, ordem, riscos, critérios de aceite). Somente leitura. |
| `dev-backend` | Implementa rota, service, worker, schema, integração. Não commita. |
| `dev-frontend` | Implementa tela, componente, filtro, impressão. Roda o build. Não commita. |
| `qa-testador` | Prova que funciona **clicando na tela de verdade** (app local + navegador automatizado), inclusive erro e mobile. Não corrige. |
| `revisor-codigo` | Lê o diff procurando bug, violação das regras do projeto e efeito colateral. Não corrige. |
| `gerente-entrega` | Portão final: confere tudo, cobra o checklist, dá o veredito e escreve a nota de entrega. |

### O fluxo

```
pedido do dono → (arquiteto, se médio/grande) → dev-backend / dev-frontend
   → qa-testador  +  revisor-codigo   (em paralelo)
   → reprovou? volta pro dev → repete até passar
   → gerente-entrega → entrega ao dono
```

### Porte da tarefa define o tamanho da equipe

- **Pequena** (texto, cor, campo simples): `dev` → `revisor-codigo`. Sem QA, mas **nunca sem conferência**.
- **Média** (tela nova, correção de bug, relatório): `dev` → `qa-testador` + `revisor-codigo` → `gerente-entrega`. *(padrão)*
- **Grande** (módulo novo; qualquer coisa em fiscal, financeiro, NF-e, WhatsApp, permissões, migração): `arquiteto` antes, equipe completa depois.

### Regras do fluxo

1. **Quem faz não confere.** Dev não aprova o próprio trabalho.
2. **Relatório sem evidência = não feito.** Saída de comando, estado do DOM, resposta de API, PDF, captura de tela.
3. **Nada é entregue ao dono sem o veredito do `gerente-entrega`.**
4. **A entrega final é a nota de entrega**: português simples — o que mudou, o que foi testado, o que ele precisa conferir, o que ficou pendente.
5. **Quem commita é a thread principal**, e só **depois** do veredito do `gerente-entrega` (os agentes nunca commitam nem publicam). O build tem que ter passado — a regra da seção seguinte continua valendo.
6. **Depois de commitar, rode `scripts/backup-para-drive.sh`** — o agendamento das 12h/20h só funciona se o macOS tiver dado permissão ao cron para escrever na pasta do Drive; rodar pela sessão sempre funciona.
7. **Não vale para** pergunta, consulta ou diagnóstico que não altera arquivo — nesses casos, responda direto.
8. **Dispensa**: se o dono escrever **"sem agentes"** (ou equivalente), execute direto, sozinho — mantendo todos os padrões deste arquivo.

### Ativação automática (não depende de ninguém lembrar)

1. **Hook `UserPromptSubmit`** — `.claude/hooks/equipe-agentes.py`, ligado em `.claude/settings.json`:
   roda a cada mensagem do dono e injeta esta regra no contexto; detecta sozinho o "sem agentes".
2. **Esta seção do `CLAUDE.md`** — lida no início de toda sessão.
3. **As fichas em `.claude/agents/`** — carregam o papel e as regras críticas dentro de cada agente.

---

## REGRA INEGOCIÁVEL — Verificação antes de todo commit

**Toda alteração em arquivos frontend (JSX/JS) deve passar pelo build antes do commit.**

```bash
cd frontend && npm run build
```

- Se o build **falhar** → corrigir o erro antes de commitar. Jamais subir código que não compila.
- Se o build **passar** → commitar e fazer push normalmente.
- **Não há exceções.** Nem para mudanças "pequenas" de CSS, ícone ou import.

### Por que isso é crítico
O app roda em produção 24h. Um import faltando (`ReferenceError: Can't find variable`) derruba toda a tela para todos os usuários — vendedores em campo, motoristas, escritório. Uma linha esquecida para toda a operação da empresa.

### O que o build detecta
- Variável/componente usado mas não importado (`Can't find variable: Truck`)
- Import de arquivo que não existe
- JSX mal formado
- Erro de sintaxe JavaScript

---

## Stack
- **Frontend:** React + Vite + Tailwind CSS (PWA)
- **Backend:** Node.js + Express + Prisma (PostgreSQL)
- **Deploy:** EasyPanel (IP 76.13.160.151), acesso via `/api/admin-exec` com header `x-admin-secret: <ADMIN_SECRET>`. **O valor NÃO fica no repositório** — vem da variável de ambiente `ADMIN_SECRET` (EasyPanel); localmente, do arquivo gitignored `backend/scripts/.admin-secret`.

---

## NF-e de DEVOLUÇÃO — emissão AUTOMÁTICA no registro (PROCESSO SENSÍVEL, NÃO QUEBRAR)

> Protegido a pedido do dono em 07/2026. Este fluxo está em produção e funcionando — qualquer
> mudança aqui precisa preservar TODOS os comportamentos abaixo.

**Fluxo em funcionamento:** ao registrar a devolução na conferência do Caixa (`ModalDevolucao.jsx`,
`handleSalvar`), o app **emite a NF-e de devolução automaticamente no mesmo clique** — chama
`POST /api/notas-fiscais/emitir-devolucao/:devolucaoId` logo após criar a devolução (commit `78117fb`).
Não existe mais "Número da Nota" digitado do CA.

- **Se a emissão automática falhar** (SEFAZ fora, cadastro incompleto…), a devolução FICA registrada
  e o toast avisa que dá para emitir depois — o botão **"Emitir NF de devolução"** em
  Pedidos → aba Devoluções (`ListaDevolucoes.jsx`) é o **fallback/reemissão**, não o caminho principal.
- **Travas do backend** (`focusNfeEmissaoService.emitirDevolucao`) que devem permanecer:
  - só devolução `ATIVA` (revertida não emite);
  - devolução de pedido **especial nunca emite** (pedido sem nota de origem);
  - devolução que já tem `notaDevolucaoCA` (nota antiga do CA) não emite de novo;
  - idempotência pela `ref` `nfd-<amb>-<devolucaoId>`: se já está `AUTORIZADO`/`PROCESSANDO`, recusa
    (é o que impede NF em dobro no clique repetido);
  - exige a NF-e **original da venda** como referência.
- **Regras ao mexer em devolução/fiscal:**
  1. **Nunca remover** a chamada automática do `ModalDevolucao` nem o botão de fallback da aba Devoluções.
  2. **Nunca** fazer devolução de especial gerar NF.
  3. Erro na NF **não pode desfazer nem bloquear** o registro da devolução (estoque/cobrança já ajustados).
  4. Qualquer alteração nesses arquivos deve ser testada com uma devolução real (ou simulada) antes do push.

---

## Integração WhatsApp — bot da Ana (NÃO ESQUECER)

**O BotConversa foi desligado em 07/2026.** Todo envio de WhatsApp do sistema (confirmação de pedido, amostra, Kit Festa, delivery, cobrança, boleto/PIX do Asaas, código de verificação do site, avisos internos) passa pelo **bot da Ana** — o mesmo número que atende os clientes, via Z-API.

- **Transporte:** `backend/services/botWhatsappService.js` (cliente HTTP + fila de reenvio).
- **Montagem das mensagens:** `backend/services/webhookService.js` (nomes de função preservados da era BotConversa).
- **Contrato completo:** `INTEGRACAO-ENVIO-BOT-WHATSAPP.md` na raiz (espelha o `integracao-envio-bot.md` v2.0.0 do repo do bot).
- **Credenciais:** `BOT_WHATSAPP_URL` e `BOT_WHATSAPP_API_KEY` na **env do EasyPanel**. **Nunca no repositório, nunca no banco.** Sem elas, nenhuma mensagem sai (fica tudo na fila).

### Toda mensagem DEVE declarar `tipo` e `referencia`

```js
await bot.enviar({ telefone, texto, tipo, origem, referencia });
```

- **`tipo`** — valores fechados: `verificacao` | `pedido` | `entrega` | `cobranca` | `interno` | `outro`. O bot **audita por tipo**: se um fluxo destoar do combinado, o dono corta só aquele. Valor inválido cai em `outro` (marcado como não-classificado lá).
- **`referencia`** — única por mensagem. É a **idempotência**: repetir a mesma `origem`+`referencia` **não reenvia** (devolve `duplicado`). Daí duas regras opostas:
  - **Retry usa a MESMA referencia** — é o que impede duplicar a cobrança.
  - **Reenvio manual (botão) e 2º código de verificação precisam de referencia NOVA** (`bot.referenciaUnica(base)`) — senão o bot bloqueia como duplicata e o cliente **nunca recebe o segundo código**, ficando travado fora do site.
- **Máx. 2000 caracteres.** Acima disso o bot recusa (`texto_longo`) e o cliente não recebe **nada** — por isso `botWhatsappService` corta antes de mandar.
- O carimbo `🤖 *Mensagem automática*` é aplicado **pelo bot**. Não mandar.

### ⛔ A regra que sustenta a integração

O número já foi **banido uma vez** por automação em massa. O bot só liberou o primeiro contato (mandar pra quem nunca escreveu) porque o CA-Hardt se comprometeu, por escrito, a mandar **apenas mensagem transacional provocada por um ato concreto e recente do cliente**.

**Nunca** usar esta integração para promoção, lembrete de recompra, boas-vindas em lote ou lista fria — nem como `outro`. Isso derruba o WhatsApp da empresa inteira. Se surgir necessidade de automação proativa, a saída é a API oficial (Meta Cloud), não contornar aqui.

### Fila de reenvio (`bot_whatsapp_envios`)

Falha reagendável (`429` do teto de 200/h, `502` da Z-API, rede, ou `403` do **modo de emergência** do bot) **não perde a mensagem**: ela entra na tabela como `PENDENTE` e o worker (`workers/scheduler.js`, a cada 5 min) reenvia com backoff (5min → 6h, até 6 tentativas). Nesses casos `enviar()` devolve `{ ok: false, reagendado: true }` — o chamador trata como "vai sair depois", não como erro.

### Diagnóstico quando "a mensagem não chega"

1. **Configurações → Notificação WhatsApp** mostra o status da conexão com o bot, quantas saíram na última hora e o tamanho da fila.
2. O toggle dessa tela (`whatsapp_ativo`) pausa **só o aviso de pedido**. Código de verificação, Kit Festa e cobrança são transacionais e **sempre saem**.
3. Tabela `bot_whatsapp_envios`: `status` (`ENVIADO`/`DUPLICADO`/`PENDENTE`/`ERRO`), `codigoErro` e `ultimoErro` de cada tentativa. Logs no servidor: `[BotWhatsapp]`.
4. `DUPLICADO` **não é falha** — significa que aquela mensagem já tinha saído (idempotência).
5. Se `exigeConversaPrevia: true` no status, o dono ligou o **modo de emergência** no painel do bot: só entrega para quem já conversou; o resto fica na fila até religar.
6. Kit Festa, reenviar: `POST /api/admin-exec/kitfesta-reenviar-whatsapp/:numero` (header `x-admin-secret`).

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
    <Icon className="h-4 w-4 text-blue-600" />
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

**Todo filtro de data/período (novo ou tela que estiver sendo mexida) usa `frontend/src/components/FiltroPeriodo.jsx`** — estilo Conta Azul: um controle só em pílula `[‹] [Este mês · 01/07 – 31/07 ▾] [›]` com presets (Hoje · Últimos 7 dias · Últimos 30 dias · Este mês · Este ano · Todo o período · Período personalizado com De/Até dentro do menu). NÃO criar mais pares de `<input type="date">` soltos; migrar os existentes conforme cada tela for tocada (primeira tela: Contas a Pagar).

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

### Ícones de Módulo (topbar)
Sempre: `bg-[cor]-100 p-2 rounded-lg` + ícone `h-5 w-5 text-[cor]-600`. Cada módulo tem sua cor:
- Pedidos: blue | Clientes: green | Produtos: purple | Financeiro: amber
- Expedição: sky | Dashboard: red | Rota: orange | PCP: teal
- **Tema Starbucks:** chips azuis usam `bg-mint` no lugar de `bg-blue-100` (o ícone `text-blue-600` vira verde pela camada de tema; fundo azul + ícone verde briga). Demais cores de módulo permanecem.

### Regras de Raio de Borda
- Inputs/botões: `rounded` (4px) ou `rounded-md` (6px)
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

---

## Responsividade Mobile — OBRIGATÓRIO em toda tela

O app é acessado no celular por vendedores e no iPad pela equipe interna. **Toda tela deve funcionar bem em mobile (≥ 320px)**. Seguir estas regras sem exceção:

### Estrutura geral mobile-first
- Começar sempre pelo layout mobile (sem prefixo) e adaptar para desktop com `md:` e `lg:`
- Nunca deixar scroll horizontal — testar com `max-w-full overflow-x-hidden` no container raiz da página
- Padding de página: `p-3 md:p-6` (compacto no mobile, espaçoso no desktop)

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

### Topbar de página
```jsx
{/* Mobile: título + botão empilhados ou compactos */}
<div className="flex items-center justify-between p-3 md:p-6 bg-white border-b border-gray-200">
  <div className="flex items-center gap-2">
    <div className="bg-blue-100 p-1.5 md:p-2 rounded-lg">
      <Icon className="h-4 w-4 md:h-5 md:w-5 text-blue-600" />
    </div>
    <h1 className="text-base md:text-2xl font-bold text-gray-900">Título</h1>
  </div>
  <button className="px-3 py-1.5 md:px-4 md:py-2 bg-primary text-white rounded-md text-xs md:text-sm font-semibold">
    Ação
  </button>
</div>
```

### Filtros
- Em mobile: empilhar verticalmente (`flex flex-col gap-2`) ou usar scroll horizontal (`flex gap-2 overflow-x-auto hide-scrollbar`)
- Inputs de filtro: `w-full` no mobile, largura fixa no desktop (`md:w-48`)

### Botões de ação em formulários
- Barra flutuante: `fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-3 md:static md:border-0 md:bg-transparent md:p-0`

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

---

## Regras de UPLOAD DE ARQUIVO (o arquivo TEM que sobreviver ao deploy)

Todo arquivo que o usuário anexa (PDF de boleto/NF, foto, XML, certificado) é gravado em disco no
container do backend. **Só `backend/uploads/` é persistido entre deploys.** Qualquer outro caminho
é apagado na próxima publicação — e o pior: **sem erro nenhum na hora**. O upload responde
"anexado com sucesso", o nome do arquivo aparece na tela, o banco guarda o caminho; o arquivo só
some depois, e o usuário descobre ao tentar abrir. Foi exatamente o que aconteceu com o PDF do
Contas a Pagar em 07/2026 — **14 documentos perdidos**, sem recuperação.

**Certo — sempre `../uploads` a partir de `backend/routes/` ou `backend/services/`:**
```js
const DIR = path.join(__dirname, '../uploads/contas-pagar');   // → /app/uploads/... (volume) ✅
```

**Errado — um nível a mais sai do app:**
```js
const DIR = path.join(__dirname, '../../uploads/contas-pagar'); // → /uploads/... (efêmero) ❌
```

No container o `WORKDIR` é `/app` e recebe o conteúdo de `backend/` — então `backend/routes/x.js`
vira `/app/routes/x.js`, e `../../uploads` cai em `/uploads`, **fora** do volume.

**Regras:**
1. Todo destino de upload usa `path.join(__dirname, '../uploads/<pasta>')`. Conferir contando os
   níveis a partir do arquivo onde a constante está declarada.
2. Ao criar upload novo, **grepar os destinos já existentes** (`grep -rn "uploads/" backend --include=*.js`)
   e seguir o mesmo padrão dos que já funcionam (`certificado`, `tarefas`, `notas-xml`).
3. Ao ler o arquivo, **nunca** confiar só no caminho gravado no banco: se não existir, devolver
   mensagem que explique ("o arquivo se perdeu, anexe novamente") em vez de um erro genérico.
4. **Testar DEPOIS de um deploy, não só localmente** (ver regra abaixo).

---

## REGRA — funcionalidade que grava no servidor só é "pronta" depois de testada EM PRODUÇÃO

Build passando e teste local **não provam** que uma função que grava arquivo, cria pasta ou depende
do ambiente do container funciona de verdade. Local roda fora do Docker, com outra árvore de
diretórios — o bug do PDF do Contas a Pagar **funcionava perfeitamente na máquina local** e só
falhava no servidor, no deploy seguinte.

**Antes de dizer ao usuário que está pronto**, para qualquer coisa que grave arquivo/pasta no
servidor ou dependa de caminho, env var ou volume:
1. Publicar (esperar o deploy concluir de fato — conferir que a versão nova está no ar, ex.: rota
   de diagnóstico respondendo, não 404).
2. Exercitar o fluxo completo **em produção**: gravar → **publicar de novo / reiniciar** → ler.
   O ciclo tem que incluir um deploy no meio, senão o teste não prova persistência.
3. Só então avisar que está pronto. Se não der para testar assim, **dizer isso ao usuário**
   explicitamente em vez de afirmar que está funcionando.

Vale o mesmo espírito da regra do build do frontend: não subir sem testar — aqui, "testar" quer
dizer **no servidor, atravessando um deploy**.

---

## Regras de Schema Prisma (NUNCA QUEBRAR O DEPLOY)

### Nunca remover campos do schema.prisma que já existem no banco

O deploy usa `prisma db push` (sem `--accept-data-loss`). Se um campo for removido do schema e a coluna ainda existir no banco, o Prisma recusa o push e o servidor **não sobe**.

**Errado — causa falha de deploy:**
```prisma
// Antes:
tipoFlex String @default("NORMAL") @map("tipo_flex")
// Depois (removido):
// (campo deletado do schema)
```

**Certo — manter o campo legado no schema:**
```prisma
tipoFlex     String  @default("NORMAL") @map("tipo_flex")  // legado — mantido para não dropar a coluna
flexPositivo Boolean @default(true) @map("flex_positivo")
flexNegativo Boolean @default(true) @map("flex_negativo")
```

**Regra:** ao substituir um campo por outro, **sempre manter o campo antigo** no schema com um comentário `// legado`. Só é seguro remover após confirmar que a coluna foi dropada manualmente no banco de produção.

Isso se aplica a qualquer campo que já existia em produção — mesmo que não seja mais usado no código.

---

## Regras de Transação Prisma (`$transaction`) — banco compartilhado é LENTO

O banco de produção é compartilhado e em horário de pico fica lento. O timeout padrão de uma transação interativa do Prisma é **5 segundos** — fácil de estourar quando a transação tem várias operações. Sintoma real: operação (ex.: dar baixa em parcela) **falha de forma intermitente e só funciona "na 2ª/3ª tentativa"** — é a transação dando timeout e fazendo rollback; ao repetir, uma hora o banco responde rápido o bastante e passa.

**Regras OBRIGATÓRIAS ao escrever qualquer `prisma.$transaction` com callback:**

1. **Sempre passar timeout generoso** — nunca confiar no padrão de 5s:
   ```js
   await prisma.$transaction(async (tx) => { /* ... */ }, { timeout: 20000, maxWait: 10000 });
   ```
2. **Dentro da transação, só o que é atômico de verdade** (o que precisa dar certo junto ou desfazer junto — ex.: criar o registro de pagamento + atualizar a parcela + atualizar a conta).
3. **Tirar da transação tudo que é secundário/log** (registro de `Atendimento`/histórico, notificação, webhook, etc.) e rodar **depois**, em `try/catch` próprio — um log lento ou que falha **nunca** pode derrubar nem fazer rollback da operação principal:
   ```js
   await prisma.$transaction(async (tx) => { /* crítico */ }, { timeout: 20000, maxWait: 10000 });
   try { await prisma.atendimento.create({ /* log */ }); }
   catch (logErr) { console.error('Falha no log (operação já efetivada):', logErr); }
   ```
4. **Nunca** colocar dentro da transação chamada de rede/API externa (Conta Azul, BotConversa, etc.) — só banco.

**Por que é crítico:** operação financeira (baixa, estorno) que falha silenciosamente por timeout faz o usuário clicar várias vezes achando que travou — e no pior caso registra duplicado se a lógica não for idempotente. Referência do padrão correto: `backend/routes/contasReceber.js` (rota `POST /:parcelaId/baixa`).

**Regra de "boy scout" (pedido explícito do usuário):** ao mexer em **qualquer arquivo que já tenha `$transaction`**, verificar as transações vizinhas do mesmo arquivo e ajustar as que não seguem este padrão (faltando `timeout`, ou com log/API externa dentro) — mesmo que não sejam o foco da tarefa. Não é preciso sair varrendo o projeto inteiro de uma vez; a correção acontece naturalmente conforme cada arquivo é tocado. (Em julho/2026 havia ~25 arquivos no backend usando `$transaction` — a maioria ainda no padrão antigo.)

---

## API de Consulta para IA Externa (`/api/ia-consulta/v1`) — NUNCA QUEBRAR O CONTRATO

Existe uma IA de atendimento via WhatsApp num projeto separado ("Antigravity", fora deste repo) que consulta dados do Hardt (catálogo/agenda/entrega do Kit Festa; catálogo/condição comercial dos Congelados; reconhecimento de cliente/histórico/criação de lead em `/cliente/*`, geral para qualquer linha) através de `backend/routes/iaConsultaRoutes.js`. Documentação completa: `backend/docs/ia-consulta-api.md`.

**O bot da Antigravity NÃO deve ter acesso direto ao banco de produção (`DATABASE_URL`/SQL cru).** Em 2026-07 descobrimos que ele rodava SQL direto contra `clientes`/`leads` porque essas funções não existiam nesta API ainda — isso ignora toda proteção daqui (telefone batendo, sem CPF sozinho, avisos de mudança) e quebrou quando o bot assumiu nomes de coluna errados. Se o bot precisar de dado novo, a resposta é **criar endpoint aqui**, nunca reintroduzir acesso direto ao banco.

**Por que isso é crítico:** o pior cenário é o cliente mandar mensagem no WhatsApp e a IA não conseguir responder porque uma mudança nossa quebrou o formato que ela espera — igual a derrubar uma tela, mas no atendimento ao cliente.

**Regras ao mexer em `iaConsultaRoutes.js`, nos controllers que ele usa, ou nos serviços por trás:**
1. **Nunca remover ou renomear um campo já existente** na resposta de um endpoint de `/v1`. Só adicionar campo novo é seguro sem aviso.
2. **Para remover/renomear algo:** primeiro registrar um aviso em `backend/config/iaConsultaVersao.js` (array `AVISOS`, com prazo), esperar o prazo, só então remover. Esse aviso aparece automaticamente em `meta.avisos` de toda resposta, para o app consumidor se ajustar antes da mudança valer.
3. **Mudança que quebra o formato de resposta** exige criar `/v2` (novo router paralelo, mantendo `/v1` no ar) — nunca alterar `/v1` de forma incompatível.
4. **Sempre testar com `curl` depois de qualquer mudança, antes de commitar** (exemplos no arquivo de docs) — mesma lógica do build do frontend: não subir sem testar.
5. Ao criar ou mudar qualquer endpoint aqui, **atualizar `backend/docs/ia-consulta-api.md`** no mesmo commit.
6. **Nunca liberar dado pessoal/comercial de um cliente (preço negociado, pedidos, crédito) só com CPF/CNPJ digitado.** CPF e principalmente CNPJ não são segredo (aparecem em nota fiscal, cartão de visita). A identificação válida é: telefone de quem manda a mensagem batendo com o telefone cadastrado (o WhatsApp já autentica o número), OU senha/código de verificação enviado ao telefone JÁ cadastrado (nunca a quem está pedindo). Ver `congeladosService.catalogoPorTelefone`/`criarSenhaPorTelefone` como padrão de referência.

---

## PWA / Atualização

O app é PWA. Sempre que fizer deploy de mudanças visíveis, incluir o ícone de refresh na UI e o hook `useVersionCheck` para que o usuário seja notificado automaticamente.

**Cache do `index.html` (NÃO cachear):** o frontend é servido por nginx (`frontend/Dockerfile`). O `index.html` deve sair com `Cache-Control: no-cache` (sempre revalida via ETag); só `/assets/` (arquivos com hash no nome) podem ter cache longo/imutável. Se o `index.html` for cacheado, o app instalado no iOS (atalho/standalone) fica preso numa versão antiga e **nunca pega o JS novo** após o deploy (sintoma: comportamento antigo persiste mesmo após publicar). Se um usuário ficar preso numa versão velha, orientar a **remover e re-adicionar o atalho** na tela inicial (uma vez) para limpar o cache heurístico. **O `sw.js` também nunca pode ter cache longo** (fica em `location /` do nginx = `no-cache`) — senão o service worker velho nunca é substituído.

### Service worker (`frontend/public/sw.js`) — não remover

No iPhone o app roda como atalho standalone: **sem barra de endereço e sem botão de recarregar**. Sem service worker, qualquer falha de rede na abertura mostrava o erro do Safari ("não foi possível abrir a página") e o usuário ficava preso — tinha que fechar e reabrir várias vezes. Estratégias do SW (registrado em `main.jsx`, só em `import.meta.env.PROD`):
- **Navegação:** rede primeiro (prazo de 6s), cache só como rede de segurança → continua sempre pegando a versão nova após deploy.
- **`/assets/`:** cache primeiro (nome com hash = imutável).
- **Ícones/manifest/fontes:** cache primeiro, revalidando em segundo plano.
- **`/api`: NUNCA interceptado** — dado de pedido/financeiro sempre vem fresco da rede (casa com o `Cache-Control: no-store` do backend).

Ao mudar as estratégias, **subir a constante `VERSAO`** no topo do `sw.js` (é ela que limpa os caches antigos no `activate`).

### Tela nova no `App.jsx` — usar `lazyComRetry`, nunca `React.lazy`

As telas são carregadas sob demanda, em arquivos com hash no nome. Quando sai um deploy o servidor troca esses arquivos e **os antigos deixam de existir** — quem estava com a aba aberta (desktop) ou o app aberto no celular continua com o `index.html` velho e, ao trocar de tela, estoura `TypeError: Failed to fetch dynamically imported module` (tela vermelha "Algo deu errado").

Por isso toda rota lazy usa `frontend/src/utils/lazyComRetry.js`, que tenta de novo e, persistindo, limpa o cache do service worker e recarrega a página **uma vez** (trava em `sessionStorage` evita laço):

```jsx
import { lazyComRetry } from './utils/lazyComRetry';
const MinhaTela = lazyComRetry(() => import('./pages/Area/MinhaTela'));  // NÃO usar lazy() do React
```

`main.jsx` faz a mesma recuperação no `ErrorBoundary`, no `window.onerror` e no `unhandledrejection`, como rede de segurança para imports dinâmicos fora das rotas.

**Nunca deslogar o usuário por erro de rede:** em `AuthContext.jsx`, o `/auth/me` da abertura só apaga o token em **401/403** (o servidor dizendo que o token não vale). Qualquer outra falha (rede, 500, backend reiniciando no deploy) mantém o token, tenta 3 vezes e cai na tela `TelaSemConexao` com botão "Tentar novamente". Antes, um blip de rede apagava o token e jogava o vendedor na tela de login — não reintroduzir um `logout()` genérico no `catch`.

---

## Anúncio de novidades no grupo do WhatsApp (REGRA — pedido do usuário em 07/2026)

Ao **finalizar qualquer mudança visível para a equipe**, gerar por conta própria uma página de anúncio para o dono mandar no grupo do WhatsApp:

1. Criar `frontend/public/novidade-<slug>.html` — página estática, standalone (HTML completo com `<!DOCTYPE>`), mobile-first, no tema Starbucks do app. **Espelhar `frontend/public/novidade-tarefas.html`** (referência do padrão: hero verde-escuro, mock da funcionalidade, seções em accordion, passos "para começar a usar", demo interativa quando fizer sentido). **Accordions SEMPRE já abertos por padrão** (`class="acc aberto"` em todos) — a equipe não clica para expandir e perdia as informações (pedido do usuário em 07/2026); o clique só serve para recolher.
   - **SEMPRE incluir mockups das telas do app em HTML/CSS** (pedido do usuário em 07/2026): uma seção "As telas do app" com cada tela nova/alterada reproduzida como mock (cards, botões e campos no tema do app), com **legendas numeradas** (pins dourados) explicando cada elemento — onde fica o botão, o que cada campo faz, o que acontece ao salvar. Referência do padrão: `novidade-cadastro-clientes.html` (Telas 1/2/3 com classes `.tela`, `.app-card`, `.pin`, `.legenda`). Isso evita dúvidas da equipe sem precisar de screenshot.
2. Incluir as **meta tags Open Graph** `og:title` e `og:description` — **SEM `og:image`** (pedido do usuário em 07/2026): com a logo 512px o WhatsApp montava um cartão gigante no grupo; sem imagem o preview sai compacto, só título + descrição.
3. O link público fica em `https://cahardt-github.xrqvlq.easypanel.host/novidade-<slug>.html` (nginx serve arquivos reais de `public/` direto; funciona sem login).
   - **SEMPRE registrar a novidade no topo de `frontend/public/novidades.json`** (`{ slug, titulo, resumo, data }`, mais recente primeiro) — é esse manifesto que faz o **Clippy balançar** avisando a equipe no computador; ao clicar, ele abre a página da novidade dentro do app. Sem a entrada no JSON, o anúncio só chega a quem está no grupo do WhatsApp. `titulo` curto (vai no balãozinho do Clippy), `slug` sem o prefixo `novidade-`.
4. Entregar ao usuário: o link + **texto pronto para copiar/colar** no grupo (formatação do WhatsApp: `*negrito*`, emojis, curto).
5. Páginas de anúncio antigas podem ser removidas quando a novidade deixar de ser nova (não acumular).
6. **NÃO incluir botão/link "Abrir o app" (ou similar) na página** — a equipe usa o app pelo atalho instalado (PWA); um link abriria o sistema no navegador comum, fora do atalho. A página é só leitura do anúncio (pedido do usuário em 07/2026).

---

## Regras de Impressão (PWA / iPad) — imprimir NA PRÓPRIA PÁGINA, nunca `window.open` nem iframe

O app roda instalado na tela inicial (PWA standalone) e é muito usado em **iPad/iOS**. Duas abordagens que **NÃO funcionam** e estão proibidas:
- `window.open(..., '_blank')` → abre aba/janela externa e tira o usuário de dentro do app (ele precisa fechar e reabrir).
- `<iframe>` oculto + `iframe.contentWindow.print()` → no **iOS/iPad** sai **página em branco só com o endereço do site** (o Safari imprime a página principal, não o iframe) e às vezes trava as próximas impressões.

**Padrão correto ("o que se vê é o que imprime", 08/2026):** montar o conteúdo **na própria página** e, na hora de imprimir, esconder o app em **QUALQUER media** (classe `modo-impressao` no `<html>` com `display:none`, não só `@media print`) — a folha vira o conteúdo normal e visível do documento; depois restaurar tudo. Funciona em desktop e iPad.

> Por que não confiar só no `@media print`: no iPad (AirPrint/preview do Safari, PWA standalone) o snapshot de impressão às vezes usa a renderização de **TELA**, ou aplica o print media pela metade — o padrão antigo (folha `display:none` em tela + inversão só no print) fazia sair **a tela do app**; e colapsar os irmãos a `width:0` deixava a largura do documento indefinida, e o WebKit **ampliava** a folha no "scale to fit". Foi o bug real da impressão de Receitas (08/2026).

```js
function imprimirConteudo(estilos, corpoHtml) {
    const MODO = 'modo-impressao';
    document.getElementById('area-impressao')?.remove();
    document.getElementById('estilo-impressao')?.remove();
    document.documentElement.classList.remove(MODO);
    const style = document.createElement('style');
    style.id = 'estilo-impressao';
    const estilosSemPage = (estilos||'').replace(/@page\s*{[^}]*}/g, ''); // @page só no nível raiz (iOS)
    const regraPage = ((estilos||'').match(/@page\s*{[^}]*}/) || ['@page { size: A4 portrait; margin: 12mm; }'])[0];
    style.textContent = `
        ${regraPage}
        /* MODO IMPRESSÃO — vale em tela E impressão: app some de verdade, folha é o documento */
        html.${MODO}, html.${MODO} body {
            margin:0!important; padding:0!important; background:#fff!important;
            width:auto!important; min-width:0!important; max-width:none!important;
            height:auto!important; min-height:0!important; overflow:visible!important;
        }
        html.${MODO} body > *:not(#area-impressao) { display:none!important; }
        /* largura EXPLÍCITA em mm (área útil A4) — é o que impede o WebKit de re-escalar */
        html.${MODO} #area-impressao { display:block; width:186mm; max-width:100%; margin:0 auto; }
        ${estilosSemPage}
        /* reforço p/ quando o @media print É aplicado normalmente */
        @media print {
            html.${MODO} body > *:not(#area-impressao) { display:none!important; visibility:hidden!important; }
            html.${MODO} #area-impressao, html.${MODO} #area-impressao * { visibility:visible!important; }
            #area-impressao * { -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
        }`;
    document.head.appendChild(style);
    const area = document.createElement('div');
    area.id = 'area-impressao';
    area.innerHTML = corpoHtml;
    document.body.appendChild(area);
    document.documentElement.classList.add(MODO);
    let momentoPrint = 0, timerFallback = 0;
    const limpar = () => {
        area.remove(); style.remove(); document.documentElement.classList.remove(MODO);
        window.removeEventListener('afterprint', limpar);
        window.removeEventListener('focus', aoVoltar);
        window.removeEventListener('pointerdown', aoVoltar);
        document.removeEventListener('visibilitychange', aoVoltar);
        clearTimeout(timerFallback);
    };
    // iOS nem sempre dispara afterprint; focus/visibilidade/1º toque também restauram —
    // com guarda de tempo (no iOS o focus pode disparar cedo, junto do print())
    const aoVoltar = () => { if (momentoPrint && Date.now() - momentoPrint > 1200) limpar(); };
    window.addEventListener('afterprint', limpar);
    window.addEventListener('focus', aoVoltar);
    window.addEventListener('pointerdown', aoVoltar);
    document.addEventListener('visibilitychange', aoVoltar);
    timerFallback = setTimeout(limpar, 60000); // rede de segurança final
    void area.offsetHeight;             // força layout com o modo aplicado
    momentoPrint = Date.now();
    try { window.print(); } catch { limpar(); }  // SÍNCRONO no clique (senão iOS bloqueia)
}
// Para HTML completo (com <style>): extrair estilos + corpo e remover <script> (não roda via innerHTML).
```

**Regras:**
- Impressão (folha A4, etiqueta, comprovante, recibo) → sempre na própria página, com o **modo de impressão em qualquer media** acima. Referência: `frontend/src/pages/PCP/ReceitaDetalhe.jsx` (`imprimirConteudo` / `imprimirHtml`).
- **Não confiar só no `@media print`** para esconder o app (o iPad pode fotografar a TELA). A classe no `<html>` esconde o app com `display:none` em qualquer media; as regras de `@media print` ficam como **reforço**.
- **Larguras explícitas e coerentes em mm**: `#area-impressao` com a largura da área útil da folha (ex.: 186mm p/ A4 com margem 12mm) e html/body sem largura forçada — irmãos colapsados a `width:0` fazem o WebKit **ampliar** a impressão (scale-to-fit sobre largura indefinida).
- **Restauração garantida**: `afterprint` + `focus` + `pointerdown` + `visibilitychange` (todos com guarda de tempo de ~1,2s pós-`print()`, senão o iOS restaura antes do snapshot) + timeout de segurança. Restaurar sempre, inclusive se o usuário cancelar.
- Preservar o `@page` da própria folha quando existir (margens diferentes por documento).
- `print()` **síncrono no clique** (sem `setTimeout`) — senão o iOS bloqueia com "site proibido de imprimir automaticamente".
- `@page` no **nível raiz**, fora do `@media` (iOS não lida bem com `@page` aninhado).
- Incluir `print-color-adjust: exact` para imprimir fundos/cores (ex.: cabeçalhos pretos).
- Limpar sempre o `#area-impressao` e o `<style>` no `afterprint` (+ fallback por timeout), senão sobra lixo no DOM e a próxima impressão falha.
- `window.open` continua **OK apenas para links externos** (mapa/Google Maps, site de terceiro), que devem mesmo abrir fora do app.
- Pontos legados ainda usando `window.open` para imprimir (migrar quando tocar neles): `frontend/src/pages/Pedidos/ImpressaoPedido.jsx`, `frontend/src/pages/Financeiro/ContasReceberTabela.jsx`.
- Cópias do padrão ANTIGO (só `@media print` + visibility) que devem migrar para o modo de impressão acima quando forem tocadas: `Admin/Contabilidade/ContabilidadePage.jsx`, `Admin/Contabilidade/comum.js`, `Financeiro/NotasRecebidasPage.jsx`, `Financeiro/ContasPagarPage.jsx`, `RH/imprimirCartaoPonto.js`, `PCP/EtiquetaLabel.jsx`, `Tarefas/TarefasParecer.jsx`.

---

## Manual das Abas e Clippy — atualizar SEMPRE (não esperar o usuário pedir)

Cada aba/tela do app tem um manual em `backend/manuais/abas/<slug>.md` (índice em `backend/manuais/abas/README.md`). Esses manuais são a **fonte de conhecimento do assistente Clippy** (`backend/services/copilotoService.js` lê os arquivos em runtime + a tabela `ABAS` com as rotas/permissões reais). O Clippy passa a usar a versão nova **ao publicar o backend**.

**CHECKLIST OBRIGATÓRIO ao final de TODA alteração no sistema** (faça por conta própria, sem o usuário precisar pedir):
1. Pergunte-se: esta mudança **cria ou altera** alguma função, tela, fluxo ou permissão visível ao usuário?
2. Se SIM:
   - Atualize o manual da aba correspondente (analise a aba inteira; edite só o que mudou; NÃO remova itens importantes).
   - Se for tela/função **NOVA**: crie o manual (`backend/manuais/abas/<slug>.md`), adicione a linha no índice `README.md` e adicione a entrada na tabela `ABAS` em `backend/services/copilotoService.js` (rota real + permissão real).
   - Se a **rota ou permissão** mudou: atualize a tabela `ABAS`.
   - Cubra TODAS as funções e TODAS as sub-abas da tela.
3. Baseie-se no comportamento REAL do código, não no nome das rotas.
4. Ao final, **avise o usuário** o que foi atualizado no manual/Clippy (ou diga que nada precisou).
