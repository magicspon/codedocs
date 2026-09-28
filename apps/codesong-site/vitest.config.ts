import { defineConfig, type ViteUserConfig } from 'vitest/config'

// Annotated to match the other packages' configs, which the root's
// `isolatedDeclarations` requires (TS9037).
const config: ViteUserConfig = defineConfig({
  test: { name: '@codedocs/codesong-site', include: ['test/**/*.test.ts'] },
})

export default config
