<template>
  <div class="flex flex-col overflow-y-hidden h-full">
    <PageHeader :title="t`Write Entry`">
      <Button :disabled="saving" @click="memorizeCurrent">
        {{ t`Schedule only…` }}
      </Button>
      <Button type="primary" :disabled="saving" @click="submitEntry">
        {{
          saving
            ? t`Saving…`
            : form.alsoRecurring
            ? t`Post + schedule`
            : t`Post to register`
        }}
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
          <div v-if="!splitEnabled">
            <FormControl
              :border="true"
              size="small"
              :show-label="true"
              :df="categoryField"
              :value="form.categoryAccount"
              @change="(v) => (form.categoryAccount = String(v || ''))"
            />
            <button
              type="button"
              class="mt-1 text-xs text-blue-600 hover:underline"
              @click="enableSplit"
            >
              {{ t`Split across multiple categories…` }}
            </button>
          </div>
          <FormControl
            :border="true"
            size="small"
            :show-label="true"
            :df="amountField"
            :value="form.amount"
            @change="(v) => (form.amount = Number(v) || 0)"
          />
          <div
            v-if="splitEnabled"
            class="
              sm:col-span-2
              border border-gray-200
              dark:border-gray-700
              rounded
              p-3
            "
          >
            <div class="flex items-center justify-between">
              <span
                class="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {{ t`Split categories` }}
              </span>
              <button
                type="button"
                class="text-xs text-blue-600 hover:underline"
                @click="disableSplit"
              >
                {{ t`Use a single category` }}
              </button>
            </div>
            <div
              v-for="(line, idx) in splitLines"
              :key="idx"
              class="flex items-end gap-2 mt-2"
            >
              <FormControl
                class="flex-1"
                :border="true"
                size="small"
                :show-label="idx === 0"
                :df="splitAccountField"
                :value="line.account"
                @change="(v) => (line.account = String(v || ''))"
              />
              <FormControl
                class="w-28 shrink-0"
                :border="true"
                size="small"
                :show-label="idx === 0"
                :df="splitAmountField"
                :value="line.amount"
                :step="0.01"
                @change="(v) => (line.amount = parseSplitAmount(v))"
              />
              <FormControl
                class="flex-1"
                :border="true"
                size="small"
                :show-label="idx === 0"
                :df="splitMemoField"
                :value="line.description"
                @change="(v) => (line.description = String(v || ''))"
              />
              <button
                type="button"
                class="
                  h-8
                  w-8
                  shrink-0
                  flex
                  items-center
                  justify-center
                  rounded
                  text-gray-600
                  dark:text-gray-400
                  hover:bg-gray-100
                  dark:hover:bg-gray-800
                "
                :title="t`Remove line`"
                @click="removeSplitLine(idx)"
              >
                <feather-icon name="x" class="w-4 h-4" />
              </button>
            </div>
            <div class="flex items-center justify-between mt-3">
              <Button @click="addSplitLine">
                {{ t`Add line` }}
              </Button>
              <span
                class="text-sm tabular-nums text-gray-600 dark:text-gray-400"
              >
                {{ t`Gross: ${formattedSplitGross}` }}
                <span class="mx-1">·</span>
                {{ t`Withholdings: ${formattedSplitWithholdings}` }}
                <span class="mx-1">·</span>
                <span :class="splitRemainder === 0 ? '' : 'text-red-600'">
                  {{ t`Remaining: ${formattedSplitRemainder}` }}
                </span>
              </span>
            </div>
          </div>
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
            {{ t`With this entry, also create a recurring schedule` }}
          </label>
        </div>

        <p
          v-if="isCreditCardRegister"
          class="mt-3 text-sm text-gray-500 dark:text-gray-400"
        >
          {{
            t`Credit card: Charge increases the card balance; Payment decreases it (pay the card from this register). To pay the card from a bank, write a Payment on the bank register and categorize it to this card.`
          }}
        </p>
        <p class="mt-3 text-sm text-gray-500 dark:text-gray-400">
          {{
            t`Post to register adds this payment now. Schedule only creates a template with no payment. Check “also create a recurring schedule” to do both — run schedules later from Recurring Transactions.`
          }}
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
import {
  isCreditCardAccountType,
  REGISTER_ACCOUNT_TYPES,
} from 'src/utils/registerAccountTypes';
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
import { isUuidDocId } from 'utils/ids';
import { routeTo } from 'src/utils/ui';
import { defineComponent } from 'vue';

type AccountOpt = { name: string; accountName?: string };
type SplitLine = { account: string; amount: number; description: string };

export default defineComponent({
  name: 'BankRegisterWrite',
  components: { PageHeader, Button, FormControl },
  props: {
    account: { type: String, default: '' },
  },
  data() {
    return {
      bankAccount: '',
      bankAccounts: [] as AccountOpt[],
      accountTypeById: {} as Record<string, string>,
      paymentMethods: [] as { name: string; type?: string }[],
      saving: false,
      // Bump after save so FormControls remount with cleared values.
      formKey: 0,
      // #8: split the category side into multiple lines.
      splitEnabled: false,
      splitLines: [] as SplitLine[],
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
        !this.isCreditCardRegister &&
        this.selectedMethodType === 'Check' &&
        this.form.paymentType === 'Pay'
      );
    },
    isCreditCardRegister(): boolean {
      return isCreditCardAccountType(this.accountTypeById[this.bankAccount]);
    },
    registerTitle(): string {
      return this.isCreditCardRegister
        ? this.t`Credit Card Register`
        : this.t`Check Register`;
    },
    bankAccountField(): Field {
      return {
        fieldtype: 'Link',
        target: 'Account',
        fieldname: 'bankAccount',
        label: this.t`Account`,
        placeholder: this.t`Account`,
        required: true,
        filters: {
          isGroup: false,
          accountType: ['in', [...REGISTER_ACCOUNT_TYPES]],
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
      const pay = this.form.paymentType === 'Pay';
      return {
        fieldtype: 'Link',
        target: 'Party',
        fieldname: 'party',
        label: this.t`Payee`,
        placeholder: this.t`Payee`,
        required: true,
        create: true,
        filters: pay
          ? {
              role: ['in', ['Supplier', 'Both', 'Employee', 'Contractor']],
            }
          : { role: ['in', ['Customer', 'Both']] },
      } as Field;
    },
    categoryField(): Field {
      // Dynamic: bank→allow CreditCard (pay the card); CC→allow Bank/Cash (pay from bank).
      const excluded = this.isCreditCardRegister
        ? [
            AccountTypeEnum.CreditCard,
            AccountTypeEnum.Receivable,
            AccountTypeEnum.Payable,
          ]
        : [
            AccountTypeEnum.Bank,
            AccountTypeEnum.Cash,
            AccountTypeEnum.Receivable,
            AccountTypeEnum.Payable,
          ];
      return {
        fieldtype: 'Link',
        target: 'Account',
        fieldname: 'categoryAccount',
        label: this.t`Category`,
        placeholder: this.t`Select category`,
        required: true,
        filters: {
          isGroup: false,
          accountType: ['not in', excluded],
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
      // CC: Charge=Pay (credit liability), Payment=Receive (debit liability).
      // Bank/Cash: Payment=Pay, Deposit=Receive.
      const payLabel = this.isCreditCardRegister
        ? this.t`Charge`
        : this.t`Payment`;
      const receiveLabel = this.isCreditCardRegister
        ? this.t`Payment`
        : this.t`Deposit`;
      return {
        fieldtype: 'Select',
        fieldname: 'paymentType',
        label: this.t`Entry type`,
        required: true,
        options: [
          { label: payLabel, value: 'Pay' },
          { label: receiveLabel, value: 'Receive' },
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
    // #8: per-row split fields; same category filter as categoryField.
    splitAccountField(): Field {
      return { ...this.categoryField, fieldname: 'splitAccount' };
    },
    // Signed: negative amounts are withholdings that reduce the check.
    splitAmountField(): Field {
      return {
        fieldtype: 'Float',
        fieldname: 'splitAmount',
        label: this.t`Amount`,
        required: true,
      } as Field;
    },
    splitMemoField(): Field {
      return {
        fieldtype: 'Data',
        fieldname: 'splitMemo',
        label: this.t`Memo`,
      } as Field;
    },
    // Cents math avoids float drift (0.1 + 0.2) in the sum checks.
    splitLineCents(): number[] {
      return this.splitLines.map((line) =>
        Math.round((Number(line.amount) || 0) * 100)
      );
    },
    /** Sum of positive lines (e.g. gross payroll expense). */
    splitGrossCents(): number {
      return this.splitLineCents
        .filter((cents) => cents > 0)
        .reduce((sum, cents) => sum + cents, 0);
    },
    /** Absolute sum of negative lines (withholdings reducing the check). */
    splitWithholdingsCents(): number {
      return -this.splitLineCents
        .filter((cents) => cents < 0)
        .reduce((sum, cents) => sum + cents, 0);
    },
    splitRemainder(): number {
      const signedCents = this.splitGrossCents - this.splitWithholdingsCents;
      const amountCents = Math.round((Number(this.form.amount) || 0) * 100);
      return (amountCents - signedCents) / 100;
    },
    formattedSplitGross(): string {
      return String(
        fyo.format(fyo.pesa(this.splitGrossCents / 100), 'Currency')
      );
    },
    formattedSplitWithholdings(): string {
      return String(
        fyo.format(fyo.pesa(this.splitWithholdingsCents / 100), 'Currency')
      );
    },
    formattedSplitRemainder(): string {
      return String(fyo.format(fyo.pesa(this.splitRemainder), 'Currency'));
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
      await this.applyInstrumentForAccount();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('BankRegisterWrite mounted', error);
      await handleErrorWithDialog(error);
    }
  },
  activated() {
    const previousAccount = this.bankAccount;
    this.applySavedBank();
    // keep-alive re-fires this on every return. Only reset instrument
    // defaults when the bank/card actually changed (query or last-used).
    if (this.bankAccount !== previousAccount) {
      void this.applyInstrumentForAccount();
    }
  },
  methods: {
    applySavedBank() {
      const names = this.bankAccounts.map((a) => a.name);
      const fromQuery = String(this.account || this.$route.query.account || '');
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
      void this.applyInstrumentForAccount();
    },
    async applyInstrumentForAccount() {
      if (!this.bankAccount) {
        return;
      }
      this.form.paymentType = 'Pay';
      this.form.printLater = false;
      this.form.checkNumber = '';
      this.form.paymentMethod = await resolveDefaultPaymentMethod(fyo, {
        forCreditCard: this.isCreditCardRegister,
      });
      this.formKey += 1;
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
    },
    async loadPaymentMethods() {
      try {
        const methods = (await fyo.db.getAll(ModelNameEnum.PaymentMethod, {
          fields: ['name', 'type'],
          orderBy: 'name',
          order: 'asc',
        })) as { name: string; type?: string }[];
        this.paymentMethods = methods;
      } catch {
        this.paymentMethods = [];
      }
    },
    enableSplit() {
      this.splitEnabled = true;
      if (!this.splitLines.length) {
        // Seed with the single category (if picked) so nothing is lost.
        this.splitLines = [
          {
            account: this.form.categoryAccount,
            amount: this.form.amount || 0,
            description: '',
          },
          { account: '', amount: 0, description: '' },
        ];
      }
    },
    disableSplit() {
      // Keep the first line's category so switching back is non-destructive.
      this.form.categoryAccount =
        this.splitLines[0]?.account || this.form.categoryAccount;
      this.splitEnabled = false;
      this.splitLines = [];
    },
    addSplitLine() {
      this.splitLines.push({ account: '', amount: 0, description: '' });
    },
    removeSplitLine(idx: number) {
      this.splitLines.splice(idx, 1);
    },
    parseSplitAmount(value: unknown): number {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    },
    /** #8: returns an error message, or '' when the split lines are valid. */
    validateSplitLines(): string {
      if (this.splitLines.length < 2) {
        return this.t`Add at least two split lines.`;
      }
      for (const line of this.splitLines) {
        if (!line.account) {
          return this.t`Every split line needs a category.`;
        }
        if (
          !Number.isFinite(Number(line.amount)) ||
          Number(line.amount) === 0
        ) {
          return this
            .t`Every split line needs a nonzero amount. Negative amounts are plugs that reduce the check.`;
        }
      }
      if (this.splitGrossCents <= 0) {
        return this.t`At least one split line must be positive.`;
      }
      const amountCents = Math.round((Number(this.form.amount) || 0) * 100);
      if (amountCents <= 0) {
        return this.t`Amount must be greater than 0.`;
      }
      if (this.splitRemainder !== 0) {
        return this
          .t`Split lines must add up to the check amount. Remaining: ${this.formattedSplitRemainder}`;
      }
      return '';
    },
    splitFieldsForSubmit(): SplitLine[] | undefined {
      if (!this.splitEnabled) {
        return undefined;
      }
      return this.splitLines.map((line) => ({
        account: line.account,
        amount: line.amount,
        description: line.description,
      }));
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
    showFormError(message: string) {
      showToast({ type: 'error', message, duration: 'long' });
    },
    async submitEntry() {
      if (!this.bankAccount) {
        this.showFormError(this.t`Select a bank or credit card account.`);
        return;
      }
      if (!this.form.party?.trim()) {
        this.showFormError(this.t`Payee is required.`);
        return;
      }
      if (!this.splitEnabled && !this.form.categoryAccount) {
        this.showFormError(this.t`Category is required.`);
        return;
      }
      if (!this.form.paymentMethod) {
        this.showFormError(this.t`Payment method is required.`);
        return;
      }
      if (!(this.form.amount > 0)) {
        this.showFormError(this.t`Amount must be greater than 0.`);
        return;
      }
      if (this.splitEnabled) {
        const splitError = this.validateSplitLines();
        if (splitError) {
          this.showFormError(splitError);
          return;
        }
      }
      this.saving = true;
      try {
        const payee = this.form.party.trim();
        const fields = {
          date: this.form.date,
          party: payee,
          // Link control stores Party.name (UUID) — pass as partyId so we
          // never create a Party whose partyName is a UUID.
          partyId: isUuidDocId(payee) ? payee : undefined,
          categoryAccount: this.splitEnabled ? '' : this.form.categoryAccount,
          bankAccount: this.bankAccount,
          amount: this.form.amount,
          paymentType: this.form.paymentType,
          memo: this.form.memo,
          paymentMethod: this.form.paymentMethod,
          printLater: !!(this.canQueue && this.form.printLater),
          checkNumber: this.form.checkNumber.trim(),
          splits: this.splitFieldsForSubmit(),
        };
        await createRegisterPayment(fyo, fields);
        if (this.form.alsoRecurring) {
          await memorizeRegisterFields(fyo, fields, { openEditor: false });
        }
        showToast({
          type: 'success',
          message: this.form.alsoRecurring
            ? this
                .t`Entry saved to ${this.registerTitle}; recurring template created`
            : this.t`Entry saved to ${this.registerTitle}`,
        });
        setLastRegisterBankAccount(this.bankAccount);
        // keep-alive caches this page — clear entry fields before leaving so
        // the next Write Entry visit is blank (bank / method defaults stay).
        this.resetFormAfterSave();
        await routeTo('/bank-register');
      } catch (error) {
        await handleErrorWithDialog(error);
        this.showFormError(
          error instanceof Error ? error.message : String(error)
        );
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
      this.splitEnabled = false;
      this.splitLines = [];
      this.formKey += 1;
    },
    async memorizeCurrent() {
      if (!this.bankAccount) {
        this.showFormError(this.t`Select a bank or credit card account.`);
        return;
      }
      if (this.splitEnabled) {
        const splitError = this.validateSplitLines();
        if (splitError) {
          this.showFormError(splitError);
          return;
        }
      }
      const proceed = (await showDialog({
        title: this.t`Schedule only?`,
        detail: this
          .t`This creates a reusable schedule under Recurring Transactions. It does not post a payment to the Check Register. To post now and also schedule, use Post to register with “also create a recurring schedule” checked.`,
        type: 'info',
        buttons: [
          { label: this.t`Cancel`, action: () => false, isEscape: true },
          {
            label: this.t`Schedule only`,
            action: () => true,
            isPrimary: true,
          },
        ],
      })) as boolean;
      if (!proceed) {
        return;
      }
      try {
        const payee = this.form.party.trim();
        await memorizeRegisterFields(fyo, {
          date: this.form.date,
          party: payee,
          partyId: isUuidDocId(payee) ? payee : undefined,
          categoryAccount: this.splitEnabled ? '' : this.form.categoryAccount,
          bankAccount: this.bankAccount,
          amount: this.form.amount,
          paymentType: this.form.paymentType,
          memo: this.form.memo,
          paymentMethod: this.form.paymentMethod,
          splits: this.splitFieldsForSubmit(),
        });
      } catch (error) {
        await handleErrorWithDialog(error);
      }
    },
  },
});
</script>
