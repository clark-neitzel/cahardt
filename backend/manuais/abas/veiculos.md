---
aba: Veículos
rota: /veiculos
permissao: todos visualizam; admin ou Pode_Editar_Veiculos para editar
---

# Veículos

## O que é

Cadastro e controle da frota de veículos da empresa. Permite registrar carros/caminhões, associá-los às rotas de entrega e gerenciar manutenções preventivas com alertas por quilometragem ou data. Durante o uso diário, o motorista seleciona o veículo ao abrir o caixa, e a ficha do veículo registra KM percorrido.

---

## O que dá pra fazer aqui

- Listar todos os veículos com placa, modelo, tipo de combustível e status
- Cadastrar novo veículo
- Editar dados do veículo (placa, modelo, combustível, documento)
- Ativar/desativar um veículo
- Ver a ficha do veículo (KM por data, histórico de uso nas rotas)
- Gerenciar manutenções: criar alertas de manutenção preventiva por KM ou data
- Marcar um alerta de manutenção como concluído
- Ver quantos alertas pendentes cada veículo tem (badge vermelho)

---

## Como fazer (passo a passo real)

### Cadastrar um veículo
1. Clique no botão **+ Novo Veículo** (admin ou com permissão)
2. Preencha: placa, modelo, tipo de combustível, URL do documento (opcional)
3. Salve

### Registrar alerta de manutenção
1. Clique no ícone de chave inglesa (manutenção) no veículo
2. Preencha: tipo (revisão, pneu, óleo, etc.), descrição, KM alerta e/ou data alerta
3. Salve — o badge de alertas pendentes atualiza

### Marcar manutenção como feita
1. Abra o painel de manutenção do veículo
2. Clique no ícone de check no alerta pendente
3. O alerta some da lista de pendentes

### Ponto diário do motorista: Presencial ou Home Office (e "Pegar veículo" depois)

Ao abrir o app, todo usuário sem a permissão "Isento de Ponto" (e que não é admin) passa pelo **Ponto Diário** e escolhe como trabalha hoje:
- **Presencial (Rota)**: escolhe a placa, informa o KM inicial (o app sugere o último KM registrado do carro e não aceita valor menor) e marca o checklist de segurança obrigatório (pneus, luzes, óleo/água, combustível, CNH/CRLV, limpeza). Veículo já escolhido por outro motorista hoje aparece bloqueado com o nome dele.
- **Home Office**: sem veículo. Se mais tarde a pessoa sair com o carro, usa o botão **"Pegar veículo"** (no celular fica no topo ao lado do menu; no computador, na barra lateral acima do nome). Ele abre o mesmo formulário (placa, KM, checklist) e converte o dia para Presencial — o registro guarda a observação "Começou em Home Office — pegou o veículo às HH:MM". O botão só aparece para quem está em Home Office no dia; só é possível um veículo por dia (para trocar de carro é preciso encerrar o expediente antes).
- **Finalizar**: quem está Presencial vê o botão vermelho "Finalizar" (mesmo lugar do "Pegar veículo") para informar o KM de chegada. Se não informar, no dia seguinte o app cobra o KM final antes de liberar qualquer tela.
- Admin pode ajustar o KM inicial ou apagar o ponto do dia (ex.: modo escolhido errado) pela ficha do veículo.
- **Pendências de Rota (desde 09/2026):** além da trava de KM acima, iniciar o dia também é recusado se o vendedor deixou cliente(s) da rota do **dia útil anterior** (ontem, ou sexta se hoje é segunda) sem nenhum atendimento registrado nem pedido criado. A mensagem mostra quantos clientes e a data ("Você tem N cliente(s) da rota de DD/MM sem atendimento..."); a tela cheia com a lista (registrar atendimento ou abrir pedido para cada um) é o `PendenciaRotaGateway`. Vale a mesma isenção: `admin` ou `Isento_Ponto` pulam a trava. A regra é reforçada nos dois lados — o app já bloqueia a tela (frontend) e o backend também recusa `POST /api/diarios/iniciar` (código `PENDENCIA_ROTA`) se alguém tentar contornar chamando a API direto. Não conta domingo/sábado (o motorista não deveria estar trabalhando) e só vale a partir de 15/04/2026.
  - **Rechecagem automática (desde 09/2026):** como o app fica dias abertos no celular (PWA), a checagem de pendência não é feita só na abertura — ela repete sozinha ao voltar para o app (trocar de aba/app e voltar) no máximo 1x a cada 5 minutos (banco compartilhado lento no pico), e sempre que o dia local virar (mesmo com o celular ligado e o app aberto a noite toda) — nesse caso a rechecagem é imediata, sem esperar os 5 minutos. O mesmo vale para o status do Ponto (`DiarioContext`): se o dia virar com o app aberto, a trava de "iniciar o dia" volta a aparecer sozinha, sem precisar fechar e abrir o app. Se o backend recusar `POST /api/diarios/iniciar` com `PENDENCIA_ROTA` (alguém contornou a checagem do frontend), o app já dispara a rechecagem na hora — a tela cheia de pendências aparece em vez de só um aviso confuso. Se a checagem de pendências falhar por rede (3 tentativas), o app **não libera silenciosamente**: mostra a tela "Não foi possível conferir suas pendências de rota" com botão "Tentar novamente" — o usuário continua logado, só não usa o app até confirmar.

### Ver ficha do veículo (histórico de KM)
1. Clique no ícone de ficha (ChevronRight) no veículo
2. A ficha abre mostrando o histórico de KM por data de uso nas rotas

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| Qualquer usuário logado | Visualiza os veículos |
| `admin` ou `Pode_Editar_Veiculos` | Pode criar, editar e gerenciar manutenções |

---

## Depende de / Interfere em

- **Embarque** — ao montar uma carga, o motorista seleciona o veículo
- **Caixa Diário** — o veículo do dia aparece no caixa; a ficha de KM é registrada no caixa
- **Despesas** — despesas de manutenção do caixa são vinculadas ao veículo do dia

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Veiculos/Veiculos.jsx` | Tela principal com lista e modais |
| `frontend/src/pages/Veiculos/VeiculoFicha.jsx` | Painel de ficha do veículo |
| `backend/src/routes/veiculos.js` | Rotas do backend |
| `frontend/src/components/Diario/DiarioGateway.jsx` | Trava de Ponto Diário (KM) na abertura do app |
| `frontend/src/components/PendenciaRotaGateway.jsx` | Trava de Pendências de Rota (tela cheia com a lista) |
| `backend/services/diarioService.js` (`iniciarDia`) | Recusa o check-in com KM pendente OU rota pendente (`codigo: 'PENDENCIA_ROTA'`) |
| `backend/services/atendimentoService.js` (`buscarPendenciasRota`) | Calcula quem ficou sem atendimento no dia útil anterior |
