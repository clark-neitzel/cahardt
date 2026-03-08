import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, NavLink, Navigate, useLocation } from 'react-router-dom';
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
import GerenciarMetas from './pages/Configuracoes/Metas/GerenciarMetas';
import CategoriasProduto from './pages/Configuracoes/CategoriasProduto';
import CategoriasCliente from './pages/Configuracoes/CategoriasCliente';
import DashboardVendedor from './pages/Dashboard/DashboardVendedor';
import ListaPedidos from './pages/Pedidos/ListaPedidos';
import Veiculos from './pages/Veiculos/Veiculos';
import NovoPedido from './pages/Pedidos/NovoPedido';
import RotaLeads from './pages/Rota/RotaLeads';
import Login from './pages/Login/Login';
import PainelEmbarque from './pages/Admin/Embarques/PainelEmbarque';
import AuditoriaEntregas from './pages/Admin/Embarques/AuditoriaEntregas';
import ListaEntregasGerencial from './pages/Admin/Embarques/ListaEntregasGerencial';
import FormasPagamentoEntrega from './pages/Configuracoes/FormasPagamentoEntrega';
import PainelMotorista from './pages/Motorista/Entregas/PainelMotorista';
import DespesasPage from './pages/Caixa/DespesasPage';
import CaixaDiarioPage from './pages/Caixa/CaixaDiarioPage';
import RelatorioCaixaPrint from './pages/Caixa/RelatorioCaixaPrint';

import { Menu, X, LogOut, ChevronDown } from 'lucide-react';
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
  const [isAdminDropdownOpen, setIsAdminDropdownOpen] = useState(false);
  const { user, logout, hasPermission, loading } = useAuth();
  const location = useLocation();

  const isAdminRouteActive = ['/admin', '/config'].some(path => location.pathname.startsWith(path));

  // Se não estiver logado, renderiza apenas o conteúdo (tela de login)
  if (!user || loading) return <>{children}</>;

  const getNavLinkClass = (isActive) =>
    isActive
      ? "text-primary inline-flex items-center px-2 pt-1 border-b-2 border-primary whitespace-nowrap flex-shrink-0 text-sm"
      : "text-gray-900 inline-flex items-center px-2 pt-1 border-b-2 border-transparent hover:border-gray-300 whitespace-nowrap flex-shrink-0 text-sm";

  const getMobileNavLinkClass = (isActive) =>
    isActive
      ? "bg-primary-50 border-l-4 border-primary text-primary block pl-3 pr-4 py-2 text-base font-medium"
      : "border-l-4 border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 block pl-3 pr-4 py-2 text-base font-medium";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white shadow-sm mb-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex flex-1">
              <Link to="/" className="flex-shrink-0 flex items-center text-primary font-bold mr-6 text-lg tracking-tight">
                Hardt App
              </Link>
              <div className="hidden sm:flex sm:space-x-8">
                <NavLink to="/" className={({ isActive }) => getNavLinkClass(isActive)}>Dashboard</NavLink>
                {hasPermission('catalogo') && (
                  <NavLink to="/catalogo" className={({ isActive }) => getNavLinkClass(isActive)}>Catálogo</NavLink>
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
                {hasPermission('Pode_Acessar_Embarque') && (
                  <NavLink to="/admin/embarques" className={({ isActive }) => getNavLinkClass(isActive)}>Embarque</NavLink>
                )}
                {hasPermission('Pode_Ver_Todas_Entregas') && (
                  <NavLink to="/entregas" className={({ isActive }) => getNavLinkClass(isActive)}>Entregas</NavLink>
                )}
                {hasPermission('Pode_Acessar_Caixa') && (
                  <NavLink to="/caixa" className={({ isActive }) => getNavLinkClass(isActive)}>Caixa</NavLink>
                )}
                {/* AGRUPAMENTO DE ROTINA ADMINISTRATIVA */}
                {(hasPermission('produtos') || hasPermission('vendedores') || hasPermission('sync') || hasPermission('configuracoes') || hasPermission('clientes', 'clientes') === 'todos' || user?.permissoes?.admin) && (
                  <div
                    className="relative flex items-center"
                    onMouseEnter={() => setIsAdminDropdownOpen(true)}
                    onMouseLeave={() => setIsAdminDropdownOpen(false)}
                  >
                    <button className={`${getNavLinkClass(isAdminRouteActive)} cursor-default focus:outline-none flex items-center`}>
                      Painel Admin <ChevronDown className="ml-1 w-4 h-4" />
                    </button>

                    {isAdminDropdownOpen && (
                      <div className="absolute top-12 left-0 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 py-1 z-50">
                        {hasPermission('produtos') && (
                          <Link to="/admin/produtos" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Produtos</Link>
                        )}
                        {hasPermission('vendedores') && (
                          <Link to="/admin/vendedores" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Vendedores</Link>
                        )}
                        <Link to="/admin/veiculos" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Veículos (Frota)</Link>
                        {hasPermission('Pode_Ver_Todas_Entregas') && (
                          <Link to="/admin/auditoria-entregas" className="block px-4 py-2 text-sm text-amber-700 font-bold bg-amber-50 hover:bg-amber-100">Auditoria (Financeira)</Link>
                        )}
                        {hasPermission('Pode_Editar_Caixa') && (
                          <Link to="/caixa" className="block px-4 py-2 text-sm text-amber-700 font-bold bg-amber-50 hover:bg-amber-100">Caixa Diário (Conferência)</Link>
                        )}
                        {hasPermission('sync') && (
                          <Link to="/admin/sync" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Sincronizar (Erp)</Link>
                        )}
                        {hasPermission('configuracoes') && (
                          <>
                            <div className="border-t border-gray-100 my-1"></div>
                            <Link to="/admin/config" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Gerais</Link>
                            <Link to="/config/tabela-precos" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Preços</Link>
                            <Link to="/config/contas-financeiras" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Bancos</Link>
                            <Link to="/config/metas" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Metas de Vendas</Link>
                            <Link to="/config/categorias-produto" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Cat. de Produtos</Link>
                            <Link to="/config/categorias-cliente" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Cat. de Clientes</Link>
                          </>
                        )}
                      </div>
                    )}
                  </div>
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
              <NavLink to="/" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Dashboard</NavLink>
              {hasPermission('catalogo') && (
                <NavLink to="/catalogo" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Catálogo</NavLink>
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
              {hasPermission('Pode_Acessar_Embarque') && (
                <NavLink to="/admin/embarques" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Embarque</NavLink>
              )}
              {hasPermission('Pode_Ver_Todas_Entregas') && (
                <NavLink to="/entregas" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Entregas</NavLink>
              )}
              {hasPermission('Pode_Acessar_Caixa') && (
                <NavLink to="/caixa" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Caixa</NavLink>
              )}
              {hasPermission('Pode_Acessar_Caixa') && (
                <NavLink to="/despesas" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Despesas</NavLink>
              )}
              {hasPermission('produtos') && (
                <NavLink to="/admin/produtos" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Produtos</NavLink>
              )}
              {hasPermission('vendedores') && (
                <NavLink to="/admin/vendedores" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Vendedores</NavLink>
              )}
              {(user?.permissoes?.admin || hasPermission('clientes', 'clientes') === 'todos') && (
                <NavLink to="/admin/veiculos" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Veículos</NavLink>
              )}
              {hasPermission('Pode_Ver_Todas_Entregas') && (
                <NavLink to="/admin/auditoria-entregas" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Auditoria Financeira</NavLink>
              )}
              {hasPermission('sync') && (
                <NavLink to="/admin/sync" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Sincronizar</NavLink>
              )}
              {hasPermission('configuracoes') && (
                <>
                  <NavLink to="/admin/config" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Configurações Gerais</NavLink>
                  <NavLink to="/config/tabela-precos" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Preços</NavLink>
                  <NavLink to="/config/contas-financeiras" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Bancos</NavLink>
                  <NavLink to="/config/metas" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Metas de Vendas</NavLink>
                  <NavLink to="/config/categorias-produto" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Cat. de Produtos</NavLink>
                  <NavLink to="/config/categorias-cliente" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Cat. de Clientes</NavLink>
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

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pb-10">
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

              {/* Dashboard Inicial */}
              <Route path="/" element={<PrivateRoute><DashboardVendedor /></PrivateRoute>} />

              {/* Catálogo */}
              <Route path="/catalogo" element={<PrivateRoute tab="catalogo"><Catalogo /></PrivateRoute>} />
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

              {/* LISTA GERENCIAL DE ENTREGAS */}
              <Route path="/entregas" element={<PrivateRoute tab="Pode_Ver_Todas_Entregas"><ListaEntregasGerencial /></PrivateRoute>} />

              {/* ROTAS DO MOTORISTA (APP MOBILE) */}
              <Route path="/minhas-entregas" element={<PrivateRoute tab="Pode_Executar_Entregas"><PainelMotorista /></PrivateRoute>} />

              {/* Caixa Diário e Despesas */}
              <Route path="/despesas" element={<PrivateRoute tab="Pode_Acessar_Caixa"><DespesasPage /></PrivateRoute>} />
              <Route path="/caixa" element={<PrivateRoute tab="Pode_Acessar_Caixa"><CaixaDiarioPage /></PrivateRoute>} />
              <Route path="/caixa/impressao" element={<PrivateRoute tab="Pode_Acessar_Caixa"><RelatorioCaixaPrint /></PrivateRoute>} />

              {/* Produtos / Admin */}
              <Route path="/admin/produtos" element={<PrivateRoute tab="produtos"><ListaProdutos /></PrivateRoute>} />
              <Route path="/admin/produtos/novo" element={<PrivateRoute tab="produtos"><GerenciarProduto /></PrivateRoute>} />
              <Route path="/admin/produtos/:id" element={<PrivateRoute tab="produtos"><GerenciarProduto /></PrivateRoute>} />

              {/* Outros Admins */}
              <Route path="/admin/embarques" element={<PrivateRoute tab="Pode_Acessar_Embarque"><PainelEmbarque /></PrivateRoute>} />
              <Route path="/admin/auditoria-entregas" element={<PrivateRoute tab="Pode_Ver_Todas_Entregas"><AuditoriaEntregas /></PrivateRoute>} />
              <Route path="/admin/sync" element={<PrivateRoute tab="sync"><PainelSync /></PrivateRoute>} />
              <Route path="/admin/vendedores" element={<PrivateRoute tab="vendedores"><ListaVendedores /></PrivateRoute>} />
              <Route path="/admin/veiculos" element={<PrivateRoute tab="clientes"><Veiculos /></PrivateRoute>} />
              <Route path="/admin/config" element={<PrivateRoute tab="configuracoes"><Configuracoes /></PrivateRoute>} />
              <Route path="/config/tabela-precos" element={<PrivateRoute tab="configuracoes"><TabelaPrecos /></PrivateRoute>} />
              <Route path="/config/contas-financeiras" element={<PrivateRoute tab="configuracoes"><ContasFinanceiras /></PrivateRoute>} />
              <Route path="/config/pagamentos-entrega" element={<PrivateRoute tab="configuracoes"><FormasPagamentoEntrega /></PrivateRoute>} />
              <Route path="/config/metas" element={<PrivateRoute tab="configuracoes"><GerenciarMetas /></PrivateRoute>} />
              <Route path="/config/categorias-produto" element={<PrivateRoute tab="configuracoes"><CategoriasProduto /></PrivateRoute>} />
              <Route path="/config/categorias-cliente" element={<PrivateRoute tab="configuracoes"><CategoriasCliente /></PrivateRoute>} />
            </Routes>
          </Layout>
          <Toaster position="top-right" />
        </DiarioProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
