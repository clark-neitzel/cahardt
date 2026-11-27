// Exemplos de corpo (requestBody) das principais funções de escrita para o Kit de Conexão e o OpenAPI do agente.
// Nenhum ID real nem segredo: apenas formatos ilustrativos.
const EXEMPLOS = {
    'POST /api/contas-pagar': {
        contentType: 'application/json',
        resumo: 'Lançar conta a pagar em aberto',
        corpo: {
            descricao: 'Energia elétrica — referência 11/2026',
            fornecedorId: '00000000-0000-0000-0000-000000000001',
            categoriaId: '00000000-0000-0000-0000-000000000002',
            competencia: '2026-11',
            parcelas: [{ numero: 1, vencimento: '2026-12-10', valor: 485.90 }],
        },
    },
    'POST /api/contas-pagar/avaliar-custo': {
        contentType: 'application/json',
        resumo: 'Simular se o custo dos itens está dentro da curva histórica (não grava)',
        corpo: {
            itens: [{ pcpItemId: '00000000-0000-0000-0000-000000000003', quantidade: 50, valorUnitario: 18.50 }],
        },
    },
    'PUT /api/contas-pagar/:p': {
        contentType: 'application/json',
        resumo: 'Editar dados de uma conta a pagar existente',
        corpo: {
            descricao: 'Energia elétrica — unidade fábrica (11/2026)',
            observacoes: 'Conferido com fatura Celesc',
        },
    },
    'POST /api/contas-pagar/:p/parcelas/:p/baixar': {
        contentType: 'application/json',
        resumo: 'Dar baixa em parcela de conta a pagar',
        corpo: {
            dataPagamento: '2026-11-27',
            valorPago: 485.90,
            formaPagamento: 'PIX',
            contaFinanceiraId: '00000000-0000-0000-0000-000000000004',
        },
    },
    'POST /api/notas-entrada/importar-xml': {
        contentType: 'application/xml',
        resumo: 'Importar XML bruto de NF-e de compra',
        corpo: '<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">...</nfeProc>',
    },
    'POST /api/notas-entrada/:p/gerar-conta': {
        contentType: 'application/json',
        resumo: 'Gerar conta a pagar a partir de nota fiscal recebida',
        corpo: {
            categoriaId: '00000000-0000-0000-0000-000000000002',
            competencia: '2026-11',
            parcelas: [{ numero: 1, vencimento: '2026-12-15', valor: 1250.00 }],
        },
    },
    'POST /api/notas-entrada/:p/vincular-parcelas': {
        contentType: 'application/json',
        resumo: 'Vincular nota fiscal recebida a parcelas já existentes no Contas a Pagar',
        corpo: {
            contaPagarId: '00000000-0000-0000-0000-000000000005',
        },
    },
    'POST /api/fornecedores': {
        contentType: 'application/json',
        resumo: 'Cadastrar novo fornecedor',
        corpo: {
            razaoSocial: 'Laticínios Vale Sul Ltda',
            nomeFantasia: 'Vale Sul',
            cnpjCpf: '12345678000199',
            cidade: 'Joinville',
            uf: 'SC',
            telefone: '4734330000',
        },
    },
    'POST /api/clientes': {
        contentType: 'application/json',
        resumo: 'Cadastrar novo cliente/pessoa',
        corpo: {
            Tipo_Pessoa: 'J',
            Documento: '98765432000188',
            Nome: 'Padaria Pão Quente Ltda',
            NomeFantasia: 'Padaria Pão Quente',
            Telefone_Celular: '47999998888',
            End_Cidade: 'Joinville',
            End_Estado: 'SC',
        },
    },
    'POST /api/produtos': {
        contentType: 'application/json',
        resumo: 'Criar produto comercial',
        corpo: {
            nome: 'Pão de Queijo Tradicional 1kg',
            unidade: 'PCT',
            precoVenda: 24.90,
            ativo: true,
        },
    },
    'POST /api/pcp/itens': {
        contentType: 'application/json',
        resumo: 'Cadastrar insumo ou subproduto do PCP',
        corpo: {
            nome: 'Farinha de Trigo Especial',
            tipo: 'INSUMO',
            unidade: 'KG',
            custoUnitario: 4.20,
        },
    },
    'POST /api/pcp/receitas': {
        contentType: 'application/json',
        resumo: 'Criar receita do PCP em rascunho',
        corpo: {
            nome: 'Massa Base Salgados Assados',
            status: 'RASCUNHO',
            rendimento: 10,
            unidadeRendimento: 'KG',
            itens: [{ itemId: '00000000-0000-0000-0000-000000000003', quantidade: 5 }],
        },
    },
    'POST /api/financeiro-gerencial/categorias-despesa': {
        contentType: 'application/json',
        resumo: 'Criar categoria de despesa vinculada a grupo da DRE',
        corpo: {
            nome: 'Manutenção de Equipamentos Frios',
            grupoDreId: '00000000-0000-0000-0000-000000000006',
        },
    },
    'POST /api/conciliacao-bancaria/:p/conciliar': {
        contentType: 'application/json',
        resumo: 'Conciliar linha do extrato bancário com parcela',
        corpo: {
            parcelaPagarId: '00000000-0000-0000-0000-000000000007',
        },
    },
    'POST /api/contas-receber/:p/baixa': {
        contentType: 'application/json',
        resumo: 'Registrar baixa de parcela do Contas a Receber',
        corpo: {
            dataPagamento: '2026-11-27',
            valorRecebido: 320.00,
            formaPagamento: 'PIX',
            contaFinanceiraId: '00000000-0000-0000-0000-000000000004',
        },
    },
};

function exemploDe(chave) {
    return EXEMPLOS[String(chave || '')] || null;
}

module.exports = { EXEMPLOS, exemploDe };
