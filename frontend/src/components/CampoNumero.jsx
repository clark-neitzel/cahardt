import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

// CampoNumero — substituto do <input type="number"> (mesma API).
//
// Por que existe: o campo "number" do navegador (1) soma/subtrai quando se rola o
// mouse em cima dele e (2) aceita "e", "+" e "-". Aqui o campo é texto, então o
// scroll não faz nada e só entra o que faz sentido.
//
// Regra de ouro: o onChange entrega um pseudo-evento cujo `target.value` JÁ VEM COM
// PONTO e sem separador pendente ("12,5" -> "12.5", "12," -> "12", "," -> "0," na tela e "0" no valor). Assim
// qualquer consumidor que fazia Number(e.target.value) continua igual. O texto
// mostrado na tela usa vírgula.

const casasDoStep = (step) => {
    if (step === undefined || step === null || step === '') return 0;
    if (String(step) === 'any') return 4;
    const s = String(step);
    const i = s.indexOf('.');
    return i === -1 ? 0 : s.length - i - 1;
};

// texto da tela -> valor entregue ao pai (ponto, sem separador pendente)
const textoParaValor = (t) => {
    let v = String(t ?? '').replace(',', '.');
    if (v === '' || v === '-' || v === '.' || v === '-.') return '';
    if (v.endsWith('.')) v = v.slice(0, -1);
    if (v.startsWith('.')) v = '0' + v;          // ",5" -> "0.5"
    else if (v.startsWith('-.')) v = '-0' + v.slice(1); // "-,5" -> "-0.5"
    return v;
};

// Digitação: filtra caractere a caractere.
const filtrarDigitado = (bruto, { decimal, casas, permiteNegativo }) => {
    let s = String(bruto ?? '').replace(/\./g, decimal ? ',' : '');
    let neg = false;
    if (permiteNegativo && s.trim().startsWith('-')) neg = true;
    s = s.replace(decimal ? /[^0-9,]/g : /[^0-9]/g, '');
    if (decimal) {
        const i = s.indexOf(',');
        if (i !== -1) {
            const inteira = s.slice(0, i);
            let frac = s.slice(i + 1).replace(/,/g, '');
            if (casas > 0) frac = frac.slice(0, casas);
            s = casas > 0 ? `${inteira},${frac}` : inteira;
        }
    }
    // sem zeros à esquerda ("05" -> "5"; "0,5" e "0" ficam) e vírgula sozinha no começo vira "0,"
    s = s.replace(/^0+(?=\d)/, '');
    if (decimal && s.startsWith(',')) s = '0' + s;
    return (neg ? '-' : '') + s;
};

// Colagem: "1.234,56" -> 1234,56 ; "1,234.56" -> 1234,56 ; só um separador = decimal.
const normalizarColado = (bruto, opts) => {
    let s = String(bruto ?? '').trim().replace(/\s/g, '').replace(/^R\$/i, '');
    const neg = opts.permiteNegativo && s.startsWith('-');
    s = s.replace(/[^0-9.,]/g, '');
    if (!opts.decimal) {
        // inteiro: descarta a parte fracionária (se houver um único separador no fim)
        const m = s.match(/^(\d[\d.,]*?)[.,]\d{1,2}$/);
        if (m && /[.,]/.test(s)) s = m[1];
        return (neg ? '-' : '') + s.replace(/[.,]/g, '');
    }
    const ultVirg = s.lastIndexOf(',');
    const ultPonto = s.lastIndexOf('.');
    const ultimo = Math.max(ultVirg, ultPonto);
    if (ultimo === -1) return (neg ? '-' : '') + s;
    const sep = ultVirg > ultPonto ? ',' : '.';
    const qtdSep = (s.match(sep === ',' ? /,/g : /\./g) || []).length;
    const outroSep = sep === ',' ? '.' : ',';
    const temOutro = s.includes(outroSep);
    // vários do mesmo separador e nenhum outro => milhar ("1.234.567")
    if (qtdSep > 1 && !temOutro) return (neg ? '-' : '') + s.replace(/[.,]/g, '');
    const inteira = s.slice(0, ultimo).replace(/[.,]/g, '');
    const frac = s.slice(ultimo + 1);
    // PONTO único seguido de exatamente 3 dígitos (e parte inteira não-zero) = milhar pt-BR
    // ("1.234" -> 1234, "R$ 1.500" -> 1500) — só quando o campo tem menos de 3 casas (num campo de 3
    // casas, "45.500" e "1.234" são decimais) e NUNCA com vírgula ("1,234" em pt-BR é decimal).
    // Com 1-2 dígitos é decimal ("12.5" -> 12,5).
    if (sep === '.' && opts.casas < 3 && qtdSep === 1 && !temOutro && frac.length === 3
        && /^\d+$/.test(inteira) && Number(inteira) > 0) {
        return (neg ? '-' : '') + inteira + frac;
    }
    return (neg ? '-' : '') + inteira + ',' + frac;
};

const pseudoEvento = (valor, name, id) => {
    const alvo = { value: valor, name, id, type: 'number' };
    return { target: alvo, currentTarget: alvo, preventDefault() {}, stopPropagation() {}, persist() {} };
};

const IGNORADAS = ['type', 'inputMode', 'step', 'min', 'max', 'decimal', 'casas', 'permiteNegativo',
    'value', 'onChange', 'defaultValue'];

const CampoNumero = forwardRef(function CampoNumero(props, refExterno) {
    const {
        value, onChange, min, max, step, decimal: decimalProp, casas: casasProp,
        permiteNegativo: permiteNegativoProp, defaultValue, name, id, onKeyDown, onPaste, ...resto
    } = props;
    const permiteNegativo = permiteNegativoProp !== undefined
        ? !!permiteNegativoProp
        : (min !== undefined && min !== '' && Number(min) < 0);
    IGNORADAS.forEach(k => { delete resto[k]; });

    const decimal = decimalProp !== undefined
        ? !!decimalProp
        : (String(step) === 'any' || casasDoStep(step) > 0);
    // nunca menos de 2 casas no decimal (step="0.5" não pode truncar 12,75); step="any" => 4
    const casas = !decimal ? 0 : (casasProp ?? Math.max(casasDoStep(step), 2));
    const opts = { decimal, casas, permiteNegativo };

    const inputRef = useRef(null);
    useImperativeHandle(refExterno, () => inputRef.current);

    const paraTexto = (v) => {
        if (v === null || v === undefined || v === '') return '';
        let str = String(v);
        const num = Number(str);
        // arredonda para as casas do campo (0.1+0.2 não pode aparecer com 17 casas)
        if (decimal && casas > 0 && Number.isFinite(num) && /\.\d/.test(str) && str.split('.')[1].length > casas) {
            str = String(Number(num.toFixed(casas)));
        }
        return str.replace('.', ',');
    };
    const [texto, setTexto] = useState(() => paraTexto(value !== undefined ? value : defaultValue));
    const emitido = useRef(null); // último valor entregue ao pai (null = nunca digitou)

    // Sincroniza do pai só quando o NÚMERO difere do que está na tela (preserva "12," enquanto
    // o pai guarda "12"; e esvazia quando o pai limpa o campo).
    useEffect(() => {
        if (value === undefined) return; // não controlado (defaultValue): o texto é do próprio campo
        const pai = value === null || value === undefined ? '' : String(value);
        const atual = textoParaValor(texto);
        // Zero é zero: o que entregamos foi 0 (ou ""), a tela mostra 0 (ou vazio) e o pai devolveu 0 ou ''
        // (`Number(v) || 0` com `value={x || ''}`) — não mexe ("0," não pode virar vazio, nem vazio virar "0").
        if (emitido.current !== null && Number(emitido.current) === 0 && Number(atual) === 0
            && (pai === '' || Number(pai) === 0)) return;
        if (pai === '') {
            if (atual !== '') setTexto('');
            return;
        }
        if (atual === '' || Number(atual) !== Number(pai)) setTexto(paraTexto(pai));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    // D1: se o pai RECUSOU/ajustou o valor que acabamos de entregar (ex.: `if (v > limite) return;`),
    // o `value` não muda e o efeito acima não dispara — então conferimos aqui, depois de cada digitação.
    useEffect(() => {
        if (value === undefined || emitido.current === null) return;
        const pai = value === null ? '' : String(value);
        if (pai !== '' && Number.isNaN(Number(pai))) return;
        const eco = emitido.current;
        if (Number(eco) === 0 && (pai === '' || Number(pai) === 0)) return; // zero é zero (vazio, "0" ou "0,"): não ressincroniza
        const diverge = pai === '' ? eco !== '' : (eco === '' || Number(pai) !== Number(eco));
        if (diverge && paraTexto(pai) !== texto) setTexto(paraTexto(pai));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [texto]);

    // min/max: não bloqueia a digitação, mas mantém a validação do <form> (required/min/max)
    useEffect(() => {
        const el = inputRef.current;
        if (!el || !el.setCustomValidity) return;
        const v = textoParaValor(texto);
        let msg = '';
        // D5: sobrou só "," ou "-" => o pai recebeu "" e o `required` nativo passaria
        if (v === '' && texto !== '') msg = 'Informe um número válido.';
        else if (v !== '' && !Number.isNaN(Number(v))) {
            if (min !== undefined && min !== '' && Number(v) < Number(min)) msg = `O valor mínimo é ${min}.`;
            else if (max !== undefined && max !== '' && Number(v) > Number(max)) msg = `O valor máximo é ${max}.`;
        }
        el.setCustomValidity(msg);
    }, [texto, min, max]);

    const aplicar = (novoTexto) => {
        // max: trava na tela (digitando ou colando) — o pai recebe o valor já limitado
        if (max !== undefined && max !== null && max !== '' && Number.isFinite(Number(max))) {
            const n = Number(textoParaValor(novoTexto));
            if (!Number.isNaN(n) && textoParaValor(novoTexto) !== '' && n > Number(max)) novoTexto = paraTexto(String(max));
        }
        setTexto(novoTexto);
        emitido.current = textoParaValor(novoTexto);
        onChange?.(pseudoEvento(textoParaValor(novoTexto), name, id));
    };

    const handleChange = (e) => {
        const bruto = e.target.value;
        // Inserção de vários caracteres de uma vez que NÃO passou pelo onPaste (autopreenchimento, arrastar,
        // sendCharacter, correção do teclado): extrai o trecho inserido e aplica a mesma normalização da colagem.
        let i = 0;
        const lim = Math.min(texto.length, bruto.length);
        while (i < lim && texto[i] === bruto[i]) i++;
        let f = 0;
        while (f < lim - i && texto[texto.length - 1 - f] === bruto[bruto.length - 1 - f]) f++;
        const inserido = bruto.slice(i, bruto.length - f);
        if (inserido.length > 1) {
            aplicar(filtrarDigitado(bruto.slice(0, i) + normalizarColado(inserido, opts) + bruto.slice(bruto.length - f), opts));
            return;
        }
        aplicar(filtrarDigitado(bruto, opts));
    };

    const handleKeyDown = (e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (e.ctrlKey || e.metaKey || e.altKey || !e.key || e.key.length !== 1) return;
        const k = e.key;
        const ok = /[0-9]/.test(k)
            || (decimal && (k === ',' || k === '.'))
            || (permiteNegativo && k === '-');
        if (!ok) e.preventDefault();
    };

    const handlePaste = (e) => {
        onPaste?.(e);
        if (e.defaultPrevented) return;
        const colado = e.clipboardData?.getData('text');
        if (colado === undefined) return;
        e.preventDefault();
        const el = e.target;
        const ini = el.selectionStart ?? texto.length;
        const fim = el.selectionEnd ?? texto.length;
        const novo = texto.slice(0, ini) + normalizarColado(colado, opts) + texto.slice(fim);
        aplicar(filtrarDigitado(novo, opts));
    };

    return (
        <input
            {...resto}
            ref={inputRef}
            type="text"
            inputMode={permiteNegativo ? 'text' : (decimal ? 'decimal' : 'numeric')}
            autoComplete="off"
            name={name}
            id={id}
            value={texto}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
        />
    );
});

// Versão com botões − / + (usada na contagem de notas). Os botões são cliques de propósito.
export const CampoNumeroComBotoes = forwardRef(function CampoNumeroComBotoes(
    { passo = 1, value, onChange, min = 0, max, name, id, disabled, className = '', classNameBotao = '', rotulo = '', ...resto }, ref
) {
    const atual = Number(value) || 0;
    const mudar = (delta) => {
        let n = atual + delta;
        if (min !== undefined && min !== '' && n < Number(min)) n = Number(min);
        if (max !== undefined && max !== '' && n > Number(max)) n = Number(max);
        onChange?.(pseudoEvento(String(n), name, id));
    };
    const base = `shrink-0 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white
        text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 font-bold text-lg leading-none
        min-h-[44px] min-w-[44px] md:min-h-[36px] md:min-w-[32px] ${classNameBotao}`;
    return (
        <div className="flex items-center justify-center gap-1">
            <button type="button" tabIndex={-1} disabled={disabled || atual <= Number(min ?? 0)}
                aria-label={`Diminuir ${rotulo}`.trim()} onClick={() => mudar(-passo)} className={base}>−</button>
            <CampoNumero ref={ref} value={value} onChange={onChange} min={min} max={max} name={name} id={id}
                disabled={disabled} className={className} {...resto} />
            <button type="button" tabIndex={-1} disabled={disabled}
                aria-label={`Aumentar ${rotulo}`.trim()} onClick={() => mudar(passo)} className={base}>+</button>
        </div>
    );
});

export default CampoNumero;
