import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import publicApi, { getToken, setToken } from './api';
import { Icon } from './icons';
import Login from './Login';
import './site.css';
import { API_URL } from '../../services/api';

const LOGO = '/congelados/logo.png';
const money = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
const imgUrl = (u) => !u ? null : (u.startsWith('http') ? u : `${API_URL}${u}`);
const soDigitos = (s) => String(s || '').replace(/\D/g, '');

export default function CongeladosSite() {
  const [cliente, setCliente] = useState(null);   // cliente logado (com condições, dias…)
  const [visitante, setVisitante] = useState(null); // { nome, documento, telefone }
  const [booting, setBooting] = useState(true);

  const [cfg, setCfg] = useState(null);
  const [produtos, setProdutos] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [ultimoPedido, setUltimoPedido] = useState([]);

  const [cart, setCart] = useState({});
  const [filtro, setFiltro] = useState('todos');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState('');

  const [hdr, setHdr] = useState({ tabelaPrecoId: '', dia: '', obs: '', telefone: '' });

  const logado = cliente || visitante;
  const siteLogo = cfg?.logoUrl ? imgUrl(cfg.logoUrl) : LOGO;
  const whatsapp = cfg?.loja?.whatsapp || '5547988548476';

  // boot: restaura sessão
  useEffect(() => {
    publicApi.config().then(setCfg).catch(() => {});
    const t = getToken();
    const restore = t ? publicApi.perfil().then(setCliente).catch(() => setToken(null)) : Promise.resolve();
    restore.finally(() => setBooting(false));
  }, []);

  // carrega catálogo + grupos ao entrar
  useEffect(() => {
    if (!logado) return;
    publicApi.grupos().then(setGrupos).catch(() => {});
    if (cliente) {
      publicApi.meuCatalogo().then(({ catalogo, ultimoPedido }) => {
        setProdutos(catalogo); setUltimoPedido(ultimoPedido || []);
      }).catch(() => publicApi.catalogo().then(setProdutos).catch(() => {}));
    } else {
      publicApi.catalogo().then(setProdutos).catch(() => {});
    }
  }, [logado, cliente]);

  // pré-seleciona dia de entrega e telefone do perfil
  useEffect(() => {
    if (!cliente) return;
    setHdr(h => ({
      ...h,
      dia: h.dia || (cliente.diasEntrega || [])[0] || '',
      telefone: h.telefone || cliente.telefone || '',
    }));
  }, [cliente]);

  const qtyOf = (id) => cart[id] || 0;
  const addItem = (id) => setCart(c => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const removeItem = (id) => setCart(c => { const n = { ...c }; const v = (n[id] || 0) - 1; if (v <= 0) delete n[id]; else n[id] = v; return n; });
  const delItem = (id) => setCart(c => { const n = { ...c }; delete n[id]; return n; });

  // O site usa SÓ a condição padrão do cliente. O preço de cada produto já vem
  // pronto do servidor (igual ao que o vendedor vê: condição + último preço + flex).
  const condPadrao = cliente?.condicaoPadrao || null;
  const minimo = condPadrao?.valorMinimo || 0;
  const precoDe = (p) => Number(p.preco || 0);

  const totals = useMemo(() => {
    let boxes = 0, subtotal = 0;
    Object.keys(cart).forEach(id => { const p = produtos.find(x => x.id === id); if (p) { boxes += cart[id]; subtotal += cart[id] * Number(p.preco || 0); } });
    return { boxes, subtotal };
  }, [cart, produtos]);

  const below = minimo > 0 && totals.subtotal < minimo;

  const repetirUltimo = () => {
    const novo = {};
    ultimoPedido.forEach(it => { if (produtos.some(p => p.id === it.congeladosProdutoId)) novo[it.congeladosProdutoId] = it.quantidade; });
    setCart(novo);
    setOpen(true);
  };

  // filtros + busca
  const matched = useMemo(() => {
    const t = q.trim().toLowerCase();
    return produtos.filter(p => {
      if (filtro === 'recompra') { if (!p.comprado) return false; }
      else if (filtro !== 'todos' && p.grupo !== filtro) return false;
      if (t && !(p.nome.toLowerCase().includes(t) || String(p.codigo).toLowerCase().includes(t))) return false;
      return true;
    });
  }, [produtos, filtro, q]);

  const comprados = useMemo(() => matched.filter(p => p.comprado), [matched]);
  const outros = useMemo(() => matched.filter(p => !p.comprado), [matched]);

  const logout = () => { setToken(null); setCliente(null); setVisitante(null); setCart({}); setProdutos([]); };

  async function finalizar() {
    setErroEnvio(''); setEnviando(true);
    const itens = Object.keys(cart).map(id => ({ congeladosProdutoId: id, quantidade: cart[id] }));
    const payload = {
      itens,
      diaEntrega: hdr.dia || null,
      observacoes: hdr.obs || null,
      telefone: soDigitos(hdr.telefone) || (visitante?.telefone || ''),
    };
    if (visitante) payload.visitante = visitante;
    try {
      const pedido = await publicApi.criarPedido(payload);
      enviarWhatsApp(pedido);
      setConfirm(pedido);
      setCart({}); setOpen(false);
    } catch (e) {
      setErroEnvio(e?.response?.data?.error || e.message || 'Não foi possível enviar o pedido.');
    } finally { setEnviando(false); }
  }

  function enviarWhatsApp(pedido) {
    const nome = cliente?.nome || visitante?.nome || '';
    let msg = `*Pedido de Congelados — Hardt*%0A`;
    msg += `Cliente: ${encodeURIComponent(nome)}%0A`;
    if (condPadrao) msg += `Pagamento: ${encodeURIComponent(condPadrao.nome)}%0A`;
    if (hdr.dia) msg += `Entrega: ${encodeURIComponent(hdr.dia)}%0A`;
    msg += `%0A`;
    Object.keys(cart).forEach(id => { const p = produtos.find(x => x.id === id); if (p) msg += `• ${cart[id]}x ${encodeURIComponent(p.nome)} — ${money(precoDe(p) * cart[id])}%0A`; });
    msg += `%0A*Total: ${money(totals.subtotal)}*`;
    if (hdr.obs) msg += `%0A%0AObs: ${encodeURIComponent(hdr.obs)}`;
    window.open(`https://wa.me/${whatsapp}?text=${msg}`, '_blank');
  }

  if (booting) return <div className="cg tex-board" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon n="cart" w={28} /></div>;

  if (!logado) {
    return <div className="cg tex-board"><Login logo={siteLogo} whatsapp={whatsapp} titulo={cfg?.congelados?.loginTitulo} sub={cfg?.congelados?.loginSub} onLogin={setCliente} onVisitante={setVisitante} /></div>;
  }

  // tela de confirmação
  if (confirm) {
    return (
      <div className="cg tex-board">
        <div className="cg-login"><div className="cg-login-card"><div className="sawtooth"></div>
          <div className="cg-login-in">
            <img className="logo" src={siteLogo} alt="Hardt" />
            <h1>Pedido enviado!</h1>
            <p className="sub">Recebemos seu pedido <b style={{ color: 'var(--chalk)' }}>#{confirm.numero}</b>. Nossa equipe vai confirmar e combinar o pagamento conforme a condição escolhida.</p>
            <button className="btn btn-yellow btn-block" onClick={() => setConfirm(null)} style={{ marginTop: 8 }}>Fazer outro pedido</button>
            <p className="cg-login-note"><Link to="/inicio" style={{ color: 'var(--chalk-dim)' }}>← voltar ao site</Link></p>
          </div>
        </div></div>
      </div>
    );
  }

  const nomeCurto = (cliente?.nome || visitante?.nome || 'Cliente').split(' ').slice(0, 2).join(' ');
  const gruposFiltro = [{ id: 'todos', nome: 'Todos' }, ...(cliente ? [{ id: 'recompra', nome: 'Recomprar' }] : []), ...grupos];

  return (
    <div className="cg tex-board">
      {/* TOPBAR */}
      <header className="cg-top">
        <div className="wrap cg-top-in">
          <div className="cg-brand">
            <img src={siteLogo} alt="Hardt" />
            <div className="who">
              <b>{nomeCurto}</b>
              <small>{cliente ? 'seus preços já aplicados' : 'pedido sem cadastro'}</small>
            </div>
          </div>
          <div className="cg-top-actions">
            <Link to="/inicio" className="cg-exit">← Início</Link>
            <span className="cg-exit" onClick={logout}>Sair</span>
            <button className="btn btn-yellow btn-sm cg-cart-btn" onClick={() => setOpen(true)}>
              <Icon n="cart" w={17} /> Pedido
              {totals.boxes > 0 && <span className="badge">{totals.boxes}</span>}
            </button>
          </div>
        </div>
      </header>

      {/* TOOLBAR */}
      <div className="cg-tools">
        <div className="wrap">
          <div className="cg-search">
            <Icon n="search" w={18} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar salgado..." />
          </div>
          <div className="cg-filters">
            {gruposFiltro.map(g => (
              <button key={g.id} className={'cg-chip' + (filtro === g.id ? ' on' : '')} onClick={() => setFiltro(g.id)}>{g.nome}</button>
            ))}
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <main className="wrap" style={{ paddingBottom: 120 }}>
        {ultimoPedido.length > 0 && (
          <div className="cg-repeat">
            <span className="rt">Quer repetir? <b>Seu último pedido</b> tem {ultimoPedido.length} {ultimoPedido.length === 1 ? 'item' : 'itens'}.</span>
            <button className="btn btn-green btn-sm" onClick={repetirUltimo}><Icon n="refresh" w={15} /> Repetir último pedido</button>
          </div>
        )}

        {matched.length === 0 && <div className="cg-empty">Nenhum salgado encontrado{q ? ` para “${q}”` : ''}.</div>}

        {comprados.length > 0 && (
          <>
            <div className="cg-band-head"><span className="kx">Você sempre pede</span></div>
            <div className="cg-grid">
              {comprados.map(p => <Card key={p.id} p={p} preco={precoDe(p)} qty={qtyOf(p.id)} add={addItem} dec={removeItem} />)}
            </div>
          </>
        )}

        {outros.length > 0 && (
          <>
            {comprados.length > 0 && <div className="cg-band-head"><h2>Mais salgados</h2></div>}
            <div className="cg-grid" style={{ marginTop: comprados.length > 0 ? 0 : 16 }}>
              {outros.map(p => <Card key={p.id} p={p} preco={precoDe(p)} qty={qtyOf(p.id)} add={addItem} dec={removeItem} />)}
            </div>
          </>
        )}
      </main>

      {/* mobile fab */}
      <div className={'cg-fab' + (totals.boxes > 0 && !open ? ' show' : '')}>
        <button className="btn btn-yellow btn-block" onClick={() => setOpen(true)}>
          Ver pedido · {totals.boxes} cx · {money(totals.subtotal)}
        </button>
      </div>

      {/* DRAWER */}
      <div className={'cg-overlay' + (open ? ' open' : '')} onClick={() => setOpen(false)}></div>
      <aside className={'cg-drawer' + (open ? ' open' : '')}>
        <div className="cg-dhead">
          <Icon n="cart" w={20} />
          <h3>Seu pedido</h3>
          <button className="x" onClick={() => setOpen(false)}><Icon n="chevRight" w={18} /></button>
        </div>

        <div className="cg-dbody thin-scroll">
          {totals.boxes === 0 ? (
            <div className="cg-cart-empty">
              <div className="ic"><Icon n="cart" w={26} /></div>
              <p>Seu carrinho está vazio.<br />Escolha os produtos pra montar o pedido.</p>
            </div>
          ) : (
            <>
              {Object.keys(cart).map(id => {
                const p = produtos.find(x => x.id === id); if (!p) return null;
                return (
                  <div className="cg-citem" key={id}>
                    <div>
                      <div className="cn">{p.nome}</div>
                      <div className="cp">{cart[id]} cx × {money(precoDe(p))}</div>
                    </div>
                    <div className="ct">{money(precoDe(p) * cart[id])}</div>
                    <div className="cfoot">
                      <div className="cg-ministep">
                        <button onClick={() => removeItem(id)}><Icon n="minus" w={13} /></button>
                        <span className="q">{cart[id]}</span>
                        <button onClick={() => addItem(id)}><Icon n="plus" w={13} /></button>
                      </div>
                      <button className="cg-rm" onClick={() => delItem(id)}><Icon n="trash" w={13} /> Remover</button>
                    </div>
                  </div>
                );
              })}

              <div className="cg-dco">
                {condPadrao && (
                  <>
                    <h4>Condição de pagamento</h4>
                    <div className="cg-select" style={{ opacity: .9 }}>{condPadrao.nome}</div>
                  </>
                )}

                {cliente && (cliente.diasEntrega || []).length > 0 && (
                  <>
                    <h4>Dia de entrega</h4>
                    <div className="cg-dayrow">
                      {(cliente.diasEntrega || []).map(d => (
                        <button key={d} className={'cg-day' + (hdr.dia === d ? ' on' : '')} onClick={() => setHdr({ ...hdr, dia: d })}>{d}</button>
                      ))}
                    </div>
                  </>
                )}

                <h4>Telefone (WhatsApp)</h4>
                <input className="cg-select" value={hdr.telefone} onChange={e => setHdr({ ...hdr, telefone: e.target.value })} placeholder="(47) 9 9999-9999" />

                <h4>Observações <span style={{ color: 'var(--chalk-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></h4>
                <textarea className="cg-textarea" placeholder="Horário, doca, alguma observação..." value={hdr.obs} onChange={e => setHdr({ ...hdr, obs: e.target.value })} />
              </div>
            </>
          )}
        </div>

        {totals.boxes > 0 && (
          <div className="cg-dfoot">
            <div className="cg-totrow"><span>Subtotal ({totals.boxes} cx)</span><b>{money(totals.subtotal)}</b></div>
            <div className="cg-totrow grand"><span>Total</span><b>{money(totals.subtotal)}</b></div>
            {below && <p className="cg-minwarn"><Icon n="tag" w={13} /> Pedido mínimo de {money(minimo)} para esta condição — faltam {money(minimo - totals.subtotal)}.</p>}
            {erroEnvio && <p className="cg-minwarn"><Icon n="tag" w={13} /> {erroEnvio}</p>}
            <button className="btn btn-wa btn-block cg-cta" disabled={below || enviando} onClick={finalizar}>
              <Icon n="check" w={18} /> {enviando ? 'Enviando…' : 'Enviar pedido'}
            </button>
            <p className="cg-login-note" style={{ marginTop: 10 }}>Pagamento combinado depois, conforme sua condição — nada é cobrado online.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

/* ============== CARD ============== */
function Card({ p, preco, qty, add, dec }) {
  const img = imgUrl(p.imagem);
  return (
    <article className="cg-card">
      <div className="ph">
        {(p.comprado) && <div className="tagrow"><span className="tg bought">Você compra</span></div>}
        {img ? <img src={img} alt={p.nome} loading="lazy" /> : <div className="noimg">{p.nome}</div>}
      </div>
      <div className="cg-card-body">
        <h3>{p.nome}</h3>
        <span className="cx">caixa{p.unidades ? ` · ${p.unidades} un` : ''}{p.unidade ? ` · ${p.unidade}` : ''}</span>
        <div className="cg-card-foot">
          <div className="price"><b>{money(preco != null ? preco : p.preco)}</b></div>
          {qty === 0 ? (
            <button className="cg-add" onClick={() => add(p.id)} aria-label="Adicionar"><Icon n="plus" w={20} /></button>
          ) : (
            <div className="cg-step">
              <button onClick={() => dec(p.id)}><Icon n="minus" w={15} /></button>
              <span className="q">{qty}</span>
              <button onClick={() => add(p.id)}><Icon n="plus" w={15} /></button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
