<template>
  <div class="flex flex-col overflow-y-hidden h-full">
    <PageHeader :title="t`Write Entry`">
      <Button :disabled="saving" @click="memorizeCurrent">
        {{ t`Save as recurring…` }}
      </Button>
      <Button type="primary" :disabled="saving" @click="submitEntry">
        {{ saving ? t`Saving…` : t`Save entry` }}
      </Button>
    </PageHeader>

    <div class="flex-1 overflow-y-auto custom-scroll custom-scroll-thumb1 p-4">
      <div
        :key="formKey"
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
            @change="setFormDate"
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
            v-if="canQueue && !form.printLater"
            :border="true"
            size="small"
            :show-label="true"
            :df="checkNumberField"
            :value="form.checkNumber"
            @change="(v) => (form.checkNumber = String(v || ''))"
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

          <label
            class="
              sm:col-span-2
              flex
              items-center
              gap-2
              text-sm text-gray-700
              dark:text-gray-300
            "
          >
            <input
              v-model="form.alsoRecurring"
              type="checkbox"
              class="h-4 w-4"
            />
            {{ t`Also save as a recurring template` }}
          </label>
        </div>

        <p class="mt-3 text-sm text-gray-500 dark:text-gray-400">
          {{
            t`Save entry posts to the Check Register. Save as recurring stores a schedule only (no payment) — run it later from Recurring Transactions.`
          }}
        </p>

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
import { showDialog, showToast } from 'src/utils/interactive';
import {
  createRegisterPayment,
  memorizeRegisterFields,
  resolveDefaultPaymentMethod,
} from 'src/utils/memorizedTransactions';
import {
  getLastRegisterBankAccount,
  setLastRegisterBankAccount,
} from 'src/utils/registerBankAccount';
import { defineComponent } from 'vue';

type AccountOpt = { name: string; accountName?: string };

export default defineComponent({
  name: 'BankRegisterWrite',
  components: { PageHeader, Button, FormControl },
  data() {
    return {
      bankAccount: '',
      bankAccounts: [] as AccountOpt[],
      paymentMethods: [] as { name: string; type?: string }[],
      saving: false,
      formError: '',
      // Bump after save so FormControls remount with cleared values.
      formKey: 0,
      form: {
        date: DateTime.now().toISODate() || '',
        party: '',
        categoryAccount: '',
        amount: 0,
        paymentType: 'Pay' as 'Pay' | 'Receive',
        memo: '',
        paymentMethod: '',
        printLater: false,
        alsoRecurring: false,
        checkNumber: '',
      },
    };
  },
  computed: {
    selectedMethodType(): string {
      const name = this.form.paymentMethod.trim().toLowerCase();
      // Prefer literal "Check" name even if an older book still has type Bank.
      if (name === 'check') {
        return 'Check';
      }
      const m = this.paymentMethods.find(
        (pm) => pm.name === this.form.paymentMethod
      );
      return m?.type || '';
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
        required: true,
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
        required: true,
      } as Field;
    },
    partyField(): Field {
      return {
        fieldtype: 'Link',
        target: 'Party',
        fieldname: 'party',
        label: this.t`Payee`,
        placeholder: this.t`Payee`,
        required: true,
      } as Field;
    },
    categoryField(): Field {
      return {
        fieldtype: 'Link',
        target: 'Account',
        fieldname: 'categoryAccount',
        label: this.t`Category`,
        placeholder: this.t`Select category`,
        required: true,
        filters: {
          isGroup: false,
          accountType: [
            'not in',
            [
              AccountTypeEnum.Bank,
              AccountTypeEnum.Cash,
              AccountTypeEnum.Receivable,
              AccountTypeEnum.Payable,
            ],
          ],
        },
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
        required: true,
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
    // #3: number of an already-written check (hidden when queuing — print
    // assigns queued numbers).
    checkNumberField(): Field {
      return {
        fieldtype: 'Data',
        fieldname: 'checkNumber',
        label: this.t`Check no.`,
        placeholder: this.t`Blank = unprinted`,
      } as Field;
    },
  },
  watch: {
    bankAccount(value: string) {
      if (value) {
        setLastRegisterBankAccount(value);
      }
    },
    // Drop a typed check number when the field is hidden (print-later or
    // non-Check/Pay) so it cannot resurface on a later Save.
    canQueue(value: boolean) {
      if (!value) {
        this.form.checkNumber = '';
      }
    },
    'form.printLater'(value: boolean) {
      if (value) {
        this.form.checkNumber = '';
      }
    },
  },
  async mounted() {
    try {
      await this.loadAccounts();
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
    setFormDate(value: unknown) {
      // The Date control emits a JS Date; String(date) is not ISO and fails
      // Datetime conversion downstream (createRegisterPayment and
      // memorizeRegisterFields both consume form.date).
      if (value instanceof Date) {
        this.form.date = DateTime.fromJSDate(value).toISODate() ?? '';
        return;
      }
      this.form.date = value ? String(value) : '';
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
        const fields = {
          date: this.form.date,
          party: this.form.party.trim(),
          categoryAccount: this.form.categoryAccount,
          bankAccount: this.bankAccount,
          amount: this.form.amount,
          paymentType: this.form.paymentType,
          memo: this.form.memo,
          paymentMethod: this.form.paymentMethod,
          printLater: !!(this.canQueue && this.form.printLater),
          checkNumber: this.form.checkNumber.trim(),
        };
        await createRegisterPayment(fyo, fields);
        if (this.form.alsoRecurring) {
          await memorizeRegisterFields(fyo, fields, { openEditor: false });
          showToast({
            type: 'success',
            message: this
              .t`Entry saved to Check Register; recurring template created`,
          });
        } else {
          showToast({
            type: 'success',
            message: this.t`Entry saved to Check Register`,
          });
        }
        setLastRegisterBankAccount(this.bankAccount);
        // keep-alive caches this page — clear entry fields before leaving so
        // the next Write Entry visit is blank (bank / method defaults stay).
        this.resetFormAfterSave();
        await this.$router.push({ name: 'Check Register' });
      } catch (error) {
        await handleErrorWithDialog(error);
        this.formError = error instanceof Error ? error.message : String(error);
      } finally {
        this.saving = false;
      }
    },
    resetFormAfterSave() {
      const paymentMethod = this.form.paymentMethod;
      this.form = {
        date: DateTime.now().toISODate() || '',
        party: '',
        categoryAccount: '',
        amount: 0,
        paymentType: 'Pay',
        memo: '',
        paymentMethod,
        printLater: false,
        alsoRecurring: false,
        checkNumber: '',
      };
      this.formError = '';
      this.formKey += 1;
    },
    async memorizeCurrent() {
      this.formError = '';
      if (!this.bankAccount) {
        this.formError = this.t`Select a bank account.`;
        return;
      }
      const proceed = (await showDialog({
        title: this.t`Save as recurring template?`,
        detail: this
          .t`This stores a reusable schedule under Recurring Transactions. It does not post a payment to the Check Register. To post now and also schedule, use Save entry with “Also save as a recurring template” checked.`,
        type: 'info',
        buttons: [
          { label: this.t`Cancel`, action: () => false, isEscape: true },
          {
            label: this.t`Save template only`,
            action: () => true,
            isPrimary: true,
          },
        ],
      })) as boolean;
      if (!proceed) {
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
