// Contabilidade — aba PACOTE DO MÊS (Fase 4): um clique gera o ZIP completo
// para anexar no e-mail do escritório de contabilidade.
import { useState } from 'react';
import { FileArchive, Loader2 } from 'lucide-react';
import { baixarArquivoApi } from './comum';

const ITENS = [
    ['Títulos a receber criados no mês', 'com NF, forma e banco de cada baixa'],
    ['Recebimentos do mês', 'uma linha por baixa (regime de caixa)'],
    ['Contas a pagar do mês', 'com o rateio por categoria da DRE'],
    ['Pagamentos do mês', 'com juros, multa e desconto'],
    ['Extrato de cada conta', 'com a identificação da conciliação linha a linha'],
    ['Transferências entre contas e ajustes de saldo', 'não entram na DRE — explicam o extrato'],
    ['Devoluções com NF-e própria', 'abatem o faturamento'],
    ['XMLs de saída', 'NF-e de venda e devolução (app e Conta Azul)'],
    ['XMLs de entrada', 'NF-e de produto e NFS-e de serviço dos fornecedores'],
];

function mesAnterior() {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
}

export default function AbaPacote() {
    const [mes, setMes] = useState(mesAnterior());
    const [gerando, setGerando] = useState(false);
    const [erro, setErro] = useState('');

    const gerar = async () => {
        setGerando(true); setErro('');
        try {
            await baixarArquivoApi('/contabilidade/pacote-mes', { mes }, `contabilidade-${mes}.zip`);
        } catch (e) {
            setErro(e.response?.data?.error || 'Não deu para gerar o pacote — tente de novo.');
        } finally { setGerando(false); }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="px-5 py-3.5 border-b border-gray-100">
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">O que vai no pacote</span>
                </div>
                <div className="p-5">
                    <ul className="divide-y divide-gray-100">
                        {ITENS.map(([titulo, desc]) => (
                            <li key={titulo} className="py-2.5 flex gap-3 items-start">
                                <span className="w-5 h-5 rounded-md bg-mint text-primaryDark flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">✓</span>
                                <span>
                                    <span className="block text-sm font-semibold text-gray-900">{titulo}</span>
                                    <span className="text-xs text-gray-500">{desc}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm h-fit">
                <div className="px-5 py-3.5 border-b border-gray-100">
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Gerar o pacote</span>
                </div>
                <div className="p-5 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Mês</label>
                        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)}
                            className="w-full md:w-56 border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                    </div>
                    <button onClick={gerar} disabled={gerando || !mes}
                        className="px-5 py-2.5 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-50 min-h-[44px]">
                        {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />}
                        {gerando ? 'Gerando (pode levar um minuto)…' : `Gerar pacote de ${mes}`}
                    </button>
                    {erro && <div className="bg-red-100 text-red-700 rounded-xl p-3 text-sm font-medium">{erro}</div>}
                    <p className="text-xs text-gray-500">
                        Baixa um arquivo ZIP com as planilhas (CSV, abre no Excel) e os XMLs do mês —
                        pronto para anexar no e-mail da contabilidade. O conteúdo respeita as mesmas
                        regras dos relatórios (estornos fora, bonificações fora).
                    </p>
                </div>
            </div>
        </div>
    );
}
