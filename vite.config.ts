import vue from '@vitejs/plugin-vue';
import path from 'path';
import { defineConfig } from 'vite';
import { isProductionCloudOrigin } from './utils/livebooksCloudOrigin';

/**
 * This vite config file is used only for dev mode, i.e.
 * to create a serve build modules of the source code
 * which will be rendered by electron.
 *
 * For building the project, vite is used programmatically
 * see build/scripts/build.mjs for this.
 */
export default () => {
  let port = 6969;
  let host = '0.0.0.0';
  if (process.env.VITE_PORT && process.env.VITE_HOST) {
    port = Number(process.env.VITE_PORT);
    host = process.env.VITE_HOST;
  }

  // Dev server only. Never bake production Cloud into yarn dev,
  // even if LIVEBOOKS_CLOUD_ORIGIN is set in the environment.
  const fromEnv =
    process.env.VITE_LIVEBOOKS_CLOUD_ORIGIN ||
    process.env.LIVEBOOKS_CLOUD_ORIGIN ||
    'http://127.0.0.1:3000';
  const livebooksCloudOrigin = isProductionCloudOrigin(fromEnv)
    ? 'http://127.0.0.1:3000'
    : fromEnv;

  return defineConfig({
    define: {
      'import.meta.env.VITE_LIVEBOOKS_CLOUD_ORIGIN':
        JSON.stringify(livebooksCloudOrigin),
    },
    server: { host, port, strictPort: true },
    root: path.resolve(__dirname, './src'),
    plugins: [vue()],
    resolve: {
      alias: {
        vue: 'vue/dist/vue.esm-bundler.js',
        fyo: path.resolve(__dirname, './fyo'),
        src: path.resolve(__dirname, './src'),
        schemas: path.resolve(__dirname, './schemas'),
        backend: path.resolve(__dirname, './backend'),
        models: path.resolve(__dirname, './models'),
        utils: path.resolve(__dirname, './utils'),
        regional: path.resolve(__dirname, './regional'),
        reports: path.resolve(__dirname, './reports'),
        dummy: path.resolve(__dirname, './dummy'),
        fixtures: path.resolve(__dirname, './fixtures'),
      },
    },
  });
};
