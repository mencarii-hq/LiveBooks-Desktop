<template>
  <div class="text-base flex flex-col overflow-hidden px-4">
    <!-- Title Row -->
    <div
      class="flex items-center"
      :style="{
        paddingRight: dataSlice.length > 13 ? 'var(--w-scrollbar)' : '',
      }"
    >
      <div
        v-if="!isSelectionMode"
        class="w-8 text-start me-2 text-gray-700 dark:text-gray-300"
      >
        #
      </div>
      <div v-else class="w-8 flex justify-end me-2">
        <Check
          :df="{
            fieldtype: 'Check',
            fieldname: 'selectAll',
            label: '',
          }"
          :show-label="false"
          :value="isAllSelected"
          @change="toggleSelectAll"
        />
      </div>
      <Row
        class="flex-1 text-gray-700 dark:text-gray-300 h-row-mid"
        :column-count="columns.length"
        gap="1rem"
      >
        <div
          v-for="(column, i) in columns"
          :key="column.label"
          class="
            overflow-x-auto
            no-scrollbar
            whitespace-nowrap
            h-row
            items-center
            flex
          "
          :class="{
            'ms-auto': isNumeric(column.fieldtype),
            'pe-4': i === columns.length - 1 && !showRunNow,
          }"
        >
          {{ column.label }}
        </div>
      </Row>
      <div
        v-if="showRunNow && !isSelectionMode"
        class="
          w-28
          shrink-0
          ms-2
          text-gray-700
          dark:text-gray-300
          h-row
          flex
          items-center
          pe-4
        "
      >
        {{ t`Actions` }}
      </div>
    </div>
    <hr class="dark:border-gray-800" />

    <!-- Data Rows -->
    <div
      v-if="dataSlice.length !== 0"
      class="
        overflow-y-auto
        dark:dark-scroll
        custom-scroll custom-scroll-thumb1
      "
    >
      <div v-for="(row, i) in dataSlice" :key="(row.name as string)">
        <!-- Row Content -->
        <div class="flex hover:bg-gray-50 dark:hover:bg-gray-850 items-center">
          <div
            v-if="!isSelectionMode"
            class="w-8 text-start me-2 text-gray-700 dark:text-gray-300"
          >
            {{ i + pageStart + 1 }}
          </div>
          <div v-else class="w-8 flex justify-end me-2">
            <Check
              :df="{
                fieldtype: 'Check',
                fieldname: 'selectItem',
                label: '',
              }"
              :show-label="false"
              :value="selectedItems.includes(row.name as string)"
              @change="toggleItemSelection(row.name as string)"
            />
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
            :column-count="columns.length"
            @click="isSelectionMode ? null : $emit('openDoc', row.name)"
          >
            <ListCell
              v-for="(column, c) in columns"
              :key="column.label || column.fieldname"
              :class="{
                'text-start': isNumeric(column.fieldtype),
                'pe-4': c === columns.length - 1 && !showRunNow,
              }"
              :row="(row as RenderData)"
              :column="column"
              @status-found="handleStatusFound"
            />
          </Row>
          <div
            v-if="showRunNow && !isSelectionMode"
            class="w-28 shrink-0 ms-2 pe-4 flex items-center"
            @click.stop
          >
            <Button
              type="secondary"
              class="whitespace-nowrap"
              :disabled="runningName === row.name"
              @click="runMemorized(row.name as string)"
            >
              {{ t`Run Now` }}
            </Button>
          </div>
        </div>
        <hr
          v-if="!(i === dataSlice.length - 1 && i > 13)"
          class="dark:border-gray-800"
        />
      </div>
    </div>

    <!-- Pagination Footer -->
    <div v-if="data?.length" class="mt-auto">
      <hr class="dark:border-gray-800" />
      <Paginator :item-count="data.length" @index-change="setPageIndices" />
    </div>

    <!-- Empty State -->
    <div
      v-if="!data?.length"
      class="flex flex-col items-center justify-center my-auto"
    >
      <img src="../../assets/img/list-empty-state.svg" alt="" class="w-24" />
      <p class="my-3 text-gray-800 dark:text-gray-100">
        {{ t`No entries found` }}
      </p>
      <Button v-if="canCreate" type="primary" @click="$emit('makeNewDoc')">
        {{ t`Make Entry` }}
      </Button>
    </div>
  </div>
</template>
<script lang="ts">
import { ListViewSettings, RenderData } from 'fyo/model/types';
import { cloneDeep } from 'lodash';
import Button from 'src/components/Button.vue';
import Check from 'src/components/Controls/Check.vue';
import Paginator from 'src/components/Paginator.vue';
import Row from 'src/components/Row.vue';
import { fyo } from 'src/initFyo';
import { isNumeric } from 'src/utils';
import { QueryFilter } from 'utils/db/types';
import { PropType, defineComponent, toRaw } from 'vue';
import ListCell from './ListCell.vue';

export default defineComponent({
  name: 'List',
  components: {
    Row,
    ListCell,
    Button,
    Check,
    Paginator,
  },
  props: {
    listConfig: {
      type: Object as PropType<ListViewSettings | undefined>,
      default: () => ({ columns: [] }),
    },
    filters: {
      type: Object as PropType<QueryFilter>,
      default: () => ({}),
    },
    schemaName: { type: String, required: true },
    canCreate: Boolean,
    isSelectionMode: Boolean,
  },
  emits: ['openDoc', 'makeNewDoc', 'updatedData', 'selected-items-changed'],
  data() {
    return {
      data: [] as RenderData[],
      pageStart: 0,
      pageEnd: 0,
      statusMap: {} as Record<string, string>,
      selectedItems: [] as string[],
      runningName: null as string | null,
    };
  },
  computed: {
    dataSlice() {
      return this.data.slice(this.pageStart, this.pageEnd);
    },
    count() {
      return this.pageEnd - this.pageStart + 1;
    },
    isAllSelected(): boolean {
      return (
        this.data.length > 0 && this.selectedItems.length === this.data.length
      );
    },
    showRunNow(): boolean {
      return this.schemaName === 'MemorizedTransaction';
    },
    columns() {
      let columns = this.listConfig?.columns ?? [];

      if (columns.length === 0) {
        columns = fyo.schemaMap[this.schemaName]?.quickEditFields ?? [];
        columns = [...new Set(['name', ...columns])];
      }

      return columns
        .map((fieldname) => {
          if (typeof fieldname === 'object') {
            return fieldname;
          }

          return fyo.getField(this.schemaName, fieldname);
        })
        .filter(Boolean);
    },
  },
  watch: {
    async schemaName(oldValue, newValue) {
      if (oldValue === newValue) {
        return;
      }

      await this.updateData();
    },
  },
  async mounted() {
    await this.updateData();
    this.setUpdateListeners();
  },
  methods: {
    handleStatusFound({ rowId, status }: { rowId: string; status: string }) {
      this.statusMap[rowId] = status;
    },
    isNumeric,
    setPageIndices({ start, end }: { start: number; end: number }) {
      this.pageStart = start;
      this.pageEnd = end;
    },
    async runMemorized(name: string) {
      if (this.runningName) {
        return;
      }
      this.runningName = name;
      try {
        const { runMemorizedNow } = await import(
          'src/utils/memorizedTransactions'
        );
        const { showToast } = await import('src/utils/interactive');
        const { handleErrorWithDialog } = await import('src/errorHandling');
        const { ModelNameEnum } = await import('models/types');
        const mt = await fyo.doc.getDoc(
          ModelNameEnum.MemorizedTransaction,
          name
        );
        try {
          const payment = await runMemorizedNow(fyo, mt);
          const { routeTo } = await import('src/utils/ui');
          const paymentName = String(payment.name ?? '');
          showToast({
            type: 'success',
            message: fyo.t`Created recurring payment`,
            actionText: fyo.t`View Payment`,
            action: () => {
              if (paymentName) {
                void routeTo(`/edit/Payment/${paymentName}`);
              }
            },
          });
        } catch (error) {
          await handleErrorWithDialog(error, mt, true, true);
        }
      } finally {
        this.runningName = null;
      }
    },
    setUpdateListeners() {
      if (!this.schemaName) {
        return;
      }

      const listener = async () => {
        await this.updateData();
      };

      if (fyo.schemaMap[this.schemaName]?.isSubmittable) {
        fyo.doc.observer.on(`submit:${this.schemaName}`, listener);
        fyo.doc.observer.on(`revert:${this.schemaName}`, listener);
      }

      fyo.doc.observer.on(`sync:${this.schemaName}`, listener);
      fyo.db.observer.on(`delete:${this.schemaName}`, listener);
      fyo.doc.observer.on(`rename:${this.schemaName}`, listener);
    },
    async updateData(filters?: Record<string, unknown>) {
      const baseFilters = cloneDeep(toRaw(this.filters));
      filters = cloneDeep({ ...baseFilters, ...filters });

      let statusFilter: [string, string] | undefined;

      if ('status' in filters) {
        statusFilter = filters['status'] as [string, string];
      }

      const isStatusFilter =
        Array.isArray(statusFilter) && statusFilter[0] === 'like';
      if (isStatusFilter) {
        delete filters['status'];
      }

      const orderBy = ['created'];
      if (fyo.db.fieldMap[this.schemaName]['date']) {
        orderBy.unshift('date');
      }

      const tableData = await fyo.db.getAll(this.schemaName, {
        fields: ['*'],
        filters: filters as QueryFilter,
        orderBy,
      });

      let filteredData = tableData;

      if (isStatusFilter && statusFilter?.[1]) {
        const lowercaseStatus = String(statusFilter[1]).toLowerCase();

        const matchedNames = Object.entries(this.statusMap)
          .filter((entry) => entry[1].toLowerCase() === lowercaseStatus)
          .map((entry) => entry[0]);

        filteredData = tableData.filter((row) =>
          matchedNames.includes(String(row.name))
        );
      }

      this.data = filteredData.map((d) => ({
        ...d,
        schema: fyo.schemaMap[this.schemaName],
      })) as RenderData[];
      this.$emit('updatedData', filters);
    },
    toggleItemSelection(itemName: string) {
      const index = this.selectedItems.indexOf(itemName);
      if (index > -1) {
        this.selectedItems.splice(index, 1);
      } else {
        this.selectedItems.push(itemName);
      }
      this.$emit('selected-items-changed', this.selectedItems);
    },
    toggleSelectAll(checked: boolean) {
      this.selectedItems = checked
        ? this.data.map((row) => row.name as string)
        : [];
      this.$emit('selected-items-changed', this.selectedItems);
    },
  },
});
</script>
