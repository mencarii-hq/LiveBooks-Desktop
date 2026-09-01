<template>
  <div class="flex flex-col w-full h-full">
    <PageHeader :title="t`Print ${title}`">
      <Button
        class="text-xs"
        type="primary"
        :disabled="!canPrint"
        @click="savePDF()"
      >
        {{ t`Save as PDF` }}
      </Button>
      <Button
        class="text-xs"
        type="primary"
        :disabled="!canPrint"
        @click="savePDF(true)"
      >
        {{ t`Print` }}
      </Button>
    </PageHeader>

    <div
      class="outer-container overflow-y-auto custom-scroll custom-scroll-thumb1"
    >
      <!-- Report Print Display Area -->
      <div
        ref="previewContainer"
        class="
          p-4
          bg-gray-25
          dark:bg-gray-890
          overflow-auto
          custom-scroll custom-scroll-thumb1
        "
      >
        <!-- Report Print Display Container -->
        <ScaledContainer
          ref="scaledContainer"
          class="shadow-lg border bg-white mx-auto"
          :scale="scale"
          :width="size.width"
          :height="size.height"
          :show-overflow="true"
        >
          <div class="bg-white mx-auto" :style="contentPaddingStyle">
            <div class="p-2">
              <div class="font-semibold text-xl w-full flex justify-between">
                <div class="flex items-center gap-2">
                  <img
                    v-if="includeLogo && logoSrc"
                    :src="logoSrc"
                    class="h-12 max-w-32 object-contain"
                  />
                  <h1>
                    {{ `${fyo.singles.PrintSettings?.companyName}` }}
                  </h1>
                </div>
                <p class="text-gray-600">
                  {{ title }}
                </p>
              </div>
              <p v-if="printSubtitle" class="text-sm text-gray-600 mt-1">
                {{ printSubtitle }}
              </p>
            </div>

            <!-- Report Data -->
            <div class="grid" :style="rowStyles">
              <template v-for="(row, r) of matrix" :key="`row-${r}`">
                <div
                  v-for="(cell, c) of row"
                  :key="`cell-${r}.${c}`"
                  :class="cellClasses(cell.idx, r)"
                  class="text-sm p-2"
                  :style="printCellStyle(cell)"
                >
                  {{ cell.value }}
                </div>
              </template>
            </div>

            <div class="border-t p-2">
              <p class="text-xs text-right w-full text-gray-600">
                {{ t`Prepared` }} {{ fyo.format(new Date(), 'Datetime') }}
              </p>
            </div>
          </div>
        </ScaledContainer>
      </div>

      <!-- Report Print Settings -->
      <div v-if="report" class="border-l dark:border-gray-800 flex flex-col">
        <p class="p-4 text-sm text-gray-600 dark:text-gray-300">
          {{
            [
              t`Hidden values will be visible on Print on.`,
              t`Report will use more than one page if required.`,
            ].join(' ')
          }}
        </p>
        <!-- Row Selection -->
        <div class="p-4 border-t dark:border-gray-800">
          <Int
            :show-label="true"
            :border="true"
            :df="{
              label: t`Start From Row Index`,
              fieldtype: 'Int',
              fieldname: 'numRows',
              minvalue: 1,
              maxvalue: report?.reportData.length ?? 1000,
            }"
            :value="start"
            @change="(v) => (start = v)"
          />
          <Int
            class="mt-4"
            :show-label="true"
            :border="true"
            :df="{
              label: t`Number of Rows`,
              fieldtype: 'Int',
              fieldname: 'numRows',
              minvalue: 0,
              maxvalue: report?.reportData.length ?? 1000,
            }"
            :value="limit"
            @change="(v) => (limit = v)"
          />
        </div>

        <!-- Logo Toggle -->
        <div class="border-t dark:border-gray-800 p-4">
          <Check
            :show-label="true"
            :border="true"
            :df="{
              label: t`Include Company Logo`,
              fieldname: 'includeLogo',
              fieldtype: 'Check',
            }"
            :value="includeLogo"
            @change="(v) => (includeLogo = v)"
          />
        </div>

        <!-- Size Selection -->
        <div class="border-t dark:border-gray-800 p-4">
          <Select
            :show-label="true"
            :border="true"
            :df="printSizeDf"
            :value="printSize"
            @change="(v) => (printSize = v)"
          />
          <Check
            class="mt-4"
            :show-label="true"
            :border="true"
            :df="{
              label: t`Is Landscape`,
              fieldname: 'isLandscape',
              fieldtype: 'Check',
            }"
            :value="isLandscape"
            @change="(v) => (isLandscape = v)"
          />
        </div>

        <!-- Margin Settings -->
        <div class="border-t dark:border-gray-800 p-4">
          <div class="flex items-center justify-between mb-1">
            <h2 class="text-sm text-gray-600 dark:text-gray-400">
              {{ t`Page Margins (cm)` }}
            </h2>
            <button
              class="
                text-xs text-blue-500
                hover:text-blue-600
                dark:text-blue-400
                hover:underline
              "
              @click="setRecommendedMargins"
            >
              {{ t`Use Recommended` }}
            </button>
          </div>
          <p class="text-xs text-gray-400 dark:text-gray-500 mb-3">
            {{
              t`1.5 cm (~0.6 in) per side is a safe default for most printers.`
            }}
          </p>
          <div class="grid grid-cols-2 gap-x-3 gap-y-3">
            <Float
              :show-label="true"
              :border="true"
              :df="{
                label: t`Top`,
                fieldtype: 'Float',
                fieldname: 'marginTop',
                minvalue: 0,
                maxvalue: 5,
              }"
              :value="margins.top"
              @change="(v) => (margins.top = v)"
            />
            <Float
              :show-label="true"
              :border="true"
              :df="{
                label: t`Bottom`,
                fieldtype: 'Float',
                fieldname: 'marginBottom',
                minvalue: 0,
                maxvalue: 5,
              }"
              :value="margins.bottom"
              @change="(v) => (margins.bottom = v)"
            />
            <Float
              :show-label="true"
              :border="true"
              :df="{
                label: t`Left`,
                fieldtype: 'Float',
                fieldname: 'marginLeft',
                minvalue: 0,
                maxvalue: 5,
              }"
              :value="margins.left"
              @change="(v) => (margins.left = v)"
            />
            <Float
              :show-label="true"
              :border="true"
              :df="{
                label: t`Right`,
                fieldtype: 'Float',
                fieldname: 'marginRight',
                minvalue: 0,
                maxvalue: 5,
              }"
              :value="margins.right"
              @change="(v) => (margins.right = v)"
            />
          </div>
        </div>

        <!-- Pick Columns -->
        <div class="border-t dark:border-gray-800 p-4">
          <h2 class="text-sm text-gray-600 dark:text-gray-300">
            {{ t`Pick Columns` }}
          </h2>
          <div
            class="border dark:border-gray-800 rounded grid grid-cols-2 mt-1"
          >
            <Check
              v-for="(col, i) of report?.columns"
              :key="col.fieldname"
              :show-label="true"
              :df="{
                label: col.label,
                fieldname: col.fieldname,
                fieldtype: 'Check',
              }"
              :value="columnSelection[i]"
              @change="(v) => (columnSelection[i] = v)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
import { DocValue } from 'fyo/core/types';
import { Verb } from 'fyo/telemetry/types';
import { Report } from 'reports/Report';
import { reports } from 'reports/index';
import { OptionField } from 'schemas/types';
import Button from 'src/components/Button.vue';
import Check from 'src/components/Controls/Check.vue';
import Float from 'src/components/Controls/Float.vue';
import Int from 'src/components/Controls/Int.vue';
import Select from 'src/components/Controls/Select.vue';
import PageHeader from 'src/components/PageHeader.vue';
import { getReport } from 'src/utils/misc';
import { getPathAndMakePDF } from 'src/utils/printTemplates';
import { showToast } from 'src/utils/interactive';
import { showSidebar } from 'src/utils/refs';
import { paperSizeMap, printSizes } from 'src/utils/ui';
import { PropType, defineComponent } from 'vue';
import ScaledContainer from '../TemplateBuilder/ScaledContainer.vue';

export default defineComponent({
  components: {
    PageHeader,
    Button,
    Check,
    Float,
    Int,
    ScaledContainer,
    Select,
  },
  props: {
    reportName: {
      type: String as PropType<keyof typeof reports>,
      required: true,
    },
  },
  data() {
    return {
      start: 1,
      limit: 0,
      printSize: 'A4' as typeof printSizes[number],
      isLandscape: false,
      scale: 0.65,
      includeLogo: false,
      report: null as null | Report,
      columnSelection: [] as boolean[],
      margins: {
        top: 1.5,
        right: 1.5,
        bottom: 1.5,
        left: 1.5,
      } as { top: number; right: number; bottom: number; left: number },
    };
  },
  computed: {
    title(): string {
      const memorizedName = this.$route.query.memorizedName;
      if (typeof memorizedName === 'string' && memorizedName.trim()) {
        return memorizedName;
      }
      return reports[this.reportName]?.title ?? this.t`Report`;
    },
    logoSrc(): string | undefined {
      const logo = this.fyo.singles.PrintSettings?.logo;
      if (!logo) {
        return undefined;
      }
      return typeof logo === 'string' ? logo : (logo as { data: string }).data;
    },
    printSizeDf(): OptionField {
      return {
        label: 'Print Size',
        fieldname: 'printSize',
        fieldtype: 'Select',
        options: printSizes
          .filter((p) => p !== 'Custom')
          .map((name) => ({ value: name, label: name })),
      };
    },
    matrix(): {
      value: string;
      idx: number;
      indent?: number;
      bold?: boolean;
    }[][] {
      if (!this.report) {
        return [];
      }

      const columns = this.report.columns
        .map((col, idx) => ({ value: col.label, idx }))
        .filter((_, i) => this.columnSelection[i]);

      const matrix: {
        value: string;
        idx: number;
        indent?: number;
        bold?: boolean;
      }[][] = [columns];
      const start = Math.max(this.start - 1, 0);
      const end = Math.min(start + this.limit, this.report.reportData.length);
      const slice = this.report.reportData.slice(start, end);

      for (let i = 0; i < slice.length; i++) {
        const row = slice[i];
        if (row.folded) {
          continue;
        }

        matrix.push([]);
        for (let j = 0; j < row.cells.length; j++) {
          if (!this.columnSelection[j]) {
            continue;
          }

          const cell = row.cells[j];
          matrix.at(-1)?.push({
            value: cell.value,
            idx: Number(j),
            indent: cell.indent,
            bold: cell.bold,
          });
        }
      }

      return matrix;
    },
    printSubtitle(): string {
      return this.report?.getPrintMeta?.()?.subtitle ?? '';
    },
    canPrint(): boolean {
      if (!this.report?.reportData.length) {
        return false;
      }
      return this.matrix.length > 1;
    },
    rowStyles(): Record<string, string> {
      const style: Record<string, string> = {};
      const numColumns = this.columnSelection.filter(Boolean).length;
      style['grid-template-columns'] = `repeat(${numColumns}, minmax(0, auto))`;
      return style;
    },
    contentPaddingStyle(): Record<string, string> {
      const { top, right, bottom, left } = this.margins;
      return {
        paddingTop: `${top}cm`,
        paddingRight: `${right}cm`,
        paddingBottom: `${bottom}cm`,
        paddingLeft: `${left}cm`,
      };
    },
    size(): { width: number; height: number } {
      const size = paperSizeMap[this.printSize];
      const long = size.width > size.height ? size.width : size.height;
      const short = size.width <= size.height ? size.width : size.height;

      if (this.isLandscape) {
        return { width: long, height: short };
      }

      return { width: short, height: long };
    },
  },
  watch: {
    size() {
      this.setScale();
    },
  },
  async mounted() {
    this.report = await this.loadReportFromRoute();
    this.limit = this.report.reportData.length;
    this.columnSelection = this.report.columns.map(() => true);

    await this.$nextTick();
    this.setScale();

    // eslint-disable-next-line @typescript-eslint/unbound-method
    window.addEventListener('resize', this.setScale);

    // @ts-ignore
    window.rpv = this;
  },
  unmounted() {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    window.removeEventListener('resize', this.setScale);
  },
  methods: {
    async loadReportFromRoute() {
      const filters = this.$route.query as Record<string, DocValue>;
      const validFilters: Record<string, DocValue> = {};
      const ignoredQueryKeys = new Set(['defaultFilters', 'memorizedName']);

      if (
        filters.defaultFilters &&
        typeof filters.defaultFilters === 'string'
      ) {
        try {
          const parsed = JSON.parse(filters.defaultFilters) as Record<
            string,
            DocValue
          >;
          Object.assign(validFilters, parsed);
        } catch {
          /* malformed route query must not blank the view */
        }
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
      const report = await getReport(
        this.reportName,
        hasIncoming ? { fresh: true } : undefined
      );

      if (hasIncoming) {
        if (relativeDates) {
          const dated = report as Report & {
            toDate?: string;
            fromDate?: string;
            fromYear?: number;
            toYear?: number;
          };
          delete dated.toDate;
          delete dated.fromDate;
          delete dated.fromYear;
          delete dated.toYear;
        }

        for (const key of filterKeys) {
          await report.set(key, validFilters[key], false);
        }

        await report.updateData();
      } else if (!report.reportData.length) {
        await report.setReportData();
      }

      return report;
    },
    setScale() {
      const el = this.$refs.previewContainer as HTMLElement | undefined;
      const pageWidthPx = this.size.width * 37.2;
      if (!pageWidthPx) {
        return;
      }
      let containerWidth: number;
      if (el && el.clientWidth > 0) {
        const style = window.getComputedStyle(el);
        const pl = parseFloat(style.paddingLeft) || 0;
        const pr = parseFloat(style.paddingRight) || 0;
        containerWidth = Math.max(el.clientWidth - pl - pr, 0);
      } else {
        // fallback: subtract settings panel, optional sidebar, and p-4 padding (32px)
        containerWidth = window.innerWidth - 26 * 16 - 32;
        if (showSidebar.value) {
          containerWidth -= 12 * 16;
        }
      }
      this.scale = Math.min(containerWidth / pageWidthPx, 1);
    },
    async savePDF(shouldPrint?: boolean): Promise<void> {
      if (!this.canPrint) {
        showToast({
          type: 'error',
          message: this.t`Report has no data to print.`,
        });
        return;
      }

      // @ts-ignore
      const innerHTML = this.$refs.scaledContainer.$el.children[0].innerHTML;
      if (typeof innerHTML !== 'string') {
        return;
      }

      const name = this.title + ' - ' + this.fyo.format(new Date(), 'Date');
      await getPathAndMakePDF(
        name,
        innerHTML,
        this.size.width,
        this.size.height,
        shouldPrint
      );

      this.fyo.telemetry.log(Verb.Printed, this.report!.reportName);
    },
    setRecommendedMargins() {
      this.margins = { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 };
    },
    printCellStyle(cell: {
      indent?: number;
      bold?: boolean;
    }): Record<string, string> {
      const style: Record<string, string> = { minHeight: '2rem' };
      if (cell.indent) {
        style.paddingLeft = `${cell.indent * 1.25}rem`;
      }
      if (cell.bold) {
        style.fontWeight = 'bold';
      }
      return style;
    },
    cellClasses(cIdx: number, rIdx: number): string[] {
      const classes: string[] = [];
      if (!this.report) {
        return classes;
      }

      const col = this.report.columns[cIdx];
      const isFirst = cIdx === 0;
      if (col.align) {
        classes.push(`text-${col.align}`);
      }

      if (rIdx === 0) {
        classes.push('font-semibold');
      }

      classes.push('border-t');
      if (!isFirst) {
        classes.push('border-l');
      }

      return classes;
    },
  },
});
</script>
<style scoped>
.outer-container {
  display: grid;
  grid-template-columns: auto var(--w-quick-edit);
  @apply h-full overflow-auto;
}
</style>
