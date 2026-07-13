import { lazy } from 'react';

/**
 * Substitui o React.lazy() nas rotas.
 *
 * Problema que resolve: as telas são carregadas sob demanda, em arquivos com hash
 * no nome (ex.: FuncionariosLista-CZJLNUcz.js). Quando sai um deploy, o servidor
 * troca esses arquivos e os antigos DEIXAM DE EXISTIR. Quem estava com a aba
 * aberta continua com o index.html velho na memória — ao trocar de tela, o
 * navegador pede um arquivo que sumiu e estoura:
 *   "TypeError: Failed to fetch dynamically imported module"
 * O usuário via a tela vermelha de erro e tinha que recarregar na mão.
 *
 * Aqui: tenta de novo (cobre blip de rede) e, se ainda falhar, recarrega a página
 * uma única vez — o que traz o index.html novo e os arquivos novos. A trava em
 * sessionStorage evita laço infinito de recarga caso o arquivo esteja realmente
 * quebrado no servidor.
 */

const CHAVE_TRAVA = 'hardt:recarregou-por-chunk';

export function lazyComRetry(importar) {
    return lazy(async () => {
        try {
            const modulo = await importar();
            sessionStorage.removeItem(CHAVE_TRAVA);
            return modulo;
        } catch (erro) {
            // 2ª tentativa: cobre uma oscilação momentânea de rede.
            try {
                await new Promise((r) => setTimeout(r, 800));
                const modulo = await importar();
                sessionStorage.removeItem(CHAVE_TRAVA);
                return modulo;
            } catch (erroFinal) {
                if (sessionStorage.getItem(CHAVE_TRAVA) === '1') {
                    // Já recarregamos uma vez e continua falhando: mostra o erro de verdade.
                    throw erroFinal;
                }

                sessionStorage.setItem(CHAVE_TRAVA, '1');
                console.warn('Arquivo da tela não encontrado (provável deploy novo). Recarregando...', erroFinal?.message);

                // Limpa o cache do service worker para não recarregar na casca antiga.
                if (typeof caches !== 'undefined') {
                    try {
                        const nomes = await caches.keys();
                        await Promise.all(nomes.map((n) => caches.delete(n)));
                    } catch { /* sem Cache API disponível: segue para o reload */ }
                }

                window.location.reload();
                // Promise que nunca resolve: a página está sendo recarregada.
                return new Promise(() => { });
            }
        }
    });
}

export default lazyComRetry;
