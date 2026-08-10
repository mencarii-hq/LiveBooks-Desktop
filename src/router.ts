import ChartOfAccounts from 'src/pages/ChartOfAccounts.vue';
import CommonForm from 'src/pages/CommonForm/CommonForm.vue';
import Dashboard from 'src/pages/Dashboard/Dashboard.vue';
import GetStarted from 'src/pages/GetStarted.vue';
import BankFeedHub from 'src/pages/BankFeedHub.vue';
import BankReconcile from 'src/pages/BankReconcile.vue';
import BankReconcileHub from 'src/pages/BankReconcileHub.vue';
import BankRegister from 'src/pages/BankRegister.vue';
import BankRegisterWrite from 'src/pages/BankRegisterWrite.vue';
import ChecksToPrint from 'src/pages/ChecksToPrint.vue';
import PayRun from 'src/pages/PayRun.vue';
import ImportListsHub from 'src/pages/ImportListsHub.vue';
import ImportWizard from 'src/pages/ImportWizard.vue';
import ListView from 'src/pages/ListView/ListView.vue';
import PrintView from 'src/pages/PrintView/PrintView.vue';
import ReportPrintView from 'src/pages/PrintView/ReportPrintView.vue';
import QuickEditForm from 'src/pages/QuickEditForm.vue';
import Report from 'src/pages/Report.vue';
import Settings from 'src/pages/Settings/Settings.vue';
import TemplateBuilder from 'src/pages/TemplateBuilder/TemplateBuilder.vue';
import CustomizeForm from 'src/pages/CustomizeForm/CustomizeForm.vue';
import POS from 'src/pages/POS/POS.vue';
import type { HistoryState } from 'vue-router';
import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import { historyState } from './utils/refs';
import { routeFilters } from './utils/filters';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: Dashboard,
  },
  {
    path: '/get-started',
    component: GetStarted,
  },
  {
    path: `/edit/:schemaName/:name`,
    name: `CommonForm`,
    components: {
      default: CommonForm,
      edit: QuickEditForm,
    },
    props: {
      default: (route) => ({
        schemaName: route.params.schemaName,
        name: route.params.name,
      }),
      edit: (route) => route.query,
    },
  },
  {
    path: '/list/:schemaName/:pageTitle?',
    name: 'ListView',
    components: {
      default: ListView,
      edit: QuickEditForm,
    },
    props: {
      default: (route) => {
        const { schemaName } = route.params;
        const pageTitle = route.params.pageTitle ?? '';

        const filters = {};
        const filterString = route.query.filters;
        if (typeof filterString === 'string') {
          Object.assign(filters, JSON.parse(filterString));
        } else if (schemaName === 'Party') {
          // Bare /list/Party* without ?filters= must not show Employee/Contractor
          // in customer/supplier lists.
          const title = String(pageTitle);
          if (title === 'Customers') {
            Object.assign(filters, routeFilters.Customers);
          } else if (title === 'Suppliers') {
            Object.assign(filters, routeFilters.Suppliers);
          } else if (title === 'Employees') {
            Object.assign(filters, routeFilters.Employees);
          } else {
            Object.assign(filters, routeFilters.Party);
          }
        }

        return {
          schemaName,
          filters,
          pageTitle,
        };
      },
      edit: (route) => route.query,
    },
  },
  {
    path: '/print/:schemaName/:name',
    name: 'PrintView',
    component: PrintView,
    props: true,
  },
  {
    path: '/report-print/:reportName',
    name: 'ReportPrintView',
    component: ReportPrintView,
    props: true,
  },
  {
    path: '/report/:reportClassName',
    name: 'Report',
    component: Report,
    props: true,
  },
  {
    path: '/chart-of-accounts',
    name: 'Chart Of Accounts',
    components: {
      default: ChartOfAccounts,
      edit: QuickEditForm,
    },
    props: {
      default: true,
      edit: (route) => route.query,
    },
  },
  {
    path: '/import-lists',
    name: 'Import Lists',
    component: ImportListsHub,
  },
  {
    path: '/import-wizard',
    name: 'Import Wizard',
    component: ImportWizard,
  },
  {
    path: '/bank-feeds',
    name: 'Bank feeds',
    component: BankFeedHub,
  },
  {
    path: '/bank-feeds/settings',
    redirect: (to) => {
      const tab = to.query?.tab;
      const q: Record<string, string> = {};
      if (tab === 'online' || tab === 'manual') {
        q.tab = tab;
      } else {
        q.tab = 'manual';
      }
      for (const [k, v] of Object.entries(to.query ?? {})) {
        if (k === 'tab') continue;
        if (typeof v === 'string') q[k] = v;
      }
      return { path: '/bank-feeds', query: q };
    },
  },
  {
    path: '/bank-feeds/activity/:accountName',
    redirect: (to) => {
      const raw = String(to.params.accountName ?? '');
      let account = raw;
      try {
        account = decodeURIComponent(raw);
      } catch {
        /* keep raw */
      }
      const q = { ...(to.query ?? {}) } as Record<string, unknown>;
      const legacyTab = q.tab;
      const legacyReview = q.reviewTab;
      const reviewTab =
        legacyTab === 'reviewed' ||
        legacyTab === 'excluded' ||
        legacyTab === 'review'
          ? legacyTab
          : legacyReview === 'reviewed' ||
            legacyReview === 'excluded' ||
            legacyReview === 'review'
          ? legacyReview
          : 'review';
      // Old activity used ?tab= for review status; hub uses ?tab= for Manual|Online.
      if (q.tab === 'review' || q.tab === 'reviewed' || q.tab === 'excluded') {
        delete q.tab;
      }
      return {
        path: '/bank-feeds',
        query: {
          ...q,
          account: encodeURIComponent(account),
          reviewTab,
        },
      };
    },
  },
  {
    path: '/bank-register',
    name: 'Check Register',
    component: BankRegister,
  },
  {
    path: '/bank-register/write',
    name: 'Write Entry',
    component: BankRegisterWrite,
  },
  {
    path: '/checks-to-print',
    name: 'Checks to Print',
    component: ChecksToPrint,
  },
  {
    path: '/pay-run',
    name: 'Pay Run',
    component: PayRun,
  },
  {
    path: '/reconcile',
    name: 'Reconcile Hub',
    component: BankReconcileHub,
  },
  {
    path: '/bank-statement-import',
    redirect: { path: '/bank-feeds', query: { tab: 'manual' } },
  },
  {
    path: '/bank-reconcile/:name',
    name: 'Bank Reconcile',
    component: BankReconcile,
    props: true,
  },
  {
    path: '/template-builder/:name',
    name: 'Template Builder',
    component: TemplateBuilder,
    props: true,
  },
  {
    path: '/customize-form',
    name: 'Customize Form',
    component: CustomizeForm,
  },
  {
    path: '/settings',
    name: 'Settings',
    components: {
      default: Settings,
      edit: QuickEditForm,
    },
    props: {
      default: true,
      edit: (route) => route.query,
    },
  },
  {
    path: '/pos',
    name: 'Point of Sale',
    components: {
      default: POS,
      edit: QuickEditForm,
    },
    props: {
      default: true,
      edit: (route) => route.query,
    },
  },
];

// Snapshot before the router's initial `/` (or index.html) navigation can
// overwrite localStorage — otherwise refresh always loses the real last page.
let savedLastRoute: string | null = (() => {
  const route = localStorage.getItem('lastRoute');
  if (!route || route.includes('index.html')) {
    return null;
  }
  return route;
})();

// Until desk restores, ignore the boot navigation to `/` so it cannot clobber
// the snapshot. Non-root navigations still persist (avoids HMR/gated misses).
let deskRouteReady = false;

/** Route captured at module load, before boot navigation clobbers it. */
export function getSavedLastRoute(): string | null {
  return savedLastRoute;
}

/** Call once desk is ready to restore so `/` (Dashboard) may be persisted. */
export function enableRoutePersistence(): void {
  deskRouteReady = true;
}

/** Drop the boot snapshot (e.g. when switching company). */
export function clearSavedLastRoute(): void {
  savedLastRoute = null;
  deskRouteReady = false;
}

function persistRoute(fullPath: string): void {
  if (fullPath.includes('index.html')) {
    return;
  }
  // Boot lands on `/` before setDeskRoute; don't wipe a deeper lastRoute.
  if (!deskRouteReady && (fullPath === '/' || fullPath === '')) {
    return;
  }

  localStorage.setItem('lastRoute', fullPath);
  savedLastRoute = fullPath;
}

const router = createRouter({ routes, history: createWebHistory() });

router.afterEach(({ fullPath }) => {
  const state = history.state as HistoryState;
  historyState.forward = !!state.forward;
  historyState.back = !!state.back;

  persistRoute(fullPath);
});

export default router;
