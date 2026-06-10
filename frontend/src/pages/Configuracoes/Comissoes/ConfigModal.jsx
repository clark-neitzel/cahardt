import React, { useState } from 'react';
import { X } from 'lucide-react';

const ConfigModal = ({ dados, onClose, onSalvar }) => {
    const [form, setForm] = useState({
        vendedorId: dados.vendedorId,
        faixaAbaixo:    dados.faixaAbaixo    ?? 0,
        percAbaixoMeta: dados.percAbaixoMeta ?? 0,
        percNaMeta:     dados.percNaMeta     ?? 0,
        faixaAcima:     dados.faixaAcima     ?? 0,
        percAcimaMeta:  dados.percAcimaMeta  ?? 0,
        bonusCidades:   dados.bonusCidades   ?? 0,
        bonusProdutos:  dados.bonusProdutos  ?? 0,
        bonusFlex:      dados.bonusFlex      ?? 0,
        limiteFlexPerc: dados.limiteFlexPerc ?? 100,
    });

    const set = (field) => (e) => setForm(f => ({ ...f, [field]: parseFloat(e.target.value) || 0 }));

    const handleSalvar = (e) => {
        e.preventDefault();
        onSalvar(form);
    };

    // Descrições dinâmicas das faixas
    const descAbaixo = form.faixaAbaixo > 0
        ? `Se vender MENOS de ${(100 - form.faixaAbaixo).toFixed(0)}% da meta`
        : 'Se vender MENOS de 100% da meta';
    const descNaMeta = form.faixaAbaixo > 0
        ? `Se vender entre ${(100 - form.faixaAbaixo).toFixed(0)}% e ${form.faixaAcima > 0 ? (100 + form.faixaAcima).toFixed(0) + '%' : '100%'} da meta`
        : `Se vender entre 100% e ${form.faixaAcima > 0 ? (100 + form.faixaAcima).toFixed(0) + '%' : '100%'} da meta`;
    const descAcima = form.faixaAcima > 0
        ? `Excedente além de ${(100 + form.faixaAcima).toFixed(0)}% da meta`
        : 'Excedente além de 100% da meta';

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
                    <div>
                        <p className="text-xs text-gray-500">Comissão</p>
                        <h2 className="font-bold text-gray-900">{dados.nome}</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSalvar} className="px-5 py-4 space-y-4">

                    {/* ── FAIXAS DE COMISSÃO ── */}
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Faixas de comissão</p>

                    {/* FAIXA ABAIXO */}
                    <Faixa
                        cor="red"
                        titulo="Abaixo da meta"
                        descricao={descAbaixo}
                        campos={[
                            {
                                label: 'Tolerância abaixo (%)',
                                hint: 'Pode vender até X% menos e ainda ficar na faixa "na meta". Ex: 10 = até 10% abaixo ainda é "na meta".',
                                value: form.faixaAbaixo,
                                onChange: set('faixaAbaixo'),
                            },
                            {
                                label: 'Comissão (%)',
                                hint: 'Taxa paga sobre o total vendido quando ficar abaixo do limite acima.',
                                value: form.percAbaixoMeta,
                                onChange: set('percAbaixoMeta'),
                            },
                        ]}
                    />

                    {/* FAIXA NA META */}
                    <Faixa
                        cor="yellow"
                        titulo="Na meta"
                        descricao={descNaMeta}
                        campos={[
                            {
                                label: 'Comissão (%)',
                                hint: 'Taxa paga sobre o total vendido quando estiver nesta faixa.',
                                value: form.percNaMeta,
                                onChange: set('percNaMeta'),
                                fullWidth: true,
                            },
                        ]}
                    />

                    {/* FAIXA ACIMA */}
                    <Faixa
                        cor="green"
                        titulo="Acima da meta"
                        descricao={descAcima}
                        campos={[
                            {
                                label: 'Kicker acima (%)',
                                hint: 'A comissão extra só começa após X% acima da meta. Ex: 5 = bônus só no que passar de 105% da meta.',
                                value: form.faixaAcima,
                                onChange: set('faixaAcima'),
                            },
                            {
                                label: 'Comissão no excedente (%)',
                                hint: 'Taxa paga sobre o valor que ultrapassar o kicker acima.',
                                value: form.percAcimaMeta,
                                onChange: set('percAcimaMeta'),
                            },
                        ]}
                    />

                    {/* ── BÔNUS ── */}
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">Bônus</p>

                    <div className="space-y-3">
                        <FieldRow
                            label="Bônus cidades (%)"
                            hint="Bônus cheio se bater meta em TODAS as cidades. Se bater parcial, é rateado. Ex: 7/10 cidades = 70% do bônus."
                            value={form.bonusCidades}
                            onChange={set('bonusCidades')}
                        />
                        <FieldRow
                            label="Bônus produtos (%)"
                            hint="Bônus cheio se bater meta em TODOS os produtos. Se bater parcial, é rateado. Ex: 3/5 produtos = 60% do bônus."
                            value={form.bonusProdutos}
                            onChange={set('bonusProdutos')}
                        />

                        {/* Bônus Flex */}
                        <div className="rounded-lg border border-dashed border-gray-200 p-3 space-y-3 bg-gray-50">
                            <p className="text-xs text-gray-500">
                                Comissão sobre o <strong>saldo não usado</strong> do flex — se o uso ficar abaixo do limite.
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <FieldRow
                                    label="Limite de uso (%)"
                                    hint="Máximo % do flex que pode ser usado"
                                    value={form.limiteFlexPerc}
                                    onChange={set('limiteFlexPerc')}
                                />
                                <FieldRow
                                    label="% sobre o saldo"
                                    hint="Comissão sobre o flex não utilizado"
                                    value={form.bonusFlex}
                                    onChange={set('bonusFlex')}
                                />
                            </div>
                            {form.bonusFlex > 0 && (
                                <p className="text-[11px] text-blue-600">
                                    Ex: flex R$2.000, usou R$400 (20%) → saldo R$1.600 → comissão = {form.bonusFlex}% × R$1.600
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                        <button type="button" onClick={onClose}
                            className="flex-1 py-2.5 text-sm border rounded-xl text-gray-600 hover:bg-gray-50 transition">
                            Cancelar
                        </button>
                        <button type="submit"
                            className="flex-1 py-2.5 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium transition">
                            Salvar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Bloco colorido por faixa
const COR = {
    red:    { border: 'border-red-200',    bg: 'bg-red-50',    dot: 'bg-red-400',    text: 'text-red-700' },
    yellow: { border: 'border-yellow-200', bg: 'bg-yellow-50', dot: 'bg-yellow-400', text: 'text-yellow-700' },
    green:  { border: 'border-green-200',  bg: 'bg-green-50',  dot: 'bg-green-400',  text: 'text-green-700' },
};

const Faixa = ({ cor, titulo, descricao, campos }) => {
    const c = COR[cor];
    return (
        <div className={`rounded-xl border ${c.border} ${c.bg} p-3 space-y-3`}>
            <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                <span className={`text-sm font-semibold ${c.text}`}>{titulo}</span>
                <span className="text-xs text-gray-500 ml-1">{descricao}</span>
            </div>
            <div className={campos.length === 1 && !campos[0].fullWidth ? 'max-w-xs' : `grid grid-cols-${campos.length === 1 ? '1' : '2'} gap-3`}>
                {campos.map((f, i) => (
                    <FieldRow key={i} {...f} />
                ))}
            </div>
        </div>
    );
};

const FieldRow = ({ label, hint, value, onChange }) => (
    <div>
        <label className="block text-xs font-medium text-gray-700 mb-0.5">{label}</label>
        {hint && <p className="text-[10px] text-gray-400 mb-1 leading-tight">{hint}</p>}
        <div className="flex items-center border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 bg-white">
            <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={value}
                onChange={onChange}
                className="flex-1 px-3 py-2 text-sm outline-none"
            />
            <span className="px-2 py-2 bg-gray-50 border-l text-sm text-gray-400">%</span>
        </div>
    </div>
);

export default ConfigModal;
