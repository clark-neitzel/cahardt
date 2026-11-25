// Compara o endereço de entrega de um pedido (texto livre) com o endereço do cadastro do cliente.
//
// `enderecoEntrega` do Kit Festa chega em 3 formatos (site, cadastro "completo"
// `Rua X, nº 12, Bairro, Cidade`, bot Ana) — a comparação exata não serve. Aqui só se
// pergunta: o texto cita o logradouro e o número do cadastro?
// Falso positivo vira SÓ aviso na tela, nunca bloqueio.
//
// Retorno de divergeDoCadastro:
//   true  = o endereço do pedido NÃO contém logradouro+número do cadastro
//   false = bate
//   null  = não dá para comparar (pedido sem endereço, ou cadastro sem logradouro)

const PREFIXOS_TIPO = '(?:rua|r|av|avenida|tv|travessa|al|alameda|rod|rodovia|estrada)';
const RE_PREFIXO = new RegExp(`^${PREFIXOS_TIPO}\\s+`);

// minúsculas, sem acento, só [a-z0-9 ], espaços colapsados
function normalizar(txt) {
    return String(txt == null ? '' : txt)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizarLogradouro(txt) {
    return normalizar(txt).replace(RE_PREFIXO, '').trim();
}

function divergeDoCadastro(enderecoEntrega, cliente) {
    const endereco = normalizar(enderecoEntrega);
    if (!endereco) return null;

    const logradouro = normalizarLogradouro(cliente && cliente.End_Logradouro);
    if (!logradouro) return null;

    // logradouro como sequência de palavras inteiras (evita "rua 1" casar dentro de "rua 10")
    if (!(` ${endereco} `).includes(` ${logradouro} `)) return true;

    // número: só dígitos do cadastro. Sem dígitos ("S/N", vazio) não há o que comparar.
    const numero = String((cliente && cliente.End_Numero) == null ? '' : cliente.End_Numero).replace(/\D/g, '');
    if (numero) {
        // número como sequência inteira de dígitos (aceita "12A"; "12" não casa dentro de "120" nem de um CEP)
        const re = new RegExp(`(?:^|[^0-9])${numero}(?![0-9])`);
        if (!re.test(endereco)) return true;
    }
    return false;
}

// Objeto `kitFestaPedido` exposto nas listagens/detalhe do pedido.
// kf = linha de KitFestaPedido (numero, modo, enderecoEntrega); cliente = Cliente do pedido.
function resumoKitFesta(kf, cliente) {
    if (!kf) return null;
    const retirada = String(kf.modo || '').toLowerCase() === 'retirada';
    return {
        numero: kf.numero,
        modo: kf.modo,
        enderecoEntrega: kf.enderecoEntrega == null ? null : kf.enderecoEntrega,
        divergeCadastro: retirada ? null : divergeDoCadastro(kf.enderecoEntrega, cliente),
    };
}

module.exports = { divergeDoCadastro, resumoKitFesta, normalizar };
