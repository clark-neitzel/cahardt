import { useState } from 'react';
import { urlMidia } from '../../services/comoFazerService';

// Foto redonda do funcionário (ou as iniciais). Arquivo perdido não quebra: cai nas iniciais.
export default function FotoPessoa({ foto, nome = '', tamanho = 56, className = '' }) {
    const [falhou, setFalhou] = useState(false);
    const src = urlMidia(foto);
    const iniciais = String(nome || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
    const estilo = { width: tamanho, height: tamanho };
    if (src && !falhou) {
        return <img src={src} alt={nome || ''} style={estilo} onError={() => setFalhou(true)} className={`rounded-full object-cover bg-mint shrink-0 ${className}`} />;
    }
    return (
        <span style={{ ...estilo, fontSize: Math.max(12, tamanho / 2.6) }} className={`rounded-full bg-mint text-primaryDark font-extrabold flex items-center justify-center shrink-0 ${className}`}>
            {iniciais}
        </span>
    );
}
