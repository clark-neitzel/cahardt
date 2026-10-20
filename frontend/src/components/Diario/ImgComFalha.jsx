import React, { useState, useEffect } from 'react';
import { ImageOff } from 'lucide-react';

export const MSG_FOTO_PERDIDA = 'Foto não encontrada no servidor. Envie novamente.';

/** <img> que, se o arquivo sumiu do servidor (404), troca por um aviso explicando. */
const ImgComFalha = ({ src, alt, className = '', compacto = false, ...resto }) => {
    const [falhou, setFalhou] = useState(false);
    useEffect(() => { setFalhou(false); }, [src]);
    if (falhou) {
        return (
            <div role="img" aria-label={alt} title={MSG_FOTO_PERDIDA}
                className={`${className} flex flex-col items-center justify-center bg-gray-50 text-gray-500 text-center overflow-hidden`}>
                <ImageOff className={compacto ? 'h-4 w-4 text-gray-400' : 'h-7 w-7 mb-1 text-gray-400'} />
                {!compacto && <span className="text-[11px] px-2">{MSG_FOTO_PERDIDA}</span>}
            </div>
        );
    }
    return <img src={src} alt={alt} className={className} onError={() => setFalhou(true)} {...resto} />;
};

export default ImgComFalha;
