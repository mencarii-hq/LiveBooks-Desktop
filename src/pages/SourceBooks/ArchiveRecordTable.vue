<template>
  <div class="text-sm">
    <div
      class="
        grid
        archive-record-grid
        gap-2
        px-4
        py-2
        text-xs
        uppercase
        tracking-wide
        text-gray-500
        dark:text-gray-400
        border-b
        dark:border-gray-800
      "
    >
      <span>{{ t`Name / Ref` }}</span>
      <span>{{ t`Type` }}</span>
      <span>{{ t`Date` }}</span>
      <span class="text-right">{{ t`Amount` }}</span>
    </div>
    <template v-for="row in rows" :key="row.id">
      <button
        class="
          grid
          archive-record-grid
          gap-2
          w-full
          items-center
          px-4
          py-2
          text-start
          border-b
          dark:border-gray-800
          hover:bg-gray-50
          dark:hover:bg-gray-875
        "
        :class="row.parentId ? 'ps-8' : ''"
        @click="open(row)"
      >
        <span class="truncate dark:text-gray-100">
          <span class="font-medium">{{ primaryLabel(row) }}</span>
          <span
            v-if="row.entityName && row.entityName !== primaryLabel(row)"
            class="text-gray-500 dark:text-gray-400 ms-2"
            >{{ row.entityName }}</span
          >
        </span>
        <span class="text-gray-600 dark:text-gray-300">{{
          typeLabel(row.entityType)
        }}</span>
        <span class="text-gray-600 dark:text-gray-300">{{
          formatTxnDate(row.txnDate)
        }}</span>
        <span class="text-right tabular-nums dark:text-gray-100">{{
          formatArchiveAmount(row.amount)
        }}</span>
      </button>
    </template>
    <p
      v-if="!rows.length"
      class="px-4 py-6 text-center text-gray-500 dark:text-gray-400"
    >
      {{ emptyMessage || t`No records` }}
    </p>
  </div>
</template>

<script lang="ts">
import { t } from 'fyo';
import { fyo } from 'src/initFyo';
import { routeTo } from 'src/utils/ui';
import { formatArchiveAmount, sourceBookDocRoute } from 'src/utils/sourcebooks';
import { entityTypeLabel } from 'utils/sourcebooks/entityTypes';
import type { SourceBookRecordSummary } from 'utils/sourcebooks/types';
import { defineComponent, PropType } from 'vue';

export default defineComponent({
  name: 'ArchiveRecordTable',
  props: {
    rows: {
      type: Array as PropType<SourceBookRecordSummary[]>,
      required: true,
    },
    emptyMessage: { type: String, default: '' },
  },
  methods: {
    t,
    formatArchiveAmount,
    formatTxnDate(value?: string): string {
      if (!value) {
        return '';
      }
      return fyo.format(value, 'Date') || value;
    },
    typeLabel(entityType: string): string {
      return entityTypeLabel(entityType);
    },
    primaryLabel(row: SourceBookRecordSummary): string {
      return (
        row.name ?? row.refNumber ?? row.qbId ?? this.typeLabel(row.entityType)
      );
    },
    open(row: SourceBookRecordSummary): void {
      void routeTo(sourceBookDocRoute(row));
    },
  },
});
</script>

<style scoped>
.archive-record-grid {
  grid-template-columns: minmax(0, 1fr) 10rem 6.5rem 8rem;
}
</style>
