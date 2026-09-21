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
