<template>
  <div class="flex flex-col h-full overflow-hidden">
    <PageHeader :title="titleText">
      <Button type="secondary" class="me-2" @click="reload">{{
        t`Refresh`
      }}</Button>
    </PageHeader>
    <div class="flex-1 flex min-h-0">
      <div
        class="
          w-1/2
          border-e
          overflow-y-auto
          custom-scroll custom-scroll-thumb1
          dark:border-gray-800
          p-2
          text-sm
        "
      >
        <p v-if="loadError" class="text-red-600">{{ loadError }}</p>
        <table v-else class="w-full text-xs">
          <thead>
            <tr class="border-b dark:border-gray-700">
              <th class="text-start py-1">{{ t`Date` }}</th>
              <th class="text-start py-1">{{ t`Description` }}</th>
              <th class="text-end py-1">{{ t`Amount` }}</th>
              <th class="text-start py-1">{{ t`Status` }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="ln in lineRows"
              :key="ln.name"
              class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900"
              :class="{
                'bg-green-50 dark:bg-green-900/20':
                  ln.name === selectedLineName,
              }"
              @click="selectLine(ln)"
            >
              <td class="py-1 whitespace-nowrap">{{ ln.date }}</td>
              <td class="py-1">{{ ln.description }}</td>
              <td class="py-1 text-end">{{ formatMoney(ln.amount) }}</td>
              <td class="py-1">{{ ln.matchStatus }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div
        class="
          w-1/2
          overflow-y-auto
          custom-scroll custom-scroll-thumb1
          p-3
          text-sm
        "
      >
        <template v-if="selectedLine">
          <h3 class="font-medium mb-2">{{ t`Suggested ledger matches` }}</h3>
          <p v-if="candLoading" class="text-gray-600">{{ t`Loading…` }}</p>
          <p v-else-if="candError" class="text-red-600">{{ candError }}</p>
          <ul v-else class="space-y-2">
            <li
              v-for="(c, i) in candidates"
              :key="i"
              class="
                border
                rounded
                p-2
                dark:border-gray-700
                flex
                justify-between
                gap-2
              "
            >
              <div>
                <div class="font-mono text-xs">
                  {{ c.referenceType }} {{ c.referenceName }}
                </div>
                <div class="text-xs text-gray-600">{{ c.date }}</div>
                <div class="text-xs">Dr {{ c.debit }} / Cr {{ c.credit }}</div>
              </div>
              <Button
                type="primary"
                @click="linkTo(c.referenceType, c.referenceName)"
              >
                {{ t`Link` }}
              </Button>
            </li>
          </ul>
          <div class="mt-6 flex flex-wrap gap-2">
            <Button type="secondary" @click="markIgnored">{{
              t`Ignore line`
            }}</Button>
            <Button type="secondary" @click="openMatchedDoc">{{
              t`Open matched doc`
            }}</Button>
          </div>
        </template>
        <p v-else class="text-gray-600">{{ t`Select a statement line.` }}</p>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Button from 'src/components/Button.vue';
import PageHeader from 'src/components/PageHeader.vue';
import { t } from 'fyo';
import { Doc } from 'fyo/model/doc';
import { fyo } from 'src/initFyo';
import { showToast } from 'src/utils/interactive';
import { getFormRoute, routeTo } from 'src/utils/ui';
import type { BankReconcileCandidateRow } from 'utils/db/types';
import { ModelNameEnum } from 'models/types';
import { defineComponent } from 'vue';

type LineRow = {
  name?: string;
  date?: string;
  description?: string;
  amount?: unknown;
  matchStatus?: string;
  matchedReferenceType?: string;
  matchedReferenceName?: string;
};

export default defineComponent({
  name: 'BankReconcile',
  components: { PageHeader, Button },
  props: {
    name: { type: String, required: true },
  },
  data() {
    return {
      stmt: null as Doc | null,
      loadError: '' as string,
      selectedLineName: '' as string,
      candidates: [] as BankReconcileCandidateRow[],
      candLoading: false,
      candError: '' as string,
    };
  },
  computed: {
    titleText(): string {
      return `${t`Reconcile`} · ${this.name}`;
    },
    lineRows(): LineRow[] {
      const lines = (this.stmt?.lines ?? []) as LineRow[];
      return lines;
    },
    selectedLine(): LineRow | null {
      return (
        this.lineRows.find((l) => l.name === this.selectedLineName) ?? null
      );
    },
  },
  watch: {
    name: {
      immediate: true,
      handler() {
        void this.reload();
      },
    },
  },
  methods: {
    t,
    formatMoney(m: unknown): string {
      if (m == null) {
        return '';
      }
      return String(m);
    },
    async reload() {
      this.loadError = '';
      this.stmt = null;
      try {
        this.stmt = await fyo.doc.getDoc(
          ModelNameEnum.BankStatement,
          this.name
        );
      } catch (e) {
        this.loadError = (e as Error).message;
      }
      this.selectedLineName = '';
      this.candidates = [];
    },
    async selectLine(ln: LineRow) {
      if (!ln.name || !this.stmt?.bankAccount) {
        return;
      }
      this.selectedLineName = ln.name;
      this.candLoading = true;
      this.candError = '';
      this.candidates = [];
      try {
        const mo = ln.amount;
        const amt =
          mo &&
          typeof mo === 'object' &&
          'float' in mo &&
          typeof (mo as { float: unknown }).float === 'number'
            ? (mo as { float: number }).float
            : Number(mo ?? 0);
        const d = String(ln.date ?? '').slice(0, 10);
        this.candidates = await fyo.db.getBankReconcileCandidates(
          this.stmt.bankAccount as string,
          d,
          amt,
          3
        );
      } catch (e) {
        this.candError = (e as Error).message;
      } finally {
        this.candLoading = false;
      }
    },
    async linkTo(refType: string, refName: string) {
      if (!this.stmt || !this.selectedLineName) {
        return;
      }
      const stmt = await fyo.doc.getDoc(
        ModelNameEnum.BankStatement,
        this.stmt.name
      );
      for (const line of (stmt.lines ?? []) as Doc[]) {
        if (line.name === this.selectedLineName) {
          await line.set('matchStatus', 'matched');
          await line.set('matchedReferenceType', refType);
          await line.set('matchedReferenceName', refName);
          await line.set('ignoreReason', '');
        }
      }
      await stmt.sync();
      showToast({ type: 'success', message: t`Line linked.` });
      await this.reload();
    },
    async markIgnored() {
      const reason = window.prompt(t`Ignore reason (optional)`) ?? '';
      if (!this.stmt || !this.selectedLineName) {
        return;
      }
      const stmt = await fyo.doc.getDoc(
        ModelNameEnum.BankStatement,
        this.stmt.name
      );
      for (const line of (stmt.lines ?? []) as Doc[]) {
        if (line.name === this.selectedLineName) {
          await line.set('matchStatus', 'ignored');
          await line.set('ignoreReason', reason);
          await line.set('matchedReferenceType', '');
          await line.set('matchedReferenceName', '');
        }
      }
      await stmt.sync();
      showToast({ type: 'success', message: t`Line ignored.` });
      await this.reload();
    },
    async openMatchedDoc() {
      const ln = this.selectedLine;
      if (
        !ln?.matchedReferenceType ||
        !ln.matchedReferenceName ||
        ln.matchStatus !== 'matched'
      ) {
        showToast({ type: 'error', message: t`Line is not linked yet.` });
        return;
      }
      await routeTo(
        getFormRoute(ln.matchedReferenceType, ln.matchedReferenceName)
      );
    },
  },
});
</script>
