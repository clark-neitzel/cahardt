---
name: 03-arquitetura-frontend
description: "🚨 REGRAS DO FRONTEND E MOBILE. Obrigatório consultar antes de criar Telas React, Hooks, componentes Tailwind ou views escaláveis para celular."
---

# 03 ARQUITETURA FRONTEND
> ⚠️ **DOCUMENTO MESTRE**: Este documento é a consolidação das antigas skills: frontend-arquitetura, tema-visual-app.



-------------------------------------------------
## CONTEÚDO ORIGINAL DE: frontend-arquitetura
-------------------------------------------------

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

-------------------------------------------------
## CONTEÚDO ORIGINAL DE: tema-visual-app
-------------------------------------------------

# Tema Visual Hardt Salgados App

Esta skill define o padrão visual para todo o desenvolvimento do aplicativo, inspirado no design system do Conta Azul.

## 🎨 Paleta de Cores & Tipografia

### Cores Principais
- **Background**: `#FFFFFF` (Fundo), `#F5F5F5` (Áreas secundárias/cinza-claro)
- **Primary Blue**: `#1976d2` (Botões, links, destaques principais)
- **Secondary Blue**: `#4dabf5` (Hover, elementos secundários)
- **Text**: `#212121` (Texto principal), `#757575` (Texto secundário)
- **Borders**: `#e0e0e0` (Divisórias, bordas de inputs)
- **Success**: `#2e7d32`
- **Error**: `#d32f2f`

### Tipografia
- **Família Principal**: Fonte do Sistema (SF Pro Text, Helvetica, Arial). Atualizada para garantir legibilidade de alta imersão padrão Apple no Mobile.
- **Tamanhos Padrão**:
    - H1: `text-2xl font-bold text-gray-900`
    - H2: `text-xl font-semibold text-gray-800`
    - Títulos de Card Mobile (Nome Fantasia): `text-[16px] font-bold leading-tight tracking-tight`
    - Body: `text-sm text-gray-700`
    - Micro (Pills e Tags de dados): `text-[10px]` ou `text-[11px]`

## 🔧 Framework & Configuração

O projeto utiliza **Tailwind CSS**. A configuração deve ser centralizada em `tailwind.config.js` para facilitar manutenção.

```javascript
// Exemplo de configuração do tema
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: '#1976d2',
        secondary: '#4dabf5',
        background: '#F5F5F5',
        surface: '#FFFFFF',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      }
    }
  }
}
```

## 🧩 Componentes Padrão

### Botões
- **Primário**: `bg-primary hover:bg-blue-700 text-white font-medium py-2 px-4 rounded shadow-md transition-colors`
- **Secundário**: `bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 py-2 px-4 rounded transition-colors`

### Inputs
- **Base**: `w-full border-gray-300 rounded-lg focus:ring-primary focus:border-primary shadow-sm text-sm`

### Cards & Mobile Views
- **Estilo Desktop**: `bg-white rounded-lg shadow-sm border border-gray-200 p-6`
- **Estilo Mobile (Padrão 2026)**: Substitua listagens de tabela densas (`md:hidden`) por "Cards de Resumo" (`rounded-xl p-3.5`).
- **Pills de Negócio Mobile**: Utilize a abordagem "Pill" para economizar espaço e empacotar metadados cruciais. 
  - Exemplo de uso: `<span className="text-[10px] sm text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">`

### Layout
- **Mobile First**: Desenhe as views inicialmente para Celulares e expanda usando `md:flex` e `md:grid`. Oculte paginações e contadores irrelevantes no mobile.
- **Espaçamento**: Uso consistente de `p-3.5` e `gap-2` para celular, `p-6` para Desktop.
- **Ícones**: Lucide React com tamanhos compactos em views mobile (`h-3 w-3` ou `h-4 w-4`).

## 📌 Regras de Aplicação
71. 1.  Todo novo componente deve herdar estas classes ou variáveis.
2.  Use ícones **Lucide React** ou **Heroicons** com tamanho consistente (ex: `w-5 h-5`).
3.  Mantenha áreas de respiro (whitespace) generosas para um visual limpo.
4.  **Adaptação**: Se a cor principal mudar, atualize apenas o `tailwind.config.js`.

## 🚫 Anti-Patterns (O que NÃO fazer)
1.  **Select Múltiplo Nativo**: Nunca use `<select multiple>`. Ele renderiza uma "caixa preta" ou lista feia dependendo do SO. Use sempre um componente customizado (Dropdown com Checkboxes).
2.  **Bordas Escuras**: Evite bordas pretas ou cinza-escuras em inputs. Use `border-gray-300` com hover/focus coloridos.
3.  **Botões Genéricos**: Evite botões cinza padrão do navegador. Sempre estilize com classes Tailwind.
4.  **Tabelas sem Espaçamento**: Tabelas devem ter padding generoso nas células (`py-3 px-4`) para leitura confortável.