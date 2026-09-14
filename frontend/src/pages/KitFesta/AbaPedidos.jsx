import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Search, Loader2, Check, X, AlertTriangle, UserPlus, Package, Calendar, Clock, MapPin, Truck, ExternalLink, Trash2, Phone, RefreshCw, Megaphone } from 'lucide-react';
import toast from 'react-hot-toast';
import { kitFestaService } from '../../services/kitFestaService';
import clienteService from '../../services/clienteService';
import vendedorService from '../../services/vendedorService';
import { useAuth } from '../../contexts/AuthContext';
import SelectBusca from '../../components/SelectBusca';
import { normalizarDoc } from '../../utils/documento'; // inclui CNPJ ALFANUMÉRICO
import { BarraBuscaPedidos, ChipsStatusPedidos, PendentesPedidos, ListaLinhasPedidos, LinhaPedidoOnline } from '../PedidosOnline/listaEstiloPedidos';
import { List, Hourglass, UserX, CheckCircle, XCircle, Ban, MessageCircle } from 'lucide-react';

const money = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
const docLabel = (doc) => (normalizarDoc(doc).length === 14 ? 'CNPJ' : 'CPF');
// Nome digitado no site quando difere do cadastro vinculado (mostrado como dica)
const nomeDoSite = (nomeSite, nomeCadastro) => {
  const a = String(nomeSite || '').trim(), b = String(nomeCadastro || '').trim();
  return a && b && a.toLowerCase() !== b.toLowerCase() ? a : '';
};
// Data/hora que o cliente fez o pedido, no fuso de São Paulo
const feitoEm = (d) => {
  if (!d) return null;
  try {
    return new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' ·');
  } catch { return null; }
};
// Chips de status no desenho da aba de Pedidos (cor ativa por status)
const CHIPS_STATUS = [
  { key: '', label: 'Todos', icon: List, active: 'bg-gray-200 text-gray-800 border-gray-400' },
  { key: 'AGUARDANDO', label: 'Aguardando', icon: Hourglass, active: 'bg-amber-100 text-amber-800 border-amber-300' },
  { key: 'PENDENTE_CADASTRO', label: 'Sem cadastro', icon: UserX, active: 'bg-red-100 text-red-800 border-red-300' },
  { key: 'CONVERTIDO', label: 'Convertidos', icon: CheckCircle, active: 'bg-green-100 text-green-800 border-green-300' },
  { key: 'RECUSADO', label: 'Recusados', icon: XCircle, active: 'bg-gray-100 text-gray-800 border-gray-300' },
  { key: 'CANCELADO', label: 'Cancelados', icon: Ban, active: 'bg-gray-100 text-gray-800 border-gray-300' },
];
const BADGE = {
  AGUARDANDO: 'bg-amber-100 text-amber-700',
  PENDENTE_CADASTRO: 'bg-red-100 text-red-700',
  APROVADO: 'bg-blue-100 text-blue-700',
  CONVERTIDO: 'bg-emerald-100 text-emerald-700',
  RECUSADO: 'bg-gray-100 text-gray-500',
  CANCELADO: 'bg-gray-100 text-gray-500',
};
const STATUS_LABEL = {
  AGUARDANDO: 'Aguardando', PENDENTE_CADASTRO: 'Sem cadastro', APROVADO: 'Aprovado',
  CONVERTIDO: 'Convertido', RECUSADO: 'Recusado', CANCELADO: 'Cancelado',
};

export default function AbaPedidos() {
  const { user } = useAuth();
  const isAdmin = !!user?.permissoes?.admin;
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(null);

  const carregar = useCallback((silent) => {
    if (!silent) setLoading(true);
    kitFestaService.pedidos({ busca: busca || undefined })
      .then(setLista).catch(() => { if (!silent) toast.error('Erro ao carregar pedidos'); }).finally(() => { if (!silent) setLoading(false); });
  }, [busca]);
  useEffect(() => { const t = setTimeout(() => carregar(), busca ? 350 : 0); return () => clearTimeout(t); }, [carregar, busca]);
  // Atualiza sozinho a cada 45s: novos pedidos e mudanças de status aparecem sem recarregar.
  useEffect(() => { const t = setInterval(() => carregar(true), 45000); return () => clearInterval(t); }, [carregar]);

  const counts = useMemo(() => {
    const c = { '': lista.length };
    lista.forEach(p => { c[p.status] = (c[p.status] || 0) + 1; });
    return c;
  }, [lista]);
  const atencao = useMemo(() => lista.filter(p => p.status === 'AGUARDANDO' || p.status === 'PENDENTE_CADASTRO').length, [lista]);
  const filtrada = status ? lista.filter(p => p.status === status) : lista;

  const nAguardando = useMemo(() => lista.filter(p => p.status === 'AGUARDANDO').length, [lista]);
  const nSemCadastro = useMemo(() => lista.filter(p => p.status === 'PENDENTE_CADASTRO').length, [lista]);

  return (
    <div>
      <BarraBuscaPedidos valor={busca} onChange={setBusca} onAtualizar={() => carregar()}
        placeholder="Buscar nome, razão, fantasia, cidade, CPF ou CNPJ..." />

      <PendentesPedidos onClick={setStatus} itens={[
        { key: 'AGUARDANDO', label: 'Aguardando', total: nAguardando, color: 'amber', icon: Hourglass },
        { key: 'PENDENTE_CADASTRO', label: 'Sem cadastro', total: nSemCadastro, color: 'red', icon: UserX },
      ]} />

      <ChipsStatusPedidos chips={CHIPS_STATUS} valor={status} onChange={setStatus} contagens={counts} />

      <ListaLinhasPedidos loading={loading} vazio={filtrada.length === 0 ? 'Nenhum pedido encontrado.' : null}>
        {filtrada.map(p => {
          const novo = p.status === 'AGUARDANDO' || p.status === 'PENDENTE_CADASTRO';
          const inativo = p.status === 'RECUSADO' || p.status === 'CANCELADO';
          const cli = p.kitFestaCliente?.cliente;
          // Vinculado a um cadastro → mostra nome (razão social) e documento do cadastro; senão, o que veio do site
          const nomeExib = cli?.Nome || p.nomeCliente;
          const docExib = cli?.Documento || p.cpfCliente;
          const fantasia = cli?.NomeFantasia && cli.NomeFantasia !== nomeExib ? cli.NomeFantasia : '';
          const cidade = cli?.End_Cidade || '';
          const nomeSite = cli ? nomeDoSite(p.nomeCliente, nomeExib) : '';
          const dataEnt = String(p.data || '').slice(0, 10).split('-').reverse().join('/');
          const feito = feitoEm(p.createdAt);
          return (
            <LinhaPedidoOnline key={p.id}
              numero={`#${p.numero}`} novo={novo} inativo={inativo}
              nome={fantasia ? `${nomeExib} · ${fantasia}` : nomeExib}
              valor={money(p.total)}
              linha2={[
                `${p.modo === 'entrega' ? 'Entrega' : 'Retirada'}: ${dataEnt}${p.horario ? ` ${p.horario}` : ''}`,
                feito ? `Pedido: ${feito}` : '',
                nomeSite ? `por: ${nomeSite}` : '',
              ]}
              linha3={cidade}
              extras={[
                `${docExib ? `${docLabel(docExib)}: ${docExib}` : ''}${p.telefoneCliente ? `${docExib ? ' · ' : ''}Tel: ${p.telefoneCliente}` : ''}`,
                `${p.totalCaixas} caixa(s)`,
              ]}
              selos={[
                { texto: STATUS_LABEL[p.status] || p.status, cls: BADGE[p.status] || 'bg-gray-100 text-gray-700' },
                p.status === 'PENDENTE_CADASTRO' ? { texto: 'Cliente sem cadastro no app', cls: 'bg-red-50 text-red-700 border border-red-200', icon: AlertTriangle } : null,
                p.celularAlterado ? { texto: 'Celular alterado — atualizar no cadastro', cls: 'bg-amber-50 text-amber-700 border border-amber-200', icon: Phone } : null,
                p.status === 'CANCELADO'
                  ? { texto: `Pedido ${p.pedido?.numero ? `#${p.pedido.numero} ` : ''}excluído no sistema`, cls: 'bg-gray-100 text-gray-600' }
                  : (p.pedido ? { texto: `→ Pedido ${p.pedido.numero ? `#${p.pedido.numero}` : 'criado'}`, cls: 'bg-green-100 text-green-800' } : null),
              ]}
              onAbrir={() => setAberto(p)}
            />
          );
        })}
      </ListaLinhasPedidos>

      {aberto && <ModalPedido pedido={aberto} isAdmin={isAdmin} onClose={() => setAberto(null)} onChanged={() => { setAberto(null); carregar(); }} />}
    </div>
  );
}

// ── Modal de detalhe + aprovação/conversão ──
function ModalPedido({ pedido, isAdmin, onClose, onChanged }) {
  const [vendedores, setVendedores] = useState([]);
  const [tipo, setTipo] = useState('NORMAL');
  const [vendedorId, setVendedorId] = useState('');
  const [processando, setProcessando] = useState(false);

  // Vínculo de cliente (para pedidos sem cadastro)
  const [buscaCli, setBuscaCli] = useState('');
  const [resultados, setResultados] = useState([]);
  const [clienteVinc, setClienteVinc] = useState(null);

  const precisaVinculo = pedido.status === 'PENDENTE_CADASTRO' && !pedido.kitFestaCliente?.clienteUuid;
  // Cadastro do app vinculado ao pedido (define nome/CPF exibidos) — vínculo recém-feito nesta sessão tem prioridade
  const cliVinc = clienteVinc || pedido.kitFestaCliente?.cliente || null;

  useEffect(() => { vendedorService.listarAtivos().then(setVendedores).catch(() => {}); }, []);

  useEffect(() => {
    if (!buscaCli || buscaCli.length < 2) { setResultados([]); return; }
    const t = setTimeout(() => clienteService.buscarGlobal(buscaCli, 8)
      .then(r => setResultados(Array.isArray(r) ? r : (r?.data || [])))  // buscarGlobal devolve { data: [...] }
      .catch(() => {}), 350);
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

  const excluir = async () => {
    if (!confirm(`Excluir definitivamente o pedido #${pedido.numero}? Esta ação não pode ser desfeita.`)) return;
    setProcessando(true);
    try { await kitFestaService.excluirPedido(pedido.id); toast.success('Pedido excluído'); onChanged(); }
    catch (e) { toast.error(e.response?.data?.error || 'Erro ao excluir'); }
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
          <div className="flex items-center gap-1">
            {isAdmin && (
              <button onClick={excluir} disabled={processando} title="Excluir pedido"
                className="p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50">
                <Trash2 className="h-4.5 w-4.5" />
              </button>
            )}
            <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Cliente */}
          <div>
            <div className="font-medium text-gray-800">{cliVinc?.Nome || pedido.nomeCliente}</div>
            <div className="text-sm text-gray-500">{docLabel(cliVinc?.Documento || pedido.cpfCliente)} {cliVinc?.Documento || pedido.cpfCliente} · {pedido.telefoneCliente || 'sem telefone'}</div>
            {cliVinc && nomeDoSite(pedido.nomeCliente, cliVinc.Nome) && (
              <div className="mt-0.5 text-xs text-gray-400">Pedido feito por {pedido.nomeCliente} (nome informado no site)</div>
            )}
            {feitoEm(pedido.createdAt) && (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-400"><Clock className="h-3.5 w-3.5" />Pedido feito em {feitoEm(pedido.createdAt)}</div>
            )}
            {pedido.celularAlterado && (
              <div className="mt-1.5 text-xs bg-amber-50 text-amber-700 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> O cliente informou/corrigiu o celular ({pedido.telefoneCliente}). Atualize no cadastro do app/CA.
              </div>
            )}
          </div>

          {/* Entrega */}
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <div className="flex items-center gap-2 text-gray-600">{pedido.modo === 'entrega' ? <Truck className="h-4 w-4" /> : <Package className="h-4 w-4" />}
              {pedido.modo === 'entrega' ? 'Entrega' : 'Retirada na loja'}</div>
            <div className="flex items-center gap-2 text-gray-600"><Calendar className="h-4 w-4" />{String(pedido.data).slice(0, 10).split('-').reverse().join('/')} às {pedido.horario}</div>
            {pedido.bairro && <div className="flex items-center gap-2 text-gray-600"><MapPin className="h-4 w-4" />{pedido.bairro.nome} · taxa {money(pedido.taxaEntrega)}</div>}
            {pedido.enderecoEntrega && <div className="text-xs text-gray-500 pl-6">{pedido.enderecoEntrega}</div>}
            {pedido.modo === 'entrega' && !pedido.bairro && <div className="flex items-center gap-2 text-amber-600 text-xs"><MapPin className="h-4 w-4" />Taxa de entrega a combinar (conforme endereço)</div>}
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
              {Number(pedido.descontoValor) > 0 && <div className="flex justify-between text-gray-500"><span>{pedido.origemDesconto === 'CREDITO' ? 'Crédito de indicação' : pedido.origemDesconto === 'INDICACAO' ? 'Desconto de indicação' : `Cupom ${pedido.cupomCodigo || ''}`}</span><span>– {money(pedido.descontoValor)}</span></div>}
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
                  <SelectBusca className="w-full" value={tipo} onChange={e => setTipo(e.target.value)}>
                    <option value="NORMAL">Normal</option>
                    <option value="ESPECIAL">Especial (sem nota)</option>
                    <option value="BONIFICACAO">Bonificação</option>
                  </SelectBusca>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Vendedor</label>
                  <SelectBusca className="w-full" value={vendedorId} onChange={e => setVendedorId(e.target.value)}>
                    <option value="">— sem vendedor —</option>
                    {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                  </SelectBusca>
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
