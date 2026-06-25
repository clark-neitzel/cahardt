import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import publicApi from './api';
import { WhatsIcon, InstagramIcon, FacebookIcon } from './icons';
import './site.css';
import { API_URL } from '../../services/api';

const LOGO = '/cong/logo.png';
const BOX = '/cong/box.gif';
const imgUrl = (u) => !u ? null : (u.startsWith('http') ? u : `${API_URL}${u}`);

const LOJA_PADRAO = {
  nome: 'Hardt Doces e Salgados',
  endereco: 'Rua XV de Outubro, 170 — Pirabeiraba, Joinville/SC',
  telefone: '(47) 98854-8476',
  whatsapp: '5547988548476',
  instagram: 'hardtsalgados',
};

const DIFERENCIAIS_PADRAO = [
  { num: 'desde 2007', titulo: 'Tradição', texto: 'Quase 20 anos fazendo salgado em Pirabeiraba, Joinville.' },
  { num: 'à mão', titulo: 'Feito artesanal', texto: 'Massa fininha, recheio caprichado e padrão em cada caixa.' },
  { num: '-18°C', titulo: 'Frota própria', texto: 'Entrega em veículos refrigerados, do nosso freezer ao seu.' },
  { num: 'no link', titulo: 'Pedido fácil', texto: 'Monte, escolha o horário e finalize pelo WhatsApp.' },
];

const HISTORIA_PADRAO = {
  titulo: 'Nossa História',
  texto: 'A Hardt Salgados nasceu da paixão de uma família pela culinária e pelo sabor autêntico. Tudo começou em Joinville, em 2007, quando uma receita de família virou o sonho de levar o salgado feito à mão para a mesa de mais gente.\nDe uma cozinha pequena para uma produção que abastece festas, eventos e revendedores de toda a região — sempre com o mesmo cuidado: massa fininha, recheio caprichado e o ponto certo da fritura.',
  frase: '— do mesmo jeitinho, desde o primeiro dia',
  imagens: [],
};

// Carrossel da seção "Nossa História" — anima por transform (GPU), sem mexer em box-shadow.
function HistoriaCarrossel({ imagens }) {
  const [i, setI] = useState(0);
  const n = imagens.length;
  useEffect(() => {
    if (n <= 1) return;
    const id = setInterval(() => setI(p => (p + 1) % n), 4500);
    return () => clearInterval(id);
  }, [n]);
  if (!n) return null;
  const idx = i % n;
  return (
    <div className="hist-carousel">
      <div className="hist-slides" style={{ transform: `translateX(-${idx * 100}%)` }}>
        {imagens.map((src, k) => <img key={k} src={src} alt="Hardt Salgados" />)}
      </div>
      {n > 1 && (
        <div className="hist-dots">
          {imagens.map((_, k) => <span key={k} className={k === idx ? 'on' : ''} onClick={() => setI(k)} />)}
        </div>
      )}
    </div>
  );
}

// Página principal pública do site da Hardt. Marketing/funil — sem login.
export default function HomeSite() {
  const [cfg, setCfg] = useState(null);

  useEffect(() => { publicApi.config().then(setCfg).catch(() => {}); }, []);

  const loja = { ...LOJA_PADRAO, ...(cfg?.loja || {}) };
  const hero = cfg?.hero || {};
  const caminhos = cfg?.caminhos || {};
  const historia = { ...HISTORIA_PADRAO, ...(cfg?.historia || {}) };
  const histImgs = Array.isArray(historia.imagens) ? historia.imagens : [];
  const histParas = String(historia.texto || '').split('\n').map(s => s.trim()).filter(Boolean);
  // Imagens do carrossel do topo: as enviadas no admin; se ainda não houver nenhuma, mostra a caixa padrão.
  const heroFotos = histImgs.length ? histImgs.map(imgUrl) : [BOX];
  const diferenciais = Array.isArray(cfg?.diferenciais) && cfg.diferenciais.length ? cfg.diferenciais : DIFERENCIAIS_PADRAO;
  const LOGO_SRC = cfg?.logoUrl ? imgUrl(cfg.logoUrl) : LOGO;

  const wa = `https://wa.me/${loja.whatsapp}`;
  const waMsg = `${wa}?text=${encodeURIComponent('Olá! Vim pelo site da Hardt e gostaria de fazer um pedido.')}`;
  const social = (v, base) => !v ? null : (String(v).startsWith('http') ? v : `${base}${String(v).replace(/^@/, '')}`);
  const igUrl = social(loja.instagram, 'https://instagram.com/');
  const fbUrl = social(loja.facebook, 'https://facebook.com/');
  const mapsUrl = loja.mapsUrl || `https://www.google.com/maps?q=${encodeURIComponent(String(loja.endereco || '').replace(' — ', ', '))}`;

  return (
    <div className="cg home">
      {/* ===== NAV ===== */}
      <header className="nav">
        <div className="wrap nav-in">
          <Link to="/inicio" className="nav-logo">
            <img src={LOGO_SRC} alt={loja.nome} />
            <span className="hide-sm">desde 2007</span>
          </Link>
          <nav className="nav-links">
            <a href="#caminhos" className="hide-sm">Produtos</a>
            <a href="#historia" className="hide-sm">A Hardt</a>
            <a href="#contato" className="hide-sm">Contato</a>
            <Link to="/login" className="btn btn-ghost btn-sm">Área Restrita</Link>
          </nav>
        </div>
      </header>

      {/* ===== DOIS CAMINHOS (topo) ===== */}
      <section className="section section-top" id="caminhos">
        <div className="wrap">
          <div className="intro-grid">
            <div className="brand-mark">
              <img src={LOGO_SRC} alt={loja.nome} />
            </div>
            <div className="sec-head intro-head">
              <div className="kicker">O que você precisa hoje?</div>
              <h2>{caminhos.titulo || 'Dois jeitos de pedir'}</h2>
              <p>{caminhos.subtitulo || 'Salgados prontos pra sua festa ou congelados pra revender e ter sempre em estoque. Escolha por onde começar.'}</p>
            </div>
          </div>
          <div className="paths">
            <Link className="path path-festa" to="/kit-festa">
              <div className="sawtooth"></div>
              <div className="path-body">
                <div className="path-eyebrow"><span className="badge badge-live">Pedido online</span></div>
                <h3>Kit Festa</h3>
                <p>Caixas de 25 salgados, um sabor por caixa. Monte do seu jeito a partir de 4 caixas.</p>
                <ul>
                  <li><span className="mk"></span> Coxinha, bolinha, empadinha, churros e mais</li>
                  <li><span className="mk"></span> Escolha data e horário de retirada ou entrega</li>
                  <li><span className="mk"></span> Cupons, indicação e pagamento combinado depois</li>
                </ul>
                <div className="path-foot">
                  <span className="btn btn-yellow">Fazer pedido →</span>
                  <span className="path-note">Pra festas, eventos e coffee break</span>
                </div>
              </div>
            </Link>

            <Link className="path path-cong" to="/congelados">
              <div className="sawtooth"></div>
              <div className="path-body">
                <div className="path-eyebrow"><span className="badge badge-soon">Área de clientes</span></div>
                <h3>Congelados</h3>
                <p>Catálogo completo de salgados congelados — minis, médios, grandes e gigantes — pra revenda e estoque.</p>
                <ul>
                  <li><span className="mk"></span> Seus produtos e preços liberados pra você</li>
                  <li><span className="mk"></span> Condições de pagamento do seu cadastro</li>
                  <li><span className="mk"></span> Recompra rápida do que você já costuma pedir</li>
                </ul>
                <div className="path-foot">
                  <span className="btn btn-ghost">Entrar / fazer pedido →</span>
                  <span className="path-note">Preços e condições do seu cadastro</span>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* ===== NOSSA HISTÓRIA (painel verde + destaques) ===== */}
      <section className="historia" id="historia">
        <div className="wrap">
          <div className="hist-panel">
            <span className="hist-watermark" aria-hidden="true">2007</span>
            <div className="hist-main">
              <div className="hist-col-text">
                <div className="hero-since kicker"><span className="dot"></span> {hero.kicker || 'Joinville/SC · desde 2007'}</div>
                <h2 className="hist-title">{historia.titulo || 'Nossa História'}</h2>
                <div className="hist-body">
                  {histParas.map((p, k) => <p key={k}>{p}</p>)}
                </div>
                {historia.frase ? <p className="hist-frase">{historia.frase}</p> : null}
              </div>
              <div className="hist-col-art">
                <HistoriaCarrossel imagens={heroFotos} />
                <div className="seal">Sabor<br />sem igual<small>desde 2007</small></div>
              </div>
            </div>
            <div className="hist-stats">
              {diferenciais.map((d, k) => (
                <div className="hist-stat" key={k}>
                  {d.num ? <div className="num">{d.num}</div> : null}
                  <h4>{d.titulo}</h4>
                  <p>{d.texto}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== CONTATO ===== */}
      <section className="section" id="contato">
        <div className="wrap contact">
          <div className="contact-card">
            <div className="contact-top">
              <div className="contact-rows">
                <div className="contact-row">
                  <div><div className="lab">Onde estamos</div><div className="val" dangerouslySetInnerHTML={{ __html: String(loja.endereco || '').replace(' — ', '<br/>') }} /></div>
                </div>
                <div className="contact-row">
                  <div><div className="lab">WhatsApp</div><a className="val val-big" href={waMsg} target="_blank" rel="noopener noreferrer">{loja.telefone}</a></div>
                </div>
              </div>
              {(igUrl || fbUrl) && (
                <div className="contact-social">
                  <div className="lab">Redes sociais</div>
                  <div className="social-links">
                    {igUrl && (
                      <a className="soc" href={igUrl} target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                        <InstagramIcon /><span>{loja.instagram && !String(loja.instagram).startsWith('http') ? `@${String(loja.instagram).replace(/^@/, '')}` : 'Instagram'}</span>
                      </a>
                    )}
                    {fbUrl && (
                      <a className="soc" href={fbUrl} target="_blank" rel="noopener noreferrer" aria-label="Facebook">
                        <FacebookIcon /><span>Facebook</span>
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="hero-cta contact-cta">
              <a className="btn btn-wa" href={waMsg} target="_blank" rel="noopener noreferrer">Chamar no WhatsApp</a>
              <Link className="btn btn-yellow" to="/kit-festa">Montar Kit Festa</Link>
            </div>
          </div>
          <div className="contact-map">
            <iframe
              title="Localização da Hardt no mapa"
              src={`https://www.google.com/maps?q=${encodeURIComponent(String(loja.endereco || '').replace(' — ', ', '))}&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </div>
      </section>

      {/* ===== FOOTER (padrão: marca · onde estamos · fale com a gente) ===== */}
      <div className="sawtooth"></div>
      <footer className="foot">
        <div className="wrap">
          <div className="foot-grid">
            <div className="foot-brand">
              <Link to="/inicio" className="foot-logo">
                <img src={LOGO_SRC} alt="Hardt" />
                <b>{loja.nome}<span>{loja.slogan} · {loja.desde}</span></b>
              </Link>
            </div>
            <div className="foot-col">
              <h5>Onde estamos</h5>
              <div className="foot-row" dangerouslySetInnerHTML={{ __html: String(loja.endereco || '').replace(' — ', '<br/>') }} />
              {mapsUrl && <a className="foot-maplink" href={mapsUrl} target="_blank" rel="noopener noreferrer">📍 Ver no mapa / traçar rota</a>}
            </div>
            <div className="foot-col">
              <h5>Fale com a gente</h5>
              <a className="foot-row foot-link" href={waMsg} target="_blank" rel="noopener noreferrer">{loja.telefone}</a>
              {loja.email && <a className="foot-row foot-link" href={`mailto:${loja.email}`}>{loja.email}</a>}
            </div>
          </div>
          <div className="foot-bottom">
            <small className="foot-copy">© {new Date().getFullYear()} {loja.nome} · Todos os direitos reservados.</small>
            <small className="foot-copy">{loja.slogan || 'Salgados de festa feitos à mão'}.</small>
          </div>
        </div>
      </footer>

      {/* WhatsApp flutuante (acompanha o scroll) */}
      <a className="wa-float" href={waMsg} target="_blank" rel="noopener noreferrer" aria-label="Falar no WhatsApp">
        <WhatsIcon />
      </a>
    </div>
  );
}
