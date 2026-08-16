<template>
  <div
    v-if="visible"
    class="
      mb-2
      rounded-lg
      border border-blue-200
      dark:border-blue-800
      bg-blue-50
      dark:bg-blue-900
      px-4
      py-2
      text-sm text-blue-900
      dark:text-blue-100
      flex
      items-start
      justify-between
      gap-3
    "
  >
    <p>
      {{
        t`We renamed some buttons to match QuickBooks — Write Checks, Make Deposits, and Memorized Transactions.`
      }}
    </p>
    <button type="button" class="shrink-0 underline" @click="dismiss">
      {{ t`Got it` }}
    </button>
  </div>
</template>

<script lang="ts">
import { fyo } from 'src/initFyo';
import {
  dismissQbdRenameNotice,
  shouldShowQbdRenameNotice,
} from 'src/utils/qbdFamiliarity';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'QbdRenameNoticeBanner',
  data() {
    return {
      dismissed: false,
    };
  },
  computed: {
    visible(): boolean {
      if (this.dismissed) {
        return false;
      }
      return shouldShowQbdRenameNotice(fyo, fyo.singles.SystemSettings);
    },
  },
  methods: {
    dismiss() {
      dismissQbdRenameNotice(fyo);
      this.dismissed = true;
    },
  },
});
</script>
