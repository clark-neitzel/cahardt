import { useEffect, useState } from 'react';
import { X, Printer, Loader2 } from 'lucide-react';
import { useSetores } from '../../../hooks/useSetores';
import comoFazerService, { mensagemErro, urlMidia, TIPOS } from '../../../services/comoFazerService';
import SelectBusca from '../../../components/SelectBusca';
import imprimirNaPagina from '../../../utils/imprimirNaPagina';
import { montarCorpoDocumento, ESTILOS_FOLHA, esc } from '../../ComoFazer/htmlDocumento';
import { fmtDataHora } from '../../../components/ComoFazer/visual';

function carregarImagens(urls, limiteMs = 8000) {
    return Promise.race([
        Promise.all(urls.map((u) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(true); i.onerror = () => ok(false); i.src = u; }))),
        new Promise((ok) => setTimeout(ok, limiteMs)),
    ]);
}

// Relatório para a Vigilância: prévia → "Imprimir" (síncrono no clique, na própria página).
// As imagens são pré-carregadas ANTES de liberar o botão, porque o print() não pode esperar.
export default function RelatorioComoFazer({ periodo, onFechar }) {
    const [conteudos, setConteudos] = useState([]);
    const [conteudoId, setConteudoId] = useState('');
    const [rel, setRel] = useState(null);
    const [pronto, setPronto] = useState(false);
    const [erro, setErro] = useState('');

    const { setores: listaSetores, carregando: carregandoSetores, aviso: avisoSetores } = useSetores();

    useEffect(() => {
        if (carregandoSetores) return;
        Promise.all(listaSetores.map((s) => comoFazerService.painelTreinamentos(s.codigo).catch(() => null)))
            .then((rs) => {
                const mapa = new Map();
                rs.forEach((r) => (r?.conteudos || []).forEach((c) => mapa.set(c.id, c)));
                const lista = [...mapa.values()];
                setConteudos(lista);
                if (lista[0]) setConteudoId((atual) => atual || lista[0].id);
            });
    }, [carregandoSetores, listaSetores]);

    useEffect(() => {
        if (!conteudoId) return undefined;
        let vivo = true;
        comoFazerService.painelRelatorio({ conteudoId, de: periodo.de || undefined, ate: periodo.ate || undefined })
            .then(async (d) => {
                if (!vivo) return;
                const fotos = [];
                (d.versaoPublicada?.doc?.secoes || []).forEach((s) => (s.passos || []).forEach((p) => { if (p.foto) fotos.push(urlMidia(p.foto)); }));
                await carregarImagens(fotos);
                if (vivo) { setRel(d); setPronto(true); setErro(''); }
            })
            .catch((e) => { if (vivo) setErro(mensagemErro(e)); });
        return () => { vivo = false; };
    }, [conteudoId, periodo.de, periodo.ate]);

    const escolher = (id) => { setRel(null); setPronto(false); setErro(''); setConteudoId(id); };

    const montar = () => {
        const c = rel.conteudo || {};
        const vp = rel.versaoPublicada || {};
        const base = montarCorpoDocumento({ ...c, encarregados: rel.encarregados, versao: { numero: vp.numero, publicadaEm: vp.publicadaEm, publicadaPor: vp.publicadaPor, doc: vp.doc || {} } });
        const exige = ['MAQUINA', 'REGRA'].includes(c.tipo);
        const treinados = (rel.treinados || []).map((t) => `<tr><td>${esc(t.nome)}</td><td>${esc(fmtDataHora(t.aprendeuEm))}</td><td>${esc(t.confirmadoPor || (exige && !t.confirmadoEm ? 'aguardando confirmação' : '—'))}</td><td>${esc(t.versaoNumero)}</td></tr>`).join('');
        const execs = (rel.execucoes || []).map((x) => `<tr><td>${esc(fmtDataHora(x.quando))}</td><td>${esc(x.funcionario || '—')}</td><td>${esc(x.situacao)}</td><td>${esc(x.detalhe)}</td></tr>`).join('');
        const periodoTxt = rel.periodo ? `${rel.periodo.de.split('-').reverse().join('/')} a ${rel.periodo.ate.split('-').reverse().join('/')}` : '';
        return `${base}<div class="cf-folha"><h2>Quem treinou</h2>${treinados ? `<table><tr><th>Nome</th><th>Quando</th><th>Confirmado por</th><th>Versão</th></tr>${treinados}</table>` : '<div>Ninguém treinou ainda.</div>'}${c.tipo === 'ROTINA' ? `<h2>Execuções (${esc(periodoTxt)})</h2>${execs ? `<table><tr><th>Quando</th><th>Quem fez</th><th>Situação</th><th>Detalhe</th></tr>${execs}</table>` : '<div>Nenhuma execução no período.</div>'}` : ''}</div>`;
    };

    // Regra e Máquina só contam como treinado depois da confirmação do encarregado
    const exigeConf = ['MAQUINA', 'REGRA'].includes(rel?.conteudo?.tipo);
    const listaTreino = Array.isArray(rel?.treinados) ? rel.treinados : [];
    const resumoTreino = exigeConf
        ? { confirmados: listaTreino.filter((t) => t.confirmadoEm).length, aguardando: listaTreino.filter((t) => !t.confirmadoEm).length }
        : { confirmados: listaTreino.length, aguardando: 0 };

    const imprimir = () => imprimirNaPagina(ESTILOS_FOLHA, montar());

    return (
        <div className="fixed inset-0 z-[9000] bg-black/60 flex items-center justify-center p-3">
            <div className="bg-white rounded-2xl w-full max-w-lg p-4 space-y-3 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-gray-900">Relatório para a Vigilância</h2>
                    <button type="button" onClick={onFechar} aria-label="Fechar" className="p-2 min-h-[44px] min-w-[44px] rounded-full hover:bg-gray-100"><X className="h-5 w-5" /></button>
                </div>
                <SelectBusca value={conteudoId} onChange={(e) => escolher(e.target.value)} className="w-full">
                    {conteudos.map((c) => <option key={c.id} value={c.id}>{c.icone || TIPOS[c.tipo]?.icone} {c.titulo}</option>)}
                </SelectBusca>
                {avisoSetores && <p className="text-xs text-amber-700 font-semibold">Não consegui carregar os setores. Tente atualizar a página.</p>}
                {erro && <p className="rounded-xl bg-red-50 text-red-700 font-semibold p-3 text-sm">{erro}</p>}
                {!pronto && !erro && <div className="flex items-center gap-2 text-sm text-gray-600"><Loader2 className="h-4 w-4 animate-spin" /> Preparando as fotos…</div>}
                {pronto && rel && (
                    <div className="text-sm text-gray-700 space-y-1">
                        <p><b>{rel.conteudo?.titulo}</b>{rel.versaoPublicada?.numero != null ? ` · versão ${rel.versaoPublicada.numero}` : ''}</p>
                        <p>{resumoTreino.confirmados} pessoa(s) treinada(s){resumoTreino.aguardando > 0 ? ` · ${resumoTreino.aguardando} aguardando confirmação do encarregado` : ''} · {(rel.execucoes || []).length} execução(ões) no período.</p>
                        {!rel.versaoPublicada && <p className="text-amber-700 font-semibold">Este conteúdo ainda não tem versão publicada.</p>}
                    </div>
                )}
                <button type="button" disabled={!pronto || !rel} onClick={imprimir}
                    className="w-full min-h-[48px] rounded-full bg-primary hover:bg-primaryDark disabled:bg-gray-300 text-white font-semibold inline-flex items-center justify-center gap-2">
                    <Printer className="h-4 w-4" /> Imprimir
                </button>
            </div>
        </div>
    );
}
