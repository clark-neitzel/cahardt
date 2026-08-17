// =====================================================================
// Entregar um PDF gerado pelo SERVIDOR ao usuário — jeito que funciona no
// iPhone, no iPad e no computador.
//
// Este é o padrão de impressão do projeto para folhas geradas no backend
// (a impressão montada na própria página, com window.print(), continua
// valendo só para o que ainda não tem PDF no servidor — no iOS ela é
// inerte: não abre caixa de impressão nenhuma).
//
// ---------------------------------------------------------------------
// AS DUAS ARMADILHAS QUE ESTE ARQUIVO EXISTE PARA EVITAR
// ---------------------------------------------------------------------
//
// 1) NÃO navegar na própria janela.
//    No app instalado (PWA standalone do iOS) NÃO existe barra de endereço
//    nem botão de voltar. Abrir um link da MESMA ORIGEM sem `target="_blank"`
//    (seja `location.href = ...`, seja um `<a>` comum) navega dentro da
//    casca do app e prende o usuário no PDF — é a reclamação do dono
//    ("tenho que ficar clicando para voltar").
//    Com `target="_blank"` o iOS entrega o arquivo ao **Safari**, que mostra
//    o PDF com o botão Compartilhar → **Imprimir** (o objetivo), e o app
//    fica intacto atrás.
//
// 2) NÃO usar `window.open()` programático.
//    O Safari só deixa `window.open()` passar quando ele está colado no
//    gesto do usuário. Depois de um `await` (o tempo de pedir o link ao
//    servidor) o gesto já "esfriou" e a janela é bloqueada — no PWA do iOS
//    ele ainda abre antes uma janela EM BRANCO dentro do app, que a pessoa
//    precisa fechar na mão. O que passa é um `<a target="_blank">` de
//    verdade, criado e clicado DENTRO do gesto.
//
// Daí o fluxo de DOIS PASSOS do hook `usePdfImpressao` (mesma solução já
// usada em `pages/Pedidos/ImprimirLoteModal.jsx`):
//
//      1º toque  → pede o link ao servidor (assíncrono, mostra "Gerando…")
//      2º toque  → entrega o PDF (síncrono, dentro do gesto → não é bloqueado)
//
// O 2º toque é barato de explicar na tela e é o único jeito confiável em iOS.
// Um caminho de **Baixar PDF** anda junto, para o caso de o navegador
// bloquear a abertura mesmo assim — como não há como detectar bloqueio de
// `<a target="_blank">` (não sobra referência da janela), a alternativa fica
// sempre visível em vez de ser oferecida depois.
//
// ---------------------------------------------------------------------
// 3) NO CELULAR/iPAD, O CAMINHO BOM É A FOLHA DE COMPARTILHAMENTO (08/2026)
// ---------------------------------------------------------------------
//
//    Abrir o PDF numa aba FUNCIONA, mas o iOS mostra a folha em tela cheia
//    **sem barra nenhuma**: o botão de compartilhar (por onde se imprime) só
//    reaparece se a pessoa tocar na tela ou arrastar para cima. O dono ficou
//    preso olhando a folha, sem achar como imprimir nem como voltar
//    ("MAS COMO EU SAIO DA TELA E AONDE ESTÁ O BOTÃO DE IMPRIMIR").
//
//    A saída é a **Web Share API com arquivo** (`navigator.share({ files })`,
//    Safari iOS 15+): ela abre DIRETO a folha de compartilhamento do sistema,
//    onde **Imprimir** é uma das opções — um toque, sem caçar botão e sem
//    sair do app (o app continua atrás; fechar a folha volta para ele).
//
//    Regra do gesto: `navigator.share` também precisa nascer no clique. Como
//    baixar o PDF (`fetch` → `blob`) é assíncrono, o download acontece no
//    **1º toque**, junto com a geração do link; o 2º toque só chama
//    `navigator.share` com o arquivo já em memória.
//
//    Efeito colateral bom: com o arquivo em memória, o 2º toque **não depende
//    mais do link de 5 minutos estar vivo** — o hook para de derrubar o quadro
//    quando o link vence e passa a avisar sem drama.
//
// ---------------------------------------------------------------------
// COMO USAR (exemplo real: PCP → Receitas → Detalhe)
// ---------------------------------------------------------------------
//
//   const pdf = usePdfImpressao({
//       // Recebe a chave do botão e devolve o link do PDF (string ou { url }).
//       // A URL pode vir RELATIVA (`/api/...`) — ela é resolvida com API_URL.
//       gerarLink: (tipo) => pcpReceitaService.linkImpressao(id, tipo),
//       nomeArquivo: (tipo) => `receita-${tipo}.pdf`,
//       tituloCompartilhar: (tipo) => 'Receita X',
//       validadeSegundos: 300,   // validade do link do servidor
//   });
//
//   <button onClick={() => pdf.preparar('cozinha')} disabled={pdf.gerando}>
//       {pdf.gerandoChave === 'cozinha' ? 'Gerando PDF…' : 'Imprimir (cozinha)'}
//   </button>
//
//   {pdf.pronto && (
//       <>
//         {pdf.podeCompartilhar && (
//           <button onClick={pdf.compartilhar}>Imprimir / Compartilhar</button>
//         )}
//         <button onClick={pdf.abrir}>Abrir PDF</button>
//         <button onClick={pdf.baixar}>Baixar PDF</button>
//       </>
//   )}
//
// =====================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { API_URL } from '../services/api';

// Segundos de folga descontados da validade do link. Sem isso o usuário
// consegue tocar em "Abrir" no último segundo e receber a página de erro do
// backend ("link expirou") em vez do PDF.
const MARGEM_SEGURANCA_S = 15;

/**
 * Resolve a URL do PDF contra a origem da API.
 *
 * O backend devolve o caminho RELATIVO de propósito (`/api/...`): em produção
 * o nginx do frontend repassa `/api` ao backend na MESMA origem, então
 * `API_URL` é '' e a URL final fica no domínio do app (funciona tanto em
 * hardtsalgados.com.br quanto no endereço do EasyPanel). Em desenvolvimento
 * `API_URL` é `http://localhost:3000`. URL já absoluta passa direto.
 */
export function urlDoPdf(caminhoOuUrl) {
    const bruto = typeof caminhoOuUrl === 'string' ? caminhoOuUrl : caminhoOuUrl?.url;
    if (!bruto) return '';
    if (/^(https?:)?\/\//i.test(bruto) || bruto.startsWith('blob:') || bruto.startsWith('data:')) return bruto;
    return `${API_URL}${bruto.startsWith('/') ? '' : '/'}${bruto}`;
}

/**
 * Abre o PDF numa aba/janela de verdade (no iOS: entrega ao Safari).
 *
 * PRECISA ser chamada DENTRO do clique do usuário — nada de `await` antes,
 * nada de `setTimeout`. Não devolve se deu certo: `<a target="_blank">` não
 * deixa referência da janela. Por isso sempre ofereça `baixarPdf` ao lado.
 */
export function abrirPdfEmNovaAba(caminhoOuUrl) {
    const url = urlDoPdf(caminhoOuUrl);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

/**
 * Alternativa "salvar o arquivo", para quando a abertura é bloqueada.
 *
 * Observação honesta: o atributo `download` só vale para MESMA origem — em
 * produção vale (nginx serve /api no mesmo domínio); rodando local contra
 * localhost:3000 o navegador ignora e simplesmente abre o PDF. O iOS também
 * costuma abrir em vez de baixar. Nos dois casos o usuário chega ao PDF, que
 * é o que importa.
 */
export function baixarPdf(caminhoOuUrl, nomeArquivo) {
    const url = urlDoPdf(caminhoOuUrl);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo || 'documento.pdf';
    a.target = '_blank';       // se o `download` for ignorado, ao menos não prende o app
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

// =====================================================================
// CAMINHO DA FOLHA DE COMPARTILHAMENTO (iPhone/iPad)
// =====================================================================

const TIPO_PDF = 'application/pdf';

/**
 * Este aparelho consegue compartilhar um ARQUIVO pelo sistema?
 *
 * Duas condições, as duas necessárias:
 *  - `navigator.canShare({ files })` aceita um PDF (Safari iOS 15+, Chrome Android);
 *  - o aparelho é de TOQUE (`maxTouchPoints`/`pointer: coarse`). O Chrome de
 *    desktop também implementa Web Share, mas a folha do Windows/macOS NÃO tem
 *    "Imprimir" — lá o caminho certo continua sendo abrir o PDF numa aba.
 *
 * O resultado é calculado uma vez só (não muda durante a sessão).
 */
let _suportaShare = null;
export function suportaCompartilharArquivo() {
    if (_suportaShare !== null) return _suportaShare;
    _suportaShare = false;
    try {
        if (typeof navigator === 'undefined') return false;
        if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
        if (typeof File !== 'function' || typeof Blob !== 'function') return false;

        const toque = (navigator.maxTouchPoints || 0) > 0
            || (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches === true);
        if (!toque) return false;

        // Sonda: um PDF mínimo de verdade (o cabeçalho "%PDF"), só para
        // perguntar ao navegador se ele aceitaria compartilhar um arquivo desse tipo.
        const sonda = new File([new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: TIPO_PDF })],
            'sonda.pdf', { type: TIPO_PDF });
        _suportaShare = navigator.canShare({ files: [sonda] }) === true;
    } catch {
        _suportaShare = false;
    }
    return _suportaShare;
}

/**
 * Baixa o PDF do servidor para a memória e devolve um `File` pronto para
 * `navigator.share`. É ASSÍNCRONO — tem que rodar no 1º toque (junto da
 * geração do link), nunca no toque que abre a folha de compartilhamento.
 */
export async function baixarArquivoPdf(caminhoOuUrl, nomeArquivo) {
    const url = urlDoPdf(caminhoOuUrl);
    if (!url) return null;
    const resposta = await fetch(url, { credentials: 'same-origin' });
    if (!resposta.ok) {
        const erro = new Error('O servidor não entregou o PDF. Tente de novo.');
        erro.amigavel = true;
        throw erro;
    }
    const blob = await resposta.blob();
    // Forçar o tipo: se o blob vier sem `type`, o iOS trata como arquivo
    // genérico e a folha de compartilhamento perde a opção "Imprimir".
    return new File([blob], nomeArquivo || 'documento.pdf', { type: TIPO_PDF });
}

/**
 * Abre a folha de compartilhamento do sistema com o PDF já em memória.
 *
 * PRECISA ser chamada DENTRO do clique (sem `await` antes) — por isso o
 * arquivo chega pronto por parâmetro.
 *
 * @returns {Promise<boolean>} true = compartilhou; false = o usuário cancelou
 *                             (cancelar NÃO é erro e não deve virar toast).
 */
export function compartilharPdf(arquivo, titulo) {
    if (!arquivo) return Promise.resolve(false);
    try {
        if (typeof navigator?.share !== 'function'
            || typeof navigator?.canShare !== 'function'
            || !navigator.canShare({ files: [arquivo] })) {
            const erro = new Error('Este aparelho não abre a lista de compartilhamento. Use "Abrir PDF".');
            erro.amigavel = true;
            return Promise.reject(erro);
        }
    } catch {
        const erro = new Error('Este aparelho não abre a lista de compartilhamento. Use "Abrir PDF".');
        erro.amigavel = true;
        return Promise.reject(erro);
    }
    return navigator.share({ files: [arquivo], title: titulo || arquivo.name })
        .then(() => true)
        .catch((err) => {
            // O usuário fechou a folha sem escolher nada: silêncio.
            if (err?.name === 'AbortError' || /abort|cancel/i.test(err?.message || '')) return false;
            throw err;
        });
}

/**
 * Entrega o arquivo que já está em memória, sem depender do link do servidor.
 * Usado quando o link de 5 minutos já venceu (o arquivo continua valendo).
 * A URL temporária é liberada depois — revogar na hora cancelaria a abertura.
 */
function entregarArquivoLocal(arquivo, { baixar = false } = {}) {
    if (!arquivo) return;
    const url = URL.createObjectURL(arquivo);
    const a = document.createElement('a');
    a.href = url;
    if (baixar) a.download = arquivo.name || 'documento.pdf';
    a.target = '_blank';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ignora */ } }, 60000);
}

// Códigos que o axios usa quando a requisição NÃO chegou a ter resposta.
const CODIGOS_SEM_RESPOSTA = new Set([
    'ERR_NETWORK',                 // servidor fora do ar / wifi caiu
    'ECONNABORTED',                // timeout do axios
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ERR_INTERNET_DISCONNECTED',
]);

const SEM_CONEXAO = 'Sem conexão com o servidor. Tente de novo.';

// Toast único para o aviso de "folha pronta": com `id` fixo o react-hot-toast
// SUBSTITUI o balão anterior em vez de empilhar três no canto da tela.
const TOAST_PRONTO = 'pdf-impressao-pronto';
const TOAST_EXPIROU = 'pdf-impressao-expirou';
const TOAST_ERRO = 'pdf-impressao-erro';

/**
 * Mensagem de erro amigável — SEMPRE em português.
 *
 * O `err.message` do axios é texto cru em inglês ("Network Error", "timeout of
 * 5000ms exceeded") e a equipe da cozinha não lê inglês técnico. Por isso só
 * repassamos ao usuário: (a) o que o NOSSO backend mandou no corpo da resposta,
 * que já vem em português; (b) uma mensagem que nós mesmos escrevemos aqui
 * (marcada com `amigavel`). Qualquer outra coisa vira o texto padrão.
 */
function mensagemDeErro(err, padrao) {
    const doServidor = err?.response?.data?.error || err?.response?.data?.mensagem;
    if (typeof doServidor === 'string' && doServidor.trim()) return doServidor;

    // Pedido saiu, resposta nunca voltou: backend fora do ar, wifi ruim, timeout.
    // É o caso mais provável no tablet da cozinha.
    if (!err?.response && (err?.request || CODIGOS_SEM_RESPOSTA.has(err?.code))) return SEM_CONEXAO;

    if (err?.amigavel && typeof err.message === 'string' && err.message.trim()) return err.message;

    return padrao;   // nunca repassar `err.message` cru
}

/**
 * Hook do fluxo de dois passos (gerar → entregar).
 *
 * @param {object}   opcoes
 * @param {Function} opcoes.gerarLink        (chave) => Promise<string | { url }>. A chave é o que
 *                                           você passou em `preparar()` — use para distinguir
 *                                           variações da folha (ex.: 'cozinha' | 'custos').
 * @param {Function|string} [opcoes.nomeArquivo]  nome sugerido no "Baixar PDF" (função recebe a chave).
 * @param {Function|string} [opcoes.tituloCompartilhar] título mostrado na folha de compartilhamento
 *                                           do sistema (função recebe a chave).
 * @param {number}   [opcoes.validadeSegundos=300]  quanto tempo o link do servidor vale.
 * @param {string}   [opcoes.mensagemPronto]  toast de sucesso (null = sem toast).
 * @param {string}   [opcoes.mensagemExpirou] toast de link vencido (só aparece quando o arquivo
 *                                           NÃO ficou em memória — com arquivo, nada some da tela).
 *
 * @returns {{
 *   estado: 'ocioso'|'gerando'|'pronto',
 *   gerando: boolean, gerandoChave: string|null,
 *   pronto: boolean, chave: string|null, url: string,
 *   podeCompartilhar: boolean, linkVencido: boolean, abriu: boolean,
 *   preparar: (chave?: any) => Promise<boolean>,
 *   compartilhar: () => void, abrir: () => void, baixar: () => void, limpar: () => void
 * }}
 */
export function usePdfImpressao({
    gerarLink,
    nomeArquivo,
    tituloCompartilhar,
    validadeSegundos = 300,
    mensagemPronto = 'PDF pronto!',
    mensagemExpirou = 'O link do PDF venceu (vale 5 minutos). Toque em Imprimir de novo.',
} = {}) {
    const [estado, setEstado] = useState('ocioso');   // ocioso → gerando → pronto
    const [chave, setChave] = useState(null);         // qual folha está sendo/foi gerada
    const [url, setUrl] = useState('');
    const [temArquivo, setTemArquivo] = useState(false);  // o PDF está em memória?
    const [linkVencido, setLinkVencido] = useState(false);
    const [abriu, setAbriu] = useState(false);        // o usuário já usou "Abrir PDF"?

    const venceEmRef = useRef(0);        // timestamp (ms) em que o link deixa de valer
    const timerRef = useRef(null);
    const vivoRef = useRef(true);        // evita setState depois que a tela é desmontada

    // Espelho do link atual FORA do React. O estado da tela só chega no próximo
    // quadro; em toques rápidos (~120ms) o `disabled={pdf.gerando}` chega tarde
    // demais e o mesmo botão dispara duas gerações. Estes refs decidem na hora.
    const linkRef = useRef({ chave: null, url: '', venceEm: 0 });
    const gerandoRef = useRef(false);
    // O PDF baixado no 1º toque. Fica em ref (e não só em state) porque o 2º
    // toque precisa dele AGORA, dentro do gesto — esperar o próximo quadro do
    // React faria o iOS recusar `navigator.share`.
    const arquivoRef = useRef(null);

    const avisarPronto = useCallback(() => {
        if (mensagemPronto) toast.success(mensagemPronto, { id: TOAST_PRONTO });
    }, [mensagemPronto]);

    const avisarExpirou = useCallback(() => {
        if (mensagemExpirou) toast(mensagemExpirou, { id: TOAST_EXPIROU, icon: '⏱️', duration: 6000 });
    }, [mensagemExpirou]);

    const limpar = useCallback(() => {
        clearTimeout(timerRef.current);
        venceEmRef.current = 0;
        linkRef.current = { chave: null, url: '', venceEm: 0 };
        arquivoRef.current = null;
        setTemArquivo(false);
        setLinkVencido(false);
        setAbriu(false);
        setUrl('');
        setChave(null);
        setEstado('ocioso');
    }, []);

    // Nome do arquivo / título da folha de compartilhamento a partir da chave.
    const nomeParaChave = useCallback((c) => (
        typeof nomeArquivo === 'function' ? nomeArquivo(c) : (nomeArquivo || 'documento.pdf')
    ), [nomeArquivo]);

    const tituloParaChave = useCallback((c) => (
        typeof tituloCompartilhar === 'function' ? tituloCompartilhar(c) : (tituloCompartilhar || '')
    ), [tituloCompartilhar]);

    useEffect(() => {
        vivoRef.current = true;
        return () => { vivoRef.current = false; clearTimeout(timerRef.current); };
    }, []);

    // Passo 1 — pede o link ao servidor. NÃO abre nada aqui: depois do await o
    // gesto do usuário já acabou e o navegador bloquearia a abertura.
    const preparar = useCallback(async (novaChave = null) => {
        if (typeof gerarLink !== 'function') return false;

        // Toque repetido no MESMO botão com o quadro aberto e o link ainda vivo:
        // reaproveita o que já está pronto — sem novo POST, sem toast empilhado.
        // Trocar de tipo (cozinha ↔ custos) cai fora daqui e gera normalmente.
        const atual = linkRef.current;
        if (atual.url && atual.chave === novaChave && atual.venceEm > Date.now()) {
            avisarPronto();
            return true;
        }

        // Já existe uma geração em curso: ignora o toque em vez de disparar outra.
        if (gerandoRef.current) return false;
        gerandoRef.current = true;

        clearTimeout(timerRef.current);
        linkRef.current = { chave: null, url: '', venceEm: 0 };
        arquivoRef.current = null;
        setTemArquivo(false);
        setLinkVencido(false);
        setAbriu(false);
        setChave(novaChave);
        setEstado('gerando');
        setUrl('');
        try {
            const resposta = await gerarLink(novaChave);
            const endereco = urlDoPdf(resposta);
            if (!endereco) {
                const erro = new Error('O servidor não devolveu o link do PDF.');
                erro.amigavel = true;   // texto nosso, em português — pode ir para a tela
                throw erro;
            }
            if (!vivoRef.current) return false;

            // Aparelho de toque: baixa o PDF AGORA (ainda no passo assíncrono),
            // para que o 2º toque possa chamar `navigator.share` sem `await`.
            // Se o download falhar, seguimos em frente com o link — "Abrir PDF"
            // e "Baixar PDF" continuam funcionando; só o atalho de imprimir some.
            let arquivo = null;
            if (suportaCompartilharArquivo()) {
                try {
                    arquivo = await baixarArquivoPdf(endereco, nomeParaChave(novaChave));
                } catch (errArquivo) {
                    console.warn('[PDF] Não consegui guardar o arquivo para compartilhar:', errArquivo?.message);
                }
            }
            if (!vivoRef.current) return false;
            arquivoRef.current = arquivo;
            setTemArquivo(!!arquivo);

            // A validade que o servidor informar manda; a do hook é só o padrão.
            const validade = Number(resposta?.validadeSegundos) > 0
                ? Number(resposta.validadeSegundos)
                : validadeSegundos;
            const folga = Math.max(1, validade - MARGEM_SEGURANCA_S);
            venceEmRef.current = Date.now() + folga * 1000;
            timerRef.current = setTimeout(() => {
                if (!vivoRef.current) return;
                // Com o arquivo em memória o vencimento do link é irrelevante:
                // o quadro continua na tela e imprimir/baixar seguem funcionando.
                // Sem arquivo, aí sim o quadro cai e o usuário é avisado.
                if (arquivoRef.current) { setLinkVencido(true); return; }
                limpar();
                avisarExpirou();
            }, folga * 1000);

            linkRef.current = { chave: novaChave, url: endereco, venceEm: venceEmRef.current };
            setUrl(endereco);
            setEstado('pronto');
            avisarPronto();
            return true;
        } catch (err) {
            if (vivoRef.current) { setEstado('ocioso'); setChave(null); setTemArquivo(false); }
            arquivoRef.current = null;
            linkRef.current = { chave: null, url: '', venceEm: 0 };
            toast.error(mensagemDeErro(err, 'Não consegui gerar o PDF. Tente de novo.'), {
                id: TOAST_ERRO,
                duration: 7000,
            });
            return false;
        } finally {
            gerandoRef.current = false;
        }
    }, [gerarLink, validadeSegundos, avisarPronto, avisarExpirou, limpar, nomeParaChave]);

    // Nome sugerido no "Baixar PDF" (aceita string fixa ou função da chave).
    const nomeDoArquivo = useCallback(() => nomeParaChave(chave), [nomeParaChave, chave]);

    // O link do SERVIDOR ainda vale? (o servidor também confere — isto é só para
    // dar uma mensagem boa em vez de mandar o usuário para uma tela de erro.)
    // Se o arquivo estiver em memória, o vencimento não interrompe nada: o
    // caminho local assume.
    const aindaVale = useCallback(() => {
        if (!url) return false;
        if (venceEmRef.current && Date.now() > venceEmRef.current) {
            if (arquivoRef.current) { setLinkVencido(true); return false; }
            limpar();
            avisarExpirou();
            return false;
        }
        return true;
    }, [url, limpar, avisarExpirou]);

    // Passo 2 (celular/iPad) — abre a folha de compartilhamento do sistema, onde
    // "Imprimir" é uma das opções. SÍNCRONO dentro do clique: sem `await` antes
    // de `navigator.share`, senão o iOS recusa ("gesto expirado").
    // (definido logo abaixo de `abrir` para poder cair nele como plano B)

    // Passo 2 (computador / plano B) — SÍNCRONO dentro do clique do usuário.
    const abrir = useCallback(() => {
        setAbriu(true);
        if (aindaVale()) { abrirPdfEmNovaAba(url); return; }
        if (arquivoRef.current) entregarArquivoLocal(arquivoRef.current);   // link venceu, arquivo não
    }, [aindaVale, url]);

    const compartilhar = useCallback(() => {
        const arquivo = arquivoRef.current;
        if (!arquivo) { abrir(); return; }   // sem arquivo em memória, o caminho é a aba
        compartilharPdf(arquivo, tituloParaChave(chave) || nomeDoArquivo())
            .catch((err) => {
                toast.error(mensagemDeErro(err, 'Não consegui abrir a lista de compartilhamento. Use "Abrir PDF".'), {
                    id: TOAST_ERRO,
                    duration: 7000,
                });
            });
    }, [abrir, chave, tituloParaChave, nomeDoArquivo]);

    const baixar = useCallback(() => {
        // Com o arquivo em memória o download é local: o atributo `download`
        // funciona de verdade (mesma origem) e não depende do link do servidor.
        if (arquivoRef.current) { entregarArquivoLocal(arquivoRef.current, { baixar: true }); return; }
        if (!aindaVale()) return;
        baixarPdf(url, nomeDoArquivo());
    }, [aindaVale, url, nomeDoArquivo]);

    return {
        estado,
        gerando: estado === 'gerando',
        gerandoChave: estado === 'gerando' ? chave : null,
        pronto: estado === 'pronto',
        chave,
        url,
        // Verdadeiro só quando o aparelho abre a folha do sistema E o arquivo
        // já está em memória — é a condição para o botão "Imprimir / Compartilhar".
        podeCompartilhar: temArquivo && suportaCompartilharArquivo(),
        linkVencido,
        abriu,
        preparar,
        compartilhar,
        abrir,
        baixar,
        limpar,
    };
}

export default usePdfImpressao;
