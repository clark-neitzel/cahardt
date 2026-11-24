import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import publicApi, { getToken, setToken } from './api';
import { InstagramIcon, FacebookIcon, WhatsIcon } from './icons';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import './siteBase.css';
import { useVisitorPing } from '../../hooks/useVisitorPing';
import { imgUrl, lojaDe, logoDe, socialUrl } from './siteUtil';

const BOX = '/cong/box.gif';

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

// <img> que some (em vez de mostrar o texto alternativo) se o arquivo não carregar.
function Foto({ src, alt, ...rest }) {
  const [erro, setErro] = useState(false);
  useEffect(() => { setErro(false); }, [src]);
  if (!src || erro) return null;
  return <img src={src} alt={alt} onError={() => setErro(true)} {...rest} />;
}

// Carrossel da seção "Nossa História" — anima só por transform (GPU).
function HistoriaCarrossel({ imagens }) {
  const [i, setI] = useState(0);
  const n = imagens.length;
  useEffect(() => {
    if (n <= 1) return undefined;
    const id = setInterval(() => setI(p => (p + 1) % n), 4500);
    return () => clearInterval(id);
  }, [n]);
  if (!n) return null;
  const idx = i % n;
  return (
    <div className="hd-story-gal">
      <div className="hd-story-slides" style={{ transform: `translateX(-${idx * 100}%)` }}>
        {imagens.map((src, k) => <Foto key={k} src={src} alt="Hardt Salgados" loading="lazy" decoding="async" />)}
      </div>
      {n > 1 && (
        <div className="hd-story-dots">
          {imagens.map((_, k) => (
            <button key={k} type="button" aria-label={`Foto ${k + 1}`} aria-current={k === idx ? 'true' : undefined} onClick={() => setI(k)} />
          ))}
        </div>
      )}
    </div>
  );
}

// Página principal pública do site da Hardt. Mesmas seções da página anterior (Dois caminhos →
// Nossa História com destaques → Contato com mapa), só com o visual novo.
export default function HomeSite() {
  const [cfg, setCfg] = useState(null);
  const [cliente, setCliente] = useState(null);
  useVisitorPing('inicio');

  useEffect(() => {
    publicApi.config().then(setCfg).catch(() => {});
    // Sessão de Congelados (se houver): só para mostrar "Olá, Nome". Falha = deslogado, sem erro na tela.
    if (getToken()) {
      publicApi.perfil().then(c => setCliente(c && c.nome ? c : null)).catch(() => setCliente(null));
    }
  }, []);

  const sair = () => { setToken(null); setCliente(null); };

  const loja = lojaDe(cfg);
  const hero = (cfg && cfg.hero) || {};
  const caminhos = (cfg && cfg.caminhos) || {};
  const historia = { ...HISTORIA_PADRAO, ...((cfg && cfg.historia) || {}) };
  const histImgs = Array.isArray(historia.imagens) ? historia.imagens : [];
  const histParas = String(historia.texto || '').split('\n').map(s => s.trim()).filter(Boolean);
  // Imagens do carrossel: as enviadas no admin; se ainda não houver nenhuma, mostra a caixa padrão.
  const heroFotos = histImgs.length ? histImgs.map(imgUrl) : [BOX];
  const diferenciais = cfg && Array.isArray(cfg.diferenciais) && cfg.diferenciais.length ? cfg.diferenciais : DIFERENCIAIS_PADRAO;
  const logoSrc = logoDe(cfg);

  const wa = `https://wa.me/${loja.whatsapp}`;
  const waMsg = `${wa}?text=${encodeURIComponent('Olá! Vim pelo site da Hardt e gostaria de fazer um pedido.')}`;
  const waEquipe = `${wa}?text=${encodeURIComponent('Olá! Vim pelo site e quero falar com a equipe de vendas.')}`;
  const igUrl = socialUrl(loja.instagram, 'https://instagram.com/');
  const fbUrl = socialUrl(loja.facebook, 'https://facebook.com/');
  const enderecoLinhas = String(loja.endereco || '').split(' — ');

  return (
    <div className="hd">
      <SiteHeader
        ativo="inicio" cfg={cfg}
        areaRestrita
        sessao={cliente ? { nome: cliente.nome, onSair: sair } : undefined}
      />

      <main>
        {/* ===== DOIS CAMINHOS (começo da página) ===== */}
        <section className="hd-section hd-top" id="caminhos">
          <div className="hd-wrap">
            <div className="hd-intro">
              <img className="hd-intro-logo" src={logoSrc} alt={loja.nome} decoding="async" />
              <div className="hd-intro-text">
                <span className="hd-eyebrow">O que você precisa hoje?</span>
                <h2>{caminhos.titulo || 'Dois jeitos de pedir'}</h2>
                <p>{caminhos.subtitulo || 'Salgados prontos pra sua festa ou congelados pra revender e ter sempre em estoque. Escolha por onde começar.'}</p>
              </div>
            </div>
            <div className="hd-channels">
              <Link to="/kit-festa" className="hd-channel hd-channel-featured">
                <div><span className="hd-eyebrow">Pedido online</span><h3>Kit Festa</h3></div>
                <p className="hd-channel-desc">Caixas de 25 salgados, um sabor por caixa. Monte do seu jeito a partir de 4 caixas.</p>
                <ul className="hd-checks">
                  <li><i>✓</i> Coxinha, bolinha, empadinha, churros e mais</li>
                  <li><i>✓</i> Escolha data e horário de retirada ou entrega</li>
                  <li><i>✓</i> Cupons, indicação e pagamento combinado depois</li>
                </ul>
                <div className="hd-channel-foot">
                  <span className="hd-btn hd-btn-gold">Fazer pedido →</span>
                  <span className="hd-note">Pra festas, eventos e coffee break</span>
                </div>
              </Link>
              <Link to="/congelados" className="hd-channel">
                <div><span className="hd-eyebrow">Área de clientes</span><h3>Congelados</h3></div>
                <p className="hd-channel-desc">Catálogo completo de salgados congelados — minis, médios, grandes e gigantes — pra revenda e estoque.</p>
                <ul className="hd-checks">
                  <li><i>✓</i> Seus produtos e preços liberados pra você</li>
                  <li><i>✓</i> Condições de pagamento do seu cadastro</li>
                  <li><i>✓</i> Recompra rápida do que você já costuma pedir</li>
                </ul>
                <div className="hd-channel-foot">
                  <span className="hd-btn hd-btn-outline">Entrar / fazer pedido →</span>
                  <span className="hd-note">Preços e condições do seu cadastro</span>
                </div>
              </Link>
            </div>
          </div>
        </section>

        {/* ===== NOSSA HISTÓRIA (texto + imagens + destaques, tudo no mesmo painel) ===== */}
        <section className="hd-section hd-section-tint" id="historia">
          <div className="hd-wrap">
            <div className="hd-story-panel">
              <div className="hd-story">
                <div className="hd-story-text">
                  <span className="hd-eyebrow hd-eyebrow-gold">{hero.kicker || 'Joinville/SC · desde 2007'}</span>
                  <h2 style={{ marginBottom: 18 }}>{historia.titulo || 'Nossa História'}</h2>
                  {histParas.map((p, k) => <p key={k}>{p}</p>)}
                  {historia.frase ? <p className="hd-frase">{historia.frase}</p> : null}
                </div>
                <div className="hd-story-art">
                  <HistoriaCarrossel imagens={heroFotos} />
                  <span className="hd-chip hd-chip-gold hd-story-seal">Sabor sem igual · desde 2007</span>
                </div>
              </div>
              <div className="hd-numbers-grid">
                {diferenciais.map((d, k) => (
                  <div className="hd-stat" key={k}>
                    {d.num ? <span className="hd-stat-num">{d.num}</span> : null}
                    <h3>{d.titulo}</h3>
                    <p>{d.texto}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===== CONTATO ===== */}
        <section className="hd-section" id="contato">
          <div className="hd-wrap">
            <div className="hd-contact">
              <div className="hd-contact-box">
                <div>
                  <div className="hd-contact-row"><small>Onde estamos</small><strong>{enderecoLinhas.map((l, k) => <React.Fragment key={k}>{k > 0 ? <br /> : null}{l}</React.Fragment>)}</strong></div>
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
                <iframe
                  title="Localização da Hardt no mapa"
                  src={`https://www.google.com/maps?q=${encodeURIComponent(String(loja.endereco || '').replace(' — ', ', '))}&output=embed`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter cfg={cfg} />

      {/* WhatsApp flutuante — leva SEMPRE à equipe de vendas (sem marcador de vendedor), como antes:
          a Home é pública e não conhece o vendedor do cliente. */}
      <a className="hd-wa-fab" href={waEquipe} target="_blank" rel="noopener noreferrer" aria-label="Falar com a equipe de vendas" title="Falar com a equipe de vendas">
        <WhatsIcon w={26} />
      </a>
    </div>
  );
}
