# Guia de Deploy no EasyPanel (Hostinger VPS)

Este guia descreve o passo a passo para colocar o **Backend** no ar e rodar as migrations do banco de dados.

## 1. Preparação (Local)

Antes de ir para o EasyPanel, certifique-se de que o código está no GitHub:
1.  Na raiz do projeto (`CA-Hardt`), inicie o git se nâo estiver iniciado:
    ```bash
    git init
    git add .
    git commit -m "Preparando para deploy"
    ```
2.  Crie um repositório no GitHub e faça o push.

## 2. Configuração no EasyPanel

### A. Criar o Projeto
1.  No EasyPanel, crie um novo projeto (ex: `HardtApp`).
2.  Verifique se o serviço de Banco de Dados (PostgreSQL) já está criado e anote a "Connection String" interna (ex: `postgres://hardt:hardt123@cahardt_hardtapp:5432/hardtapp`).

### B. Criar Serviço do Backend
1.  Clique em **"Add Service"** > **"App"**.
2.  Dê o nome: `hardt-backend`.
3.  Em **Source**, selecione seu repositório do GitHub (conecte sua conta se necessário).

### C. Configurar o Build (Aba "General" ou "Build")
Preencha exatamente assim:

| Campo | Valor |
| :--- | :--- |
| **Build Path** (Caminho de Build) | `/backend` |
| **Build Method** | `Nixpacks` ou `Dockerfile` (O projeto já tem Dockerfile, o EasyPanel deve detectar. Se der opção, prefira Dockerfile) |
| **Port** | `3000` |

### D. Variáveis de Ambiente (Aba "Environment")
Adicione as seguintes chaves:

| Chave | Valor |
| :--- | :--- |
| `DATABASE_URL` | `postgres://hardt:hardt123@cahardt_hardtapp:5432/hardtapp?sslmode=disable` (Sua string do banco interno) |
| `PORT` | `3000` |

### E. Deploy
1.  Clique em **"Deploy"** ou **"Save & Deploy"**.
2.  Aguarde o processo de Build terminar e o status ficar "Running" (verde).

## 3. Rodar Migrations (Criar Tabelas)

Com o serviço `hardt-backend` rodando, precisamos aplicar as tabelas no banco.

1.  Vá na aba **"Console"** do serviço `hardt-backend`.
2.  Isso abrirá um terminal dentro do container.
3.  Digite o comando:
    ```bash
    npm run migrate:deploy
    ```
4.  Você deve ver uma mensagem de sucesso confirmando que as migrations foram aplicadas (`produtos`, `produto_imagens`, `sync_logs`).

## 4. Verificação

Se tudo funcionou:
1.  Ainda no Console, você pode rodar (opcional):
    ```bash
    node -e "const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); prisma.produto.findMany().then(console.log).catch(console.error)"
    ```
    Isso deve retornar `[]` (array vazio), provando que conectou e a tabela existe.

---

## Observações para o Frontend

Para o Frontend (`/frontend`):
1.  Crie outro serviço App (`hardt-frontend`).
2.  **Build Path**: `/frontend`.
3.  **Port**: `80`.
4.  **Backend URL**: Você precisará apontar o frontend para a URL do backend.
    -   Em produção, o ideal é gerar o build com a variável injetada.
    -   No EasyPanel, configure a variável de ambiente `VITE_API_URL` apontando para o domínio do seu backend (ex: `https://hardt-backend.seu-dominio.com/api`).
