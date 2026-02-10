import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Catalogo from './pages/Produtos/Catalogo';
import DetalheProduto from './pages/Produtos/DetalheProduto';
import ListaProdutos from './pages/Admin/Produtos/ListaProdutos';
import PainelSync from './pages/Admin/Sync/PainelSync';

// Layout simples para navegação durante desenvolvimento
const Layout = ({ children }) => (
  <div className="min-h-screen bg-gray-50">
    <nav className="bg-white shadow-sm mb-4">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <Link to="/" className="flex-shrink-0 flex items-center text-primary font-bold">
              Hardt App
            </Link>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              <Link to="/" className="text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 border-transparent hover:border-gray-300">
                Catálogo
              </Link>
              <Link to="/admin/produtos" className="text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 border-transparent hover:border-gray-300">
                Admin: Produtos
              </Link>
              <Link to="/admin/sync" className="text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 border-transparent hover:border-gray-300">
                Admin: Sync
              </Link>
            </div>
          </div>
        </div>
      </div>
    </nav>
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
      {children}
    </main>
  </div>
);

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          {/* Vendedor */}
          <Route path="/" element={<Catalogo />} />
          <Route path="/produto/:id" element={<DetalheProduto />} />

          {/* Admin */}
          <Route path="/admin/produtos" element={<ListaProdutos />} />
          <Route path="/admin/sync" element={<PainelSync />} />
          {/* Faltou GerenciarProduto, adicionaremos depois se necessário no fluxo */}
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
