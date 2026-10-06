import React, { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { buscarIndicador, salvarAliquota } from '../../../services/indicadoresGestaoApi';

// ⚙ (só admin): alíquota única do imposto sobre a venda (decisão D1 do plano).
export default function ConfigImpostoModal({ onFechar, onSalvou }) {
    const [valor, setValor] = useState('');
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        let vivo = true;
        buscarIndicador('config', {})
            .then(({ dados }) => { if (vivo && dados?.aliquotaImpostoVenda != null) setValor(String(dados.aliquotaImpostoVenda).replace('.', ',')); })
            .catch(() => {})
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, []);

    const salvar = async () => {
        const txt = valor.trim().replace(',', '.');
        const n = txt === '' ? 0 : Number(txt);
        // só confere se é número; a faixa (0 a 40%) quem valida é o servidor, que devolve a mensagem
        if (!Number.isFinite(n)) { toast.error('Informe um número válido, por exemplo 6.'); return; }
        setSalvando(true);
        try {
            await salvarAliquota(n);
            toast.success(n > 0 ? 'Alíquota salva. Os indicadores já usam o imposto por alíquota.' : 'Alíquota limpa. Volta a valer o imposto realmente pago.');
            onSalvou?.();
            onFechar();
        } catch (e) {
            toast.error(e?.response?.status === 404 ? 'Este recurso ainda não está disponível no servidor.' : (e?.response?.data?.error || 'Não foi possível salvar.'));
        } finally { setSalvando(false); }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Imposto sobre a venda" onClick={onFechar}>
            <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600 flex-1">Imposto sobre a venda</span>
                    <button type="button" onClick={onFechar} aria-label="Fechar" className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
                </div>
                <div className="p-5 space-y-3">
                    <label className="block text-sm font-medium text-gray-700" htmlFor="aliq">Alíquota (%)</label>
                    <input id="aliq" inputMode="decimal" value={valor} disabled={carregando} onChange={(e) => setValor(e.target.value)} placeholder="Ex.: 6"
                        className="w-full border border-gray-300 rounded px-3 py-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                    <p className="text-xs text-gray-600 leading-relaxed">
                        Com a alíquota preenchida, o imposto é calculado sobre o que foi vendido <b>com nota</b> e o bloco "Impostos sobre vendas" do Contas a Pagar sai das despesas (para não contar duas vezes).
                        Vazia ou 0: a tela usa o imposto realmente pago e mostra o selo "imposto real pago".
                    </p>
                </div>
                <div className="flex gap-3 px-5 pb-5">
                    <button type="button" onClick={onFechar} className="flex-1 px-4 py-3 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-sm font-medium">Cancelar</button>
                    <button type="button" onClick={salvar} disabled={salvando || carregando} className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-3 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full text-sm font-semibold disabled:opacity-50">
                        {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
                    </button>
                </div>
            </div>
        </div>
    );
}
