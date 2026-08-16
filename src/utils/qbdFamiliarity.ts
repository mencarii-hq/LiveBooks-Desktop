import { t } from 'fyo/utils/translation';
import type { Fyo } from 'fyo';
import { Verb } from 'fyo/telemetry/types';
import { routeFilters } from 'src/utils/filters';
import type { QueryFilter } from 'utils/db/types';

/** Same screen; query selects Write Checks vs Record Deposits. */
export const WRITE_CHECKS_PATH = '/bank-register/write';
export const MAKE_DEPOSITS_PATH = '/bank-register/write?type=deposit';
export const USE_REGISTER_PATH = '/bank-register';
export const CHECK_REGISTER_PATH = '/bank-register';
export const RECONCILE_PATH = '/reconcile';
export const BANK_FEEDS_PATH = '/bank-feeds';
export const CHART_OF_ACCOUNTS_PATH = '/chart-of-accounts';
export const REPORTS_PATH = '/report/GeneralLedger';
export const HOME_PATH = '/';
export const DASHBOARD_PATH = '/dashboard';
export const PRINT_CHECKS_PATH = '/checks-to-print';

export type DesktopTheme = 'classic' | 'modern';

export const QBD_TOP_LEVEL_NAMES = [
  'get-started',
  'home',
  'company',
  'customers',
  'vendors',
  'employees',
  'banking',
  'reports',
] as const;

export const MODERN_TOP_LEVEL_NAMES = [
  'get-started',
  'dashboard',
  'banking',
  'payroll',
  'sales',
  'purchases',
  'common-entries',
  'reports',
] as const;

export const QBD_BANKING_ITEM_NAMES = [
  'write-checks',
  'use-register',
  'make-deposits',
  'bank-reconcile-hub',
  'bank-live-feeds',
] as const;

export const MODERN_BANKING_ITEM_NAMES = [
  'write-entry',
  'bank-live-feeds',
  'bank-register',
  'bank-reconcile-hub',
] as const;

export const QBD_COMPANY_CORE_ITEM_NAMES = [
  'chart-of-accounts',
  'memorized-transactions',
] as const;

export type HomeMapNodeId =
  | 'receive-inventory'
  | 'pay-bills'
  | 'enter-bills'
  | 'manage-sales-tax'
  | 'estimates'
  | 'create-invoices'
  | 'receive-payments'
  | 'pay-employees'
  | 'payroll-center'
  | 'chart-of-accounts'
  | 'inventory-activities'
  | 'items-services'
  | 'record-deposits'
  | 'reconcile'
  | 'write-checks'
  | 'check-register'
  | 'print-checks';

export type HomeMapPanelId =
  | 'vendors'
  | 'customers'
  | 'employees'
  | 'banking'
  | 'company';

export type HomeMapLaneKind = 'flow' | 'grid';

export interface HomeMapNode {
  id: HomeMapNodeId;
  label: string;
  /** Feather icon name. */
  icon: string;
  path: string;
  filters?: QueryFilter;
  disabled?: boolean;
}

export interface HomeMapEdge {
  from: HomeMapNodeId;
  to: HomeMapNodeId;
  /** Extra sources that share this edge; fork joins just after the sources. */
  joinFrom?: HomeMapNodeId[];
}

export interface HomeMapLane {
  id: HomeMapPanelId;
  title: string;
  kind: HomeMapLaneKind;
  /** Row-major slots; `null` is an empty cell used for alignment. */
  rows: (HomeMapNodeId | null)[][];
  /** Nodes parked on the far right of a swimlane (no arrows). */
  isolated: HomeMapNodeId[];
  /** Extra icon grid under the flow row (Banking tools). */
  stackGrid?: HomeMapNodeId[];
}

export interface HomeMap {
  nodes: HomeMapNode[];
  lanes: HomeMapLane[];
  edges: HomeMapEdge[];
}

function node(
  id: HomeMapNodeId,
  label: string,
  icon: string,
  path: string,
  filters?: QueryFilter
): HomeMapNode {
  return { id, label, icon, path, filters };
}

export function isHomeMapNodeLive(node: HomeMapNode): boolean {
  return Boolean(node.path) && node.disabled !== true;
}

export function isDepositWriteQuery(
  query: Record<string, unknown> | undefined | null
): boolean {
  return String(query?.type ?? '') === 'deposit';
}

export function getDesktopTheme(
  settings?: { desktopTheme?: string | null } | null
): DesktopTheme {
  return settings?.desktopTheme === 'modern' ? 'modern' : 'classic';
}

export function isClassicTheme(
  settings?: { desktopTheme?: string | null } | null
): boolean {
  return getDesktopTheme(settings) === 'classic';
}

export function isModernTheme(
  settings?: { desktopTheme?: string | null } | null
): boolean {
  return getDesktopTheme(settings) === 'modern';
}

export function getDeskLandingPath(
  settings?: {
    desktopTheme?: string | null;
    hideHomeWorkflowMap?: boolean | null;
  } | null
): string {
  if (getDesktopTheme(settings) === 'modern' || settings?.hideHomeWorkflowMap) {
    return DASHBOARD_PATH;
  }
  return HOME_PATH;
}

export function writeScreenTitle(
  isDeposit: boolean,
  theme: DesktopTheme = 'classic'
): string {
  if (theme === 'modern') {
    return 'Write Entry';
  }
  return isDeposit ? 'Record Deposits' : 'Write Checks';
}

/**
 * QBD Home process map: swimlanes + flowchart edges + Company/Banking grids.
 * Only real LiveBooks screens. Home-map node and page title stay
 * Record Deposits; the Banking menu item is Make Deposits (real QBD uses both).
 */
export function getHomeMap(): HomeMap {
  const nodes: HomeMapNode[] = [
    node(
      'receive-inventory',
      t`Receive Inventory`,
      'truck',
      `/list/PurchaseReceipt/${t`Receive Inventory`}`
    ),
    node(
      'enter-bills',
      t`Enter Bills`,
      'file',
      `/list/PurchaseInvoice/${t`Enter Bills`}`
    ),
    node(
      'pay-bills',
      t`Pay Bills`,
      'dollar-sign',
      `/list/Payment/${t`Pay Bills`}`,
      routeFilters.PurchasePayments
    ),
    node(
      'manage-sales-tax',
      t`Manage Sales Tax`,
      'percent',
      `/list/Tax/${t`Manage Sales Tax`}`
    ),
    node(
      'estimates',
      t`Estimates`,
      'clipboard',
      `/list/SalesQuote/${t`Estimates`}`
    ),
    node(
      'create-invoices',
      t`Create Invoices`,
      'file-text',
      `/list/SalesInvoice/${t`Create Invoices`}`
    ),
    node(
      'receive-payments',
      t`Receive Payments`,
      'dollar-sign',
      `/list/Payment/${t`Receive Payments`}`,
      routeFilters.SalesPayments
    ),
    node('pay-employees', t`Pay Employees`, 'briefcase', '/pay-run'),
    node(
      'payroll-center',
      t`Employees`,
      'users',
      `/list/Party/${t`Employees`}`,
      routeFilters.Employees
    ),
    node(
      'chart-of-accounts',
      t`Chart of Accounts`,
      'book-open',
      CHART_OF_ACCOUNTS_PATH
    ),
    node(
      'inventory-activities',
      t`Inventory Activities`,
      'package',
      `/list/StockMovement/${t`Inventory Activities`}`
    ),
    node(
      'items-services',
      t`Items & Services`,
      'tag',
      `/list/Item/${t`Items`}`
    ),
    node('record-deposits', t`Record Deposits`, 'download', MAKE_DEPOSITS_PATH),
    node('reconcile', t`Reconcile`, 'check-square', RECONCILE_PATH),
    node('write-checks', t`Write Checks`, 'edit-2', WRITE_CHECKS_PATH),
    node('check-register', t`Check Register`, 'list', CHECK_REGISTER_PATH),
    node('print-checks', t`Print Checks`, 'printer', PRINT_CHECKS_PATH),
  ];

  const lanes: HomeMapLane[] = [
    {
      id: 'vendors',
      title: t`Vendors`,
      kind: 'flow',
      rows: [['receive-inventory', 'enter-bills', 'pay-bills']],
      isolated: ['manage-sales-tax'],
    },
    {
      id: 'customers',
      title: t`Customers`,
      kind: 'flow',
      rows: [['estimates', 'create-invoices', 'receive-payments']],
      isolated: [],
    },
    {
      id: 'employees',
      title: t`Payroll Center`,
      kind: 'flow',
      rows: [['payroll-center', 'pay-employees']],
      isolated: [],
    },
    {
      id: 'company',
      title: t`Company`,
      kind: 'grid',
      rows: [
        ['chart-of-accounts', 'inventory-activities'],
        ['items-services', null],
      ],
      isolated: [],
    },
    {
      id: 'banking',
      title: t`Banking`,
      kind: 'grid',
      rows: [
        ['record-deposits', 'reconcile'],
        ['write-checks', 'check-register'],
        ['print-checks', null],
      ],
      isolated: [],
    },
  ];

  const edges: HomeMapEdge[] = [
    { from: 'receive-inventory', to: 'enter-bills' },
    { from: 'enter-bills', to: 'pay-bills' },
    { from: 'estimates', to: 'create-invoices' },
    { from: 'create-invoices', to: 'receive-payments' },
    { from: 'receive-payments', to: 'record-deposits' },
  ];

  return { nodes, lanes, edges };
}

/** Lane list for the Home canvas (same order as `getHomeMap().lanes`). */
export function getHomeMapPanels(): HomeMapLane[] {
  return getHomeMap().lanes;
}

export function logHomeMapNodeClick(fyo: Fyo, nodeId: string): void {
  fyo.telemetry.log(Verb.Opened, 'home-map-node', { node: nodeId });
  const prev = fyo.config.get('homeMapNodeClicks') ?? {};
  fyo.config.set('homeMapNodeClicks', {
    ...prev,
    [nodeId]: (prev[nodeId] ?? 0) + 1,
  });
}

export function logHomeMapOptOut(fyo: Fyo, optedOut: boolean): void {
  fyo.telemetry.log(Verb.Completed, 'home-map-opt-out', { optedOut });
  fyo.config.set('homeMapOptOut', optedOut);
}

export function shouldShowQbdRenameNotice(
  fyo: Fyo,
  settings?: { desktopTheme?: string | null } | null
): boolean {
  if (getDesktopTheme(settings) !== 'classic') {
    return false;
  }
  return !fyo.config.get('qbdRenameNoticeDismissed');
}

export function dismissQbdRenameNotice(fyo: Fyo): void {
  fyo.config.set('qbdRenameNoticeDismissed', true);
}

/**
 * Persist the company-scoped desktop theme. Modern always lands on the
 * Dashboard. Classic keeps any existing Home-map opt-out.
 * Telemetry is logged by SystemSettings.afterSync.
 */
export async function persistDesktopTheme(
  fyo: Fyo,
  theme: DesktopTheme
): Promise<void> {
  const settings = await fyo.doc.getDoc('SystemSettings');
  await settings.setAndSync(
    theme === 'modern'
      ? { desktopTheme: theme, hideHomeWorkflowMap: true }
      : { desktopTheme: theme }
  );
}
