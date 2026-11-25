import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import publicApi, { getToken, setToken } from './api';
import { Icon, WhatsIcon, InstagramIcon, FacebookIcon } from './icons';
import Login from './Login';
import FalarVendedor from './FalarVendedor';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import { lojaDe, socialUrl } from './siteUtil';
import './siteBase.css';
import './site.css';
import { API_URL } from '../../services/api';
import { useVisitorPing } from '../../hooks/useVisitorPing';

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

  const [cart, setCart] = useState(() => { try { return JSON.parse(localStorage.getItem('cg_cart') || '{}') || {}; } catch { return {}; } });
  const [filtro, setFiltro] = useState('todos');
  const [busca, setBusca] = useState('');        // busca por texto: NÃO é persistida de propósito
  const [preparo, setPreparo] = useState('todos'); // sub-filtro de preparo: aplicado no navegador (client-side), vale para visitante e cliente
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [enviando, setEnviando] = useState(false);
  // trava SÍNCRONA contra clique/toque duplo em "Enviar pedido" (o state só atualiza no próximo render)
  const enviandoRef = useRef(false);
  const [erroEnvio, setErroEnvio] = useState('');
  const [loginModal, setLoginModal] = useState(false);

  const [hdr, setHdr] = useState({ tabelaPrecoId: '', dia: '', obs: '', telefone: '', dataEntrega: '', modo: 'entrega' });
  const [trocarData, setTrocarData] = useState(false);
  const [erroData, setErroData] = useState('');

  const logado = cliente || visitante;
  const [searchParams, setSearchParams] = useSearchParams();
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

  // "Minha área" vindo de outra página (/congelados?entrar=1): abre o login (só se deslogado)
  // e limpa o parâmetro da URL.
  useEffect(() => {
    if (booting || !searchParams.has('entrar')) return;
    if (!logado) setLoginModal(true);
    const n = new URLSearchParams(searchParams); n.delete('entrar');
    setSearchParams(n, { replace: true });
  }, [booting, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Salva o carrinho (sobrevive a refresh). Guarda só as quantidades — o preço é
  // sempre lido do catálogo ao vivo, então mudança de preço atualiza sozinha.
  useEffect(() => { try { localStorage.setItem('cg_cart', JSON.stringify(cart)); } catch {} }, [cart]);
  // Reconcilia: remove do carrinho os itens que saíram do catálogo (produto inativado/fora do site).
  useEffect(() => {
    if (!produtos.length) return;
    setCart(c => {
      let mudou = false; const valido = {};
      Object.keys(c).forEach(id => { if (produtos.some(p => p.id === id)) valido[id] = c[id]; else mudou = true; });
      return mudou ? valido : c;
    });
  }, [produtos]);

  useVisitorPing('congelados', Object.keys(cart).length > 0);

  const qtyOf = (id) => cart[id] || 0;
  const limparCarrinho = () => { if (window.confirm('Esvaziar o carrinho?')) { setCart({}); setOpen(false); } };
  const addItem = (id) => {
    if (!logado) { setLoginModal(true); return; }
    if (produtos.find(p => p.id === id)?.indisponivel) return; // sem estoque: não adiciona
    setCart(c => ({ ...c, [id]: (c[id] || 0) + 1 }));
  };
  const removeItem = (id) => setCart(c => { const n = { ...c }; const v = (n[id] || 0) - 1; if (v <= 0) delete n[id]; else n[id] = v; return n; });
  const delItem = (id) => setCart(c => { const n = { ...c }; delete n[id]; return n; }); // remove o item inteiro

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
  // Item sem estoque parado no carrinho (ex.: ficou indisponível depois de adicionado) — bloqueia o envio.
  const carrinhoIndisp = Object.keys(cart).some(id => produtos.find(p => p.id === id)?.indisponivel);

  // ── Data de entrega: sugere o próximo dia regular do cadastro; senão, calendário ──
  const amanhaISO = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 1); return ISO(d); }, []);
  const sugeridaISO = useMemo(() => {
    const nums = cliente?.diasEntregaNums || [];
    if (!nums.length) return '';
    const t = new Date(); t.setHours(0, 0, 0, 0);
    for (let i = 1; i <= 28; i++) { const d = new Date(t); d.setDate(t.getDate() + i); if (nums.includes(d.getDay())) return ISO(d); }
    return '';
  }, [cliente]);
  // só sugere o dia regular do cadastro quando é ENTREGA (retirada o cliente escolhe)
  useEffect(() => { if (sugeridaISO && hdr.modo === 'entrega') setHdr(h => (h.dataEntrega ? h : { ...h, dataEntrega: sugeridaISO })); }, [sugeridaISO, hdr.modo]);
  // "encaixe": só na ENTREGA, quando a data foge dos dias regulares do cliente
  const ehEncaixe = hdr.modo === 'entrega' && !!hdr.dataEntrega && !(cliente?.diasEntregaNums || []).includes(weekdayISO(hdr.dataEntrega));
  const escolherData = (iso) => {
    if (!iso) { setErroData(''); setHdr(h => ({ ...h, dataEntrega: '' })); return; }
    const palavra = hdr.modo === 'retirada' ? 'retirada' : 'entrega';
    if (iso < amanhaISO) { setErroData(`A data de ${palavra} deve ser a partir de amanhã.`); return; }
    const wd = weekdayISO(iso);
    // retirada não considera o dia regular do cadastro
    const regular = hdr.modo === 'entrega' && (cliente?.diasEntregaNums || []).includes(wd);
    if (!regular) {
      if (wd === 0 && !cfg?.entregas?.domingo) { setErroData(`Não atendemos ${palavra} aos domingos.`); return; }
      if (wd === 6 && !cfg?.entregas?.sabado) { setErroData(`Não atendemos ${palavra} aos sábados.`); return; }
    }
    setErroData(''); setHdr(h => ({ ...h, dataEntrega: iso })); setTrocarData(false);
  };
  const setModo = (m) => {
    setErroData(''); setTrocarData(false);
    // entrega → sugere o dia regular; retirada → limpa para o cliente escolher
    setHdr(h => ({ ...h, modo: m, dataEntrega: m === 'entrega' ? sugeridaISO : '' }));
  };

  const repetirUltimo = () => {
    const novo = {};
    // ignora produto fora do site ou sem estoque (indisponível)
    ultimoPedido.forEach(it => { const p = produtos.find(x => x.id === it.congeladosProdutoId); if (p && !p.indisponivel) novo[it.congeladosProdutoId] = it.quantidade; });
    setCart(novo);
    setOpen(true);
  };

  // filtros por categoria
  const semAcento = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const matched = useMemo(() => {
    const q = semAcento(busca).trim();
    return produtos.filter(p => {
      if (filtro === 'recompra') { if (!p.comprado) return false; }
      else if (filtro !== 'todos' && p.grupo !== filtro) return false;
      if (preparo !== 'todos' && p.preparo !== preparo) return false;
      if (q && !(semAcento(p.nome).includes(q) || semAcento(p.codigo).includes(q) || semAcento(p.grupoNome).includes(q))) return false;
      return true;
    });
  }, [produtos, filtro, preparo, busca]);

  // opções de preparo = os valores reais que aparecem nos produtos (ordem de preferência)
  const preparosDisponiveis = useMemo(() => {
    const pref = ['Para fritar', 'Para assar', 'Assar ou aquecer', 'Somente Aquecer'];
    const set = Array.from(new Set(produtos.map(p => p.preparo).filter(Boolean)));
    const rank = (v) => { const i = pref.findIndex(x => semAcento(x) === semAcento(v)); return i === -1 ? 99 : i; };
    return set.sort((a, b) => rank(a) - rank(b) || String(a).localeCompare(String(b), 'pt'));
  }, [produtos]);

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

  const logout = () => {
    setToken(null); setCliente(null); setVisitante(null); setCart({}); setUltimoPedido([]); setFiltro('todos'); setBusca(''); setPreparo('todos');
    // recarrega o catálogo público (preços do site) para não ficar tela vazia
    publicApi.catalogo().then(setProdutos).catch(() => setProdutos([]));
    publicApi.grupos().then(setGrupos).catch(() => {});
  };

  // Popup de ficha do produto (etiqueta)
  const [ficha, setFicha] = useState(null);
  const [fichaLoading, setFichaLoading] = useState(false);
  const abrirFicha = (p) => {
    setFichaLoading(true); setFicha({ id: p.id, nome: p.nome, imagem: p.imagem, imagens: p.imagens, codigo: p.codigo, _loading: true });
    publicApi.ficha(p.id).then(setFicha).catch(() => setFicha(null)).finally(() => setFichaLoading(false));
  };

  async function finalizar() {
    if (enviandoRef.current) return; // 2º toque rápido: o 1º ainda está enviando
    if (!hdr.dataEntrega) { setErroData('Escolha a data de entrega.'); return; }
    enviandoRef.current = true;
    setErroEnvio(''); setEnviando(true);
    const itens = Object.keys(cart).map(id => ({ congeladosProdutoId: id, quantidade: cart[id] }));
    const payload = {
      itens,
      dataEntrega: hdr.dataEntrega || null,
      modo: hdr.modo || 'entrega',
      observacoes: hdr.obs || null,
      telefone: soDigitos(hdr.telefone) || (visitante?.telefone || ''),
    };
    if (visitante) payload.visitante = visitante;
    try {
      const pedido = await publicApi.criarPedido(payload);
      setConfirm(pedido);
      setCart({}); setOpen(false);
      // sucesso: a trava (enviandoRef) fica ligada de propósito; só é liberada em "Fazer outro pedido"
      setEnviando(false);
    } catch (e) {
      setErroEnvio(e?.response?.data?.error || e.message || 'Não foi possível enviar o pedido.');
      enviandoRef.current = false; setEnviando(false); // erro: libera para o cliente tentar de novo
    }
  }

  if (booting) return <div className="hd cg cg-boot"><Icon n="cart" w={28} /></div>;

  const nomeCurto = cliente?.nome || visitante?.nome || '';
  const sessaoHdr = { nome: nomeCurto, onEntrar: () => setLoginModal(true), onSair: logout };
  const acaoVendedor = <FalarVendedor cliente={cliente} whatsapp={whatsapp} variant="pill" />;

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
        ? `${confirm.modo === 'retirada' ? 'Retirada na loja' : 'Entrega'}: ${dataBR(String(confirm.dataEntrega).slice(0, 10))}${confirm.encaixe ? ' (encaixe — a confirmar)' : ''}`
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
      <div className="hd cg">
        <SiteHeader ativo="congelados" logo={siteLogo} cfg={cfg} sessao={sessaoHdr} acoes={acaoVendedor} />
        <main className="cg-confirm">
          <div className="cg-confirm-card">
            <img className="cg-confirm-logo" src={siteLogo} alt="Hardt" />
            <h1>Pedido registrado!</h1>
            <p className="cg-confirm-sub">Seu pedido <b>#{confirm.numero}</b> foi registrado{confirm.dataEntrega ? <> para <b>{confirm.modo === 'retirada' ? 'retirada' : 'entrega'} em {dataBR(String(confirm.dataEntrega).slice(0, 10))}</b></> : ''}. Para a loja já começar a separar, <b>envie pelo seu WhatsApp</b> tocando no botão abaixo. O pagamento é combinado conforme a sua condição.</p>
            {confirm.encaixe && <p className="cg-confirm-sub cg-confirm-enc"><b>Atenção:</b> essa data é um <b>encaixe</b> — a equipe vai confirmar a viabilidade da entrega e te avisar.</p>}
            <a className="hd-btn hd-btn-lg cg-block" href={waLink} target="_blank" rel="noreferrer">
              <WhatsIcon w={19} /> Enviar pedido pelo WhatsApp
            </a>
            <button type="button" className="hd-btn hd-btn-outline hd-btn-lg cg-block" onClick={() => { enviandoRef.current = false; setConfirm(null); }}>Fazer outro pedido</button>
            <p className="cg-confirm-note"><Link to="/inicio">← voltar ao site</Link></p>
          </div>
        </main>
        <SiteFooter cfg={cfg} logo={siteLogo} />
      </div>
    );
  }

  const gruposFiltro = [{ id: 'todos', nome: 'Todos' }, ...(cliente ? [{ id: 'recompra', nome: 'Recomprar' }] : []), ...grupos];
  const ficaProdAtual = ficha ? produtos.find(x => x.id === ficha.id) : null;
  const adicionarDaFicha = (id) => { if (!logado) setFicha(null); addItem(id); }; // login abre fora do dialog

  return (
    <div className="hd cg">
      <SiteHeader
        ativo="congelados" logo={siteLogo} cfg={cfg}
        sessao={sessaoHdr}
        carrinho={{ qtd: totals.boxes, onAbrir: () => setOpen(true) }}
        acoes={acaoVendedor}
      />

      <main className="cg-main">
        <section className="cg-banner">
          <div className="hd-wrap">
            {!logado ? (
              <div className="cg-banner-actions">
                <button type="button" className="hd-btn hd-btn-lg cg-btn-2" onClick={() => setLoginModal(true)}>
                  <span><b>Entrar com meu cadastro</b><small>Minha área — Já sou cliente</small></span>
                </button>
                <FalarVendedor cliente={cliente} whatsapp={whatsapp} variant="botao" />
              </div>
            ) : (
              <div className="cg-logbar">
                <div className="cg-logbar-info">
                  <b>{nomeCurto}</b>
                  <span>{cliente ? (condPadrao?.nome ? `Condição: ${condPadrao.nome}` : 'Cliente cadastrado') : 'Pedido como visitante'}</span>
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="hd-wrap cg-catalog">
          {/* cabeçalho do cardápio: título + categorias (existe hoje) */}
          <div className="cg-toolbar">
            <div className="cg-toolbar-top">
              <h2 className="cg-cathead-tit">Nosso cardápio</h2>
              <div className="cg-filters" role="group" aria-label="Categorias">
                {gruposFiltro.map(g => (
                  <button key={g.id} type="button" className="cg-chip" aria-pressed={filtro === g.id} onClick={() => setFiltro(g.id)}>{g.nome}</button>
                ))}
              </div>
              <label className="cg-search">
                <Icon n="search" w={16} />
                <input type="search" className="cg-search-in" placeholder="Buscar produto ou código..." aria-label="Buscar produto ou código"
                  value={busca} onChange={e => setBusca(e.target.value)} autoComplete="off" />
              </label>
            </div>
            {preparosDisponiveis.length > 0 && (
              <div className="cg-filters cg-filters-sub" role="group" aria-label="Modo de preparo">
                <button type="button" className="cg-chip cg-chip-sub" aria-pressed={preparo === 'todos'} onClick={() => setPreparo('todos')}>Todos os preparos</button>
                {preparosDisponiveis.map(v => (
                  <button key={v} type="button" className="cg-chip cg-chip-sub" aria-pressed={preparo === v} onClick={() => setPreparo(v)}>{v}</button>
                ))}
              </div>
            )}
          </div>

          {cliente && ultimoPedido.length > 0 && (
            <div className="cg-repeat">
              <span className="rt"><b>Seu último pedido</b> tem {ultimoPedido.length} {ultimoPedido.length === 1 ? 'item' : 'itens'}.</span>
              <button type="button" className="hd-btn hd-btn-sm" onClick={repetirUltimo}><Icon n="refresh" w={15} /> Repetir último pedido</button>
            </div>
          )}

          {matched.length === 0 && <div className="cg-empty">Nenhum salgado encontrado.</div>}

          {cliente && comprados.length > 0 && (
            <>
              <div className="cg-band-head"><h2>Você sempre pede</h2></div>
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

        <ContatoMapa cfg={cfg} />
      </main>

      <SiteFooter cfg={cfg} logo={siteLogo} />

      {/* mobile fab */}
      <div className={'cg-fab' + (totals.boxes > 0 && !open ? ' show' : '')}>
        <button type="button" className="hd-btn hd-btn-gold hd-btn-lg cg-block" onClick={() => setOpen(true)}>
          Ver pedido · {totals.boxes} {totals.boxes === 1 ? 'item' : 'itens'} · {money(totals.subtotal)}
        </button>
      </div>

      {/* DRAWER */}
      <div className={'cg-overlay' + (open ? ' open' : '')} onClick={() => setOpen(false)}></div>
      <aside className={'cg-drawer' + (open ? ' open' : '')} aria-label="Seu pedido">
        <div className="cg-dhead">
          <Icon n="cart" w={20} />
          <h3>Seu pedido</h3>
          {totals.boxes > 0 && <button type="button" className="cg-limpar" onClick={limparCarrinho}><Icon n="trash" w={14} /> Limpar</button>}
          <button type="button" className="x" onClick={() => setOpen(false)} aria-label="Fechar pedido"><Icon n="x" w={18} /></button>
        </div>

        <div className="cg-dbody">
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
                      {cimg && <img src={cimg} alt="" loading="lazy" decoding="async" />}
                    </div>
                    <div className="cinfo">
                      <div className="cn">{p.nome}</div>
                      <div className="cp">{money(precoDe(p))}{p.unidades ? ` · ${p.unidades}un` : ` · ${p.embalagem || 'caixa'}`}</div>
                    </div>
                    <div className="cg-ministep">
                      <button type="button" onClick={() => removeItem(id)} aria-label="Diminuir"><Icon n="minus" w={14} /></button>
                      <span className="q">{cart[id]}</span>
                      <button type="button" onClick={() => addItem(id)} aria-label="Aumentar"><Icon n="plus" w={14} /></button>
                    </div>
                    <button type="button" className="cg-citem-del" onClick={() => delItem(id)} title="Remover item" aria-label="Remover item"><Icon n="trash" w={16} /></button>
                  </div>
                );
              })}

              <div className="cg-dco">
                {condPadrao && (
                  <>
                    <h4>Condição de pagamento</h4>
                    <div className="cg-select cg-select-ro">{condPadrao.nome}</div>
                  </>
                )}

                <h4>Como receber</h4>
                <div className="hd-segmented cg-modo">
                  <button type="button" className="hd-seg-btn" aria-pressed={hdr.modo !== 'retirada'} onClick={() => setModo('entrega')}>Entrega</button>
                  <button type="button" className="hd-seg-btn" aria-pressed={hdr.modo === 'retirada'} onClick={() => setModo('retirada')}>Retirar na loja</button>
                </div>

                <h4>{hdr.modo === 'retirada' ? 'Data de retirada' : 'Data de entrega'}</h4>
                {hdr.dataEntrega && !trocarData ? (
                  <div className="cg-delivery">
                    <div className="dd"><b>{dataBR(hdr.dataEntrega)}</b><span>{diaSemanaISO(hdr.dataEntrega)}</span></div>
                    <button type="button" className="cg-trocar" onClick={() => setTrocarData(true)}>trocar data</button>
                  </div>
                ) : (
                  <>
                    <input type="date" className="cg-select" min={amanhaISO} value={hdr.dataEntrega || ''}
                      onChange={e => escolherData(e.target.value)} />
                    {hdr.modo === 'entrega' && sugeridaISO && trocarData && (
                      <button type="button" className="cg-trocar" style={{ marginTop: 6 }}
                        onClick={() => { setErroData(''); setHdr(h => ({ ...h, dataEntrega: sugeridaISO })); setTrocarData(false); }}>
                        usar data sugerida ({dataBR(sugeridaISO)})
                      </button>
                    )}
                  </>
                )}
                {erroData && <p className="cg-minwarn"><Icon n="tag" w={13} /> {erroData}</p>}
                {hdr.modo === 'retirada' && cfg?.loja?.endereco && (
                  <p className="cg-retira">Retirar em: {cfg.loja.endereco}</p>
                )}
                {ehEncaixe && (
                  <p className="cg-encaixe"><Icon n="tag" w={13} /> Pedido <b>encaixe</b>: a equipe vai confirmar a viabilidade da entrega nessa data.</p>
                )}

                {!cliente?.temCadastroApp && (
                  <>
                    <h4>Telefone (WhatsApp)</h4>
                    <input className="cg-select" inputMode="tel" value={hdr.telefone} onChange={e => setHdr({ ...hdr, telefone: e.target.value })} placeholder="(47) 9 9999-9999" />
                  </>
                )}

                <h4>Observações <span className="cg-opc">(opcional)</span></h4>
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
            {carrinhoIndisp && <p className="cg-minwarn"><Icon n="tag" w={13} /> Há item <b>sem estoque</b> no carrinho. Remova-o para continuar.</p>}
            {erroEnvio && <p className="cg-minwarn"><Icon n="tag" w={13} /> {erroEnvio}</p>}
            <button type="button" className="hd-btn hd-btn-lg cg-block cg-cta" disabled={below || enviando || !hdr.dataEntrega || carrinhoIndisp} onClick={finalizar}>
              <Icon n="check" w={18} /> {enviando ? 'Enviando…' : carrinhoIndisp ? 'Remova itens sem estoque' : !hdr.dataEntrega ? 'Escolha a data de entrega' : 'Enviar pedido pelo WhatsApp'}
            </button>
            <p className="cg-dnote">Pagamento combinado depois, conforme sua condição — nada é cobrado online.</p>
          </div>
        )}
      </aside>

      {loginModal && !logado && (
        <div className="cg-login-ov" onClick={(e) => e.target === e.currentTarget && setLoginModal(false)}>
          <Login
            logo={siteLogo}
            whatsapp={whatsapp}
            titulo={cfg?.congelados?.loginTitulo || 'Entrar para comprar'}
            sub={cfg?.congelados?.loginSub || 'Faça login para adicionar produtos ao pedido e ver seu histórico.'}
            onLogin={(c) => { setCliente(c); setLoginModal(false); }}
            onVisitante={(v) => { setVisitante(v); setLoginModal(false); }}
            onFechar={() => setLoginModal(false)}
          />
        </div>
      )}

      {ficha && (
        <FichaModal
          ficha={ficha} onClose={() => setFicha(null)}
          prod={ficaProdAtual} preco={ficaProdAtual ? precoDe(ficaProdAtual) : null}
          qty={qtyOf(ficha.id)} add={adicionarDaFicha} dec={removeItem}
          cfg={cfg}
        />
      )}
    </div>
  );
}

/* ============== FICHA (popup do produto) — <dialog> nativo ============== */
function FichaModal({ ficha, onClose, prod, preco, qty, add, dec, cfg }) {
  const dlgRef = useRef(null);
  const imgs = (ficha.imagens?.length ? ficha.imagens : (ficha.imagem ? [ficha.imagem] : [])).map(imgUrl);
  const [idx, setIdx] = useState(0);
  const cur = imgs.length ? idx % imgs.length : 0;
  const multi = imgs.length > 1;
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
  // linhas já calculadas (100 g / porção / %VD) — usadas na tela E na impressão
  const rowsNut = linhasNut.map(r => {
    const porc = parseValor(r.raw);
    const cem = (porc != null && pesoPorc) ? (porc / pesoPorc) * 100 : null;
    const vd = parseVD(r.raw);
    return {
      label: r.label,
      ind: r.indent === 1 ? 'ind1' : r.indent === 2 ? 'ind2' : '',
      cem: fmtNum(cem, r.dec), porc: fmtNum(porc, r.dec), vd: vd != null ? vd : '—',
    };
  });
  // declaração de alérgenos (mesma lógica da etiqueta impressa: espécie p/ crustáceos/peixes)
  const alergenos = (Array.isArray(et?.alergenos) ? et.alergenos.filter(Boolean) : []).map(a => {
    if (a === 'Crustáceos' && et.especieCrustaceos) return `${a} (${et.especieCrustaceos})`;
    if (a === 'Peixes' && et.especiePeixes) return `${a} (${et.especiePeixes})`;
    return a;
  });
  const alertaTxt = et ? (
    (et.contemGluten ? 'CONTÉM GLÚTEN' : 'NÃO CONTÉM GLÚTEN')
    + (et.contemLactose ? ' · CONTÉM LACTOSE' : '')
    + (alergenos.length > 0 ? ` · ALÉRGICOS: CONTÉM ${alergenos.join(', ').toUpperCase()}.` : '')
    + (et.avisosRotulo ? ` ${String(et.avisosRotulo).toUpperCase()}` : '')
  ) : '';
  // Enquanto a ficha carrega, usa o dado do card (se houver); sem ele, não mostra nada (evita "caixa" falso).
  const embBase = ficha._loading ? (prod || null) : ficha;
  const embTxt = embBase ? `${embBase.embalagem || 'caixa'}${embBase.unidades ? ` · ${embBase.unidades} un` : ''}` : '';
  const pesoPacoteTxt = et?.pesoPacote ? (Number(et.pesoPacote) >= 1000 ? `${fmtNum(Number(et.pesoPacote) / 1000, 2)} kg` : `${fmtNum(Number(et.pesoPacote), 0)} g`) : '';
  const pesoUnTxt = et?.pesoUnitario ? `${et.pesoUnitario} g` : '';
  const validadeTxt = et?.validadeDias != null ? `${et.validadeDias} dias` : '';
  const loja = cfg?.loja?.nome || 'Hardt Doces e Salgados';
  const qtdEmb = et?.quantidadeEmbalagem;
  const porcoesTxt = qtdEmb != null && qtdEmb !== '' ? `Porções por embalagem: ${qtdEmb}${et.quantidadeAproximada ? '±' : ''} porções` : '';

  const idxAnt = () => setIdx(i => (imgs.length ? (i - 1 + imgs.length) % imgs.length : 0));
  const idxProx = () => setIdx(i => (imgs.length ? (i + 1) % imgs.length : 0));

  // abre como modal nativo (top layer): foco preso, Esc fecha, fundo inerte
  useEffect(() => {
    const d = dlgRef.current;
    if (d && !d.open) { try { d.showModal(); } catch { d.setAttribute('open', ''); } }
  }, []);
  const fechar = () => { const d = dlgRef.current; if (d && d.open) d.close(); else onClose(); };
  // fallback do clique no fundo (Safari/iOS sem closedby): o alvo é o próprio <dialog>
  const cliqueFundo = (e) => { if (e.target === e.currentTarget) fechar(); };

  const indisp = !!prod?.indisponivel;
  return (
    <dialog ref={dlgRef} className="cg-dlg cg-ficha" closedby="any" aria-labelledby="cgFichaTit"
      onClose={onClose} onClick={cliqueFundo}>
      <div className="cg-ficha-top">
        <div className="cg-ficha-tit">
          <span>Ficha de Produto · {loja}</span>
          <h2 id="cgFichaTit">{ficha.nome}</h2>
        </div>
        <div className="cg-ficha-acts">
          <button type="button" className="cg-fbtn cg-fbtn-x" onClick={fechar} aria-label="Fechar ficha"><Icon n="x" w={18} /></button>
        </div>
      </div>

      <div className="cg-ficha-scroll">
        <div className="cg-ficha-intro">
          <div className="cg-ficha-photo">
            {imgs.length ? <img src={imgs[cur]} alt={ficha.nome} decoding="async" /> : <span className="noimg" style={{ background: tileGradient(ficha.codigo || ficha.nome) }}>foto · {ficha.nome}</span>}
            {multi && (
              <>
                <button type="button" className="cg-farrow left" onClick={idxAnt} aria-label="Foto anterior">‹</button>
                <button type="button" className="cg-farrow right" onClick={idxProx} aria-label="Próxima foto">›</button>
              </>
            )}
            {multi && (
              <div className="cg-fdots" role="tablist" aria-label="Fotos do produto">
                {imgs.map((_, i) => <button key={i} type="button" role="tab" aria-selected={i === cur} aria-label={`Foto ${i + 1}`} className={i === cur ? 'on' : ''} onClick={() => setIdx(i)} />)}
              </div>
            )}
          </div>
          <div className="cg-ficha-info">
            {ficha.grupoNome && <span className="hd-chip hd-chip-green">{ficha.grupoNome}</span>}
            <p className="cg-ficha-cod">cód. {ficha.codigo || '—'}</p>
            {ficha.descricao && <p className="cg-fdesc">{ficha.descricao}</p>}
            <div className="cg-fchips">
              {embTxt && <span className="hd-chip">{embTxt}</span>}
              {pesoUnTxt && <span className="hd-chip">{pesoUnTxt}/un</span>}
              {pesoPacoteTxt && <span className="hd-chip">pacote {pesoPacoteTxt}</span>}
              {validadeTxt && <span className="hd-chip">validade {validadeTxt}</span>}
            </div>
          </div>
        </div>

        {ficha._loading ? (
          <p className="cg-floading">Carregando informações…</p>
        ) : !et ? (
          <p className="cg-fnodata">Ficha técnica deste produto ainda não cadastrada.</p>
        ) : (
          <div className="cg-ficha-cols">
            <div className="cg-ficha-col">
              <section className="cg-fpanel">
                <h3 className="cg-fpanel-tit">Características do produto</h3>
                <dl className="cg-kv">
                  {[['Código', ficha.codigo], ['Grupo', ficha.grupoNome], ['Embalagem', embTxt], ['Peso unitário', pesoUnTxt], ['Peso do pacote', pesoPacoteTxt], ['Validade', validadeTxt], ['Conservação', et.armazenamento]]
                    .filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                </dl>
              </section>
              {et.modoPreparo && (
                <section className="cg-fpanel">
                  <h3 className="cg-fpanel-tit">Modo de preparo</h3>
                  <p className="cg-fpanel-txt">{et.modoPreparo}</p>
                </section>
              )}
            </div>
            <div className="cg-ficha-col">
              {/* Tabela nutricional — padrão ANVISA (IN 75/2020) */}
              {temNut && (
                <section className="cg-fpanel cg-fpanel-flush">
                  <div className="cg-table-wrap" tabIndex={0} role="region" aria-labelledby="cgNutCap">
                    <table className="cg-nut-table">
                      <caption id="cgNutCap">Informação Nutricional</caption>
                      <thead>
                        <tr><th scope="col"><span className="cg-sr">Nutriente</span></th><th scope="col">100 g</th><th scope="col">Porção {pesoPorc} g</th><th scope="col">%VD*</th></tr>
                      </thead>
                      <tbody>
                        <tr><td colSpan={4} className="cg-nut-porc">{porcoesTxt && <>{porcoesTxt}<br /></>}Porção: {pesoPorc} g (1 unidade)</td></tr>
                        {rowsNut.map(r => (
                          <tr key={r.label}>
                            <th scope="row" className={r.ind}>{r.label}</th>
                            <td>{r.cem}</td>
                            <td className="col-porc">{r.porc}</td>
                            <td>{r.vd}</td>
                          </tr>
                        ))}
                        <tr><td colSpan={4} className="cg-nut-nota">*Percentual de valores diários fornecidos pela porção.</td></tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Ingredientes + declaração de alérgenos */}
              {et.composicao && (
                <section className="cg-fpanel">
                  <h3 className="cg-fpanel-tit">Ingredientes</h3>
                  <p className="cg-fpanel-txt">{et.composicao}</p>
                  <div className="cg-alerg">{alertaTxt}</div>
                </section>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="cg-ficha-foot">
        <div className="cg-ficha-price">
          {preco != null ? <b>{money(preco)}</b> : null}
          {embTxt ? <span>{embTxt}</span> : null}
        </div>
        <div className="cg-ficha-foot-acts">
          <button type="button" className="hd-btn hd-btn-outline" onClick={fechar}>Fechar</button>
          {prod && (indisp ? (
            <span className="cg-semestoque">Sem estoque</span>
          ) : qty === 0 ? (
            <button type="button" className="hd-btn" onClick={() => add(prod.id)}><Icon n="plus" w={16} /> Adicionar ao pedido</button>
          ) : (
            <div className="cg-step" aria-label={`${qty} no pedido`}>
              <button type="button" onClick={() => dec(prod.id)} aria-label="Diminuir"><Icon n="minus" w={15} /></button>
              <span className="q">{qty}</span>
              <button type="button" onClick={() => add(prod.id)} aria-label="Aumentar"><Icon n="plus" w={15} /></button>
            </div>
          ))}
        </div>
      </div>
    </dialog>
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
  const indisp = !!p.indisponivel;
  const catTxt = [p.grupoNome, p.codigo ? `cód. ${p.codigo}` : null].filter(Boolean).join(' · ');
  return (
    <article className={'cg-card' + (indisp ? ' cg-indisp' : '')}>
      <div className="cg-ph" style={!imgs.length ? { background: tileGradient(p.codigo || p.nome) } : undefined}
        onClick={() => onAbrir && onAbrir(p)} role="button" tabIndex={0} aria-label={`Ver ficha técnica de ${p.nome}`}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir && onAbrir(p); } }}>
        <div className="cg-tagrow">
          {p.preparo ? <span className="cg-tg cg-tg-prep">{p.preparo}</span> : <span />}
          {indisp ? <span className="cg-tg cg-tg-indisp">Indisponível</span>
            : (p.comprado ? <span className="cg-tg cg-tg-bought">Você compra</span> : null)}
        </div>
        {imgs.length ? (
          <div className="cg-slides" style={{ transform: `translateX(-${cur * 100}%)` }}>
            {imgs.map((u, i) => <img key={i} src={u} alt={i === 0 ? p.nome : ''} loading="lazy" decoding="async" />)}
          </div>
        ) : <div className="noimg">foto · {p.nome}</div>}
        {imgs.length > 1 && (
          <div className="cg-dots">{imgs.map((_, i) => <span key={i} className={i === cur ? 'on' : ''} />)}</div>
        )}
      </div>
      <div className="cg-card-body">
        {catTxt && <span className="cg-cat">{catTxt}</span>}
        <h3><button type="button" className="cg-title-btn" onClick={() => onAbrir && onAbrir(p)}>{p.nome}</button></h3>
        {p.descricao && <p className="cg-desc">{p.descricao}</p>}
        <div className="cg-specs">
          <span className="hd-chip">{emb}{p.unidades ? ` · ${p.unidades} un` : ''}</span>
        </div>
        <button type="button" className="cg-ficha-link" onClick={() => onAbrir && onAbrir(p)}>Ficha técnica ›</button>
        <div className="cg-card-foot">
          <div className="price"><b>{money(preco != null ? preco : p.preco)}</b></div>
          {indisp ? (
            <span className="cg-semestoque">Sem estoque</span>
          ) : qty === 0 ? (
            <button type="button" className="hd-btn hd-btn-sm cg-add" onClick={() => add(p.id)} aria-label={`Adicionar ${p.nome}`}><Icon n="plus" w={16} /> Adicionar</button>
          ) : (
            <div className="cg-step">
              <button type="button" onClick={() => dec(p.id)} aria-label="Diminuir"><Icon n="minus" w={15} /></button>
              <span className="q">{qty}</span>
              <button type="button" onClick={() => add(p.id)} aria-label="Aumentar"><Icon n="plus" w={15} /></button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/* ---------- Contato + mapa (existe hoje: "Onde estamos"), no visual novo ---------- */
function ContatoMapa({ cfg }) {
  const loja = lojaDe(cfg);
  const wa = `https://wa.me/${loja.whatsapp || '5547988548476'}`;
  const waMsg = `${wa}?text=${encodeURIComponent('Olá! Vim pelo site da Hardt e gostaria de fazer um pedido.')}`;
  const igUrl = socialUrl(loja.instagram, 'https://instagram.com/');
  const fbUrl = socialUrl(loja.facebook, 'https://facebook.com/');
  const linhas = String(loja.endereco || '').split(' — ');
  const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent(String(loja.endereco || '').replace(' — ', ', '))}&output=embed`;
  return (
    <section className="hd-section hd-section-tint" id="contato">
      <div className="hd-wrap">
        <div className="hd-contact">
          <div className="hd-contact-box">
            <div>
              <div className="hd-contact-row"><small>Onde estamos</small><strong>{linhas.map((l, k) => <React.Fragment key={k}>{k > 0 ? <br /> : null}{l}</React.Fragment>)}</strong></div>
              <div className="hd-contact-row"><small>WhatsApp</small><a href={waMsg} target="_blank" rel="noopener noreferrer"><strong className="hd-contact-big">{loja.telefone}</strong></a></div>
              {loja.email ? <div className="hd-contact-row"><small>E-mail</small><a href={`mailto:${loja.email}`}><strong>{loja.email}</strong></a></div> : null}
              {(igUrl || fbUrl) && (
                <div className="hd-contact-row">
                  <small>Redes sociais</small>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                    {igUrl && <a className="hd-btn hd-btn-outline hd-btn-sm" href={igUrl} target="_blank" rel="noopener noreferrer" aria-label="Instagram"><InstagramIcon w={16} /> {loja.instagram && !String(loja.instagram).startsWith('http') ? `@${String(loja.instagram).replace(/^@/, '')}` : 'Instagram'}</a>}
                    {fbUrl && <a className="hd-btn hd-btn-outline hd-btn-sm" href={fbUrl} target="_blank" rel="noopener noreferrer" aria-label="Facebook"><FacebookIcon w={16} /> Facebook</a>}
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <a className="hd-btn" href={waMsg} target="_blank" rel="noopener noreferrer">WhatsApp</a>
              <Link className="hd-btn hd-btn-gold" to="/kit-festa">Kit-Festa</Link>
              <Link className="hd-btn hd-btn-outline" to="/congelados">Congelados</Link>
            </div>
          </div>
          <div className="hd-contact-map">
            <iframe title="Localização da Hardt no mapa" src={mapSrc} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
          </div>
        </div>
      </div>
    </section>
  );
}
