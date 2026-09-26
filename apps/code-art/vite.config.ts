import react from '@vitejs/plugin-react'
import {
  defineConfig,
  mergeConfig,
  type Plugin,
  type UserConfig,
  type UserConfigFnObject,
} from 'vite'
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
 * Sends every path to `index.html`, so `/vscode` loads the viewer rather than
 * a 404. The `_redirects` form is read by both Netlify and Cloudflare Pages.
 */
function spaFallback(): Plugin {
  return {
    name: 'code-art:spa-fallback',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '_redirects',
        source: '/* /index.html 200\n',
      })
    },
  }
}

/** Plugins and output for each mode. */
function modeConfig(mode: string): UserConfig {
  if (mode === 'embed') return { plugins: [react(), inlineBuild()], base: './' }
  // Absolute, because a route such as `/vscode` would move a relative base.
  if (mode === 'web')
    return {
      plugins: [react(), spaFallback()],
      base: '/',
      build: { outDir: 'dist-web' },
    }
  return { plugins: [react()], base: './' }
}

/**
 * Local-only dev server: the art is made from a private index, never served
 * beyond this machine. `vite build --mode embed` makes the page `codedocs art`
 * ships, with no dev export inside it. `vite build --mode web` makes the
 * public site: the datasets named in `src/lib/load.ts`, as static files.
 */
const config: UserConfigFnObject = defineConfig(({ mode }) =>
  mergeConfig(
    { server: { host: '127.0.0.1' }, build: { modulePreload: false } },
    modeConfig(mode),
  ),
)

export default config
