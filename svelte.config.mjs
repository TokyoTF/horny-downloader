import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'


export default {
  preprocess: vitePreprocess(),
  onwarn(warning, defaultHandler) {
  },
}
