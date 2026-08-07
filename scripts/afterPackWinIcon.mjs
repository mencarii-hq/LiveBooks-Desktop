/**
 * Stamp win.icon onto the packaged .exe after pack.
 * electron-builder's signAndEditResources can skip or miss --set-icon on
 * unsigned local Windows builds; this keeps the LiveBooks icon without signing.
 */
import path from 'path';
import { executeAppBuilder } from 'builder-util';

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  const iconPath = path.resolve(context.packager.projectDir, 'build', 'icon.ico');

  await executeAppBuilder([
    'rcedit',
    '--args',
    JSON.stringify([exePath, '--set-icon', iconPath]),
  ]);
}
