import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ExternalLink } from 'lucide-react';
import agenteService, { mensagemErro } from '../services/agenteService';
import { ModalBase, ConfirmModal, BtnSecundario, BtnPerigo } from '../pages/Admin/Agentes/ModalBase';
import { resumoLimpo, jsonLegivel } from '../pages/Admin/Agentes/util';
import { Aviso, Bloco, Endereco, ModalRepetir, falhaIncerta, horaCurta, rotaSegura } from '../components/Agentes/CartaoSolicitacao';

// Decisão sobre solicitações do agente de IA (autorizar, recusar, repetir), COMPARTILHADA entre a tela
// Admin → Solicitações e o Chat do Luke (aba Autorizações e cartão da conversa).
// Mantém TODAS as travas da tela original:
//  - confirmação "Autorizar esta ação?" antes de executar;
//  - 409 MUDOU_DESDE_O_PEDIDO → modal "Algo mudou desde o pedido" (antes × agora) e só autoriza com "Autorizar mesmo assim";
//  - 409 CONFIRMAR_REPETICAO → aviso forte + "Entendi, repetir mesmo assim"; REPETIR_MUITO_CEDO respeita o prazo;
//  - falha de rede/5xx: "não sei se foi executado" (nunca dizer que falhou) e recarrega;
//  - recusa com observação opcional.
// Quem usa passa:  aoDecidir(novo)  (item já decidido, devolvido pelo servidor)
//                  aoFalhar(item)   (ação deu erro: tira o item de "decidido agora" e recarrega — o servidor pode ter mudado de estado)
//                  aoRecarregar(item) (só recarrega a lista, ex.: ainda é cedo para repetir)
//                  aoNavegar(rota)  (opcional: ex. fechar o painel do chat antes de abrir a tela)

export const TEXTO_CONFERIR = 'Não sei se foi executado: confira a tela de destino antes de tentar de novo.';

export function useDecisaoSolicitacao({ aoDecidir, aoFalhar, aoRecarregar, aoNavegar } = {}) {
    const navigate = useNavigate();
    const [confirmaAut, setConfirmaAut] = useState(null);   // item
    const [mudou, setMudou] = useState(null);               // { item, dados }
    const [recusando, setRecusando] = useState(null);       // item
    const [obs, setObs] = useState('');
    const [repetindo, setRepetindo] = useState(null);       // { item, aviso }
    const [liberaEm, setLiberaEm] = useState({});           // id -> ISO (REPETIR_MUITO_CEDO)
    const [avisoIncerto, setAvisoIncerto] = useState(null); // { item, texto }
    const [ocupado, setOcupado] = useState(false);
    const montado = useRef(true);
    useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);

    // sempre a versão mais recente dos callbacks (sem recriar as funções abaixo)
    const cb = useRef({});
    cb.current = { aoDecidir, aoFalhar, aoRecarregar, aoNavegar };

    const trataErroAcao = (e, item) => {
        const cod = e?.response?.data?.codigo;
        if (falhaIncerta(e)) {
            // rede/timeout/5xx: a ação PODE ter sido executada. Nunca dizer "falhou".
            setAvisoIncerto({ item, texto: TEXTO_CONFERIR });
            toast.error(TEXTO_CONFERIR, { duration: 12000 });
        } else {
            // SOLICITACAO_JA_DECIDIDA (outra pessoa decidiu / expirou) e AGENTE_POLITICA_BLOQUEADA (a solicitação vira RECUSADA):
            // a mensagem do servidor já explica; a lista é recarregada para mostrar o estado real.
            toast.error(mensagemErro(e, 'Não foi possível concluir a ação.'), { duration: cod === 'AGENTE_POLITICA_BLOQUEADA' ? 9000 : 7000 });
        }
        cb.current.aoFalhar?.(item);
    };

    const autorizar = async (item, confirmarMudanca = false) => {
        if (ocupado) return;
        setOcupado(true);
        try {
            const novo = await agenteService.autorizar(item.id, confirmarMudanca ? { confirmarMudanca: true } : {});
            setConfirmaAut(null); setMudou(null); setAvisoIncerto(null);
            cb.current.aoDecidir?.(novo);
            if (novo.status === 'AUTORIZADA') toast.success('Autorizada e executada.');
            else if (novo.status === 'EXECUTANDO') toast('Autorizada: a ação está sendo executada agora.', { icon: '⏳', duration: 6000 });
            else if (novo.status === 'ERRO_INDETERMINADO') toast('Autorizada, mas o resultado é incerto. Confira a tela.', { icon: '⚠️', duration: 8000 });
            else toast.error('Autorizada, mas a ação deu erro. Veja o resultado no cartão.', { duration: 8000 });
        } catch (e) {
            const dados = e?.response?.data;
            setConfirmaAut(null);
            if (e?.response?.status === 409 && (dados?.codigo === 'MUDOU_DESDE_O_PEDIDO' || dados?.mudouDesdePedido)) {
                setMudou({ item, dados });
            } else {
                setMudou(null);
                trataErroAcao(e, item);
            }
        } finally { if (montado.current) setOcupado(false); }
    };

    const recusar = async () => {
        if (!recusando || ocupado) return;
        setOcupado(true);
        const item = recusando;
        try {
            const novo = await agenteService.recusar(item.id, obs.trim());
            setRecusando(null); setObs('');
            cb.current.aoDecidir?.(novo);
            toast.success('Solicitação recusada.');
        } catch (e) {
            setRecusando(null); setObs('');
            trataErroAcao(e, item);
        } finally { if (montado.current) setOcupado(false); }
    };

    const repetir = async () => {
        if (!repetindo || ocupado) return;
        setOcupado(true);
        const { item } = repetindo;
        try {
            const novo = await agenteService.repetir(item.id, { confirmarRepeticao: true });
            setRepetindo(null); setAvisoIncerto(null);
            cb.current.aoDecidir?.(novo);
            toast.success('Nova tentativa feita. Veja o resultado no cartão.');
            if (novo.aviso) toast(novo.aviso, { icon: '⚠️', duration: 12000 });
        } catch (e) {
            const dados = e?.response?.data;
            const cod = dados?.codigo;
            if (e?.response?.status === 409 && cod === 'CONFIRMAR_REPETICAO') {
                // o servidor quer a confirmação explícita: mantém o modal aberto com o aviso dele
                setRepetindo({ item, aviso: dados?.aviso || null });
            } else if (e?.response?.status === 409 && cod === 'REPETIR_MUITO_CEDO') {
                setRepetindo(null);
                if (dados?.liberaEm) setLiberaEm((m) => ({ ...m, [item.id]: dados.liberaEm }));
                toast(`Ainda é cedo para repetir${dados?.liberaEm ? `: disponível às ${horaCurta(dados.liberaEm)}` : ''}. A ação pode ainda estar em andamento.`, { icon: '⏳', duration: 9000 });
                cb.current.aoRecarregar?.(item);
            } else {
                setRepetindo(null);
                trataErroAcao(e, item);
            }
        } finally { if (montado.current) setOcupado(false); }
    };

    const abrirTela = (rota) => {
        if (!rotaSegura(rota)) return;
        setRepetindo(null); setMudou(null);
        cb.current.aoNavegar?.(rota);
        navigate(rota);
    };

    const antes = mudou?.dados?.antes ?? mudou?.item?.antes;
    const depois = mudou?.dados?.depois ?? mudou?.dados?.agora ?? mudou?.item?.agora;
    const nomeAgenteConf = confirmaAut?.agenteNome || 'o agente';

    const modais = (
        <>
            {confirmaAut && (
                <ConfirmModal
                    titulo="Autorizar esta ação?"
                    rotuloConfirmar="Autorizar e executar"
                    ocupado={ocupado}
                    onConfirmar={() => autorizar(confirmaAut)}
                    onCancelar={() => setConfirmaAut(null)}
                    aviso={`Isto vai executar a ação como ${nomeAgenteConf}, no sistema de verdade.`}
                >
                    <p className="font-semibold text-gray-900">{confirmaAut.rotulo || confirmaAut.chave}</p>
                    {resumoLimpo(confirmaAut) && <p>{resumoLimpo(confirmaAut)}</p>}
                    <Endereco item={confirmaAut} />
                    {confirmaAut.possivelDuplicata === true && <Aviso>Possível duplicata: já existe um pedido igual ou parecido.</Aviso>}
                    {confirmaAut.bodyTruncado === true && <Aviso>O corpo mostrado está incompleto. Na dúvida, recuse.</Aviso>}
                </ConfirmModal>
            )}

            {mudou && (
                <ModalBase
                    titulo="Algo mudou desde o pedido"
                    largura="md:max-w-2xl"
                    onFechar={ocupado ? undefined : () => setMudou(null)}
                    rodape={(
                        <>
                            <BtnSecundario onClick={() => setMudou(null)} disabled={ocupado}>Voltar sem autorizar</BtnSecundario>
                            <BtnPerigo onClick={() => autorizar(mudou.item, true)} disabled={ocupado}>{ocupado ? 'Aguarde…' : 'Autorizar mesmo assim'}</BtnPerigo>
                        </>
                    )}
                >
                    <Aviso>{mudou.dados?.error || 'Os dados mudaram depois que o agente fez o pedido. Confira a diferença antes de autorizar.'}</Aviso>
                    <p className="text-sm font-semibold text-gray-900">{mudou.item.rotulo || mudou.item.chave}{resumoLimpo(mudou.item) ? ` — ${resumoLimpo(mudou.item)}` : ''}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Bloco titulo="Quando o agente pediu" valor={antes != null ? jsonLegivel(antes) : ''} />
                        <Bloco titulo="Agora" valor={depois != null ? jsonLegivel(depois) : 'Abra a tela para ver o valor atual.'} />
                    </div>
                    {rotaSegura(mudou.item.telaDestino?.rota) && (
                        <BtnSecundario onClick={() => abrirTela(mudou.item.telaDestino.rota)} className="w-full inline-flex items-center justify-center gap-1.5"><ExternalLink className="h-4 w-4" />Abrir a tela para conferir</BtnSecundario>
                    )}
                </ModalBase>
            )}

            {recusando && (
                <ModalBase
                    titulo="Recusar solicitação"
                    onFechar={ocupado ? undefined : () => setRecusando(null)}
                    rodape={(
                        <>
                            <BtnSecundario onClick={() => setRecusando(null)} disabled={ocupado}>Cancelar</BtnSecundario>
                            <BtnPerigo onClick={recusar} disabled={ocupado}>{ocupado ? 'Aguarde…' : 'Recusar'}</BtnPerigo>
                        </>
                    )}
                >
                    <p className="text-sm text-gray-700"><b>{recusando.rotulo || recusando.chave}</b>{resumoLimpo(recusando) ? ` — ${resumoLimpo(recusando)}` : ''}</p>
                    <label className="block">
                        <span className="text-sm font-medium text-gray-700">Observação (opcional)</span>
                        <textarea
                            value={obs}
                            onChange={(e) => setObs(e.target.value)}
                            rows={3}
                            maxLength={500}
                            placeholder="Por que está recusando? O agente pode ler isto."
                            className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                    </label>
                </ModalBase>
            )}

            {repetindo && (
                <ModalRepetir
                    key={repetindo.item.id}
                    item={repetindo.item}
                    avisoServidor={repetindo.aviso}
                    ocupado={ocupado}
                    onConfirmar={repetir}
                    onCancelar={() => setRepetindo(null)}
                    onAbrirTela={abrirTela}
                />
            )}
        </>
    );

    return {
        ocupado, avisoIncerto, setAvisoIncerto, liberaEm, abrirTela, modais,
        pedirAutorizar: setConfirmaAut,
        pedirRecusar: (item) => { setObs(''); setRecusando(item); },
        pedirRepetir: (item) => setRepetindo({ item, aviso: null }),
        // o item some da lista "decidida agora" quando uma ação dá erro (a lista recarrega do servidor)
    };
}
