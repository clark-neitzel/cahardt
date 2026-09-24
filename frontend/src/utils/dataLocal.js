/**
 * Data local (fuso do aparelho) no formato YYYY-MM-DD.
 *
 * Usada por telas/gatilhos que precisam detectar quando o dia virou com o
 * app aberto (o PWA fica dias abertos no celular do vendedor/motorista —
 * ex.: PendenciaRotaGateway, DiarioContext).
 *
 * NÃO usar `new Date().toISOString().slice(0, 10)` para isso: toISOString()
 * converte para UTC, então perto da meia-noite num fuso negativo (Brasil,
 * UTC-3) a "data local" e a data UTC já divergem por até 3h — detectaria a
 * virada do dia cedo demais (ou tarde demais, dependendo do horário).
 */
export function dataLocalHoje() {
    const d = new Date();
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

export default dataLocalHoje;
