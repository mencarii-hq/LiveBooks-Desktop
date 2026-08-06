<template>
  <div>
    <template v-if="variant === 'chrome'">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
        <p class="text-sm text-gray-600 dark:text-gray-300 max-w-5xl">
          {{
            t`Track accounts you update by importing CSV statements. Use this for any bank or credit card you do not connect with Plaid.`
          }}
        </p>
        <Button v-if="showAddButton" type="primary" @click="$emit('open-add')">
          {{ t`Add bank` }}
        </Button>
      </div>

      <div
        v-if="showArchivedList && archivedBanks.length"
        class="
          border border-gray-200
          dark:border-gray-700
          rounded-lg
          overflow-hidden
          bg-white
          dark:bg-gray-900
          mt-4
        "
      >
        <div
          class="
            px-3
            py-2
            text-xs
            font-semibold
            uppercase
            bg-gray-50
            dark:bg-gray-800
            border-b
            dark:border-gray-700
            text-gray-700
            dark:text-gray-200
          "
        >
          {{ t`Archived` }}
        </div>
        <table class="min-w-full text-sm text-start">
          <tbody>
            <tr
              v-for="m in archivedBanks"
              :key="m.name"
              class="border-b dark:border-gray-800 last:border-0"
            >
              <td
                class="
                  p-3
                  text-start
                  font-medium
                  text-gray-500
                  dark:text-gray-400
                "
              >
                {{ manualBankLabel(m) }}
              </td>
              <td class="p-3 text-start" @click.stop>
                <Button
                  type="secondary"
                  @click="
                    runManualBankLifecycleAction(
                      m.name,
                      true,
                      manualBankLabel(m)
                    )
                  "
                >
                  {{ t`Restore` }}
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <div v-else class="space-y-3 max-w-md" @keydown.esc="$emit('close')">
      <div>
        <label class="block text-sm font-medium mb-1 dark:text-gray-100">
          {{ t`Type` }}
        </label>
        <div
          class="
            inline-flex
            border
            rounded
            overflow-hidden
            dark:border-gray-700
          "
        >
          <button
            type="button"
            class="px-3 py-1 text-sm"
            :class="
              manualForm.kind === 'bank'
                ? 'bg-gray-200 dark:bg-gray-700 font-medium'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-100'
            "
            @click="manualForm.kind = 'bank'"
          >
            {{ t`Bank` }}
          </button>
          <button
            type="button"
            class="px-3 py-1 text-sm border-s dark:border-gray-700"
            :class="
              manualForm.kind === 'credit_card'
                ? 'bg-gray-200 dark:bg-gray-700 font-medium'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-100'
            "
            @click="manualForm.kind = 'credit_card'"
          >
            {{ t`Credit card` }}
          </button>
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1 dark:text-gray-100">
          {{ t`Account name` }}
        </label>
        <input
          ref="manualNameInput"
          v-model="manualForm.accountName"
          type="text"
          class="
            border
            rounded
            px-2
            py-1
            w-full
            dark:bg-gray-800 dark:border-gray-600
          "
          :placeholder="t`e.g. Chase CSV — Checking`"
          @keydown.enter="trySaveManual"
          @input="manualNameError = ''"
        />
        <p v-if="manualNameError" class="mt-1 text-xs text-red-600">
          {{ manualNameError }}
        </p>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm font-medium mb-1 dark:text-gray-100">
            {{ t`Opening balance` }}
          </label>
          <input
            v-model="manualForm.openingBalance"
            type="text"
            inputmode="decimal"
            class="
              border
              rounded
              px-2
              py-1
              w-full
              dark:bg-gray-800 dark:border-gray-600
            "
            :placeholder="t`0.00`"
            @keydown.enter="trySaveManual"
          />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1 dark:text-gray-100">
            {{ t`As of` }}
          </label>
          <input
            v-model="manualForm.openingDate"
            type="date"
            class="
              border
              rounded
              px-2
              py-1
              w-full
              dark:bg-gray-800 dark:border-gray-600
            "
            @keydown.enter="trySaveManual"
          />
        </div>
      </div>
      <p
        v-if="manualNegativeHint"
        class="text-xs text-amber-700 dark:text-amber-300"
      >
        {{ t`This account will start with a negative balance.` }}
      </p>
      <div class="flex justify-end gap-2 pt-2">
        <Button
          type="secondary"
          :disabled="manualSaving"
          @click="$emit('close')"
        >
          {{ t`Cancel` }}
        </Button>
        <Button type="primary" :disabled="manualSaving" @click="trySaveManual">
          {{ manualSaving ? t`Saving…` : t`Save` }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Button from 'src/components/Button.vue';
import type { Action } from 'fyo/model/types';
import { t } from 'fyo';
import { fyo } from 'src/initFyo';
import { showDialog, showToast } from 'src/utils/interactive';
import {
  isManualBankAccount,
  loadAllBankCoaAccounts,
  loadArchivedBankCoaAccounts,
  loadPlaidAccountMaps,
  type BankCoaAccount,
  type PlaidMapRow,
} from 'src/utils/bankFeedHelpers';
import {
  archiveBankAccount,
  countLedgerRowsForAccount,
  deleteEmptyBankAccount,
  ledgerSignedBalanceForAccount,
  unarchiveBankAccount,
} from 'src/utils/bankAccountSettings';
import { accountDisplayName } from 'utils/accountDisplay';
import { createManualBankAccount } from 'src/utils/manualBankAccountCreate';
import { defineComponent, nextTick } from 'vue';

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export default defineComponent({
  name: 'ManualBankSetupPanel',
  components: { Button },
  props: {
    variant: {
      type: String as () => 'chrome' | 'form',
      default: 'chrome',
    },
    showArchivedList: { type: Boolean, default: true },
    showAddButton: { type: Boolean, default: true },
  },
  emits: ['changed', 'created', 'close', 'open-add'],
  data() {
    return {
      manualSaving: false,
      manualNameError: '' as string,
      manualLoading: false,
      manualBankCoaAccounts: [] as BankCoaAccount[],
      manualPlaidMaps: [] as PlaidMapRow[],
      manualLedgerRowCounts: {} as Record<string, number>,
      manualForm: {
        kind: 'bank' as 'bank' | 'credit_card',
        accountName: '',
        openingBalance: '0',
        openingDate: todayIsoDate(),
      },
    };
  },
  computed: {
    archivedBanks(): {
      name: string;
      accountName?: string;
      rootType?: string;
      archived: boolean;
    }[] {
      const out: {
        name: string;
        accountName?: string;
        rootType?: string;
        archived: boolean;
      }[] = [];
      for (const a of this.manualBankCoaAccounts) {
        if (!isManualBankAccount(a.name, this.manualPlaidMaps)) continue;
        if (a.disabled !== true) continue;
        out.push({
          name: a.name,
          accountName: a.accountName,
          rootType: a.rootType,
          archived: true,
        });
      }
      out.sort((x, y) =>
        accountDisplayName(x).localeCompare(accountDisplayName(y))
      );
      return out;
    },
    manualBalanceFloat(): number | null {
      const raw = this.manualForm.openingBalance.trim().replace(/,/g, '');
      if (raw === '') return 0;
      const n = Number.parseFloat(raw);
      return Number.isFinite(n) ? n : null;
    },
    manualNegativeHint(): boolean {
      return (
        this.manualForm.kind === 'bank' && (this.manualBalanceFloat ?? 0) < 0
      );
    },
    canSaveManual(): boolean {
      const name = this.manualForm.accountName.trim();
      return (
        !!name &&
        !!this.manualForm.openingDate &&
        this.manualBalanceFloat !== null &&
        !this.manualNameError
      );
    },
  },
  mounted() {
    void this.loadManualSection();
    if (this.variant === 'form') {
      this.resetForm();
    }
  },
  methods: {
    t,
    resetForm() {
      this.manualForm = {
        kind: 'bank',
        accountName: '',
        openingBalance: '0',
        openingDate: todayIsoDate(),
      };
      this.manualNameError = '';
      void nextTick(() => {
        const el = this.$refs.manualNameInput as HTMLInputElement | undefined;
        if (el && typeof el.focus === 'function') el.focus();
      });
    },
    manualBankLabel(m: { name: string; accountName?: string }) {
      return accountDisplayName(m);
    },
    coaDisplayLabel(accountName: string): string {
      const fromManual = this.manualBankCoaAccounts.find(
        (m) => m.name === accountName
      );
      if (fromManual) return accountDisplayName(fromManual);
      return accountName;
    },
    async loadManualSection(opts?: { quiet?: boolean }) {
      if (!opts?.quiet) this.manualLoading = true;
      try {
        this.manualPlaidMaps = await loadPlaidAccountMaps();
        const [active, archived] = await Promise.all([
          loadAllBankCoaAccounts(),
          loadArchivedBankCoaAccounts(),
        ]);
        this.manualBankCoaAccounts = [...active, ...archived];
        const ledgerCounts: Record<string, number> = {};
        for (const a of this.manualBankCoaAccounts) {
          if (!isManualBankAccount(a.name, this.manualPlaidMaps)) continue;
          try {
            ledgerCounts[a.name] = await countLedgerRowsForAccount(a.name);
          } catch {
            ledgerCounts[a.name] = 0;
          }
        }
        this.manualLedgerRowCounts = ledgerCounts;
      } finally {
        if (!opts?.quiet) this.manualLoading = false;
      }
    },
    async confirmArchiveManualBank(accountName: string, displayName?: string) {
      const label = displayName?.trim() || this.coaDisplayLabel(accountName);
      const n = await countLedgerRowsForAccount(accountName);
      if (n === 0) {
        showToast({
          type: 'info',
          message: t`This account has no ledger history — use Delete account instead.`,
        });
        await this.loadManualSection({ quiet: true });
        return;
      }
      const bal = await ledgerSignedBalanceForAccount(accountName);
      if (bal != null && Math.abs(bal) > 0.005) {
        await showDialog({
          type: 'error',
          title: t`Cannot archive this account`,
          detail: t`"${label}" still has a ${fyo.format(
            bal,
            'Currency'
          )} balance in your books. Record a transfer to zero the balance before archiving.`,
          buttons: [
            { label: t`OK`, action: () => true, isPrimary: true, isEscape: true },
          ],
        });
        return;
      }
      const ok = (await showDialog({
        type: 'warning',
        title: t`Archive this account?`,
        detail: t`Archiving hides "${label}" from your daily bank feeds and most pickers, but keeps your historical reports accurate. Unreviewed feed lines for this account will be marked excluded.`,
        buttons: [
          { label: t`Cancel`, action: () => false, isEscape: true },
          { label: t`Archive account`, isPrimary: true, action: () => true },
        ],
      })) as boolean;
      if (!ok) return;
      const ar = await archiveBankAccount(accountName);
      if (!ar.ok) {
        showToast({ type: 'error', message: ar.error });
        return;
      }
      showToast({ type: 'success', message: t`Account archived.` });
      await this.loadManualSection();
      this.$emit('changed');
    },
    async confirmRestoreManualBank(accountName: string, displayName?: string) {
      const label = displayName?.trim() || this.coaDisplayLabel(accountName);
      const ok = (await showDialog({
        type: 'info',
        title: t`Restore this account?`,
        detail: t`Restoring makes "${label}" available again in bank feeds and account pickers. You can re-connect Plaid or import statements afterward if needed.`,
        buttons: [
          { label: t`Cancel`, action: () => false, isEscape: true },
          { label: t`Restore account`, isPrimary: true, action: () => true },
        ],
      })) as boolean;
      if (!ok) return;
      const ur = await unarchiveBankAccount(accountName);
      if (!ur.ok) {
        showToast({ type: 'error', message: ur.error });
        return;
      }
      showToast({ type: 'success', message: t`Account restored.` });
      await this.loadManualSection();
      this.$emit('changed');
    },
    async confirmDeleteManualBank(accountName: string, displayName?: string) {
      const label = displayName?.trim() || this.coaDisplayLabel(accountName);
      const n = await countLedgerRowsForAccount(accountName);
      if (n > 0) {
        showToast({
          type: 'error',
          message: t`This account has ledger history and cannot be deleted. Archive it instead.`,
        });
        await this.loadManualSection({ quiet: true });
        return;
      }
      const ok = (await showDialog({
        type: 'warning',
        title: t`Delete this account?`,
        detail: t`This permanently removes "${label}" and its manual feed data from your books.`,
        buttons: [
          { label: t`Cancel`, action: () => false, isEscape: true },
          { label: t`Delete account`, isPrimary: true, action: () => true },
        ],
      })) as boolean;
      if (!ok) return;
      const del = await deleteEmptyBankAccount(accountName);
      if (!del.ok) {
        showToast({ type: 'error', message: del.error });
        return;
      }
      showToast({ type: 'success', message: t`Account deleted.` });
      await this.loadManualSection();
      this.$emit('changed');
    },
    manualBankLifecycleActions(
      accountName: string,
      archived = false,
      displayName?: string
    ): Action[] {
      if (archived) {
        return [
          {
            label: t`Restore`,
            action: async () => {
              await this.confirmRestoreManualBank(accountName, displayName);
            },
          } as Action,
        ];
      }
      const n = this.manualLedgerRowCounts[accountName] ?? 0;
      if (n === 0) {
        return [
          {
            label: t`Delete`,
            action: async () => {
              await this.confirmDeleteManualBank(accountName, displayName);
            },
          } as Action,
        ];
      }
      return [
        {
          label: t`Archive`,
          action: async () => {
            await this.confirmArchiveManualBank(accountName, displayName);
          },
        } as Action,
      ];
    },
    async runManualBankLifecycleAction(
      accountName: string,
      archived = false,
      displayName?: string
    ) {
      const [action] = this.manualBankLifecycleActions(
        accountName,
        archived,
        displayName
      );
      if (action?.action) await action.action(null as never, null as never);
    },
    /** Called by Hub for per-row archive/delete on the main bank table. */
    async runLifecycleForAccount(accountName: string, displayName?: string) {
      const archived = this.manualBankCoaAccounts.some(
        (a) => a.name === accountName && a.disabled === true
      );
      await this.runManualBankLifecycleAction(accountName, archived, displayName);
    },
    async trySaveManual() {
      if (this.manualSaving || !this.canSaveManual) {
        if (!this.canSaveManual) {
          showToast({
            type: 'error',
            message: t`Enter account name, opening date, and opening balance.`,
          });
        }
        return;
      }
      this.manualNameError = '';
      this.manualSaving = true;
      try {
        const result = await createManualBankAccount(fyo, {
          accountName: this.manualForm.accountName,
          kind: this.manualForm.kind,
          openingBalance: this.manualForm.openingBalance,
          openingDate: this.manualForm.openingDate,
        });
        if (!result.ok) {
          if (result.error === t`An account with this name already exists.`) {
            this.manualNameError = result.error;
          } else {
            showToast({ type: 'error', message: result.error });
          }
          return;
        }
        if (result.openingBalanceWarning) {
          showToast({ type: 'error', message: result.openingBalanceWarning });
        }
        showToast({ type: 'success', message: t`Manual bank added.` });
        await this.loadManualSection();
        this.$emit('created', { accountName: result.accountName });
        this.$emit('close');
        this.$emit('changed');
      } finally {
        this.manualSaving = false;
      }
    },
  },
});
</script>
