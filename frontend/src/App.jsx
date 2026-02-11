import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, NavLink } from 'react-router-dom';
import Catalogo from './pages/Produtos/Catalogo';
import DetalheProduto from './pages/Produtos/DetalheProduto';
import ListaProdutos from './pages/Admin/Produtos/ListaProdutos';
import GerenciarProduto from './pages/Admin/Produtos/GerenciarProduto';
import PainelSync from './pages/Admin/Sync/PainelSync';
import ListaClientes from './pages/Clientes/ListaClientes';
import DetalheCliente from './pages/Clientes/DetalheCliente';

import { Menu, X } from 'lucide-react';
import { useState } from 'react';

// Layout simples para navegação durante desenvolvimento
const Layout = ({ children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm mb-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <Link to="/" className="flex-shrink-0 flex items-center text-primary font-bold">
                Hardt App
              </Link>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <NavLink
                  to="/"
                  className={({ isActive }) =>
                    isActive
                      ? "text-primary inline-flex items-center px-1 pt-1 border-b-2 border-primary"
                      : "text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 border-transparent hover:border-gray-300"
                  }
                >
                  Catálogo
                </NavLink>
                <NavLink
                  to="/clientes"
                  className={({ isActive }) =>
                    isActive
                      ? "text-primary inline-flex items-center px-1 pt-1 border-b-2 border-primary"
                      : "text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 border-transparent hover:border-gray-300"
                  }
                >
                  Clientes
                </NavLink>
                <NavLink
                  to="/admin/produtos"
                  className={({ isActive }) =>
                    isActive
                      ? "text-primary inline-flex items-center px-1 pt-1 border-b-2 border-primary"
                      : "text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 border-transparent hover:border-gray-300"
                  }
                >
                  Admin: Produtos
                </NavLink>
                <NavLink
                  to="/admin/sync"
                  className={({ isActive }) =>
                    isActive
                      ? "text-primary inline-flex items-center px-1 pt-1 border-b-2 border-primary"
                      : "text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 border-transparent hover:border-gray-300"
                  }
                >
                  Admin: Sync
                </NavLink>
              </div>
            </div>

            {/* Mobile menu button */}
            <div className="-mr-2 flex items-center sm:hidden">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
              >
                <span className="sr-only">Open main menu</span>
                {isMobileMenuOpen ? (
                  <X className="block h-6 w-6" aria-hidden="true" />
                ) : (
                  <Menu className="block h-6 w-6" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu, show/hide based on menu state */}
        {isMobileMenuOpen && (
          <div className="sm:hidden">
            <div className="pt-2 pb-3 space-y-1">
              <NavLink
                to="/"
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) =>
                  isActive
                    ? "bg-primary-50 border-l-4 border-primary text-primary block pl-3 pr-4 py-2 text-base font-medium"
                    : "border-l-4 border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 block pl-3 pr-4 py-2 text-base font-medium"
                }
              >
                Catálogo
              </NavLink>
              <NavLink
                to="/clientes"
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) =>
                  isActive
                    ? "bg-primary-50 border-l-4 border-primary text-primary block pl-3 pr-4 py-2 text-base font-medium"
                    : "border-l-4 border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 block pl-3 pr-4 py-2 text-base font-medium"
                }
              >
                Clientes
              </NavLink>
              <NavLink
                to="/admin/produtos"
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) =>
                  isActive
                    ? "bg-primary-50 border-l-4 border-primary text-primary block pl-3 pr-4 py-2 text-base font-medium"
                    : "border-l-4 border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 block pl-3 pr-4 py-2 text-base font-medium"
                }
              >
                Admin: Produtos
              </NavLink>
              <NavLink
                to="/admin/sync"
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) =>
                  isActive
                    ? "bg-primary-50 border-l-4 border-primary text-primary block pl-3 pr-4 py-2 text-base font-medium"
                    : "border-l-4 border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 block pl-3 pr-4 py-2 text-base font-medium"
                }
              >
                Admin: Sync
              </NavLink>
            </div>
          </div>
        )}
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
        {children}
      </main>
    </div>
  );
};

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          {/* Vendedor */}
          <Route path="/" element={<Catalogo />} />
          <Route path="/produto/:id" element={<DetalheProduto />} />

          {/* Clientes */}
          <Route path="/clientes" element={<ListaClientes />} />
          <Route path="/clientes/:uuid" element={<DetalheCliente />} />

          {/* Admin */}
          <Route path="/admin/produtos" element={<ListaProdutos />} />
          <Route path="/admin/produtos/:id" element={<GerenciarProduto />} />
          <Route path="/admin/sync" element={<PainelSync />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
