# Diagnóstico de dados — rota, atendimento e leads

**Coleta:** 23/10/2026, 08:56 de São Paulo (11:56 UTC). Instalação de produção no EasyPanel, por endpoint administrativo de leitura. Nenhum cadastro, pedido, atendimento ou configuração foi alterado.

Complementa a [proposta de telas e regras](proposta-atendimento-rota-leads.md). Os números representam os registros existentes na coleta; exclusões históricas não são reconstituídas. Responsável atual não prova autoria original.

## 1. Universo consultado

| Tabela | Registros |
|---|---:|
| Leads | 136 |
| Atendimentos | 8.911 |
| Pedidos | 5.029 |
| Clientes | 1.265 |
| Vendedores/usuários | 15 |
| Amostras | 5 |

Também foram lidas as configurações de tipos e ações de atendimento e de leads. A exportação foi restrita às tabelas necessárias e a análise local reteve somente os campos utilizados. Senhas, tokens, telefones e coordenadas não integram este relatório.

O histórico de atendimentos vai de 24/03 a 23/10/2026; o de criação de leads, de 07/04 a 24/09/2026; o de criação de pedidos, de 18/03 a 22/10/2026. A coleta contém atividade atual de atendimentos, mas nenhum lead criado em outubro.

## 2. Leads por responsável atual

“Ativo” abaixo significa o mesmo critério de entrada do serviço de leads da rota: sem cliente vinculado e etapa diferente de FINALIZADO/CONVERTIDO. Não significa oportunidade qualificada.

| Responsável | Total | Convertidos | Ativos | Ativos sem atendimento ligado ao lead | Ativos sem próxima visita |
|---|---:|---:|---:|---:|---:|
| Jociel | 108 | 16 | 92 | 90 | 91 |
| Laudenor da Silva | 16 | 2 | 14 | 0 | 14 |
| Edilson | 12 | 2 | 10 | 2 | 10 |
| **Total** | **136** | **20** | **116** | **92** | **115** |

Os 92 ativos atribuídos ao Jociel estão em NOVO. Dos 108 totais dessa carteira, todos têm origem VISITA_VENDEDOR. No conjunto de 136, não há origem WHATSAPP_IA, embora a entrada exista no código.

**Leitura:** o registro de oportunidade está sendo usado muito mais que o acompanhamento estruturado dessa oportunidade. Isso não demonstra que os contatos não aconteceram: podem ter ocorrido fora do sistema ou em um cadastro de cliente ainda não vinculado.

### Criação de leads atribuídos ao Jociel

| Mês de criação | Quantidade |
|---|---:|
| Maio | 17 |
| Junho | 6 |
| Julho | 19 |
| Agosto | 48 |
| Setembro | 18 |
| Outubro, até a coleta | 0 |

Na janela móvel anterior à coleta: 75 em 90 dias e 11 em 30 dias. Oito dos 11 da janela de 30 dias são o grupo “Merc carmim” descrito abaixo. Portanto, o número bruto é especialmente inadequado como indicador de prospecção nesse recorte.

Há 50 leads NOVO dessa carteira sem WhatsApp preenchido. Todos possuem dias de visita cadastrados; a ausência de telefone, isoladamente, não comprova falta de identificação ou inviabilidade de contato presencial.

### Vínculo com pedidos

Dos 16 convertidos atribuídos ao Jociel, 14 possuem cliente vinculado com pelo menos um pedido elegível; 11 possuem pelo menos dois. O critério exploratório exclui bonificação, cancelado, status de envio ABERTO/ERRO/EXCLUIDO e situação CA CANCELADO/DEVOLVIDO/EXCLUIDO.

Isso **não é faturamento apurado**, não confirma entrega, não verifica que a compra ocorreu depois da criação do lead e não prova que a prospecção gerou a compra. É evidência de histórico comercial no cadastro vinculado, suficiente para evitar descartar essas oportunidades indiscriminadamente.

## 3. Grupos de cadastros para conferir

| Grupo | Números dos leads | Evidência | Conclusão permitida |
|---|---|---|---|
| Merc carmim — Jociel | 136, 137, 138, 139, 140, 141, 142, 143 | Mesmo nome, cidade e GPS; criados em 24/09 entre 09:14:33 e 09:27:29; todos sem foto | Forte candidato a duplicidade por repetição de envio |
| Mercado Santo Antônio — Laudenor | 32, 33, 34 | Mesmo nome, telefone e GPS; criados em 12/05 em intervalo de 13min03s; só um tem foto | Forte candidato a duplicidade; problema aparece em outra carteira |
| Panif. Santa Barbara — Jociel | 58, 93 | Mesmo nome normalizado e cidade; datas diferentes; GPS diferente | Precisa conferir estabelecimento/filial antes de qualquer vínculo |

No fluxo atual, o cadastro é criado antes do upload de foto. Se o upload falha, o vendedor recebe erro de criação e pode tentar novamente. Os dois primeiros grupos são compatíveis com essa falha, mas os dados não contêm o erro de upload: **a causa continua sendo hipótese**, a confirmar por logs ou relato.

Não há autorização proposta para apagar ou fundir automaticamente esses registros. A solução precisa preservar histórico, identificação do registro principal e rastreabilidade.

### Coincidências com cadastro de cliente

Foram encontrados 15 leads ainda sem vínculo com coincidência exata de nome normalizado ou telefone em clientes; 10 estão atribuídos ao Jociel. O cruzamento de telefone considerou somente Telefone e Telefone_Celular do cadastro principal, sem os telefones adicionais: não é uma busca exaustiva.

Exemplos para revisão:

| Lead | Responsável atual | Sinal encontrado |
|---|---|---|
| #114 — Top de linha | Jociel | Coincide por nome e telefone com cliente |
| #72 — Mercado kgb | Jociel | Coincide por nome com cliente |
| #76 — Mercado primo | Jociel | Coincide por nome com cliente |
| #57 — Restaurante nice | Jociel | Coincide por telefone com cliente Restaurante Vovó Nice |
| #26 — Posto tio tata | Laudenor | Coincide por telefone com cliente |
| #32 a #34 — Mercado Santo Antônio | Laudenor | Coincidem por telefone com cliente, além de coincidirem entre si |

Telefone compartilhado, nomes genéricos, mudança de proprietário ou filiais podem explicar coincidências. A lista é para conferência, não para afirmar duplicidade definitiva.

## 4. A reclamação sobre pedido antecipado aparece nos dados

Exemplos reais, sem divulgar dados de contato:

| Registro | Autoria comercial registrada | Ação | Observação |
|---|---|---|---|
| 16/04/2026 | Leticia Piske | Atendido sem pedido | “fez pedido ontem” |
| 16/04/2026 | Leticia Piske | Atendido sem pedido | “ja fez pedido essa semana” |
| 17/04/2026 | Leticia Piske | Sem ação estruturada | “PEDIDO ONTEM” em vários registros |
| 20/04/2026 | Jociel | Atendido sem pedido | “Já foi feito o pedido” |

Isso mostra que um motivo recorrente está sendo digitado em texto livre e pode receber uma classificação pouco fiel ao contexto comercial.

### Cruzamento objetivo

Para cada registro de tipo diferente de FINANCEIRO com cliente identificado, procurou-se pedido elegível do mesmo cliente nos **um ou dois dias de calendário anteriores**, sem pedido elegível no próprio dia. Datas foram comparadas no fuso de São Paulo, usando criação do pedido, não a data de entrega.

Resultado no histórico coletado:

- **420 registros**, em **419 pares cliente/dia**.
- 139 classificados como Atendido sem pedido.
- 119 classificados como Sem resposta / Ausente.
- 161 sem ação preenchida.
- 1 classificado como Amostra pedido.

O critério de pedido elegível é o descrito na seção 2 e usa o estado atual na coleta, não o estado histórico no momento do contato. Um mesmo pedido pode aparecer como contexto em mais de um registro.

**Não significa 420 contatos desnecessários ou 420 clientes diferentes.** Reclamação, reposição, confirmação e outros motivos podem justificar contato depois de comprar. Significa que há volume suficiente para tornar esse contexto explícito e oferecer o resultado adequado.

## 5. A avaliação atual tem um problema verificável

| Dado | Quantidade |
|---|---:|
| Registros FINANCEIRO | 3.930 |
| Demais tipos | 4.981 |
| Desses demais, SEM_VISITA | 742 |
| Registros não financeiros com `pedidoId` preenchido | **0** |
| Registros financeiros com `pedidoId` preenchido | **3.927** |
| Não financeiros com Próxima visita | 1.743 |
| Não financeiros com Data de retorno | 8 |
| Não financeiros sem ação estruturada | 808 |

A aba `/geral/atendimentos` do dashboard, no código inspecionado, inclui todos os tipos e usa `pedidoId` para contar os atendimentos que viraram pedido. Todos os vínculos encontrados são FINANCEIRO; nenhum pertence a um registro comercial. Portanto, esse cálculo mistura movimentação financeira com conversão comercial. O painel detalhado usa outra abordagem e inclui pedidos como eventos virtuais.

Há ainda 742 registros “Sem Visita” considerados no conjunto não financeiro. É preciso separar **visita**, **contato remoto**, **tentativa** e **revisão administrativa** antes de avaliar cobertura e qualidade.

Em outubro até a coleta há 1.140 registros de atendimento, sendo 681 não financeiros e 459 financeiros. Os 459 financeiros têm vínculo com pedido. Aplicar a regra do dashboard a esses dados produz **40,26% (459/1.140)**, com todo o numerador composto por registros financeiros. Isso é uma reprodução do cálculo do código com a coleta, não uma captura do dashboard publicado. Esses totais não devem ser chamados de quantidade de visitas ou clientes únicos.

## 6. Configuração real das ações

Tipos: Presencial, WhatsApp, Telefone e Sem Visita.

| Texto exibido | Código armazenado |
|---|---|
| Atendido sem pedido | NOVO |
| Sem resposta / Ausente | VISITAR |
| Reagendado | MANDAR_WHATSAPP |
| Pendência / Problema | LIGAR |
| Manda para WhatsApp | LEVAR_AMOSTRA |
| Amostra pedido | AGUARDO_RETORNO |
| Enviar vendedor | SEM_POTENCIAL |

“Atendido sem pedido” obriga observação; “Reagendado” exige Data de retorno. Para leads, os mesmos códigos têm rótulos como Novo, Visitar, Mandar WhatsApp, Ligar, Aguardo retorno e Sem potencial.

**Implicação:** o código SEM_POTENCIAL não pode ser usado sozinho para concluir que o vendedor descartou um cliente. Em atendimento de cliente ele significa Enviar vendedor. A evolução deve criar códigos semânticos estáveis e manter o contexto histórico, sem reclassificar registros antigos por adivinhação.

## 7. Prioridades resultantes

1. Mostrar pedido recente e propor o resultado “Pedido antecipado — entrega mantida”, vinculado ao pedido e separado de visita fictícia.
2. Corrigir repetição de criação após falha da foto e oferecer busca de cadastro existente.
3. Revisar os grupos concretos de duplicidade e clientes já cadastrados, preservando histórico.
4. Transformar próxima visita/retorno em compromisso que realmente entra e sai da agenda.
5. Reconciliar o cálculo de atendimento, cobertura e venda antes de usar os painéis para avaliar vendedores.

Não foram encontrados elementos suficientes para atribuir intenção inadequada a qualquer vendedor. O diagnóstico mostra problemas de desenho do sistema, rastreabilidade, cadastros e utilização que precisam ser tratados em conjunto.
