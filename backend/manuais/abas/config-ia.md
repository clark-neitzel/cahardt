---
aba: Config — Inteligência artificial
rota: /config/ia
permissao: configuracoes (ver); admin ou configuracoes.edit (alterar)
---

# Config — Inteligência artificial

## O que é

A tela onde se liga e desliga a IA do **Como Fazer** ("Começar com a IA"), escolhe o modelo, define quantas vezes por dia ela pode ser usada e acompanha quanto foi usado e quanto custou. A IA só **rascunha**: ela nunca publica nada sozinha, e quem decide o que entra no manual é sempre a pessoa.

## O que dá pra fazer aqui

- Ver se a **chave da IA** está configurada no servidor (a chave nunca aparece na tela, só "configurada" ou "não configurada")
- **Como Fazer**: ligar ou desligar a IA, escolher o provedor e o modelo, e o **limite de usos por dia** (vale para todos os usuários juntos). Salvar vale na hora, sem precisar publicar o sistema de novo
- Por enquanto **só o ChatGPT (gpt-6-luna) funciona**. O Claude aparece cinza e desabilitado ("em breve, precisa da chave ANTHROPIC_API_KEY")
- **Preço por modelo**: informe quanto o modelo cobra por milhão de palavras (tokens) de entrada e de saída, e a cotação do dólar. Sem o preço cadastrado, o custo aparece como "preencha o preço do modelo" em vez de R$ 0,00
- **Uso do mês**: quantos manuais foram montados, quantos usos no total, custo estimado, tempo médio e quantos deram erro. Abaixo, o histórico de cada uso (quem, quando, o que fez (tipo de ação) e o título, quanto gastou e o resultado). Dá para trocar o mês
- O **Clippy** (assistente de ajuda) tem configuração própria e não é alterado aqui

## O que o histórico mostra (e o que não guarda)

Cada uso mostra o resultado: **Usado** (a pessoa aproveitou o rascunho), **Descartado**, **Sem resposta** (gerou e a pessoa não decidiu), **Erro**, **Recusado** (a IA não aceitou o pedido) ou **Cancelado** (a pessoa fechou no meio). O sistema **não guarda o texto que foi pedido nem o que a IA respondeu**, só os tamanhos e os tokens gastos.

## Quem pode

Ver: quem tem Configurações (ver). Alterar: **admin** ou **Configurações → editar**. As configurações da IA também ficam protegidas contra alteração por quem não tem essa permissão.

## Dúvidas comuns

- **"Os botões ✨ sumiram no Como Fazer."** A IA está desligada aqui, ou a chave não está configurada no servidor.
- **"Apareceu 'O limite de hoje acabou'."** Aumente o limite por dia aqui, ou espere o dia seguinte. A contagem recomeça à meia-noite (horário de Brasília).
- **"Quero usar o Claude."** Ainda não está disponível; precisa que a chave do Claude seja instalada no servidor.
- **"O custo está em branco."** Cadastre o preço do modelo (entrada e saída por milhão de tokens) e a cotação.
