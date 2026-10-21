import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // `virtual:pwa-register/react` est fourni par vite-plugin-pwa, absent de la
  // configuration de test : sans cet alias, tout rendu de la coque échoue.
  resolve: { alias: { 'virtual:pwa-register/react': new URL('./src/test-stubs/pwa-register-react.ts', import.meta.url).pathname } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // scripts/build-tokens.test.mjs runs under Node's own test runner (see
    // package.json's "test" script); it uses node:test, not Vitest, so it
    // must not also be picked up by Vitest's default glob.
    exclude: [...configDefaults.exclude, 'scripts/**'],
    // base.css lue en texte (`?raw`) par les tests qui vérifient une règle (prefers-reduced-motion).
    css: { include: [/base\.css/] },
  },
});
