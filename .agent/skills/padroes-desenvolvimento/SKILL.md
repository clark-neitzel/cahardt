---
description: Padrões Obrigatórios de Desenvolvimento (Backend & Frontend)
---

# Padrões de Projeto (MANDATÓRIO)

ESTE DOCUMENTO DEVE SER SEGUIDO RIGOROSAMENTE. NÃO INVENTE MODA.

## 1. Migração de Banco de Dados (CRÍTICO) 🚨
O projeto roda em um ambiente (Easypanel) onde o `prisma migrate deploy` **NÃO É EXECUTADO AUTOMATICAMENTE**.
O sistema usa um **MigrationService customizado** que roda no startup da aplicação (`backend/index.js`).

**REGRA:**
Sempre que criar ou alterar uma tabela no `schema.prisma`:
1.  **Adicione o comando SQL** correspondente no arquivo `backend/services/migrationService.js`.
2.  Use `CREATE TABLE IF NOT EXISTS` ou `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
3.  **NUNCA** dependa apenas do `prisma db push` local. Ele atualiza o banco local, mas o servidor de produção precisa do SQL no `migrationService.js`.

## 2. Frontend API (Service Pattern) 🌐
O Frontend (`frontend/src`) consome a API do Backend.
**NUNCA** use `fetch('http://localhost:3000/...')` ou `fetch('/api/...')` diretamente nos componentes.

**REGRA:**
1.  Sempre crie um **Service** em `frontend/src/services/` (ex: `vendedorService.js`).
2.  Importe a instância configurada do axios de `frontend/src/services/api.js`.
    ```javascript
    import api from './api';
    // api.js já tem a Base URL configurada corretamente para Produção/Dev
    ```
3.  Use `api.get()`, `api.post()`, etc.
4.  O componente deve chamar apenas o método do service (ex: `vendedorService.listar()`).

## 3. Estrutura de Pastas
- **Backend:** `backend/` (Node.js + Express + Prisma)
    - `controllers/`: Lógica de negócio HTTP.
    - `services/`: Lógica de negócio reutilizável e Integrações.
    - `routes/`: Definição de rotas Express.
    - `prisma/`: Schema do banco.
- **Frontend:** `frontend/` (React + Vite)
    - `src/pages/`: Componentes de página.
    - `src/services/`: Camada de comunicação com API.
    - `src/components/`: Componentes reutilizáveis UI.

## 4. Integração Conta Azul
- O `backend/services/contaAzulService.js` centraliza TODAS as chamadas à API da Conta Azul.
- Use `syncLog` para registrar o status das sincronizações.
- Ao adicionar novas entidades (ex: Vendedores), siga o padrão de `upsert` do Prisma para evitar duplicidade.

## 5. Deployment
- O deploy é automático via Push no branch `main`.
- O Frontend deve ser buildado e servido (ou proxied).
- **Cache:** Alterações no Frontend podem demorar para aparecer se o cache do navegador estiver ativo. Force atualização (Ctrl+F5) ou use Versionamento no título/console para debugar.

## 6. UI/UX e Estilização 🎨
- **Inputs e Formulários:**
    - SEMPRE defina explicitamente `bg-white` e `text-gray-900` em inputs.
    - Evite depender dos defaults do navegador, pois podem causar "fundo preto" em browsers com Dark Mode forçado.
    - Exemplo seguro: `className="border border-gray-300 bg-white text-gray-900 rounded px-3 py-2"`

## 7. Sincronização e Preservação de Dados 🔄
- **Campos Locais vs. Campos Remotos:**
    - Dados vindos da API externa (Conta Azul) devem atualizar o banco.
    - Dados exclusivos do App (ex: `Vendedor`, `Dia_de_venda`, `Dia_de_entrega`) **NÃO** devem ser sobrescritos pelo Sync.
    - **Regra:** No `update` do Prisma, inclua APENAS os campos que vieram da API. Não passe `null` ou `undefined` para campos locais, pois isso pode apagá-los.
