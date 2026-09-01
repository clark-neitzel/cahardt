// ─────────────────────────────────────────────────────────────────────────────
// LINHA DO TEMPO DO PEDIDO — lógica pura (sem React), usada pela popup de consulta
// do Painel de Atendimentos (`ModalPedidoConsulta.jsx`).
//
// Está num arquivo separado de propósito: aqui não tem JSX, então dá para rodar esta
// função direto no Node contra o banco e CONFERIR o que a tela vai escrever, pedido a
// pedido. Foi assim que os defeitos da 1ª rodada foram provados (pedidos #892 e #693).
//
// REGRA DE OURO DESTE ARQUIVO: rótulo só afirma o que o dado prova.
// Nada é deduzido, estimado nem arredondado para "ficar bonito". Quando o app não tem
// a informação (ex.: a data em que o pedido virou FATURADO), o certo é NÃO inventar
// evento e dizer isso no rodapé.
// ─────────────────────────────────────────────────────────────────────────────

// Papel/rótulo do responsável pela cobrança vêm do PONTO ÚNICO do frontend, nunca de uma
// cópia local: `frontend/src/utils/responsavelCobranca.js` já é usado por Contas a Receber
// (`ContasReceberTabela.jsx:24`), pela Auditoria de Entregas (`AuditoriaEntregas.jsx:11`) e
// pelo Caixa (`CaixaDiarioPage.jsx:18`). Se a derivação mudar lá, esta popup muda junto —
// era exatamente isso que uma segunda cópia aqui dentro ia impedir.
import { ehLinhaResponsavel, rotuloResponsavel } from '../../utils/responsavelCobranca';

export const fmtMoeda = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';

export const fmtDataHora = (d) => d
    ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

// ─────────────────────────────────────────────────────────────────────────────
// CAMPOS QUE SÓ TÊM DATA (sem hora) — não inventar hora, e não trocar o dia
//
// O banco tem TRÊS convenções de gravação para "só uma data", e as três passam pelo
// mesmo campo `DateTime`:
//   (a) MEIA-NOITE UTC   — `new Date('YYYY-MM-DD')`:
//       backend/routes/contasReceber.js:1174 e :1348 (baixa), backend/routes/caixa.js:2674
//   (b) 12:00 DE BRASÍLIA (= 15:00 UTC) — `new Date('YYYY-MM-DDT12:00:00-03:00')`:
//       backend/routes/embarques.js:278 e :379 (saída da carga), backend/routes/caixa.js:3094,
//       backend/services/caExtratoService.js:498
//   (c) MEIO-DIA UTC (= 09:00 de Brasília) — `new Date('YYYY-MM-DDT12:00:00Z')`:
//       frontend/src/pages/Pedidos/NovoPedido.jsx:976 grava assim a `dataVenda` (a data de
//       ENTREGA escolhida na venda), e `pedidoCalculos.gerarParcelasData` propaga o mesmo
//       carimbo para o vencimento das parcelas. Na base local: 354 `pedidos.data_venda` e
//       402 `parcelas.data_vencimento`.
//
// Formatar (a) no fuso de São Paulo devolve o DIA ANTERIOR às 21:00 (era o bug real:
// parcela paga em 15/08 aparecia "14/08/2026, 21:00", acima de "Pedido criado"; e o campo
// "Entrega" do cartão mostrava 31/03 nos pedidos #97 e #98, gravados em 01/04 00:00 UTC).
// Formatar (b) devolve o dia certo mas com a hora fabricada "12:00" (entregou 11:44 e
// "saiu na carga" às 12:00 — impossível). Formatar (c) também devolve o dia certo — 12:00
// UTC e 09:00 de Brasília são sempre o MESMO dia —, mas com a hora fabricada "09:00".
//
// Nos TRÊS casos o dia correto é o dia em UTC. É esse o dia que a tela mostra.
//
// ⚠️ A marca é comparada ao MILISSEGUNDO, de propósito. Instante de verdade tem
// milissegundo: o pedido #890 nasceu às 12:00:43.915 UTC (09:00:43 de Brasília) e continua
// sendo tratado como hora de verdade. Na base inteira, NENHUM instante real cai exatamente
// em 12:00:00.000 UTC — 0 de 1.141 `pedidos.created_at`, 0 de 958 `data_entrega`, 0 de 260
// `impresso_em`, 0 de 11 `carga_conferida_em`, 0 de 1.089 `contas_receber.created_at`,
// 0 de 777 `parcelas.data_pagamento` e 0 de 54 `devolucoes.data_devolucao` —, enquanto 3
// criações de pedido e 1 entrega caem DENTRO do minuto das 12:00 UTC e escapam por causa
// dos milissegundos. Foi essa medição que autorizou incluir a marca (c).
// ─────────────────────────────────────────────────────────────────────────────
const HORA_MS = 3600 * 1000;
const DIA_MS = 24 * HORA_MS;
// Brasil não tem mais horário de verão: Brasília é UTC-3 fixo. O dia local começa às
// 03:00 UTC e termina às 02:59:59.999 UTC do dia seguinte.
const OFFSET_BRASILIA_MS = 3 * HORA_MS;
// Assinaturas horárias das três convenções acima (ms desde a meia-noite UTC).
const MARCAS_SO_DATA = [0, 12 * HORA_MS, 15 * HORA_MS];

const msDoDiaUtc = (d) => d.getTime() - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** O valor foi gravado por uma das convenções de "só data"? */
export const ehValorSoData = (v) => {
    if (!v) return false;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return false;
    return MARCAS_SO_DATA.includes(msDoDiaUtc(d));
};

/** Dia (dd/mm/aaaa) de um valor "só data" — lido em UTC, que é o dia certo nas duas convenções. */
export const fmtDiaSemHora = (v) => v
    ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
    : '—';

/**
 * Data de um campo do banco, sem chutar o dia: se o valor foi gravado por uma das
 * convenções de "só data", lê o dia em UTC; se é um instante de verdade, lê em Brasília.
 * Use SEMPRE este em vez de `fmtData` para campo que pode ser data pura
 * (vencimento, pagamento, saída da carga) — `fmtData` mostra 14/08 para o dia 15/08.
 */
export const fmtDataCampo = (v) => (ehValorSoData(v) ? fmtDiaSemHora(v) : fmtData(v));

/**
 * Igual ao `fmtDataCampo`, mas MOSTRA A HORA quando ela existe.
 * É o texto que a linha do tempo já escrevia (`textoDataDoEvento`); exportado aqui para
 * que o CARTÃO escreva exatamente a mesma coisa. Campo de data gravado FORA das convenções
 * aparecia com dia diferente nos dois lugares — o cartão lia em Brasília, a linha do tempo
 * em UTC.
 */
export const fmtDataOuHoraCampo = (v) => (ehValorSoData(v) ? fmtDiaSemHora(v) : fmtDataHora(v));

/**
 * Maior / menor instante COM HORA DE VERDADE entre os valores dados (`null` se nenhum).
 * Valor gravado por uma das convenções de "só data" é DESCARTADO: ele diz o dia, não a
 * hora, e usá-lo como limite reintroduziria a hora inventada que este arquivo existe
 * para evitar.
 */
const instantesComHora = (...vs) => vs
    .filter(v => v && !ehValorSoData(v))
    .map(v => new Date(v).getTime())
    .filter(t => !Number.isNaN(t));
export const maiorInstanteComHora = (...vs) => { const t = instantesComHora(...vs); return t.length ? Math.max(...t) : null; };
export const menorInstanteComHora = (...vs) => { const t = instantesComHora(...vs); return t.length ? Math.min(...t) : null; };
// As duas são usadas AOS PARES nos limites de um evento só-data (`naoAntesDe`/`naoDepoisDe`).
// Passar um dos lados cru — como `naoDepoisDe: p.dataEntrega` fazia — deixa a regra valendo
// só de um lado: bastaria uma `dataEntrega` gravada por convenção de data pura para o limite
// superior virar uma hora fabricada. Hoje isso não ocorre (0 das 958 `data_entrega` da base
// caem em 00:00, 12:00 ou 15:00 UTC), mas a assimetria não deve ficar de pé em código novo.

// ─────────────────────────────────────────────────────────────────────────────
// O QUE FOI RECEBIDO NA ENTREGA — regra COPIADA do backend, não inventada aqui
//
// `PedidoPagamentoReal` NÃO é sinônimo de dinheiro que entrou. A própria rota que grava
// essas linhas diz: "as linhas de pagamento (Dinheiro, Pix, Dívida Escritório, etc)"
// (backend/routes/entregas.js:555) e "A entrega só REGISTRA o que o motorista recebeu;
// o título continua EM ABERTO" (:669).
//
// ⚠️ O QUE FOI COPIADO — E, DE PROPÓSITO, O QUE NÃO FOI
//
// Existe no backend uma função que PARECE servir para isto e não serve:
// `entregaPendenteDeBaixaNoCaixa` (backend/routes/caixa.js:49-62). Ela responde
// "esta ENTREGA ainda pende de baixa no caixa?" — pergunta diferente de "esta LINHA de
// pagamento foi dinheiro na mão do motorista?". Por isso ela tem dois guardas que aqui
// estariam errados e NÃO foram copiados: `statusEntrega === 'DEVOLVIDO'` (caixa.js:50) e
// `baixaCaRealizada` (caixa.js:55). Os dois dizem apenas que não há mais nada a prestar —
// não dizem que o motorista deixou de receber. Usar a resposta dela para escrever
// "o motorista recebeu / já prestou" foi o defeito da rodada 2.
//
// O que ESTÁ copiado são as três regras que decidem a NATUREZA de uma linha, na MESMA
// ORDEM em que o caixa as aplica (caixa.js:496-498, :1284-1287, :2503-2506):
//
//  1. PIX ASAAS CONFIRMADO PELO BANCO — vem PRIMEIRO, antes de qualquer outro teste.
//     "PIX Asaas confirmado pelo banco não passa pela mão do motorista" (caixa.js:1284,
//     comentário repetido em :485-486 e :2503). O cliente lê o QR na frente do motorista,
//     o banco confirma e o dinheiro cai direto na conta da empresa; o caixa manda esse
//     valor para "Outros" e o motorista não presta nada por ele.
//     Não dá para decidir isso pelo nome da forma ("PIX Asaas" contém "pix", e o teste de
//     substring diria que é dinheiro na mão) nem pelo responsável (o checkout ZERA o
//     responsável dessa linha de propósito — backend/routes/entregas.js:604-607). O único
//     teste válido é o do backend: nome exato + cobrança Asaas amarrada à linha.
//
//  2. backend/services/recebimentoEntregaService.js:270-300
//     `papelResponsavel()` / `ehRecebimentoProprio()` — "Recebimento de verdade = o que
//     NÃO é responsável pela cobrança". O arquivo avisa em letras garrafais:
//     "⚠️ NUNCA leia `responsavelPapel` cru numa tela/relatório" — as 44 marcações
//     anteriores a 08/2026 têm o campo VAZIO e só aparecem pelo fallback (pessoa
//     preenchida → VENDEDOR; senão `escritorioResponsavel` → ESCRITORIO). Por isso o teste
//     usado aqui é o `ehLinhaResponsavel` do ponto único, que já faz esse fallback.
//
//  3. backend/routes/caixa.js:36-42
//     `formaExigeBaixaNoCaixa()` — separa a forma que traz valor na hora (dinheiro, pix,
//     cartão) da que não traz (boleto/prazo). É SÓ isso que ela é usada para dizer aqui.
//
// Se a regra mudar lá, muda aqui junto.
//
// ⛔ O QUE ESTA POPUP NÃO AFIRMA MAIS (decisão de 08/2026, rodada 4)
//
// Até a rodada 3 o balde `recebido` era anunciado como "o motorista recebeu em mãos" e
// "presta contas no Caixa". Isso é a regra do CAIXA, e quem a decide NÃO é o nome da
// forma: é a flag `debitaCaixa` da condição em `TabelaPreco`, lida por nome em
// `caixa.js:441-443` (`mapaCondicoesPorNome`) e aplicada em `:500-502`, `:1287`, `:2506`.
// Essa flag NÃO vem em `GET /api/pedidos/:id` (`pedidoService.detalhar`) — a popup não
// tem como responder o que estava afirmando, e divergia nos casos mais comuns da base:
//   forma                 | popup dizia | debitaCaixa real | linhas | valor
//   À vista - Dinheiro    | recebido    | true             |   316  | R$ 94.012,95
//   À vista - Pix         | recebido    | FALSE            |   146  | R$ 41.125,92
//   Cartão - Crédito      | recebido    | FALSE            |     2  | R$    691,62
//   Dinheiro              | recebido    | fora da tabela   |     2  | R$  1.141,99
// → 151 linhas / R$ 43.009,53 afirmando dinheiro na mão que o caixa nunca contou.
//
// Regra desta popup, daqui em diante: ela descreve O QUE FOI REGISTRADO NA ENTREGA e COM
// QUAL FORMA. Não diz quem ficou com o dinheiro, nem o que entra na conferência do Caixa.
// Quem responde isso é o Caixa (que tem a `debitaCaixa`), não esta tela.
// ─────────────────────────────────────────────────────────────────────────────

/** Cópia de `caixa.js:36-42` FORMAS_QUE_EXIGEM_BAIXA_CAIXA / formaExigeBaixaNoCaixa. */
const FORMAS_QUE_EXIGEM_BAIXA_CAIXA = ['dinheiro', 'pix', 'cartão', 'cartao'];
export const formaExigeBaixaNoCaixa = (p) => {
    const n = String(p?.formaPagamentoNome || p?.formaNome || '').toLowerCase();
    return FORMAS_QUE_EXIGEM_BAIXA_CAIXA.some(f => n.includes(f));
};

/**
 * PIX Asaas já confirmado pelo banco — dinheiro que entrou NA CONTA, não na mão do
 * motorista. Teste idêntico ao das três cópias do caixa (caixa.js:496, :1285, :2504):
 * nome EXATO da forma + cobrança Asaas amarrada à linha. Nome sem cobrança não vale
 * (não há confirmação do banco por trás).
 */
export const ehPixAsaasConfirmado = (p) => p?.formaPagamentoNome === 'PIX Asaas' && !!p?.cobrancaAsaasId;

/**
 * Classifica UMA linha de pagamento da entrega em quatro baldes que NÃO se confundem
 * (mesma ordem de testes do caixa):
 *  - 'asaas'     → PIX Asaas confirmado pelo banco: caiu direto na conta da empresa;
 *  - 'a_cobrar'  → alguém ficou responsável pela cobrança: NINGUÉM pagou;
 *  - 'recebido'  → registrado como pago na hora, em dinheiro/pix/cartão, sem responsável;
 *  - 'combinado' → forma sem dinheiro na hora (boleto, prazo, bonificação).
 */
export const classificarPagamentoEntrega = (pg) => {
    if (ehPixAsaasConfirmado(pg)) return 'asaas';
    if (ehLinhaResponsavel(pg)) return 'a_cobrar';
    return formaExigeBaixaNoCaixa(pg) ? 'recebido' : 'combinado';
};

// Nomes de forma de pagamento que são, na verdade, o RÓTULO DO RESPONSÁVEL escrito no
// campo errado — sobra do checkout antigo. Existe 1 linha assim na base local (pedido
// #890, "Escritório responsável" com papel, pessoa e marcação de escritório todos vazios).
// Não dá para afirmar quem ficou de cobrar (o dado não existe), então o balde continua o
// mesmo do backend — que também manda esse valor para "Outros" —, mas o texto para de
// chamar isso de "forma combinada".
const ROTULOS_RESPONSAVEL_COMO_FORMA = ['escritório responsável', 'escritorio responsavel', 'vendedor responsável', 'vendedor responsavel', 'motorista responsável', 'motorista responsavel'];
export const formaEhRotuloDeResponsavel = (p) =>
    ROTULOS_RESPONSAVEL_COMO_FORMA.includes(String(p?.formaPagamentoNome || '').trim().toLowerCase());

/** Totais da entrega por balde — usado no cartão "Recebimento" e na linha do tempo. */
export function resumoPagamentosEntrega(pedido) {
    const r = { recebido: 0, asaasConfirmado: 0, aCobrar: 0, combinado: 0, combinadoSemForma: 0, temFormaDeVerdade: false, responsaveis: [], formasCombinadas: [], temLinhas: false };
    const linhas = pedido?.pagamentosReais || [];
    r.temLinhas = linhas.length > 0;
    const resp = new Map();
    const comb = new Map();
    for (const pg of linhas) {
        const v = Number(pg.valor || 0);
        const balde = classificarPagamentoEntrega(pg);
        // Linha ÓRFÃ = o rótulo do responsável foi gravado no campo da FORMA (sobra do
        // checkout antigo). Independe do balde: existe tanto em `a_cobrar` (48 linhas — 44
        // com `responsavelPapel` VAZIO, que só caem nesse balde pelo fallback do rótulo, e 4
        // com o papel preenchido: #892 ×2, #917 e #915) quanto em `combinado` (1 linha, o
        // pedido #890, sem marcação nenhuma). Nos dois casos NÃO há forma de pagamento
        // registrada. (A rodada 5 escrevia "44 linhas com a marcação de responsável
        // presente" — o total é 48, e o 44 é justamente o subconjunto SEM a marcação.)
        const orfa = formaEhRotuloDeResponsavel(pg);
        if (!orfa) r.temFormaDeVerdade = true;
        if (balde === 'a_cobrar') {
            r.aCobrar += v;
            const rot = rotuloResponsavel(pg) || 'Responsável';
            resp.set(rot, (resp.get(rot) || 0) + v);
        } else if (balde === 'recebido') {
            r.recebido += v;
        } else if (balde === 'asaas') {
            // Entrou na conta da empresa, confirmado pelo banco. NÃO soma em `recebido`:
            // são duas coisas diferentes e o cartão mostra as duas em linhas separadas.
            r.asaasConfirmado += v;
        } else {
            r.combinado += v;
            if (orfa) r.combinadoSemForma += v;
            const nome = orfa
                ? `só o texto “${pg.formaPagamentoNome}”`
                : (pg.formaPagamentoNome || 'forma não informada');
            comb.set(nome, (comb.get(nome) || 0) + v);
        }
    }
    r.responsaveis = [...resp.entries()].map(([rotulo, valor]) => ({ rotulo, valor }));
    r.formasCombinadas = [...comb.entries()].map(([nome, valor]) => ({ nome, valor }));
    // Rótulo da LINHA DE TOTAL do balde `combinado` no cartão. Quando TODO o valor do balde
    // veio de linha órfã, o cartão não pode dizer "sem dinheiro na hora" (sem forma nenhuma,
    // o app não sabe se houve dinheiro no ato) — usa o 5º rótulo. Misturado, continua o
    // rótulo normal e o parêntese lista as formas, órfã inclusive. Na base local não há
    // mistura: existe 1 linha órfã (pedido #890) e ela é a única linha daquele pedido.
    r.rotuloCombinado = (r.combinado > 0 && r.combinadoSemForma === r.combinado)
        ? ROTULO_ENTREGA_CARTAO.sem_forma
        : ROTULO_ENTREGA_CARTAO.combinado;
    return r;
}

// ─────────────────────────────────────────────────────────────────────────────
// RÓTULOS DOS QUATRO BALDES (+ o 5º texto) — PONTO ÚNICO
//
// Na rodada 3 o MESMO balde tinha dois nomes na MESMA popup: o cartão dizia "Registrado
// sem dinheiro na hora" e a linha do tempo dizia "Registrado na entrega sem dinheiro".
// Agora o texto sai daqui, dos dois lados. As duas listas existem porque o cartão é uma
// LINHA DE TOTAL (cabe o parêntese explicativo) e a linha do tempo é um TÍTULO DE EVENTO
// (precisa situar "na entrega"); o miolo da frase é literalmente o mesmo.
// ─────────────────────────────────────────────────────────────────────────────
// O 5º rótulo (`sem_forma`) não é um 5º BALDE: para somar, a linha órfã continua em
// `combinado` (é para onde o backend também a manda). Ele existe porque o título estava
// contradizendo o próprio subtítulo na mesma linha: "Registrado sem dinheiro na hora"
// afirma sobre o dinheiro, e logo abaixo o sub dizia "o app não tem como afirmar quem
// ficou de cobrar". Sem forma nenhuma gravada, o app não sabe se houve dinheiro no ato —
// então o rótulo para de falar de dinheiro e passa a dizer o que de fato aconteceu com o
// registro. Vale para 1 linha na base (pedido #890).
export const ROTULO_ENTREGA_CARTAO = {
    recebido: 'Registrado como pago na hora (dinheiro/PIX/cartão)',
    asaas: 'Pago por PIX Asaas — caiu direto na conta da empresa',
    a_cobrar: 'Ficou a cobrar — ninguém pagou',
    combinado: 'Registrado sem dinheiro na hora',
    sem_forma: 'Linha sem forma registrada — o app não sabe se houve dinheiro',
};
export const ROTULO_ENTREGA_EVENTO = {
    recebido: 'Registrado como pago na hora',
    asaas: 'PIX Asaas confirmado pelo banco',
    a_cobrar: 'Ficou a cobrar na entrega',
    combinado: 'Registrado sem dinheiro na hora',
    sem_forma: 'Linha sem forma registrada',
};

/**
 * Rodapé do quadro "Na entrega, o motorista registrou".
 *
 * Duas coisas que a rodada 3 escrevia e o dado NÃO sustenta, corrigidas aqui:
 *  1. "a de cima ficou na mão do motorista (é o que ele presta contas no Caixa)" —
 *     prestação é regra do Caixa (`debitaCaixa`), que não vem neste payload;
 *  2. "as outras continuam em aberto no título" — saía em pedido SEM conta a receber
 *     (48 na base: 47 bonificações + o #223), cobrando uma dívida que não existe; e saía
 *     também quando não havia "outras" linhas na tela além da primeira.
 *
 * O texto agora é montado a partir do que ESTÁ na tela e do que o payload prova.
 */
export function textoRodapeEntrega(p, resumo) {
    // A abertura só promete "a forma que o motorista informou" quando ALGUMA linha traz uma
    // forma de verdade. No pedido cuja única linha é órfã (rótulo de responsável escrito no
    // campo da forma — #890 na base) não há forma nenhuma, e a frase mentia.
    const partes = [resumo?.temFormaDeVerdade === false
        ? 'Estas linhas são o que ficou registrado no fechamento da entrega. Nenhuma delas veio com forma de pagamento.'
        : 'Estas linhas são o que ficou registrado no fechamento da entrega, com a forma que o motorista informou.'];
    if (resumo?.asaasConfirmado > 0) {
        partes.push('O PIX Asaas é uma cobrança do app confirmada pelo banco: esse valor caiu direto na conta da empresa.');
    }
    if (p?.contaReceber) {
        partes.push('Registrar na entrega não é dar baixa: o que já foi abatido do título está em “Recebido até agora”, acima — por isso ele pode ser R$ 0,00 mesmo com valores registrados aqui.');
    } else if (p?.bonificacao) {
        partes.push('Bonificação não gera conta a receber: não existe título para abater nem para cobrar depois.');
    } else {
        partes.push('Este pedido ainda não tem conta a receber, então ainda não existe título para abater.');
    }
    return partes.join(' ');
}

// Rótulo humano do status da NF-e do app (Focus NFe) — usado no cartão "Nota fiscal".
export const ROTULO_NFE = {
    AUTORIZADO: 'autorizada',
    PROCESSANDO: 'em processamento na SEFAZ',
    ERRO: 'recusada pela SEFAZ',
    DENEGADO: 'denegada pela SEFAZ',
    CANCELADO: 'cancelada',
};

// Rótulo da NF-e NA LINHA DO TEMPO. É diferente do de cima de propósito: o evento carrega
// uma DATA (`atualizadoEm`), e essa data nem sempre é a da autorização —
// `focusNfeEmissaoService.js:431` faz backfill da `chave` em notas antigas, o que empurra
// o `atualizadoEm` sem que a situação tenha mudado. Uma nota autorizada em julho pode
// exibir a data do backfill. Por isso "consta como", e não "foi".
export const ROTULO_NFE_EVENTO = {
    AUTORIZADO: 'consta como autorizada',
    PROCESSANDO: 'consta em processamento na SEFAZ',
    ERRO: 'consta como recusada pela SEFAZ',
    DENEGADO: 'consta como denegada pela SEFAZ',
    CANCELADO: 'consta como cancelada',
};

// Duas datas "iguais o bastante" — o `atualizadoEm` de um registro que nunca mudou de
// situação vem colado no `criadoEm`; nesse caso não vale como evento separado.
const mesmoMomento = (a, b) => {
    if (!a || !b) return false;
    return Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 2000;
};

/**
 * Chave de ordenação do evento.
 *
 * Evento com hora de verdade → o próprio instante.
 *
 * Evento SÓ COM DATA → não existe hora. Jogá-lo num horário qualquer produz sequência
 * impossível — e ancorá-lo numa ponta FIXA do dia apenas muda a impossibilidade de lugar:
 * ancorar a saída da carga no começo do dia colocou "Saiu na carga" ACIMA de
 * "Pedido criado" em 64 dos 1.141 pedidos (defeito da rodada 2, pedido #831).
 *
 * O certo é ancorar na ponta que o papel do evento pede E DEPOIS prender a chave dentro
 * do intervalo que o app realmente conhece:
 *   • `ancora: 'inicio'` → é PRÉ-REQUISITO do dia (a carga sai ANTES de entregar);
 *   • `ancora: 'fim'`    → é CONSEQUÊNCIA do dia (a baixa vem DEPOIS do que aconteceu);
 *   • `naoAntesDe` / `naoDepoisDe` → instantes COM hora que cercam o evento (a carga não
 *     sai antes de o pedido existir nem depois de a entrega ter sido registrada).
 *
 * Limite que cai FORA do dia do evento é ignorado (o `Math.min(Math.max(...))` final).
 * Nesse caso a sequência impossível está no DADO — data de saída digitada errada —, e a
 * tela não deve escondê-la mudando o evento de dia.
 */
export const ordemDoEvento = (e) => {
    const d = new Date(e.t);
    if (!e.soData) return d.getTime();
    const inicioDia = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + OFFSET_BRASILIA_MS;
    const fimDia = inicioDia + DIA_MS - 1;
    let k = e.ancora === 'inicio' ? inicioDia : fimDia;
    const min = e.naoAntesDe ? new Date(e.naoAntesDe).getTime() : NaN;
    const max = e.naoDepoisDe ? new Date(e.naoDepoisDe).getTime() : NaN;
    // ORDEM DE PRECEDÊNCIA quando os limites se contradizem (`naoAntesDe` DEPOIS de
    // `naoDepoisDe`). Isso OCORRE na base: 15 dos 1.027 eventos de saída só-data — 6 pedidos
    // reais (#21, #105, ZZ#74, ZZ#108, #612, ZZ#201) e 9 pedidos de fixture. A regra é:
    //   1º  O DIA DO EVENTO manda em tudo — é o `Math.min(Math.max(..., inicioDia), fimDia)`
    //       da última linha, aplicado por último. Nenhum limite tira o evento do dia gravado.
    //   2º  Dentro do dia, o TETO (`naoDepoisDe`, a entrega) vence o PISO, porque o
    //       `Math.min` do teto é aplicado depois do `Math.max` do piso.
    // É a escolha certa: o caminhão não pode entregar antes de sair, então a saída ficar
    // colada ANTES da entrega é sempre verdade; já o piso pode estar contaminado por um
    // registro fora de hora (ZZ#74 e ZZ#201 foram IMPRESSOS depois de entregues — impressão
    // 21:12 e 17:28, entrega 10:58 e 14:28 do mesmo dia). Com o teto vencendo, a saída fica
    // antes da entrega e a anomalia da impressão continua visível na tela, que é o que se
    // quer. A ORDEM DESTAS TRÊS LINHAS é o que decide — não trocar.
    if (!Number.isNaN(min)) k = Math.max(k, min + 1);
    if (!Number.isNaN(max)) k = Math.min(k, max - 1);
    return Math.min(Math.max(k, inicioDia), fimDia);
};

/** Texto de data que a linha do tempo escreve para um evento. */
export const textoDataDoEvento = (e) => e.soData ? fmtDiaSemHora(e.t) : fmtDataHora(e.t);

/**
 * Monta a linha do tempo do pedido a partir do que o backend REALMENTE devolve.
 * Cada evento: { t, soData, ancora, titulo, sub, cor }.
 */
export function montarLinhaDoTempo(p, atendimentosDoPedido) {
    if (!p) return [];
    const ev = [];
    const conv = p.avisosConversao?.[0];

    // 1. Nascimento do pedido
    const partesCriacao = [];
    if (p.usuarioLancamento?.nome) partesCriacao.push(`registrado por ${p.usuarioLancamento.nome}`);
    if (p.vendedor?.nome) partesCriacao.push(`vendedor ${p.vendedor.nome}`);
    if (p.canalOrigem) partesCriacao.push(`origem ${p.canalOrigem}`);
    ev.push({
        t: p.createdAt,
        cor: conv ? 'ouro' : 'verde',
        titulo: conv
            ? `Criado como pedido especial ZZ#${conv.numeroAntigo ?? '?'}`
            : p.bonificacao ? 'Bonificação criada'
                : p.especial ? 'Pedido especial criado'
                    : 'Pedido criado',
        sub: partesCriacao.join(' · ') || null,
    });

    // 2. Conta a receber criada (existe createdAt próprio)
    if (p.contaReceber?.createdAt) {
        const qtd = p.contaReceber.parcelas?.length || 0;
        ev.push({
            t: p.contaReceber.createdAt,
            titulo: `Conta a receber criada · ${fmtMoeda(p.contaReceber.valorTotal)}`,
            sub: qtd ? `${qtd} parcela${qtd > 1 ? 's' : ''}` : null,
        });
    }

    // 3. APROVAÇÃO de especial / bonificação — NÃO é "faturamento".
    //    `enviadoEm` só é gravado em três lugares, e nenhum deles é o faturamento do
    //    pedido normal: `pedidoController.aprovarEspecial` (:680), `aprovarBonificacao`
    //    (:890) e o conserto manual do `adminExec` (:419). O pedido NORMAL vira faturado
    //    em `focusNfeEmissaoService.marcarPedidoFaturado` (:297-308), que grava só
    //    `situacaoCA` e `nfeConsultadoEm` — nunca `enviadoEm`.
    //    Além disso, especial e bonificação NUNCA vão ao Conta Azul (o schema do Pedido
    //    diz "Pedido especial (sem nota) - não envia ao CA"), então o `sub` antigo
    //    "situação no Conta Azul: FATURADO" afirmava um fato que não aconteceu.
    if (p.enviadoEm) {
        ev.push({
            t: p.enviadoEm,
            cor: 'ouro',
            titulo: p.bonificacao ? 'Bonificação aprovada'
                : p.especial ? 'Pedido especial aprovado'
                    : 'Pedido liberado no app',
            sub: p.bonificacao || p.especial
                ? 'aprovado dentro do app — bonificação e especial não vão ao Conta Azul'
                : 'liberação registrada no app',
        });
    }

    // 4. Conversão de especial em pedido com nota
    if (conv?.createdAt) {
        ev.push({
            t: conv.createdAt,
            cor: 'ouro',
            titulo: `Convertido no pedido #${conv.numeroNovo ?? p.numero ?? '?'}`,
            sub: conv.valorPago != null ? `já recebido na conversão: ${fmtMoeda(conv.valorPago)}` : 'nasceu especial e ganhou NF',
        });
    }

    // 5. NF-e emitidas pelo próprio app (Focus NFe).
    //    `criadoEm` = quando o app mandou para a SEFAZ. `atualizadoEm` = a última vez que
    //    ESTE REGISTRO mudou aqui — nem sempre a hora da autorização (ver ROTULO_NFE_EVENTO).
    (p.notasFiscaisApp || []).forEach(n => {
        const rotuloTipo = n.tipo === 'DEVOLUCAO' ? 'NF-e de devolução' : 'NF-e';
        ev.push({ t: n.criadoEm, titulo: `${rotuloTipo} enviada para a SEFAZ`, sub: n.serie != null ? `série ${n.serie}` : null });
        if (n.atualizadoEm && !mesmoMomento(n.atualizadoEm, n.criadoEm)) {
            const numero = n.numero != null ? ` nº ${n.numero}` : '';
            ev.push({
                t: n.atualizadoEm,
                cor: n.status === 'AUTORIZADO' ? 'ouro' : ['ERRO', 'DENEGADO'].includes(n.status) ? 'vermelho' : undefined,
                titulo: `${rotuloTipo}${numero} — ${ROTULO_NFE_EVENTO[n.status] || String(n.status || '').toLowerCase()}`,
                sub: 'data da última mudança nesse registro no app',
            });
        }
    });

    // 6. Cobranças Asaas (PIX/boleto emitidos pelo app).
    //    `pagosAsaas` guarda quais cobranças JÁ ganharam a linha "pago" aqui — é com ele
    //    que o evento da entrega (item 9) sabe dizer "é o mesmo pagamento de cima" em vez
    //    de o mesmo valor aparecer três vezes sem ninguém avisar.
    const pagosAsaas = new Set();
    (p.cobrancasAsaas || []).forEach(c => {
        const tipo = c.tipo === 'BOLETO' ? 'Boleto' : 'PIX';
        ev.push({
            t: c.createdAt,
            titulo: `${tipo} Asaas gerado · ${fmtMoeda(c.valor)}`,
            sub: c.status && c.status !== 'RECEBIDO' ? `situação hoje: ${String(c.status).toLowerCase()}` : null,
        });
        if (c.status === 'RECEBIDO' && c.recebidoEm) {
            pagosAsaas.add(c.id);
            ev.push({ t: c.recebidoEm, cor: 'ouro', titulo: `${tipo} Asaas pago · ${fmtMoeda(c.valorRecebido ?? c.valor)}`, sub: null });
        }
    });

    // 7. Baixa das parcelas.
    //    A parcela guarda o ACUMULADO (`valorPago`) e a data da ÚLTIMA baixa
    //    (`dataPagamento`) — duas baixas parciais viram UM evento só. Por isso o rótulo é
    //    "quitada"/"baixa parcial" e o valor é anunciado como total, nunca como um
    //    pagamento único. O extrato baixa a baixa mora em Contas a Receber.
    //    `dataPagamento` é campo de DATA (contasReceber.js:1174/1348) → sem hora, ancorada
    //    no fim do dia (a baixa é consequência do que aconteceu naquele dia).
    ((p.contaReceber?.parcelas) || []).forEach(par => {
        if (par.dataPagamento && Number(par.valorPago) > 0) {
            const soData = ehValorSoData(par.dataPagamento);
            ev.push({
                t: par.dataPagamento,
                soData,
                ancora: 'fim',
                naoAntesDe: p.createdAt,   // baixa não acontece antes de o pedido existir
                titulo: `Parcela ${par.numeroParcela} ${par.status === 'PAGO' ? 'quitada' : 'com baixa parcial'} · ${fmtMoeda(par.valorPago)} no total`,
                sub: [par.formaPagamento || null, 'total baixado na parcela (o app guarda só a data da última baixa)'].filter(Boolean).join(' · '),
            });
        }
    });

    // 8. Baixa no Conta Azul feita pela conferência do Caixa
    if (p.baixaCaEm) {
        ev.push({
            t: p.baixaCaEm,
            titulo: `Baixa registrada no Conta Azul${p.baixaCaValor != null ? ` · ${fmtMoeda(p.baixaCaValor)}` : ''}`,
            sub: 'conferência do Caixa',
        });
    }

    // 9. O QUE O MOTORISTA REGISTROU NA ENTREGA — quatro coisas diferentes, quatro rótulos.
    //    (regra copiada do backend; ver o bloco de comentário no topo deste arquivo)
    //
    //    Estes eventos descrevem O REGISTRO: o que foi lançado no fechamento da entrega e
    //    com qual forma. NÃO dizem quem ficou com o dinheiro nem o que entra na conferência
    //    do Caixa — quem decide isso é a `debitaCaixa` da condição, que não vem neste
    //    payload (ver o bloco "O QUE ESTA POPUP NÃO AFIRMA MAIS" no topo do arquivo).
    //    A prestação do Caixa continua aparecendo, mas só como FATO com data: o evento
    //    "Baixa registrada no Conta Azul" (item 8), que nasce do `baixaCaEm`.
    //
    //    Quando o pedido NÃO tem conta a receber (bonificação; ou pedido que ainda não
    //    faturou), nenhum texto daqui pode falar em título/dívida — foi o bloqueio do QA
    //    na BN#24 e no #223.
    const semContaReceber = !p.contaReceber;
    const notaSemTitulo = !semContaReceber ? ''
        : p.bonificacao ? ' · bonificação não gera conta a receber'
            : ' · este pedido ainda não tem conta a receber';
    (p.pagamentosReais || []).forEach(pg => {
        const balde = classificarPagamentoEntrega(pg);
        if (balde === 'a_cobrar') {
            ev.push({
                t: pg.createdAt,
                cor: 'vermelho',
                titulo: `${ROTULO_ENTREGA_EVENTO.a_cobrar} · ${fmtMoeda(pg.valor)}`,
                sub: `${rotuloResponsavel(pg)} — ninguém pagou na hora`,
            });
        } else if (balde === 'asaas') {
            // Cobrança do app confirmada pelo banco: o valor caiu na CONTA da empresa.
            // Fica em linha própria para não ser somado com o resto do que foi registrado.
            ev.push({
                t: pg.createdAt,
                titulo: `${ROTULO_ENTREGA_EVENTO.asaas} · ${fmtMoeda(pg.valor)}`,
                sub: pagosAsaas.has(pg.cobrancaAsaasId)
                    ? 'é o MESMO pagamento da linha “PIX Asaas pago” — o cliente leu o QR na entrega e o valor caiu direto na conta da empresa'
                    : 'o cliente leu o QR na entrega e o valor caiu direto na conta da empresa',
            });
        } else if (balde === 'recebido') {
            ev.push({
                t: pg.createdAt,
                titulo: `${ROTULO_ENTREGA_EVENTO.recebido} · ${fmtMoeda(pg.valor)}`,
                sub: `${pg.formaPagamentoNome || 'forma não informada'} — forma que o motorista informou ao fechar a entrega`,
            });
        } else if (formaEhRotuloDeResponsavel(pg)) {
            // Nome do responsável gravado no campo da forma, sem nenhuma marcação de
            // responsável. Não dá para dizer quem ficou de cobrar — nem se houve dinheiro
            // na hora: sem forma registrada, o app não tem como saber. Por isso o TÍTULO
            // também para de afirmar sobre dinheiro (5º rótulo), senão ele contradiz o
            // próprio sub na mesma linha (era o caso do pedido #890).
            ev.push({
                t: pg.createdAt,
                titulo: `${ROTULO_ENTREGA_EVENTO.sem_forma} · ${fmtMoeda(pg.valor)}`,
                sub: `a linha veio só com o texto “${pg.formaPagamentoNome}”, sem forma de pagamento e sem a marcação de responsável — o app não tem como afirmar quem ficou de cobrar`,
            });
        } else {
            ev.push({
                t: pg.createdAt,
                titulo: `${ROTULO_ENTREGA_EVENTO.combinado} · ${fmtMoeda(pg.valor)}`,
                sub: `${pg.formaPagamentoNome || 'forma não informada'} — forma que não traz dinheiro na hora${notaSemTitulo}`,
            });
        }
    });

    // 10. Impressão
    if (p.impressoEm) ev.push({ t: p.impressoEm, titulo: 'Pedido impresso', sub: null });

    // 11. Conferência de carga por bipagem (doca)
    if (p.cargaConferidaEm) {
        const comoBipou = p.cargaConferidaOrigem === 'DIGITADO' ? 'digitado' : p.cargaConferidaOrigem === 'LEITOR' ? 'bipado no leitor' : null;
        ev.push({
            t: p.cargaConferidaEm,
            titulo: 'Conferido na carga',
            sub: [p.cargaConferidaPorNome ? `por ${p.cargaConferidaPorNome}` : null, comoBipou].filter(Boolean).join(' · ') || null,
        });
    }

    // 12. Saída da carga / embarque.
    //     `embarque.dataSaida` é SEMPRE só data em produção: as duas únicas rotas que
    //     gravam esse campo usam `T12:00:00-03:00` (embarques.js:278 e :379).
    //     Contagem na base local (81 embarques com saída): 66 em 15:00 UTC, 7 em meia-noite
    //     UTC e 8 fora das convenções — mas esses 8 NÃO são hora de produção, e a rodada 4
    //     errou ao citá-los como se fossem:
    //       • 6 são o embarque de número 9701 REPETIDO (número duplicado 7 vezes, fora da
    //         faixa do autoincrement 8–2360, criados numa rajada de 41s, ZERO pedidos em
    //         cada um) com `data_saida` exatamente 12:00:00.000 UTC — que é a convenção (c)
    //         de data pura descrita no topo, e agora está em `MARCAS_SO_DATA`;
    //       • 2 são os embarques 2387/2388, criados por `backend/scripts/teste-conferencia-
    //         carga.js:92-93` com `dataSaida: new Date()` — fixture, não operação.
    //     Ou seja: hoje NÃO existe saída de carga com hora de verdade na base.
    //     Mesmo assim o `soData` continua vindo do TESTE, e não chumbado em `true`, por dois
    //     motivos: (1) `ehValorSoData` é o ponto único que conhece as convenções e é o mesmo
    //     que o CARTÃO usa (`fmtDataOuHoraCampo`) — chumbar aqui e não lá ressuscitaria a
    //     divergência de dia entre os dois lugares que este arquivo já corrigiu; (2) se um
    //     dia uma rota passar a gravar a hora real da saída, chumbar apagaria essa hora.
    if (p.embarque?.dataSaida) {
        const saidaSoData = ehValorSoData(p.embarque.dataSaida);
        ev.push({
            t: p.embarque.dataSaida,
            soData: saidaSoData,
            ancora: 'inicio',
            // Limites COM HORA que o app conhece. Antes só entrava o `createdAt`, e a saída
            // caía acima de coisas que o caminhão não pode ter ultrapassado: a conta a
            // receber (58 pedidos), a impressão do pedido (46) e a conferência da carga na
            // doca (11). O caminhão não sai antes de o pedido ser criado, virar conta a
            // receber, ser impresso e ser bipado na doca — nem depois de a entrega dele ser
            // registrada.
            naoAntesDe: maiorInstanteComHora(p.createdAt, p.contaReceber?.createdAt, p.impressoEm, p.cargaConferidaEm),
            // Também pelo filtro: limite só vale se tiver HORA DE VERDADE (ver o par
            // `maiorInstanteComHora`/`menorInstanteComHora`). Hoje não muda nada — 0 das 958
            // `dataEntrega` da base caem em convenção de data pura —, mas a regra passa a
            // valer dos dois lados.
            naoDepoisDe: menorInstanteComHora(p.dataEntrega),
            titulo: `Saiu na carga Emb. #${p.embarque.numero}`,
            sub: [
                p.embarque.responsavel?.nome ? `motorista ${p.embarque.responsavel.nome}` : null,
                saidaSoData ? 'o app guarda só o dia da saída' : null,
            ].filter(Boolean).join(' · ') || null,
        });
    }

    // 13. Entrega
    if (p.dataEntrega) {
        ev.push({
            t: p.dataEntrega,
            cor: p.statusEntrega === 'DEVOLVIDO' ? 'vermelho' : undefined,
            titulo: p.statusEntrega === 'ENTREGUE_PARCIAL' ? 'Entregue parcialmente'
                : p.statusEntrega === 'DEVOLVIDO' ? 'Entrega devolvida'
                    : 'Entregue',
            sub: p.gpsEntrega ? 'GPS registrado' : null,
        });
    }

    // 14. Devoluções (e reversão de devolução, quando houve)
    //     ⚠️ `Devolucao.dataDevolucao` é `DateTime @default(now())` (schema.prisma:2641):
    //     INSTANTE DE VERDADE, sempre. Não é campo de data pura — as 54 devoluções da base
    //     têm hora real (nenhuma em 00:00, 12:00 ou 15:00 UTC), então o `ehValorSoData`
    //     abaixo NUNCA dispara hoje. Ele fica como guarda (se algum backfill futuro gravar
    //     só o dia, a tela não inventa hora), mas NÃO deve ser citado em manual, novidade
    //     nem rodapé como "campo que guarda só o dia" — era o que os três diziam.
    (p.devolucoes || []).forEach(d => {
        ev.push({
            t: d.dataDevolucao,
            soData: ehValorSoData(d.dataDevolucao),
            ancora: 'fim',
            naoAntesDe: p.createdAt,   // não se devolve o que ainda não foi pedido
            cor: 'vermelho',
            titulo: `Devolução DEV#${d.numero} · ${fmtMoeda(d.valorTotal)}`,
            sub: [d.registradoPor?.nome ? `por ${d.registradoPor.nome}` : null, d.motivo || null].filter(Boolean).join(' · ') || null,
        });
        if (d.revertidoEm) {
            ev.push({
                t: d.revertidoEm,
                titulo: `Devolução DEV#${d.numero} revertida`,
                sub: d.motivoReversao || null,
            });
        }
    });

    // 15. Cancelamento do pedido
    if (p.cancelado && p.canceladoEm) {
        ev.push({
            t: p.canceladoEm,
            cor: 'vermelho',
            titulo: 'Pedido cancelado',
            sub: [p.canceladoPorNome ? `por ${p.canceladoPorNome}` : null, p.motivoCancelamento || null].filter(Boolean).join(' · ') || null,
        });
    }

    // 16. Atendimentos que o vendedor/escritório amarrou a este pedido
    (atendimentosDoPedido || []).forEach(a => {
        ev.push({
            t: a.criadoEm,
            cor: 'azul',
            titulo: `Atendimento · ${a.acaoLabel || a.tipo || 'registro'}`,
            sub: [a.vendedor?.nome || null, a.observacao || null].filter(Boolean).join(' · ') || null,
        });
    });

    return ev
        .filter(e => e.t && !Number.isNaN(new Date(e.t).getTime()))
        .sort((a, b) => ordemDoEvento(a) - ordemDoEvento(b));
}

/**
 * Avisos do rodapé da linha do tempo — o que o app NÃO consegue mostrar.
 * Cada aviso só aparece quando o dado daquele pedido pede por ele.
 */
export function avisosDaLinhaDoTempo(p) {
    if (!p) return [];
    const avisos = [];

    // FATURAMENTO SEM DATA: `situacaoCA = FATURADO` gravado por
    // `focusNfeEmissaoService.marcarPedidoFaturado` não guarda quando isso aconteceu.
    // No banco local isso vale para 814 dos 1.086 pedidos FATURADOS (75%).
    if (p.situacaoCA === 'FATURADO' && !p.enviadoEm) {
        avisos.push('Este pedido consta como FATURADO, mas o app não guarda a data em que isso aconteceu — por isso não existe evento de faturamento na linha do tempo.');
    }

    // Mesmo dinheiro, dois momentos: a entrega registra e, depois, a baixa do título
    // registra de novo. São dois eventos do MESMO valor — somar os dois dobra o
    // recebimento (foi o que aconteceu no pedido #693: R$ 359,12 em 04/05 e de novo em
    // 12/05). Vale para as TRÊS formas de a entrega registrar valor, não só para o
    // dinheiro em mãos: o boleto combinado na entrega vira baixa de parcela do mesmo jeito.
    const resumo = resumoPagamentosEntrega(p);
    const temBaixaDeParcela = ((p.contaReceber?.parcelas) || []).some(x => Number(x.valorPago) > 0);
    if ((resumo.recebido > 0 || resumo.combinado > 0 || resumo.asaasConfirmado > 0) && temBaixaDeParcela) {
        avisos.push('Atenção ao somar: o que a entrega registrou (pago na hora, PIX Asaas ou sem dinheiro na hora) e a baixa da parcela podem ser o MESMO dinheiro em dois momentos — a entrega registra, depois o título é baixado. O valor que de fato foi abatido do título é o de “Recebido até agora”, no quadro Recebimento.');
    }

    // O PIX Asaas lido na entrega aparece de propósito em TRÊS linhas: quando a cobrança
    // foi gerada, quando o banco confirmou e quando o motorista fechou a entrega com ela.
    // É um pagamento só. Sem este aviso, o mesmo valor lido três vezes parece três entradas.
    if (resumo.asaasConfirmado > 0) {
        avisos.push('O PIX Asaas aparece mais de uma vez na linha do tempo — “gerado”, “pago” e o registro do motorista ao fechar a entrega. É UM pagamento só, confirmado pelo banco e recebido direto na conta da empresa: não some as linhas.');
    }

    // ⚠️ O TEXTO ABAIXO TEM QUE DESCREVER O QUE `ordemDoEvento` FAZ DE VERDADE.
    // A versão da rodada 4 prometia, sem ressalva, que a saída da carga ficava "depois da
    // criação, da conta a receber, da impressão e da conferência da carga" e "antes da
    // entrega". `ordemDoEvento` NÃO garante isso: o dia do evento vem primeiro, e qualquer
    // limite que não caiba dentro dele cede (ver a ordem de precedência lá em cima).
    // Medição nos 1.141 pedidos: em 7 deles um desses eventos aparece ABAIXO da saída —
    // #21 (impresso 26/03 09:08 × saída 24/03), #105 (impresso 06/04 × saída 02/04),
    // ZZ#74 (impresso 06/04 21:12 × saída 06/04 — MESMO dia, e impresso depois da entrega
    // das 10:58), ZZ#108 (conta a receber 17/04 10:35 × saída 15/04), #612 (impresso 04/05
    // × saída 29/04), ZZ#201 (impresso 30/04 17:28 × saída 30/04 — MESMO dia, depois da
    // entrega das 14:28) e ZZ#253 (impresso 17/08 × saída 13/05). A ordem exibida está
    // certa; a frase é que estava errada. O texto novo promete só o que a função cumpre em
    // 100% dos casos: o dia nunca muda, e os limites é que cedem.
    //
    // RODADA 6 — a frase ainda dizia o INVERSO do código na ANCORAGEM. A saída da carga tem
    // `ancora: 'inicio'` (a chave nasce em `inicioDia` e só é EMPURRADA para frente pelo
    // piso): é o mais CEDO possível, não o mais tarde. Quem ancora no fim do dia é a BAIXA
    // DE PARCELA (`ancora: 'fim'`) — a frase tinha trocado os dois eventos de lugar.
    // Medida com o módulo real sobre os 1.141 pedidos (1.027 têm saída só-data):
    //   • 1.011 casos sem limite conflitante e sem limite fora do dia → a frase NOVA
    //     ("mais cedo possível, logo depois do que já tem hora no mesmo dia, sem passar da
    //     entrega") é verdadeira em 1.011/1.011; a frase antiga, em 0/1.011.
    //   • 16 casos ficam com a frase SEGUINTE ("quando esses limites se contradizem ou caem
    //     em outro dia"): 15 com piso > teto e o ZZ#253, cujo piso cai num dia posterior.
    //   • A troca muda a ORDEM VISÍVEL em 1 pedido (BN#3): a saída aparece ACIMA de
    //     "Bonificação aprovada", e a frase antiga prometia abaixo.
    avisos.push('A linha do tempo mostra só o que o sistema registrou com data. Quando o app guarda apenas o dia (saída da carga, baixa de parcela), a hora não aparece — não é hora zerada, é hora que ninguém registrou. Esse evento NUNCA sai do dia em que foi gravado, e essa regra vem antes de todas as outras. Dentro daquele dia, a saída da carga é encaixada o mais cedo possível, logo depois do que já tem hora no mesmo dia (criação, conta a receber, impressão, conferência da carga), e sem passar da entrega. Quando esses limites se contradizem ou caem em outro dia, são eles que cedem — nunca o dia do evento —, e aí a ordem na tela sai diferente dessa descrição. É de propósito: nesses casos quem está errada é a data lançada, e mexer no evento esconderia o problema em vez de corrigi-lo. Estorno de baixa e o detalhe da conversa com a SEFAZ ficam em Contas a Receber e em Notas Fiscais.');
    return avisos;
}
