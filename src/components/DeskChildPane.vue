<template>
  <section
    class="
      flex flex-col
      min-h-0 min-w-0
      flex-1
      border-s border-gray-200
      dark:border-gray-800
      bg-white
      dark:bg-gray-875
    "
    :class="focused ? 'ring-1 ring-inset ring-blue-400/70' : ''"
    :data-testid="`desk-child-pane-${pane.id}`"
    :data-pane-id="pane.id"
    tabindex="0"
    @focusin="onFocusIn"
    @mousedown="onFocusIn"
  >
    <header
      class="
        flex
        items-center
        gap-2
        shrink-0
        h-9
        px-2
        border-b border-gray-200
        dark:border-gray-800
        bg-gray-50
        dark:bg-gray-900
      "
    >
      <p
        class="
          flex-1
          min-w-0
          truncate
          text-xs
          font-medium
          text-gray-700
          dark:text-gray-200
        "
        :title="pane.title"
      >
        {{ pane.title }}
      </p>
      <button
        type="button"
        class="
          p-1
          rounded
          text-gray-500
          hover:bg-gray-200
          dark:hover:bg-gray-700 dark:text-gray-300
        "
        :aria-label="t`Close`"
        data-testid="desk-pane-close"
        @click.stop="closePane(pane.id)"
      >
        <feather-icon name="x" class="w-3.5 h-3.5" />
      </button>
    </header>
    <div class="flex-1 min-h-0 min-w-0 overflow-hidden">
      <DeskPaneView :pane="pane" :dark-mode="darkMode" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { t } from 'fyo';
import { inject, onBeforeMount, onMounted, onUnmounted, provide, watch } from 'vue';
import DeskPaneView from 'src/components/DeskPaneView.vue';
import {
  closePane,
  focusPane,
  type DeskPane,
  draftFromRoute,
  isMainOnlyPath,
  MAIN_PANE_ID,
  updatePaneFromDraft,
} from 'src/utils/deskPanes';
import { shortcutsKey } from 'src/utils/injectionKeys';
import {
  paneNavKey,
  setActivePaneNav,
  setShortcutOwnerPaneId,
  type PaneNav,
} from 'src/utils/paneNav';
import type { QuickEditOptions } from 'src/utils/types';
import { getFormRoute, routeToMain } from 'src/utils/ui';

const props = defineProps<{
  pane: DeskPane;
  focused: boolean;
  darkMode: boolean;
}>();

const shortcuts = inject(shortcutsKey);
const escapeContext = { pane: props.pane.id };

const nav: PaneNav = {
  paneId: props.pane.id,
  async navigate(route) {
    const draft = draftFromRoute(route);
    if (isMainOnlyPath(draft.path)) {
      await routeToMain(route);
      return;
    }
    updatePaneFromDraft(props.pane.id, draft);
    focusPane(props.pane.id);
  },
  async openEdit({ doc }: QuickEditOptions) {
    if (!doc?.schemaName || !doc.name) {
      return;
    }
    const route = getFormRoute(doc.schemaName, doc.name);
    const draft = draftFromRoute(route);
    updatePaneFromDraft(props.pane.id, draft);
    focusPane(props.pane.id);
  },
};

provide(paneNavKey, nav);

function onFocusIn() {
  setActivePaneNav(nav);
  focusPane(props.pane.id);
}

function setEscapeShortcut(on: boolean) {
  if (!shortcuts) {
    return;
  }
  if (on) {
    shortcuts.associatePaneContext(props.pane.id, escapeContext);
    shortcuts.set(escapeContext, ['Escape'], () => closePane(props.pane.id));
  } else {
    shortcuts.delete(escapeContext);
  }
}

onBeforeMount(() => {
  setShortcutOwnerPaneId(props.pane.id);
});

onMounted(() => {
  if (props.focused) {
    setActivePaneNav(nav);
    setEscapeShortcut(true);
  }
  setShortcutOwnerPaneId(null);
});

watch(
  () => props.focused,
  (focused) => {
    if (focused) {
      setActivePaneNav(nav);
      setEscapeShortcut(true);
    } else {
      setEscapeShortcut(false);
    }
  }
);

onUnmounted(() => {
  shortcuts?.clearPane?.(props.pane.id);
  shortcuts?.delete(escapeContext);
  setShortcutOwnerPaneId(null);
});
</script>
