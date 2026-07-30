<template>
  <div class="flex flex-col overflow-y-hidden h-full">
    <PageHeader :title="t`Register`">
      <Button @click="showWriteForm = !showWriteForm">
        {{ showWriteForm ? t`Hide form` : t`Write entry` }}
      </Button>
      <Button @click="memorizeCurrent">{{ t`Memorize…` }}</Button>
    </PageHeader>

    <div
      class="
        flex-1
        overflow-y-auto overflow-x-hidden
        custom-scroll custom-scroll-thumb1
        p-4
      "
    >
      <div class="flex flex-wrap items-end gap-4 mb-4">
        <label class="flex flex-col gap-1 text-sm min-w-[16rem]">
          <span class="text-gray-600 dark:text-gray-400">{{
            t`Bank account`
          }}</span>
          <select
            v-model="bankAccount"
            class="
              border
              dark:border-gray-700
              rounded
              px-2
              py-1.5
              bg-white
              dark:bg-gray-900
              text-gray-900
              dark:text-gray-100
            "
            @change="onBankChange"
          >
            <option disabled value="">{{ t`Select account` }}</option>
            <option v-for="a in bankAccounts" :key="a.name" :value="a.name">
              {{ a.accountName || a.name }}
            </option>
          </select>
        </label>
      </div>

      <!-- Write entry -->
      <div
        v-if="showWriteForm"
        class="
          mb-6
          p-4
          border border-gray-200
          dark:border-gray-700
          rounded-lg
          bg-white
          dark:bg-gray-900
          max-w-3xl
        "
      >
        <h2 class="text-base font-semibold mb-3 dark:text-gray-100">
          {{ t`Write entry` }}
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-gray-600 dark:text-gray-400">{{ t`Date` }}</span>
            <input
              v-model="form.date"
              type="date"
              class="
                border
                dark:border-gray-700
                rounded
                px-2
                py-1.5
                bg-white
                dark:bg-gray-900
              "
            />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-gray-600 dark:text-gray-400">{{ t`Payee` }}</span>
            <input
              v-model="form.party"
              list="register-party-list"
              class="
                border
                dark:border-gray-700
                rounded
                px-2
                py-1.5
                bg-white
                dark:bg-gray-900
              "
              :placeholder="t`Payee`"
            />
            <datalist id="register-party-list">
              <option v-for="p in parties" :key="p" :value="p" />
            </datalist>
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-gray-600 dark:text-gray-400">{{
              t`Category`
            }}</span>
            <select
              v-model="form.categoryAccount"
              class="
                border
                dark:border-gray-700
                rounded
                px-2
                py-1.5
                bg-white
                dark:bg-gray-900
              "
            >
              <option disabled value="">{{ t`Select category` }}</option>
              <option
                v-for="a in categoryAccounts"
                :key="a.name"
                :value="a.name"
              >
                {{ a.accountName || a.name }}
              </option>
            </select>
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-gray-600 dark:text-gray-400">{{
              t`Amount`
            }}</span>
            <input
              v-model.number="form.amount"
              type="number"
              min="0.01"
              step="0.01"
              class="
                border
                dark:border-gray-700
                rounded
                px-2
                py-1.5
                bg-white
                dark:bg-gray-900
              "
            />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-gray-600 dark:text-gray-400">{{
              t`Entry type`
            }}</span>
            <select
              v-model="form.paymentType"
              class="
                border
                dark:border-gray-700
                rounded
                px-2
                py-1.5
                bg-white
                dark:bg-gray-900
              "
            >
              <option value="Pay">{{ t`Payment` }}</option>
              <option value="Receive">{{ t`Deposit` }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-gray-600 dark:text-gray-400">{{ t`Memo` }}</span>
            <input
              v-model="form.memo"
              type="text"
              class="
                border
                dark:border-gray-700
                rounded
                px-2
                py-1.5
                bg-white
                dark:bg-gray-900
              "
            />
          </label>
        </div>
        <div class="mt-4 flex gap-2">
          <Button type="primary" :disabled="saving" @click="submitEntry">
            {{ saving ? t`Saving…` : t`Save entry` }}
          </Button>
        </div>
        <p v-if="formError" class="mt-2 text-sm text-red-600">
          {{ formError }}
        </p>
      </div>

      <div v-if="!bankAccount" class="text-sm text-gray-600 dark:text-gray-400">
        {{ t`Select a bank account to view the register.` }}
      </div>
      <div v-else-if="loading" class="text-sm text-gray-600 dark:text-gray-400">
        {{ t`Loading…` }}
      </div>
      <table
        v-else
        class="
          min-w-full
          text-sm text-start
          border border-gray-200
          dark:border-gray-700
          rounded-lg
          overflow-hidden
        "
      >
        <thead class="bg-gray-50 dark:bg-gray-800 text-xs uppercase">
          <tr>
            <th class="text-start p-3 border-b dark:border-gray-700">
              {{ t`Date` }}
            </th>
            <th class="text-start p-3 border-b dark:border-gray-700">
              {{ t`Payee` }}
            </th>
            <th class="text-start p-3 border-b dark:border-gray-700">
              {{ t`Category` }}
            </th>
            <th class="text-start p-3 border-b dark:border-gray-700">
              {{ t`Memo` }}
            </th>
            <th class="text-end p-3 border-b dark:border-gray-700">
              {{ t`Payment` }}
            </th>
            <th class="text-end p-3 border-b dark:border-gray-700">
              {{ t`Deposit` }}
            </th>
            <th class="text-end p-3 border-b dark:border-gray-700">
              {{ t`Balance` }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!rows.length">
            <td
              colspan="7"
              class="p-4 text-gray-600 dark:text-gray-400 text-sm"
            >
              {{ t`No entries yet.` }}
            </td>
          </tr>
          <tr
            v-for="row in rows"
            :key="row.key"
            class="
              cursor-pointer
              border-b
              dark:border-gray-800
              hover:bg-gray-50
              dark:hover:bg-gray-800/80
            "
            @click="openRow(row)"
          >
            <td class="p-3">{{ row.date }}</td>
            <td class="p-3">{{ row.payee }}</td>
            <td class="p-3">{{ row.category }}</td>
            <td class="p-3">{{ row.memo }}</td>
            <td class="p-3 text-end tabular-nums">{{ row.payment }}</td>
            <td class="p-3 text-end tabular-nums">{{ row.deposit }}</td>
            <td class="p-3 text-end tabular-nums">{{ row.balance }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script lang="ts">
import { DateTime } from 'luxon';
import { ModelNameEnum } from 'models/types';
import { AccountTypeEnum } from 'models/baseModels/Account/types';
import Button from 'src/components/Button.vue';
import PageHeader from 'src/components/PageHeader.vue';
import { fyo } from 'src/initFyo';
import { handleErrorWithDialog } from 'src/errorHandling';
import {
  createRegisterPayment,
  memorizeRegisterFields,
} from 'src/utils/memorizedTransactions';
import { routeTo } from 'src/utils/ui';
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
  components: { PageHeader, Button },
  data() {
    return {
      bankAccount: '',
      bankAccounts: [] as AccountOpt[],
      categoryAccounts: [] as AccountOpt[],
      parties: [] as string[],
      rows: [] as RegisterRow[],
      loading: false,
      saving: false,
      showWriteForm: true,
      formError: '',
      form: {
        date: DateTime.now().toISODate() || '',
        party: '',
        categoryAccount: '',
        amount: 0,
        paymentType: 'Pay' as 'Pay' | 'Receive',
        memo: '',
      },
    };
  },
  async mounted() {
    try {
      await this.loadAccounts();
      await this.loadParties();
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

      const cats = (await fyo.db.getAll(ModelNameEnum.Account, {
        filters: { isGroup: false },
        fields: ['name', 'accountName', 'accountType'],
        orderBy: 'accountName',
        order: 'asc',
      })) as (AccountOpt & { accountType?: string })[];
      this.categoryAccounts = cats.filter(
        (a) =>
          a.accountType !== AccountTypeEnum.Bank &&
          a.accountType !== AccountTypeEnum.Cash &&
          a.accountType !== AccountTypeEnum.Receivable &&
          a.accountType !== AccountTypeEnum.Payable
      );
    },
    async loadParties() {
      const rows = (await fyo.db.getAll(ModelNameEnum.Party, {
        fields: ['name'],
        orderBy: 'name',
        order: 'asc',
      })) as { name: string }[];
      this.parties = rows.map((r) => r.name);
    },
    async onBankChange() {
      localStorage.setItem(LAST_BANK_KEY, this.bankAccount);
      await this.loadRows();
    },
    async loadRows() {
      if (!this.bankAccount) {
        this.rows = [];
        return;
      }
      this.loading = true;
      try {
        const ales = (await fyo.db.getAll(ModelNameEnum.AccountingLedgerEntry, {
          filters: {
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

        // Exclude cancelled Payments
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
          // One bulk query for cancelled + memo/category (avoids N+1 getDoc)
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
            const category =
              p.paymentType === 'Pay' ? p.paymentAccount : p.account;
            paymentMap.set(p.name, {
              // Prefer memo; fall back to referenceId for any early register entries
              memo: p.memo || p.referenceId || '',
              category: category || '',
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
        // Newest first for register feel
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
    async submitEntry() {
      this.formError = '';
      if (!this.bankAccount) {
        this.formError = this.t`Select a bank account.`;
        return;
      }
      if (!this.form.party?.trim()) {
        this.formError = this.t`Payee is required.`;
        return;
      }
      if (!this.form.categoryAccount) {
        this.formError = this.t`Category is required.`;
        return;
      }
      if (!(this.form.amount > 0)) {
        this.formError = this.t`Amount must be greater than 0.`;
        return;
      }
      this.saving = true;
      try {
        await createRegisterPayment(fyo, {
          date: this.form.date,
          party: this.form.party.trim(),
          categoryAccount: this.form.categoryAccount,
          bankAccount: this.bankAccount,
          amount: this.form.amount,
          paymentType: this.form.paymentType,
          memo: this.form.memo,
        });
        this.form.amount = 0;
        this.form.memo = '';
        await this.loadParties();
        await this.loadRows();
      } catch (error) {
        await handleErrorWithDialog(error);
        this.formError = error instanceof Error ? error.message : String(error);
      } finally {
        this.saving = false;
      }
    },
    async memorizeCurrent() {
      if (!this.bankAccount) {
        this.formError = this.t`Select a bank account.`;
        return;
      }
      try {
        await memorizeRegisterFields(fyo, {
          date: this.form.date,
          party: this.form.party.trim(),
          categoryAccount: this.form.categoryAccount,
          bankAccount: this.bankAccount,
          amount: this.form.amount,
          paymentType: this.form.paymentType,
          memo: this.form.memo,
        });
      } catch (error) {
        await handleErrorWithDialog(error);
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
