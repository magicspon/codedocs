import react from '@vitejs/plugin-react'
import { defineConfig, type UserConfig } from 'vite'

/** The site: a list of songs, and a page to play each one. */
const config: UserConfig = defineConfig({
  plugins: [react()],
  // Absolute, because a route such as `/router` would move a relative base.
  base: '/',
  server: { host: '127.0.0.1' },
  // `public` holds the songs, which `src/songs.ts` imports so each gets a
  // hashed name. Copying the folder as well would ship every mp3 twice.
  publicDir: false,
})

export default config
