import React, { useState } from 'react';
import { MapPin, X, Building } from 'lucide-react';
import CampoCidade from './CampoCidade';
import ModalNovaCidade from './ModalNovaCidade';

// Modal da consulta de CNPJ: a Receita trouxe uma cidade que NÃO está no cadastro oficial.
// "A Receita informou X / UF. Cadastrar esta cidade ou escolher outra?"
//
//   <ModalCidadeReceita pendente={{ nome, uf, sugestoes }}   // null = fechado
//       onEscolher={(nome) => ...}                            // grava no form
//       onCancelar={() => ...} />                             // campo fica vazio e marcado
//
// Enquanto não resolver, a tela deixa End_Cidade vazio e marcado como inválido; os demais
// campos da Receita entram normalmente (o resto do preenchimento não trava).

const ModalCidadeReceita = ({ pendente, onEscolher, onCancelar }) => {
    const [outra, setOutra] = useState('');
    const [modoOutra, setModoOutra] = useState(false);
    const [cadastrar, setCadastrar] = useState(false);

    if (!pendente) return null;
    const { nome, uf, sugestoes = [] } = pendente;

    const escolher = (n) => { onEscolher?.(n); setOutra(''); setModoOutra(false); setCadastrar(false); };
    const cancelar = () => { onCancelar?.(); setOutra(''); setModoOutra(false); setCadastrar(false); };

    return (
        <>
            <div className="fixed inset-0 z-[9999] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4">
                <div className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-xl max-h-[95vh] flex flex-col">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="bg-mint p-1.5 rounded-lg"><Building className="h-4 w-4 text-primary" /></div>
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-900">Cidade não cadastrada</p>
                                <p className="text-[11px] text-gray-500">Consulta de CNPJ na Receita</p>
                            </div>
                        </div>
                        <button type="button" onClick={cancelar} className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100"><X className="h-5 w-5" /></button>
                    </div>

                    <div className="p-4 space-y-3 overflow-y-auto">
                        <p className="text-sm text-gray-700">
                            A Receita informou <b className="text-gray-900">{nome}{uf ? ` / ${uf}` : ''}</b>, que ainda não está no cadastro de cidades do app.
                            Cadastrar esta cidade ou escolher outra?
                        </p>

                        {sugestoes.length > 0 && !modoOutra && (
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                                <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Parecidas no cadastro</p>
                                <div className="space-y-1.5">
                                    {sugestoes.map(s => (
                                        <button key={s.id || s.nome} type="button" onClick={() => escolher(s.nome)}
                                            className="w-full flex items-center justify-between gap-2 bg-white border border-gray-200 hover:border-primary rounded-lg px-3 py-2 min-h-[44px] text-left">
                                            <span className="text-sm text-gray-900 truncate"><b>{s.nome}</b>{s.uf ? <span className="text-gray-500"> · {s.uf}</span> : null}</span>
                                            <span className="text-xs text-primary font-medium shrink-0">Usar esta</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {modoOutra && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Escolher da lista</label>
                                <CampoCidade value={outra} onChange={setOutra} ufSugerida={uf || 'SC'} />
                            </div>
                        )}
                    </div>

                    <div className="px-4 py-3 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                        <button type="button" onClick={cancelar} className="px-4 py-2 min-h-[44px] md:min-h-0 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-full">Deixar em branco</button>
                        {!modoOutra ? (
                            <>
                                <button type="button" onClick={() => setModoOutra(true)}
                                    className="px-4 py-2 min-h-[44px] md:min-h-0 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm">Escolher outra</button>
                                <button type="button" onClick={() => setCadastrar(true)}
                                    className="px-4 py-2 min-h-[44px] md:min-h-0 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm inline-flex items-center justify-center gap-1.5">
                                    <MapPin className="h-4 w-4" /> Cadastrar "{nome}"
                                </button>
                            </>
                        ) : (
                            <button type="button" disabled={!outra} onClick={() => escolher(outra)}
                                className="px-4 py-2 min-h-[44px] md:min-h-0 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50">Usar esta cidade</button>
                        )}
                    </div>
                </div>
            </div>

            <ModalNovaCidade
                aberto={cadastrar}
                nomeInicial={nome}
                ufInicial={uf || 'SC'}
                onCriada={(c) => escolher(c.nome)}
                onFechar={() => setCadastrar(false)}
            />
        </>
    );
};

export default ModalCidadeReceita;
