import { useEffect, useRef, useState } from 'react';
import { Printer, Loader2, CheckCircle2, AlertTriangle, Clock, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import impressaoEtiquetasService from '../../services/impressaoEtiquetasService';
import SelectBusca from '../../components/SelectBusca';
import { useFiltroSalvo } from '../../hooks/useFiltrosSalvos';
import useEnvioBitmap from './useEnvioBitmap';

// Botões "Imprimir na Zebra" (primário, impressão direta pela fila) + "Imprimir pelo navegador"
// (secundário, caminho ANTIGO inalterado) com chip da impressora e os estados do envio.
// Usado nos 3 pontos: EtiquetaImprimir, PrintModal (EtiquetasList) e PainelEtiquetas (Kit Festa/Delivery).
//
// Props:
//  origem        'PRODUTO' | 'KIT_FESTA' | 'DELIVERY' | 'FUNCIONARIO_PASTA' | 'FUNCIONARIO_ARQUIVO'
//  preparar      async () => ({ bitmaps, sequencia? })  — rasteriza (só roda no clique)
//  copias        número (PRODUTO: vai no corpo; caixas: não usa)
//  referencia    { tipo, id, rotulo }
//  nome          texto curto p/ avisos
//  bloqueio      string | null — motivo para desabilitar o botão da Zebra (ex.: rolo 80×100)
//  acaoBloqueio  { rotulo, onClick } — atalho de um toque (ex.: "Usar 100×120")
//  onNavegador   () => void — caminho antigo (síncrono no clique!)
//  confirmar     () => boolean — opcional, síncrono, antes de enviar (ex.: > 60 etiquetas)
//  total         nº de etiquetas do envio (caixas): confere o teto pela(s) coluna(s) da impressora
//  rotuloZebra   texto do botão primário (padrão "Imprimir na Zebra")
export default function ImprimirDireto({
    origem, preparar, copias = 1, referencia, nome = 'etiqueta', bloqueio = null, acaoBloqueio = null,
    total = 0, onNavegador, confirmar, rotuloZebra = 'Imprimir na Zebra', className = '',
}) {
    const [impressoras, setImpressoras] = useState(null); // null = carregando
    const [erroLista, setErroLista] = useState('');
    const [escolhida, setEscolhida] = useFiltroSalvo(`etiquetas:impressora:${origem}`, '');
    const envio = useEnvioBitmap();
    const vivo = useRef(true);

    useEffect(() => {
        vivo.current = true;
        impressaoEtiquetasService.impressoras(origem)
            .then((l) => { if (vivo.current) setImpressoras(Array.isArray(l) ? l : []); })
            .catch((e) => {
                if (!vivo.current) return;
                setImpressoras([]);
                setErroLista(e?.response?.status === 403 ? 'Você não tem permissão para imprimir direto nesta área.' : 'Não foi possível consultar a impressora.');
            });
        return () => { vivo.current = false; };
    }, [origem]);

    const lista = impressoras || [];
    const impressora = lista.find((i) => i.id === escolhida) || lista[0] || null;
    const estado = impressora?.estadoAgente;

    const clicarZebra = () => {
        if (envio.ocupado || bloqueio || !impressora) return;
        if (confirmar && !confirmar()) return;
        envio.enviar({
            origem, nome, referencia, impressoraId: lista.length > 1 ? impressora.id : undefined,
            copias: (origem === 'PRODUTO' || origem === 'FUNCIONARIO_PASTA') ? Math.max(1, Math.min(999, parseInt(copias, 10) || 1)) : undefined,
            montar: preparar,
        });
    };

    // print() do navegador tem que ser SÍNCRONO no clique (iOS): dispara o cancelamento sem esperar.
    const cancelarEImprimirNavegador = () => {
        const p = envio.cancelarPendentes();
        onNavegador?.();
        p.then((ok) => { if (!ok) toast('A etiqueta já estava saindo na Zebra — confira para não sair em dobro.', { icon: '⚠️', duration: 7000 }); });
    };

    const fase = envio.fase;
    // teto do servidor: 3 trabalhos × 40 formulários (2 colunas = 240 etiquetas, 1 coluna = 120)
    const teto = (impressora?.colunas || 1) >= 2 ? 240 : 120;
    const bloqueioTeto = origem !== 'PRODUTO' && origem !== 'FUNCIONARIO_PASTA' && impressora && total > teto
        ? `Mais de ${teto} etiquetas: divida em dois envios ou use "Imprimir pelo navegador".` : null;
    const emAndamento = fase === 'fila' || fase === 'imprimindo'; // 2º clique aqui criaria trabalho novo = etiqueta em dobro
    const desabilitaZebra = envio.ocupado || emAndamento || !!bloqueio || !!bloqueioTeto || !impressora;
    const motivo = bloqueio || bloqueioTeto || erroLista || (impressoras && !impressora ? 'Nenhuma impressora ativa cadastrada para este tamanho (Configurações → Impressoras).' : '');

    const corChip = estado === 'ONLINE' ? 'bg-green-100 text-green-800' : estado === 'INSTAVEL' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
    const txtChip = estado === 'ONLINE' ? 'online' : estado === 'INSTAVEL' ? 'instável' : 'PC desligado';

    return (
        <div className={`space-y-2 ${className}`} data-imprimir-direto>
            {/* chip da impressora */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
                {impressoras === null && <span className="text-gray-500 inline-flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Procurando impressora…</span>}
                {impressora && (
                    <>
                        {lista.length > 1 ? (
                            <SelectBusca value={impressora.id} onChange={(e) => setEscolhida(e.target.value)} className="w-full md:w-56 h-11 md:h-auto">
                                {lista.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
                            </SelectBusca>
                        ) : <span className="font-semibold text-gray-700 inline-flex items-center gap-1"><Printer className="h-3.5 w-3.5" /> {impressora.nome}</span>}
                        <span data-chip-impressora className={`px-2 py-1 rounded-full font-semibold ${corChip}`}>{txtChip}</span>
                        {estado === 'OFFLINE' && <span className="text-gray-600">a etiqueta espera na fila por 15 minutos</span>}
                    </>
                )}
            </div>

            {motivo && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1 min-w-[12rem]">{motivo}</span>
                    {bloqueio && acaoBloqueio && (
                        <button type="button" onClick={acaoBloqueio.onClick} className="px-3 py-2 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-xs">{acaoBloqueio.rotulo}</button>
                    )}
                </div>
            )}

            {/* botões */}
            <div className="flex flex-col sm:flex-row gap-2">
                <button type="button" onClick={clicarZebra} disabled={desabilitaZebra} data-acao="zebra"
                    className="flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] bg-primary hover:bg-primaryDark disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full shadow-sm font-semibold text-sm">
                    {envio.ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                    {envio.ocupado ? (fase === 'preparando' ? 'Preparando…' : 'Enviando…') : fase === 'saiu' ? 'Imprimir de novo na Zebra' : rotuloZebra}
                </button>
                <button type="button" onClick={() => onNavegador?.()} data-acao="navegador"
                    className="flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm">
                    <Globe className="h-4 w-4" /> Imprimir pelo navegador
                </button>
            </div>

            {/* estados */}
            {fase !== 'ocioso' && (
                <div data-fase={fase} className={`rounded-lg border p-2.5 text-sm ${fase === 'erro' ? 'border-red-200 bg-red-50 text-red-800' : fase === 'saiu' ? 'border-green-200 bg-green-50 text-green-800' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                    {fase === 'preparando' && <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Preparando a imagem da etiqueta…</div>}
                    {fase === 'enviando' && <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Enviando para a fila…</div>}
                    {fase === 'fila' && (
                        <div className="space-y-1">
                            <div className="flex items-center gap-2"><Clock className="h-4 w-4" /> Na fila — esperando a impressora pegar.</div>
                            {envio.info.aviso && <div className="text-xs">{envio.info.aviso}</div>}
                            {envio.info.agenteOffline && !envio.info.aviso && <div className="text-xs">O computador da cozinha parece desligado. A etiqueta fica na fila por 15 minutos.</div>}
                            {envio.info.semRede && <div className="text-xs text-amber-700">Sem conexão para acompanhar — a etiqueta continua na fila.</div>}
                            {(envio.info.agenteOffline || envio.info.tentandoDeNovo) && (
                                <button type="button" onClick={cancelarEImprimirNavegador} className="mt-1 px-3 py-2 min-h-[44px] bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-full text-xs font-medium">Cancelar e imprimir pelo navegador</button>
                            )}
                        </div>
                    )}
                    {fase === 'imprimindo' && <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Imprimindo…</div>}
                    {fase === 'saiu' && <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" /> Saiu na impressora.</div>}
                    {fase === 'erro' && (
                        <div className="space-y-2">
                            <div className="flex items-start gap-2"><AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" /> <span>{envio.erro}</span></div>
                            <div className="flex flex-col sm:flex-row gap-2">
                                {!envio.semRetentativa && <button type="button" onClick={envio.tentarDeNovo} data-acao="tentar-de-novo" className="px-4 py-2 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm">Tentar de novo</button>}
                                <button type="button" onClick={cancelarEImprimirNavegador} data-acao="cancelar-navegador" className="px-4 py-2 min-h-[44px] bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-full font-medium text-sm">Cancelar e imprimir pelo navegador</button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
