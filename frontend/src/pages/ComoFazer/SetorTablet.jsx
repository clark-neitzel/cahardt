import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { BaseComoFazerProvider } from '../../components/ComoFazer/BaseComoFazer';
import Checklist from '../../components/ComoFazer/Checklist';
import EntrarSetor from './EntrarSetor';
import ComoFazerHome from './ComoFazerHome';
import ConteudoPagina from './ConteudoPagina';
import { useSessaoTablet } from './hooks/useSessaoTablet';

// /setor/:slug/* — rota PÚBLICA do tablet (sem login do app). Sem sessão → grade de fotos.
// Com sessão → as mesmas telas do app, montadas sob /setor/<slug>.
export default function SetorTablet() {
    const { slug: slugRota } = useParams();
    const slug = String(slugRota || '').toLowerCase();
    const sessao = useSessaoTablet();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const base = `/setor/${slug}`;

    // Caiu a sessão (inatividade, token vencido, Sair): volta para a grade, nunca para o login.
    useEffect(() => {
        if (!sessao && pathname !== base && pathname !== `${base}/`) navigate(base, { replace: true });
    }, [sessao, pathname, base, navigate]);

    if (!sessao || sessao.slug !== slug) return <EntrarSetor slug={slug} />;

    return (
        <BaseComoFazerProvider value={{ base, tablet: true, slug }}>
            <div className="min-h-screen bg-secondary">
                <Routes>
                    <Route index element={<ComoFazerHome />} />
                    <Route path="c/:id" element={<ConteudoPagina />} />
                    <Route path="fazer/:id" element={<Checklist />} />
                    <Route path="*" element={<Navigate to={base} replace />} />
                </Routes>
            </div>
        </BaseComoFazerProvider>
    );
}
