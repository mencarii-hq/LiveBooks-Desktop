<template>
  <div
    class="flex items-center min-h-row-mid"
    :class="readOnly ? '' : 'hover:bg-gray-50 dark:hover:bg-gray-850'"
  >
    <div
      class="
        w-8
        shrink-0
        text-start
        me-2
        text-gray-700
        dark:text-gray-300
        flex
        items-center
      "
      @mouseenter="isRowIndexVisible = false"
      @mouseleave="isRowIndexVisible = true"
    >
      <span class="relative w-4 h-4 flex items-center justify-start">
        <feather-icon
          v-if="!readOnly && !isRowIndexVisible"
          name="x"
          class="
            w-4
            h-4
            cursor-pointer
            rounded
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-blue-50
            dark:focus:bg-gray-800
            transition
          "
          :button="true"
          tabindex="0"
          role="button"
          aria-label="Delete row"
          @click="$emit('remove')"
          @keydown.enter="$emit('remove')"
        />
        <span
          v-if="!readOnly && isRowIndexVisible"
          class="
            absolute
            left-0
            top-0
            w-full
            h-full
            flex
            items-center
            justify-start
            focus:outline-none
            focus-visible:ring-2 focus-visible:ring-blue-500
            rounded
          "
          tabindex="0"
          role="button"
          aria-label="Delete row"
          @focus="isRowIndexVisible = false"
          @keydown.enter="$emit('remove')"
        >
          {{ row.idx + 1 }}
        </span>
      </span>
      <span v-if="readOnly" class="text-start">
        {{ row.idx + 1 }}
      </span>
    </div>

    <Row
      :ratio="ratio"
      :grid-template-columns="gridTemplateColumns"
      :gap="gap"
      class="flex-1 min-h-row-mid items-center group"
    >
      <div
        v-for="(df, i) in tableFields"
        :key="df.fieldname"
        class="
          table-cell-control
          flex
          items-center
          justify-start
          text-start
          min-w-0
          py-1.5
        "
        :class="{ 'pe-4': i === tableFields.length - 1 && !canEditRow }"
      >
        <FormControl
          class="min-w-0 w-full"
          :size="size"
          :df="df"
          :text-right="false"
          :input-class="['!px-0', '!py-0']"
          :value="row[df.fieldname]"
          @change="(value) => onChange(df, value)"
          @focus="onFieldFocus(i)"
          @blur="onFieldBlur(i)"
        />
      </div>
      <div v-if="canEditRow" class="flex items-center justify-start min-w-0">
        <Button
          :icon="true"
          :padding="false"
          :background="false"
          @click="openRowQuickEdit"
        >
          <feather-icon
            name="edit"
            class="w-4 h-4 text-gray-600 dark:text-gray-300"
          />
        </Button>
      </div>

      <div
        v-if="hasErrors"
        class="text-xs text-red-600 ps-2 col-span-full relative"
        style="bottom: 0.75rem; height: 0px"
      >
        {{ getErrorString() }}
      </div>
    </Row>
  </div>
</template>
<script>
import { Doc } from 'fyo/model/doc';
import Row from 'src/components/Row.vue';
import { getErrorMessage } from 'src/utils';
import { computed, nextTick } from 'vue';
import Button from '../Button.vue';
import FormControl from './FormControl.vue';

export default {
  name: 'TableRow',
  components: {
    Row,
    FormControl,
    Button,
  },
  provide() {
    return {
      doc: computed(() => this.row),
    };
  },
  props: {
    row: Doc,
    tableFields: Array,
    size: String,
    ratio: Array,
    gridTemplateColumns: {
      type: String,
      default: null,
    },
    gap: {
      type: String,
      default: '0.5rem',
    },
    isNumeric: Function,
    readOnly: Boolean,
    canEditRow: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['remove', 'change'],
  data: () => ({
    isRowIndexVisible: false,
    errors: {},
  }),
  computed: {
    hasErrors() {
      return Object.values(this.errors).filter(Boolean).length;
    },
  },
  beforeCreate() {
    this.$options.components.FormControl = FormControl;
  },
  methods: {
    async onChange(df, value) {
      const fieldname = df.fieldname;
      this.errors[fieldname] = null;
      const oldValue = this.row[fieldname];
      try {
        await this.row.set(fieldname, value);
        this.$emit('change', df, value);
      } catch (e) {
        this.errors[fieldname] = getErrorMessage(e, this.row);
        this.row[fieldname] = '';
        nextTick(() => (this.row[fieldname] = oldValue));
      }
    },
    getErrorString() {
      return Object.values(this.errors).filter(Boolean).join(' ');
    },
    openRowQuickEdit() {
      if (!this.row) return;
      this.$parent.$emit('editrow', this.row);
    },
    onFieldFocus(index) {
      if (index === 0) {
        this.isRowIndexVisible = true;
      }
    },
    onFieldBlur(index) {
      if (index === 0) {
        this.isRowIndexVisible = false;
      }
    },
    focusFirstInput() {
      const firstControl = this.$el.querySelector(
        '.form-control, input, textarea, select'
      );
      if (firstControl) {
        firstControl.focus();
      }
    },
  },
};
</script>

<style scoped>
/* Strip FormControl size padding so value text matches ListCell */
.table-cell-control :deep(input),
.table-cell-control :deep(textarea) {
  padding-left: 0 !important;
  padding-right: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  text-align: start !important;
}
.table-cell-control :deep(.pe-2) {
  padding-inline-end: 0 !important;
}
.table-cell-control :deep(.flex.items-center.gap-1) {
  width: 100%;
  justify-content: flex-start;
}
.table-cell-control :deep(.flex.items-center.gap-1 > .flex-1) {
  flex: 1 1 auto;
  min-width: 0;
  justify-content: flex-start;
}
.table-cell-control :deep(.justify-between) {
  justify-content: flex-start !important;
  gap: 0.25rem;
}
</style>
