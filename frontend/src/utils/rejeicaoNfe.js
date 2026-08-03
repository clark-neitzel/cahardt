// Traduz a rejeição da SEFAZ para "o que fazer" — a mensagem oficial continua
// sempre visível na tela; isto é só a orientação prática ao lado dela.
//
// O casamento é pelo TEXTO da mensagem (é o que a Focus grava em `mensagemSefaz`),
// normalizado sem acento e em minúsculas. Os textos da SEFAZ são padronizados, mas
// se algum não bater a tela cai na orientação genérica — nunca fica sem saída.

const normalizar = (s) => String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();

// `conferirCliente: true` libera o botão que consulta o CNPJ na Receita/SEFAZ na hora.
const REGRAS = [
    {
        // 305 / 303 / 302 / 240 — o cadastro do CLIENTE está irregular na SEFAZ da UF dele.
        casa: (m) => /destinatario bloqueado|destinatario nao habilitado|cadastro do destinatario nao habilitado|irregularidade fiscal do destinatario/.test(m),
        titulo: 'O cadastro do cliente está irregular na SEFAZ',
        conferirCliente: true,
        passos: [
            'Não é falta de dado no app: a SEFAZ recusou o próprio cliente.',
            'Clique em "Conferir na Receita/SEFAZ" abaixo para ver a situação do CNPJ e da inscrição estadual.',
            'CNPJ baixado/inapto ou IE não habilitada → a empresa do cliente foi encerrada ou está bloqueada. Falar com o cliente: ou ele passa o CNPJ novo, ou a compra é no CPF dele (aí o cadastro vira pessoa física, não contribuinte).',
            'Cadastro tudo certo na consulta → é bloqueio interno da SEFAZ; só o contador do cliente resolve.',
        ],
    },
    {
        // 210 / 232 / 233 / 234 — problema na inscrição estadual do destinatário.
        casa: (m) => /ie do destinatario|inscricao estadual do destinatario/.test(m),
        titulo: 'Inscrição estadual do cliente errada, faltando ou não vinculada ao CNPJ',
        conferirCliente: true,
        passos: [
            'Abrir o cadastro do cliente (aba Clientes) e conferir a inscrição estadual.',
            'Use "Conferir na Receita/SEFAZ" abaixo: ele traz a IE que a SEFAZ reconhece para esse CNPJ.',
            'Cliente que não tem IE (isento ou pessoa física) deve ficar marcado como não contribuinte no cadastro.',
            'Corrigir o cadastro e clicar em "Reemitir NF-e".',
        ],
    },
    {
        // 208 / 207 — documento inválido.
        casa: (m) => /cnpj do destinatario invalido|cpf do destinatario invalido/.test(m),
        titulo: 'O CPF/CNPJ do cliente está inválido',
        conferirCliente: true,
        passos: [
            'Conferir o documento no cadastro do cliente — normalmente é dígito trocado na digitação.',
            'Corrigir e clicar em "Reemitir NF-e".',
        ],
    },
    {
        // 301 — irregularidade do EMITENTE (nós).
        casa: (m) => /irregularidade fiscal do emitente|ie do emitente|inscricao estadual do emitente/.test(m),
        titulo: 'O problema é no nosso cadastro, não no do cliente',
        passos: [
            'A SEFAZ apontou irregularidade ou dado errado da HARDT como emitente.',
            'Não adianta reemitir: avisar a direção/contabilidade para regularizar antes.',
        ],
    },
    {
        // 204 / 539 — duplicidade.
        casa: (m) => /duplicidade/.test(m),
        titulo: 'Já existe nota emitida para esta venda',
        passos: [
            'A SEFAZ recusou porque já autorizou uma nota com estes mesmos dados.',
            'Não reemitir. Conferir se a nota já não aparece autorizada (filtro "Emitidas") ou avisar o suporte.',
        ],
    },
    {
        // 598 / 610 — soma dos valores.
        casa: (m) => /difere do somatorio|total da nf difere|total do icms difere/.test(m),
        titulo: 'As contas do pedido não fecham com o total',
        passos: [
            'Diferença de centavos entre a soma dos itens e o total do pedido.',
            'Não é coisa que se resolva no cadastro: avisar o suporte com o número do pedido.',
        ],
    },
    {
        // 228 — data de emissão atrasada.
        casa: (m) => /data de emissao|data-hora de emissao/.test(m),
        titulo: 'A data da venda está velha demais para a SEFAZ',
        passos: [
            'A SEFAZ não aceita nota de venda muito antiga.',
            'Avisar o suporte com o número do pedido — a nota precisa de tratamento manual.',
        ],
    },
    {
        // 778 — NCM.
        casa: (m) => /ncm/.test(m),
        titulo: 'Um produto do pedido está com NCM inválido',
        passos: [
            'Conferir o NCM dos produtos do pedido no cadastro de Produtos.',
            'Corrigir e clicar em "Reemitir NF-e". Na dúvida sobre o código, falar com a contabilidade.',
        ],
    },
    {
        // 215 / 225 — schema.
        casa: (m) => /schema|falha no schema xml/.test(m),
        titulo: 'Algum dado saiu fora do formato que a SEFAZ aceita',
        passos: [
            'Costuma ser caractere estranho ou campo vazio no cadastro do cliente (endereço, telefone).',
            'Conferir o cadastro; persistindo, avisar o suporte com o número do pedido.',
        ],
    },
];

const GENERICA = {
    titulo: 'Rejeição da SEFAZ',
    conferirCliente: true,
    passos: [
        'Leia a mensagem da SEFAZ acima — ela diz o motivo exato.',
        'Se falar em algo do cliente (documento, inscrição estadual, endereço), corrija na aba Clientes e clique em "Reemitir NF-e".',
        'Se não der para resolver pelo cadastro, avise o suporte com o número do pedido e essa mensagem.',
    ],
};

/** Devolve { titulo, passos[], conferirCliente } para a mensagem da SEFAZ. */
export function explicarRejeicao(mensagemSefaz) {
    const m = normalizar(mensagemSefaz);
    if (!m) return GENERICA;
    const regra = REGRAS.find(r => r.casa(m));
    return regra ? { titulo: regra.titulo, passos: regra.passos, conferirCliente: !!regra.conferirCliente } : GENERICA;
}

export default explicarRejeicao;
