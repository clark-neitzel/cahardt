# Hardt Salgados App (Integração Conta Azul)

Sistema de vendas e catálogo de produtos integrado ao ERP Conta Azul.

## 🚀 Como Rodar Localmente

### Pré-requisitos
- Node.js (v18+)
- PostgreSQL (Rodando localmente ou via Docker)

### 1. Configuração do Banco de Dados
Certifique-se de que o Postgres está rodando. Crie um banco chamado `hardt_salgados` (ou outro nome de preferência).

### 2. Configuração do Backend
1.  Acesse a pasta `backend`:
    ```bash
    cd backend
    ```
2.  Instale as dependências:
    ```bash
    npm install
    ```
3.  Crie o arquivo `.env` baseado no exemplo abaixo:
    ```env
    DATABASE_URL="postgresql://usuario:senha@localhost:5432/hardt_salgados?schema=public"
    PORT=3000
    ```
4.  Execute as migrações do Prisma para criar as tabelas:
    ```bash
    npx prisma migrate dev --name init
    ```
    *Nota: Se falhar por conexão, verifique sua string de conexão no .env.*
5.  Inicie o servidor:
    ```bash
    npm run dev
    ```

### 3. Configuração do Frontend
1.  Acesse a pasta `frontend`:
    ```bash
    cd frontend
    ```
2.  Instale as dependências:
    ```bash
    npm install
    ```
3.  Inicie o servidor de desenvolvimento:
    ```bash
    npm run dev
    ```
4.  Acesse `http://localhost:5173`.

---

## ☁️ Como Subir na VPS Hostinger (EasyPanel)

O projeto já contém `Dockerfile` configurado para Backend e Frontend, facilitando o deploy em ferramentas como EasyPanel ou Coolify.

### Estrutura no EasyPanel
Crie um **Project** (ex: `HardtApp`) e adicione 3 serviços:

### Serviço 1: Banco de Dados (PostgreSQL)
- **Tipo**: Database > PostgreSQL.
- **Config**: Defina usuário, senha e nome do banco.
- **Adminer**: O EasyPanel geralmente oferece opção de ativar o Adminer/phpPgAdmin com um clique para gerenciar o banco visualmente. Caso contrário, adicione um serviço "Adminer" e conecte ao banco usando as credenciais internas.

### Serviço 2: Backend (App / Docker Image)
- **Source**: Conecte seu repositório GitHub.
- **Root Directory**: `backend/`
- **Build Method**: Dockerfile.
- **Environment Variables**:
    - `DATABASE_URL`: `postgresql://usuario:senha@nome-do-servico-postgres:5432/nome-do-banco` (Use o hostname interno do Docker).
    - `PORT`: `3000`
- **Port**: 3000 (HTTP).

### Serviço 3: Frontend (App / Docker Image)
- **Source**: Conecte seu repositório GitHub.
- **Root Directory**: `frontend/`
- **Build Method**: Dockerfile.
- **Port**: 80 (HTTP).

### Pós-Deploy
1.  No console do serviço **Backend** no EasyPanel, execute as migrações uma vez:
    ```bash
    npx prisma migrate deploy
    ```
2.  Configure o domínio do backend no serviço do Frontend (arquivo `src/services/api.js`) para apontar para a URL de produção do backend (`https://api.seudominio.com`). *Nota: Em produção real, use variáveis de ambiente no frontend no momento do build (VITE_API_URL).*

---

## 📁 Estrutura de Pastas

- `backend/`: API Node.js + Express + Prisma.
- `frontend/`: React + Vite + TailwindCSS.
- `docs/`: Documentação do projeto (PRDs, Specs).
- `.agent/skills/`: Skills e padrões do agente AI.
