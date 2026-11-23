// Configuração das duas telas que usam o MESMO motor (hook + componentes) de contar a carga no toque, offline:
//  • Separação de Carga (câmara fria)            → CONFIG_SEPARACAO   (comportamento e textos EXATAMENTE os de sempre)
//  • Conferência da Carga pelo motorista         → CONFIG_CONFERENCIA (docs/conferencia-motorista/PLANO.md)
import separacaoCargaService from '../../../services/separacaoCargaService';
import conferenciaMotoristaService from '../../../services/conferenciaMotoristaService';
import { criarStorage } from './separacaoStorage';

export const CONFIG_SEPARACAO = {
    tipo: 'SEPARACAO',
    prefixoStorage: 'separacao_carga_v1',
    storage: criarStorage('separacao_carga_v1'),
    service: separacaoCargaService,
    origemImpressao: 'SEPARACAO',
    chavePrefImpressora: 'etiquetas:impressora:SEPARACAO',
    rotaOffline: '/separacao-carga',
    rotuloEtiqueta: 'Bolsas Carga',
    idPrefixo: 'sep-',
    motivos: ['VEM_DEPOIS', 'NAO_TEM'],
    textos: {
        sem403: 'Você não tem permissão para separar cargas.',
        semLista403: 'Você não tem permissão para separar cargas.',
        concluido: 'Separação concluída. As faltas ficaram registradas.',
    },
};

export const CONFIG_CONFERENCIA = {
    tipo: 'CONFERENCIA',
    prefixoStorage: 'conferencia_motorista_v1',
    storage: criarStorage('conferencia_motorista_v1'),
    service: conferenciaMotoristaService,
    origemImpressao: 'CONFERENCIA',
    chavePrefImpressora: 'etiquetas:impressora:CONFERENCIA',
    rotaOffline: '/conferencia-motorista',
    rotuloEtiqueta: 'Bolsas (conferência) Carga',
    idPrefixo: 'conf-',
    motivos: ['NAO_VEIO', 'VEM_DEPOIS'],
    textos: {
        sem403: 'Você não tem permissão para conferir cargas.',
        semLista403: 'Você não tem permissão para conferir cargas.',
        concluido: 'Conferência concluída. As faltas ficaram registradas.',
    },
};
