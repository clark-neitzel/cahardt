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

// Valor por extenso em pt-BR (mesmo modelo do recibo do Contas a Pagar)
const extensoAte999 = (n) => {
    const U = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
    const D = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
    const C = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
    if (n === 0) return '';
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100), rr = n % 100;
    const dezenas = rr < 20 ? U[rr] : `${D[Math.floor(rr / 10)]}${rr % 10 ? ` e ${U[rr % 10]}` : ''}`;
    return [c ? C[c] : '', rr ? dezenas : ''].filter(Boolean).join(' e ');
};
const valorPorExtenso = (valor) => {
    const cents = Math.round(Number(valor || 0) * 100);
    const inteiro = Math.floor(cents / 100);
    const centavos = cents % 100;
    const partes = [];
    const milhoes = Math.floor(inteiro / 1000000);
    const milhares = Math.floor((inteiro % 1000000) / 1000);
    const resto = inteiro % 1000;
    if (milhoes) partes.push(milhoes === 1 ? 'um milhão' : `${extensoAte999(milhoes)} milhões`);
    if (milhares) partes.push(milhares === 1 ? 'mil' : `${extensoAte999(milhares)} mil`);
    if (resto) partes.push(extensoAte999(resto));
    const reais = inteiro > 0 ? `${partes.join(' e ')} ${inteiro === 1 ? 'real' : 'reais'}` : '';
    const centTxt = centavos > 0 ? `${extensoAte999(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}` : '';
    const texto = [reais, centTxt].filter(Boolean).join(' e ') || 'zero real';
    return texto.charAt(0).toUpperCase() + texto.slice(1);
};
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const montarCartaoHtml = (cartao) => {
    const f = cartao.funcionario || {};
    const r = cartao.resumo || {};
    const p = cartao.periodo || {};
    const prestador = cartao.folha?.modo === 'PRESTADOR';

    // CADA DIA EM UMA LINHA: a pílula encolhe conforme o dia mais cheio do
    // período, para as batidas nunca quebrarem para a linha de baixo.
    // Medido na régua: uma pílula ocupa ~1,45 mm por ponto de fonte, e a coluna
    // de batidas tem ~110 mm úteis numa A4 com margem de 10 mm.
    const maxBatidas = (cartao.linhas || []).reduce((m, l) => Math.max(m, l.batidas.length), 0);
    const fonteIdeal = maxBatidas > 0 ? 110 / (1.45 * maxBatidas) : 7.5;
    const fonteBatida = Math.max(5, Math.min(7.5, Math.round(fonteIdeal * 10) / 10));
    // Abaixo de 5pt ficaria ilegível: aí é melhor deixar quebrar do que vazar
    // por cima das outras colunas (dia com 15+ batidas é caso extremo).
    const quebrar = fonteIdeal < 5;

    const linhas = (cartao.linhas || []).map((l) => {
        const d = new Date(`${l.data}T12:00:00`);
        const batidas = l.batidas.length
            ? l.batidas.map(b => `<span class="cp-bat ${b.tipo === 'SAIDA' ? 'cp-saida' : 'cp-entrada'}">${b.hora}</span>`).join('')
            : '<span class="cp-vazio">—</span>';
        // Prestador: só dia, batidas e horas — sem previsto/saldo/situação
        if (prestador) {
            if (!l.batidas.length) return '';
            return `
        <tr>
            <td class="cp-dia">${DIA_CURTO[l.diaSemana]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}</td>
            <td class="cp-batidas">${batidas}</td>
            <td class="cp-num">${l.trabalhado}</td>
        </tr>`;
        }
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
    <div class="cp${quebrar ? ' cp-bat-quebra' : ''}" style="--bat: ${fonteBatida}pt">
        <div class="cp-rule"></div>
        <div class="cp-header">
            <img src="/logo-hardt.png" alt="Hardt" class="cp-logo" />
            <div class="cp-emp">
                <div><b>${escapeHtml(EMPRESA.nome)}</b></div>
                <div>CNPJ: ${EMPRESA.cnpj} &nbsp;IE: ${EMPRESA.ie} &nbsp;·&nbsp; ${escapeHtml(EMPRESA.endereco)} — CEP ${EMPRESA.cep}</div>
            </div>
            <div class="cp-titulo">
                <h1>${prestador ? 'Folha de horas' : 'Folha de ponto'}</h1>
                <div class="cp-periodo">${dmy(p.de)} a ${dmy(p.ate)}</div>
            </div>
        </div>
        <div class="cp-rule"></div>

        <div class="cp-func">
            <div><b>${escapeHtml(f.nome || '')}</b>${f.cargo ? ` · ${escapeHtml(f.cargo)}` : ''}${prestador ? ' · Prestador de serviços' : ''}</div>
            <div>CPF: ${escapeHtml(fmtCpf(f.cpf))}${prestador ? '' : ` &nbsp;·&nbsp; Admissão: ${dmy(f.dataAdmissao)}`}</div>
        </div>

        ${prestador ? `
        <div class="cp-resumo">
            <span><i>Horas prestadas</i><b>${r.trabalhado}</b></span>
            <span><i>Dias com serviço</i><b>${r.diasTrabalhados}</b></span>
        </div>

        <table class="cp-tab">
            <thead><tr>
                <th class="cp-esq">Dia</th><th class="cp-esq">Horários</th><th>Horas</th>
            </tr></thead>
            <tbody>${linhas}</tbody>
        </table>` : `
        <div class="cp-resumo">
            <span><i>Horas trabalhadas</i><b>${r.trabalhado}</b></span>
            <span><i>Previsto</i><b>${r.previsto}</b></span>
            <span><i>Saldo</i><b>${r.saldo}</b></span>
            <span><i>Hora extra</i><b>${r.extra}</b></span>
            <span><i>Faltas</i><b>${r.faltas}</b></span>
            ${marcados ? `<span class="cp-marcados"><i>Dias marcados</i><b>${escapeHtml(marcados)}</b></span>` : ''}
        </div>

        <table class="cp-tab">
            <colgroup>
                <col style="width:16mm"><col><col style="width:13mm">
                <col style="width:15mm"><col style="width:13mm"><col style="width:21mm">
            </colgroup>
            <thead><tr>
                <th class="cp-esq">Dia</th><th class="cp-esq">Batidas</th>
                <th>Previsto</th><th>Trabalhado</th><th>Saldo</th><th class="cp-esq">Situação</th>
            </tr></thead>
            <tbody>${linhas}</tbody>
        </table>`}

        <p class="cp-declaracao">
            ${prestador
            ? 'Declaro que os horários acima correspondem aos serviços efetivamente prestados no período.'
            : 'Declaro que conferi as marcações de ponto acima e que elas correspondem aos horários efetivamente trabalhados no período.'}
        </p>
        <p class="cp-data">${EMPRESA.cidadeUf}, ${new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })}</p>
        <div class="cp-assinaturas">
            <div><div class="cp-linha"></div><div class="cp-nome">${escapeHtml(String(f.nome || '').toUpperCase())}</div><div class="cp-doc">${prestador ? 'Prestador' : 'Funcionário'}</div></div>
            <div><div class="cp-linha"></div><div class="cp-nome">${escapeHtml(EMPRESA.nome)}</div><div class="cp-doc">${prestador ? 'Contratante' : 'Empregador'}</div></div>
        </div>
    </div>`;
};

// ─── Recibo de prestação de serviços (só para prestador por hora) ────────────
const montarReciboHtml = (cartao) => {
    const f = cartao.funcionario || {};
    const fo = cartao.folha || {};
    const p = cartao.periodo || {};
    const dataExtenso = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });

    return `
    <div class="cp cp-recibo">
        <div class="cp-rule"></div>
        <div class="cp-header">
            <img src="/logo-hardt.png" alt="Hardt" class="cp-logo" />
            <div class="cp-emp">
                <div><b>${escapeHtml(EMPRESA.nome)}</b></div>
                <div>CNPJ: ${EMPRESA.cnpj} &nbsp;IE: ${EMPRESA.ie} &nbsp;·&nbsp; ${escapeHtml(EMPRESA.endereco)} — CEP ${EMPRESA.cep}</div>
            </div>
        </div>
        <div class="cp-rule"></div>

        <div class="rc-titulo">
            <h1>Recibo</h1>
            <div class="rc-valor"><span>R$</span>${Number(fo.liquido || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </div>
        <div class="rc-dash"></div>

        <p class="rc-texto">
            Recebi de <b>${escapeHtml(EMPRESA.nome)}</b> a importância de
            <b>${escapeHtml(valorPorExtenso(fo.liquido))}</b>, referente a
            <b>${fo.horas}</b> de serviços prestados entre <b>${dmy(p.de)}</b> e <b>${dmy(p.ate)}</b>,
            ao valor de <b>${brl(fo.valorHora)}</b> por hora${fo.outrosProventos > 0 ? `, mais ${brl(fo.outrosProventos)} de outros valores` : ''}${fo.outrosDescontos > 0 ? `, com desconto de ${brl(fo.outrosDescontos)}${fo.obsAjuste ? ` (${escapeHtml(fo.obsAjuste)})` : ''}` : ''}.
        </p>
        <p class="rc-texto">
            Para confirmar a veracidade deste documento e da quantia recebida, assino o presente recibo nesta data.
        </p>

        <p class="cp-data">${EMPRESA.cidadeUf}, ${dataExtenso}</p>
        <div class="cp-assinaturas">
            <div>
                <div class="cp-linha"></div>
                <div class="cp-nome">${escapeHtml(String(f.nome || '').toUpperCase())}</div>
                <div class="cp-doc">CPF: ${escapeHtml(fmtCpf(f.cpf))}</div>
            </div>
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

    .cp-tab { width: 100%; border-collapse: collapse; font-size: 7.5pt; line-height: 1.25; table-layout: fixed; }
    .cp-tab thead th { background: #f1efe9; border-bottom: 0.8pt solid #bbb; padding: 0.8mm 1.2mm; font-size: 6pt;
        text-transform: uppercase; letter-spacing: 0.04em; color: #555; text-align: center; }
    .cp-tab th.cp-esq { text-align: left; }
    .cp-tab td { border-bottom: 0.4pt solid #e8e8e8; padding: 0.5mm 1.2mm; vertical-align: middle; }
    .cp-tab tr { break-inside: avoid; page-break-inside: avoid; }
    .cp-linha-falta td { background: #fdeeee; }
    .cp-dia { white-space: nowrap; font-weight: 700; text-transform: capitalize; }
    .cp-num { text-align: center; font-variant-numeric: tabular-nums; white-space: nowrap; }
    /* Cada dia em UMA linha: as pílulas nunca quebram para a linha de baixo.
       O tamanho (--bat) é calculado pelo dia mais cheio do período; o padding e
       a margem vão em em, para encolherem junto. */
    .cp-batidas { line-height: 1.35; white-space: nowrap; }
    .cp-bat { display: inline-block; border: 0.4pt solid #ccc; border-radius: 5pt;
        font-size: var(--bat, 7.5pt); padding: 0.02em 0.28em; margin-right: 0.22em;
        font-variant-numeric: tabular-nums; }
    .cp-bat-quebra .cp-batidas { white-space: normal; }
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

    /* Recibo do prestador (folha própria, mais arejada) */
    .cp-recibo .rc-titulo { display: flex; align-items: baseline; justify-content: space-between; margin: 6mm 0 2mm; }
    .cp-recibo .rc-titulo h1 { font-size: 24pt; font-weight: 800; margin: 0; color: #111; }
    .cp-recibo .rc-valor { font-size: 22pt; font-weight: 500; color: #777; white-space: nowrap; }
    .cp-recibo .rc-valor span { font-size: 12pt; margin-right: 1mm; }
    .cp-recibo .rc-dash { border-top: 1.2pt dashed #999; margin: 3mm 0 9mm; }
    .cp-recibo .rc-texto { font-size: 11.5pt; line-height: 1.6; margin: 0 0 7mm; }
    .cp-recibo .cp-data { font-size: 11pt; margin: 14mm 0 16mm; }
    .cp-recibo .cp-nome { font-size: 11pt; }
    .cp-recibo .cp-doc { font-size: 10pt; }
    .cp-recibo .cp-linha { width: 70%; }

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

/** Imprime o recibo de prestação de serviços (prestador por hora). */
export const imprimirReciboPrestador = (cartao) => imprimirNaPagina(montarReciboHtml(cartao));

/** Imprime várias folhas de ponto — uma por folha de papel. */
export const imprimirCartoesLote = (cartoes) =>
    imprimirNaPagina(cartoes.map(c => `<div class="cp-folha-quebra">${montarCartaoHtml(c)}</div>`).join(''));

export default imprimirCartaoPonto;
