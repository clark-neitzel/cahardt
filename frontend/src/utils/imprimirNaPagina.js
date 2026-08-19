// Impressão DENTRO da própria página — funciona no PWA e no iPad/iOS.
//
// Por que não window.open nem iframe: no iPad o Safari imprime a página principal
// (sai em branco, ou só o endereço do site) e às vezes trava as impressões seguintes.
//
// Estratégia "o que se vê é o que imprime": ao imprimir, o app é escondido em QUALQUER
// media (classe `modo-impressao` no <html> com display:none — não só @media print) e a
// folha vira o conteúdo normal do documento, com largura explícita em mm. Assim, o que
// quer que o iPad fotografe (tela ou print media), sai a folha na largura certa.
//
// As regras de restauração abaixo repetem, de propósito, o que foi aprendido na tela de
// Receitas (PCP/ReceitaDetalhe.jsx, versão v10) — NÃO simplificar sem ler os comentários:
//   • visibilitychange / focus / blur NÃO restauram (o WebKit do iPad dispara os três com
//     a prévia ainda aberta; restaurar ali faz o app sair impresso no lugar da folha);
//   • o media 'print' LIGAR é prova de que imprimiu; DESLIGAR não é prova de que terminou;
//   • sem esse selo, exige-se DOIS toques (o toque em "Permitir" do alerta do Safari
//     chega na página e não pode restaurar sozinho);
//   • sempre existe um caminho de volta: teto absoluto de 10 min desde o print().

let limpezaPendente = null;

/**
 * @param {string} estilos   CSS da folha (pode conter @page; ele é içado para o nível raiz)
 * @param {string} corpoHtml HTML do conteúdo a imprimir
 */
export function imprimirNaPagina(estilos, corpoHtml) {
    const ID_AREA = 'area-impressao';
    const ID_ESTILO = 'estilo-impressao';
    const MODO = 'modo-impressao';

    limpezaPendente?.();               // desarma listeners/timer de uma impressão anterior
    document.getElementById(ID_AREA)?.remove();
    document.getElementById(ID_ESTILO)?.remove();
    document.documentElement.classList.remove(MODO);

    // @page tem que ficar no nível raiz (iOS não lida bem com @page dentro de @media).
    const estilosSemPage = (estilos || '').replace(/@page\s*{[^}]*}/g, '');
    const regraPage = ((estilos || '').match(/@page\s*{[^}]*}/) || ['@page { size: A4 portrait; margin: 12mm; }'])[0];

    const style = document.createElement('style');
    style.id = ID_ESTILO;
    style.textContent = `
        ${regraPage}
        html.${MODO}, html.${MODO} body {
            margin: 0 !important; padding: 0 !important; background: #fff !important;
            width: auto !important; min-width: 0 !important; max-width: none !important;
            height: auto !important; min-height: 0 !important;
            overflow: visible !important;
        }
        html.${MODO} body > *:not(#${ID_AREA}) { display: none !important; }
        /* Largura da área útil do A4 (210 - 2x12mm). Sem largura explícita o WebKit amplia
           a folha no "scale to fit". */
        html.${MODO} #${ID_AREA} { display: block; width: 186mm; max-width: 100%; margin: 0 auto; }
        html.${MODO} #${ID_AREA}, html.${MODO} #${ID_AREA} * {
            -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
        }
        ${estilosSemPage}
        @media print {
            html.${MODO} body > *:not(#${ID_AREA}) { display: none !important; visibility: hidden !important; }
            html.${MODO} #${ID_AREA}, html.${MODO} #${ID_AREA} * { visibility: visible !important; }
            #${ID_AREA} * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
    `;
    document.head.appendChild(style);

    const area = document.createElement('div');
    area.id = ID_AREA;
    area.innerHTML = corpoHtml;
    document.body.appendChild(area);
    document.documentElement.classList.add(MODO);

    let momentoPrint = 0;
    let timerFallback = 0;
    let houvePrint = false;   // o aparelho confirmou que a impressão começou (media 'print')
    let toques = 0;
    let ultimoToque = 0;
    const mqPrint = typeof window.matchMedia === 'function' ? window.matchMedia('print') : null;

    const limpar = () => {
        area.remove();
        style.remove();
        document.documentElement.classList.remove(MODO);
        window.removeEventListener('afterprint', aoAfterPrint);
        window.removeEventListener('pointerdown', aoInteragir);
        window.removeEventListener('keydown', aoInteragir);
        if (mqPrint) {
            if (mqPrint.removeEventListener) mqPrint.removeEventListener('change', aoMudarMedia);
            else if (mqPrint.removeListener) mqPrint.removeListener(aoMudarMedia);
        }
        clearTimeout(timerFallback);
        if (limpezaPendente === limpezaDesta) limpezaPendente = null;
    };
    const limpezaDesta = () => limpar();

    const imprimindoAgora = () => !!(mqPrint && mqPrint.matches);

    const aoInteragir = (ev) => {
        if (!momentoPrint) return;
        if (ev?.type === 'keydown' && ev?.repeat === true) return;   // tecla segurada não é gesto novo
        if (imprimindoAgora()) return;                               // imprimindo: nunca restaurar
        const agora = Date.now();
        if (agora - momentoPrint < 800) return;                      // eco do clique que abriu a impressão
        if (agora - ultimoToque < 700) return;                       // rajada de um gesto só
        ultimoToque = agora;
        toques++;
        if (houvePrint) { limpar(); return; }                        // já imprimiu: 1 toque basta
        if (toques >= 2 && agora - momentoPrint > 5000) limpar();    // sem selo: 2 toques
    };

    const aoMudarMedia = (e) => { if (e.matches) houvePrint = true; };
    const aoAfterPrint = () => limpar();

    const TETO_ABSOLUTO_MS = 600000;   // 10 min desde o print() — sempre há caminho de volta
    const PASSO_FALLBACK_MS = 180000;  // 3 min entre verificações
    const armarFallback = () => {
        const restante = momentoPrint ? TETO_ABSOLUTO_MS - (Date.now() - momentoPrint) : TETO_ABSOLUTO_MS;
        const espera = Math.max(1000, Math.min(PASSO_FALLBACK_MS, restante));
        timerFallback = setTimeout(() => {
            const estourou = momentoPrint ? Date.now() - momentoPrint >= TETO_ABSOLUTO_MS : true;
            if (imprimindoAgora() && !estourou) { armarFallback(); return; }
            limpar();
        }, espera);
    };

    window.addEventListener('afterprint', aoAfterPrint);
    window.addEventListener('pointerdown', aoInteragir);
    window.addEventListener('keydown', aoInteragir);
    if (mqPrint) {
        if (mqPrint.addEventListener) mqPrint.addEventListener('change', aoMudarMedia);
        else if (mqPrint.addListener) mqPrint.addListener(aoMudarMedia);
    }
    armarFallback();
    limpezaPendente = limpezaDesta;

    // print() SÍNCRONO no clique (sem setTimeout) — senão o iOS bloqueia com
    // "site proibido de imprimir automaticamente".
    void area.offsetHeight;   // força o layout já com o modo aplicado
    momentoPrint = Date.now();
    try { window.print(); } catch { limpar(); }
}

// Escapa texto que vai para dentro do HTML da folha (nome de cliente com & ou <).
export function escaparHtml(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export default imprimirNaPagina;
