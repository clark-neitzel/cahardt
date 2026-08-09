import React, { useState, useEffect } from 'react';
import publicApi from './api';
import { WhatsIcon } from './icons';

// Integração site ↔ Bot Hardt: o cliente escolhe o vendedor AQUI, mas a conversa
// abre sempre no WhatsApp oficial da empresa — o marcador no fim da mensagem é o
// que faz o bot entregar a conversa direto para a pessoa certa. O telefone pessoal
// do vendedor nunca aparece.
//
// Regras de decisão (espec. "Integração do site com vendedores do Bot Hardt"):
// 1. Cliente com vendedor presente na lista oficial → link direto "Falar com [nome]".
// 2. Cliente com vendedor fora da lista → aviso + escolha entre os disponíveis.
// 3. Cliente novo/sem vendedor → escolha entre os disponíveis.
// 4. Lista vazia ou bot fora do ar → botão único "Falar com a equipe" (sem marcador).

const waHref = (numero, texto) => `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
// A mensagem PRECISA terminar exatamente com "[Vendedor Hardt: Nome]" — é o contrato com o bot.
const msgVendedor = (nome) => `Olá! Vim pelo site e quero falar com ${nome}.\n\n[Vendedor Hardt: ${nome}]`;
const MSG_EQUIPE = 'Olá! Vim pelo site e quero falar com a equipe de vendas.';

export default function FalarVendedor({ cliente, whatsapp, variant = 'pill' }) {
  const [lista, setLista] = useState(null); // null = ainda carregando; [] = indisponível/vazia
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let vivo = true;
    publicApi.vendedoresSite()
      .then(r => { if (vivo) setLista(Array.isArray(r?.vendedores) ? r.vendedores : []); })
      .catch(() => { if (vivo) setLista([]); });
    return () => { vivo = false; };
  }, []);

  // Comparação sem diferenciar maiúsculas/minúsculas; acentos e espaços contam.
  const botNome = cliente?.vendedorBotNome || '';
  const meu = botNome ? (lista || []).find(v => v.nome.toLowerCase() === botNome.toLowerCase()) : null;
  const semLista = Array.isArray(lista) && lista.length === 0;

  // Regra 1 e 4 são link direto; 2 e 3 abrem a escolha.
  const direto = meu
    ? { href: waHref(whatsapp, msgVendedor(meu.nome)), rotulo: `Falar com ${meu.nome}`, curto: meu.nome }
    : (semLista ? { href: waHref(whatsapp, MSG_EQUIPE), rotulo: 'Falar com a equipe', curto: 'WhatsApp' } : null);

  const gatilho = variant === 'float' ? (
    direto
      ? <a className="wa-float" href={direto.href} target="_blank" rel="noreferrer" aria-label={direto.rotulo} title={direto.rotulo}><WhatsIcon w={26} /></a>
      : <button className="wa-float" onClick={() => setOpen(true)} aria-label="Falar com um vendedor" title="Falar com um vendedor"><WhatsIcon w={26} /></button>
  ) : (
    direto
      ? <a className="cg-pill" href={direto.href} target="_blank" rel="noreferrer" title={direto.rotulo}><WhatsIcon w={15} /><span className="lbl">{direto.curto}</span></a>
      : <button className="cg-pill" onClick={() => setOpen(true)} title="Falar com um vendedor"><WhatsIcon w={15} /><span className="lbl">Vendedor</span></button>
  );

  return (
    <>
      {gatilho}
      {open && (
        <div className="cg-fmodal-ov" onClick={() => setOpen(false)}>
          <div className="cg-fmodal cg-vend-modal" onClick={e => e.stopPropagation()}>
            <button className="cg-fclose" onClick={() => setOpen(false)} aria-label="Fechar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
            <div className="cg-vend">
              <h3>Falar no WhatsApp</h3>
              {cliente?.vendedorNome && !meu
                ? <p className="sub">Seu vendedor atual ainda não atende por este canal. Escolha quem vai te atender:</p>
                : <p className="sub">Escolha quem vai te atender:</p>}
              {lista === null ? (
                <p className="sub">Carregando…</p>
              ) : (
                <div className="cg-vend-lista">
                  {lista.map(v => (
                    <a key={v.nome} className="cg-vend-item" href={waHref(whatsapp, msgVendedor(v.nome))} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
                      <span className="av">{(v.nome[0] || '?').toUpperCase()}</span>
                      <span className="tx"><b>{v.nome}</b><span>{v.setor || 'Vendas'}</span></span>
                      <WhatsIcon w={18} />
                    </a>
                  ))}
                </div>
              )}
              <a className="btn btn-wa btn-block cg-vend-eq" href={waHref(whatsapp, MSG_EQUIPE)} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
                <WhatsIcon w={17} /> Falar com a equipe
              </a>
              <p className="cg-vend-nota">A conversa abre no WhatsApp da Hardt — é só tocar em <b>enviar</b>.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
