import { Suspense } from 'react';
import { lazyComRetry } from '../../utils/lazyComRetry';

// Carrega o PDF do Como Fazer só quando alguém toca no botão (não pesa a tela). lazyComRetry: deploy novo não derruba.
const ModalPdf = lazyComRetry(() => import('./ModalPdf'));

export default function ModalPdfLazy(props) {
    return <Suspense fallback={null}><ModalPdf {...props} /></Suspense>;
}
