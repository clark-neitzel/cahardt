import React, { useState, useEffect } from 'react';
import publicApi from './api';
import { WhatsIcon } from './icons';

// Integração site ↔ Bot Hardt: a conversa abre SEMPRE no WhatsApp oficial da empresa.
// O marcador no fim da mensagem é o que faz o bot entregar a conversa direto para a
// pessoa certa. O telefone pessoal do vendedor nunca aparece.
//
// O cliente NUNCA escolhe o vendedor (não existe mais modal de escolha): a lista do bot
// traz gente de Compras/Logística/Financeiro, que não pode ser oferecida ao cliente.
// Só existem DOIS comportamentos, os dois em link direto:
//
// 1. Cliente logado cujo vendedor tem "Nome usado no Bot Hardt" preenchido E que está
//    na lista oficial do bot → "Falar com [nome]", mensagem COM o marcador.
// 2. TODO O RESTO (visitante, cliente sem vendedor, vendedor sem vínculo no bot,
//    vendedor fora da lista oficial, lista vazia, bot fora do ar, lista ainda
//    carregando) → "Falar com a equipe", mensagem SEM marcador e sem nome de vendedor.
//
// O estado de carregamento cai na regra 2 de propósito: é o caminho seguro — o link já
// nasce válido e vira o do vendedor sem piscar, quando/se a lista confirmar o vínculo.

const waHref = (numero, texto) => `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
// A mensagem PRECISA terminar exatamente com "[Vendedor Hardt: Nome]" — é o contrato com o bot.
const msgVendedor = (nome) => `Olá! Vim pelo site e quero falar com ${nome}.\n\n[Vendedor Hardt: ${nome}]`;
const MSG_EQUIPE = 'Olá! Vim pelo site e quero falar com a equipe de vendas.';

// Chave de comparação de nome: ignora espaço sobrando (nas pontas e no meio) e
// maiúsculas/minúsculas. Acento CONTINUA significativo — "Fabio" não casa com "Fábio".
// Só a comparação é normalizada; o valor gravado/enviado ao bot é sempre o original.
const chaveNome = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

export default function FalarVendedor({ cliente, whatsapp, variant = 'pill' }) {
  const [lista, setLista] = useState(null); // null = ainda carregando; [] = indisponível/vazia
  const botNome = cliente?.vendedorBotNome || '';

  useEffect(() => {
    // Sem vendedor vinculado no bot não há o que conferir — vai direto para a equipe.
    if (!botNome) { setLista([]); return; }
    let vivo = true;
    publicApi.vendedoresSite()
      .then(r => { if (vivo) setLista(Array.isArray(r?.vendedores) ? r.vendedores : []); })
      .catch(() => { if (vivo) setLista([]); });
    return () => { vivo = false; };
  }, [botNome]);

  const alvo = chaveNome(botNome);
  const meu = alvo ? (lista || []).find(v => chaveNome(v?.nome) === alvo) : null;

  // Regra 1 quando o vendedor do cliente foi confirmado na lista oficial; regra 2 no resto.
  const destino = meu
    ? {
        href: waHref(whatsapp, msgVendedor(meu.nome)),
        titulo: `Falar com ${meu.nome}`,
        curto: String(meu.nome).trim().split(/\s+/)[0] || 'Vendas',
      }
    : {
        href: waHref(whatsapp, MSG_EQUIPE),
        titulo: 'Falar com a equipe de vendas',
        curto: 'Vendas',
      };

  if (variant === 'float') {
    return (
      <a className="wa-float" href={destino.href} target="_blank" rel="noreferrer"
         aria-label={destino.titulo} title={destino.titulo}>
        <WhatsIcon w={26} />
      </a>
    );
  }

  return (
    <a className="cg-pill" href={destino.href} target="_blank" rel="noreferrer"
       aria-label={destino.titulo} title={destino.titulo}>
      <WhatsIcon w={15} />
      <span className="lbl">{destino.curto}</span>
    </a>
  );
}
