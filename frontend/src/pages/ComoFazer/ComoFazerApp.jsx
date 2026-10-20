import { Navigate, Route, Routes } from 'react-router-dom';
import { BaseComoFazerProvider } from '../../components/ComoFazer/BaseComoFazer';
import Checklist from '../../components/ComoFazer/Checklist';
import ComoFazerHome from './ComoFazerHome';
import ConteudoPagina from './ConteudoPagina';

// /como-fazer/* — as mesmas telas do tablet, para quem está logado no app.
export default function ComoFazerApp() {
    return (
        <BaseComoFazerProvider value={{ base: '/como-fazer', tablet: false, slug: '' }}>
            <Routes>
                <Route index element={<ComoFazerHome />} />
                <Route path="c/:id" element={<ConteudoPagina />} />
                <Route path="fazer/:id" element={<Checklist />} />
                <Route path="*" element={<Navigate to="/como-fazer" replace />} />
            </Routes>
        </BaseComoFazerProvider>
    );
}
