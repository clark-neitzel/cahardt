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
- **Preço por modelo e cotação do dólar são AUTOMÁTICOS**: o sistema já conhece o preço dos modelos usados (gpt-6-luna, gpt-6-sol, gpt-6-astra, gpt-5.6-luna e os antigos gpt-4o/4.1) e busca sozinho a cotação do dólar (atualiza a cada ~6 horas; se a internet falhar usa a última salva). **Deixe os campos vazios** — o valor automático aparece como sugestão em cinza. Preencha só se quiser **corrigir** (preço 0 não vale: se o campo ficar zerado/apagado, o sistema ignora e volta ao automático) um preço ou fixar uma cotação; o que você cadastrar vale mais que o automático. Modelo que o sistema não conhece continua aparecendo como "—" (nunca R$ 0,00) até você cadastrar o preço
- **Uso do mês**: quantos manuais foram montados, quantos usos no total, custo estimado, tempo médio e quantos deram erro. Abaixo, o histórico de cada uso (quem, quando, o que fez (tipo de ação) e o título, quanto gastou e o resultado). Dá para trocar o mês
- O **Clippy** (assistente de ajuda) tem configuração própria e não é alterado aqui
- **O preço cadastrado aqui alimenta o painel de custo da IA no Dashboard (aba IA, só administrador)**: o painel usa o preço do modelo e a cotação do dólar para calcular o custo de **todos** os usos da IA no sistema (Clippy, orientação por cliente, fotos do checklist, comprovantes e Como Fazer), não só o Como Fazer. O custo de cada uso é gravado com o preço da hora (cadastrado ou automático); se você mudar o preço depois, os usos antigos continuam com o valor que tinham. Usos que ficaram sem custo gravado (histórico antigo) aparecem com o custo **calculado na hora pelo preço atual e marcados como "estimado"**; depois que o administrador roda o recálculo de custos, essas linhas passam a ter o custo gravado de verdade e deixam de ser "estimadas". O histórico do Como Fazer nesta tela segue a mesma regra

## O que o histórico mostra (e o que não guarda)

Cada uso mostra o resultado: **Usado** (a pessoa aproveitou o rascunho), **Descartado**, **Sem resposta** (gerou e a pessoa não decidiu), **Erro**, **Recusado** (a IA não aceitou o pedido) ou **Cancelado** (a pessoa fechou no meio). O sistema **não guarda o texto que foi pedido nem o que a IA respondeu**, só os tamanhos e os tokens gastos.

## Quem pode

Ver: quem tem Configurações (ver). Alterar: **admin** ou **Configurações → editar**. As configurações da IA também ficam protegidas contra alteração por quem não tem essa permissão.

## Dúvidas comuns

- **"Os botões ✨ sumiram no Como Fazer."** A IA está desligada aqui, ou a chave não está configurada no servidor.
- **"Apareceu 'O limite de hoje acabou'."** Aumente o limite por dia aqui, ou espere o dia seguinte. A contagem recomeça à meia-noite (horário de Brasília).
- **"Quero usar o Claude."** Ainda não está disponível; precisa que a chave do Claude seja instalada no servidor.
- **"O custo está em branco."** Só acontece com modelo que o sistema não conhece: cadastre o preço dele (entrada e saída por milhão de tokens). Para os modelos conhecidos não precisa cadastrar nada.
- **"O painel da aba IA mostra 'sem preço'."** Só ocorre com modelo desconhecido do sistema: cadastre o preço dele aqui e os usos passam a ser estimados com o preço novo. O gpt-6-luna já vem com preço automático.
