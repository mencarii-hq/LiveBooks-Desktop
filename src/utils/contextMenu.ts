import { reactive } from 'vue';
import type { ContextMenuItem } from 'src/components/ContextMenu.vue';

export const contextMenuState = reactive({
  open: false,
  x: 0,
  y: 0,
  items: [] as ContextMenuItem[],
});

export function showContextMenu(event: MouseEvent, items: ContextMenuItem[]) {
  event.preventDefault();
  event.stopPropagation();
  contextMenuState.x = event.clientX;
  contextMenuState.y = event.clientY;
  contextMenuState.items = items;
  contextMenuState.open = true;
}

export function hideContextMenu() {
  contextMenuState.open = false;
  contextMenuState.items = [];
}
