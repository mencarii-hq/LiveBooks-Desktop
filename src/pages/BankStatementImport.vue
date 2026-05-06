<template>
  <div class="flex flex-col overflow-y-hidden h-full">
    <PageHeader :title="t`Import bank statement (CSV)`" />
    <div
      class="
        flex-1
        overflow-y-auto overflow-x-hidden
        custom-scroll custom-scroll-thumb1
        p-4
        max-w-4xl
        space-y-6
      "
    >
      <section
        v-if="cloudBookId"
        class="border rounded-lg p-4 dark:border-gray-700"
      >
        <h2 class="text-sm font-medium mb-2">
          {{ t`Plaid statements (cloud)` }}
        </h2>
        <p class="text-xs text-gray-600 dark:text-gray-400 mb-3">
          {{
            t`Sync stores official PDFs from Plaid in LiveBooks Cloud (book owner). Use period dates when importing lines from your own CSV export.`
          }}
        </p>
        <Button class="me-2" type="secondary" @click="loadCloudFiles">
          {{ t`Refresh list` }}
        </Button>
        <Button type="secondary" @click="syncCloudStatements">
          {{ t`Sync from Plaid` }}
        </Button>
        <p
          v-if="cloudMsg"
          class="text-xs mt-2 text-gray-700 dark:text-gray-300"
        >
          {{ cloudMsg }}
        </p>
        <ul v-if="cloudFiles.length" class="mt-3 text-xs space-y-1 font-mono">
          <li v-for="f in cloudFiles" :key="f.id">
            {{ f.statement_id }} · {{ f.period_start }} → {{ f.period_end }} ·
            PDF: {{ f.pdf ? t`yes` : t`no` }}
          </li>
        </ul>
      </section>

      <div>
        <label class="block text-sm font-medium mb-1">{{
          t`Bank account`
        }}</label>
        <select
          v-model="bankAccount"
          class="
            border
            rounded
            px-2
            py-1
            w-full
            max-w-md
            dark:bg-gray-900 dark:border-gray-700
          "
        >
          <option value="">{{ t`Select…` }}</option>
          <option v-for="a in bankAccounts" :key="a.name" :value="a.name">
            {{ a.name }}
          </option>
        </select>
      </div>

      <div>
        <Button type="secondary" @click="pickFile">{{
          t`Choose CSV file`
        }}</Button>
        <span v-if="fileName" class="ms-2 text-sm">{{ fileName }}</span>
      </div>

      <div v-if="headers.length" class="space-y-2">
        <h2 class="text-sm font-medium">{{ t`Column mapping` }}</h2>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div>
            <label>{{ t`Date column` }}</label>
            <select
              v-model="idxDate"
              class="border rounded w-full dark:bg-gray-900"
            >
              <option v-for="(h, i) in headers" :key="'d' + i" :value="i">
                {{ h || '(' + i + ')' }}
              </option>
            </select>
          </div>
          <div>
            <label>{{ t`Description column` }}</label>
            <select
              v-model="idxDesc"
              class="border rounded w-full dark:bg-gray-900"
            >
              <option v-for="(h, i) in headers" :key="'s' + i" :value="i">
                {{ h || '(' + i + ')' }}
              </option>
            </select>
          </div>
          <div>
            <label>{{ t`Amount (signed) column` }}</label>
            <select
              v-model="idxAmount"
              class="border rounded w-full dark:bg-gray-900"
            >
              <option :value="-1">{{ t`— use debit/credit —` }}</option>
              <option v-for="(h, i) in headers" :key="'a' + i" :value="i">
                {{ h || '(' + i + ')' }}
              </option>
            </select>
          </div>
          <div>
            <label>{{ t`Debit column (optional)` }}</label>
            <select
              v-model="idxDebit"
              class="border rounded w-full dark:bg-gray-900"
            >
              <option :value="-1">{{ t`—` }}</option>
              <option v-for="(h, i) in headers" :key="'db' + i" :value="i">
                {{ h || '(' + i + ')' }}
              </option>
            </select>
          </div>
          <div>
            <label>{{ t`Credit column (optional)` }}</label>
            <select
              v-model="idxCredit"
              class="border rounded w-full dark:bg-gray-900"
            >
              <option :value="-1">{{ t`—` }}</option>
              <option v-for="(h, i) in headers" :key="'cr' + i" :value="i">
                {{ h || '(' + i + ')' }}
              </option>
            </select>
          </div>
          <div>
            <label>{{ t`Reference column (optional)` }}</label>
            <select
              v-model="idxRef"
              class="border rounded w-full dark:bg-gray-900"
            >
              <option :value="-1">{{ t`—` }}</option>
              <option v-for="(h, i) in headers" :key="'r' + i" :value="i">
                {{ h || '(' + i + ')' }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <div v-if="previewRows.length">
        <h2 class="text-sm font-medium mb-2">
          {{ t`Preview` }} ({{ previewRows.length }})
        </h2>
        <div
          class="
            max-h-48
            overflow-auto
            border
            dark:border-gray-700
            rounded
            text-xs
          "
        >
          <table class="min-w-full">
            <thead>
              <tr>
                <th class="text-start p-1 border-b">{{ t`Date` }}</th>
                <th class="text-start p-1 border-b">{{ t`Description` }}</th>
                <th class="text-end p-1 border-b">{{ t`Amount` }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in previewRows.slice(0, 15)" :key="i">
                <td class="p-1 border-b">{{ r.date }}</td>
                <td class="p-1 border-b">{{ r.description }}</td>
                <td class="p-1 border-b text-end">{{ r.amount }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <Button type="primary" :disabled="!canSave" @click="saveStatement">
        {{ t`Save statement` }}
      </Button>
    </div>
  </div>
</template>

<script lang="ts">
import Button from 'src/components/Button.vue';
import PageHeader from 'src/components/PageHeader.vue';
import { t } from 'fyo';
import { fyo } from 'src/initFyo';
import { showToast } from 'src/utils/interactive';
import { ensureLivebooksCloudBookId } from 'src/utils/livebooksCloudBook';
import {
  fetchCloudStatementFiles,
  syncCloudStatementFiles,
  type CloudStatementFileRow,
} from 'src/utils/plaidStatementFilesApi';
import { selectTextFile } from 'src/utils/ui';
import { routeTo } from 'src/utils/ui';
import { parseCSV } from 'utils/csvParser';
import { ModelNameEnum } from 'models/types';
import { AccountTypeEnum } from 'models/baseModels/Account/types';
import { defineComponent } from 'vue';

type Row = { date: string; description: string; amount: number; ref: string; hash: string };

export default defineComponent({
  name: 'BankStatementImport',
  components: { PageHeader, Button },
  data() {
    return {
      bankAccount: '',
      bankAccounts: [] as { name: string }[],
      matrix: [] as string[][],
      fileName: '',
      idxDate: 0,
      idxDesc: 1,
      idxAmount: -1,
      idxDebit: -1,
      idxCredit: -1,
      idxRef: -1,
      cloudBookId: '' as string,
      cloudFiles: [] as CloudStatementFileRow[],
      cloudMsg: '' as string,
    };
  },
  computed: {
    headers(): string[] {
      return this.matrix[0] ?? [];
    },
    previewRows(): Row[] {
      return this.buildRows();
    },
    canSave(): boolean {
      return (
        !!this.bankAccount &&
        this.matrix.length > 1 &&
        this.previewRows.length > 0
      );
    },
  },
  async mounted() {
    await this.loadBankAccounts();
    const ctx = await ensureLivebooksCloudBookId(fyo);
    if (ctx.ok) {
      this.cloudBookId = ctx.bookId;
      await this.loadCloudFiles();
    }
  },
  methods: {
    t,
    async loadBankAccounts() {
      const rows = (await fyo.db.getAll(ModelNameEnum.Account, {
        fields: ['name'],
        filters: { accountType: AccountTypeEnum.Bank, isGroup: false },
      })) as { name: string }[];
      this.bankAccounts = rows;
    },
    async loadCloudFiles() {
      if (!this.cloudBookId) {
        return;
      }
      this.cloudMsg = '';
      const { files, error } = await fetchCloudStatementFiles(this.cloudBookId);
      if (error) {
        this.cloudMsg = error;
        return;
      }
      this.cloudFiles = files;
    },
    async syncCloudStatements() {
      if (!this.cloudBookId) {
        return;
      }
      this.cloudMsg = t`Syncing…`;
      const { ok, error, data } = await syncCloudStatementFiles(this.cloudBookId);
      if (!ok) {
        this.cloudMsg = error ?? t`Sync failed`;
        showToast({ type: 'error', message: this.cloudMsg });
        return;
      }
      const created =
        data && typeof data === 'object' && 'created' in data
          ? Number((data as { created: unknown }).created)
          : 0;
      this.cloudMsg = t`Done. New files: ${String(created)}`;
      showToast({ type: 'success', message: this.cloudMsg });
      await this.loadCloudFiles();
    },
    async pickFile() {
      const { text, name } = await selectTextFile([
        { name: 'CSV', extensions: ['csv', 'txt'] },
      ]);
      if (!text) {
        return;
      }
      this.fileName = name;
      this.matrix = parseCSV(text);
      this.guessColumns();
    },
    guessColumns() {
      const h = this.headers.map((x) => x.toLowerCase());
      const find = (pred: (s: string) => boolean) =>
        h.findIndex((s) => pred(s));
      const d = find((s) => s.includes('date'));
      const s = find((s) => s.includes('desc') || s.includes('memo') || s.includes('narration'));
      const a = find((s) => s === 'amount' || s.includes('net'));
      const db = find((s) => s.includes('debit'));
      const cr = find((s) => s.includes('credit'));
      const rf = find((s) => s.includes('ref') || s.includes('check'));
      if (d >= 0) {
        this.idxDate = d;
      }
      if (s >= 0) {
        this.idxDesc = s;
      }
      if (a >= 0) {
        this.idxAmount = a;
      }
      if (db >= 0) {
        this.idxDebit = db;
      }
      if (cr >= 0) {
        this.idxCredit = cr;
      }
      if (rf >= 0) {
        this.idxRef = rf;
      }
    },
    rowAmount(cols: string[]): number {
      const ia = Number(this.idxAmount);
      if (ia >= 0) {
        const v = cols[ia]?.replace(/,/g, '') ?? '0';
        return Number.parseFloat(v) || 0;
      }
      const idb = Number(this.idxDebit);
      const icr = Number(this.idxCredit);
      const d =
        idb >= 0
          ? Number.parseFloat((cols[idb] ?? '0').replace(/,/g, '')) || 0
          : 0;
      const c =
        icr >= 0
          ? Number.parseFloat((cols[icr] ?? '0').replace(/,/g, '')) || 0
          : 0;
      return d - c;
    },
    buildRows(): Row[] {
      if (this.matrix.length < 2) {
        return [];
      }
      const dataRows = this.matrix.slice(1);
      const out: Row[] = [];
      const seen = new Set<string>();
      const di = Number(this.idxDate);
      const dsi = Number(this.idxDesc);
      const ri = Number(this.idxRef);
      for (const cols of dataRows) {
        if (!cols.length) {
          continue;
        }
        const dateRaw = cols[di] ?? '';
        const desc = cols[dsi] ?? '';
        const amt = this.rowAmount(cols);
        const ref = ri >= 0 ? (cols[ri] ?? '').trim() : '';
        const date = dateRaw.slice(0, 10);
        if (!date) {
          continue;
        }
        const hash = simpleHash([date, desc, String(amt), ref].join('|'));
        if (seen.has(hash)) {
          continue;
        }
        seen.add(hash);
        out.push({ date, description: desc, amount: amt, ref, hash });
      }
      return out;
    },
    async saveStatement() {
      const rows = this.buildRows();
      if (!rows.length) {
        showToast({ type: 'error', message: t`No rows to import.` });
        return;
      }
      const dates = rows.map((r) => r.date).sort();
      const doc = fyo.doc.getNewDoc(ModelNameEnum.BankStatement);
      await doc.set('bankAccount', this.bankAccount);
      await doc.set('fromDate', dates[0]);
      await doc.set('toDate', dates[dates.length - 1]);
      await doc.set('importedAt', new Date());
      await doc.set('source', 'manual_csv');
      await doc.set('sourceFilename', this.fileName || '');
      await doc.set('kind', 'month_end');
      await doc.set('status', 'Open');
      for (const r of rows) {
        await doc.append('lines', {
          date: r.date,
          description: r.description,
          amount: fyo.pesa(r.amount),
          bankReference: r.ref,
          matchStatus: 'unmatched',
          contentHash: r.hash,
        });
      }
      await doc.sync();
      showToast({ type: 'success', message: t`Statement saved.` });
      await routeTo(`/bank-reconcile/${doc.name!}`);
    },
  },
});

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return `h${(h >>> 0).toString(16)}`;
}
</script>
