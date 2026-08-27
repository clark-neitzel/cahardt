/**
 * GET /api/cidades — LISTA CANÔNICA DE CIDADES DO SISTEMA.
 *
 * Para que serve: alimentar os dropdowns de cidade (filtro de clientes/leads, meta por
 * cidade, dashboards) na Fase 4 da padronização. Hoje cada tela monta a própria lista a
 * partir das linhas que carregou, e por isso a MESMA cidade aparece duas vezes
 * ("Joinville" e "JOINVILLE") — que é o defeito visível do problema que a Fase 1 conserta
 * na escrita.
 *
 * De onde vem: o distinct de `clientes."End_Cidade"`, `leads.cidade` e
 * `meta_cidades.cidade`, tudo passado por `normalizarCidade` e deduplicado pela chave de
 * comparação (`chaveCidade`). Ou seja: é a lista DEPOIS da padronização, mesmo antes de o
 * backfill da Fase 2 rodar — a tela já mostra o nome certo enquanto o banco ainda tem a
 * grafia velha.
 *
 * Fornecedores, bairros do Kit Festa e catálogo personalizado ficam DE FORA de propósito:
 * são cadastros de outra natureza (fornecedor de São Paulo não é cidade de venda) e
 * poluiriam o dropdown do vendedor com dezenas de cidades onde a empresa não atende.
 *
 * SOMENTE LEITURA. Auth normal do app (sem permissão especial): é uma lista de nomes de
 * cidade, sem dado de cliente, valor ou telefone — qualquer tela logada pode montar filtro.
 *
 * Custo: 3 GROUP BY no Postgres, uma linha por grafia distinta (~121 em 08/2026), nunca a
 * tabela inteira. As respostas de /api já saem com `Cache-Control: no-store` (global no
 * index.js) — nada a fazer aqui.
 */
const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { chaveCidade, normalizarCidade } = require('../utils/cidade');

router.get('/', async (req, res) => {
    try {
        // Uma fonte que falhe (tabela ausente num ambiente) devolve [] e o resto continua —
        // um dropdown incompleto é ruim, um 500 na tela é pior.
        const consulta = (sql) => prisma.$queryRawUnsafe(sql).catch((e) => {
            console.error('[cidades] falha em fonte:', e.message);
            return [];
        });

        const [rClientes, rLeads, rMetas] = await Promise.all([
            consulta(`SELECT "End_Cidade" AS valor, COUNT(*)::int AS n FROM clientes
                      WHERE "End_Cidade" IS NOT NULL AND btrim("End_Cidade") <> '' GROUP BY 1`),
            consulta(`SELECT cidade AS valor, COUNT(*)::int AS n FROM leads
                      WHERE cidade IS NOT NULL AND btrim(cidade) <> '' GROUP BY 1`),
            consulta(`SELECT cidade AS valor, COUNT(*)::int AS n FROM meta_cidades
                      WHERE cidade IS NOT NULL AND btrim(cidade) <> '' GROUP BY 1`),
        ]);

        // Deduplicação pela CHAVE, não pelo nome: é a chave que junta "Joinville" e
        // "JOINVILLE", e é ela que os apelidos de CIDADES_CANONICAS fundem ("Joiville"
        // também cai em Joinville). Map (não objeto) porque o nome vem do banco:
        // "constructor" e "__proto__" são só mais um nome aqui.
        const porChave = new Map();
        const registrar = (valor, n) => {
            const nome = normalizarCidade(valor);
            if (!nome) return;                      // vazio nunca vira opção do dropdown
            const chave = chaveCidade(nome);
            const atual = porChave.get(chave);
            if (atual) atual.registros += n;
            else porChave.set(chave, { cidade: nome, registros: n });
        };
        for (const r of rClientes) registrar(r.valor, r.n);
        for (const r of rLeads) registrar(r.valor, r.n);
        for (const r of rMetas) registrar(r.valor, r.n);

        const cidades = [...porChave.values()]
            .sort((a, b) => a.cidade.localeCompare(b.cidade, 'pt-BR'));

        res.json({
            ok: true,
            total: cidades.length,
            // `cidades`: só os nomes, que é o que o <option> precisa.
            // `detalhe`: nome + quantos registros usam — para a tela poder pôr as mais
            // usadas no topo sem precisar de outra rota.
            cidades: cidades.map(c => c.cidade),
            detalhe: cidades,
        });
    } catch (err) {
        console.error('[GET /api/cidades]', err);
        res.status(500).json({ ok: false, erro: 'Não foi possível carregar a lista de cidades.' });
    }
});

module.exports = router;
