<template>
  <Teleport to="body">
    <Transition>
      <!-- Backdrop -->
      <div v-if="open" class="backdrop z-20 flex justify-center items-center">
        <!-- Dialog -->
        <div
          class="
            bg-white
            dark:bg-gray-850
            border
            dark:border-gray-800
            rounded-lg
            text-gray-900
            dark:text-gray-25
            p-4
            shadow-2xl
            w-dialog
            flex flex-col
            gap-4
            inner
          "
        >
          <div class="flex justify-between items-center">
            <h1 class="font-semibold">{{ title }}</h1>
            <FeatherIcon
              :name="config.iconName"
              class="w-6 h-6"
              :class="config.iconColor"
            />
          </div>

          <template v-if="detail">
            <p v-if="typeof detail === 'string'" class="text-base">
              {{ detail }}
            </p>

            <div v-else v-for="d of detail">
              <p class="text-base">{{ d }}</p>
            </div>
          </template>
          <p
            v-if="detailEmphasis"
            class="text-sm text-red-600 dark:text-red-400"
          >
            {{ detailEmphasis }}
          </p>
          <div v-if="input" class="flex flex-col gap-1">
            <input
              ref="promptInput"
              v-model="typedInput"
              class="
                text-sm
                border
                dark:border-gray-700
                rounded
                px-2
                py-1.5
                bg-white
                dark:bg-gray-900 dark:text-gray-25
              "
              :placeholder="input.placeholder"
              autocomplete="off"
              spellcheck="false"
              @keydown.enter.prevent="onConfirmEnter"
            />
          </div>
          <div v-if="confirmText" class="flex flex-col gap-1">
            <p class="text-sm text-gray-600 dark:text-gray-300">
              {{ confirmHint }}
            </p>
            <input
              ref="confirmInput"
              v-model="typedConfirm"
              class="
                text-sm
                border
                dark:border-gray-700
                rounded
                px-2
                py-1.5
                bg-white
                dark:bg-gray-900 dark:text-gray-25
              "
              autocomplete="off"
              spellcheck="false"
              @keydown.enter.prevent="onConfirmEnter"
            />
          </div>
          <div class="flex justify-end gap-4 mt-4">
            <Button
              v-for="(b, index) of buttons"
              :ref="b.isPrimary ? 'primary' : 'secondary'"
              :key="b.label"
              style="min-width: 5rem"
              :type="b.isPrimary ? 'primary' : 'secondary'"
              :disabled="b.isPrimary && !canConfirm"
              @click="() => handleClick(index)"
            >
              {{ b.label }}
            </Button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
<script lang="ts">
import { t } from 'fyo';
import { getIconConfig } from 'src/utils/interactive';
import { DialogButton, DialogInputOptions, ToastType } from 'src/utils/types';
import { defineComponent, nextTick, PropType, ref } from 'vue';
import Button from './Button.vue';
import FeatherIcon from './FeatherIcon.vue';

export default defineComponent({
  components: { Button, FeatherIcon },
  props: {
    type: { type: String as PropType<ToastType>, default: 'info' },
    title: { type: String, required: true },
    detail: {
      type: [String, Array] as PropType<string | string[]>,
      required: false,
    },
    detailEmphasis: {
      type: String as PropType<string | undefined>,
      required: false,
    },
    confirmText: {
      type: String as PropType<string | undefined>,
      required: false,
    },
    input: {
      type: Object as PropType<DialogInputOptions | undefined>,
      required: false,
    },
    buttons: {
      type: Array as PropType<DialogButton[]>,
      required: true,
    },
  },
  setup() {
    return {
      primary: ref<InstanceType<typeof Button>[] | null>(null),
      secondary: ref<InstanceType<typeof Button>[] | null>(null),
    };
  },
  data() {
    return {
      open: false,
      typedConfirm: '',
      typedInput: this.input?.value ?? '',
    };
  },
  computed: {
    config() {
      return getIconConfig(this.type);
    },
    canConfirm(): boolean {
      if (this.input && !this.typedInput.trim()) {
        return false;
      }

      if (!this.confirmText) {
        return true;
      }
      return this.typedConfirm.trim() === this.confirmText;
    },
    confirmHint(): string {
      if (!this.confirmText) {
        return '';
      }
      return t`Type ${this.confirmText} to confirm`;
    },
  },
  watch: {
    open(value) {
      if (value) {
        document.addEventListener('keydown', this.handleEscape);
      } else {
        document.removeEventListener('keydown', this.handleEscape);
      }
    },
  },
  async mounted() {
    await nextTick(() => {
      this.open = true;
    });

    this.focusInitial();
  },
  methods: {
    focusInitial() {
      if (this.input) {
        const input = this.$refs.promptInput as HTMLInputElement | undefined;
        input?.focus();
        input?.select();
        return;
      }

      if (this.confirmText) {
        const input = this.$refs.confirmInput as HTMLInputElement | undefined;
        input?.focus();
        return;
      }
      this.focusButton();
    },
    focusButton() {
      let button = this.primary?.[0];
      if (!button) {
        button = this.secondary?.[0];
      }

      if (!button) {
        return;
      }

      button.$el.focus();
    },
    onConfirmEnter() {
      if (!this.canConfirm) {
        return;
      }
      const index = this.buttons.findIndex(({ isPrimary }) => isPrimary);
      if (index === -1) {
        return;
      }
      this.handleClick(index);
    },
    handleEscape(event: KeyboardEvent) {
      if (event.code !== 'Escape') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (this.buttons.length === 1) {
        return this.handleClick(0);
      }

      const index = this.buttons.findIndex(({ isEscape }) => isEscape);

      if (index === -1) {
        return;
      }

      return this.handleClick(index);
    },
    handleClick(index: number) {
      const button = this.buttons[index];
      if (button.isPrimary && !this.canConfirm) {
        return;
      }
      button.action(this.input ? this.typedInput.trim() : undefined);
      this.open = false;
    },
  },
});
</script>
<style scoped>
.v-enter-active,
.v-leave-active {
  transition: all 100ms ease-out;
}

.inner {
  transition: all 150ms ease-out;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}

.v-enter-from .inner,
.v-leave-to .inner {
  transform: translateY(-50px);
}

.v-enter-to .inner,
.v-leave-from .inner {
  transform: translateY(0px);
}
</style>
