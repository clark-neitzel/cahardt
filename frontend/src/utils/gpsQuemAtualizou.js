// Formatação compartilhada do selo "quem atualizou o ponto GPS" — usado no card de
// entrega (Rota/Motorista), na ficha rápida do cliente (ClientePopup), no cadastro
// do cliente (Logística) e no Mapa de Clientes.
//
// Todo campo aqui é OPCIONAL (undefined/null): a `ultimaMudanca` pode não existir
// (ninguém marcou o ponto atual por um caminho registrado) e cada campo dela também
// pode faltar. Nunca interpolar sem checar — vira "undefined" na tela (regra do
// projeto em CLAUDE.md).

// origem ('CADASTRO'|'ROTA'|'MOTORISTA'|'SAUDE'|'PEDIDO') → nome da tela, em português,
// para a frase "pela <tela>".
const TELA_POR_ORIGEM = {
    CADASTRO: 'cadastro do cliente',
    ROTA: 'Rota',
    MOTORISTA: 'tela de entregas',
    SAUDE: 'Saúde dos pontos',
    PEDIDO: 'pedido',
};

export const telaDaOrigem = (origem) => (origem && TELA_POR_ORIGEM[origem]) || null;

export const primeiroNome = (nomeCompleto) => {
    if (!nomeCompleto) return null;
    const n = String(nomeCompleto).trim().split(/\s+/)[0];
    return n || null;
};

const pad2 = (n) => String(n).padStart(2, '0');

const paraData = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
};

// dd/mm — usado nos chips curtos (fuso local do aparelho)
export const formatarDataCurta = (iso) => {
    const d = paraData(iso);
    return d ? `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}` : null;
};

// dd/mm/aaaa
export const formatarData = (iso) => {
    const d = paraData(iso);
    return d ? `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}` : null;
};

// dd/mm/aaaa às hh:mm
export const formatarDataHora = (iso) => {
    const d = paraData(iso);
    if (!d) return null;
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} às ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

// 850 m / 16,2 km
export const formatarDistancia = (m) => {
    if (m == null || Number.isNaN(Number(m))) return null;
    const n = Number(m);
    return n < 1000 ? `${Math.round(n)} m` : `${(n / 1000).toFixed(1).replace('.', ',')} km`;
};

// Duas fontes alimentam esta tela, com nomes de campo diferentes:
// - `ultimaMudanca` (GET /cliente/:uuid e o lote endereco-vs-gps): { autorNome, em, ... }
// - itens de GET /historico (lista completa): { autor, criadoEm, ... }
// Os helpers abaixo aceitam os dois formatos sem quebrar.
const nomeDe = (item) => item?.autorNome || item?.autor || null;
const momentoDe = (item) => item?.em || item?.createdAt || item?.criadoEm || null;

// `autorCargo` hoje SEMPRE vem null (Vendedor não tem campo cargo no schema — só
// Funcionario, cadastro separado). Enquanto isso não existir, só dá para inferir um
// "cargo" com confiança quando a própria origem já é a pessoa (MOTORISTA usa a tela
// de entregas). Nas demais origens (ROTA/CADASTRO/SAUDE/PEDIDO) não dá para saber se
// foi vendedor, escritório ou logística — sem badge é melhor que badge errado.
export const cargoExibicao = (item) => item?.autorCargo || (item?.origem === 'MOTORISTA' ? 'MOTORISTA' : null);

// "Patrik · 22/09" — usado nos chips curtos do card de entrega e do Mapa de Clientes.
export const resumoChip = (item) => {
    const nome = primeiroNome(nomeDe(item));
    const data = formatarDataCurta(momentoDe(item));
    if (!nome && !data) return null;
    return [nome, data].filter(Boolean).join(' · ');
};

// "Conferido por Patrik em 22/09" — regra 2 do chip de entrega ("confirmado pelas entregas").
export const linhaConferidoPor = (item) => {
    const nome = primeiroNome(nomeDe(item));
    if (!nome) return null;
    const data = formatarDataCurta(momentoDe(item));
    return `Conferido por ${nome}${data ? ` em ${data}` : ''}`;
};

// "Ponto marcado por Nome em dd/mm/aaaa" — linha pequena do card de entrega (regra 4).
export const linhaMarcadoPor = (item) => {
    const nome = nomeDe(item);
    if (!nome) return null;
    const data = formatarData(momentoDe(item));
    return `Ponto marcado por ${nome}${data ? ` em ${data}` : ''}`;
};

// Caixa completa (ficha rápida e cadastro): nome, cargo (se houver), data/hora, tela
// e distância que o ponto andou. Sem ultimaMudanca → null (quem chama mostra o texto
// "Ponto do cadastro original").
export const detalheAtualizacao = (item) => {
    const nome = nomeDe(item);
    if (!nome) return null;
    const partes = [formatarDataHora(momentoDe(item))];
    const tela = telaDaOrigem(item.origem);
    if (tela) partes.push(`pela ${tela}`);
    const dist = formatarDistancia(item.distanciaM);
    if (dist) partes.push(`moveu ${dist}`);
    return {
        nome,
        cargo: cargoExibicao(item),
        linha: partes.filter(Boolean).join(' · '),
    };
};

// "estava a 12 m do ponto novo" — só quando a pessoa estava mesmo perto (≤150m).
export const linhaNoLocal = (autorNoLocalM) => {
    if (autorNoLocalM == null || autorNoLocalM > 150) return null;
    const dist = formatarDistancia(autorNoLocalM);
    return dist ? `estava a ${dist} do ponto novo` : null;
};

// "moveu o ponto 16,2 km" / "definiu o primeiro ponto" / "removeu o ponto" /
// "marcou como balcão" — a ação de uma linha do histórico completo (GET /historico).
export const acaoHistorico = (item) => {
    if (!item) return '';
    if (item.tipo === 'BALCAO_ON') return 'marcou como balcão';
    if (item.tipo === 'BALCAO_OFF') return 'tirou de balcão';
    if (item.pontoNovo == null) return 'removeu o ponto';
    if (item.pontoAntigo == null) return 'definiu o primeiro ponto';
    const dist = formatarDistancia(item.distanciaM);
    return dist ? `moveu o ponto ${dist}` : 'moveu o ponto';
};
