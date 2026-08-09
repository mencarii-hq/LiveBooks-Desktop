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
  width: 0.625rem;
  height: 100%;
  cursor: col-resize;
  flex-shrink: 0;
  z-index: 1;
}
.col-resize-handle::after {
  content: '';
  position: absolute;
  top: 20%;
  bottom: 20%;
  left: 50%;
  width: 2px;
  border-radius: 1px;
  background: transparent;
}
.col-resize-handle:hover::after {
  background: rgba(107, 114, 128, 0.5); /* gray-500/50 */
}
</style>
