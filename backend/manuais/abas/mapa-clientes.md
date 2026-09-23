---
aba: Mapa de Clientes
rota: /clientes/mapa
permissao: clientes (view)
---

# Mapa de Clientes

## O que é

Mapa (dentro de Clientes, botão **Mapa** no topo da lista) que mostra **todos os clientes com ponto GPS** como pinos, para enxergar a carteira por região e reorganizar dias de entrega, dias de venda, categoria e vendedor **sem sair do mapa**. A ideia é responder na hora: "quem eu atendo perto de quem?", "esse cliente está no dia certo?", "tem dois vizinhos em dias diferentes?".

É uma tela de **organização da carteira**, não de logística do dia: quem divide cargas e vê as entregas de hoje continua usando o Mapa das Entregas (Embarque).

## O que dá pra fazer aqui

- **Ver os clientes no mapa** (só os que têm GPS; os sem GPS aparecem em uma lista à parte, na aba **Sem GPS**, para você saber quem falta geolocalizar)
- **Colorir os pinos por**: dia de entrega, dia de venda, categoria, vendedor, WhatsApp (tem / não tem) ou cidade. Cliente com dois dias de entrega (ex.: SEG e QUI) aparece com o pino dividido em duas fatias
- **Filtrar** por cidade, bairro (só os bairros da cidade escolhida), categoria, vendedor (inclusive quem já saiu, marcado "(inativo)"), dia de entrega, dia de venda, WhatsApp (tem/não tem), GPS (com/sem), ativos/inativos, **perfil** (cliente / fornecedor) e **compras no período**. O app **lembra os filtros** na próxima vez que você abrir a tela
- **Perfil**: o cadastro pode marcar um contato como cliente, fornecedor ou os dois ("Também é fornecedor" na ficha). O mapa começa mostrando **só clientes**; quem é só fornecedor fica de fora até você trocar o filtro. Um cadastro que é cliente **e** fornecedor aparece nos dois
- **Compras no período**: escolha um período e diga se quer ver **qualquer** cliente (padrão), só **quem comprou** ou só **quem não comprou** naquele intervalo. "Comprou" segue a **mesma régua da comissão e das metas**: pedido faturado (ou especial), sem bonificação, pela data de venda. Devolução não tira o cliente de "comprou" — ele comprou, só devolveu depois
- **Legenda clicável**: cada item mostra "VALOR · N clientes"; clicar esconde/mostra os pinos daquele valor. Cliente com dois dias conta nos dois
- **Contadores**: total, com/sem GPS, com/sem WhatsApp e quantos clientes em cada dia de entrega e de venda (sempre sobre o que está filtrado)
- **Abrir a ficha rápida** clicando no pino: nome, fantasia, cidade/bairro, categoria, vendedor, dias, telefone/celular com a situação do WhatsApp, último pedido, dias sem comprar e ciclo. Se for cliente balcão (retira na empresa), avisa
- **Quem conferiu o ponto** (novo — 09/2026): quando alguém já marcou/ajustou o ponto GPS daquele cliente por um caminho registrado, a linha **"📍 Conferido · Fulano · dd/mm"** aparece no painel do cliente ao tocar no pino; no computador, também na dica ao passar o mouse sobre o pino. Pino sem essa informação é normal: só aparece quando existe alguém para creditar
- **Corrigir na hora** (edição rápida no painel): dia de entrega, dia de venda, categoria e vendedor → Salvar. O pino muda de cor sem recarregar a página. Botão **Alterar WhatsApp** abre o mesmo popup do cadastro (aqui **sem** a opção "Não consegui agora" — a dispensa só existe na hora de enviar o pedido)
- **Vizinhos atendidos em dias diferentes** (aba **Vizinhos**): lista de pares de clientes a menos de X metros um do outro que **não têm nenhum dia de entrega em comum** (ex.: A na SEG e B na QUI a 42 m). Clicar no par enquadra o mapa nos dois; dá para editar A ou B dali mesmo. O raio (padrão **1000 m**) pode ser ajustado na tela; **Salvar como padrão** grava para todo mundo
- **Paradas por dia** (aba **Paradas**): tabela dia × nº de clientes, para entrega e para venda, sobre o filtro atual
- **Abrir a ficha completa** do cliente (link no painel) quando precisar mexer em algo que o painel não cobre (endereço, CNPJ, condição de pagamento…)
- **Cadastrar ou mover o ponto GPS sem sair do mapa** (desde 13/09/2026): botão **Alterar ponto GPS** / **Cadastrar ponto GPS** no painel do cliente e botão **Ponto GPS** em cada linha da aba **Sem GPS** — abre o mesmo mapa da ficha (arrastar até a porta, "Endereço", "Ponto salvo", "Minha posição"), com as mesmas travas da ficha: ponto inválido, ponto dentro da empresa e ponto duplicado (o mesmo de outro cliente) são **bloqueados**; ponto colado em outro cliente (PRÓXIMO) só grava com **autorização** pela senha de quem pode autorizar, pedida no próprio modal. A mudança **vale na hora** — não vira pendência para a logística aprovar (mudança grande só zera o selo de confirmação, que as próximas entregas refazem). Ou **Marcar no mapa**: arma o modo "mira" (faixa "Toque no local do cliente · Cancelar", no celular o painel se recolhe), o próximo toque no mapa grande escolhe o ponto e o app pede confirmação ("Salvar novo ponto aqui?" → **Salvar aqui** / Escolher outro). O pino muda de lugar na hora; cliente sem GPS entra no mapa e sai da lista Sem GPS. Se o ponto ficar colado em outro cliente (precisa de autorização), o app avisa para usar "Alterar ponto GPS", onde a autorização é pedida. Com o filtro Compras ligado aparece o cartão **"Comprou no período"**, contado sobre os demais filtros (região, vendedor…) — mesmo com "Não comprou" marcado ele mostra quantos daquela seleção compraram. Depois de salvar, a linha "📍 Conferido" some/atualiza sozinha (não fica com o autor antigo)

## Como fazer (passo a passo real)

1. Em **Clientes**, clique em **Mapa** no topo da lista.
2. O mapa abre já enquadrando todos os clientes com GPS. Use **Colorir por** para escolher o que as cores representam (começa por dia de entrega).
3. Filtre (cidade, vendedor, dia…) para reduzir os pinos. O botão "N filtros ativos" mostra quantos estão ligados; **Limpar** volta ao padrão.
4. Clique num pino → o painel da direita (no celular, a folha que sobe de baixo) mostra a ficha e os campos de edição rápida.
5. Ajuste dia de entrega / dia de venda (mesmo seletor de dias da ficha), categoria e vendedor → **Salvar**. Só o que você mudou é gravado; o resto do cadastro fica como estava.
6. Para achar clientes que poderiam ser atendidos no mesmo dia, abra a aba **Vizinhos**: mude o raio se quiser (100 a 20.000 m) e clique **Aplicar**. Clique num par para o mapa ir até eles.
7. Para ver quem ainda não tem GPS, clique no contador **sem GPS** ou na aba **Sem GPS** — cada linha tem o botão **Ponto GPS** para cadastrar ali mesmo (ou o atalho para a ficha).

## Regras importantes

- **Quem você vê**: mesma regra da lista de Clientes. Vendedor que só enxerga "vinculados" vê no mapa **só os seus clientes** — e os vizinhos também só entre os seus. Se "meu vizinho não aparece", é isso, não é defeito.
- **Formato dos dias**: a edição rápida grava os dias exatamente como a ficha (ex.: `SEG, QUI`), então os filtros da lista de Clientes continuam funcionando.
- **N/D** (dia não definido) aparece como um valor na legenda e nos filtros, mas cliente com N/D **não entra** no cálculo de vizinhos. Cliente **balcão** também não (ele não gera parada).
- **Vizinhos** é calculado com o raio informado e a distância em linha reta (não é distância de rua).
- **Histórico**: toda alteração de dia de entrega, dia de venda, vendedor, categoria ou celular feita pelo mapa (e também pela ficha e pelo popup de WhatsApp) fica registrada em `audit_logs` com quem fez, de/para e a origem (`mapa-clientes` quando veio daqui).
- **Erro ao salvar** (sem rede, servidor fora): o painel **não fecha** e o que você digitou fica na tela para tentar de novo; nada é gravado pela metade.
- **Salvar um campo só não apaga os outros**: ao corrigir a partir do mapa (ou trocar o WhatsApp pelo popup), o ciclo de compra personalizado, a observação comercial fixa e o "insight ativo" do cliente **não mudam**. (Correção feita junto com esta tela — antes, uma alteração parcial apagava esses três campos.)

## O que esta tela NÃO faz (fica para a fase 2)

- Não calcula **km rodados por dia** nem rota (sem OSRM).
- Não sugere reorganização com IA.
- Não tem raio diferente para zona rural (é um raio só).

## Filtros disponíveis

Cidade (mostra "Cidade · UF", com a UF do cadastro oficial de cidades) · Bairro (dependente da cidade) · Categoria · Vendedor (ativos e inativos) · Dia de entrega · Dia de venda · WhatsApp (todos / tem / não tem) · GPS (todos / com / sem) · Ativos / Inativos · Perfil (padrão: só clientes; fornecedores só quando pedido) · Compras no período (qualquer / comprou / não comprou, com data de/até) · Colorir por (dia de entrega, dia de venda, categoria, vendedor, WhatsApp, cidade). Todos são lembrados por usuário.

## Permissões necessárias

| Ação | Permissão necessária |
|------|----------------------|
| Ver a tela e o botão Mapa | `clientes` (view) |
| Ver todos os clientes (não só os seus) | `pedidos.clientes = "todos"` (mesma regra da lista de Clientes — ser `admin` sozinho **não** libera; o admin normalmente já tem essa permissão) |
| Editar dia de entrega / dia de venda / categoria / vendedor pelo painel | qualquer usuário que enxerga a tela (mesma regra da ficha hoje) |
| Trocar o WhatsApp de cliente que já tem número | `clientes.edit`, `Pode_Editar_GPS` ou `admin` (cadastrar número em quem não tem: também `pedidos.edit`) |
| **Salvar como padrão** o raio dos vizinhos | `clientes.edit` ou `admin` |
| **Alterar / Cadastrar ponto GPS** e **Marcar no mapa** (os botões só aparecem para quem pode) | `admin`, `Pode_Editar_GPS`, `clientes.edit` ou `Pode_Executar_Entregas` (mesma regra da ficha e da rota `POST /api/gps-clientes/cliente/:uuid/ponto`) |

## Depende de / Interfere em

- Lê o cadastro de Clientes (GPS, dias, vendedor, categoria, celular), o selo de WhatsApp (Pendências de WhatsApp) e os insights comerciais (último pedido, ciclo).
- Grava pela mesma rota da ficha do cliente (`PATCH /api/clientes/:uuid`): o que você muda aqui aparece na ficha e na lista na hora.
- O ponto GPS grava pela mesma rota do módulo Ponto GPS (`POST /api/gps-clientes/cliente/:uuid/ponto`): mesmas travas e mesmo histórico da tela Saúde dos Pontos GPS (aplica na hora, sem criar pendência).
- O raio padrão fica em `app_configs` (chave `mapa_clientes_config`).

## Arquivos no código

- Backend: `backend/routes/mapaClientesRoutes.js` (`GET /api/mapa-clientes`, `GET /compras`, `GET /vizinhos`, `GET/PUT /config`), `backend/services/mapaClientesService.js`, helper `situacaoWhatsapp` em `backend/services/whatsappClienteService.js`, auditoria em `backend/controllers/clienteController.js` (`atualizar`).
- Frontend: `frontend/src/pages/Clientes/MapaClientes.jsx` e `frontend/src/pages/Clientes/mapaClientes/`, `frontend/src/components/DayPicker.jsx`, `frontend/src/components/ModalPontoGps.jsx` (ponto GPS) e `frontend/src/components/FiltroPeriodo.jsx` (período das compras).
