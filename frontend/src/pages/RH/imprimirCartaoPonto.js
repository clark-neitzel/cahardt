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
    ATESTADO: 'cp-abono',
    FERIAS: 'cp-ferias',
    FERIADO: 'cp-feriado',
    FOLGA: 'cp-folga',
    COMPENSADO: 'cp-folga',
    FUTURO: 'cp-futuro',
    SEM_VINCULO: 'cp-futuro'
};

export const montarCartaoHtml = (cartao) => {
    const f = cartao.funcionario || {};
    const r = cartao.resumo || {};
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

    // Extras do período que valem constar na folha assinada (dias, não dinheiro)
    const marcados = [
        r.diasFerias ? `${r.diasFerias} de férias` : '',
        r.diasAtestado ? `${r.diasAtestado} de atestado` : '',
        r.diasAbonados ? `${r.diasAbonados} abonado(s)` : ''
    ].filter(Boolean).join(' · ');

    return `
    <div class="cp">
        <div class="cp-rule"></div>
        <div class="cp-header">
            <img src="/logo-hardt.png" alt="Hardt" class="cp-logo" />
            <div class="cp-emp">
                <div><b>${escapeHtml(EMPRESA.nome)}</b></div>
                <div>CNPJ: ${EMPRESA.cnpj} &nbsp;IE: ${EMPRESA.ie} &nbsp;·&nbsp; ${escapeHtml(EMPRESA.endereco)} — CEP ${EMPRESA.cep}</div>
            </div>
            <div class="cp-titulo">
                <h1>Folha de ponto</h1>
                <div class="cp-periodo">${dmy(p.de)} a ${dmy(p.ate)}</div>
            </div>
        </div>
        <div class="cp-rule"></div>

        <div class="cp-func">
            <div><b>${escapeHtml(f.nome || '')}</b>${f.cargo ? ` · ${escapeHtml(f.cargo)}` : ''}</div>
            <div>CPF: ${escapeHtml(fmtCpf(f.cpf))} &nbsp;·&nbsp; Admissão: ${dmy(f.dataAdmissao)}</div>
        </div>

        <div class="cp-resumo">
            <span><i>Horas trabalhadas</i><b>${r.trabalhado}</b></span>
            <span><i>Previsto</i><b>${r.previsto}</b></span>
            <span><i>Saldo</i><b>${r.saldo}</b></span>
            <span><i>Hora extra</i><b>${r.extra}</b></span>
            <span><i>Faltas</i><b>${r.faltas}</b></span>
            ${marcados ? `<span class="cp-marcados"><i>Dias marcados</i><b>${escapeHtml(marcados)}</b></span>` : ''}
        </div>

        <table class="cp-tab">
            <thead><tr>
                <th class="cp-esq">Dia</th><th class="cp-esq">Batidas</th>
                <th>Previsto</th><th>Trabalhado</th><th>Saldo</th><th class="cp-esq">Situação</th>
            </tr></thead>
            <tbody>${linhas}</tbody>
        </table>

        <p class="cp-declaracao">
            Declaro que conferi as marcações de ponto acima e que elas correspondem aos horários
            efetivamente trabalhados no período.
        </p>
        <p class="cp-data">${EMPRESA.cidadeUf}, ${new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })}</p>
        <div class="cp-assinaturas">
            <div><div class="cp-linha"></div><div class="cp-nome">${escapeHtml(String(f.nome || '').toUpperCase())}</div><div class="cp-doc">Funcionário</div></div>
            <div><div class="cp-linha"></div><div class="cp-nome">${escapeHtml(EMPRESA.nome)}</div><div class="cp-doc">Empregador</div></div>
        </div>
    </div>`;
};

export const CARTAO_ESTILOS = `
    /* Folha de ponto: 1 mês inteiro tem que caber em UMA folha A4 — daí o aperto */
    .cp { font-family: 'Manrope', -apple-system, sans-serif; color: rgba(0,0,0,0.87); max-width: 190mm; margin: 0 auto; }
    .cp-rule { border-top: 2pt solid #111; margin: 2mm 0; }
    .cp-header { display: flex; align-items: center; gap: 5mm; padding: 0.5mm 0; }
    .cp-logo { height: 12mm; width: auto; }
    .cp-emp { flex: 1; font-size: 7.5pt; color: #666; line-height: 1.45; }
    .cp-emp b { color: #111; font-size: 8.5pt; }
    .cp-titulo { text-align: right; }
    .cp-titulo h1 { font-size: 15pt; font-weight: 800; margin: 0; color: #111; white-space: nowrap; }
    .cp-periodo { font-size: 9pt; font-weight: 500; color: #777; white-space: nowrap; }
    .cp-func { font-size: 9.5pt; line-height: 1.4; margin: 2mm 0; }
    .cp-func div:last-child { color: #555; font-size: 8pt; }

    .cp-resumo { display: flex; flex-wrap: wrap; gap: 1.5mm; margin-bottom: 2mm; }
    .cp-resumo > span { flex: 1; min-width: 22mm; border: 0.7pt solid #ddd; border-radius: 1.5mm; padding: 0.9mm 1mm; text-align: center; }
    .cp-resumo i { display: block; font-style: normal; font-size: 6pt; color: #777; text-transform: uppercase; letter-spacing: 0.05em; }
    .cp-resumo b { display: block; font-size: 10pt; font-variant-numeric: tabular-nums; margin-top: 0.3mm; }
    .cp-marcados { flex: 2 !important; }
    .cp-marcados b { font-size: 7.5pt; font-weight: 700; }

    .cp-tab { width: 100%; border-collapse: collapse; font-size: 7.5pt; line-height: 1.25; }
    .cp-tab thead th { background: #f1efe9; border-bottom: 0.8pt solid #bbb; padding: 0.8mm 1.2mm; font-size: 6pt;
        text-transform: uppercase; letter-spacing: 0.04em; color: #555; text-align: center; }
    .cp-tab th.cp-esq { text-align: left; }
    .cp-tab td { border-bottom: 0.4pt solid #e8e8e8; padding: 0.5mm 1.2mm; vertical-align: middle; }
    .cp-tab tr { break-inside: avoid; page-break-inside: avoid; }
    .cp-linha-falta td { background: #fdeeee; }
    .cp-dia { white-space: nowrap; font-weight: 700; text-transform: capitalize; }
    .cp-num { text-align: center; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .cp-batidas { line-height: 1.5; }
    .cp-bat { display: inline-block; border: 0.4pt solid #ccc; border-radius: 5pt; padding: 0.1mm 1.1mm; margin-right: 1mm;
        font-size: 7.5pt; font-variant-numeric: tabular-nums; }
    .cp-entrada { border-left: 1.6pt solid #00754A; }
    .cp-saida { border-left: 1.6pt solid #c2703a; }
    .cp-vazio { color: #aaa; }
    .cp-selo { font-size: 6.5pt; font-weight: 700; padding: 0.2mm 1.3mm; border-radius: 5pt; white-space: nowrap; }
    .cp-ok { background: #e6efe9; color: #1E3932; }
    .cp-falta { background: #fbdada; color: #9b1c1c; }
    .cp-abono { background: #fdeecd; color: #8a5a08; }
    .cp-ferias { background: #ece3f5; color: #5b2a86; }
    .cp-feriado { background: #e3e8f5; color: #2b3f7a; }
    .cp-folga { background: #eeeeee; color: #666; }
    .cp-futuro { background: #f7f7f7; color: #999; }

    .cp-declaracao { font-size: 7.5pt; line-height: 1.4; margin: 3mm 0 0; }
    .cp-data { text-align: center; font-size: 7.5pt; margin: 2mm 0 6mm; }
    .cp-assinaturas { display: flex; gap: 12mm; text-align: center; break-inside: avoid; }
    .cp-assinaturas > div { flex: 1; }
    .cp-linha { border-top: 0.8pt solid #111; margin: 0 auto 1.5mm; }
    .cp-nome { font-size: 8.5pt; letter-spacing: 0.03em; }
    .cp-doc { font-size: 7.5pt; color: #777; margin-top: 0.7mm; }

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
        @page { size: A4 portrait; margin: 8mm 10mm; }
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

/** Imprime a folha de ponto de UM funcionário (só o ponto — sem valores da folha). */
export const imprimirCartaoPonto = (cartao) => imprimirNaPagina(montarCartaoHtml(cartao));

/** Imprime várias folhas de ponto — uma por folha de papel. */
export const imprimirCartoesLote = (cartoes) =>
    imprimirNaPagina(cartoes.map(c => `<div class="cp-folha-quebra">${montarCartaoHtml(c)}</div>`).join(''));

export default imprimirCartaoPonto;
