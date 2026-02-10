---
name: estrutura-base
description: Estrutura de diretórios e arquivos padrão do projeto Hardt Salgados App.
---

# Estrutura Base do Projeto

Esta skill define a organização de pastas e arquivos essenciais para o projeto, servindo como referência para organizar todos os próximos PRDs.

## Estrutura Geral
O projeto é dividido em dois componentes principais:
- `backend/`: API em Node.js com Express
- `frontend/`: Aplicação Web em React com Vite

## Backend (`backend/`)
Estrutura padrão para a API:

- `routes/`: Definição de rotas da API.
- `controllers/`: Lógica das funções da API (handlers).
- `services/`: Regras de negócio e integrações externas.
- `models/`: Definição de dados/schemas.
- `middlewares/`: Autenticação, validação e tratamento de erros.
- `config/`: Arquivos de configuração.
- `server.js`: Arquivo principal de inicialização do servidor.
- `.env.example`: Modelo de variáveis de ambiente.

## Frontend (`frontend/`)
Estrutura padrão para a interface:

- `src/pages/`: Telas e rotas da aplicação.
- `src/components/`: Componentes visuais reutilizáveis.
- `src/services/`: Configuração de clientes API e requisições.
- `src/utils/`: Funções utilitárias e helpers.
- `src/assets/`: Imagens, ícones e estilos globais.
- `src/App.jsx`: Componente raiz da aplicação.
- `src/main.jsx`: Ponto de entrada do React.
- `tailwind.config.js`: Configuração do framework de estilos.
- `index.html`: Arquivo HTML base.

## Diretrizes
1.  **Padronização**: Todo novo PRD deve respeitar essa estrutura.
2.  **Arquivos Vazios**: Ao inicializar novos módulos, crie os arquivos necessários mesmo que vazios inicialmente, mantendo os nomes corretos.
