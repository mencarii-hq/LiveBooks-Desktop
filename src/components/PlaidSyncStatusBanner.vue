<template>
  <div v-if="visible" class="flex flex-col gap-2 mb-2">
    <div
      v-if="store.applying"
      class="
        rounded-lg
        border border-blue-200
        dark:border-blue-800
        bg-blue-50
        dark:bg-blue-950/30
        px-4
        py-2
        text-sm text-blue-900
        dark:text-blue-100
      "
    >
      {{ t`Applying bank feed updates…` }}
    </div>
    <div
      v-if="store.catchUpBlocked"
      class="
        rounded-lg
        border border-amber-300
        dark:border-amber-700
        bg-amber-50
        dark:bg-amber-950/40
        px-4
        py-2
        text-sm text-amber-950
        dark:text-amber-100
      "
    >
      {{ store.catchUpBlocked.message }}
    </div>
    <div
      v-if="store.lastError"
      class="
        rounded-lg
        border border-red-300
        dark:border-red-800
        bg-red-50
        dark:bg-red-950/30
        px-4
        py-2
        text-sm text-red-900
        dark:text-red-100
      "
    >
      {{ store.lastError }}
    </div>
  </div>
</template>

<script lang="ts">
import { t } from 'fyo';
import { plaidSyncStore } from 'src/utils/plaidSyncStore';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'PlaidSyncStatusBanner',
  computed: {
    store() {
      return plaidSyncStore;
    },
    visible(): boolean {
      return (
        this.store.applying ||
        !!this.store.catchUpBlocked ||
        !!this.store.lastError
      );
    },
  },
});
</script>
