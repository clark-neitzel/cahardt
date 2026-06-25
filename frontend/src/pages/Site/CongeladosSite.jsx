import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import publicApi, { getToken, setToken } from './api';
import { Icon, WhatsIcon } from './icons';
import Login from './Login';
import './site.css';
import { API_URL } from '../../services/api';

const LOGO = '/cong/logo.png';
const money = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
const imgUrl = (u) => !u ? null : (u.startsWith('http') ? u : `${API_URL}${u}`);
const soDigitos = (s) => String(s || '').replace(/\D/g, '');
// Fundo quente determinístico (paleta de salgados) para cards sem foto — como no protótipo
const tileGradient = (seed) => {
  let h = 0; const s = String(seed || 'x');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = 20 + (h % 40); // 20–60: dourado / caramelo / marrom
  return `linear-gradient(150deg, hsl(${hue} 46% 44%), hsl(${hue} 50% 33%))`;
};
// Parsers dos valores nutricionais da etiqueta ("169kcal (12% VD)") — mesma lógica da etiqueta impressa
const parseValor = (s) => { if (!s) return null; const m = String(s).replace(',', '.').match(/-?[\d.]+/); return m ? parseFloat(m[0]) : null; };
const parseVD = (s) => { const m = String(s || '').match(/(\d+)\s*%/); return m ? m[1] : null; };
const fmtNum = (n, d) => { if (n == null || isNaN(n)) return '0'; const f = Math.pow(10, d); return String(Math.round(n * f) / f).replace('.', ','); };
// ── Datas de entrega ──
const ISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const dataBR = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const weekdayISO = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const diaSemanaISO = (iso) => DIAS_SEMANA[weekdayISO(iso)] || '';

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
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState('');
  const [loginModal, setLoginModal] = useState(false);

  const [hdr, setHdr] = useState({ tabelaPrecoId: '', dia: '', obs: '', telefone: '', dataEntrega: '' });
  const [trocarData, setTrocarData] = useState(false);
  const [erroData, setErroData] = useState('');

  const logado = cliente || visitante;
  const siteLogo = cfg?.logoUrl ? imgUrl(cfg.logoUrl) : LOGO;
  const whatsapp = cfg?.loja?.whatsapp || '5547988548476';

  // boot: restaura sessão
  useEffect(() => {
    const t = getToken();
    if (!t) {
      // Sem sessão: espera catálogo + grupos carregarem antes de mostrar a tela
      Promise.all([
        publicApi.config().then(setCfg).catch(() => {}),
        publicApi.catalogo().then(setProdutos).catch(() => {}),
        publicApi.grupos().then(setGrupos).catch(() => {}),
      ]).finally(() => setBooting(false));
      return;
    }
    // Com sessão: restaura perfil em paralelo com config/grupos
    publicApi.config().then(setCfg).catch(() => {});
    publicApi.grupos().then(setGrupos).catch(() => {});
    publicApi.perfil().then(setCliente).catch(() => {
      setToken(null);
      // Sessão inválida: cai no modo público
      publicApi.catalogo().then(setProdutos).catch(() => {});
    }).finally(() => setBooting(false));
  }, []);

  // Carrega catálogo personalizado ao fazer login como cliente registrado
  useEffect(() => {
    if (!cliente) return;
    publicApi.meuCatalogo().then(({ catalogo, ultimoPedido }) => {
      setProdutos(catalogo); setUltimoPedido(ultimoPedido || []);
    }).catch(() => {});
  }, [cliente]);

  // pré-seleciona telefone do perfil
  useEffect(() => {
    if (!cliente) return;
    setHdr(h => ({ ...h, telefone: h.telefone || cliente.telefone || '' }));
  }, [cliente]);

  const qtyOf = (id) => cart[id] || 0;
  const addItem = (id) => {
    if (!logado) { setLoginModal(true); return; }
    setCart(c => ({ ...c, [id]: (c[id] || 0) + 1 }));
  };
  const removeItem = (id) => setCart(c => { const n = { ...c }; const v = (n[id] || 0) - 1; if (v <= 0) delete n[id]; else n[id] = v; return n; });

  // O site usa SÓ a condição padrão do cliente. O preço de cada produto já vem
  // pronto do servidor (igual ao que o vendedor vê: condição + último preço + flex).
  const condPadrao = cliente?.condicaoPadrao || null;
  // Cliente registrado usa o mínimo da condição dele; visitante usa o da tabela "Site".
  const minimo = condPadrao?.valorMinimo || (!cliente ? (cfg?.minimoSite || 0) : 0);
  const precoDe = (p) => Number(p.preco || 0);

  const totals = useMemo(() => {
    let boxes = 0, subtotal = 0;
    Object.keys(cart).forEach(id => { const p = produtos.find(x => x.id === id); if (p) { boxes += cart[id]; subtotal += cart[id] * Number(p.preco || 0); } });
    return { boxes, subtotal };
  }, [cart, produtos]);

  const below = minimo > 0 && totals.subtotal < minimo;

  // ── Data de entrega: sugere o próximo dia regular do cadastro; senão, calendário ──
  const amanhaISO = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 1); return ISO(d); }, []);
  const sugeridaISO = useMemo(() => {
    const nums = cliente?.diasEntregaNums || [];
    if (!nums.length) return '';
    const t = new Date(); t.setHours(0, 0, 0, 0);
    for (let i = 1; i <= 28; i++) { const d = new Date(t); d.setDate(t.getDate() + i); if (nums.includes(d.getDay())) return ISO(d); }
    return '';
  }, [cliente]);
  useEffect(() => { if (sugeridaISO) setHdr(h => (h.dataEntrega ? h : { ...h, dataEntrega: sugeridaISO })); }, [sugeridaISO]);
  // "encaixe": data fora dos dias regulares do cliente (ou sem dia regular / visitante)
  const ehEncaixe = !!hdr.dataEntrega && !(cliente?.diasEntregaNums || []).includes(weekdayISO(hdr.dataEntrega));
  const escolherData = (iso) => {
    if (!iso) { setErroData(''); setHdr(h => ({ ...h, dataEntrega: '' })); return; }
    if (iso < amanhaISO) { setErroData('A data de entrega deve ser a partir de amanhã.'); return; }
    const wd = weekdayISO(iso);
    const regular = (cliente?.diasEntregaNums || []).includes(wd);
    if (!regular) {
      if (wd === 0 && !cfg?.entregas?.domingo) { setErroData('Não atendemos entregas aos domingos.'); return; }
      if (wd === 6 && !cfg?.entregas?.sabado) { setErroData('Não atendemos entregas aos sábados.'); return; }
    }
    setErroData(''); setHdr(h => ({ ...h, dataEntrega: iso })); setTrocarData(false);
  };

  const repetirUltimo = () => {
    const novo = {};
    ultimoPedido.forEach(it => { if (produtos.some(p => p.id === it.congeladosProdutoId)) novo[it.congeladosProdutoId] = it.quantidade; });
    setCart(novo);
    setOpen(true);
  };

  // filtros por categoria
  const matched = useMemo(() => {
    return produtos.filter(p => {
      if (filtro === 'recompra') return !!p.comprado;
      if (filtro !== 'todos' && p.grupo !== filtro) return false;
      return true;
    });
  }, [produtos, filtro]);

  const ordenaNome = (a, b) => a.nome.localeCompare(b.nome, 'pt', { sensitivity: 'base' });

  // "Você sempre pede": os comprados, em ordem alfabética
  const comprados = useMemo(() => matched.filter(p => p.comprado).slice().sort(ordenaNome), [matched]);

  // Demais produtos AGRUPADOS por categoria (na ordem do admin) e alfabéticos dentro
  const secoes = useMemo(() => {
    const base = filtro === 'recompra' ? [] : matched.filter(p => !p.comprado);
    const porGrupo = {};
    base.forEach(p => { const k = p.grupo || '_outros'; (porGrupo[k] = porGrupo[k] || []).push(p); });
    const ordem = grupos.map(g => g.id);
    return Object.keys(porGrupo)
      .sort((a, b) => (ordem.indexOf(a) === -1 ? 999 : ordem.indexOf(a)) - (ordem.indexOf(b) === -1 ? 999 : ordem.indexOf(b)))
      .map(id => ({
        id,
        nome: grupos.find(g => g.id === id)?.nome || 'Outros',
        produtos: porGrupo[id].slice().sort(ordenaNome),
      }));
  }, [matched, grupos, filtro]);

  const logout = () => { setToken(null); setCliente(null); setVisitante(null); setCart({}); setProdutos([]); };

  // Popup de ficha do produto (etiqueta)
  const [ficha, setFicha] = useState(null);
  const [fichaLoading, setFichaLoading] = useState(false);
  const abrirFicha = (p) => {
    setFichaLoading(true); setFicha({ nome: p.nome, imagem: p.imagem, imagens: p.imagens, codigo: p.codigo, _loading: true });
    publicApi.ficha(p.id).then(setFicha).catch(() => setFicha(null)).finally(() => setFichaLoading(false));
  };

  async function finalizar() {
    if (!hdr.dataEntrega) { setErroData('Escolha a data de entrega.'); return; }
    setErroEnvio(''); setEnviando(true);
    const itens = Object.keys(cart).map(id => ({ congeladosProdutoId: id, quantidade: cart[id] }));
    const payload = {
      itens,
      dataEntrega: hdr.dataEntrega || null,
      observacoes: hdr.obs || null,
      telefone: soDigitos(hdr.telefone) || (visitante?.telefone || ''),
    };
    if (visitante) payload.visitante = visitante;
    try {
      const pedido = await publicApi.criarPedido(payload);
      setConfirm(pedido);
      setCart({}); setOpen(false);
    } catch (e) {
      setErroEnvio(e?.response?.data?.error || e.message || 'Não foi possível enviar o pedido.');
    } finally { setEnviando(false); }
  }

  if (booting) return <div className="cg tex-board cong" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon n="cart" w={28} /></div>;


  // tela de confirmação
  if (confirm) {
    const linhas = (confirm.itens || []).map(it =>
      `• ${it.quantidade}x ${it.nomeProduto}\n   ${money(it.precoUnitario)} cada · ${money(it.precoUnitario * it.quantidade)}`
    ).join('\n');
    const caixas = confirm.totalCaixas || (confirm.itens || []).reduce((s, it) => s + (Number(it.quantidade) || 0), 0);
    const partes = [
      `*Pedido Hardt — Congelados #${confirm.numero}*`,
      `Olá! Fiz meu pedido pelo site, segue o resumo:`,
      ``,
      `Cliente: *${confirm.nomeCliente || ''}*`,
      confirm.documentoCliente ? `Documento: ${confirm.documentoCliente}` : null,
      confirm.telefoneCliente ? `WhatsApp: ${confirm.telefoneCliente}` : null,
      ``,
      `*Itens (${caixas} cx):*`,
      linhas,
      ``,
      confirm.condicaoNome ? `Pagamento: ${confirm.condicaoNome}` : null,
      confirm.dataEntrega
        ? `Entrega: ${dataBR(String(confirm.dataEntrega).slice(0, 10))}${confirm.encaixe ? ' (encaixe — a confirmar)' : ''}`
        : (confirm.diaEntrega ? `Entrega: ${confirm.diaEntrega}` : null),
      confirm.observacoes ? `Obs: ${confirm.observacoes}` : null,
      ``,
      `*Total: ${money(confirm.total)}*`,
      ``,
      confirm.encaixe ? 'Esta data é um encaixe — aguardo a equipe confirmar a viabilidade. Obrigado!' : 'Aguardo a confirmação. Obrigado!',
    ].filter(x => x !== null);
    const txt = encodeURIComponent(partes.join('\n'));
    const waLink = `https://wa.me/${whatsapp}?text=${txt}`;
    return (
      <div className="cg tex-board cong">
        <div className="cg-login"><div className="cg-login-card"><div className="sawtooth"></div>
          <div className="cg-login-in">
            <img className="logo" src={siteLogo} alt="Hardt" />
            <h1>Pedido registrado!</h1>
            <p className="sub">Seu pedido <b style={{ color: 'var(--green-dd)' }}>#{confirm.numero}</b> foi registrado{confirm.dataEntrega ? <> para <b style={{ color: 'var(--green-dd)' }}>{dataBR(String(confirm.dataEntrega).slice(0, 10))}</b></> : ''}. Para a loja já começar a separar, <b style={{ color: 'var(--green-dd)' }}>envie pelo seu WhatsApp</b> tocando no botão abaixo. O pagamento é combinado conforme a sua condição.</p>
            {confirm.encaixe && <p className="sub" style={{ marginTop: 6, color: 'var(--green-dd)' }}><b>Atenção:</b> essa data é um <b>encaixe</b> — a equipe vai confirmar a viabilidade da entrega e te avisar.</p>}
            <a className="btn btn-wa btn-block" href={waLink} target="_blank" rel="noreferrer" style={{ marginTop: 8 }}>
              <WhatsIcon w={19} /> Enviar pedido pelo WhatsApp
            </a>
            <button className="btn btn-yellow btn-block" onClick={() => setConfirm(null)} style={{ marginTop: 10 }}>Fazer outro pedido</button>
            <p className="cg-login-note"><Link to="/inicio">← voltar ao site</Link></p>
          </div>
        </div></div>
      </div>
    );
  }

  const nomeCurto = cliente?.nome || visitante?.nome || '';
  const gruposFiltro = [{ id: 'todos', nome: 'Todos' }, ...(cliente ? [{ id: 'recompra', nome: 'Recomprar' }] : []), ...grupos];

  return (
    <div className="cg tex-board cong">
      {/* TOPBAR */}
      <header className="cg-top">
        <div className="wrap cg-top-in">
          <div className="cg-brand">
            <img src={siteLogo} alt="Hardt" />
            <div className="who">
              <span className="who-label">Hardt Congelados</span>
              <b className="who-nome">{nomeCurto}</b>
            </div>
          </div>
          <div className="cg-top-actions">
            <Link to="/inicio" className="cg-pill" title="Página inicial">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              <span className="lbl">Início</span>
            </Link>
            <button className="cg-pill" onClick={logout} title="Sair">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              <span className="lbl">Sair</span>
            </button>
            <button className="cg-pill cg-pill-cart" onClick={() => setOpen(true)} title="Ver pedido">
              <Icon n="cart" w={17} />
              <span className="lbl">Pedido</span>
              {totals.boxes > 0 && <span className="badge">{totals.boxes}</span>}
            </button>
          </div>
        </div>
      </header>

      {/* CONTENT */}
      <main className="cg-catalog tex-paper">
        <div className="wrap" style={{ paddingBottom: 120 }}>
          {/* cabeçalho do cardápio: título + categorias (estilo Kit Festa) */}
          <div className="cg-cathead">
            <h2>Nosso cardápio</h2>
            <div className="cg-filters">
              {gruposFiltro.map(g => (
                <button key={g.id} className={'cg-chip' + (filtro === g.id ? ' on' : '')} onClick={() => setFiltro(g.id)}>{g.nome}</button>
              ))}
            </div>
          </div>

          {cliente && ultimoPedido.length > 0 && (
            <div className="cg-repeat">
              <span className="rt"><b>Seu último pedido</b> tem {ultimoPedido.length} {ultimoPedido.length === 1 ? 'item' : 'itens'}.</span>
              <button className="btn btn-green btn-sm" onClick={repetirUltimo}><Icon n="refresh" w={15} /> Repetir último pedido</button>
            </div>
          )}

          {matched.length === 0 && <div className="cg-empty">Nenhum salgado encontrado.</div>}

          {cliente && comprados.length > 0 && (
            <>
              <div className="cg-band-head"><span className="kx">Você sempre pede</span></div>
              <div className="cg-grid">
                {comprados.map(p => <Card key={p.id} p={p} preco={precoDe(p)} qty={qtyOf(p.id)} add={addItem} dec={removeItem} onAbrir={abrirFicha} />)}
              </div>
            </>
          )}

          {secoes.map(sec => (
            <React.Fragment key={sec.id}>
              <div className="cg-band-head"><h2>{sec.nome}</h2></div>
              <div className="cg-grid">
                {sec.produtos.map(p => <Card key={p.id} p={p} preco={precoDe(p)} qty={qtyOf(p.id)} add={addItem} dec={removeItem} onAbrir={abrirFicha} />)}
              </div>
            </React.Fragment>
          ))}
        </div>
      </main>

      <FinalSite cfg={cfg} logo={siteLogo} />

      {/* mobile fab */}
      <div className={'cg-fab' + (totals.boxes > 0 && !open ? ' show' : '')}>
        <button className="btn btn-yellow btn-block" onClick={() => setOpen(true)}>
          Ver pedido · {totals.boxes} {totals.boxes === 1 ? 'item' : 'itens'} · {money(totals.subtotal)}
        </button>
      </div>

      {/* DRAWER */}
      <div className={'cg-overlay' + (open ? ' open' : '')} onClick={() => setOpen(false)}></div>
      <aside className={'cg-drawer' + (open ? ' open' : '')}>
        <div className="cg-dhead">
          <Icon n="cart" w={20} />
          <h3>Seu pedido</h3>
          <button className="x" onClick={() => setOpen(false)}><Icon n="x" w={18} /></button>
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
                const cimg = imgUrl(p.imagem);
                return (
                  <div className="cg-citem" key={id}>
                    <div className="cthumb" style={!cimg ? { background: tileGradient(p.codigo || p.nome) } : undefined}>
                      {cimg && <img src={cimg} alt="" />}
                    </div>
                    <div className="cinfo">
                      <div className="cn">{p.nome}</div>
                      <div className="cp">{money(precoDe(p))}{p.unidades ? ` · ${p.unidades}un` : ` · ${p.embalagem || 'caixa'}`}</div>
                    </div>
                    <div className="cg-ministep">
                      <button onClick={() => removeItem(id)}><Icon n="minus" w={14} /></button>
                      <span className="q">{cart[id]}</span>
                      <button onClick={() => addItem(id)}><Icon n="plus" w={14} /></button>
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

                <h4>Data de entrega</h4>
                {hdr.dataEntrega && !trocarData ? (
                  <div className="cg-delivery">
                    <div className="dd"><b>{dataBR(hdr.dataEntrega)}</b><span>{diaSemanaISO(hdr.dataEntrega)}</span></div>
                    <button type="button" className="cg-trocar" onClick={() => setTrocarData(true)}>trocar data</button>
                  </div>
                ) : (
                  <>
                    <input type="date" className="cg-select" min={amanhaISO} value={hdr.dataEntrega || ''}
                      onChange={e => escolherData(e.target.value)} />
                    {sugeridaISO && trocarData && (
                      <button type="button" className="cg-trocar" style={{ marginTop: 6 }}
                        onClick={() => { setErroData(''); setHdr(h => ({ ...h, dataEntrega: sugeridaISO })); setTrocarData(false); }}>
                        usar data sugerida ({dataBR(sugeridaISO)})
                      </button>
                    )}
                  </>
                )}
                {erroData && <p className="cg-minwarn"><Icon n="tag" w={13} /> {erroData}</p>}
                {hdr.dataEntrega && ehEncaixe && (
                  <p className="cg-encaixe"><Icon n="tag" w={13} /> Pedido <b>encaixe</b>: a equipe vai confirmar a viabilidade da entrega nessa data.</p>
                )}

                {!cliente?.temCadastroApp && (
                  <>
                    <h4>Telefone (WhatsApp)</h4>
                    <input className="cg-select" value={hdr.telefone} onChange={e => setHdr({ ...hdr, telefone: e.target.value })} placeholder="(47) 9 9999-9999" />
                  </>
                )}

                <h4>Observações <span style={{ color: 'var(--chalk-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></h4>
                <textarea className="cg-textarea" placeholder="Horário, doca, alguma observação..." value={hdr.obs} onChange={e => setHdr({ ...hdr, obs: e.target.value })} />
              </div>
            </>
          )}
        </div>

        {totals.boxes > 0 && (
          <div className="cg-dfoot">
            <div className="cg-totrow"><span>Subtotal ({totals.boxes} {totals.boxes === 1 ? 'item' : 'itens'})</span><b>{money(totals.subtotal)}</b></div>
            <div className="cg-totrow grand"><span>Total</span><b>{money(totals.subtotal)}</b></div>
            {below && <p className="cg-minwarn"><Icon n="tag" w={13} /> Pedido mínimo de {money(minimo)} para esta condição — faltam {money(minimo - totals.subtotal)}.</p>}
            {erroEnvio && <p className="cg-minwarn"><Icon n="tag" w={13} /> {erroEnvio}</p>}
            <button className="btn btn-wa btn-block cg-cta" disabled={below || enviando || !hdr.dataEntrega} onClick={finalizar}>
              <Icon n="check" w={18} /> {enviando ? 'Enviando…' : !hdr.dataEntrega ? 'Escolha a data de entrega' : 'Enviar pedido pelo WhatsApp'}
            </button>
            <p className="cg-login-note" style={{ marginTop: 10 }}>Pagamento combinado depois, conforme sua condição — nada é cobrado online.</p>
          </div>
        )}
      </aside>

      {loginModal && !logado && (
        <div className="cg-fmodal-ov" style={{ alignItems: 'center' }} onClick={(e) => e.target === e.currentTarget && setLoginModal(false)}>
          <Login
            logo={siteLogo}
            whatsapp={whatsapp}
            titulo={cfg?.congelados?.loginTitulo || 'Entrar para comprar'}
            sub={cfg?.congelados?.loginSub || 'Faça login para adicionar produtos ao pedido e ver seu histórico.'}
            onLogin={(c) => { setCliente(c); setLoginModal(false); }}
            onVisitante={(v) => { setVisitante(v); setLoginModal(false); }}
          />
        </div>
      )}

      {ficha && <FichaModal ficha={ficha} onClose={() => setFicha(null)} />}
    </div>
  );
}

/* ============== FICHA (popup do produto) ============== */
function FichaModal({ ficha, onClose }) {
  const imgs = (ficha.imagens?.length ? ficha.imagens : (ficha.imagem ? [ficha.imagem] : [])).map(imgUrl);
  const [idx, setIdx] = useState(0);
  const cur = imgs.length ? idx % imgs.length : 0;
  const multi = imgs.length > 1;
  const prev = (e) => { e.stopPropagation(); setIdx(i => (i - 1 + imgs.length) % imgs.length); };
  const next = (e) => { e.stopPropagation(); setIdx(i => (i + 1) % imgs.length); };
  const et = ficha.etiqueta;
  const nut = et?.nutricional || {};
  const pesoPorc = Number(et?.pesoPorcao) || 0;
  // linhas da tabela nutricional (padrão ANVISA) — dec=casas decimais, indent=recuo
  const linhasNut = [
    { label: 'Valor energético (kcal)',  raw: nut.valorEnergetico,     dec: 0, indent: 0 },
    { label: 'Carboidratos totais (g)',  raw: nut.carboidratos,        dec: 1, indent: 0 },
    { label: 'Açúcares totais (g)',      raw: nut.acucaresTotais,      dec: 1, indent: 1, always: true },
    { label: 'Açúcares adicionados (g)', raw: nut.acucaresAdicionados, dec: 1, indent: 2, always: true },
    { label: 'Proteínas (g)',            raw: nut.proteinas,           dec: 1, indent: 0 },
    { label: 'Gorduras totais (g)',      raw: nut.gordurasTotais,      dec: 1, indent: 0 },
    { label: 'Gorduras saturadas (g)',   raw: nut.gordurasSaturadas,   dec: 1, indent: 1 },
    { label: 'Gorduras trans (g)',       raw: nut.gordurasTrans,       dec: 1, indent: 1 },
    { label: 'Fibras alimentares (g)',   raw: nut.fibraAlimentar,      dec: 1, indent: 0 },
    { label: 'Sódio (mg)',               raw: nut.sodio,               dec: 0, indent: 0 },
  ].filter(r => r.always || r.raw);
  const temNut = pesoPorc > 0 && linhasNut.some(r => r.raw);
  // declaração de alérgenos (mesma lógica da etiqueta impressa: espécie p/ crustáceos/peixes)
  const alergenos = (Array.isArray(et?.alergenos) ? et.alergenos.filter(Boolean) : []).map(a => {
    if (a === 'Crustáceos' && et.especieCrustaceos) return `${a} (${et.especieCrustaceos})`;
    if (a === 'Peixes' && et.especiePeixes) return `${a} (${et.especiePeixes})`;
    return a;
  });

  return (
    <div className="cg-fmodal-ov" onClick={onClose}>
      <div className="cg-fmodal" onClick={e => e.stopPropagation()}>
        <button className="cg-fclose" onClick={onClose}><Icon n="x" w={18} /></button>
        <div className="cg-fhero" style={!imgs.length ? { background: tileGradient(ficha.codigo || ficha.nome) } : undefined}>
          {imgs.length ? (
            <div className="cg-fslides" style={{ transform: `translateX(-${cur * 100}%)` }}>
              {imgs.map((u, i) => <img key={i} src={u} alt={ficha.nome} />)}
            </div>
          ) : <span className="noimg">foto · {ficha.nome}</span>}
          {multi && (
            <>
              <button className="cg-farrow left" onClick={prev} aria-label="Imagem anterior">‹</button>
              <button className="cg-farrow right" onClick={next} aria-label="Próxima imagem">›</button>
              <div className="cg-fdots">{imgs.map((_, i) => <span key={i} className={i === cur ? 'on' : ''} onClick={(e) => { e.stopPropagation(); setIdx(i); }} />)}</div>
            </>
          )}
        </div>
        <div className="cg-fhead">
          <div className="cg-fhead-info">
            <h2>{ficha.nome}</h2>
            {ficha.grupoNome && <span className="cg-ftag">{ficha.grupoNome}</span>}
            <p className="cg-fmeta">
              {(ficha.embalagem || 'caixa')}{ficha.unidades ? ` · ${ficha.unidades} un` : ''}{et?.pesoUnitario ? ` · ${et.pesoUnitario}g/un` : ''}
            </p>
          </div>
        </div>

        {ficha._loading ? (
          <p className="cg-floading">Carregando informações…</p>
        ) : (
          <div className="cg-fbody thin-scroll">
            {ficha.descricao && <p className="cg-fdesc">{ficha.descricao}</p>}

            {!et && <p className="cg-fnodata">Ficha técnica deste produto ainda não cadastrada.</p>}

            {et && (
              <>
                {/* Tabela nutricional — padrão ANVISA (IN 75/2020) */}
                {temNut && (
                  <div className="cg-fsec">
                    <div className="cg-nut">
                      <div className="cg-nut-cab">Informação Nutricional</div>
                      <table className="cg-nut-tb">
                        <colgroup><col style={{ width: '44%' }} /><col style={{ width: '18%' }} /><col style={{ width: '24%' }} /><col style={{ width: '14%' }} /></colgroup>
                        <tbody>
                          <tr className="porc"><td colSpan={4}>Porções por embalagem: {et.quantidadeEmbalagem}{et.quantidadeAproximada ? '±' : ''} porções<br />Porção: {pesoPorc} g (1 unidade)</td></tr>
                          <tr className="rule"><td colSpan={4}><div className="thick" /></td></tr>
                          <tr className="hdr"><td></td><td>100 g</td><td>Porção {pesoPorc} g</td><td>%VD*</td></tr>
                          {linhasNut.map(r => {
                            const porc = parseValor(r.raw);
                            const cem = (porc != null && pesoPorc) ? (porc / pesoPorc) * 100 : null;
                            const vd = parseVD(r.raw);
                            const ind = r.indent === 1 ? 'ind1' : r.indent === 2 ? 'ind2' : '';
                            return (
                              <tr className="body-row" key={r.label}>
                                <td className={ind}>{r.label}</td>
                                <td className="val">{fmtNum(cem, r.dec)}</td>
                                <td className="val">{fmtNum(porc, r.dec)}</td>
                                <td className="val">{vd != null ? vd : '—'}</td>
                              </tr>
                            );
                          })}
                          <tr className="nota"><td colSpan={4}>*Percentual de valores diários fornecidos pela porção.</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Ingredientes + declaração de alérgenos */}
                {et.composicao && (
                  <div className="cg-fsec">
                    <h4>Ingredientes</h4>
                    <div className="cg-declar">
                      <div className="ing">{et.composicao}</div>
                      <div className="alert">
                        {et.contemGluten ? 'CONTÉM GLÚTEN' : 'NÃO CONTÉM GLÚTEN'}
                        {et.contemLactose ? ' · CONTÉM LACTOSE' : ''}
                        {alergenos.length > 0 ? ` · ALÉRGICOS: CONTÉM ${alergenos.join(', ').toUpperCase()}.` : ''}
                        {et.avisosRotulo ? ` ${String(et.avisosRotulo).toUpperCase()}` : ''}
                      </div>
                    </div>
                  </div>
                )}

                {/* Modo de preparo (depois dos ingredientes) */}
                {et.modoPreparo && (
                  <div className="cg-fsec">
                    <h4>Modo de preparo</h4>
                    <p>{et.modoPreparo}</p>
                  </div>
                )}

                {/* Validade + conservação no final */}
                {(et.validadeDias != null || et.armazenamento) && (
                  <div className="cg-fgrid cg-fgrid-2">
                    {et.validadeDias != null && <div className="cg-fcard"><b>{et.validadeDias} dias</b><span>validade</span></div>}
                    {et.armazenamento && <div className="cg-fcard"><b>{et.armazenamento}</b><span>conservação</span></div>}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        <div className="cg-ffoot">
          <button className="btn btn-yellow btn-block" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

/* ============== CARD ============== */
function Card({ p, preco, qty, add, dec, onAbrir }) {
  const imgs = (p.imagens?.length ? p.imagens : (p.imagem ? [p.imagem] : [])).map(imgUrl);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (imgs.length < 2) return;
    const t = setInterval(() => setIdx(i => (i + 1) % imgs.length), 2600);
    return () => clearInterval(t);
  }, [imgs.length]);
  const cur = imgs.length ? idx % imgs.length : 0;
  const emb = p.embalagem || 'caixa';
  return (
    <article className="cg-card">
      <div className="ph" style={!imgs.length ? { background: tileGradient(p.codigo || p.nome) } : undefined}
        onClick={() => onAbrir && onAbrir(p)} role="button" title="Ver detalhes do produto">
        {(p.comprado) && <div className="tagrow"><span className="tg bought">Você compra</span></div>}
        {imgs.length ? (
          <div className="cg-slides" style={{ transform: `translateX(-${cur * 100}%)` }}>
            {imgs.map((u, i) => <img key={i} src={u} alt={p.nome} loading="lazy" />)}
          </div>
        ) : <div className="noimg">foto · {p.nome}</div>}
        {imgs.length > 1 && (
          <div className="cg-dots">{imgs.map((_, i) => <span key={i} className={i === cur ? 'on' : ''} />)}</div>
        )}
        <span className="cg-ver">ver detalhes</span>
      </div>
      <div className="cg-card-body">
        <h3 onClick={() => onAbrir && onAbrir(p)} style={{ cursor: 'pointer' }}>{p.nome}</h3>
        <span className="cx">{emb}{p.unidades ? ` · ${p.unidades} un` : ''}</span>
        {p.preparo && <span className="cg-prep">{p.preparo}</span>}
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

/* ---------- Final padrão (igual à home/Kit Festa): contato + mapa + rodapé simples ---------- */
function FinalSite({ cfg, logo }) {
  const l = cfg?.loja || {};
  const wa = `https://wa.me/${l.whatsapp || '5547988548476'}`;
  const waMsg = `${wa}?text=${encodeURIComponent('Olá! Vim pelo site da Hardt e gostaria de fazer um pedido.')}`;
  const social = (v, base) => !v ? null : (String(v).startsWith('http') ? v : `${base}${String(v).replace(/^@/, '')}`);
  const igUrl = social(l.instagram, 'https://instagram.com/');
  const fbUrl = social(l.facebook, 'https://facebook.com/');
  const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent(String(l.endereco || '').replace(' — ', ', '))}&output=embed`;
  return (
    <div className="cg-fim">
      <section className="section" id="contato">
        <div className="wrap contact">
          <div className="contact-card">
            <div className="contact-top">
              <div className="contact-rows">
                <div className="contact-row"><div><div className="lab">Onde estamos</div><div className="val" dangerouslySetInnerHTML={{ __html: String(l.endereco || '').replace(' — ', '<br/>') }} /></div></div>
                <div className="contact-row"><div><div className="lab">WhatsApp</div><a className="val val-big" href={waMsg} target="_blank" rel="noopener noreferrer">{l.telefone}</a></div></div>
                {l.email && <div className="contact-row"><div><div className="lab">E-mail</div><a className="val" href={`mailto:${l.email}`}>{l.email}</a></div></div>}
              </div>
              {(igUrl || fbUrl) && (
                <div className="contact-social">
                  <div className="lab">Redes sociais</div>
                  <div className="social-links">
                    {igUrl && (
                      <a className="soc" href={igUrl} target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>
                        <span>{l.instagram && !String(l.instagram).startsWith('http') ? `@${String(l.instagram).replace(/^@/, '')}` : 'Instagram'}</span>
                      </a>
                    )}
                    {fbUrl && (
                      <a className="soc" href={fbUrl} target="_blank" rel="noopener noreferrer" aria-label="Facebook">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z" /></svg>
                        <span>Facebook</span>
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="hero-cta contact-cta">
              <a className="btn btn-wa" href={waMsg} target="_blank" rel="noopener noreferrer">WhatsApp</a>
              <Link className="btn btn-yellow" to="/kit-festa">Kit-Festa</Link>
              <Link className="btn btn-ghost" to="/congelados">Congelados</Link>
            </div>
          </div>
          <div className="contact-map">
            <iframe title="Localização da Hardt no mapa" src={mapSrc} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
          </div>
        </div>
      </section>
      <div className="sawtooth"></div>
      <footer className="foot">
        <div className="wrap foot-simple-in">
          <img className="foot-mark" src={logo || LOGO} alt="Hardt" />
          <span>Hardt Doces e Salgados Ltda® — Todos os direitos reservados.</span>
        </div>
      </footer>
    </div>
  );
}
