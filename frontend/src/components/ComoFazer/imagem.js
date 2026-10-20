// Reduz a foto para no máximo 1600 px (lado maior) antes de enviar — foto de celular tem 5-10 MB.
export function reduzirImagem(arquivo, maximo = 1600, qualidade = 0.85) {
    return new Promise((resolve) => {
        if (!arquivo || !arquivo.type?.startsWith('image/')) { resolve(arquivo); return; }
        const url = URL.createObjectURL(arquivo);
        const img = new Image();
        img.onload = () => {
            try {
                const escala = Math.min(1, maximo / Math.max(img.width, img.height));
                if (escala >= 1 && arquivo.size < 1.5 * 1024 * 1024) { URL.revokeObjectURL(url); resolve(arquivo); return; }
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * escala);
                canvas.height = Math.round(img.height * escala);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => {
                    URL.revokeObjectURL(url);
                    if (!blob) { resolve(arquivo); return; }
                    const nome = (arquivo.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg';
                    resolve(new File([blob], nome, { type: 'image/jpeg' }));
                }, 'image/jpeg', qualidade);
            } catch { URL.revokeObjectURL(url); resolve(arquivo); }
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(arquivo); };
        img.src = url;
    });
}

/** Duração (s) de um vídeo escolhido; null se não deu para ler. */
export function duracaoVideo(arquivo) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(arquivo);
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(v.duration) ? v.duration : null); };
        v.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        v.src = url;
    });
}
