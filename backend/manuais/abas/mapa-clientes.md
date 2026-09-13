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
- **Filtrar** por cidade, bairro (só os bairros da cidade escolhida), categoria, vendedor (inclusive quem já saiu, marcado "(inativo)"), dia de entrega, dia de venda, WhatsApp (tem/não tem), GPS (com/sem) e ativos/inativos. O app **lembra os filtros** na próxima vez que você abrir a tela
- **Legenda clicável**: cada item mostra "VALOR · N clientes"; clicar esconde/mostra os pinos daquele valor. Cliente com dois dias conta nos dois
- **Contadores**: total, com/sem GPS, com/sem WhatsApp e quantos clientes em cada dia de entrega e de venda (sempre sobre o que está filtrado)
- **Abrir a ficha rápida** clicando no pino: nome, fantasia, cidade/bairro, categoria, vendedor, dias, telefone/celular com a situação do WhatsApp, último pedido, dias sem comprar e ciclo. Se for cliente balcão (retira na empresa), avisa
- **Corrigir na hora** (edição rápida no painel): dia de entrega, dia de venda, categoria e vendedor → Salvar. O pino muda de cor sem recarregar a página. Botão **Alterar WhatsApp** abre o mesmo popup do cadastro (aqui **sem** a opção "Não consegui agora" — a dispensa só existe na hora de enviar o pedido)
- **Vizinhos atendidos em dias diferentes** (aba **Vizinhos**): lista de pares de clientes a menos de X metros um do outro que **não têm nenhum dia de entrega em comum** (ex.: A na SEG e B na QUI a 42 m). Clicar no par enquadra o mapa nos dois; dá para editar A ou B dali mesmo. O raio (padrão **1000 m**) pode ser ajustado na tela; **Salvar como padrão** grava para todo mundo
- **Paradas por dia** (aba **Paradas**): tabela dia × nº de clientes, para entrega e para venda, sobre o filtro atual
- **Abrir a ficha completa** do cliente (link no painel) quando precisar mexer em algo que o painel não cobre (endereço, CNPJ, GPS, condição de pagamento…)

## Como fazer (passo a passo real)

1. Em **Clientes**, clique em **Mapa** no topo da lista.
2. O mapa abre já enquadrando todos os clientes com GPS. Use **Colorir por** para escolher o que as cores representam (começa por dia de entrega).
3. Filtre (cidade, vendedor, dia…) para reduzir os pinos. O botão "N filtros ativos" mostra quantos estão ligados; **Limpar** volta ao padrão.
4. Clique num pino → o painel da direita (no celular, a folha que sobe de baixo) mostra a ficha e os campos de edição rápida.
5. Ajuste dia de entrega / dia de venda (mesmo seletor de dias da ficha), categoria e vendedor → **Salvar**. Só o que você mudou é gravado; o resto do cadastro fica como estava.
6. Para achar clientes que poderiam ser atendidos no mesmo dia, abra a aba **Vizinhos**: mude o raio se quiser (100 a 20.000 m) e clique **Aplicar**. Clique num par para o mapa ir até eles.
7. Para ver quem ainda não tem GPS, clique no contador **sem GPS** ou na aba **Sem GPS** — cada linha leva à ficha do cliente para cadastrar o ponto.

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
- Não cadastra/corrige o **ponto GPS** — isso continua na ficha do cliente (aba Ponto GPS) e na tela Saúde dos Pontos GPS.

## Filtros disponíveis

Cidade · Bairro (dependente da cidade) · Categoria · Vendedor (ativos e inativos) · Dia de entrega · Dia de venda · WhatsApp (todos / tem / não tem) · GPS (todos / com / sem) · Ativos / Inativos · Colorir por (dia de entrega, dia de venda, categoria, vendedor, WhatsApp, cidade). Todos são lembrados por usuário.

## Permissões necessárias

| Ação | Permissão necessária |
|------|----------------------|
| Ver a tela e o botão Mapa | `clientes` (view) |
| Ver todos os clientes (não só os seus) | `pedidos.clientes = "todos"` (mesma regra da lista de Clientes — ser `admin` sozinho **não** libera; o admin normalmente já tem essa permissão) |
| Editar dia de entrega / dia de venda / categoria / vendedor pelo painel | qualquer usuário que enxerga a tela (mesma regra da ficha hoje) |
| Trocar o WhatsApp de cliente que já tem número | `clientes.edit`, `Pode_Editar_GPS` ou `admin` (cadastrar número em quem não tem: também `pedidos.edit`) |
| **Salvar como padrão** o raio dos vizinhos | `clientes.edit` ou `admin` |

## Depende de / Interfere em

- Lê o cadastro de Clientes (GPS, dias, vendedor, categoria, celular), o selo de WhatsApp (Pendências de WhatsApp) e os insights comerciais (último pedido, ciclo).
- Grava pela mesma rota da ficha do cliente (`PATCH /api/clientes/:uuid`): o que você muda aqui aparece na ficha e na lista na hora.
- O raio padrão fica em `app_configs` (chave `mapa_clientes_config`).

## Arquivos no código

- Backend: `backend/routes/mapaClientesRoutes.js` (`GET /api/mapa-clientes`, `GET /vizinhos`, `GET/PUT /config`), `backend/services/mapaClientesService.js`, helper `situacaoWhatsapp` em `backend/services/whatsappClienteService.js`, auditoria em `backend/controllers/clienteController.js` (`atualizar`).
- Frontend: `frontend/src/pages/Clientes/MapaClientes.jsx` e `frontend/src/pages/Clientes/mapaClientes/`, `frontend/src/components/DayPicker.jsx`.
