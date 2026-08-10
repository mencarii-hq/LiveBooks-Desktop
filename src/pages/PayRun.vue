<template>
  <div class="flex flex-col overflow-y-hidden h-full">
    <PageHeader :title="t`Pay Run`">
      <Button type="primary" :disabled="!canGenerate || busy" @click="generate">
        {{ busy ? t`Generating…` : t`Generate payments` }}
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
          :df="payDateField"
          :value="payDate"
          class="min-w-[10rem]"
          @change="(v) => (payDate = v)"
        />
        <FormControl
          :border="true"
          size="small"
          :show-label="true"
          :df="bankAccountField"
          :value="bankAccount"
          class="flex-1 max-w-md"
          @change="(v) => (bankAccount = v)"
        />
        <FormControl
          :border="true"
          size="small"
          :show-label="true"
          :df="paymentMethodField"
          :value="paymentMethod"
          class="min-w-[10rem]"
          @change="onPaymentMethodChange"
        />
        <FormControl
          :border="true"
          size="small"
          :show-label="true"
          :df="printLaterField"
          :value="printLater"
          class="min-w-[8rem]"
          @change="(v) => (printLater = !!v)"
        />
      </div>

      <div class="flex flex-col overflow-hidden px-4 flex-1 text-base">
        <div v-if="loading" class="text-gray-600 dark:text-gray-300 py-4">
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
                :read-only="!readyRows.length"
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
                v-for="(col, i) in headerCols"
                :key="col.id"
                class="cell-header relative"
                :class="{ 'pe-4': i === headerCols.length - 1 }"
              >
                {{ col.label }}
                <ColResizeHandle
                  v-if="i < headerCols.length - 1"
                  :title="t`Drag to resize. Double-click to reset.`"
                  @start="startColResize(i, $event)"
                  @reset="resetColWidths"
                />
              </div>
            </Row>
          </div>
          <hr class="dark:border-gray-800" />

          <div
            v-if="!rows.length"
            class="
              flex flex-1 flex-col
              items-center
              justify-center
              text-gray-800
              dark:text-gray-100
              p-4
            "
          >
            <p class="text-center max-w-md">
              {{
                t`No employees yet. Create an employee, then set up pay on their form.`
              }}
            </p>
            <Button class="mt-3" type="primary" @click="openNewEmployee">
              {{ t`New employee` }}
            </Button>
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
            <div v-for="(row, i) in rows" :key="row.party">
              <div
                class="
                  flex
                  hover:bg-gray-50
                  dark:hover:bg-gray-850
                  items-center
                "
                :class="{ 'opacity-50': !row.ready }"
              >
                <div
                  class="w-8 flex justify-end me-2 items-center min-h-row-mid"
                >
                  <Check
                    v-if="row.ready"
                    :df="{
                      fieldtype: 'Check',
                      fieldname: 'selectItem',
                      label: '',
                    }"
                    :show-label="false"
                    :value="selected.includes(row.party)"
                    @change="(v) => setRowSelected(row.party, !!v)"
                  />
                </div>
                <Row
                  gap="0.5rem"
                  class="flex-1 min-h-row-mid items-center"
                  :class="
                    row.ready
                      ? 'text-gray-900 dark:text-gray-300'
                      : 'text-gray-500 dark:text-gray-500'
                  "
                  :ratio="COLUMN_RATIO"
                  :grid-template-columns="gridTemplate"
                >
                  <div class="cell-body" :title="row.partyName">
                    {{ row.partyName }}
                  </div>
                  <div class="cell-body">
                    <template v-if="row.ready">{{ row.payType }}</template>
                    <button
                      v-else
                      type="button"
                      class="underline text-start"
                      @click="openEmployee(row.party)"
                    >
                      {{ t`Set up pay` }}
                    </button>
                  </div>
                  <div class="cell-body tabular-nums">
                    {{ row.ready ? formatCurrency(row.rate) : '—' }}
                  </div>
                  <div class="cell-body">
                    <FormControl
                      v-if="row.ready && row.payType === 'Hourly'"
                      :border="true"
                      size="small"
                      :show-label="false"
                      :df="hoursField"
                      :value="hours[row.party] ?? null"
                      class="w-20"
                      @change="(v) => onHoursChange(row.party, v)"
                    />
                    <span v-else class="text-gray-400">—</span>
                  </div>
                  <div class="cell-body tabular-nums">
                    {{
                      row.ready && rowStates[row.party]?.line
                        ? formatCurrency(rowStates[row.party].line!.gross)
                        : '—'
                    }}
                  </div>
                  <div class="cell-body tabular-nums">
                    {{
                      row.ready && rowStates[row.party]?.line
                        ? formatCurrency(
                            rowStates[row.party].line!.deductionTotal
                          )
                        : '—'
                    }}
                  </div>
                  <div class="cell-body tabular-nums pe-4">
                    {{
                      row.ready && rowStates[row.party]?.line
                        ? formatCurrency(rowStates[row.party].line!.net)
                        : '—'
                    }}
                  </div>
                </Row>
              </div>
              <p
                v-if="rowStates[row.party]?.error"
                class="text-xs text-red-600 dark:text-red-400 ps-10 pb-1"
              >
                {{ rowStates[row.party].error }}
              </p>
              <hr
                v-if="!(i === rows.length - 1)"
                class="dark:border-gray-800"
              />
            </div>
          </div>

          <div v-if="rows.length && selected.length" class="flex items-center">
            <div class="w-8 me-2"></div>
            <Row
              gap="0.5rem"
              class="
                flex-1
                min-h-row-mid
                items-center
                font-semibold
                text-gray-900
                dark:text-gray-200
              "
              :ratio="COLUMN_RATIO"
              :grid-template-columns="gridTemplate"
            >
              <div class="cell-body">
                {{ t`Total (${String(selected.length)} selected)` }}
              </div>
              <div></div>
              <div></div>
              <div></div>
              <div class="cell-body tabular-nums">
                {{ totals ? formatCurrency(totals.gross) : '—' }}
              </div>
              <div class="cell-body tabular-nums">
                {{ totals ? formatCurrency(totals.deductionTotal) : '—' }}
              </div>
              <div class="cell-body tabular-nums pe-4">
                {{ totals ? formatCurrency(totals.net) : '—' }}
              </div>
            </Row>
          </div>

          <p
            v-if="lastCreated.length"
            class="text-sm text-gray-600 dark:text-gray-300 py-3"
          >
            {{
              t`Created ${String(
                lastCreated.length
              )} payment(s): ${lastCreated.join(', ')}.`
            }}
            <button
              v-if="lastQueued"
              type="button"
              class="underline ms-1"
              @click="openChecksToPrint"
            >
              {{ t`Open Checks to Print` }}
            </button>
          </p>
        </template>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import {
  computed,
  defineComponent,
  onActivated,
  onBeforeUnmount,
  onMounted,
  ref,
  type ComponentPublicInstance,
} from 'vue';
import { t } from 'fyo';
import { DateTime } from 'luxon';
import { ModelNameEnum } from 'models/types';
import { AccountTypeEnum } from 'models/baseModels/Account/types';
import Button from 'src/components/Button.vue';
import PageHeader from 'src/components/PageHeader.vue';
import FormControl from 'src/components/Controls/FormControl.vue';
import Check from 'src/components/Controls/Check.vue';
import Row from 'src/components/Row.vue';
import ColResizeHandle from 'src/components/ColResizeHandle.vue';
import { fyo } from 'src/initFyo';
import { getPartyNameMap, partyLabel } from 'src/utils/partyNames';
import { showToast } from 'src/utils/interactive';
import { handleErrorWithDialog } from 'src/errorHandling';
import { getFormRoute, routeTo } from 'src/utils/ui';
import {
  computePayRunLine,
  generatePayRunPayments,
  getPayrollPrecision,
  type PayRunComputedLine,
  type PayrollProfileLike,
} from 'src/utils/payrollPayRun';
import {
  isCheckMethod,
  moneyToNumber,
  resolveDefaultPaymentMethod,
} from 'src/utils/memorizedTransactions';
import type { Field } from 'schemas/types';
import {
  clampColWidth,
  clearColumnWidths,
  columnWidthsStorageKey,
  gridTemplateFromWidths,
  readColumnWidths,
  snapshotChildrenWidths,
  writeColumnWidths,
} from 'src/utils/columnWidths';

type EmployeeRow = {
  /** Row key = party name */
  party: string;
  partyName: string;
  ready: boolean;
  profileName?: string;
  payType?: 'Salary' | 'Hourly';
  rate: number;
  expenseAccount?: string;
  deductions: PayrollProfileLike['deductions'];
};

type RowState = {
  line?: PayRunComputedLine;
  error?: string;
};

const COLUMN_IDS = [
  'employee',
  'payType',
  'rate',
  'hours',
  'gross',
  'deductions',
  'net',
] as const;
const COLUMN_RATIO = [1.4, 0.7, 0.8, 0.7, 0.8, 0.8, 0.8];
const WIDTHS_KEY = columnWidthsStorageKey('list:PayRun');

export default defineComponent({
  name: 'PayRun',
  components: { Button, PageHeader, FormControl, Check, Row, ColResizeHandle },
  setup() {
    const loading = ref(true);
    const busy = ref(false);
    const rows = ref<EmployeeRow[]>([]);
    const selected = ref<string[]>([]);
    const hours = ref<Record<string, number>>({});
    const payDate = ref(DateTime.now().toISODate()!);
    const bankAccount = ref('');
    const paymentMethod = ref('');
    const printLater = ref(true);
    const lastCreated = ref<string[]>([]);
    const lastQueued = ref(false);

    const payDateField = {
      fieldtype: 'Date',
      fieldname: 'payDate',
      label: t`Pay Date`,
    } as Field;

    const bankAccountField = {
      fieldtype: 'Link',
      fieldname: 'bankAccount',
      label: t`Bank Account`,
      target: 'Account',
      filters: {
        isGroup: false,
        accountType: ['in', [AccountTypeEnum.Bank, AccountTypeEnum.Cash]],
      },
    } as Field;

    const paymentMethodField = {
      fieldtype: 'Link',
      fieldname: 'paymentMethod',
      label: t`Payment Method`,
      target: 'PaymentMethod',
    } as Field;

    const printLaterField = {
      fieldtype: 'Check',
      fieldname: 'printLater',
      label: t`Print Later`,
    } as Field;

    const hoursField = {
      fieldtype: 'Float',
      fieldname: 'hours',
      label: t`Hours`,
      placeholder: '0',
    } as Field;

    const headerCols = [
      { id: 'employee', label: t`Employee` },
      { id: 'payType', label: t`Pay Type` },
      { id: 'rate', label: t`Rate` },
      { id: 'hours', label: t`Hours` },
      { id: 'gross', label: t`Gross` },
      { id: 'deductions', label: t`Deductions` },
      { id: 'net', label: t`Net` },
    ];

    const headerRow = ref<ComponentPublicInstance | null>(null);
    const columnWidths = ref<number[] | null>(null);
    const resizingCol = ref(-1);
    const resizeStartX = ref(0);
    const resizeStartWidth = ref(0);
    const resizeMoved = ref(false);
    let boundColResizeMove: ((e: MouseEvent) => void) | null = null;
    let boundEndColResize: (() => void) | null = null;

    const gridTemplate = computed(() => {
      if (!columnWidths.value) {
        return null;
      }
      return gridTemplateFromWidths(columnWidths.value);
    });

    function startColResize(index: number, event: MouseEvent) {
      if (!columnWidths.value) {
        const el = headerRow.value?.$el as HTMLElement | undefined;
        const snapped = snapshotChildrenWidths(el, COLUMN_IDS.length);
        if (!snapped) {
          return;
        }
        columnWidths.value = snapped;
      }
      resizingCol.value = index;
      resizeStartX.value = event.clientX;
      resizeStartWidth.value = columnWidths.value[index];
      resizeMoved.value = false;
      boundColResizeMove = (e: MouseEvent) => onColResizeMove(e);
      boundEndColResize = () => endColResize();
      window.addEventListener('mousemove', boundColResizeMove);
      window.addEventListener('mouseup', boundEndColResize);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    function onColResizeMove(event: MouseEvent) {
      if (resizingCol.value < 0 || !columnWidths.value) {
        return;
      }
      const dx = event.clientX - resizeStartX.value;
      const next = clampColWidth(resizeStartWidth.value + dx);
      if (next === columnWidths.value[resizingCol.value]) {
        return;
      }
      resizeMoved.value = true;
      const widths = [...columnWidths.value];
      widths[resizingCol.value] = next;
      columnWidths.value = widths;
    }

    function endColResize() {
      if (resizingCol.value < 0) {
        return;
      }
      resizingCol.value = -1;
      if (boundColResizeMove) {
        window.removeEventListener('mousemove', boundColResizeMove);
      }
      if (boundEndColResize) {
        window.removeEventListener('mouseup', boundEndColResize);
      }
      boundColResizeMove = null;
      boundEndColResize = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (!resizeMoved.value || !columnWidths.value) {
        return;
      }
      try {
        writeColumnWidths(WIDTHS_KEY, [...COLUMN_IDS], columnWidths.value);
      } catch {
        /* best-effort */
      }
    }

    function resetColWidths() {
      columnWidths.value = null;
      clearColumnWidths(WIDTHS_KEY);
    }

    const readyRows = computed(() => rows.value.filter((r) => r.ready));

    const allSelected = computed(
      () =>
        readyRows.value.length > 0 &&
        selected.value.length === readyRows.value.length &&
        readyRows.value.every((r) => selected.value.includes(r.party))
    );

    /** Computed pay line (or the reason it cannot compute) per selected row. */
    const rowStates = computed<Record<string, RowState>>(() => {
      const precision = getPayrollPrecision(fyo);
      const map: Record<string, RowState> = {};
      for (const row of rows.value) {
        if (!row.ready || !selected.value.includes(row.party)) {
          continue;
        }

        try {
          map[row.party] = {
            line: computePayRunLine(
              {
                name: row.profileName!,
                party: row.party,
                payType: row.payType!,
                rate: row.rate,
                expenseAccount: row.expenseAccount!,
                deductions: row.deductions,
              },
              row.payType === 'Hourly' ? hours.value[row.party] : undefined,
              precision
            ),
          };
        } catch (error) {
          map[row.party] = { error: (error as Error).message };
        }
      }
      return map;
    });

    const totals = computed(() => {
      const lines = selected.value
        .map((party) => rowStates.value[party]?.line)
        .filter((line): line is PayRunComputedLine => !!line);
      if (lines.length !== selected.value.length) {
        return null;
      }

      return {
        gross: lines.reduce((s, l) => s + l.gross, 0),
        deductionTotal: lines.reduce((s, l) => s + l.deductionTotal, 0),
        net: lines.reduce((s, l) => s + l.net, 0),
      };
    });

    const canGenerate = computed(
      () =>
        !!payDate.value &&
        !!bankAccount.value &&
        selected.value.length > 0 &&
        selected.value.every((party) => !!rowStates.value[party]?.line)
    );

    function formatCurrency(n: number) {
      return fyo.format(fyo.pesa(n), 'Currency');
    }

    function setRowSelected(party: string, on: boolean) {
      const row = rows.value.find((r) => r.party === party);
      if (!row?.ready) {
        return;
      }
      if (on) {
        if (!selected.value.includes(party)) {
          selected.value = [...selected.value, party];
        }
      } else {
        selected.value = selected.value.filter((n) => n !== party);
      }
    }

    function onSelectAllChange(v: boolean) {
      selected.value = v ? readyRows.value.map((r) => r.party) : [];
    }

    function onHoursChange(party: string, value: unknown) {
      const n = Number(value);
      hours.value = { ...hours.value, [party]: Number.isFinite(n) ? n : 0 };
    }

    async function onPaymentMethodChange(v: string) {
      paymentMethod.value = v;
      if (v && (await isCheckMethod(fyo, v))) {
        printLater.value = true;
      }
    }

    async function loadEmployees() {
      loading.value = true;
      try {
        const parties = (await fyo.db.getAll(ModelNameEnum.Party, {
          fields: ['name', 'partyName'],
          filters: { role: ['in', ['Employee', 'Contractor']] },
          orderBy: 'partyName',
          order: 'asc',
        })) as { name: string; partyName?: string }[];

        const partyIds = parties.map((p) => p.name);
        const profiles = partyIds.length
          ? ((await fyo.db.getAll(ModelNameEnum.PayrollProfile, {
              fields: [
                'name',
                'party',
                'payType',
                'rate',
                'expenseAccount',
                'disabled',
              ],
              filters: { party: ['in', partyIds] },
            })) as {
              name: string;
              party: string;
              payType: 'Salary' | 'Hourly';
              rate: unknown;
              expenseAccount: string;
              disabled?: boolean;
            }[])
          : [];

        const profileByParty = new Map(profiles.map((p) => [p.party, p]));
        const readyProfileNames = profiles
          .filter((p) => !p.disabled)
          .map((p) => p.name);

        const deductionRows = readyProfileNames.length
          ? ((await fyo.db.getAllRaw(ModelNameEnum.PayrollDeduction, {
              fields: [
                'parent',
                'account',
                'deductionType',
                'amount',
                'description',
              ],
              filters: { parent: ['in', readyProfileNames] },
              orderBy: 'idx',
              order: 'asc',
            })) as {
              parent: string;
              account?: string;
              deductionType?: string;
              amount?: string;
              description?: string;
            }[])
          : [];
        const deductionsByProfile = new Map<
          string,
          NonNullable<PayrollProfileLike['deductions']>
        >();
        for (const row of deductionRows) {
          const list = deductionsByProfile.get(row.parent) ?? [];
          list.push({
            account: row.account,
            deductionType: row.deductionType,
            amount: row.amount,
            description: row.description,
          });
          deductionsByProfile.set(row.parent, list);
        }

        const partyNameMap = await getPartyNameMap(
          fyo,
          parties.map((p) => p.name)
        );
        const built: EmployeeRow[] = parties.map((p) => {
          const profile = profileByParty.get(p.name);
          const ready = !!profile && !profile.disabled;
          return {
            party: p.name,
            partyName: partyLabel(partyNameMap, p.name),
            ready,
            profileName: profile?.name,
            payType:
              profile?.payType === 'Hourly'
                ? 'Hourly'
                : profile
                  ? 'Salary'
                  : undefined,
            rate: profile ? moneyToNumber(profile.rate) : 0,
            expenseAccount: profile?.expenseAccount,
            deductions: profile
              ? deductionsByProfile.get(profile.name) ?? []
              : [],
          };
        });
        built.sort((a, b) => a.partyName.localeCompare(b.partyName));
        rows.value = built;
        selected.value = built.filter((r) => r.ready).map((r) => r.party);
      } finally {
        loading.value = false;
      }
    }

    async function generate() {
      if (!canGenerate.value || busy.value) {
        return;
      }

      busy.value = true;
      lastCreated.value = [];
      lastQueued.value = false;
      try {
        const lines = selected.value.map((party) => {
          const row = rows.value.find((r) => r.party === party)!;
          return {
            profileName: row.profileName!,
            hours: row.payType === 'Hourly' ? hours.value[party] : undefined,
          };
        });
        const payments = await generatePayRunPayments(fyo, {
          payDate: payDate.value,
          bankAccount: bankAccount.value,
          paymentMethod: paymentMethod.value || undefined,
          printLater: printLater.value,
          lines,
        });
        lastCreated.value = payments.map((p) => String(p.name));
        // Q-AF: only Pay + Check payments queue — mirror that here so the
        // Checks to Print link only shows when something was actually queued.
        lastQueued.value =
          printLater.value &&
          (await isCheckMethod(fyo, paymentMethod.value || ''));
        showToast({
          type: 'success',
          message:
            payments.length === 1
              ? t`Created 1 payroll payment`
              : t`Created ${String(payments.length)} payroll payments`,
        });
      } catch (error) {
        await handleErrorWithDialog(error as Error);
      } finally {
        busy.value = false;
      }
    }

    async function openEmployee(party: string) {
      await routeTo(getFormRoute(ModelNameEnum.Party, party));
    }

    async function openNewEmployee() {
      const doc = fyo.doc.getNewDoc(ModelNameEnum.Party, { role: 'Employee' });
      await routeTo(getFormRoute(ModelNameEnum.Party, doc.name!));
    }

    function openChecksToPrint() {
      return routeTo('/checks-to-print');
    }

    onMounted(async () => {
      columnWidths.value = readColumnWidths(WIDTHS_KEY, [...COLUMN_IDS]);
      paymentMethod.value = await resolveDefaultPaymentMethod(fyo);
      if (await isCheckMethod(fyo, paymentMethod.value)) {
        printLater.value = true;
      }
      await loadEmployees();
    });

    onActivated(() => {
      void loadEmployees();
    });

    onBeforeUnmount(() => {
      endColResize();
    });

    return {
      t,
      COLUMN_RATIO,
      headerRow,
      gridTemplate,
      startColResize,
      resetColWidths,
      loading,
      busy,
      rows,
      readyRows,
      selected,
      hours,
      payDate,
      bankAccount,
      paymentMethod,
      printLater,
      lastCreated,
      lastQueued,
      payDateField,
      bankAccountField,
      paymentMethodField,
      printLaterField,
      hoursField,
      headerCols,
      allSelected,
      rowStates,
      totals,
      canGenerate,
      formatCurrency,
      setRowSelected,
      onSelectAllChange,
      onHoursChange,
      onPaymentMethodChange,
      generate,
      openEmployee,
      openNewEmployee,
      openChecksToPrint,
    };
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
