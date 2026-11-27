import { useEffect, useSyncExternalStore } from 'react';
import agenteService from '../services/agenteService';

// Contagem de solicitações do agente de IA esperando o dono (selo vermelho do menu e cabeçalho da tela).
// UM ÚNICO timer para o app inteiro, não importa quantos componentes usem o hook (menu + tela de Solicitações):
// - só roda enquanto houver pelo menos um consumidor ativo (admin humano). Não-admin nunca dispara a chamada;
// - consulta a cada 60 s SÓ com a aba visível, ao voltar para a aba e quando alguém chama avisarSolicitacoesMudaram()
//   (autorizou, recusou, repetiu ou a ação falhou);
// - se o servidor responder 403/404 (sem permissão ou rota ainda não publicada), para de perguntar.
export const INTERVALO_CONTAGEM_MS = 60000;

const ZERO = { pendentes: 0, comErro: 0 };
let estado = ZERO;
const ouvintes = new Set();
let consumidores = 0;
let timer = null;
let parado = false;

function definir(novo) {
    if (novo.pendentes === estado.pendentes && novo.comErro === estado.comErro) return;
    estado = novo;
    ouvintes.forEach((f) => f());
}

async function buscar() {
    if (parado || consumidores === 0 || document.visibilityState !== 'visible') return;
    try {
        const r = await agenteService.solicitacoesContagem();
        if (consumidores > 0) definir({ pendentes: Number(r?.pendentes) || 0, comErro: Number(r?.comErro) || 0 });
    } catch (e) {
        const st = e?.response?.status;
        if (st === 403 || st === 404) { parado = true; if (timer) { clearInterval(timer); timer = null; } }
        // outras falhas (rede, 500): mantém o último número e tenta de novo no próximo ciclo
    }
}

const aoVoltar = () => { if (document.visibilityState === 'visible') buscar(); };

function iniciar() {
    buscar();
    timer = setInterval(buscar, INTERVALO_CONTAGEM_MS);
    document.addEventListener('visibilitychange', aoVoltar);
}

function parar() {
    if (timer) { clearInterval(timer); timer = null; }
    document.removeEventListener('visibilitychange', aoVoltar);
    parado = false;
    definir(ZERO);
}

/** Pede uma nova contagem agora (depois de autorizar, recusar, repetir ou de uma falha). */
export function avisarSolicitacoesMudaram() {
    buscar();
}

const assinar = (cb) => { ouvintes.add(cb); return () => { ouvintes.delete(cb); }; };
const foto = () => estado;

export function useContagemSolicitacoesAgente(ativo) {
    const atual = useSyncExternalStore(assinar, foto);
    useEffect(() => {
        if (!ativo) return undefined;
        consumidores += 1;
        if (consumidores === 1) iniciar();
        return () => {
            consumidores -= 1;
            if (consumidores === 0) parar();
        };
    }, [ativo]);
    return ativo ? atual : ZERO;
}
