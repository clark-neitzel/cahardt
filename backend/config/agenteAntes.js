// "ANTES" da solicitação do agente: para funções que ALTERAM algo que já existe (cancelar, estornar, baixar,
// editar), guarda uma foto curta do estado do alvo NA HORA do pedido. Quando o dono autoriza, a foto é
// refeita: se mudou desde o pedido (alguém já cancelou, baixou, editou), o sistema exige confirmação explícita
// (`confirmarMudanca:true`) em vez de executar às cegas um pedido velho.
//
// Registro: chave da função ("MÉTODO /api/caminho/:p", a MESMA do catálogo) -> async ({ caminho }) => objeto | null.
//  - devolve só campos curtos e comparáveis (status, valor, atualizadoEm) — nunca segredo;
//  - null = o alvo não existe (mais) ou não foi possível ler (a comparação trata como "mudou" só se havia foto antes);
//  - o caminho é o CONCRETO (com os ids); função sem registro aqui simplesmente não tem "antes".
const prisma = require('../config/database');

const segs = (caminho) => String(caminho || '').split('?')[0].split('/').filter(Boolean);
const num = (d) => (d == null ? null : Number(d));
const iso = (d) => (d ? new Date(d).toISOString() : null);

async function contaPagar(caminho) {
    const id = segs(caminho)[2]; // api / contas-pagar / <id> / ...
    if (!id) return null;
    const c = await prisma.contaPagar.findUnique({ where: { id }, select: { id: true, status: true, valorTotal: true, descricao: true, atualizadoEm: true } });
    return c ? { tipo: 'conta_pagar', id: c.id, descricao: c.descricao, status: c.status, valor: num(c.valorTotal), atualizadoEm: iso(c.atualizadoEm) } : null;
}

async function parcelaPagar(caminho) {
    const s = segs(caminho); // api / contas-pagar / <conta> / parcelas / <parcela> / ...
    const id = s[4];
    if (!id) return null;
    const p = await prisma.parcelaPagar.findUnique({ where: { id }, select: { id: true, status: true, valor: true, valorPago: true, atualizadoEm: true } });
    return p ? { tipo: 'parcela_pagar', id: p.id, status: p.status, valor: num(p.valor), valorPago: num(p.valorPago), atualizadoEm: iso(p.atualizadoEm) } : null;
}

// Contas a receber: api / contas-receber / <parcela> / baixa | pagamentos/<id>
async function parcelaReceber(caminho) {
    const id = segs(caminho)[2];
    if (!id) return null;
    const p = await prisma.parcela.findUnique({ where: { id }, select: { id: true, status: true, valor: true, valorPago: true, dataPagamento: true } });
    return p ? { tipo: 'parcela_receber', id: p.id, status: p.status, valor: num(p.valor), valorPago: num(p.valorPago), dataPagamento: iso(p.dataPagamento) } : null;
}

// Fornecedor: api / fornecedores / <id> [/ excluir]
async function fornecedor(caminho) {
    const id = segs(caminho)[2];
    if (!id) return null;
    const f = await prisma.fornecedor.findUnique({ where: { id }, select: { id: true, razaoSocial: true, cnpjCpf: true, ativo: true, atualizadoEm: true } });
    return f ? { tipo: 'fornecedor', id: f.id, razaoSocial: f.razaoSocial, cnpjCpf: f.cnpjCpf, ativo: f.ativo, atualizadoEm: iso(f.atualizadoEm) } : null;
}

const REGISTRO = {
    'POST /api/contas-pagar/:p/cancelar': contaPagar,
    'PUT /api/contas-pagar/:p': contaPagar,
    'POST /api/contas-pagar/:p/parcelas/:p/baixar': parcelaPagar,
    'POST /api/contas-pagar/:p/parcelas/:p/estorno': parcelaPagar,
    'POST /api/contas-receber/:p/baixa': parcelaReceber,
    'DELETE /api/contas-receber/:p/baixa': parcelaReceber,
    'DELETE /api/contas-receber/:p/pagamentos/:p': parcelaReceber,
    'PUT /api/fornecedores/:p': fornecedor,
    'POST /api/fornecedores/:p/excluir': fornecedor,
};

/** Foto do estado do alvo da função (ou null quando a função não tem "antes" registrado / o alvo não existe). */
async function lerAntes(chave, caminho) {
    const fn = REGISTRO[chave];
    if (!fn) return null;
    return fn(caminho);
}

function temAntes(chave) { return Object.prototype.hasOwnProperty.call(REGISTRO, chave); }

module.exports = { lerAntes, temAntes, REGISTRO };
