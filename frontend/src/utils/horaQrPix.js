// "hoje às 09:38" ou "em 04/09 às 09:38" (fuso de Brasília). Sem data válida devolve ''.
export function quandoGerado(createdAt) {
    if (!createdAt) return '';
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return '';
    const tz = { timeZone: 'America/Sao_Paulo' };
    const hora = d.toLocaleTimeString('pt-BR', { ...tz, hour: '2-digit', minute: '2-digit' });
    const dia = d.toLocaleDateString('pt-BR', tz);
    const hoje = new Date().toLocaleDateString('pt-BR', tz);
    return dia === hoje ? `hoje às ${hora}` : `em ${dia.slice(0, 5)} às ${hora}`;
}
