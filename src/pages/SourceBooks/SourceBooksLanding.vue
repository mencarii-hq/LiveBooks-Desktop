<template>
  <div class="flex flex-col overflow-y-hidden h-full">
    <PageHeader :title="t`QBD Archive`" />
    <SourceBooksBanner v-if="status?.attached" />

    <div
      class="
        flex-1
        overflow-y-auto overflow-x-hidden
        custom-scroll custom-scroll-thumb1
      "
    >
      <!-- Busy: pull / index progress -->
      <div v-if="busy" class="p-4 max-w-2xl">
        <h2 class="text-base font-medium dark:text-gray-25">
          {{ t`Preparing your QBD Archive` }}
        </h2>
        <p class="mt-2 text-sm text-gray-700 dark:text-gray-200">
          {{ progressLabel }}
        </p>
        <div class="mt-4 h-1.5 w-full rounded bg-gray-200 dark:bg-gray-800">
          <div class="h-1.5 w-1/2 animate-pulse rounded bg-blue-500" />
        </div>
      </div>

      <!-- Empty state: three-stage setup handoff -->
      <div
        v-else-if="!status?.attached || showAttachOptions"
        class="p-4 max-w-3xl"
      >
        <div
          v-if="status?.attached"
          class="mb-4 text-sm text-gray-700 dark:text-gray-200"
        >
          {{ t`Attaching a new archive replaces the current one.` }}
        </div>
        <h2 v-else class="text-lg font-semibold dark:text-gray-25">
          {{ t`Bring your QuickBooks Desktop history into LiveBooks` }}
        </h2>
        <p
          v-if="!status?.attached"
          class="mt-1 text-sm text-gray-700 dark:text-gray-200 max-w-2xl"
        >
          {{
            t`Your QBD Archive is a read-only, searchable copy of a QuickBooks Desktop company file. It never posts to your live books.`
          }}
        </p>

        <ol class="mt-6 space-y-5">
          <li class="flex gap-3">
            <span class="step-badge">1</span>
            <div>
              <h3 class="font-medium dark:text-gray-25">
                {{ t`Set up QuickBooks Desktop export on Cloud` }}
              </h3>
              <p class="text-sm text-gray-700 dark:text-gray-200 max-w-xl">
                {{
                  t`Sign in to LiveBooks Cloud, create a QBD export, and authorize the Web Connector while your company file is open as the QuickBooks Admin. This part is manual.`
                }}
              </p>
              <Button class="mt-2" type="primary" @click="openCloudSetup">
                {{ t`Set up on Cloud` }}
              </Button>
            </div>
          </li>
          <li class="flex gap-3">
            <span class="step-badge">2</span>
            <div>
              <h3 class="font-medium dark:text-gray-25">
                {{ t`Leave QuickBooks open while Cloud extracts` }}
              </h3>
              <p class="text-sm text-gray-700 dark:text-gray-200 max-w-xl">
                {{
                  t`Once authorized, the extract runs automatically — no per-entity clicking. Cloud tells you when the archive ZIP is ready.`
                }}
              </p>
            </div>
          </li>
          <li class="flex gap-3">
            <span class="step-badge">3</span>
            <div>
              <h3 class="font-medium dark:text-gray-25">
                {{ t`Pull the archive into LiveBooks Desktop` }}
              </h3>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <Button type="primary" @click="checkCloudExports">
                  {{ t`Check for ready archives` }}
                </Button>
                <Button @click="attachLocalZip">
                  {{ t`Open a local ZIP instead` }}
                </Button>
              </div>
              <p v-if="cloudError" class="mt-2 text-sm text-red-600">
                {{ cloudError }}
              </p>
              <div v-if="cloudChecked && !cloudError" class="mt-3">
                <p
                  v-if="!cloudExports.length"
                  class="text-sm text-gray-700 dark:text-gray-200"
                >
                  {{
                    t`No ready archives on Cloud yet. Finish steps 1–2, then check again.`
                  }}
                </p>
                <div
                  v-for="exp in cloudExports"
                  :key="exp.id"
                  class="
                    flex
                    items-center
                    justify-between
                    gap-2
                    border
                    dark:border-gray-800
                    rounded
                    p-2
                    mt-2
                    max-w-xl
                  "
                >
                  <div class="text-sm dark:text-gray-100">
                    <span class="font-medium">{{
                      exp.companyName || t`QBD export ${exp.id}`
                    }}</span>
                    <span class="text-gray-500 dark:text-gray-400 ms-2">
                      {{ formatExportedAt(exp.completedAt || exp.createdAt) }}
                    </span>
                    <span
                      v-if="exp.ready && exp.totalRecords"
                      class="text-gray-500 dark:text-gray-400 ms-2"
                    >
                      {{ t`${String(exp.totalRecords)} records` }}
                    </span>
                  </div>
                  <Button v-if="exp.ready" type="primary" @click="pull(exp)">
                    {{ t`Pull this archive` }}
                  </Button>
                  <span v-else class="text-sm text-gray-500 dark:text-gray-400">
                    {{ extractingLabel(exp) }}
                  </span>
                </div>
              </div>
            </div>
          </li>
        </ol>
        <Button
          v-if="status?.attached"
          class="mt-6"
          @click="showAttachOptions = false"
        >
          {{ t`Cancel` }}
        </Button>
      </div>

      <!-- Attached: search + overview -->
      <div v-else class="p-4">
        <div class="flex flex-wrap items-center gap-2 max-w-3xl">
          <input
            v-model="query"
            type="text"
            :placeholder="t`Search the QBD Archive (names, ref numbers, memos)`"
            class="
              flex-1
              min-w-64
              rounded
              border
              dark:border-gray-800
              bg-white
              dark:bg-gray-875 dark:text-gray-100
              px-3
              py-2
              text-sm
              focus:outline-none focus:ring-1 focus:ring-blue-500
            "
            @input="onQueryInput"
          />
          <select
            v-model="entityTypeFilter"
            class="
              rounded
              border
              dark:border-gray-800
              bg-white
              dark:bg-gray-875 dark:text-gray-100
              px-2
              py-2
              text-sm
            "
            @change="runSearch"
          >
            <option value="">{{ t`All types` }}</option>
            <option
              v-for="count in status.entityCounts"
              :key="count.entityType"
              :value="count.entityType"
            >
              {{ typeLabel(count.entityType) }}
            </option>
          </select>
          <input
            v-model="dateFrom"
            type="date"
            class="archive-date-input"
            @change="runSearch"
          />
          <input
            v-model="dateTo"
            type="date"
            class="archive-date-input"
            @change="runSearch"
          />
        </div>

        <!-- Search results grouped by entity type -->
        <div v-if="query.trim()" class="mt-4">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ t`${String(searchTotal)} matches` }}
          </p>
          <div
            v-for="group in groupedResults"
            :key="group.entityType"
            class="mt-4 border dark:border-gray-800 rounded overflow-hidden"
          >
            <div
              class="
                flex
                items-center
                justify-between
                px-4
                py-2
                bg-gray-50
                dark:bg-gray-875
              "
            >
              <h3 class="text-sm font-medium dark:text-gray-25">
                {{ typeLabel(group.entityType) }}
              </h3>
              <span class="text-xs text-gray-500 dark:text-gray-400">
                {{ t`${String(group.count)} matches` }}
              </span>
            </div>
            <ArchiveRecordTable :rows="group.rows" />
          </div>
          <p
            v-if="!groupedResults.length"
            class="mt-6 text-sm text-gray-500 dark:text-gray-400"
          >
            {{ t`Nothing in the archive matches this search.` }}
          </p>
        </div>

        <!-- Overview: entity type cards + reports -->
        <div v-else class="mt-6">
          <h3
            class="
              text-sm
              font-medium
              text-gray-500
              dark:text-gray-400
              uppercase
              tracking-wide
            "
          >
            {{ t`Lists & Documents` }}
          </h3>
          <div
            class="mt-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2"
          >
            <button
              v-for="count in status.entityCounts"
              :key="count.entityType"
              class="
                border
                dark:border-gray-800
                rounded
                p-3
                text-start
                hover:bg-gray-50
                dark:hover:bg-gray-875
              "
              @click="openList(count.entityType)"
            >
              <p class="font-medium text-sm dark:text-gray-100">
                {{ typeLabel(count.entityType) }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ t`${String(count.count)} records` }}
              </p>
            </button>
          </div>

          <!-- Manifest-driven processing status: partial/failed extracts -->
          <template v-if="processingStatusItems.length">
            <h3
              class="
                mt-6
                text-sm
                font-medium
                text-gray-500
                dark:text-gray-400
                uppercase
                tracking-wide
              "
            >
              {{ t`Processing Status` }}
            </h3>
            <ul class="mt-2 space-y-1 max-w-2xl">
              <li
                v-for="(item, i) in processingStatusItems"
                :key="i"
                class="text-sm text-gray-700 dark:text-gray-200"
              >
                <span class="text-yellow-700 dark:text-yellow-300">•</span>
                {{ item }}
              </li>
            </ul>
          </template>

          <template v-if="status.snapshotNames?.length">
            <h3
              class="
                mt-6
                text-sm
                font-medium
                text-gray-500
                dark:text-gray-400
                uppercase
                tracking-wide
              "
            >
              {{ t`Report Snapshots` }}
            </h3>
            <div class="mt-2 flex flex-wrap gap-2">
              <Button
                v-for="name in status.snapshotNames"
                :key="name"
                @click="openSnapshot(name)"
              >
                {{ snapshotLabel(name) }}
              </Button>
            </div>
          </template>

          <div class="mt-8 flex gap-2 border-t dark:border-gray-800 pt-4">
            <Button @click="confirmReplace">{{ t`Replace archive` }}</Button>
            <Button @click="confirmDetach">{{ t`Remove archive` }}</Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { t } from 'fyo';
import Button from 'src/components/Button.vue';
import PageHeader from 'src/components/PageHeader.vue';
import { showDialog, showToast } from 'src/utils/interactive';
import {
  attachLocalSourceBookZip,
  detachSourceBook,
  formatExportedAt,
  listCloudQbdExports,
  openCloudQbdExportSetup,
  pullSourceBookFromCloud,
  refreshSourceBookStatus,
} from 'src/utils/sourcebooks';
import { routeTo } from 'src/utils/ui';
import { entityTypeLabel } from 'utils/sourcebooks/entityTypes';
import { summarizeManifest } from 'utils/sourcebooks/manifest';
import type {
  CloudQbdExportSummary,
  SourceBookProgress,
  SourceBookRecordSummary,
  SourceBookStatus,
} from 'utils/sourcebooks/types';
import { defineComponent } from 'vue';
import ArchiveRecordTable from './ArchiveRecordTable.vue';
import SourceBooksBanner from './SourceBooksBanner.vue';
import { searchSourceBook } from 'src/utils/sourcebooks';

type ResultGroup = {
  entityType: string;
  count: number;
  rows: SourceBookRecordSummary[];
};

export default defineComponent({
  name: 'SourceBooksLanding',
  components: { ArchiveRecordTable, Button, PageHeader, SourceBooksBanner },
  data() {
    return {
      status: null as SourceBookStatus | null,
      busy: false,
      progress: null as SourceBookProgress | null,
      showAttachOptions: false,
      cloudChecked: false,
      cloudError: '',
      cloudExports: [] as CloudQbdExportSummary[],
      query: '',
      entityTypeFilter: '',
      dateFrom: '',
      dateTo: '',
      searchRows: [] as SourceBookRecordSummary[],
      searchGroups: [] as { entityType: string; count: number }[],
      searchTotal: 0,
      searchDebounce: 0 as unknown as ReturnType<typeof setTimeout> | 0,
      progressListener: null as
        | ((event: unknown, progress: SourceBookProgress) => void)
        | null,
    };
  },
  computed: {
    progressLabel(): string {
      const p = this.progress;
      if (!p) {
        return t`Starting…`;
      }
      if (p.stage === 'downloading') {
        const mb = ((p.bytes ?? 0) / (1024 * 1024)).toFixed(1);
        return t`Downloading archive from Cloud… ${mb} MB`;
      }
      if (p.stage === 'copying') {
        return t`Copying ZIP into the archive folder…`;
      }
      if (p.stage === 'indexing') {
        const type = p.entityType ? entityTypeLabel(p.entityType) : '';
        return t`Indexing ${type}… ${String(p.count ?? 0)} records`;
      }
      return t`Finishing…`;
    },
    /** Per-entity partial/failed status + not-extractable notes from manifest.json. */
    processingStatusItems(): string[] {
      const summary = summarizeManifest(this.status?.meta?.manifestJson);
      if (!summary) {
        return [];
      }
      const items: string[] = [];
      const seen = new Set<string>();
      for (const entity of summary.entities) {
        if (!entity.failed && !entity.partial) {
          continue;
        }
        seen.add(entity.entityType);
        const label = entityTypeLabel(entity.entityType);
        const message =
          entity.error ??
          summary.errors.find((e) => e.entityType === entity.entityType)
            ?.message;
        if (entity.failed) {
          items.push(
            message
              ? t`${label} did not export — ${message}`
              : t`${label} did not export`
          );
        } else {
          items.push(t`${label} exported partially`);
        }
      }
      for (const error of summary.errors) {
        if (!seen.has(error.entityType)) {
          const label = entityTypeLabel(error.entityType);
          items.push(t`${label} did not export — ${error.message}`);
        }
      }
      for (const note of summary.notExtractable) {
        items.push(t`Not extractable from QBD: ${note}`);
      }
      return items;
    },
    groupedResults(): ResultGroup[] {
      const byType = new Map<string, SourceBookRecordSummary[]>();
      for (const row of this.searchRows) {
        const list = byType.get(row.entityType) ?? [];
        list.push(row);
        byType.set(row.entityType, list);
      }
      return this.searchGroups
        .filter((g) => byType.has(g.entityType))
        .map((g) => ({
          entityType: g.entityType,
          count: g.count,
          rows: byType.get(g.entityType) ?? [],
        }));
    },
  },
  async mounted() {
    this.status = await refreshSourceBookStatus();
    this.busy = !!this.status.busy;
    this.progressListener = (_event, progress) => {
      this.progress = progress;
      if (progress.stage === 'done' || progress.stage === 'error') {
        void this.reload();
      } else {
        this.busy = true;
      }
    };
    ipc.registerSourceBooksProgressListener(
      this.progressListener as Parameters<
        typeof ipc.registerSourceBooksProgressListener
      >[0]
    );
  },
  unmounted() {
    if (this.progressListener) {
      ipc.unregisterSourceBooksProgressListener(
        this.progressListener as Parameters<
          typeof ipc.unregisterSourceBooksProgressListener
        >[0]
      );
    }
  },
  methods: {
    t,
    formatExportedAt,
    typeLabel(entityType: string): string {
      return entityTypeLabel(entityType);
    },
    snapshotLabel(name: string): string {
      return entityTypeLabel(name);
    },
    extractingLabel(exp: CloudQbdExportSummary): string {
      const pct = exp.progressPercentage;
      return pct !== undefined
        ? t`Extracting… ${String(Math.round(pct))}%`
        : t`Extracting…`;
    },
    async reload(): Promise<void> {
      this.busy = false;
      this.showAttachOptions = false;
      this.status = await refreshSourceBookStatus();
    },
    openCloudSetup(): void {
      openCloudQbdExportSetup();
    },
    async checkCloudExports(): Promise<void> {
      this.cloudError = '';
      this.cloudChecked = false;
      const result = await listCloudQbdExports();
      this.cloudChecked = true;
      if (!result.ok) {
        this.cloudError = result.error;
        return;
      }
      this.cloudExports = result.exports;
    },
    async pull(exp: CloudQbdExportSummary): Promise<void> {
      if (this.status?.attached && !(await this.confirmReplaceDialog())) {
        return;
      }
      this.busy = true;
      const result = await pullSourceBookFromCloud(exp);
      if (!result.ok) {
        showToast({ type: 'error', message: result.error });
      }
      await this.reload();
    },
    async attachLocalZip(): Promise<void> {
      const { filePaths, canceled } = await ipc.getOpenFilePath({
        title: t`Select a QBD export ZIP`,
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
        properties: ['openFile'],
      });
      const zipPath = filePaths?.[0];
      if (canceled || !zipPath) {
        return;
      }
      if (this.status?.attached && !(await this.confirmReplaceDialog())) {
        return;
      }
      this.busy = true;
      const result = await attachLocalSourceBookZip(zipPath);
      if (!result.ok) {
        showToast({ type: 'error', message: result.error });
      }
      await this.reload();
    },
    async confirmReplaceDialog(): Promise<boolean> {
      let confirmed = false;
      await showDialog({
        title: t`Replace the current QBD Archive?`,
        type: 'warning',
        detail: t`One archive per company file: the current archive and its index will be replaced, not merged. Records you copied to your live books are kept.`,
        buttons: [
          {
            label: t`Replace`,
            action: () => {
              confirmed = true;
            },
            isPrimary: true,
          },
          { label: t`Cancel`, action: () => null, isEscape: true },
        ],
      });
      return confirmed;
    },
    confirmReplace(): void {
      this.showAttachOptions = true;
      this.cloudChecked = false;
      this.cloudExports = [];
    },
    async confirmDetach(): Promise<void> {
      await showDialog({
        title: t`Remove the QBD Archive?`,
        type: 'warning',
        detail: t`This deletes the archive ZIP and its search index from this computer. Your live books are not affected.`,
        buttons: [
          {
            label: t`Remove`,
            action: async () => {
              const result = await detachSourceBook();
              if (!result.ok) {
                showToast({ type: 'error', message: result.error });
              }
              await this.reload();
            },
            isPrimary: true,
          },
          { label: t`Cancel`, action: () => null, isEscape: true },
        ],
      });
    },
    onQueryInput(): void {
      if (this.searchDebounce) {
        clearTimeout(this.searchDebounce);
      }
      this.searchDebounce = setTimeout(() => void this.runSearch(), 250);
    },
    async runSearch(): Promise<void> {
      if (!this.query.trim()) {
        this.searchRows = [];
        this.searchGroups = [];
        this.searchTotal = 0;
        return;
      }
      const result = await searchSourceBook({
        query: this.query,
        entityType: this.entityTypeFilter || undefined,
        dateFrom: this.dateFrom || undefined,
        dateTo: this.dateTo || undefined,
        limit: 100,
      });
      this.searchRows = result.rows;
      this.searchGroups = result.groupCounts;
      this.searchTotal = result.total;
    },
    openList(entityType: string): void {
      void routeTo(`/source-books/list/${entityType}`);
    },
    openSnapshot(name: string): void {
      void routeTo(`/source-books/report/${encodeURIComponent(name)}`);
    },
  },
});
</script>

<style scoped>
.step-badge {
  @apply flex h-6 w-6 flex-none items-center justify-center rounded-full
    bg-blue-100 text-xs font-semibold text-blue-700;
}
.archive-date-input {
  @apply rounded border px-2 py-2 text-sm bg-white;
}
</style>
