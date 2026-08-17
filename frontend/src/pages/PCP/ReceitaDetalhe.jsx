import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Copy, Calculator, Trash2, History, ChevronRight, Printer, Download, Loader2, X, Share, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import pcpReceitaService from '../../services/pcpReceitaService';
import pcpItemService from '../../services/pcpItemService';
import SimuladorEscalonamento from './SimuladorEscalonamento';
import { usePdfImpressao } from '../../utils/abrirPdfImpressao';

const STATUS_CORES = {
    ativa: 'bg-green-100 text-green-800',
    inativa: 'bg-gray-100 text-gray-600',
    rascunho: 'bg-yellow-100 text-yellow-800',
};

const TIPO_CORES = {
    MP: 'bg-amber-100 text-amber-800',
    SUB: 'bg-purple-100 text-purple-800',
    PA: 'bg-green-100 text-green-800',
    EMB: 'bg-blue-100 text-blue-800',
};

const ETAPA_LABELS = {
    preparo: 'Preparo',
    modelagem: 'Modelagem',
    fritura: 'Fritura',
    embalagem: 'Embalagem',
};

const TIPO_LABELS = {
    MP: 'Matéria-prima',
    SUB: 'Subproduto',
    PA: 'Produto acabado',
    EMB: 'Embalagem',
};

// Unidade exibida: a do PRODUTO (editável no app) tem prioridade; cai para a do item PCP (subprodutos não têm produto)
function unidadeDe(itemPcp) {
    return itemPcp?.produto?.unidade || itemPcp?.unidade || '';
}

// ⚠️ MECANISMO ANTIGO DE IMPRESSÃO — DE PROPÓSITO SEM USO NA TELA (08/2026).
// Os botões passaram a abrir o PDF gerado no servidor (ver o bloco "IMPRESSÃO EM PDF" mais
// abaixo). Todo o código a seguir — imprimirConteudo / imprimirHtml, os dois montarHtml*, o
// registro de diagnóstico e a pílula "IMPR v10" — fica no arquivo como REDE DE SEGURANÇA até
// o dono aprovar o PDF em produção. NÃO apagar: a limpeza é uma entrega à parte, combinada.
// (Nada aqui roda sozinho; só o quadro de diagnóstico da pílula ainda é lido pela tela.)
//
// Impressão dentro do PWA — funciona no iPad/iOS (onde imprimir um iframe sai em branco/só URL).
// Estratégia "o que se vê é o que imprime": no momento de imprimir, o app é escondido em
// QUALQUER media (classe no <html> com display:none, não só @media print) e a folha vira o
// conteúdo normal e visível da página. Motivo: no iPad (AirPrint/preview, PWA standalone) o
// snapshot de impressão às vezes usa a renderização de TELA ou aplica o @media print pela
// metade — o padrão antigo (folha display:none em tela + inversão só no print media) fazia
// sair a tela do app; e os irmãos colapsados a width:0 deixavam a largura do documento
// indefinida, e o WebKit ampliava a folha no "scale to fit". Depois restauramos tudo.

// Limpeza da impressão ANTERIOR que ainda não rodou (no iOS o afterprint pode nunca
// disparar). Precisa ser desarmada antes de começar uma impressão nova: senão o
// listener velho dispara no meio da nova (guarda de tempo dele já vencida) e tira a
// classe modo-impressao — o app reaparece e é ELE que sai impresso.
let limpezaPendente = null;

// ---- Diagnóstico embarcado da impressão (v9) ----------------------------------------
// Quatro tentativas de correção falharam porque ninguém enxerga o que o iPad faz durante a
// impressão (não há console). Agora cada impressão grava uma linha por evento — o instante
// (ms desde o window.print()) e o nome do evento — em memória E no localStorage, para
// sobreviver ao PWA ser fechado. O dono abre pela pílula "IMPR v10" na tela da receita e
// fotografa. NADA disso interfere na impressão: são gravações síncronas e minúsculas.
const CHAVE_LOG_IMPRESSAO = 'pcp:log-impressao';
const MAX_EVENTOS_LOG = 200;  // teto de linhas do registro (o array inteiro é reserializado a cada evento)
let registroImpressao = [];   // [{ ms, ev }] da impressão corrente

function lerLogImpressao() {
    try { return JSON.parse(localStorage.getItem(CHAVE_LOG_IMPRESSAO) || 'null'); }
    catch { return null; }
}

function formatarLogImpressao(log) {
    if (!log) return 'Nenhuma impressão registrada neste aparelho ainda.';
    const eventos = Array.isArray(log.eventos) ? log.eventos : [];
    return [
        `Quando: ${log.quando || '—'}`,
        `Folha: ${log.folha || '—'}`,
        `Do toque até o print(): ${log.latenciaGestoMs == null ? '—' : `${log.latenciaGestoMs} ms`}`,
        `Aparelho: ${log.ua || '—'}`,
        '',
        ...(eventos.length
            ? eventos.map(e => `${String(e.ms).padStart(6, ' ')} ms  ${e.ev}`)
            : ['(sem eventos)']),
    ].join('\n');
}

// Latência entre o gesto do usuário e a chamada de print(). É o número que encerra a dúvida
// sobre "o print() ainda está dentro do gesto?" — se for baixo (dezenas de ms) e o Safari
// ainda assim reclamar, o alerta não tem relação com atraso nosso.
function latenciaDoGesto(evento) {
    const t = evento && typeof evento.timeStamp === 'number' ? evento.timeStamp : null;
    if (t == null || t === 0) return null;
    // timeStamp normalmente é relativo à abertura da página (mesma base de performance.now());
    // em navegadores antigos vem em época (ms desde 1970) — daí a segunda conta.
    return Math.round(t > 1e12 ? Date.now() - t : performance.now() - t);
}

function imprimirConteudo(estilos, corpoHtml, evento, rotulo) {
    const ID_AREA = 'area-impressao';
    const ID_ESTILO = 'estilo-impressao';
    const MODO = 'modo-impressao';
    limpezaPendente?.();            // desarma listeners/timer da invocação anterior
    document.getElementById(ID_AREA)?.remove();
    document.getElementById(ID_ESTILO)?.remove();
    document.documentElement.classList.remove(MODO);

    // @page precisa ficar no nível raiz (iOS não lida bem com @page dentro de @media).
    // Preservamos o @page da PRÓPRIA folha quando existir (ex.: custos usa margin 14mm).
    const estilosSemPage = (estilos || '').replace(/@page\s*{[^}]*}/g, '');
    const regraPage = ((estilos || '').match(/@page\s*{[^}]*}/) || ['@page { size: A4 portrait; margin: 12mm; }'])[0];

    const style = document.createElement('style');
    style.id = ID_ESTILO;
    style.textContent = `
        ${regraPage}
        /* MODO IMPRESSÃO — vale em tela E impressão: o app some de verdade (display:none)
           e a folha é o documento normal da página, com largura explícita em mm.
           Assim, o que quer que o iPad fotografe (tela ou print media), sai a receita
           na largura certa. */
        html.${MODO}, html.${MODO} body {
            margin: 0 !important; padding: 0 !important; background: #fff !important;
            width: auto !important; min-width: 0 !important; max-width: none !important;
            height: auto !important; min-height: 0 !important;
            overflow: visible !important;
        }
        html.${MODO} body > *:not(#${ID_AREA}) { display: none !important; }
        /* Largura da área útil A4 (210 - 2x12mm); a .folha da própria receita se centraliza dentro.
           max-width 100% deixa a área encolher até a caixa da página quando o @page tem margem maior
           (ex.: folha de custos, 14mm), sem estourar a área útil. */
        html.${MODO} #${ID_AREA} { display: block; width: 186mm; max-width: 100%; margin: 0 auto; }
        /* Imprimir fundos/cores TAMBÉM fora do @media print: no iPad o print media pode ser
           aplicado pela metade (ou o snapshot sair da renderização de tela) e, sem o "exact",
           o WebKit descarta os fundos — o cabeçalho de etapa (fundo #111, texto branco) sairia
           branco no branco e o título da etapa sumiria da folha. */
        html.${MODO} #${ID_AREA}, html.${MODO} #${ID_AREA} * {
            -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
        }
        /* Estilos da própria folha (valem em tela e impressão — a folha É o documento agora).
           ATENÇÃO: estes seletores são genéricos (*, html, body, table, h1...) e entram no nível
           do documento. Só não afetam a interface porque o app já está escondido quando o
           navegador repinta — as linhas daqui até o classList.add(MODO) abaixo TÊM que continuar
           SÍNCRONAS (nada de await/setTimeout no meio), senão a tela pisca com a fonte da folha. */
        ${estilosSemPage}
        /* Reforço para quando o @media print É aplicado normalmente (desktop e parte dos iPads) */
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

    // ---- Restauração do app: só por sinais INEQUÍVOCOS de "a impressão acabou" ----
    // Bug real (iPad, Safari e Chrome — os dois são WebKit): a prévia começa CERTA e, depois de
    // alguns segundos, vira a tela do app — e é o app que sai impresso.
    // Causa: VISIBILIDADE e FOCO não são sinais confiáveis de "terminou" no WebKit do iPad.
    // Abrir o diálogo/prévia do AirPrint já dispara blur/visibilitychange na página, e o WebKit
    // pode marcar a página como 'hidden' e voltar a 'visible' COM A PRÉVIA AINDA ABERTA. Como
    // 'hidden'/'visible' vêm em par, qualquer bandeira do tipo "já saiu" é armada por esse pisca
    // e o 'visible' seguinte restaura o app no meio da prévia. Por isso 'blur', 'focus' e
    // 'visibilitychange' NÃO são mais gatilhos de restauração aqui — não reintroduzir.
    // Restauram o app apenas: afterprint (sinal definitivo no desktop), interação real do
    // usuário na página (pointerdown/keydown — enquanto a prévia está aberta o evento vai
    // para a UI do sistema, não para a página) e o timeout final. `wheel` é só LOG (ver adiante).
    // CONSEQUÊNCIA ACEITA (intencional): no iPad, depois de imprimir ou cancelar, o app só volta
    // no TOQUE na tela (dois toques quando o aparelho não confirmou que imprimiu). Um toque a
    // mais é melhor do que estragar a impressão.
    //
    // v9 — o vídeo do dono mostrou a sequência REAL no iPad e ela tem TRÊS gatilhos, não um:
    //   1) o Safari mostra "Este site foi proibido de imprimir automaticamente" (Ignorar/Permitir)
    //      ANTES de abrir o diálogo; o toque em "Permitir" chega na página como pointerdown e
    //      restaurava o app — aí o Safari fotografava a tela do app;
    //   2) o media 'print' liga e DESLIGA várias vezes enquanto a prévia se re-renderiza, com o
    //      diálogo ainda aberto — o antigo `if (!e.matches) limpar()` (sem guarda nenhuma)
    //      restaurava no meio da prévia;
    //   3) com o alerta + escolha de impressora, a impressão passa fácil dos 60s do timer antigo,
    //      que restaurava no meio.
    // Correção: (1) toque só restaura depois do selo de impressão, senão exige DOIS toques —
    // dispensar o alerta gera no máximo UM evento na página; (2) media print virou só selo,
    // nunca restaura; (3) timer de 180s que se re-agenda enquanto o media print estiver ativo.
    //
    // v10 — ajustes da revisão de código (nenhum deles muda a folha impressa):
    //   a) o re-agendamento do timer ganhou TETO ABSOLUTO de 10 min desde o print(): se o media
    //      'print' travar ligado (defeito conhecido do WebKit), o app volta assim mesmo — sem
    //      teto, nenhum toque restaurava e o timer se re-agendaria para sempre;
    //   b) só `media:on` liga o selo — beforeprint é apenas registrado (ver comentário adiante);
    //   c) toques contados exigem 700 ms de espaçamento e keydown com auto-repeat é ignorado,
    //      para que uma rajada de um gesto só não vire "dois toques";
    //   d) o log passou a registrar também os eventos descartados, e tem teto de 200 linhas;
    //   e) `wheel` deixou de restaurar (só entra no log): rolagem contínua de 700 ms+ atravessava
    //      a janela de colapso e virava "dois toques" com um gesto só. Detalhe em `aoInteragir`.
    let momentoPrint = 0;
    let timerFallback = 0;
    let houvePrint = false;   // selo: o aparelho confirmou que a impressão começou (só via media 'print')
    let toques = 0;
    let ultimoToque = 0;
    const mqPrint = typeof window.matchMedia === 'function' ? window.matchMedia('print') : null;

    // --- registro de diagnóstico desta impressão ---
    registroImpressao = [];
    const cabecalhoLog = {
        quando: new Date().toLocaleString('pt-BR'),
        folha: rotulo || '—',
        latenciaGestoMs: null,
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    };
    const registrar = (ev) => {
        registroImpressao.push({ ms: momentoPrint ? Date.now() - momentoPrint : 0, ev });
        // Teto de linhas: cada gravação reserializa o array inteiro no localStorage e eventos
        // repetitivos (wheel/pointerdown com o media print ativo) não têm colapso — sem teto,
        // uma impressão longa cresceria sem limite e deixaria a gravação cara. Guardamos as
        // 200 mais RECENTES, descartando as mais antigas (o fim é o que explica a restauração).
        if (registroImpressao.length > MAX_EVENTOS_LOG) {
            registroImpressao.splice(0, registroImpressao.length - MAX_EVENTOS_LOG);
        }
        try {
            localStorage.setItem(CHAVE_LOG_IMPRESSAO, JSON.stringify({ ...cabecalhoLog, eventos: registroImpressao }));
        } catch { /* localStorage cheio/bloqueado: o registro em memória continua valendo */ }
    };

    // Motivos possíveis: 'afterprint' | 'toque-pos-impressao' | 'dois-toques' | 'timeout'
    //                  | 'timeout-absoluto' | 'nova-impressao' | 'print-falhou'
    const limpar = (motivo) => {
        registrar(`restaurado:${motivo || 'desconhecido'}`);
        area.remove();
        style.remove();
        document.documentElement.classList.remove(MODO);
        window.removeEventListener('beforeprint', aoBeforePrint);
        window.removeEventListener('afterprint', aoAfterPrint);
        window.removeEventListener('pointerdown', aoInteragir);
        window.removeEventListener('keydown', aoInteragir);
        window.removeEventListener('wheel', aoInteragir);
        if (mqPrint) {
            if (mqPrint.removeEventListener) mqPrint.removeEventListener('change', aoMudarMedia);
            else if (mqPrint.removeListener) mqPrint.removeListener(aoMudarMedia);
        }
        clearTimeout(timerFallback);
        if (limpezaPendente === limpezaDesta) limpezaPendente = null; // nada mais pendente desta impressão
    };
    // `limpar` recebe o motivo, então add/removeEventListener precisam de referências FIXAS
    // (as funções nomeadas abaixo) — passar `limpar` direto deixaria listener sem remoção.
    const limpezaDesta = () => limpar('nova-impressao');

    // Ainda imprimindo? Nunca restaurar (quando o WebKit informa o media 'print', é verdade absoluta).
    const imprimindoAgora = () => !!(mqPrint && mqPrint.matches);

    // VOLTA confiável: enquanto o diálogo/prévia está aberto, toque, tecla e rolagem vão para a
    // UI do sistema — um desses eventos chegando NA PÁGINA significa que o usuário já está de
    // volta no app... EXCETO o toque em "Permitir"/"Ignorar" do alerta do Safari, que é uma
    // decisão sobre a página e chega nela. Daí a contagem de toques abaixo.
    const aoInteragir = (ev) => {
        if (!momentoPrint) { registrar(`${ev?.type || 'interacao'}:antes-do-print`); return; }
        const tipo = ev?.type || 'interacao';
        // Tecla segurada (auto-repeat, ~30 ms entre eventos) não é gesto novo: sem isto, um
        // único dedo no teclado chegava a "2 toques" e restaurava o app no meio da impressão.
        if (tipo === 'keydown' && ev?.repeat === true) { registrar('keydown:repeat'); return; }
        if (imprimindoAgora()) { registrar(`${tipo}:media-print-ativo`); return; }  // imprimindo: nunca restaurar
        const agora = Date.now();
        // Os dois `return` abaixo REGISTRAM antes de sair: é justamente aqui que cai o toque em
        // "Permitir" do alerta do Safari — a evidência nº 1 do diagnóstico. Sair calado deixava
        // o log cego exatamente no instante que interessa. Registrar não restaura nada.
        if (agora - momentoPrint < 800) { registrar(`${tipo}:ignorado:eco`); return; }   // eco do clique que abriu a impressão
        // Espaçamento mínimo entre toques CONTADOS: 700 ms. Com os 350 ms antigos, uma fonte que
        // repete (rolagem contínua de trackpad, tecla com auto-repeat) somava "2 toques" em ~0,4 s
        // com UM único gesto — furava a trava de dois toques, que é o coração desta versão.
        if (agora - ultimoToque < 700) { registrar(`${tipo}:ignorado:colapso`); return; }
        // `wheel` DESQUALIFICADO como gatilho de restauração (v10) — NÃO reintroduzir.
        // Uma rolagem contínua de ~700 ms+ atravessa a janela de colapso e vira "dois toques"
        // com UM gesto só (medido: 760/900/1300/2000 ms restauravam), restaurando o app no meio
        // da impressão — a mesma classe de furo que a trava de dois toques existe para impedir.
        // `keydown` se defende com `ev.repeat`; `wheel` não tem flag equivalente.
        // E ele não faz falta: no iPad a rolagem com o dedo nem gera `wheel` (só trackpad/mouse
        // acoplado), e no desktop o `afterprint` já restaura na hora. Fica só no LOG, como
        // diagnóstico: não conta toque, não mexe em `ultimoToque` (senão engoliria um toque real
        // logo depois da rolagem) e nunca chama `limpar`.
        if (tipo === 'wheel') { registrar('wheel'); return; }
        ultimoToque = agora;
        toques++;
        registrar(tipo === 'pointerdown' ? `pointerdown#${toques}` : tipo);
        if (houvePrint) { limpar('toque-pos-impressao'); return; }  // já imprimiu: 1 toque basta
        // Sem selo (o dono tocou "Ignorar", ou este aparelho não reporta o media 'print'):
        // exige 2 toques. Dispensar o alerta gera no máximo UM evento na página — é isto que impede
        // que aquele toque restaure o app antes do Safari fotografar a folha.
        if (toques >= 2 && agora - momentoPrint > 5000) limpar('dois-toques');
    };

    // O media 'print' LIGAR é prova de que a impressão aconteceu. DESLIGAR NÃO é prova de que
    // terminou (no iPad a prévia re-renderiza várias vezes com o diálogo aberto) — por isso aqui
    // NÃO se restaura mais nada. Era este o gatilho que devolvia o app no meio da prévia.
    const aoMudarMedia = (e) => {
        if (e.matches) { houvePrint = true; registrar('media:on'); }
        else registrar('media:off');
    };

    // beforeprint foi DESQUALIFICADO como selo na v10 (só `media:on` liga o selo).
    // Motivo: o Chrome dispara beforeprint DENTRO da chamada de window.print(), antes de
    // qualquer impressão existir. Se algum iPad fizer o mesmo, o selo ligaria antes do alerta
    // "site proibido de imprimir automaticamente" — e com o selo ligado UM único toque restaura,
    // que é exatamente a sequência do vídeo: o dono toca em "Permitir", o app volta e o Safari
    // fotografa o app no lugar da folha. Continua sendo REGISTRADO (informação valiosa: diz se
    // e quando o aparelho dispara o evento), só não vale mais como prova de que imprimiu.
    // Custo aceito: num aparelho que nunca reporta o media 'print', o dono precisa de 2 toques
    // mesmo tendo impresso — o log dirá se algum aparelho está nesse caso.
    const aoBeforePrint = () => { registrar('beforeprint'); };

    // afterprint continua restaurando na hora, sem guarda: é o sinal definitivo no desktop.
    const aoAfterPrint = () => { registrar('afterprint'); limpar('afterprint'); };

    // Rede de segurança final: 180s (o alerta do Safari + escolher impressora passava dos 60s
    // antigos) e, se o media print ainda estiver ligado na hora, re-agenda em vez de restaurar.
    //
    // TETO ABSOLUTO (v10) — SEMPRE EXISTE UM CAMINHO DE VOLTA.
    // O re-agendamento sozinho era um laço sem fim: se o matchMedia('print').matches travar em
    // `true` (defeito conhecido do WebKit), `aoInteragir` sai cedo em TODO evento (nenhum toque
    // restaura), o afterprint no iOS pode nunca vir e o timer se re-agendaria para sempre — o
    // app ficaria escondido em definitivo, pior do que a v8 (que restaurava incondicionalmente
    // em 60s). Por isso: passados 10 minutos do window.print(), restaura MESMO com o media
    // print ligado. 10 min é folgado o bastante para o pior caso real (alerta do Safari +
    // escolher impressora + prévia lenta, que raramente passa de 2-3 min) e curto o bastante
    // para o dono não achar que o app travou. O motivo fica no log, que é como saberemos que
    // este caminho foi usado.
    const TETO_ABSOLUTO_MS = 600000;   // 10 min desde o print()
    const PASSO_FALLBACK_MS = 180000;  // 3 min entre verificações
    const armarFallback = () => {
        // A última espera é encurtada para cair EM CIMA dos 10 min, e não no múltiplo de 3 min
        // seguinte (senão o teto viraria 12 min na prática).
        const restante = momentoPrint ? TETO_ABSOLUTO_MS - (Date.now() - momentoPrint) : TETO_ABSOLUTO_MS;
        const espera = Math.max(1000, Math.min(PASSO_FALLBACK_MS, restante));
        timerFallback = setTimeout(() => {
            const estourou = momentoPrint ? Date.now() - momentoPrint >= TETO_ABSOLUTO_MS : true;
            if (imprimindoAgora() && !estourou) { registrar('timeout:adiado'); armarFallback(); return; }
            limpar(imprimindoAgora() ? 'timeout-absoluto' : 'timeout');
        }, espera);
    };

    window.addEventListener('beforeprint', aoBeforePrint);
    window.addEventListener('afterprint', aoAfterPrint);   // sinal definitivo (desktop)
    window.addEventListener('pointerdown', aoInteragir);
    window.addEventListener('keydown', aoInteragir);
    window.addEventListener('wheel', aoInteragir, { passive: true });
    if (mqPrint) {
        if (mqPrint.addEventListener) mqPrint.addEventListener('change', aoMudarMedia);
        else if (mqPrint.addListener) mqPrint.addListener(aoMudarMedia);
    }
    armarFallback();
    limpezaPendente = limpezaDesta;   // se esta limpeza não rodar, a próxima impressão a executa

    // IMPORTANTE (iOS/iPad): chamar print() AGORA, dentro do gesto do usuário (sem setTimeout),
    // senão o Safari bloqueia com "site proibido de imprimir automaticamente".
    void area.offsetHeight; // força o layout com o modo aplicado antes do snapshot
    momentoPrint = Date.now();
    cabecalhoLog.latenciaGestoMs = latenciaDoGesto(evento);
    registrar('print-chamado');
    try { window.print(); } catch { limpar('print-falhou'); }
}

// Extrai estilos + corpo de um HTML completo e imprime na própria página (sem aba/iframe).
// `evento` é o clique original do botão — só serve para o diagnóstico medir quanto tempo passou
// entre o gesto do usuário e o window.print().
function imprimirHtml(htmlCompleto, evento, rotulo) {
    try {
        const doc = new DOMParser().parseFromString(htmlCompleto, 'text/html');
        const estilos = [...doc.querySelectorAll('style')].map(s => s.textContent).join('\n');
        doc.querySelectorAll('script').forEach(s => s.remove()); // scripts não rodam via innerHTML
        imprimirConteudo(estilos, doc.body.innerHTML, evento, rotulo);
    } catch {
        imprimirConteudo('', htmlCompleto, evento, rotulo);
    }
}

function escaparHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function fmtQtd(n) {
    const v = parseFloat(n);
    if (Number.isNaN(v)) return '—';
    // sempre 3 casas decimais: 7 -> 7,000  / 0.15 -> 0,150
    return v.toFixed(3).replace('.', ',');
}

function fmtPerda(n) {
    const v = parseFloat(n);
    if (Number.isNaN(v)) return '—';
    return v.toFixed(2).replace('.', ',');
}

function fmtMoeda(n, casas = 2) {
    const v = parseFloat(n);
    if (Number.isNaN(v)) return '—';
    return `R$ ${v.toFixed(casas).replace('.', ',')}`;
}

function montarHtmlImpressao(receita) {
    const itens = receita.itens || [];

    // agrupa por etapa, mantendo a ordem das etapas conhecidas e jogando o resto em "Outros"
    const ordemEtapas = ['preparo', 'modelagem', 'fritura', 'embalagem'];
    const grupos = {};
    itens.forEach(it => {
        const chave = (it.ordemEtapa || '').toLowerCase().trim() || '_sem_etapa';
        (grupos[chave] = grupos[chave] || []).push(it);
    });
    const chavesOrdenadas = [
        ...ordemEtapas.filter(e => grupos[e]),
        ...Object.keys(grupos).filter(e => !ordemEtapas.includes(e)),
    ];

    const temEtapas = chavesOrdenadas.some(c => c !== '_sem_etapa');

    const linhaItem = (it) => `
        <tr>
            <td class="nome">${escaparHtml(it.itemPcp?.nome || '—')}</td>
            <td class="qtd">${fmtQtd(it.quantidade)}</td>
            <td class="un">${escaparHtml(unidadeDe(it.itemPcp))}</td>
            ${it.observacao ? `<td class="obs">${escaparHtml(it.observacao)}</td>` : '<td class="obs"></td>'}
        </tr>`;

    const secoes = chavesOrdenadas.map(chave => {
        const titulo = chave === '_sem_etapa'
            ? (temEtapas ? 'Outros ingredientes' : 'Ingredientes')
            : (ETAPA_LABELS[chave] || chave.charAt(0).toUpperCase() + chave.slice(1));
        return `
            <section class="etapa">
                <h2>${escaparHtml(titulo)}</h2>
                <table>
                    <thead>
                        <tr><th class="nome">Ingrediente</th><th class="qtd">Qtd</th><th class="un">Un.</th><th class="obs">Observação</th></tr>
                    </thead>
                    <tbody>${grupos[chave].map(linhaItem).join('')}</tbody>
                </table>
            </section>`;
    }).join('');

    const rendimento = `${fmtQtd(receita.rendimentoBase)} ${escaparHtml(unidadeDe(receita.itemPcp))}`;
    const perda = receita.perdaPercentual ? `${fmtPerda(receita.perdaPercentual)}%` : '—';
    const dataImpressao = new Date().toLocaleDateString('pt-BR');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Receita - ${escaparHtml(receita.nome)}</title>
<style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
        font-family: Arial, Helvetica, sans-serif;
        color: #111;
        font-size: 15pt;
        line-height: 1.35;
    }
    /* largura util da A4 retrato com margem 12mm = 210-24 = 186mm */
    .folha { width: 186mm; margin: 0 auto; }
    header { border-bottom: 3px solid #111; padding-bottom: 8px; margin-bottom: 14px; }
    h1 { font-size: 26pt; margin: 0 0 4px; }
    .produz { font-size: 15pt; color: #333; margin: 0; }
    .meta { display: flex; gap: 24px; margin-top: 10px; flex-wrap: wrap; }
    .meta div { font-size: 14pt; }
    .meta .rotulo { color: #555; font-size: 11pt; text-transform: uppercase; letter-spacing: .5px; display: block; }
    .meta .valor { font-weight: bold; font-size: 17pt; }
    .etapa { margin-top: 16px; page-break-inside: avoid; }
    .etapa h2 {
        font-size: 16pt; margin: 0 0 6px; padding: 4px 10px;
        background: #111; color: #fff; border-radius: 4px;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ccc; vertical-align: top; }
    th { font-size: 11pt; text-transform: uppercase; color: #555; letter-spacing: .5px; border-bottom: 2px solid #111; }
    td.nome { font-weight: bold; font-size: 15pt; }
    .qtd, th.qtd { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    td.qtd { font-weight: bold; font-size: 16pt; }
    .un, th.un { text-align: center; width: 70px; color: #333; }
    .obs, th.obs { font-size: 12pt; color: #444; }
    .observacoes { margin-top: 18px; padding: 10px 12px; border: 2px solid #111; border-radius: 6px; page-break-inside: avoid; }
    .observacoes .rotulo { font-size: 11pt; text-transform: uppercase; letter-spacing: .5px; color: #555; margin-bottom: 4px; }
    .observacoes p { margin: 0; font-size: 14pt; white-space: pre-wrap; }
    footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 10pt; color: #777; display: flex; justify-content: space-between; }
</style>
</head>
<body>
<div class="folha">
    <header>
        <h1>${escaparHtml(receita.nome)}</h1>
        <p class="produz">Produz: <strong>${escaparHtml(receita.itemPcp?.nome || '—')}</strong>${receita.itemPcp?.tipo ? ` (${escaparHtml(TIPO_LABELS[receita.itemPcp.tipo] || receita.itemPcp.tipo)})` : ''}</p>
        <div class="meta">
            <div><span class="rotulo">Rendimento</span><span class="valor">${rendimento}</span></div>
            <div><span class="rotulo">Perda padrão</span><span class="valor">${perda}</span></div>
            <div><span class="rotulo">Versão</span><span class="valor">v${escaparHtml(receita.versao)}</span></div>
        </div>
    </header>
    ${secoes || '<p>Sem ingredientes cadastrados.</p>'}
    ${receita.observacoes ? `<div class="observacoes"><div class="rotulo">Observações</div><p>${escaparHtml(receita.observacoes)}</p></div>` : ''}
    <footer>
        <span>Receita de produção — ${escaparHtml(receita.nome)}</span>
        <span>Impresso em ${dataImpressao}</span>
    </footer>
</div>
<script>
    // Ajuste automatico: encolhe a letra so o necessario para caber em 1 folha A4.
    (function () {
        try {
            // mede 1mm em px neste navegador (DPI-safe)
            var probe = document.createElement('div');
            probe.style.cssText = 'height:100mm;position:absolute;visibility:hidden;top:0;left:0;';
            document.body.appendChild(probe);
            var pxPorMm = probe.offsetHeight / 100;
            document.body.removeChild(probe);

            var alturaUtilMm = 297 - 24; // A4 retrato menos margens de 12mm
            var alvoPx = alturaUtilMm * pxPorMm;
            var folha = document.querySelector('.folha');
            var atual = folha.scrollHeight;
            if (atual > alvoPx) {
                var escala = Math.max(0.45, alvoPx / atual);
                document.body.style.zoom = escala; // afeta layout e paginacao no Chrome
            }
        } catch (e) { /* se falhar, imprime no tamanho padrao */ }
    })();
</script>
</body>
</html>`;
}

// Impressão COM custos — tabela única (alinhada por índice com custo.itens), total e custo por unidade.
function montarHtmlImpressaoComCustos(receita, custo) {
    const itens = receita.itens || [];
    const fmtM = (n, c = 2) => {
        const v = parseFloat(n);
        if (Number.isNaN(v)) return '—';
        return `R$ ${v.toFixed(c).replace('.', ',')}`;
    };

    const linhas = itens.map((it, idx) => {
        const c = custo?.itens?.[idx];
        return `
        <tr>
            <td class="nome">${escaparHtml(it.itemPcp?.nome || '—')}</td>
            <td class="qtd">${fmtQtd(it.quantidade)}</td>
            <td class="un">${escaparHtml(unidadeDe(it.itemPcp))}</td>
            <td class="qtd">${c ? (c.custoUnitario > 0 ? fmtM(c.custoUnitario, 4) : 'sem custo') : '—'}</td>
            <td class="qtd">${c ? fmtM(c.custoTotal) : '—'}</td>
        </tr>`;
    }).join('');

    const rendimento = `${fmtQtd(receita.rendimentoBase)} ${escaparHtml(unidadeDe(receita.itemPcp))}`;
    const perda = receita.perdaPercentual ? `${fmtPerda(receita.perdaPercentual)}%` : '—';
    const dataImpressao = new Date().toLocaleDateString('pt-BR');
    const custoTotal = custo ? fmtM(custo.custoTotal) : '—';
    const custoUnidade = custo ? fmtM(custo.custoPorUnidade, 4) : '—';
    const un = escaparHtml(unidadeDe(receita.itemPcp) || 'un');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Receita (custos) - ${escaparHtml(receita.nome)}</title>
<style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12pt; line-height: 1.3; }
    .folha { width: 182mm; margin: 0 auto; }
    header { border-bottom: 3px solid #111; padding-bottom: 8px; margin-bottom: 14px; }
    h1 { font-size: 22pt; margin: 0 0 4px; }
    .produz { font-size: 12pt; color: #333; margin: 0; }
    .meta { display: flex; gap: 20px; margin-top: 10px; flex-wrap: wrap; }
    .meta .rotulo { color: #555; font-size: 9pt; text-transform: uppercase; letter-spacing: .5px; display: block; }
    .meta .valor { font-weight: bold; font-size: 13pt; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #ccc; }
    th { font-size: 9pt; text-transform: uppercase; color: #555; border-bottom: 2px solid #111; }
    td.nome { font-weight: bold; }
    .qtd, th.qtd { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .un, th.un { text-align: center; width: 60px; color: #333; }
    tfoot td { border-top: 2px solid #111; font-weight: bold; font-size: 13pt; }
    .resumo { margin-top: 18px; display: flex; gap: 16px; }
    .resumo .box { flex: 1; border: 2px solid #111; border-radius: 6px; padding: 10px 12px; }
    .resumo .rotulo { font-size: 9pt; text-transform: uppercase; letter-spacing: .5px; color: #555; }
    .resumo .valor { font-size: 18pt; font-weight: bold; }
    footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 9pt; color: #777; display: flex; justify-content: space-between; }
</style>
</head>
<body>
<div class="folha">
    <header>
        <h1>${escaparHtml(receita.nome)}</h1>
        <p class="produz">Produz: <strong>${escaparHtml(receita.itemPcp?.nome || '—')}</strong>${receita.itemPcp?.tipo ? ` (${escaparHtml(TIPO_LABELS[receita.itemPcp.tipo] || receita.itemPcp.tipo)})` : ''}</p>
        <div class="meta">
            <div><span class="rotulo">Rendimento</span><span class="valor">${rendimento}</span></div>
            <div><span class="rotulo">Perda padrão</span><span class="valor">${perda}</span></div>
            <div><span class="rotulo">Versão</span><span class="valor">v${escaparHtml(receita.versao)}</span></div>
        </div>
    </header>
    <table>
        <thead>
            <tr>
                <th class="nome">Ingrediente</th>
                <th class="qtd">Qtd</th>
                <th class="un">Un.</th>
                <th class="qtd">Custo Unit.</th>
                <th class="qtd">Custo</th>
            </tr>
        </thead>
        <tbody>${linhas || '<tr><td colspan="5">Sem ingredientes.</td></tr>'}</tbody>
        <tfoot>
            <tr><td colspan="4" class="qtd">Custo total</td><td class="qtd">${custoTotal}</td></tr>
        </tfoot>
    </table>
    <div class="resumo">
        <div class="box"><div class="rotulo">Custo Total da Receita</div><div class="valor">${custoTotal}</div></div>
        <div class="box"><div class="rotulo">Custo por ${un}</div><div class="valor">${custoUnidade}</div></div>
    </div>
    ${receita.observacoes ? `<div class="resumo" style="margin-top:12px"><div class="box" style="flex:1"><div class="rotulo">Observações</div><p style="margin:4px 0 0;white-space:pre-wrap">${escaparHtml(receita.observacoes)}</p></div></div>` : ''}
    <footer><span>Impresso em ${dataImpressao}</span><span>Documento interno — contém custos</span></footer>
</div>
</body>
</html>`;
}

// IMPRESSÃO EM PDF (08/2026) — os dois botões agora pedem a folha ao SERVIDOR e abrem o PDF.
// Substitui o window.print() acima, que no iOS é inerte (não abre caixa de impressão nenhuma) e
// ainda deixava a folha A4 montada na tela, prendendo o usuário. Também some com a antiga trava
// por `(pointer: coarse)`, que bloqueava a impressão no celular e no iPad: com PDF funciona nos
// três (computador, iPad e celular).
// O fluxo é de DOIS toques (gerar → abrir) por causa do bloqueio de janelas do Safari; o porquê
// está explicado em frontend/src/utils/abrirPdfImpressao.js.
const NOME_ARQUIVO_PDF = (receita, tipo) => {
    const base = String(receita?.nome || 'receita')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')      // tira acento (ç → c, ã → a)
        .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        .toLowerCase().slice(0, 60) || 'receita';
    return `receita-${base}${tipo === 'custos' ? '-custos' : ''}.pdf`;
};

export default function ReceitaDetalhe() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [receita, setReceita] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showSimulador, setShowSimulador] = useState(false);
    const [historico, setHistorico] = useState([]);
    const [logs, setLogs] = useState([]);
    const [showHistorico, setShowHistorico] = useState(false);
    const [itensMap, setItensMap] = useState({});
    const [custo, setCusto] = useState(null);
    const [logImpr, setLogImpr] = useState(null);   // texto do diagnóstico de impressão (null = fechado)

    useEffect(() => {
        setLoading(true);
        setCusto(null);
        pcpReceitaService.calcularCusto(id).then(setCusto).catch(() => setCusto(null));
        pcpReceitaService.buscarPorId(id)
            .then(async (r) => {
                setReceita(r);
                if (r?.itemPcpId) {
                    try {
                        const [h, l, itens] = await Promise.all([
                            pcpReceitaService.historico(r.itemPcpId),
                            pcpReceitaService.logs(id),
                            pcpItemService.listar({})
                        ]);
                        setHistorico(h);
                        setLogs(l);
                        const map = {};
                        (Array.isArray(itens) ? itens : []).forEach(i => { map[i.id] = i; });
                        setItensMap(map);
                    } catch { /* silencioso */ }
                }
            })
            .catch(() => toast.error('Erro ao carregar receita'))
            .finally(() => setLoading(false));
    }, [id]);

    const excluirReceita = async () => {
        if (!confirm('Excluir esta receita? Essa acao nao pode ser desfeita.')) return;
        try {
            await pcpReceitaService.excluir(id);
            toast.success('Receita excluida');
            navigate('/pcp/receitas');
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        }
    };

    const clonarReceita = async () => {
        const nome = prompt('Nome da nova receita (será criado um novo subproduto):', receita?.nome ? `${receita.nome} - copia` : '');
        if (!nome?.trim()) return;
        try {
            const nova = await pcpReceitaService.clonar(id, nome.trim());
            toast.success('Receita clonada');
            navigate(`/pcp/receitas/${nova.id}/editar`);
        } catch (err) {
            toast.error(err.response?.data?.error || err.message);
        }
    };

    // Impressão em PDF: 1º toque gera o link no servidor (e, no celular/iPad, já
    // baixa o arquivo); 2º toque entrega a folha — pela lista do sistema, onde
    // "Imprimir" está a um toque. (Ver o porquê em utils/abrirPdfImpressao.js.)
    const pdf = usePdfImpressao({
        gerarLink: (tipo) => pcpReceitaService.linkImpressao(id, tipo),
        nomeArquivo: (tipo) => NOME_ARQUIVO_PDF(receita, tipo),
        tituloCompartilhar: (tipo) => `${receita?.nome || 'Receita'}${tipo === 'custos' ? ' (com custos)' : ''}`,
        mensagemPronto: 'Folha pronta!',
        mensagemExpirou: 'O link do PDF venceu (vale 5 minutos). Toque em Imprimir de novo.',
    });

    const imprimirReceita = () => { if (receita) pdf.preparar('cozinha'); };
    const imprimirComCustos = () => { if (receita) pdf.preparar('custos'); };

    if (loading) return <div className="text-center py-12 text-gray-400">Carregando...</div>;
    if (!receita) return <div className="text-center py-12 text-gray-500">Receita nao encontrada</div>;

    return (
        <div className="w-full px-4 py-6">
            <button onClick={() => navigate('/pcp/receitas')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
                <ArrowLeft className="h-4 w-4" /> Voltar
            </button>

            {/* Cabecalho */}
            <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-xl font-bold text-gray-800">{receita.nome}</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Produz: <span className="font-medium">{receita.itemPcp?.nome}</span> ({receita.itemPcp?.tipo})
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setShowHistorico(true)}
                            title="Ver histórico de versões e o que mudou"
                            className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors"
                        >
                            <History className="h-3 w-3" /> Versão {receita.versao}
                        </button>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CORES[receita.status]}`}>
                            {receita.status}
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
                    <div>
                        <p className="text-xs text-gray-400">Rendimento Base</p>
                        <p className="text-lg font-semibold text-gray-800">
                            {parseFloat(receita.rendimentoBase).toFixed(3)} {unidadeDe(receita.itemPcp)}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400">Perda Padrao</p>
                        <p className="text-lg font-semibold text-gray-800">
                            {receita.perdaPercentual ? `${parseFloat(receita.perdaPercentual).toFixed(2)}%` : '—'}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400">Vigencia</p>
                        <p className="text-sm text-gray-600">
                            {receita.dataInicioVigencia ? new Date(receita.dataInicioVigencia).toLocaleDateString('pt-BR') : '—'}
                            {receita.dataFimVigencia && ` ate ${new Date(receita.dataFimVigencia).toLocaleDateString('pt-BR')}`}
                        </p>
                    </div>
                </div>

                {/* Resumo de custo */}
                <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
                    <div className="rounded-lg bg-gray-50 px-4 py-3">
                        <p className="text-xs text-gray-400">Custo Total da Receita</p>
                        <p className="text-lg font-semibold text-gray-800">
                            {custo ? fmtMoeda(custo.custoTotal) : '...'}
                        </p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 px-4 py-3">
                        <p className="text-xs text-emerald-700">Custo por {unidadeDe(receita.itemPcp) || 'unidade'}</p>
                        <p className="text-lg font-bold text-emerald-800">
                            {custo ? fmtMoeda(custo.custoPorUnidade, 4) : '...'}
                        </p>
                        {custo && custo.perdaPercentual > 0 && (
                            <p className="text-[11px] text-emerald-600 mt-0.5">
                                já com perda de {fmtPerda(custo.perdaPercentual)}% (rende {fmtQtd(custo.rendimentoLiquido)} {receita.itemPcp?.unidade})
                            </p>
                        )}
                    </div>
                </div>
                {custo?.temCustoFaltando && (
                    <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Alguns itens estão sem custo cadastrado — o valor acima pode estar incompleto. Cadastre o custo do produto (no Conta Azul ou manualmente no app) ou crie a receita do subproduto.
                    </p>
                )}

                {receita.observacoes && (
                    <p className="text-sm text-gray-500 mt-3 pt-3 border-t border-gray-100">{receita.observacoes}</p>
                )}

                {/* Acoes */}
                <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-gray-100">
                    {/* Pílula da versão da impressão. O manual manda o dono TOCAR nela no iPad,
                        então o alvo de toque tem os 44px exigidos pelo projeto — crescidos pelo
                        ::after, que aumenta só a área clicável e não a altura visual da linha
                        (os vizinhos, py-1.5 text-sm, continuam sendo os mais altos). */}
                    <button
                        type="button"
                        onClick={() => setLogImpr(logImpr == null ? formatarLogImpressao(lerLogImpressao()) : null)}
                        title="Versão da impressão — toque para ver o diagnóstico da última impressão"
                        className="relative px-3 py-1.5 rounded-full text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 after:content-[''] after:absolute after:inset-x-0 after:top-1/2 after:-translate-y-1/2 after:h-11"
                    >
                        IMPR v10
                    </button>
                    {receita.status !== 'inativa' && (
                        <button
                            onClick={() => navigate(`/pcp/receitas/${id}/editar`)}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                        >
                            <Pencil className="h-3.5 w-3.5" /> Editar
                        </button>
                    )}
                    <button
                        onClick={() => setShowHistorico(!showHistorico)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200"
                    >
                        <History className="h-3.5 w-3.5" /> Histórico ({historico.length})
                    </button>
                    <button
                        onClick={clonarReceita}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200"
                    >
                        <Copy className="h-3.5 w-3.5" /> Clonar Receita
                    </button>
                    <button
                        onClick={() => setShowSimulador(!showSimulador)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                    >
                        <Calculator className="h-3.5 w-3.5" /> Simular Escalonamento
                    </button>
                    {/* Impressão em PDF (gerado no servidor). Alvo de toque de 44px: estes dois
                        botões passaram a valer no celular e no iPad, onde o dedo é o ponteiro. */}
                    <button
                        onClick={imprimirReceita}
                        disabled={pdf.gerando}
                        title="Versão para a cozinha, sem custos — abre o PDF"
                        className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] text-sm font-semibold bg-primary text-white rounded-full shadow-sm hover:bg-primaryDark disabled:opacity-60"
                    >
                        {pdf.gerandoChave === 'cozinha'
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Printer className="h-4 w-4" />}
                        {pdf.gerandoChave === 'cozinha' ? 'Gerando PDF...' : 'Imprimir (cozinha)'}
                    </button>
                    <button
                        onClick={imprimirComCustos}
                        disabled={pdf.gerando}
                        title="Versão interna, com os custos — abre o PDF"
                        className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] text-sm font-medium bg-white border border-primary text-primary rounded-full hover:bg-mint/40 disabled:opacity-60"
                    >
                        {pdf.gerandoChave === 'custos'
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Printer className="h-4 w-4" />}
                        {pdf.gerandoChave === 'custos' ? 'Gerando PDF...' : 'Imprimir com custos'}
                    </button>
                    <button
                        onClick={excluirReceita}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 ml-auto"
                    >
                        <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </button>
                </div>

                {/* PDF pronto — 2º passo. A entrega precisa nascer DESTE clique: se fizéssemos
                    sozinhos logo depois de gerar, o Safari bloquearia (e no iPhone o app ainda
                    ficaria preso no PDF, sem barra de endereço para voltar).

                    No iPhone/iPad o botão principal é "Imprimir / Compartilhar": abre DIRETO a
                    lista do sistema, onde Imprimir é uma das opções — o dono não achava o botão
                    de imprimir dentro do visualizador de PDF, que o iOS mostra sem barra nenhuma.
                    No computador (sem essa lista) o principal continua sendo abrir o PDF. */}
                {pdf.pronto && (
                    <div className="mt-3 rounded-xl border border-primary/30 bg-mint/30 p-3">
                        <div className="flex items-start justify-between gap-2">
                            <p className="text-sm text-gray-700">
                                Folha <span className="font-semibold">{pdf.chave === 'custos' ? 'com custos' : 'da cozinha'}</span> pronta em PDF.
                                <span className="block text-xs text-gray-600 mt-0.5">
                                    {pdf.podeCompartilhar
                                        ? <>Toque em <span className="font-medium">Imprimir / Compartilhar</span> e escolha <span className="font-medium">Imprimir</span> na lista do aparelho.</>
                                        : <>Abre no visualizador do computador — use o botão de imprimir de lá.</>}
                                </span>
                            </p>
                            <button
                                type="button"
                                onClick={pdf.limpar}
                                title="Fechar"
                                className="shrink-0 -m-1 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 hover:text-gray-700 rounded-full hover:bg-white/70"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {pdf.podeCompartilhar ? (
                            <>
                                <button
                                    type="button"
                                    onClick={pdf.compartilhar}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] mt-3 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm"
                                >
                                    <Share className="h-4 w-4" /> Imprimir / Compartilhar
                                </button>
                                {/* Alternativas — segunda linha, para não competir com o caminho bom */}
                                <div className="flex flex-col sm:flex-row gap-2 mt-2">
                                    <button
                                        type="button"
                                        onClick={pdf.abrir}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm"
                                    >
                                        <ExternalLink className="h-4 w-4" /> Abrir PDF
                                    </button>
                                    <button
                                        type="button"
                                        onClick={pdf.baixar}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm"
                                    >
                                        <Download className="h-4 w-4" /> Baixar PDF
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col sm:flex-row gap-2 mt-3">
                                <button
                                    type="button"
                                    onClick={pdf.abrir}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm"
                                >
                                    <Printer className="h-4 w-4" /> Abrir PDF para imprimir
                                </button>
                                <button
                                    type="button"
                                    onClick={pdf.baixar}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm"
                                >
                                    <Download className="h-4 w-4" /> Baixar PDF
                                </button>
                            </div>
                        )}

                        {/* Quem foi parar na tela do PDF precisa saber sair e imprimir de lá.
                            Não dá para injetar nada dentro do visualizador do iOS — então a
                            explicação fica aqui, no app, aparecendo quando "Abrir PDF" é usado. */}
                        {pdf.abriu && (
                            <div className="mt-3 pt-3 border-t border-primary/20 text-xs text-gray-700 space-y-1">
                                <p><span className="font-semibold">Para imprimir na tela do PDF:</span> toque na tela → ícone de compartilhar → Imprimir.</p>
                                <p><span className="font-semibold">Para voltar ao app:</span> deslize de baixo para cima.</p>
                            </div>
                        )}

                        {/* O link do servidor venceu, mas o arquivo já está no aparelho:
                            avisar sem assustar — os botões continuam funcionando. */}
                        {pdf.linkVencido && (
                            <p className="mt-2 text-xs text-gray-600">
                                O link do servidor venceu, mas a folha já está salva no aparelho — os botões acima continuam funcionando.
                            </p>
                        )}
                    </div>
                )}

                {/* Diagnóstico da última impressão (aberto pela pílula IMPR v10) — o dono fotografa a tela */}
                {logImpr != null && (
                    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Última impressão</span>
                            <button
                                type="button"
                                onClick={() => setLogImpr(null)}
                                className="px-4 py-2 min-h-[44px] text-xs font-semibold rounded-full bg-white border border-gray-300 text-gray-700 hover:bg-gray-100"
                            >
                                Fechar
                            </button>
                        </div>
                        <pre className="text-[11px] leading-snug text-gray-800 whitespace-pre-wrap break-words max-h-72 overflow-y-auto">{logImpr}</pre>
                    </div>
                )}
            </div>

            {/* Histórico de versões */}
            {showHistorico && (
                <div className="bg-white rounded-lg border border-gray-200 mb-4 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                        <h2 className="text-sm font-semibold text-gray-700">Histórico de versões</h2>
                    </div>
                    <div className="p-5">
                        <ol className="relative border-l-2 border-gray-200 ml-2 space-y-4">
                            {historico.map(v => {
                                const ativa = v.id === id;
                                const log = v.logs?.[0];
                                return (
                                    <li key={v.id} className="ml-5">
                                        <span className={`absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full border-2 ${ativa ? 'bg-blue-600 border-blue-600' : v.status === 'ativa' ? 'bg-green-500 border-green-500' : 'bg-gray-300 border-gray-300'}`}></span>
                                        <button
                                            onClick={() => navigate(`/pcp/receitas/${v.id}`)}
                                            className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${ativa ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-base font-bold text-gray-800">v{v.versao}</span>
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${STATUS_CORES[v.status]}`}>{v.status}</span>
                                                    {ativa && <span className="text-[10px] text-blue-600 font-medium">(visualizando)</span>}
                                                </div>
                                                <ChevronRight className="h-4 w-4 text-gray-400" />
                                            </div>
                                            {log ? (
                                                <div className="mt-1.5 text-xs text-gray-600">
                                                    <span className="font-medium text-gray-700">{log.alteradoPorNome || 'Sistema'}</span>
                                                    <span className="text-gray-400"> · {new Date(log.alteradoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                                                    <div className="mt-0.5 italic text-gray-600 truncate">"{log.motivo}"</div>
                                                </div>
                                            ) : (
                                                <div className="mt-1.5 text-xs text-gray-400">
                                                    Versão inicial · {v.dataInicioVigencia ? new Date(v.dataInicioVigencia).toLocaleDateString('pt-BR') : '—'}
                                                </div>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>

                    {logs.length > 0 && (
                        <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Detalhes da alteração</h3>
                            {logs.map(log => (
                                <div key={log.id} className="bg-white rounded-lg border border-gray-200 p-4 mb-3 last:mb-0">
                                    <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                                        <div>
                                            <div className="text-sm font-semibold text-gray-800">{log.alteradoPorNome || 'Sistema'}</div>
                                            <div className="text-xs text-gray-500">{new Date(log.alteradoEm).toLocaleString('pt-BR')}</div>
                                        </div>
                                        <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs font-medium">v{log.versao}</span>
                                    </div>
                                    <div className="py-3 border-b border-gray-100">
                                        <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Motivo</div>
                                        <p className="text-sm text-gray-800">{log.motivo}</p>
                                    </div>

                                    <div className="pt-3 space-y-3">
                                        {log.alteracoes?.campos && Object.keys(log.alteracoes.campos).length > 0 && (
                                            <div>
                                                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Dados da receita</div>
                                                <div className="space-y-1">
                                                    {Object.entries(log.alteracoes.campos).map(([k, v]) => {
                                                        const labels = { nome: 'Nome', rendimentoBase: 'Rendimento base', perdaPercentual: 'Perda (%)', observacoes: 'Observações' };
                                                        return (
                                                            <div key={k} className="flex items-center gap-2 text-sm">
                                                                <span className="text-gray-600 min-w-[120px]">{labels[k] || k}:</span>
                                                                <span className="line-through text-gray-400 text-xs">{String(v.de ?? '—')}</span>
                                                                <ChevronRight className="h-3 w-3 text-gray-400" />
                                                                <span className="text-gray-900 font-medium">{String(v.para ?? '—')}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {log.alteracoes?.ingredientes?.adicionados?.length > 0 && (
                                            <div>
                                                <div className="text-[11px] font-semibold text-green-700 uppercase tracking-wider mb-1.5">+ Ingredientes adicionados</div>
                                                <ul className="space-y-1">
                                                    {log.alteracoes.ingredientes.adicionados.map((i, idx) => {
                                                        const info = itensMap[i.itemPcpId];
                                                        const nome = i.nome || info?.nome || 'Item removido';
                                                        const unid = i.unidade || info?.unidade || '';
                                                        return (
                                                            <li key={idx} className="flex items-center justify-between text-sm bg-green-50 border border-green-100 rounded px-3 py-1.5">
                                                                <span className="text-gray-800 font-medium">{nome}</span>
                                                                <span className="text-xs text-gray-600">{i.quantidade} {unid} <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${TIPO_CORES[i.tipo]}`}>{i.tipo}</span></span>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            </div>
                                        )}

                                        {log.alteracoes?.ingredientes?.removidos?.length > 0 && (
                                            <div>
                                                <div className="text-[11px] font-semibold text-red-700 uppercase tracking-wider mb-1.5">− Ingredientes removidos</div>
                                                <ul className="space-y-1">
                                                    {log.alteracoes.ingredientes.removidos.map((i, idx) => {
                                                        const info = itensMap[i.itemPcpId];
                                                        const nome = i.nome || info?.nome || 'Item removido';
                                                        const unid = i.unidade || info?.unidade || '';
                                                        return (
                                                            <li key={idx} className="flex items-center justify-between text-sm bg-red-50 border border-red-100 rounded px-3 py-1.5">
                                                                <span className="text-gray-800 font-medium line-through">{nome}</span>
                                                                <span className="text-xs text-gray-600">{i.quantidade} {unid} <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${TIPO_CORES[i.tipo]}`}>{i.tipo}</span></span>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            </div>
                                        )}

                                        {log.alteracoes?.ingredientes?.alterados?.length > 0 && (
                                            <div>
                                                <div className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider mb-1.5">~ Quantidades alteradas</div>
                                                <ul className="space-y-1">
                                                    {log.alteracoes.ingredientes.alterados.map((i, idx) => {
                                                        const info = itensMap[i.itemPcpId];
                                                        const nome = i.nome || info?.nome || 'Item';
                                                        const unid = i.unidade || info?.unidade || '';
                                                        return (
                                                            <li key={idx} className="flex items-center justify-between text-sm bg-amber-50 border border-amber-100 rounded px-3 py-1.5">
                                                                <span className="text-gray-800 font-medium">{nome}</span>
                                                                <span className="text-xs text-gray-600 flex items-center gap-1.5">
                                                                    <span className="line-through text-gray-400">{i.quantidade.de} {unid}</span>
                                                                    <ChevronRight className="h-3 w-3 text-gray-400" />
                                                                    <span className="text-gray-900 font-semibold">{i.quantidade.para} {unid}</span>
                                                                </span>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Simulador */}
            {showSimulador && (
                <div className="mb-4">
                    <SimuladorEscalonamento receitaId={id} itensReceita={receita.itens} />
                </div>
            )}

            {/* Componentes */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
                    Componentes ({receita.itens?.length || 0})
                </h2>

                <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Item</th>
                            <th className="text-center px-3 py-2 font-medium text-gray-600">Tipo</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-600">Quantidade</th>
                            <th className="text-center px-3 py-2 font-medium text-gray-600">Unidade</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-600">Custo Unit.</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-600">Custo</th>
                            <th className="text-center px-3 py-2 font-medium text-gray-600">Etapa</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {receita.itens?.map((item, idx) => {
                            const c = custo?.itens?.[idx];
                            return (
                                <tr key={item.id} className="hover:bg-gray-50">
                                    <td className="px-3 py-2">
                                        <span className="font-medium">{item.itemPcp?.nome}</span>
                                        <span className="ml-2 text-xs text-gray-400">{item.itemPcp?.codigo}</span>
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${TIPO_CORES[item.itemPcp?.tipo]}`}>
                                            {item.tipo}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono">
                                        {parseFloat(item.quantidade).toFixed(3)}
                                    </td>
                                    <td className="px-3 py-2 text-center text-gray-500">
                                        {unidadeDe(item.itemPcp)}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-gray-600">
                                        {c ? (c.custoUnitario > 0 ? fmtMoeda(c.custoUnitario, 4) : <span className="text-amber-600">sem custo</span>) : '...'}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono font-medium text-gray-800">
                                        {c ? fmtMoeda(c.custoTotal) : '...'}
                                    </td>
                                    <td className="px-3 py-2 text-center text-gray-400 text-xs">
                                        {item.ordemEtapa || '—'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    {custo && (
                        <tfoot className="border-t-2 border-gray-200">
                            <tr>
                                <td colSpan={5} className="px-3 py-2 text-right font-medium text-gray-600">Custo total</td>
                                <td className="px-3 py-2 text-right font-mono font-bold text-gray-900">{fmtMoeda(custo.custoTotal)}</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    )}
                </table>
                </div>
            </div>
        </div>
    );
}
