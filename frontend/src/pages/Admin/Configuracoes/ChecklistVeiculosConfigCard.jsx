import React, { useEffect, useState } from 'react';
import { ClipboardCheck, Loader2, AlertTriangle, Plus, Trash2, Send, Power } from 'lucide-react';
import toast from 'react-hot-toast';
import checklistEscritorioService from '../../../services/checklistEscritorioService';
import MultiSelect from '../../../components/MultiSelect';

/**
 * Configurações > card "Checklist de veículos" (só admin; o back também exige admin).
 * - Chave de emergência (modo TESTE / DESLIGADO): vale na hora, sem publicar.
 * - Quem recebe o aviso na hora e quem recebe os resumos (WhatsApp, pelo bot da Ana).
 * - Horários dos resumos + "Enviar mensagem de teste para mim".
 */
const ChecklistVeiculosConfigCard = () => {
    const [avisos, setAvisos] = useState(null);   // { naHora, resumo, horas, candidatos }
    const [modo, setModo] = useState(null);       // 'TESTE' | 'DESLIGADO' | 'TRAVA'
    const [erro, setErro] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [testando, setTestando] = useState(false);
    const [trocandoModo, setTrocandoModo] = useState(false);

    const carregar = async () => {
        try {
            setErro(false);
            const [a, m] = await Promise.all([
                checklistEscritorioService.avisosConfig(),
                checklistEscritorioService.modo().catch(() => null),
            ]);
            setAvisos({
                naHora: a?.naHora || [], resumo: a?.resumo || [],
                horas: a?.horas || [], candidatos: a?.candidatos || [],
            });
            setModo(m?.modo || null);
        } catch {
            setErro(true);
        }
    };
    useEffect(() => { carregar(); }, []);

    const opcoes = (avisos?.candidatos || []).map(c => ({
        value: c.id,
        label: c.temTelefone ? c.nome : `${c.nome} (sem telefone)`,
    }));
    const semTelefone = (avisos?.candidatos || []).filter(c => !c.temTelefone);

    const salvar = async () => {
        const horas = (avisos.horas || []).filter(Boolean);
        if (horas.some(h => !/^([01]\d|2[0-3]):[0-5]\d$/.test(h))) {
            toast.error('Confira os horários: use o formato HH:MM.');
            return;
        }
        setSalvando(true);
        try {
            const r = await checklistEscritorioService.salvarAvisos({ naHora: avisos.naHora, resumo: avisos.resumo, horas });
            setAvisos(prev => ({ ...prev, naHora: r?.naHora || [], resumo: r?.resumo || [], horas: r?.horas || [] }));
            toast.success('Avisos do checklist salvos.');
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao salvar.');
        } finally {
            setSalvando(false);
        }
    };

    const testar = async () => {
        setTestando(true);
        try {
            await checklistEscritorioService.testarAviso();
            toast.success('Mensagem de teste enviada para o seu WhatsApp.');
        } catch (e) {
            toast.error(e.response?.data?.error || 'Não foi possível enviar o teste.');
        } finally {
            setTestando(false);
        }
    };

    const trocarModo = async (novo) => {
        if (novo === modo) return;
        if (novo === 'DESLIGADO' && !window.confirm(
            'Desligar o checklist por foto? Os motoristas voltam às 6 caixinhas na hora, sem precisar publicar nada.')) return;
        setTrocandoModo(true);
        try {
            const r = await checklistEscritorioService.salvarModo(novo);
            setModo(r?.modo || novo);
            toast.success(novo === 'TESTE' ? 'Checklist por foto ligado (modo teste).' : 'Checklist por foto desligado.');
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao trocar o modo.');
        } finally {
            setTrocandoModo(false);
        }
    };

    const setHora = (i, v) => setAvisos(p => ({ ...p, horas: p.horas.map((h, k) => (k === i ? v : h)) }));
    const addHora = () => setAvisos(p => ({ ...p, horas: [...p.horas, '12:00'] }));
    const delHora = (i) => setAvisos(p => ({ ...p, horas: p.horas.filter((_, k) => k !== i) }));

    if (erro) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-sm text-gray-600">
                Não consegui carregar a configuração do checklist de veículos.
                <button type="button" onClick={carregar} className="ml-3 min-h-[44px] px-4 border border-primary text-primary rounded-full font-medium">Tentar de novo</button>
            </div>
        );
    }
    if (!avisos) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
        );
    }

    const ninguem = avisos.naHora.length === 0 && avisos.resumo.length === 0;
    const botaoModo = (valor, rotulo) => (
        <button type="button" disabled={trocandoModo} onClick={() => trocarModo(valor)}
            className={`min-h-[44px] px-4 rounded-full text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1.5 ${
                modo === valor ? 'bg-primary text-white shadow-sm' : 'bg-white border border-primary text-primary hover:bg-mint/40'}`}>
            <Power className="h-4 w-4" /> {rotulo}
        </button>
    );

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 md:p-6 border-b border-gray-100 bg-mint/40">
                <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
                    <ClipboardCheck className="h-5 w-5 text-primary" />
                    Checklist de veículos
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                    O motorista tira as fotos do veículo antes de sair. Aqui você escolhe quem é avisado no WhatsApp
                    e liga ou desliga o recurso.
                </p>
            </div>

            <div className="p-4 md:p-6 space-y-6">
                {/* Chave de emergência */}
                <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Chave de emergência</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                        {botaoModo('TESTE', 'Modo teste (fotos + IA)')}
                        {botaoModo('DESLIGADO', 'Desligar (volta às 6 caixinhas)')}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                        Vale na hora, sem publicar.{' '}
                        {modo ? <>Agora: <b>{modo === 'TESTE' ? 'modo teste' : modo === 'DESLIGADO' ? 'desligado' : modo.toLowerCase()}</b>.</> : null}
                    </p>
                </div>

                {ninguem && (
                    <div className="flex gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <div><b>Ninguém recebe aviso ainda.</b> Escolha abaixo quem deve ser avisado.</div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Quem recebe o aviso na hora</label>
                        <MultiSelect options={opcoes} selected={avisos.naHora} valueKey="value" labelKey="label" searchable
                            placeholder="Escolha as pessoas..."
                            onChange={v => setAvisos(p => ({ ...p, naHora: v }))} />
                        <p className="text-xs text-gray-500 mt-1">Chega quando um motorista segue com checklist reprovado ou responde que há problema.</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Quem recebe os resumos</label>
                        <MultiSelect options={opcoes} selected={avisos.resumo} valueKey="value" labelKey="label" searchable
                            placeholder="Escolha as pessoas..."
                            onChange={v => setAvisos(p => ({ ...p, resumo: v }))} />
                        <p className="text-xs text-gray-500 mt-1">Resumo do dia: quem fez checklist, quem seguiu com problema e quem está sem.</p>
                    </div>
                </div>
                {semTelefone.length > 0 && (
                    <p className="text-xs text-gray-500">
                        Sem telefone no cadastro (não recebem): {semTelefone.map(c => c.nome).join(', ')}.
                    </p>
                )}

                {/* Horários */}
                <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Horários dos resumos</p>
                    <div className="space-y-2">
                        {avisos.horas.map((h, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <input type="time" value={h} onChange={e => setHora(i, e.target.value)}
                                    className="border border-gray-300 rounded px-3 py-2 text-sm min-h-[44px] w-36 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                                <button type="button" onClick={() => delHora(i)} aria-label="Remover horário"
                                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-red-600 rounded-full hover:bg-red-50">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                        {avisos.horas.length === 0 && <p className="text-sm text-gray-500">Nenhum horário: os resumos não saem.</p>}
                    </div>
                    {avisos.horas.length < 4 && (
                        <button type="button" onClick={addHora}
                            className="mt-2 min-h-[44px] px-4 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-sm font-medium inline-flex items-center gap-1.5">
                            <Plus className="h-4 w-4" /> Adicionar hora
                        </button>
                    )}
                    <p className="text-xs text-gray-500 mt-2">Se um horário de hoje já passou ao salvar, o resumo sai na próxima rodada do sistema.</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-gray-100">
                    <button type="button" onClick={salvar} disabled={salvando}
                        className="min-h-[44px] px-5 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2">
                        {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
                    </button>
                    <button type="button" onClick={testar} disabled={testando}
                        className="min-h-[44px] px-5 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2">
                        {testando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar mensagem de teste para mim
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChecklistVeiculosConfigCard;
