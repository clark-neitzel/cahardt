// Reduz a foto do checklist antes de enviar: lado maior 1280 px, JPEG com qualidade
// 0.8 -> 0.6 até ficar com ~350 KB ou menos. Qualquer falha devolve o arquivo original
// (nunca impede o envio). NÃO confundir com components/ComoFazer/imagem.js (outro padrão).
const LADO_MAX = 1280;
const ALVO_BYTES = 350 * 1024;
const QUALIDADES = [0.8, 0.7, 0.6];

function paraBlob(canvas, qualidade) {
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', qualidade));
}

export async function comprimirFoto(arquivo) {
    if (!arquivo || !arquivo.type?.startsWith('image/')) return arquivo;
    const url = URL.createObjectURL(arquivo);
    try {
        const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = reject;
            i.src = url;
        });
        const escala = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        let blob = null;
        for (const q of QUALIDADES) {
            blob = await paraBlob(canvas, q);
            if (blob && blob.size <= ALVO_BYTES) break;
        }
        if (!blob) return arquivo;
        // Se "comprimir" deixou maior que o original (foto já pequena), mantém o original.
        if (blob.size >= arquivo.size && escala >= 1) return arquivo;
        const nome = (arquivo.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg';
        return new File([blob], nome, { type: 'image/jpeg' });
    } catch {
        return arquivo;
    } finally {
        URL.revokeObjectURL(url);
    }
}

export default comprimirFoto;
