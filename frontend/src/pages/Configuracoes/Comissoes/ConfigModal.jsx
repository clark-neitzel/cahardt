import React, { useState } from 'react';
import { X } from 'lucide-react';

const ConfigModal = ({ dados, onClose, onSalvar }) => {
    const [form, setForm] = useState({
        vendedorId: dados.vendedorId,
        percAbaixoMeta: dados.percAbaixoMeta ?? 0,
        percNaMeta: dados.percNaMeta ?? 0,
        percAcimaMeta: dados.percAcimaMeta ?? 0,
        bonusCidades: dados.bonusCidades ?? 0,
        bonusProdutos: dados.bonusProdutos ?? 0,
        bonusFlex: dados.bonusFlex ?? 0,
        limiteFlexPerc: dados.limiteFlexPerc ?? 100,
    });

    const set = (field) => (e) => setForm(f => ({ ...f, [field]: parseFloat(e.target.value) || 0 }));

    const handleSalvar = (e) => {
        e.preventDefault();
        onSalvar(form);
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between px-5 py-4 border-b">
                    <div>
                        <p className="text-xs text-gray-500">Comissão</p>
                        <h2 className="font-bold text-gray-900">{dados.nome}</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSalvar} className="px-5 py-4 space-y-5">
                    {/* Faixas de comissão */}
                    <section>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Faixas de comissão</p>
                        <div className="space-y-3">
                            <Field
                                label="% abaixo da meta"
                                hint="Aplicado sobre o total vendido quando não bater a meta"
                                value={form.percAbaixoMeta}
                                onChange={set('percAbaixoMeta')}
                            />
                            <Field
                                label="% na meta"
                                hint="Aplicado sobre o valor da meta quando igual ou acima"
                                value={form.percNaMeta}
                                onChange={set('percNaMeta')}
                            />
                            <Field
                                label="% no excedente acima da meta"
                                hint="Aplicado só sobre o valor que ultrapassar a meta"
                                value={form.percAcimaMeta}
                                onChange={set('percAcimaMeta')}
                            />
                        </div>
                    </section>

                    {/* Bônus */}
                    <section>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Bônus</p>
                        <div className="space-y-3">
                            <Field
                                label="Bônus cidades (%)"
                                hint="Acréscimo sobre o total vendido se bater meta em TODAS as cidades"
                                value={form.bonusCidades}
                                onChange={set('bonusCidades')}
                            />
                            <Field
                                label="Bônus por produto (%)"
                                hint="Acréscimo por cada produto que atingiu a meta de quantidade"
                                value={form.bonusProdutos}
                                onChange={set('bonusProdutos')}
                            />
                            <div className="grid grid-cols-2 gap-3">
                                <Field
                                    label="Bônus flex (%)"
                                    hint="Acréscimo se não ultrapassar o limite de flex"
                                    value={form.bonusFlex}
                                    onChange={set('bonusFlex')}
                                />
                                <Field
                                    label="Limite flex (%)"
                                    hint="% máximo de uso do flex para ganhar o bônus"
                                    value={form.limiteFlexPerc}
                                    onChange={set('limiteFlexPerc')}
                                />
                            </div>
                        </div>
                    </section>

                    <div className="flex gap-2 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 text-sm border rounded-xl text-gray-600 hover:bg-gray-50 transition"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="flex-1 py-2.5 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium transition"
                        >
                            Salvar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const Field = ({ label, hint, value, onChange }) => (
    <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        {hint && <p className="text-xs text-gray-400 mb-1">{hint}</p>}
        <div className="flex items-center border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
            <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={value}
                onChange={onChange}
                className="flex-1 px-3 py-2 text-sm outline-none"
            />
            <span className="px-3 py-2 bg-gray-50 border-l text-sm text-gray-500">%</span>
        </div>
    </div>
);

export default ConfigModal;
