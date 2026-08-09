/**
 * Require hooks for node-based tests (tape via scripts/runner.sh).
 * Gated on IS_TEST so other runner.sh consumers (e.g. translation
 * generation) are unaffected.
 *
 * 1. .vue single-file components: models transitively require them
 *    (e.g. models -> src/utils/interactive -> Dialog.vue) but ts-node
 *    cannot parse them and tests never render components. Stub to {}.
 *
 * 2. Vite-only modules using `import.meta`: cannot compile under the
 *    CommonJS module setting ts-node needs, so redirect them to
 *    test stubs that mirror their behavior via process.env.
 */
if (process.env.IS_TEST === 'true') {
  const Module = require('module');
  const path = require('path');

  require.extensions['.vue'] = (module) => {
    module.exports = {};
  };

  const stubs = {
    [path.resolve(__dirname, '../src/utils/livebooksCloudUrls.ts')]:
      path.resolve(__dirname, 'testStubs/livebooksCloudUrls.js'),
    // Renderer-only at module scope (router/history); needed so node specs
    // can import src/utils/memorizedTransactions.
    [path.resolve(__dirname, '../src/utils/ui.ts')]: path.resolve(
      __dirname,
      'testStubs/uiUtils.js'
    ),
    [path.resolve(__dirname, '../src/errorHandling.ts')]: path.resolve(
      __dirname,
      'testStubs/errorHandling.js'
    ),
  };

  const originalResolve = Module._resolveFilename;
  Module._resolveFilename = function (...args) {
    const resolved = originalResolve.apply(this, args);
    return stubs[resolved] ?? resolved;
  };
}
