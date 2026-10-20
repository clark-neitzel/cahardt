import { useEffect, useState } from 'react';
import comoFazerService, { mensagemErro } from '../../../services/comoFazerService';

// Quem sou eu no módulo (funcionário, setores e o que posso fazer). Vem do servidor — o front só espelha.
export function useComoFazerMe() {
    const [me, setMe] = useState(null);
    const [erro, setErro] = useState('');
    useEffect(() => {
        let vivo = true;
        comoFazerService.me()
            .then((d) => { if (vivo) setMe(d); })
            .catch((e) => { if (vivo) setErro(mensagemErro(e)); });
        return () => { vivo = false; };
    }, []);
    const pode = me?.pode || {};
    return { me, erro, pode: { confirmar: pode.confirmar === true, editar: pode.editar === true, painel: pode.painel === true } };
}
