import React, { useState, useEffect } from 'react';
import ImgComFalha, { } from '../../components/Diario/ImgComFalha';
import { Loader2, ClipboardCheck } from 'lucide-react';
import checklistVeiculoService, { urlImagem } from '../../services/checklistVeiculoService';
import VisualizadorFotos from '../../components/ChecklistVeiculo/VisualizadorFotos';
import { montarSlides, complementoDe } from '../../utils/checklistFotos';

const VEREDITO = {
    APROVADO: { label: 'Aprovado', cls: 'bg-green-100 text-green-800' },
    ATENCAO: { label: 'Atenção', cls: 'bg-amber-100 text-amber-700' },
    REPROVADO: { label: 'Reprovado', cls: 'bg-red-100 text-red-700' },
    IA_INDISPONIVEL: { label: 'Sem análise', cls: 'bg-gray-100 text-gray-700' },
};
const DECISAO = {
    CORRIGIU: 'Corrigiu',
    SEGUIU_TESTE: 'Seguiu mesmo assim (teste)',
};

const fmtData = (d) => {
    if (!d) return '';
    const p = String(d).split('T')[0].split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
};
const fmtKm = (n) => (n != null ? `${Number(n).toLocaleString('pt-BR')} km` : '—');

/** Aba "Checklists" da ficha do veículo: lista simples por dia (Dia 1, sem modal de detalhe). */
const KM_ORIGEM = { PAINEL_CONFIRMADO: 'confirmado pelo painel', DIGITADO: 'digitado' };

const ChecklistsVeiculoLista = ({ veiculoId, destaque = null, placa = null }) => {
    const [lista, setLista] = useState(null);
    const [erro, setErro] = useState(false);
    const [ver, setVer] = useState(null); // { slides, indice } no visualizador

    const carregar = async () => {
        try {
            setErro(false);
            const r = await checklistVeiculoService.listarDoVeiculo(veiculoId, { limit: 30 });
            setLista(Array.isArray(r) ? r : []);
        } catch {
            setErro(true);
        }
    };
    useEffect(() => { carregar(); }, [veiculoId]); // eslint-disable-line react-hooks/exhaustive-deps

    if (erro) {
        return (
            <div className="text-center py-10 text-sm text-gray-600">
                Não consegui carregar os checklists.
                <button type="button" onClick={carregar} className="block mx-auto mt-3 min-h-[44px] px-4 border border-primary text-primary rounded-full font-medium">Tentar de novo</button>
            </div>
        );
    }
    if (!lista) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
    if (lista.length === 0) {
        return (
            <div className="text-center text-gray-500 py-10">
                <ClipboardCheck className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum checklist por foto registrado ainda.</p>
            </div>
        );
    }

    // rascunho de hoje primeiro, depois o card em destaque (vindo do Caixa), depois a ordem do servidor
    const peso = (c) => (c.status === 'RASCUNHO' ? 0 : (destaque && c.id === destaque ? 1 : 2));
    const ordenada = lista.map((c, i) => ({ c, i })).sort((a, b) => peso(a.c) - peso(b.c) || a.i - b.i).map(x => x.c);

    const abrir = (c, angulo) => {
        const fotos = Array.isArray(c.fotos) ? c.fotos : [];
        const slots = [];
        fotos.forEach((f, i) => {
            if (f.complemento || slots.some(x => x.angulo === f.angulo)) return;
            slots.push({ angulo: f.angulo, rotulo: f.rotulo || f.angulo, ordem: i });
        });
        const slides = montarSlides(fotos, slots, { editavel: false, modo: 'escritorio' });
        setVer({
            slides,
            indice: Math.max(0, slides.findIndex(sl => sl.angulo === angulo)),
            contexto: {
                motorista: c.vendedor?.nome || null,
                data: fmtData(c.dataReferencia),
                veiculo: placa,
                kmLido: c.kmLido ?? null,
                kmDigitado: c.kmDigitado ?? null,
                kmOrigem: c.kmOrigem || null,
            },
        });
    };

    return (
        <div className="space-y-3">
            {ordenada.map(c => {
                const v = VEREDITO[c.veredito] || { label: c.veredito || 'Sem veredito', cls: 'bg-gray-100 text-gray-700' };
                const problemas = Array.isArray(c.problemas) ? c.problemas : [];
                const fotos = Array.isArray(c.fotos) ? c.fotos : [];
                const emAndamento = c.status === 'RASCUNHO';
                const ehDestaque = !!destaque && c.id === destaque;
                const discord = Number(c.discordancias) || 0;
                const kmDiverge = c.kmLido != null && c.kmDigitado != null && c.kmLido !== c.kmDigitado;
                return (
                    <div key={c.id} className={`bg-white rounded-xl shadow-sm p-3 ${ehDestaque ? 'border-2 border-primary' : 'border border-gray-200'}`}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-900">{fmtData(c.dataReferencia)}{c.momento === 'VOLTA' ? ' · Volta' : ''}</p>
                                <p className="text-xs text-gray-500 truncate">{c.vendedor?.nome || '—'}</p>
                            </div>
                            {emAndamento
                                ? <span className="shrink-0 px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">Em andamento</span>
                                : <span className={`shrink-0 px-2 py-1 text-xs font-semibold rounded-full ${v.cls}`}>{v.label}</span>}
                        </div>
                        <div className="text-xs text-gray-600 space-y-0.5 mb-2">
                            <p>Decisão: <span className="font-semibold text-gray-800">{c.decisao ? (DECISAO[c.decisao] || c.decisao) : '—'}</span></p>
                            <p>
                                KM lido pela IA: <span className="font-mono font-semibold text-gray-800">{fmtKm(c.kmLido)}</span>
                                {' · '}digitado: <span className={`font-mono font-semibold ${kmDiverge ? 'text-amber-700' : 'text-gray-800'}`}>{fmtKm(c.kmDigitado)}</span>
                                {c.kmOrigem && KM_ORIGEM[c.kmOrigem] ? <span className="text-gray-500"> ({KM_ORIGEM[c.kmOrigem]})</span> : null}
                            </p>
                            {discord > 0 && (
                                <p className="text-amber-700 font-semibold">{discord} {discord === 1 ? 'discordância' : 'discordâncias'}: o motorista disse "tá certo assim" e seguiu</p>
                            )}
                        </div>
                        {fotos.length > 0 && (
                            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                                {fotos.filter(f => !f.complemento).map(f => (
                                    <button key={f.id} type="button" onClick={() => abrir(c, f.angulo)} className="min-w-0 text-left" title={f.rotulo || f.angulo}>
                                        <ImgComFalha compacto src={urlImagem(f.url)} alt={f.rotulo || f.angulo} loading="lazy"
                                            className="aspect-square w-full object-cover rounded-lg border border-gray-200" />
                                        {f.aceitaPeloMotorista && (
                                            <span className="mt-0.5 block text-center px-1 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-700">Tá certo assim</span>
                                        )}
                                        {complementoDe(fotos, f.angulo) && (
                                            <span className="mt-0.5 block text-center px-1 py-0.5 text-[10px] font-semibold rounded-full bg-gray-100 text-gray-700">Foto extra</span>
                                        )}
                                        {f.perguntasRespondidas > 0 && f.statusIa !== 'PERGUNTA' && (
                                            <span className="mt-0.5 block text-center px-1 py-0.5 text-[10px] font-semibold rounded-full bg-green-100 text-green-800">Respondida</span>
                                        )}
                                        {f.statusIa === 'PERGUNTA' && (
                                            <span className="mt-0.5 block text-center px-1 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-700">Pergunta</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                        {problemas.length > 0 && (
                            <ul className="mt-2 space-y-1">
                                {problemas.map((p, i) => (
                                    <li key={i} className="text-xs text-gray-700 flex gap-1.5">
                                        <span className={`shrink-0 font-bold ${p.gravidade === 'REPROVA' ? 'text-red-600' : 'text-amber-600'}`}>{p.gravidade === 'REPROVA' ? 'Grave' : p.gravidade === 'PERGUNTA' ? 'Pergunta' : 'Atenção'}:</span>
                                        <span>
                                            {p.gravidade === 'PERGUNTA' ? (p.pergunta || p.descricao) : p.descricao}
                                            {p.resposta && (
                                                <span className={`ml-1 px-1.5 py-0.5 rounded-full font-semibold ${p.resposta === 'SIM' ? 'bg-green-100 text-green-800' : p.gravidadeAplicada === 'REPROVA' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                                    Respondeu: {p.resposta === 'SIM' ? 'Sim' : 'Não'}
                                                </span>
                                            )}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                );
            })}

            {ver && ver.slides.length > 0 && (
                <VisualizadorFotos slides={ver.slides} indiceInicial={ver.indice} modo="escritorio" contexto={ver.contexto} onClose={() => setVer(null)} />
            )}
        </div>
    );
};

export default ChecklistsVeiculoLista;
