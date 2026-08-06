import {
  app,
  BrowserWindow,
  globalShortcut,
  Menu,
  MenuItemConstructorOptions,
  shell,
} from 'electron';
import type { ContextMenuParams, WebContents } from 'electron';
import type { LivebooksAppEnv } from 'utils/livebooksAppEnv';
import {
  resetDisplayZoomMain,
  zoomDisplayInMain,
  zoomDisplayOutMain,
} from './displayZoom';
import { macShellAppLabel } from './macDevBranding';

let devShortcutsRegistered = false;
const contextMenuAttached = new WeakSet<WebContents>();
const devContextMenuWebContents = new WeakSet<WebContents>();
const devToolsTogglers = new WeakMap<WebContents, () => void>();

type AppMenuOptions = {
  includeDevTools?: boolean;
  toggleDevTools?: () => void;
};

/**
 * Packaged builds: application menu so Cmd/Ctrl+R Reload works
 * (menu bar may be auto-hidden on Windows/Linux).
 */
export function configureProductionShell(appEnv: LivebooksAppEnv): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(buildAppMenuTemplate(appEnv, {}))
  );
}

/**
 * Dev-only application menu and shortcuts so renderer DevTools can be toggled
 * after the initial open on window create (View menu / F12 / platform default).
 */
export function configureDevelopmentShell(
  appEnv: LivebooksAppEnv,
  toggleDevTools: () => void
): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildAppMenuTemplate(appEnv, {
        includeDevTools: true,
        toggleDevTools,
      })
    )
  );
  registerDevelopmentShortcuts(toggleDevTools);
}

function buildEditContextMenuTemplate(
  params: ContextMenuParams
): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [];

  if (params.isEditable) {
    template.push(
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' }
    );
  } else if (params.selectionText.trim()) {
    template.push({ role: 'copy' });
  }

  if (template.length) {
    template.push({ type: 'separator' });
  }
  template.push({ role: 'reload' });

  return template;
}

/** Right-click menu with standard edit actions for all builds. */
export function registerEditContextMenu(webContents: WebContents): void {
  attachContextMenuIfNeeded(webContents);
}

/** Right-click menu with Inspect Element and DevTools in dev. */
export function registerDevelopmentContextMenu(
  webContents: WebContents,
  toggleDevTools: () => void
): void {
  attachContextMenuIfNeeded(webContents);
  devContextMenuWebContents.add(webContents);
  devToolsTogglers.set(webContents, toggleDevTools);
}

function attachContextMenuIfNeeded(webContents: WebContents): void {
  if (contextMenuAttached.has(webContents)) {
    return;
  }
  contextMenuAttached.add(webContents);

  webContents.on('context-menu', (_event, params) => {
    const template = buildEditContextMenuTemplate(params);

    if (devContextMenuWebContents.has(webContents)) {
      const toggleDevTools = devToolsTogglers.get(webContents);
      template.push(
        { type: 'separator' },
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
    }

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

function buildViewSubmenu(
  options: AppMenuOptions
): MenuItemConstructorOptions[] {
  const viewSubmenu: MenuItemConstructorOptions[] = [
    { role: 'reload' },
    { role: 'forceReload' },
  ];

  if (options.includeDevTools && options.toggleDevTools) {
    viewSubmenu.push({
      label: 'Toggle Developer Tools',
      accelerator:
        process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I',
      click: options.toggleDevTools,
    });
  }

  // Use the same 10% clamped zoom as Settings → System (not Electron zoom-level roles).
  viewSubmenu.push(
    { type: 'separator' },
    {
      label: 'Actual Size',
      accelerator: 'CommandOrControl+0',
      click: () => resetDisplayZoomMain(),
    },
    {
      label: 'Zoom In',
      accelerator: 'CommandOrControl+=',
      click: () => zoomDisplayInMain(),
    },
    {
      label: 'Zoom In',
      accelerator: 'CommandOrControl+Plus',
      visible: false,
      acceleratorWorksWhenHidden: true,
      click: () => zoomDisplayInMain(),
    },
    {
      label: 'Zoom Out',
      accelerator: 'CommandOrControl+-',
      click: () => zoomDisplayOutMain(),
    },
    { type: 'separator' },
    { role: 'togglefullscreen' }
  );

  return viewSubmenu;
}

function buildAppMenuTemplate(
  appEnv: LivebooksAppEnv,
  options: AppMenuOptions
): MenuItemConstructorOptions[] {
  const viewSubmenu = buildViewSubmenu(options);

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
