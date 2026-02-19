---
name: frontend-arquitetura
description: Estrutura e padrões do Frontend (React, Vite, Tailwind)
---

# Arquitetura do Frontend

O frontend é construído com **React**, **Vite** e **TailwindCSS**.

## Estrutura de Diretórios

- **`src/pages`**: Componentes de Página (Views).
  - Organizado por Módulo: `Produtos/`, `Clientes/`, `Admin/`.
- **`src/components`**: Componentes reutilizáveis (UI).
  - Cards, Modais, Badges.
- **`src/services`**: Camada de integração com API (Axios).
  - Padrão: `nomeService.js`.
  - Métodos retornam `response.data`.
- **`src/assets`**: Imagens, ícones e estilos globais.

## Padrões de Código

### Service (Axios)
```javascript
import api from './api';

const service = {
  listar: async (params) => {
    const response = await api.get('/recurso', { params });
    return response.data;
  }
};
export default service;
```

**⚠️ REGRAS DE API URL:**
- **NUNCA** defina URLs absolutas de API (ex: `http://localhost:3001` ou `https://meu-app...`) diretamente nos arquivos de Service ou Componentes.
- A configuração da Base URL DEVE estar centralizada no arquivo `src/services/api.js`, utilizando variáveis de ambiente do Vite (`import.meta.env.VITE_API_URL`).

### Componente (Page)
- Use `useEffect` para carregar dados.
- Mantenha estado local `useState` para dados da tela.
- Use `lucide-react` para ícones.
- Use `Link` ou `useNavigate` do `react-router-dom` para navegação.

## Estilização
- Use classes utilitárias do **TailwindCSS**.
- Cores principais configuradas no `tailwind.config.js` (ex: `text-primary`).
