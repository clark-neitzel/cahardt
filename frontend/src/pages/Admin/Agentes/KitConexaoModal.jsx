import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { BookOpen, Check, Copy, Download, Loader2 } from 'lucide-react';
import agenteService, { mensagemErro } from '../../../services/agenteService';
import { ModalBase, BtnPrimario, BtnSecundario } from './ModalBase';

export default function KitConexaoModal({ agente, onFechar }) {
    const [kit, setKit] = useState(null);
    const [erro, setErro] = useState('');
    const [copiado, setCopiado] = useState(false);

    useEffect(() => {
        let vivo = true;
        setKit(null);
        setErro('');
        agenteService.lerKit(agente.id)
            .then((r) => { if (vivo) setKit(r); })
            .catch((e) => { if (vivo) setErro(mensagemErro(e, 'Não foi possível gerar o kit de conexão.')); });
        return () => { vivo = false; };
    }, [agente.id]);

    const copiar = async () => {
        if (!kit?.markdown) return;
        try {
            await navigator.clipboard.writeText(kit.markdown);
            setCopiado(true);
            toast.success('Kit de conexão copiado.');
            setTimeout(() => setCopiado(false), 2500);
        } catch {
            toast.error('Não foi possível copiar automaticamente. Use "Baixar .md".');
        }
    };

    const baixar = () => {
        if (!kit?.markdown) return;
        const blob = new Blob([kit.markdown], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = kit.nomeArquivo || 'kit-conexao.md';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success('Arquivo .md baixado.');
    };

    return (
        <ModalBase
            titulo={`Kit de Conexão — ${agente.nome}`}
            onFechar={onFechar}
            largura="md:max-w-3xl"
            rodape={(
                <>
                    <BtnSecundario onClick={onFechar}>Fechar</BtnSecundario>
                    {kit && (
                        <>
                            <BtnSecundario onClick={baixar} className="inline-flex items-center justify-center gap-1.5">
                                <Download className="h-4 w-4" /> Baixar .md
                            </BtnSecundario>
                            <BtnPrimario onClick={copiar} className="inline-flex items-center justify-center gap-1.5">
                                {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                {copiado ? 'Copiado!' : 'Copiar kit (.md)'}
                            </BtnPrimario>
                        </>
                    )}
                </>
            )}
        >
            {erro && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800" role="alert">
                    {erro}
                </div>
            )}
            {!kit && !erro && (
                <div className="py-10 text-center text-sm text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin inline mr-2" />Gerando instruções vivas da conexão…
                </div>
            )}
            {kit && (
                <div className="space-y-3" data-testid="kit-conexao-conteudo">
                    <div className="rounded-xl bg-mint/40 border border-mint p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-800">
                        <div className="flex items-center gap-2 min-w-0">
                            <BookOpen className="h-4 w-4 text-primaryDark shrink-0" />
                            <span>
                                Guia pronto para entregar ao integrador ou agente de IA — <b>sem nenhum token secreto</b>.
                                Reflete a matriz de hoje: <b>{kit.resumo?.sim ?? 0} em SIM</b> · <b>{kit.resumo?.pede ?? 0} em PEDE</b>.
                            </span>
                        </div>
                    </div>
                    <pre className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-xs font-mono text-gray-800 whitespace-pre-wrap break-words max-h-[55vh] overflow-y-auto">
                        {kit.markdown}
                    </pre>
                </div>
            )}
        </ModalBase>
    );
}
