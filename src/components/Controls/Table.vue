<template>
  <div v-if="tableFields?.length" class="text-base">
    <div v-if="showLabel" class="text-gray-600 dark:text-gray-300 text-sm mb-1">
      {{ df.label }}
    </div>

    <div
      :class="border ? 'border dark:border-gray-800 rounded-md' : ''"
      class="overflow-x-auto custom-scroll custom-scroll-thumb1 px-4"
    >
      <div :style="tableWidthStyle">
        <!-- Title Row — same chrome as List.vue -->
        <div class="flex items-center">
          <div
            class="
              w-8
              shrink-0
              text-start
              me-2
              text-gray-700
              dark:text-gray-300
              min-h-row-mid
              flex
              items-center
            "
          >
            #
          </div>
          <Row
            ref="headerRow"
            :ratio="ratio"
            :grid-template-columns="gridTemplate"
            gap="0.5rem"
            class="
              flex-1
              text-gray-700
              dark:text-gray-300
              min-h-row-mid
              border-b
              dark:border-gray-800
            "
          >
            <div
              v-for="(fieldDf, fi) in tableFields"
              :key="fieldDf.fieldname"
              class="
                relative
                items-center
                justify-start
                text-start
                flex
                min-w-0 min-h-row-mid
                py-1.5
                pe-3
                break-words
              "
              :class="[
                fieldDf.sub_label ? 'flex-col' : '',
                { 'pe-4': fi === tableFields.length - 1 && !canEditRow },
              ]"
            >
              <span class="w-full">{{ fieldDf.label }}</span>
              <p v-if="fieldDf.sub_label" class="text-xs w-full">
                {{ fieldDf.sub_label }}
              </p>
              <ColResizeHandle
                v-if="fi < tableFields.length - 1"
                :title="t`Drag to resize. Double-click to reset.`"
                @start="startColResize(fi, $event)"
                @reset="resetColWidths"
              />
            </div>
            <div v-if="canEditRow" class="min-w-0" />
          </Row>
        </div>

        <!-- Data Rows -->
        <div
          v-if="value"
          class="overflow-auto custom-scroll custom-scroll-thumb1"
          :style="{ 'max-height': maxHeight }"
        >
          <TableRow
            v-for="(row, idx) of value"
            ref="table-row"
            :key="row.name"
            :class="
              idx < value.length - 1 ? 'border-b dark:border-gray-800' : ''
            "
            v-bind="{ row, tableFields, size, ratio, isNumeric }"
            :grid-template-columns="gridTemplate"
            gap="0.5rem"
            :read-only="isReadOnly"
            :can-edit-row="canEditRow"
            @remove="removeRow(row)"
            @change="(field, value) => $emit('row-change', field, value, df)"
          />
        </div>

        <!-- Add Row and Row Count -->
        <div
          v-if="!isReadOnly"
          class="
            flex
            items-center
            text-gray-500
            cursor-pointer
            min-h-row-mid
            focus:outline-none focus:ring-1 focus:ring-blue-500
          "
          :class="value.length > 0 ? 'border-t dark:border-gray-800' : ''"
          tabindex="0"
          @click="addRow"
          @keydown.enter="addRow"
        >
          <div class="w-8 shrink-0 me-2 flex items-center justify-start">
            <feather-icon name="plus" class="w-4 h-4 text-gray-500" />
          </div>
          <div class="flex flex-1 justify-between items-center pe-4">
            <p>
              {{ t`Add Row` }}
            </p>
            <p
              v-if="
                value &&
                maxRowsBeforeOverflow &&
                value.length > maxRowsBeforeOverflow
              "
              class="text-start"
            >
              {{ t`${value.length} rows` }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import ColResizeHandle from 'src/components/ColResizeHandle.vue';
import Row from 'src/components/Row.vue';
import { fyo } from 'src/initFyo';
import {
  clampColWidth,
  clearColumnWidths,
  columnWidthsStorageKey,
  gridTemplateFromWidths,
  minWidthPxFromColumns,
  readColumnWidths,
  snapshotChildrenWidths,
  writeColumnWidths,
} from 'src/utils/columnWidths';
import { nextTick } from 'vue';
import Base from './Base.vue';
import TableRow from './TableRow.vue';

export default {
  name: 'Table',
  components: {
    Row,
    TableRow,
    ColResizeHandle,
  },
  extends: Base,
  props: {
    value: { type: Array, default: () => [] },
    showHeader: {
      type: Boolean,
      default: true,
    },
    maxRowsBeforeOverflow: {
      type: Number,
      default: 3,
    },
    border: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['editrow', 'row-change'],
  data() {
    return {
      maxHeight: '',
      columnWidths: null,
      boundColResizeMove: null,
      boundEndColResize: null,
      resizingCol: -1,
      resizeStartX: 0,
      resizeStartWidth: 0,
      resizeMoved: false,
    };
  },
  computed: {
    height() {
      if (this.size === 'small') {
      }
      return 2;
    },
    canEditRow() {
      return this.df.edit;
    },
    ratio() {
      const fieldRatios = this.tableFields.map((f) => {
        if (f.fieldtype === 'Select') {
          return 0.9;
        }
        if (f.fieldtype === 'DynamicLink' || f.fieldtype === 'Link') {
          return 1.3;
        }
        if (this.isNumeric(f)) {
          return 0.9;
        }
        if (f.fieldtype === 'Text' || f.fieldname === 'description') {
          return 1.4;
        }
        return 1;
      });

      if (this.canEditRow) {
        return fieldRatios.concat(0.35);
      }

      return fieldRatios;
    },
    tableFields() {
      const fields = fyo.schemaMap[this.df.target].tableFields ?? [];
      return fields.map((fieldname) => fyo.getField(this.df.target, fieldname));
    },
    columnIds() {
      // Index sits outside the grid (same as List) — not part of resize widths.
      const ids = this.tableFields.map((f) => f.fieldname);
      if (this.canEditRow) {
        ids.push('__edit');
      }
      return ids;
    },
    widthsStorageKey() {
      // v3: index column removed from persisted width keys
      return columnWidthsStorageKey(`table:${this.df.target}`, 'v3');
    },
    gridTemplate() {
      if (!this.columnWidths) {
        return null;
      }
      return gridTemplateFromWidths(this.columnWidths, {
        lastAbsorbs: false,
      });
    },
    tableWidthStyle() {
      if (!this.columnWidths) {
        return {};
      }
      // w-8 (2rem) + me-2 (0.5rem) index gutter ≈ 40px
      const total = minWidthPxFromColumns(this.columnWidths, 8, 40);
      return { minWidth: `${total}px` };
    },
  },
  watch: {
    value() {
      this.setMaxHeight();
    },
    columnIds: {
      handler() {
        this.loadStoredWidths();
      },
      immediate: true,
    },
  },
  mounted() {
    this.loadStoredWidths();
    if (fyo.store.isDevelopment) {
      window.tab = this;
    }
  },
  unmounted() {
    this.endColResize();
  },

  methods: {
    loadStoredWidths() {
      this.columnWidths = readColumnWidths(
        this.widthsStorageKey,
        this.columnIds
      );
    },
    focus() {},
    startColResize(index, event) {
      if (!this.columnWidths) {
        const headerRow = this.$refs.headerRow;
        const snapped = snapshotChildrenWidths(
          headerRow?.$el,
          this.columnIds.length
        );
        if (!snapped) {
          return;
        }
        this.columnWidths = snapped;
      }
      this.resizingCol = index;
      this.resizeStartX = event.clientX;
      this.resizeStartWidth = this.columnWidths[index];
      this.resizeMoved = false;
      this.boundColResizeMove = (e) => this.onColResizeMove(e);
      this.boundEndColResize = () => this.endColResize();
      window.addEventListener('mousemove', this.boundColResizeMove);
      window.addEventListener('mouseup', this.boundEndColResize);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    onColResizeMove(event) {
      if (this.resizingCol < 0 || !this.columnWidths) {
        return;
      }
      const dx = event.clientX - this.resizeStartX;
      const next = clampColWidth(this.resizeStartWidth + dx);
      if (next === this.columnWidths[this.resizingCol]) {
        return;
      }
      this.resizeMoved = true;
      const widths = [...this.columnWidths];
      widths[this.resizingCol] = next;
      this.columnWidths = widths;
    },
    endColResize() {
      if (this.resizingCol < 0) {
        return;
      }
      this.resizingCol = -1;
      window.removeEventListener('mousemove', this.boundColResizeMove);
      window.removeEventListener('mouseup', this.boundEndColResize);
      this.boundColResizeMove = null;
      this.boundEndColResize = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (!this.resizeMoved || !this.columnWidths) {
        return;
      }
      try {
        writeColumnWidths(
          this.widthsStorageKey,
          this.columnIds,
          this.columnWidths
        );
      } catch {
        /* best-effort */
      }
    },
    resetColWidths() {
      this.columnWidths = null;
      clearColumnWidths(this.widthsStorageKey);
    },
    async addRow() {
      await this.doc.append(this.df.fieldname);
      await nextTick();
      this.scrollToRow(this.value.length - 1);
      this.triggerChange(this.value);
      this.$nextTick(() => {
        const rows = this.$refs['table-row'];
        if (rows && rows.length > 0) {
          const lastRow = rows[rows.length - 1];
          if (lastRow.focusFirstInput) {
            lastRow.focusFirstInput();
          }
        }
      });
    },
    removeRow(row) {
      this.doc.remove(this.df.fieldname, row.idx).then((s) => {
        if (!s) {
          return;
        }
        this.triggerChange(this.value);
      });
    },

    getRowEl(index) {
      const row = this.$refs?.['table-row']?.[index];
      const el = row?.$el;
      // Vue 3 multi-root (e.g. template comment + div): $el may be a comment node
      if (el?.nodeType === Node.ELEMENT_NODE) {
        return el;
      }
      return el?.nextElementSibling ?? null;
    },

    scrollToRow(index) {
      const el = this.getRowEl(index);
      el?.scrollIntoView?.({ block: 'nearest' });
    },

    setMaxHeight() {
      if (this.maxRowsBeforeOverflow === 0) {
        return (this.maxHeight = '');
      }

      const size = this?.value?.length ?? 0;
      if (size === 0) {
        return (this.maxHeight = '');
      }

      const rowHeight = this.getRowEl(0)?.offsetHeight;
      if (rowHeight === undefined) {
        return (this.maxHeight = '');
      }

      const maxHeight = rowHeight * Math.min(this.maxRowsBeforeOverflow, size);
      return (this.maxHeight = `${maxHeight}px`);
    },
  },
};
</script>
