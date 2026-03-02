import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, NavLink, Navigate } from 'react-router-dom';
import Catalogo from './pages/Produtos/Catalogo';
import DetalheProduto from './pages/Produtos/DetalheProduto';
import ListaProdutos from './pages/Admin/Produtos/ListaProdutos';
import GerenciarProduto from './pages/Admin/Produtos/GerenciarProduto';
import PainelSync from './pages/Admin/Sync/PainelSync';
import ListaClientes from './pages/Clientes/ListaClientes';
import DetalheCliente from './pages/Clientes/DetalheCliente';
import ListaVendedores from './pages/Admin/Vendedores/ListaVendedores';
import Configuracoes from './pages/Admin/Configuracoes/Configuracoes';
import TabelaPrecos from './pages/Configuracoes/TabelaPrecos';
import ContasFinanceiras from './pages/Configuracoes/ContasFinanceiras';
import ListaPedidos from './pages/Pedidos/ListaPedidos';
import Veiculos from './pages/Veiculos/Veiculos';
import NovoPedido from './pages/Pedidos/NovoPedido';
import RotaLeads from './pages/Rota/RotaLeads';
import Login from './pages/Login/Login';

import { Menu, X, LogOut } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DiarioProvider } from './contexts/DiarioContext';
import DiarioGateway from './components/Diario/DiarioGateway';
import DiarioCheckout from './components/Diario/DiarioCheckout';

const PrivateRoute = ({ children, tab }) => {
  const { signed, loading, hasPermission } = useAuth();
  if (loading) return <div className="p-8 text-center text-gray-500">Validando sessão...</div>;
  if (!signed) return <Navigate to="/login" replace />;
  if (tab && !hasPermission(tab, 'view')) return <div className="p-8 text-center text-red-600 font-bold">Acesso Negado a esta tela.</div>;
  return children;
};

const Layout = ({ children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, logout, hasPermission, loading } = useAuth();

  // Se não estiver logado, renderiza apenas o conteúdo (tela de login)
  if (!user || loading) return <>{children}</>;

  const getNavLinkClass = (isActive) =>
    isActive
      ? "text-primary inline-flex items-center px-1 pt-1 border-b-2 border-primary"
      : "text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 border-transparent hover:border-gray-300";

  const getMobileNavLinkClass = (isActive) =>
    isActive
      ? "bg-primary-50 border-l-4 border-primary text-primary block pl-3 pr-4 py-2 text-base font-medium"
      : "border-l-4 border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 block pl-3 pr-4 py-2 text-base font-medium";

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
                {hasPermission('catalogo') && (
                  <NavLink to="/" className={({ isActive }) => getNavLinkClass(isActive)}>Catálogo</NavLink>
                )}
                {hasPermission('pedidos') && (
                  <NavLink to="/pedidos" className={({ isActive }) => getNavLinkClass(isActive)}>Pedidos</NavLink>
                )}
                {hasPermission('pedidos') && (
                  <NavLink to="/rota" className={({ isActive }) => getNavLinkClass(isActive)}>Rota</NavLink>
                )}
                {hasPermission('clientes') && (
                  <NavLink to="/clientes" className={({ isActive }) => getNavLinkClass(isActive)}>Clientes</NavLink>
                )}
                {hasPermission('produtos') && (
                  <NavLink to="/admin/produtos" className={({ isActive }) => getNavLinkClass(isActive)}>Produtos</NavLink>
                )}
                {hasPermission('vendedores') && (
                  <NavLink to="/admin/vendedores" className={({ isActive }) => getNavLinkClass(isActive)}>Vendedores</NavLink>
                )}
                {hasPermission('clientes', 'clientes') === 'todos' && (
                  <NavLink to="/admin/veiculos" className={({ isActive }) => getNavLinkClass(isActive)}>Veículos</NavLink>
                )}
                {hasPermission('sync') && (
                  <NavLink to="/admin/sync" className={({ isActive }) => getNavLinkClass(isActive)}>Sincronizar</NavLink>
                )}
                {hasPermission('configuracoes') && (
                  <>
                    <NavLink to="/admin/config" className={({ isActive }) => getNavLinkClass(isActive)}>Configurações</NavLink>
                    <NavLink to="/config/tabela-precos" className={({ isActive }) => getNavLinkClass(isActive)}>Preços</NavLink>
                    <NavLink to="/config/contas-financeiras" className={({ isActive }) => getNavLinkClass(isActive)}>Bancos</NavLink>
                  </>
                )}
              </div>
            </div>

            <div className="hidden sm:ml-6 sm:flex sm:items-center space-x-4">
              <DiarioCheckout />
              <span className="text-sm font-medium text-gray-700">Olá, {user.login || user.nome}</span>
              <button
                onClick={logout}
                className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                title="Sair"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>

            {/* Mobile menu button */}
            <div className="-mr-2 flex items-center sm:hidden">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
              >
                <span className="sr-only">Open main menu</span>
                {isMobileMenuOpen ? <X className="block h-6 w-6" /> : <Menu className="block h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <div className="sm:hidden">
            <div className="pt-2 pb-3 space-y-1">
              {hasPermission('catalogo') && (
                <NavLink to="/" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Catálogo</NavLink>
              )}
              {hasPermission('pedidos') && (
                <NavLink to="/pedidos" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Pedidos</NavLink>
              )}
              {hasPermission('pedidos') && (
                <NavLink to="/rota" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Rota / Leads</NavLink>
              )}
              {hasPermission('clientes') && (
                <NavLink to="/clientes" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Clientes</NavLink>
              )}
              {hasPermission('produtos') && (
                <NavLink to="/admin/produtos" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Produtos</NavLink>
              )}
              {hasPermission('vendedores') && (
                <NavLink to="/admin/vendedores" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Vendedores</NavLink>
              )}
              {hasPermission('clientes', 'clientes') === 'todos' && (
                <NavLink to="/admin/veiculos" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Veículos</NavLink>
              )}
              {hasPermission('sync') && (
                <NavLink to="/admin/sync" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Sincronizar</NavLink>
              )}
              {hasPermission('configuracoes') && (
                <>
                  <NavLink to="/admin/config" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Configurações</NavLink>
                  <NavLink to="/config/tabela-precos" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Preços</NavLink>
                  <NavLink to="/config/contas-financeiras" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Bancos</NavLink>
                </>
              )}

              <DiarioCheckout />

              <button
                onClick={() => { logout(); setIsMobileMenuOpen(false); }}
                className="w-full text-left border-l-4 border-transparent text-red-500 hover:bg-gray-50 block pl-3 pr-4 py-2 text-base font-medium"
              >
                Sair
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* GATEKEEPER DO DIÁRIO / PONTO */}
      <DiarioGateway />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
        {children}
      </main>
    </div>
  );
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <DiarioProvider>
          <Layout>
            <Routes>
              <Route path="/login" element={<Login />} />

              {/* Catálogo */}
              <Route path="/" element={<PrivateRoute tab="catalogo"><Catalogo /></PrivateRoute>} />
              <Route path="/produto/:id" element={<PrivateRoute tab="catalogo"><DetalheProduto /></PrivateRoute>} />

              {/* Pedidos */}
              <Route path="/pedidos" element={<PrivateRoute tab="pedidos"><ListaPedidos /></PrivateRoute>} />
              <Route path="/pedidos/novo" element={<PrivateRoute tab="pedidos"><NovoPedido /></PrivateRoute>} />
              <Route path="/pedidos/editar/:id" element={<PrivateRoute tab="pedidos"><NovoPedido /></PrivateRoute>} />

              {/* Rota / Leads (CRM) */}
              <Route path="/rota" element={<PrivateRoute tab="pedidos"><RotaLeads /></PrivateRoute>} />

              {/* Clientes */}
              <Route path="/clientes" element={<PrivateRoute tab="clientes"><ListaClientes /></PrivateRoute>} />
              <Route path="/clientes/:uuid" element={<PrivateRoute tab="clientes"><DetalheCliente /></PrivateRoute>} />

              {/* Produtos / Admin */}
              <Route path="/admin/produtos" element={<PrivateRoute tab="produtos"><ListaProdutos /></PrivateRoute>} />
              <Route path="/admin/produtos/novo" element={<PrivateRoute tab="produtos"><GerenciarProduto /></PrivateRoute>} />
              <Route path="/admin/produtos/:id" element={<PrivateRoute tab="produtos"><GerenciarProduto /></PrivateRoute>} />

              {/* Outros Admins */}
              <Route path="/admin/sync" element={<PrivateRoute tab="sync"><PainelSync /></PrivateRoute>} />
              <Route path="/admin/vendedores" element={<PrivateRoute tab="vendedores"><ListaVendedores /></PrivateRoute>} />
              <Route path="/admin/veiculos" element={<PrivateRoute tab="clientes"><Veiculos /></PrivateRoute>} />
              <Route path="/admin/config" element={<PrivateRoute tab="configuracoes"><Configuracoes /></PrivateRoute>} />
              <Route path="/config/tabela-precos" element={<PrivateRoute tab="configuracoes"><TabelaPrecos /></PrivateRoute>} />
              <Route path="/config/contas-financeiras" element={<PrivateRoute tab="configuracoes"><ContasFinanceiras /></PrivateRoute>} />
            </Routes>
          </Layout>
          <Toaster position="top-right" />
        </DiarioProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
