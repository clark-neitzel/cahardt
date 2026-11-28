import React, { Suspense, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import chatLukeService from '../../services/chatLukeService';
import { lazyComRetry } from '../../utils/lazyComRetry';

// Anexos das mensagens. O arquivo só abre com o JWT no cabeçalho (rota privada, só o dono da conversa),
// então <img src="/api/..."> direto NÃO funciona: baixa como Blob e usa a URL local.
const VisualizadorPdf = lazyComRetry(() => import('../VisualizadorPdf'));

const cache = new Map(); // id -> Promise<blobUrl>
function blobUrlDe(id) {
    if (!cache.has(id)) {
        const p = chatLukeService.anexo(id).then((b) => URL.createObjectURL(b));
        p.catch(() => cache.delete(id)); // falhou: deixa tentar de novo na próxima vez
        cache.set(id, p);
    }
    return cache.get(id);
}

/** Revoga todas as URLs de blob e esvazia o cache (chamado quando o painel fecha). */
export function limparCacheAnexos() {
    const lista = [...cache.values()];
    cache.clear();
    lista.forEach((p) => { p.then((u) => URL.revokeObjectURL(u)).catch(() => {}); });
}

export function useAnexoUrl(id, ativo = true) {
    const [estado, setEstado] = useState({ url: '', erro: false });
    useEffect(() => {
        if (!id || !ativo) return undefined;
        let vivo = true;
        blobUrlDe(id).then((url) => { if (vivo) setEstado({ url, erro: false }); }).catch(() => { if (vivo) setEstado({ url: '', erro: true }); });
        return () => { vivo = false; };
    }, [id, ativo]);
    return estado;
}

/** Foto dentro da conversa. `previewLocal` (URL do aparelho) evita baixar de novo o que acabou de ser enviado. */
export function FotoMsg({ anexo, previewLocal, ativo = true, onAbrir }) {
    const { url, erro } = useAnexoUrl(anexo?.id, ativo && !previewLocal);
    const src = previewLocal || url;
    return (
        <button type="button" className="lk-foto" onClick={() => src && onAbrir({ tipo: 'foto', src, nome: anexo?.nome })} aria-label={`Abrir foto${anexo?.nome ? ` ${anexo.nome}` : ''}`}>
            {src ? <img src={src} alt="" /> : <span className="lk-ph" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#6b7280' }}>{erro ? 'Foto indisponível' : 'Carregando…'}</span>}
        </button>
    );
}

export function PdfMsg({ anexo, onAbrir }) {
    const [carregando, setCarregando] = useState(false);
    async function abrir() {
        setCarregando(true);
        try {
            const url = await blobUrlDe(anexo.id);
            const blob = await fetch(url).then((r) => r.blob());
            onAbrir({ tipo: 'pdf', blob, nome: anexo.nome || 'documento.pdf' });
        } catch { /* sem rede: o botão continua lá para tentar de novo */ }
        setCarregando(false);
    }
    return (
        <button type="button" className="lk-pdf" onClick={abrir} disabled={carregando}>
            <i>PDF</i><span>{carregando ? 'Abrindo…' : (anexo.nome || 'documento.pdf')}</span>
        </button>
    );
}

/** Foto ampliada ou PDF aberto por cima de tudo. */
export function VisorAnexo({ aberto, onFechar }) {
    if (!aberto) return null;
    if (aberto.tipo === 'pdf') {
        return (
            <Suspense fallback={null}>
                <VisualizadorPdf blob={aberto.blob} nomeArquivo={aberto.nome} titulo={aberto.nome} onFechar={onFechar} />
            </Suspense>
        );
    }
    return (
        <div className="fixed inset-0 z-[9500] bg-black/90 flex items-center justify-center p-3" role="dialog" aria-modal="true" onClick={onFechar}>
            <img src={aberto.src} alt="" className="max-w-full max-h-full object-contain" />
            <button type="button" onClick={onFechar} aria-label="Fechar foto" className="absolute top-3 right-3 min-h-[44px] min-w-[44px] rounded-full bg-white/15 text-white flex items-center justify-center"><X className="h-6 w-6" /></button>
        </div>
    );
}
