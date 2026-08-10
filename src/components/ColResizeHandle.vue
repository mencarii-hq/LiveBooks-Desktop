<template>
  <span
    class="col-resize-handle"
    :title="title"
    @mousedown.prevent="$emit('start', $event)"
    @dblclick.stop="$emit('reset')"
  />
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'ColResizeHandle',
  props: {
    title: {
      type: String,
      default: 'Drag to resize. Double-click to reset.',
    },
  },
  emits: ['start', 'reset'],
});
</script>

<style scoped>
.col-resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 0.75rem;
  height: 100%;
  cursor: col-resize;
  flex-shrink: 0;
  z-index: 1;
}
.col-resize-handle::after {
  content: '';
  position: absolute;
  top: 0.5rem;
  bottom: 0.5rem;
  left: 50%;
  width: 2px;
  border-radius: 1px;
  transform: translateX(-50%);
  background: rgba(156, 163, 175, 0.75); /* gray-400 */
}
.col-resize-handle:hover::after {
  background: rgba(107, 114, 128, 1); /* gray-500 */
}
</style>
