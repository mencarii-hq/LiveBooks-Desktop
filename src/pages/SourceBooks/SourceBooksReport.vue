<template>
  <div class="flex flex-col overflow-y-hidden h-full">
    <PageHeader :title="title" :border="true">
      <Button @click="goBack">{{ t`Back to QBD Archive` }}</Button>
    </PageHeader>
    <SourceBooksBanner />

    <div
      class="
        flex-1
        overflow-y-auto overflow-x-hidden
        custom-scroll custom-scroll-thumb1
        p-4
      "
    >
      <p v-if="!loaded" class="text-sm text-gray-500 dark:text-gray-400">
        {{ t`Loading…` }}
      </p>
      <p v-else-if="!snapshot" class="text-sm text-gray-500 dark:text-gray-400">
        {{ t`This report snapshot is not in the archive.` }}
      </p>

      <template v-else>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
          {{ t`Snapshot taken at export — not recalculated by LiveBooks.` }}
        </p>
        <p
          v-if="reportSubtitle"
          class="text-xs text-gray-500 dark:text-gray-400 mb-3"
        >
          {{ reportSubtitle }}
        </p>

        <div
          v-if="table"
          class="border dark:border-gray-800 rounded overflow-x-auto max-w-4xl"
        >
          <table class="w-full text-sm">
            <thead v-if="table.columns.length">
              <tr class="bg-gray-50 dark:bg-gray-875">
                <th
                  v-for="(col, i) in table.columns"
                  :key="i"
                  class="
                    px-3
                    py-2
                    text-start
                    font-medium
                    text-gray-600
                    dark:text-gray-300
                  "
                >
                  {{ col }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, ri) in table.rows"
                :key="ri"
                class="border-t dark:border-gray-800"
              >
                <td
                  v-for="(cell, ci) in row"
                  :key="ci"
                  class="px-3 py-2 dark:text-gray-100"
                  :class="ci > 0 ? 'tabular-nums' : ''"
                >
                  {{ cell }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Unknown snapshot shape: raw JSON so nothing is hidden -->
        <pre
          v-else
          class="
            max-h-screen
            overflow-auto
            rounded
            border
            dark:border-gray-800
            bg-gray-50
            dark:bg-gray-875
            p-3
            text-xs
            dark:text-gray-200
            max-w-4xl
          "
          >{{ prettyJson }}</pre
        >
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import { t } from 'fyo';
import Button from 'src/components/Button.vue';
import PageHeader from 'src/components/PageHeader.vue';
import {
  formatExportedAt,
  getSourceBookSnapshot,
  getSourceBookStatus,
} from 'src/utils/sourcebooks';
import { routeTo } from 'src/utils/ui';
import { entityTypeLabel } from 'utils/sourcebooks/entityTypes';
import { flattenReportRet } from 'utils/sourcebooks/reportRet';
import type { FlatReportTable } from 'utils/sourcebooks/reportRet';
import type { SourceBookSnapshot } from 'utils/sourcebooks/types';
import { defineComponent } from 'vue';
import SourceBooksBanner from './SourceBooksBanner.vue';

type SnapshotTable = { columns: string[]; rows: string[][] };

function cellText(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Fallback snapshot table detection for non-ReportRet payloads. Accepts:
 *  - { columns: [...], rows: [[...]] }
 *  - bare array of arrays
 *  - array of flat objects (columns from keys)
 * Anything else renders as raw JSON.
 */
function toTable(parsed: unknown): SnapshotTable | null {
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    const rec = parsed as Record<string, unknown>;
    if (Array.isArray(rec.rows)) {
      const columns = Array.isArray(rec.columns)
        ? rec.columns.map(cellText)
        : [];
      const rows = (rec.rows as unknown[]).map((row) =>
        Array.isArray(row)
          ? (row as unknown[]).map(cellText)
          : typeof row === 'object' && row !== null
          ? Object.values(row as Record<string, unknown>).map(cellText)
          : [cellText(row)]
      );
      return { columns, rows };
    }
    return null;
  }

  if (Array.isArray(parsed) && parsed.length) {
    if (parsed.every((row) => Array.isArray(row))) {
      return {
        columns: [],
        rows: (parsed as unknown[][]).map((row) => row.map(cellText)),
      };
    }
    if (
      parsed.every(
        (row) => typeof row === 'object' && row !== null && !Array.isArray(row)
      )
    ) {
      const keys = Object.keys(parsed[0] as Record<string, unknown>);
      return {
        columns: keys,
        rows: (parsed as Record<string, unknown>[]).map((row) =>
          keys.map((key) => cellText(row[key]))
        ),
      };
    }
  }
  return null;
}

export default defineComponent({
  name: 'SourceBooksReport',
  components: { Button, PageHeader, SourceBooksBanner },
  props: {
    name: { type: String, required: true },
  },
  data() {
    return {
      loaded: false,
      snapshot: null as SourceBookSnapshot | null,
      exportedAt: '',
    };
  },
  computed: {
    title(): string {
      const label = entityTypeLabel(this.name);
      return t`${label} — as exported from QBD on ${this.exportedAt}`;
    },
    parsed(): unknown {
      if (!this.snapshot) {
        return null;
      }
      try {
        return JSON.parse(this.snapshot.data) as unknown;
      } catch {
        return this.snapshot.data;
      }
    },
    /** Raw qbXML ReportRet flattened to rows/columns. */
    reportRet(): FlatReportTable | null {
      return flattenReportRet(this.parsed);
    },
    table(): SnapshotTable | null {
      const flat = this.reportRet;
      if (flat) {
        return { columns: flat.columns, rows: flat.rows };
      }
      return toTable(this.parsed);
    },
    reportSubtitle(): string {
      const flat = this.reportRet;
      if (!flat) {
        return '';
      }
      return [flat.subtitle, flat.basis ? t`${flat.basis} basis` : '']
        .filter(Boolean)
        .join(' · ');
    },
    prettyJson(): string {
      return typeof this.parsed === 'string'
        ? this.parsed
        : JSON.stringify(this.parsed, null, 2);
    },
  },
  watch: {
    name() {
      void this.fetchSnapshot();
    },
  },
  async mounted() {
    const status = await getSourceBookStatus();
    this.exportedAt = formatExportedAt(status.meta?.exportedAt);
    await this.fetchSnapshot();
  },
  methods: {
    t,
    async fetchSnapshot(): Promise<void> {
      this.loaded = false;
      this.snapshot = await getSourceBookSnapshot(this.name);
      this.loaded = true;
    },
    goBack(): void {
      void routeTo('/source-books');
    },
  },
});
</script>
