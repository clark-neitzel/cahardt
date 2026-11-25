import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, LogIn, LogOut, Plus, Minus, X, Ticket, ArrowRight, MessageCircle, ChevronLeft, ChevronRight, Clock, Calendar, Truck, ShoppingBag, Edit3, Sparkles, Check, Loader2, MapPin } from 'lucide-react';
import publicApi, { getToken, setToken } from './api';
import Login from './Login';
import '../Site/siteBase.css';
import './kitfesta.css';
import SiteHeader from '../Site/SiteHeader';
import SiteFooter from '../Site/SiteFooter';
import { API_URL } from '../../services/api';
import { useVisitorPing } from '../../hooks/useVisitorPing';

const LOGO = '/kitfesta/logo.png';
const BOX = '/kitfesta/box.gif';
const money = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
const ehPacote = (p) => !!(p && (p.pacote === true || Number(p.unidades) === 1 || String(p.categoria || '').toLowerCase().includes('congelado')));
const rotuloUnidade = (p) => p?.unidadeLabel || (ehPacote(p) ? 'pacote 500 g' : `caixa de ${p?.unidades || 25}`);
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
  // Carrinho persistido no navegador — não some ao atualizar/fechar a página
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(localStorage.getItem('@KitFesta:cart') || '{}') || {}; } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem('@KitFesta:cart', JSON.stringify(cart)); } catch (e) {}
  }, [cart]);
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

  useVisitorPing('kit-festa', Object.keys(cart).length > 0);

  // Altura real do header (quebra em 2 linhas no celular) — a barra de progresso gruda logo abaixo dele
  useEffect(() => {
    const raiz = document.querySelector('.kf');
    const hdr = raiz?.querySelector('.hd-header');
    if (!raiz || !hdr) return undefined;
    const medir = () => raiz.style.setProperty('--kf-hdr', `${hdr.offsetHeight}px`);
    medir();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    if (ro) ro.observe(hdr);
    window.addEventListener('resize', medir);
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', medir); };
  }, [booting, cfg, screen]);

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
    let boxes = 0, pacotes = 0, subtotal = 0;
    Object.keys(cart).forEach(id => {
      const p = produtos.find(x => x.id === id);
      if (!p) return;
      const q = cart[id];
      subtotal += q * p.preco;
      if (ehPacote(p)) pacotes += q; else boxes += q;
    });
    let discount = 0;
    if (coupon) discount = coupon.tipo === 'pct' ? subtotal * coupon.valor / 100 : Math.min(coupon.valor, subtotal);
    return { boxes, pacotes, subtotal, discount, total: Math.max(0, subtotal - discount) };
  }, [cart, coupon, produtos]);

  const logout = () => { setToken(null); setCliente(null); setVisitante(null); setCart({}); setCoupon(null); };

  if (booting || !cfg) return <div className="hd kf"><div className="kf-boot"><Loader2 className="animate-spin" color="#0f7a3b" /></div></div>;

  const goCatalog = () => { document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const qtdItens = totals.boxes + totals.pacotes;
  const nomeKf = cliente?.nome || visitante?.nome;

  // Botão do Kit Festa (sessão própria, por CPF) — separado do "Minha área" de Congelados
  const acoesKf = (
    <button type="button" className="hd-pill kf-pill-conta" onClick={nomeKf ? logout : () => setLoginModal(true)}
      title={nomeKf ? `Sair do Kit Festa (${nomeKf})` : 'Entrar no Kit Festa (CPF)'}
      aria-label={nomeKf ? `Sair do Kit Festa (${nomeKf})` : 'Entrar no Kit Festa'}>
      {nomeKf ? <LogOut size={16} /> : <LogIn size={16} />}
      {nomeKf && <span className="kf-pill-nome">{nomeKf}</span>}
      <span className="hd-lbl">{nomeKf ? 'Sair' : 'Entrar no Kit Festa'}</span>
    </button>
  );

  return (
    <div className="hd kf">
      {/* Como no original: o cabeçalho (carrinho, "Sair") só existe na vitrine — no checkout o topo
          é só o "Voltar ao cardápio" (o cliente não abre o carrinho nem sai sem querer, perdendo o pedido). */}
      {screen === 'shop' && (
        <SiteHeader ativo="kitfesta" cfg={cfg} logo={siteLogo} acoes={acoesKf}
          carrinho={{ qtd: qtdItens, onAbrir: () => setCartOpen(true) }} />
      )}

      {screen === 'shop' && (
        <main>
          <Hero cfg={cfg} onCatalog={goCatalog} />
          <HowItWorks cfg={cfg} />
          {produtos.some(p => p.destaque) && (
            <Section titulo="Mais pedidos" sub="Os campeões de venda das nossas festas">
              <ProdGrid produtos={produtos.filter(p => p.destaque)} qtyOf={qtyOf} onAdd={addItem} onRemove={removeItem} />
            </Section>
          )}
          {produtos.some(ehPacote) && (
            <Section titulo="Congelados" sub="Salgados congelados em pacote de 500 g, pra você aquecer em casa. Não entram no mínimo de caixas do Kit Festa.">
              <ProdGrid produtos={produtos.filter(ehPacote)} qtyOf={qtyOf} onAdd={addItem} onRemove={removeItem} />
            </Section>
          )}
          <Catalog produtos={produtos.filter(p => !ehPacote(p))} categorias={categorias.filter(c => !String(c.slug || '').toLowerCase().includes('congelado'))} qtyOf={qtyOf} onAdd={addItem} onRemove={removeItem}
            barra={<ProgressoMinimo boxes={totals.boxes} minCaixas={minCaixas} onCart={() => setCartOpen(true)} />} />
          {avaliacoes.length > 0 && (
            <section className="hd-section hd-section-tint">
              <div className="hd-wrap">
                <div className="hd-section-head">
                  <div>
                    <h2>O que dizem nossos clientes</h2>
                    <p>Quem fez festa com a gente conta como foi</p>
                  </div>
                </div>
                <div className="hd-depo-grid">
                  {avaliacoes.map(a => {
                    const est = Math.max(0, Math.min(5, Number(a.estrelas) || 0));
                    const sub = [a.evento, a.dataLabel].filter(Boolean).join(' · ');
                    return (
                      <figure className="hd-depo" key={a.id}>
                        <div className="hd-stars" aria-label={`${est} de 5 estrelas`}>{'★'.repeat(est)}{'☆'.repeat(5 - est)}</div>
                        <blockquote>"{a.texto}"</blockquote>
                        <figcaption><strong>{a.nome}</strong>{sub ? <span>{sub}</span> : null}</figcaption>
                      </figure>
                    );
                  })}
                </div>
              </div>
            </section>
          )}
          {cfg.indicacao?.ativo && (
            <Referral code={cliente?.codigoIndicacao} credito={cfg.indicacao?.credito} indicacao={cliente?.indicacao} aviso={cfg.indicacao?.avisoCreditos} onEntrar={() => setLoginModal(true)} />
          )}
          <Contato cfg={cfg} />
          <SiteFooter cfg={cfg} logo={siteLogo} />

          {qtdItens > 0 && (
            <button className="kf-fab-cart" onClick={() => setCartOpen(true)}>
              <ShoppingCart size={18} /> {totals.boxes} caixa(s){totals.pacotes ? ` + ${totals.pacotes} pacote(s)` : ''} · {money(totals.total)}
            </button>
          )}
        </main>
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
          cliente={cliente} cfg={cfg}
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

/* ---------- Hero ---------- */
function Hero({ cfg, onCatalog }) {
  const h = cfg.hero || {};
  const titulo = h.titulo || '';
  const naIdx = titulo.toLowerCase().indexOf(' na ');
  const tituloA = naIdx >= 0 ? titulo.slice(0, naIdx) : titulo;
  const tituloB = naIdx >= 0 ? titulo.slice(naIdx + 1) : '';
  return (
    <section className="kf-hero">
      <div className="hd-wrap kf-hero-grid">
        <div>
          <span className="hd-eyebrow hd-eyebrow-gold">{h.kicker} · {cfg.loja?.desde}</span>
          <h1>{tituloA}{tituloB && <span className="kf-h1-y">{tituloB}</span>}</h1>
          <p className="kf-lead">{h.subtitulo}</p>
          <div className="kf-hero-cta">
            <button type="button" className="hd-btn hd-btn-lg" onClick={onCatalog}><ShoppingBag size={18} /> Montar meu pedido</button>
            <a className="hd-btn hd-btn-outline hd-btn-lg" href={`https://wa.me/${cfg.loja?.whatsapp}`} target="_blank" rel="noreferrer"><MessageCircle size={18} /> WhatsApp</a>
          </div>
          <div className="kf-trust">
            <div className="t"><b>+19 anos</b><span>fazendo festa em Joinville</span></div>
            <div className="t"><b>25un</b><span>por caixa</span></div>
            <div className="t"><b>mín. {cfg.regras?.minCaixas || 4}</b><span>caixas por pedido</span></div>
          </div>
        </div>
        <div className="kf-hero-box">
          <img src={BOX} alt="Caixa de salgados Hardt" fetchPriority="high" decoding="async" />
          <div className="kf-hero-badge"><b>25</b><span>salgados / caixa</span></div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Como funciona (4 passos) ---------- */
function HowItWorks({ cfg }) {
  const steps = cfg.comoFunciona || [];
  if (steps.length === 0) return null;
  return (
    <section className="kf-how" aria-label="Como funciona">
      <div className="hd-wrap kf-how-grid">
        {steps.map((s, i) => (
          <div className="kf-step" key={i}>
            <span className="kf-step-n">{i + 1}</span>
            <div><h4>{s.titulo}</h4><p>{s.desc}</p></div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Section wrapper ---------- */
function Section({ titulo, sub, children }) {
  return (
    <section className="kf-sec">
      <div className="hd-wrap">
        <div className="kf-sec-head"><h2>{titulo}</h2>{sub && <p>{sub}</p>}</div>
        {children}
      </div>
    </section>
  );
}

/* ---------- Barra de progresso do pedido mínimo (mesmo cálculo do carrinho: boxes × minCaixas) ---------- */
function ProgressoMinimo({ boxes, minCaixas, onCart }) {
  const ok = boxes >= minCaixas;
  const pct = Math.min(100, Math.round((boxes / minCaixas) * 100));
  return (
    <div className={`kf-progress${ok ? ' ok' : ''}`} role="status" aria-live="polite">
      <div className="hd-wrap kf-prog-in">
        <div className="kf-prog-left">
          <div className="kf-prog-label">
            <span>{ok ? `✓ Mínimo atingido! ${boxes} caixa(s) selecionada(s)` : `Faltam ${minCaixas - boxes} caixa(s) para o mínimo de ${minCaixas}`}</span>
            <strong>{boxes} / {minCaixas} caixas</strong>
          </div>
          <div className="kf-prog-track"><div className="kf-prog-fill" style={{ width: `${pct}%` }} /></div>
        </div>
        <button type="button" className="hd-btn hd-btn-sm kf-prog-btn" onClick={onCart}>Ver carrinho</button>
      </div>
    </div>
  );
}

/* ---------- Catálogo com filtros ---------- */
function Catalog({ produtos, categorias, qtyOf, onAdd, onRemove, barra }) {
  const [filtro, setFiltro] = useState('todos');
  const lista = filtro === 'todos' ? produtos
    : produtos.filter(p => p.categoria === filtro);
  return (
    <section className="kf-sec kf-cat" id="catalogo">
      {barra}
      <div className="hd-wrap">
        <div className="kf-sec-head"><h2>Nosso cardápio</h2><p>Cada caixa = 1 sabor, 25 unidades. Combine os sabores à vontade!</p></div>
        <div className="kf-filters" role="group" aria-label="Filtrar cardápio">
          <button type="button" className="kf-chip" aria-pressed={filtro === 'todos'} onClick={() => setFiltro('todos')}>Todos</button>
          {categorias.map(c => (
            <button type="button" key={c.id} className="kf-chip" aria-pressed={filtro === c.slug} onClick={() => setFiltro(c.slug)}>{c.nome}</button>
          ))}
        </div>
        <ProdGrid produtos={lista} qtyOf={qtyOf} onAdd={onAdd} onRemove={onRemove} />
      </div>
    </section>
  );
}

function ProdGrid({ produtos, qtyOf, onAdd, onRemove }) {
  return (
    <div className="kf-grid">
      {produtos.map(p => {
        const q = qtyOf(p.id);
        return (
          <div className="kf-card" key={p.id}>
            <div className="kf-card-ph">
              <div className="kf-badges">
                {p.destaque && <span className="hd-chip hd-chip-gold">★ Mais pedido</span>}
                {p.tags?.length > 0 && p.tags.slice(0, 1).map(t => <span className="hd-chip hd-chip-green" key={t}>{t}</span>)}
              </div>
              {imgUrl(p.imagem) && <img src={imgUrl(p.imagem)} alt={p.nome} loading="lazy" decoding="async" />}
            </div>
            <div className="kf-card-body">
              <h3>{p.nome}</h3>
              <p className="kf-d">{p.descricao}</p>
              <div className="kf-card-foot">
                <div className="kf-price"><b>{money(p.preco)}</b><span>{rotuloUnidade(p)}</span></div>
                {q === 0 ? (
                  <button type="button" className="kf-add" onClick={() => onAdd(p.id)} aria-label={`Adicionar ${p.nome}`}><Plus size={18} /></button>
                ) : (
                  <div className="stepper">
                    <button type="button" onClick={() => onRemove(p.id)} aria-label="Diminuir"><Minus size={15} /></button>
                    <span className="q">{q}</span>
                    <button type="button" onClick={() => onAdd(p.id)} aria-label="Aumentar"><Plus size={15} /></button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {produtos.length === 0 && <p className="kf-empty">Nenhum produto nesta categoria.</p>}
    </div>
  );
}

/* ---------- Carrinho ---------- */
function CartDrawer({ cart, produtos, onClose, onAdd, onRemove, coupon, setCoupon, totals, onCheckout, minCaixas, cliente, cfg }) {
  const [code, setCode] = useState('');
  const [codeInd, setCodeInd] = useState('');
  const [err, setErr] = useState('');
  const ids = Object.keys(cart).filter(id => cart[id] > 0);
  const boxes = totals.boxes;
  const prodById = (id) => produtos.find(p => p.id === id);

  const podeIndicar = cliente && !cliente.jaIndicado; // 1ª compra e ainda não usou código
  const creditos = cliente?.indicacao?.creditosDisponiveis || 0;
  const valorCredito = Number(cfg?.indicacao?.credito) || 0;

  const apply = async () => {
    try {
      const c = await publicApi.validarCupom(code.trim().toUpperCase(), boxes);
      setErr(''); setCoupon({ ...c, fonte: 'cupom' });
    } catch (e) { setErr(e.response?.data?.error || 'Cupom inválido.'); }
  };
  const applyIndicacao = async () => {
    try {
      const c = await publicApi.validarIndicacao(codeInd.trim().toUpperCase());
      setErr(''); setCoupon({ fonte: 'indicacao', tipo: c.tipo, valor: c.valor, codigo: c.codigo, label: `Indicação de ${c.indicadorNome}` });
    } catch (e) { setErr(e.response?.data?.error || 'Código inválido.'); }
  };
  const usarCredito = () => {
    setErr(''); setCoupon({ fonte: 'credito', tipo: 'brl', valor: valorCredito, label: `Crédito de indicação (R$ ${valorCredito.toFixed(2).replace('.', ',')})` });
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
                  <div className="thumb">
                    {imgUrl(p.imagem) && <img src={imgUrl(p.imagem)} alt="" loading="lazy" decoding="async" />}
                  </div>
                  <div className="info"><h4>{p.nome}</h4><span>{money(p.preco)} · {rotuloUnidade(p)}</span></div>
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
                  <button onClick={() => { setCoupon(null); setCode(''); setCodeInd(''); }}>remover</button></div>
              ) : (
                <>
                  {/* Crédito de indicação (para quem tem crédito disponível) */}
                  {creditos > 0 && valorCredito > 0 && (
                    <button className="btn btn-green btn-block btn-sm" style={{ marginTop: 12 }} onClick={usarCredito}>
                      <Sparkles size={15} /> Usar 1 crédito de indicação (R$ {valorCredito.toFixed(2).replace('.', ',')}) · {creditos} disponível(is)
                    </button>
                  )}
                  {/* Código de indicação (1ª compra) */}
                  {podeIndicar && (
                    <div className="coupon" style={{ marginTop: 10 }}>
                      <div className="ip"><Sparkles size={16} color="#6b776e" />
                        <input placeholder="código de indicação" value={codeInd} onChange={e => { setCodeInd(e.target.value); setErr(''); }} /></div>
                      <button className="btn btn-outline-ink btn-sm" onClick={applyIndicacao}>Usar</button>
                    </div>
                  )}
                  {/* Cupom normal */}
                  <div className="coupon" style={{ marginTop: 10 }}>
                    <div className="ip"><Ticket size={16} color="#6b776e" />
                      <input placeholder="cupom de desconto" value={code} onChange={e => { setCode(e.target.value); setErr(''); }} /></div>
                    <button className="btn btn-outline-ink btn-sm" onClick={apply}>Aplicar</button>
                  </div>
                  {(podeIndicar || creditos > 0) && <div className="legend" style={{ fontSize: 11, color: '#6b776e', marginTop: 6 }}>Use só um: cupom, código de indicação ou crédito.</div>}
                  {err && <div className="coupon-err">{err}</div>}
                </>
              )}
            </>
          )}
        </div>
        {ids.length > 0 && (
          <div className="drawer-foot">
            <div className="tot">
              <div className="row"><span>{boxes} caixa(s){totals.pacotes ? ` + ${totals.pacotes} pacote(s)` : ''}</span><span>{money(totals.subtotal)}</span></div>
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

function CalendarPicker({ selected, onSelect, modo }) {
  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() });
  // avail: undefined = carregando (nenhum dia clicável) · objeto = agenda do mês · false = falha de rede
  const [avail, setAvail] = useState(undefined);

  useEffect(() => {
    let vivo = true;
    setAvail(undefined);
    const ini = `${view.y}-${String(view.m + 1).padStart(2, '0')}-01`;
    const fim = `${view.y}-${String(view.m + 1).padStart(2, '0')}-${new Date(view.y, view.m + 1, 0).getDate()}`;
    publicApi.agenda(ini, fim, modo).then(r => { if (vivo) setAvail(r || {}); }).catch(() => { if (vivo) setAvail(false); });
    return () => { vivo = false; };
  }, [view.y, view.m, modo]);

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
    // A API só devolve os dias que TÊM horário cadastrado. Dia ausente = sem horário = indisponível.
    // (Se a agenda falhar na rede, avail === false: mantém liberado e a lista de horários trava o avanço.)
    let status = avail === false ? 'open' : (avail?.[key] || 'closed');
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
            <div key={i} className={`cal-cell ${c.status}${sel ? ' sel' : ''}`} aria-disabled={!open} onClick={() => open && onSelect(c.key)}>
              {c.d}{open && !sel && <span className="dot" />}
            </div>
          );
        })}
      </div>
      <div className="cal-legend">
        <span><i style={{ background: '#fff', border: '1.5px solid rgba(18,130,64,.4)' }} />Disponível</span>
        <span><i style={{ background: 'var(--yellow)' }} />Últimas vagas</span>
        <span><i style={{ background: '#e3dac8' }} />Indisponível</span>
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
  const maskTel = (v) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    // 11 dígitos = celular (47) 99999-9999 · 10 = fixo (47) 9999-9999
    return d.length > 10
      ? d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
      : d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  };
  const maskCep = (v) => v.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
  const [telefone, setTelefone] = useState(telefoneAtual ? maskTel(telefoneAtual) : '');
  const telOk = telefone.replace(/\D/g, '').length >= 10;
  // Endereço de entrega (cobertura por raio, sem escolher bairro)
  const temEndCadastro = !!enderecoCadastro?.completo;
  const [usarOutro, setUsarOutro] = useState(false);
  const [cep, setCep] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [bairroNome, setBairroNome] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [cobertura, setCobertura] = useState(null); // { atende, endereco, raioKm, distanciaKm }
  const [cepMsg, setCepMsg] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const precisaNovoEnd = modo === 'entrega' && (!temEndCadastro || usarOutro);
  const ids = Object.keys(cart).filter(id => cart[id] > 0);
  const prodById = (id) => produtos.find(p => p.id === id);

  useEffect(() => {
    if (!date) { setSlots([]); return; }
    publicApi.slots(date, modo).then(setSlots).catch(() => setSlots([]));
    setSlot(null);
  }, [date, modo]);

  // Verifica cobertura de um CEP (raio de entrega)
  const verificarCep = async (cepStr) => {
    const c = (cepStr || '').replace(/\D/g, '');
    if (c.length !== 8) { setCepMsg('CEP inválido.'); return; }
    setCepLoading(true); setCepMsg(''); setCobertura(null);
    try {
      const r = await publicApi.verificarEntrega(c);
      setCobertura(r);
      if (r.endereco?.logradouro) setLogradouro(r.endereco.logradouro);
      if (r.endereco?.bairro) setBairroNome(r.endereco.bairro);
    } catch (e) { setCepMsg(e.response?.data?.error || 'Não foi possível verificar o CEP.'); }
    finally { setCepLoading(false); }
  };

  // Ao usar o endereço do cadastro, verifica a cobertura do CEP do cadastro
  useEffect(() => {
    if (modo === 'entrega' && temEndCadastro && !usarOutro && enderecoCadastro?.cep) {
      verificarCep(enderecoCadastro.cep);
    }
    // eslint-disable-next-line
  }, [modo, usarOutro]);

  const dateLabel = date ? date.split('-').reverse().join('/') : null;
  const taxa = 0; // entrega: taxa a combinar no WhatsApp
  const totalFinal = totals.total;
  // Endereço final (texto) e validação
  const enderecoFinal = modo !== 'entrega' ? ''
    : precisaNovoEnd
      ? `${logradouro}, nº ${numero}${complemento ? `, ${complemento}` : ''}${bairroNome ? ` — ${bairroNome}` : ''}${cep ? ` — CEP ${cep}` : ''}`
      : (enderecoCadastro?.completo || '');
  const cepUsado = precisaNovoEnd ? cep.replace(/\D/g, '') : (enderecoCadastro?.cep || '').replace(/\D/g, '');
  const foraDaArea = cobertura?.atende === false;
  const enderecoOk = modo !== 'entrega' || (
    !foraDaArea && (precisaNovoEnd ? (logradouro.trim() && numero.trim()) : !!enderecoCadastro?.completo)
  );
  // Etapas progressivas: cada bloco só aparece quando o anterior está completo
  const modoOk = modo === 'retirada' || enderecoOk;
  const ready = date && slot && telOk && modoOk;

  return (
    <div className="co-page">
      <div className="co-top">
        <div className="hd-wrap"><button className="co-back" onClick={onBack}><ChevronLeft size={18} /> Voltar ao cardápio</button></div>
      </div>
      <div className="hd-wrap co-grid">
        <div>
          <div className="co-block">
            <h3><Truck size={20} /> Como você quer receber?</h3>
            <div className="seg">
              <button className={modo === 'retirada' ? 'on' : ''} onClick={() => { setModo('retirada'); setDate(null); setSlot(null); }}>
                <span className="ic"><ShoppingBag size={20} /></span>
                <span><b>Retirar na loja</b><span>sem taxa</span></span>
              </button>
              <button className={modo === 'entrega' ? 'on' : ''} onClick={() => { setModo('entrega'); setDate(null); setSlot(null); }}>
                <span className="ic"><Truck size={20} /></span>
                <span><b>Entrega</b><span>taxa a combinar</span></span>
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
                    {!temEndCadastro && <p style={{ fontSize: 12, color: '#6b776e', margin: 0 }}>Informe o endereço de entrega:</p>}
                    <div className="coupon" style={{ margin: 0 }}>
                      <div className="ip" style={{ flex: 1, background: '#fff' }}>
                        <input inputMode="numeric" placeholder="CEP" value={cep}
                          onChange={e => { setCep(maskCep(e.target.value)); setCobertura(null); }}
                          onBlur={() => cep.replace(/\D/g, '').length === 8 && verificarCep(cep)} />
                      </div>
                      <button className="btn btn-outline-ink btn-sm" onClick={() => verificarCep(cep)} disabled={cepLoading}>
                        {cepLoading ? '...' : 'Verificar'}
                      </button>
                    </div>
                    {cepMsg && <p style={{ fontSize: 11, color: '#b3261e', margin: 0 }}>{cepMsg}</p>}
                    <div className="ip" style={{ background: '#fff' }}>
                      <input placeholder="Rua / logradouro" value={logradouro} onChange={e => setLogradouro(e.target.value)} />
                    </div>
                    <div className="ip" style={{ background: '#fff' }}>
                      <input placeholder="Bairro" value={bairroNome} onChange={e => setBairroNome(e.target.value)} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 8 }}>
                      <div className="ip" style={{ background: '#fff' }}><input inputMode="numeric" placeholder="Número" value={numero} onChange={e => setNumero(e.target.value)} /></div>
                      <div className="ip" style={{ background: '#fff' }}><input placeholder="Complemento" value={complemento} onChange={e => setComplemento(e.target.value)} /></div>
                    </div>
                  </div>
                )}

                {/* Resultado da cobertura por raio */}
                {cepLoading && <p className="sub" style={{ margin: 0 }}>Verificando sua região…</p>}
                {cobertura?.atende === true && (
                  <div className="sum-meta" style={{ background: '#e6f4ea', border: '1px solid var(--green-l)' }}>
                    <div className="r" style={{ color: 'var(--green-dd)', fontWeight: 600 }}><Check size={15} /> Entregamos na sua região!</div>
                    <div className="r" style={{ fontSize: 12 }}>A taxa de entrega é combinada no WhatsApp.</div>
                  </div>
                )}
                {cobertura?.atende === false && (
                  <div className="sum-meta" style={{ background: '#fdeceb', border: '1px solid #e7a6a0' }}>
                    <div className="r" style={{ color: '#b3261e', fontWeight: 600 }}><X size={15} /> Ainda não entregamos na sua região.</div>
                    <div className="r" style={{ fontSize: 12 }}>Você pode escolher <b>Retirar na loja</b> acima. 🙂</div>
                  </div>
                )}
                {cobertura?.atende === null && (
                  <div className="sum-meta" style={{ background: '#fff7e0', border: '1px solid var(--yellow)' }}>
                    <div className="r" style={{ color: '#7a5a00', fontSize: 12 }}>Não conseguimos confirmar sua região automaticamente — confirmamos no WhatsApp. A taxa é combinada lá.</div>
                  </div>
                )}
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
              <CalendarPicker selected={date} modo={modo} onSelect={(k) => { setDate(k); setSlot(null); }} />
              {date && (
                <>
                  <h3 style={{ marginTop: 22, fontSize: 16 }}><Clock size={18} /> Horário ({modo})</h3>
                  {slots.length === 0 ? <p className="sub">Sem horários para esta data neste modo.</p> : (
                    <div className="slots" style={{ marginTop: 8 }}>
                      {slots.map(s => (
                        <button key={s.hora} className={'slot' + (slot === s.hora ? ' on' : '')} disabled={s.full} onClick={() => setSlot(s.hora)}>
                          {s.hora}{s.full && <small>{s.cedo ? 'encerrado' : 'esgotado'}</small>}
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
              {totals.discount > 0 && <div className="row disc"><span>{coupon?.fonte === 'credito' ? 'Crédito de indicação' : coupon?.fonte === 'indicacao' ? 'Desconto de indicação' : `Cupom ${coupon?.codigo || ''}`}</span><span>– {money(totals.discount)}</span></div>}
              {modo === 'entrega' && <div className="row"><span>Taxa entrega</span><span>a combinar</span></div>}
              <div className="grand"><span>Total</span><b>{money(totalFinal)}</b></div>
            </div>
            <div className="sum-meta">
              <div className="r"><Truck size={15} /> {modo === 'retirada' ? 'Retirada na loja' : 'Entrega (taxa a combinar)'}</div>
              <div className="r"><Calendar size={15} /> {dateLabel || 'Selecione uma data'}</div>
              <div className="r"><Clock size={15} /> {slot || 'Selecione um horário'}</div>
            </div>

            {/* WhatsApp do cliente — só aparece na última etapa (após escolher horário) */}
            {slot && (
              <div style={{ marginTop: 14 }}>
                <label className="field" style={{ display: 'block', marginBottom: 4 }}>
                  <span style={{ fontFamily: 'var(--f-display)', textTransform: 'uppercase', letterSpacing: '.06em', fontSize: '.72rem', color: '#424d45' }}>
                    <MessageCircle size={13} style={{ verticalAlign: '-2px' }} /> Seu WhatsApp {telefoneAtual ? '(confirme)' : ''}
                  </span>
                </label>
                <div className="ip" style={{ background: '#fff' }}>
                  <input inputMode="numeric" placeholder="(47) 99999-0000" value={telefone}
                    onChange={e => setTelefone(maskTel(e.target.value))} />
                </div>
                <p style={{ fontSize: 11, color: '#6b776e', marginTop: 4 }}>Mandamos uma cópia do pedido nesse número.</p>
              </div>
            )}

            <button className="btn btn-wa btn-block" disabled={!ready} style={{ marginTop: 12 }}
              onClick={() => onFinish({ modo, date, dateLabel, slot, obs, cep: cepUsado, taxa: 0, endereco: enderecoFinal, telefone })}>
              <MessageCircle size={19} /> {!modoOk ? (modo === 'entrega' ? 'Complete o endereço' : '') : !date ? 'Escolha o dia' : !slot ? 'Escolha o horário' : !telOk ? 'Confirme seu WhatsApp' : 'Finalizar pedido'}
            </button>
            <p style={{ fontSize: 12, color: '#6b776e', textAlign: 'center', marginTop: 10 }}>
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
      enderecoEntrega: info.endereco || null, cep: info.cep || null,
      cupomCodigo: coupon?.fonte === 'cupom' ? coupon.codigo : null,
      indicacaoCodigo: coupon?.fonte === 'indicacao' ? coupon.codigo : null,
      usarCredito: coupon?.fonte === 'credito',
      observacoes: info.obs || null,
      telefone: info.telefone || null,
      visitante: visitanteFinal,
    };
    publicApi.criarPedido(payload)
      .then(() => {
        // link opcional pra falar com a loja
        const linhas = ids.map(id => `• ${cart[id]}x ${prodById(id)?.nome}`).join('\n');
        const txt = encodeURIComponent(
          `*Pedido Hardt — Kit Festa*\n${linhas}\n\n` +
          `${info.modo === 'retirada' ? 'Retirada na loja' : 'Entrega (taxa a combinar)'}\n` +
          `Data: ${info.dateLabel} às ${info.slot}` +
          (info.endereco ? `\nEndereço: ${info.endereco}` : '') +
          (coupon ? `\nDesconto: ${coupon.label || coupon.codigo}` : '') +
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
          <p>{salvando ? 'Estamos salvando seu pedido' : erro ? erro : 'Falta só 1 passo: envie pelo seu WhatsApp para a loja confirmar 📲'}</p>
        </div>
        <div className="modal-body">
          {!salvando && !erro && (
            <>
              <div className="sum-meta" style={{ marginTop: 0 }}>
                <div className="r"><Truck size={15} /> {info.modo === 'retirada' ? 'Retirada na loja' : 'Entrega (taxa a combinar)'}</div>
                <div className="r"><Calendar size={15} /> {info.dateLabel} · {info.slot}</div>
                <div className="r"><ShoppingBag size={15} /> {totals.boxes} caixas · {money(totals.total + (info.taxa || 0))}</div>
              </div>
              <a className="btn btn-wa btn-block" href={link} target="_blank" rel="noreferrer" style={{ marginTop: 14 }}>
                <MessageCircle size={19} /> Enviar pedido pelo WhatsApp</a>
              <p style={{ fontSize: 12, color: '#6b776e', textAlign: 'center', marginTop: 8, marginBottom: 0 }}>
                É esse envio que confirma seu pedido com a loja e agiliza o preparo.
              </p>
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
function Referral({ code, credito, indicacao, aviso, onEntrar }) {
  const [copied, setCopied] = useState(false);
  const c = credito || 20;
  const copy = () => { try { navigator.clipboard.writeText(code); } catch (e) {} setCopied(true); setTimeout(() => setCopied(false), 1600); };
  const temSaldo = indicacao && (indicacao.creditosDisponiveis > 0 || indicacao.indicados > 0);
  return (
    <section className="hd-section kf-ref-sec">
      <div className="hd-wrap">
        <div className="ref">
          <div>
            <span className="kicker">Indique &amp; ganhe</span>
            <h2>Indicou, os dois ganham</h2>
            <p>Compartilhe seu código. Seu amigo ganha <b>desconto</b> na primeira compra e você ganha <b>R${c} de crédito</b> quando ele quitar o pedido — 1 crédito por pedido seu.</p>
            {code ? (
              <div className="ref-code">
                <span className="code">{code}</span>
                <button className="btn btn-green btn-sm" onClick={copy}>
                  {copied ? <><Check size={16} /> Copiado!</> : 'Copiar código'}
                </button>
              </div>
            ) : (
              <div className="ref-code">
                <button className="btn btn-green" onClick={onEntrar}>Entrar / criar conta para pegar seu código</button>
              </div>
            )}
            {temSaldo && (
              <>
                <div className="ref-mini">
                  <div className="credmini-c"><b>{indicacao.indicados}</b><span>indicados</span></div>
                  <div className="credmini-c gold"><b>{indicacao.creditosDisponiveis}</b><span>créditos p/ usar</span></div>
                  <div className="credmini-c"><b>R$ {Number(indicacao.valorDisponivel || 0).toFixed(0)}</b><span>disponível</span></div>
                </div>
                {aviso && (
                  <p className="ref-aviso">
                    <Clock size={14} /> {aviso}
                  </p>
                )}
              </>
            )}
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

/* ---------- Final padrão (igual à home): contato (card + mapa) + rodapé simples ---------- */
function Contato({ cfg }) {
  const l = cfg.loja || {};
  const wa = `https://wa.me/${l.whatsapp}`;
  const waMsg = `${wa}?text=${encodeURIComponent('Olá! Vim pelo site da Hardt e gostaria de fazer um pedido.')}`;
  const social = (v, base) => !v ? null : (String(v).startsWith('http') ? v : `${base}${String(v).replace(/^@/, '')}`);
  const igUrl = social(l.instagram, 'https://instagram.com/');
  const fbUrl = social(l.facebook, 'https://facebook.com/');
  const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent(String(l.endereco || '').replace(' — ', ', '))}&output=embed`;
  return (
      <section className="hd-section kf-contato" id="contato">
        <div className="hd-wrap contact">
          <div className="contact-card">
            <div className="contact-top">
              <div className="contact-rows">
                <div className="contact-row"><div><div className="lab">Onde estamos</div><div className="val" dangerouslySetInnerHTML={{ __html: String(l.endereco || '').replace(' — ', '<br/>') }} /></div></div>
                <div className="contact-row"><div><div className="lab">WhatsApp</div><a className="val val-big" href={waMsg} target="_blank" rel="noreferrer">{l.telefone}</a></div></div>
                {l.email && <div className="contact-row"><div><div className="lab">E-mail</div><a className="val" href={`mailto:${l.email}`}>{l.email}</a></div></div>}
              </div>
              {(igUrl || fbUrl) && (
                <div className="contact-social">
                  <div className="lab">Redes sociais</div>
                  <div className="social-links">
                    {igUrl && (
                      <a className="soc" href={igUrl} target="_blank" rel="noreferrer" aria-label="Instagram">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>
                        <span>{l.instagram && !String(l.instagram).startsWith('http') ? `@${String(l.instagram).replace(/^@/, '')}` : 'Instagram'}</span>
                      </a>
                    )}
                    {fbUrl && (
                      <a className="soc" href={fbUrl} target="_blank" rel="noreferrer" aria-label="Facebook">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z" /></svg>
                        <span>Facebook</span>
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="kf-hero-cta contact-cta">
              <a className="hd-btn" href={waMsg} target="_blank" rel="noreferrer">WhatsApp</a>
              <a className="hd-btn hd-btn-gold" href="#catalogo">Kit-Festa</a>
              <Link className="hd-btn hd-btn-outline" to="/congelados">Congelados</Link>
            </div>
          </div>
          <div className="contact-map">
            <iframe title="Localização da Hardt no mapa" src={mapSrc} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
          </div>
        </div>
      </section>
  );
}
