// Abre um link externo (Google Maps etc.) a partir de um handler de clique.
//
// NÃO usar window.open() para isso: no app instalado (PWA standalone, iOS),
// window.open abre primeiro uma janela EM BRANCO dentro do app — o usuário
// precisa fechá-la na mão. Um <a target="_blank"> clicado no mesmo gesto do
// usuário abre o link direto (inclusive acionando o app do Google Maps),
// igual aos links de mapa que já existem como <a> pelo sistema.
export function abrirLinkExterno(url) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

export default abrirLinkExterno;
