/**
 * SERVIDOR LOCAL MÍNIMO para exercitar `GET /api/admin-exec/diag-cidades` com `curl`.
 *
 * Uso:  node scripts/servidor-teste-diag-cidades.js
 *       curl -s "http://localhost:3011/api/admin-exec/diag-cidades?tudo=1" \
 *            -H "x-admin-secret: teste-diag-cidades" | jq .resumo
 *
 * POR QUE ISTO EXISTE, EM VEZ DE `node index.js`
 * ----------------------------------------------
 * `index.js` sobe o app INTEIRO — e junto com ele os workers de verdade: backup do banco,
 * fila de WhatsApp, captura de NF-e na SEFAZ, régua de cobrança, sync com o Conta Azul.
 * Rodar isso na máquina de quem está testando uma rota SOMENTE LEITURA é convite a efeito
 * colateral (mensagem saindo, backup disparando). Aqui monta-se só o router do `adminExec`,
 * num app Express nu: nenhum worker liga.
 *
 * Aponta para o banco do `.env` do backend — que localmente é `hardt_local`, NUNCA produção.
 * Para diagnosticar produção o caminho é o `/api/admin-exec` publicado, com o `ADMIN_SECRET`
 * real; este script não serve para isso.
 *
 * Irmão de `teste-cidade.js` e `teste-cidade-nome-final.js`: os dois testam as funções
 * puras (sem banco); este é o único jeito de ver a ROTA respondendo com o dado real.
 *
 * Porta e segredo saem do ambiente, com padrão de teste:
 *   PORTA_TESTE=3011  SEGREDO_TESTE=teste-diag-cidades
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const PORTA = parseInt(process.env.PORTA_TESTE, 10) || 3011;
// O router recusa tudo se `ADMIN_SECRET` estiver vazio (fail-closed). Aqui ele é sempre
// um segredo de brincadeira e o servidor só escuta em localhost.
process.env.ADMIN_SECRET = process.env.SEGREDO_TESTE || 'teste-diag-cidades';

const express = require('express');
const app = express();
app.use(express.json());
app.use('/api/admin-exec', require('./../routes/adminExec'));

app.listen(PORTA, '127.0.0.1', () => {
    console.log(`[teste] adminExec em http://127.0.0.1:${PORTA}/api/admin-exec`);
    console.log(`[teste] header:  x-admin-secret: ${process.env.ADMIN_SECRET}`);
    console.log('[teste] nenhum worker foi iniciado. Ctrl+C para parar.');
});
