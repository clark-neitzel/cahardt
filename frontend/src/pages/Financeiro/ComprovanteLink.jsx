import React from 'react';
import { ExternalLink } from 'lucide-react';

// Link "Comprovante" (recibo do PIX/pagamento do Asaas). Só aparece quando o backend
// manda comprovanteUrl (http/https); sem ele não renderiza nada.
const ComprovanteLink = ({ url, className = '' }) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null;
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primaryDark underline min-h-[44px] md:min-h-0 py-1 ${className}`}
        >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" /> Comprovante
        </a>
    );
};

export default ComprovanteLink;
