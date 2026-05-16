/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Path aliases — mirrored in tsconfig.app.json (compilerOptions.paths). Vite
// shares this config with Vitest, so both runtime and test resolution agree.
const alias = {
  '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
  '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
  '@test-utils': fileURLToPath(new URL('./test/helpers', import.meta.url)),
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.{test,spec}.{ts,tsx}'],
    passWithNoTests: true,
  },
})
