import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import publicApi from './api';
import { WhatsIcon } from './icons';
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

const HISTORIA_PADRAO = {
  titulo: 'Nossa História',
  texto: 'A Hardt Salgados tem suas raízes na paixão compartilhada de uma família pela culinária e pelo sabor autêntico. Tudo começou em Joinville, no norte de Santa Catarina, em 2007, quando uma receita de família virou o sonho de levar o salgado feito à mão para a mesa de mais gente.\nDe uma cozinha pequena para uma produção que abastece festas, eventos e revendedores de toda a região, mantivemos o mesmo cuidado de sempre: massa fininha, recheio caprichado e o ponto certo da fritura.\nHoje, com frota própria refrigerada, garantimos que o sabor sai do nosso freezer e chega fresquinho até você — do jeitinho que a gente faz desde o primeiro dia.',
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
  const LOGO_SRC = cfg?.logoUrl ? imgUrl(cfg.logoUrl) : LOGO;

  const wa = `https://wa.me/${loja.whatsapp}`;
  const waMsg = `${wa}?text=${encodeURIComponent('Olá! Vim pelo site da Hardt e gostaria de fazer um pedido.')}`;

  return (
    <div className="cg home tex-board">
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
          </nav>
        </div>
      </header>

      {/* ===== HERO / NOSSA HISTÓRIA ===== */}
      <section className="hero" id="historia">
        <div className="wrap hero-grid">
          <div>
            <div className="hero-since kicker"><span className="dot"></span> {hero.kicker || 'Joinville/SC · Frota própria refrigerada'}</div>
            <img className="hero-logo" src={LOGO_SRC} alt={loja.nome} />
            <h1 className="hist-title">{historia.titulo || 'Nossa História'}</h1>
            <div className="hero-hist">
              {histParas.map((p, k) => <p key={k} className="lead">{p}</p>)}
            </div>
          </div>
          <div className="hero-art">
            <HistoriaCarrossel imagens={heroFotos} />
            <div className="seal">Sabor<br />sem igual<small>desde 2007</small></div>
          </div>
        </div>
      </section>

      {/* ===== DOIS CAMINHOS ===== */}
      <section className="section" id="caminhos">
        <div className="wrap">
          <div className="sec-head">
            <div className="kicker">O que você precisa hoje?</div>
            <h2>{caminhos.titulo || 'Dois jeitos de pedir'}</h2>
            <p>{caminhos.subtitulo || 'Salgados prontos pra sua festa ou congelados pra revender e ter sempre em estoque. Escolha por onde começar.'}</p>
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

      {/* ===== DIFERENCIAIS ===== */}
      <section className="board-strip" id="diferenciais">
        <div className="wrap">
          <div className="dif">
            <div className="dif-cell"><div className="num">desde 2007</div><h4>Tradição</h4><p>Quase 20 anos fazendo salgado em Pirabeiraba, Joinville.</p></div>
            <div className="dif-cell"><div className="num">à mão</div><h4>Feito artesanal</h4><p>Massa fininha, recheio caprichado e padrão em cada caixa.</p></div>
            <div className="dif-cell"><div className="num">-18°C</div><h4>Frota própria</h4><p>Entrega em veículos refrigerados, do nosso freezer ao seu.</p></div>
            <div className="dif-cell"><div className="num">no link</div><h4>Pedido fácil</h4><p>Monte, escolha o horário e finalize pelo WhatsApp.</p></div>
          </div>
        </div>
      </section>

      {/* ===== CONTATO ===== */}
      <section className="section" id="contato">
        <div className="wrap contact">
          <div className="contact-card">
            <div className="contact-row">
              <div><div className="lab">Onde estamos</div><div className="val" dangerouslySetInnerHTML={{ __html: String(loja.endereco || '').replace(' — ', '<br/>') }} /></div>
            </div>
            <div className="contact-row">
              <div><div className="lab">WhatsApp</div><a className="val" href={wa} target="_blank" rel="noopener noreferrer">{loja.telefone}</a></div>
            </div>
            <div className="contact-row">
              <div><div className="lab">Instagram</div><a className="val" href={`https://instagram.com/${loja.instagram}`} target="_blank" rel="noopener noreferrer">@{loja.instagram}</a></div>
            </div>
          </div>
          <div className="contact-aside">
            <div className="kicker">Vamos conversar</div>
            <h2>Peça hoje, comemore com sabor</h2>
            <p>Atendemos festas, eventos, empresas e revenda em Joinville e região. Chama no WhatsApp ou já comece montando seu Kit Festa.</p>
            <div className="hero-cta" style={{ marginTop: 0 }}>
              <a className="btn btn-wa" href={waMsg} target="_blank" rel="noopener noreferrer">Chamar no WhatsApp</a>
              <Link className="btn btn-yellow" to="/kit-festa">Montar Kit Festa</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <div className="sawtooth"></div>
      <footer className="foot">
        <div className="wrap foot-in">
          <Link to="/inicio" className="foot-logo">
            <img src={LOGO_SRC} alt="Hardt" />
            <b>Hardt Doces e Salgados<span>Sabor sem igual · desde 2007</span></b>
          </Link>
          <div className="foot-links">
            <Link to="/kit-festa">Kit Festa</Link>
            <Link to="/congelados">Congelados</Link>
            <a href="#contato">Contato</a>
          </div>
        </div>
        <div className="wrap" style={{ paddingBottom: 22 }}>
          <small style={{ color: 'var(--chalk-dim)', fontSize: '.78rem' }}>© {new Date().getFullYear()} {loja.nome} · {loja.endereco} · {loja.telefone}</small>
        </div>
      </footer>

      {/* WhatsApp flutuante (acompanha o scroll) */}
      <a className="wa-float" href={waMsg} target="_blank" rel="noopener noreferrer" aria-label="Falar no WhatsApp">
        <WhatsIcon />
      </a>
    </div>
  );
}
