import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// `base: './'` produce percorsi relativi: la build funziona su GitHub Pages
// (https://<utente>.github.io/Denis/ipod/) e su qualunque hosting statico.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
