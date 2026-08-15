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
      "
    >
      <ArchiveRecordTable
        :rows="rows"
        :empty-message="t`No records of this type in the archive`"
      />
    </div>
    <div class="border-t dark:border-gray-800 px-4">
      <Paginator :item-count="total" @index-change="setPageIndices" />
    </div>
  </div>
</template>

<script lang="ts">
import { t } from 'fyo';
import Button from 'src/components/Button.vue';
import PageHeader from 'src/components/PageHeader.vue';
import Paginator from 'src/components/Paginator.vue';
import { listSourceBookRecords } from 'src/utils/sourcebooks';
import { routeTo } from 'src/utils/ui';
import { entityTypeLabel } from 'utils/sourcebooks/entityTypes';
import type { SourceBookRecordSummary } from 'utils/sourcebooks/types';
import { defineComponent } from 'vue';
import ArchiveRecordTable from './ArchiveRecordTable.vue';
import SourceBooksBanner from './SourceBooksBanner.vue';

/**
 * Paginated read-only list of one archive entity type. Lists sort by name,
 * so customer jobs ("Parent:Job") follow their parent and render indented
 * (via parentId) — jobs are children, and only parents are copyable.
 */
export default defineComponent({
  name: 'SourceBooksList',
  components: {
    ArchiveRecordTable,
    Button,
    PageHeader,
    Paginator,
    SourceBooksBanner,
  },
  props: {
    entityType: { type: String, required: true },
  },
  data() {
    return {
      rows: [] as SourceBookRecordSummary[],
      total: 0,
      offset: 0,
      limit: 50,
    };
  },
  computed: {
    title(): string {
      if (this.entityType.endsWith('*')) {
        return t`Items`;
      }
      return entityTypeLabel(this.entityType);
    },
  },
  watch: {
    entityType() {
      this.offset = 0;
      void this.fetchRows();
    },
  },
  async mounted() {
    await this.fetchRows();
  },
  methods: {
    t,
    async fetchRows(): Promise<void> {
      const result = await listSourceBookRecords({
        entityType: this.entityType,
        limit: this.limit,
        offset: this.offset,
      });
      this.rows = result.rows;
      this.total = result.total;
    },
    setPageIndices({ start, end }: { start: number; end: number }): void {
      this.offset = start;
      this.limit = Math.max(end - start, 1);
      void this.fetchRows();
    },
    goBack(): void {
      void routeTo('/source-books');
    },
  },
});
</script>
