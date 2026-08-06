<template>
  <Transition name="lb-side-drawer">
    <div
      v-if="open"
      class="lb-side-drawer-shell h-full shrink-0 overflow-hidden"
      role="dialog"
      aria-modal="true"
    >
      <div
        class="
          lb-side-drawer-panel
          w-quick-edit
          h-full
          flex flex-col
          bg-white
          dark:bg-gray-850
          border-l
          dark:border-gray-800
          overflow-hidden
        "
      >
        <div
          class="
            flex
            items-center
            gap-3
            px-4
            h-row-largest
            shrink-0
            sticky
            top-0
            bg-white
            dark:bg-gray-850
          "
          style="z-index: 1"
        >
          <Button :icon="true" :aria-label="t`Close`" @click="$emit('close')">
            <feather-icon name="x" class="w-4 h-4" />
          </Button>
          <p
            class="
              text-xl
              font-semibold
              text-gray-600
              dark:text-gray-300
              min-w-0
              flex-1
              truncate
            "
          >
            <slot name="title">{{ title }}</slot>
          </p>
        </div>

        <div
          class="
            flex-1
            min-h-0
            overflow-y-auto overflow-x-hidden
            custom-scroll custom-scroll-thumb2
            border-t
            dark:border-gray-800
          "
        >
          <div class="p-4 min-h-full flex flex-col">
            <slot />
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script lang="ts">
import { t } from 'fyo';
import Button from 'src/components/Button.vue';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { defineComponent, inject } from 'vue';

export default defineComponent({
  name: 'Drawer',
  components: { Button },
  props: {
    open: { type: Boolean, default: false },
    title: { type: String, default: '' },
  },
  emits: ['close'],
  setup() {
    const context = `Drawer-` + Math.random().toString(36).slice(2, 6);
    return { shortcuts: inject(shortcutsKey), context, t };
  },
  watch: {
    open(value: boolean) {
      if (value) {
        this.shortcuts?.set(this.context, ['Escape'], () => {
          this.$emit('close');
        });
      } else {
        this.shortcuts?.delete(this.context);
      }
    },
  },
  beforeUnmount() {
    this.shortcuts?.delete(this.context);
  },
});
</script>

<style scoped>
.lb-side-drawer-shell {
  width: var(--w-quick-edit);
}
.lb-side-drawer-enter-active,
.lb-side-drawer-leave-active {
  transition: width 150ms ease-out;
}
.lb-side-drawer-enter-from,
.lb-side-drawer-leave-to {
  width: 0;
}
.lb-side-drawer-enter-to,
.lb-side-drawer-leave-from {
  width: var(--w-quick-edit);
}
</style>
