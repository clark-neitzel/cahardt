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
import ListaLeads from './pages/Leads/ListaLeads';
import FilaTarefas from './pages/Tarefas/FilaTarefas';
import ListaAmostras from './pages/Amostras/ListaAmostras';
import Login from './pages/Login/Login';
import PainelEmbarque from './pages/Admin/Embarques/PainelEmbarque';
import AuditoriaEntregas from './pages/Admin/Embarques/AuditoriaEntregas';
import ListaEntregasGerencial from './pages/Admin/Embarques/ListaEntregasGerencial';
import FormasPagamentoEntrega from './pages/Configuracoes/FormasPagamentoEntrega';
import PainelMotorista from './pages/Motorista/Entregas/PainelMotorista';
import DespesasPage from './pages/Caixa/DespesasPage';
import CaixaDiarioPage from './pages/Caixa/CaixaDiarioPage';
import RelatorioCaixaPrint from './pages/Caixa/RelatorioCaixaPrint';

import {
  Menu, X, LogOut,
  LayoutDashboard, BookOpen, ClipboardList, Map, Target, Users,
  PackageCheck, Truck, Wallet, Receipt, Search,
  Box, UserCog, Car, RefreshCw,
  Settings, DollarSign, Building2, TrendingUp, FolderOpen, ListChecks, Package
} from 'lucide-react';
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

// ── Sidebar helpers ──
const SidebarItem = ({ to, icon: Icon, label, end }) => {
  const location = useLocation();
  // For root path, use exact match; for others use startsWith
  const isActive = end ? location.pathname === to : location.pathname.startsWith(to);

  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      className={`flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-[13px] transition-colors ${isActive
        ? 'bg-blue-50 text-primary font-semibold'
        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap overflow-hidden">{label}</span>
    </NavLink>
  );
};

const SidebarSection = ({ label }) => (
  <div className="mx-2 mt-4 mb-1 px-3">
    <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200">{label}</span>
    <div className="h-px bg-gray-100 mt-1"></div>
  </div>
);

const Layout = ({ children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, logout, hasPermission, loading } = useAuth();

  if (!user || loading) return <>{children}</>;

  const getMobileNavLinkClass = (isActive) =>
    isActive
      ? "bg-primary-50 border-l-4 border-primary text-primary block pl-3 pr-4 py-2 text-base font-medium"
      : "border-l-4 border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 block pl-3 pr-4 py-2 text-base font-medium";

  const showLogistica = hasPermission('Pode_Acessar_Embarque') || hasPermission('Pode_Ver_Todas_Entregas');
  const showFinanceiro = hasPermission('Pode_Acessar_Caixa') || hasPermission('Pode_Ver_Todas_Entregas');
  const showAdmin = hasPermission('produtos') || hasPermission('vendedores') || hasPermission('sync') || user?.permissoes?.admin;
  const showConfig = hasPermission('configuracoes');

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* ═══════════════════════════════════════════ */}
      {/* SIDEBAR — Desktop only                     */}
      {/* ═══════════════════════════════════════════ */}
      <aside className="hidden md:flex group fixed left-0 top-0 h-screen w-16 hover:w-60 bg-white border-r border-gray-200 flex-col z-50 transition-all duration-200 overflow-hidden shadow-sm">
        {/* Logo */}
        <div className="flex items-center h-14 px-4 border-b border-gray-100 shrink-0">
          <Link to="/" className="flex items-center gap-2 text-primary font-bold text-lg tracking-tight">
            <span className="w-8 h-8 bg-primary text-white rounded-lg flex items-center justify-center text-sm font-black shrink-0">H</span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">Hardt App</span>
          </Link>
        </div>

        {/* Nav items — scrollable */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 space-y-0.5">
          {/* Principal */}
          <SidebarItem to="/" icon={LayoutDashboard} label="Dashboard" end />

          {/* Vendas */}
          <SidebarSection label="Vendas" />
          {hasPermission('catalogo') && <SidebarItem to="/catalogo" icon={BookOpen} label="Catálogo" />}
          {hasPermission('pedidos') && <SidebarItem to="/pedidos" icon={ClipboardList} label="Pedidos" />}
          {hasPermission('pedidos') && <SidebarItem to="/rota" icon={Map} label="Rota" />}
          {hasPermission('rota') && <SidebarItem to="/leads" icon={Target} label="Leads" />}
          {hasPermission('rota') && <SidebarItem to="/tarefas" icon={ListChecks} label="Tarefas" />}
          {hasPermission('rota') && <SidebarItem to="/amostras" icon={Package} label="Amostras" />}
          {hasPermission('clientes') && <SidebarItem to="/clientes" icon={Users} label="Clientes" />}

          {/* Logística */}
          {showLogistica && <SidebarSection label="Logística" />}
          {hasPermission('Pode_Acessar_Embarque') && <SidebarItem to="/admin/embarques" icon={PackageCheck} label="Embarque" />}
          {hasPermission('Pode_Ver_Todas_Entregas') && <SidebarItem to="/entregas" icon={Truck} label="Entregas" />}

          {/* Financeiro */}
          {showFinanceiro && <SidebarSection label="Financeiro" />}
          {hasPermission('Pode_Acessar_Caixa') && <SidebarItem to="/caixa" icon={Wallet} label="Caixa" />}
          {hasPermission('Pode_Acessar_Caixa') && <SidebarItem to="/despesas" icon={Receipt} label="Despesas" />}
          {hasPermission('Pode_Ver_Todas_Entregas') && <SidebarItem to="/admin/auditoria-entregas" icon={Search} label="Auditoria" />}

          {/* Admin */}
          {showAdmin && <SidebarSection label="Admin" />}
          {hasPermission('produtos') && <SidebarItem to="/admin/produtos" icon={Box} label="Produtos" />}
          {hasPermission('vendedores') && <SidebarItem to="/admin/vendedores" icon={UserCog} label="Vendedores" />}
          {(user?.permissoes?.admin || hasPermission('clientes')) && <SidebarItem to="/admin/veiculos" icon={Car} label="Veículos" />}
          {hasPermission('sync') && <SidebarItem to="/admin/sync" icon={RefreshCw} label="Sincronizar" />}

          {/* Configurações */}
          {showConfig && <SidebarSection label="Configurações" />}
          {showConfig && <SidebarItem to="/admin/config" icon={Settings} label="Gerais" />}
          {showConfig && <SidebarItem to="/config/tabela-precos" icon={DollarSign} label="Preços" />}
          {showConfig && <SidebarItem to="/config/contas-financeiras" icon={Building2} label="Bancos" />}
          {showConfig && <SidebarItem to="/config/metas" icon={TrendingUp} label="Metas" />}
          {showConfig && <SidebarItem to="/config/categorias-produto" icon={FolderOpen} label="Cat. Produtos" />}
          {showConfig && <SidebarItem to="/config/categorias-cliente" icon={FolderOpen} label="Cat. Clientes" />}
        </nav>

        {/* Footer */}
        <div className="border-t border-gray-100 p-2 shrink-0 space-y-1">
          <DiarioCheckout />
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="w-7 h-7 bg-gray-200 rounded-full flex items-center justify-center shrink-0">
              <span className="text-[11px] font-bold text-gray-600">{(user.nome || user.login || '?')[0].toUpperCase()}</span>
            </div>
            <span className="text-[12px] font-medium text-gray-700 truncate opacity-0 group-hover:opacity-100 transition-opacity duration-200">{user.nome || user.login}</span>
            <button
              onClick={logout}
              title="Sair"
              className="ml-auto p-1.5 text-gray-400 hover:text-red-600 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ═══════════════════════════════════════════ */}
      {/* MAIN CONTENT AREA                          */}
      {/* ═══════════════════════════════════════════ */}
      <div className="flex-1 md:ml-16 flex flex-col min-h-screen">
        {/* ── Mobile top bar ── */}
        <nav className="md:hidden bg-white shadow-sm sticky top-0 z-50">
          <div className="px-4 flex justify-between h-14 items-center">
            <Link to="/" className="flex items-center text-primary font-bold text-lg tracking-tight">
              Hardt App
            </Link>
            <div className="flex items-center gap-2">
              <DiarioCheckout />
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
              >
                {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>

          {/* Mobile dropdown menu */}
          {isMobileMenuOpen && (
            <div className="border-t border-gray-100 pt-2 pb-3 space-y-1">
              <NavLink to="/" end onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Dashboard</NavLink>
              {hasPermission('catalogo') && (
                <NavLink to="/catalogo" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Catálogo</NavLink>
              )}
              {hasPermission('pedidos') && (
                <NavLink to="/pedidos" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Pedidos</NavLink>
              )}
              {hasPermission('pedidos') && (
                <NavLink to="/rota" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Rota / Leads</NavLink>
              )}
              {hasPermission('rota') && (
                <NavLink to="/leads" onClick={() => setIsMobileMenuOpen(false)} className={({ isActive }) => getMobileNavLinkClass(isActive)}>Leads</NavLink>
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

              <button
                onClick={() => { logout(); setIsMobileMenuOpen(false); }}
                className="w-full text-left border-l-4 border-transparent text-red-500 hover:bg-gray-50 block pl-3 pr-4 py-2 text-base font-medium"
              >
                Sair
              </button>
            </div>
          )}
        </nav>

        {/* GATEKEEPER DO DIÁRIO / PONTO */}
        <DiarioGateway />

        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
          {children}
        </main>
      </div>
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
              <Route path="/leads" element={<PrivateRoute tab="rota"><ListaLeads /></PrivateRoute>} />
              <Route path="/tarefas" element={<PrivateRoute tab="rota"><FilaTarefas /></PrivateRoute>} />
              <Route path="/amostras" element={<PrivateRoute tab="rota"><ListaAmostras /></PrivateRoute>} />

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
