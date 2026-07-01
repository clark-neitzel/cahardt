import React, { useEffect, useState } from 'react';
import { Loader2, Gift, Check, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { kitFestaService } from '../../services/kitFestaService';

const money = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
const dataBR = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

export default function AbaIndicacoes() {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    kitFestaService.indicacoes()
      .then(setDados).catch(() => toast.error('Erro ao carregar indicações')).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-12 text-center text-gray-400"><Loader2 className="h-6 w-6 animate-spin inline" /></div>;
  const r = dados?.resumo || {};
  const creditos = dados?.creditos || [];

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Gift className="h-5 w-5 text-emerald-600" />
        <div>
          <h3 className="font-semibold text-gray-800">Indicações</h3>
          <p className="text-xs text-gray-500">Cada indicação vira 1 crédito para o indicador quando o pedido do indicado é <b>quitado</b>. O indicador usa 1 crédito por pedido.</p>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card b={r.total || 0} s="créditos gerados" />
        <Card b={r.disponiveis || 0} s="disponíveis" green />
        <Card b={money(r.valorDisponivel)} s="valor a usar" yellow />
        <Card b={money(r.valorUsado)} s="valor já usado" />
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {creditos.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">Nenhuma indicação gerou crédito ainda. O crédito nasce quando o pedido do indicado é marcado como pago.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Indicador (ganha)</th>
                  <th className="text-left px-4 py-2.5 font-medium">Código</th>
                  <th className="text-left px-4 py-2.5 font-medium">Indicado</th>
                  <th className="text-right px-4 py-2.5 font-medium">Crédito</th>
                  <th className="text-center px-4 py-2.5 font-medium">Situação</th>
                  <th className="text-left px-4 py-2.5 font-medium">Gerado em</th>
                </tr>
              </thead>
              <tbody>
                {creditos.map(c => (
                  <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-800">{c.dono?.nome || '—'}</div>
                      <div className="text-xs text-gray-400">{c.dono?.cpf || ''}</div>
                    </td>
                    <td className="px-4 py-2.5"><span className="font-mono text-xs text-emerald-700">{c.dono?.codigoIndicacao || '—'}</span></td>
                    <td className="px-4 py-2.5">
                      <div className="text-gray-700">{c.indicado?.nome || '—'}</div>
                      <div className="text-xs text-gray-400">{c.indicado?.cpf || ''}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-emerald-700">{money(c.valor)}</td>
                    <td className="px-4 py-2.5 text-center">
                      {c.status === 'DISPONIVEL'
                        ? <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700"><Check className="h-3 w-3" /> Disponível</span>
                        : <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500"><Clock className="h-3 w-3" /> Usado</span>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{dataBR(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ b, s, green, yellow }) {
  const cls = yellow ? 'bg-amber-50 border-amber-200' : green ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200';
  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <div className="text-xl font-bold text-gray-800">{b}</div>
      <div className="text-xs text-gray-500 uppercase tracking-wide">{s}</div>
    </div>
  );
}
