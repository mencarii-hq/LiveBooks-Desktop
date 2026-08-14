<template>
  <component
    :is="pageComponent"
    v-if="pageComponent"
    :key="viewKey"
    class="flex-1 min-h-0 min-w-0 h-full overflow-hidden"
    :dark-mode="darkMode"
    v-bind="pane.props"
  />
  <div
    v-else
    class="
      flex-1 flex
      items-center
      justify-center
      text-sm text-gray-500
      dark:text-gray-400
      p-4
    "
  >
    {{ t`This page cannot open in a side pane.` }}
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Component } from 'vue';
import { t } from 'fyo';
import type { DeskPane, PaneKind } from 'src/utils/deskPanes';
import Report from 'src/pages/Report.vue';
import ListView from 'src/pages/ListView/ListView.vue';
import CommonForm from 'src/pages/CommonForm/CommonForm.vue';
import BankRegister from 'src/pages/BankRegister.vue';
import BankRegisterWrite from 'src/pages/BankRegisterWrite.vue';
import ChartOfAccounts from 'src/pages/ChartOfAccounts.vue';
import Dashboard from 'src/pages/Dashboard/Dashboard.vue';
import GetStarted from 'src/pages/GetStarted.vue';
import BankFeedHub from 'src/pages/BankFeedHub.vue';
import BankReconcile from 'src/pages/BankReconcile.vue';
import BankReconcileHub from 'src/pages/BankReconcileHub.vue';
import ChecksToPrint from 'src/pages/ChecksToPrint.vue';
import PayRun from 'src/pages/PayRun.vue';
import ImportListsHub from 'src/pages/ImportListsHub.vue';
import ImportWizard from 'src/pages/ImportWizard.vue';
import Settings from 'src/pages/Settings/Settings.vue';
import POS from 'src/pages/POS/POS.vue';
import PrintView from 'src/pages/PrintView/PrintView.vue';
import ReportPrintView from 'src/pages/PrintView/ReportPrintView.vue';
import TemplateBuilder from 'src/pages/TemplateBuilder/TemplateBuilder.vue';
import CustomizeForm from 'src/pages/CustomizeForm/CustomizeForm.vue';

const props = defineProps<{
  pane: DeskPane;
  darkMode: boolean;
}>();

const kindMap: Record<PaneKind, Component | null> = {
  report: Report,
  list: ListView,
  form: CommonForm,
  register: BankRegister,
  'register-write': BankRegisterWrite,
  coa: ChartOfAccounts,
  dashboard: Dashboard,
  'get-started': GetStarted,
  'bank-feeds': BankFeedHub,
  'bank-reconcile': BankReconcile,
  'bank-reconcile-hub': BankReconcileHub,
  'checks-to-print': ChecksToPrint,
  'pay-run': PayRun,
  'import-lists': ImportListsHub,
  'import-wizard': ImportWizard,
  settings: Settings,
  pos: POS,
  print: PrintView,
  'report-print': ReportPrintView,
  'template-builder': TemplateBuilder,
  'customize-form': CustomizeForm,
  generic: null,
};

const pageComponent = computed(() => kindMap[props.pane.kind] ?? null);

// Report identity includes its filters, and filter edits update the pane
// props (for persistence) — keying on identity would remount the report on
// every filter change (double fetch, focus loss). Key reports on the pane +
// report class instead; Report handles filter changes internally.
const viewKey = computed(() => {
  if (props.pane.kind === 'report') {
    const className = String(props.pane.props.reportClassName ?? '');
    const memorized = String(props.pane.props.memorizedName ?? '');
    return `${props.pane.id}:report:${className}:${memorized}`;
  }
  return `${props.pane.id}:${props.pane.identity}`;
});
</script>
