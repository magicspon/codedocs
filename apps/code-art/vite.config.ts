import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin, type UserConfigFnObject } from 'vite'
import { singleFile, type Built } from './scripts/single-file.ts'

/** Folds the build into one `index.html`; see `scripts/single-file.ts`. */
function inlineBuild(): Plugin {
  return {
    name: 'code-art:single-file',
    enforce: 'post',
    generateBundle(_, bundle) {
      const page = bundle['index.html']
      if (page?.type !== 'asset') return
      const files: Built[] = Object.values(bundle)
        .filter((item) => item !== page)
        .map((item) =>
          item.type === 'chunk'
            ? { name: item.fileName, kind: 'script', text: item.code }
            : { name: item.fileName, kind: 'style', text: String(item.source) },
        )
      page.source = singleFile(String(page.source), files)
      for (const file of files) delete bundle[file.name]
    },
  }
}

/**
 * Local-only dev server: the art is made from a private index, never served
 * beyond this machine. `vite build --mode embed` makes the page `codedocs art`
 * ships, with no dev export inside it.
 */
const config: UserConfigFnObject = defineConfig(({ mode }) => ({
  plugins: mode === 'embed' ? [react(), inlineBuild()] : [react()],
  server: { host: '127.0.0.1' },
  base: './',
  build: { modulePreload: false },
}))

export default config
