import { createContext, useContext } from 'react';

// Onde as telas do Como Fazer estão montadas: '/como-fazer' (app) ou '/setor/<slug>' (tablet).
// Todas as telas navegam relativas a isto — assim as MESMAS telas servem aos dois jeitos de entrar.
const Ctx = createContext({ base: '/como-fazer', tablet: false, slug: '' });
export const BaseComoFazerProvider = Ctx.Provider;
export const useBaseComoFazer = () => useContext(Ctx);
