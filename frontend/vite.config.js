import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// Telas que precisam abrir SEM internet (câmara fria / caminhão). Nome do chunk (sem hash).
// Se o chunk ainda não existe no build, é simplesmente ignorado.
const TELAS_OFFLINE = ['SeparacaoCargaPage', 'ConferenciaMotoristaPage']

// Plugin "offline garantido": gera dist/build-info.json = { id, criticos } com a lista EXATA dos arquivos
// (com hash) que o service worker precisa guardar para abrir o app sem rede, e grava o id do build no sw.js
// (assim o sw.js muda a cada deploy e o navegador reinstala o service worker, refazendo o cache).
function offlineBuildInfo() {
  const id = new Date().toISOString().replace(/\D/g, '').slice(0, 14) // AAAAMMDDHHMMSS
  let outDir = 'dist'
  return {
    name: 'hardt-offline-build-info',
    config() {
      return { define: { __BUILD_ID__: JSON.stringify(id) } }
    },
    configResolved(cfg) {
      outDir = path.resolve(cfg.root, cfg.build.outDir)
    },
    generateBundle(_opts, bundle) {
      const chunks = Object.values(bundle).filter((b) => b.type === 'chunk')
      const porArquivo = new Map(chunks.map((c) => [c.fileName, c]))
      const criticos = new Set()

      const incluir = (c, seguirDinamicos) => {
        if (!c || criticos.has(c.fileName)) return
        criticos.add(c.fileName)
        for (const css of c.viteMetadata?.importedCss || []) criticos.add(css)
        for (const f of c.imports || []) incluir(porArquivo.get(f), seguirDinamicos)
        if (seguirDinamicos) for (const f of c.dynamicImports || []) incluir(porArquivo.get(f), seguirDinamicos)
      }

      // Entry: só imports estáticos (os dinâmicos do entry são TODAS as telas — não é para guardar tudo).
      for (const c of chunks.filter((x) => x.isEntry)) incluir(c, false)
      // Telas offline: fecho completo (inclui etiquetaBolsa/etiquetaRaster/html2canvas/etc. carregados sob demanda).
      for (const c of chunks.filter((x) => TELAS_OFFLINE.includes(x.name))) incluir(c, true)

      this.emitFile({
        type: 'asset',
        fileName: 'build-info.json',
        source: JSON.stringify({ id, criticos: [...criticos].sort().map((f) => '/' + f) }, null, 1),
      })
    },
    closeBundle() {
      const sw = path.join(outDir, 'sw.js')
      if (!fs.existsSync(sw)) return
      const txt = fs.readFileSync(sw, 'utf8')
      fs.writeFileSync(sw, txt.split('__BUILD_ID__').join(id))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), offlineBuildInfo()],
})
