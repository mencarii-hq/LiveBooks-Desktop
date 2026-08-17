<template>
  <div
    class="
      flex
      items-center
      gap-2
      flex-wrap
      border-b
      dark:border-gray-800
      bg-yellow-50
      dark:bg-gray-875
      px-4
      py-2
      text-xs text-gray-700
      dark:text-gray-200
    "
  >
    <span
      class="
        font-semibold
        uppercase
        tracking-wide
        text-yellow-800
        dark:text-yellow-200
      "
      >{{ t`QBD Archive` }}</span
    >
    <span v-if="companyName">{{ companyName }}</span>
    <span>·</span>
    <span>{{
      t`as exported from QBD on ${exportedAtLabel} — not recalculated`
    }}</span>
    <span>·</span>
    <span v-if="origin === 'cloud'">{{ t`Pulled from LiveBooks Cloud` }}</span>
    <span v-else>{{ t`Attached from a local ZIP` }}</span>
    <span v-if="attachedAtLabel">({{ attachedAtLabel }})</span>
    <span v-if="processingNote" class="text-yellow-800 dark:text-yellow-200">
      · {{ processingNote }}
    </span>
    <span class="ms-auto text-gray-500 dark:text-gray-400">{{
      t`Import lists natively — review and search history here`
    }}</span>
  </div>
</template>

<script lang="ts">
import { t } from 'fyo';
import { formatExportedAt, getSourceBookStatus } from 'src/utils/sourcebooks';
import { summarizeManifest } from 'utils/sourcebooks/manifest';
import type { SourceBookStatus } from 'utils/sourcebooks/types';
import { defineComponent } from 'vue';

/**
 * Shown on every QBD Archive view: origin, export time, processing status.
 * Data is a source snapshot from QuickBooks Desktop, never recalculated.
 */
export default defineComponent({
  name: 'SourceBooksBanner',
  data() {
    return {
      status: null as SourceBookStatus | null,
    };
  },
  computed: {
    companyName(): string {
      return this.status?.meta?.companyName ?? '';
    },
    origin(): string {
      return this.status?.meta?.origin ?? 'local';
    },
    exportedAtLabel(): string {
      return formatExportedAt(this.status?.meta?.exportedAt);
    },
    attachedAtLabel(): string {
      const attachedAt = this.status?.meta?.attachedAt;
      return attachedAt ? formatExportedAt(attachedAt) : '';
    },
    processingNote(): string {
      const summary = summarizeManifest(this.status?.meta?.manifestJson);
      if (!summary) {
        return '';
      }
      const parts: string[] = [];
      const failed = summary.entities.filter((e) => e.failed).length;
      const partial = summary.entities.filter(
        (e) => e.partial && !e.failed
      ).length;
      const orphanErrors = summary.errors.filter(
        (e) => !summary.entities.some((s) => s.entityType === e.entityType)
      ).length;
      if (failed + orphanErrors) {
        parts.push(
          t`${String(failed + orphanErrors)} entity types did not export`
        );
      }
      if (partial) {
        parts.push(t`${String(partial)} exported partially`);
      }
      if (summary.notExtractable.length) {
        parts.push(t`some QBD data is not extractable`);
      }
      return parts.join(' · ');
    },
  },
  async mounted() {
    this.status = await getSourceBookStatus();
  },
  methods: { t },
});
</script>
