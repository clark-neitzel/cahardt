import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import ModalCustoForaDaCurva from '../components/ModalCustoForaDaCurva';

// const [modalCusto, confirmarSeHouverAlerta] = useConfirmarCustoForaDaCurva();
// ...  const ok = await confirmarSeHouverAlerta(alertas);   // true = pode gravar (sem alerta ou confirmou)
// ...  return (<> ... {modalCusto} </>)   // render do elemento (null quando fechado)
// Sem alertas resolve true na hora, sem abrir nada. "Voltar" resolve false.
export default function useConfirmarCustoForaDaCurva() {
    const [alertas, setAlertas] = useState(null);
    const resolver = useRef(null);

    const fechar = useCallback((valor) => {
        const r = resolver.current;
        resolver.current = null;
        setAlertas(null);
        if (r) r(valor);
    }, []);

    // se a tela desmontar com o modal aberto, não deixa a promessa pendurada
    useEffect(() => () => { if (resolver.current) { resolver.current(false); resolver.current = null; } }, []);

    const confirmarSeHouverAlerta = useCallback((lista) => {
        if (!Array.isArray(lista) || lista.length === 0) return Promise.resolve(true);
        if (resolver.current) resolver.current(false);   // segurança: nunca duas janelas
        return new Promise((resolve) => {
            resolver.current = resolve;
            setAlertas(lista);
        });
    }, []);

    const modalElement = alertas
        ? createElement(ModalCustoForaDaCurva, {
            alertas,
            salvando: false,
            onVoltar: () => fechar(false),
            onConfirmar: () => fechar(true)
        })
        : null;

    return [modalElement, confirmarSeHouverAlerta];
}

// Fluxo padrão das telas: prévia -> (modal) -> gravação -> (409 -> modal -> 1 repetição).
//  avaliar(): Promise<{temAlerta, alertas}>  (opcional; falha da prévia NUNCA bloqueia)
//  gravar(confirmado): Promise<resposta>     (confirmado=true => enviar confirmarCustoForaDaCurva:true)
//  → { cancelado:true } se o usuário voltou; senão { resposta }. Outros erros sobem para o catch da tela.
export async function gravarComAvisoDeCusto({ avaliar, gravar, confirmar }) {
    let confirmado = false;
    if (avaliar) {
        try {
            const previa = await avaliar();
            if (previa?.temAlerta && Array.isArray(previa.alertas) && previa.alertas.length > 0) {
                if (!(await confirmar(previa.alertas))) return { cancelado: true };
                confirmado = true;
            }
        } catch { /* prévia fora do ar: segue para a gravação, que tem a trava dela */ }
    }
    try {
        return { resposta: await gravar(confirmado) };
    } catch (e) {
        const d = e?.response?.data;
        if (!confirmado && e?.response?.status === 409 && d?.codigo === 'CUSTO_FORA_DA_CURVA') {
            if (!(await confirmar(d.alertas || []))) return { cancelado: true };
            return { resposta: await gravar(true) };
        }
        throw e;
    }
}
