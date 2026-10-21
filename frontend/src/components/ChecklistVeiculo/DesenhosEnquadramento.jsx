import React from 'react';

// Desenhos simples de como enquadrar cada foto (copiados da proposta aprovada).
// Tinta = currentColor (acompanha o texto do pai); verde primário, vermelho e dourado fixos.
const PRIMARIO = '#00754A';
const VERMELHO = '#c82014';
const DOURADO = '#cba258';
const MENTA = '#d4e9e2';
const LINHA = '#d6dbde';
const PAPEL = '#f2f0eb';

const Moldura = () => <rect x="8" y="8" width="284" height="134" rx="10" fill="none" stroke={LINHA} />;
const Camera = ({ x, y }) => (
    <g><rect x={x} y={y} width="26" height="20" rx="4" fill={PRIMARIO} /><circle cx={x + 13} cy={y + 10} r="5" fill="#fff" /></g>
);

const Frente = () => (
    <>
        <Moldura />
        <rect x="70" y="30" width="110" height="60" rx="8" fill="none" stroke="currentColor" strokeWidth="2" />
        <rect x="80" y="38" width="90" height="26" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <rect x="110" y="78" width="30" height="8" rx="2" fill="currentColor" />
        <rect x="74" y="88" width="18" height="18" rx="3" fill="currentColor" /><rect x="158" y="88" width="18" height="18" rx="3" fill="currentColor" />
        <rect x="60" y="22" width="130" height="92" rx="6" fill="none" stroke={PRIMARIO} strokeWidth="2" strokeDasharray="5 4" />
        <line x1="190" y1="70" x2="250" y2="70" stroke={PRIMARIO} strokeWidth="2" />
        <text x="220" y="62" fontSize="11" textAnchor="middle" fill={PRIMARIO} fontWeight="700">2 passos</text>
        <Camera x={252} y={60} />
        <text x="125" y="132" fontSize="11" textAnchor="middle" fill="currentColor">placa + farol + as 2 rodas dentro do quadro</text>
    </>
);

const Lateral = ({ espelhar }) => (
    <>
        <Moldura />
        <g transform={espelhar ? 'translate(300 0) scale(-1 1)' : undefined}>
            <rect x="40" y="40" width="130" height="50" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
            <rect x="172" y="55" width="60" height="35" rx="6" fill="none" stroke="currentColor" strokeWidth="2" />
            <rect x="178" y="60" width="26" height="14" rx="2" fill="none" stroke="currentColor" />
            <circle cx="75" cy="96" r="10" fill="currentColor" /><circle cx="205" cy="96" r="10" fill="currentColor" />
            <rect x="30" y="30" width="212" height="82" rx="6" fill="none" stroke={PRIMARIO} strokeWidth="2" strokeDasharray="5 4" />
            <Camera x={123} y={118} />
        </g>
        <text x={espelhar ? 24 : 210} y="134" fontSize="11" fill={PRIMARIO} fontWeight="700">4 passos, no meio</text>
    </>
);

const Painel = () => (
    <>
        <Moldura />
        <path d="M60 110 A95 95 0 0 1 240 110" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="105" cy="78" r="22" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="195" cy="78" r="22" fill="none" stroke="currentColor" strokeWidth="2" />
        <rect x="135" y="70" width="30" height="12" rx="2" fill="currentColor" />
        <circle cx="150" cy="56" r="4" fill={VERMELHO} />
        <rect x="80" y="40" width="140" height="62" rx="6" fill="none" stroke={PRIMARIO} strokeWidth="2" strokeDasharray="5 4" />
        <text x="150" y="128" fontSize="11" textAnchor="middle" fill="currentColor">porta fechada · chave ligada · sem flash · KM legível</text>
    </>
);

const Agua = () => (
    <>
        <Moldura />
        <path d="M110 30 h60 v18 l12 10 v62 h-84 v-62 l12 -10 z" fill="none" stroke="currentColor" strokeWidth="2" />
        <line x1="98" y1="70" x2="120" y2="70" stroke="currentColor" strokeWidth="2" /><text x="124" y="74" fontSize="9" fill="currentColor">MAX</text>
        <line x1="98" y1="100" x2="120" y2="100" stroke="currentColor" strokeWidth="2" /><text x="124" y="104" fontSize="9" fill="currentColor">MIN</text>
        <rect x="100" y="84" width="80" height="34" fill={MENTA} opacity=".9" />
        <path d="M220 60 l20 0 l8 -8 v40 l-8 -8 l-20 0 z" fill={DOURADO} />
        <path d="M218 75 l-30 0" stroke={DOURADO} strokeWidth="3" strokeDasharray="4 3" />
        <rect x="86" y="24" width="110" height="102" rx="6" fill="none" stroke={PRIMARIO} strokeWidth="2" strokeDasharray="5 4" />
        <text x="150" y="138" fontSize="10" textAnchor="middle" fill="currentColor">30 cm · reservatório inteiro · lanterna atrás se opaco</text>
    </>
);

// variante: 'PLASTICO_QUADRICULADA' (plástico laranja) | 'METAL_MARCAS' (metal com duas marcas) | outra (genérico)
const Vareta = ({ variante }) => (
    <>
        <Moldura />
        <rect x="40" y="30" width="220" height="90" rx="4" fill={PAPEL} stroke={LINHA} />
        <line x1="40" y1="75" x2="120" y2="75" stroke="currentColor" strokeWidth="4" />
        {variante === 'METAL_MARCAS' ? (
            <>
                <rect x="120" y="69" width="120" height="12" rx="3" fill="#aeb4b8" />
                <line x1="165" y1="66" x2="165" y2="84" stroke="#1E3932" strokeWidth="2" />
                <line x1="205" y1="66" x2="205" y2="84" stroke="#1E3932" strokeWidth="2" />
                <rect x="165" y="69" width="40" height="12" fill="#3a2a10" opacity=".45" />
                <text x="185" y="100" fontSize="9" textAnchor="middle" fill="currentColor">óleo entre as 2 marcas = OK</text>
            </>
        ) : (
            <>
                <rect x="120" y="66" width="120" height="18" rx="9" fill="#d9772b" />
                <rect x="150" y="69" width="60" height="12" fill="none" stroke="#1E3932" strokeWidth="1" />
                <path d="M150 69 l60 12 M150 81 l60 -12 M165 69 l45 12 M150 72 l45 9" stroke="#1E3932" strokeWidth=".7" />
                <rect x="165" y="69" width="36" height="12" fill="#3a2a10" opacity=".55" />
                <text x="180" y="100" fontSize="9" textAnchor="middle" fill="currentColor">óleo molhando dentro do quadriculado = OK</text>
            </>
        )}
        <rect x="110" y="56" width="140" height="38" rx="6" fill="none" stroke={PRIMARIO} strokeWidth="2" strokeDasharray="5 4" />
        <text x="150" y="136" fontSize="11" textAnchor="middle" fill="currentColor">20 cm · a ponta ocupa a foto · qualquer fundo claro</text>
    </>
);

const Traseira = () => (
    <>
        <Moldura />
        <rect x="80" y="28" width="140" height="80" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
        <line x1="150" y1="28" x2="150" y2="108" stroke="currentColor" strokeWidth="1.5" />
        <rect x="86" y="92" width="14" height="10" fill={VERMELHO} /><rect x="200" y="92" width="14" height="10" fill={VERMELHO} />
        <rect x="135" y="96" width="30" height="8" rx="2" fill="currentColor" />
        <rect x="70" y="18" width="160" height="100" rx="6" fill="none" stroke={PRIMARIO} strokeWidth="2" strokeDasharray="5 4" />
        <line x1="232" y1="70" x2="258" y2="70" stroke={PRIMARIO} strokeWidth="2" />
        <Camera x={260} y={60} />
        <text x="150" y="134" fontSize="11" textAnchor="middle" fill="currentColor">2 passos · porta do baú fechada e trancada</text>
    </>
);

const Interior = ({ texto }) => (
    <>
        <Moldura />
        <rect x="50" y="30" width="200" height="80" rx="6" fill="none" stroke="currentColor" strokeWidth="2" />
        <rect x="64" y="70" width="40" height="30" rx="3" fill="none" stroke="currentColor" />
        <rect x="112" y="78" width="50" height="22" rx="3" fill="none" stroke="currentColor" />
        <rect x="40" y="22" width="220" height="96" rx="6" fill="none" stroke={PRIMARIO} strokeWidth="2" strokeDasharray="5 4" />
        <text x="150" y="134" fontSize="11" textAnchor="middle" fill="currentColor">{texto}</text>
    </>
);

const DESCRICAO = {
    frente: 'frente a 2 passos, com as duas rodas dentro do quadro',
    lateral_direita: 'lateral inteira a 4 passos, no meio do veículo',
    lateral_esquerda: 'lateral inteira a 4 passos, no meio do veículo',
    traseira: 'traseira a 2 passos, porta do baú fechada',
    painel: 'painel visto do banco, porta fechada, sem flash',
    agua_radiador: 'reservatório de água inteiro com MIN e MAX, a 30 cm',
    vareta_oleo: 'ponta da vareta ocupando o quadro, a 20 cm, em fundo claro',
    bau: 'interior do baú inteiro',
    porta_malas: 'porta-malas inteiro',
};

/** Desenho de enquadramento do ângulo. `variante` = tipoVareta (só vale para a vareta). */
const DesenhoEnquadramento = ({ angulo, variante, className = '' }) => {
    let conteudo;
    switch (angulo) {
        case 'frente': conteudo = <Frente />; break;
        case 'lateral_direita': conteudo = <Lateral />; break;
        case 'lateral_esquerda': conteudo = <Lateral espelhar />; break;
        case 'traseira': conteudo = <Traseira />; break;
        case 'painel': conteudo = <Painel />; break;
        case 'agua_radiador': conteudo = <Agua />; break;
        case 'vareta_oleo': conteudo = <Vareta variante={variante} />; break;
        case 'bau': conteudo = <Interior texto="baú aberto · interior inteiro no quadro" />; break;
        case 'porta_malas': conteudo = <Interior texto="porta-malas aberto · tudo no quadro" />; break;
        default: return null;
    }
    return (
        <svg viewBox="0 0 300 150" role="img" aria-label={`Desenho: ${DESCRICAO[angulo] || 'enquadramento'}`}
            className={`w-full h-auto text-gray-800 rounded-xl bg-white border border-gray-200 ${className}`}>
            {conteudo}
        </svg>
    );
};

export default DesenhoEnquadramento;
