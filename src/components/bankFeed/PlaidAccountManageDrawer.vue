<template>
  <div class="flex flex-1 flex-col gap-4 p-1 text-sm min-h-full">
    <p class="text-xs text-gray-500 dark:text-gray-400 m-0">
      {{ institutionName }}
    </p>

    <div class="space-y-2">
      <FormControl
        :df="chartField"
        :border="true"
        size="small"
        :value="chartSelection"
        @change="onChartChange"
      />
      <div class="flex flex-wrap gap-2">
        <Button
          type="primary"
          :disabled="
            !chartSelection || chartSelection === resolvedChart || saveBusy
          "
          @click="saveMapping"
        >
          {{ saveBusy ? t`Saving…` : t`Save` }}
        </Button>
      </div>
      <p class="text-xs text-gray-500 dark:text-gray-400">
        {{
          t`Downloads post here. Change and Save if wrong — posted entries stay put. One ledger account per link.`
        }}
      </p>
    </div>

    <div class="space-y-2 border-t dark:border-gray-700 pt-4">
      <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {{ t`File import` }}
      </p>
      <Button type="secondary" :disabled="!resolvedChart" @click="emitImport">
        {{ t`Import file…` }}
      </Button>
      <p class="text-xs text-gray-500 dark:text-gray-400">
        {{ t`CSV/OFX backfill for this ledger account.` }}
      </p>
    </div>

    <div
      v-if="canSoftRemove"
      class="
        space-y-2
        border-t border-red-200
        dark:border-red-900/40
        pt-4
        mt-auto
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
        @click="confirmDisconnectAccount"
      >
        {{ disconnectBusy ? t`Disconnecting…` : t`Disconnect account` }}
      </Button>
      <p class="text-xs text-gray-500 dark:text-gray-400">
        {{
          t`Stops online sync and clears this mapping. Ledger history is kept. Reconnect to use again. Last account on this bank also disconnects the bank.`
        }}
      </p>
    </div>
    <p
      v-else
      class="
        text-xs text-amber-700
        dark:text-amber-300
        border-t
        dark:border-gray-700
        pt-4
        mt-auto
      "
    >
      {{
        t`Disconnect account isn’t available yet. Refresh feeds and try again.`
      }}
    </p>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import Button from 'src/components/Button.vue';
import FormControl from 'src/components/Controls/FormControl.vue';
import { t } from 'fyo';
import { fyo } from 'src/initFyo';
import { ModelNameEnum } from 'models/types';
import { AccountTypeEnum } from 'models/baseModels/Account/types';
import type { Field } from 'schemas/types';
import { showDialog, showToast } from 'src/utils/interactive';
import { ensureLivebooksCloudBookId } from 'src/utils/livebooksCloudBook';
import {
  fetchPlaidFeedsWithStepUp,
  plaidFeedsSupportAccountSoftRemove,
  promptPlaidMfaTotp,
  type PlaidFeedItemRow,
} from 'src/utils/plaidBankFeedsApi';
import {
  fetchPlaidLinkedAccounts,
  formatPlaidAccountLabel,
  type PlaidLinkedAccountRow,
} from 'src/utils/plaidLinkedAccountsApi';
import {
  isPlaidCreditAccount,
  loadPlaidAccountMaps,
} from 'src/utils/bankFeedHelpers';
import { accountDisplayName } from 'utils/accountDisplay';
import { disconnectPlaidAccountFeedLocalAndRemote } from 'src/utils/bankAccountSettings';
import { FEED_AND_RECONCILE_ACCOUNT_TYPES } from 'src/utils/registerAccountTypes';

export default defineComponent({
  name: 'PlaidAccountManageDrawer',
  components: { Button, FormControl },
  props: {
    itemId: { type: String, required: true },
    plaidAccountId: { type: String, required: true },
  },
  emits: ['close', 'changed', 'import-file'],
  data() {
    return {
      bookId: '' as string,
      feedRow: null as PlaidFeedItemRow | null,
      linked: null as PlaidLinkedAccountRow | null,
      chartAccounts: [] as { name: string; accountName?: string; accountType?: string }[],
      chartSelection: '' as string,
      resolvedChart: '' as string,
      canSoftRemove: false,
      saveBusy: false,
      disconnectBusy: false,
      liveAccountCount: 0,
    };
  },
  computed: {
    institutionName(): string {
      return this.feedRow?.institution_name?.trim() || t`Online bank`;
    },
    accountLabel(): string {
      return this.linked
        ? formatPlaidAccountLabel(this.linked)
        : this.plaidAccountId;
    },
    isLastLiveAccount(): boolean {
      return this.liveAccountCount <= 1;
    },
    chartField(): Field {
      const options = this.chartAccounts.map((coa) => ({
        label: accountDisplayName(coa),
        value: coa.name,
      }));
      return {
        fieldtype: 'AutoComplete',
        fieldname: 'chartAccount',
        label: t`Ledger account`,
        placeholder: t`Select ledger account…`,
        options,
      } as Field;
    },
  },
  watch: {
    itemId: { immediate: true, handler() { void this.bootstrap(); } },
    plaidAccountId() { void this.bootstrap(); },
  },
  methods: {
    t,
    onChartChange(value: string | null) {
      this.chartSelection = value || '';
    },
    emitImport() {
      if (!this.resolvedChart) {
        return;
      }
      this.$emit('import-file', this.resolvedChart);
    },
    async bootstrap() {
      const ctx = await ensureLivebooksCloudBookId(fyo);
      this.bookId = ctx.ok ? ctx.bookId : '';
      if (!this.bookId || !this.itemId || !this.plaidAccountId) {
        return;
      }
      const feeds = await fetchPlaidFeedsWithStepUp(this.bookId, {
        promptTotp: () =>
          promptPlaidMfaTotp(
            t`Verify your identity to manage this account.`
          ),
      });
      this.canSoftRemove = plaidFeedsSupportAccountSoftRemove(
        feeds.payload?.items
      );
      this.feedRow =
        feeds.payload?.items.find((r) => r.item_id === this.itemId) ?? null;

      const linkedRes = await fetchPlaidLinkedAccounts(
        this.bookId,
        this.itemId
      );
      this.liveAccountCount = linkedRes.accounts.length;
      this.linked =
        linkedRes.accounts.find((a) => a.account_id === this.plaidAccountId) ??
        null;

      const allChart = (await fyo.db.getAll(ModelNameEnum.Account, {
        fields: ['name', 'accountName', 'accountType'],
        filters: {
          accountType: ['in', [...FEED_AND_RECONCILE_ACCOUNT_TYPES]],
          isGroup: false,
        },
      })) as { name: string; accountName?: string; accountType?: string }[];

      // Plaid credit → prefer CreditCard COA rows in the picker (Bank still listed).
      const preferCc = isPlaidCreditAccount(
        this.linked?.type,
        this.linked?.subtype
      );
      this.chartAccounts = preferCc
        ? [
            ...allChart.filter(
              (a) => a.accountType === AccountTypeEnum.CreditCard
            ),
            ...allChart.filter(
              (a) => a.accountType !== AccountTypeEnum.CreditCard
            ),
          ]
        : allChart;

      const maps = await loadPlaidAccountMaps();
      const map = maps.find(
        (m) =>
          m.plaidItemId === this.itemId &&
          m.plaidAccountId === this.plaidAccountId
      );
      this.resolvedChart = map?.chartAccount || '';
      // Unmapped Plaid credit → preselect first CreditCard COA when present.
      if (
        !this.resolvedChart &&
        preferCc &&
        this.chartAccounts[0]?.accountType === AccountTypeEnum.CreditCard
      ) {
        this.chartSelection = this.chartAccounts[0].name;
      } else {
        this.chartSelection = this.resolvedChart;
      }
    },
    async saveMapping() {
      const chart = this.chartSelection;
      if (!chart) {
        showToast({
          type: 'error',
          message: t`Choose a ledger bank account before saving.`,
        });
        return;
      }
      const conflicting = (await fyo.db.getAll(
        ModelNameEnum.PlaidBankAccountMap,
        {
          filters: { chartAccount: chart },
          fields: ['plaidItemId', 'plaidAccountId', 'plaidDisplayLabel'],
        }
      )) as {
        plaidItemId: string;
        plaidAccountId: string;
        plaidDisplayLabel?: string;
      }[];
      const conflict = conflicting.find(
        (r) =>
          !(
            r.plaidItemId === this.itemId &&
            r.plaidAccountId === this.plaidAccountId
          )
      );
      if (conflict) {
        const ownerLabel =
          conflict.plaidDisplayLabel || conflict.plaidAccountId;
        showToast({
          type: 'error',
          message: t`"${chart}" is already mapped to ${ownerLabel}. Each ledger account can only be linked once.`,
        });
        return;
      }
      // Plaid credit accounts belong on CreditCard ledger accounts so
      // registers and reconcile treat them as liabilities.
      const chosen = this.chartAccounts.find((a) => a.name === chart);
      if (
        isPlaidCreditAccount(this.linked?.type, this.linked?.subtype) &&
        chosen &&
        chosen.accountType !== AccountTypeEnum.CreditCard
      ) {
        const proceed = (await showDialog({
          type: 'warning',
          title: t`Map credit card to a bank account?`,
          detail: t`"${this.accountLabel}" is a credit card at your bank, but the selected ledger account is not a credit card account. Registers and balances will treat it as a bank asset. Continue anyway?`,
          buttons: [
            { label: t`Cancel`, action: () => false, isEscape: true },
            { label: t`Map anyway`, action: () => true, isPrimary: true },
          ],
        })) as boolean;
        if (!proceed) {
          return;
        }
      }
      this.saveBusy = true;
      try {
        const label = this.accountLabel;
        const existing = (await fyo.db.getAll(
          ModelNameEnum.PlaidBankAccountMap,
          {
            filters: {
              plaidItemId: this.itemId,
              plaidAccountId: this.plaidAccountId,
            },
            fields: ['name'],
            limit: 1,
          }
        )) as { name: string }[];
        if (existing.length) {
          const doc = await fyo.doc.getDoc(
            ModelNameEnum.PlaidBankAccountMap,
            existing[0].name
          );
          await doc.set('chartAccount', chart);
          await doc.set('plaidDisplayLabel', label);
          await doc.sync();
        } else {
          const doc = fyo.doc.getNewDoc(ModelNameEnum.PlaidBankAccountMap);
          await doc.set('plaidItemId', this.itemId);
          await doc.set('plaidAccountId', this.plaidAccountId);
          await doc.set('plaidDisplayLabel', label);
          await doc.set('chartAccount', chart);
          await doc.sync();
        }
        this.resolvedChart = chart;
        showToast({ type: 'success', message: t`Mapping saved.` });
        this.$emit('changed');
      } catch (e) {
        showToast({
          type: 'error',
          message: (e as Error).message || t`Couldn’t save mapping.`,
        });
      } finally {
        this.saveBusy = false;
      }
    },
    async confirmDisconnectAccount() {
      if (!this.bookId || !this.canSoftRemove) {
        return;
      }
      const label = this.accountLabel;
      const bankName = this.institutionName;
      const detail = this.isLastLiveAccount
        ? t`"${label}" is the last account still receiving automatic imports under ${bankName}. Disconnecting it removes the whole bank connection. Ledger history stays in your books. To use online feeds again, connect the bank and map accounts.`
        : t`This removes "${label}" from the online feed under ${bankName}. Mapping is cleared. Ledger history stays in your books. To use it again, reconnect and map.`;
      const confirmed = (await showDialog({
        type: 'warning',
        title: this.isLastLiveAccount
          ? t`Disconnect last account (removes bank)?`
          : t`Disconnect account?`,
        detail,
        buttons: [
          { label: t`Cancel`, action: () => false, isEscape: true },
          {
            label: this.isLastLiveAccount
              ? t`Disconnect bank`
              : t`Disconnect account`,
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
        const res = await disconnectPlaidAccountFeedLocalAndRemote(
          this.bookId,
          this.itemId,
          this.plaidAccountId,
          {
            promptTotp: () =>
              promptPlaidMfaTotp(
                t`Verify your identity to disconnect this account.`
              ),
          }
        );
        if (!res.ok) {
          showToast({
            type: 'error',
            message:
              res.error ?? t`Couldn’t disconnect this account. Try again.`,
          });
          return;
        }
        if (res.itemRemoved) {
          showToast({
            type: 'success',
            message: t`Bank disconnected because this was the last account. You can still use manual file imports.`,
          });
        } else {
          showToast({
            type: 'success',
            message: t`Account disconnected from the online feed.`,
          });
        }
        this.$emit('changed');
        this.$emit('close');
      } finally {
        this.disconnectBusy = false;
      }
    },
  },
});
</script>
