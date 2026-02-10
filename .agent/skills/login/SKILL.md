---
name: login
description: Fluxo de login com e-mail e senha, autenticação JWT e integração frontend-backend.
---

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
