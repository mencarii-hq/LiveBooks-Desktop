<template>
  <!-- Trigger and panel are siblings so Popper's reference rect is never widened by
       in-flow hacks; nested panel + tables/stacking contexts also miscomputed absolute position. -->
  <div
    :class="
      fitReference ? 'inline-block w-max max-w-full align-middle' : undefined
    "
  >
    <div ref="reference" class="h-full">
      <slot
        name="target"
        :toggle-popover="togglePopover"
        :handle-blur="handleBlur"
      ></slot>
    </div>
    <Teleport to="body">
      <Transition>
        <div
          v-show="isOpen"
          ref="popover"
          :class="popoverClass"
          class="
            bg-white
            dark:bg-gray-850
            rounded-md
            border
            dark:border-gray-875
            shadow-lg
            popover-container
            z-[10040]
          "
          :style="{
            'transition-delay': `${isOpen ? entryDelay : exitDelay}ms`,
          }"
        >
          <slot name="content" :toggle-popover="togglePopover"></slot>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script>
import { createPopper } from '@popperjs/core';
import { nextTick } from 'vue';

export default {
  name: 'Popover',
  props: {
    showPopup: {
      type: [Boolean, null],
      default: null,
    },
    right: Boolean,
    entryDelay: { type: Number, default: 0 },
    exitDelay: { type: Number, default: 0 },
    placement: {
      type: String,
      default: 'bottom-start',
    },
    popoverClass: [String, Object, Array],
    /** When true, anchor width matches the trigger (e.g. icon button in a wide table cell). */
    fitReference: { type: Boolean, default: false },
  },
  emits: ['open', 'close'],
  data() {
    return {
      isOpen: false,
    };
  },
  watch: {
    showPopup(value) {
      if (value === true) {
        this.open();
      }
      if (value === false) {
        this.close();
      }
    },
  },
  mounted() {
    this.listener = (e) => {
      let $els = [this.$refs.reference, this.$refs.popover];
      let insideClick = $els.some(
        ($el) => $el && (e.target === $el || $el.contains(e.target))
      );
      if (insideClick) {
        return;
      }
      this.close();
    };

    if (this.showPopup == null) {
      document.addEventListener('click', this.listener);
    }
  },
  beforeUnmount() {
    this.popper && this.popper.destroy();
    if (this.listener) {
      document.removeEventListener('click', this.listener);
      delete this.listener;
    }
  },
  methods: {
    setupPopper() {
      const refEl = this.$refs.reference;
      const popEl = this.$refs.popover;
      if (!(refEl instanceof Element) || !(popEl instanceof Element)) {
        return;
      }
      if (!this.popper) {
        this.popper = createPopper(refEl, popEl, {
          placement: this.placement,
          strategy: 'fixed',
          modifiers: [{ name: 'offset', options: { offset: [120, 0] } }],
        });
      } else {
        this.popper.update();
      }
    },
    togglePopover(flag) {
      if (flag == null) {
        flag = !this.isOpen;
      }
      flag = Boolean(flag);
      if (flag) {
        this.open();
      } else {
        this.close();
      }
    },
    open() {
      if (this.isOpen) {
        return;
      }
      this.isOpen = true;
      nextTick(() => {
        this.setupPopper();
        requestAnimationFrame(() => this.popper?.update());
      });
      this.$emit('open');
    },
    close() {
      if (!this.isOpen) {
        return;
      }
      this.isOpen = false;
      this.$emit('close');
    },
    handleBlur({ relatedTarget }) {
      relatedTarget && this.close();
    },
  },
};
</script>
<style scoped>
.v-enter-active,
.v-leave-active {
  transition: opacity 150ms ease-out;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}
</style>
