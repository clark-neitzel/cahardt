import React from 'react';
import './siteBase.css';
import { lojaDe, logoDe } from './siteUtil';

/**
 * Rodapé simples do site público (logo + marca registrada). Precisa estar DENTRO de `<div className="hd">`.
 * Props (opcionais): cfg (config pública) e logo (src já resolvido).
 */
export default function SiteFooter({ cfg, logo }) {
  const loja = lojaDe(cfg);
  const src = logoDe(cfg, logo);
  return (
    <footer className="hd-footer">
      <div className="hd-wrap hd-footer-simple">
        <img src={src} alt={loja.nome} loading="lazy" decoding="async" />
        <span>Hardt Doces e Salgados Ltda® — Todos os direitos reservados.</span>
      </div>
    </footer>
  );
}
