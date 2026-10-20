// Catálogo ÚNICO dos ângulos do checklist de veículo por foto.
// O frontend NUNCA repete esta lista: recebe tudo por GET /api/veiculos/:id/checklist-config.

const TIPOS_VEICULO = ['CARGA', 'PASSEIO', 'PARTICULAR'];

const DICA_NOITE_EXTERNO = 'Pouca luz? Ligue o flash da câmera antes de bater a foto.';

const ANGULOS = {
    frente: {
        rotulo: 'Frente com placa',
        instrucao: 'Frente inteira, a 2 m, pegando a placa e os faróis',
        dicaNoite: DICA_NOITE_EXTERNO,
    },
    lateral_direita: {
        rotulo: 'Lateral direita',
        instrucao: 'Veículo inteiro de lado, mostrando os dois pneus',
        dicaNoite: DICA_NOITE_EXTERNO,
    },
    lateral_esquerda: {
        rotulo: 'Lateral esquerda',
        instrucao: 'Veículo inteiro de lado, mostrando os dois pneus',
        dicaNoite: DICA_NOITE_EXTERNO,
    },
    traseira: {
        rotulo: 'Traseira com placa',
        instrucao: 'Traseira inteira, a 2 m, pegando a placa e as lanternas',
        dicaNoite: DICA_NOITE_EXTERNO,
    },
    painel: {
        rotulo: 'Painel (KM e luzes)',
        instrucao: 'Com o veículo ligado, mostre o painel inteiro: KM, combustível e luzes de aviso',
        dicaNoite: 'Evite reflexo: incline um pouco o celular. Use o flash se o painel estiver escuro.',
    },
    agua_radiador: {
        rotulo: 'Água do radiador',
        instrucao: 'Abra o capô e aproxime o celular do reservatório, mostrando as marcas MIN e MAX',
        dicaNoite: 'Use o flash da câmera e aproxime bem do reservatório.',
    },
    vareta_oleo: {
        rotulo: 'Vareta de óleo',
        instrucao: 'Retire a vareta, limpe, recoloque e retire de novo. Fotografe a ponta sobre um papel branco',
        dicaNoite: 'Use o flash da câmera e um papel branco atrás da vareta.',
    },
    bau: {
        rotulo: 'Baú por dentro',
        instrucao: 'Abra o baú e fotografe o interior inteiro, mostrando limpeza e organização',
        dicaNoite: 'Use o flash da câmera.',
    },
    porta_malas: {
        rotulo: 'Porta-malas',
        instrucao: 'Abra o porta-malas e fotografe o mostruário e a caixa térmica no lugar',
        dicaNoite: 'Use o flash da câmera.',
    },
};

// Ordem e regra de cada ângulo, por tipo de veículo.
// condicional + condicao: obrigatório só quando a condição vale (vareta: segunda/quinta ou luz de óleo).
const SLOTS_POR_TIPO = {
    CARGA: ['frente', 'lateral_direita', 'lateral_esquerda', 'traseira', 'painel', 'agua_radiador', 'vareta_oleo', 'bau'],
    PASSEIO: ['frente', 'lateral_direita', 'lateral_esquerda', 'traseira', 'painel', 'agua_radiador', 'vareta_oleo', 'porta_malas'],
    PARTICULAR: ['painel'],
};

const CONDICIONAIS = {
    vareta_oleo: 'SEGUNDA_QUINTA_OU_LUZ_OLEO',
};

function tipoValido(tipo) {
    return TIPOS_VEICULO.includes(tipo);
}

/** Lista de slots (sem foto modelo) do tipo, na ordem. */
function slotsDoTipo(tipo) {
    const lista = SLOTS_POR_TIPO[tipoValido(tipo) ? tipo : 'CARGA'];
    return lista.map((angulo, i) => ({
        angulo,
        ...ANGULOS[angulo],
        ordem: i + 1,
        condicional: !!CONDICIONAIS[angulo],
        condicao: CONDICIONAIS[angulo] || null,
    }));
}

function anguloDoTipo(tipo, angulo) {
    return (SLOTS_POR_TIPO[tipoValido(tipo) ? tipo : 'CARGA'] || []).includes(angulo);
}

// Chave do resumo compatível gravado em DiarioVendedor.checklist (booleanos com sufixo Ok)
const CHAVE_RESUMO = {
    frente: 'frenteOk',
    lateral_direita: 'lateralDireitaOk',
    lateral_esquerda: 'lateralEsquerdaOk',
    traseira: 'traseiraOk',
    painel: 'painelOk',
    agua_radiador: 'aguaOk',
    vareta_oleo: 'oleoOk',
    bau: 'bauOk',
    porta_malas: 'portaMalasOk',
};

module.exports = { TIPOS_VEICULO, ANGULOS, SLOTS_POR_TIPO, CONDICIONAIS, CHAVE_RESUMO, tipoValido, slotsDoTipo, anguloDoTipo };
