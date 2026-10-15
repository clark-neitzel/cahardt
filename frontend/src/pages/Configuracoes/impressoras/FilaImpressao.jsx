import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ListOrdered, RotateCcw, XCircle } from 'lucide-react';
import SelectBusca from '../../../components/SelectBusca';
import impressaoService from '../../../services/impressaoService';
import { Card, BadgeTrabalho, btnSec, btnPerigo, erroDe, formatarDataHora } from './comuns';

const TIPOS = { TESTE: 'Teste', ETIQUETA_COZINHA: 'Etiqueta da cozinha', OUTRO: 'Outro' };

const FilaImpressao = ({ fila, impressoras, onRecarregar, filtros, setFiltros }) => {
    const nomeImp = (t) => t.impressora?.nome || impressoras.find(i => i.id === t.impressoraId)?.nome || '—';
    // Trava de duplo clique: ref (síncrona) + estado (para desabilitar o botão na tela).
    const emCurso = useRef(new Set());
    const [ocupado, setOcupado] = useState(() => new Set());
    const rodar = async (chave, fn) => {
        if (emCurso.current.has(chave)) return;
        emCurso.current.add(chave); setOcupado(new Set(emCurso.current));
        try { await fn(); }
        finally { emCurso.current.delete(chave); setOcupado(new Set(emCurso.current)); }
    };
    const novoId = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const reenviar = (t) => {
        if (t.status === 'IMPRESSO' && !window.confirm('Esse trabalho já saiu. Imprimir de novo?')) return;
        const requisicaoId = novoId();
        return rodar('r' + t.id, async () => {
            try { await impressaoService.reenviar(t.id, requisicaoId); toast.success('Reenviado: um novo pedido entrou na fila.'); onRecarregar(); }
            catch (e) { toast.error(erroDe(e, 'Não foi possível reenviar.')); }
        });
    };
    const cancelar = (t) => rodar('c' + t.id, async () => {
        try { await impressaoService.cancelar(t.id); toast.success('Pedido cancelado.'); onRecarregar(); }
        catch (e) { toast.error(erroDe(e, 'Não foi possível cancelar (talvez já tenha sido enviado).')); onRecarregar(); }
    });
    const acoes = (t) => (
        <div className="flex flex-wrap gap-2">
            {['ERRO', 'EXPIRADO', 'CANCELADO', 'IMPRESSO'].includes(t.status) && <button type="button" className={btnSec} disabled={ocupado.has('r' + t.id)} onClick={() => reenviar(t)}><RotateCcw className="h-4 w-4" />Reenviar</button>}
            {t.status === 'PENDENTE' && <button type="button" className={btnPerigo} disabled={ocupado.has('c' + t.id)} onClick={() => cancelar(t)}><XCircle className="h-4 w-4" />Cancelar</button>}
        </div>
    );
    return (
        <Card icone={ListOrdered} titulo="Fila de impressão"
            acoes={
                <SelectBusca value={filtros.status} onChange={e => setFiltros(p => ({ ...p, status: e.target.value }))} className="w-full md:w-48">
                    <option value="TODOS">Todos os status</option>
                    <option value="PENDENTE">Aguardando</option>
                    <option value="ENVIANDO">Enviando</option>
                    <option value="IMPRESSO">Impresso</option>
                    <option value="ERRO">Erro</option>
                    <option value="EXPIRADO">Expirado</option>
                    <option value="CANCELADO">Cancelado</option>
                </SelectBusca>
            }>
            {fila.length === 0 ? <p className="text-sm text-gray-600">Nada na fila com esse filtro.</p> : (
                <>
                    <div className="md:hidden space-y-3">
                        {fila.map(t => (
                            <div key={t.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="font-semibold text-gray-900 truncate">{TIPOS[t.tipo] || t.tipo}</span>
                                    <BadgeTrabalho status={t.status} />
                                </div>
                                <p className="text-sm text-gray-600 truncate">{nomeImp(t)} · {t.copias || 1} etiqueta(s)</p>
                                <p className="text-xs text-gray-500">{formatarDataHora(t.pedidoEm)}{t.solicitadoPorNome ? ` · ${t.solicitadoPorNome}` : ''}</p>
                                {t.erro && <p className="text-xs text-red-700 mt-1 break-words">{t.erro}</p>}
                                <div className="mt-2">{acoes(t)}</div>
                            </div>
                        ))}
                    </div>
                    <div className="hidden md:block overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50"><tr>
                                {['Quando', 'Tipo', 'Impressora', 'Etiquetas', 'Quem pediu', 'Status', ''].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>)}
                            </tr></thead>
                            <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                {fila.map(t => (
                                    <tr key={t.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-gray-700">{formatarDataHora(t.pedidoEm)}</td>
                                        <td className="px-4 py-3 text-gray-900">{TIPOS[t.tipo] || t.tipo}</td>
                                        <td className="px-4 py-3 text-gray-700">{nomeImp(t)}</td>
                                        <td className="px-4 py-3 text-gray-700">{t.copias || 1}</td>
                                        <td className="px-4 py-3 text-gray-700">{t.solicitadoPorNome || '—'}</td>
                                        <td className="px-4 py-3"><BadgeTrabalho status={t.status} />{t.erro && <div className="text-xs text-red-700 max-w-xs break-words mt-1">{t.erro}</div>}</td>
                                        <td className="px-4 py-3">{acoes(t)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </Card>
    );
};

export default FilaImpressao;
