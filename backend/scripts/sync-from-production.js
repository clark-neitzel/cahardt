/**
 * Script para puxar dados da produção via API e popular o banco local.
 *
 * Uso: node scripts/sync-from-production.js
 *
 * Requer: banco local configurado e migrations aplicadas.
 */

const { PrismaClient } = require('@prisma/client');

const PROD_URL = 'https://cahardt-hardt-backend.xrqvlq.easypanel.host';
const LOGIN = 'Clarkson';
const SENHA = '1234';

const prisma = new PrismaClient();
let TOKEN = '';

// ── helpers ──────────────────────────────────────────────────────────
async function login() {
  const res = await fetch(`${PROD_URL}/api/auth/app-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: LOGIN, senha: SENHA }),
  });
  if (!res.ok) throw new Error(`Login falhou: ${res.status} ${await res.text()}`);
  const data = await res.json();
  TOKEN = data.token;
  console.log(`✓ Login OK — usuário: ${data.user.nome}`);
  return data;
}

async function api(path) {
  const res = await fetch(`${PROD_URL}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`✗ Erro GET ${path}: ${res.status} — ${text.slice(0, 200)}`);
    return null;
  }
  return res.json();
}

// Busca paginada — retorna todos os registros de todas as páginas
async function apiPaginated(basePath, pageSize = 50) {
  const all = [];
  let page = 1;
  while (true) {
    const sep = basePath.includes('?') ? '&' : '?';
    const data = await api(`${basePath}${sep}page=${page}&limit=${pageSize}`);
    if (!data) break;
    const items = data.data || [];
    all.push(...items);
    const totalPages = data.meta?.totalPages || data.totalPages || 1;
    if (page >= totalPages) break;
    page++;
  }
  return all;
}

function log(label, count) {
  console.log(`  ✓ ${label}: ${count} registros`);
}

// ── sync functions (order matters for FK constraints) ────────────────

async function syncVendedores() {
  const data = await api('/api/vendedores');
  if (!data) return;
  const items = Array.isArray(data) ? data : data.vendedores || [];
  for (const v of items) {
    await prisma.vendedor.upsert({
      where: { id: v.id },
      update: {
        nome: v.nome,
        email: v.email,
        idLegado: v.idLegado || null,
        flexMensal: v.flexMensal || 0,
        flexDisponivel: v.flexDisponivel || 0,
        maxDescontoFlex: v.maxDescontoFlex || 100,
        ativo: v.ativo !== false,
        login: v.login || null,
        senha: v.senha || null,
        permissoes: v.permissoes || null,
      },
      create: {
        id: v.id,
        nome: v.nome,
        email: v.email,
        idLegado: v.idLegado || null,
        flexMensal: v.flexMensal || 0,
        flexDisponivel: v.flexDisponivel || 0,
        maxDescontoFlex: v.maxDescontoFlex || 100,
        ativo: v.ativo !== false,
        login: v.login || null,
        senha: v.senha || null,
        permissoes: v.permissoes || null,
      },
    });
  }
  log('Vendedores', items.length);
}

async function syncCategoriasProduto() {
  const data = await api('/api/categorias-produto');
  if (!data || !Array.isArray(data)) return;
  for (const c of data) {
    await prisma.categoriaProduto.upsert({
      where: { id: c.id },
      update: { nome: c.nome, descricao: c.descricao, ordemExibicao: c.ordemExibicao || 0, corTag: c.corTag, ativo: c.ativo !== false },
      create: { id: c.id, nome: c.nome, descricao: c.descricao, ordemExibicao: c.ordemExibicao || 0, corTag: c.corTag, ativo: c.ativo !== false },
    });
  }
  log('CategoriasProduto', data.length);
}

async function syncCategoriasCliente() {
  const data = await api('/api/categorias-cliente');
  if (!data || !Array.isArray(data)) return;
  for (const c of data) {
    await prisma.categoriaCliente.upsert({
      where: { id: c.id },
      update: { nome: c.nome, descricao: c.descricao, cicloPadraoDias: c.cicloPadraoDias || 7, ativo: c.ativo !== false },
      create: { id: c.id, nome: c.nome, descricao: c.descricao, cicloPadraoDias: c.cicloPadraoDias || 7, ativo: c.ativo !== false },
    });
  }
  log('CategoriasCliente', data.length);
}

async function syncProdutos() {
  const items = await apiPaginated('/api/produtos', 100);
  // Pass 1: insert without self-ref (produtoSubstitutoId)
  for (const p of items) {
    const base = {
      contaAzulId: p.contaAzulId, codigo: p.codigo, nome: p.nome,
      valorVenda: p.valorVenda, unidade: p.unidade,
      estoqueDisponivel: p.estoqueDisponivel || 0, estoqueReservado: p.estoqueReservado || 0,
      estoqueTotal: p.estoqueTotal || 0, estoqueMinimo: p.estoqueMinimo || 0,
      categoria: p.categoria, descricao: p.descricao, ean: p.ean, ncm: p.ncm,
      status: p.status, ativo: p.ativo !== false, custoMedio: p.custoMedio,
      pesoLiquido: p.pesoLiquido, categoriaProdutoId: p.categoriaProdutoId || null,
      produtoSubstitutoId: null, // defer self-ref
      permiteRecomendacao: p.permiteRecomendacao !== false,
      prioridadeRecomendacao: p.prioridadeRecomendacao || 1,
    };
    await prisma.produto.upsert({
      where: { id: p.id },
      update: base,
      create: { id: p.id, ...base },
    });
  }
  // Pass 2: set self-references
  const withSubst = items.filter(p => p.produtoSubstitutoId);
  for (const p of withSubst) {
    await prisma.produto.update({
      where: { id: p.id },
      data: { produtoSubstitutoId: p.produtoSubstitutoId },
    }).catch(() => {});
  }
  log('Produtos', items.length);
}

async function syncClientes() {
  const items = await apiPaginated('/api/clientes', 100);
  for (const c of items) {
    await prisma.cliente.upsert({
      where: { UUID: c.UUID },
      update: {
        Nome: c.Nome,
        NomeFantasia: c.NomeFantasia,
        Tipo_Pessoa: c.Tipo_Pessoa,
        Documento: c.Documento,
        Email: c.Email,
        Telefone: c.Telefone,
        Ativo: c.Ativo !== false,
        Perfis: c.Perfis,
        Perfil_Filtro: c.Perfil_Filtro,
        End_Logradouro: c.End_Logradouro,
        End_Numero: c.End_Numero,
        End_Complemento: c.End_Complemento,
        End_Bairro: c.End_Bairro,
        End_Cidade: c.End_Cidade,
        End_Estado: c.End_Estado,
        End_CEP: c.End_CEP,
        End_Pais: c.End_Pais,
        Codigo: c.Codigo,
        Telefone_Celular: c.Telefone_Celular,
        Telefone_Comercial: c.Telefone_Comercial,
        Dia_de_entrega: c.Dia_de_entrega,
        Dia_de_venda: c.Dia_de_venda,
        Condicao_de_pagamento: c.Condicao_de_pagamento,
        condicoes_pagamento_permitidas: c.condicoes_pagamento_permitidas || [],
        Flex_utilizado: c.Flex_utilizado || 0,
        Ponto_GPS: c.Ponto_GPS,
        Situacao_serasa: c.Situacao_serasa,
        Formas_Atendimento: c.Formas_Atendimento || [],
        idVendedor: c.idVendedor || null,
        categoriaClienteId: c.categoriaClienteId || null,
        cicloCompraPersonalizadoDias: c.cicloCompraPersonalizadoDias || null,
        insightAtivo: c.insightAtivo !== false,
        observacaoComercialFixa: c.observacaoComercialFixa || null,
      },
      create: {
        UUID: c.UUID,
        Nome: c.Nome,
        NomeFantasia: c.NomeFantasia,
        Tipo_Pessoa: c.Tipo_Pessoa,
        Documento: c.Documento,
        Email: c.Email,
        Telefone: c.Telefone,
        Ativo: c.Ativo !== false,
        Perfis: c.Perfis,
        Perfil_Filtro: c.Perfil_Filtro,
        End_Logradouro: c.End_Logradouro,
        End_Numero: c.End_Numero,
        End_Complemento: c.End_Complemento,
        End_Bairro: c.End_Bairro,
        End_Cidade: c.End_Cidade,
        End_Estado: c.End_Estado,
        End_CEP: c.End_CEP,
        End_Pais: c.End_Pais,
        Codigo: c.Codigo,
        Telefone_Celular: c.Telefone_Celular,
        Telefone_Comercial: c.Telefone_Comercial,
        Dia_de_entrega: c.Dia_de_entrega,
        Dia_de_venda: c.Dia_de_venda,
        Condicao_de_pagamento: c.Condicao_de_pagamento,
        condicoes_pagamento_permitidas: c.condicoes_pagamento_permitidas || [],
        Flex_utilizado: c.Flex_utilizado || 0,
        Ponto_GPS: c.Ponto_GPS,
        Situacao_serasa: c.Situacao_serasa,
        Formas_Atendimento: c.Formas_Atendimento || [],
        idVendedor: c.idVendedor || null,
        categoriaClienteId: c.categoriaClienteId || null,
        cicloCompraPersonalizadoDias: c.cicloCompraPersonalizadoDias || null,
        insightAtivo: c.insightAtivo !== false,
        observacaoComercialFixa: c.observacaoComercialFixa || null,
      },
    });
  }
  log('Clientes', items.length);
}

async function syncVeiculos() {
  const data = await api('/api/veiculos');
  if (!data) return;
  const items = Array.isArray(data) ? data : [];
  for (const v of items) {
    await prisma.veiculo.upsert({
      where: { id: v.id },
      update: {
        placa: v.placa,
        modelo: v.modelo,
        documentoUrl: v.documentoUrl,
        ativo: v.ativo !== false,
        seguroVencimento: v.seguroVencimento ? new Date(v.seguroVencimento) : null,
        seguroApolice: v.seguroApolice,
        seguroSeguradora: v.seguroSeguradora,
        capacidadeTanque: v.capacidadeTanque,
        kmMedioSugerido: v.kmMedioSugerido,
        observacoes: v.observacoes,
      },
      create: {
        id: v.id,
        placa: v.placa,
        modelo: v.modelo,
        documentoUrl: v.documentoUrl,
        ativo: v.ativo !== false,
        seguroVencimento: v.seguroVencimento ? new Date(v.seguroVencimento) : null,
        seguroApolice: v.seguroApolice,
        seguroSeguradora: v.seguroSeguradora,
        capacidadeTanque: v.capacidadeTanque,
        kmMedioSugerido: v.kmMedioSugerido,
        observacoes: v.observacoes,
      },
    });
  }
  log('Veículos', items.length);
}

async function syncLeads() {
  const items = await apiPaginated('/api/leads', 100);
  for (const l of items) {
    await prisma.lead.upsert({
      where: { id: l.id },
      update: {
        numero: l.numero,
        nomeEstabelecimento: l.nomeEstabelecimento,
        contato: l.contato,
        whatsapp: l.whatsapp,
        diasVisita: l.diasVisita,
        horarioAtendimento: l.horarioAtendimento,
        horarioEntrega: l.horarioEntrega,
        formasAtendimento: l.formasAtendimento || [],
        pontoGps: l.pontoGps,
        etapa: l.etapa || 'NOVO',
        proximaVisita: l.proximaVisita ? new Date(l.proximaVisita) : null,
        observacoes: l.observacoes,
        fotoFachada: l.fotoFachada,
        cidade: l.cidade,
        origemLead: l.origemLead,
        categoriaClienteId: l.categoriaClienteId || null,
        idVendedor: l.idVendedor || null,
        clienteId: l.clienteId || null,
      },
      create: {
        id: l.id,
        numero: l.numero,
        nomeEstabelecimento: l.nomeEstabelecimento,
        contato: l.contato,
        whatsapp: l.whatsapp,
        diasVisita: l.diasVisita,
        horarioAtendimento: l.horarioAtendimento,
        horarioEntrega: l.horarioEntrega,
        formasAtendimento: l.formasAtendimento || [],
        pontoGps: l.pontoGps,
        etapa: l.etapa || 'NOVO',
        proximaVisita: l.proximaVisita ? new Date(l.proximaVisita) : null,
        observacoes: l.observacoes,
        fotoFachada: l.fotoFachada,
        cidade: l.cidade,
        origemLead: l.origemLead,
        categoriaClienteId: l.categoriaClienteId || null,
        idVendedor: l.idVendedor || null,
        clienteId: l.clienteId || null,
      },
    });
  }
  log('Leads', items.length);
}

async function syncTabelaPrecos() {
  const data = await api('/api/tabela-precos');
  if (!data || !Array.isArray(data)) return;
  for (const t of data) {
    await prisma.tabelaPreco.upsert({
      where: { id: t.id },
      update: {
        idCondicao: t.idCondicao,
        nomeCondicao: t.nomeCondicao,
        tipoPagamento: t.tipoPagamento,
        opcaoCondicao: t.opcaoCondicao,
        qtdParcelas: t.qtdParcelas || 1,
        parcelasDias: t.parcelasDias || 0,
        acrescimoPreco: t.acrescimoPreco || 0,
        parcelasPercentuais: t.parcelasPercentuais || 100,
        valorMinimo: t.valorMinimo || 0,
        exigeBanco: t.exigeBanco || false,
        bancoPadrao: t.bancoPadrao,
        debitaCaixa: t.debitaCaixa || false,
        ativo: t.ativo !== false,
        obs: t.obs,
      },
      create: {
        id: t.id,
        idCondicao: t.idCondicao,
        nomeCondicao: t.nomeCondicao,
        tipoPagamento: t.tipoPagamento,
        opcaoCondicao: t.opcaoCondicao,
        qtdParcelas: t.qtdParcelas || 1,
        parcelasDias: t.parcelasDias || 0,
        acrescimoPreco: t.acrescimoPreco || 0,
        parcelasPercentuais: t.parcelasPercentuais || 100,
        valorMinimo: t.valorMinimo || 0,
        exigeBanco: t.exigeBanco || false,
        bancoPadrao: t.bancoPadrao,
        debitaCaixa: t.debitaCaixa || false,
        ativo: t.ativo !== false,
        obs: t.obs,
      },
    });
  }
  log('TabelaPrecos', data.length);
}

async function syncContasFinanceiras() {
  const data = await api('/api/contas-financeiras');
  if (!data || !Array.isArray(data)) return;
  for (const c of data) {
    await prisma.contaFinanceira.upsert({
      where: { id: c.id },
      update: {
        nomeBanco: c.nomeBanco,
        tipoUso: c.tipoUso,
        ativo: c.ativo !== false,
        fonteVendaId: c.fonteVendaId,
        obs: c.obs,
        opcaoCondicao: c.opcaoCondicao,
      },
      create: {
        id: c.id,
        nomeBanco: c.nomeBanco,
        tipoUso: c.tipoUso,
        ativo: c.ativo !== false,
        fonteVendaId: c.fonteVendaId,
        obs: c.obs,
        opcaoCondicao: c.opcaoCondicao,
      },
    });
  }
  log('ContasFinanceiras', data.length);
}

async function syncCondicoesPagamento() {
  const data = await api('/api/condicoes-pagamento');
  if (!data || !Array.isArray(data)) return;
  for (const c of data) {
    await prisma.condicaoPagamento.upsert({
      where: { id: c.id },
      update: { nome: c.nome, codigo: c.codigo, ativo: c.ativo !== false },
      create: { id: c.id, nome: c.nome, codigo: c.codigo, ativo: c.ativo !== false },
    });
  }
  log('CondicoesPagamento', data.length);
}

async function syncFormasPagamentoEntrega() {
  const data = await api('/api/pagamentos-entrega');
  if (!data || !Array.isArray(data)) return;
  for (const f of data) {
    await prisma.formaPagamentoEntrega.upsert({
      where: { id: f.id },
      update: {
        nome: f.nome,
        permiteVendedorResponsavel: f.permiteVendedorResponsavel || false,
        permiteEscritorioResponsavel: f.permiteEscritorioResponsavel || false,
        ativo: f.ativo !== false,
      },
      create: {
        id: f.id,
        nome: f.nome,
        permiteVendedorResponsavel: f.permiteVendedorResponsavel || false,
        permiteEscritorioResponsavel: f.permiteEscritorioResponsavel || false,
        ativo: f.ativo !== false,
      },
    });
  }
  log('FormasPagamentoEntrega', data.length);
}

async function syncPedidos() {
  const data = await api('/api/pedidos');
  if (!data) return;
  const items = Array.isArray(data) ? data : data.pedidos || [];

  let skipped = 0;
  for (const p of items) {
    try {
    // Upsert pedido (without items first)
    await prisma.pedido.upsert({
      where: { id: p.id },
      update: {
        numero: p.numero,
        dataVenda: new Date(p.dataVenda),
        observacoes: p.observacoes,
        idContaFinanceira: p.idContaFinanceira,
        idCategoria: p.idCategoria,
        tipoPagamento: p.tipoPagamento,
        opcaoCondicaoPagamento: p.opcaoCondicaoPagamento,
        nomeCondicaoPagamento: p.nomeCondicaoPagamento,
        qtdParcelas: p.qtdParcelas || 1,
        primeiroVencimento: p.primeiroVencimento ? new Date(p.primeiroVencimento) : null,
        intervaloDias: p.intervaloDias || 0,
        especial: p.especial || false,
        statusEnvio: p.statusEnvio || 'ABERTO',
        idVendaContaAzul: p.idVendaContaAzul,
        situacaoCA: p.situacaoCA,
        erroEnvio: p.erroEnvio,
        flexTotal: p.flexTotal || 0,
        latLng: p.latLng,
        revisaoPendente: p.revisaoPendente || false,
        canalOrigem: p.canalOrigem,
        usuarioLancamentoId: p.usuarioLancamentoId,
        clienteId: p.clienteId,
        vendedorId: p.vendedorId,
        embarqueId: p.embarqueId,
        statusEntrega: p.statusEntrega || 'PENDENTE',
        dataEntrega: p.dataEntrega ? new Date(p.dataEntrega) : null,
        gpsEntrega: p.gpsEntrega,
        divergenciaPagamento: p.divergenciaPagamento || false,
        motivoDevolucao: p.motivoDevolucao,
        observacaoEntrega: p.observacaoEntrega,
      },
      create: {
        id: p.id,
        numero: p.numero,
        dataVenda: new Date(p.dataVenda),
        observacoes: p.observacoes,
        idContaFinanceira: p.idContaFinanceira,
        idCategoria: p.idCategoria,
        tipoPagamento: p.tipoPagamento,
        opcaoCondicaoPagamento: p.opcaoCondicaoPagamento,
        nomeCondicaoPagamento: p.nomeCondicaoPagamento,
        qtdParcelas: p.qtdParcelas || 1,
        primeiroVencimento: p.primeiroVencimento ? new Date(p.primeiroVencimento) : null,
        intervaloDias: p.intervaloDias || 0,
        especial: p.especial || false,
        statusEnvio: p.statusEnvio || 'ABERTO',
        idVendaContaAzul: p.idVendaContaAzul,
        situacaoCA: p.situacaoCA,
        erroEnvio: p.erroEnvio,
        flexTotal: p.flexTotal || 0,
        latLng: p.latLng,
        revisaoPendente: p.revisaoPendente || false,
        canalOrigem: p.canalOrigem,
        usuarioLancamentoId: p.usuarioLancamentoId,
        clienteId: p.clienteId,
        vendedorId: p.vendedorId,
        embarqueId: p.embarqueId,
        statusEntrega: p.statusEntrega || 'PENDENTE',
        dataEntrega: p.dataEntrega ? new Date(p.dataEntrega) : null,
        gpsEntrega: p.gpsEntrega,
        divergenciaPagamento: p.divergenciaPagamento || false,
        motivoDevolucao: p.motivoDevolucao,
        observacaoEntrega: p.observacaoEntrega,
      },
    });

    // Sync items if available
    if (p.itens && Array.isArray(p.itens)) {
      for (const item of p.itens) {
        await prisma.pedidoItem.upsert({
          where: { id: item.id },
          update: {
            descricao: item.descricao,
            quantidade: item.quantidade,
            valor: item.valor,
            valorBase: item.valorBase,
            flexGerado: item.flexGerado || 0,
            pedidoId: p.id,
            produtoId: item.produtoId,
            emPromocao: item.emPromocao || false,
            promocaoId: item.promocaoId,
            nomePromocao: item.nomePromocao,
            tipoPromocao: item.tipoPromocao,
          },
          create: {
            id: item.id,
            descricao: item.descricao,
            quantidade: item.quantidade,
            valor: item.valor,
            valorBase: item.valorBase,
            flexGerado: item.flexGerado || 0,
            pedidoId: p.id,
            produtoId: item.produtoId,
            emPromocao: item.emPromocao || false,
            promocaoId: item.promocaoId,
            nomePromocao: item.nomePromocao,
            tipoPromocao: item.tipoPromocao,
          },
        });
      }
    }
    } catch (e) {
      skipped++;
      if (skipped <= 3) console.warn(`    ⚠ Skip pedido ${p.id}: ${e.message.slice(0, 100)}`);
    }
  }
  if (skipped > 0) console.log(`    ⚠ ${skipped} pedidos pulados (FK ausente)`);
  log('Pedidos', items.length - skipped);
}

async function syncAtendimentos() {
  const leads = await prisma.lead.findMany({ select: { id: true } });
  let total = 0;
  const seen = new Set();

  async function upsertAtendimento(a) {
    if (seen.has(a.id)) return;
    seen.add(a.id);
    try {
      await prisma.atendimento.upsert({
        where: { id: a.id },
        update: {
          tipo: a.tipo, observacao: a.observacao, etapaAnterior: a.etapaAnterior,
          etapaNova: a.etapaNova, proximaVisita: a.proximaVisita ? new Date(a.proximaVisita) : null,
          gpsVendedor: a.gpsVendedor, pedidoId: a.pedidoId, leadId: a.leadId,
          clienteId: a.clienteId, idVendedor: a.idVendedor,
          criadoEm: a.criadoEm ? new Date(a.criadoEm) : new Date(),
        },
        create: {
          id: a.id, tipo: a.tipo, observacao: a.observacao, etapaAnterior: a.etapaAnterior,
          etapaNova: a.etapaNova, proximaVisita: a.proximaVisita ? new Date(a.proximaVisita) : null,
          gpsVendedor: a.gpsVendedor, pedidoId: a.pedidoId, leadId: a.leadId,
          clienteId: a.clienteId, idVendedor: a.idVendedor,
          criadoEm: a.criadoEm ? new Date(a.criadoEm) : new Date(),
        },
      });
      total++;
    } catch (e) { /* skip FK errors */ }
  }

  for (const lead of leads) {
    const data = await api(`/api/atendimentos/lead/${lead.id}`);
    if (!data || !Array.isArray(data)) continue;
    for (const a of data) await upsertAtendimento(a);
  }

  const clientes = await prisma.cliente.findMany({ select: { UUID: true } });
  for (const c of clientes) {
    const data = await api(`/api/atendimentos/cliente/${c.UUID}`);
    if (!data || !Array.isArray(data)) continue;
    for (const a of data) await upsertAtendimento(a);
  }
  log('Atendimentos', total);
}

async function syncConfigs() {
  // Tenta puxar configs conhecidas
  const keys = [
    'tipos_atendimento', 'acoes_atendimento', 'acoes_lead',
    'categorias_padrao', 'formas_atendimento', 'origens_lead',
    'ciclo_recompra_padrao_dias', 'tarefas_automaticas',
  ];
  let total = 0;
  for (const key of keys) {
    const data = await api(`/api/config/${key}`);
    if (data !== null && data !== undefined) {
      await prisma.appConfig.upsert({
        where: { key },
        update: { value: data },
        create: { key, value: data },
      });
      total++;
    }
  }
  log('AppConfigs', total);
}

async function syncEmbarques() {
  const data = await api('/api/embarques');
  if (!data) return;
  const items = Array.isArray(data) ? data : data.embarques || [];
  for (const e of items) {
    await prisma.embarque.upsert({
      where: { id: e.id },
      update: {
        numero: e.numero,
        dataSaida: new Date(e.dataSaida),
        responsavelId: e.responsavelId,
      },
      create: {
        id: e.id,
        numero: e.numero,
        dataSaida: new Date(e.dataSaida),
        responsavelId: e.responsavelId,
      },
    });
  }
  log('Embarques', items.length);
}

async function syncPromocoes() {
  const data = await api('/api/promocoes/ativas-lote');
  if (!data || typeof data !== 'object') return;
  // Response is { produtoId: promocaoObj, ... }
  const items = Object.values(data).filter(p => p && p.id);
  for (const p of items) {
    await prisma.promocao.upsert({
      where: { id: p.id },
      update: {
        produtoId: p.produtoId,
        nome: p.nome,
        tipo: p.tipo,
        precoPromocional: p.precoPromocional,
        dataInicio: new Date(p.dataInicio),
        dataFim: new Date(p.dataFim),
        status: p.status || 'ATIVA',
        criadoPor: p.criadoPor,
      },
      create: {
        id: p.id,
        produtoId: p.produtoId,
        nome: p.nome,
        tipo: p.tipo,
        precoPromocional: p.precoPromocional,
        dataInicio: new Date(p.dataInicio),
        dataFim: new Date(p.dataFim),
        status: p.status || 'ATIVA',
        criadoPor: p.criadoPor,
      },
    });
  }
  log('Promoções', items.length);
}

// ── main ─────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Sync Produção → Local');
  console.log('═══════════════════════════════════════════════\n');

  await login();
  console.log('\nSincronizando dados...\n');

  // Ordem respeita dependências de FK
  await syncVendedores();
  await syncCategoriasProduto();
  await syncCategoriasCliente();
  await syncProdutos();
  await syncClientes();
  await syncVeiculos();
  await syncCondicoesPagamento();
  await syncContasFinanceiras();
  await syncTabelaPrecos();
  await syncFormasPagamentoEntrega();
  await syncEmbarques();
  await syncLeads();
  await syncPromocoes();
  await syncPedidos();
  await syncAtendimentos();
  await syncConfigs();

  console.log('\n═══════════════════════════════════════════════');
  console.log('  Sync concluído!');
  console.log('═══════════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error('\n✗ Erro fatal:', e.message);
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
