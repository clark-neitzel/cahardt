// Funções de cliente GERAIS (não específicas de Kit Festa/Congelados) para a API de consulta da
// IA de WhatsApp. Existem porque o bot precisava reconhecer cliente e criar lead para QUALQUER
// conversa, não só pedido de congelados — e por não existir endpoint pra isso, o bot anterior
// rodava SQL direto no banco de produção (ver backend/docs/ia-consulta-api.md, seção de segurança).
const prisma = require('../config/database');
const leadService = require('./leadService');

const soDigitos = (s) => String(s || '').replace(/\D/g, '');
const dec = (v) => (v == null ? 0 : Number(v));

// Mesma normalização usada em congeladosService.js — mantida como cópia pequena e independente
// aqui de propósito (é só ~5 linhas; acoplar os dois serviços por isso não compensa o risco).
function chaveTelefone(raw) {
    let d = soDigitos(raw);
    if (!d) return '';
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);
    return d;
}

const DIA_LABEL = { DOM: 'Domingo', SEG: 'Segunda', TER: 'Terça', QUA: 'Quarta', QUI: 'Quinta', SEX: 'Sexta', SAB: 'Sábado' };
function diasLabels(str) {
    if (!str) return [];
    return String(str).split(/[,;/ ]+/).map(t => t.trim().toUpperCase()).filter(Boolean)
        .map(t => DIA_LABEL[t] || DIA_LABEL[t.slice(0, 3)] || t);
}

// Acha o Cliente cadastrado cujo telefone bate com o informado — base de todo reconhecimento
// aqui. O telefone de quem manda mensagem no WhatsApp já vem autenticado pela própria plataforma;
// nunca trocar isso por "aceitar CPF/CNPJ digitado sozinho" (CPF/CNPJ não é segredo).
async function _clientePorTelefone(telefoneRaw) {
    const chaveAlvo = chaveTelefone(telefoneRaw);
    if (!chaveAlvo) return null;
    const candidatos = await prisma.cliente.findMany({
        where: {
            Ativo: true,
            OR: [{ Telefone: { not: null } }, { Telefone_Celular: { not: null } }, { Telefone_Comercial: { not: null } }],
        },
        include: { vendedor: { select: { nome: true } } },
    });
    return candidatos.find(c =>
        chaveTelefone(c.Telefone) === chaveAlvo ||
        chaveTelefone(c.Telefone_Celular) === chaveAlvo ||
        chaveTelefone(c.Telefone_Comercial) === chaveAlvo
    ) || null;
}

const iaClienteService = {
    // Reconhecimento geral do cliente pelo telefone — nome, cidade, vendedor, dias de
    // entrega/venda e condição de pagamento (nome + pedido mínimo). Não devolve catálogo de
    // preços (isso é específico de cada linha — ver congeladosService.catalogoPorTelefone).
    async reconhecerPorTelefone(telefoneRaw) {
        const cliente = await _clientePorTelefone(telefoneRaw);
        if (!cliente) return { reconhecido: false };

        const condicao = cliente.Condicao_de_pagamento
            ? await prisma.tabelaPreco.findUnique({ where: { id: cliente.Condicao_de_pagamento } })
            : null;

        return {
            reconhecido: true,
            cliente: {
                nome: cliente.NomeFantasia || cliente.Nome,
                documento: cliente.Documento,
                cidade: cliente.End_Cidade,
                vendedor: cliente.vendedor?.nome || null,
            },
            diasEntrega: diasLabels(cliente.Dia_de_entrega),
            diasVenda: diasLabels(cliente.Dia_de_venda),
            condicaoPagamento: condicao ? { nome: condicao.nomeCondicao, valorMinimo: dec(condicao.valorMinimo) } : null,
        };
    },

    // Últimos pedidos do cliente — exige o MESMO reconhecimento por telefone (não aceita CPF
    // sozinho): histórico de compra é dado sensível, igual preço negociado.
    // Com `comItens: true`, cada pedido também traz `itens: [{ produtoId, nome, quantidade, unidade,
    // precoUnit }]` (destrava "o de sempre"/repetição). Sem o flag, a resposta é IDÊNTICA à de antes
    // (sem o campo itens) — mudança 100% aditiva, não quebra o contrato.
    async historicoPedidos(telefoneRaw, limite = 10, comItens = false) {
        const cliente = await _clientePorTelefone(telefoneRaw);
        if (!cliente) return { reconhecido: false };

        const itemSelect = comItens
            ? { produtoId: true, valor: true, quantidade: true, produto: { select: { nome: true, unidade: true } } }
            : { valor: true, quantidade: true };

        const pedidos = await prisma.pedido.findMany({
            where: { clienteId: cliente.UUID, statusEnvio: { not: 'EXCLUIDO' } },
            orderBy: { dataVenda: 'desc' },
            take: Math.min(Math.max(parseInt(limite) || 10, 1), 30),
            select: {
                numero: true, dataVenda: true, dataEntrega: true, statusEntrega: true,
                especial: true, bonificacao: true,
                itens: { select: itemSelect },
            },
        });

        return {
            reconhecido: true,
            cliente: { nome: cliente.NomeFantasia || cliente.Nome },
            pedidos: pedidos.map(p => ({
                numero: p.numero,
                data: p.dataVenda,
                dataEntrega: p.dataEntrega,
                statusEntrega: p.statusEntrega,
                tipo: p.bonificacao ? 'BONIFICACAO' : (p.especial ? 'ESPECIAL' : 'NORMAL'),
                total: Math.round(p.itens.reduce((s, i) => s + dec(i.valor) * dec(i.quantidade), 0) * 100) / 100,
                ...(comItens ? {
                    itens: p.itens.map(i => ({
                        produtoId: i.produtoId,
                        nome: i.produto?.nome || null,
                        quantidade: dec(i.quantidade),
                        unidade: i.produto?.unidade || null,
                        precoUnit: dec(i.valor),
                    })),
                } : {}),
            })),
        };
    },

    // Cria um Lead (prospect) reaproveitando o mesmo serviço do CRM interno — aparece igual pros
    // vendedores no app, com origemLead marcando que veio do WhatsApp/IA.
    async criarLead({ nomeEstabelecimento, whatsapp, contato, cidade, observacoes }) {
        if (!nomeEstabelecimento || !String(nomeEstabelecimento).trim()) throw new Error('Informe o nome do estabelecimento/contato.');
        if (!whatsapp || soDigitos(whatsapp).length < 10) throw new Error('Informe um WhatsApp válido.');
        const lead = await leadService.criar({
            nomeEstabelecimento: String(nomeEstabelecimento).trim(),
            whatsapp: soDigitos(whatsapp),
            contato: contato || null,
            cidade: cidade || null,
            observacoes: observacoes || null,
            origemLead: 'WHATSAPP_IA',
        });
        return { id: lead.id, numero: lead.numero, etapa: lead.etapa };
    },
};

module.exports = iaClienteService;
