import { urlMidia, TIPOS } from '../../services/comoFazerService';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ESTILOS_FOLHA = `
@page { size: A4 portrait; margin: 12mm; }
.cf-folha { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; line-height: 1.4; }
.cf-folha h1 { font-size: 20px; margin: 0 0 2px; }
.cf-folha h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; border-bottom: 1px solid #999; padding-bottom: 2px; margin: 14px 0 6px; }
.cf-folha .sub { color: #444; font-size: 11px; }
.cf-folha .passo { display: flex; gap: 8px; margin: 6px 0; page-break-inside: avoid; border: 1px solid #ccc; border-radius: 6px; padding: 6px; }
.cf-folha .passo .n { flex: none; width: 22px; height: 22px; border-radius: 50%; background: #1E3932; color: #fff; text-align: center; line-height: 22px; font-weight: 700; }
.cf-folha .passo .t { flex: 1; } .cf-folha .passo .t b { font-size: 13px; }
.cf-folha .passo img { width: 6cm; max-height: 4.5cm; object-fit: cover; border-radius: 4px; }
.cf-folha .nao { border-left: 4px solid #b91c1c; background: #fef2f2; padding: 6px 8px; margin: 8px 0; }
.cf-folha table { width: 100%; border-collapse: collapse; margin-top: 4px; }
.cf-folha th, .cf-folha td { border: 1px solid #bbb; padding: 3px 5px; text-align: left; font-size: 11px; vertical-align: top; }
.cf-folha th { background: #eee; }
`;

function passosHtml(passos) {
    return (passos || []).map((p, i) => {
        const itens = Array.isArray(p.itens) && p.itens.length
            ? `<div>${p.itens.map((it) => `<div>• <b>${esc(it.quantidade)}</b> ${esc(it.unidade)} — ${esc(it.nome)}</div>`).join('')}</div>` : '';
        const foto = p.foto ? `<img src="${esc(urlMidia(p.foto))}" alt="">` : '';
        return `<div class="passo"><div class="n">${i + 1}</div><div class="t"><b>${p.perigo ? '⚠ PERIGO — ' : ''}${esc(p.texto)}</b>${p.detalhe ? `<div class="sub">${esc(p.detalhe)}</div>` : ''}${itens}</div>${foto}</div>`;
    }).join('');
}

/** HTML (corpo) do documento do conteúdo para a folha A4. */
export function montarCorpoDocumento(conteudo) {
    const doc = conteudo?.versao?.doc || {};
    const secoes = Array.isArray(doc.secoes) ? doc.secoes : [];
    const tipo = TIPOS[conteudo?.tipo]?.rotulo || '';
    const cab = [conteudo?.codigo, conteudo?.versao?.numero != null ? `versão ${conteudo.versao.numero}` : ''].filter(Boolean).join(' · ');
    const v = conteudo?.versao || {};
    const dataAprov = v.publicadaEm ? new Date(v.publicadaEm).toLocaleDateString('pt-BR') : '';
    const aprov = dataAprov ? `aprovada${v.publicadaPor?.nome ? ` por ${v.publicadaPor.nome}` : ''} em ${dataAprov}` : '';
    const enc = (Array.isArray(conteudo?.encarregados) ? conteudo.encarregados : []).map((e) => e?.nome).filter(Boolean).join(', ');
    const linha2 = [aprov, enc ? `encarregado: ${enc}` : ''].filter(Boolean).join(' · ');
    let h = `<div class="cf-folha"><h1>${esc(conteudo?.titulo)}</h1><div class="sub">${esc([tipo, cab].filter(Boolean).join(' · '))}</div>${linha2 ? `<div class="sub">${esc(linha2)}</div>` : ''}`;
    if (doc.avisoPerigo) h += `<div class="nao"><b>PERIGO:</b> ${esc(doc.avisoPerigo)}</div>`;
    if (doc.objetivo) h += `<h2>Para que serve</h2><div>${esc(doc.objetivo)}</div>`;
    if (doc.materiais) h += `<h2>O que precisa</h2><div>${esc(doc.materiais)}</div>`;
    secoes.forEach((s) => {
        h += `<h2>${esc(secoes.length > 1 ? (s.titulo || s.bloco) : 'Passos')}</h2>${passosHtml(s.passos)}`;
    });
    if (doc.naoFazer) h += `<div class="nao"><b>O que NÃO fazer:</b> ${esc(doc.naoFazer)}</div>`;
    if (Array.isArray(doc.seDerErrado) && doc.seDerErrado.length) {
        h += `<h2>Se der errado</h2><table><tr><th>Se…</th><th>Então…</th></tr>${doc.seDerErrado.map((r) => `<tr><td>${esc(r.se)}</td><td>${esc(r.entao)}</td></tr>`).join('')}</table>`;
    }
    return `${h}</div>`;
}
