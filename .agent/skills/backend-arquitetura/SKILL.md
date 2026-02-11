---
name: backend-arquitetura
description: Estrutura e padrões do Backend (Node.js, Express, Prisma)
---

# Arquitetura do Backend

O backend é construído com **Node.js**, **Express** e **Prisma ORM**.

## Estrutura de Diretórios

- **`src/controllers`**: Lógica de entrada/saída das requisições.
  - Padrão: `nomeController.js`
  - Métodos: `listar`, `detalhar`, `criar`, `atualizar`, `deletar`.
- **`src/services`**: Regras de negócio e integração com APIs externas.
  - Ex: `contaAzulService.js` (Lógica de Sync), `produtoService.js`.
- **`src/routes`**: Definição das rotas da API.
  - Padrão: `nomeRoutes.js`.
  - Importam os controllers.
- **`src/prisma`**: Schema do banco de dados e migrations.
  - `schema.prisma`: Definição única das tabelas.
- **`src/scripts`**: Scripts utilitários (migrations manuais, seeds).

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
