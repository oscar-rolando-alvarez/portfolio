/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const isTest = Boolean(process.env.VITEST);

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // simple-peer relies on Node's Buffer/process/stream globals in the browser.
    // Not applied under Vitest, where it would shadow Node's real `process`.
    ...(isTest
      ? []
      : [
          nodePolyfills({
            include: ['buffer', 'process', 'stream', 'events', 'util'],
            globals: { Buffer: true, process: true, global: true },
          }),
        ]),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 3000,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rolldownOptions: {
      output: {
        // Long-term cacheable vendor chunks.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'fabric', test: /node_modules[\\/]fabric[\\/]/ },
            { name: 'realtime', test: /node_modules[\\/](socket\.io-client|engine\.io-client|simple-peer)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}', 'server/**/*.ts'],
      exclude: ['src/test/**', '**/*.test.{ts,tsx}', 'src/main.tsx', 'server/index.ts'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'client',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/**/*.test.ts'],
        },
      },
    ],
  },
});
