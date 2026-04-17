import { defineConfig } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { vite as vidstack } from 'vidstack/plugins'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    build: {
      externalizeDeps: true
    },
  },
  preload: {
    build: {
      externalizeDeps: true
    },
  },
  renderer: {
    plugins: [svelte(), vidstack({ include: /player\// }), tailwindcss()]
  }
})
