---
name: 02-arquitetura-backend
description: "🚨 REGRAS DO BACKEND. Obrigatório consultar antes de criar Rotas, Controllers, Services Node.js, Prisma ou alterar Auth/Login."
---

# 02 ARQUITETURA BACKEND
> ⚠️ **DOCUMENTO MESTRE**: Este documento é a consolidação das antigas skills: backend-arquitetura, login.



-------------------------------------------------
## CONTEÚDO ORIGINAL DE: backend-arquitetura
-------------------------------------------------

# Arquitetura do Backend

O backend é construído com **Node.js**, **Express** e **Prisma ORM**.

## Estrutura de Diretórios

- **`controllers/`**: Lógica de entrada/saída das requisições.
  - Padrão: `nomeController.js`
  - Métodos: `listar`, `detalhar`, `criar`, `atualizar`, `deletar`.
- **`services/`**: Regras de negócio e integração com APIs externas.
  - Ex: `contaAzulService.js` (Sync incremental), `produtoService.js`.
  - **ATENÇÃO API Externa**: Ao criar requisições HTTP dentro dos services (especialmente para a API do Conta Azul), **nunca** utilize `axios.get()` ou `axios.post()` diretamente. Obrigatoriamente utilize os **wrappers internos** (ex: `contaAzulService._axiosGet()`) arquitetados para capturar o Erro 401 e executar o mecanismo de Auto-Refresh do token OAuth2 automaticamente.
- **`routes/`**: Definição das rotas da API.
  - Padrão: `nomeRoutes.js`.
  - Importam os controllers.
- **`prisma/`**: Schema do banco de dados e migrations.
  - `schema.prisma`: Definição única das tabelas.
- **`scripts/`**: Scripts utilitários (migrations manuais, seeds).
  - Ex: `add_timestamp_column.js`, `apply_migration.sh`
- **`config/`**: Configurações (database, etc).
- **`middlewares/`**: Autenticação, validação e tratamento de erros.
- **`index.js`**: Arquivo principal de inicialização do servidor.

## Padrões de Código

### Controller
```javascript
const service = require('../services/service');

const controller = {
  metodo: async (req, res) => {
    try {
      const dados = await service.funcao(req.body);
      res.json(dados);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro interno' });
    }
  }
};
module.exports = controller;
```

### Prisma
- Use `prisma.model.findMany`, `create`, `update`, `upsert`.
- Sempre trate erros com `try/catch`.
- **MUITO IMPORTANTE**: Ao rodar scripts locais fora do container, verifique se a `DATABASE_URL` aponta para `localhost` e não para o nome do serviço docker (`db`).

-------------------------------------------------
## CONTEÚDO ORIGINAL DE: login
-------------------------------------------------

# Skill: Login

Esta skill define as especificações para a implementação do sistema de autenticação do Hardt Salgados App.

## 🎯 Objetivo
Permitir que usuários (vendedores e equipe de apoio) acessem o sistema utilizando e-mail e senha, com segurança garantida por tokens JWT.

## 🎨 Interface (Frontend)
Deve seguir rigorosamente o `tema-visual-app`.

-   **Tela de Login**:
    -   Centralizada, limpa, fundo com cor neutra (`bg-gray-100` ou similar do tema).
    -   Card de login (`bg-white`, `shadow-md`, `rounded`).
    -   **Campos**:
        -   E-mail (Input tipo email).
        -   Senha (Input tipo password).
    -   **Ações**:
        -   Botão "Entrar" (Estilo primário: Azul Conta Azul).
        -   Feedback visual de "Carregando" durante a requisição.
        -   Mensagens de erro claras (ex: "Credenciais inválidas").

## ⚙️ Backend (Fluxo & Arquitetura)
Deve seguir a `estrutura-base`.

1.  **Rota**: `POST /api/auth/login`
2.  **Controller**: Recebe `{ email, password }`.
3.  **Validação**: Verifica se o usuário existe e se a senha confere (comparação de hash).
4.  **Token**: Gera um **JWT** contendo o ID do usuário e permissões básicas.
5.  **Resposta**: Retorna o token e dados básicos do usuário (nome, role).

## 📂 Arquivos Esperados (Sugestão)

### Backend
-   `routes/authRoutes.js`: Definição da rota de login.
-   `controllers/authController.js`: Lógica de autenticação.
-   `middlewares/authMiddleware.js`: Proteção de rotas futuras usando o JWT.

### Frontend
-   `src/pages/Login/`: Componente da página.
-   `src/services/authService.js`: Chamadas à API (`axios` ou `fetch`).
-   `src/contexts/AuthContext.jsx`: Gerenciamento do estado global do usuário (Sessão).

## 🔒 Segurança
-   Senhas nunca devem ser salvas em texto plano (usar hash, ex: bcrypt).
-   JWT deve ter tempo de expiração configurado.