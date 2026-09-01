<template>
  <div class="flex flex-col w-full h-full" @contextmenu="onPageContextMenu">
    <PageHeader :title="title">
      <template #left>
        <span
          class="
            pill
            font-medium
            rounded-full
            select-none
            pointer-events-none
            self-center
          "
          :class="
            isMemorized
              ? 'bg-blue-200 text-blue-700 dark:bg-blue-800 dark:text-blue-200'
              : 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
          "
        >
          {{ isMemorized ? t`Memorized` : t`Default` }}
        </span>
        <span
          v-if="basisBadge"
          class="
            pill
            font-medium
            rounded-full
            select-none
            pointer-events-none
            self-center
            bg-gray-200
            text-gray-700
            dark:bg-gray-800 dark:text-gray-200
          "
        >
          {{ basisBadge }}
        </span>
      </template>
      <DropdownWithActions
        v-for="group of groupedActions"
        :key="group.label"
        :icon="false"
        :type="group.type"
        :actions="group.actions"
        class="text-xs"
      >
        {{ group.group }}
      </DropdownWithActions>
      <Button
        :icon="false"
        :title="t`Memorize this report`"
        class="text-xs"
        @click="memorizeReport"
      >
        {{ t`Memorize` }}
      </Button>
      <Button
        v-if="isMemorized"
        :icon="false"
        :title="t`Delete this memorized report`"
        class="text-xs"
        @click="deleteMemorized"
      >
        {{ t`Delete` }}
      </Button>
      <Button
        ref="printButton"
        :icon="true"
        :title="t`Open Report Print View`"
        @click="routeTo(printPath)"
      >
        <feather-icon name="printer" class="w-4 h-4"></feather-icon>
      </Button>
    </PageHeader>

    <!-- Filters -->
    <div
      v-if="report && report.filters.length"
      class="grid grid-cols-5 gap-4 p-4 border-b dark:border-gray-800"
    >
      <FormControl
        v-for="field in report.filters"
        :key="field.fieldname + '-filter'"
        :border="true"
        size="small"
        :class="[field.fieldtype === 'Check' ? 'self-end' : '']"
        :show-label="true"
        :df="field"
        :value="report.get(field.fieldname)"
        :read-only="loading"
        @change="async (value) => await onFilterChange(field.fieldname, value)"
      />
    </div>

    <div
      v-if="isCashBasis"
      class="
        px-4
        py-2
        text-xs text-gray-500
        dark:text-gray-400
        border-b
        dark:border-gray-800
      "
    >
      {{
        t`Cash basis: income and expenses count when money changes hands. General Ledger detail is shown on accrual basis.`
      }}
    </div>

    <!-- Report Body -->
    <ListReport v-if="report" :report="report" class="" />
  </div>
</template>
<script lang="ts">
import { t } from 'fyo';
import { DocValue } from 'fyo/core/types';
import { reports } from 'reports';
import { Report } from 'reports/Report';
import Button from 'src/components/Button.vue';
import FormControl from 'src/components/Controls/FormControl.vue';
import DropdownWithActions from 'src/components/DropdownWithActions.vue';
import PageHeader from 'src/components/PageHeader.vue';
import ListReport from 'src/components/Report/ListReport.vue';
import { fyo } from 'src/initFyo';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { showContextMenu } from 'src/utils/contextMenu';
import { focusedPaneId, updatePaneProps } from 'src/utils/deskPanes';
import { clearReportInstance, docsPathMap, getReport } from 'src/utils/misc';
import { docsPathRef } from 'src/utils/refs';
import { ActionGroup } from 'src/utils/types';
import { openRouteInSidePane, routeTo } from 'src/utils/ui';
import { getBasisBadge } from 'reports/cashBasis';
import {
  deleteMemorizedReport,
  getMemorizedReportPath,
  promptAndSaveMemorizedReport,
  toMemorizedFilterMap,
} from 'src/utils/memorizedReports';
import { PropType, computed, defineComponent, inject } from 'vue';

export default defineComponent({
  components: {
    PageHeader,
    FormControl,
    ListReport,
    DropdownWithActions,
    Button,
  },
  provide() {
    return {
      report: computed(() => this.report),
    };
  },
  props: {
    reportClassName: {
      type: String as PropType<keyof typeof reports>,
      required: true,
    },
    defaultFilters: {
      type: String,
      default: '{}',
    },
    memorizedName: {
      type: String,
      default: '',
    },
    instanceKey: {
      type: String,
      default: '',
    },
    useRoute: {
      type: Boolean,
      default: true,
    },
  },
  setup() {
    return { shortcuts: inject(shortcutsKey) };
  },
  data() {
    return {
      loading: false,
      report: null as null | Report,
      routeFilterReportClass: null as null | string,
      refreshTimer: null as ReturnType<typeof setTimeout> | null,
    };
  },
  computed: {
    resolvedMemorizedName() {
      if (!this.useRoute) {
        return this.memorizedName.trim();
      }
      const value = this.$route.query.memorizedName;
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
      return this.memorizedName.trim();
    },
    shortcutContext() {
      return this.instanceKey
        ? `${this.reportClassName}::${this.instanceKey}`
        : this.reportClassName;
    },
    reportInstanceKey() {
      return this.instanceKey || undefined;
    },
    focusedDeskPaneId() {
      return focusedPaneId.value;
    },
    isMemorized() {
      return Boolean(this.resolvedMemorizedName);
    },
    reportBasis() {
      const value = this.report?.get?.('basis');
      return typeof value === 'string' ? value : '';
    },
    isCashBasis() {
      return this.reportBasis === 'Cash';
    },
    basisBadge() {
      return getBasisBadge(this.reportBasis);
    },
    title() {
      if (this.resolvedMemorizedName) {
        return this.resolvedMemorizedName;
      }
      return reports[this.reportClassName]?.title ?? t`Report`;
    },
    printPath() {
      const params = new URLSearchParams();
      if (this.resolvedMemorizedName) {
        params.set('memorizedName', this.resolvedMemorizedName);
      }
      if (this.report) {
        params.set(
          'defaultFilters',
          JSON.stringify(toMemorizedFilterMap(this.report.filterMap))
        );
      }
      const query = params.toString();
      return query
        ? `/report-print/${this.reportClassName}?${query}`
        : `/report-print/${this.reportClassName}`;
    },
    groupedActions() {
      const actions = this.report?.getActions() ?? [];
      const actionsMap = actions.reduce((acc, ac) => {
        if (!ac.group) {
          ac.group = 'none';
        }

        acc[ac.group] ??= {
          group: ac.group,
          label: ac.label ?? '',
          type: ac.type ?? 'secondary',
          actions: [],
        };

        acc[ac.group].actions.push(ac);
        return acc;
      }, {} as Record<string, ActionGroup>);

      return Object.values(actionsMap);
    },
  },
  watch: {
    '$route.query.defaultFilters': {
      async handler() {
        if (!this.useRoute || !this.report) {
          return;
        }
        await this.applyRouteFilters();
      },
    },
    '$route.query.memorizedName': {
      async handler() {
        if (!this.useRoute || !this.report) {
          return;
        }
        await this.applyRouteFilters();
      },
    },
    'report.shouldRefresh'(value: boolean) {
      if (value) {
        this.scheduleRefresh();
      }
    },
    focusedDeskPaneId(id: string) {
      if (this.instanceKey && id === this.instanceKey) {
        void this.flushRefresh();
      }
    },
  },
  async mounted() {
    // keep-alive main view boots from activated(); pane mounts never activate.
    if (this.instanceKey || !this.useRoute) {
      await this.bootstrapReport();
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async activated() {
    docsPathRef.value =
      docsPathMap[this.reportClassName] ?? docsPathMap.Reports!;
    await this.bootstrapReport();

    if (fyo.store.isDevelopment) {
      // @ts-ignore
      window.rep = this;
    }

    this.setReportShortcuts();
  },
  deactivated() {
    docsPathRef.value = '';
    this.shortcuts?.delete(this.shortcutContext);
  },
  beforeUnmount() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.shortcuts?.delete(this.shortcutContext);
    if (this.instanceKey) {
      clearReportInstance(this.reportClassName, this.instanceKey);
    }
  },
  methods: {
    routeTo,
    setReportShortcuts() {
      if (this.instanceKey && this.shortcuts) {
        this.shortcuts.associatePaneContext(
          this.instanceKey,
          this.shortcutContext
        );
      }
      this.shortcuts?.pmod.set(this.shortcutContext, ['KeyP'], async () => {
        await routeTo(this.printPath);
      });
    },
    scheduleRefresh() {
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
      }
      this.refreshTimer = setTimeout(() => {
        void this.flushRefresh();
      }, 1500);
    },
    async flushRefresh() {
      if (!this.report?.shouldRefresh) {
        return;
      }
      await this.report.setReportData(undefined, true);
      this.report.shouldRefresh = false;
    },
    async bootstrapReport() {
      await this.setReportData();
      if (this.useRoute) {
        await this.applyRouteFilters();
      } else {
        await this.applyPropFilters();
      }
      this.setReportShortcuts();
      if (this.instanceKey) {
        updatePaneProps(this.instanceKey, {}, this.title);
      }
    },
    async onFilterChange(fieldname: string, value: DocValue) {
      await this.report?.set(fieldname, value);
      this.syncPaneFilters();
    },
    syncPaneFilters() {
      if (!this.instanceKey || !this.report) {
        return;
      }
      updatePaneProps(
        this.instanceKey,
        {
          defaultFilters: JSON.stringify(
            toMemorizedFilterMap(this.report.filterMap)
          ),
        },
        this.title
      );
    },
    onPageContextMenu(event: MouseEvent) {
      const filtersJson = this.report
        ? JSON.stringify(toMemorizedFilterMap(this.report.filterMap))
        : this.defaultFilters || '{}';
      const params = new URLSearchParams();
      if (filtersJson && filtersJson !== '{}') {
        params.set('defaultFilters', filtersJson);
      }
      if (this.resolvedMemorizedName) {
        params.set('memorizedName', this.resolvedMemorizedName);
      }
      const query = params.toString();
      const path = query
        ? `/report/${this.reportClassName}?${query}`
        : `/report/${this.reportClassName}`;
      showContextMenu(event, [
        {
          label: t`Open in side pane`,
          action: () => openRouteInSidePane(path),
        },
      ]);
    },
    async memorizeReport() {
      if (!this.report) {
        return;
      }

      const savedName = await promptAndSaveMemorizedReport(
        fyo,
        this.reportClassName,
        this.report.filterMap
      );
      if (!savedName) {
        return;
      }

      await routeTo(
        getMemorizedReportPath({
          name: savedName,
          reportClassName: this.reportClassName,
          filtersJson: JSON.stringify(
            toMemorizedFilterMap(this.report.filterMap)
          ),
        })
      );
    },
    async deleteMemorized() {
      if (!this.resolvedMemorizedName) {
        return;
      }

      const deleted = await deleteMemorizedReport(
        fyo,
        this.resolvedMemorizedName
      );
      if (deleted) {
        await routeTo(`/report/${this.reportClassName}`);
      }
    },
    async applyPropFilters() {
      let parsed: Record<string, DocValue> = {};
      try {
        parsed = JSON.parse(this.defaultFilters || '{}') as Record<
          string,
          DocValue
        >;
      } catch {
        parsed = {};
      }
      const relativeDates = Boolean(parsed.relativeDates);
      delete parsed.relativeDates;
      const hadIncoming = Object.keys(parsed).length > 0 || relativeDates;
      if (hadIncoming && this.resolvedMemorizedName) {
        this.stampLegacyBasis(parsed);
      }
      const filterKeys = Object.keys(parsed);
      if (!hadIncoming) {
        return;
      }

      this.report = await getReport(this.reportClassName, {
        fresh: true,
        instanceKey: this.reportInstanceKey,
      });
      if (relativeDates) {
        const report = this.report as Report & {
          toDate?: string;
          fromDate?: string;
          fromYear?: number;
          toYear?: number;
        };
        delete report.toDate;
        delete report.fromDate;
        delete report.fromYear;
        delete report.toYear;
      }
      for (const key of filterKeys) {
        await this.report.set(key, parsed[key], false);
      }
      await this.report.updateData();
    },
    async applyRouteFilters() {
      const filters = this.$route.query as Record<string, DocValue>;
      const validFilters: Record<string, DocValue> = {};
      const ignoredQueryKeys = new Set(['defaultFilters', 'memorizedName']);

      if (
        filters.defaultFilters &&
        typeof filters.defaultFilters === 'string'
      ) {
        const parsed = JSON.parse(filters.defaultFilters) as Record<
          string,
          DocValue
        >;
        Object.assign(validFilters, parsed);
      }

      for (const [key, value] of Object.entries(filters)) {
        if (!ignoredQueryKeys.has(key) && typeof value === 'string') {
          validFilters[key] = value;
        }
      }

      const relativeDates = Boolean(validFilters.relativeDates);
      delete validFilters.relativeDates;
      const hasIncoming = Object.keys(validFilters).length > 0 || relativeDates;
      if (hasIncoming && this.resolvedMemorizedName) {
        this.stampLegacyBasis(validFilters);
      }

      const filterKeys = Object.keys(validFilters);

      if (hasIncoming) {
        this.report = await getReport(this.reportClassName, {
          fresh: true,
          instanceKey: this.reportInstanceKey,
        });
        if (relativeDates) {
          const report = this.report as Report & {
            toDate?: string;
            fromDate?: string;
            fromYear?: number;
            toYear?: number;
          };
          delete report.toDate;
          delete report.fromDate;
          delete report.fromYear;
          delete report.toYear;
        }

        for (const key of filterKeys) {
          await this.report.set(key, validFilters[key], false);
        }

        await this.report.updateData();
        this.routeFilterReportClass = this.reportClassName;
        return;
      }

      if (this.routeFilterReportClass === this.reportClassName) {
        this.report = await getReport(this.reportClassName, {
          fresh: true,
          instanceKey: this.reportInstanceKey,
        });
        this.routeFilterReportClass = null;
      }
    },
    stampLegacyBasis(filters: Record<string, DocValue>) {
      if (filters.basis === 'Cash' || filters.basis === 'Accrual') {
        return;
      }
      const hasBasisFilter =
        this.report?.filters.some((field) => field.fieldname === 'basis') ||
        this.reportClassName === 'ProfitAndLoss' ||
        this.reportClassName === 'BalanceSheet';
      if (hasBasisFilter) {
        filters.basis = 'Accrual';
      }
    },
    async setReportData() {
      const expectedName = reports[this.reportClassName]?.reportName;
      if (this.report === null || this.report.reportName !== expectedName) {
        this.report = await getReport(this.reportClassName, {
          instanceKey: this.reportInstanceKey,
        });
      }

      if (!this.report.reportData.length) {
        await this.report.setReportData();
        this.report.shouldRefresh = false;
      } else if (this.report.shouldRefresh) {
        await this.report.setReportData(undefined, true);
        this.report.shouldRefresh = false;
      }
    },
  },
});
</script>
