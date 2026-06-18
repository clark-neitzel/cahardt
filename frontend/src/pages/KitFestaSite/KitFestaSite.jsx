import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, User, Home, Plus, Minus, X, Ticket, ArrowRight, MessageCircle, ChevronLeft, ChevronRight, Clock, Calendar, Truck, ShoppingBag, Edit3, Sparkles, Check, Loader2, MapPin } from 'lucide-react';
import publicApi, { getToken, setToken } from './api';
import Login from './Login';
import './kitfesta.css';
import { API_URL } from '../../services/api';

const LOGO = '/kitfesta/logo.png';
const BOX = '/kitfesta/box.gif';
const money = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
const imgUrl = (u) => !u ? null : (u.startsWith('http') ? u : `${API_URL}${u}`);

export default function KitFestaSite() {
  const [cliente, setCliente] = useState(null);
  const [visitante, setVisitante] = useState(null);
  const [booting, setBooting] = useState(true);

  // dados do site
  const [cfg, setCfg] = useState(null);
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [avaliacoes, setAvaliacoes] = useState([]);

  const [screen, setScreen] = useState('shop'); // shop | checkout
  const [cart, setCart] = useState({});
  const [coupon, setCoupon] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [loginModal, setLoginModal] = useState(false);

  // Boot: carrega dados do site sempre (sem login) + restaura sessão em paralelo
  useEffect(() => {
    const t = getToken();
    const restore = t ? publicApi.perfil().then(setCliente).catch(() => setToken(null)) : Promise.resolve();
    Promise.all([
      publicApi.config().then(setCfg).catch(() => {}),
      publicApi.catalogo().then(setProdutos).catch(() => {}),
      publicApi.categorias().then(setCategorias).catch(() => {}),
      publicApi.avaliacoes().then(setAvaliacoes).catch(() => {}),
      restore,
    ]).finally(() => setBooting(false));
  }, []);

  const siteLogo = (cfg && cfg.logoUrl) ? imgUrl(cfg.logoUrl) : LOGO;
  const logado = cliente || visitante;

  const qtyOf = (id) => cart[id] || 0;
  const addItem = (id) => {
    if (!logado) { setLoginModal(true); return; }
    setCart(c => ({ ...c, [id]: (c[id] || 0) + 1 }));
  };
  const removeItem = (id) => setCart(c => { const n = { ...c }; const v = (n[id] || 0) - 1; if (v <= 0) delete n[id]; else n[id] = v; return n; });

  const minCaixas = (cfg?.regras?.minCaixas) || 4;

  const totals = useMemo(() => {
    let boxes = 0, subtotal = 0;
    Object.keys(cart).forEach(id => { const p = produtos.find(x => x.id === id); if (p) { boxes += cart[id]; subtotal += cart[id] * p.preco; } });
    let discount = 0;
    if (coupon) discount = coupon.tipo === 'pct' ? subtotal * coupon.valor / 100 : Math.min(coupon.valor, subtotal);
    return { boxes, subtotal, discount, total: Math.max(0, subtotal - discount) };
  }, [cart, coupon, produtos]);

  const logout = () => { setToken(null); setCliente(null); setVisitante(null); setCart({}); setCoupon(null); };

  if (booting || !cfg) return <div className="kf"><div className="login tex-board"><Loader2 className="animate-spin" color="#fff" /></div></div>;

  const goCatalog = () => { document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  return (
    <div className="kf">
      {screen === 'shop' && (
        <>
          <Header cfg={cfg} logo={siteLogo} cartCount={totals.boxes} onCart={() => setCartOpen(true)} onLogout={logout}
            nome={cliente?.nome || visitante?.nome} onAbrirLogin={() => setLoginModal(true)} />
          <Hero cfg={cfg} onCatalog={goCatalog} />
          <HowItWorks cfg={cfg} />
          {produtos.some(p => p.destaque) && (
            <Section titulo="Mais pedidos" sub="Os campeões de venda das nossas festas">
              <ProdGrid produtos={produtos.filter(p => p.destaque)} qtyOf={qtyOf} onAdd={addItem} onRemove={removeItem} />
            </Section>
          )}
          <Catalog produtos={produtos} categorias={categorias} qtyOf={qtyOf} onAdd={addItem} onRemove={removeItem} />
          {avaliacoes.length > 0 && (
            <Section board titulo="O que dizem nossos clientes" sub="Quem fez festa com a gente conta como foi">
              <div className="rev-grid">
                {avaliacoes.map(a => (
                  <div className="rev" key={a.id}>
                    <div style={{ color: 'var(--yellow)', fontSize: '.95rem' }}>{'★'.repeat(a.estrelas)}{'☆'.repeat(5 - a.estrelas)}</div>
                    <p className="q">"{a.texto}"</p>
                    <div className="who">
                      <div className="av">{(a.nome || '?')[0]}</div>
                      <div><b>{a.nome}</b><span>{[a.evento, a.dataLabel].filter(Boolean).join(' · ')}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}
          {cfg.indicacao?.ativo && cliente?.codigoIndicacao && (
            <Referral code={cliente.codigoIndicacao} credito={cfg.indicacao?.credito} />
          )}
          <Footer cfg={cfg} logo={siteLogo} />

          {totals.boxes > 0 && (
            <button className="btn btn-yellow fab-cart" onClick={() => setCartOpen(true)}>
              <ShoppingCart size={18} /> {totals.boxes} caixa(s) · {money(totals.total)}
            </button>
          )}
        </>
      )}

      {screen === 'checkout' && (
        <CheckoutScreen cfg={cfg} cart={cart} produtos={produtos} totals={totals} coupon={coupon}
          telefoneAtual={cliente?.telefone || visitante?.telefone || ''}
          enderecoCadastro={cliente?.endereco}
          onBack={() => setScreen('shop')}
          onFinish={(info) => setConfirm(info)} />
      )}

      {cartOpen && (
        <CartDrawer cart={cart} produtos={produtos} totals={totals} coupon={coupon} setCoupon={setCoupon} minCaixas={minCaixas}
          onClose={() => setCartOpen(false)} onAdd={addItem} onRemove={removeItem}
          onCheckout={() => {
            if (!logado) { setCartOpen(false); setLoginModal(true); return; }
            setCartOpen(false); setScreen('checkout'); document.querySelector('.kf')?.scrollTo({ top: 0 });
          }} />
      )}

      {confirm && (
        <ConfirmModal info={confirm} cfg={cfg} totals={totals} cart={cart} produtos={produtos} coupon={coupon}
          cliente={cliente} visitante={visitante}
          onClose={() => { setConfirm(null); setCart({}); setCoupon(null); setScreen('shop'); }} />
      )}

      {loginModal && !logado && (
        <div className="kf-login-ov" onClick={(e) => e.target === e.currentTarget && setLoginModal(false)}>
          <Login logo={siteLogo}
            onLogin={(c) => { setCliente(c); setLoginModal(false); }}
            onVisitante={(v) => { setVisitante(v); setLoginModal(false); }} />
        </div>
      )}
    </div>
  );
}

/* ---------- Header ---------- */
function Header({ cfg, logo, cartCount, onCart, onLogout, nome, onAbrirLogin }) {
  return (
    <header className="hd tex-board">
      <div className="sawtooth" />
      <div className="wrap hd-bar">
        <div className="hd-logo" onClick={() => document.querySelector('.kf')?.scrollTo({ top: 0, behavior: 'smooth' })}>
          <img src={logo || LOGO} alt="Hardt" />
          <div className="who">
            <span className="who-label">Hardt Kit Festa</span>
            {nome && <b className="who-nome">{nome}</b>}
          </div>
        </div>
        <div className="hd-spacer" />
        <Link to="/inicio" className="hd-pill" title="Página inicial">
          <Home size={17} /><span className="lbl">Início</span>
        </Link>
        <button className="hd-pill" onClick={nome ? onLogout : onAbrirLogin} title={nome ? 'Sair' : 'Entrar'}>
          {nome ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          ) : (
            <User size={16} />
          )}
          <span className="lbl">{nome ? 'Sair' : 'Entrar'}</span>
        </button>
        <button className="hd-pill hd-cart" onClick={onCart}>
          <ShoppingCart size={18} /><span className="lbl">Carrinho</span>
          {cartCount > 0 && <span className="badge">{cartCount}</span>}
        </button>
      </div>
    </header>
  );
}

/* ---------- Hero ---------- */
function Hero({ cfg, onCatalog }) {
  const h = cfg.hero || {};
  const titulo = h.titulo || '';
  const naIdx = titulo.toLowerCase().indexOf(' na ');
  const tituloA = naIdx >= 0 ? titulo.slice(0, naIdx) : titulo;
  const tituloB = naIdx >= 0 ? titulo.slice(naIdx + 1) : '';
  return (
    <section className="hero tex-board">
      <div className="wrap hero-grid">
        <div className="rise">
          <span className="kicker">{h.kicker} · {cfg.loja?.desde}</span>
          <h1>{tituloA}{tituloB && <span className="y">{tituloB}</span>}</h1>
          <p className="lead">{h.subtitulo}</p>
          <div className="hero-cta">
            <button className="btn btn-yellow" onClick={onCatalog}><ShoppingBag size={18} /> Montar meu pedido</button>
            <a className="btn btn-ghost" href={`https://wa.me/${cfg.loja?.whatsapp}`} target="_blank" rel="noreferrer"><MessageCircle size={18} /> WhatsApp</a>
          </div>
          <div className="hero-trust">
            <div className="t"><b>+18 anos</b><span>fazendo festa em Joinville</span></div>
            <div className="t"><b>25un</b><span>por caixa</span></div>
            <div className="t"><b>mín. {cfg.regras?.minCaixas || 4}</b><span>caixas por pedido</span></div>
          </div>
        </div>
        <div className="hero-figure rise">
          <div className="ph"><img src={BOX} alt="Caixa de salgados Hardt" /></div>
          <div className="hero-badge"><b>25</b><span>salgados / caixa</span></div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Como funciona (faixa verde) ---------- */
function HowItWorks({ cfg }) {
  const steps = cfg.comoFunciona || [];
  const icons = [User, ShoppingBag, Calendar, MessageCircle];
  return (
    <section className="tex-green how">
      <div className="wrap">
        <div className="how-grid">
          {steps.map((s, i) => {
            const Ic = icons[i] || Sparkles;
            return (
              <div className="how-step" key={i}>
                <div className="nm"><Ic size={20} /></div>
                <div><h4>{s.titulo}</h4><p>{s.desc}</p></div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------- Section wrapper ---------- */
function Section({ titulo, sub, children, board = false }) {
  return (
    <section className={`sec ${board ? 'tex-board' : 'tex-paper'}`}>
      <div className="wrap">
        <div className={`sec-head ${board ? 'on-board' : 'on-paper'}`}>
          <div><h2>{titulo}</h2>{sub && <p className="lead">{sub}</p>}</div>
        </div>
        {children}
      </div>
    </section>
  );
}

/* ---------- Catálogo com filtros ---------- */
function Catalog({ produtos, categorias, qtyOf, onAdd, onRemove }) {
  const [filtro, setFiltro] = useState('todos');
  const lista = filtro === 'todos' ? produtos : produtos.filter(p => p.categoria === filtro);
  return (
    <section className="sec tex-paper" id="catalogo">
      <div className="wrap">
        <div className="sec-head on-paper">
          <div><h2>Nosso cardápio</h2><p className="lead">Cada caixa = 1 sabor, 25 unidades. Combine os sabores à vontade!</p></div>
          <div className="filters">
            <button className={`chip${filtro === 'todos' ? ' active' : ''}`} onClick={() => setFiltro('todos')}>Todos</button>
            {categorias.map(c => (
              <button key={c.id} className={`chip${filtro === c.slug ? ' active' : ''}`} onClick={() => setFiltro(c.slug)}>{c.nome}</button>
            ))}
          </div>
        </div>
        <ProdGrid produtos={lista} qtyOf={qtyOf} onAdd={onAdd} onRemove={onRemove} />
      </div>
    </section>
  );
}

function ProdGrid({ produtos, qtyOf, onAdd, onRemove }) {
  return (
    <div className="grid-prod">
      {produtos.map(p => {
        const q = qtyOf(p.id);
        return (
          <div className="card" key={p.id}>
            <div className="card-ph tex-paper">
              {p.tags?.length > 0 && (
                <div className="tags">{p.tags.slice(0, 1).map(t => <span className="tag tag-yellow" key={t}>{t}</span>)}</div>
              )}
              {imgUrl(p.imagem) && <img src={imgUrl(p.imagem)} alt={p.nome} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div className="card-body">
              <h3>{p.nome}</h3>
              <p className="d">{p.descricao}</p>
              <div className="card-foot">
                <div className="price"><b>{money(p.preco)}</b><span>{p.unidades} unidades</span></div>
                {q === 0 ? (
                  <button className="add-btn" onClick={() => onAdd(p.id)} aria-label="Adicionar"><Plus size={18} /></button>
                ) : (
                  <div className="stepper">
                    <button onClick={() => onRemove(p.id)}><Minus size={15} /></button>
                    <span className="q">{q}</span>
                    <button onClick={() => onAdd(p.id)}><Plus size={15} /></button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {produtos.length === 0 && <p style={{ color: '#8a7d63', gridColumn: '1/-1', textAlign: 'center' }}>Nenhum produto nesta categoria.</p>}
    </div>
  );
}

/* ---------- Carrinho ---------- */
function CartDrawer({ cart, produtos, onClose, onAdd, onRemove, coupon, setCoupon, totals, onCheckout, minCaixas }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const ids = Object.keys(cart).filter(id => cart[id] > 0);
  const boxes = totals.boxes;
  const prodById = (id) => produtos.find(p => p.id === id);

  const apply = async () => {
    try {
      const c = await publicApi.validarCupom(code.trim().toUpperCase(), boxes);
      setErr(''); setCoupon(c);
    } catch (e) { setErr(e.response?.data?.error || 'Cupom inválido.'); }
  };

  return (
    <>
      <div className="ovl" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-head">
          <h3><ShoppingCart size={20} /> Seu pedido</h3>
          <button className="x" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="drawer-body">
          {ids.length === 0 ? (
            <div className="cart-empty">
              <ShoppingBag size={48} /><p>Seu carrinho está vazio.<br />Escolha seus sabores favoritos!</p>
            </div>
          ) : (
            <>
              {ids.map(id => { const p = prodById(id); if (!p) return null; return (
                <div className="ci" key={id}>
                  <div className="thumb tex-paper" style={{ overflow: 'hidden' }}>
                    {imgUrl(p.imagem) && <img src={imgUrl(p.imagem)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <div className="info"><h4>{p.nome}</h4><span>{money(p.preco)} · {p.unidades}un</span></div>
                  <div className="right">
                    <div className="stepper">
                      <button onClick={() => onRemove(id)}><Minus size={15} /></button>
                      <span className="q">{cart[id]}</span>
                      <button onClick={() => onAdd(id)}><Plus size={15} /></button>
                    </div>
                  </div>
                </div>
              ); })}

              {boxes < minCaixas && (
                <div className="minwarn"><Sparkles size={18} />
                  <span>Faltam <b>{minCaixas - boxes} caixa(s)</b> para o mínimo de {minCaixas}.</span></div>
              )}

              {coupon ? (
                <div className="coupon-ok"><span><Ticket size={15} /> {coupon.label || coupon.codigo}</span>
                  <button onClick={() => { setCoupon(null); setCode(''); }}>remover</button></div>
              ) : (
                <>
                  <div className="coupon">
                    <div className="ip"><Ticket size={16} color="#9a8c70" />
                      <input placeholder="cupom de desconto" value={code} onChange={e => { setCode(e.target.value); setErr(''); }} /></div>
                    <button className="btn btn-outline-ink btn-sm" onClick={apply}>Aplicar</button>
                  </div>
                  {err && <div className="coupon-err">{err}</div>}
                </>
              )}
            </>
          )}
        </div>
        {ids.length > 0 && (
          <div className="drawer-foot">
            <div className="tot">
              <div className="row"><span>{boxes} caixa(s)</span><span>{money(totals.subtotal)}</span></div>
              {totals.discount > 0 && <div className="row disc"><span>Desconto</span><span>– {money(totals.discount)}</span></div>}
              <div className="grand"><span>Total</span><b>{money(totals.total)}</b></div>
            </div>
            <button className="btn btn-green btn-block" style={{ marginTop: 12 }} disabled={boxes < minCaixas} onClick={onCheckout}>
              {boxes < minCaixas ? `Mínimo ${minCaixas} caixas` : <>Escolher data e hora <ArrowRight size={17} /></>}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

/* ---------- Calendário ---------- */
const MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function CalendarPicker({ selected, onSelect }) {
  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [avail, setAvail] = useState({});

  useEffect(() => {
    const ini = `${view.y}-${String(view.m + 1).padStart(2, '0')}-01`;
    const fim = `${view.y}-${String(view.m + 1).padStart(2, '0')}-${new Date(view.y, view.m + 1, 0).getDate()}`;
    publicApi.agenda(ini, fim).then(setAvail).catch(() => setAvail({}));
  }, [view.y, view.m]);

  const firstDow = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const maxDate = new Date(today); maxDate.setDate(today.getDate() + 60);
  const canPrev = (view.y > today.getFullYear()) || (view.y === today.getFullYear() && view.m > today.getMonth());
  const canNext = new Date(view.y, view.m, 1) < new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  const go = (d) => setView(v => { const nm = new Date(v.y, v.m + d, 1); return { y: nm.getFullYear(), m: nm.getMonth() }; });

  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) {
    const key = `${view.y}-${String(view.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    let status = avail[key] || 'open';
    if (key < todayKey) status = 'closed';
    cells.push({ d, key, status });
  }

  return (
    <div className="cal">
      <div className="cal-nav">
        <button onClick={() => go(-1)} disabled={!canPrev}><ChevronLeft size={18} /></button>
        <b>{MES[view.m]} {view.y}</b>
        <button onClick={() => go(1)} disabled={!canNext}><ChevronRight size={18} /></button>
      </div>
      <div className="cal-dow">{DOW.map(d => <span key={d}>{d}</span>)}</div>
      <div className="cal-grid">
        {cells.map((c, i) => {
          if (!c) return <div className="cal-cell empty" key={i} />;
          const open = c.status === 'open' || c.status === 'few';
          const sel = selected === c.key;
          return (
            <div key={i} className={`cal-cell ${c.status}${sel ? ' sel' : ''}`} onClick={() => open && onSelect(c.key)}>
              {c.d}{open && !sel && <span className="dot" />}
            </div>
          );
        })}
      </div>
      <div className="cal-legend">
        <span><i style={{ background: '#fff', border: '1.5px solid rgba(18,130,64,.4)' }} />Disponível</span>
        <span><i style={{ background: 'var(--yellow)' }} />Últimas vagas</span>
        <span><i style={{ background: '#e3dac8' }} />Esgotado</span>
      </div>
    </div>
  );
}

/* ---------- Checkout ---------- */
function CheckoutScreen({ cfg, cart, produtos, totals, coupon, telefoneAtual, enderecoCadastro, onBack, onFinish }) {
  const [modo, setModo] = useState('retirada');
  const [date, setDate] = useState(null);
  const [slot, setSlot] = useState(null);
  const [slots, setSlots] = useState([]);
  const [obs, setObs] = useState('');
  const [bairros, setBairros] = useState([]);
  const [bairroId, setBairroId] = useState('');
  const maskTel = (v) => v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2').replace(/(\d{4})(\d)/, '$1-$2');
  const maskCep = (v) => v.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
  const [telefone, setTelefone] = useState(telefoneAtual ? maskTel(telefoneAtual) : '');
  const telOk = telefone.replace(/\D/g, '').length >= 10;
  // Endereço de entrega
  const temEndCadastro = !!enderecoCadastro?.completo;
  const [usarOutro, setUsarOutro] = useState(false);
  const [cep, setCep] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [cepMsg, setCepMsg] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const precisaNovoEnd = modo === 'entrega' && (!temEndCadastro || usarOutro);
  const ids = Object.keys(cart).filter(id => cart[id] > 0);
  const prodById = (id) => produtos.find(p => p.id === id);
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

  useEffect(() => { if (modo === 'entrega') publicApi.bairros().then(setBairros).catch(() => {}); }, [modo]);
  useEffect(() => {
    if (!date) { setSlots([]); return; }
    publicApi.slots(date, modo).then(setSlots).catch(() => setSlots([]));
    setSlot(null);
  }, [date, modo]);
  // Ao usar o endereço do cadastro, tenta casar o bairro com a lista (define a taxa)
  useEffect(() => {
    if (modo === 'entrega' && temEndCadastro && !usarOutro && enderecoCadastro?.bairro && bairros.length) {
      const m = bairros.find(b => norm(b.nome) === norm(enderecoCadastro.bairro));
      setBairroId(m ? m.id : '');
    }
  }, [modo, usarOutro, bairros, temEndCadastro]);

  const buscarCep = async () => {
    const c = cep.replace(/\D/g, '');
    if (c.length !== 8) { setCepMsg('CEP inválido.'); return; }
    setCepLoading(true); setCepMsg('');
    try {
      const r = await fetch(`https://viacep.com.br/ws/${c}/json/`).then(x => x.json());
      if (r.erro) { setCepMsg('CEP não encontrado.'); return; }
      if (r.logradouro) setLogradouro(r.logradouro);
      const m = bairros.find(b => norm(b.nome) === norm(r.bairro));
      if (m) { setBairroId(m.id); setCepMsg(''); }
      else { setBairroId(''); setCepMsg(`Bairro "${r.bairro || '—'}" ainda não está na lista de entrega — selecione abaixo se atendermos.`); }
    } catch { setCepMsg('Erro ao buscar o CEP.'); }
    finally { setCepLoading(false); }
  };

  const dateLabel = date ? date.split('-').reverse().join('/') : null;
  const bairro = bairros.find(b => b.id === bairroId);
  const taxa = modo === 'entrega' ? Number(bairro?.taxa || 0) : 0;
  const totalFinal = totals.total + taxa;
  // Endereço final (texto) e validação
  const enderecoFinal = modo !== 'entrega' ? ''
    : precisaNovoEnd
      ? `${logradouro}, nº ${numero}${complemento ? `, ${complemento}` : ''}${cep ? ` — CEP ${cep}` : ''}`
      : (enderecoCadastro?.completo || '');
  const enderecoOk = modo !== 'entrega' || (!!bairroId && (precisaNovoEnd ? (logradouro.trim() && numero.trim()) : !!enderecoCadastro?.completo));
  // Etapas progressivas: cada bloco só aparece quando o anterior está completo
  const modoOk = modo === 'retirada' || enderecoOk;
  const ready = date && slot && telOk && modoOk;

  return (
    <div className="tex-paper" style={{ minHeight: '100vh' }}>
      <div className="co-top tex-board">
        <div className="sawtooth" />
        <div className="wrap"><button className="co-back" onClick={onBack}><ChevronLeft size={18} /> Voltar ao cardápio</button></div>
      </div>
      <div className="wrap co-grid">
        <div>
          <div className="co-block">
            <h3><Truck size={20} /> Como você quer receber?</h3>
            <div className="seg">
              <button className={modo === 'retirada' ? 'on' : ''} onClick={() => { setModo('retirada'); setSlot(null); }}>
                <span className="ic"><ShoppingBag size={20} /></span>
                <span><b>Retirar na loja</b><span>sem taxa</span></span>
              </button>
              <button className={modo === 'entrega' ? 'on' : ''} onClick={() => { setModo('entrega'); setSlot(null); }}>
                <span className="ic"><Truck size={20} /></span>
                <span><b>Entrega</b><span>taxa por bairro</span></span>
              </button>
            </div>
            {modo === 'entrega' && (
              <div style={{ marginTop: 14 }}>
                <p className="sub" style={{ marginTop: 0 }}>{cfg.freteTexto}</p>

                {/* Endereço do cadastro (se houver) */}
                {temEndCadastro && (
                  <div className="sum-meta" style={{ marginBottom: 10 }}>
                    <div className="r"><MapPin size={15} /> {enderecoCadastro.completo}</div>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 6, cursor: 'pointer' }}>
                      <input type="radio" checked={!usarOutro} onChange={() => setUsarOutro(false)} /> Entregar neste endereço
                    </label>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                      <input type="radio" checked={usarOutro} onChange={() => setUsarOutro(true)} /> Entregar em outro endereço
                    </label>
                  </div>
                )}

                {/* Novo endereço via CEP (visitante ou "outro endereço") */}
                {precisaNovoEnd && (
                  <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
                    {!temEndCadastro && <p style={{ fontSize: 12, color: '#8a7d63', margin: 0 }}>Informe o endereço de entrega:</p>}
                    <div className="coupon" style={{ margin: 0 }}>
                      <div className="ip" style={{ flex: 1, background: '#fff' }}>
                        <input inputMode="numeric" placeholder="CEP" value={cep}
                          onChange={e => setCep(maskCep(e.target.value))} onBlur={() => cep.replace(/\D/g, '').length === 8 && buscarCep()} />
                      </div>
                      <button className="btn btn-outline-ink btn-sm" onClick={buscarCep} disabled={cepLoading}>
                        {cepLoading ? '...' : 'Buscar'}
                      </button>
                    </div>
                    {cepMsg && <p style={{ fontSize: 11, color: '#b3261e', margin: 0 }}>{cepMsg}</p>}
                    <div className="ip" style={{ background: '#fff' }}>
                      <input placeholder="Rua / logradouro" value={logradouro} onChange={e => setLogradouro(e.target.value)} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 8 }}>
                      <div className="ip" style={{ background: '#fff' }}><input inputMode="numeric" placeholder="Número" value={numero} onChange={e => setNumero(e.target.value)} /></div>
                      <div className="ip" style={{ background: '#fff' }}><input placeholder="Complemento" value={complemento} onChange={e => setComplemento(e.target.value)} /></div>
                    </div>
                  </div>
                )}

                {/* Bairro — define a taxa (auto pelo CEP, editável) */}
                <label className="field" style={{ display: 'block', marginBottom: 4 }}>
                  <span style={{ fontFamily: 'var(--f-display)', textTransform: 'uppercase', letterSpacing: '.06em', fontSize: '.72rem', color: '#6a5f4c' }}>Bairro (define a taxa)</span>
                </label>
                <select className="bairro-sel" value={bairroId} onChange={e => setBairroId(e.target.value)}>
                  <option value="">Selecione o bairro…</option>
                  {bairros.map(b => <option key={b.id} value={b.id}>{b.nome} — {Number(b.taxa) > 0 ? money(b.taxa) : 'grátis'}</option>)}
                </select>
              </div>
            )}
            {modo === 'retirada' && (
              <div className="sum-meta" style={{ marginTop: 14 }}>
                <div className="r"><MapPin size={15} /> {cfg.loja?.endereco}</div>
                {cfg.loja?.mapsUrl && (
                  <a href={cfg.loja.mapsUrl} target="_blank" rel="noreferrer" className="r" style={{ color: 'var(--green-dd)', fontWeight: 600 }}>
                    <MapPin size={15} /> Ver no mapa / traçar rota
                  </a>
                )}
              </div>
            )}
          </div>

          {modoOk && (
            <div className="co-block">
              <h3><Calendar size={20} /> Escolha o dia</h3>
              <p className="sub">A cozinha libera as datas conforme a produção.</p>
              <CalendarPicker selected={date} onSelect={(k) => { setDate(k); setSlot(null); }} />
              {date && (
                <>
                  <h3 style={{ marginTop: 22, fontSize: 16 }}><Clock size={18} /> Horário ({modo})</h3>
                  {slots.length === 0 ? <p className="sub">Sem horários para esta data neste modo.</p> : (
                    <div className="slots" style={{ marginTop: 8 }}>
                      {slots.map(s => (
                        <button key={s.hora} className={'slot' + (slot === s.hora ? ' on' : '')} disabled={s.full} onClick={() => setSlot(s.hora)}>
                          {s.hora}{s.full && <small>esgotado</small>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {slot && (
            <div className="co-block">
              <h3><Edit3 size={19} /> Observações</h3>
              <p className="sub">Alguma preferência? Ex.: empadinha de palmito, ponto do salgado…</p>
              <textarea className="obs" placeholder="Escreva aqui (opcional)" value={obs} onChange={e => setObs(e.target.value)} />
            </div>
          )}
        </div>

        <div>
          <div className="co-block">
            <h3>Resumo do pedido</h3>
            {ids.map(id => { const p = prodById(id); if (!p) return null; return (
              <div className="sum-item" key={id}><span><b>{cart[id]}×</b> {p.nome}</span><span>{money(p.preco * cart[id])}</span></div>
            ); })}
            <div className="tot" style={{ marginTop: 10 }}>
              <div className="row"><span>{totals.boxes} caixas</span><span>{money(totals.subtotal)}</span></div>
              {totals.discount > 0 && <div className="row disc"><span>Cupom {coupon?.codigo}</span><span>– {money(totals.discount)}</span></div>}
              {taxa > 0 && <div className="row"><span>Taxa entrega</span><span>{money(taxa)}</span></div>}
              <div className="grand"><span>Total</span><b>{money(totalFinal)}</b></div>
            </div>
            <div className="sum-meta">
              <div className="r"><Truck size={15} /> {modo === 'retirada' ? 'Retirada na loja' : (bairro ? `Entrega · ${bairro.nome}` : 'Entrega')}</div>
              <div className="r"><Calendar size={15} /> {dateLabel || 'Selecione uma data'}</div>
              <div className="r"><Clock size={15} /> {slot || 'Selecione um horário'}</div>
            </div>

            {/* WhatsApp do cliente — só aparece na última etapa (após escolher horário) */}
            {slot && (
              <div style={{ marginTop: 14 }}>
                <label className="field" style={{ display: 'block', marginBottom: 4 }}>
                  <span style={{ fontFamily: 'var(--f-display)', textTransform: 'uppercase', letterSpacing: '.06em', fontSize: '.72rem', color: '#6a5f4c' }}>
                    <MessageCircle size={13} style={{ verticalAlign: '-2px' }} /> Seu WhatsApp {telefoneAtual ? '(confirme)' : ''}
                  </span>
                </label>
                <div className="ip" style={{ background: '#fff' }}>
                  <input inputMode="numeric" placeholder="(47) 99999-0000" value={telefone}
                    onChange={e => setTelefone(maskTel(e.target.value))} />
                </div>
                <p style={{ fontSize: 11, color: '#8a7d63', marginTop: 4 }}>Mandamos uma cópia do pedido nesse número.</p>
              </div>
            )}

            <button className="btn btn-wa btn-block" disabled={!ready} style={{ marginTop: 12 }}
              onClick={() => onFinish({ modo, date, dateLabel, slot, obs, bairroId, bairro, taxa, endereco: enderecoFinal, telefone })}>
              <MessageCircle size={19} /> {!modoOk ? (modo === 'entrega' ? 'Complete o endereço' : '') : !date ? 'Escolha o dia' : !slot ? 'Escolha o horário' : !telOk ? 'Confirme seu WhatsApp' : 'Finalizar pedido'}
            </button>
            <p style={{ fontSize: 12, color: '#8a7d63', textAlign: 'center', marginTop: 10 }}>
              O pagamento é combinado depois (pix ou na entrega).</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Confirmação + envio ---------- */
function ConfirmModal({ info, cfg, totals, cart, produtos, coupon, cliente, visitante, onClose }) {
  const [salvando, setSalvando] = useState(true);
  const [erro, setErro] = useState('');
  const [link, setLink] = useState('');
  const prodById = (id) => produtos.find(p => p.id === id);
  const ids = Object.keys(cart).filter(id => cart[id] > 0);

  useEffect(() => {
    const itens = ids.map(id => { const p = prodById(id); return { kitFestaProdutoId: id, quantidade: cart[id] }; });
    const visitanteFinal = visitante ? { ...visitante, telefone: info.telefone || visitante.telefone } : undefined;
    const payload = {
      itens, modo: info.modo, data: info.date, horario: info.slot,
      bairroId: info.bairroId || null, enderecoEntrega: info.endereco || null,
      cupomCodigo: coupon?.codigo || null, observacoes: info.obs || null,
      telefone: info.telefone || null,
      visitante: visitanteFinal,
    };
    publicApi.criarPedido(payload)
      .then(() => {
        // link opcional pra falar com a loja
        const linhas = ids.map(id => `• ${cart[id]}x ${prodById(id)?.nome}`).join('\n');
        const txt = encodeURIComponent(
          `*Pedido Hardt — Kit Festa*\n${linhas}\n\n` +
          `${info.modo === 'retirada' ? 'Retirada na loja' : `Entrega${info.bairro ? ` · ${info.bairro.nome}` : ''}`}\n` +
          `Data: ${info.dateLabel} às ${info.slot}` +
          (info.endereco ? `\nEndereço: ${info.endereco}` : '') +
          (coupon ? `\nCupom: ${coupon.codigo}` : '') +
          (info.obs ? `\nObs: ${info.obs}` : '') +
          `\n\nTotal: ${money(totals.total + (info.taxa || 0))}`
        );
        setLink(`https://wa.me/${cfg.loja?.whatsapp}?text=${txt}`);
      })
      .catch(e => setErro(e.response?.data?.error || 'Erro ao registrar o pedido.'))
      .finally(() => setSalvando(false));
  }, []);

  return (
    <div className="modal">
      <div className="ovl" onClick={onClose} />
      <div className="modal-card" style={{ position: 'relative', zIndex: 1 }}>
        <div className="modal-top">
          <div className="ok">{salvando ? <Loader2 size={34} className="animate-spin" /> : erro ? <X size={34} /> : <Check size={34} />}</div>
          <h3>{salvando ? 'Registrando…' : erro ? 'Ops!' : 'Pedido registrado!'}</h3>
          <p>{salvando ? 'Estamos salvando seu pedido' : erro ? erro : 'Toque abaixo para enviar pelo seu WhatsApp 📲'}</p>
        </div>
        <div className="modal-body">
          {!salvando && !erro && (
            <>
              <div className="sum-meta" style={{ marginTop: 0 }}>
                <div className="r"><Truck size={15} /> {info.modo === 'retirada' ? 'Retirada na loja' : `Entrega${info.bairro ? ` · ${info.bairro.nome}` : ''}`}</div>
                <div className="r"><Calendar size={15} /> {info.dateLabel} · {info.slot}</div>
                <div className="r"><ShoppingBag size={15} /> {totals.boxes} caixas · {money(totals.total + (info.taxa || 0))}</div>
              </div>
              <a className="btn btn-wa btn-block" href={link} target="_blank" rel="noreferrer" style={{ marginTop: 14 }}>
                <MessageCircle size={19} /> Enviar pedido pelo WhatsApp</a>
            </>
          )}
          <button className="btn btn-outline-ink btn-block" style={{ marginTop: 10 }} onClick={onClose}>
            {erro ? 'Voltar' : 'Concluir'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Indique e ganhe ---------- */
function Referral({ code, credito }) {
  const [copied, setCopied] = useState(false);
  const c = credito || 20;
  const copy = () => { try { navigator.clipboard.writeText(code); } catch (e) {} setCopied(true); setTimeout(() => setCopied(false), 1600); };
  return (
    <section className="sec tex-board">
      <div className="wrap">
        <div className="ref">
          <div>
            <span className="kicker" style={{ color: 'var(--green-dd)' }}>Indique &amp; ganhe</span>
            <h2>Indicou, os dois ganham</h2>
            <p>Compartilhe seu código. Seu amigo ganha <b>R${c} OFF</b> na primeira compra e você ganha <b>R${c} de crédito</b> quando ele fizer o pedido.</p>
            <div className="ref-code">
              <span className="code">{code}</span>
              <button className="btn btn-green btn-sm" onClick={copy}>
                {copied ? <><Check size={16} /> Copiado!</> : 'Copiar código'}
              </button>
            </div>
          </div>
          <div className="ref-steps">
            <div className="ref-step"><span className="n">1</span><div><b>Compartilhe</b><p>Mande seu código pra família, amigos ou no grupo da empresa.</p></div></div>
            <div className="ref-step"><span className="n">2</span><div><b>Seu amigo pede</b><p>Ele usa o código no carrinho e ganha desconto na hora.</p></div></div>
            <div className="ref-step"><span className="n">3</span><div><b>Vocês ganham</b><p>O crédito cai na sua conta pra usar no próximo kit.</p></div></div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Footer ---------- */
function Footer({ cfg, logo }) {
  const l = cfg.loja || {};
  return (
    <footer className="ft tex-board">
      <div className="wrap">
        <div className="ft-grid">
          <div>
            <div className="hd-logo" style={{ marginBottom: 12 }}>
              <img src={logo || LOGO} alt="Hardt" />
              <div><div className="nm">{l.nome?.split(' ')[0] || 'Hardt'}</div><div className="sb">Doces &amp; Salgados</div></div>
            </div>
            <p style={{ fontSize: '.9rem', lineHeight: 1.5, maxWidth: '34ch' }}>{l.slogan} · {l.desde}.</p>
          </div>
          <div>
            <h5>Onde estamos</h5>
            <div className="row"><MapPin size={16} />
              {l.mapsUrl
                ? <a href={l.mapsUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--chalk)', textDecoration: 'underline', textUnderlineOffset: 2 }}>{l.endereco}</a>
                : l.endereco}
            </div>
            {l.mapsUrl && <div className="row"><MapPin size={16} style={{ opacity: 0 }} /><a href={l.mapsUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--yellow)' }}>📍 Ver no mapa / traçar rota</a></div>}
          </div>
          <div>
            <h5>Fale com a gente</h5>
            <div className="row"><MessageCircle size={16} />
              <a href={`https://wa.me/${l.whatsapp}`} style={{ color: 'var(--chalk)' }} target="_blank" rel="noreferrer">{l.telefone}</a>
            </div>
          </div>
        </div>
        <div className="ft-bottom">
          <span>© {new Date().getFullYear()} {l.nome}. Todos os direitos reservados.</span>
          <span>Salgados de festa feitos à mão.</span>
        </div>
      </div>
    </footer>
  );
}
