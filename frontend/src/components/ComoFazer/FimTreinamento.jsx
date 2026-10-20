import { useState } from 'react';
import { CheckCircle2, Lock, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import comoFazerService, { mensagemErro, statusVisual } from '../../services/comoFazerService';
import PedirPinEncarregado from './PedirPinEncarregado';
import { fmtDataHora } from './visual';

// Rodapé do documento: "Aprendi" + "Encarregado confirma (PIN)". Rotina/Dosagem: só "Li e entendi".
export default function FimTreinamento({ conteudo, me, onAtualizado }) {
    const [enviando, setEnviando] = useState(false);
    const [pedindoPin, setPedindoPin] = useState(false);
    const treino = conteudo?.meuTreino || null;
    const status = treino?.status || 'PENDENTE';
    const exige = !!conteudo?.exigeConfirmacao;
    const funcionario = me?.funcionario || null;
    const primeiroNome = String(funcionario?.nome || '').split(' ')[0];
    const aprendeu = status !== 'PENDENTE' && status !== 'VENCIDO' && !!treino?.aprendeuEm;
    const completo = status === 'OK' || status === 'VENCENDO';
    const setor = funcionario?.setor || (Array.isArray(conteudo?.setores) ? conteudo.setores[0] : '') || '';

    const aprendi = async () => {
        setEnviando(true);
        try {
            await comoFazerService.aprendi(conteudo.id);
            toast.success('Registrado!');
            await onAtualizado();
        } catch (e) {
            toast.error(mensagemErro(e));
        } finally { setEnviando(false); }
    };

    if (status === 'NAO_SE_APLICA') return null;

    const confirmadoPor = treino?.confirmadoPor?.nome || '';
    const rotuloFinal = completo && funcionario
        ? `Fica registrado: ${funcionario.nome} ${exige ? 'aprendeu' : 'leu'} "${conteudo.titulo}"${treino?.aprendeuEm ? ` em ${fmtDataHora(treino.aprendeuEm)}` : ''}${confirmadoPor ? `, confirmado por ${confirmadoPor}` : ''}.`
        : '';

    return (
        <div id="treinamento" className="rounded-2xl bg-mint/60 border border-primary/30 p-4 space-y-3">
            <p className="font-semibold text-primaryDark">
                {exige ? '🤝 Agora faça na prática com o encarregado olhando. Quando terminar, os dois confirmam aqui.' : '📖 Leia com calma. Quando entender, toque abaixo.'}
            </p>
            <div className="flex flex-col md:flex-row gap-2">
                <button type="button" disabled={enviando || aprendeu} onClick={aprendi}
                    className="flex-1 min-h-[60px] rounded-full bg-primary hover:bg-primaryDark disabled:opacity-60 text-white font-bold text-lg inline-flex items-center justify-center gap-2">
                    {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                    {aprendeu ? (exige ? 'Aprendi (registrado)' : 'Li e entendi (registrado)') : (exige ? `Aprendi${primeiroNome ? ` — ${primeiroNome}` : ''}` : 'Li e entendi')}
                </button>
                {exige && (
                    <button type="button" disabled={!aprendeu || completo} onClick={() => setPedindoPin(true)}
                        className="flex-1 min-h-[60px] rounded-full bg-white border-2 border-primary text-primaryDark disabled:opacity-50 font-bold text-lg inline-flex items-center justify-center gap-2">
                        <Lock className="h-5 w-5" /> {completo ? 'Confirmado' : 'Encarregado confirma (PIN)'}
                    </button>
                )}
            </div>
            {!funcionario && <p className="text-sm text-red-700 font-semibold">Seu usuário ainda não está ligado a um funcionário. Peça ao RH para ligar.</p>}
            <p className="text-sm font-bold text-primaryDark">
                {statusVisual(status).emoji} {statusVisual(status).rotulo}
            </p>
            {rotuloFinal && <p className="text-sm font-bold text-primaryDark">{rotuloFinal}</p>}

            {pedindoPin && funcionario && (
                <PedirPinEncarregado conteudoId={conteudo.id} treinandoId={funcionario.id} setor={setor}
                    onFechar={() => setPedindoPin(false)}
                    onOk={async () => { setPedindoPin(false); toast.success('Confirmado pelo encarregado!'); await onAtualizado(); }} />
            )}
        </div>
    );
}
