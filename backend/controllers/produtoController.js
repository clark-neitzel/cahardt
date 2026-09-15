const prisma = require('../config/database');
const fs = require('fs');
const path = require('path');
const pcpReceitaService = require('../services/pcpReceitaService');
const categoriaEstoqueService = require('../services/categoriaEstoqueService');
const produtoService = require('../services/produtoService');

// Moeda em português para os textos que o usuário lê (log de auditoria).
// Mesmo padrão de uma linha já usado em cobrancaService.js e reciboEspecialPdf.js.
const fmtMoeda = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const produtoController = {
    // Listar produtos com paginação e filtros
    listar: async (req, res) => {
        try {
            const { page = 1, limit = 10, search, ativo, categorias, categoriaProdutoIds, incluirNaoVendaveis } = req.query;
            const skip = (page - 1) * limit;

            const where = {};
            if (search) {
                where.OR = [
                    { nome: { contains: search, mode: 'insensitive' } },
                    { codigo: { contains: search, mode: 'insensitive' } },
                    { ean: { contains: search, mode: 'insensitive' } }
                ];
            }
            if (ativo !== undefined && ativo !== 'all') {
                where.ativo = ativo === 'true';
            }

            // Filtro de Categorias CA (Multi-select por nome, separado por vírgula).
            // Pega antes as flags (cache) porque o nome da própria categoria PODE ter
            // vírgula (ex.: "Móveis, Equipamentos") — nesse caso o split quebraria o
            // nome em dois e a contagem/filtro sairia errado. Se o texto inteiro bate
            // com uma categoria cadastrada, ele vale como UM nome só.
            const flagsCategorias = await categoriaEstoqueService.flagsCategorias();
            if (categorias) {
                const bruto = String(categorias).trim();
                const chave = (n) => String(n ?? '').trim().toLowerCase();
                const nomeInteiro = flagsCategorias.find(c => chave(c.nome) === chave(bruto));
                const cats = nomeInteiro
                    ? [nomeInteiro.nome]
                    : categorias.split(',').map(c => c.trim()).filter(c => c);
                if (cats.length > 0) {
                    where.categoria = { in: cats };
                }
            }

            // Filtro de Categoria Comercial (Multi-select por ID)
            if (categoriaProdutoIds) {
                const ids = categoriaProdutoIds.split(',').map(c => c.trim()).filter(c => c);
                if (ids.length > 0) {
                    where.categoriaProdutoId = { in: ids };
                }
            }

            // Categorias CA marcadas como "não vende" (imobilizado: freezer, painel LED, móveis).
            // Saem da listagem padrão — que é a que alimenta catálogo/pedido/amostra.
            // As telas de cadastro/estoque pedem ?incluirNaoVendaveis=1 para vê-los.
            if (incluirNaoVendaveis !== '1') {
                const naoVendaveis = flagsCategorias
                    .filter(c => c.vendavel === false)
                    .map(c => c.nome)
                    .filter(n => typeof n === 'string' && n.length > 0);
                if (naoVendaveis.length > 0) {
                    // ATENÇÃO: `notIn` no Prisma EXCLUI as linhas com categoria = null.
                    // Sem o OR explícito, os produtos sem categoria sumiriam da lista.
                    // E o where.OR já é usado pela busca por texto — por isso vai em AND.
                    where.AND = [
                        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
                        { OR: [{ categoria: null }, { categoria: { notIn: naoVendaveis } }] }
                    ];
                }
            }

            const [produtos, total] = await Promise.all([
                prisma.produto.findMany({
                    where,
                    skip: Number(skip),
                    take: Number(limit),
                    include: {
                        imagens: {
                            orderBy: [{ principal: 'desc' }, { ordem: 'asc' }],
                            take: 1
                        },
                        categoriaProduto: {
                            select: { id: true, nome: true, corTag: true }
                        }
                    },
                    orderBy: { nome: 'asc' }
                }),
                prisma.produto.count({ where })
            ]);

            // Controle de estoque EFETIVO: produto.controlaEstoque força; null segue a categoria.
            // O front (tela de pedido) usa isso p/ avisar item sem estoque sem falso positivo.
            const catControla = new Map(flagsCategorias.map(c => [c.nome, c.controlaEstoque === true]));
            const produtosComFlag = produtos.map(p => ({
                ...p,
                controlaEstoqueEfetivo: p.controlaEstoque === true ? true
                    : p.controlaEstoque === false ? false
                    : (catControla.get(p.categoria) || false)
            }));

            res.json({
                data: produtosComFlag,
                meta: {
                    total,
                    page: Number(page),
                    totalPages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao listar produtos' });
        }
    },

    // Detalhe do produto
    detalhar: async (req, res) => {
        try {
            const { id } = req.params;
            const produto = await prisma.produto.findUnique({
                where: { id },
                include: {
                    imagens: {
                        orderBy: { ordem: 'asc' }
                    },
                    categoriaProduto: {
                        select: { id: true, nome: true, permiteFracao: true }
                    }
                }
            });

            if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });

            // Custo pela receita do PCP: se o produto tem receita ativa, ela manda no custo
            // (substitui o custo do CA e o manual na tela). Falha aqui não derruba o detalhe.
            let custoReceita = null;
            try {
                const itemPcp = await prisma.itemPcp.findFirst({
                    where: { produtoId: id },
                    select: { id: true }
                });
                if (itemPcp) {
                    const agora = new Date();
                    const receitaAtiva = await prisma.receita.findFirst({
                        where: {
                            itemPcpId: itemPcp.id,
                            status: 'ativa',
                            dataInicioVigencia: { lte: agora },
                            OR: [{ dataFimVigencia: null }, { dataFimVigencia: { gte: agora } }]
                        },
                        orderBy: { versao: 'desc' },
                        select: { id: true }
                    });
                    if (receitaAtiva) {
                        const c = await pcpReceitaService.calcularCusto(receitaAtiva.id);
                        if (c && Number(c.custoPorUnidade) > 0) {
                            custoReceita = Math.round(Number(c.custoPorUnidade) * 100) / 100;
                        }
                    }
                }
            } catch (e) {
                console.error('Custo por receita indisponível (segue sem):', e.message);
            }

            // "Cadastrado a partir da NF-e X (fornecedor) em data como '…'" (Tela 3 da
            // proposta) — lookup simples da nota de origem; falha aqui não derruba a ficha.
            let notaOrigem = null;
            if (produto.notaOrigemId) {
                try {
                    notaOrigem = await prisma.notaEntrada.findUnique({
                        where: { id: produto.notaOrigemId },
                        select: { numero: true, fornecedorNome: true, emissao: true }
                    });
                } catch (e) {
                    console.error('Nota de origem indisponível (segue sem):', e.message);
                }
            }

            // "Fornecedores que já vieram com este produto" — de-para memorizado por
            // fornecedor+código (FornecedorProdutoVinculo). Nome do fornecedor é
            // best-effort (nem todo CNPJ tem Fornecedor cadastrado).
            let vinculosFornecedor = [];
            try {
                const vinculos = await prisma.fornecedorProdutoVinculo.findMany({
                    where: { produtoId: id },
                    select: { fornecedorCnpj: true, codigoFornecedor: true, descricaoFornecedor: true },
                    orderBy: { atualizadoEm: 'desc' }
                });
                if (vinculos.length > 0) {
                    const cnpjs = [...new Set(vinculos.map((v) => v.fornecedorCnpj).filter(Boolean))];
                    const fornecedores = cnpjs.length > 0
                        ? await prisma.fornecedor.findMany({
                            where: { cnpjCpf: { in: cnpjs } },
                            select: { cnpjCpf: true, razaoSocial: true }
                        })
                        : [];
                    const nomePorCnpj = new Map(fornecedores.map((f) => [f.cnpjCpf, f.razaoSocial]));
                    vinculosFornecedor = vinculos.map((v) => ({
                        fornecedorCnpj: v.fornecedorCnpj,
                        fornecedorNome: nomePorCnpj.get(v.fornecedorCnpj) || null,
                        codigoFornecedor: v.codigoFornecedor,
                        descricaoFornecedor: v.descricaoFornecedor
                    }));
                }
            } catch (e) {
                console.error('Vínculos de fornecedor indisponíveis (segue sem):', e.message);
            }

            res.json({ ...produto, custoReceita, notaOrigem, vinculosFornecedor });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao buscar produto' });
        }
    },

    // Ficha do produto (popup do catálogo) — dados + tabela nutricional/ingredientes da etiqueta.
    // Mesma lógica do site de congelados (services/congeladosService.fichaPublico): a etiqueta é
    // procurada pelo produtoId e, se não houver vínculo, pelo código do produto. O front calcula
    // 100g/porção/%VD a partir dos valores crus (ex.: "169kcal (12% VD)").
    ficha: async (req, res) => {
        try {
            const { id } = req.params;
            const p = await prisma.produto.findUnique({
                where: { id },
                include: {
                    imagens: { orderBy: [{ principal: 'desc' }, { ordem: 'asc' }] },
                    categoriaProduto: { select: { id: true, nome: true, corTag: true } }
                }
            });
            if (!p) return res.status(404).json({ error: 'Produto não encontrado' });

            let et = await prisma.etiquetaProduto.findFirst({ where: { produtoId: p.id, ativo: true }, orderBy: { updatedAt: 'desc' } });
            if (!et && p.codigo) et = await prisma.etiquetaProduto.findFirst({ where: { codigoProduto: p.codigo, ativo: true }, orderBy: { updatedAt: 'desc' } });

            const imagens = [...p.imagens]
                .sort((a, b) => (b.principal === true ? 1 : 0) - (a.principal === true ? 1 : 0))
                .map(i => i.url)
                .filter(Boolean);

            res.json({
                id: p.id,
                nome: p.nome,
                codigo: p.codigo,
                unidade: p.unidade,
                categoria: p.categoria,
                grupoNome: p.categoriaProduto?.nome || null,
                descricao: p.descricao || '',
                valorVenda: p.valorVenda,
                estoqueDisponivel: p.estoqueDisponivel,
                ativo: p.ativo,
                imagem: imagens[0] || null,
                imagens,
                etiqueta: et ? {
                    pesoUnitario: et.pesoUnitario,
                    pesoPorcao: et.pesoTabelaNutricional,
                    quantidadeEmbalagem: et.quantidadeEmbalagem,
                    quantidadeAproximada: et.quantidadeAproximada,
                    pesoPacote: et.pesoPacote, // gramas; null = sem peso fixo cadastrado
                    nutricional: {
                        valorEnergetico: et.valorEnergetico,
                        carboidratos: et.carboidratos,
                        acucaresTotais: et.acucaresTotais,
                        acucaresAdicionados: et.acucaresAdicionados,
                        proteinas: et.proteinas,
                        gordurasTotais: et.gordurasTotais,
                        gordurasSaturadas: et.gordurasSaturadas,
                        gordurasTrans: et.gordurasTrans,
                        fibraAlimentar: et.fibraAlimentar,
                        sodio: et.sodio,
                    },
                    composicao: et.composicao,
                    modoPreparo: et.modoPreparo,
                    armazenamento: et.armazenamento,
                    validadeDias: et.validadeDias,
                    contemGluten: et.contemGluten,
                    contemLactose: et.contemLactose,
                    alergenos: Array.isArray(et.alergenos) ? et.alergenos : [],
                    especieCrustaceos: et.especieCrustaceos,
                    especiePeixes: et.especiePeixes,
                    avisosRotulo: et.avisosRotulo,
                } : null,
            });
        } catch (error) {
            console.error('Erro ao buscar ficha do produto:', error);
            res.status(500).json({ error: 'Erro ao buscar ficha do produto' });
        }
    },

    // Fase 6 — criar produto novo: nasce PRIMEIRO no Conta Azul (POST /v1/produtos)
    // e só então é salvo aqui com o contaAzulId retornado (origem APP).
    // Se o CA estiver fora, nada é criado — o usuário tenta de novo.
    // 09/2026: miolo extraído para produtoService.criar (reaproveitado pela
    // conferência de nota e pela promoção de item PCP órfão a produto).
    criar: async (req, res) => {
        try {
            const { CA_SOMENTE_LEITURA } = require('../config/contaAzulModo');
            const { produto } = await produtoService.criar(req.body || {}, req.user);
            res.status(201).json({ ...produto, message: CA_SOMENTE_LEITURA ? 'Produto criado no app!' : 'Produto criado no app e na Conta Azul!' });
        } catch (error) {
            if (error.status) return res.status(error.status).json({ error: error.message });
            console.error('Erro ao criar produto:', error);
            res.status(500).json({ error: 'Erro ao criar o produto.' });
        }
    },

    // Atualizar produto (somente campos locais — dados do CA são imutáveis)
    atualizar: async (req, res) => {
        try {
            const { id } = req.params;
            const body = req.body;

            // Whitelist: apenas campos gerenciados localmente
            // 'unidade', 'categoria' e 'ativo' são editáveis no app e NÃO são mais
            // sobrescritos pelo sync do CA (cadastro de produtos é do app desde 08/2026)
            // 09/2026: 'ncm' e 'ean' entraram na whitelist — a ficha do produto criado a
            // partir de uma nota (Entrada de Notas) precisa editar os dois quando o XML
            // veio incompleto ou trocado (plano Etapa 1, contrato item 1).
            const CAMPOS_PERMITIDOS = [
                'ativo', 'descricao', 'estoqueMinimo', 'unidade', 'custoManual',
                'categoria', 'categoriaProdutoId', 'produtoSubstitutoId',
                'permiteRecomendacao', 'prioridadeRecomendacao', 'controlaEstoque',
                'validadeDias', 'quantidadePorCaixa', 'valorVenda', 'ncm', 'ean'
            ];
            const data = {};
            for (const campo of CAMPOS_PERMITIDOS) {
                if (body[campo] !== undefined) data[campo] = body[campo];
            }
            // Validade em dias: número inteiro >= 1, ou null (vazio = usa a validade da etiqueta)
            if (data.validadeDias !== undefined) {
                const n = parseInt(data.validadeDias);
                data.validadeDias = Number.isFinite(n) && n >= 1 ? n : null;
            }
            // Quantidade por caixa: inteiro >= 1, ou null (vazio limpa). Valor inválido é recusado
            // com erro claro — nunca gravar silenciosamente algo diferente do que foi digitado.
            if (data.quantidadePorCaixa !== undefined) {
                const bruto = data.quantidadePorCaixa;
                if (bruto === null || bruto === '') {
                    data.quantidadePorCaixa = null;
                } else {
                    const n = Number(bruto);
                    if (!Number.isInteger(n) || n < 1) {
                        return res.status(400).json({ error: 'Quantidade por caixa inválida: informe um número inteiro maior ou igual a 1, ou deixe vazio para limpar.' });
                    }
                    data.quantidadePorCaixa = n;
                }
            }
            // Controle de estoque por produto: true/false força; null volta a seguir a categoria
            if (data.controlaEstoque !== undefined && data.controlaEstoque !== null) {
                data.controlaEstoque = data.controlaEstoque === true || data.controlaEstoque === 'true';
            }
            // Categoria: texto livre (agrupa estoque/relatórios/flex); vazio = sem categoria.
            // Normaliza para a grafia da tabela `categorias_estoque` quando bater
            // ignorando caixa/espaços — o casamento produto↔categoria é por string
            // EXATA e o `notIn` do Postgres é case-sensitive, então um "imobilizado"
            // digitado torto criaria uma categoria paralela e a trava do "Vende"
            // deixaria de pegar em silêncio.
            if (data.categoria !== undefined) {
                data.categoria = await categoriaEstoqueService.canonizarNome(data.categoria) || null;
            }
            // NCM/EAN: texto livre, trim; vazio vira string vazia (mesmo padrão de 'ean' na
            // criação) — nunca null, pra não colidir com o tipo String (não String?) do schema.
            if (data.ncm !== undefined) data.ncm = String(data.ncm ?? '').trim() || null;
            if (data.ean !== undefined) data.ean = String(data.ean ?? '').trim();
            // Ativo: só true/false de verdade
            if (data.ativo !== undefined) {
                data.ativo = data.ativo === true || data.ativo === 'true';
            }
            // Unidade nunca pode ficar vazia (campo obrigatório no schema)
            if (data.unidade !== undefined) {
                data.unidade = String(data.unidade).trim().substring(0, 10);
                if (!data.unidade) delete data.unidade;
            }
            // Custo manual: aceita número ou vazio (null). Usado só quando o CA não tem custo.
            if (data.custoManual !== undefined) {
                const n = parseFloat(data.custoManual);
                data.custoManual = Number.isFinite(n) && n >= 0 ? n : null;
            }

            // Preço de venda: editável no app desde 09/2026 (o Conta Azul deixou de ser a
            // fonte do cadastro). Valor inválido é RECUSADO com erro claro — nunca gravar
            // silenciosamente algo diferente do que foi digitado (mesmo padrão do
            // quantidadePorCaixa). Quando o preço muda, o produto passa a ter precoLocal =
            // true e o sync do CA nunca mais sobrescreve esse valor.
            let precoAnterior = null;   // usado só na auditoria, depois do update
            let precoNovo = null;
            if (data.valorVenda !== undefined) {
                const bruto = data.valorVenda;
                if (bruto === null || String(bruto).trim() === '') {
                    return res.status(400).json({ error: 'Valor de venda inválido: informe um número maior ou igual a zero.' });
                }
                const n = Number(String(bruto).trim().replace(',', '.'));
                if (!Number.isFinite(n) || n < 0) {
                    return res.status(400).json({ error: 'Valor de venda inválido: informe um número maior ou igual a zero.' });
                }
                // A coluna é Decimal(10,2): mais de 2 casas seria arredondado pelo banco e
                // gravaria um preço diferente do digitado, sem o usuário perceber.
                if (Math.round(n * 100) / 100 !== n) {
                    return res.status(400).json({ error: 'Valor de venda inválido: use no máximo duas casas decimais (centavos), por exemplo 12.50.' });
                }
                if (n > 99999999.99) {
                    return res.status(400).json({ error: 'Valor de venda inválido: o valor máximo permitido é 99.999.999,99.' });
                }

                const atualDb = await prisma.produto.findUnique({
                    where: { id },
                    select: { id: true, nome: true, valorVenda: true }
                });
                if (!atualDb) return res.status(404).json({ error: 'Produto não encontrado.' });

                const anterior = Number(atualDb.valorVenda);
                data.valorVenda = n;
                if (n !== anterior) {
                    // Só marca quando o preço realmente mudou (reenviar o mesmo valor não
                    // "adota" o preço nem gera registro de auditoria).
                    data.precoLocal = true;
                    precoAnterior = anterior;
                    precoNovo = n;
                }
            }

            const produto = await prisma.produto.update({
                where: { id },
                data
            });

            // Auditoria da mudança de preço — informação comercial sensível.
            // FORA da operação principal e em try/catch próprio: falha de log nunca pode
            // derrubar nem desfazer a alteração já gravada.
            if (precoNovo !== null) {
                try {
                    await prisma.auditLog.create({
                        data: {
                            acao: 'ALTERAR_PRECO_VENDA',
                            entidade: 'Produto',
                            entidadeId: id,
                            detalhes: `Preço de venda de "${produto.nome}" alterado de R$ ${fmtMoeda(precoAnterior)} para R$ ${fmtMoeda(precoNovo)} por ${req.user?.nome || req.user?.login || '-'}.`,
                            usuarioId: req.user?.id || '-',
                            usuarioNome: req.user?.nome || req.user?.login || '-'
                        }
                    });
                } catch (logErr) {
                    console.error('Falha ao registrar auditoria de preço (alteração já efetivada):', logErr.message);
                }
            }

            res.json(produto);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao atualizar produto' });
        }
    },

    // Zerar/restaurar o custo do Conta Azul.
    // Zerado: custoMedio some e o app passa a valer o custoManual (que as entradas de
    // compra atualizam por média ponderada); o sync do CA deixa de trazer o custo de volta.
    // Restaurar: religa o sync e força a próxima rodada a rebuscar o produto no CA.
    alterarCustoCa: async (req, res) => {
        try {
            const { id } = req.params;
            const zerar = req.body?.zerar !== false;
            const produto = await prisma.produto.update({
                where: { id },
                data: zerar
                    ? { custoCaZerado: true, custoMedio: null }
                    : { custoCaZerado: false, contaAzulUpdatedAt: null }
            });
            res.json(produto);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao alterar o custo do CA' });
        }
    },

    // Upload de imagens
    uploadImagem: async (req, res) => {
        try {
            const { id } = req.params;
            const files = req.files;

            if (!files || files.length === 0) {
                return res.status(400).json({ error: 'Nenhuma imagem enviada' });
            }

            // Buscar maior ordem existente para continuar a sequência
            const ultimaImagem = await prisma.produtoImagem.findFirst({
                where: { produtoId: id },
                orderBy: { ordem: 'desc' },
                select: { ordem: true }
            });
            const ordemBase = (ultimaImagem?.ordem ?? -1) + 1;

            const temPrincipal = await prisma.produtoImagem.findFirst({
                where: { produtoId: id, principal: true }
            });

            const novasImagens = await Promise.all(files.map(async (file, index) => {
                const relativePath = `/uploads/produtos/${id}/${file.filename}`;

                return prisma.produtoImagem.create({
                    data: {
                        produtoId: id,
                        url: relativePath,
                        principal: !temPrincipal && index === 0,
                        ordem: ordemBase + index
                    }
                });
            }));

            res.json(novasImagens);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao fazer upload' });
        }
    },

    // Remover imagem
    removerImagem: async (req, res) => {
        try {
            const { id } = req.params; // ID da IMAGEM
            const imagem = await prisma.produtoImagem.findUnique({ where: { id } });

            if (!imagem) return res.status(404).json({ error: 'Imagem não encontrada' });

            // Remove arquivo físico
            const filePath = path.join(__dirname, '..', imagem.url);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            await prisma.produtoImagem.delete({ where: { id } });

            res.json({ message: 'Imagem removida com sucesso' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao remover imagem' });
        }
    },

    // Definir imagem principal
    definirPrincipal: async (req, res) => {
        try {
            const { id, imagemId } = req.params; // ID do Produto, ID da Imagem

            // Remove principal de todas
            await prisma.produtoImagem.updateMany({
                where: { produtoId: id },
                data: { principal: false }
            });

            // Define nova principal
            await prisma.produtoImagem.update({
                where: { id: imagemId },
                data: { principal: true }
            });

            res.json({ message: 'Imagem principal atualizada' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao definir imagem principal' });
        }
    },

    // Ativar/Inativar produto (controle 100% do app — o sync do CA não mexe mais no ativo)
    alterarStatus: async (req, res) => {
        try {
            const { id } = req.params;
            const ativo = req.body?.ativo === true || req.body?.ativo === 'true';

            const produto = await prisma.produto.update({
                where: { id },
                data: { ativo }
            });

            res.json(produto);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao atualizar status' });
        }
    },

    // Reordenar imagens (recebe array de IDs na ordem desejada)
    reordenarImagens: async (req, res) => {
        try {
            const { id } = req.params;
            const { ordem } = req.body; // Array de IDs na ordem desejada

            if (!Array.isArray(ordem) || ordem.length === 0) {
                return res.status(400).json({ error: 'Array de ordem é obrigatório' });
            }

            await Promise.all(
                ordem.map((imagemId, index) =>
                    prisma.produtoImagem.update({
                        where: { id: imagemId },
                        data: { ordem: index }
                    })
                )
            );

            res.json({ message: 'Ordem atualizada com sucesso' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao reordenar imagens' });
        }
    },

    // Listar categorias CA distintas (campo categoria do Produto)
    categoriasCA: async (req, res) => {
        try {
            const result = await prisma.produto.findMany({
                where: { categoria: { not: null } },
                select: { categoria: true },
                distinct: ['categoria'],
                orderBy: { categoria: 'asc' }
            });
            res.json(result.map(r => r.categoria).filter(Boolean));
        } catch (error) {
            console.error('Erro ao listar categorias CA:', error);
            res.status(500).json({ error: 'Erro ao listar categorias.' });
        }
    }
};

module.exports = produtoController;
