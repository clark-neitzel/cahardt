import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

// Aviso de "custo fora da curva": aparece ANTES de gravar uma nota/despesa cujo custo unitário
// ou conversão de embalagem parece errado. O texto de cada alerta vem pronto do backend (`mensagem`).
// Enter NÃO confirma (leitor de código de barras e teclado do iPad); Esc volta.
// Confirmar exige marcar "Conferi quantidade e conversão".
const fmtNum = (n, max = 3) => (n == null || !Number.isFinite(Number(n)))
    ? null
    : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: max });
// abaixo de R$ 0,10 mostra 4 casas (R$ 0,0146), senão o centavo some ("R$ 0,01")
const fmtMoeda = (n) => {
    if (n == null || !Number.isFinite(Number(n))) return null;
    const v = Number(n);
    const casas = Math.abs(v) < 0.1 && v !== 0 ? 4 : 2;
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: casas, maximumFractionDigits: casas });
};

const ROTULO_TIPO = {
    CUSTO_ALTO: 'Custo muito acima do normal',
    CUSTO_BAIXO: 'Custo muito abaixo do normal',
    EMBALAGEM_FATOR_1: 'Embalagem com fator 1'
};

const Linha = ({ rotulo, valor }) => (
    valor ? (
        <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-gray-600 shrink-0">{rotulo}</span>
            <span className="font-semibold text-gray-900 text-right break-words min-w-0">{valor}</span>
        </div>
    ) : null
);

const CardAlerta = ({ a }) => {
    const un = a.unidade ? `/${a.unidade}` : '';
    const custo = fmtMoeda(a.custoUnitario);
    const ref = a.referencia;
    const refCusto = ref ? fmtMoeda(ref.custo) : null;
    const qtdForn = fmtNum(a.quantidadeFornecedor);
    const qtdConv = fmtNum(a.quantidadeConvertida);
    const fator = fmtNum(a.fator, 4);
    const embalagem = a.tipo === 'EMBALAGEM_FATOR_1';
    let razao = null;
    if (!embalagem && Number(a.razao) > 0) {
        const r = Number(a.razao);
        razao = a.tipo === 'CUSTO_BAIXO'
            ? `${fmtNum(r < 1 ? 1 / r : r, 1)}× menor`
            : `${fmtNum(r < 1 ? 1 / r : r, 1)}× maior`;
    }
    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100">
                <span className="text-xs font-bold uppercase tracking-widest text-red-700">
                    {ROTULO_TIPO[a.tipo] || 'Conferir antes de gravar'}
                </span>
                <p className="font-semibold text-gray-900 leading-snug break-words mt-0.5">{a.descricao || 'Item sem descrição'}</p>
            </div>
            <div className="px-4 py-3 space-y-1.5">
                {a.mensagem && <p className="text-sm text-gray-800 break-words">{a.mensagem}</p>}
                <div className="pt-1 space-y-1">
                    {!embalagem && <Linha rotulo="Custo resultante" valor={custo ? `${custo}${un}` : null} />}
                    {!embalagem && (
                        <Linha
                            rotulo={ref?.fonte === 'CADASTRO' ? 'Custo do cadastro' : 'Referência (compras)'}
                            valor={refCusto ? `${refCusto}${un}` : null}
                        />
                    )}
                    <Linha rotulo="Diferença" valor={razao} />
                    <Linha
                        rotulo="Quantidade"
                        valor={qtdForn && qtdConv
                            ? `${qtdForn}${a.unidadeFornecedor ? ` ${a.unidadeFornecedor}` : ''} → ${qtdConv}${a.unidade ? ` ${a.unidade}` : ''}`
                            : null}
                    />
                    <Linha rotulo="Fator de conversão" valor={fator} />
                </div>
            </div>
        </div>
    );
};

export default function ModalCustoForaDaCurva({ alertas = [], onVoltar, onConfirmar, salvando = false }) {
    const [conferi, setConferi] = useState(false);
    const voltarRef = useRef(null);
    const rolavelRef = useRef(null);
    const cb = useRef({ onVoltar });
    cb.current = { onVoltar };

    useEffect(() => {
        if (rolavelRef.current) rolavelRef.current.scrollTop = 0;
        // preventScroll: o foco não pode rolar o modal até os botões (a pessoa tem que ver os cards de cima)
        const t = setTimeout(() => {
            voltarRef.current?.focus({ preventScroll: true });
            if (rolavelRef.current) rolavelRef.current.scrollTop = 0;
        }, 30);
        const aoTeclar = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault(); e.stopPropagation();
                cb.current.onVoltar();
            } else if (e.key === 'Enter') {
                // Enter nunca confirma nem aciona botão (final de bipe de leitor / teclado do iPad)
                e.preventDefault(); e.stopPropagation();
            }
        };
        document.addEventListener('keydown', aoTeclar, true);
        return () => { clearTimeout(t); document.removeEventListener('keydown', aoTeclar, true); };
    }, []);

    const n = alertas.length;
    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3"
            role="dialog"
            aria-modal="true"
            aria-label="Custo fora do normal"
        >
            <div ref={rolavelRef} data-modal-custo-rolavel className="w-full max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden bg-secondary rounded-2xl shadow-xl border-2 border-red-500">
                <div className="flex items-center gap-2 px-4 md:px-5 py-3 bg-red-600 text-white font-bold rounded-t-2xl">
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    <span className="min-w-0">
                        {n === 1 ? 'Confira este item antes de gravar' : `Confira estes ${n} itens antes de gravar`}
                    </span>
                </div>
                <div className="p-3 md:p-5 space-y-3">
                    <p className="text-sm text-gray-700">
                        O custo ou a conversão abaixo foge do normal. Um erro aqui bagunça o estoque e o custo do produto.
                    </p>
                    {alertas.map((a, i) => <CardAlerta key={`${a.chave ?? i}-${a.tipo}-${i}`} a={a} />)}
                    <label className="flex items-start gap-3 bg-white rounded-xl border border-gray-200 p-3 min-h-[44px] cursor-pointer">
                        <input
                            type="checkbox"
                            checked={conferi}
                            onChange={(e) => setConferi(e.target.checked)}
                            disabled={salvando}
                            className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
                        />
                        <span className="text-sm font-medium text-gray-800">Conferi quantidade e conversão</span>
                    </label>
                </div>
                <div className="flex flex-col gap-2 px-3 md:px-5 pb-4 md:pb-5">
                    <button
                        ref={voltarRef}
                        type="button"
                        onClick={onVoltar}
                        disabled={salvando}
                        className="w-full min-h-[44px] px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50"
                    >
                        Voltar e corrigir
                    </button>
                    <button
                        type="button"
                        onClick={() => { if (conferi && !salvando) onConfirmar(); }}
                        disabled={!conferi || salvando}
                        className="w-full min-h-[44px] px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-full font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                    >
                        {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                        Confirmar mesmo assim
                    </button>
                </div>
            </div>
        </div>
    );
}
