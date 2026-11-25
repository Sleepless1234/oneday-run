import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // tsc --build emits compiled test files into dist/types; only run the
    // sources, or every test runs twice.
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
