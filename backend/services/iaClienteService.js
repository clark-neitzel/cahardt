// Funções de cliente GERAIS (não específicas de Kit Festa/Congelados) para a API de consulta da
// IA de WhatsApp. Existem porque o bot precisava reconhecer cliente e criar lead para QUALQUER
// conversa, não só pedido de congelados — e por não existir endpoint pra isso, o bot anterior
// rodava SQL direto no banco de produção (ver backend/docs/ia-consulta-api.md, seção de segurança).
const prisma = require('../config/database');
const leadService = require('./leadService');
const { normalizarDoc } = require('../utils/documento');
const { normalizarCidade } = require('../utils/cidade'); // grafia oficial da cidade (Fase 1)

const soDigitos = (s) => String(s || '').replace(/\D/g, '');
const dec = (v) => (v == null ? 0 : Number(v));
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Listas de contato achatadas — vão na busca/ficha do painel do bot para conferência de vínculo
const listaTelefones = (c) => [c.Telefone, c.Telefone_Celular, c.Telefone_Comercial].map(soDigitos).filter(Boolean);
const listaWhatsapps = (c) => c.whatsapp?.numeros || [];

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
            OR: [
                { Telefone: { not: null } }, { Telefone_Celular: { not: null } },
                { Telefone_Comercial: { not: null } }, { whatsapp: { isNot: null } },
            ],
        },
        include: { vendedor: { select: { nome: true } }, whatsapp: { select: { numeros: true } } },
    });
    return candidatos.find(c =>
        chaveTelefone(c.Telefone) === chaveAlvo ||
        chaveTelefone(c.Telefone_Celular) === chaveAlvo ||
        chaveTelefone(c.Telefone_Comercial) === chaveAlvo ||
        listaWhatsapps(c).some(n => chaveTelefone(n) === chaveAlvo)
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

    // ── Busca/ficha para o PAINEL da equipe do bot (v1.5.0) ─────────────────────────────────
    // Estes dois endpoints NÃO são expostos à IA nem a cliente final: quem chama é o backend do
    // bot, a partir da tela logada da equipe de atendimento, para vincular manualmente uma
    // conversa ao cadastro. Por isso podem buscar por nome/documento (a regra "só telefone
    // autenticado" continua valendo para a IA — ver reconhecerPorTelefone acima). Não devolvem
    // preço/condição negociada na busca — só identificação de cadastro.

    // Busca parcial por Razão Social, Nome Fantasia ou CPF/CNPJ (11+ caracteres úteis = documento).
    // Sem diferenciar maiúsculas/acentos; documento casa por dígitos/letras ignorando pontuação.
    async buscarClientes(buscaRaw, limiteRaw) {
        const busca = String(buscaRaw || '').trim();
        if (busca.length < 3) throw new Error('Informe pelo menos 3 caracteres para buscar.');
        const limite = Math.min(Math.max(parseInt(limiteRaw) || 10, 1), 20);

        // Só cadastros com documento — é a chave que o painel usa depois no /cliente/ficha
        const clientes = await prisma.cliente.findMany({
            where: { Documento: { not: null } },
            include: { vendedor: { select: { nome: true } }, whatsapp: { select: { numeros: true } } },
        });

        let achados;
        if (soDigitos(busca).length >= 11) {
            const docAlvo = normalizarDoc(busca);
            achados = clientes.filter(c => normalizarDoc(c.Documento).includes(docAlvo));
        } else {
            const alvo = semAcento(busca);
            achados = clientes.filter(c =>
                semAcento(c.Nome).includes(alvo) || semAcento(c.NomeFantasia).includes(alvo));
        }
        achados.sort((a, b) => (b.Ativo - a.Ativo) || String(a.Nome).localeCompare(b.Nome, 'pt-BR'));

        return {
            clientes: achados.slice(0, limite).map(c => ({
                documento: c.Documento,
                nome: c.Nome,
                nomeFantasia: c.NomeFantasia,
                cidade: c.End_Cidade,
                vendedor: c.vendedor?.nome || null,
                ativo: c.Ativo,
                telefones: listaTelefones(c),
                whatsapps: listaWhatsapps(c),
            })),
        };
    },

    // Ficha completa de UM cliente pela chave documento (vinda da busca acima). Mesmo shape do
    // reconhecerPorTelefone + nomeFantasia/ativo/telefones/whatsapps, com `encontrado` no lugar
    // de `reconhecido` (aqui não há reconhecimento — a equipe já escolheu o cliente).
    async fichaPorDocumento(documentoRaw) {
        const docAlvo = normalizarDoc(documentoRaw);
        if (!docAlvo || docAlvo.length < 11) throw new Error('Informe o CPF/CNPJ completo do cliente.');

        // Documento é gravado normalizado, mas cadastros antigos podem ter pontuação — tenta
        // direto e, não achando, compara todo mundo já normalizado.
        let cliente = await prisma.cliente.findUnique({
            where: { Documento: docAlvo },
            include: { vendedor: { select: { nome: true } }, whatsapp: { select: { numeros: true } } },
        });
        if (!cliente) {
            const todos = await prisma.cliente.findMany({
                where: { Documento: { not: null } },
                include: { vendedor: { select: { nome: true } }, whatsapp: { select: { numeros: true } } },
            });
            cliente = todos.find(c => normalizarDoc(c.Documento) === docAlvo) || null;
        }
        if (!cliente) return { encontrado: false };

        const condicao = cliente.Condicao_de_pagamento
            ? await prisma.tabelaPreco.findUnique({ where: { id: cliente.Condicao_de_pagamento } })
            : null;

        return {
            encontrado: true,
            cliente: {
                nome: cliente.Nome,
                nomeFantasia: cliente.NomeFantasia,
                documento: cliente.Documento,
                cidade: cliente.End_Cidade,
                vendedor: cliente.vendedor?.nome || null,
                ativo: cliente.Ativo,
            },
            diasEntrega: diasLabels(cliente.Dia_de_entrega),
            diasVenda: diasLabels(cliente.Dia_de_venda),
            condicaoPagamento: condicao ? { nome: condicao.nomeCondicao, valorMinimo: dec(condicao.valorMinimo) } : null,
            whatsapps: listaWhatsapps(cliente),
            telefones: listaTelefones(cliente),
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
            // A cidade aqui é TEXTO CRU de LLM (o cliente escreveu no WhatsApp e a IA repassou):
            // chega "joinvile", "JOINVILLE", "Joinville ". `leadService.criar` normaliza de novo —
            // é idempotente, e ter as duas camadas deixa explícito que este ponto não confia na entrada.
            cidade: normalizarCidade(cidade),
            observacoes: observacoes || null,
            origemLead: 'WHATSAPP_IA',
        });
        return { id: lead.id, numero: lead.numero, etapa: lead.etapa };
    },
};

module.exports = iaClienteService;
