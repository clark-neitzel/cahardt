import React, { useState, Suspense } from 'react';
import VisitorBar from './components/VisitorBar';
import { BrowserRouter as Router, Routes, Route, Link, NavLink, Navigate, useLocation } from 'react-router-dom';
// Telas carregadas sob demanda. Usar lazyComRetry (não o lazy do React): depois de
// um deploy, a aba antiga pede arquivos que já não existem — ele recarrega sozinho.
import { lazyComRetry } from './utils/lazyComRetry';
const Catalogo = lazyComRetry(() => import('./pages/Produtos/Catalogo'));
const DetalheProduto = lazyComRetry(() => import('./pages/Produtos/DetalheProduto'));
const ListaProdutos = lazyComRetry(() => import('./pages/Admin/Produtos/ListaProdutos'));
const GerenciarProduto = lazyComRetry(() => import('./pages/Admin/Produtos/GerenciarProduto'));
const PainelSync = lazyComRetry(() => import('./pages/Admin/Sync/PainelSync'));
const ContabilidadePage = lazyComRetry(() => import('./pages/Admin/Contabilidade/ContabilidadePage'));
const ListaClientes = lazyComRetry(() => import('./pages/Clientes/ListaClientes'));
const DetalheCliente = lazyComRetry(() => import('./pages/Clientes/DetalheCliente'));
const NovoCliente = lazyComRetry(() => import('./pages/Clientes/NovoCliente'));
const SaudePontosGps = lazyComRetry(() => import('./pages/Clientes/SaudePontosGps'));
const ListaVendedores = lazyComRetry(() => import('./pages/Admin/Vendedores/ListaVendedores'));
const Configuracoes = lazyComRetry(() => import('./pages/Admin/Configuracoes/Configuracoes'));
const TabelaPrecos = lazyComRetry(() => import('./pages/Configuracoes/TabelaPrecos'));
const ContasFinanceiras = lazyComRetry(() => import('./pages/Configuracoes/ContasFinanceiras'));
const GerenciarMetas = lazyComRetry(() => import('./pages/Configuracoes/Metas/GerenciarMetas'));
const GerenciarComissoes = lazyComRetry(() => import('./pages/Configuracoes/Comissoes/GerenciarComissoes'));
const CategoriasProduto = lazyComRetry(() => import('./pages/Configuracoes/CategoriasProduto'));
const CategoriasCliente = lazyComRetry(() => import('./pages/Configuracoes/CategoriasCliente'));
const CategoriasEstoque = lazyComRetry(() => import('./pages/Configuracoes/CategoriasEstoque'));
const DashboardHome = lazyComRetry(() => import('./pages/Dashboard/DashboardHome'));
const DashboardVendedorPessoal = lazyComRetry(() => import('./pages/Dashboard/DashboardVendedorPessoal'));
const ListaPedidos = lazyComRetry(() => import('./pages/Pedidos/ListaPedidos'));
const Veiculos = lazyComRetry(() => import('./pages/Veiculos/Veiculos'));
const NovoPedido = lazyComRetry(() => import('./pages/Pedidos/NovoPedido'));
const ImpressaoPedido = lazyComRetry(() => import('./pages/Pedidos/ImpressaoPedido'));
const RotaLeads = lazyComRetry(() => import('./pages/Rota/RotaLeads'));
const ListaLeads = lazyComRetry(() => import('./pages/Leads/ListaLeads'));
import Login from './pages/Login/Login';
const PainelEmbarque = lazyComRetry(() => import('./pages/Admin/Embarques/PainelEmbarque'));
const MapaExpedicao = lazyComRetry(() => import('./pages/Admin/Embarques/MapaExpedicao'));
const AuditoriaEntregas = lazyComRetry(() => import('./pages/Admin/Embarques/AuditoriaEntregas'));
const ListaEntregasGerencial = lazyComRetry(() => import('./pages/Admin/Embarques/ListaEntregasGerencial'));
const FormasPagamentoEntrega = lazyComRetry(() => import('./pages/Configuracoes/FormasPagamentoEntrega'));
const PainelMotorista = lazyComRetry(() => import('./pages/Motorista/Entregas/PainelMotorista'));
const DespesasPage = lazyComRetry(() => import('./pages/Caixa/DespesasPage'));
const CaixaDiarioPage = lazyComRetry(() => import('./pages/Caixa/CaixaDiarioPage'));
const RelatorioCaixaPrint = lazyComRetry(() => import('./pages/Caixa/RelatorioCaixaPrint'));
const ContasReceberTabela = lazyComRetry(() => import('./pages/Financeiro/ContasReceberTabela'));
const ContasPagarPage = lazyComRetry(() => import('./pages/Financeiro/ContasPagarPage'));
const FornecedoresPage = lazyComRetry(() => import('./pages/Financeiro/FornecedoresPage'));
const NotasRecebidasPage = lazyComRetry(() => import('./pages/Financeiro/NotasRecebidasPage'));
const FluxoCaixaPage = lazyComRetry(() => import('./pages/Financeiro/FluxoCaixaPage'));
const ContasBancosPage = lazyComRetry(() => import('./pages/Financeiro/ContasBancosPage'));
const DrePage = lazyComRetry(() => import('./pages/Financeiro/DrePage'));
const ProdutosMargemCusto = lazyComRetry(() => import('./pages/Produtos/ProdutosMargemCusto'));
const ConciliacaoBancariaPage = lazyComRetry(() => import('./pages/Financeiro/ConciliacaoBancariaPage'));
const DashboardFinanceiroPage = lazyComRetry(() => import('./pages/Financeiro/DashboardFinanceiroPage'));
const CategoriasDespesaPage = lazyComRetry(() => import('./pages/Financeiro/CategoriasDespesaPage'));
const ReguaCobrancaPage = lazyComRetry(() => import('./pages/Financeiro/ReguaCobrancaPage'));
const NotasFiscais = lazyComRetry(() => import('./pages/Financeiro/NotasFiscais'));
const RelatorioPedidos = lazyComRetry(() => import('./pages/Relatorios/RelatorioPedidos'));
const RelatorioVendas = lazyComRetry(() => import('./pages/Relatorios/RelatorioVendas'));
const RelatorioFlex = lazyComRetry(() => import('./pages/Relatorios/RelatorioFlex'));
const PainelEstoque = lazyComRetry(() => import('./pages/Estoque/PainelEstoque'));
const HistoricoEstoque = lazyComRetry(() => import('./pages/Estoque/HistoricoEstoque'));
const PosicaoEstoque = lazyComRetry(() => import('./pages/Estoque/PosicaoEstoque'));
const InventarioEstoque = lazyComRetry(() => import('./pages/Estoque/InventarioEstoque'));
const ItensPcp = lazyComRetry(() => import('./pages/PCP/ItensPcp'));
const ItemPcpForm = lazyComRetry(() => import('./pages/PCP/ItemPcpForm'));
const ReceitasList = lazyComRetry(() => import('./pages/PCP/ReceitasList'));
const ReceitaForm = lazyComRetry(() => import('./pages/PCP/ReceitaForm'));
const ReceitaDetalhe = lazyComRetry(() => import('./pages/PCP/ReceitaDetalhe'));
const EstoquePcp = lazyComRetry(() => import('./pages/PCP/EstoquePcp'));
const OrdensProducao = lazyComRetry(() => import('./pages/PCP/OrdensProducao'));
const OrdemProducaoForm = lazyComRetry(() => import('./pages/PCP/OrdemProducaoForm'));
const PainelOperacional = lazyComRetry(() => import('./pages/PCP/PainelOperacional'));
const CalendarioProducao = lazyComRetry(() => import('./pages/PCP/CalendarioProducao'));
const SugestoesProducao = lazyComRetry(() => import('./pages/PCP/SugestoesProducao'));
const DashboardPcp = lazyComRetry(() => import('./pages/PCP/DashboardPcp'));
const EtiquetasList = lazyComRetry(() => import('./pages/PCP/EtiquetasList'));
const EtiquetasDados = lazyComRetry(() => import('./pages/PCP/EtiquetasDados'));
const EtiquetaForm = lazyComRetry(() => import('./pages/PCP/EtiquetaForm'));
const EtiquetaImprimir = lazyComRetry(() => import('./pages/PCP/EtiquetaImprimir'));
const DeliveryKanban = lazyComRetry(() => import('./pages/Delivery/DeliveryKanban'));
const DeliveryConfig = lazyComRetry(() => import('./pages/Delivery/DeliveryConfig'));
const PainelAtendimentos = lazyComRetry(() => import('./pages/Atendimentos/PainelAtendimentos'));
const PainelAnaliseIA = lazyComRetry(() => import('./pages/AnaliseIA/PainelAnaliseIA'));
const MensagensAgendadas = lazyComRetry(() => import('./pages/Admin/MensagensAgendadas/MensagensAgendadas'));
const Candidatura = lazyComRetry(() => import('./pages/Candidatura/Candidatura'));
const ListaCurriculos = lazyComRetry(() => import('./pages/RH/ListaCurriculos'));
const DetalheCurriculo = lazyComRetry(() => import('./pages/RH/DetalheCurriculo'));
const FuncionariosLista = lazyComRetry(() => import('./pages/RH/FuncionariosLista'));
const FuncionarioNovo = lazyComRetry(() => import('./pages/RH/FuncionarioNovo'));
const FuncionarioFicha = lazyComRetry(() => import('./pages/RH/FuncionarioFicha'));
const PontoPainel = lazyComRetry(() => import('./pages/RH/PontoPainel'));
const ImportarPonto = lazyComRetry(() => import('./pages/RH/ImportarPonto'));
const ConfigPonto = lazyComRetry(() => import('./pages/RH/ConfigPonto'));
const BaterPonto = lazyComRetry(() => import('./pages/Ponto/BaterPonto'));
const KitFestaAdmin = lazyComRetry(() => import('./pages/KitFesta/KitFestaAdmin'));
const KitFestaSite = lazyComRetry(() => import('./pages/KitFestaSite/KitFestaSite'));
const HomeSite = lazyComRetry(() => import('./pages/Site/HomeSite'));
const TarefasAgenda = lazyComRetry(() => import('./pages/Tarefas/TarefasAgenda'));
const TarefasParecer = lazyComRetry(() => import('./pages/Tarefas/TarefasParecer'));
const CongeladosSite = lazyComRetry(() => import('./pages/Site/CongeladosSite'));
const ListaPersonalizada = lazyComRetry(() => import('./pages/Site/ListaPersonalizada'));
const SiteAdmin = lazyComRetry(() => import('./pages/SiteAdmin/SiteAdmin'));

import {
  Menu, X, LogOut, ChevronDown, ChevronRight,
  LayoutDashboard, BookOpen, ClipboardList, Map, Target, Users,
  PackageCheck, Truck, Wallet, Receipt, Search,
  Box, UserCog, Car, RefreshCw, FileText, ClipboardCheck,
  Settings, DollarSign, Building2, TrendingUp, FolderOpen, Warehouse,
  Package, BookOpen as BookOpenIcon, Factory, Play, ClipboardList as ClipboardListIcon, Calendar as CalendarIcon, Lightbulb, BarChart3, BarChart2, History, Sparkles, BellRing, UserCheck, Tag, DatabaseZap, Percent, PartyPopper, Snowflake, Clock, Fingerprint, Inbox, Landmark, CalendarCheck, Star
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { useMenuFavoritos } from './hooks/useMenuFavoritos';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DiarioProvider } from './contexts/DiarioContext';
import DiarioGateway from './components/Diario/DiarioGateway';
import DiarioCheckout from './components/Diario/DiarioCheckout';
import PendenciaRotaGateway from './components/PendenciaRotaGateway';
import AlertaFaturamento from './components/AlertaFaturamento';
import AlertaPedidoConvertido from './components/AlertaPedidoConvertido';
import AlertaPedidosNaoEnviados from './components/AlertaPedidosNaoEnviados';
import AlertaComissao from './components/ComissaoVendedor';
import AlertaTarefas from './components/AlertaTarefas';
import AlertaPedidosSite from './components/AlertaPedidosSite';
import AlertaAutorizacaoDevolucao from './components/AlertaAutorizacaoDevolucao';
import Clippy from './components/Clippy/Clippy';
import TelaSemConexao from './components/TelaSemConexao';
import { useVersionCheck } from './hooks/useVersionCheck';

const PrivateRoute = ({ children, tab }) => {
  const { signed, loading, hasPermission, erroConexao } = useAuth();
  if (loading) return <div className="p-8 text-center text-gray-500">Validando sessão...</div>;
  // Servidor não respondeu: mostrar "tentar novamente" em vez de jogar no login.
  if (erroConexao) return <TelaSemConexao />;
  if (!signed) return <Navigate to="/login" replace />;
  const temAcesso = !tab || (Array.isArray(tab) ? tab.some(t => hasPermission(t, 'view')) : hasPermission(tab, 'view'));
  if (!temAcesso) return <div className="p-8 text-center text-red-600 font-bold">Acesso Negado a esta tela.</div>;
  return children;
};

// Redireciona para a tela inicial configurada pelo admin
const HomeRedirect = () => {
  const { user } = useAuth();
  const telaInicial = user?.permissoes?.telaInicial;
  if (telaInicial && telaInicial !== '/') {
    return <Navigate to={telaInicial} replace />;
  }
  return <DashboardHome />;
};

// Raiz do domínio: visitante (não logado) vê o site público de início;
// funcionário logado é levado para o painel do sistema.
const RootRoute = () => {
  const { signed, loading, erroConexao } = useAuth();
  if (loading) return <div className="p-8 text-center text-gray-500">Carregando...</div>;
  // Funcionário com sessão salva e servidor fora do ar: não cair no site público.
  if (erroConexao) return <TelaSemConexao />;
  if (!signed) return <HomeSite />;
  return <HomeRedirect />;
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
        ? 'bg-primary text-white font-semibold'
        : 'text-white/70 hover:bg-white/10 hover:text-white'
        }`}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap overflow-hidden">{label}</span>
    </NavLink>
  );
};

const SidebarSection = ({ label }) => (
  <div className="mx-2 mt-4 mb-1 px-3">
    <span className="text-[9px] font-bold uppercase tracking-widest text-white/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200">{label}</span>
    <div className="h-px bg-white/10 mt-1"></div>
  </div>
);

// Item dentro do submenu (flyout) do desktop — com estrela para fixar no topo do menu
const FlyItem = ({ to, icon: Icon, label, end, favorito, onToggleFav }) => (
  <NavLink
    to={to}
    end={end}
    title={label}
    className={({ isActive }) => `flex items-center gap-2.5 pl-3 pr-1.5 h-9 rounded-lg text-sm whitespace-nowrap transition-colors group/fly ${isActive ? 'bg-primary text-white font-medium' : 'text-white/80 hover:bg-primary hover:text-white'}`}
  >
    {Icon && <Icon className="h-4 w-4 shrink-0" />}
    <span className="truncate flex-1">{label}</span>
    {onToggleFav && (
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFav(to); }}
        title={favorito ? 'Remover dos favoritos' : 'Fixar no topo do menu'}
        className="p-1.5 rounded-md hover:bg-white/20 shrink-0"
      >
        <Star className={`h-3.5 w-3.5 transition-colors ${favorito ? 'fill-yellow-400 text-yellow-400' : 'text-white/30 group-hover/fly:text-white/60'}`} />
      </button>
    )}
  </NavLink>
);

// Tela favoritada fixa na barra lateral (ícone visível mesmo com a barra recolhida)
const SidebarFavItem = ({ to, icon: Icon, label, onRemove }) => {
  const location = useLocation();
  const isActive = location.pathname.startsWith(to);
  return (
    <NavLink
      to={to}
      title={label}
      className={`flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-[13px] transition-colors ${isActive
        ? 'bg-primary text-white font-semibold'
        : 'text-white/70 hover:bg-white/10 hover:text-white'
        }`}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="flex-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap overflow-hidden">{label}</span>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(to); }}
        title="Remover dos favoritos"
        className="p-1 rounded-md hover:bg-white/20 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
      >
        <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
      </button>
    </NavLink>
  );
};

// Seção do menu desktop: linha na barra recolhida + submenu que abre à DIREITA no hover.
// A barra fica estreita (só ícones); ao passar o mouse ela alarga (mostra os nomes) e,
// sobre uma seção, o submenu daquela seção aparece ao lado.
const SidebarCat = ({ icon: Icon, label, items, twoCols, favoritos, onToggleFav }) => {
  const location = useLocation();
  const active = items.some(i => i.to !== '/' && location.pathname.startsWith(i.to));
  // O submenu usa position:fixed (não é cortado pela rolagem da barra). Ancora no
  // topo da linha; se a linha está na metade de baixo da tela, ancora por baixo
  // e o submenu cresce para cima. 240px = largura da barra expandida (w-60).
  const [flyPos, setFlyPos] = useState(null);
  const posicionarFly = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.top > window.innerHeight / 2) {
      setFlyPos({ bottom: window.innerHeight - r.bottom, left: 240 });
    } else {
      setFlyPos({ top: r.top, left: 240 });
    }
  };
  return (
    <div className="relative group/cat" onMouseEnter={posicionarFly}>
      <div className={`flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-[13px] cursor-default overflow-hidden transition-colors ${active ? 'bg-primary/25 text-white font-semibold' : 'text-white/70 group-hover/cat:bg-white/10 group-hover/cat:text-white'}`}>
        <Icon className="h-5 w-5 shrink-0" />
        <span className="flex-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">{label}</span>
        <ChevronRight className="h-4 w-4 shrink-0 opacity-0 group-hover:opacity-50" />
      </div>
      <div style={flyPos || {}} className={`fixed bg-[#24413a] rounded-r-xl shadow-2xl p-2 z-[70] max-h-[85vh] overflow-y-auto invisible opacity-0 -translate-x-1 group-hover/cat:visible group-hover/cat:opacity-100 group-hover/cat:translate-x-0 transition-all duration-150 ${flyPos ? '' : 'hidden'} ${twoCols ? 'w-[430px]' : 'w-56'}`}>
        <div className="text-[10px] font-bold uppercase tracking-widest text-white/40 px-3 pt-1 pb-1.5">{label}</div>
        <div className={twoCols ? 'grid grid-cols-2 gap-0.5' : 'space-y-0.5'}>
          {items.map(i => <FlyItem key={i.to} {...i} favorito={favoritos?.includes(i.to)} onToggleFav={onToggleFav} />)}
        </div>
      </div>
    </div>
  );
};

// Componente de seção colapsável do menu mobile
const MobileMenuSection = ({ label, icon: Icon, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const hasActiveChild = React.Children.toArray(children).some(child => child?.props?.className?.includes?.('text-primary'));
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold transition-colors ${hasActiveChild || open ? 'text-gray-900 bg-gray-50' : 'text-gray-600 hover:bg-gray-50'}`}
      >
        <div className="flex items-center gap-2.5">
          {Icon && <Icon className="h-4 w-4 text-gray-400" />}
          <span>{label}</span>
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="pb-1">{children}</div>}
    </div>
  );
};

const Layout = ({ children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [visitorBar, setVisitorBar] = useState(true);
  const { user, logout, hasPermission, loading } = useAuth();
  const { updateAvailable } = useVersionCheck();
  const { favoritos, toggle: toggleFavorito, limite: limiteFavoritos } = useMenuFavoritos(user?.id);

  if (!user || loading) return <>{children}</>;

  const handleToggleFavorito = (to) => {
    if (!toggleFavorito(to)) {
      toast.error(`Limite de ${limiteFavoritos} favoritos — remova um para adicionar outro.`);
    }
  };

  const mobileLink = (isActive) =>
    isActive
      ? "flex items-center gap-2.5 pl-11 pr-4 py-2 text-sm font-medium text-primary bg-primary-50/50"
      : "flex items-center gap-2.5 pl-11 pr-4 py-2 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700";

  const closeMobile = () => setIsMobileMenuOpen(false);

  const showEstoque = user?.permissoes?.admin || (Array.isArray(user?.permissoes?.estoque) && user.permissoes.estoque.length > 0);
  const pcpPerms = user?.permissoes?.pcp || {};
  const isAdmin = !!user?.permissoes?.admin;
  const canPcp = (key) => isAdmin || !!pcpPerms[key];
  const showConfig = hasPermission('configuracoes');
  const showRH = isAdmin || hasPermission('Pode_Ver_RH') || hasPermission('Pode_Editar_RH');
  const showPonto = isAdmin || hasPermission('Pode_Ver_Ponto') || hasPermission('Pode_Editar_Ponto');

  // ── Seções do menu DESKTOP (barra recolhida + flyout). Mesmas permissões de antes. ──
  const desktopSections = [
    { label: 'Vendas', icon: ClipboardList, twoCols: true, items: [
      hasPermission('catalogo') && { to: '/catalogo', icon: BookOpen, label: 'Catálogo' },
      hasPermission('pedidos') && { to: '/pedidos', icon: ClipboardList, label: 'Pedidos' },
      hasPermission('pedidos') && { to: '/relatorios/pedidos', icon: FileText, label: 'Rel. Pedidos' },
      hasPermission('relatorioVendas') && { to: '/relatorios/vendas', icon: BarChart2, label: 'Rel. Vendas' },
      hasPermission('pedidos') && { to: '/relatorios/flex', icon: Percent, label: 'Análise Flex' },
      hasPermission('delivery') && { to: '/delivery', icon: Truck, label: 'Delivery' },
      (isAdmin || hasPermission('kitFesta')) && { to: '/kit-festa-admin', icon: PartyPopper, label: 'Kit Festa' },
      (isAdmin || hasPermission('kitFesta')) && { to: '/site-admin', icon: Snowflake, label: 'Site' },
      hasPermission('pedidos') && { to: '/rota', icon: Map, label: 'Rota' },
      hasPermission('rota') && { to: '/leads', icon: Target, label: 'Leads' },
      (isAdmin || hasPermission('Pode_Ver_Atendimentos')) && { to: '/atendimentos', icon: ClipboardCheck, label: 'Atendimentos' },
      (isAdmin || hasPermission('Pode_Ver_Analise_IA')) && { to: '/analise-ia', icon: Sparkles, label: 'Análise IA' },
      hasPermission('clientes') && { to: '/clientes', icon: Users, label: 'Clientes' },
    ].filter(Boolean) },
    { label: 'Logística', icon: Truck, items: [
      hasPermission('Pode_Acessar_Embarque') && { to: '/admin/embarques', icon: PackageCheck, label: 'Embarque' },
      hasPermission('Pode_Ver_Todas_Entregas') && { to: '/entregas', icon: Truck, label: 'Entregas' },
    ].filter(Boolean) },
    { label: 'Financeiro', icon: Wallet, twoCols: true, items: [
      hasPermission('Pode_Acessar_Caixa') && { to: '/caixa', icon: Wallet, label: 'Caixa' },
      hasPermission('Pode_Acessar_Caixa') && { to: '/despesas', icon: Receipt, label: 'Despesas' },
      hasPermission('Pode_Ver_Todas_Entregas') && { to: '/admin/auditoria-entregas', icon: Search, label: 'Auditoria' },
      hasPermission('Pode_Acessar_Contas_Receber') && { to: '/financeiro/contas-receber/tabela', icon: DollarSign, label: 'Contas a Receber' },
      (hasPermission('Pode_Acessar_Cobranca') || hasPermission('Pode_Editar_Cobranca')) && { to: '/financeiro/cobranca', icon: BellRing, label: 'Régua de Cobrança' },
      hasPermission('Pode_Acessar_Contas_Pagar') && { to: '/contas-pagar', icon: Wallet, label: 'Contas a Pagar' },
      hasPermission('Pode_Acessar_Notas_Recebidas') && { to: '/notas-recebidas', icon: Inbox, label: 'Notas Recebidas' },
      hasPermission('Pode_Acessar_Notas_Fiscais') && { to: '/notas-fiscais', icon: FileText, label: 'Notas Fiscais' },
      hasPermission('Pode_Acessar_Fornecedores') && { to: '/fornecedores', icon: Building2, label: 'Fornecedores' },
      hasPermission('Pode_Acessar_Financeiro_Gerencial') && { to: '/financeiro/dashboard', icon: Wallet, label: 'Visão Geral' },
      hasPermission('Pode_Acessar_Financeiro_Gerencial') && { to: '/financeiro/fluxo-caixa', icon: TrendingUp, label: 'Fluxo de Caixa' },
      hasPermission('Pode_Acessar_Financeiro_Gerencial') && { to: '/financeiro/por-conta', icon: Landmark, label: 'Saldos por Conta' },
      hasPermission('Pode_Acessar_Financeiro_Gerencial') && { to: '/financeiro/dre', icon: BarChart3, label: 'DRE' },
      hasPermission('Pode_Acessar_Financeiro_Gerencial') && { to: '/financeiro/margem-produtos', icon: Percent, label: 'Margem & Custo dos Produtos' },
      hasPermission('Pode_Acessar_Financeiro_Gerencial') && { to: '/financeiro/conciliacao', icon: ClipboardCheck, label: 'Conciliação Bancária' },
      hasPermission('Pode_Acessar_Financeiro_Gerencial') && { to: '/financeiro/categorias-despesa', icon: Tag, label: 'Categorias de Despesa' },
    ].filter(Boolean) },
    { label: 'Administração', icon: UserCog, items: [
      hasPermission('produtos') && { to: '/admin/produtos', icon: Box, label: 'Produtos' },
      hasPermission('vendedores') && { to: '/admin/vendedores', icon: UserCog, label: 'Usuários' },
      isAdmin && { to: '/admin/mensagens', icon: BellRing, label: 'Mensagens' },
      (user?.permissoes?.admin || hasPermission('Pode_Acessar_Veiculos')) && { to: '/admin/veiculos', icon: Car, label: 'Veículos' },
      hasPermission('sync') && { to: '/admin/sync', icon: RefreshCw, label: 'Sincronizar' },
      hasPermission('Pode_Acessar_Contabilidade') && { to: '/admin/contabilidade', icon: Landmark, label: 'Contabilidade' },
    ].filter(Boolean) },
    { label: 'RH', icon: UserCheck, items: [
      showRH && { to: '/rh/curriculos', icon: UserCheck, label: 'Currículos' },
      showPonto && { to: '/rh/funcionarios', icon: Fingerprint, label: 'Funcionários' },
      showPonto && { to: '/rh/ponto', icon: Clock, label: 'Ponto' },
    ].filter(Boolean) },
    { label: 'PCP', icon: Factory, twoCols: true, items: [
      canPcp('itens') && { to: '/pcp/itens', icon: Package, label: 'Itens' },
      canPcp('receitas') && { to: '/pcp/receitas', icon: BookOpenIcon, label: 'Receitas' },
      canPcp('ordens') && { to: '/pcp/ordens', icon: ClipboardListIcon, label: 'Ordens' },
      canPcp('ordens') && { to: '/pcp/painel', icon: Play, label: 'Painel' },
      canPcp('agenda') && { to: '/pcp/calendario', icon: CalendarIcon, label: 'Calendário' },
      canPcp('estoque') && { to: '/pcp/estoque', icon: Factory, label: 'Estoque PCP' },
      canPcp('sugestoes') && { to: '/pcp/sugestoes', icon: Lightbulb, label: 'Sugestoes' },
      canPcp('sugestoes') && { to: '/pcp/dashboard', icon: BarChart3, label: 'Dashboard' },
      canPcp('etiquetas') && { to: '/pcp/etiquetas', icon: Tag, label: 'Etiquetas' },
      canPcp('etiquetas') && { to: '/pcp/etiquetas/dados', icon: DatabaseZap, label: 'Dados Etiquetas' },
    ].filter(Boolean) },
    { label: 'Produção / Estoque', icon: Warehouse, items: (showEstoque ? [
      { to: '/estoque/posicao', icon: Warehouse, label: 'Posição' },
      { to: '/estoque', icon: Warehouse, label: 'Ajuste de Estoque' },
      { to: '/estoque/inventario', icon: ClipboardCheck, label: 'Inventário' },
      { to: '/estoque/historico', icon: History, label: 'Histórico' },
    ] : []) },
    { label: 'Configurações', icon: Settings, items: (showConfig ? [
      { to: '/admin/config', icon: Settings, label: 'Gerais' },
      { to: '/config/tabela-precos', icon: DollarSign, label: 'Preços' },
      { to: '/config/contas-financeiras', icon: Building2, label: 'Bancos' },
      { to: '/config/metas', icon: TrendingUp, label: 'Metas de Vendas' },
      { to: '/config/comissoes', icon: DollarSign, label: 'Comissões' },
      { to: '/config/categorias-produto', icon: FolderOpen, label: 'Cat. Produtos' },
      { to: '/config/categorias-cliente', icon: FolderOpen, label: 'Cat. Clientes' },
      { to: '/config/categorias-estoque', icon: FolderOpen, label: 'Cat. Estoque' },
    ] : []) },
  ].filter(s => s.items.length > 0);

  // Favoritos válidos: só telas que o usuário ainda tem permissão de ver
  // (perdeu a permissão → o atalho some sozinho, sem quebrar nada)
  const todosItensMenu = desktopSections.flatMap(s => s.items);
  const itensFavoritos = favoritos
    .map(f => todosItensMenu.find(i => i.to === f))
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-secondary flex">
      {/* ═══════════════════════════════════════════ */}
      {/* SIDEBAR — Desktop only                     */}
      {/* ═══════════════════════════════════════════ */}
      <aside className="hidden md:flex group fixed left-0 top-0 h-screen w-16 hover:w-60 bg-house border-r border-black/20 flex-col z-50 transition-all duration-200 overflow-visible shadow-sm">
        {/* Logo */}
        <div className="flex items-center h-14 px-4 border-b border-white/10 shrink-0">
          <Link to="/" className="flex items-center gap-2 text-white font-bold text-lg tracking-tight">
            <span className="w-8 h-8 bg-primary text-white rounded-lg flex items-center justify-center text-sm font-black shrink-0">H</span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">Hardt App</span>
          </Link>
        </div>

        {/* Nav — só as SEÇÕES (barra curta); cada uma abre o submenu à direita no hover */}
        <nav className="flex-1 py-2 space-y-0.5 overflow-y-auto">
          <SidebarItem to="/tarefas" icon={CalendarCheck} label="Tarefas" />
          <SidebarItem to="/" icon={LayoutDashboard} label="Dashboard" end />
          {itensFavoritos.length > 0 && (
            <>
              <div className="mx-2 mt-4 mb-1 px-3">
                <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-white/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                  <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400 shrink-0" />
                  Favoritos {itensFavoritos.length}/{limiteFavoritos}
                </span>
                <div className="h-px bg-white/10 mt-1"></div>
              </div>
              {itensFavoritos.map(i => (
                <SidebarFavItem key={i.to} to={i.to} icon={i.icon} label={i.label} onRemove={handleToggleFavorito} />
              ))}
              <div className="mx-2 mt-2 mb-1 px-3"><div className="h-px bg-white/10"></div></div>
            </>
          )}
          {desktopSections.map(s => (
            <SidebarCat key={s.label} icon={s.icon} label={s.label} items={s.items} twoCols={s.twoCols} favoritos={favoritos} onToggleFav={handleToggleFavorito} />
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/10 p-2 shrink-0 space-y-1">
          <DiarioCheckout />
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="w-7 h-7 bg-white/15 rounded-full flex items-center justify-center shrink-0">
              <span className="text-[11px] font-bold text-white">{(user.nome || user.login || '?')[0].toUpperCase()}</span>
            </div>
            <span className="text-[12px] font-medium text-white/80 truncate opacity-0 group-hover:opacity-100 transition-opacity duration-200">{user.nome || user.login}</span>
            <button
              onClick={() => window.location.reload()}
              title={updateAvailable ? 'Nova versão disponível — clique para atualizar' : 'Atualizar app'}
              className={`relative p-1.5 transition-colors shrink-0 opacity-0 group-hover:opacity-100 ${updateAvailable ? 'text-white' : 'text-white/50 hover:text-white'}`}
            >
              <RefreshCw className={`h-4 w-4 ${updateAvailable ? 'animate-spin' : ''}`} style={updateAvailable ? { animationDuration: '3s' } : undefined} />
              {updateAvailable && <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
            </button>
            <button
              onClick={logout}
              title="Sair"
              className="ml-auto p-1.5 text-white/50 hover:text-red-300 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ═══════════════════════════════════════════ */}
      {/* BARRA DE VISITANTES ONLINE (desktop)       */}
      {/* ═══════════════════════════════════════════ */}
      {visitorBar && <VisitorBar onClose={() => setVisitorBar(false)} />}

      {/* ═══════════════════════════════════════════ */}
      {/* MAIN CONTENT AREA                          */}
      {/* ═══════════════════════════════════════════ */}
      <div className={`flex-1 md:ml-16 flex flex-col min-h-screen min-w-0${visitorBar ? ' md:pt-[38px]' : ''}`}>
        {/* ── Mobile top bar ── */}
        <nav className="no-print md:hidden bg-house shadow-sm fixed top-0 left-0 right-0 z-50">
          <div className="px-4 flex justify-between h-14 items-center">
            <Link to="/" className="flex items-center text-white font-bold text-lg tracking-tight">
              Hardt App
            </Link>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.location.reload()}
                title={updateAvailable ? 'Nova versão disponível — clique para atualizar' : 'Atualizar app'}
                className={`relative p-2 rounded-md transition-colors ${updateAvailable ? 'text-white' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
              >
                <RefreshCw className={`h-5 w-5 ${updateAvailable ? 'animate-spin' : ''}`} style={updateAvailable ? { animationDuration: '3s' } : undefined} />
                {updateAvailable && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
              </button>
              <DiarioCheckout />
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-white/60 hover:text-white hover:bg-white/10"
              >
                {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </nav>

        {/* Espaçador para compensar a nav fixed no mobile */}
        <div className="no-print md:hidden h-14 shrink-0" />

        {/* ── Mobile drawer overlay ── */}
        {isMobileMenuOpen && (
          <div className="no-print md:hidden fixed inset-0 z-[60]" onClick={closeMobile}>
            <div className="absolute inset-0 bg-black/40" />
          </div>
        )}

        {/* ── Mobile drawer ── */}
        <div className={`no-print md:hidden fixed top-0 right-0 h-full w-72 bg-white shadow-2xl z-[70] transform transition-transform duration-300 ease-in-out flex flex-col ${isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          {/* Drawer header */}
          <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100 shrink-0">
            <span className="text-primary font-bold text-lg">Menu</span>
            <button onClick={closeMobile} className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Drawer body — scrollable */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {/* Tarefas — sempre visível (1º item) */}
            <NavLink to="/tarefas" onClick={closeMobile} className={({ isActive }) => `flex items-center gap-2.5 px-4 py-3 text-sm font-semibold transition-colors ${isActive ? 'text-primary bg-primary-50/50' : 'text-gray-700 hover:bg-gray-50'}`}>
              <CalendarCheck className="h-4 w-4" />
              Tarefas
            </NavLink>

            {/* Dashboard — sempre visível */}
            <NavLink to="/" end onClick={closeMobile} className={({ isActive }) => `flex items-center gap-2.5 px-4 py-3 text-sm font-semibold transition-colors ${isActive ? 'text-primary bg-primary-50/50' : 'text-gray-700 hover:bg-gray-50'}`}>
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </NavLink>

            {/* Favoritos — telas fixadas pelo usuário (máx. 10) */}
            {itensFavoritos.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  Favoritos {itensFavoritos.length}/{limiteFavoritos}
                </div>
                {itensFavoritos.map(i => (
                  <div key={i.to} className="flex items-center">
                    <NavLink to={i.to} onClick={closeMobile} className={({ isActive }) => `flex-1 min-w-0 flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium ${isActive ? 'text-primary bg-primary-50/50' : 'text-gray-700 hover:bg-gray-50'}`}>
                      <i.icon className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate">{i.label}</span>
                    </NavLink>
                    <button onClick={() => handleToggleFavorito(i.to)} title="Remover dos favoritos" className="p-2.5 mr-1.5 rounded-full hover:bg-gray-100 shrink-0">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Categorias — mesmas seções e permissões do menu desktop, com estrela para favoritar */}
            {desktopSections.map(s => (
              <MobileMenuSection key={s.label} label={s.label} icon={s.icon}>
                {s.items.map(i => (
                  <div key={i.to} className="flex items-center">
                    <NavLink to={i.to} onClick={closeMobile} className={({ isActive }) => `${mobileLink(isActive)} flex-1 min-w-0`}>{i.label}</NavLink>
                    <button
                      onClick={() => handleToggleFavorito(i.to)}
                      title={favoritos.includes(i.to) ? 'Remover dos favoritos' : 'Fixar no topo do menu'}
                      className="p-2.5 mr-1.5 rounded-full hover:bg-gray-100 shrink-0"
                    >
                      <Star className={`h-4 w-4 ${favoritos.includes(i.to) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                    </button>
                  </div>
                ))}
              </MobileMenuSection>
            ))}
          </div>

          {/* Drawer footer — fixo embaixo */}
          <div className="border-t border-gray-200 px-4 py-3 shrink-0 bg-gray-50">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary">{(user.nome || user.login || '?')[0].toUpperCase()}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user.nome || user.login}</p>
                <p className="text-[11px] text-gray-400">Logado</p>
              </div>
            </div>
            <button
              onClick={() => { logout(); closeMobile(); }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-semibold transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </div>

        {/* GATEKEEPER DE PENDÊNCIAS DE ROTA (bloqueia app inteiro) */}
        <PendenciaRotaGateway />

        {/* GATEKEEPER DO DIÁRIO / PONTO */}
        <DiarioGateway />

        {/* ALERTA DE PEDIDOS PENDENTES DE FATURAMENTO (popup a cada 10 min) */}
        <AlertaFaturamento />

        {/* ALERTA DE PEDIDO ESPECIAL CONVERTIDO EM NF (popup a cada 5 min p/ faturamento) */}
        <AlertaPedidoConvertido />

        {/* LEMBRETE DE PEDIDOS SALVOS SEM ENVIAR (popup a cada 30 min p/ o vendedor) */}
        <AlertaPedidosNaoEnviados />

        {/* COMISSÃO DO VENDEDOR — popup às 08:00 e 18:00 (1x por janela, só comissão ativa) */}
        <AlertaComissao />

        {/* ALERTA DE TAREFAS DA EQUIPE (pop-up + som no horário; insiste a cada 5 min) */}
        <AlertaTarefas />

        {/* PEDIDO DE AUTORIZAÇÃO DE DEVOLUÇÃO — pop-up p/ o responsável (checa a cada 10s) */}
        <AlertaAutorizacaoDevolucao />

        {/* ALERTA DE PEDIDOS NOVOS DO SITE — Kit Festa + Congelados (popup a cada 15 min) */}
        {(isAdmin || hasPermission('kitFesta')) && <AlertaPedidosSite />}

        {/* COPILOTO (CLIPPY) — assistente de negócio com IA, só desktop */}
        <Clippy />

        <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 pb-10 overflow-x-clip">
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
            <Suspense fallback={<div className="p-8 text-center text-gray-500">Carregando…</div>}>
            <Routes>
              {/* Página pública de candidatura (sem autenticação) */}
              <Route path="/candidatura" element={<Candidatura />} />

              {/* Bater ponto pelo link pessoal (sem autenticação) */}
              <Route path="/ponto/:token" element={<BaterPonto />} />

              {/* Site público do Kit Festa (sem autenticação do app) */}
              <Route path="/kit-festa" element={<KitFestaSite />} />

              {/* Site público da Hardt (home + congelados) — sem autenticação do app */}
              <Route path="/inicio" element={<HomeSite />} />
              <Route path="/congelados" element={<CongeladosSite />} />

              {/* Catálogo personalizado (lista de preços) por token — sem autenticação */}
              <Route path="/lista/:token" element={<ListaPersonalizada />} />

              <Route path="/login" element={<Login />} />

              {/* Raiz: visitante vê o site público; logado vai pro painel */}
              <Route path="/" element={<RootRoute />} />

              {/* Dashboard individual de vendedor (gestor escolhe o vendedor no seletor) */}
              <Route path="/dashboard-vendedor" element={<PrivateRoute><DashboardVendedorPessoal /></PrivateRoute>} />

              {/* Tarefas da Equipe (agenda com alertas) — toda a equipe logada */}
              <Route path="/tarefas" element={<PrivateRoute><TarefasAgenda /></PrivateRoute>} />
              <Route path="/tarefas/parecer" element={<PrivateRoute tab="Pode_Ver_Parecer_Tarefas"><TarefasParecer /></PrivateRoute>} />

              {/* Catálogo */}
              <Route path="/catalogo" element={<PrivateRoute tab="catalogo"><Catalogo /></PrivateRoute>} />
              <Route path="/produto/:id" element={<PrivateRoute tab="catalogo"><DetalheProduto /></PrivateRoute>} />

              {/* Pedidos */}
              <Route path="/pedidos" element={<PrivateRoute tab="pedidos"><ListaPedidos /></PrivateRoute>} />
              <Route path="/pedidos/novo" element={<PrivateRoute tab="pedidos"><NovoPedido /></PrivateRoute>} />
              <Route path="/pedidos/editar/:id" element={<PrivateRoute tab="pedidos"><NovoPedido /></PrivateRoute>} />
              <Route path="/pedidos/imprimir/:id" element={<PrivateRoute tab="pedidos"><ImpressaoPedido /></PrivateRoute>} />

              {/* Relatórios */}
              <Route path="/relatorios/pedidos" element={<PrivateRoute tab="pedidos"><RelatorioPedidos /></PrivateRoute>} />
              <Route path="/relatorios/vendas" element={<PrivateRoute tab="relatorioVendas"><RelatorioVendas /></PrivateRoute>} />
              <Route path="/relatorios/flex" element={<PrivateRoute tab="pedidos"><RelatorioFlex /></PrivateRoute>} />

              {/* Delivery (Kit Festa) */}
              <Route path="/delivery" element={<PrivateRoute tab="delivery"><DeliveryKanban /></PrivateRoute>} />
              <Route path="/delivery/config" element={<PrivateRoute><DeliveryConfig /></PrivateRoute>} />

              {/* Kit Festa — painel admin (agenda, produtos, pedidos do site) */}
              <Route path="/kit-festa-admin" element={<PrivateRoute tab="kitFesta"><KitFestaAdmin /></PrivateRoute>} />

              {/* Site Congelados — painel admin (pedidos do site, produtos) */}
              <Route path="/site-admin" element={<PrivateRoute tab="kitFesta"><SiteAdmin /></PrivateRoute>} />

              {/* Rota / Leads (CRM) */}
              <Route path="/rota" element={<PrivateRoute tab="pedidos"><RotaLeads /></PrivateRoute>} />
              <Route path="/leads" element={<PrivateRoute tab="rota"><ListaLeads /></PrivateRoute>} />
              <Route path="/atendimentos" element={<PrivateRoute tab="Pode_Ver_Atendimentos"><PainelAtendimentos /></PrivateRoute>} />
              <Route path="/analise-ia" element={<PrivateRoute tab="Pode_Ver_Analise_IA"><PainelAnaliseIA /></PrivateRoute>} />

              {/* Clientes */}
              <Route path="/clientes" element={<PrivateRoute tab="clientes"><ListaClientes /></PrivateRoute>} />
              <Route path="/clientes/novo" element={<PrivateRoute tab="clientes"><NovoCliente /></PrivateRoute>} />
              <Route path="/clientes/saude-gps" element={<PrivateRoute tab="clientes"><SaudePontosGps /></PrivateRoute>} />
              <Route path="/clientes/:uuid" element={<PrivateRoute tab="clientes"><DetalheCliente /></PrivateRoute>} />

              {/* LISTA GERENCIAL DE ENTREGAS */}
              <Route path="/entregas" element={<PrivateRoute tab="Pode_Ver_Todas_Entregas"><ListaEntregasGerencial /></PrivateRoute>} />

              {/* ROTAS DO MOTORISTA (APP MOBILE) */}
              <Route path="/minhas-entregas" element={<PrivateRoute tab="Pode_Executar_Entregas"><PainelMotorista /></PrivateRoute>} />

              {/* Financeiro */}
              <Route path="/financeiro/contas-receber" element={<Navigate to="/financeiro/contas-receber/tabela" replace />} />
              <Route path="/financeiro/contas-receber/tabela" element={<PrivateRoute tab="Pode_Acessar_Contas_Receber"><ContasReceberTabela /></PrivateRoute>} />
              <Route path="/financeiro/cobranca" element={<PrivateRoute tab={['Pode_Acessar_Cobranca', 'Pode_Editar_Cobranca']}><ReguaCobrancaPage /></PrivateRoute>} />
              <Route path="/contas-pagar" element={<PrivateRoute tab="Pode_Acessar_Contas_Pagar"><ContasPagarPage /></PrivateRoute>} />
              <Route path="/notas-recebidas" element={<PrivateRoute tab="Pode_Acessar_Notas_Recebidas"><NotasRecebidasPage /></PrivateRoute>} />
              <Route path="/notas-fiscais" element={<PrivateRoute tab="Pode_Acessar_Notas_Fiscais"><NotasFiscais /></PrivateRoute>} />
              <Route path="/fornecedores" element={<PrivateRoute tab="Pode_Acessar_Fornecedores"><FornecedoresPage /></PrivateRoute>} />
              <Route path="/financeiro/fluxo-caixa" element={<PrivateRoute tab="Pode_Acessar_Financeiro_Gerencial"><FluxoCaixaPage /></PrivateRoute>} />
              <Route path="/financeiro/margem-produtos" element={<PrivateRoute tab="Pode_Acessar_Financeiro_Gerencial"><ProdutosMargemCusto /></PrivateRoute>} />
              <Route path="/financeiro/conciliacao" element={<PrivateRoute tab="Pode_Acessar_Financeiro_Gerencial"><ConciliacaoBancariaPage /></PrivateRoute>} />
              <Route path="/financeiro/dashboard" element={<PrivateRoute tab="Pode_Acessar_Financeiro_Gerencial"><DashboardFinanceiroPage /></PrivateRoute>} />
              <Route path="/financeiro/por-conta" element={<PrivateRoute tab="Pode_Acessar_Financeiro_Gerencial"><ContasBancosPage /></PrivateRoute>} />
              <Route path="/financeiro/dre" element={<PrivateRoute tab="Pode_Acessar_Financeiro_Gerencial"><DrePage /></PrivateRoute>} />
              <Route path="/financeiro/categorias-despesa" element={<PrivateRoute tab="Pode_Acessar_Financeiro_Gerencial"><CategoriasDespesaPage /></PrivateRoute>} />

              {/* Caixa Diário e Despesas */}
              <Route path="/despesas" element={<PrivateRoute tab="Pode_Acessar_Caixa"><DespesasPage /></PrivateRoute>} />
              <Route path="/caixa" element={<PrivateRoute tab="Pode_Acessar_Caixa"><CaixaDiarioPage /></PrivateRoute>} />
              <Route path="/caixa/impressao" element={<PrivateRoute tab="Pode_Acessar_Caixa"><RelatorioCaixaPrint /></PrivateRoute>} />

              {/* PCP */}
              <Route path="/pcp/itens" element={<PrivateRoute><ItensPcp /></PrivateRoute>} />
              <Route path="/pcp/itens/novo" element={<PrivateRoute><ItemPcpForm /></PrivateRoute>} />
              <Route path="/pcp/itens/:id" element={<PrivateRoute><ItemPcpForm /></PrivateRoute>} />
              <Route path="/pcp/receitas" element={<PrivateRoute><ReceitasList /></PrivateRoute>} />
              <Route path="/pcp/receitas/nova" element={<PrivateRoute><ReceitaForm /></PrivateRoute>} />
              <Route path="/pcp/receitas/:id" element={<PrivateRoute><ReceitaDetalhe /></PrivateRoute>} />
              <Route path="/pcp/receitas/:id/editar" element={<PrivateRoute><ReceitaForm /></PrivateRoute>} />
              <Route path="/pcp/ordens" element={<PrivateRoute><OrdensProducao /></PrivateRoute>} />
              <Route path="/pcp/ordens/nova" element={<PrivateRoute><OrdemProducaoForm /></PrivateRoute>} />
              <Route path="/pcp/painel" element={<PrivateRoute><PainelOperacional /></PrivateRoute>} />
              <Route path="/pcp/calendario" element={<PrivateRoute><CalendarioProducao /></PrivateRoute>} />
              <Route path="/pcp/estoque" element={<PrivateRoute><EstoquePcp /></PrivateRoute>} />
              <Route path="/pcp/sugestoes" element={<PrivateRoute><SugestoesProducao /></PrivateRoute>} />
              <Route path="/pcp/dashboard" element={<PrivateRoute><DashboardPcp /></PrivateRoute>} />
              <Route path="/pcp/etiquetas" element={<PrivateRoute><EtiquetasList /></PrivateRoute>} />
              <Route path="/pcp/etiquetas/dados" element={<PrivateRoute><EtiquetasDados /></PrivateRoute>} />
              <Route path="/pcp/etiquetas/nova" element={<PrivateRoute><EtiquetaForm /></PrivateRoute>} />
              <Route path="/pcp/etiquetas/:id/editar" element={<PrivateRoute><EtiquetaForm /></PrivateRoute>} />
              <Route path="/pcp/etiquetas/:id/imprimir" element={<PrivateRoute><EtiquetaImprimir /></PrivateRoute>} />

              {/* Produção / Estoque */}
              <Route path="/estoque" element={<PrivateRoute><PainelEstoque /></PrivateRoute>} />
              <Route path="/estoque/historico" element={<PrivateRoute><HistoricoEstoque /></PrivateRoute>} />
              <Route path="/estoque/inventario" element={<PrivateRoute><InventarioEstoque /></PrivateRoute>} />
              <Route path="/estoque/posicao" element={<PrivateRoute><PosicaoEstoque /></PrivateRoute>} />

              {/* Produtos / Admin */}
              <Route path="/admin/produtos" element={<PrivateRoute tab="produtos"><ListaProdutos /></PrivateRoute>} />
              <Route path="/admin/produtos/:id" element={<PrivateRoute tab="produtos"><GerenciarProduto /></PrivateRoute>} />

              {/* Outros Admins */}
              <Route path="/admin/embarques" element={<PrivateRoute tab="Pode_Acessar_Embarque"><PainelEmbarque /></PrivateRoute>} />
              <Route path="/admin/embarques/mapa" element={<PrivateRoute tab="Pode_Acessar_Embarque"><MapaExpedicao /></PrivateRoute>} />
              <Route path="/admin/auditoria-entregas" element={<PrivateRoute tab="Pode_Ver_Todas_Entregas"><AuditoriaEntregas /></PrivateRoute>} />
              <Route path="/admin/sync" element={<PrivateRoute tab="sync"><PainelSync /></PrivateRoute>} />
              <Route path="/admin/vendedores" element={<PrivateRoute tab="vendedores"><ListaVendedores /></PrivateRoute>} />
              <Route path="/admin/mensagens" element={<PrivateRoute><MensagensAgendadas /></PrivateRoute>} />
              <Route path="/admin/veiculos" element={<PrivateRoute tab="Pode_Acessar_Veiculos"><Veiculos /></PrivateRoute>} />
              <Route path="/admin/contabilidade" element={<PrivateRoute tab="Pode_Acessar_Contabilidade"><ContabilidadePage /></PrivateRoute>} />
              <Route path="/admin/config" element={<PrivateRoute tab="configuracoes"><Configuracoes /></PrivateRoute>} />
              <Route path="/config/tabela-precos" element={<PrivateRoute tab="configuracoes"><TabelaPrecos /></PrivateRoute>} />
              <Route path="/config/contas-financeiras" element={<PrivateRoute tab="configuracoes"><ContasFinanceiras /></PrivateRoute>} />
              <Route path="/config/pagamentos-entrega" element={<PrivateRoute tab="configuracoes"><FormasPagamentoEntrega /></PrivateRoute>} />
              <Route path="/config/metas" element={<PrivateRoute tab="configuracoes"><GerenciarMetas /></PrivateRoute>} />
              <Route path="/config/comissoes" element={<PrivateRoute tab="configuracoes"><GerenciarComissoes /></PrivateRoute>} />
              <Route path="/config/categorias-produto" element={<PrivateRoute tab="configuracoes"><CategoriasProduto /></PrivateRoute>} />
              <Route path="/config/categorias-cliente" element={<PrivateRoute tab="configuracoes"><CategoriasCliente /></PrivateRoute>} />
              <Route path="/config/categorias-estoque" element={<PrivateRoute tab="configuracoes"><CategoriasEstoque /></PrivateRoute>} />

              {/* RH — Currículos */}
              <Route path="/rh/curriculos" element={<PrivateRoute tab="Pode_Ver_RH"><ListaCurriculos /></PrivateRoute>} />
              <Route path="/rh/curriculos/:id" element={<PrivateRoute tab="Pode_Ver_RH"><DetalheCurriculo /></PrivateRoute>} />

              {/* RH — Funcionários e Ponto */}
              <Route path="/rh/funcionarios" element={<PrivateRoute tab="Pode_Ver_Ponto"><FuncionariosLista /></PrivateRoute>} />
              <Route path="/rh/funcionarios/novo" element={<PrivateRoute tab="Pode_Ver_Ponto"><FuncionarioNovo /></PrivateRoute>} />
              <Route path="/rh/funcionarios/:id" element={<PrivateRoute tab="Pode_Ver_Ponto"><FuncionarioFicha /></PrivateRoute>} />
              <Route path="/rh/ponto" element={<PrivateRoute tab="Pode_Ver_Ponto"><PontoPainel /></PrivateRoute>} />
              <Route path="/rh/ponto/importar" element={<PrivateRoute tab="Pode_Ver_Ponto"><ImportarPonto /></PrivateRoute>} />
              <Route path="/rh/ponto/config" element={<PrivateRoute tab="Pode_Ver_Ponto"><ConfigPonto /></PrivateRoute>} />
            </Routes>
            </Suspense>
          </Layout>
          <Toaster position="top-right" />
        </DiarioProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
