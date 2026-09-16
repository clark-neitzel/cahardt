// Detecta se o dispositivo tem ponteiro fino + hover (mouse/trackpad de desktop),
// ao contrário de touch puro (celular/iPad) — usado pra decidir quando é seguro
// devolver o foco automaticamente pra um campo (no touch isso abre o teclado
// virtual e rola a tela sem o usuário pedir).
export function temTecladoFisico() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    try {
        return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    } catch {
        return false;
    }
}
