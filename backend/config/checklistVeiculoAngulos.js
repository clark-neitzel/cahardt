// Catálogo ÚNICO dos ângulos do checklist de veículo por foto.
// O frontend NUNCA repete esta lista: recebe tudo por GET /api/veiculos/:id/checklist-config.

const TIPOS_VEICULO = ['CARGA', 'PASSEIO', 'PARTICULAR'];

const DICA_NOITE_EXTERNO = 'Pouca luz? Ligue o flash da câmera antes de bater a foto.';

const ANGULOS = {
    frente: {
        rotulo: 'Frente com placa',
        instrucao: 'Chega 2 passos (uns 3 m) de distância: as duas rodas da frente e a placa dentro do quadro. Capô fechado',
        dicaNoite: DICA_NOITE_EXTERNO,
    },
    lateral_direita: {
        rotulo: 'Lateral direita',
        instrucao: 'Fica 4 passos (uns 5 m) de distância, no meio do carro: o carro inteiro, com as duas rodas. Capô fechado',
        dicaNoite: DICA_NOITE_EXTERNO,
    },
    lateral_esquerda: {
        rotulo: 'Lateral esquerda',
        instrucao: 'Fica 4 passos (uns 5 m) de distância, no meio do carro: o carro inteiro, com as duas rodas. Capô fechado',
        dicaNoite: DICA_NOITE_EXTERNO,
    },
    traseira: {
        rotulo: 'Traseira com placa',
        instrucao: 'Chega 2 passos de distância: placa e lanternas no quadro, porta do baú fechada',
        dicaNoite: DICA_NOITE_EXTERNO,
    },
    painel: {
        rotulo: 'Painel (KM e luzes)',
        instrucao: 'Porta fechada e chave ligada: pega o painel inteiro, com KM, combustível e luzes. Sem flash',
        dicaNoite: 'Sem flash: ele reflete no vidro. Incline um pouco o celular pra tirar o reflexo.',
    },
    agua_radiador: {
        rotulo: 'Água do radiador',
        instrucao: 'Abre o capô e chega a 30 cm: o reservatório inteiro, com as letras MIN e MAX',
        dicaNoite: 'Se o plástico for sujo, acende a lanterna atrás dele: o nível aparece como sombra.',
    },
    vareta_oleo: {
        rotulo: 'Vareta de óleo',
        instrucao: 'Tira a vareta, limpa, enfia até o fim e puxa de novo. Chega a 20 cm da pontinha, ela ocupando a foto, num fundo claro',
        dicaNoite: 'Use o flash e um fundo claro (pano, papel ou a tampa do motor) atrás da vareta.',
    },
    bau: {
        rotulo: 'Baú por dentro',
        instrucao: 'Abre o baú e pega o interior inteiro, mostrando limpeza e organização',
        dicaNoite: 'Use o flash da câmera.',
    },
    porta_malas: {
        rotulo: 'Porta-malas',
        instrucao: 'Abre o porta-malas e pega tudo: bolsas no lugar e o piso limpo',
        dicaNoite: 'Use o flash da câmera.',
    },
};

// Ordem e regra de cada ângulo, por tipo de veículo.
// condicional + condicao: obrigatório só quando a condição vale (vareta: segunda/quinta ou luz de óleo).
// Grupos (ordem guiada): 1 fora -> 2 painel -> 3 capô -> 4 baú/porta-malas
const GRUPO_POR_ANGULO = {
    frente: 'FORA', lateral_direita: 'FORA', lateral_esquerda: 'FORA', traseira: 'FORA',
    painel: 'PAINEL',
    agua_radiador: 'CAPO', vareta_oleo: 'CAPO',
    bau: 'CARGA', porta_malas: 'CARGA',
};
const DICA_GRUPO = {
    FORA: 'Fotos de fora com o capô fechado',
    PAINEL: 'Porta fechada, chave ligada, sem flash',
    CAPO: 'Agora pode abrir o capô',
    CARGA: 'Por último, abre o baú ou o porta-malas',
};

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
        grupo: GRUPO_POR_ANGULO[angulo],
        dicaGrupo: DICA_GRUPO[GRUPO_POR_ANGULO[angulo]],
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

module.exports = { GRUPO_POR_ANGULO, DICA_GRUPO, TIPOS_VEICULO, ANGULOS, SLOTS_POR_TIPO, CONDICIONAIS, CHAVE_RESUMO, tipoValido, slotsDoTipo, anguloDoTipo };
