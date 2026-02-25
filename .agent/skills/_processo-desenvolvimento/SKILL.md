---
name: _processo-desenvolvimento
description: "REGRAS OBRIGATÓRIAS de processo de desenvolvimento. DEVE ser consultada antes de QUALQUER tarefa técnica no projeto."
---

# Processo de Desenvolvimento - Regras Obrigatórias

## 🇧🇷 REGRA 0: COMUNICAÇÃO EM PORTUGUÊS

**TODAS as comunicações com o usuário DEVEM ser em português brasileiro.**

- ✅ Explicações técnicas
- ✅ Mensagens de commit  
- ✅ Documentação
- ✅ Comentários em código
- ✅ Logs e debug

**Exceção:** Código em inglês é aceitável quando necessário por convenção técnica (nomes de variáveis, funções).

## 📢 REGRA 0.5: EXPLICAR ANTES DE FAZER

**Antes de fazer QUALQUER alteração, você DEVE explicar:**

### Formato Obrigatório:

```markdown
## 📋 O que vou fazer:
[Descrição clara da tarefa]

## 📂 Onde vou alterar:
- Arquivo: `caminho/completo/arquivo.js`
- Função/Seção: `nomeDaFuncao` (linhas X-Y)

## 🎯 Por que:
[Razão técnica e benefício]

## ✅ Mudanças específicas:
1. [Mudança 1]
2. [Mudança 2]

**Posso prosseguir?**
```

### ⚠️ Escopo Restrito

**ALTERAR APENAS O SOLICITADO. NADA MAIS.**

❌ NÃO fazer:
- Refatorações extras
- Melhorias não pedidas
- Mudanças de estilo
- Otimizações de bônus

✅ FAZER:
- Exatamente o que foi pedido
- Se ver algo para melhorar → **PERGUNTAR** primeiro

## ⚠️ REGRA FUNDAMENTAL: SEMPRE CONSULTAR SKILLS ANTES DE AGIR

**Esta é a regra número 1 deste projeto. Nunca viole.**

### Fluxo Obrigatório para Qualquer Tarefa Técnica

```
1. IDENTIFICAR → Qual área/recurso vou trabalhar? (Auth, Produtos, Clientes, Sync, etc)
2. VERIFICAR → Existe skill para isso? (Listar .agent/skills/)
3. LER → Abrir e ler COMPLETAMENTE a skill relevante
4. PLANEJAR → Basear o plano 100% na skill
5. EXECUTAR → Seguir exatamente o que está documentado
6. DOCUMENTAR → Se criar algo novo ou descobrir algo, atualizar a skill
```

### ❌ PROIBIDO

- ❌ "Tentar algo" sem consultar a documentação
- ❌ Assumir que você "lembra" como funciona
- ❌ Ignorar configurações verificadas nas skills
- ❌ Fazer experimentos (tentativa e erro) sem verificar primeiro
- ❌ Usar "documentação genérica" quando existe skill específica

### ✅ OBRIGATÓRIO

- ✅ Antes de mexer em OAuth/Auth → Ler `contaazul-autenticacao`
- ✅ Antes de mexer em Produtos → Ler `contaazul-produtos`
- ✅ Antes de mexer em Sync → Ler `fluxo-dados-sync`
- ✅ Antes de mexer em Frontend → Ler `frontend-arquitetura` e `tema-visual-app`
- ✅ Antes de mexer em Backend → Ler `backend-arquitetura`
- ✅ Antes de mexer em Login → Ler `login`

### Hierarquia de Informação

1. **Skills do Projeto** (`.agent/skills/`) = **VERDADE ABSOLUTA**
   - Se tem configuração verificada na skill, USE ELA. Não invente.
   
2. **Código Atual** = Implementação baseada nas skills
   - Se o código difere da skill, a skill está desatualizada ou o código está errado
   
3. **Documentação Externa** = Apenas para referência genérica
   - Use APENAS se não houver skill específica
   - Se usar, CRIE uma skill documentando o que foi verificado

### Quando Criar/Atualizar Skills

**CRIE uma nova skill quando:**
- Implementar funcionalidade nova que vai precisar de manutenção futura
- Descobrir configuração específica que funciona (ex: endpoints, credenciais)
- Integrar com API externa pela primeira vez

**ATUALIZE uma skill quando:**
- Descobrir que a informação está desatualizada
- Adicionar caso especial ou configuração verificada
- Resolver bug causado por informação incorreta na skill

### Template de Comentário no Código

Quando implementar algo baseado em skill, adicionar comentário:

```javascript
// CONFIGURAÇÃO VERIFICADA - Ver skill: nome-da-skill
// NÃO ALTERAR sem consultar a skill
```

## Exemplo de Aplicação (Aprendizado do Erro OAuth)

**❌ O que foi feito ERRADO:**
1. Usuário pediu para adicionar scope `sales`
2. Agent tentou adicionar sem ler a skill
3. Agent mudou endpoint de Legacy para Moderno sem verificar
4. Resultou em múltiplas tentativas e erros

**✅ O que DEVERIA ter sido feito:**
1. Usuário pediu para adicionar scope `sales`
2. Agent lê skill `contaazul-autenticacao`
3. Agent vê: "Este projeto usa Legacy/Cognito, scope verificado é X"
4. Agent pergunta: "A skill diz que usamos Legacy. O scope sales não é compatível. Você quer que eu teste mesmo assim ou há outra solução?"
5. Evita tentativa e erro

## Checklist Pré-Execução

Antes de escrever QUALQUER código de integração ou configuração:

- [ ] Identificou a skill relevante?
- [ ] Leu COMPLETAMENTE a skill?
- [ ] Verificou se há seção "VERIFICADO" ou "CONFIGURAÇÃO OBRIGATÓRIA"?
- [ ] Seu plano está 100% alinhado com a skill?
- [ ] Se vai divergir da skill, tem motivo documentado?

---

## 🚨 REGRA DE OURO: DIAGNÓSTICO DE AMBIENTE VS CÓDIGO

**Antes de assumir que o código está quebrado, verifique o AMBIENTE.**

Se você receber erros como `Connection refused`, `Can't reach database`, `500 Internal Server Error` (em rotas novas):

1.  **PARE.** Não altere uma linha de código sequer.
2.  **VERIFIQUE:**
    *   O Banco de Dados está rodando? (`pg_isready`, `docker ps`, `lsof -i :5432`)
    *   A API está rodando na porta certa?
    *   As variáveis de ambiente (`.env`) estão corretas?
3.  **AÇÃO:** Se o ambiente estiver quebrado, conserte o AMBIENTE ou avise o usuário. **NUNCA** tente "contornar" um banco desligado criando código complexo ou mocks não solicitados.

## 🔌 REGRA DE INTEGRAÇÃO COM APIS (OAUTH / CONTA AZUL)

**NUNCA utilize clientes HTTP puros (como `axios.get`, `axios.post` ou `fetch`) diretamente nos services para chamar APIs que dependem de Tokens de Acesso dinâmicos (OAuth2).**

O Conta Azul possui tokens que expiram a cada 60 minutos. Se você usar `axios.get` puro, o código falhará com erro `401 Unauthorized` assim que o token expirar, quebrando sincronizações automáticas e em lote.

**PROCEDIMENTO OBRIGATÓRIO:**
1. Sempre procure e utilize os **Wrappers Internos** do projeto projetados para interceptar erros 401 e fazer o Auto-Refresh do token.
2. No caso do Conta Azul, utilize **SEMPRE** o helper `contaAzulService._axiosGet(url, resourceType)` ou semelhante para leitura de dados.
3. Se precisar criar chamadas POST/PUT/PATCH, verifique como gerenciar a renovação do token (ex: capturar o token via `getAccessToken()`, tentar a requisição e, se der 401, forçar o refresh via `getAccessToken(true)` antes de tentar novamente, replicando o comportamento do helper).

## 🎯 FIDELIDADE AOS DADOS (DATA DRIVEN)

Se o usuário fornecer uma planilha, CSV ou lista de dados (IDs, Nomes, Valores):

1.  **COPIE EXATAMENTE.** Não altere, não "melhore", não gere UUIDs aleatórios se o usuário deu IDs fixos.
2.  **USE SEEDS.** Garanta que esses dados existam no banco via `migrationService` ou seed script.
3.  **NÃO INVENTE.** Se o usuário pediu "Banco Caixinha com ID X", o sistema TEM que ter "Banco Caixinha com ID X".

## 📉 PRINCÍPIO DA SIMPLICIDADE (KISS)

Se o usuário pedir: "Crie uma tabela para X e popule com Y":
*   **FAÇA:** Criar Tabela + Insert (Migration) + Listagem Simples.
*   **NÃO FAÇA:** Criar arquitetura de microserviços, factories complexas, validadores excessivos ou tentar adivinhar regras de negócio futuras. Resolva o problema atual da forma mais direta possível.

**RESUMO:** Não seja criativo com configurações. Seja preciso e baseado em documentação verificada.

