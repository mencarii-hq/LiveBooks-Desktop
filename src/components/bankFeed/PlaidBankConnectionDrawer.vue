<template>
  <div class="flex flex-1 flex-col gap-4 p-1 text-sm min-h-full">
    <div v-if="!bookId" class="text-gray-600 dark:text-gray-300">
      {{ t`Sign into LiveBooks Online to manage this bank.` }}
    </div>
    <template v-else>
      <div class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {{ t`Status` }}
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <span
            class="inline-block w-2 h-2 rounded-full"
            :class="{
              'bg-emerald-500': health === 'ok',
              'bg-amber-500': health === 'stale',
              'bg-red-500': health === 'broken' || !feedRow,
            }"
          />
          <span>{{ statusLabel }}</span>
          <span v-if="lastSyncLabel" class="text-gray-500">
            · {{ t`Last sync` }} {{ lastSyncLabel }}
          </span>
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          {{
            t`Refresh reloads this bank’s status and accounts from Online and applies pending batches. Reconnect only when sign-in is required again.`
          }}
        </p>
      </div>

      <div class="space-y-2 border-t dark:border-gray-700 pt-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {{ t`Actions` }}
        </p>
        <div class="flex flex-wrap gap-2">
          <Button type="primary" :disabled="refreshBusy" @click="refreshBank">
            {{ refreshBusy ? t`Refreshing…` : t`Refresh` }}
          </Button>
          <Button
            v-if="needsReconnect"
            type="secondary"
            :disabled="reconnectBusy"
            @click="$emit('reconnect', itemId)"
          >
            {{ t`Reconnect bank` }}
          </Button>
        </div>
        <div class="flex flex-wrap gap-2 mt-2">
          <Button
            type="secondary"
            :disabled="reopenBusy"
            @click="confirmReopen"
          >
            {{ reopenBusy ? t`Re-fetching…` : t`Re-fetch missing data` }}
          </Button>
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          {{
            t`Re-fetch re-opens recent Online batches so this computer can download them again. It does not pull new history from the bank.`
          }}
        </p>
      </div>

      <div
        class="
          border-t border-red-200
          dark:border-red-900/40
          pt-4
          mt-auto
          space-y-2
        "
      >
        <p
          class="
            text-xs
            font-semibold
            uppercase
            tracking-wide
            text-red-700
            dark:text-red-400
          "
        >
          {{ t`Danger zone` }}
        </p>
        <Button
          type="secondary"
          class="!text-red-700 dark:!text-red-300"
          :disabled="disconnectBusy"
          @click="confirmDisconnectBank"
        >
          {{ disconnectBusy ? t`Disconnecting…` : t`Disconnect bank` }}
        </Button>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          {{
            t`Stops online sync for every account at this bank. Ledger accounts and history are kept.`
          }}
        </p>
      </div>
    </template>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import Button from 'src/components/Button.vue';
import { t } from 'fyo';
import { showDialog, showToast } from 'src/utils/interactive';
import { fyo } from 'src/initFyo';
import { ensureLivebooksCloudBookId } from 'src/utils/livebooksCloudBook';
import {
  fetchPlaidFeedsWithStepUp,
  promptPlaidMfaTotp,
  reopenAckedPlaidImportBatches,
  type PlaidFeedItemRow,
} from 'src/utils/plaidBankFeedsApi';
import { disconnectPlaidItemLocalAndRemote } from 'src/utils/bankAccountSettings';
import { refreshFeedsNow } from 'src/utils/plaidBackgroundSync';
import { fetchPlaidLinkedAccounts } from 'src/utils/plaidLinkedAccountsApi';

export default defineComponent({
  name: 'PlaidBankConnectionDrawer',
  components: { Button },
  props: {
    itemId: { type: String, required: true },
  },
  emits: ['close', 'changed', 'reconnect'],
  data() {
    return {
      bookId: '' as string,
      feedRow: null as PlaidFeedItemRow | null,
      refreshBusy: false,
      reopenBusy: false,
      disconnectBusy: false,
      reconnectBusy: false,
    };
  },
  computed: {
    health(): 'ok' | 'stale' | 'broken' | null {
      return this.feedRow?.health ?? null;
    },
    needsReconnect(): boolean {
      return !!(
        this.feedRow?.item_login_required ||
        this.feedRow?.health === 'broken'
      );
    },
    statusLabel(): string {
      if (!this.feedRow) {
        return t`Unknown`;
      }
      if (this.feedRow.item_login_required || this.feedRow.health === 'broken') {
        return t`Needs reconnect`;
      }
      if (this.feedRow.health === 'stale') {
        return t`Stale`;
      }
      return t`Healthy`;
    },
    lastSyncLabel(): string {
      const iso = this.feedRow?.last_sync_at;
      if (!iso) {
        return '';
      }
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) {
        return iso;
      }
      return d.toLocaleString();
    },
  },
  watch: {
    itemId: {
      immediate: true,
      handler() {
        void this.bootstrap();
      },
    },
  },
  methods: {
    t,
    async bootstrap() {
      const ctx = await ensureLivebooksCloudBookId(fyo);
      this.bookId = ctx.ok ? ctx.bookId : '';
      if (!this.bookId || !this.itemId) {
        this.feedRow = null;
        return;
      }
      const res = await fetchPlaidFeedsWithStepUp(this.bookId, {
        promptTotp: () =>
          promptPlaidMfaTotp(
            t`Verify your identity to view bank feed status.`
          ),
      });
      if (res.payload) {
        this.feedRow =
          res.payload.items.find((r) => r.item_id === this.itemId) ?? null;
      }
    },
    async refreshBank() {
      if (!this.bookId || this.refreshBusy) {
        return;
      }
      this.refreshBusy = true;
      try {
        refreshFeedsNow();
        await this.bootstrap();
        await fetchPlaidLinkedAccounts(this.bookId, this.itemId);
        showToast({
          type: 'success',
          message: t`Bank refreshed.`,
          duration: 'short',
        });
        this.$emit('changed');
      } finally {
        this.refreshBusy = false;
      }
    },
    async confirmReopen() {
      if (!this.bookId) {
        return;
      }
      const name =
        this.feedRow?.institution_name?.trim() || t`this bank`;
      const confirmed = (await showDialog({
        type: 'info',
        title: t`Re-fetch missing bank data?`,
        detail: t`This re-opens recently acknowledged imports for ${name} so this computer can download them again if rows were deleted locally. Data must still exist on LiveBooks Online (typically within 90 days). It does not request new history from the bank.`,
        buttons: [
          { label: t`Cancel`, action: () => false, isEscape: true },
          { label: t`Re-fetch`, isPrimary: true, action: () => true },
        ],
      })) as boolean;
      if (!confirmed) {
        return;
      }
      this.reopenBusy = true;
      try {
        const res = await reopenAckedPlaidImportBatches(
          this.bookId,
          this.itemId,
          {
            days: 30,
            promptTotp: () =>
              promptPlaidMfaTotp(
                t`Verify your identity to re-fetch bank data.`
              ),
          }
        );
        if (!res.ok) {
          showToast({
            type: 'error',
            message: res.error ?? t`Re-fetch failed.`,
          });
          return;
        }
        if ((res.reopenedCount ?? 0) === 0) {
          showToast({
            type: 'info',
            message: t`Nothing to re-fetch in the last ${String(
              res.days ?? 30
            )} days, or those batches were already deleted from LiveBooks Online.`,
          });
        } else {
          showToast({
            type: 'success',
            message: t`Re-opened ${String(
              res.reopenedCount
            )} batch(es). Open Account Activity for each mapped account to merge them into For Review.`,
          });
        }
        this.$emit('changed');
      } finally {
        this.reopenBusy = false;
      }
    },
    async confirmDisconnectBank() {
      if (!this.bookId) {
        return;
      }
      const name =
        this.feedRow?.institution_name?.trim() || t`this bank`;
      const confirmed = (await showDialog({
        type: 'warning',
        title: t`Disconnect bank?`,
        detail: t`This removes the online connection for ${name}. Automatic imports will stop. Ledger accounts and history stay in your books. You can connect again later.`,
        buttons: [
          { label: t`Cancel`, action: () => false, isEscape: true },
          {
            label: t`Disconnect bank`,
            isPrimary: true,
            action: () => true,
          },
        ],
      })) as boolean;
      if (!confirmed) {
        return;
      }
      this.disconnectBusy = true;
      try {
        const res = await disconnectPlaidItemLocalAndRemote(
          this.bookId,
          this.itemId,
          {
            promptTotp: () =>
              promptPlaidMfaTotp(
                t`Verify your identity to disconnect this bank.`
              ),
          }
        );
        if (!res.ok) {
          showToast({
            type: 'error',
            message: res.error ?? t`Couldn’t disconnect this bank. Try again.`,
          });
          return;
        }
        showToast({
          type: 'success',
          message: t`Bank disconnected. You can still use manual file imports.`,
        });
        this.$emit('changed');
        this.$emit('close');
      } finally {
        this.disconnectBusy = false;
      }
    },
  },
});
</script>
