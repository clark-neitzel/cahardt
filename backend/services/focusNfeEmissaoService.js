// Emissão de NF-e de venda pelo próprio app via Focus NFe.
// Perfis fiscais extraídos das notas reais do Conta Azul (backend/docs/focus-nfe-api.md, seção 12):
//   - destinatário CNPJ  → natOp "Venda de Mercadorias / Produtos", CSOSN 101 + crédito Simples
//   - destinatário CPF   → natOp "Venda a Nao Contribuinte", consumidor final, CSOSN 102
//   - produto de revenda → CFOP 5102 (+CEST); produção própria → CFOP 5101
//   - cliente em OUTRA UF (interestadual) → CFOP 6102/6101 e local_destino 2 (idDest interestadual);
//     sem isso a SEFAZ rejeita (idDest incompatível com a UF de destino). Ref.: nota real 84501 do CA (SC→PR, CFOP 6101).
const prisma = require('../config/database');
const focusNfe = require('./focusNfeService');

const EMITENTE = {
    cnpj_emitente: '08766459000102',
    nome_emitente: 'HARDT DOCES E SALGADOS LTDA',
    nome_fantasia_emitente: 'HARDT DOCES E SALGADOS LTDA',
    logradouro_emitente: 'R 15 DE OUTUBRO',
    numero_emitente: '170',
    bairro_emitente: 'RIO BONITO',
    municipio_emitente: 'Joinville',
    uf_emitente: 'SC',
    cep_emitente: '89239700',
    inscricao_estadual_emitente: '255372744',
    regime_tributario_emitente: 1, // Simples Nacional (CRT=1 nas notas do CA)
};

const CONFIG_PADRAO = {
    aliquotaCreditoSimples: 3.82, // pCredSN das notas reais — muda com a faixa do Simples
    ncmPadrao: '19022000',
    textosLegais: [
        'DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL.',
        'NAO GERA DIREITO A CREDITO FISCAL DE IPI.',
    ],
};

async function getConfig() {
    const cfg = await prisma.appConfig.findUnique({ where: { key: 'focus_nfe_config' } });
    return { ...CONFIG_PADRAO, ...(cfg?.value || {}) };
}

const round2 = (n) => Math.round(n * 100) / 100;
const fmtBR = (n) => n.toFixed(2).replace('.', ',');

// Data/hora de Brasília REAL etiquetada -03:00 (UTC puro etiquetado dá rejeição 703).
function agoraBrasilia() {
    return new Date(Date.now() - 3 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, '-03:00');
}

// tPag da NF-e a partir do tipo de pagamento/condição do pedido (padrão das notas do CA: 01/15).
function formaPagamento(pedido) {
    const tipo = (pedido.tipoPagamento || '').toUpperCase();
    const cond = (pedido.nomeCondicaoPagamento || '').toLowerCase();
    if (tipo === 'PIX') return '17';
    if (tipo === 'CARTAO') return '03';
    if (cond.includes('boleto')) return '15';
    return '01'; // dinheiro/prazo — igual à maioria das notas do CA
}

/**
 * Monta o JSON da NF-e de venda a partir do pedido (com cliente.fiscal e itens.produto carregados).
 * Lança Error com mensagem AMIGÁVEL quando falta cadastro (a UI mostra ao usuário o que corrigir).
 */
async function montarNotaVenda(pedido) {
    const cfg = await getConfig();
    const cliente = pedido.cliente;
    if (!cliente) throw new Error('Pedido sem cliente.');

    const doc = String(cliente.Documento || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    if (!doc) throw new Error(`Cliente "${cliente.Nome}" sem CPF/CNPJ no cadastro — preencha para emitir a nota.`);
    const ehCPF = /^\d{11}$/.test(doc);

    const faltando = [];
    if (!cliente.End_Logradouro) faltando.push('endereço (rua)');
    if (!cliente.End_Numero) faltando.push('número');
    if (!cliente.End_Bairro) faltando.push('bairro');
    if (!cliente.End_Cidade) faltando.push('cidade');
    if (!cliente.End_Estado) faltando.push('UF');
    if (!cliente.End_CEP) faltando.push('CEP');
    if (faltando.length) throw new Error(`Cliente "${cliente.Nome}" com cadastro incompleto para a nota: falta ${faltando.join(', ')}.`);

    const ie = String(cliente.fiscal?.inscricaoEstadual || '').replace(/\D/g, '');

    // Operação interestadual: cliente em UF diferente da do emitente (SC).
    // Troca o CFOP (5xxx interno → 6xxx interestadual) e o local_destino (1 → 2);
    // sem o idDest=2 a SEFAZ rejeita ("idDest incompatível com a UF de destino").
    const interestadual = String(cliente.End_Estado || '').trim().toUpperCase() !== EMITENTE.uf_emitente;

    const destinatario = ehCPF
        ? {
            nome_destinatario: cliente.Nome,
            cpf_destinatario: doc,
            indicador_inscricao_estadual_destinatario: 9, // não contribuinte
        }
        : {
            nome_destinatario: cliente.Nome,
            cnpj_destinatario: doc,
            // Com IE → contribuinte (1). Sem IE → isento (2), como as notas de MEI do CA.
            ...(ie
                ? { indicador_inscricao_estadual_destinatario: 1, inscricao_estadual_destinatario: ie }
                : { indicador_inscricao_estadual_destinatario: 2 }),
        };

    const itensValidos = (pedido.itens || []).filter(i => Number(i.quantidade) > 0);
    if (!itensValidos.length) throw new Error('Pedido sem itens com quantidade.');

    let total = 0;
    const items = itensValidos.map((item, idx) => {
        const q = Number(item.quantidade);
        const v = Number(item.valor);
        const bruto = round2(q * v);
        total = round2(total + bruto);
        const revenda = !!item.produto?.nfeRevenda;
        const ncm = String(item.produto?.ncm || '').replace(/\D/g, '') || cfg.ncmPadrao;
        return {
            numero_item: idx + 1,
            codigo_produto: item.produto?.codigo || item.produtoId,
            descricao: item.produto?.nome || item.descricao || 'PRODUTO',
            cfop: revenda ? (interestadual ? '6102' : '5102') : (interestadual ? '6101' : '5101'),
            codigo_ncm: ncm,
            ...(revenda && item.produto?.nfeCest ? { cest: item.produto.nfeCest } : {}),
            unidade_comercial: item.produto?.unidade || 'PT',
            unidade_tributavel: item.produto?.unidade || 'PT',
            quantidade_comercial: q,
            quantidade_tributavel: q,
            valor_unitario_comercial: v,
            valor_unitario_tributavel: v,
            valor_bruto: bruto,
            inclui_no_total: 1,
            icms_origem: 0,
            // IPI omitido de propósito: mandar só o CST 99 gera IPITrib inválido no schema
            // da SEFAZ (testado 23/07); sem IPI a nota autoriza igual (valores todos zero).
            pis_situacao_tributaria: '49',
            cofins_situacao_tributaria: '49',
            ...(ehCPF
                ? { icms_situacao_tributaria: '102' }
                : {
                    icms_situacao_tributaria: '101',
                    icms_aliquota_credito_simples: cfg.aliquotaCreditoSimples,
                    icms_valor_credito_simples: round2(bruto * cfg.aliquotaCreditoSimples / 100),
                }),
        };
    });

    // Dados adicionais — mesmas partes de hoje (app) + textos legais (que o CA acrescentava).
    // Separador '#': a Focus grava '\n' como literal no XML; a DANFE do app converte '#' em linha.
    const linhas = [`Referente ao pedido #${pedido.numero}`];
    if (pedido.observacoes) linhas.push(String(pedido.observacoes).replace(/\r?\n/g, '#').trim());
    const promos = itensValidos.filter(i => i.emPromocao && i.nomePromocao);
    if (promos.length) linhas.push(`PROMO - ${promos.map(i => i.produto?.nome).filter(Boolean).join('; ')}`);
    const cond = (pedido.nomeCondicaoPagamento || '').toLowerCase();
    if (cond.includes('vendedor respons')) linhas.push('Cobrança: Vendedor responsável');
    if (cond.includes('escrit') && cond.includes('respons')) linhas.push('Cobrança: Escritório responsável');
    linhas.push(...cfg.textosLegais);
    if (!ehCPF) {
        const credTotal = round2(items.reduce((s, it) => s + (it.icms_valor_credito_simples || 0), 0));
        linhas.push(`PERMITE O APROVEITAMENTO DO CREDITO DE ICMS NO VALOR DE R$ ${fmtBR(credTotal)}, CORRESPONDENTE A ALIQUOTA DE ${String(cfg.aliquotaCreditoSimples).replace('.', ',')}%, NOS TERMOS DO ART. 23 DA LC 123/2006.`);
    }

    const agora = agoraBrasilia();
    return {
        natureza_operacao: ehCPF ? 'Venda a Nao Contribuinte' : 'Venda de Mercadorias / Produtos',
        data_emissao: agora,
        data_entrada_saida: agora,
        tipo_documento: 1,
        finalidade_emissao: 1,
        local_destino: interestadual ? 2 : 1,
        consumidor_final: ehCPF ? 1 : 0,
        presenca_comprador: 1,
        ...EMITENTE,
        ...destinatario,
        logradouro_destinatario: cliente.End_Logradouro,
        numero_destinatario: String(cliente.End_Numero),
        ...(cliente.End_Complemento ? { complemento_destinatario: cliente.End_Complemento } : {}),
        bairro_destinatario: cliente.End_Bairro,
        municipio_destinatario: cliente.End_Cidade,
        uf_destinatario: cliente.End_Estado,
        cep_destinatario: String(cliente.End_CEP).replace(/\D/g, ''),
        pais_destinatario: 'Brasil',
        ...(cliente.Telefone ? { telefone_destinatario: String(cliente.Telefone).replace(/\D/g, '') } : {}),
        modalidade_frete: 0, // por conta do emitente, como todas as notas do CA
        valor_frete: 0,
        valor_seguro: 0,
        valor_desconto: 0,
        valor_outras_despesas: 0,
        valor_produtos: total,
        valor_total: total,
        formas_pagamento: [{ forma_pagamento: formaPagamento(pedido), valor_pagamento: total }],
        informacoes_adicionais_contribuinte: linhas.filter(Boolean).join('#'),
        items,
    };
}

const MAPA_STATUS = {
    autorizado: 'AUTORIZADO',
    processando_autorizacao: 'PROCESSANDO',
    erro_autorizacao: 'ERRO',
    cancelado: 'CANCELADO',
    denegado: 'DENEGADO',
};

// Nota AUTORIZADA em PRODUÇÃO → pedido vira FATURADO na tela de pedidos (o app é o
// emissor agora; antes quem marcava era o retorno do Conta Azul). Homologação não marca.
// Só nota de VENDA fatura — devolução não mexe no status do pedido.
async function marcarPedidoFaturado(nota) {
    if (nota.status !== 'AUTORIZADO' || nota.ambiente !== 'producao') return;
    if (nota.tipo && nota.tipo !== 'VENDA') return;
    try {
        await prisma.pedido.update({
            where: { id: nota.pedidoId },
            data: { situacaoCA: 'FATURADO', nfeConsultadoEm: new Date() },
        });
    } catch (e) {
        console.error('[FocusNFe] Falha ao marcar pedido faturado:', e.message);
    }
}

function aplicarRetornoFocus(dadosFocus) {
    return {
        status: MAPA_STATUS[dadosFocus.status] || 'PROCESSANDO',
        numero: dadosFocus.numero ? parseInt(dadosFocus.numero, 10) : undefined,
        serie: dadosFocus.serie ? parseInt(dadosFocus.serie, 10) : undefined,
        // webhook manda a chave com prefixo "NFe..." — guardar só os 44 dígitos
        chave: (dadosFocus.chave_nfe || dadosFocus.chave || '').replace(/\D/g, '') || undefined,
        mensagemSefaz: dadosFocus.mensagem_sefaz || undefined,
        caminhoXml: dadosFocus.caminho_xml_nota_fiscal || undefined,
        caminhoDanfe: dadosFocus.caminho_danfe || undefined,
    };
}

/**
 * Emite (ou reemite após rejeição) a NF-e de venda de um pedido.
 * ref por ambiente ('nf-h-...' / 'nf-p-...') para o teste de homologação nunca
 * prender a ref que a produção vai usar.
 */
async function emitirVenda(pedidoId) {
    const pedido = await prisma.pedido.findUnique({
        where: { id: pedidoId },
        include: { cliente: { include: { fiscal: true } }, itens: { include: { produto: true } } },
    });
    if (!pedido) throw new Error('Pedido não encontrado.');
    if (pedido.especial) throw new Error('Pedido especial não gera nota fiscal.');
    if (pedido.bonificacao) throw new Error('Bonificação ainda não é emitida pelo app.');
    if (!pedido.numero) throw new Error('Pedido ainda sem número de venda.');
    if (pedido.nfeChave) throw new Error(`Este pedido já tem NF-e emitida pelo Conta Azul (nº ${pedido.nfeNumero || '—'}).`);

    // Pedido da era Conta Azul (anterior a hoje) sem chave em cache: conferir no CA antes de
    // emitir — o app só guardava a chave quando alguém imprimia a DANFE, então "sem nota" aqui
    // pode ser nota que o CA emitiu e nós não sabemos. Fecha o risco de nota em DOBRO enquanto
    // o backup dos XMLs não termina de vincular tudo.
    const ontem = new Date(Date.now() - 24 * 3600 * 1000);
    if (pedido.idVendaContaAzul && pedido.dataVenda < ontem) {
        try {
            const pedidoController = require('../controllers/pedidoController');
            const notaCA = await pedidoController._localizarNotaFiscal(pedido);
            if (notaCA?.chave_acesso) {
                throw new Error(`Este pedido já tem NF-e emitida pelo Conta Azul (nº ${notaCA.numero_nota || '—'}) — encontrada agora na conferência.`);
            }
        } catch (e) {
            if (!e.statusCode || (e.statusCode !== 404 && e.statusCode !== 400)) throw e;
            // 404 = CA confirma que não há nota → pode emitir; 400 = sem venda no CA → pode emitir
        }
    }

    const ambiente = focusNfe.ambiente();
    const ref = `nf-${ambiente === 'producao' ? 'p' : 'h'}-${pedido.id}`;

    const existente = await prisma.notaFiscalApp.findUnique({ where: { ref } });
    if (existente && ['AUTORIZADO', 'PROCESSANDO'].includes(existente.status)) {
        throw new Error(`Nota deste pedido já está "${existente.status}" — não é preciso emitir de novo.`);
    }

    const nota = await montarNotaVenda(pedido);
    const registro = existente
        ? await prisma.notaFiscalApp.update({ where: { ref }, data: { status: 'PROCESSANDO', mensagemSefaz: null, payloadEnviado: nota } })
        : await prisma.notaFiscalApp.create({ data: { ref, ambiente, pedidoId: pedido.id, payloadEnviado: nota } });

    const { httpStatus, data } = await focusNfe.emitir(ref, nota);
    if (httpStatus >= 400) {
        // 422 de validação da Focus (não chegou na SEFAZ) — guardar o motivo e devolver amigável
        const msg = data?.mensagem || data?.erros?.map?.(e => e.mensagem).join('; ') || JSON.stringify(data).slice(0, 300);
        await prisma.notaFiscalApp.update({ where: { ref }, data: { status: 'ERRO', mensagemSefaz: `Validação Focus: ${msg}` } });
        throw new Error(`Nota recusada na validação: ${msg}`);
    }
    const atualizada = await prisma.notaFiscalApp.update({ where: { ref }, data: aplicarRetornoFocus(data) });
    await marcarPedidoFaturado(atualizada);
    return atualizada;
}

/** Consome eventos do webhook ainda não processados, atualizando as notas correspondentes. */
async function sincronizarEventos() {
    const eventos = await prisma.focusNfeEvento.findMany({ where: { processado: false }, orderBy: { id: 'asc' }, take: 100 });
    for (const ev of eventos) {
        try {
            if (ev.ref) {
                const nota = await prisma.notaFiscalApp.findUnique({ where: { ref: ev.ref } });
                if (nota) {
                    const payload = typeof ev.payload === 'object' ? ev.payload : {};
                    const atualizada = await prisma.notaFiscalApp.update({ where: { ref: ev.ref }, data: aplicarRetornoFocus({ ...payload, status: ev.status || payload.status }) });
                    await marcarPedidoFaturado(atualizada);
                }
            }
            await prisma.focusNfeEvento.update({ where: { id: ev.id }, data: { processado: true } });
        } catch (e) {
            console.error(`[FocusNFe] Falha ao processar evento ${ev.id}:`, e.message);
        }
    }
    // Reconciliação (auto-cura): nota de PRODUÇÃO autorizada cujo pedido não está FATURADO
    // (ex.: evento consumido por réplica com código antigo durante um deploy) — corrige aqui.
    // `not` do Prisma exclui null — por isso o OR explícito.
    try {
        // higiene: chaves gravadas com o prefixo "NFe" (webhooks antigos) → só dígitos
        const comPrefixo = await prisma.notaFiscalApp.findMany({ where: { chave: { startsWith: 'NFe' } } });
        for (const n of comPrefixo) {
            await prisma.notaFiscalApp.update({ where: { id: n.id }, data: { chave: n.chave.replace(/\D/g, '') } });
        }
        const desalinhadas = await prisma.notaFiscalApp.findMany({
            where: {
                status: 'AUTORIZADO',
                ambiente: 'producao',
                pedido: { OR: [{ situacaoCA: null }, { situacaoCA: { not: 'FATURADO' } }] },
            },
        });
        for (const n of desalinhadas) await marcarPedidoFaturado(n);
    } catch (e) {
        console.error('[FocusNFe] Falha na reconciliação de faturados:', e.message);
    }
    return eventos.length;
}

/** Consulta a Focus e atualiza o registro (fallback quando o webhook não chegou). */
async function consultarAtualizar(notaId) {
    const nota = await prisma.notaFiscalApp.findUnique({ where: { id: notaId } });
    if (!nota) throw new Error('Nota não encontrada.');
    const { httpStatus, data } = await focusNfe.consultar(nota.ref);
    if (httpStatus === 404) {
        // Focus não conhece a ref. Se a nota está "PROCESSANDO" há mais de 5 minutos, o envio
        // se perdeu (rede/deploy caiu entre gravar PROCESSANDO e o POST chegar na Focus) —
        // sem este tratamento ela ficava presa para sempre: o 404 não mudava nada e a trava
        // de idempotência da emissão recusava reemitir. Vira ERRO para liberar a reemissão.
        const IDADE_MINIMA_MS = 5 * 60 * 1000;
        if (nota.status === 'PROCESSANDO' && Date.now() - nota.atualizadoEm.getTime() > IDADE_MINIMA_MS) {
            return prisma.notaFiscalApp.update({
                where: { id: nota.id },
                data: {
                    status: 'ERRO',
                    mensagemSefaz: 'A emissão não chegou à Focus NFe (falha de rede ou reinício do servidor durante o envio). Nenhuma nota foi gerada — clique em Emitir para tentar novamente.',
                },
            });
        }
        return nota; // recém-enviada — dar tempo do POST da emissão concluir
    }
    const atualizada = await prisma.notaFiscalApp.update({ where: { id: nota.id }, data: aplicarRetornoFocus(data) });
    await marcarPedidoFaturado(atualizada);
    return atualizada;
}

/**
 * Emite a NF-e de DEVOLUÇÃO de venda a partir de uma Devolucao registrada no app.
 * Perfil espelhado da nota real 84808 do CA: natOp "Devolucao de venda", finalidade 4,
 * tipo entrada (0), CFOP 1201 (produção própria) / 1202 (revenda), PIS/COFINS CST 99,
 * pagamento "90 - sem pagamento", referenciando a chave da NF-e original da venda.
 * SÓ para devolução de pedido COM nota (tipo CONTA_AZUL) — pedido especial não tem NF.
 */
async function emitirDevolucao(devolucaoId) {
    const dev = await prisma.devolucao.findUnique({
        where: { id: devolucaoId },
        include: {
            itens: { include: { produto: true } },
            cliente: { include: { fiscal: true } },
            pedidoOriginal: true,
        },
    });
    if (!dev) throw new Error('Devolução não encontrada.');
    if (dev.status !== 'ATIVA') throw new Error('Devolução revertida não gera nota fiscal.');
    if (dev.tipo === 'ESPECIAL' || dev.pedidoOriginal?.especial) {
        throw new Error('Devolução de pedido especial não gera nota fiscal (pedido sem nota).');
    }
    if (dev.notaDevolucaoCA) {
        throw new Error(`Esta devolução já tem NF de devolução do Conta Azul (nº ${dev.notaDevolucaoCA}).`);
    }
    const pedido = dev.pedidoOriginal;

    // Nota ORIGINAL da venda (obrigatória como referência na devolução)
    const notaVendaApp = await notaAutorizadaDoPedido(pedido.id);
    const chaveOriginal = String(notaVendaApp?.chave || pedido.nfeChave || '').replace(/\D/g, '');
    const numeroOriginal = notaVendaApp?.numero || pedido.nfeNumero;
    if (!chaveOriginal) {
        throw new Error('NF-e original da venda não encontrada — a nota da venda precisa existir antes da devolução.');
    }

    const ambiente = focusNfe.ambiente();
    const ref = `nfd-${ambiente === 'producao' ? 'p' : 'h'}-${dev.id}`;
    const existente = await prisma.notaFiscalApp.findUnique({ where: { ref } });
    if (existente && ['AUTORIZADO', 'PROCESSANDO'].includes(existente.status)) {
        throw new Error(`Nota de devolução deste registro já está "${existente.status}".`);
    }

    const cfg = await getConfig();
    const cliente = dev.cliente;
    const doc = String(cliente?.Documento || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    if (!doc) throw new Error(`Cliente "${cliente?.Nome}" sem CPF/CNPJ no cadastro.`);
    const ehCPF = /^\d{11}$/.test(doc);
    const ie = String(cliente.fiscal?.inscricaoEstadual || '').replace(/\D/g, '');
    const faltando = [];
    if (!cliente.End_Logradouro) faltando.push('endereço (rua)');
    if (!cliente.End_Numero) faltando.push('número');
    if (!cliente.End_Bairro) faltando.push('bairro');
    if (!cliente.End_Cidade) faltando.push('cidade');
    if (!cliente.End_Estado) faltando.push('UF');
    if (!cliente.End_CEP) faltando.push('CEP');
    if (faltando.length) throw new Error(`Cliente "${cliente.Nome}" com cadastro incompleto: falta ${faltando.join(', ')}.`);

    // Devolução interestadual (entrada de UF diferente de SC): CFOP 2xxx e local_destino 2.
    const interestadual = String(cliente.End_Estado || '').trim().toUpperCase() !== EMITENTE.uf_emitente;

    const itensValidos = (dev.itens || []).filter(i => Number(i.quantidade) > 0);
    if (!itensValidos.length) throw new Error('Devolução sem itens com quantidade.');

    let total = 0;
    const items = itensValidos.map((item, idx) => {
        const q = Number(item.quantidade);
        const v = Number(item.valorUnitario);
        const bruto = round2(q * v);
        total = round2(total + bruto);
        const revenda = !!item.produto?.nfeRevenda;
        return {
            numero_item: idx + 1,
            codigo_produto: item.produto?.codigo || item.produtoId,
            descricao: item.produto?.nome || 'PRODUTO',
            cfop: revenda ? (interestadual ? '2202' : '1202') : (interestadual ? '2201' : '1201'), // entrada por devolução (espelho de 6102/6101/5102/5101)
            codigo_ncm: String(item.produto?.ncm || '').replace(/\D/g, '') || cfg.ncmPadrao,
            ...(revenda && item.produto?.nfeCest ? { cest: item.produto.nfeCest } : {}),
            unidade_comercial: item.produto?.unidade || 'PT',
            unidade_tributavel: item.produto?.unidade || 'PT',
            quantidade_comercial: q,
            quantidade_tributavel: q,
            valor_unitario_comercial: v,
            valor_unitario_tributavel: v,
            valor_bruto: bruto,
            inclui_no_total: 1,
            icms_origem: 0,
            pis_situacao_tributaria: '99', // na devolução o CA usava 99 (venda usa 49)
            cofins_situacao_tributaria: '99',
            ...(ehCPF
                ? { icms_situacao_tributaria: '102' }
                : {
                    icms_situacao_tributaria: '101',
                    icms_aliquota_credito_simples: cfg.aliquotaCreditoSimples,
                    icms_valor_credito_simples: round2(bruto * cfg.aliquotaCreditoSimples / 100),
                }),
        };
    });

    const dataOrig = notaVendaApp?.criadoEm || pedido.dataVenda;
    const dataOrigBR = dataOrig ? new Date(dataOrig).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null;
    const linhas = [
        `DEVOLUCAO REFERENTE SUA NF N 1-${numeroOriginal || ''}${dataOrigBR ? ` DE ${dataOrigBR}` : ''}`.trim(),
        `Referente ao pedido #${pedido.numero}`,
        ...cfg.textosLegais,
    ];
    if (!ehCPF) {
        const credTotal = round2(items.reduce((s, it) => s + (it.icms_valor_credito_simples || 0), 0));
        linhas.push(`PERMITE O APROVEITAMENTO DO CREDITO DE ICMS NO VALOR DE R$ ${fmtBR(credTotal)}, CORRESPONDENTE A ALIQUOTA DE ${String(cfg.aliquotaCreditoSimples).replace('.', ',')}%, NOS TERMOS DO ART. 23 DA LC 123/2006.`);
    }

    const agora = agoraBrasilia();
    const nota = {
        natureza_operacao: 'Devolucao de venda',
        data_emissao: agora,
        data_entrada_saida: agora,
        tipo_documento: 0, // ENTRADA
        finalidade_emissao: 4, // devolução
        local_destino: interestadual ? 2 : 1,
        consumidor_final: ehCPF ? 1 : 0,
        presenca_comprador: 1,
        ...EMITENTE,
        nome_destinatario: cliente.Nome,
        ...(ehCPF
            ? { cpf_destinatario: doc, indicador_inscricao_estadual_destinatario: 9 }
            : {
                cnpj_destinatario: doc,
                ...(ie
                    ? { indicador_inscricao_estadual_destinatario: 1, inscricao_estadual_destinatario: ie }
                    : { indicador_inscricao_estadual_destinatario: 2 }),
            }),
        logradouro_destinatario: cliente.End_Logradouro,
        numero_destinatario: String(cliente.End_Numero),
        ...(cliente.End_Complemento ? { complemento_destinatario: cliente.End_Complemento } : {}),
        bairro_destinatario: cliente.End_Bairro,
        municipio_destinatario: cliente.End_Cidade,
        uf_destinatario: cliente.End_Estado,
        cep_destinatario: String(cliente.End_CEP).replace(/\D/g, ''),
        pais_destinatario: 'Brasil',
        modalidade_frete: 0,
        valor_frete: 0,
        valor_seguro: 0,
        valor_desconto: 0,
        valor_outras_despesas: 0,
        valor_produtos: total,
        valor_total: total,
        formas_pagamento: [{ forma_pagamento: '90', valor_pagamento: 0 }], // sem pagamento (devolução)
        notas_referenciadas: [{ chave_nfe: chaveOriginal }],
        informacoes_adicionais_contribuinte: linhas.filter(Boolean).join('#'),
        items,
    };

    const registro = existente
        ? await prisma.notaFiscalApp.update({ where: { ref }, data: { status: 'PROCESSANDO', mensagemSefaz: null, payloadEnviado: nota } })
        : await prisma.notaFiscalApp.create({ data: { ref, ambiente, tipo: 'DEVOLUCAO', pedidoId: pedido.id, payloadEnviado: nota } });

    const { httpStatus, data } = await focusNfe.emitir(ref, nota);
    if (httpStatus >= 400) {
        const msg = data?.mensagem || data?.erros?.map?.(e => e.mensagem).join('; ') || JSON.stringify(data).slice(0, 300);
        await prisma.notaFiscalApp.update({ where: { ref }, data: { status: 'ERRO', mensagemSefaz: `Validação Focus: ${msg}` } });
        throw new Error(`Nota de devolução recusada na validação: ${msg}`);
    }
    return prisma.notaFiscalApp.update({ where: { ref }, data: aplicarRetornoFocus(data) });
}

/** Nota do app (ambiente atual) AUTORIZADA de um pedido — usada pela DANFE da tela de pedidos. */
async function notaAutorizadaDoPedido(pedidoId) {
    const focusNfeSvc = require('./focusNfeService');
    const ref = `nf-${focusNfeSvc.ambiente() === 'producao' ? 'p' : 'h'}-${pedidoId}`;
    const nota = await prisma.notaFiscalApp.findUnique({ where: { ref } });
    return nota && nota.status === 'AUTORIZADO' ? nota : null;
}

module.exports = { montarNotaVenda, emitirVenda, emitirDevolucao, sincronizarEventos, consultarAtualizar, getConfig, notaAutorizadaDoPedido };
