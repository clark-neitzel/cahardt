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
//      2º toque  → abre o PDF (síncrono, dentro do gesto → não é bloqueado)
//
// O 2º toque é barato de explicar na tela ("Abrir PDF para imprimir") e é o
// único jeito confiável em iOS. Um caminho de **Baixar PDF** anda junto,
// para o caso de o navegador bloquear a abertura mesmo assim — como não há
// como detectar bloqueio de `<a target="_blank">` (não sobra referência da
// janela), a alternativa fica sempre visível em vez de ser oferecida depois.
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
//       validadeSegundos: 300,   // link some da tela quando vence
//   });
//
//   <button onClick={() => pdf.preparar('cozinha')} disabled={pdf.gerando}>
//       {pdf.gerandoChave === 'cozinha' ? 'Gerando PDF…' : 'Imprimir (cozinha)'}
//   </button>
//
//   {pdf.pronto && (
//       <>
//         <button onClick={pdf.abrir}>Abrir PDF para imprimir</button>
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
 * Hook do fluxo de dois passos (gerar → abrir).
 *
 * @param {object}   opcoes
 * @param {Function} opcoes.gerarLink        (chave) => Promise<string | { url }>. A chave é o que
 *                                           você passou em `preparar()` — use para distinguir
 *                                           variações da folha (ex.: 'cozinha' | 'custos').
 * @param {Function|string} [opcoes.nomeArquivo]  nome sugerido no "Baixar PDF" (função recebe a chave).
 * @param {number}   [opcoes.validadeSegundos=300]  quanto tempo o link do servidor vale. Quando
 *                                           vence, o hook volta sozinho ao estado inicial e avisa.
 * @param {string}   [opcoes.mensagemPronto]  toast de sucesso (null = sem toast).
 * @param {string}   [opcoes.mensagemExpirou] toast de link vencido.
 *
 * @returns {{
 *   estado: 'ocioso'|'gerando'|'pronto',
 *   gerando: boolean, gerandoChave: string|null,
 *   pronto: boolean, chave: string|null, url: string,
 *   preparar: (chave?: any) => Promise<boolean>,
 *   abrir: () => void, baixar: () => void, limpar: () => void
 * }}
 */
export function usePdfImpressao({
    gerarLink,
    nomeArquivo,
    validadeSegundos = 300,
    mensagemPronto = 'PDF pronto! Toque em "Abrir PDF para imprimir".',
    mensagemExpirou = 'O link do PDF venceu (vale 5 minutos). Toque em Imprimir de novo.',
} = {}) {
    const [estado, setEstado] = useState('ocioso');   // ocioso → gerando → pronto
    const [chave, setChave] = useState(null);         // qual folha está sendo/foi gerada
    const [url, setUrl] = useState('');

    const venceEmRef = useRef(0);        // timestamp (ms) em que o link deixa de valer
    const timerRef = useRef(null);
    const vivoRef = useRef(true);        // evita setState depois que a tela é desmontada

    // Espelho do link atual FORA do React. O estado da tela só chega no próximo
    // quadro; em toques rápidos (~120ms) o `disabled={pdf.gerando}` chega tarde
    // demais e o mesmo botão dispara duas gerações. Estes refs decidem na hora.
    const linkRef = useRef({ chave: null, url: '', venceEm: 0 });
    const gerandoRef = useRef(false);

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
        setUrl('');
        setChave(null);
        setEstado('ocioso');
    }, []);

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

            // A validade que o servidor informar manda; a do hook é só o padrão.
            const validade = Number(resposta?.validadeSegundos) > 0
                ? Number(resposta.validadeSegundos)
                : validadeSegundos;
            const folga = Math.max(1, validade - MARGEM_SEGURANCA_S);
            venceEmRef.current = Date.now() + folga * 1000;
            timerRef.current = setTimeout(() => {
                if (!vivoRef.current) return;
                limpar();
                avisarExpirou();
            }, folga * 1000);

            linkRef.current = { chave: novaChave, url: endereco, venceEm: venceEmRef.current };
            setUrl(endereco);
            setEstado('pronto');
            avisarPronto();
            return true;
        } catch (err) {
            if (vivoRef.current) { setEstado('ocioso'); setChave(null); }
            linkRef.current = { chave: null, url: '', venceEm: 0 };
            toast.error(mensagemDeErro(err, 'Não consegui gerar o PDF. Tente de novo.'), {
                id: TOAST_ERRO,
                duration: 7000,
            });
            return false;
        } finally {
            gerandoRef.current = false;
        }
    }, [gerarLink, validadeSegundos, avisarPronto, avisarExpirou, limpar]);

    // Nome sugerido no "Baixar PDF" (aceita string fixa ou função da chave).
    const nomeDoArquivo = useCallback(() => {
        if (typeof nomeArquivo === 'function') return nomeArquivo(chave);
        return nomeArquivo || 'documento.pdf';
    }, [nomeArquivo, chave]);

    // O link ainda vale? (o servidor também confere — isto é só para dar uma
    // mensagem boa em vez de mandar o usuário para uma tela de erro.)
    const aindaVale = useCallback(() => {
        if (!url) return false;
        if (venceEmRef.current && Date.now() > venceEmRef.current) {
            limpar();
            avisarExpirou();
            return false;
        }
        return true;
    }, [url, limpar, avisarExpirou]);

    // Passo 2 — SÍNCRONO dentro do clique do usuário. Sem await aqui.
    const abrir = useCallback(() => {
        if (!aindaVale()) return;
        abrirPdfEmNovaAba(url);
    }, [aindaVale, url]);

    const baixar = useCallback(() => {
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
        preparar,
        abrir,
        baixar,
        limpar,
    };
}

export default usePdfImpressao;
