import { defineConfig, type ViteUserConfig } from 'vitest/config'

// Annotated because the root config has `isolatedDeclarations` on, which cannot
// infer the type of a default-exported call expression (TS9037).
const config: ViteUserConfig = defineConfig({
  test: { name: 'cli', include: ['test/**/*.test.ts'] },
})

export default config
