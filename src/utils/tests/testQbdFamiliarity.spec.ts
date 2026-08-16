import test from 'tape';
import {
  DASHBOARD_PATH,
  HOME_PATH,
  MAKE_DEPOSITS_PATH,
  MODERN_BANKING_ITEM_NAMES,
  MODERN_TOP_LEVEL_NAMES,
  QBD_BANKING_ITEM_NAMES,
  QBD_COMPANY_CORE_ITEM_NAMES,
  QBD_TOP_LEVEL_NAMES,
  WRITE_CHECKS_PATH,
  getDeskLandingPath,
  getDesktopTheme,
  getHomeMap,
  isClassicTheme,
  isDepositWriteQuery,
  isHomeMapNodeLive,
  isModernTheme,
  logHomeMapNodeClick,
  logHomeMapOptOut,
  persistDesktopTheme,
  writeScreenTitle,
} from '../qbdFamiliarity';
import { parsePathToPaneDraft } from '../deskPanes';

test('QBD top-level names follow Company / Customers / Vendors / Employees / Banking / Reports', (t) => {
  t.deepEqual(
    [...QBD_TOP_LEVEL_NAMES],
    [
      'get-started',
      'home',
      'company',
      'customers',
      'vendors',
      'employees',
      'banking',
      'reports',
    ]
  );
  t.notOk(QBD_TOP_LEVEL_NAMES.includes('lists' as never));
  t.end();
});

test('Banking menu order matches QBD (no Transfer Funds — no existing screen)', (t) => {
  t.deepEqual(
    [...QBD_BANKING_ITEM_NAMES],
    [
      'write-checks',
      'use-register',
      'make-deposits',
      'bank-reconcile-hub',
      'bank-live-feeds',
    ]
  );
  t.end();
});

test('Company owns Chart of Accounts and Memorized Transactions', (t) => {
  t.deepEqual(
    [...QBD_COMPANY_CORE_ITEM_NAMES],
    ['chart-of-accounts', 'memorized-transactions']
  );
  t.end();
});

test('desktop theme helpers default existing companies to classic', (t) => {
  t.equal(getDesktopTheme(undefined), 'classic');
  t.equal(getDesktopTheme({}), 'classic');
  t.equal(getDesktopTheme({ desktopTheme: null }), 'classic');
  t.equal(getDesktopTheme({ desktopTheme: 'classic' }), 'classic');
  t.equal(getDesktopTheme({ desktopTheme: 'modern' }), 'modern');
  t.ok(isClassicTheme(undefined));
  t.ok(isClassicTheme({ desktopTheme: 'classic' }));
  t.notOk(isModernTheme(undefined));
  t.ok(isModernTheme({ desktopTheme: 'modern' }));
  t.equal(getDeskLandingPath({ desktopTheme: 'classic' }), HOME_PATH);
  t.equal(getDeskLandingPath({ desktopTheme: 'modern' }), DASHBOARD_PATH);
  t.equal(getDeskLandingPath({ hideHomeWorkflowMap: true }), DASHBOARD_PATH);
  t.equal(getDeskLandingPath({}), HOME_PATH);
  t.end();
});

test('write titles: classic Write Checks vs modern Write Entry', (t) => {
  t.equal(writeScreenTitle(false), 'Write Checks');
  t.equal(writeScreenTitle(true), 'Record Deposits');
  t.equal(writeScreenTitle(false, 'classic'), 'Write Checks');
  t.equal(writeScreenTitle(true, 'classic'), 'Record Deposits');
  t.equal(writeScreenTitle(false, 'modern'), 'Write Entry');
  t.equal(writeScreenTitle(true, 'modern'), 'Write Entry');
  t.equal(isDepositWriteQuery({ type: 'deposit' }), true);
  t.equal(isDepositWriteQuery({}), false);
  t.end();
});

test('classic vs modern sidebar labels and groups', (t) => {
  t.deepEqual(
    [...QBD_TOP_LEVEL_NAMES],
    [
      'get-started',
      'home',
      'company',
      'customers',
      'vendors',
      'employees',
      'banking',
      'reports',
    ]
  );
  t.deepEqual(
    [...MODERN_TOP_LEVEL_NAMES],
    [
      'get-started',
      'dashboard',
      'banking',
      'payroll',
      'sales',
      'purchases',
      'common-entries',
      'reports',
    ]
  );
  t.ok(QBD_TOP_LEVEL_NAMES.includes('home'));
  t.ok(QBD_TOP_LEVEL_NAMES.includes('customers'));
  t.ok(QBD_TOP_LEVEL_NAMES.includes('vendors'));
  t.notOk((MODERN_TOP_LEVEL_NAMES as readonly string[]).includes('home'));
  t.ok(MODERN_TOP_LEVEL_NAMES.includes('dashboard'));
  t.ok(MODERN_TOP_LEVEL_NAMES.includes('sales'));
  t.ok(MODERN_TOP_LEVEL_NAMES.includes('purchases'));
  t.ok(MODERN_TOP_LEVEL_NAMES.includes('common-entries'));
  t.ok(QBD_BANKING_ITEM_NAMES.includes('write-checks'));
  t.ok(MODERN_BANKING_ITEM_NAMES.includes('write-entry'));
  t.notOk(
    (MODERN_BANKING_ITEM_NAMES as readonly string[]).includes('write-checks')
  );
  t.end();
});

test('home map uses Record Deposits; same route as Make Deposits', (t) => {
  const map = getHomeMap();
  t.deepEqual(
    map.lanes.map((p) => p.id),
    ['vendors', 'customers', 'employees', 'company', 'banking']
  );
  const nodes = map.nodes;
  const record = nodes.find((n) => n.id === 'record-deposits');
  t.ok(record);
  t.equal(record?.label, 'Record Deposits');
  t.equal(record?.path, MAKE_DEPOSITS_PATH);
  t.notOk(nodes.some((n) => n.label === 'Make Deposits'));
  t.ok(
    nodes.some((n) => n.id === 'write-checks' && n.path === WRITE_CHECKS_PATH)
  );
  t.ok(nodes.some((n) => n.label === 'Enter Bills'));
  t.ok(nodes.some((n) => n.label === 'Create Invoices'));
  t.ok(nodes.some((n) => n.label === 'Chart of Accounts'));
  t.notOk(nodes.some((n) => n.label === 'Reports'));
  const banking = map.lanes.find((l) => l.id === 'banking');
  const customers = map.lanes.find((l) => l.id === 'customers');
  t.ok(banking?.rows.flat().includes('record-deposits'));
  t.equal(banking?.kind, 'grid');
  t.deepEqual(banking?.rows, [
    ['record-deposits', 'reconcile'],
    ['write-checks', 'check-register'],
    ['print-checks', null],
  ]);
  t.notOk(banking?.stackGrid?.length);
  t.notOk(customers?.rows.flat().includes('record-deposits'));
  t.deepEqual(customers?.isolated, []);
  t.deepEqual(customers?.rows, [
    ['estimates', 'create-invoices', 'receive-payments'],
  ]);
  const company = map.lanes.find((l) => l.id === 'company');
  t.deepEqual(company?.rows, [
    ['chart-of-accounts', 'inventory-activities'],
    ['items-services', null],
  ]);
  const employees = map.lanes.find((l) => l.id === 'employees');
  t.deepEqual(employees?.rows[0], ['payroll-center', 'pay-employees']);
  t.deepEqual(employees?.isolated, []);
  t.ok(
    map.edges.some(
      (e) => e.from === 'receive-payments' && e.to === 'record-deposits'
    )
  );
  t.ok(
    map.edges.some(
      (e) => e.from === 'receive-inventory' && e.to === 'enter-bills'
    )
  );
  t.ok(map.edges.some((e) => e.from === 'enter-bills' && e.to === 'pay-bills'));
  t.ok(
    map.edges.some((e) => e.from === 'estimates' && e.to === 'create-invoices')
  );
  t.notOk(map.nodes.some((n) => n.label === 'Enter Time'));
  t.end();
});

test('home map only includes real LiveBooks screens', (t) => {
  const map = getHomeMap();
  t.ok(map.nodes.length > 0);
  for (const node of map.nodes) {
    t.ok(isHomeMapNodeLive(node), `${node.id} should be live`);
    t.ok(node.path, `${node.id} should have a path`);
  }
  const ids = map.nodes.map((n) => n.id);
  t.deepEqual([...ids].sort(), [
    'chart-of-accounts',
    'check-register',
    'create-invoices',
    'enter-bills',
    'estimates',
    'inventory-activities',
    'items-services',
    'manage-sales-tax',
    'pay-bills',
    'pay-employees',
    'payroll-center',
    'print-checks',
    'receive-inventory',
    'receive-payments',
    'reconcile',
    'record-deposits',
    'write-checks',
  ]);
  const byId = Object.fromEntries(map.nodes.map((n) => [n.id, n]));
  t.equal(byId['pay-employees']?.path, '/pay-run');
  t.equal(byId['payroll-center']?.path.includes('Party'), true);
  t.end();
});

test('desk pane titles agree with Write Checks / Record Deposits', (t) => {
  const check = parsePathToPaneDraft('/bank-register/write');
  t.equal(check.title, 'Write Checks');
  const deposit = parsePathToPaneDraft('/bank-register/write', {
    type: 'deposit',
  });
  t.equal(deposit.title, 'Record Deposits');
  t.notEqual(check.identity, deposit.identity);
  const home = parsePathToPaneDraft('/');
  t.equal(home.kind, 'home');
  t.equal(home.title, 'Home');
  const dash = parsePathToPaneDraft('/dashboard');
  t.equal(dash.kind, 'dashboard');
  t.end();
});

test('home-map instrumentation persists opt-out and node clicks', (t) => {
  const store = new Map<string, unknown>();
  const fyo = {
    telemetry: { log: () => undefined },
    config: {
      get: (key: string) => store.get(key),
      set: (key: string, value: unknown) => {
        store.set(key, value);
      },
    },
  };
  logHomeMapNodeClick(fyo as never, 'write-checks');
  logHomeMapNodeClick(fyo as never, 'write-checks');
  logHomeMapOptOut(fyo as never, true);
  t.deepEqual(store.get('homeMapNodeClicks'), { 'write-checks': 2 });
  t.equal(store.get('homeMapOptOut'), true);
  t.end();
});

test('theme toggle is reversible and not a one-way opt-out', async (t) => {
  const synced: Record<string, unknown>[] = [];
  let telemetryCalls = 0;
  const fyo = {
    telemetry: {
      log: () => {
        telemetryCalls += 1;
      },
    },
    doc: {
      getDoc: async () => ({
        setAndSync: async (value: Record<string, unknown>) => {
          synced.push(value);
        },
      }),
    },
  };
  await persistDesktopTheme(fyo as never, 'modern');
  await persistDesktopTheme(fyo as never, 'classic');
  await persistDesktopTheme(fyo as never, 'modern');
  t.deepEqual(synced, [
    { desktopTheme: 'modern', hideHomeWorkflowMap: true },
    { desktopTheme: 'classic', hideHomeWorkflowMap: false },
    { desktopTheme: 'modern', hideHomeWorkflowMap: true },
  ]);
  t.equal(telemetryCalls, 0);
  t.end();
});
