import type { InjectionKey } from 'vue';
import type { RouteLocationRaw } from 'vue-router';
import type { QuickEditOptions } from './types';
import { MAIN_PANE_ID } from './deskPanes';

export interface PaneNav {
  paneId: string;
  navigate: (route: RouteLocationRaw) => Promise<unknown>;
  openEdit: (opts: QuickEditOptions) => Promise<unknown>;
}

export const paneNavKey = Symbol('paneNav') as InjectionKey<PaneNav>;

let activePaneNav: PaneNav | null = null;
let shortcutOwnerPaneId: string | null = null;

export function setActivePaneNav(nav: PaneNav | null) {
  activePaneNav = nav;
}

export function getActivePaneNav(): PaneNav | null {
  return activePaneNav;
}

export function isChildPaneNav(nav: PaneNav | null): boolean {
  return !!nav && nav.paneId !== MAIN_PANE_ID;
}

export function setShortcutOwnerPaneId(id: string | null) {
  shortcutOwnerPaneId = id;
}

export function getShortcutOwnerPaneId(): string | null {
  return shortcutOwnerPaneId;
}
