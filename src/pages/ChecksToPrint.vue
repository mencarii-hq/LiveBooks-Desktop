<template>
  <div class="flex flex-col overflow-y-hidden h-full">
    <PageHeader :title="t`Checks to Print`">
      <Button
        :disabled="!selectedNames.length || busy"
        @click="removeFromQueue"
      >
        {{ t`Remove from queue` }}
      </Button>
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
        class="
          flex
          items-end
          justify-between
          gap-4
          p-4
          border-b
          dark:border-gray-800
        "
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
        <div class="flex items-end gap-2 shrink-0">
          <FormControl
            :border="true"
            size="small"
            :show-label="true"
            :df="formatField"
            :value="format"
            class="min-w-[12rem]"
            @change="onFormatChange"
          />
          <button
            type="button"
            class="
              mb-1.5
              p-1
              rounded
              bg-transparent
              text-gray-500
              hover:text-gray-800
              dark:text-gray-400 dark:hover:text-gray-100
              shrink-0
            "
            :title="t`Open Check Printing settings`"
            @click="openCheckPrintSettings"
          >
            <feather-icon name="external-link" class="w-3.5 h-3.5" />
          </button>
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
          <div class="flex items-center">
            <div class="w-8 flex justify-end me-2 items-center min-h-row-mid">
              <Check
                :df="{
                  fieldtype: 'Check',
                  fieldname: 'selectAll',
                  label: '',
                }"
                :show-label="false"
                :value="allSelected"
                @change="onSelectAllChange"
              />
            </div>
            <Row
              ref="headerRow"
              class="flex-1 text-gray-700 dark:text-gray-300 min-h-row-mid"
              :ratio="COLUMN_RATIO"
              :grid-template-columns="gridTemplate"
              gap="0.5rem"
            >
              <div
                v-for="(col, ci) in headerCols"
                :key="col.id"
                class="cell-header relative"
                :class="col.class"
                :title="col.title || undefined"
              >
                {{ col.label }}
                <ColResizeHandle
                  v-if="ci < headerCols.length - 1"
                  :title="t`Drag to resize. Double-click to reset.`"
                  @start="startColResize(ci, $event)"
                  @reset="resetColWidths"
                />
              </div>
            </Row>
          </div>
          <p
            v-if="rows.length"
            class="text-xs text-gray-500 dark:text-gray-400 pb-1"
          >
            {{
              t`Check numbers below are a preview from this account’s next number. They are assigned when you print and saved after you confirm.`
            }}
          </p>
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
                <div
                  class="w-8 flex justify-end me-2 items-center min-h-row-mid"
                >
                  <Check
                    :df="{
                      fieldtype: 'Check',
                      fieldname: 'selectItem',
                      label: '',
                    }"
                    :show-label="false"
                    :value="selected.includes(row.name)"
                    @change="(v) => setRowSelected(row.name, !!v)"
                  />
                </div>
                <Row
                  gap="0.5rem"
                  class="
                    cursor-pointer
                    text-gray-900
                    dark:text-gray-300
                    flex-1
                    min-h-row-mid
                  "
                  :ratio="COLUMN_RATIO"
                  :grid-template-columns="gridTemplate"
                  @click="toggleRow(row.name)"
                >
                  <div class="cell-body" :title="formatDate(row.date)">
                    {{ formatDate(row.date) }}
                  </div>
                  <div
                    class="
                      cell-body
                      tabular-nums
                      text-gray-600
                      dark:text-gray-400
                    "
                    :title="t`Preview — assigned when you print`"
                  >
                    {{ row.checkNoPreview || '—' }}
                  </div>
                  <div class="cell-body gap-1">
                    <span class="truncate min-w-0">{{
                      row.partyName || '—'
                    }}</span>
                    <button
                      v-if="row.party"
                      type="button"
                      class="
                        p-0.5
                        rounded
                        bg-transparent
                        text-gray-500
                        hover:text-gray-800
                        dark:text-gray-400 dark:hover:text-gray-100
                        shrink-0
                      "
                      :title="t`Open payee`"
                      @click.stop="openPayee(row.party)"
                    >
                      <feather-icon name="external-link" class="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div class="cell-body tabular-nums">
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
import Check from 'src/components/Controls/Check.vue';
import FormControl from 'src/components/Controls/FormControl.vue';
import PageHeader from 'src/components/PageHeader.vue';
import ColResizeHandle from 'src/components/ColResizeHandle.vue';
import Row from 'src/components/Row.vue';
import {
  clampColWidth,
  clearColumnWidths,
  columnWidthsStorageKey,
  gridTemplateFromWidths,
  readColumnWidths,
  snapshotChildrenWidths,
  writeColumnWidths,
} from 'src/utils/columnWidths';
import { fyo } from 'src/initFyo';
import { ModelNameEnum } from 'models/types';
import { AccountTypeEnum } from 'models/baseModels/Account/types';
import {
  getLastRegisterBankAccount,
  setLastRegisterBankAccount,
} from 'src/utils/registerBankAccount';
import { isCheckMethod } from 'src/utils/memorizedTransactions';
import { runCheckPrintFlow } from 'src/utils/checkPrint/runCheckPrintFlow';
import {
  assignBatchNumbers,
  CheckAssignment,
} from 'src/utils/checkPrint/numbering';
import { CheckFormat } from 'src/utils/checkPrint/types';
import { loadCheckSettings } from 'src/utils/checkPrint/printChecks';
import { getPartyNameMap, partyLabel } from 'src/utils/partyNames';
import { getFormRoute, openSettings, routeTo } from 'src/utils/ui';
import { handleErrorWithDialog } from 'src/errorHandling';
import { showDialog, showToast } from 'src/utils/interactive';

type QueueRow = {
  name: string;
  date: string;
  /** Party UUID — used for openPayee routing. */
  party: string;
  /** Display label (`partyName`). */
  partyName: string;
  memo: string;
  amount: number;
  amountDisplay: string;
  bankAccount: string;
  /** Preview only — real # assigned at print (Q-AC). */
  checkNoPreview: string;
};

type ConfirmItem = CheckAssignment & { payee: string; checked: boolean };

type AccountOpt = { name: string; accountName?: string };

const COLUMN_IDS = ['date', 'checkNo', 'payee', 'amount', 'memo'] as const;
const COLUMN_RATIO = [0.9, 1.1, 1.5, 1, 1.4];
const WIDTHS_KEY = columnWidthsStorageKey('list:ChecksToPrint');

export default defineComponent({
  name: 'ChecksToPrint',
  components: { PageHeader, Button, FormControl, Row, Check, ColResizeHandle },
  data() {
    return {
      COLUMN_RATIO,
      columnWidths: null as number[] | null,
      boundColResizeMove: null as ((e: MouseEvent) => void) | null,
      boundEndColResize: null as (() => void) | null,
      resizingCol: -1,
      resizeStartX: 0,
      resizeStartWidth: 0,
      resizeMoved: false,
      bankAccount: '' as string,
      bankAccounts: [] as AccountOpt[],
      rows: [] as QueueRow[],
      selected: [] as string[],
      loading: false,
      busy: false,
      format: 'voucher' as CheckFormat,
      confirmOpen: false,
      confirmItems: [] as ConfirmItem[],
      confirmResolver: null as
        | ((value: CheckAssignment[] | null) => void)
        | null,
    };
  },
  computed: {
    headerCols() {
      return [
        { id: 'date', label: this.t`Date`, class: '', title: '' },
        {
          id: 'checkNo',
          label: this.t`Check No.`,
          class: '',
          title: this
            .t`Numbers are assigned when you print (not saved until you confirm).`,
        },
        { id: 'payee', label: this.t`Payee`, class: '', title: '' },
        { id: 'amount', label: this.t`Amount`, class: '', title: '' },
        { id: 'memo', label: this.t`Memo`, class: '', title: '' },
      ];
    },
    gridTemplate(): string | null {
      if (!this.columnWidths) {
        return null;
      }
      return gridTemplateFromWidths(this.columnWidths);
    },
    bankAccountField(): Field {
      return {
        fieldtype: 'AutoComplete',
        fieldname: 'bankAccount',
        label: this.t`Bank`,
        placeholder: this.t`Bank`,
        options: this.bankAccounts.map((a) => ({
          label: a.accountName || a.name,
          value: a.name,
        })),
      } as Field;
    },
    formatField(): Field {
      return {
        fieldtype: 'Select',
        fieldname: 'format',
        label: this.t`Check format`,
        options: [
          { label: this.t`Voucher (1 per page)`, value: 'voucher' },
          { label: this.t`3 per page`, value: 'threePerPage' },
          { label: this.t`Ledger / stub`, value: 'ledgerStub' },
        ],
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
    this.columnWidths = readColumnWidths(WIDTHS_KEY, [...COLUMN_IDS]);
    const settings = await loadCheckSettings(fyo);
    this.format = settings.activeFormat;

    try {
      this.bankAccounts = (await fyo.db.getAll(ModelNameEnum.Account, {
        fields: ['name', 'accountName'],
        filters: {
          isGroup: false,
          accountType: ['in', [AccountTypeEnum.Bank, AccountTypeEnum.Cash]],
        },
        orderBy: 'name',
        order: 'asc',
      })) as AccountOpt[];
      this.bankAccount = getLastRegisterBankAccount(
        this.bankAccounts.map((b) => b.name)
      );
    } catch {
      this.bankAccounts = [];
      this.bankAccount = '';
    }

    await this.loadRows();
  },
  unmounted() {
    this.endColResize();
  },
  methods: {
    startColResize(index: number, event: MouseEvent) {
      if (!this.columnWidths) {
        const headerRow = this.$refs.headerRow as
          | { $el?: HTMLElement }
          | undefined;
        const snapped = snapshotChildrenWidths(
          headerRow?.$el,
          COLUMN_IDS.length
        );
        if (!snapped) {
          return;
        }
        this.columnWidths = snapped;
      }
      this.resizingCol = index;
      this.resizeStartX = event.clientX;
      this.resizeStartWidth = this.columnWidths[index];
      this.resizeMoved = false;
      this.boundColResizeMove = (e: MouseEvent) => this.onColResizeMove(e);
      this.boundEndColResize = () => this.endColResize();
      window.addEventListener('mousemove', this.boundColResizeMove);
      window.addEventListener('mouseup', this.boundEndColResize);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    onColResizeMove(event: MouseEvent) {
      if (this.resizingCol < 0 || !this.columnWidths) {
        return;
      }
      const dx = event.clientX - this.resizeStartX;
      const next = clampColWidth(this.resizeStartWidth + dx);
      if (next === this.columnWidths[this.resizingCol]) {
        return;
      }
      this.resizeMoved = true;
      const widths = [...this.columnWidths];
      widths[this.resizingCol] = next;
      this.columnWidths = widths;
    },
    endColResize() {
      if (this.resizingCol < 0) {
        return;
      }
      this.resizingCol = -1;
      window.removeEventListener('mousemove', this.boundColResizeMove);
      window.removeEventListener('mouseup', this.boundEndColResize);
      this.boundColResizeMove = null;
      this.boundEndColResize = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (!this.resizeMoved || !this.columnWidths) {
        return;
      }
      try {
        writeColumnWidths(WIDTHS_KEY, [...COLUMN_IDS], this.columnWidths);
      } catch {
        /* best-effort */
      }
    },
    resetColWidths() {
      this.columnWidths = null;
      clearColumnWidths(WIDTHS_KEY);
    },
    formatDate(value: string): string {
      if (!value) return '';
      const formatted = fyo.format(value, 'Date');
      return formatted || value;
    },
    async onBankAccountChange(value: string | null) {
      this.bankAccount = value || '';
      if (this.bankAccount) {
        setLastRegisterBankAccount(this.bankAccount);
      }
      this.selected = [];
      await this.loadRows();
    },
    async openPayee(party: string) {
      if (!party) return;
      await routeTo(getFormRoute(ModelNameEnum.Party, party));
    },
    async openCheckPrintSettings() {
      await openSettings('CheckPrinting');
    },
    onFormatChange(value: string | null) {
      const next = (value || 'voucher') as CheckFormat;
      if (
        next === 'voucher' ||
        next === 'threePerPage' ||
        next === 'ledgerStub'
      ) {
        this.format = next;
      }
    },
    onSelectAllChange(value: boolean | null) {
      this.selected = value ? this.rows.map((r) => r.name) : [];
      void this.applyCheckNoPreviews();
    },
    setRowSelected(name: string, checked: boolean) {
      const idx = this.selected.indexOf(name);
      if (checked && idx < 0) {
        this.selected.push(name);
      } else if (!checked && idx >= 0) {
        this.selected.splice(idx, 1);
      }
      void this.applyCheckNoPreviews();
    },
    toggleRow(name: string) {
      this.setRowSelected(name, !this.selected.includes(name));
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
          // Pay checks store the bank on `account`.
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
          // Already filtered printLater + Pay; still require Check method.
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
            partyName: '',
            memo: p.memo || '',
            amount: amountMoney.float,
            amountDisplay: fyo.format(amountMoney as never, 'Currency'),
            bankAccount: p.account || '',
            checkNoPreview: '',
          });
        }

        // If the selected bank filter returned nothing, retry without it so a
        // mismatched account formula (Bank[0]) cannot hide queued checks.
        if (rows.length === 0 && this.bankAccount) {
          const allQueued = (await fyo.db.getAll(ModelNameEnum.Payment, {
            fields: [
              'name',
              'date',
              'party',
              'memo',
              'amount',
              'account',
              'paymentMethod',
            ],
            filters: {
              printLater: true,
              paymentType: 'Pay',
              submitted: true,
              cancelled: false,
            },
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
          for (const p of allQueued) {
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
              partyName: '',
              memo: p.memo || '',
              amount: amountMoney.float,
              amountDisplay: fyo.format(amountMoney as never, 'Currency'),
              bankAccount: p.account || '',
              checkNoPreview: '',
            });
          }
          if (rows.length > 0 && rows[0].bankAccount) {
            // Align filter + list: only keep checks for the bank we switch to.
            this.bankAccount = rows[0].bankAccount;
            setLastRegisterBankAccount(this.bankAccount);
            const bank = this.bankAccount;
            const sameBank = rows.filter((r) => r.bankAccount === bank);
            rows.splice(0, rows.length, ...sameBank);
          }
        }

        const partyNames = await getPartyNameMap(
          fyo,
          rows.map((r) => r.party)
        );
        for (const r of rows) {
          r.partyName = partyLabel(partyNames, r.party);
        }

        this.rows = rows;
        // Drop selections that are no longer in the list.
        const names = new Set(rows.map((r) => r.name));
        this.selected = this.selected.filter((n) => names.has(n));
        // Preview #s only for the selected subset (same as print).
        await this.applyCheckNoPreviews();
      } catch (error) {
        await handleErrorWithDialog(error);
      } finally {
        this.loading = false;
      }
    },
    /** Memory-only check # preview for currently selected rows (print order). */
    async applyCheckNoPreviews() {
      for (const r of this.rows) {
        r.checkNoPreview = '';
      }
      const selectedSet = new Set(this.selected);
      const toNumber = this.rows.filter((r) => selectedSet.has(r.name));
      if (!toNumber.length) return;
      try {
        const { assignments } = await assignBatchNumbers(
          fyo,
          toNumber.map((r) => ({
            paymentName: r.name,
            bankAccount: r.bankAccount,
            amount: r.amount,
          }))
        );
        const byName = new Map(
          assignments.map((a) => [a.paymentName, a.checkNumber])
        );
        for (const r of this.rows) {
          r.checkNoPreview = byName.get(r.name) || '';
        }
      } catch {
        /* leave blank */
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
          payeeByName[r.name] = r.partyName || '';
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
    async removeFromQueue() {
      if (!this.selected.length || this.busy) return;
      const count = this.selected.length;
      const ok = await showDialog({
        title: this.t`Remove from queue?`,
        detail: this.t`Removes ${String(
          count
        )} check(s) from Checks to Print. The payments stay in the books — you can print them later from the payment or add them back with Print later.`,
        buttons: [
          { label: this.t`Keep in queue`, action: () => false, isEscape: true },
          {
            label: this.t`Remove from queue`,
            action: () => true,
            isPrimary: true,
          },
        ],
      });
      if (!ok) return;

      this.busy = true;
      try {
        for (const name of [...this.selected]) {
          const payment = await fyo.doc.getDoc(ModelNameEnum.Payment, name);
          await payment.set('printLater', false);
          await payment.sync();
        }
        this.selected = [];
        showToast({
          type: 'success',
          message: this.t`Removed ${String(count)} from the print queue.`,
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
.cell-header,
.cell-body {
  min-height: var(--h-row-mid);
  display: flex;
  align-items: center;
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  padding-top: 0.375rem;
  padding-bottom: 0.375rem;
}
.cell-header {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  justify-content: flex-start;
  text-align: start;
  padding-inline-end: 0.75rem;
}
.cell-body {
  justify-content: flex-start;
  text-align: start;
}
</style>
