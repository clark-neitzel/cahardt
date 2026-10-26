// Catálogo ÚNICO dos ângulos do checklist de veículo por foto.
// O frontend NUNCA repete esta lista: recebe tudo por GET /api/veiculos/:id/checklist-config.

const TIPOS_VEICULO = ['CARGA', 'PASSEIO', 'PARTICULAR'];

const DICA_NOITE_EXTERNO = 'Pouca luz? Ligue o flash da câmera antes de bater a foto.';

const ANGULOS = {
    frente: {
        rotulo: 'Frente com placa',
        instrucao: 'Chega 2 passos (uns 3 m) de distância: a frente do carro inteira e a placa legível dentro do quadro. Capô fechado',
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

// Foto extra opcional (Dia 2): 2ª foto do mesmo ângulo. Não passa por IA, nunca bloqueia.
const COMPLEMENTO_ROTULO = {
    agua_radiador: 'Foto de cima, com a tampa aberta',
    vareta_oleo: 'Foto da ponta da vareta, bem de perto',
};

const CONDICIONAIS = {
    vareta_oleo: 'SEGUNDA_QUINTA_OU_LUZ_OLEO',
};

// ── Momento VOLTA (Dia 3): fim do dia. 3 fotos obrigatórias; as laterais só valem se o motorista
// disse que bateu/raspou em algo. Frontend NUNCA repete esta lista (vem em checklist-config?momento=VOLTA).
const SLOTS_VOLTA_POR_TIPO = {
    CARGA: ['painel', 'traseira', 'bau', 'lateral_direita', 'lateral_esquerda'],
    PASSEIO: ['painel', 'traseira', 'porta_malas', 'lateral_direita', 'lateral_esquerda'],
    PARTICULAR: ['painel'],
};
// Laterais da volta: opcionais; viram obrigatórias quando bateuOuRaspou === true.
const CONDICIONAIS_VOLTA = {
    lateral_direita: 'BATEU_OU_RASPOU',
    lateral_esquerda: 'BATEU_OU_RASPOU',
};
// Textos próprios da volta (sobrepõem o ANGULOS da saída).
const ANGULOS_VOLTA = {
    painel: {
        instrucao: 'Porta fechada e chave ligada: pega o painel inteiro, com o KM. Sem flash',
    },
    traseira: {
        instrucao: 'Chega 2 passos de distância: placa e lanternas no quadro, porta do baú fechada',
    },
    bau: {
        rotulo: 'Baú por dentro (vazio e limpo)',
        instrucao: 'Abre o baú e pega o interior inteiro: tem que estar vazio e limpo, sem sobra de produto nem lixo',
    },
    porta_malas: {
        rotulo: 'Porta-malas (vazio e limpo)',
        instrucao: 'Abre o porta-malas e pega tudo: vazio e limpo (só ficam as bolsas, se elas moram no carro)',
    },
    lateral_direita: { rotulo: 'Lateral direita (onde bateu/raspou)', instrucao: 'Fica 4 passos (uns 5 m) de distância: o carro inteiro, com as duas rodas' },
    lateral_esquerda: { rotulo: 'Lateral esquerda (onde bateu/raspou)', instrucao: 'Fica 4 passos (uns 5 m) de distância: o carro inteiro, com as duas rodas' },
};

// Dicas de grupo da volta (sem falar de capô)
const DICA_GRUPO_VOLTA = {
    PAINEL: 'Porta fechada, chave ligada, sem flash',
    FORA: 'Fotos de fora, com o carro parado no pátio',
    CARGA: 'Abre o baú ou o porta-malas: tem que estar vazio e limpo',
};

const ehVolta = (momento) => momento === 'VOLTA';

function tipoValido(tipo) {
    return TIPOS_VEICULO.includes(tipo);
}

function listaDoTipo(tipo, momento) {
    const base = ehVolta(momento) ? SLOTS_VOLTA_POR_TIPO : SLOTS_POR_TIPO;
    return base[tipoValido(tipo) ? tipo : 'CARGA'];
}

/** Lista de slots (sem foto modelo) do tipo, na ordem. `momento` padrão SAIDA (contrato do Dia 1 intacto). */
function slotsDoTipo(tipo, momento) {
    const volta = ehVolta(momento);
    const cond = volta ? CONDICIONAIS_VOLTA : CONDICIONAIS;
    return listaDoTipo(tipo, momento).map((angulo, i) => ({
        angulo,
        ...ANGULOS[angulo],
        ...(volta ? (ANGULOS_VOLTA[angulo] || {}) : {}),
        ordem: i + 1,
        grupo: GRUPO_POR_ANGULO[angulo],
        dicaGrupo: volta ? (DICA_GRUPO_VOLTA[GRUPO_POR_ANGULO[angulo]] || DICA_GRUPO[GRUPO_POR_ANGULO[angulo]]) : DICA_GRUPO[GRUPO_POR_ANGULO[angulo]],
        condicional: !!cond[angulo],
        condicao: cond[angulo] || null,
    }));
}

function anguloDoTipo(tipo, angulo, momento) {
    return (listaDoTipo(tipo, momento) || []).includes(angulo);
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

module.exports = { SLOTS_VOLTA_POR_TIPO, CONDICIONAIS_VOLTA, ehVolta, COMPLEMENTO_ROTULO, GRUPO_POR_ANGULO, DICA_GRUPO, TIPOS_VEICULO, ANGULOS, SLOTS_POR_TIPO, CONDICIONAIS, CHAVE_RESUMO, tipoValido, slotsDoTipo, anguloDoTipo };
