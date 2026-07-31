<template>
  <div class="flex flex-col overflow-y-hidden h-full">
    <PageHeader :title="t`Cheque Register`">
      <Button ref="exportButton" :icon="false" @click="openExportModal = true">
        {{ t`Export` }}
      </Button>
      <FilterDropdown
        :schema-name="ModelNameEnum.AccountingLedgerEntry"
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
      <div class="grid grid-cols-5 gap-4 p-4 border-b dark:border-gray-800">
        <FormControl
          :border="true"
          size="small"
          :show-label="true"
          :df="bankAccountField"
          :value="bankAccount"
          @change="onBankAccountChange"
        />
      </div>

      <div class="flex flex-col overflow-hidden px-4 flex-1">
        <div
          v-if="!bankAccount"
          class="text-sm text-gray-600 dark:text-gray-300 py-4"
        >
          {{ t`Select a bank account to view the register.` }}
        </div>
        <div
          v-else-if="loading"
          class="text-sm text-gray-600 dark:text-gray-300 py-4"
        >
          {{ t`Loading…` }}
        </div>
        <template v-else>
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
              class="flex-1 text-gray-700 dark:text-gray-300 h-row-mid"
              :column-count="7"
              gap="1rem"
            >
              <div class="cell-header">{{ t`Date` }}</div>
              <div class="cell-header">{{ t`Payee` }}</div>
              <div class="cell-header">{{ t`Category` }}</div>
              <div class="cell-header">{{ t`Memo` }}</div>
              <div class="cell-header ms-auto">{{ t`Payment` }}</div>
              <div class="cell-header ms-auto">{{ t`Deposit` }}</div>
              <div class="cell-header ms-auto pe-4">{{ t`Balance` }}</div>
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
            <div v-for="(row, i) in rows" :key="row.key">
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
                  {{ i + 1 }}
                </div>
                <Row
                  gap="1rem"
                  class="
                    cursor-pointer
                    text-gray-900
                    dark:text-gray-300
                    flex-1
                    h-row-mid
                  "
                  :column-count="7"
                  @click="openRow(row)"
                >
                  <div class="cell-body">{{ row.date }}</div>
                  <div class="cell-body">{{ row.payee }}</div>
                  <div class="cell-body">{{ row.category }}</div>
                  <div class="cell-body">{{ row.memo }}</div>
                  <div class="cell-body ms-auto tabular-nums">
                    {{ row.payment }}
                  </div>
                  <div class="cell-body ms-auto tabular-nums">
                    {{ row.deposit }}
                  </div>
                  <div class="cell-body ms-auto tabular-nums pe-4">
                    {{ row.balance }}
                  </div>
                </Row>
              </div>
              <hr v-if="i !== rows.length - 1" class="dark:border-gray-800" />
            </div>
          </div>
        </template>
      </div>
    </div>

    <Modal :open-modal="openExportModal" @closemodal="openExportModal = false">
      <ExportWizard
        class="w-form"
        :schema-name="ModelNameEnum.AccountingLedgerEntry"
        :title="t`Cheque Register`"
        :list-filters="exportFilters"
      />
    </Modal>
  </div>
</template>

<script lang="ts">
import { ModelNameEnum } from 'models/types';
import { AccountTypeEnum } from 'models/baseModels/Account/types';
import { Field } from 'schemas/types';
import Button from 'src/components/Button.vue';
import ExportWizard from 'src/components/ExportWizard.vue';
import FilterDropdown from 'src/components/FilterDropdown.vue';
import FormControl from 'src/components/Controls/FormControl.vue';
import Modal from 'src/components/Modal.vue';
import PageHeader from 'src/components/PageHeader.vue';
import Row from 'src/components/Row.vue';
import { fyo } from 'src/initFyo';
import { handleErrorWithDialog } from 'src/errorHandling';
import { routeTo } from 'src/utils/ui';
import { QueryFilter } from 'utils/db/types';
import { defineComponent } from 'vue';

type AccountOpt = { name: string; accountName?: string };
type RegisterRow = {
  key: string;
  date: string;
  payee: string;
  category: string;
  memo: string;
  payment: string;
  deposit: string;
  balance: string;
  paymentName?: string;
};

const LAST_BANK_KEY = 'livebooks-register-bank-account';

export default defineComponent({
  name: 'BankRegister',
  components: {
    PageHeader,
    Button,
    Row,
    FilterDropdown,
    Modal,
    ExportWizard,
    FormControl,
  },
  data() {
    return {
      ModelNameEnum,
      bankAccount: '',
      bankAccounts: [] as AccountOpt[],
      accountNameById: {} as Record<string, string>,
      listFilters: {} as QueryFilter,
      rows: [] as RegisterRow[],
      loading: false,
      openExportModal: false,
    };
  },
  computed: {
    bankAccountField(): Field {
      return {
        fieldtype: 'Link',
        target: 'Account',
        fieldname: 'bankAccount',
        label: this.t`Bank account`,
        placeholder: this.t`Bank account`,
        filters: {
          isGroup: false,
          accountType: ['in', [AccountTypeEnum.Bank, AccountTypeEnum.Cash]],
        },
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
  async mounted() {
    try {
      await this.loadAccounts();
      const saved = localStorage.getItem(LAST_BANK_KEY);
      if (saved && this.bankAccounts.some((a) => a.name === saved)) {
        this.bankAccount = saved;
        await this.loadRows();
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('BankRegister mounted', error);
      await handleErrorWithDialog(error);
    }
  },
  methods: {
    accountLabel(id?: string) {
      if (!id) return '';
      return this.accountNameById[id] || id;
    },
    async loadAccounts() {
      const banks = (await fyo.db.getAll(ModelNameEnum.Account, {
        filters: {
          isGroup: false,
          accountType: ['in', [AccountTypeEnum.Bank, AccountTypeEnum.Cash]],
        },
        fields: ['name', 'accountName'],
        orderBy: 'accountName',
        order: 'asc',
      })) as AccountOpt[];
      this.bankAccounts = banks;

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
    applyFilter(filters: QueryFilter) {
      this.listFilters = filters ?? {};
      void this.loadRows();
    },
    async onBankAccountChange(value: string | null) {
      this.bankAccount = value || '';
      if (this.bankAccount) {
        localStorage.setItem(LAST_BANK_KEY, this.bankAccount);
      }
      await this.loadRows();
    },
    async goWriteEntry() {
      if (!this.bankAccount) return;
      localStorage.setItem(LAST_BANK_KEY, this.bankAccount);
      await routeTo({
        path: '/bank-register/write',
        query: { account: this.bankAccount },
      });
    },
    async loadRows() {
      if (!this.bankAccount) {
        this.rows = [];
        return;
      }
      this.loading = true;
      try {
        // Bank picker owns account; Filter can add party/date/etc.
        const restFilters = { ...this.listFilters };
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
          { memo: string; category: string; party: string }
        >();

        if (paymentNames.length) {
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
            party?: string;
          }[];
          for (const p of pays) {
            if (p.cancelled) {
              cancelled.add(p.name);
              continue;
            }
            const categoryId =
              p.paymentType === 'Pay' ? p.paymentAccount : p.account;
            paymentMap.set(p.name, {
              memo: p.memo || p.referenceId || '',
              category: this.accountLabel(categoryId),
              party: p.party || '',
            });
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
          balance += debit - credit;
          const payInfo =
            ale.referenceType === ModelNameEnum.Payment && ale.referenceName
              ? paymentMap.get(ale.referenceName)
              : undefined;
          rows.push({
            key: ale.name,
            date: String(ale.date || '').slice(0, 10),
            payee: payInfo?.party || ale.party || '',
            category: payInfo?.category || '',
            memo: payInfo?.memo || '',
            payment: credit > 0 ? fyo.format(fyo.pesa(credit), 'Currency') : '',
            deposit: debit > 0 ? fyo.format(fyo.pesa(debit), 'Currency') : '',
            balance: fyo.format(fyo.pesa(balance), 'Currency'),
            paymentName:
              ale.referenceType === ModelNameEnum.Payment
                ? ale.referenceName
                : undefined,
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
        await routeTo(`/edit/Payment/${row.paymentName}`);
      }
    },
  },
});
</script>

<style scoped>
.cell-header,
.cell-body {
  overflow-x: auto;
  white-space: nowrap;
  height: var(--h-row);
  display: flex;
  align-items: center;
  min-width: 0;
}
.cell-body {
  text-overflow: ellipsis;
  overflow: hidden;
}
</style>
