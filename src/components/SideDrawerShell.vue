<template>
  <div
    class="side-drawer-shell relative h-full shrink-0 flex"
    :class="{ 'is-resizing': isResizing }"
    :style="{ width: liveWidthPx + 'px' }"
  >
    <div
      class="
        sidebar-resize-grip
        window-no-drag
        shrink-0
        self-stretch
        touch-none
        z-10
      "
      :class="{ 'is-resizing': isResizing }"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize side drawer"
      :aria-valuenow="liveWidthPx"
      :aria-valuemin="SIDE_DRAWER_MIN_PX"
      :aria-valuemax="SIDE_DRAWER_MAX_PX"
      @pointerdown="onResizePointerDown"
    />
    <div class="flex-1 min-w-0 h-full min-h-0">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import {
  SIDE_DRAWER_MAX_PX,
  SIDE_DRAWER_MIN_PX,
  clampSideDrawerPx,
  loadSideDrawerWidthPx,
  persistSideDrawerWidthPx,
  syncSideDrawerCssVar,
} from 'src/utils/sideDrawerWidth';

/** Same class as the nav sidebar grip so cursor lock styling matches. */
const RESIZING_HTML_CLASS = 'desk-sidebar-resizing';
const DRAG_THRESHOLD_PX = 4;

const widthPx = ref(loadSideDrawerWidthPx());
const liveWidthPx = ref(widthPx.value);
const isResizing = ref(false);

function sync() {
  liveWidthPx.value = syncSideDrawerCssVar(widthPx.value);
}

function pxFromClientX(clientX: number): number {
  const rtl = document.documentElement.dir === 'rtl';
  const raw = rtl ? clientX : window.innerWidth - clientX;
  return clampSideDrawerPx(raw);
}

function onResizePointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  const grip = e.currentTarget as HTMLElement;
  const startX = e.clientX;
  let dragActive = false;

  grip.setPointerCapture(e.pointerId);

  const beginDrag = (clientX: number) => {
    if (dragActive) return;
    dragActive = true;
    isResizing.value = true;
    document.documentElement.classList.add(RESIZING_HTML_CLASS);
    document.body.style.userSelect = 'none';
    widthPx.value = pxFromClientX(clientX);
    sync();
  };

  const onMove = (ev: PointerEvent) => {
    if (Math.abs(ev.clientX - startX) < DRAG_THRESHOLD_PX && !dragActive) {
      return;
    }
    beginDrag(ev.clientX);
    widthPx.value = pxFromClientX(ev.clientX);
    sync();
  };

  const onEnd = (ev: PointerEvent) => {
    grip.removeEventListener('pointermove', onMove);
    grip.removeEventListener('pointerup', onEnd);
    grip.removeEventListener('pointercancel', onEnd);
    try {
      grip.releasePointerCapture(ev.pointerId);
    } catch {
      /* already released */
    }
    if (!dragActive) return;
    isResizing.value = false;
    document.documentElement.classList.remove(RESIZING_HTML_CLASS);
    document.body.style.userSelect = '';
    persistSideDrawerWidthPx(widthPx.value);
  };

  grip.addEventListener('pointermove', onMove);
  grip.addEventListener('pointerup', onEnd);
  grip.addEventListener('pointercancel', onEnd);
}

function onWindowResize() {
  sync();
}

onMounted(() => {
  sync();
  window.addEventListener('resize', onWindowResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize);
  document.documentElement.classList.remove(RESIZING_HTML_CLASS);
  document.body.style.userSelect = '';
});
</script>

<style scoped>
.side-drawer-shell.is-resizing {
  transition: none;
}
</style>
