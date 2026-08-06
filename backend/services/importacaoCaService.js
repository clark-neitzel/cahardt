/**
 * Importação do relatório "Contas a pagar" do Conta Azul (CSV).
 *
 * PARA QUE SERVE: o Conta Azul (CA) tem tudo o que a empresa deve/pagou (salário,
 * combustível, imposto, empréstimo...). O app só conhece o que nasce DENTRO dele
 * (lançamento manual ou NF-e capturada). Sem o histórico, a DRE e o Fluxo de Caixa
 * ficam vazios nos meses passados. Este serviço lê o CSV exportado do CA
 * (Financeiro → Contas a pagar → Exportar) e cria as contas no app.
 *
 * REGRAS IMPORTANTES:
 *  - As despesas do CSV JÁ EXISTEM no Conta Azul. Por isso as contas nascem com
 *    origem = IMPORTADO_CA e statusEnvioCA = NAO_ENVIAR — nunca são reenviadas ao CA
 *    (senão duplicaria tudo lá).
 *  - O próprio CSV diz se foi pago (coluna "Situação" + "Data da baixa" + "Valor
 *    baixado"). Não precisa consultar o CA de novo para o histórico.
 *  - Reimportar o mesmo mês NÃO duplica: cada conta tem uma chave natural
 *    (vencimento|cnpj/nome|descrição). Reimportar atualiza a baixa se algo que estava
 *    em aberto passou a quitado.
 *
 * Só toca em contas com origem IMPORTADO_CA. Contas do app (MANUAL/NFE) nunca são
 * alteradas por aqui.
 */

const crypto = require('crypto');
const prisma = require('../config/database');
const categoriaDespesaService = require('./categoriaDespesaService');

const round2 = (v) => Math.round(Number(v) * 100) / 100;
const num = (v) => Number(v || 0);

// ─────────────────────────────────────────────────────────────
// Normalização de texto (para chaves e comparação de categorias)
// ─────────────────────────────────────────────────────────────

/** minúsculas, sem acento, espaços colapsados. */
function normalizar(s) {
    return String(s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

const VAZIO = new Set(['', '(em branco)', 'em branco']);
/** Campo vazio do CA (inclui o literal "(em branco)"). */
const ehVazio = (s) => VAZIO.has(normalizar(s));
const limpo = (s) => (ehVazio(s) ? '' : String(s).trim());
// CNPJ ALFANUMÉRICO: normaliza documento preservando letras (não usar replace(/\D/g,'')).
const { normalizarDoc } = require('../utils/documento');

// ─────────────────────────────────────────────────────────────
// Parse de CSV (RFC 4180: aspas, vírgula e quebra de linha dentro de aspas)
// ─────────────────────────────────────────────────────────────

/**
 * Divide o texto CSV em linhas → colunas. Trata campos entre aspas com vírgulas,
 * quebras de linha e aspas escapadas ("").  Função PURA.
 * @returns {string[][]} linhas de campos
 */
function parseCsv(texto) {
    const linhas = [];
    let campo = '';
    let linha = [];
    let dentroAspas = false;
    const s = String(texto || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (dentroAspas) {
            if (c === '"') {
                if (s[i + 1] === '"') { campo += '"'; i++; } // aspas escapadas
                else dentroAspas = false;
            } else {
                campo += c;
            }
        } else if (c === '"') {
            dentroAspas = true;
        } else if (c === ',') {
            linha.push(campo); campo = '';
        } else if (c === '\n') {
            linha.push(campo); campo = '';
            linhas.push(linha); linha = [];
        } else {
            campo += c;
        }
    }
    // último campo/linha (sem \n final)
    if (campo !== '' || linha.length > 0) {
        linha.push(campo);
        linhas.push(linha);
    }
    return linhas;
}

// ─────────────────────────────────────────────────────────────
// Parse de valores e datas no padrão brasileiro
// ─────────────────────────────────────────────────────────────

/** "-16.837,77" → -16837.77 ; "0,00" → 0 ; vazio → 0. */
function parseValorBR(s) {
    const t = limpo(s);
    if (!t) return 0;
    const n = parseFloat(t.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
}

/** "01/04/2026" → Date (meio-dia em SP, evita virar dia anterior no fuso). vazio → null. */
function parseDataBR(s) {
    const t = limpo(s);
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
    if (!m) return null;
    const [, d, mes, a] = m;
    const dt = new Date(`${a}-${mes}-${d}T12:00:00-03:00`);
    return isNaN(dt.getTime()) ? null : dt;
}

const ymd = (d) => (d ? new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : '');

// ─────────────────────────────────────────────────────────────
// Interpretação das linhas do relatório do CA
// ─────────────────────────────────────────────────────────────

// Cabeçalhos esperados (normalizados) → chave interna.
const COLUNAS = {
    'data de vencimento': 'vencimento',
    'descricao da parcela': 'descricao',
    'nome do cliente ou fornecedor': 'fornecedor',
    'a pagar ou a receber': 'tipo',
    'categoria': 'categoria',
    'valor em aberto': 'valorAberto',
    'valor baixado (liquido)': 'valorBaixado',
    'valor da perda': 'valorPerda',
    'conta financeira': 'contaFinanceira',
    'cpf/cnpj do cliente ou fornecedor': 'cnpjCpf',
    'data da baixa': 'dataBaixa',
    'forma de pagamento': 'formaPagamento',
    'instituicao bancaria': 'instituicao',
    'situacao': 'situacao',
    'valor da multa': 'valorMulta'
};

/**
 * Lê o texto do CSV e devolve as CONTAS já agrupadas (rateio por categoria) e com a
 * situação de pagamento resolvida. Função PURA — não toca no banco.
 *
 * Agrupa linhas da mesma conta pela chave (vencimento | cnpj/nome | descrição): uma
 * nota rateada em várias categorias (ex.: Combustíveis + Descontos obtidos) vira UMA
 * conta com vários rateios.
 *
 * @returns {{ contas: Array, totalLinhas:number, ignoradas:number, avisos:string[] }}
 */
function interpretarCsv(texto) {
    const linhas = parseCsv(texto);
    const avisos = [];

    // Acha o cabeçalho (linha que tem "Data de vencimento" e "Situação")
    let head = -1;
    for (let i = 0; i < linhas.length; i++) {
        const norm = linhas[i].map(normalizar);
        if (norm.includes('data de vencimento') && norm.includes('situacao')) { head = i; break; }
    }
    if (head === -1) {
        return { contas: [], totalLinhas: 0, ignoradas: 0, avisos: ['Não achei o cabeçalho do relatório (esperado "Data de vencimento"). Confira se é o CSV de Contas a pagar do Conta Azul.'] };
    }

    const cab = linhas[head].map(normalizar);
    const idx = {}; // chave interna → índice da coluna
    cab.forEach((nome, i) => { if (COLUNAS[nome] !== undefined) idx[COLUNAS[nome]] = i; });
    if (idx.vencimento === undefined || idx.descricao === undefined) {
        return { contas: [], totalLinhas: 0, ignoradas: 0, avisos: ['O CSV não tem as colunas esperadas de Contas a pagar.'] };
    }

    const val = (row, chave) => (idx[chave] !== undefined ? row[idx[chave]] : '');
    const grupos = new Map();
    let totalLinhas = 0;
    let ignoradas = 0;

    for (let i = head + 1; i < linhas.length; i++) {
        const row = linhas[i];
        if (!row || row.length === 0) continue;
        const venc = parseDataBR(val(row, 'vencimento'));
        if (!venc) { ignoradas++; continue; } // linha de totais / vazia

        const tipo = normalizar(val(row, 'tipo'));
        if (tipo && tipo.includes('receber')) { ignoradas++; continue; } // por segurança

        totalLinhas++;
        const descricao = limpo(val(row, 'descricao')) || 'Sem descrição';
        const fornecedorNome = limpo(val(row, 'fornecedor'));
        const cnpjCpf = normalizarDoc(val(row, 'cnpjCpf'));
        const categoria = limpo(val(row, 'categoria')) || 'Sem categoria';
        const aberto = parseValorBR(val(row, 'valorAberto'));   // ≤ 0 para o que ainda se deve
        const baixado = parseValorBR(val(row, 'valorBaixado')); // ≤ 0 pago; > 0 = desconto obtido
        const multa = parseValorBR(val(row, 'valorMulta'));     // ≤ 0
        const dataBaixa = parseDataBR(val(row, 'dataBaixa'));
        const formaPagamento = limpo(val(row, 'formaPagamento'));
        const situacao = normalizar(val(row, 'situacao'));

        // Despesa da linha (magnitude positiva): -(aberto + baixado). Ex.: baixado -318,39
        // → +318,39; desconto obtido +25,90 → -25,90 (crédito, reduz a despesa).
        const despesa = round2(-(aberto + baixado));
        const pagoPrincipal = round2(-baixado); // saiu do banco (líquido de desconto)
        const abertoPrincipal = round2(-aberto); // ainda a pagar
        const multaPaga = round2(-multa);

        const chave = `${ymd(venc)}|${cnpjCpf || normalizar(fornecedorNome)}|${normalizar(descricao)}`;

        if (!grupos.has(chave)) {
            grupos.set(chave, {
                chave,
                hash: crypto.createHash('sha1').update(chave).digest('hex'),
                vencimento: venc,
                descricao,
                fornecedorNome,
                cnpjCpf,
                dataBaixa: null,
                formaPagamento: '',
                situacao,
                rateios: new Map(), // categoria → valor (despesa)
                valorTotal: 0,
                pagoPrincipal: 0,
                abertoPrincipal: 0,
                multaPaga: 0
            });
        }
        const g = grupos.get(chave);
        g.rateios.set(categoria, round2((g.rateios.get(categoria) || 0) + despesa));
        g.valorTotal = round2(g.valorTotal + despesa);
        g.pagoPrincipal = round2(g.pagoPrincipal + pagoPrincipal);
        g.abertoPrincipal = round2(g.abertoPrincipal + abertoPrincipal);
        g.multaPaga = round2(g.multaPaga + multaPaga);
        if (dataBaixa && !g.dataBaixa) g.dataBaixa = dataBaixa;
        if (formaPagamento && !g.formaPagamento) g.formaPagamento = formaPagamento;
        // guarda a "pior" situação do grupo (aberto > parcial > quitado) para exibição
        if (situacao) g.situacao = situacao;
    }

    // Resolve status e monta a lista final
    const contas = [];
    for (const g of grupos.values()) {
        const status = resolverStatus(g);
        const rateios = [...g.rateios.entries()].map(([categoria, valor]) => ({ categoria, valor: round2(valor) }));
        contas.push({
            hash: g.hash,
            vencimento: g.vencimento,
            competencia: g.vencimento,
            descricao: g.descricao,
            fornecedorNome: g.fornecedorNome,
            cnpjCpf: g.cnpjCpf,
            valorTotal: round2(g.valorTotal),
            pago: round2(g.pagoPrincipal),
            multaPaga: round2(g.multaPaga),
            dataBaixa: g.dataBaixa,
            formaPagamento: g.formaPagamento,
            status,          // ABERTO | PARCIAL | QUITADO
            rateios,
            categorias: rateios.map((r) => r.categoria)
        });
    }
    return { contas, totalLinhas, ignoradas, avisos };
}

/** Status da conta a partir da coluna "Situação" (com fallback pelos valores). */
function resolverStatus(g) {
    const s = g.situacao || '';
    if (s.includes('parcial')) return 'PARCIAL';
    if (s.includes('quitado')) return 'QUITADO';
    if (s.includes('aberto')) return 'ABERTO';
    // fallback pelos valores
    if (g.abertoPrincipal <= 0.01 && g.pagoPrincipal > 0.01) return 'QUITADO';
    if (g.pagoPrincipal > 0.01 && g.abertoPrincipal > 0.01) return 'PARCIAL';
    return 'ABERTO';
}

const STATUS_PARCELA = { QUITADO: 'PAGO', PARCIAL: 'PARCIAL', ABERTO: 'PENDENTE' };

// ─────────────────────────────────────────────────────────────
// Classificação padrão de categorias (baldes da DRE)
// ─────────────────────────────────────────────────────────────

// Palpite inicial por categoria (chave normalizada). O usuário ajusta na tela
// "Categorias de Despesa". O que não estiver aqui nasce A_CLASSIFICAR (ainda conta
// na DRE, mas fica sinalizado para revisão).
const CLASSIF_PADRAO = {
    // FORA_DRE — não é despesa de resultado (retirada de lucros, dívida, bens)
    'antecipacao de lucros': 'FORA_DRE',
    'emprestimos de bancos': 'FORA_DRE',
    'emprestimos de outras instituicoes': 'FORA_DRE',
    'aplicacoes cotas': 'FORA_DRE',
    'leasing - veiculos': 'FORA_DRE',
    'veiculos': 'FORA_DRE',
    'moveis, utensilios e instalacoes administrativos': 'FORA_DRE',
    'computadores e perifericos': 'FORA_DRE',
    'outras imobilizacoes por aquisicao': 'FORA_DRE',
    // FINANCEIRO — juros e tarifas (entram na DRE em linha à parte)
    'tarifas bancarias': 'FINANCEIRO',
    'tarifas de boletos': 'FINANCEIRO',
    'juros conta garantida': 'FINANCEIRO',
    'juros': 'FINANCEIRO',
    // OPERACIONAL — custo/despesa do dia a dia (entram na DRE)
    'materia prima': 'OPERACIONAL',
    'embalagens': 'OPERACIONAL',
    'materiais para revenda': 'OPERACIONAL',
    'combustiveis': 'OPERACIONAL',
    'fretes pagos': 'OPERACIONAL',
    'pedagios': 'OPERACIONAL',
    'manutencao de veiculos': 'OPERACIONAL',
    'seguros de veiculos': 'OPERACIONAL',
    'salarios': 'OPERACIONAL',
    'comissoes de vendedores': 'OPERACIONAL',
    'beneficios aos funcionarios': 'OPERACIONAL',
    'vale-alimentacao': 'OPERACIONAL',
    'vale-transporte': 'OPERACIONAL',
    'adiantamento salarial': 'OPERACIONAL',
    'rescisoes': 'OPERACIONAL',
    'servicos tercerizado': 'OPERACIONAL',
    'energia eletrica': 'OPERACIONAL',
    'agua e saneamento': 'OPERACIONAL',
    'gas glp': 'OPERACIONAL',
    'telefonia e internet': 'OPERACIONAL',
    'software / licenca de uso': 'OPERACIONAL',
    'materiais de escritorio': 'OPERACIONAL',
    'materiais de limpeza e de higiene': 'OPERACIONAL',
    'copa e cozinha': 'OPERACIONAL',
    'manutencao predial': 'OPERACIONAL',
    'manutencao de equipamentos': 'OPERACIONAL',
    'despesa com vendas': 'OPERACIONAL',
    'viagens e representacoes': 'OPERACIONAL',
    'confraternizacoes': 'OPERACIONAL',
    'honorarios advocaticios': 'OPERACIONAL',
    'honorarios contabeis': 'OPERACIONAL',
    'iptu': 'OPERACIONAL',
    'inss': 'OPERACIONAL',
    'inss sobre salarios - gps': 'OPERACIONAL',
    'impostos retidos em vendas': 'OPERACIONAL',
    'pis/cofins/csll': 'OPERACIONAL',
    'descontos incondicionais obtidos': 'OPERACIONAL',
    'alimentacao/outros': 'OPERACIONAL'
};

/** Classificação sugerida para uma categoria (nome original). */
function classificacaoPadrao(nome) {
    return CLASSIF_PADRAO[normalizar(nome)] || 'A_CLASSIFICAR';
}

// ─────────────────────────────────────────────────────────────
// Blocos da DRE (grupos) — padrão de fábrica + palpite por categoria
// ─────────────────────────────────────────────────────────────

// Blocos criados na primeira vez (o usuário pode renomear, reordenar e criar mais).
const GRUPOS_DRE_PADRAO = [
    'Impostos sobre vendas',
    'Custos variáveis',
    'Pessoal',
    'Veículos e entregas',
    'Administrativas',
    'Financeiras',
    'Sócios'
];

// Palpite de bloco + natureza (FIXA/VARIAVEL) por categoria conhecida (chave normalizada).
// Regra do palpite: "se eu vender o dobro, esse gasto dobra?" → VARIAVEL; senão FIXA.
// Só vale para categoria que ainda não tem bloco NEM natureza — nunca sobrescreve escolha do usuário.
const GRUPO_NATUREZA_PADRAO = {
    // Impostos que incidem sobre a venda
    'pis/cofins/csll': ['Impostos sobre vendas', 'VARIAVEL'],
    'impostos retidos em vendas': ['Impostos sobre vendas', 'VARIAVEL'],
    'icms st': ['Impostos sobre vendas', 'VARIAVEL'],
    'simples nacional': ['Impostos sobre vendas', 'VARIAVEL'],
    // Custos que crescem junto com a produção/venda
    'materia prima': ['Custos variáveis', 'VARIAVEL'],
    'embalagens': ['Custos variáveis', 'VARIAVEL'],
    'materiais para revenda': ['Custos variáveis', 'VARIAVEL'],
    'gas glp': ['Custos variáveis', 'VARIAVEL'],
    'energia eletrica': ['Custos variáveis', 'VARIAVEL'],
    'comissoes de vendedores': ['Custos variáveis', 'VARIAVEL'],
    'fretes pagos': ['Custos variáveis', 'VARIAVEL'],
    'despesa com vendas': ['Custos variáveis', 'VARIAVEL'],
    'tarifas de boletos': ['Custos variáveis', 'VARIAVEL'],
    // Pessoal (estrutura — paga vendendo ou não)
    'salarios': ['Pessoal', 'FIXA'],
    'adiantamento salarial': ['Pessoal', 'FIXA'],
    'ferias': ['Pessoal', 'FIXA'],
    'rescisoes': ['Pessoal', 'FIXA'],
    'fgts': ['Pessoal', 'FIXA'],
    'inss': ['Pessoal', 'FIXA'],
    'inss sobre salarios - gps': ['Pessoal', 'FIXA'],
    'irrf sobre salarios': ['Pessoal', 'FIXA'],
    'beneficios aos funcionarios': ['Pessoal', 'FIXA'],
    'vale-alimentacao': ['Pessoal', 'FIXA'],
    'vale-transporte': ['Pessoal', 'FIXA'],
    'exames medicos': ['Pessoal', 'FIXA'],
    'servicos tercerizado': ['Pessoal', 'FIXA'],
    // Veículos e entregas
    'combustiveis': ['Veículos e entregas', 'VARIAVEL'],
    'pedagios': ['Veículos e entregas', 'VARIAVEL'],
    'manutencao de veiculos': ['Veículos e entregas', 'FIXA'],
    'seguros de veiculos': ['Veículos e entregas', 'FIXA'],
    'multas de transito': ['Veículos e entregas', 'FIXA'],
    // Administrativas (custo de existir)
    'honorarios contabeis': ['Administrativas', 'FIXA'],
    'honorarios advocaticios': ['Administrativas', 'FIXA'],
    'software / licenca de uso': ['Administrativas', 'FIXA'],
    'telefonia e internet': ['Administrativas', 'FIXA'],
    'telefonia movel': ['Administrativas', 'FIXA'],
    'materiais de escritorio': ['Administrativas', 'FIXA'],
    'materiais de limpeza e de higiene': ['Administrativas', 'FIXA'],
    'copa e cozinha': ['Administrativas', 'FIXA'],
    'alimentacao/outros': ['Administrativas', 'FIXA'],
    'manutencao predial': ['Administrativas', 'FIXA'],
    'manutencao de equipamentos': ['Administrativas', 'FIXA'],
    'iptu': ['Administrativas', 'FIXA'],
    'agua e saneamento': ['Administrativas', 'FIXA'],
    'marketing': ['Administrativas', 'FIXA'],
    'viagens e representacoes': ['Administrativas', 'FIXA'],
    'confraternizacoes': ['Administrativas', 'FIXA'],
    // Financeiras
    'tarifas bancarias': ['Financeiras', 'FIXA'],
    'juros conta garantida': ['Financeiras', 'FIXA'],
    'juros': ['Financeiras', 'FIXA'],
    'descontos incondicionais obtidos': ['Financeiras', 'FIXA'],
    // Sócios
    'pro-labore': ['Sócios', 'FIXA'],
    'pro labore': ['Sócios', 'FIXA'],
    'plano de saude socios': ['Sócios', 'FIXA']
};

/**
 * Garante os blocos padrão da DRE (se ainda não existir NENHUM) e aplica o
 * palpite de bloco+natureza nas categorias totalmente sem definição
 * (sem bloco E natureza A_DEFINIR E que entram na DRE). Idempotente;
 * nunca mexe no que o usuário já escolheu.
 */
async function garantirGruposDre() {
    const qtd = await prisma.grupoDre.count();
    if (qtd === 0) {
        for (let i = 0; i < GRUPOS_DRE_PADRAO.length; i++) {
            await prisma.grupoDre.create({ data: { nome: GRUPOS_DRE_PADRAO[i], ordem: i } })
                .catch(() => {}); // corrida entre requisições: ignora duplicado
        }
    }
    const grupos = await prisma.grupoDre.findMany({ orderBy: { ordem: 'asc' } });
    const grupoPorNome = new Map(grupos.map((g) => [normalizar(g.nome), g.id]));

    // Palpite só para quem está 100% sem definição
    const pendentes = await prisma.categoriaDespesa.findMany({
        where: { grupoDreId: null, natureza: 'A_DEFINIR', classificacao: { not: 'FORA_DRE' } },
        select: { id: true, nome: true }
    });
    for (const cat of pendentes) {
        const palpite = GRUPO_NATUREZA_PADRAO[normalizar(cat.nome)];
        if (!palpite) continue;
        const grupoId = grupoPorNome.get(normalizar(palpite[0]));
        if (!grupoId) continue; // usuário renomeou/apagou o bloco padrão — respeita
        await prisma.categoriaDespesa.update({
            where: { id: cat.id },
            data: { grupoDreId: grupoId, natureza: palpite[1] }
        }).catch(() => {});
    }
    return grupos;
}

// ─────────────────────────────────────────────────────────────
// Importação (escreve no banco)
// ─────────────────────────────────────────────────────────────

/**
 * Garante que exista uma linha em CategoriaDespesa para cada categoria vista,
 * com a classificação-palpite. Não sobrescreve o que o usuário já classificou.
 */
async function garantirCategorias(nomes, tx = prisma) {
    const unicos = [...new Set(nomes.filter(Boolean))];
    if (unicos.length === 0) return;
    const existentes = new Set(
        (await tx.categoriaDespesa.findMany({ where: { nome: { in: unicos } }, select: { nome: true } }))
            .map((c) => c.nome)
    );
    const novas = unicos.filter((n) => !existentes.has(n));
    for (const nome of novas) {
        await tx.categoriaDespesa.create({
            data: { nome, classificacao: classificacaoPadrao(nome) }
        }).catch(() => {}); // corrida entre importações: ignora duplicado
    }
}

/**
 * Encontra/cria o fornecedor (por CNPJ/CPF; senão pelo nome). Fornecedores
 * importados nascem NAO_ENVIAR — já existem no CA.
 * @param {Map} cache  cnpj|nome → fornecedorId (evita requery no mesmo lote)
 */
async function resolverFornecedor(conta, cache, tx) {
    const chave = conta.cnpjCpf || normalizar(conta.fornecedorNome);
    if (!chave) return null;
    if (cache.has(chave)) return cache.get(chave);

    let fornecedor = null;
    if (conta.cnpjCpf) {
        fornecedor = await tx.fornecedor.findFirst({ where: { cnpjCpf: conta.cnpjCpf } });
    } else if (conta.fornecedorNome) {
        fornecedor = await tx.fornecedor.findFirst({ where: { razaoSocial: conta.fornecedorNome } });
    }
    if (!fornecedor) {
        fornecedor = await tx.fornecedor.create({
            data: {
                cnpjCpf: conta.cnpjCpf || null,
                razaoSocial: conta.fornecedorNome || 'Fornecedor sem nome',
                origem: 'CA',
                statusEnvioCA: 'NAO_ENVIAR'
            }
        });
    }
    cache.set(chave, fornecedor.id);
    return fornecedor.id;
}

/**
 * Importa (ou simula) o CSV.
 * @param {string} texto   conteúdo do CSV
 * @param {object} opts    { dryRun:boolean, userId:string }
 * @returns resumo { novas, atualizadas, jaImportadas, ignoradasOutraOrigem, totalContas,
 *                   qtdPagas, valorTotal, valorPago, avisos, categoriasNovas, previewDryRun? }
 */
async function importar(texto, { dryRun = false, userId = null } = {}) {
    const { contas, totalLinhas, ignoradas, avisos } = interpretarCsv(texto);
    const resumo = {
        totalLinhas,
        ignoradasLinhas: ignoradas,
        totalContas: contas.length,
        novas: 0,
        atualizadas: 0,
        jaImportadas: 0,
        ignoradasOutraOrigem: 0,
        qtdPagas: contas.filter((c) => c.status !== 'ABERTO').length,
        valorTotal: round2(contas.reduce((s, c) => s + c.valorTotal, 0)),
        valorPago: round2(contas.reduce((s, c) => s + c.pago, 0)),
        categoriasNovas: [],
        avisos: [...avisos],
        dryRun
    };
    if (contas.length === 0) return resumo;

    // Categorias novas (para avisar quantas precisam de classificação)
    const nomesCat = [...new Set(contas.flatMap((c) => c.categorias))];
    const catExistentes = new Set(
        (await prisma.categoriaDespesa.findMany({ where: { nome: { in: nomesCat } }, select: { nome: true } }))
            .map((c) => c.nome)
    );
    resumo.categoriasNovas = nomesCat.filter((n) => !catExistentes.has(n));

    // Situação de cada conta frente ao banco (por hash)
    const hashes = contas.map((c) => c.hash);
    const existentes = await prisma.contaPagar.findMany({
        where: { hashImportacao: { in: hashes } },
        select: { id: true, hashImportacao: true, origem: true, status: true }
    });
    const porHash = new Map(existentes.map((e) => [e.hashImportacao, e]));

    for (const c of contas) {
        const ex = porHash.get(c.hash);
        if (!ex) resumo.novas++;
        else if (ex.origem !== 'IMPORTADO_CA') resumo.ignoradasOutraOrigem++;
        else if (ex.status !== 'QUITADO' && c.status === 'QUITADO') resumo.atualizadas++;
        else resumo.jaImportadas++;
    }

    if (dryRun) return resumo;

    // ── Grava ──
    await garantirCategorias(nomesCat);
    const catIds = await categoriaDespesaService.garantirIds(nomesCat); // nome → id (Fase 0 Contabilidade)
    const cacheForn = new Map();

    for (const c of contas) {
        const ex = porHash.get(c.hash);
        if (ex && ex.origem !== 'IMPORTADO_CA') continue; // não toca em conta do app/NF-e

        const fornecedorId = await resolverFornecedor(c, cacheForn, prisma);
        const statusParcela = STATUS_PARCELA[c.status] || 'PENDENTE';
        const dataPag = c.dataBaixa || c.vencimento;

        if (!ex) {
            // Cria a conta + parcela única + rateios + (se pago) baixa no ledger
            await prisma.contaPagar.create({
                data: {
                    fornecedorId,
                    descricao: c.descricao,
                    categoria: c.rateios.length === 1 ? c.rateios[0].categoria : null,
                    categoriaDespesaId: c.rateios.length === 1 ? (catIds.get(c.rateios[0].categoria) || null) : null,
                    origem: 'IMPORTADO_CA',
                    hashImportacao: c.hash,
                    valorTotal: c.valorTotal,
                    status: c.status,
                    competencia: c.competencia || c.vencimento,
                    dataEmissao: c.competencia || c.vencimento,
                    statusEnvioCA: 'NAO_ENVIAR',
                    criadoPorId: userId,
                    rateios: { create: c.rateios.map((r) => ({ categoria: r.categoria, categoriaDespesaId: catIds.get(r.categoria) || null, valor: r.valor })) },
                    parcelas: {
                        create: [{
                            numeroParcela: 1,
                            valor: c.valorTotal,
                            dataVencimento: c.vencimento,
                            status: statusParcela,
                            dataPagamento: c.status !== 'ABERTO' ? dataPag : null,
                            valorPago: c.status !== 'ABERTO' ? c.pago : null,
                            formaPagamento: c.formaPagamento || null,
                            pagamentos: c.pago > 0.01 ? {
                                create: [{
                                    valorPago: c.pago,
                                    multa: c.multaPaga || 0,
                                    formaPagamento: c.formaPagamento || null,
                                    dataPagamento: dataPag,
                                    origem: 'IMPORTADO_CA',
                                    statusEnvioCA: 'NAO_ENVIAR',
                                    registradoPorId: userId
                                }]
                            } : undefined
                        }]
                    }
                }
            });
        } else if (ex.status !== 'QUITADO' && c.status === 'QUITADO') {
            // Reimportação: o que estava em aberto agora está pago → registra a baixa.
            await reconciliarPagamento(ex.id, c, userId);
        }
        // senão: já importada e sem mudança → nada a fazer
    }

    return resumo;
}

/**
 * Registra a baixa faltante numa conta importada que passou a QUITADO na reimportação.
 * Não duplica: só lança o que ainda falta para cobrir a parcela.
 */
async function reconciliarPagamento(contaId, c, userId) {
    const conta = await prisma.contaPagar.findUnique({
        where: { id: contaId },
        include: { parcelas: { include: { pagamentos: { where: { estornado: false } } } } }
    });
    if (!conta) return;
    const dataPag = c.dataBaixa || c.vencimento;
    await prisma.$transaction(async (tx) => {
        for (const p of conta.parcelas) {
            const jaPago = p.pagamentos.reduce((s, pg) => s + Number(pg.valorPago) + Number(pg.desconto), 0);
            const falta = round2(Number(p.valor) - jaPago);
            if (falta > 0.01) {
                await tx.pagamentoParcelaPagar.create({
                    data: {
                        parcelaPagarId: p.id,
                        valorPago: falta,
                        multa: c.multaPaga || 0,
                        formaPagamento: c.formaPagamento || null,
                        dataPagamento: dataPag,
                        origem: 'IMPORTADO_CA',
                        statusEnvioCA: 'NAO_ENVIAR',
                        registradoPorId: userId
                    }
                });
            }
            await tx.parcelaPagar.update({
                where: { id: p.id },
                data: { status: 'PAGO', dataPagamento: dataPag, valorPago: Number(p.valor) }
            });
        }
        await tx.contaPagar.update({ where: { id: conta.id }, data: { status: 'QUITADO' } });
    }, { timeout: 20000, maxWait: 10000 });
}

module.exports = {
    importar,
    // puras (testáveis offline)
    parseCsv,
    parseValorBR,
    parseDataBR,
    interpretarCsv,
    resolverStatus,
    classificacaoPadrao,
    normalizar,
    garantirCategorias,
    garantirGruposDre,
    CLASSIF_PADRAO
};
