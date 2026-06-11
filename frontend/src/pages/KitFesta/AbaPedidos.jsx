import React, { useEffect, useState } from 'react';
import { Search, Loader2, Check, X, AlertTriangle, UserPlus, Package, Calendar, Clock, MapPin, Truck, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { kitFestaService } from '../../services/kitFestaService';
import clienteService from '../../services/clienteService';
import vendedorService from '../../services/vendedorService';

const money = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
const STATUS_FILTROS = [
  ['', 'Todos'],
  ['AGUARDANDO', 'Aguardando'],
  ['PENDENTE_CADASTRO', 'Sem cadastro'],
  ['CONVERTIDO', 'Convertidos'],
  ['RECUSADO', 'Recusados'],
];
const BADGE = {
  AGUARDANDO: 'bg-amber-50 text-amber-700',
  PENDENTE_CADASTRO: 'bg-red-50 text-red-700',
  APROVADO: 'bg-blue-50 text-blue-700',
  CONVERTIDO: 'bg-emerald-50 text-emerald-700',
  RECUSADO: 'bg-gray-100 text-gray-400',
  CANCELADO: 'bg-gray-100 text-gray-400',
};
const STATUS_LABEL = {
  AGUARDANDO: 'Aguardando', PENDENTE_CADASTRO: 'Sem cadastro', APROVADO: 'Aprovado',
  CONVERTIDO: 'Convertido', RECUSADO: 'Recusado', CANCELADO: 'Cancelado',
};

export default function AbaPedidos() {
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(null);

  const carregar = () => {
    setLoading(true);
    kitFestaService.pedidos({ status: status || undefined, busca: busca || undefined })
      .then(setLista).catch(() => toast.error('Erro ao carregar pedidos')).finally(() => setLoading(false));
  };
  useEffect(() => { const t = setTimeout(carregar, busca ? 350 : 0); return () => clearTimeout(t); }, [status, busca]);

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm" placeholder="Buscar por nome, CPF ou telefone..."
            value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 overflow-x-auto">
          {STATUS_FILTROS.map(([v, l]) => (
            <button key={v} onClick={() => setStatus(v)}
              className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap ${status === v ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500'}`}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-gray-400"><Loader2 className="h-6 w-6 animate-spin inline" /></div>
      ) : lista.length === 0 ? (
        <div className="p-12 text-center text-gray-400 text-sm">Nenhum pedido encontrado.</div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {lista.map(p => (
            <button key={p.id} onClick={() => setAberto(p)}
              className={`text-left bg-white rounded-xl border p-3 hover:shadow-md transition-shadow ${p.status === 'PENDENTE_CADASTRO' ? 'border-red-200' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-xs text-gray-400">#{p.numero}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${BADGE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
              </div>
              <div className="font-semibold text-gray-800 text-sm">{p.nomeCliente}</div>
              <div className="text-xs text-gray-400">{p.telefoneCliente || p.cpfCliente}</div>
              <div className="flex items-center gap-2 text-xs text-gray-500 mt-2">
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{String(p.data).slice(0, 10).split('-').reverse().join('/')}</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{p.horario}</span>
                <span className="flex items-center gap-1">{p.modo === 'entrega' ? <Truck className="h-3 w-3" /> : <Package className="h-3 w-3" />}{p.modo}</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                <span className="text-xs text-gray-400">{p.totalCaixas} caixa(s)</span>
                <span className="font-bold text-emerald-700 text-sm">{money(p.total)}</span>
              </div>
              {p.status === 'PENDENTE_CADASTRO' && (
                <div className="mt-2 text-xs text-red-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Cliente sem cadastro no app</div>
              )}
              {p.pedido && <div className="mt-1 text-xs text-emerald-600">→ Pedido {p.pedido.numero ? `#${p.pedido.numero}` : 'criado'}</div>}
            </button>
          ))}
        </div>
      )}

      {aberto && <ModalPedido pedido={aberto} onClose={() => setAberto(null)} onChanged={() => { setAberto(null); carregar(); }} />}
    </div>
  );
}

// ── Modal de detalhe + aprovação/conversão ──
function ModalPedido({ pedido, onClose, onChanged }) {
  const [vendedores, setVendedores] = useState([]);
  const [tipo, setTipo] = useState('NORMAL');
  const [vendedorId, setVendedorId] = useState('');
  const [processando, setProcessando] = useState(false);

  // Vínculo de cliente (para pedidos sem cadastro)
  const [buscaCli, setBuscaCli] = useState('');
  const [resultados, setResultados] = useState([]);
  const [clienteVinc, setClienteVinc] = useState(null);

  const precisaVinculo = pedido.status === 'PENDENTE_CADASTRO' && !pedido.kitFestaCliente?.clienteUuid;

  useEffect(() => { vendedorService.listarAtivos().then(setVendedores).catch(() => {}); }, []);

  useEffect(() => {
    if (!buscaCli || buscaCli.length < 2) { setResultados([]); return; }
    const t = setTimeout(() => clienteService.buscarGlobal(buscaCli, 8).then(setResultados).catch(() => {}), 350);
    return () => clearTimeout(t);
  }, [buscaCli]);

  const vincular = async (c) => {
    try {
      await kitFestaService.vincularCliente(pedido.id, c.UUID);
      setClienteVinc(c);
      toast.success('Cliente vinculado. Agora pode aprovar.');
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao vincular'); }
  };

  const aprovar = async () => {
    setProcessando(true);
    try {
      await kitFestaService.aprovarPedido(pedido.id, { tipoConversao: tipo, vendedorId: vendedorId || null, clienteUuid: clienteVinc?.UUID });
      toast.success('Pedido aprovado e convertido!');
      onChanged();
    } catch (e) { toast.error(e.response?.data?.error || 'Erro ao aprovar'); }
    finally { setProcessando(false); }
  };

  const recusar = async () => {
    const motivo = prompt('Motivo da recusa (opcional):');
    if (motivo === null) return;
    setProcessando(true);
    try { await kitFestaService.recusarPedido(pedido.id, motivo); toast.success('Pedido recusado'); onChanged(); }
    catch { toast.error('Erro ao recusar'); }
    finally { setProcessando(false); }
  };

  const finalizado = ['CONVERTIDO', 'RECUSADO', 'CANCELADO'].includes(pedido.status);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white">
          <div>
            <h3 className="font-semibold text-gray-800">Pedido #{pedido.numero}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full ${BADGE[pedido.status]}`}>{STATUS_LABEL[pedido.status]}</span>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Cliente */}
          <div>
            <div className="font-medium text-gray-800">{pedido.nomeCliente}</div>
            <div className="text-sm text-gray-500">CPF {pedido.cpfCliente} · {pedido.telefoneCliente || 'sem telefone'}</div>
          </div>

          {/* Entrega */}
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <div className="flex items-center gap-2 text-gray-600">{pedido.modo === 'entrega' ? <Truck className="h-4 w-4" /> : <Package className="h-4 w-4" />}
              {pedido.modo === 'entrega' ? 'Entrega' : 'Retirada na loja'}</div>
            <div className="flex items-center gap-2 text-gray-600"><Calendar className="h-4 w-4" />{String(pedido.data).slice(0, 10).split('-').reverse().join('/')} às {pedido.horario}</div>
            {pedido.bairro && <div className="flex items-center gap-2 text-gray-600"><MapPin className="h-4 w-4" />{pedido.bairro.nome} · taxa {money(pedido.taxaEntrega)}</div>}
            {pedido.enderecoEntrega && <div className="text-xs text-gray-500 pl-6">{pedido.enderecoEntrega}</div>}
          </div>

          {/* Itens */}
          <div>
            <div className="text-xs font-medium text-gray-500 uppercase mb-1.5">Itens</div>
            <div className="space-y-1">
              {pedido.itens.map(it => (
                <div key={it.id} className="flex justify-between text-sm">
                  <span className="text-gray-700"><b>{it.quantidade}×</b> {it.nomeProduto}{it.opcao ? ` (${it.opcao})` : ''} <span className="text-gray-400 text-xs">· {it.unidadesPorCaixa}un</span></span>
                  <span className="text-gray-600">{money(it.precoUnitario * it.quantidade)}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t border-gray-100 space-y-0.5 text-sm">
              <div className="flex justify-between text-gray-500"><span>Subtotal ({pedido.totalCaixas} caixas)</span><span>{money(pedido.subtotal)}</span></div>
              {Number(pedido.descontoValor) > 0 && <div className="flex justify-between text-gray-500"><span>Cupom {pedido.cupomCodigo}</span><span>– {money(pedido.descontoValor)}</span></div>}
              {Number(pedido.taxaEntrega) > 0 && <div className="flex justify-between text-gray-500"><span>Taxa entrega</span><span>{money(pedido.taxaEntrega)}</span></div>}
              <div className="flex justify-between font-bold text-gray-800"><span>Total</span><span>{money(pedido.total)}</span></div>
            </div>
          </div>

          {pedido.observacoes && <div className="text-sm bg-amber-50 text-amber-800 rounded-lg p-2.5"><b>Obs:</b> {pedido.observacoes}</div>}

          {pedido.pedido && (
            <div className="text-sm bg-emerald-50 text-emerald-700 rounded-lg p-2.5 flex items-center gap-1.5">
              <Check className="h-4 w-4" /> Convertido no Pedido {pedido.pedido.numero ? `#${pedido.pedido.numero}` : ''} ({pedido.tipoConversao})
            </div>
          )}

          {/* Vínculo de cliente (sem cadastro) */}
          {precisaVinculo && !clienteVinc && !finalizado && (
            <div className="border border-red-200 rounded-lg p-3 bg-red-50/50">
              <div className="text-sm font-medium text-red-700 flex items-center gap-1.5 mb-2">
                <UserPlus className="h-4 w-4" /> Vincular a um cliente do app
              </div>
              <p className="text-xs text-gray-500 mb-2">Este cliente ainda não tem cadastro. Cadastre no Conta Azul, sincronize, e então busque e vincule aqui antes de aprovar.</p>
              <div className="relative">
                <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm" placeholder="Buscar cliente por nome ou CPF..."
                  value={buscaCli} onChange={e => setBuscaCli(e.target.value)} />
              </div>
              {resultados.length > 0 && (
                <div className="mt-1 border border-gray-200 rounded-lg divide-y max-h-40 overflow-y-auto bg-white">
                  {resultados.map(c => (
                    <button key={c.UUID} onClick={() => vincular(c)} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                      <div className="font-medium text-gray-700">{c.Nome}</div>
                      <div className="text-xs text-gray-400">{c.Documento || ''}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {clienteVinc && (
            <div className="text-sm bg-emerald-50 text-emerald-700 rounded-lg p-2.5 flex items-center gap-1.5">
              <Check className="h-4 w-4" /> Vinculado a {clienteVinc.Nome}
            </div>
          )}

          {/* Aprovação / conversão */}
          {!finalizado && (
            <div className="border-t border-gray-100 pt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500">Tipo de pedido</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={tipo} onChange={e => setTipo(e.target.value)}>
                    <option value="NORMAL">Normal</option>
                    <option value="ESPECIAL">Especial (sem nota)</option>
                    <option value="BONIFICACAO">Bonificação</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Vendedor</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={vendedorId} onChange={e => setVendedorId(e.target.value)}>
                    <option value="">— sem vendedor —</option>
                    {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={aprovar} disabled={processando || (precisaVinculo && !clienteVinc)}
                  className="flex-1 bg-emerald-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
                  {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Aprovar e enviar pra Pedidos
                </button>
                <button onClick={recusar} disabled={processando}
                  className="px-4 py-2.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50">Recusar</button>
              </div>
              {precisaVinculo && !clienteVinc && <p className="text-xs text-red-500 text-center">Vincule um cliente do app antes de aprovar.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
