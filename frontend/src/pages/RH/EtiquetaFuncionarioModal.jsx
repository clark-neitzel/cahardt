import { useEffect, useMemo, useState } from 'react';
import { X, AlertTriangle, Minus, Plus } from 'lucide-react';
import ImprimirDireto from '../PCP/ImprimirDireto';
import { useEscalaPreview } from '../PCP/OrientacaoEtiqueta';
import { imprimirNaPagina } from '../../utils/imprimirNaPagina';
import CampoNumero from '../../components/CampoNumero';
import { useFiltroSalvo } from '../../hooks/useFiltrosSalvos';
import { montarPasta, montarArmario, montarArmarioGrande, montarAba, prepararPasta, prepararArmario, prepararArmarioGrande, prepararAba, carregarFontesFuncionario } from './etiquetasFuncionario';

// Modal das etiquetas do funcionário. tipo: 'pasta' (100×120, desligamento) | 'armario' (40×25, só o nome)
// | 'aba' (40×25 dobrável, pasta suspensa). `f` = dados do funcionário (com o que está na tela da aba Dados).
const CFG = {
    pasta:   { titulo: 'Etiqueta da pasta · 100 × 120 mm', grande: true,  origem: 'FUNCIONARIO_PASTA',   rotulo: 'Pasta de funcionário' },
    armario: { titulo: 'Etiqueta do armário · 40 × 25 mm', grande: false, origem: 'FUNCIONARIO_ARQUIVO', rotulo: 'Armário' },
    aba:     { titulo: 'Etiqueta da aba (pasta suspensa) · 40 × 25 mm', grande: false, origem: 'FUNCIONARIO_ARQUIVO', rotulo: 'Aba da pasta' },
};
const BTN_MAIS_MENOS = 'min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full border border-gray-300 hover:bg-gray-50';

export default function EtiquetaFuncionarioModal({ tipo, f, onClose }) {
    // armário: 2 tamanhos (a última escolha fica salva por usuário)
    const [tamArmario, setTamArmario] = useFiltroSalvo('etiqueta-funcionario:armarioTamanho', '40x25');
    const armGrande = tipo === 'armario' && tamArmario === '100x120';
    const cfg = armGrande
        ? { titulo: 'Etiqueta do armário · 100 × 120 mm', grande: true, origem: 'FUNCIONARIO_PASTA', rotulo: 'Armário' }
        : (CFG[tipo] || CFG.pasta);
    const [copias, setCopias] = useState(1);
    const [fontesOk, setFontesOk] = useState(false);
    useEffect(() => { let vivo = true; carregarFontesFuncionario().then(() => vivo && setFontesOk(true)); return () => { vivo = false; }; }, []);

    const { nome: fNome, cpf: fCpf, cargo: fCargo, dataAdmissao: fAdm, dataDemissao: fDem, motivoDesligamento: fMot, avisoPrevio: fAv } = f || {};
    const qtd = Math.max(1, Math.min(99, parseInt(copias, 10) || 1));
    // aba: a prévia mostra UMA etiqueta (a 2ª coluna do rolo fica em branco quando a quantidade é ímpar)
    const montada = useMemo(() => {
        const d = { nome: fNome, cpf: fCpf, cargo: fCargo, dataAdmissao: fAdm, dataDemissao: fDem, motivoDesligamento: fMot, avisoPrevio: fAv };
        return tipo === 'armario' ? (armGrande ? montarArmarioGrande(d) : montarArmario(d, 1, 1)) : tipo === 'aba' ? montarAba(d, 1, 1) : montarPasta(d);
    }, [tipo, armGrande, fNome, fCpf, fCargo, fAdm, fDem, fMot, fAv, fontesOk]); // eslint-disable-line react-hooks/exhaustive-deps
    const larg = cfg.grande ? 100 : 40;
    const [refPrev, escala] = useEscalaPreview(larg, cfg.grande ? 1.25 : 3.2);

    // preview: o CSS da etiqueta é escopado no id do preview (nunca vaza para o app)
    const idPrev = 'prev-etq-func';
    const cssPrev = useMemo(() => montada.estilos
        .replace(/@page\s*{[^}]*}/g, '')
        .replace(/html\.modo-impressao[^{]*{[^}]*}/g, '')
        .replaceAll('#area-impressao', `#${idPrev}`), [montada]);

    // aviso de dados faltando só vale para a etiqueta da pasta (desligamento)
    const faltas = tipo === 'pasta' ? montada.dados.faltas : [];
    const nome = montada.dados.nome || 'FUNCIONÁRIO';

    const imprimirNavegador = () => {
        if (cfg.grande) {
            // a Zebra grande é configurada em paisagem: página 120×100 e a etiqueta (100×120) girada 90°
            const estilos = `
                @page { size: 120mm 100mm; margin: 0; }
                html.modo-impressao #area-impressao { width: 120mm !important; max-width: none !important; margin: 0 !important; }
                ${montada.estilos}
                #area-impressao .pg { width: 119.7mm; height: 99.7mm; display: flex; align-items: center; justify-content: center; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
                #area-impressao .pg + .pg { break-before: page; page-break-before: always; }
                #area-impressao .pg > .etq { transform: rotate(90deg); flex: 0 0 auto; }
            `;
            imprimirNaPagina(estilos, Array.from({ length: qtd }, () => `<div class="pg">${montada.corpo}</div>`).join(''));
        } else {
            const m = tipo === 'armario' ? montarArmario({ nome: fNome }, qtd, 2) : montarAba({ nome: fNome }, qtd, 2);
            imprimirNaPagina(m.estilos, m.corpo);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
            <div className="bg-white w-full md:max-w-xl rounded-t-2xl md:rounded-2xl max-h-[92vh] overflow-y-auto overflow-x-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
                    <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-600">{cfg.titulo}</p>
                        <p className="text-sm text-gray-600 truncate">{nome}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Fechar" className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
                </div>

                <div className="p-4 space-y-4">
                    {faltas.length > 0 && (
                        <div data-aviso-faltas className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                            <span>Preencha {faltas.join(' e ')} na aba Dados (e salve). Você ainda pode imprimir o que já tem.</span>
                        </div>
                    )}
                    {montada.cortou && (
                        <div data-aviso-cortou className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                            <span>O nome é muito longo e será cortado na etiqueta.</span>
                        </div>
                    )}

                    {tipo === 'armario' && (
                        <div className="flex flex-wrap gap-1.5" data-seletor-tamanho>
                            {[['40x25', 'Pequena · 40 × 25'], ['100x120', 'Grande · 100 × 120']].map(([v, r]) => (
                                <button key={v} type="button" onClick={() => setTamArmario(v)}
                                    className={`px-4 py-2 min-h-[44px] rounded-full text-xs font-semibold border transition-all ${(armGrande ? '100x120' : '40x25') === v ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-primary hover:text-primary'}`}>{r}</button>
                            ))}
                        </div>
                    )}

                    <div ref={refPrev} className="bg-gray-100 rounded-xl p-2 md:p-4 flex justify-center overflow-hidden">
                        <div style={{ width: `${larg * (96 / 25.4) * escala}px`, height: `${(cfg.grande ? 120 : 25) * (96 / 25.4) * escala}px` }}>
                            <div style={{ transform: `scale(${escala})`, transformOrigin: 'top left', width: `${larg}mm` }}>
                                <style>{cssPrev}</style>
                                <div id={idPrev} className="bg-white shadow-sm" dangerouslySetInnerHTML={{ __html: montada.corpo }} />
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 text-center -mt-2">
                        {tipo === 'aba' ? 'Dobre na linha tracejada, cola com cola, e coloque na aba da pasta. O lado de baixo sai de cabeça para baixo de propósito.'
                            : tipo === 'armario' ? (armGrande ? 'Prévia do tamanho da etiqueta (100 × 120 mm): só o nome.' : 'Prévia da etiqueta (40 × 25 mm): só o nome. O padrão é 1 cópia; a segunda coluna do rolo fica em branco.')
                            : 'Prévia do tamanho da etiqueta (100 × 120 mm).'}
                    </p>

                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">Cópias</span>
                        <button type="button" aria-label="Menos" onClick={() => setCopias((c) => Math.max(1, (parseInt(c, 10) || 1) - 1))} className={BTN_MAIS_MENOS}><Minus className="h-4 w-4" /></button>
                        <CampoNumero min="1" max="99" value={copias}
                            onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 1) setCopias(Math.min(99, v)); else if (e.target.value === '') setCopias(''); }}
                            onBlur={(e) => { if (!e.target.value || parseInt(e.target.value, 10) < 1) setCopias(1); }}
                            className="w-16 min-h-[44px] text-center font-semibold text-gray-800 border border-gray-300 rounded-lg" />
                        <button type="button" aria-label="Mais" onClick={() => setCopias((c) => Math.min(99, (parseInt(c, 10) || 1) + 1))} className={BTN_MAIS_MENOS}><Plus className="h-4 w-4" /></button>
                    </div>

                    <ImprimirDireto
                        key={cfg.origem}
                        origem={cfg.origem}
                        copias={qtd}
                        nome={`${cfg.rotulo} — ${nome}`}
                        total={cfg.grande ? 0 : qtd}
                        referencia={{ tipo: 'FUNCIONARIO', id: String(f?.id ?? ''), rotulo: `${cfg.rotulo} — ${nome}` }}
                        onNavegador={imprimirNavegador}
                        preparar={() => {
                            const d = { nome: fNome, cpf: fCpf, cargo: fCargo, dataAdmissao: fAdm, dataDemissao: fDem, motivoDesligamento: fMot, avisoPrevio: fAv };
                            return tipo === 'armario' ? (armGrande ? prepararArmarioGrande(d) : prepararArmario(d, qtd)) : tipo === 'aba' ? prepararAba(d, qtd) : prepararPasta(d);
                        }}
                    />
                    <p className="text-xs text-gray-500">
                        {cfg.grande ? 'Pelo navegador: papel 120 × 100 mm (paisagem), margem 0, escala 100%.'
                            : 'Pelo navegador: papel 84 × 25 mm, margem 0, escala 100%.'}
                    </p>
                </div>
            </div>
        </div>
    );
}
