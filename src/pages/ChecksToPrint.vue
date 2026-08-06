<template>
  <div class="flex flex-col overflow-y-hidden h-full">
    <PageHeader :title="t`Checks to Print`">
      <Button
        :disabled="!selectedNames.length || busy"
        @click="printSelected(true)"
      >
        {{ t`Save PDF` }}
      </Button>
      <Button
        type="primary"
        :disabled="!selectedNames.length || busy"
        @click="printSelected(false)"
      >
        {{ t`Print` }}
      </Button>
    </PageHeader>

    <div class="text-base flex flex-col overflow-hidden flex-1">
      <div
        class="flex flex-wrap items-end gap-4 p-4 border-b dark:border-gray-800"
      >
        <FormControl
          :border="true"
          size="small"
          :show-label="true"
          :df="bankAccountField"
          :value="bankAccount"
          class="flex-1 max-w-md"
          @change="onBankAccountChange"
        />
        <div class="flex flex-col">
          <label class="text-xs text-gray-600 dark:text-gray-400 mb-1">
            {{ t`Check format` }}
          </label>
          <select
            v-model="format"
            class="
              text-sm
              border
              rounded
              px-2
              py-1.5
              bg-gray-25
              dark:bg-gray-850 dark:text-gray-25
            "
          >
            <option v-for="f in formats" :key="f.value" :value="f.value">
              {{ f.label }}
            </option>
          </select>
        </div>
      </div>

      <div class="flex flex-col overflow-hidden px-4 flex-1">
        <div
          v-if="loading"
          class="text-sm text-gray-600 dark:text-gray-300 py-4"
        >
          {{ t`Loading…` }}
        </div>
        <template v-else>
          <div
            class="
              flex
              items-center
              gap-3
              py-2
              text-sm text-gray-700
              dark:text-gray-300
            "
          >
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                class="h-4 w-4"
                :checked="allSelected"
                :indeterminate.prop="someSelected && !allSelected"
                @change="toggleSelectAll"
              />
              {{ t`Select all` }}
            </label>
            <span v-if="selectedNames.length" class="text-gray-500">
              {{ t`${String(selectedNames.length)} selected` }}
            </span>
          </div>

          <div
            class="flex items-center text-gray-700 dark:text-gray-300 h-row-mid"
          >
            <div class="w-8" />
            <Row class="flex-1" :ratio="[1.2, 1.6, 1, 1.6]" gap="1rem">
              <div class="cell-header">{{ t`Date` }}</div>
              <div class="cell-header">{{ t`Payee` }}</div>
              <div class="cell-header ms-auto">{{ t`Amount` }}</div>
              <div class="cell-header">{{ t`Memo` }}</div>
            </Row>
          </div>
          <hr class="dark:border-gray-800" />

          <div
            v-if="!rows.length"
            class="p-4 text-gray-600 dark:text-gray-300 text-sm"
          >
            {{
              bankAccount
                ? t`No checks queued for this account.`
                : t`No checks in the print queue.`
            }}
          </div>
          <div
            v-else
            class="
              overflow-y-auto
              dark:dark-scroll
              custom-scroll custom-scroll-thumb1
              flex-1
            "
          >
            <div v-for="(row, i) in rows" :key="row.name">
              <div
                class="
                  flex
                  hover:bg-gray-50
                  dark:hover:bg-gray-850
                  items-center
                "
              >
                <div class="w-8 flex items-center justify-start">
                  <input
                    v-model="selected"
                    type="checkbox"
                    class="h-4 w-4"
                    :value="row.name"
                  />
                </div>
                <Row
                  class="
                    flex-1
                    text-gray-900
                    dark:text-gray-300
                    h-row-mid
                    cursor-pointer
                  "
                  :ratio="[1.2, 1.6, 1, 1.6]"
                  gap="1rem"
                  @click="toggleRow(row.name)"
                >
                  <div class="cell-body">{{ formatDate(row.date) }}</div>
                  <div class="cell-body">{{ row.party }}</div>
                  <div class="cell-body ms-auto tabular-nums">
                    {{ row.amountDisplay }}
                  </div>
                  <div class="cell-body">{{ row.memo }}</div>
                </Row>
              </div>
              <hr v-if="i !== rows.length - 1" class="dark:border-gray-800" />
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- N3 / Q-AD post-print checklist confirm -->
    <div
      v-if="confirmOpen"
      class="fixed inset-0 z-30 flex items-center justify-center bg-black/40"
    >
      <div
        class="
          bg-white
          dark:bg-gray-850
          border
          dark:border-gray-800
          rounded-lg
          shadow-2xl
          w-[28rem]
          max-h-[80vh]
          flex flex-col
          p-4
          gap-3
        "
      >
        <h2 class="font-semibold text-gray-900 dark:text-gray-25">
          {{ t`Did the checks print?` }}
        </h2>
        <p class="text-sm text-gray-600 dark:text-gray-300">
          {{
            t`Uncheck any that did not print (e.g. paper jam). Only checked numbers will be saved.`
          }}
        </p>
        <div class="overflow-y-auto flex-1 space-y-2 py-1">
          <label
            v-for="item in confirmItems"
            :key="item.paymentName"
            class="flex items-center gap-2 text-sm cursor-pointer"
          >
            <input v-model="item.checked" type="checkbox" class="h-4 w-4" />
            <span class="tabular-nums font-medium"
              >#{{ item.checkNumber }}</span
            >
            <span class="text-gray-700 dark:text-gray-300 truncate">
              {{ item.payee }}
            </span>
          </label>
        </div>
        <div class="flex justify-end gap-3 mt-2">
          <Button @click="resolveConfirm(false)">{{ t`Cancel` }}</Button>
          <Button type="primary" @click="resolveConfirm(true)">
            {{ t`Confirm` }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Field } from 'schemas/types';
import { Money } from 'pesa';
import { defineComponent } from 'vue';
import Button from 'src/components/Button.vue';
import FormControl from 'src/components/Controls/FormControl.vue';
import PageHeader from 'src/components/PageHeader.vue';
import Row from 'src/components/Row.vue';
import { fyo } from 'src/initFyo';
import { ModelNameEnum } from 'models/types';
import { getLastRegisterBankAccount } from 'src/utils/registerBankAccount';
import { isCheckMethod } from 'src/utils/memorizedTransactions';
import { runCheckPrintFlow } from 'src/utils/checkPrint/runCheckPrintFlow';
import { CheckAssignment } from 'src/utils/checkPrint/numbering';
import { CheckFormat } from 'src/utils/checkPrint/types';
import { loadCheckSettings } from 'src/utils/checkPrint/printChecks';
import { handleErrorWithDialog } from 'src/errorHandling';

type QueueRow = {
  name: string;
  date: string;
  party: string;
  memo: string;
  amount: number;
  amountDisplay: string;
  bankAccount: string;
};

type ConfirmItem = CheckAssignment & { payee: string; checked: boolean };

export default defineComponent({
  name: 'ChecksToPrint',
  components: { PageHeader, Button, FormControl, Row },
  data() {
    return {
      bankAccount: '' as string,
      rows: [] as QueueRow[],
      selected: [] as string[],
      loading: false,
      busy: false,
      format: 'voucher' as CheckFormat,
      formats: [
        { value: 'voucher', label: this.t`Voucher (1 per page)` },
        { value: 'threePerPage', label: this.t`3 per page` },
        { value: 'ledgerStub', label: this.t`Ledger / stub` },
      ],
      confirmOpen: false,
      confirmItems: [] as ConfirmItem[],
      confirmResolver: null as
        | ((value: CheckAssignment[] | null) => void)
        | null,
    };
  },
  computed: {
    bankAccountField(): Field {
      return {
        fieldname: 'bankAccount',
        label: this.t`Bank Account`,
        fieldtype: 'Link',
        target: 'Account',
        filters: { accountType: 'Bank', isGroup: false },
      } as Field;
    },
    selectedNames(): string[] {
      return this.selected;
    },
    allSelected(): boolean {
      return this.rows.length > 0 && this.selected.length === this.rows.length;
    },
    someSelected(): boolean {
      return this.selected.length > 0;
    },
  },
  async mounted() {
    const settings = await loadCheckSettings(fyo);
    this.format = settings.activeFormat;

    try {
      const banks = (await fyo.db.getAll(ModelNameEnum.Account, {
        fields: ['name'],
        filters: { accountType: 'Bank', isGroup: false },
      })) as { name: string }[];
      this.bankAccount = getLastRegisterBankAccount(banks.map((b) => b.name));
    } catch {
      this.bankAccount = '';
    }

    await this.loadRows();
  },
  methods: {
    formatDate(value: string): string {
      if (!value) return '';
      const d = new Date(value);
      if (Number.isNaN(d.valueOf())) return value;
      return `${d.toLocaleString('default', {
        month: 'short',
      })} ${d.getDate()}, ${d.getFullYear()}`;
    },
    async onBankAccountChange(value: string | null) {
      this.bankAccount = value || '';
      this.selected = [];
      await this.loadRows();
    },
    toggleSelectAll(event: Event) {
      const checked = (event.target as HTMLInputElement).checked;
      this.selected = checked ? this.rows.map((r) => r.name) : [];
    },
    toggleRow(name: string) {
      const idx = this.selected.indexOf(name);
      if (idx >= 0) {
        this.selected.splice(idx, 1);
      } else {
        this.selected.push(name);
      }
    },
    async loadRows() {
      this.loading = true;
      try {
        const filters: Record<string, unknown> = {
          printLater: true,
          paymentType: 'Pay',
          submitted: true,
          cancelled: false,
        };
        if (this.bankAccount) {
          filters.account = this.bankAccount;
        }

        const payments = (await fyo.db.getAll(ModelNameEnum.Payment, {
          fields: [
            'name',
            'date',
            'party',
            'memo',
            'amount',
            'account',
            'paymentMethod',
          ],
          filters,
          orderBy: 'date',
          order: 'asc',
        })) as {
          name: string;
          date?: string;
          party?: string;
          memo?: string;
          amount?: Money | number;
          account?: string;
          paymentMethod?: string;
        }[];

        const rows: QueueRow[] = [];
        for (const p of payments) {
          if (!(await isCheckMethod(fyo, p.paymentMethod || ''))) {
            continue;
          }
          const amountMoney =
            p.amount instanceof Money
              ? p.amount
              : fyo.pesa(Number(p.amount) || 0);
          rows.push({
            name: p.name,
            date: p.date ? String(p.date) : '',
            party: p.party || '',
            memo: p.memo || '',
            amount: amountMoney.float,
            amountDisplay: fyo.format(amountMoney as never, 'Currency'),
            bankAccount: p.account || '',
          });
        }
        this.rows = rows;
        // Drop selections that are no longer in the list.
        const names = new Set(rows.map((r) => r.name));
        this.selected = this.selected.filter((n) => names.has(n));
      } catch (error) {
        await handleErrorWithDialog(error);
      } finally {
        this.loading = false;
      }
    },
    openConfirm(
      assignments: CheckAssignment[],
      payeeByName: Record<string, string>
    ): Promise<CheckAssignment[] | null> {
      this.confirmItems = assignments.map((a) => ({
        ...a,
        payee: payeeByName[a.paymentName] || a.paymentName,
        checked: true,
      }));
      this.confirmOpen = true;
      return new Promise((resolve) => {
        this.confirmResolver = resolve;
      });
    },
    resolveConfirm(ok: boolean) {
      const resolver = this.confirmResolver;
      this.confirmResolver = null;
      this.confirmOpen = false;
      if (!ok) {
        resolver?.(null);
        return;
      }
      resolver?.(
        this.confirmItems
          .filter((i) => i.checked)
          .map(({ paymentName, bankAccount, checkNumber }) => ({
            paymentName,
            bankAccount,
            checkNumber,
          }))
      );
    },
    async printSelected(asPdf: boolean) {
      if (!this.selected.length || this.busy) return;
      this.busy = true;
      try {
        const selectedSet = new Set(this.selected);
        const items = this.rows
          .filter((r) => selectedSet.has(r.name))
          .map((r) => ({
            paymentName: r.name,
            bankAccount: r.bankAccount,
            amount: r.amount,
          }));
        const payeeByName: Record<string, string> = {};
        for (const r of this.rows) {
          payeeByName[r.name] = r.party;
        }

        await runCheckPrintFlow(fyo, items, {
          asPdf,
          format: this.format,
          confirmPrinted: (assignments) =>
            this.openConfirm(assignments, payeeByName),
        });
        await this.loadRows();
      } catch (error) {
        await handleErrorWithDialog(error);
      } finally {
        this.busy = false;
      }
    },
  },
});
</script>

<style scoped>
.cell-header {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.cell-body {
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
