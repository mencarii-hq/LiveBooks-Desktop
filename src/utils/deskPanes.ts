/**
 * In-renderer MDI pane store: one Vue app / one fyo, main view + 1–2 side panes.
 */
import { ref } from 'vue';
import type { RouteLocationRaw } from 'vue-router';
import { writeScreenTitle } from './qbdFamiliarity';

export const MAIN_PANE_ID = 'main';
export const MAX_CHILD_PANES = 2;
export const PANE_STORAGE_KEY = 'livebooks-desk-panes';
export const PANE_WIDTH_STORAGE_KEY = 'livebooks-desk-pane-width-px';
export const PANE_MIN_PX = 320;
/** Live max is 50% of the desk; this is only a fallback when width is unknown. */
export const PANE_MAX_RATIO = 0.5;
export const PANE_MAX_PX = 2400;
export const PANE_DEFAULT_PX = 480;

export type PaneKind =
  | 'report'
  | 'list'
  | 'form'
  | 'register'
  | 'register-write'
  | 'coa'
  | 'dashboard'
  | 'home'
  | 'get-started'
  | 'bank-feeds'
  | 'bank-reconcile'
  | 'bank-reconcile-hub'
  | 'checks-to-print'
  | 'pay-run'
  | 'import-lists'
  | 'import-wizard'
  | 'settings'
  | 'pos'
  | 'print'
  | 'report-print'
  | 'template-builder'
  | 'customize-form'
  | 'generic';

export interface DeskPane {
  id: string;
  kind: PaneKind;
  title: string;
  path: string;
  identity: string;
  props: Record<string, unknown>;
  lastUsedAt?: number;
}

export interface PaneDraft {
  kind: PaneKind;
  title: string;
  path: string;
  identity: string;
  props: Record<string, unknown>;
}

const QUICK_EDIT_QUERY_KEYS = new Set([
  'edit',
  'showFields',
  'hideFields',
  'schemaName',
  'name',
]);

export const childPanes = ref<DeskPane[]>([]);
export const focusedPaneId = ref<string>(MAIN_PANE_ID);
export const childPaneWidthPx = ref(loadPaneWidthPx());

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function storageRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function loadPaneWidthPx(): number {
  const raw = storageGet(PANE_WIDTH_STORAGE_KEY);
  const n = raw != null ? Number(raw) : NaN;
  if (Number.isFinite(n)) {
    return Math.min(PANE_MAX_PX, Math.max(PANE_MIN_PX, Math.round(n)));
  }
  return PANE_DEFAULT_PX;
}

export function persistPaneWidthPx() {
  storageSet(PANE_WIDTH_STORAGE_KEY, String(childPaneWidthPx.value));
}

// Monotonic recency counter for LRU pane eviction; seeded from restored panes.
let useSeq = 0;

function nextUseStamp(): number {
  return ++useSeq;
}

function newPaneId(): string {
  return `pane-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function decodeSeg(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function flattenQuery(
  query?: Record<string, unknown> | null
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!query) {
    return out;
  }
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') {
      out[key] = value;
    } else if (Array.isArray(value) && typeof value[0] === 'string') {
      out[key] = value[0];
    }
  }
  return out;
}

function stripQuickEditQuery(
  query: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (!QUICK_EDIT_QUERY_KEYS.has(key)) {
      out[key] = value;
    }
  }
  return out;
}

export function parseUrlLike(route: string): {
  path: string;
  query: Record<string, string>;
} {
  const qIndex = route.indexOf('?');
  const path = qIndex === -1 ? route : route.slice(0, qIndex);
  const query: Record<string, string> = {};
  if (qIndex !== -1) {
    const params = new URLSearchParams(route.slice(qIndex + 1));
    params.forEach((value, key) => {
      query[key] = value;
    });
  }
  return { path, query };
}

export function normalizeRouteLocation(route: RouteLocationRaw): {
  path: string;
  query: Record<string, string>;
} {
  if (typeof route === 'string') {
    return parseUrlLike(route);
  }

  if (route && typeof route === 'object' && 'path' in route && route.path) {
    const fromPath = parseUrlLike(route.path);
    return {
      path: fromPath.path,
      query: { ...fromPath.query, ...flattenQuery(route.query) },
    };
  }

  if (route && typeof route === 'object' && 'name' in route && route.name) {
    const named = namedRoutePath(String(route.name), route.params);
    if (named) {
      return { path: named, query: flattenQuery(route.query) };
    }
  }

  return { path: '/', query: {} };
}

function namedRoutePath(
  name: string,
  params?: Record<string, unknown> | undefined
): string | null {
  const map: Record<string, string> = {
    'Check Register': '/bank-register',
    'Write Entry': '/bank-register/write',
    'Write Checks': '/bank-register/write',
    'Record Deposits': '/bank-register/write?type=deposit',
    Home: '/',
    Dashboard: '/dashboard',
    'Chart Of Accounts': '/chart-of-accounts',
    'Bank feeds': '/bank-feeds',
    'Reconcile Hub': '/reconcile',
    'Checks to Print': '/checks-to-print',
    'Pay Run': '/pay-run',
    Settings: '/settings',
    'Point of Sale': '/pos',
    'Import Lists': '/import-lists',
    'Import Wizard': '/import-wizard',
    'Customize Form': '/customize-form',
  };
  if (map[name]) {
    return map[name];
  }
  if (
    name === 'Report' &&
    params &&
    typeof params.reportClassName === 'string'
  ) {
    return `/report/${params.reportClassName}`;
  }
  if (name === 'CommonForm' && params) {
    return `/edit/${String(params.schemaName ?? '')}/${String(
      params.name ?? ''
    )}`;
  }
  if (name === 'ListView' && params) {
    const title = params.pageTitle ? `/${String(params.pageTitle)}` : '';
    return `/list/${String(params.schemaName ?? '')}${title}`;
  }
  return null;
}

function reportTitle(className: string, memorizedName?: string): string {
  if (memorizedName && memorizedName.trim()) {
    return memorizedName;
  }
  return className;
}

export function parsePathToPaneDraft(
  path: string,
  query: Record<string, string> = {}
): PaneDraft {
  const cleanQuery = stripQuickEditQuery(query);
  const segments = path.split('/').filter(Boolean);
  const head = segments[0] ?? '';
  const a = segments[1] ? decodeSeg(segments[1]) : '';
  const b = segments[2] ? decodeSeg(segments[2]) : '';

  if (head === 'report' && a) {
    const defaultFilters = cleanQuery.defaultFilters ?? '{}';
    const memorizedName = cleanQuery.memorizedName ?? '';
    return {
      kind: 'report',
      title: reportTitle(a, memorizedName),
      path: `/report/${a}`,
      identity: `report:${a}:${defaultFilters}:${memorizedName}`,
      props: {
        reportClassName: a,
        defaultFilters,
        memorizedName,
        useRoute: false,
      },
    };
  }

  if (head === 'list' && a) {
    const pageTitle = b;
    const filtersJson = cleanQuery.filters ?? '';
    let filters: Record<string, unknown> = {};
    if (filtersJson) {
      try {
        filters = JSON.parse(filtersJson) as Record<string, unknown>;
      } catch {
        filters = {};
      }
    }
    return {
      kind: 'list',
      title: pageTitle || a,
      path: pageTitle ? `/list/${a}/${pageTitle}` : `/list/${a}`,
      identity: `list:${a}:${pageTitle}:${filtersJson}`,
      props: { schemaName: a, filters, pageTitle },
    };
  }

  if (head === 'edit' && a && b) {
    return {
      kind: 'form',
      title: `${a} ${b}`,
      path: `/edit/${a}/${encodeURIComponent(b).replaceAll('%2F', '%252F')}`,
      identity: `form:${a}:${b}`,
      props: { schemaName: a, name: b },
    };
  }

  if (path === '/bank-register' || path.startsWith('/bank-register?')) {
    return {
      kind: 'register',
      title: 'Check Register',
      path: '/bank-register',
      identity: 'register',
      props: {},
    };
  }

  if (head === 'bank-register' && a === 'write') {
    const account = cleanQuery.account ?? '';
    const type = cleanQuery.type ?? '';
    const fromMemorized = cleanQuery.fromMemorized ?? '';
    const isDeposit = type === 'deposit';
    return {
      kind: 'register-write',
      title: writeScreenTitle(isDeposit),
      path: isDeposit
        ? '/bank-register/write?type=deposit'
        : '/bank-register/write',
      identity: `register-write:${account}:${type}:${fromMemorized}`,
      props: { account, type, fromMemorized },
    };
  }

  if (path === '/chart-of-accounts') {
    return {
      kind: 'coa',
      title: 'Chart of Accounts',
      path: '/chart-of-accounts',
      identity: 'coa',
      props: {},
    };
  }

  if (path === '/' || path === '') {
    return {
      kind: 'home',
      title: 'Home',
      path: '/',
      identity: 'home',
      props: {},
    };
  }

  if (path === '/dashboard') {
    return {
      kind: 'dashboard',
      title: 'Dashboard',
      path: '/dashboard',
      identity: 'dashboard',
      props: {},
    };
  }

  if (path === '/get-started') {
    return {
      kind: 'get-started',
      title: 'Get Started',
      path: '/get-started',
      identity: 'get-started',
      props: {},
    };
  }

  if (head === 'bank-feeds') {
    return {
      kind: 'bank-feeds',
      title: 'Bank Feeds',
      path: '/bank-feeds',
      identity: `bank-feeds:${JSON.stringify(cleanQuery)}`,
      props: {},
    };
  }

  if (head === 'reconcile') {
    return {
      kind: 'bank-reconcile-hub',
      title: 'Reconcile',
      path: '/reconcile',
      identity: 'bank-reconcile-hub',
      props: {},
    };
  }

  if (head === 'bank-reconcile' && a) {
    return {
      kind: 'bank-reconcile',
      title: 'Reconcile',
      path: `/bank-reconcile/${a}`,
      identity: `bank-reconcile:${a}`,
      props: { name: a },
    };
  }

  if (path === '/checks-to-print') {
    return {
      kind: 'checks-to-print',
      title: 'Checks to Print',
      path: '/checks-to-print',
      identity: 'checks-to-print',
      props: {},
    };
  }

  if (path === '/pay-run') {
    return {
      kind: 'pay-run',
      title: 'Pay Run',
      path: '/pay-run',
      identity: 'pay-run',
      props: {},
    };
  }

  if (path === '/import-lists') {
    return {
      kind: 'import-lists',
      title: 'Import',
      path: '/import-lists',
      identity: 'import-lists',
      props: {},
    };
  }

  if (path === '/import-wizard') {
    return {
      kind: 'import-wizard',
      title: 'Import Wizard',
      path: '/import-wizard',
      identity: 'import-wizard',
      props: {},
    };
  }

  if (path === '/settings') {
    const tab = cleanQuery.tab ?? '';
    return {
      kind: 'settings',
      title: 'Settings',
      path: '/settings',
      identity: tab ? `settings:${tab}` : 'settings',
      props: tab ? { tab } : {},
    };
  }

  if (path === '/pos') {
    return {
      kind: 'pos',
      title: 'Point of Sale',
      path: '/pos',
      identity: 'pos',
      props: {},
    };
  }

  if (head === 'print' && a && b) {
    return {
      kind: 'print',
      title: 'Print',
      path: `/print/${a}/${b}`,
      identity: `print:${a}:${b}`,
      props: { schemaName: a, name: b },
    };
  }

  if (head === 'report-print' && a) {
    return {
      kind: 'report-print',
      title: 'Print',
      path: `/report-print/${a}`,
      identity: `report-print:${a}`,
      props: { reportName: a },
    };
  }

  if (head === 'template-builder' && a) {
    return {
      kind: 'template-builder',
      title: 'Template Builder',
      path: `/template-builder/${a}`,
      identity: `template-builder:${a}`,
      props: { name: a },
    };
  }

  if (path === '/customize-form') {
    return {
      kind: 'customize-form',
      title: 'Customize Form',
      path: '/customize-form',
      identity: 'customize-form',
      props: {},
    };
  }

  return {
    kind: 'generic',
    title: path || 'Page',
    path: path || '/',
    identity: `generic:${path}`,
    props: {},
  };
}

export function draftFromRoute(route: RouteLocationRaw): PaneDraft {
  const { path, query } = normalizeRouteLocation(route);
  return parsePathToPaneDraft(path, query);
}

export function isMainOnlyPath(path: string): boolean {
  return path.startsWith('/print/') || path.startsWith('/report-print/');
}

function persistPanes() {
  storageSet(
    PANE_STORAGE_KEY,
    JSON.stringify({
      panes: childPanes.value,
      focused: focusedPaneId.value,
    })
  );
}

export function restoreDeskPanes() {
  const raw = storageGet(PANE_STORAGE_KEY);
  if (!raw) {
    return;
  }
  try {
    const parsed = JSON.parse(raw) as {
      panes?: DeskPane[];
      focused?: string;
    };
    const panes = Array.isArray(parsed.panes) ? parsed.panes : [];
    childPanes.value = panes.slice(0, MAX_CHILD_PANES).filter((p) => p?.id);
    for (const p of childPanes.value) {
      useSeq = Math.max(useSeq, p.lastUsedAt ?? 0);
    }
    const focused = parsed.focused;
    if (
      focused === MAIN_PANE_ID ||
      childPanes.value.some((p) => p.id === focused)
    ) {
      focusedPaneId.value = focused ?? MAIN_PANE_ID;
    } else {
      focusedPaneId.value = MAIN_PANE_ID;
    }
  } catch {
    childPanes.value = [];
    focusedPaneId.value = MAIN_PANE_ID;
  }
}

export function clearDeskPanes() {
  childPanes.value = [];
  focusedPaneId.value = MAIN_PANE_ID;
  storageRemove(PANE_STORAGE_KEY);
}

export function focusPane(id: string) {
  if (id !== MAIN_PANE_ID && !childPanes.value.some((p) => p.id === id)) {
    return;
  }
  focusedPaneId.value = id;
  if (id !== MAIN_PANE_ID) {
    childPanes.value = childPanes.value.map((p) =>
      p.id === id ? { ...p, lastUsedAt: nextUseStamp() } : p
    );
  }
  persistPanes();
}

export function closePane(id: string) {
  const idx = childPanes.value.findIndex((p) => p.id === id);
  if (idx === -1) {
    return;
  }
  childPanes.value = childPanes.value.filter((p) => p.id !== id);
  if (focusedPaneId.value === id) {
    const next = childPanes.value[Math.max(0, idx - 1)];
    focusedPaneId.value = next?.id ?? MAIN_PANE_ID;
  }
  persistPanes();
}

export function updatePaneFromDraft(id: string, draft: PaneDraft) {
  const idx = childPanes.value.findIndex((p) => p.id === id);
  if (idx === -1) {
    return;
  }
  const prev = childPanes.value[idx];
  const next: DeskPane = {
    ...prev,
    kind: draft.kind,
    title: draft.title,
    path: draft.path,
    identity: draft.identity,
    props: { ...draft.props, instanceKey: prev.id, paneId: prev.id },
    lastUsedAt: nextUseStamp(),
  };
  childPanes.value = childPanes.value.map((p, i) => (i === idx ? next : p));
  persistPanes();
}

export function updatePaneProps(
  id: string,
  props: Record<string, unknown>,
  title?: string
) {
  const idx = childPanes.value.findIndex((p) => p.id === id);
  if (idx === -1) {
    return;
  }
  const prev = childPanes.value[idx];
  const nextProps = { ...prev.props, ...props };
  let identity = prev.identity;
  if (prev.kind === 'report') {
    const className = String(nextProps.reportClassName ?? '');
    const filters = String(nextProps.defaultFilters ?? '{}');
    const memorized = String(nextProps.memorizedName ?? '');
    identity = `report:${className}:${filters}:${memorized}`;
  }
  const next: DeskPane = {
    ...prev,
    props: nextProps,
    identity,
    title: title ?? prev.title,
  };
  childPanes.value = childPanes.value.map((p, i) => (i === idx ? next : p));
  persistPanes();
}

function draftToPane(draft: PaneDraft): DeskPane {
  const id = newPaneId();
  return {
    id,
    kind: draft.kind,
    title: draft.title,
    path: draft.path,
    identity: draft.identity,
    props: { ...draft.props, instanceKey: id, paneId: id },
    lastUsedAt: nextUseStamp(),
  };
}

/**
 * Open a route in a side pane. Returns the focused pane id.
 * Same-doc / same-list identities focus the existing pane (or main).
 * Reports with the same filters focus an existing side pane; different
 * filters create a new pane (up to MAX_CHILD_PANES).
 */
export function openInSidePane(route: RouteLocationRaw): string {
  const draft = draftFromRoute(route);
  const existing = childPanes.value.find((p) => p.identity === draft.identity);
  if (existing) {
    focusPane(existing.id);
    return existing.id;
  }

  if (childPanes.value.length >= MAX_CHILD_PANES) {
    const lru = childPanes.value.reduce((a, b) =>
      (b.lastUsedAt ?? 0) < (a.lastUsedAt ?? 0) ? b : a
    );
    updatePaneFromDraft(lru.id, draft);
    focusPane(lru.id);
    return lru.id;
  }

  const pane = draftToPane(draft);
  childPanes.value = [...childPanes.value, pane];
  focusPane(pane.id);
  persistPanes();
  return pane.id;
}

export function shouldFocusMainForDoc(
  draft: PaneDraft,
  mainIdentity: string | null
): boolean {
  return (
    draft.kind === 'form' && !!mainIdentity && draft.identity === mainIdentity
  );
}

export function resetDeskPanesForTests() {
  childPanes.value = [];
  focusedPaneId.value = MAIN_PANE_ID;
  childPaneWidthPx.value = PANE_DEFAULT_PX;
  storageRemove(PANE_STORAGE_KEY);
  storageRemove(PANE_WIDTH_STORAGE_KEY);
}
