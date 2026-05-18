<template>
  <div class="p-4 space-y-6">
    <section>
      <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-25 mb-2">
        {{ t`LiveBooks Cloud backup` }}
      </h3>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        {{
          t`Pro subscribers can store an encrypted copy of your database key in LiveBooks Cloud. Two-factor authentication protects sign-in, bank linking, and recovery.`
        }}
      </p>

      <div
        v-if="!signedIn"
        class="
          rounded-lg
          border
          dark:border-gray-800
          p-4
          bg-gray-50
          dark:bg-gray-900
        "
      >
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
          {{ t`Sign in to LiveBooks Cloud to enable cloud key backup.` }}
        </p>
        <Button type="primary" @click="signIn">
          {{ t`Sign in to LiveBooks Cloud` }}
        </Button>
      </div>

      <div
        v-else-if="!subscription.proEntitled"
        class="
          rounded-lg
          border
          dark:border-gray-800
          p-4
          bg-gray-50
          dark:bg-gray-900
        "
      >
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
          {{
            t`Cloud key backup requires LiveBooks Pro. Your ledger remains encrypted on this device.`
          }}
        </p>
        <Button @click="subscribe">
          {{ t`View Pro plans` }}
        </Button>
      </div>

      <div v-else class="space-y-4">
        <label class="flex items-center gap-3 cursor-pointer">
          <input
            v-model="escrowEnabled"
            type="checkbox"
            class="rounded border-gray-300"
            :disabled="escrowBusy"
            @change="onEscrowToggle"
          />
          <span class="text-sm text-gray-800 dark:text-gray-200">
            {{ t`Back up encryption key to LiveBooks Cloud` }}
          </span>
        </label>
        <p
          v-if="escrowStatusMessage"
          class="text-sm text-gray-500 dark:text-gray-400"
        >
          {{ escrowStatusMessage }}
        </p>
        <div v-if="mfaEnabled" class="space-y-2">
          <input
            v-model="escrowTotpCode"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="32"
            class="
              w-full
              max-w-xs
              rounded
              border border-gray-300
              dark:border-gray-700
              px-3
              py-2
              text-sm
              dark:bg-gray-900
            "
            :placeholder="t`Authenticator code (required to enable backup)`"
          />
        </div>
        <div v-else class="space-y-2">
          <p class="text-sm text-amber-700 dark:text-amber-400">
            {{
              t`Enable two-factor authentication on your LiveBooks Cloud account before you can back up your encryption key.`
            }}
          </p>
          <Button @click="openAccountSecurity">
            {{ t`Set up 2FA on LiveBooks Cloud` }}
          </Button>
        </div>
        <p
          v-if="
            subscription.status === 'past_due' && subscription.inGracePeriod
          "
          class="text-sm text-yellow-700 dark:text-yellow-400"
        >
          {{
            t`Your subscription is past due. You can still recover keys during the grace period.`
          }}
        </p>
        <p class="text-xs text-gray-500 dark:text-gray-500">
          {{
            t`Recovery requires your cloud password and an authenticator or backup code when MFA is enabled. Sign out all devices from LiveBooks Cloud if you reset 2FA — desktop must connect again.`
          }}
        </p>
      </div>
    </section>
  </div>
</template>

<script lang="ts">
import { t } from 'fyo';
import Button from 'src/components/Button.vue';
import {
  openLivebooksCloudAccountSecurity,
  openLivebooksCloudSignIn,
  openLivebooksCloudSubscribe,
} from 'src/utils/livebooksCloud';
import {
  getLivebooksSubscriptionSnapshot,
  subscribeLivebooksSubscription,
} from 'src/utils/livebooksCloudSubscription';
import { showToast } from 'src/utils/interactive';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'LiveBooksCloudSecurityPanel',
  components: { Button },
  props: {
    dbPath: { type: String, default: '' },
  },
  data() {
    return {
      signedIn: false,
      subscription: getLivebooksSubscriptionSnapshot(),
      escrowEnabled: false,
      escrowBusy: false,
      escrowStatusMessage: '',
      mfaEnabled: false,
      escrowTotpCode: '',
      unsubscribeSubscription: null as (() => void) | null,
    };
  },
  async mounted() {
    const session = await ipc.getLivebooksCloudSession();
    this.signedIn = session.signedIn;
    this.unsubscribeSubscription = subscribeLivebooksSubscription((s) => {
      this.subscription = s;
      this.signedIn = s.signedIn;
    });
    await this.refreshEscrowStatus();
  },
  beforeUnmount() {
    this.unsubscribeSubscription?.();
  },
  methods: {
    signIn() {
      void openLivebooksCloudSignIn();
    },
    subscribe() {
      openLivebooksCloudSubscribe();
    },
    openAccountSecurity() {
      openLivebooksCloudAccountSecurity();
    },
    async refreshEscrowStatus() {
      if (!this.signedIn) {
        return;
      }
      const res = await ipc.desktopKeyEscrowStatus();
      if (res.ok) {
        this.escrowEnabled = !!res.escrowed;
        this.mfaEnabled = res.mfa_enabled === true;
        const at = ipc.store.get('livebooksCloudKeyEscrowedAt');
        this.escrowStatusMessage =
          res.escrowed && typeof at === 'string'
            ? t`Last backed up: ${at}`
            : res.escrowed
            ? t`Cloud backup is enabled.`
            : t`Cloud backup is off.`;
      }
    },
    async onEscrowToggle() {
      if (!this.dbPath) {
        this.escrowEnabled = false;
        showToast({
          type: 'error',
          message: t`Open a company file before enabling cloud backup.`,
          duration: 'short',
        });
        return;
      }
      if (!this.escrowEnabled) {
        await this.refreshEscrowStatus();
        return;
      }
      if (!this.mfaEnabled) {
        this.escrowEnabled = false;
        showToast({
          type: 'error',
          message: t`Enable two-factor authentication on your LiveBooks Cloud account before backing up your key.`,
          duration: 'long',
        });
        return;
      }
      if (!this.escrowTotpCode.trim()) {
        showToast({
          type: 'error',
          message: t`Enter your authenticator code to back up the encryption key.`,
          duration: 'short',
        });
        this.escrowEnabled = false;
        return;
      }
      this.escrowBusy = true;
      try {
        const res = await ipc.desktopKeyEscrowPush(
          this.dbPath,
          this.escrowTotpCode.trim() || undefined
        );
        if (!res.ok) {
          this.escrowEnabled = false;
          const msg =
            res.error === 'escrow_key_probe_failed'
              ? res.message ||
                t`Your local encryption key could not open this company file. Cloud backup was not updated.`
              : res.message ||
                t`Could not back up your encryption key. Check your Pro subscription and try again.`;
          showToast({
            type: 'error',
            message: msg,
            duration: 'long',
          });
          return;
        }
        showToast({
          type: 'success',
          message: t`Encryption key backed up to LiveBooks Cloud.`,
          duration: 'short',
        });
        await this.refreshEscrowStatus();
      } finally {
        this.escrowBusy = false;
      }
    },
  },
});
</script>
