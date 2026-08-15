<template>
  <div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 max-w-3xl">
      <div
        v-for="entry in entries"
        :key="entry.key"
        class="
          flex
          justify-between
          gap-4
          text-sm
          border-b
          dark:border-gray-800
          py-1
        "
      >
        <span class="text-gray-500 dark:text-gray-400">{{
          labelFor(entry.key)
        }}</span>
        <span class="text-end break-all dark:text-gray-100">{{
          entry.value
        }}</span>
      </div>
    </div>
    <p v-if="!entries.length" class="text-sm text-gray-500 dark:text-gray-400">
      {{ t`This record has no simple fields — see the raw data below.` }}
    </p>
  </div>
</template>

<script lang="ts">
import { t } from 'fyo';
import { defineComponent, PropType } from 'vue';
import { scalarEntries, RetData } from './helpers';

/** Key-value fallback for the ~70 entity types without a dedicated viewer. */
export default defineComponent({
  name: 'GenericViewer',
  props: {
    data: { type: Object as PropType<RetData>, required: true },
  },
  computed: {
    entries(): { key: string; value: string }[] {
      return scalarEntries(this.data);
    },
  },
  methods: {
    t,
    labelFor(key: string): string {
      return key
        .split('_')
        .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
        .join(' ');
    },
  },
});
</script>
