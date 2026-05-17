<template>
  <div class="flex flex-col h-full overflow-hidden">
    <PageHeader :title="`${t`Reconcile`} ${accountTitle}`">
      <Button type="secondary" class="me-2" @click="saveForLater">
        {{ t`Save for Later` }}
      </Button>
      <Button type="primary" :disabled="!canFinish" @click="finishReconcile">
        {{ t`Finish Reconcile` }}
      </Button>
    </PageHeader>

    <div
      class="
        flex-1
        overflow-y-auto overflow-x-hidden
        custom-scroll custom-scroll-thumb1
      "
    >
      <div class="p-4 max-w-6xl mx-auto space-y-4">
        <p class="text-sm text-gray-600 dark:text-gray-300">
          {{
            t`Enter your statement details, then match withdrawals to Money out and deposits to Money in—the same layout as most bank PDFs.`
          }}
        </p>

        <!-- Statement setup + live totals on one page -->
        <div
          class="
            border border-gray-200
            dark:border-gray-700
            rounded-lg
            bg-white
            dark:bg-gray-900
            overflow-hidden
          "
        >
          <div class="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 class="text-base font-medium mb-1 dark:text-gray-100">
              {{ t`Statement setup` }}
            </h2>
            <p class="text-sm text-gray-600 dark:text-gray-300">
              {{
                t`Period end and ending balance come from your bank PDF. Beginning balance is from your last completed reconcile.`
              }}
            </p>
          </div>
          <div class="p-4 space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label class="block">
                <span
                  class="
                    block
                    text-xs
                    font-medium
                    text-gray-700
                    dark:text-gray-300
                    mb-1
                  "
                >
                  {{ t`Statement ending date` }}
                </span>
                <input
                  v-model="statementEndingDate"
                  type="date"
                  class="
                    w-full
                    border border-gray-300
                    dark:border-gray-700
                    rounded
                    p-1.5
                    text-sm
                    bg-white
                    dark:bg-gray-800 dark:text-gray-100
                  "
                />
                <span
                  class="block text-xs text-gray-500 dark:text-gray-400 mt-1"
                >
                  {{
                    t`Only transactions on or before this date appear below.`
                  }}
                </span>
              </label>
              <label class="block">
                <span
                  class="
                    block
                    text-xs
                    font-medium
                    text-gray-700
                    dark:text-gray-300
                    mb-1
                  "
                >
                  {{ t`Beginning balance` }}
                </span>
                <input
                  :value="formatMoney(beginningBalance)"
                  type="text"
                  readonly
                  class="
                    w-full
                    border border-gray-200
                    dark:border-gray-700
                    rounded
                    p-1.5
                    text-sm
                    bg-gray-50
                    dark:bg-gray-800
                    text-gray-700
                    dark:text-gray-200
                    cursor-not-allowed
                  "
                />
                <span
                  class="block text-xs text-gray-500 dark:text-gray-400 mt-1"
                >
                  {{ t`From your last reconcile (locked).` }}
                </span>
              </label>
              <label class="block">
                <span
                  class="
                    block
                    text-xs
                    font-medium
                    text-gray-700
                    dark:text-gray-300
                    mb-1
                  "
                >
                  {{ t`Ending balance` }}
                </span>
                <input
                  v-model.number="endingBalanceInput"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  class="
                    w-full
                    border border-gray-300
                    dark:border-gray-700
                    rounded
                    p-1.5
                    text-sm
                    bg-white
                    dark:bg-gray-800 dark:text-gray-100
                  "
                />
                <span
                  class="block text-xs text-gray-500 dark:text-gray-400 mt-1"
                >
                  {{ t`Closing balance on your statement (the target).` }}
                </span>
              </label>
            </div>

            <div
              class="
                grid grid-cols-1
                md:grid-cols-3
                gap-3
                pt-3
                border-t border-gray-100
                dark:border-gray-800
              "
            >
              <div>
                <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">
                  {{ t`Ending balance (target)` }}
                </div>
                <div class="text-lg font-medium tabular-nums">
                  {{ formatMoney(targetBalance) }}
                </div>
              </div>
              <div>
                <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">
                  {{ t`Cleared balance` }}
                </div>
                <div class="text-lg font-medium tabular-nums">
                  {{ formatMoney(clearedBalance) }}
                </div>
              </div>
              <div>
                <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">
                  {{ t`Difference` }}
                </div>
                <div
                  class="text-lg font-semibold tabular-nums"
                  :class="differenceClass"
                >
                  {{ formatMoney(difference) }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="unreviewedCount > 0"
          class="
            rounded
            border-l-4 border-amber-400
            bg-amber-50
            dark:bg-amber-900/25
            p-3
            text-sm text-amber-900
            dark:text-amber-100
          "
        >
          <span aria-hidden="true">⚠️</span>
          {{
            t`You have ${unreviewedCount} unreviewed transactions in your Bank Feed dated on or before this statement. You may want to review those first, or your reconcile might not balance.`
          }}
          <button
            type="button"
            class="ms-2 underline hover:opacity-80"
            @click="goToBankFeed"
          >
            {{ t`Open Bank Feed` }}
          </button>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          <!-- Money out -->
          <div
            class="
              border border-gray-200
              dark:border-gray-700
              rounded-lg
              bg-white
              dark:bg-gray-900
              overflow-hidden
            "
          >
            <div
              class="
                p-3
                border-b border-gray-200
                dark:border-gray-700
                bg-gray-50
                dark:bg-gray-800
              "
            >
              <h2 class="text-sm font-medium dark:text-gray-100">
                {{ t`Money out` }}
              </h2>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {{
                  t`Withdrawals and expenses (match the withdrawals column on your statement).`
                }}
              </p>
            </div>
            <div v-if="loadingEntries" class="p-3 text-sm text-gray-600">
              {{ t`Loading transactions…` }}
            </div>
            <div
              v-else-if="loadError"
              class="p-3 text-sm text-red-600 dark:text-red-400"
            >
              {{ loadError }}
            </div>
            <table v-else class="min-w-full text-sm text-start">
              <thead class="text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th class="p-2 w-10 text-start">{{ t`Clear` }}</th>
                  <th class="text-start p-2">{{ t`Date` }}</th>
                  <th class="text-start p-2">{{ t`Reference` }}</th>
                  <th class="text-start p-2">{{ t`Payee` }}</th>
                  <th class="text-start p-2">{{ t`Amount` }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in moneyOutEntries"
                  :key="row.name"
                  class="
                    border-t border-gray-100
                    dark:border-gray-800
                    hover:bg-gray-50
                    dark:hover:bg-gray-800/60
                  "
                >
                  <td class="p-2 text-start">
                    <input
                      type="checkbox"
                      :checked="!!checked[row.name]"
                      @change="toggleChecked(row.name)"
                    />
                  </td>
                  <td class="p-2 whitespace-nowrap tabular-nums">
                    {{ formatDateDMY(row.date) }}
                  </td>
                  <td class="p-2 text-gray-600 dark:text-gray-400">
                    {{ row.referenceShort || t`—` }}
                  </td>
                  <td class="p-2">{{ row.payee || t`—` }}</td>
                  <td class="p-2 text-start tabular-nums">
                    {{ formatOutAmount(row.signed) }}
                  </td>
                </tr>
                <tr v-if="!moneyOutEntries.length && !loadingEntries">
                  <td
                    colspan="5"
                    class="p-3 text-sm text-gray-500 dark:text-gray-400"
                  >
                    {{ t`No withdrawals in this period.` }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Money in -->
          <div
            class="
              border border-gray-200
              dark:border-gray-700
              rounded-lg
              bg-white
              dark:bg-gray-900
              overflow-hidden
            "
          >
            <div
              class="
                p-3
                border-b border-gray-200
                dark:border-gray-700
                bg-gray-50
                dark:bg-gray-800
              "
            >
              <h2 class="text-sm font-medium dark:text-gray-100">
                {{ t`Money in` }}
              </h2>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {{
                  t`Deposits and income (match the deposits column on your statement).`
                }}
              </p>
            </div>
            <div v-if="loadingEntries" class="p-3 text-sm text-gray-600">
              {{ t`Loading transactions…` }}
            </div>
            <div
              v-else-if="loadError"
              class="p-3 text-sm text-red-600 dark:text-red-400"
            >
              {{ loadError }}
            </div>
            <table v-else class="min-w-full text-sm text-start">
              <thead class="text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th class="p-2 w-10 text-start">{{ t`Clear` }}</th>
                  <th class="text-start p-2">{{ t`Date` }}</th>
                  <th class="text-start p-2">{{ t`Description` }}</th>
                  <th class="text-start p-2">{{ t`Amount` }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in moneyInEntries"
                  :key="row.name"
                  class="
                    border-t border-gray-100
                    dark:border-gray-800
                    hover:bg-gray-50
                    dark:hover:bg-gray-800/60
                  "
                >
                  <td class="p-2 text-start">
                    <input
                      type="checkbox"
                      :checked="!!checked[row.name]"
                      @change="toggleChecked(row.name)"
                    />
                  </td>
                  <td class="p-2 whitespace-nowrap tabular-nums">
                    {{ formatDateDMY(row.date) }}
                  </td>
                  <td class="p-2">{{ row.payee || t`—` }}</td>
                  <td
                    class="
                      p-2
                      text-start
                      tabular-nums
                      text-emerald-700
                      dark:text-emerald-400
                      font-medium
                    "
                  >
                    {{ formatInAmount(row.signed) }}
                  </td>
                </tr>
                <tr v-if="!moneyInEntries.length && !loadingEntries">
                  <td
                    colspan="4"
                    class="p-3 text-sm text-gray-500 dark:text-gray-400"
                  >
                    {{ t`No deposits in this period.` }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Ghost row: add fee / interest without leaving the page -->
        <div
          class="
            border border-dashed border-gray-300
            dark:border-gray-600
            rounded-lg
            bg-amber-50/40
            dark:bg-amber-900/15
            p-3
          "
        >
          <h3 class="text-sm font-medium dark:text-gray-100 mb-2">
            {{ t`Add a missing transaction` }}
          </h3>
          <p class="text-xs text-gray-600 dark:text-gray-400 mb-3">
            {{
              t`Use for bank fees, interest, or anything on the statement that is not in your books yet. Saving posts a journal entry and marks the new line cleared.`
            }}
          </p>
          <div
            class="
              grid grid-cols-1
              sm:grid-cols-2
              lg:grid-cols-6
              gap-2
              items-end
            "
          >
            <label class="block sm:col-span-1">
              <span class="text-xs text-gray-600 dark:text-gray-400">{{
                t`Date`
              }}</span>
              <input
                v-model="addRow.date"
                type="date"
                class="
                  mt-0.5
                  w-full
                  border border-gray-300
                  dark:border-gray-700
                  rounded
                  p-1.5
                  text-sm
                  bg-white
                  dark:bg-gray-800 dark:text-gray-100
                "
              />
            </label>
            <label class="block sm:col-span-1 lg:col-span-2">
              <span class="text-xs text-gray-600 dark:text-gray-400">{{
                t`Payee`
              }}</span>
              <input
                v-model="addRow.payee"
                type="text"
                :placeholder="t`e.g. Monthly service fee`"
                class="
                  mt-0.5
                  w-full
                  border border-gray-300
                  dark:border-gray-700
                  rounded
                  p-1.5
                  text-sm
                  bg-white
                  dark:bg-gray-800 dark:text-gray-100
                "
              />
            </label>
            <label class="block sm:col-span-1 lg:col-span-2">
              <span class="text-xs text-gray-600 dark:text-gray-400">{{
                t`Category`
              }}</span>
              <select
                v-model="addRow.category"
                class="
                  mt-0.5
                  w-full
                  border border-gray-300
                  dark:border-gray-700
                  rounded
                  p-1.5
                  text-sm
                  bg-white
                  dark:bg-gray-800 dark:text-gray-100
                "
              >
                <option value="">{{ t`Pick a category…` }}</option>
                <optgroup :label="t`Expense`">
                  <option
                    v-for="c in categoryOptions.expense"
                    :key="`e-${c}`"
                    :value="c"
                  >
                    {{ c }}
                  </option>
                </optgroup>
                <optgroup :label="t`Income`">
                  <option
                    v-for="c in categoryOptions.income"
                    :key="`i-${c}`"
                    :value="c"
                  >
                    {{ c }}
                  </option>
                </optgroup>
              </select>
            </label>
            <label class="block sm:col-span-1">
              <span class="text-xs text-gray-600 dark:text-gray-400">{{
                t`Amount`
              }}</span>
              <input
                v-model.number="addRow.amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                class="
                  mt-0.5
                  w-full
                  border border-gray-300
                  dark:border-gray-700
                  rounded
                  p-1.5
                  text-sm text-start
                  bg-white
                  dark:bg-gray-800 dark:text-gray-100
                "
              />
            </label>
            <div class="flex gap-2 justify-end sm:col-span-2 lg:col-span-6">
              <Button
                type="primary"
                class="!text-sm"
                :disabled="addBusy || !canSaveAddRow"
                @click="saveAddRow"
              >
                {{ addBusy ? t`Saving…` : t`Save` }}
              </Button>
              <Button
                type="secondary"
                class="!text-sm"
                :disabled="addBusy"
                @click="cancelAddRow"
              >
                {{ t`Cancel` }}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Button from 'src/components/Button.vue';
import PageHeader from 'src/components/PageHeader.vue';
import { t } from 'fyo';
import { fyo } from 'src/initFyo';
import { ModelNameEnum } from 'models/types';
import { isCredit } from 'models/helpers';
import { showToast } from 'src/utils/interactive';
import { routeTo } from 'src/utils/ui';
import {
  appendClosed,
  clearDraft,
  lastReconcileFor,
  readDraft,
  reconciledEntryNamesFor,
  writeDraft,
} from 'src/utils/reconcileStore';
import { loadManualFeedStatements } from 'src/utils/bankFeedHelpers';
import { defineComponent } from 'vue';

type AleRow = {
  name: string;
  date: string;
  debit: number;
  credit: number;
  referenceType: string;
  referenceName: string;
};

type EntryRow = {
  name: string;
  date: string;
  payee: string;
  referenceShort: string;
  signed: number;
  isBankEntry: boolean;
};

function asNumber(v: unknown): number {
  if (typeof v === 'number') {
    return v;
  }
  if (v && typeof v === 'object' && 'float' in v) {
    const f = (v as { float: unknown }).float;
    return typeof f === 'number' ? f : Number(f ?? 0);
  }
  return Number(v ?? 0) || 0;
}

function isoDateOnly(v: unknown): string {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) {
      return '';
    }
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'string') {
    return v.slice(0, 10);
  }
  return '';
}

function sortEntryRows(a: EntryRow, b: EntryRow): number {
  const byDate = a.date.localeCompare(b.date);
  if (byDate !== 0) {
    return byDate;
  }
  return a.name.localeCompare(b.name);
}

export default defineComponent({
  name: 'BankReconcile',
  components: { PageHeader, Button },
  props: {
    name: { type: String, required: true },
  },
  data() {
    return {
      accountTitle: '' as string,
      accountRootType: undefined as string | undefined,
      loadingEntries: false,
      loadError: '' as string,

      statementEndingDate: '' as string,
      endingBalanceInput: null as number | null,
      beginningBalance: 0 as number,

      entries: [] as EntryRow[],
      checked: {} as Record<string, boolean>,

      unreviewedCount: 0 as number,

      addRow: {
        date: '' as string,
        payee: '' as string,
        category: '' as string,
        amount: null as number | null,
      },
      addBusy: false,
      categoryOptions: { expense: [] as string[], income: [] as string[] },

      draftRestoreApplied: false,
      bootstrapping: false as boolean,
    };
  },
  computed: {
    accountName(): string {
      try {
        return decodeURIComponent(this.name);
      } catch {
        return this.name;
      }
    },
    targetBalance(): number {
      return Number(this.endingBalanceInput ?? 0);
    },
    clearedSignedSum(): number {
      let sum = 0;
      for (const row of this.entries) {
        if (this.checked[row.name]) {
          sum += row.signed;
        }
      }
      return sum;
    },
    clearedBalance(): number {
      return this.beginningBalance + this.clearedSignedSum;
    },
    difference(): number {
      return this.targetBalance - this.clearedBalance;
    },
    differenceClass(): string {
      if (Math.abs(this.difference) < 0.005) {
        return 'text-emerald-700 dark:text-emerald-400';
      }
      return 'text-red-600 dark:text-red-400';
    },
    canFinish(): boolean {
      if (!this.statementEndingDate) {
        return false;
      }
      if (this.endingBalanceInput == null) {
        return false;
      }
      return Math.abs(this.difference) < 0.005;
    },
    canSaveAddRow(): boolean {
      return (
        !!this.addRow.date &&
        !!this.addRow.payee?.trim() &&
        !!this.addRow.category &&
        Number.isFinite(this.addRow.amount as number) &&
        (this.addRow.amount as number) !== 0
      );
    },
    moneyOutEntries(): EntryRow[] {
      return this.entries
        .filter((e) => e.signed <= 0)
        .slice()
        .sort(sortEntryRows);
    },
    moneyInEntries(): EntryRow[] {
      return this.entries
        .filter((e) => e.signed > 0)
        .slice()
        .sort(sortEntryRows);
    },
  },
  watch: {
    accountName: {
      immediate: true,
      handler() {
        void this.bootstrap();
      },
    },
    statementEndingDate() {
      if (this.bootstrapping) {
        return;
      }
      this.persistDraft();
      void this.refreshUnreviewed();
      void this.loadEntries();
    },
    endingBalanceInput() {
      if (this.bootstrapping) {
        return;
      }
      this.persistDraft();
    },
    checked: {
      deep: true,
      handler() {
        if (this.bootstrapping) {
          return;
        }
        this.persistDraft();
      },
    },
  },
  methods: {
    t,
    formatMoney(v: number): string {
      return fyo.format(Number.isFinite(v) ? v : 0, 'Currency');
    },
    formatDateDMY(iso: string): string {
      if (!iso || iso.length < 10) {
        return '';
      }
      const [y, m, d] = iso.slice(0, 10).split('-');
      if (!y || !m || !d) {
        return iso;
      }
      return `${d}/${m}/${y}`;
    },
    formatOutAmount(signed: number): string {
      return this.formatMoney(Math.abs(signed));
    },
    formatInAmount(signed: number): string {
      return `+${this.formatMoney(Math.abs(signed))}`;
    },
    goToBankFeed() {
      void routeTo(
        `/bank-feeds/activity/${encodeURIComponent(this.accountName)}`
      );
    },
    async bootstrap() {
      this.bootstrapping = true;
      this.loadError = '';
      this.draftRestoreApplied = false;
      this.entries = [];
      this.checked = {};
      this.addBusy = false;

      try {
        const acc = (await fyo.db.getAll(ModelNameEnum.Account, {
          fields: ['name', 'rootType'],
          filters: { name: this.accountName },
        })) as { name: string; rootType?: string }[];
        if (!acc.length) {
          this.loadError = t`Account not found.`;
          return;
        }
        this.accountTitle = acc[0].name;
        this.accountRootType = acc[0].rootType;
      } catch (e) {
        this.loadError = (e as Error).message;
        return;
      }

      const last = lastReconcileFor(this.accountName);
      this.beginningBalance = last?.endingBalance ?? 0;

      const draft = readDraft(this.accountName);
      if (draft?.toDate) {
        this.statementEndingDate = draft.toDate;
      }
      if (typeof draft?.endingBalance === 'number') {
        this.endingBalanceInput = draft.endingBalance;
      }

      await this.loadCategoryOptions();

      this.draftRestoreApplied = false;
      await this.loadEntries();
      await this.refreshUnreviewed();
      if (draft?.checked) {
        const restored: Record<string, boolean> = {};
        for (const row of this.entries) {
          if (draft.checked[row.name]) {
            restored[row.name] = true;
          }
        }
        this.checked = restored;
      }
      this.draftRestoreApplied = true;

      this.resetAddRow();
      this.bootstrapping = false;
    },
    async loadCategoryOptions() {
      try {
        const rows = (await fyo.db.getAll(ModelNameEnum.Account, {
          fields: ['name', 'rootType'],
          filters: { isGroup: false },
        })) as { name: string; rootType?: string }[];
        const expense: string[] = [];
        const income: string[] = [];
        for (const r of rows) {
          if (r.rootType === 'Expense') {
            expense.push(r.name);
          } else if (r.rootType === 'Income') {
            income.push(r.name);
          }
        }
        expense.sort();
        income.sort();
        this.categoryOptions = { expense, income };
      } catch {
        this.categoryOptions = { expense: [], income: [] };
      }
    },
    async loadEntries() {
      if (!this.accountTitle) {
        return;
      }
      this.loadingEntries = true;
      try {
        const filters: Record<string, unknown> = {
          account: this.accountTitle,
          reverted: false,
        };
        if (this.statementEndingDate) {
          filters.date = ['<=', this.statementEndingDate];
        }
        const rawEntries = (await fyo.db.getAllRaw(
          ModelNameEnum.AccountingLedgerEntry,
          {
            fields: [
              'name',
              'date',
              'debit',
              'credit',
              'referenceType',
              'referenceName',
            ],
            filters,
            orderBy: 'date',
            order: 'asc',
          }
        )) as Array<Record<string, unknown>>;

        const ales: AleRow[] = rawEntries.map((r) => ({
          name: String(r.name ?? ''),
          date: isoDateOnly(r.date),
          debit: asNumber(r.debit),
          credit: asNumber(r.credit),
          referenceType: String(r.referenceType ?? ''),
          referenceName: String(r.referenceName ?? ''),
        }));

        const reconciledNames = reconciledEntryNamesFor(this.accountName);
        const open = ales.filter((a) => !reconciledNames.has(a.name));

        const jeNames = Array.from(
          new Set(
            open
              .filter((a) => a.referenceType === ModelNameEnum.JournalEntry)
              .map((a) => a.referenceName)
              .filter(Boolean)
          )
        );
        const jeMap: Record<
          string,
          { entryType?: string; userRemark?: string }
        > = {};
        if (jeNames.length) {
          const jes = (await fyo.db.getAll(ModelNameEnum.JournalEntry, {
            fields: ['name', 'entryType', 'userRemark'],
            filters: { name: ['in', jeNames] },
          })) as { name: string; entryType?: string; userRemark?: string }[];
          for (const j of jes) {
            jeMap[j.name] = {
              entryType: j.entryType,
              userRemark: j.userRemark,
            };
          }
        }

        const isLiability =
          this.accountRootType &&
          isCredit(this.accountRootType as Parameters<typeof isCredit>[0]);

        const rows: EntryRow[] = open.map((a) => {
          const signed = isLiability ? a.credit - a.debit : a.debit - a.credit;
          const je = jeMap[a.referenceName];
          const payee =
            je?.userRemark?.toString().trim() ||
            (a.referenceType && a.referenceName
              ? `${a.referenceType} ${a.referenceName}`
              : t`(no description)`);
          const referenceShort = a.referenceName.trim();
          return {
            name: a.name,
            date: a.date,
            payee,
            referenceShort,
            signed,
            isBankEntry: je?.entryType === 'Bank Entry',
          };
        });
        this.entries = rows;

        if (!this.draftRestoreApplied) {
          const next: Record<string, boolean> = {};
          for (const r of rows) {
            if (r.isBankEntry) {
              next[r.name] = true;
            }
          }
          this.checked = next;
        } else {
          const next: Record<string, boolean> = {};
          for (const r of rows) {
            if (this.checked[r.name]) {
              next[r.name] = true;
            } else if (r.isBankEntry) {
              next[r.name] = true;
            }
          }
          this.checked = next;
        }
      } catch (e) {
        this.loadError = (e as Error).message;
      } finally {
        this.loadingEntries = false;
      }
    },
    async refreshUnreviewed() {
      try {
        const data = await loadManualFeedStatements(this.accountName);
        const cutoff = this.statementEndingDate || '';
        this.unreviewedCount = data.lines.filter(
          (l) => l.matchStatus === 'unmatched' && (!cutoff || l.date <= cutoff)
        ).length;
      } catch {
        this.unreviewedCount = 0;
      }
    },
    toggleChecked(name: string) {
      this.checked = { ...this.checked, [name]: !this.checked[name] };
    },
    persistDraft() {
      if (!this.accountName) {
        return;
      }
      writeDraft(this.accountName, {
        toDate: this.statementEndingDate || undefined,
        endingBalance:
          this.endingBalanceInput == null ? null : this.endingBalanceInput,
        checked: { ...this.checked },
      });
    },
    saveForLater() {
      this.persistDraft();
      showToast({
        type: 'success',
        message: t`Saved for later. Pick up where you left off any time.`,
        duration: 'short',
      });
      void routeTo('/reconcile');
    },
    finishReconcile() {
      if (!this.canFinish) {
        return;
      }
      const checkedNames = Object.keys(this.checked).filter(
        (k) => this.checked[k]
      );
      appendClosed(this.accountName, {
        toDate: this.statementEndingDate,
        endingBalance: Number(this.endingBalanceInput ?? 0),
        beginningBalance: this.beginningBalance,
        closedAt: new Date().toISOString(),
        ledgerEntryNames: checkedNames,
      });
      clearDraft(this.accountName);
      showToast({
        type: 'success',
        message: t`Reconciled ${checkedNames.length} transactions for ${this.accountName}.`,
        duration: 'short',
      });
      void routeTo('/reconcile');
    },
    resetAddRow() {
      this.addRow = {
        date: this.statementEndingDate || isoDateOnly(new Date()),
        payee: '',
        category: '',
        amount: null,
      };
    },
    cancelAddRow() {
      this.resetAddRow();
    },
    async saveAddRow() {
      if (!this.canSaveAddRow || this.addBusy) {
        return;
      }
      this.addBusy = true;
      try {
        const amount = Number(this.addRow.amount);
        const inflow = amount > 0;
        const abs = fyo.pesa(Math.abs(amount));
        const zero = fyo.pesa(0);

        const jv = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
          entryType: 'Bank Entry',
          date: this.addRow.date,
          userRemark: this.addRow.payee.trim(),
        }) as Doc;

        if (inflow) {
          await jv.append('accounts', {
            account: this.accountName,
            debit: abs,
            credit: zero,
          });
          await jv.append('accounts', {
            account: this.addRow.category,
            debit: zero,
            credit: abs,
          });
        } else {
          await jv.append('accounts', {
            account: this.addRow.category,
            debit: abs,
            credit: zero,
          });
          await jv.append('accounts', {
            account: this.accountName,
            debit: zero,
            credit: abs,
          });
        }

        const synced = await jv.sync();
        await synced.submit();

        showToast({
          type: 'success',
          message: t`Added to ledger.`,
          duration: 'short',
        });
        const before = new Set(Object.keys(this.checked));
        this.resetAddRow();
        await this.loadEntries();
        const next: Record<string, boolean> = { ...this.checked };
        for (const r of this.entries) {
          if (!before.has(r.name)) {
            next[r.name] = true;
          }
        }
        this.checked = next;
      } catch (e) {
        showToast({
          type: 'error',
          message: (e as Error).message || t`Could not add transaction.`,
        });
      } finally {
        this.addBusy = false;
      }
    },
  },
});
</script>
