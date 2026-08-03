// Impressão do cartão de ponto + folha do período (folha A4).
// Segue o modelo do recibo do Contas a Pagar (cabeçalho com logo, filete grosso,
// título e assinatura) e a regra de impressão do PWA: monta o conteúdo NA PRÓPRIA
// PÁGINA com @media print — nunca window.open nem iframe (no iPad sai em branco).

const EMPRESA = {
    nome: 'HARDT DOCES E SALGADOS LTDA',
    cnpj: '08.766.459/0001-02',
    ie: '255372744',
    endereco: 'R 15 DE OUTUBRO, 170, Joinville - SC',
    cep: '89239-700',
    cidadeUf: 'Joinville (SC)'
};

const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dmy = (s) => {
    if (!s) return '—';
    const iso = s instanceof Date ? s.toISOString() : String(s);
    return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('/') : String(s);
};
const fmtCpf = (c) => {
    const d = String(c || '').replace(/\D/g, '');
    return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (c || '—');
};

const DIA_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// Cor do selo de situação na folha impressa
const CLASSE_SITUACAO = {
    TRABALHADO: 'cp-ok',
    FALTA: 'cp-falta',
    ABONO: 'cp-abono',
    FERIADO: 'cp-feriado',
    FOLGA: 'cp-folga',
    COMPENSADO: 'cp-folga',
    FUTURO: 'cp-futuro',
    SEM_VINCULO: 'cp-futuro'
};

const linhaFolha = (rotulo, valor, extra = '', negrito = false) => `
    <tr class="${negrito ? 'cp-forte' : ''}">
        <td>${escapeHtml(rotulo)}${extra ? ` <span class="cp-obs">${escapeHtml(extra)}</span>` : ''}</td>
        <td class="cp-num">${valor}</td>
    </tr>`;

export const montarCartaoHtml = (cartao) => {
    const f = cartao.funcionario || {};
    const r = cartao.resumo || {};
    const fo = cartao.folha || {};
    const p = cartao.periodo || {};

    const linhas = (cartao.linhas || []).map((l) => {
        const d = new Date(`${l.data}T12:00:00`);
        const batidas = l.batidas.length
            ? l.batidas.map(b => `<span class="cp-bat ${b.tipo === 'SAIDA' ? 'cp-saida' : 'cp-entrada'}">${b.hora}</span>`).join('')
            : '<span class="cp-vazio">—</span>';
        return `
        <tr class="${l.situacao === 'FALTA' ? 'cp-linha-falta' : ''}">
            <td class="cp-dia">${DIA_CURTO[l.diaSemana]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}</td>
            <td class="cp-batidas">${batidas}</td>
            <td class="cp-num">${l.previsto}</td>
            <td class="cp-num">${l.trabalhado}</td>
            <td class="cp-num">${l.saldo}</td>
            <td><span class="cp-selo ${CLASSE_SITUACAO[l.situacao] || ''}">${escapeHtml(l.situacaoRotulo || '')}</span></td>
        </tr>`;
    }).join('');

    const proventos = [
        linhaFolha('Salário base', brl(fo.salarioBase), p.mesCheio ? '' : '(período não fecha o mês)'),
        fo.horaExtraPaga
            ? linhaFolha(`Horas extras (${fo.extraHoras})`, brl(fo.valorHoraExtra), `${fo.percentualHoraExtra}% · hora ${brl(fo.valorHora)}`)
            : linhaFolha(`Horas extras (${fo.extraHoras})`, '— banco de horas', 'não pagas em dinheiro'),
        fo.horaExtraPaga && fo.dsrSobreExtra > 0
            ? linhaFolha('DSR sobre horas extras', brl(fo.dsrSobreExtra), `${fo.diasRepouso} descanso ÷ ${fo.diasUteis} úteis`)
            : '',
        fo.outrosProventos > 0 ? linhaFolha('Outros proventos', brl(fo.outrosProventos)) : '',
        linhaFolha('Total de proventos', brl(fo.totalProventos), '', true)
    ].join('');

    const descontos = [
        linhaFolha(`Faltas (${fo.faltas} dia${fo.faltas === 1 ? '' : 's'})`, brl(fo.descontoFaltas), `dia ${brl(fo.valorDia)}`),
        linhaFolha(`DSR perdido (${fo.dsrPerdidos} dia${fo.dsrPerdidos === 1 ? '' : 's'})`, brl(fo.descontoDsr), fo.dsrPerdidos ? 'semana com falta' : ''),
        fo.outrosDescontos > 0 ? linhaFolha('Outros descontos', brl(fo.outrosDescontos), fo.obsAjuste || '') : '',
        linhaFolha('Total de descontos', brl(fo.totalDescontos), '', true)
    ].join('');

    return `
    <div class="cp">
        <div class="cp-rule"></div>
        <div class="cp-header">
            <img src="/logo-hardt.png" alt="Hardt" class="cp-logo" />
            <div class="cp-emp">
                <div>${escapeHtml(EMPRESA.nome)}</div>
                <div>CNPJ: ${EMPRESA.cnpj} &nbsp;IE: ${EMPRESA.ie}</div>
                <div>${escapeHtml(EMPRESA.endereco)}</div>
                <div>CEP: ${EMPRESA.cep}</div>
            </div>
        </div>
        <div class="cp-rule"></div>

        <div class="cp-titulo">
            <h1>Cartão de ponto</h1>
            <div class="cp-periodo">${dmy(p.de)} a ${dmy(p.ate)}</div>
        </div>
        <div class="cp-dash"></div>

        <div class="cp-func">
            <div><b>${escapeHtml(f.nome || '')}</b>${f.cargo ? ` · ${escapeHtml(f.cargo)}` : ''}</div>
            <div>CPF: ${escapeHtml(fmtCpf(f.cpf))} &nbsp;·&nbsp; Admissão: ${dmy(f.dataAdmissao)} &nbsp;·&nbsp; Hora extra: ${f.tipoHoraExtra === 'PAGA' ? `paga (+${f.percentualHoraExtra}%)` : 'banco de horas'}</div>
        </div>

        <div class="cp-kpis">
            <div><span>${r.trabalhado}</span><small>Horas trabalhadas</small></div>
            <div><span>${r.previsto}</span><small>Previsto</small></div>
            <div><span>${r.saldo}</span><small>Banco de horas</small></div>
            <div><span>${r.extra}</span><small>Hora extra</small></div>
            <div><span>${r.faltas}</span><small>Faltas</small></div>
        </div>

        <table class="cp-tab">
            <thead><tr>
                <th class="cp-esq">Dia</th><th class="cp-esq">Batidas</th>
                <th>Previsto</th><th>Trabalhado</th><th>Saldo</th><th class="cp-esq">Situação</th>
            </tr></thead>
            <tbody>${linhas}</tbody>
        </table>

        <div class="cp-folha">
            <div class="cp-bloco">
                <h2>Proventos</h2>
                <table class="cp-fin"><tbody>${proventos}</tbody></table>
            </div>
            <div class="cp-bloco">
                <h2>Descontos</h2>
                <table class="cp-fin"><tbody>${descontos}</tbody></table>
            </div>
        </div>

        <div class="cp-liquido">
            <span>Total a pagar no período</span>
            <b>${brl(fo.liquido)}</b>
        </div>
        <p class="cp-nota">
            Valor bruto do período: não inclui INSS, IRRF, FGTS, vale-transporte nem demais encargos —
            esses ficam a cargo da contabilidade.
        </p>

        <p class="cp-declaracao">
            Declaro que conferi as marcações de ponto acima e que elas correspondem aos horários
            efetivamente trabalhados no período, assim como os valores apurados.
        </p>
        <p class="cp-data">${EMPRESA.cidadeUf}, ${new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })}</p>
        <div class="cp-assinaturas">
            <div><div class="cp-linha"></div><div class="cp-nome">${escapeHtml(String(f.nome || '').toUpperCase())}</div><div class="cp-doc">Funcionário</div></div>
            <div><div class="cp-linha"></div><div class="cp-nome">${escapeHtml(EMPRESA.nome)}</div><div class="cp-doc">Empregador</div></div>
        </div>
    </div>`;
};

export const CARTAO_ESTILOS = `
    .cp { font-family: 'Manrope', -apple-system, sans-serif; color: rgba(0,0,0,0.87); max-width: 186mm; margin: 0 auto; }
    .cp-rule { border-top: 2.5pt solid #111; margin: 4mm 0; }
    .cp-header { display: flex; align-items: center; gap: 7mm; padding: 1mm 0; }
    .cp-logo { height: 17mm; width: auto; }
    .cp-emp { font-size: 8.5pt; color: #666; line-height: 1.5; }
    .cp-titulo { display: flex; align-items: baseline; justify-content: space-between; margin: 3mm 0 1mm; }
    .cp-titulo h1 { font-size: 20pt; font-weight: 800; margin: 0; color: #111; }
    .cp-periodo { font-size: 12pt; font-weight: 500; color: #777; }
    .cp-dash { border-top: 1.2pt dashed #999; margin: 2mm 0 4mm; }
    .cp-func { font-size: 10pt; line-height: 1.6; margin-bottom: 4mm; }
    .cp-func div:last-child { color: #555; font-size: 9pt; }

    .cp-kpis { display: flex; gap: 3mm; margin-bottom: 5mm; }
    .cp-kpis > div { flex: 1; border: 0.8pt solid #ddd; border-radius: 2mm; padding: 2mm 1mm; text-align: center; }
    .cp-kpis span { display: block; font-size: 13pt; font-weight: 800; font-variant-numeric: tabular-nums; }
    .cp-kpis small { display: block; font-size: 7pt; color: #777; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.5mm; }

    .cp-tab { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .cp-tab thead th { background: #f1efe9; border-bottom: 1pt solid #bbb; padding: 1.6mm 1.5mm; font-size: 7.5pt;
        text-transform: uppercase; letter-spacing: 0.05em; color: #555; text-align: center; }
    .cp-tab th.cp-esq { text-align: left; }
    .cp-tab td { border-bottom: 0.5pt solid #e5e5e5; padding: 1.3mm 1.5mm; vertical-align: middle; }
    .cp-tab tr { break-inside: avoid; page-break-inside: avoid; }
    .cp-linha-falta td { background: #fdeeee; }
    .cp-dia { white-space: nowrap; font-weight: 600; text-transform: capitalize; }
    .cp-num { text-align: center; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .cp-batidas { line-height: 1.9; }
    .cp-bat { display: inline-block; border: 0.5pt solid #ccc; border-radius: 6pt; padding: 0.2mm 1.4mm; margin-right: 1.2mm;
        font-size: 8.5pt; font-variant-numeric: tabular-nums; }
    .cp-entrada { border-left: 2pt solid #00754A; }
    .cp-saida { border-left: 2pt solid #c2703a; }
    .cp-vazio { color: #aaa; }
    .cp-selo { font-size: 7.5pt; font-weight: 700; padding: 0.3mm 1.6mm; border-radius: 6pt; white-space: nowrap; }
    .cp-ok { background: #e6efe9; color: #1E3932; }
    .cp-falta { background: #fbdada; color: #9b1c1c; }
    .cp-abono { background: #fdeecd; color: #8a5a08; }
    .cp-feriado { background: #e3e8f5; color: #2b3f7a; }
    .cp-folga { background: #eeeeee; color: #666; }
    .cp-futuro { background: #f7f7f7; color: #999; }

    .cp-folha { display: flex; gap: 5mm; margin-top: 6mm; break-inside: avoid; page-break-inside: avoid; }
    .cp-bloco { flex: 1; }
    .cp-bloco h2 { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.12em; color: #555; margin: 0 0 1.5mm;
        border-bottom: 1pt solid #bbb; padding-bottom: 1mm; }
    .cp-fin { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    .cp-fin td { padding: 1.3mm 0; border-bottom: 0.5pt solid #eee; }
    .cp-fin td.cp-num { text-align: right; white-space: nowrap; }
    .cp-fin tr.cp-forte td { font-weight: 800; border-top: 1pt solid #999; border-bottom: none; padding-top: 1.8mm; }
    .cp-obs { color: #999; font-size: 8pt; }

    .cp-liquido { display: flex; align-items: baseline; justify-content: space-between; margin-top: 5mm;
        border: 1.5pt solid #111; border-radius: 2mm; padding: 3mm 4mm; break-inside: avoid; }
    .cp-liquido span { font-size: 10pt; text-transform: uppercase; letter-spacing: 0.08em; color: #555; }
    .cp-liquido b { font-size: 17pt; font-variant-numeric: tabular-nums; }
    .cp-nota { font-size: 7.5pt; color: #888; margin: 1.5mm 0 0; }

    .cp-declaracao { font-size: 9.5pt; line-height: 1.6; margin: 8mm 0 0; }
    .cp-data { text-align: center; font-size: 9.5pt; margin: 6mm 0 12mm; }
    .cp-assinaturas { display: flex; gap: 12mm; text-align: center; break-inside: avoid; }
    .cp-assinaturas > div { flex: 1; }
    .cp-linha { border-top: 1pt solid #111; margin: 0 auto 2mm; }
    .cp-nome { font-size: 9.5pt; letter-spacing: 0.03em; }
    .cp-doc { font-size: 8.5pt; color: #777; margin-top: 1mm; }

    /* Um cartão por folha quando imprime vários */
    .cp-folha-quebra { break-after: page; page-break-after: always; }
    .cp-folha-quebra:last-child { break-after: auto; page-break-after: auto; }`;

// Imprime NA PRÓPRIA PÁGINA (regra do PWA/iPad): esconde o app por visibility e
// tira os irmãos do fluxo para não sobrar folha em branco.
const imprimirNaPagina = (corpoHtml) => {
    document.getElementById('area-impressao')?.remove();
    document.getElementById('estilo-impressao')?.remove();

    const style = document.createElement('style');
    style.id = 'estilo-impressao';
    style.textContent = `
        @page { size: A4 portrait; margin: 10mm; }
        #area-impressao { display: none; }
        @media print {
            html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; height: auto !important; }
            body * { visibility: hidden !important; }
            body > *:not(#area-impressao) { position: absolute !important; top: 0; left: 0; width: 0 !important; height: 0 !important; overflow: hidden !important; }
            #area-impressao { display: block !important; }
            #area-impressao, #area-impressao * { visibility: visible !important; }
            #area-impressao * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            ${CARTAO_ESTILOS}
        }`;
    document.head.appendChild(style);

    const area = document.createElement('div');
    area.id = 'area-impressao';
    area.innerHTML = corpoHtml;
    document.body.appendChild(area);

    const limpar = () => { area.remove(); style.remove(); window.removeEventListener('afterprint', limpar); };
    window.addEventListener('afterprint', limpar);
    setTimeout(limpar, 60000);

    void area.offsetHeight;
    window.print(); // síncrono no clique (senão o iOS bloqueia)
};

/** Imprime o cartão de ponto + folha de UM funcionário. */
export const imprimirCartaoPonto = (cartao) => imprimirNaPagina(montarCartaoHtml(cartao));

/** Imprime vários cartões — um por folha. */
export const imprimirCartoesLote = (cartoes) =>
    imprimirNaPagina(cartoes.map(c => `<div class="cp-folha-quebra">${montarCartaoHtml(c)}</div>`).join(''));

export default imprimirCartaoPonto;
