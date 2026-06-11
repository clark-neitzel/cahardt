import React, { useState } from 'react';
import { CalendarDays, ClipboardList, Box, MapPin, Ticket, Settings, PartyPopper, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';
import AbaAgenda from './AbaAgenda';
import AbaPedidos from './AbaPedidos';
import AbaProdutos from './AbaProdutos';
import AbaBairros from './AbaBairros';
import AbaCupons from './AbaCupons';
import AbaConfig from './AbaConfig';
import { API_URL } from '../../services/api';

const TABS = [
  { id: 'pedidos', label: 'Pedidos', icon: ClipboardList },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'produtos', label: 'Produtos', icon: Box },
  { id: 'bairros', label: 'Bairros', icon: MapPin },
  { id: 'cupons', label: 'Cupons', icon: Ticket },
  { id: 'config', label: 'Configurações', icon: Settings },
];

export default function KitFestaAdmin() {
  const [tab, setTab] = useState('pedidos');

  // Link público do site (a página /kit-festa do próprio front)
  const linkPublico = `${window.location.origin}/kit-festa`;
  const copiarLink = () => {
    navigator.clipboard.writeText(linkPublico).then(() => toast.success('Link copiado!'));
  };

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 py-4">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <PartyPopper className="h-6 w-6 text-emerald-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-800">Kit Festa</h1>
            <p className="text-xs text-gray-500">Site de pedidos · agenda da cozinha · conversão em pedidos</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href={linkPublico} target="_blank" rel="noreferrer"
            className="text-xs px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex items-center gap-1.5">
            <Link2 className="h-4 w-4" /> Abrir site
          </a>
          <button onClick={copiarLink}
            className="text-xs px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5">
            Copiar link do cliente
          </button>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 overflow-x-auto border-b border-gray-200 mb-4 -mx-1 px-1">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${active
                ? 'border-emerald-600 text-emerald-700 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo */}
      <div>
        {tab === 'pedidos' && <AbaPedidos />}
        {tab === 'agenda' && <AbaAgenda />}
        {tab === 'produtos' && <AbaProdutos />}
        {tab === 'bairros' && <AbaBairros />}
        {tab === 'cupons' && <AbaCupons />}
        {tab === 'config' && <AbaConfig />}
      </div>
    </div>
  );
}
