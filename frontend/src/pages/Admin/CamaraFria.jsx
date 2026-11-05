import { useEffect } from 'react';

// A ferramenta é uma página estática (public/mapa-camara-fria.html). Navega a janela
// inteira — nada de iframe/window.open (a impressão sairia em branco no iPad).
export default function CamaraFria() {
    // replace (não assign): senão o botão voltar cai de novo nesta rota e re-redireciona,
    // prendendo o usuário no mapa — pior no iPad/PWA, sem barra de endereço.
    useEffect(() => { window.location.replace('/mapa-camara-fria.html'); }, []);
    return (
        <div className="flex items-center justify-center p-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
    );
}
