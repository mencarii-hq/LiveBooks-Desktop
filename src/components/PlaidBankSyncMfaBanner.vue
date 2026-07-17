<template>
  <div
    v-if="showBanner"
    class="
      mb-4
      rounded-lg
      border border-amber-300
      dark:border-amber-700
      bg-amber-50
      dark:bg-amber-950/40
      px-4
      py-3
      text-sm text-amber-950
      dark:text-amber-100
    "
  >
    <p class="font-medium mb-2">
      {{
        t`Bank sync paused. Verify your identity in LiveBooks Cloud to resume downloading transactions.`
      }}
    </p>
    <div class="flex flex-col sm:flex-row gap-2 sm:items-center">
      <Button type="primary" :disabled="busy" @click="openVerify">
        {{ t`Open LiveBooks Cloud to verify` }}
      </Button>
      <Button type="secondary" :disabled="busy" @click="retry">
        {{ t`I've verified — try again` }}
      </Button>
    </div>
  </div>
</template>

<script lang="ts">
import { t } from 'fyo';
import Button from 'src/components/Button.vue';
import {
  getLivebooksCloudSessionSummary,
  LIVEBOOKS_CLOUD_SESSION_APP_REFRESH_EVENT,
  openLivebooksCloudMfaStepUp,
} from 'src/utils/livebooksCloud';
import {
  bankSyncMfaPausedState,
  setBankSyncMfaPaused,
} from 'src/utils/plaidBankSyncMfaGate';
import { setPlaidSyncMfaPaused } from 'src/utils/plaidSyncStore';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'PlaidBankSyncMfaBanner',
  components: { Button },
  emits: ['verified'],
  data() {
    return {
      busy: false,
      cloudSignedIn: false,
      onSessionRefresh: null as (() => void) | null,
      onVisibility: null as (() => void) | null,
    };
  },
  computed: {
    paused(): boolean {
      return bankSyncMfaPausedState.value;
    },
    showBanner(): boolean {
      return this.paused && this.cloudSignedIn;
    },
  },
  mounted() {
    void this.refreshSignedIn();
    this.onSessionRefresh = () => {
      void this.refreshSignedIn();
    };
    document.addEventListener(
      LIVEBOOKS_CLOUD_SESSION_APP_REFRESH_EVENT,
      this.onSessionRefresh
    );
    this.onVisibility = () => {
      if (document.visibilityState === 'visible' && this.showBanner) {
        this.retry();
      }
    };
    document.addEventListener('visibilitychange', this.onVisibility);
  },
  unmounted() {
    if (this.onSessionRefresh) {
      document.removeEventListener(
        LIVEBOOKS_CLOUD_SESSION_APP_REFRESH_EVENT,
        this.onSessionRefresh
      );
    }
    if (this.onVisibility) {
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
  },
  methods: {
    async refreshSignedIn() {
      const { signedIn } = await getLivebooksCloudSessionSummary();
      this.cloudSignedIn = signedIn;
    },
    openVerify() {
      openLivebooksCloudMfaStepUp();
    },
    retry() {
      this.busy = true;
      try {
        setBankSyncMfaPaused(false);
        setPlaidSyncMfaPaused(false);
        this.$emit('verified');
      } finally {
        this.busy = false;
      }
    },
  },
});
</script>
