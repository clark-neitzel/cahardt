# Funcionários (RH)

**Rota:** `/rh/funcionarios` · **Permissão:** `Pode_Ver_RH` (ver) / `Pode_Editar_RH` (editar)

Cadastro operacional de funcionários da empresa: ficha completa, documentos, exames, atestados, escala de trabalho, link de ponto e desempenho. É a base do módulo de **Ponto** (a aba Ponto usa os funcionários cadastrados aqui).

## Lista de funcionários
- Mostra cada funcionário com **cargo**, **status do dia** (Trabalhando desde HH:MM / Fora) e **alertas** (ex.: ASO vencendo ou vencido).
- Busca por nome, CPF ou cargo. Filtro Ativos / Inativos.
- Botões no topo: **Novo** (ativar funcionário), **Painel de ponto** e **Importar** (ponto via CSV).

## Novo funcionário (ativar a partir do cadastro de Cliente)
1. **Buscar a pessoa** no cadastro de Clientes (por nome ou CPF) — puxa nome, CPF, telefone e endereço automaticamente. Quem não está no cadastro pode ser digitado manualmente.
2. Preencher os **dados de RH**: cargo, admissão, salário e o **tipo de hora extra** (Banco de horas ou Hora extra paga).
3. Ao **Ativar como funcionário**, o sistema já cria uma **escala padrão** (seg–sex 07:30–11:30 / 13:00–17:48, sábado 07:30–11:30, domingo folga), que pode ser ajustada na ficha.

## Ficha do funcionário (abas)
- **Dados:** cargo, salário, tipo de hora extra, **escala semanal** (entrada/saída por dia, com opção de **janela móvel** que desloca a saída mantendo a carga diária), ativar/inativar e o **link de ponto** pessoal (gerar, copiar, enviar por WhatsApp, gerar novo).
- **Documentos:** anexos em PDF/imagem por categoria (RG, CPF, CTPS, Residência, Contrato, Outro / pasta livre). Ver e excluir.
- **Exames (ASO):** admissional, periódico, demissional, retorno e mudança de função, com **data**, **validade**, **resultado** (Apto/Inapto) e anexo. Mostra **badge** de validade (válido / vence em X dias / vencido).
- **Atestados:** data de início, dias de afastamento, CID opcional e anexo.
- **Cartão de ponto:** espelho do mês com **previsto × trabalhado**, **saldo (banco de horas)**, **hora extra** e faltas; cada batida com localização (mapa) e botão para **adicionar/ajustar batida** manualmente (quando o funcionário esquece de bater).
- **Desempenho & Assiduidade:** nota média, número de atestados e avaliações; permite registrar avaliações (período + nota + observação).

## Observações
- O **link de ponto** é fixo por funcionário: ele salva nos favoritos e bate todos os dias pelo mesmo endereço.
- Os anexos ficam em `/uploads/funcionarios/<id>/` e aceitam PDF e imagens (até 15 MB).
- Funcionário pode ser ativado a partir de um Cliente (origem dos dados) e, opcionalmente, vinculado a um usuário do app.
