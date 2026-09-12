import { useEffect, useState } from 'react';
import { MessageCircle, Loader2 } from 'lucide-react';
import clienteService from '../../services/clienteService';
import whatsappClientesService, { rotuloMotivo, calcularValidaAte, numeroWhatsappValido } from '../../services/whatsappClientesService';
import ModalWhatsappCliente from '../ModalWhatsappCliente';

// ─────────────────────────────────────────────────────────────────────────────
// Situação do WhatsApp de 1 CLIENTE — mesmo vocabulário/estado de
// `PendenciasWhatsapp.jsx` e do selo `SeloWhatsappCliente.jsx` (fonte única:
// `whatsappStatus`, camadas dispensa/verificação/selo). O botão de ação abre o
// `ModalWhatsappCliente` já usado no bloqueio do ENVIAR do pedido — cadastra
// (ou dispensa) o número sem duplicar a lógica de salvar.
//
// ⚠️ Vocabulário protegido (regra do projeto): "em uso" = já saiu mensagem
// nossa para o número, NUNCA "entregue"/"confirmado pelo cliente". "Tem conta
// de WhatsApp" = o bot respondeu que existe conta ali, NUNCA "verificado".
//
// Uso CONTROLADO (a ficha já carregou o cliente): passe `cliente` (precisa de
// UUID, Telefone_Celular e whatsappStatus). Uso AUTÔNOMO: só `clienteUuid`,
// busca sozinho via `clienteService.detalhar`.
// ─────────────────────────────────────────────────────────────────────────────

const fmtData = (v) => {
    if (!v) return '';
    const d = new Date(v);
    return isNaN(d) ? '' : d.toLocaleDateString('pt-BR');
};

// `chave` é o discriminante estável para quem só precisa decidir o que mostrar
// (ex.: o card do Cadastro, que só reagia a EM_USO/COM_PROBLEMA/EXISTE na mão)
// — usar `chave`/os campos abaixo em vez de voltar a comparar
// `whatsappStatus.selo`/`verificacaoStatus` na tela chamadora, senão a
// classificação vira duas fontes de verdade de novo (foi exatamente essa
// divergência entre PendenciasWhatsapp e a ficha que já causou bug antes).
export const avaliarWhatsapp = (cliente) => {
    const temNumero = numeroWhatsappValido(cliente?.Telefone_Celular);
    const st = cliente?.whatsappStatus || {};
    const base = {
        temNumero,
        seloMotivo: st.seloMotivo || null,
        seloEm: st.seloEm || null,
        dispensaMotivo: st.dispensaMotivo || null,
        dispensaPorNome: st.dispensaPorNome || null,
        dispensaEm: st.dispensaEm || null,
        dispensaValidaAte: st.dispensaValidaAte || null,
    };
    if (!temNumero) {
        if (st.dispensaMotivo) {
            return { ...base, chave: 'DISPENSADO', rotulo: 'Dispensado', classe: 'bg-amber-100 text-amber-700', ok: true };
        }
        return { ...base, chave: 'SEM_NUMERO', rotulo: 'Sem número', classe: 'bg-gray-100 text-gray-700', ok: false };
    }
    if (st.selo === 'COM_PROBLEMA') return { ...base, chave: 'COM_PROBLEMA', rotulo: 'Número com problema', classe: 'bg-red-100 text-red-700', ok: false };
    if (st.selo === 'EM_USO') return { ...base, chave: 'EM_USO', rotulo: 'WhatsApp em uso', classe: 'bg-green-100 text-green-800', ok: true };
    if (st.verificacaoStatus === 'EXISTE') return { ...base, chave: 'TEM_CONTA', rotulo: 'Tem conta de WhatsApp', classe: 'bg-blue-100 text-blue-800', ok: true };
    return { ...base, chave: 'NEUTRO', rotulo: 'Tem número, sem histórico', classe: 'bg-gray-100 text-gray-700', ok: true };
};

export default function QualidadeWhatsapp({
    clienteUuid,
    clienteNome = '',
    cliente,            // { UUID, Telefone_Celular, whatsappStatus } — controlado; omitido = busca sozinho
    diasValidadeDispensa,
    podeEditar = false,
    onAtualizado,        // () => void — chamado após salvar/dispensar
    className = '',
}) {
    const autonomo = cliente === undefined;
    const [carregando, setCarregando] = useState(autonomo);
    const [dados, setDados] = useState(autonomo ? null : cliente);
    const [dias, setDias] = useState(diasValidadeDispensa ?? null);
    const [mostrarModal, setMostrarModal] = useState(false);

    const carregar = async () => {
        if (!clienteUuid) return;
        setCarregando(true);
        try {
            const c = await clienteService.detalhar(clienteUuid);
            setDados(c || null);
        } catch {
            setDados(null);
        } finally {
            setCarregando(false);
        }
    };

    useEffect(() => {
        if (autonomo) carregar();
        else setDados(cliente);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clienteUuid, autonomo, cliente?.whatsappStatus, cliente?.Telefone_Celular]);

    // Validade da dispensa: se não veio pronta (`dispensaValidaAte`) e o registro
    // é antigo, completa com a config — mesma regra de PendenciasWhatsapp/ficha.
    useEffect(() => {
        if (diasValidadeDispensa != null) { setDias(diasValidadeDispensa); return; }
        if (dados?.whatsappStatus?.dispensaMotivo && !dados.whatsappStatus.dispensaValidaAte) {
            whatsappClientesService.config().then(cfg => setDias(cfg?.diasValidadeDispensa ?? null)).catch(() => { });
        }
    }, [diasValidadeDispensa, dados?.whatsappStatus]);

    const situacao = avaliarWhatsapp(dados);
    const temNumero = situacao.temNumero;
    const dataAte = fmtData(calcularValidaAte(situacao.dispensaValidaAte, situacao.dispensaEm, dias));

    return (
        <div className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}>
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                <MessageCircle className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">WhatsApp</span>
            </div>
            <div className="p-4 space-y-3">
                {carregando ? (
                    <div className="flex items-center justify-center py-8 text-gray-500 gap-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                    </div>
                ) : (
                    <>
                        <div>
                            <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${situacao.classe}`}>{situacao.rotulo}</span>
                            {situacao.chave === 'EM_USO' && (
                                <p className="text-xs text-gray-500 mt-1.5">
                                    Já saiu mensagem nossa para este número — não quer dizer que o cliente confirmou.
                                    {situacao.seloEm ? <> Última vez: <b>{fmtData(situacao.seloEm)}</b>.</> : ''}
                                </p>
                            )}
                            {situacao.chave === 'COM_PROBLEMA' && (
                                <p className="text-xs text-red-600 mt-1.5 leading-snug">
                                    O WhatsApp da empresa recusou o envio por este número.
                                    {situacao.seloMotivo ? ` ${situacao.seloMotivo}` : ' O escritório precisa conferir.'}
                                </p>
                            )}
                            {situacao.chave === 'TEM_CONTA' && (
                                <p className="text-xs text-gray-500 mt-1.5" title="O WhatsApp respondeu que existe uma conta neste número. NÃO quer dizer que o número seja do cliente.">
                                    Existe conta de WhatsApp neste número — vale conferir com o cliente se é dele mesmo.
                                </p>
                            )}
                            {situacao.chave === 'SEM_NUMERO' && (
                                <p className="text-xs text-gray-500 mt-1.5">Nenhum número de WhatsApp cadastrado para este cliente.</p>
                            )}
                            {situacao.chave === 'DISPENSADO' && (
                                <p className="text-xs text-amber-700 mt-1.5 leading-snug">
                                    {rotuloMotivo(situacao.dispensaMotivo)}
                                    {situacao.dispensaPorNome ? ` · por ${situacao.dispensaPorNome}` : ''}
                                    {fmtData(situacao.dispensaEm) ? ` · em ${fmtData(situacao.dispensaEm)}` : ''}
                                    {dataAte ? <b> · dispensado até {dataAte}</b> : ''}
                                </p>
                            )}
                        </div>
                        {podeEditar && (
                            <button type="button" onClick={() => setMostrarModal(true)}
                                className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-xs flex items-center gap-1.5 min-h-[44px]">
                                <MessageCircle className="h-3.5 w-3.5" /> {temNumero ? 'Atualizar número' : 'Cadastrar WhatsApp'}
                            </button>
                        )}
                    </>
                )}
            </div>

            <ModalWhatsappCliente
                aberto={mostrarModal}
                onFechar={() => setMostrarModal(false)}
                clienteUuid={clienteUuid}
                clienteNome={clienteNome}
                numeroAtual={dados?.Telefone_Celular || ''}
                rotuloSalvar="Salvar número"
                permitirDispensa
                onSalvo={() => {
                    setMostrarModal(false);
                    if (autonomo) carregar();
                    onAtualizado?.();
                }}
            />
        </div>
    );
}
