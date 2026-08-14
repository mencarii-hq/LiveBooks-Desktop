<template>
  <div class="flex flex-col w-full h-full">
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
        @change="async (value) => await report?.set(field.fieldname, value)"
      />
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
import { docsPathMap, getReport } from 'src/utils/misc';
import { docsPathRef } from 'src/utils/refs';
import { ActionGroup } from 'src/utils/types';
import { routeTo } from 'src/utils/ui';
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
  },
  setup() {
    return { shortcuts: inject(shortcutsKey) };
  },
  data() {
    return {
      loading: false,
      report: null as null | Report,
      routeFilterReportClass: null as null | string,
    };
  },
  computed: {
    memorizedName() {
      const value = this.$route.query.memorizedName;
      return typeof value === 'string' && value.trim() ? value : '';
    },
    isMemorized() {
      return Boolean(this.memorizedName);
    },
    title() {
      if (this.memorizedName) {
        return this.memorizedName;
      }
      return reports[this.reportClassName]?.title ?? t`Report`;
    },
    printPath() {
      const params = new URLSearchParams();
      if (this.memorizedName) {
        params.set('memorizedName', this.memorizedName);
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
        if (!this.report) {
          return;
        }
        await this.applyRouteFilters();
      },
    },
    '$route.query.memorizedName': {
      async handler() {
        if (!this.report) {
          return;
        }
        await this.applyRouteFilters();
      },
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async activated() {
    docsPathRef.value =
      docsPathMap[this.reportClassName] ?? docsPathMap.Reports!;
    await this.setReportData();
    await this.applyRouteFilters();

    if (fyo.store.isDevelopment) {
      // @ts-ignore
      window.rep = this;
    }

    this.shortcuts?.pmod.set(this.reportClassName, ['KeyP'], async () => {
      await routeTo(this.printPath);
    });
  },
  deactivated() {
    docsPathRef.value = '';
    this.shortcuts?.delete(this.reportClassName);
  },
  methods: {
    routeTo,
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
      if (!this.memorizedName) {
        return;
      }

      const deleted = await deleteMemorizedReport(fyo, this.memorizedName);
      if (deleted) {
        await routeTo(`/report/${this.reportClassName}`);
      }
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

      const filterKeys = Object.keys(validFilters);
      const hasIncoming = filterKeys.length > 0 || relativeDates;

      if (hasIncoming) {
        this.report = await getReport(this.reportClassName, { fresh: true });
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
        this.report = await getReport(this.reportClassName, { fresh: true });
        this.routeFilterReportClass = null;
      }
    },
    async setReportData() {
      const expectedName = reports[this.reportClassName]?.reportName;
      if (this.report === null || this.report.reportName !== expectedName) {
        this.report = await getReport(this.reportClassName);
      }

      if (!this.report.reportData.length) {
        await this.report.setReportData();
      } else if (this.report.shouldRefresh) {
        await this.report.setReportData(undefined, true);
      }
    },
  },
});
</script>
