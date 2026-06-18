import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import publicApi, { getToken, setToken } from './api';
import { Icon } from './icons';
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

  const [hdr, setHdr] = useState({ tabelaPrecoId: '', dia: '', obs: '', telefone: '' });

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
    setFichaLoading(true); setFicha({ nome: p.nome, imagem: p.imagem, _loading: true });
    publicApi.ficha(p.id).then(setFicha).catch(() => setFicha(null)).finally(() => setFichaLoading(false));
  };

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
      setConfirm(pedido);
      setCart({}); setOpen(false);
    } catch (e) {
      setErroEnvio(e?.response?.data?.error || e.message || 'Não foi possível enviar o pedido.');
    } finally { setEnviando(false); }
  }

  if (booting) return <div className="cg tex-board" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon n="cart" w={28} /></div>;


  // tela de confirmação
  if (confirm) {
    return (
      <div className="cg tex-board">
        <div className="cg-login"><div className="cg-login-card"><div className="sawtooth"></div>
          <div className="cg-login-in">
            <img className="logo" src={siteLogo} alt="Hardt" />
            <h1>Pedido enviado!</h1>
            <p className="sub">Recebemos seu pedido <b style={{ color: 'var(--chalk)' }}>#{confirm.numero}</b>. Você vai receber a confirmação no seu <b style={{ color: 'var(--chalk)' }}>WhatsApp</b>. Nossa equipe combina o pagamento conforme a sua condição.</p>
            <button className="btn btn-yellow btn-block" onClick={() => setConfirm(null)} style={{ marginTop: 8 }}>Fazer outro pedido</button>
            <p className="cg-login-note"><Link to="/inicio" style={{ color: 'var(--chalk-dim)' }}>← voltar ao site</Link></p>
          </div>
        </div></div>
      </div>
    );
  }

  const nomeCurto = cliente?.nome || visitante?.nome || '';
  const gruposFiltro = [{ id: 'todos', nome: 'Todos' }, ...(cliente ? [{ id: 'recompra', nome: 'Recomprar' }] : []), ...grupos];

  return (
    <div className="cg tex-board">
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
            <button className="btn btn-wa btn-block cg-cta" disabled={below || enviando} onClick={finalizar}>
              <Icon n="check" w={18} /> {enviando ? 'Enviando…' : 'Enviar pedido pelo WhatsApp'}
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
  const img = imgUrl(ficha.imagem);
  const et = ficha.etiqueta;
  const nut = et?.nutricional || {};
  const linhasNut = [
    ['Valor energético', nut.valorEnergetico], ['Carboidratos', nut.carboidratos], ['Proteínas', nut.proteinas],
    ['Gorduras totais', nut.gordurasTotais], ['Gorduras saturadas', nut.gordurasSaturadas], ['Gorduras trans', nut.gordurasTrans],
    ['Fibra alimentar', nut.fibraAlimentar], ['Sódio', nut.sodio],
  ].filter(([, v]) => v);
  const alerg = et?.alergenos || {};
  const listaAlerg = [alerg.leite && 'leite', alerg.gluten && 'glúten', alerg.ovo && 'ovo', alerg.outros].filter(Boolean).join(', ');

  return (
    <div className="cg-fmodal-ov" onClick={onClose}>
      <div className="cg-fmodal" onClick={e => e.stopPropagation()}>
        <button className="cg-fclose" onClick={onClose}><Icon n="chevRight" w={18} /></button>
        <div className="cg-fhead">
          <div className="cg-fimg" style={!img ? { background: tileGradient(ficha.codigo || ficha.nome) } : undefined}>
            {img ? <img src={img} alt={ficha.nome} /> : <span className="noimg">foto · {ficha.nome}</span>}
          </div>
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
                <div className="cg-fgrid">
                  {et.validadeDias != null && <div className="cg-fcard"><b>{et.validadeDias} dias</b><span>validade</span></div>}
                  {et.armazenamento && <div className="cg-fcard"><b>{et.armazenamento}</b><span>conservação</span></div>}
                  {et.quantidadeEmbalagem != null && <div className="cg-fcard"><b>{et.quantidadeEmbalagem}{et.quantidadeAproximada ? '±' : ''} un</b><span>por embalagem</span></div>}
                </div>

                {et.modoPreparo && (
                  <div className="cg-fsec">
                    <h4>Modo de preparo</h4>
                    <p>{et.modoPreparo}</p>
                  </div>
                )}

                {linhasNut.length > 0 && (
                  <div className="cg-fsec">
                    <h4>Informação nutricional {et.pesoPorcao ? <span className="cg-fporc">porção {et.pesoPorcao}g</span> : null}</h4>
                    <table className="cg-ftable">
                      <tbody>{linhasNut.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody>
                    </table>
                  </div>
                )}

                {et.composicao && (
                  <div className="cg-fsec">
                    <h4>Ingredientes</h4>
                    <p>{et.composicao}</p>
                  </div>
                )}

                {(listaAlerg || alerg.avisos) && (
                  <div className="cg-fsec">
                    <h4>Alérgicos</h4>
                    {listaAlerg && <p>Contém: {listaAlerg}.</p>}
                    {alerg.avisos && <p style={{ color: 'var(--chalk-dim)' }}>{alerg.avisos}</p>}
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
  const img = imgUrl(p.imagem);
  const emb = p.embalagem || 'caixa';
  return (
    <article className="cg-card">
      <div className="ph" style={!img ? { background: tileGradient(p.codigo || p.nome) } : undefined}
        onClick={() => onAbrir && onAbrir(p)} role="button" title="Ver detalhes do produto">
        {(p.comprado) && <div className="tagrow"><span className="tg bought">Você compra</span></div>}
        {img ? <img src={img} alt={p.nome} loading="lazy" /> : <div className="noimg">foto · {p.nome}</div>}
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
