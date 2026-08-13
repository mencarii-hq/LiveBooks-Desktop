<template>
  <div class="flex flex-col overflow-y-hidden h-full">
    <PageHeader :title="t`Check Register`">
      <Button :icon="false" @click="goChecksToPrint">
        {{ t`Checks to Print` }}
      </Button>
      <Button ref="exportButton" :icon="false" @click="openExportModal = true">
        {{ t`Export` }}
      </Button>
      <FilterDropdown
        :schema-name="ModelNameEnum.AccountingLedgerEntry"
        :exclude-fields="['account']"
        :include-fields="[
          'party',
          'date',
          'debit',
          'credit',
          'referenceType',
          'referenceName',
          'cleared',
          'reconciled',
        ]"
        @change="applyFilter"
      />
      <Button
        type="primary"
        :icon="true"
        :padding="false"
        class="px-3"
        :disabled="!bankAccount"
        @click="goWriteEntry"
      >
        <feather-icon name="plus" class="w-4 h-4" />
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
        <FormControl
          v-if="bankAccount"
          :border="true"
          size="small"
          :show-label="true"
          :df="balanceAsOfTodayField"
          :value="balanceAsOfToday"
          :read-only="true"
          class="shrink-0 min-w-[10rem]"
        />
      </div>

      <div class="flex flex-col overflow-hidden px-4 flex-1">
        <div
          v-if="!bankAccount"
          class="text-sm text-gray-600 dark:text-gray-300 py-4"
        >
          {{ t`Select a bank or credit card account to view the register.` }}
        </div>
        <div
          v-else-if="loading"
          class="text-sm text-gray-600 dark:text-gray-300 py-4"
        >
          {{ t`Loading…` }}
        </div>
        <template v-else>
          <div
            class="
              flex flex-col flex-1
              min-h-0
              overflow-x-auto
              custom-scroll custom-scroll-thumb1
            "
          >
            <div class="flex flex-col flex-1 min-h-0" :style="tableWidthStyle">
              <div class="flex items-center">
                <div
                  class="
                    w-8
                    text-start
                    me-2
                    text-gray-700
                    dark:text-gray-300
                    h-row
                    flex
                    items-center
                  "
                >
                  #
                </div>
                <Row
                  ref="headerRow"
                  class="flex-1 text-gray-700 dark:text-gray-300 min-h-row-mid"
                  :ratio="columnRatio"
                  :grid-template-columns="gridTemplate"
                  gap="0.5rem"
                >
                  <div
                    v-for="(col, ci) in headerCols"
                    :key="col.id"
                    class="cell-header relative"
                    :class="col.class"
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
              <hr class="dark:border-gray-800" />

              <div
                v-if="!rows.length"
                class="p-4 text-gray-600 dark:text-gray-300 text-sm"
              >
                {{ t`No entries yet.` }}
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
                <div v-for="(row, i) in rowsSlice" :key="row.key">
                  <div
                    class="
                      flex
                      hover:bg-gray-50
                      dark:hover:bg-gray-850
                      items-center
                    "
                  >
                    <div
                      class="
                        w-8
                        text-start
                        me-2
                        text-gray-700
                        dark:text-gray-300
                        h-row
                        flex
                        items-center
                      "
                    >
                      {{ pageStart + i + 1 }}
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
                      :ratio="columnRatio"
                      :grid-template-columns="gridTemplate"
                      @click="openRow(row)"
                    >
                      <div
                        class="cell-body"
                        :title="formatRegisterDate(row.date)"
                      >
                        {{ formatRegisterDate(row.date) }}
                      </div>
                      <div class="cell-body tabular-nums">
                        {{ row.checkNo }}
                      </div>
                      <div class="cell-body">{{ row.payee }}</div>
                      <div class="cell-body" :title="row.categoryTitle">
                        {{ row.category }}
                      </div>
                      <div class="cell-body">{{ row.memo }}</div>
                      <div class="cell-body tabular-nums">
                        {{ row.payment }}
                      </div>
                      <div class="cell-body tabular-nums">
                        {{ row.deposit }}
                      </div>
                      <div class="cell-body tabular-nums">
                        {{ row.balance }}
                      </div>
                      <div class="cell-body pe-4" @click.stop>
                        <DropdownWithActions
                          v-if="row.paymentName"
                          :actions="registerRowActions(row)"
                          :icon="true"
                          force-dropdown
                          type="secondary"
                        />
                      </div>
                    </Row>
                  </div>
                  <hr
                    v-if="i !== rowsSlice.length - 1"
                    class="dark:border-gray-800"
                  />
                </div>
              </div>
            </div>
          </div>
          <div v-if="rows.length" class="mt-auto flex-shrink-0">
            <hr class="dark:border-gray-800" />
            <Paginator
              :item-count="rows.length"
              @index-change="setPageIndices"
            />
          </div>
        </template>
      </div>
    </div>

    <Modal :open-modal="openExportModal" @closemodal="openExportModal = false">
      <ExportWizard
        class="w-form"
        :schema-name="ModelNameEnum.AccountingLedgerEntry"
        :title="t`Check Register`"
        :list-filters="exportFilters"
      />
    </Modal>
  </div>
</template>

<script lang="ts">
import { DateTime } from 'luxon';
import { Money } from 'pesa';
import { ModelNameEnum } from 'models/types';
import { Field } from 'schemas/types';
import {
  isCreditCardAccountType,
  REGISTER_ACCOUNT_TYPES,
} from 'src/utils/registerAccountTypes';
import Button from 'src/components/Button.vue';
import ExportWizard from 'src/components/ExportWizard.vue';
import FilterDropdown from 'src/components/FilterDropdown.vue';
import FormControl from 'src/components/Controls/FormControl.vue';
import DropdownWithActions from 'src/components/DropdownWithActions.vue';
import Modal from 'src/components/Modal.vue';
import PageHeader from 'src/components/PageHeader.vue';
import ColResizeHandle from 'src/components/ColResizeHandle.vue';
import Paginator from 'src/components/Paginator.vue';
import Row from 'src/components/Row.vue';
import { fyo } from 'src/initFyo';
import { handleErrorWithDialog } from 'src/errorHandling';
import {
  clampColWidth,
  clearColumnWidths,
  FALLBACK_COL_GAP_PX,
  gridTemplateFromWidths,
  measureRowGapPx,
  minWidthPxFromColumns,
  readColumnWidths,
  snapshotChildrenWidths,
  writeColumnWidths,
} from 'src/utils/columnWidths';
import {
  getLastRegisterBankAccount,
  setLastRegisterBankAccount,
} from 'src/utils/registerBankAccount';
import { getPartyNameMap, partyLabel } from 'src/utils/partyNames';
import { commonDocCancel, getActionsForDoc, routeTo } from 'src/utils/ui';
import { Action } from 'fyo/model/types';
import { Payment } from 'models/baseModels/Payment/Payment';
import { QueryFilter } from 'utils/db/types';
import { defineComponent, toRaw } from 'vue';

type AccountOpt = { name: string; accountName?: string };

/**
 * #2 — resizable columns. Widths are a device-level UI preference shared by
 * all bank accounts (the register columns are identical across accounts).
 * Persisted on drag end only (no writes during drag).
 * Keeps legacy bankRegister keys so existing saved widths still load.
 */
const COL_WIDTHS_KEY = 'bankRegisterColumnWidths:v2';
const COL_WIDTHS_KEY_LEGACY = 'bankRegisterColumnWidths:v1';
const COLUMN_IDS = [
  'date',
  'checkNo',
  'payee',
  'category',
  'memo',
  'payment',
  'deposit',
  'balance',
  'actions',
] as const;
type ColumnId = typeof COLUMN_IDS[number];
const COLUMN_COUNT = COLUMN_IDS.length;
const COLUMN_RATIO = [0.8, 1.3, 1.1, 1.1, 1.1, 1, 1, 1, 0.55];
/** Fallback when the header is not yet mounted (w-8 + me-2). */
const FALLBACK_INDEX_COL_PX = 32;

type RegisterRow = {
  key: string;
  date: string;
  checkNo: string;
  payee: string;
  category: string;
  /** #8: tooltip listing "Category: amount" lines for split payments. */
  categoryTitle: string;
  memo: string;
  payment: string;
  deposit: string;
  balance: string;
  paymentName?: string;
  canSetCheck?: boolean;
  canVoid?: boolean;
};

export default defineComponent({
  name: 'BankRegister',
  components: {
    PageHeader,
    Button,
    Row,
    ColResizeHandle,
    FilterDropdown,
    Modal,
    ExportWizard,
    DropdownWithActions,
    FormControl,
    Paginator,
  },
  data() {
    return {
      ModelNameEnum,
      bankAccount: '',
      bankAccounts: [] as AccountOpt[],
      accountNameById: {} as Record<string, string>,
      accountTypeById: {} as Record<string, string>,
      listFilters: {} as QueryFilter,
      rows: [] as RegisterRow[],
      pageStart: 0,
      pageEnd: 0,
      loading: false,
      openExportModal: false,
      balanceAsOfToday: null as Money | null,
      // #2: null = default fr ratios; number[] = user-resized pixel widths.
      columnWidths: null as number[] | null,
      boundColResizeMove: null as ((e: MouseEvent) => void) | null,
      boundEndColResize: null as (() => void) | null,
      resizingCol: -1,
      resizeStartX: 0,
      resizeStartWidth: 0,
      resizeMoved: false,
    };
  },
  computed: {
    rowsSlice(): RegisterRow[] {
      return this.rows.slice(this.pageStart, this.pageEnd);
    },
    columnRatio(): number[] {
      return COLUMN_RATIO;
    },
    /** CreditCard register: Charge (credit↑) / Payment (debit↓); bank keeps Payment/Deposit. */
    isCreditCardRegister(): boolean {
      return isCreditCardAccountType(this.accountTypeById[this.bankAccount]);
    },
    headerCols(): { id: ColumnId; label: string; class: string }[] {
      const outflow = this.isCreditCardRegister
        ? this.t`Charge`
        : this.t`Payment`;
      const inflow = this.isCreditCardRegister
        ? this.t`Payment`
        : this.t`Deposit`;
      return [
        { id: 'date', label: this.t`Date`, class: '' },
        { id: 'checkNo', label: this.t`Check No.`, class: '' },
        { id: 'payee', label: this.t`Payee`, class: '' },
        { id: 'category', label: this.t`Category`, class: '' },
        { id: 'memo', label: this.t`Memo`, class: '' },
        { id: 'payment', label: outflow, class: '' },
        { id: 'deposit', label: inflow, class: '' },
        { id: 'balance', label: this.t`Balance`, class: '' },
        { id: 'actions', label: this.t`Actions`, class: 'pe-4' },
      ];
    },
    gridTemplate(): string | null {
      if (!this.columnWidths) {
        return null;
      }
      return gridTemplateFromWidths(this.columnWidths);
    },
    tableWidthStyle(): Record<string, string> {
      if (!this.columnWidths) {
        return {};
      }
      // Narrow window: keep the resized widths and scroll horizontally
      // (header and body share this container so they stay in sync).
      const { gapPx, indexPx } = this.measureTableChrome();
      const total = minWidthPxFromColumns(this.columnWidths, gapPx, indexPx);
      return { minWidth: `${total}px` };
    },
    bankAccountField(): Field {
      return {
        fieldtype: 'Link',
        target: 'Account',
        fieldname: 'bankAccount',
        label: this.t`Account`,
        placeholder: this.t`Account`,
        filters: {
          isGroup: false,
          accountType: ['in', [...REGISTER_ACCOUNT_TYPES]],
        },
      } as Field;
    },
    balanceAsOfTodayField(): Field {
      return {
        fieldtype: 'Currency',
        fieldname: 'balanceAsOfToday',
        label: this.t`Balance as of today`,
        readOnly: true,
      } as Field;
    },
    exportFilters(): QueryFilter {
      if (!this.bankAccount) return { ...this.listFilters, reverted: false };
      return {
        ...this.listFilters,
        account: this.bankAccount,
        reverted: false,
      };
    },
  },
  watch: {
    bankAccount(value: string) {
      if (value) {
        setLastRegisterBankAccount(value);
      }
    },
  },
  async mounted() {
    this.columnWidths = readColumnWidths(COL_WIDTHS_KEY, [...COLUMN_IDS], {
      legacyKey: COL_WIDTHS_KEY_LEGACY,
    });
    try {
      await this.restoreBankAndLoad(true);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('BankRegister mounted', error);
      await handleErrorWithDialog(error);
    }
  },
  unmounted() {
    this.endColResize();
  },
  deactivated() {
    // keep-alive: unmounted() does not fire, so end any in-flight drag here
    // to release window listeners and body cursor/user-select.
    this.endColResize();
  },
  async activated() {
    // keep-alive: remount is skipped — re-apply saved bank and refresh rows
    try {
      await this.restoreBankAndLoad(false);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('BankRegister activated', error);
    }
  },
  methods: {
    setPageIndices({ start, end }: { start: number; end: number }) {
      this.pageStart = start;
      this.pageEnd = end;
    },
    measureTableChrome(): { gapPx: number; indexPx: number } {
      const headerRow = this.$refs.headerRow as
        | { $el?: HTMLElement }
        | undefined;
      const rowEl = headerRow?.$el;
      if (!rowEl) {
        return { gapPx: FALLBACK_COL_GAP_PX, indexPx: FALLBACK_INDEX_COL_PX };
      }
      const gapPx = measureRowGapPx(rowEl);
      const indexEl = rowEl.parentElement
        ?.firstElementChild as HTMLElement | null;
      let indexPx = FALLBACK_INDEX_COL_PX;
      if (indexEl && indexEl !== rowEl) {
        const rect = indexEl.getBoundingClientRect();
        const ms = getComputedStyle(indexEl);
        indexPx = Math.round(
          rect.width +
            (Number.parseFloat(ms.marginInlineEnd) ||
              Number.parseFloat(ms.marginRight) ||
              0)
        );
      }
      return {
        gapPx,
        indexPx: indexPx > 0 ? indexPx : FALLBACK_INDEX_COL_PX,
      };
    },
    startColResize(index: number, event: MouseEvent) {
      // First resize: snapshot the current rendered widths so switching from
      // fr ratios to px does not jump.
      if (!this.columnWidths) {
        const headerRow = this.$refs.headerRow as
          | { $el?: HTMLElement }
          | undefined;
        const snapped = snapshotChildrenWidths(headerRow?.$el, COLUMN_COUNT);
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
      // Replace the array so both header and body grids recompute.
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
        // Plain click (e.g. first half of a double-click reset): nothing
        // changed, so don't write widths that a dblclick may be about to clear.
        return;
      }
      // Persist once per drag (no writes while dragging).
      try {
        writeColumnWidths(COL_WIDTHS_KEY, [...COLUMN_IDS], this.columnWidths);
        localStorage.removeItem(COL_WIDTHS_KEY_LEGACY);
      } catch {
        /* widths are best-effort */
      }
    },
    resetColWidths() {
      this.columnWidths = null;
      clearColumnWidths(COL_WIDTHS_KEY, [COL_WIDTHS_KEY_LEGACY]);
    },
    accountLabel(id?: string) {
      if (!id) return '';
      return this.accountNameById[id] || id;
    },
    formatRegisterDate(iso: string): string {
      if (!iso) {
        return '';
      }
      const dt = DateTime.fromISO(String(iso).slice(0, 10), { zone: 'utc' });
      if (!dt.isValid) {
        return String(iso);
      }
      // e.g. August 5, 2026 — English month, day number, year (no weekday)
      return dt.setLocale('en').toFormat('MMMM d, yyyy');
    },
    normalizeRegisterDate(value: unknown): string {
      if (value == null || value === '') {
        return '';
      }
      if (value instanceof Date) {
        const dt = DateTime.fromJSDate(value);
        return dt.isValid ? dt.toISODate() || '' : '';
      }
      const raw = String(value).trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
        return raw.slice(0, 10);
      }
      const fromIso = DateTime.fromISO(raw);
      if (fromIso.isValid) {
        return fromIso.toISODate() || '';
      }
      const fromJs = DateTime.fromJSDate(new Date(raw));
      return fromJs.isValid ? fromJs.toISODate() || '' : raw;
    },
    async restoreBankAndLoad(forceAccounts: boolean) {
      if (forceAccounts || !this.bankAccounts.length) {
        await this.loadAccounts();
      }
      const names = this.bankAccounts.map((a) => a.name);
      const saved = getLastRegisterBankAccount(names);
      if (saved && this.bankAccount !== saved) {
        this.bankAccount = saved;
      } else if (!this.bankAccount && saved) {
        this.bankAccount = saved;
      }
      if (this.bankAccount && !names.includes(this.bankAccount)) {
        this.bankAccount = saved || '';
      }
      if (this.bankAccount) {
        setLastRegisterBankAccount(this.bankAccount);
        await this.loadRows();
        await this.loadBalanceAsOfToday();
      } else {
        this.rows = [];
        this.balanceAsOfToday = null;
      }
    },
    async loadAccounts() {
      const banks = (await fyo.db.getAll(ModelNameEnum.Account, {
        filters: {
          isGroup: false,
          accountType: ['in', [...REGISTER_ACCOUNT_TYPES]],
        },
        fields: ['name', 'accountName', 'accountType'],
        orderBy: 'accountName',
        order: 'asc',
      })) as (AccountOpt & { accountType?: string })[];
      this.bankAccounts = banks;
      const typeById: Record<string, string> = {};
      for (const a of banks) {
        if (a.accountType) {
          typeById[a.name] = a.accountType;
        }
      }
      this.accountTypeById = typeById;

      const accounts = (await fyo.db.getAll(ModelNameEnum.Account, {
        filters: { isGroup: false },
        fields: ['name', 'accountName'],
        orderBy: 'accountName',
        order: 'asc',
      })) as AccountOpt[];
      const nameById: Record<string, string> = {};
      for (const a of accounts) {
        nameById[a.name] = a.accountName || a.name;
      }
      this.accountNameById = nameById;
    },
    /** Asset bank/cash: debit − credit. CreditCard liability: credit − debit (owed). */
    signedBalanceDelta(debit: number, credit: number): number {
      return this.isCreditCardRegister ? credit - debit : debit - credit;
    },
    applyFilter(filters: QueryFilter) {
      this.listFilters = filters ?? {};
      void this.loadRows();
    },
    async onBankAccountChange(value: string | null) {
      this.bankAccount = value || '';
      if (this.bankAccount) {
        setLastRegisterBankAccount(this.bankAccount);
      }
      await this.loadRows();
      await this.loadBalanceAsOfToday();
    },
    async goWriteEntry() {
      if (!this.bankAccount) return;
      setLastRegisterBankAccount(this.bankAccount);
      await routeTo({
        path: '/bank-register/write',
        query: { account: this.bankAccount },
      });
    },
    async goChecksToPrint() {
      if (this.bankAccount) {
        setLastRegisterBankAccount(this.bankAccount);
      }
      await routeTo('/checks-to-print');
    },
    async loadRows() {
      if (!this.bankAccount) {
        this.rows = [];
        return;
      }
      this.loading = true;
      try {
        // Bank picker owns account; Filter can add party/date/etc.
        // Strip Vue proxies — IPC structured clone rejects them.
        const restFilters = JSON.parse(
          JSON.stringify(toRaw(this.listFilters) ?? {})
        ) as QueryFilter;
        delete restFilters.account;
        const ales = (await fyo.db.getAll(ModelNameEnum.AccountingLedgerEntry, {
          filters: {
            ...restFilters,
            account: this.bankAccount,
            reverted: false,
          },
          fields: [
            'name',
            'date',
            'party',
            'debit',
            'credit',
            'referenceType',
            'referenceName',
            'reverted',
          ],
          orderBy: 'date',
          order: 'asc',
        })) as {
          name: string;
          date: string;
          party?: string;
          debit?: { float?: number } | number;
          credit?: { float?: number } | number;
          referenceType?: string;
          referenceName?: string;
        }[];

        const paymentNames = [
          ...new Set(
            ales
              .filter((a) => a.referenceType === ModelNameEnum.Payment)
              .map((a) => a.referenceName!)
              .filter(Boolean)
          ),
        ];
        const cancelled = new Set<string>();
        const paymentMap = new Map<
          string,
          {
            memo: string;
            category: string;
            categoryTitle: string;
            party: string;
            checkNo: string;
            canSetCheck: boolean;
            canVoid: boolean;
          }
        >();

        const money = (v: unknown) => {
          if (v == null) return 0;
          if (typeof v === 'number') return v;
          if (typeof v === 'object' && v && 'float' in v) {
            return Number((v as { float: number }).float) || 0;
          }
          return Number(v) || 0;
        };

        if (paymentNames.length) {
          const methodRows = (await fyo.db.getAll(ModelNameEnum.PaymentMethod, {
            fields: ['name', 'type'],
          })) as { name: string; type?: string }[];
          const methodType: Record<string, string> = {};
          for (const m of methodRows) {
            methodType[m.name] = m.type || '';
          }
          const pays = (await fyo.db.getAll(ModelNameEnum.Payment, {
            filters: { name: ['in', paymentNames] },
            fields: [
              'name',
              'cancelled',
              'paymentType',
              'account',
              'paymentAccount',
              'memo',
              'referenceId',
              'printLater',
              'paymentMethod',
              'party',
            ],
          })) as {
            name: string;
            cancelled?: boolean;
            paymentType?: string;
            account?: string;
            paymentAccount?: string;
            memo?: string;
            referenceId?: string;
            printLater?: boolean;
            paymentMethod?: string;
            party?: string;
          }[];

          // #8: split payments show "Split" in the category column with a
          // per-line tooltip. One batched query for all displayed payments.
          const splitsByParent = new Map<
            string,
            { account?: string; amount?: unknown }[]
          >();
          const splitRows = (await fyo.db.getAll(ModelNameEnum.PaymentSplit, {
            // PaymentSplit is shared with MemorizedTransaction; scope to
            // Payment parents so a name collision can't leak template rows.
            filters: {
              parent: ['in', paymentNames],
              parentSchemaName: ModelNameEnum.Payment,
            },
            fields: ['parent', 'account', 'amount', 'idx'],
            orderBy: 'idx',
            order: 'asc',
          })) as { parent: string; account?: string; amount?: unknown }[];
          for (const s of splitRows) {
            const rows = splitsByParent.get(s.parent) ?? [];
            rows.push(s);
            splitsByParent.set(s.parent, rows);
          }

          for (const p of pays) {
            if (p.cancelled) {
              cancelled.add(p.name);
              continue;
            }
            const categoryId =
              p.paymentType === 'Pay' ? p.paymentAccount : p.account;
            const splits = splitsByParent.get(p.name) ?? [];
            let category = this.accountLabel(categoryId);
            let categoryTitle = '';
            if (splits.length) {
              category = this.t`Split`;
              categoryTitle = splits
                .map(
                  (s) =>
                    `${this.accountLabel(s.account)}: ${String(
                      fyo.format(fyo.pesa(money(s.amount)), 'Currency')
                    )}`
                )
                .join('\n');
            }
            const isCheck =
              methodType[p.paymentMethod || ''] === 'Check' ||
              (p.paymentMethod || '').trim().toLowerCase() === 'check';
            const isPayCheck = p.paymentType === 'Pay' && isCheck;
            const hasNumber = !!(p.referenceId || '').trim();
            paymentMap.set(p.name, {
              memo: p.memo || '',
              checkNo: (p.referenceId || '').trim(),
              category,
              categoryTitle,
              party: p.party || '',
              canSetCheck: isPayCheck,
              canVoid: isPayCheck && hasNumber && !p.printLater,
            });
          }
        }

        const partyIds = [
          ...new Set(
            [
              ...[...paymentMap.values()].map((p) => p.party),
              ...ales.map((a) => a.party || ''),
            ].filter(Boolean)
          ),
        ];
        const partyNames = await getPartyNameMap(fyo, partyIds);

        let balance = 0;
        const rows: RegisterRow[] = [];
        for (const ale of ales) {
          if (
            ale.referenceType === ModelNameEnum.Payment &&
            ale.referenceName &&
            cancelled.has(ale.referenceName)
          ) {
            continue;
          }
          const debit = money(ale.debit);
          const credit = money(ale.credit);
          // Charge (credit) / Payment (debit) columns unchanged; balance sign flips for CC.
          balance += this.signedBalanceDelta(debit, credit);
          const payInfo =
            ale.referenceType === ModelNameEnum.Payment && ale.referenceName
              ? paymentMap.get(ale.referenceName)
              : undefined;
          const partyId = payInfo?.party || ale.party || '';
          rows.push({
            key: ale.name,
            date: this.normalizeRegisterDate(ale.date),
            checkNo: payInfo?.checkNo || '',
            payee: partyLabel(partyNames, partyId),
            category: payInfo?.category || '',
            categoryTitle: payInfo?.categoryTitle || '',
            memo: payInfo?.memo || '',
            payment: credit > 0 ? fyo.format(fyo.pesa(credit), 'Currency') : '',
            deposit: debit > 0 ? fyo.format(fyo.pesa(debit), 'Currency') : '',
            balance: fyo.format(fyo.pesa(balance), 'Currency'),
            paymentName:
              ale.referenceType === ModelNameEnum.Payment
                ? ale.referenceName
                : undefined,
            canSetCheck: payInfo?.canSetCheck,
            canVoid: payInfo?.canVoid,
          });
        }
        this.rows = rows.reverse();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('BankRegister loadRows', error);
        this.rows = [];
        await handleErrorWithDialog(error);
      } finally {
        this.loading = false;
      }
    },
    async openRow(row: RegisterRow) {
      if (row.paymentName) {
        await routeTo({
          path: `/edit/Payment/${row.paymentName}`,
          query: { from: 'bank-register' },
        });
      }
    },
    registerRowActions(row: RegisterRow): Action[] {
      if (!row.paymentName) {
        return [];
      }
      const name = row.paymentName;
      const actions: Action[] = [
        {
          label: this.t`Open`,
          action: async () => {
            await this.openRow(row);
          },
        },
      ];
      if (row.canSetCheck) {
        actions.push({
          label: this.t`Set check #…`,
          action: async () => {
            await this.runPaymentAction(name, this.t`Set check #…`);
          },
        });
      }
      if (row.canVoid) {
        actions.push({
          label: this.t`Void check # (requeue)…`,
          action: async () => {
            await this.runPaymentAction(name, this.t`Void check # (requeue)…`);
          },
        });
      }
      actions.push({
        label: this.t`Duplicate`,
        action: async () => {
          const payment = (await fyo.doc.getDoc(
            ModelNameEnum.Payment,
            name
          )) as Payment;
          const grouped = getActionsForDoc(payment);
          const dupe = grouped.find((a) => a.label === this.t`Duplicate`);
          if (dupe) {
            await dupe.action(payment);
          }
        },
      });
      actions.push({
        label: this.t`Cancel payment`,
        action: async () => {
          const payment = await fyo.doc.getDoc(ModelNameEnum.Payment, name);
          await commonDocCancel(payment);
          await this.loadRows();
        },
      });
      return actions;
    },
    async runPaymentAction(paymentName: string, label: string) {
      const payment = (await fyo.doc.getDoc(
        ModelNameEnum.Payment,
        paymentName
      )) as Payment;
      const act = Payment.getActions(fyo).find((a) => a.label === label);
      if (act) {
        await act.action(payment);
        await this.loadRows();
      }
    },
    async loadBalanceAsOfToday() {
      if (!this.bankAccount) {
        this.balanceAsOfToday = null;
        return;
      }
      try {
        const endOfToday = DateTime.now().endOf('day').toISO();
        const ales = (await fyo.db.getAll(ModelNameEnum.AccountingLedgerEntry, {
          filters: {
            account: this.bankAccount,
            reverted: false,
            date: ['<=', endOfToday],
          },
          fields: ['debit', 'credit', 'referenceType', 'referenceName'],
        })) as {
          debit?: { float?: number } | number;
          credit?: { float?: number } | number;
          referenceType?: string;
          referenceName?: string;
        }[];

        const paymentNames = [
          ...new Set(
            ales
              .filter((a) => a.referenceType === ModelNameEnum.Payment)
              .map((a) => a.referenceName!)
              .filter(Boolean)
          ),
        ];
        const cancelled = new Set<string>();
        if (paymentNames.length) {
          const pays = (await fyo.db.getAll(ModelNameEnum.Payment, {
            filters: { name: ['in', paymentNames] },
            fields: ['name', 'cancelled'],
          })) as { name: string; cancelled?: boolean }[];
          for (const p of pays) {
            if (p.cancelled) {
              cancelled.add(p.name);
            }
          }
        }

        const money = (v: unknown) => {
          if (v == null) return 0;
          if (typeof v === 'number') return v;
          if (typeof v === 'object' && v && 'float' in v) {
            return Number((v as { float: number }).float) || 0;
          }
          return Number(v) || 0;
        };

        let balance = 0;
        for (const ale of ales) {
          if (
            ale.referenceType === ModelNameEnum.Payment &&
            ale.referenceName &&
            cancelled.has(ale.referenceName)
          ) {
            continue;
          }
          balance += this.signedBalanceDelta(
            money(ale.debit),
            money(ale.credit)
          );
        }
        this.balanceAsOfToday = fyo.pesa(balance);
      } catch {
        this.balanceAsOfToday = null;
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
  justify-content: flex-start;
  text-align: start;
  padding-inline-end: 0.75rem;
}
.cell-body {
  justify-content: flex-start;
  text-align: start;
}
</style>
