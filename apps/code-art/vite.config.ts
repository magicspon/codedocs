import react from '@vitejs/plugin-react'
import { defineConfig, type UserConfig } from 'vite'

/** Local-only dev server: the art is made from a private index, never served beyond this machine. */
const config: UserConfig = defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1' },
})

export default config
