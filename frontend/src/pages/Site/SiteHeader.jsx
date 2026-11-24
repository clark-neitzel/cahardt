import React from 'react';
import { Link } from 'react-router-dom';
import './siteBase.css';
import { lojaDe, logoDe, primeiroNome } from './siteUtil';

/**
 * Cabeçalho unificado do site público (Início / Congelados / Kit Festa).
 * Precisa estar DENTRO de um container `<div className="hd">` (escopo do siteBase.css).
 *
 * Props (todas opcionais, exceto `ativo`):
 *  - ativo: 'inicio' | 'congelados' | 'kitfesta'  → marca aria-current="page" no item.
 *  - logo: src da logo já resolvido (se ausente: cfg.logoUrl ou /cong/logo.png).
 *  - cfg: config pública (usa cfg.loja.nome).
 *  - sessao: { nome, onEntrar, onSair }
 *      · sem `nome` → botão "Minha área / Já sou cliente". Com `onEntrar` chama a função;
 *        sem ela navega para /congelados?entrar=1.
 *      · com `nome` → "Olá, Nome" + botão "Sair" (só aparece se `onSair` existir).
 *  - carrinho: { qtd, onAbrir } → botão verde "Pedido" com selo dourado. Omitido = sem botão.
 *  - acoes: nó React extra (ex.: <FalarVendedor/>) renderizado antes dos botões.
 *  - areaRestrita: bool → mostra "Área Restrita" (/login). Só a Home usa.
 */
const ITENS = [
  { id: 'inicio', rotulo: 'Início', to: '/inicio' },
  { id: 'congelados', rotulo: 'Congelados', to: '/congelados' },
  { id: 'kitfesta', rotulo: 'Kit Festa', to: '/kit-festa', dot: true },
];

const Svg = ({ children, w = 16 }) => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export default function SiteHeader({ ativo, logo, cfg, sessao, carrinho, acoes, areaRestrita }) {
  const loja = lojaDe(cfg);
  const src = logoDe(cfg, logo);
  const nome = sessao && sessao.nome ? primeiroNome(sessao.nome) : '';
  const logado = !!nome;
  const qtd = carrinho && Number.isFinite(Number(carrinho.qtd)) ? Number(carrinho.qtd) : 0;

  const conteudoArea = (
    <>
      <Svg><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Svg>
      <span className="hd-lbl">Minha área<small>Já sou cliente</small></span>
    </>
  );

  return (
    <header className="hd-header">
      <div className="hd-wrap hd-header-in">
        <Link to="/inicio" className="hd-brand" aria-label={`${loja.nome} — início`}>
          <img src={src} alt="" />
          <div className="hd-brand-meta">
            <strong>{loja.nome}</strong>
            <span>desde 2007</span>
          </div>
        </Link>

        <nav className="hd-nav" aria-label="Páginas principais">
          {ITENS.map(it => (
            <Link key={it.id} to={it.to} aria-current={ativo === it.id ? 'page' : undefined}>
              {it.dot ? <span className="hd-nav-dot" aria-hidden="true" /> : null}{it.rotulo}
            </Link>
          ))}
        </nav>

        <div className="hd-header-actions">
          {acoes || null}
          {areaRestrita ? (
            <Link to="/login" className="hd-pill" aria-label="Área Restrita">
              <Svg w={15}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></Svg>
              <span className="hd-lbl">Área Restrita</span>
            </Link>
          ) : null}
          {logado ? (
            <>
              <span className="hd-ola">Olá, {nome}</span>
              {sessao.onSair ? <button type="button" className="hd-pill" onClick={sessao.onSair}>Sair</button> : null}
            </>
          ) : sessao && sessao.onEntrar ? (
            <button type="button" className="hd-pill hd-pill-area" onClick={sessao.onEntrar}>{conteudoArea}</button>
          ) : (
            <Link to="/congelados?entrar=1" className="hd-pill hd-pill-area">{conteudoArea}</Link>
          )}
          {carrinho ? (
            <button type="button" className="hd-pill hd-pill-cart" onClick={carrinho.onAbrir} aria-label={`Abrir pedido (${qtd} itens)`}>
              <Svg w={15}><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></Svg>
              <span className="hd-lbl">Pedido</span>
              <span className="hd-badge">{qtd}</span>
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
