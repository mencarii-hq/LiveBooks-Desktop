<template>
  <div class="flex flex-col overflow-y-hidden h-full">
    <PageHeader :title="t`Write Entry`">
      <Button :disabled="saving" @click="memorizeCurrent">
        {{ t`Memorize…` }}
      </Button>
      <Button type="primary" :disabled="saving" @click="submitEntry">
        {{ saving ? t`Saving…` : t`Save` }}
      </Button>
    </PageHeader>

    <div class="flex-1 overflow-y-auto custom-scroll custom-scroll-thumb1 p-4">
      <div
        class="
          w-form
          max-w-3xl
          border border-gray-200
          dark:border-gray-700
          rounded
          bg-white
          dark:bg-gray-900
          p-4
        "
      >
        <FormControl
          :border="true"
          size="small"
          :show-label="true"
          :df="bankAccountField"
          :value="bankAccount"
          @change="onBankAccountChange"
        />

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
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
            <span class="text-gray-600 dark:text-gray-400"
              >{{ t`Payee` }} <span class="text-red-500">*</span></span
            >
            <input
              v-model="form.party"
              list="register-write-party-list"
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
            <datalist id="register-write-party-list">
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
            <span class="text-gray-600 dark:text-gray-400"
              >{{ t`Amount` }} <span class="text-red-500">*</span></span
            >
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

        <p v-if="formError" class="mt-3 text-sm text-red-600">
          {{ formError }}
        </p>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { DateTime } from 'luxon';
import { ModelNameEnum } from 'models/types';
import { AccountTypeEnum } from 'models/baseModels/Account/types';
import { Field } from 'schemas/types';
import Button from 'src/components/Button.vue';
import FormControl from 'src/components/Controls/FormControl.vue';
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

const LAST_BANK_KEY = 'livebooks-register-bank-account';

export default defineComponent({
  name: 'BankRegisterWrite',
  components: { PageHeader, Button, FormControl },
  data() {
    return {
      bankAccount: '',
      bankAccounts: [] as AccountOpt[],
      categoryAccounts: [] as AccountOpt[],
      parties: [] as string[],
      saving: false,
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
  },
  async mounted() {
    try {
      await this.loadAccounts();
      await this.loadParties();
      const fromQuery = String(this.$route.query.account || '');
      const saved = localStorage.getItem(LAST_BANK_KEY) || '';
      const pick =
        (fromQuery && this.bankAccounts.some((a) => a.name === fromQuery)
          ? fromQuery
          : '') ||
        (saved && this.bankAccounts.some((a) => a.name === saved) ? saved : '');
      this.bankAccount = pick;
      if (pick) {
        localStorage.setItem(LAST_BANK_KEY, pick);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('BankRegisterWrite mounted', error);
      await handleErrorWithDialog(error);
    }
  },
  methods: {
    onBankAccountChange(value: string | null) {
      this.bankAccount = value || '';
      if (this.bankAccount) {
        localStorage.setItem(LAST_BANK_KEY, this.bankAccount);
      }
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
        localStorage.setItem(LAST_BANK_KEY, this.bankAccount);
        await routeTo('/bank-register');
      } catch (error) {
        await handleErrorWithDialog(error);
        this.formError = error instanceof Error ? error.message : String(error);
      } finally {
        this.saving = false;
      }
    },
    async memorizeCurrent() {
      this.formError = '';
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
  },
});
</script>
