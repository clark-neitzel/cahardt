const prisma = require('../config/database');

const ETAPAS = ['PEDIDO', 'PRODUCAO', 'SAINDO', 'ENTREGUE'];

const deliveryService = {
    ETAPAS,

    // ── Config: Categorias ──
    // Mescla categorias cadastradas com categorias distintas encontradas nos produtos.
    listarCategorias: async () => {
        const [cadastradas, produtosDistintos] = await Promise.all([
            prisma.deliveryCategoria.findMany({ orderBy: { nome: 'asc' } }),
            prisma.produto.findMany({
                where: { categoria: { not: null } },
                select: { categoria: true },
                distinct: ['categoria']
            })
        ]);

        const nomesCadastrados = new Set(cadastradas.map(c => c.nome));
        const extras = produtosDistintos
            .map(p => p.categoria)
            .filter(nome => nome && !nomesCadastrados.has(nome))
            .map(nome => ({ id: null, nome, ativo: false, createdAt: null, naoSalva: true }));

        return [...cadastradas, ...extras].sort((a, b) => a.nome.localeCompare(b.nome));
    },

    salvarCategoria: async (nome, ativo) => {
        return await prisma.deliveryCategoria.upsert({
            where: { nome },
            update: { ativo },
            create: { nome, ativo }
        });
    },

    // ── Config: Permissões ──
    listarPermissoes: async () => {
        const [vendedores, permissoes] = await Promise.all([
            prisma.vendedor.findMany({
                where: { ativo: true },
                select: { id: true, nome: true, login: true },
                orderBy: { nome: 'asc' }
            }),
            prisma.deliveryPermissao.findMany()
        ]);
        const mapa = new Map(permissoes.map(p => [p.vendedorId, p]));
        return vendedores.map(v => ({
            vendedorId: v.id,
            nome: v.nome,
            login: v.login,
            podeVer: mapa.get(v.id)?.podeVer || false,
            etapasPermitidas: mapa.get(v.id)?.etapasPermitidas || []
        }));
    },

    salvarPermissao: async (vendedorId, { podeVer, etapasPermitidas }) => {
        const etapas = Array.isArray(etapasPermitidas)
            ? etapasPermitidas.filter(e => ETAPAS.includes(e))
            : [];
        const salvo = await prisma.deliveryPermissao.upsert({
            where: { vendedorId },
            update: { podeVer: !!podeVer, etapasPermitidas: etapas },
            create: { vendedorId, podeVer: !!podeVer, etapasPermitidas: etapas }
        });

        // Propaga pro vendedor.permissoes.delivery para o menu lateral aparecer
        const vendedor = await prisma.vendedor.findUnique({ where: { id: vendedorId }, select: { permissoes: true } });
        const permissoesAtuais = (vendedor?.permissoes && typeof vendedor.permissoes === 'object') ? vendedor.permissoes : {};
        await prisma.vendedor.update({
            where: { id: vendedorId },
            data: { permissoes: { ...permissoesAtuais, delivery: !!podeVer } }
        });

        return salvo;
    },

    // Retorna a permissão efetiva do usuário (admin vê tudo).
    permissaoDoUsuario: async (user) => {
        if (user?.permissoes?.admin) {
            return { podeVer: true, etapasPermitidas: ETAPAS, admin: true };
        }
        const perm = await prisma.deliveryPermissao.findUnique({
            where: { vendedorId: user.id }
        });
        return {
            podeVer: perm?.podeVer || false,
            etapasPermitidas: perm?.etapasPermitidas || [],
            admin: false
        };
    },

    // ── Core: quais categorias ativas? ──
    _categoriasAtivasNomes: async () => {
        const cats = await prisma.deliveryCategoria.findMany({
            where: { ativo: true },
            select: { nome: true }
        });
        return cats.map(c => c.nome);
    },

    // Backfill: cria delivery_status em PEDIDO para todos os pedidos elegiveis
    // (item de categoria ativa) que ainda não têm registro.
    backfillStatus: async () => {
        const categoriasAtivas = await deliveryService._categoriasAtivasNomes();
        if (!categoriasAtivas.length) return 0;

        const [elegiveis, comStatus] = await Promise.all([
            prisma.pedido.findMany({
                where: { itens: { some: { produto: { categoria: { in: categoriasAtivas } } } } },
                select: { id: true }
            }),
            prisma.deliveryStatus.findMany({ select: { pedidoId: true } })
        ]);
        const jaTem = new Set(comStatus.map(s => s.pedidoId));
        const faltantes = elegiveis.filter(p => !jaTem.has(p.id));
        if (!faltantes.length) return 0;

        await prisma.deliveryStatus.createMany({
            data: faltantes.map(p => ({ pedidoId: p.id, etapa: 'PEDIDO' })),
            skipDuplicates: true
        });
        return faltantes.length;
    },

    // ── Kanban: listar pedidos de delivery ──
    // Regras de ordenação:
    //   - etapa ENTREGUE: mais recentes primeiro (scroll, limitado a 10)
    //   - demais: data do pedido (dataVenda) — atrasados/hoje primeiro, futuros crescentes
    listarPedidos: async () => {
        const categoriasAtivas = await deliveryService._categoriasAtivasNomes();
        if (!categoriasAtivas.length) {
            return { PEDIDO: [], PRODUCAO: [], SAINDO: [], ENTREGUE: [] };
        }

        // Garante que pedidos antigos com item de categoria ativa entrem no fluxo
        await deliveryService.backfillStatus();

        const statusTodos = await prisma.deliveryStatus.findMany();
        if (!statusTodos.length) {
            return { PEDIDO: [], PRODUCAO: [], SAINDO: [], ENTREGUE: [] };
        }

        const pedidoIds = statusTodos.map(s => s.pedidoId);

        const pedidos = await prisma.pedido.findMany({
            where: {
                id: { in: pedidoIds },
                itens: { some: { produto: { categoria: { in: categoriasAtivas } } } }
            },
            include: {
                cliente: {
                    select: {
                        UUID: true, Nome: true, NomeFantasia: true,
                        Telefone: true, Telefone_Celular: true,
                        End_Logradouro: true, End_Numero: true, End_Bairro: true,
                        End_Cidade: true, End_Estado: true, End_CEP: true,
                        End_Complemento: true
                    }
                },
                vendedor: { select: { id: true, nome: true } },
                itens: {
                    include: {
                        produto: { select: { id: true, nome: true, categoria: true, unidade: true } }
                    }
                },
                contaReceber: {
                    include: { parcelas: true }
                }
            }
        });

        const statusMap = new Map(statusTodos.map(s => [s.pedidoId, s]));

        const cards = pedidos.map(p => {
            const st = statusMap.get(p.id);
            // Valor pago = soma das baixas das parcelas
            const totalPago = (p.contaReceber?.parcelas || []).reduce((acc, par) => {
                return acc + Number(par.valorPago || 0);
            }, 0);
            const totalItens = (p.itens || []).reduce((acc, i) => acc + Number(i.valor) * Number(i.quantidade), 0);
            const frete = Number(p.valorFrete || 0);
            const totalPedido = totalItens + frete;
            const aberto = Math.max(0, totalPedido - totalPago);

            let statusPagamento = 'ABERTO';
            if (totalPago >= totalPedido && totalPedido > 0) statusPagamento = 'QUITADO';
            else if (totalPago > 0) statusPagamento = 'PARCIAL';

            return {
                id: p.id,
                numero: p.numero,
                etapa: st?.etapa || 'PEDIDO',
                etapaAt: st?.etapaAt,
                dataVenda: p.dataVenda,
                cliente: p.cliente,
                vendedor: p.vendedor,
                itens: p.itens.map(i => ({
                    id: i.id,
                    produto: i.produto,
                    quantidade: Number(i.quantidade),
                    valor: Number(i.valor)
                })),
                frete,
                totalItens,
                totalPedido,
                totalPago,
                aberto,
                statusPagamento,
                observacoes: p.observacoes
            };
        });

        const agora = new Date();
        const sortAtivos = (a, b) => {
            const aAtrasado = new Date(a.dataVenda) <= agora;
            const bAtrasado = new Date(b.dataVenda) <= agora;
            if (aAtrasado !== bAtrasado) return aAtrasado ? -1 : 1; // atrasados/hoje primeiro
            return new Date(a.dataVenda) - new Date(b.dataVenda);
        };

        const buckets = { PEDIDO: [], PRODUCAO: [], SAINDO: [], ENTREGUE: [] };
        for (const c of cards) {
            (buckets[c.etapa] || buckets.PEDIDO).push(c);
        }
        ['PEDIDO', 'PRODUCAO', 'SAINDO'].forEach(e => buckets[e].sort(sortAtivos));
        buckets.ENTREGUE.sort((a, b) => new Date(b.etapaAt) - new Date(a.etapaAt));
        buckets.ENTREGUE = buckets.ENTREGUE.slice(0, 10);

        return buckets;
    },

    // ── Movimentar etapa ──
    moverEtapa: async ({ pedidoId, novaEtapa, user }) => {
        if (!ETAPAS.includes(novaEtapa)) {
            throw new Error('Etapa inválida.');
        }

        const perm = await deliveryService.permissaoDoUsuario(user);
        if (!perm.podeVer) throw new Error('Sem permissão para Delivery.');
        if (!perm.admin && !perm.etapasPermitidas.includes(novaEtapa)) {
            throw new Error('Sem permissão para mover para esta etapa.');
        }

        const atual = await prisma.deliveryStatus.findUnique({ where: { pedidoId } });
        if (!atual) throw new Error('Pedido não está no fluxo de Delivery.');
        if (atual.etapa === 'ENTREGUE') {
            throw new Error('Pedido já entregue — card bloqueado.');
        }

        const atualizado = await prisma.deliveryStatus.update({
            where: { pedidoId },
            data: { etapa: novaEtapa, etapaAt: new Date() }
        });

        // Notificações ficam para a Entrega 3 (webhook bot + whatsapp)
        return atualizado;
    },

    // Diagnóstico: por que esse pedido aparece (ou não) no Kanban?
    diagnosticar: async (numeroOuId) => {
        const whereId = /^[0-9a-f-]{36}$/i.test(String(numeroOuId))
            ? { id: numeroOuId }
            : { numero: parseInt(numeroOuId) };
        const pedido = await prisma.pedido.findFirst({
            where: whereId,
            include: {
                itens: { include: { produto: { select: { nome: true, categoria: true } } } }
            }
        });
        if (!pedido) return { encontrado: false, motivo: 'Pedido não encontrado' };

        const categoriasAtivas = await deliveryService._categoriasAtivasNomes();
        const status = await prisma.deliveryStatus.findUnique({ where: { pedidoId: pedido.id } });
        const itensCategorias = pedido.itens.map(i => ({
            produto: i.produto?.nome,
            categoria: i.produto?.categoria
        }));
        const temItemElegivel = pedido.itens.some(i => categoriasAtivas.includes(i.produto?.categoria));

        return {
            encontrado: true,
            pedidoId: pedido.id,
            numero: pedido.numero,
            categoriasAtivas,
            itensCategorias,
            temItemElegivel,
            deliveryStatus: status,
            noKanban: !!status && temItemElegivel
        };
    },

    // ── Trigger: ao criar pedido, se tiver item de categoria ativa, cria delivery_status ──
    garantirStatusParaPedido: async (pedidoId) => {
        const categoriasAtivas = await deliveryService._categoriasAtivasNomes();
        if (!categoriasAtivas.length) return null;

        const tem = await prisma.pedidoItem.findFirst({
            where: {
                pedidoId,
                produto: { categoria: { in: categoriasAtivas } }
            },
            select: { id: true }
        });
        if (!tem) return null;

        const existente = await prisma.deliveryStatus.findUnique({ where: { pedidoId } });
        if (existente) return existente;

        return await prisma.deliveryStatus.create({
            data: { pedidoId, etapa: 'PEDIDO' }
        });
    }
};

module.exports = deliveryService;
