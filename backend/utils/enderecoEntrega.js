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

// ─────────────────────────────────────────────────────────────────────────────
// Local de entrega (Entrega 2, 11/2026) — ONDE entregar este pedido.
//
// Regra única: endereço do PEDIDO → local de entrega do CLIENTE → cadastro.
// Função PURA (sem banco): quem chama carrega as linhas laterais
// (clientes_local_entrega / pedidos_local_entrega / KitFestaPedido) e passa aqui.
// O carregador em lote está em services/localEntregaService.js (anexarLocalEntrega).
//
// Ordem de decisão:
//   1. Kit Festa modo=retirada                  → RETIRADA
//   2. pedidoLocal.modo = 'AVULSO' (com conteúdo) → PEDIDO (texto + ponto do avulso, se houver)
//   3. pedidoLocal.modo = 'CADASTRO'            → CADASTRO à força
//   4. kitFesta.enderecoEntrega preenchido      → PEDIDO (texto livre, sem ponto)
//   5. clienteLocal.ativo (com conteúdo)        → LOCAL_CLIENTE
//   6. senão                                    → CADASTRO
//
// REGRA DE OURO DO PONTO: o GPS vem SEMPRE do mesmo lugar do endereço.
//   PEDIDO → ponto do avulso ou null · LOCAL_CLIENTE → ponto do local ou null ·
//   só a origem CADASTRO usa Cliente.Ponto_GPS. NUNCA cai no cadastro quando o texto é de outro lugar.
//
// Retorno: { origem, texto, endereco, ponto, cidade, divergeCadastro }
//   origem: 'RETIRADA' | 'PEDIDO' | 'LOCAL_CLIENTE' | 'CADASTRO'
//   texto: endereço em uma linha (null na retirada / sem endereço)
//   endereco: { logradouro, numero, complemento, bairro, cidade, estado, cep, referencia } (null na retirada)
//   ponto: "lat,lng" | null
//   cidade: string | null
//   divergeCadastro: true | false | null (mesma semântica de divergeDoCadastro; false quando origem = CADASTRO)

const CAMPOS_ENDERECO = ['logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado', 'cep', 'referencia'];

const limpo = (v) => {
    if (v == null) return null;
    const t = String(v).trim();
    return t === '' ? null : t;
};

// "lat,lng" válido (faixa -90..90 / -180..180) → string normalizada; senão null
function pontoValido(v) {
    const t = limpo(v);
    if (!t) return null;
    const partes = t.split(',');
    if (partes.length !== 2) return null;
    if (!partes[0].trim() || !partes[1].trim()) return null;
    const lat = Number(partes[0].trim());
    const lng = Number(partes[1].trim());
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return `${lat},${lng}`;
}

// { logradouro, numero, ... } (qualquer lacuna vira null)
function enderecoDe(origem) {
    const o = origem || {};
    const e = {};
    for (const c of CAMPOS_ENDERECO) e[c] = limpo(o[c]);
    return e;
}

// Texto em uma linha: "Rua X, 12, Apto 3, Bairro, Cidade - SC, 89200-000"
function montarTexto(e) {
    if (!e) return null;
    const rua = [e.logradouro, e.numero].filter(Boolean).join(', ');
    const cidadeUf = [e.cidade, e.estado].filter(Boolean).join(' - ');
    const partes = [rua, e.complemento, e.bairro, cidadeUf, e.cep].filter(Boolean);
    return partes.length ? partes.join(', ') : null;
}

// Endereço do cadastro do cliente (clientes.End_*) no mesmo formato
function enderecoDoCadastro(cliente) {
    const c = cliente || {};
    return enderecoDe({
        logradouro: c.End_Logradouro, numero: c.End_Numero, complemento: c.End_Complemento,
        bairro: c.End_Bairro, cidade: c.End_Cidade, estado: c.End_Estado, cep: c.End_CEP, referencia: null,
    });
}

// Uma linha lateral "tem conteúdo" se traz algum texto de endereço ou ponto válido
const temConteudo = (linha) => !!(linha && (montarTexto(enderecoDe(linha)) || pontoValido(linha.pontoGps)));

function resolverLocalEntrega({ cliente, clienteLocal, pedidoLocal, kitFesta } = {}) {
    // 1. Retirada (Kit Festa): ninguém entrega
    if (kitFesta && String(kitFesta.modo || '').toLowerCase() === 'retirada') {
        return { origem: 'RETIRADA', texto: null, endereco: null, ponto: null, cidade: null, divergeCadastro: null };
    }

    const modo = pedidoLocal ? String(pedidoLocal.modo || '').toUpperCase() : '';

    // 2. Endereço avulso do pedido (sem conteúdo = como se não existisse)
    if (modo === 'AVULSO' && temConteudo(pedidoLocal)) {
        const endereco = enderecoDe(pedidoLocal);
        const texto = montarTexto(endereco);
        return {
            origem: 'PEDIDO', texto, endereco,
            ponto: pontoValido(pedidoLocal.pontoGps), // avulso sem ponto = null (NUNCA o do cadastro)
            cidade: endereco.cidade,
            divergeCadastro: divergeDoCadastro(texto, cliente),
        };
    }

    const cadastro = () => {
        const endereco = enderecoDoCadastro(cliente);
        return {
            origem: 'CADASTRO', texto: montarTexto(endereco), endereco,
            ponto: limpo(cliente && cliente.Ponto_GPS),
            cidade: endereco.cidade,
            divergeCadastro: false,
        };
    };

    // 3. Cadastro forçado neste pedido
    if (modo === 'CADASTRO') return cadastro();

    // 4. Kit Festa com endereço de entrega digitado (texto livre, sem ponto)
    const textoKit = limpo(kitFesta && kitFesta.enderecoEntrega);
    if (textoKit) {
        return {
            origem: 'PEDIDO', texto: textoKit, endereco: enderecoDe({}),
            ponto: null, cidade: null,
            divergeCadastro: divergeDoCadastro(textoKit, cliente),
        };
    }

    // 5. Local de entrega ativo do cliente
    if (clienteLocal && clienteLocal.ativo !== false && temConteudo(clienteLocal)) {
        const endereco = enderecoDe(clienteLocal);
        const texto = montarTexto(endereco);
        return {
            origem: 'LOCAL_CLIENTE', texto, endereco,
            ponto: pontoValido(clienteLocal.pontoGps), // local sem ponto = null (NUNCA o do cadastro)
            cidade: endereco.cidade,
            divergeCadastro: divergeDoCadastro(texto, cliente),
        };
    }

    // 6. Cadastro (comportamento de sempre)
    return cadastro();
}

module.exports = {
    divergeDoCadastro, resumoKitFesta, normalizar,
    resolverLocalEntrega, pontoValido, montarTexto, enderecoDe,
};
