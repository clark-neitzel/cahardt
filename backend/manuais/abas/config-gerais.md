---
aba: Config — Configurações Gerais
rota: /admin/configuracoes
permissao: admin
---

# Config — Configurações Gerais

## O que é

Central de configurações do sistema. Agrupa todas as definições que afetam o comportamento do app: quais categorias aparecem no catálogo de vendas, os tipos de atendimento disponíveis, as origens de lead, as ações que os vendedores podem registrar e outros parâmetros de comportamento.

---

## O que dá pra fazer aqui

- Configurar quais categorias de produto aparecem no catálogo de vendas (`categorias_vendas`)
- Gerenciar os tipos de atendimento disponíveis: nome, cor, visibilidade e comportamentos
  - Obrigar observação
  - Permitir/obrigar data de retorno
  - Transferir atendimento para outro usuário
  - Abrir pedido de amostra automaticamente
  - Criar alerta visual no card do cliente
- Gerenciar as ações de atendimento (o que o vendedor pode registrar como resultado)
- Gerenciar origens de lead (como o lead chegou)
- Ver quais rotas/dias estão configurados (RotasAtivasPreview)
- Configurar parâmetros do caixa diário
- Configurar a mensagem padrão de WhatsApp para notificações
- Instalar o **certificado digital A1** (.pfx/.p12) da empresa para o módulo de notas fiscais (seção Notas Fiscais / Certificado Digital)
- Configurar a integração **Asaas — Boleto e PIX** (seção só para admin): multa e juros do boleto, mensagem impressa no boleto, validade padrão e descrição do PIX, avisos do Asaas ao cliente

---

## Como fazer (passo a passo real)

### Configurar categorias visíveis no catálogo
1. Abra a aba Config — Configurações Gerais
2. Localize a seção de categorias de vendas
3. Selecione quais categorias de produto aparecerão no catálogo
4. Salve

### Adicionar um tipo de atendimento
1. Na seção de tipos de atendimento, clique em **+ Adicionar tipo**
2. Defina nome, cor e os comportamentos (obriga obs, permite retorno, etc.)
3. Salve

### Configurar ações disponíveis
1. Na seção de ações, clique em **+ Adicionar ação**
2. Defina: nome, cor, visibilidade e quais comportamentos especiais ativa
3. Para transferir para outro usuário: marque "Transfere atendimento" e configure responsável fixo ou a escolha do vendedor
4. Salve

### Instalar o certificado digital (Notas Fiscais)
1. Na seção **Notas Fiscais / Certificado Digital**, escolha o arquivo do certificado A1 (`.pfx` ou `.p12`)
2. Digite a senha do certificado e confirme
3. O sistema valida a senha na hora (senha errada = erro imediato), lê titular, CNPJ, emissor e validade, e mostra os dias restantes até vencer
4. O arquivo e a senha ficam guardados **criptografados** no servidor; instalar um novo certificado substitui (desativa) o anterior
5. Esse certificado é usado pela **captura automática de notas** (NF-e na SEFAZ e NFS-e no ambiente nacional — aba Notas Recebidas)

### Captura automática de notas (NF-e e NFS-e)
1. Na mesma seção de Notas Fiscais há **dois interruptores** (ambos ligados por padrão): **NF-e (mercadorias) — SEFAZ** e **NFS-e (serviços tomados) — Ambiente Nacional**
2. Com o certificado instalado e a captura ligada, o sistema consulta **a cada 1 hora** e traz as notas emitidas contra o CNPJ da empresa para a aba **Notas Recebidas** (as duas capturas usam o mesmo certificado A1)
3. A tela mostra, para cada captura, a última consulta, o resultado e o total de notas já capturadas
4. Se a SEFAZ bloquear por excesso de consultas (erro 656) ou o ambiente nacional pedir pausa (HTTP 429), o sistema pausa sozinho por 1h15 e informa até quando
5. Desligar uma captura não apaga nada — só para de consultar
6. **NFS-e**: só chegam notas de municípios já integrados ao sistema nacional da NFS-e (nfse.gov.br)

### Configurar a integração Asaas (Boleto e PIX) — só admin
1. Na seção **Asaas — Boleto e PIX**, o topo mostra o **status da integração**: chave da conta (produção/sandbox), webhook de pagamento (o Asaas avisa o app na hora do pagamento), conta "ASAAS" vinculada no Conta Azul e o vigia de segurança (reprocessa baixas pendentes a cada 10 min)
2. **Boleto — multa e juros**: interruptor + porcentagem para multa por atraso (única, máx. legal 2%) e juros por atraso (por mês, proporcional aos dias, máx. legal 1% ao mês). O banco calcula e cobra sozinho; a baixa entra com o valor extra registrado
3. **Mensagem impressa no boleto**: texto configurável com variáveis `{pedido}`, `{parcela}`, `{cliente}`, `{vencimento}` — o app troca pelo dado real de cada boleto
4. **PIX**: validade padrão do QR Code (Hoje/Amanhã/3/7 dias — é a pré-seleção da tela de gerar PIX, dá pra mudar na hora) e descrição do PIX (aparece no comprovante do cliente; variáveis `{pedido}`, `{cliente}`). PIX não tem multa/juros — vencido, o QR para de funcionar
5. **Avisos ao cliente**: interruptor para o Asaas mandar e-mail/SMS por conta própria (boleto emitido, lembrete, atraso). Recomendação: **desligado** — o WhatsApp do app + Régua de Cobrança já avisam; ligado = aviso em dobro. Vale para clientes cadastrados no Asaas a partir da mudança
6. As mudanças valem para cobranças **emitidas depois de salvar** — boletos/PIX já emitidos não mudam

### Notificação WhatsApp — só admin
Desde 07/2026 **todas** as mensagens de WhatsApp do sistema saem pelo **WhatsApp da Hardt** (o mesmo número que a Ana atende): confirmação de pedido, amostra, Kit Festa, status de entrega, cobrança, boleto/PIX e o código de verificação do site. O BotConversa foi desligado.

1. **Interruptor "Aviso de pedido ao cliente"**: liga/desliga só o resumo do pedido enviado ao cliente quando o vendedor salva. **Pausar aqui NÃO afeta** código de verificação, Kit Festa e cobrança — essas são transacionais (o cliente pediu) e saem sempre.
2. **Conexão com o bot**: mostra se o app está falando com o bot, quantas mensagens saíram na última hora (e o teto), e o tamanho da **fila de reenvio**.
3. **Fila de reenvio**: se o bot estiver fora do ar ou no limite de volume, a mensagem **não se perde** — fica na fila e o sistema tenta de novo sozinho a cada 5 minutos. Só é preciso agir se aparecer "falharam nas últimas 24h".
4. Se aparecer o aviso de **modo de emergência**, o WhatsApp da empresa está sob risco de bloqueio e o bot passou a entregar só para quem já conversou com a gente — o resto fica na fila até o modo ser desligado no painel do bot.
5. O domínio e a chave do bot **não ficam nesta tela** — são configurados no servidor (EasyPanel), por segurança. Se aparecer "Sem conexão", é aí que se resolve.

### Caixa — conferência do dinheiro (só admin)
Cartão **"Caixa — conferência do dinheiro"**. Quatro controles:

1. **Exigir conferência do dinheiro para fechar** — trava o botão Fechar Caixa até alguém contar e assinar o dinheiro, e impede lançar em dia já fechado. **Nasce desligado**: ligue só depois de dar a permissão "Conferir Dinheiro do Caixa" a quem recebe o dinheiro (com ninguém podendo conferir, nenhum caixa fecharia). Ao ligar, a regra passa a valer **daquele dia em diante** — caixas anteriores não travam
2. **Caixa só de segunda a sexta** — sábado e domingo deixam de ter caixa; o movimento do fim de semana entra no caixa da segunda seguinte
3. **Tarefa na agenda quando houver diferença** — falta ou sobra no dinheiro vira lembrete para cobrar a pessoa (o vale continua sendo lançado à mão no Contas a Pagar)
4. **Avisar no WhatsApp caixa parado** — quantos dias sem conferir até o bot avisar quem confere (0 = não avisar). Uma mensagem por pessoa por dia, às 8h

### Backup automático — só admin (somente leitura)
O sistema faz backup sozinho para o **Google Drive** (a mesma conta conectada para os XMLs da contabilidade): o **banco de dados a cada 15 minutos** e os **arquivos anexados (PDFs, XMLs, fotos) 1x por dia** de madrugada. A janela máxima de perda de dados do banco é de 15 minutos.

1. O cartão **"Backup automático"** mostra o selo de saúde: **Protegido** (último backup do banco há menos de 30 min), **Atrasado** (até 2 h) ou **Com problema**.
2. Mostra também a hora e o tamanho do último backup do banco e do último backup de arquivos.
3. Não há botão para agendar ou configurar — o backup roda sozinho no servidor. Se falhar repetidamente, **os admins recebem aviso automático no WhatsApp**.
4. Retenção no Drive (pasta "Backup Sistema Hardt"): cópias de 15 min das últimas 48 h, 1 por dia dos últimos 60 dias, 1 por mês para sempre; arquivos anexados dos últimos 30 dias.
5. Como restaurar (procedimento técnico): `backend/docs/backup-restauracao.md`.

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Acesso total às configurações gerais |
| `configuracoes.edit` | Também pode instalar/consultar o certificado digital e ligar/desligar as capturas de NF-e e NFS-e |

---

## Depende de / Interfere em

- **Catálogo** — as categorias de vendas configuradas aqui filtram o catálogo
- **Rota / Atendimentos** — os tipos de atendimento e ações disponíveis vêm daqui
- **Leads** — as origens de lead usadas no cadastro vêm daqui
- **Notas Recebidas** — o certificado digital e os interruptores de captura controlam a busca automática de NF-e (SEFAZ) e NFS-e (ambiente nacional)

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Admin/Configuracoes/Configuracoes.jsx` | Tela principal de configurações |
| `frontend/src/pages/Admin/Configuracoes/RotasAtivasPreview.jsx` | Preview das rotas configuradas |
| `frontend/src/services/configService.js` | Chamadas de API de configurações |
| `backend/src/routes/configuracoes.js` | Rotas do backend |
| `backend/routes/configNotas.js` | Certificado digital (instalar/consultar) + liga/desliga das capturas de NF-e e NFS-e |
| `backend/services/certificadoService.js` | Validação do .pfx e criptografia AES-256-GCM |
| `frontend/src/pages/Admin/Configuracoes/SecaoBackup.jsx` | Cartão de status do backup automático |
| `backend/services/backupService.js` | Backup do banco (15 min) e dos uploads (diário) para o Google Drive |
