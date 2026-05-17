import {
  app,
  BrowserWindow,
  globalShortcut,
  Menu,
  MenuItemConstructorOptions,
  shell,
} from 'electron';
import type { WebContents } from 'electron';
import type { LivebooksAppEnv } from 'utils/livebooksAppEnv';
import { macShellAppLabel } from './macDevBranding';

let devShortcutsRegistered = false;
const contextMenuAttached = new WeakSet<WebContents>();

/**
 * Dev-only application menu and shortcuts so renderer DevTools can be toggled
 * after the initial open on window create (View menu / F12 / platform default).
 */
export function configureDevelopmentShell(
  appEnv: LivebooksAppEnv,
  toggleDevTools: () => void
): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(buildDevMenuTemplate(appEnv, toggleDevTools))
  );
  registerDevelopmentShortcuts(toggleDevTools);
}

/** Right-click menu with Inspect Element and standard edit actions in dev. */
export function registerDevelopmentContextMenu(
  webContents: WebContents,
  toggleDevTools: () => void
): void {
  if (contextMenuAttached.has(webContents)) {
    return;
  }
  contextMenuAttached.add(webContents);

  webContents.on('context-menu', (_event, params) => {
    const template: MenuItemConstructorOptions[] = [];

    if (params.isEditable) {
      template.push(
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' }
      );
    } else if (params.selectionText.trim()) {
      template.push({ role: 'copy' }, { type: 'separator' });
    }

    template.push(
      {
        label: 'Inspect Element',
        click: () => {
          webContents.inspectElement(params.x, params.y);
          if (!webContents.isDevToolsOpened()) {
            webContents.openDevTools();
          }
        },
      },
      {
        label: 'Toggle Developer Tools',
        accelerator:
          process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I',
        click: toggleDevTools,
      }
    );

    Menu.buildFromTemplate(template).popup({
      window: BrowserWindow.fromWebContents(webContents) ?? undefined,
    });
  });
}

function registerDevelopmentShortcuts(toggleDevTools: () => void): void {
  if (devShortcutsRegistered) {
    return;
  }
  devShortcutsRegistered = true;

  const accelerators =
    process.platform === 'darwin'
      ? ['Alt+Command+I', 'F12']
      : ['Ctrl+Shift+I', 'F12'];

  for (const accelerator of accelerators) {
    globalShortcut.register(accelerator, toggleDevTools);
  }

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
}

function buildDevMenuTemplate(
  appEnv: LivebooksAppEnv,
  toggleDevTools: () => void
): MenuItemConstructorOptions[] {
  const viewSubmenu: MenuItemConstructorOptions[] = [
    { role: 'reload' },
    { role: 'forceReload' },
    {
      label: 'Toggle Developer Tools',
      accelerator:
        process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I',
      click: toggleDevTools,
    },
    { type: 'separator' },
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ];

  const editSubmenu: MenuItemConstructorOptions[] = [
    { role: 'undo' },
    { role: 'redo' },
    { type: 'separator' },
    { role: 'cut' },
    { role: 'copy' },
    { role: 'paste' },
    { role: 'pasteAndMatchStyle' },
    { role: 'delete' },
    { role: 'selectAll' },
  ];

  if (process.platform === 'darwin') {
    editSubmenu.push(
      { type: 'separator' },
      {
        label: 'Speech',
        submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }],
      }
    );
  }

  const helpSubmenu: MenuItemConstructorOptions[] = [
    {
      label: 'LiveBooks Website',
      click: () => {
        shell.openExternal('https://mencarii.com').catch(() => {
          /* ignore */
        });
      },
    },
  ];

  if (process.platform === 'darwin') {
    const appLabel = macShellAppLabel(appEnv);
    return [
      {
        label: appLabel,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { label: 'File', submenu: [{ role: 'close' }] },
      { label: 'Edit', submenu: editSubmenu },
      { label: 'View', submenu: viewSubmenu },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' },
        ],
      },
      { role: 'help', submenu: helpSubmenu },
    ];
  }

  return [
    {
      label: 'File',
      submenu: [{ role: 'quit' }],
    },
    { label: 'Edit', submenu: editSubmenu },
    { label: 'View', submenu: viewSubmenu },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
    { label: 'Help', submenu: helpSubmenu },
  ];
}
