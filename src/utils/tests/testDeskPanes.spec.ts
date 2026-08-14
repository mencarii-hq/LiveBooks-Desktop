import test from 'tape';
import {
  MAX_CHILD_PANES,
  MAIN_PANE_ID,
  childPanes,
  closePane,
  draftFromRoute,
  focusedPaneId,
  openInSidePane,
  parsePathToPaneDraft,
  resetDeskPanesForTests,
  shouldFocusMainForDoc,
  updatePaneProps,
} from '../deskPanes';

test('parsePathToPaneDraft: report identity includes filters', (t) => {
  const a = parsePathToPaneDraft('/report/ProfitAndLoss', {
    defaultFilters: '{"toYear":2024}',
  });
  const b = parsePathToPaneDraft('/report/ProfitAndLoss', {
    defaultFilters: '{"toYear":2025}',
  });
  t.equal(a.kind, 'report');
  t.equal(a.props.reportClassName, 'ProfitAndLoss');
  t.equal(a.props.useRoute, false);
  t.notEqual(a.identity, b.identity);
  t.end();
});

test('parsePathToPaneDraft: form and list identities', (t) => {
  const form = parsePathToPaneDraft('/edit/SalesInvoice/INV-1');
  t.equal(form.kind, 'form');
  t.equal(form.identity, 'form:SalesInvoice:INV-1');
  t.equal(form.props.schemaName, 'SalesInvoice');
  t.equal(form.props.name, 'INV-1');

  const list = parsePathToPaneDraft('/list/Party/Customers', {
    filters: '{"role":"Customer"}',
  });
  t.equal(list.kind, 'list');
  t.equal(list.props.pageTitle, 'Customers');
  t.end();
});

test('parsePathToPaneDraft: settings identity includes tab', (t) => {
  const general = parsePathToPaneDraft('/settings');
  const print = parsePathToPaneDraft('/settings', { tab: 'PrintSettings' });
  t.equal(general.kind, 'settings');
  t.equal(general.identity, 'settings');
  t.equal(print.identity, 'settings:PrintSettings');
  t.equal(print.props.tab, 'PrintSettings');
  t.notEqual(general.identity, print.identity);
  t.end();
});

test('parsePathToPaneDraft: strips quick-edit query', (t) => {
  const draft = parsePathToPaneDraft('/list/SalesInvoice', {
    edit: '1',
    name: 'INV-1',
    schemaName: 'SalesInvoice',
    filters: '{"cancelled":false}',
  });
  t.equal(draft.kind, 'list');
  t.equal(draft.props.schemaName, 'SalesInvoice');
  t.ok(String(draft.identity).includes('cancelled'));
  t.notOk(String(draft.identity).includes('INV-1'));
  t.end();
});

test('draftFromRoute: string and path object', (t) => {
  const fromString = draftFromRoute('/bank-register');
  t.equal(fromString.kind, 'register');
  const fromObj = draftFromRoute({
    path: '/report/BalanceSheet',
    query: { memorizedName: 'Year end' },
  });
  t.equal(fromObj.kind, 'report');
  t.equal(fromObj.props.memorizedName, 'Year end');
  t.end();
});

test('openInSidePane: same identity focuses existing pane', (t) => {
  resetDeskPanesForTests();
  const first = openInSidePane('/edit/SalesInvoice/INV-1');
  const second = openInSidePane('/edit/SalesInvoice/INV-1');
  t.equal(first, second);
  t.equal(childPanes.value.length, 1);
  t.equal(focusedPaneId.value, first);
  resetDeskPanesForTests();
  t.end();
});

test('openInSidePane: two P&Ls with different filters stay independent', (t) => {
  resetDeskPanesForTests();
  const a = openInSidePane(
    '/report/ProfitAndLoss?defaultFilters=' +
      encodeURIComponent('{"toYear":2024}')
  );
  const b = openInSidePane(
    '/report/ProfitAndLoss?defaultFilters=' +
      encodeURIComponent('{"toYear":2025}')
  );
  t.notEqual(a, b);
  t.equal(childPanes.value.length, 2);
  t.equal(childPanes.value[0].props.reportClassName, 'ProfitAndLoss');
  t.equal(childPanes.value[1].props.reportClassName, 'ProfitAndLoss');
  t.notEqual(
    childPanes.value[0].props.defaultFilters,
    childPanes.value[1].props.defaultFilters
  );
  resetDeskPanesForTests();
  t.end();
});

test('openInSidePane: caps at MAX_CHILD_PANES by replacing oldest', (t) => {
  resetDeskPanesForTests();
  t.equal(MAX_CHILD_PANES, 2);
  openInSidePane('/list/SalesInvoice');
  openInSidePane('/list/PurchaseInvoice');
  const third = openInSidePane('/list/Payment');
  t.equal(childPanes.value.length, 2);
  t.equal(childPanes.value[0].id, third);
  t.equal(childPanes.value[0].props.schemaName, 'Payment');
  t.equal(childPanes.value[1].props.schemaName, 'PurchaseInvoice');
  resetDeskPanesForTests();
  t.end();
});

test('closePane returns focus to remaining pane or main', (t) => {
  resetDeskPanesForTests();
  const a = openInSidePane('/list/SalesInvoice');
  const b = openInSidePane('/list/Payment');
  t.equal(focusedPaneId.value, b);
  closePane(b);
  t.equal(focusedPaneId.value, a);
  closePane(a);
  t.equal(focusedPaneId.value, MAIN_PANE_ID);
  t.equal(childPanes.value.length, 0);
  resetDeskPanesForTests();
  t.end();
});

test('updatePaneProps rewrites report identity when filters change', (t) => {
  resetDeskPanesForTests();
  const id = openInSidePane('/report/ProfitAndLoss');
  const before = childPanes.value[0].identity;
  updatePaneProps(id, { defaultFilters: '{"toYear":2026}' });
  t.notEqual(childPanes.value[0].identity, before);
  t.ok(childPanes.value[0].identity.includes('2026'));
  resetDeskPanesForTests();
  t.end();
});

test('shouldFocusMainForDoc only for matching form identity', (t) => {
  const draft = parsePathToPaneDraft('/edit/SalesInvoice/INV-1');
  t.ok(shouldFocusMainForDoc(draft, 'form:SalesInvoice:INV-1'));
  t.notOk(shouldFocusMainForDoc(draft, 'form:SalesInvoice/INV-2'));
  const report = parsePathToPaneDraft('/report/ProfitAndLoss');
  t.notOk(shouldFocusMainForDoc(report, report.identity));
  t.end();
});
