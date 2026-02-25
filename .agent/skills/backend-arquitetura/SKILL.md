---
name: backend-arquitetura
description: Estrutura e padrões do Backend (Node.js, Express, Prisma)
---

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
