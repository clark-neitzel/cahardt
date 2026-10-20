import { useState } from 'react';
import { Copy, Loader2, Tablet } from 'lucide-react';
import toast from 'react-hot-toast';
import comoFazerService, { mensagemErro, SETORES } from '../../../services/comoFazerService';

// Libera o tablet de um setor: gera o link com a chave (mostrado UMA vez; só o hash fica no servidor).
export default function PareamentoTablet() {
    const [gerando, setGerando] = useState('');
    const [links, setLinks] = useState({});

    const gerar = async (slug, nome) => {
        if (!window.confirm(`Gerar um link novo para o tablet da ${nome}? O aparelho que já estava liberado vai parar de funcionar até abrir o link novo.`)) return;
        setGerando(slug);
        try {
            const r = await comoFazerService.parear(slug.toLowerCase());
            setLinks((l) => ({ ...l, [slug]: r.link }));
        } catch (e) { toast.error(mensagemErro(e)); }
        finally { setGerando(''); }
    };

    const copiar = async (link) => {
        try { await navigator.clipboard.writeText(link); toast.success('Link copiado!'); }
        catch { toast.error('Não consegui copiar. Selecione o link e copie à mão.'); }
    };

    return (
        <div className="space-y-3 max-w-2xl">
            <p className="text-sm text-gray-700">
                Para cada tablet do setor, gere o link abaixo e abra-o <b>uma vez</b> no próprio tablet. Depois disso ele guarda a liberação.
                O link aparece só agora: se perder, gere outro.
            </p>
            {SETORES.map((s) => (
                <div key={s.slug} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-gray-900 flex items-center gap-2"><Tablet className="h-4 w-4 text-primary" /> {s.emoji} {s.nome}</span>
                        <button type="button" onClick={() => gerar(s.slug, s.nome)} disabled={gerando === s.slug}
                            className="min-h-[44px] px-4 rounded-full bg-primary hover:bg-primaryDark text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">
                            {gerando === s.slug && <Loader2 className="h-4 w-4 animate-spin" />} Gerar link
                        </button>
                    </div>
                    {links[s.slug] && (
                        <div className="rounded-lg bg-mint/50 border border-primary/30 p-3 space-y-2">
                            <p className="text-xs font-bold uppercase tracking-widest text-gray-600">Link do tablet (aparece só agora)</p>
                            <p className="text-sm break-all text-gray-900">{links[s.slug]}</p>
                            <button type="button" onClick={() => copiar(links[s.slug])} className="min-h-[44px] px-4 rounded-full bg-white border border-primary text-primary text-sm font-semibold inline-flex items-center gap-2">
                                <Copy className="h-4 w-4" /> Copiar link
                            </button>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
