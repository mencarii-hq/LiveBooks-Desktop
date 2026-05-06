<template>
  <div class="flex flex-col overflow-y-hidden h-full">
    <PageHeader :title="t`Bank feeds`">
      <Button class="me-2" @click="refreshAll">{{ t`Refresh` }}</Button>
    </PageHeader>
    <div
      class="
        flex-1
        overflow-y-auto overflow-x-hidden
        custom-scroll custom-scroll-thumb1
        p-4
      "
    >
      <div v-if="bookError" class="text-red-600 dark:text-red-400 text-sm mb-4">
        {{ bookError }}
      </div>

      <section class="mb-10">
        <h2 class="text-base font-medium dark:text-gray-100 mb-2">
          {{ t`LiveBooks Cloud (Plaid)` }}
        </h2>
        <p class="text-sm text-gray-700 dark:text-gray-300 mb-4 max-w-3xl">
          {{
            t`When your bank is linked in LiveBooks Cloud, new activity appears here. Open the cloud site to connect Plaid, then refresh this page to pull batches.`
          }}
        </p>
        <Button class="me-2 mb-4" type="secondary" @click="openCloudHome">
          {{ t`Open LiveBooks Cloud` }}
        </Button>

        <div
          v-if="feedsLoading"
          class="text-sm text-gray-600 dark:text-gray-400"
        >
          {{ t`Loading feeds…` }}
        </div>
        <div
          v-else-if="feedsError"
          class="text-sm text-red-600 dark:text-red-400"
        >
          {{ feedsError }}
        </div>
        <div v-else-if="feedItems.length === 0" class="text-sm text-gray-600">
          {{ t`No Plaid connections for this book in the cloud yet.` }}
        </div>
        <div v-else class="space-y-4">
          <div
            v-for="row in feedItems"
            :key="row.item_id"
            class="
              border border-gray-200
              dark:border-gray-700
              rounded-lg
              p-4
              bg-white
              dark:bg-gray-900
            "
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="font-medium">
                  {{ row.institution_name || row.item_id }}
                </p>
                <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {{ t`Last sync` }}: {{ row.last_sync_at || t`—` }} ·
                  {{ t`Feed version` }}:
                  {{ row.feed_version }}
                </p>
              </div>
              <div class="flex items-center gap-2">
                <span
                  v-if="row.pending_import_batches_count > 0"
                  class="
                    text-xs
                    font-medium
                    px-2
                    py-0.5
                    rounded-full
                    bg-amber-100
                    text-amber-900
                    dark:bg-amber-900/40 dark:text-amber-100
                  "
                >
                  {{ row.pending_import_batches_count }}
                  {{ t`pending` }}
                </span>
                <Button type="secondary" @click="toggleItem(row.item_id)">
                  {{
                    expandedItemId === row.item_id
                      ? t`Hide batches`
                      : t`View pending batches`
                  }}
                </Button>
              </div>
            </div>
            <p
              v-if="row.item_login_required"
              class="text-sm text-amber-700 dark:text-amber-300 mt-2"
            >
              {{
                t`This connection needs re-authentication in LiveBooks Cloud (Plaid login required).`
              }}
            </p>

            <div
              v-if="expandedItemId === row.item_id"
              class="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4"
            >
              <div v-if="batchListError" class="text-sm text-red-600">
                {{ batchListError }}
              </div>
              <div v-else-if="batchListLoading" class="text-sm text-gray-600">
                {{ t`Loading batches…` }}
              </div>
              <div v-else class="space-y-3">
                <div
                  v-for="b in batchesForExpanded"
                  :key="b.public_id"
                  class="
                    border border-gray-100
                    dark:border-gray-800
                    rounded
                    p-3
                  "
                >
                  <div class="flex flex-wrap justify-between gap-2 mb-2">
                    <span class="text-sm font-mono">{{ b.public_id }}</span>
                    <div class="flex gap-2">
                      <Button
                        type="secondary"
                        @click="loadPayload(b.public_id)"
                      >
                        {{ t`Preview` }}
                      </Button>
                      <Button type="primary" @click="ackBatch(b.public_id)">
                        {{ t`Acknowledge on server` }}
                      </Button>
                    </div>
                  </div>
                  <div
                    v-if="previewFor(b.public_id)?.loading"
                    class="text-xs text-gray-500"
                  >
                    {{ t`Loading…` }}
                  </div>
                  <div
                    v-else-if="previewFor(b.public_id)?.error"
                    class="text-xs text-red-600"
                  >
                    {{ previewFor(b.public_id)?.error }}
                  </div>
                  <div
                    v-else-if="previewFor(b.public_id)?.rows?.length"
                    class="overflow-x-auto max-h-64 overflow-y-auto"
                  >
                    <table
                      class="
                        min-w-full
                        text-xs
                        border-collapse border border-gray-200
                        dark:border-gray-700
                      "
                    >
                      <thead class="bg-gray-50 dark:bg-gray-800 sticky top-0">
                        <tr>
                          <th class="border p-1 text-start">{{ t`Date` }}</th>
                          <th class="border p-1 text-end">{{ t`Amount` }}</th>
                          <th class="border p-1 text-start">
                            {{ t`Description` }}
                          </th>
                          <th class="border p-1 text-start">
                            {{ t`Account` }}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="(tx, idx) in previewFor(b.public_id)!.rows"
                          :key="idx"
                        >
                          <td class="border p-1 whitespace-nowrap">
                            {{ tx.date }}
                          </td>
                          <td class="border p-1 text-end whitespace-nowrap">
                            {{ tx.amount }} {{ tx.currency }}
                          </td>
                          <td class="border p-1">{{ tx.name }}</td>
                          <td class="border p-1 font-mono">
                            {{ tx.account_id }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                <p
                  v-if="!batchesForExpanded.length"
                  class="text-sm text-gray-600"
                >
                  {{ t`No pending batches for this connection.` }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 class="text-base font-medium dark:text-gray-100 mb-2">
          {{ t`Import from file (CSV)` }}
        </h2>
        <p class="text-sm text-gray-700 dark:text-gray-300 mb-4 max-w-3xl">
          {{
            t`For banks without Plaid, export activity as CSV (or save a spreadsheet as CSV), then use the Import Wizard to create payments or journal entries.`
          }}
        </p>
        <div class="flex flex-wrap gap-2">
          <Button type="primary" @click="goImportPayment">
            {{ t`Import payments` }}
          </Button>
          <Button type="secondary" @click="goImportJournal">
            {{ t`Import journal entries` }}
          </Button>
        </div>
      </section>
    </div>
  </div>
</template>

<script lang="ts">
import Button from 'src/components/Button.vue';
import PageHeader from 'src/components/PageHeader.vue';
import { t } from 'fyo';
import { fyo } from 'src/initFyo';
import { openLivebooksCloudHome } from 'src/utils/livebooksCloud';
import { ensureLivebooksCloudBookId } from 'src/utils/livebooksCloudBook';
import {
  ackImportBatch,
  fetchImportBatchPayload,
  fetchPendingImportBatches,
  fetchPlaidFeeds,
  type ImportBatchListRow,
  type PlaidFeedItemRow,
} from 'src/utils/plaidBankFeedsApi';
import { routeTo } from 'src/utils/ui';
import { defineComponent } from 'vue';

type TxRow = {
  date?: string;
  amount?: string;
  currency?: string;
  name?: string;
  account_id?: string;
};

type PreviewState = {
  loading: boolean;
  error?: string;
  rows?: TxRow[];
};

export default defineComponent({
  name: 'BankFeeds',
  components: { PageHeader, Button },
  data() {
    return {
      bookId: '' as string,
      bookError: '' as string,
      feedsLoading: false,
      feedsError: '' as string,
      feedItems: [] as PlaidFeedItemRow[],
      feedsEtag: undefined as string | undefined,
      expandedItemId: null as string | null,
      batchesForExpanded: [] as ImportBatchListRow[],
      batchListLoading: false,
      batchListError: '' as string,
      previewByBatch: {} as Record<string, PreviewState>,
      pollTimer: null as ReturnType<typeof setTimeout> | null,
      boundVisibility: null as (() => void) | null,
    };
  },
  computed: {
    pollIntervalMs(): number {
      const any =
        this.feedItems.some(
          (i) =>
            i.pending_import_batches_count > 0 ||
            i.sync_suggested === true
        ) ?? false;
      return any ? 30_000 : 90_000;
    },
  },
  mounted() {
    void this.bootstrap();
    this.boundVisibility = () => {
      this.onVisibility();
    };
    document.addEventListener('visibilitychange', this.boundVisibility);
  },
  beforeUnmount() {
    if (this.boundVisibility) {
      document.removeEventListener('visibilitychange', this.boundVisibility);
    }
    this.clearPoll();
  },
  methods: {
    t,
    msgSignInCloud() {
      return t`Sign in to LiveBooks Cloud from the sidebar to use bank feeds.`;
    },
    msgCloudBookResolve() {
      return t`Could not resolve your cloud book for this company file.`;
    },
    msgEmptyPayload() {
      return t`Empty payload`;
    },
    msgAckFailed() {
      return t`Ack failed`;
    },
    onVisibility() {
      if (!document.hidden) {
        void this.refreshFeeds(false);
      }
    },
    clearPoll() {
      if (this.pollTimer) {
        clearTimeout(this.pollTimer);
        this.pollTimer = null;
      }
    },
    schedulePoll() {
      this.clearPoll();
      this.pollTimer = setTimeout(() => {
        if (!document.hidden) {
          void this.refreshFeeds(true);
        }
        this.schedulePoll();
      }, this.pollIntervalMs);
    },
    async bootstrap() {
      const ctx = await ensureLivebooksCloudBookId(fyo);
      if (!ctx.ok) {
        if (ctx.reason === 'not_signed_in') {
          this.bookError = this.msgSignInCloud();
        } else {
          this.bookError =
            ctx.message ?? this.msgCloudBookResolve();
        }
        return;
      }
      this.bookId = ctx.bookId;
      await this.refreshFeeds(false);
      this.schedulePoll();
    },
    async refreshAll() {
      await this.refreshFeeds(false);
      if (this.expandedItemId) {
        await this.loadBatchesForItem(this.expandedItemId);
      }
    },
    async refreshFeeds(useEtag: boolean) {
      if (!this.bookId) {
        return;
      }
      this.feedsLoading = !useEtag;
      this.feedsError = '';
      const res = await fetchPlaidFeeds(this.bookId, {
        ifNoneMatch: useEtag ? this.feedsEtag : undefined,
      });
      this.feedsLoading = false;
      if (res.error) {
        this.feedsError = res.error;
        return;
      }
      if (res.notModified) {
        return;
      }
      if (res.payload) {
        this.feedItems = res.payload.items ?? [];
        if (res.etag) {
          this.feedsEtag = res.etag;
        }
      }
    },
    openCloudHome() {
      openLivebooksCloudHome();
    },
    goImportPayment() {
      void routeTo({ path: '/import-wizard', query: { type: 'Payment' } });
    },
    goImportJournal() {
      void routeTo({ path: '/import-wizard', query: { type: 'JournalEntry' } });
    },
    async toggleItem(itemId: string) {
      if (this.expandedItemId === itemId) {
        this.expandedItemId = null;
        this.batchesForExpanded = [];
        this.batchListError = '';
        return;
      }
      this.expandedItemId = itemId;
      await this.loadBatchesForItem(itemId);
    },
    async loadBatchesForItem(itemId: string) {
      if (!this.bookId) {
        return;
      }
      this.batchListLoading = true;
      this.batchListError = '';
      const { batches, error } = await fetchPendingImportBatches(
        this.bookId,
        itemId,
        { limit: 20 }
      );
      this.batchListLoading = false;
      if (error) {
        this.batchListError = error;
        this.batchesForExpanded = [];
        return;
      }
      this.batchesForExpanded = batches;
      this.previewByBatch = {};
    },
    previewFor(publicId: string): PreviewState | undefined {
      return this.previewByBatch[publicId];
    },
    async loadPayload(publicId: string) {
      if (!this.bookId) {
        return;
      }
      this.previewByBatch = {
        ...this.previewByBatch,
        [publicId]: { loading: true },
      };
      const { payload, error } = await fetchImportBatchPayload(
        this.bookId,
        publicId
      );
      if (error || !payload || typeof payload !== 'object') {
        this.previewByBatch = {
          ...this.previewByBatch,
          [publicId]: { loading: false, error: error ?? this.msgEmptyPayload() },
        };
        return;
      }
      const txs = (payload as { transactions?: unknown }).transactions;
      const rows: TxRow[] = [];
      if (Array.isArray(txs)) {
        for (const r of txs) {
          if (!r || typeof r !== 'object') {
            continue;
          }
          const o = r as Record<string, unknown>;
          if (o.removed === true) {
            continue;
          }
          rows.push({
            date: typeof o.date === 'string' ? o.date : undefined,
            amount: typeof o.amount === 'string' ? o.amount : String(o.amount ?? ''),
            currency: typeof o.currency === 'string' ? o.currency : undefined,
            name: typeof o.name === 'string' ? o.name : String(o.name ?? ''),
            account_id:
              typeof o.account_id === 'string' ? o.account_id : undefined,
          });
        }
      }
      this.previewByBatch = {
        ...this.previewByBatch,
        [publicId]: { loading: false, rows },
      };
    },
    async ackBatch(publicId: string) {
      if (!this.bookId) {
        return;
      }
      const { ok, error } = await ackImportBatch(this.bookId, publicId);
      if (!ok) {
        this.feedsError = error ?? this.msgAckFailed();
        return;
      }
      if (this.expandedItemId) {
        await this.loadBatchesForItem(this.expandedItemId);
      }
      await this.refreshFeeds(false);
      const next = { ...this.previewByBatch };
      delete next[publicId];
      this.previewByBatch = next;
    },
  },
});
</script>
