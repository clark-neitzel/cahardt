import React, { useState, useEffect } from 'react';
import { Printer, X } from 'lucide-react';
import toast from 'react-hot-toast';
import SelectBusca from '../../components/SelectBusca';
import { useFiltrosSalvos } from '../../hooks/useFiltrosSalvos';
import { imprimirNaPagina } from '../../utils/imprimirNaPagina';
import { montarEtiquetas, OPCOES_PADRAO, CONJUNTOS_FRASES } from './etiquetasCaixas';
import CampoNumero from '../../components/CampoNumero';
import ImprimirDireto from '../PCP/ImprimirDireto';
import { prepararCaixas } from '../PCP/etiquetaDireto';

/**
 * Painel de opções + botão de imprimir as etiquetas das caixas (rolo 40×25 mm, TLP 2844).
 * Usado inline no modal do pedido do Kit Festa e como modal no kanban do Delivery.
 * As opções ficam lembradas por usuário (chave única para as duas telas).
 *
 * @param {object} pedido   no formato de montarEtiquetas ({ numero, nomeCliente, modo, data, horario, itens })
 * @param {string} qrSvg    QR já gerado (SVG inline) — print() precisa ser síncrono no clique
 * @param {string} titulo   opcional (ex.: cliente) mostrado no cabeçalho
 * @param {function} onClose quando informado, renderiza como modal com botão de fechar
 * @param {string} origem   'KIT_FESTA' (modal do pedido) ou 'DELIVERY' (card do kanban) — decide a permissão no servidor
 */
export default function PainelEtiquetas({ pedido, qrSvg, titulo, onClose, origem = 'KIT_FESTA' }) {
  const [op, setOp] = useFiltrosSalvos('kit-festa:etiquetas', OPCOES_PADRAO);
  const [cadaTxt, setCadaTxt] = useState(null); // texto digitado (null = espelha o valor salvo)
  const [, setFontesOk] = useState(0); // re-render quando as fontes terminam de carregar (medição fiel)
  useEffect(() => { document.fonts?.ready?.then(() => setFontesOk(1)).catch(() => {}); }, []);
  const previa = montarEtiquetas(pedido, { ...op, qrSvg });

  const imprimir = () => {
    if (!previa.total) { toast.error('Pedido sem caixas para etiquetar.'); return; }
    // confirm é síncrono: o print() segue no mesmo gesto do clique
    if (previa.total > 60 && !window.confirm(`Isto vai imprimir ${previa.total} etiquetas. Confirma?`)) return;
    imprimirNaPagina(previa.estilos, previa.corpo);
    onClose?.();
  };

  const painel = (
    <div className="bg-mint/40 border border-mint rounded-xl p-3 text-sm space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold text-house"><Printer className="h-4 w-4" /> Etiquetas das caixas{titulo ? <span className="font-normal text-gray-600 truncate">· {titulo}</span> : null}</div>
        {onClose && <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"><X className="h-4 w-4" /></button>}
      </div>
      <div className="text-xs text-gray-600">
        1 etiqueta por caixa com o sabor, o nº do pedido, o QR do site e uma frase · a cada {Number(op.cada) || OPCOES_PADRAO.cada} caixas, 1 etiqueta com pedido, cliente e horário.
        {' '}Total: <b>{previa.total}</b> etiquetas ({previa.caixas} caixas).
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <label className="flex items-center gap-2 sm:col-span-3">Frase nas caixas
          <SelectBusca value={op.frases || OPCOES_PADRAO.frases} onChange={e => setOp({ ...op, frases: e.target.value })} className="flex-1 max-w-[260px]">
            {Object.entries(CONJUNTOS_FRASES).map(([k, c]) => <option key={k} value={k}>{c.nome}{c.frases[0] ? ` · "${c.frases[0]}"…` : ''}</option>)}
          </SelectBusca>
        </label>
        <label className="flex items-center gap-2">Pedido a cada
          <CampoNumero min="1" max="12" value={cadaTxt ?? op.cada}
            onChange={e => {
              const t = e.target.value;
              setCadaTxt(t);
              const n = Math.round(Number(t));
              if (t !== '' && n >= 1) { if (n > 12) setCadaTxt('12'); setOp({ ...op, cada: Math.min(12, n) }); }
            }}
            onBlur={() => {
              if (cadaTxt !== null && (cadaTxt === '' || !(Number(cadaTxt) >= 1))) setOp({ ...op, cada: OPCOES_PADRAO.cada });
              setCadaTxt(null);
            }}
            className="w-14 border border-gray-300 rounded px-2 py-1 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" /> caixas
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!op.nomeLimpo} onChange={e => setOp({ ...op, nomeLimpo: e.target.checked })} />
          Tirar o "C/25-HF" do nome
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={Number(op.colunas) !== 1} onChange={e => setOp({ ...op, colunas: e.target.checked ? 2 : 1 })} />
          Rolo de 2 colunas
        </label>
      </div>
      <ImprimirDireto
        className="pt-1"
        origem={origem}
        nome={`Pedido #${pedido?.numero ?? ''}`}
        rotuloZebra="Imprimir na Zebra"
        referencia={{ tipo: 'PEDIDO', id: String(pedido?.numero ?? ''), rotulo: `Pedido #${pedido?.numero ?? ''} · ${previa.total} etiquetas` }}
        total={previa.total}
        confirmar={() => previa.total <= 60 || window.confirm(`Isto vai imprimir ${previa.total} etiquetas. Confirma?`)}
        onNavegador={imprimir}
        preparar={() => prepararCaixas({ pedido, opcoes: { cada: Number(op.cada) || OPCOES_PADRAO.cada, nomeLimpo: op.nomeLimpo, colunas: op.colunas, frases: op.frases || OPCOES_PADRAO.frases } })}
      />
      <div className="text-xs text-gray-500">Pelo navegador: escolha a TLP 2844, margem 0, escala 100%. Na Zebra o rolo usa as colunas do cadastro da impressora.</div>
    </div>
  );

  if (!onClose) return painel;
  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg p-3" onClick={e => e.stopPropagation()}>{painel}</div>
    </div>
  );
}
