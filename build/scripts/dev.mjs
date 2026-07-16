import chokidar from 'chokidar';
import esbuild from 'esbuild';
import { $ } from 'execa';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { getMainProcessCommonConfig } from './helpers.mjs';

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
process.env['NODE_ENV'] = 'development';
process.env['VITE_HOST'] = '127.0.0.1';
process.env['VITE_PORT'] = 6969;

/**
 * This script does several things:
 * 1. Runs the vite server in dev mode `yarn vite` (unless --no-renderer is passed)
 * 2. Runs a file watcher for the main processes
 * 3. Builds the main process on file changes
 * 4. Runs electron which loads renderer using vite server url
 */

/**
 * @type {null | Function} global function used to stop dev
 */
const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dirname, '..', '..');
const $$ = $({ stdio: 'inherit' });
let isReload = false;

/**
 * @type {null | import('execa').ExecaChildProcess<string>}
 */
let electronProcess = null;

console.log(`running LiveBooks Desktop in dev mode\nroot: ${root}`);

const gen = spawnSync(
  'npx',
  ['tsx', 'build/scripts/generateBundledTranslations.mjs'],
  { cwd: root, stdio: 'inherit' }
);
if (gen.status !== 0) {
  process.exit(gen.status ?? 1);
}
/**
 * @type {import('execa').ExecaChildProcess<string>}
 */
const viteProcess = $$`yarn vite`;
/**
 * Create esbuild context that is used
 * to [re]build the main process code
 */
const ctx = await esbuild.context({
  ...getMainProcessCommonConfig(root),
  outdir: path.join(root, 'dist_electron', 'dev'),
});

/**
 * Create a file watcher so that rebuild
 * can be triggered everytime a main process
 * file changes.
 */
const fswatcher = chokidar.watch([
  path.join(root, 'main.ts'),
  path.join(root, 'main'),
  path.join(root, 'backend'),
  path.join(root, 'schemas'),
]);

/**
 * Callback function to cleanly shut file watching
 * and rebuilding objects.
 *
 * Called on CTRL+C and kill
 */
const terminate = async () => {
  await fswatcher.close();
  await ctx.dispose();

  if (electronProcess) {
    electronProcess.kill();
  }

  if (viteProcess) {
    viteProcess.kill();
  }
  process.exit();
};
process.on('SIGINT', terminate);
process.on('SIGTERM', terminate);
if (viteProcess) {
  viteProcess.on('close', terminate);
}

/**
 * Build once and run electron before setting file watcher
 */
await handleResult(await ctx.rebuild());
brandElectronAppForDevMac();
electronProcess = runElectron();

/**
 * On main process source files change
 * - rebuild main process
 * - restart electron
 */
fswatcher.on('change', async (path) => {
  console.log(`change detected:\n\t${path}`);
  const result = await ctx.rebuild();
  await handleResult(result);
  console.log(`main process source rebuilt\nrestarting electron`);

  if (electronProcess) {
    isReload = true;
    electronProcess.kill();
    brandElectronAppForDevMac();
    electronProcess = runElectron();
  }
});

/**
 * @param {esbuild.BuildResult} result
 */
async function handleResult(result) {
  if (!result.errors.length) {
    return;
  }

  console.log('error on build');
  for (const error of result.errors) {
    console.log(error);
  }

  await terminate();
}

/**
 * macOS unpackaged runs: brand a *copy* of Electron.app as livebooks-desktop-dev.app
 * so the Dock tooltip uses that name. Editing CFBundleName on Electron.app alone is
 * not enough — Dock still labels the tile from the .app folder name.
 */
function brandElectronAppForDevMac() {
  if (process.platform !== 'darwin') {
    return;
  }

  const distDir = path.join(root, 'node_modules', 'electron', 'dist');
  const electronApp = path.join(distDir, 'Electron.app');
  const brandedApp = path.join(distDir, 'livebooks-desktop-dev.app');
  const bundleName = 'livebooks-desktop-dev';

  if (!fs.existsSync(electronApp)) {
    console.warn(`dev: Electron.app not found at ${electronApp}`);
    return;
  }

  // Refresh branded copy from stock Electron.app (icon/name applied after).
  fs.rmSync(brandedApp, { recursive: true, force: true });
  spawnSync('ditto', [electronApp, brandedApp], { stdio: 'inherit' });

  const resourcesDir = path.join(brandedApp, 'Contents', 'Resources');
  const plistPath = path.join(brandedApp, 'Contents', 'Info.plist');

  const creditsSrc = path.join(root, 'build', 'Credits.html');
  if (fs.existsSync(creditsSrc)) {
    fs.copyFileSync(creditsSrc, path.join(resourcesDir, 'Credits.html'));
  }

  const icnsSrc = [
    path.join(root, 'build', 'LiveBooks.icns'),
    path.join(root, 'LiveBooks.icns'),
  ].find((candidate) => fs.existsSync(candidate));
  if (icnsSrc) {
    fs.copyFileSync(icnsSrc, path.join(resourcesDir, 'electron.icns'));
  } else {
    console.warn('dev: LiveBooks.icns not found; Dock will keep Electron icon');
  }

  const pb = '/usr/libexec/PlistBuddy';
  if (fs.existsSync(pb)) {
    const setOrAdd = (key, value) => {
      const set = spawnSync(pb, ['-c', `Set :${key} ${value}`, plistPath]);
      if (set.status !== 0) {
        spawnSync(pb, ['-c', `Add :${key} string ${value}`, plistPath]);
      }
    };
    setOrAdd('CFBundleName', bundleName);
    setOrAdd('CFBundleDisplayName', bundleName);
  }

  const lsregister =
    '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
  if (fs.existsSync(lsregister)) {
    spawnSync(lsregister, ['-f', brandedApp]);
  }

  console.log(`dev: branded ${bundleName}.app for Dock`);
}



function runElectron() {
  const mainEntry = path.join(root, 'dist_electron', 'dev', 'main.js');
  const inspectArgs = ['--inspect=5858', mainEntry];

  // Prefer the renamed macOS app so Dock tooltip is livebooks-desktop-dev.
  const brandedBinary = path.join(
    root,
    'node_modules',
    'electron',
    'dist',
    'livebooks-desktop-dev.app',
    'Contents',
    'MacOS',
    'Electron'
  );

  const electronProcess =
    process.platform === 'darwin' && fs.existsSync(brandedBinary)
      ? $$`${brandedBinary} ${inspectArgs}`
      : $$`npx electron ${inspectArgs}`;

  electronProcess.on('close', async () => {
    if (isReload) {
      return;
    }

    await terminate();
  });

  return electronProcess;
}

