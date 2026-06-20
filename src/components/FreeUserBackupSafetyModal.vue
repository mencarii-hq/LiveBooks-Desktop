<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="
        fixed
        inset-0
        z-[10050]
        flex
        items-center
        justify-center
        bg-black/40
        px-4
      "
      role="dialog"
      aria-modal="true"
    >
      <div
        class="
          w-full
          max-w-lg
          rounded-lg
          border
          dark:border-gray-800
          bg-white
          dark:bg-gray-875
          p-6
          shadow-xl
        "
      >
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-25 mb-2">
          {{ t`Your data lives only on this computer` }}
        </h2>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {{
            t`LiveBooks stores your ledger as a file on this device. Enable full-disk encryption on your computer and export backups you can restore. If you lose this machine without a backup, your books may be unrecoverable.`
          }}
        </p>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
          {{
            t`LiveBooks Pro uses MFA on your cloud account to protect bank feeds (Plaid). We do not store a full copy of your ledger in the cloud. Export a backup you can store safely.`
          }}
        </p>
        <div class="flex flex-col sm:flex-row gap-3">
          <Button type="primary" class="flex-1" @click="exportBackup">
            {{ t`Export backup now` }}
          </Button>
          <Button class="flex-1" @click="dismiss">
            {{ t`I understand` }}
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script lang="ts">
import { t } from 'fyo';
import Button from 'src/components/Button.vue';
import { showDialog } from 'src/utils/interactive';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'FreeUserBackupSafetyModal',
  components: { Button },
  props: {
    open: { type: Boolean, required: true },
  },
  emits: ['dismiss', 'exported'],
  methods: {
    dismiss() {
      this.$emit('dismiss');
    },
    async exportBackup() {
      await showDialog({
        type: 'info',
        title: t`Export a backup`,
        detail: t`Use File → Export (or your backup workflow) and store the file on external media. Mark export complete when finished.`,
        buttons: [
          {
            label: t`Mark export done`,
            isPrimary: true,
            action: () => {
              ipc.store.set(
                'miscLastBackupExportedAt',
                new Date().toISOString()
              );
              this.$emit('exported');
              this.dismiss();
              return null;
            },
          },
          {
            label: t`Later`,
            isEscape: true,
            action: () => null,
          },
        ],
      });
    },
  },
});
</script>
