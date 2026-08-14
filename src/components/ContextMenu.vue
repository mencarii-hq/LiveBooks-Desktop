<template>
  <Teleport to="body">
    <!-- Inline z-index/min-width: Tailwind 2 (postcss7-compat) silently
         drops arbitrary-value classes like z-[80]. -->
    <div
      v-if="open"
      class="fixed inset-0"
      style="z-index: 80"
      data-testid="context-menu-backdrop"
      @click="emit('close')"
      @contextmenu.prevent="emit('close')"
    >
      <ul
        class="
          absolute
          py-1
          rounded
          border border-gray-200
          dark:border-gray-700
          bg-white
          dark:bg-gray-800
          shadow-lg
          text-sm text-gray-800
          dark:text-gray-100
        "
        :style="{ top: `${y}px`, left: `${x}px`, minWidth: '12rem' }"
        role="menu"
        data-testid="context-menu"
        @click.stop
      >
        <li
          v-for="(item, i) in items"
          :key="i"
          class="
            px-3
            py-1.5
            cursor-pointer
            hover:bg-gray-100
            dark:hover:bg-gray-700
          "
          role="menuitem"
          @click="onItem(item)"
        >
          {{ item.label }}
        </li>
      </ul>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
export interface ContextMenuItem {
  label: string;
  action: () => void;
}

defineProps<{
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
}>();

const emit = defineEmits<{
  close: [];
}>();

function onItem(item: ContextMenuItem) {
  emit('close');
  item.action();
}
</script>
