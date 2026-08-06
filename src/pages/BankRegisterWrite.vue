<template>
  <div class="flex flex-col overflow-y-hidden h-full">
    <PageHeader :title="t`Write Entry`">
      <Button :disabled="saving" @click="memorizeCurrent">
        {{ t`Recurring` }}
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
          <FormControl
            :border="true"
            size="small"
            :show-label="true"
            :df="dateField"
            :value="form.date"
            @change="(v) => (form.date = String(v || ''))"
          />
          <FormControl
            :border="true"
            size="small"
            :show-label="true"
            :df="partyField"
            :value="form.party"
            @change="(v) => (form.party = String(v || ''))"
          />
          <FormControl
            :border="true"
            size="small"
            :show-label="true"
            :df="categoryField"
            :value="form.categoryAccount"
            @change="(v) => (form.categoryAccount = String(v || ''))"
          />
          <FormControl
            :border="true"
            size="small"
            :show-label="true"
            :df="amountField"
            :value="form.amount"
            @change="(v) => (form.amount = Number(v) || 0)"
          />
          <FormControl
            :border="true"
            size="small"
            :show-label="true"
            :df="paymentTypeField"
            :value="form.paymentType"
            @change="(v) => (form.paymentType = (v as 'Pay' | 'Receive') || 'Pay')"
          />
          <FormControl
            :border="true"
            size="small"
            :show-label="true"
            :df="paymentMethodField"
            :value="form.paymentMethod"
            @change="(v) => (form.paymentMethod = String(v || ''))"
          />
          <FormControl
            class="sm:col-span-2"
            :border="true"
            size="small"
            :show-label="true"
            :df="memoField"
            :value="form.memo"
            @change="(v) => (form.memo = String(v || ''))"
          />

          <label
            v-if="canQueue"
            class="
              sm:col-span-2
              flex
              items-center
              gap-2
              text-sm text-gray-700
              dark:text-gray-300
            "
          >
            <input v-model="form.printLater" type="checkbox" class="h-4 w-4" />
            {{ t`Print later (add to Checks to Print queue)` }}
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
  resolveDefaultPaymentMethod,
} from 'src/utils/memorizedTransactions';
import {
  getLastRegisterBankAccount,
  setLastRegisterBankAccount,
} from 'src/utils/registerBankAccount';
import { routeTo } from 'src/utils/ui';
import { defineComponent } from 'vue';

type AccountOpt = { name: string; accountName?: string };

export default defineComponent({
  name: 'BankRegisterWrite',
  components: { PageHeader, Button, FormControl },
  data() {
    return {
      bankAccount: '',
      bankAccounts: [] as AccountOpt[],
      categoryAccounts: [] as AccountOpt[],
      parties: [] as string[],
      paymentMethods: [] as { name: string; type?: string }[],
      saving: false,
      formError: '',
      form: {
        date: DateTime.now().toISODate() || '',
        party: '',
        categoryAccount: '',
        amount: 0,
        paymentType: 'Pay' as 'Pay' | 'Receive',
        memo: '',
        paymentMethod: '',
        printLater: false,
      },
    };
  },
  computed: {
    selectedMethodType(): string {
      const m = this.paymentMethods.find(
        (pm) => pm.name === this.form.paymentMethod
      );
      if (m?.type) {
        return m.type;
      }
      return this.form.paymentMethod.trim().toLowerCase() === 'check'
        ? 'Check'
        : '';
    },
    // Q-AF: only Pay + Check entries can be queued for batch printing.
    canQueue(): boolean {
      return (
        this.selectedMethodType === 'Check' && this.form.paymentType === 'Pay'
      );
    },
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
    dateField(): Field {
      return {
        fieldtype: 'Date',
        fieldname: 'date',
        label: this.t`Date`,
      } as Field;
    },
    partyField(): Field {
      return {
        fieldtype: 'AutoComplete',
        fieldname: 'party',
        label: this.t`Payee`,
        placeholder: this.t`Payee`,
        required: true,
        options: this.parties.map((p) => ({ label: p, value: p })),
      } as Field;
    },
    categoryField(): Field {
      return {
        fieldtype: 'AutoComplete',
        fieldname: 'categoryAccount',
        label: this.t`Category`,
        placeholder: this.t`Select category`,
        required: true,
        options: this.categoryAccounts.map((a) => ({
          label: a.accountName || a.name,
          value: a.name,
        })),
      } as Field;
    },
    amountField(): Field {
      return {
        fieldtype: 'Float',
        fieldname: 'amount',
        label: this.t`Amount`,
        required: true,
        minvalue: 0.01,
      } as Field;
    },
    paymentTypeField(): Field {
      return {
        // Select (not AutoComplete): show labels Payment/Deposit while
        // storing Pay/Receive for Payment.paymentType.
        fieldtype: 'Select',
        fieldname: 'paymentType',
        label: this.t`Entry type`,
        options: [
          { label: this.t`Payment`, value: 'Pay' },
          { label: this.t`Deposit`, value: 'Receive' },
        ],
      } as Field;
    },
    paymentMethodField(): Field {
      return {
        fieldtype: 'AutoComplete',
        fieldname: 'paymentMethod',
        label: this.t`Payment method`,
        placeholder: this.t`Select method`,
        required: true,
        options: this.paymentMethods.map((m) => ({
          label: m.name,
          value: m.name,
        })),
      } as Field;
    },
    memoField(): Field {
      return {
        fieldtype: 'Data',
        fieldname: 'memo',
        label: this.t`Memo`,
      } as Field;
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
    try {
      await this.loadAccounts();
      await this.loadParties();
      await this.loadPaymentMethods();
      this.applySavedBank();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('BankRegisterWrite mounted', error);
      await handleErrorWithDialog(error);
    }
  },
  activated() {
    this.applySavedBank();
  },
  methods: {
    applySavedBank() {
      const names = this.bankAccounts.map((a) => a.name);
      const fromQuery = String(this.$route.query.account || '');
      const saved = getLastRegisterBankAccount(names);
      const pick =
        (fromQuery && names.includes(fromQuery) ? fromQuery : '') ||
        saved ||
        this.bankAccount;
      this.bankAccount = names.includes(pick) ? pick : '';
      if (this.bankAccount) {
        setLastRegisterBankAccount(this.bankAccount);
      }
    },
    onBankAccountChange(value: string | null) {
      this.bankAccount = value || '';
      if (this.bankAccount) {
        setLastRegisterBankAccount(this.bankAccount);
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
    async loadPaymentMethods() {
      try {
        const methods = (await fyo.db.getAll(ModelNameEnum.PaymentMethod, {
          fields: ['name', 'type'],
          orderBy: 'name',
          order: 'asc',
        })) as { name: string; type?: string }[];
        this.paymentMethods = methods;
        if (!this.form.paymentMethod) {
          this.form.paymentMethod = await resolveDefaultPaymentMethod(fyo);
        }
      } catch {
        this.paymentMethods = [];
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
      if (!this.form.paymentMethod) {
        this.formError = this.t`Payment method is required.`;
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
          paymentMethod: this.form.paymentMethod,
          printLater: this.canQueue ? this.form.printLater : false,
        });
        setLastRegisterBankAccount(this.bankAccount);
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
          paymentMethod: this.form.paymentMethod,
        });
      } catch (error) {
        await handleErrorWithDialog(error);
      }
    },
  },
});
</script>
