// =====================================================================
// Impressão da RECEITA em PDF — rota do arquivo.
//
// Fica FORA do authMiddleware de propósito: o link é aberto pelo próprio
// navegador/visualizador do aparelho (o PDF é baixado pelo Safari/Chrome,
// não pelo axios do app), e um navegador NÃO manda o header
// `Authorization: Bearer`. Por isso a credencial viaja na URL, como um
// JWT curto (5 minutos) assinado pelo mesmo JWT_SECRET e amarrado a UMA
// receita e a UM tipo de folha. O link é emitido pela rota autenticada
// POST /api/pcp/receitas/:id/link-impressao, que confere a permissão de PCP.
//
// Não há cache em disco: gerar a folha custa milissegundos e a receita muda
// (versão, ingrediente, custo) — cache só traria folha velha na cozinha.
// =====================================================================
const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

const JWT_SECRET = require('../config/jwtSecret');
const pcpReceitaService = require('../services/pcpReceitaService');
const receitaPdfService = require('../services/receitaPdfService');

const TIPOS = ['cozinha', 'custos'];
const VALIDADE = '5m';          // o link vale 5 minutos — tempo de abrir e imprimir
const ESCOPO = 'pcp_impressao_receita';

// Emite o token do link (usado pela rota autenticada de PCP).
function assinarToken({ receitaId, tipo, usuarioId }) {
    return jwt.sign({ escopo: ESCOPO, receitaId, tipo, uid: usuarioId || null }, JWT_SECRET, { expiresIn: VALIDADE });
}

// Nome de arquivo seguro (o Content-Disposition não aceita acento/aspas).
function nomeArquivo(receita, tipo) {
    const base = String(receita?.nome || 'receita')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
        .slice(0, 60) || 'receita';
    return `receita-${base}${tipo === 'custos' ? '-custos' : ''}.pdf`;
}

// ---------------------------------------------------------------------
// Erro DESTA rota vira PÁGINA, não JSON.
//
// Quem abre este endereço é o navegador do aparelho (a aba do PDF), não o
// axios do app. Quando o usuário deixa a aba aberta e recarrega depois dos
// 5 minutos, uma resposta JSON aparece como `{"error":"..."}` cru na tela.
// O código HTTP continua exatamente o mesmo (401/403/404) — é dele que
// dependem a segurança e os testes; muda só a embalagem.
// (A rota POST /link-impressao, essa sim consumida por JavaScript, continua
// devolvendo JSON — não é mexida aqui.)
// ---------------------------------------------------------------------
function escaparHtml(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

function paginaDeErro(res, status, titulo, recado) {
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escaparHtml(titulo)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       padding:24px;background:#f2f0eb;color:rgba(0,0,0,.87);
       font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
       line-height:1.5;-webkit-text-size-adjust:100%}
  .folha{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:32px 24px;
         max-width:520px;width:100%;box-shadow:0 1px 3px rgba(0,0,0,.06);text-align:center}
  .marca{font-size:44px;line-height:1;margin-bottom:12px}
  h1{margin:0 0 12px;font-size:26px;font-weight:800;color:#1E3932}
  p{margin:0 0 16px;font-size:18px;color:#374151}
  .passos{margin:24px 0 0;padding:16px;background:#d4e9e2;border-radius:12px;text-align:left;
          font-size:17px;color:#1E3932}
  .passos strong{display:block;margin-bottom:8px;font-size:13px;font-weight:800;
                 text-transform:uppercase;letter-spacing:.1em;color:#006241}
  ol{margin:0;padding-left:22px}
  li{margin:6px 0}
  .rodape{margin:20px 0 0;font-size:14px;color:#6b7280}
  @media (max-width:380px){h1{font-size:22px}p{font-size:16px}}
</style>
</head>
<body>
  <main class="folha">
    <div class="marca" aria-hidden="true">🖨️</div>
    <h1>${escaparHtml(titulo)}</h1>
    <p>${escaparHtml(recado)}</p>
    <div class="passos">
      <strong>O que fazer</strong>
      <ol>
        <li>Volte ao aplicativo Hardt.</li>
        <li>Abra a receita.</li>
        <li>Toque em <b>Imprimir</b> de novo para gerar uma folha nova.</li>
      </ol>
    </div>
    <p class="rodape">Esta aba pode ser fechada.</p>
  </main>
</body>
</html>`;
    return res.status(status).type('html').send(html);
}

// GET /api/pcp-impressao/receita/:id.pdf?t=<token>&tipo=cozinha|custos
router.get('/receita/:id.pdf', async (req, res) => {
    try {
        const { t, tipo: tipoQuery } = req.query;
        const tipo = TIPOS.includes(tipoQuery) ? tipoQuery : 'cozinha';
        if (!t) return paginaDeErro(res, 401, 'Link sem credencial', 'Este endereço não tem a credencial da impressão. Gere a folha de novo pelo app.');

        let dados;
        try {
            dados = jwt.verify(t, JWT_SECRET);
        } catch (err) {
            const expirou = err.name === 'TokenExpiredError';
            return expirou
                ? paginaDeErro(res, 401, 'O link da impressão expirou', 'Por segurança, o link da folha vale só 5 minutos e este já venceu.')
                : paginaDeErro(res, 401, 'Link de impressão inválido', 'Não consegui reconhecer este link de impressão.');
        }

        // O token vale para UMA receita e UM tipo de folha — não dá para trocar
        // o id na URL nem promover a folha de cozinha para a folha com custos.
        if (dados.escopo !== ESCOPO) return paginaDeErro(res, 403, 'Link não serve para esta folha', 'Este link não é de impressão de receita.');
        if (dados.receitaId !== req.params.id) return paginaDeErro(res, 403, 'Link não confere', 'Este link foi gerado para outra receita.');
        if (dados.tipo !== tipo) return paginaDeErro(res, 403, 'Link não confere', 'Este link foi gerado para outro tipo de folha.');

        const receita = await pcpReceitaService.buscarPorId(req.params.id);
        if (!receita) return paginaDeErro(res, 404, 'Receita não encontrada', 'Esta receita não existe mais ou foi removida.');

        let pdf;
        if (tipo === 'custos') {
            let custo = null;
            try { custo = await pcpReceitaService.calcularCusto(receita.id); }
            catch (e) { console.warn('[PCP Impressão] Custo indisponível:', e.message); }  // folha sai com "—"
            pdf = await receitaPdfService.gerarReceitaComCustos(receita, custo);
        } else {
            pdf = await receitaPdfService.gerarReceitaCozinha(receita);
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${nomeArquivo(receita, tipo)}"`);
        res.setHeader('Content-Length', pdf.length);
        return res.send(pdf);
    } catch (err) {
        console.error('[PCP Impressão] Erro ao gerar PDF da receita:', err);
        return res.status(500).json({ error: 'Não consegui gerar o PDF da receita.' });
    }
});

module.exports = router;
module.exports.assinarToken = assinarToken;
module.exports.TIPOS = TIPOS;
