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
5. Esse certificado é usado pela **captura automática de NF-e na SEFAZ** (aba Notas Recebidas)

### Captura automática de NF-e (SEFAZ)
1. Na mesma seção de Notas Fiscais há o interruptor **Captura automática de NF-e** (ligada por padrão)
2. Com o certificado instalado e a captura ligada, o sistema consulta a SEFAZ **a cada 1 hora** e traz as notas emitidas contra o CNPJ da empresa para a aba **Notas Recebidas**
3. A tela mostra a última consulta, o resultado e o total de notas já capturadas
4. Se a SEFAZ bloquear por excesso de consultas (erro 656), o sistema pausa sozinho por 1h15 e informa até quando
5. Desligar a captura não apaga nada — só para de consultar a SEFAZ

---

## Permissões necessárias

| Permissão | Efeito |
|-----------|--------|
| `admin` | Acesso total às configurações gerais |
| `configuracoes.edit` | Também pode instalar/consultar o certificado digital e ligar/desligar a captura de NF-e |

---

## Depende de / Interfere em

- **Catálogo** — as categorias de vendas configuradas aqui filtram o catálogo
- **Rota / Atendimentos** — os tipos de atendimento e ações disponíveis vêm daqui
- **Leads** — as origens de lead usadas no cadastro vêm daqui
- **Notas Recebidas** — o certificado digital e o interruptor de captura controlam a busca automática de NF-e na SEFAZ

---

## Arquivos no código

| Caminho | Papel |
|---------|-------|
| `frontend/src/pages/Admin/Configuracoes/Configuracoes.jsx` | Tela principal de configurações |
| `frontend/src/pages/Admin/Configuracoes/RotasAtivasPreview.jsx` | Preview das rotas configuradas |
| `frontend/src/services/configService.js` | Chamadas de API de configurações |
| `backend/src/routes/configuracoes.js` | Rotas do backend |
| `backend/routes/configNotas.js` | Certificado digital (instalar/consultar) + liga/desliga da captura de NF-e |
| `backend/services/certificadoService.js` | Validação do .pfx e criptografia AES-256-GCM |
