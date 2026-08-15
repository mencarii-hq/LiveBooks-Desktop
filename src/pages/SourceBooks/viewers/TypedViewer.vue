<template>
  <div>
    <!-- Header field grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 max-w-3xl">
      <div
        v-for="field in presentFields"
        :key="field.label + field.path"
        class="
          flex
          justify-between
          gap-4
          text-sm
          border-b
          dark:border-gray-800
          py-1
        "
      >
        <span class="text-gray-500 dark:text-gray-400">{{ field.label }}</span>
        <span class="text-end dark:text-gray-100">{{ field.value }}</span>
      </div>
    </div>

    <!-- Addresses -->
    <div v-if="presentAddresses.length" class="mt-4 flex flex-wrap gap-8">
      <div v-for="addr in presentAddresses" :key="addr.label">
        <h4
          class="
            text-xs
            uppercase
            tracking-wide
            text-gray-500
            dark:text-gray-400
          "
        >
          {{ addr.label }}
        </h4>
        <p
          v-for="(line, i) in addr.lines"
          :key="i"
          class="text-sm dark:text-gray-100"
        >
          {{ line }}
        </p>
      </div>
    </div>

    <!-- Line item sections -->
    <div
      v-for="section in presentLineSections"
      :key="section.title + section.key"
      class="mt-6"
    >
      <h4
        class="
          text-xs
          uppercase
          tracking-wide
          text-gray-500
          dark:text-gray-400
          mb-1
        "
      >
        {{ section.title }}
      </h4>
      <div class="border dark:border-gray-800 rounded overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50 dark:bg-gray-875 text-start">
              <th
                v-for="col in section.columns"
                :key="col.label"
                class="px-3 py-2 font-medium text-gray-600 dark:text-gray-300"
                :class="col.align === 'right' ? 'text-end' : 'text-start'"
              >
                {{ col.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, i) in section.rows"
              :key="i"
              class="border-t dark:border-gray-800"
            >
              <td
                v-for="col in section.columns"
                :key="col.label"
                class="px-3 py-2 dark:text-gray-100"
                :class="
                  col.align === 'right' ? 'text-end tabular-nums' : 'text-start'
                "
              >
                {{ cellValue(row, col) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Totals -->
    <div v-if="presentTotals.length" class="mt-4 flex justify-end">
      <div class="w-64 space-y-1">
        <div
          v-for="total in presentTotals"
          :key="total.label"
          class="flex justify-between text-sm"
        >
          <span class="text-gray-500 dark:text-gray-400">{{
            total.label
          }}</span>
          <span class="tabular-nums font-medium dark:text-gray-100">{{
            total.value
          }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { formatArchiveAmount } from 'src/utils/sourcebooks';
import { defineComponent, PropType } from 'vue';
import { addressLines, retDisplay, retGet, retLines, RetData } from './helpers';
import type {
  ViewerConfig,
  ViewerField,
  ViewerLineColumn,
} from './viewerConfigs';

type PresentField = { label: string; path: string; value: string };
type PresentSection = {
  title: string;
  key: string;
  columns: ViewerLineColumn[];
  rows: RetData[];
};

export default defineComponent({
  name: 'TypedViewer',
  props: {
    config: { type: Object as PropType<ViewerConfig>, required: true },
    data: { type: Object as PropType<RetData>, required: true },
  },
  computed: {
    presentFields(): PresentField[] {
      const seen = new Set<string>();
      const out: PresentField[] = [];
      for (const field of this.config.fields) {
        const value = this.fieldValue(field);
        // Alternate paths share a label (e.g. item price locations); first hit wins.
        if (!value || seen.has(field.label)) {
          continue;
        }
        seen.add(field.label);
        out.push({ label: field.label, path: field.path, value });
      }
      return out;
    },
    presentAddresses(): { label: string; lines: string[] }[] {
      return (this.config.addresses ?? [])
        .map((addr) => ({
          label: addr.label,
          lines: addressLines(retGet(this.data, addr.path)),
        }))
        .filter((addr) => addr.lines.length > 0);
    },
    presentLineSections(): PresentSection[] {
      return (this.config.lines ?? [])
        .map((section) => ({
          ...section,
          rows: retLines(this.data, section.key),
        }))
        .filter((section) => section.rows.length > 0);
    },
    presentTotals(): PresentField[] {
      return this.config.totals
        ? (this.config.totals
            .map((totalField) => ({
              label: totalField.label,
              path: totalField.path,
              value: this.fieldValue(totalField),
            }))
            .filter((totalField) => !!totalField.value) as PresentField[])
        : [];
    },
  },
  methods: {
    fieldValue(field: ViewerField): string {
      const raw = retGet(this.data, field.path);
      const display = retDisplay(raw);
      if (!display) {
        return '';
      }
      if (field.kind === 'money') {
        const num = Number(display);
        return Number.isFinite(num) ? formatArchiveAmount(num) : display;
      }
      return display;
    },
    cellValue(row: RetData, col: ViewerLineColumn): string {
      const display = retDisplay(retGet(row, col.path));
      if (!display) {
        return '';
      }
      if (col.kind === 'money') {
        const num = Number(display);
        return Number.isFinite(num) ? formatArchiveAmount(num) : display;
      }
      return display;
    },
  },
});
</script>
