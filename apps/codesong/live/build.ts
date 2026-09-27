/**
 * Bundles the extension into the single file Live loads. Live resolves no
 * `node_modules` at run time, so the SDK and CodeSong's own modules go in too.
 */

import { readFileSync } from 'node:fs'
import * as esbuild from 'esbuild'

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8')) as {
  entry: string
}
const production = process.argv.includes('--production')

await esbuild.build({
  entryPoints: ['src/extension.ts'],
  outfile: manifest.entry,
  bundle: true,
  // CommonJS on Node, as Ableton's own project template builds it.
  format: 'cjs',
  platform: 'node',
  sourcesContent: false,
  logLevel: 'info',
  minify: production,
  sourcemap: !production,
})
