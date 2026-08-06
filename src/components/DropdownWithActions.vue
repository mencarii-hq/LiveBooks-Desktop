<template>
  <!-- Single action: run on click (no nested dropdown), unless forced. -->
  <Button
    v-if="actions && actions.length === 1 && !forceDropdown"
    :type="type"
    :icon="false"
    @click="runSingle"
  >
    <slot>
      <feather-icon name="more-horizontal" class="w-4 h-4" />
    </slot>
  </Button>
  <Dropdown
    v-else-if="actions && actions.length"
    class="text-xs"
    :items="items"
    :doc="doc"
    fit-reference
    right
  >
    <template #default="{ toggleDropdown }">
      <Button :type="type" :icon="icon" @click="toggleDropdown()">
        <slot>
          <feather-icon name="more-horizontal" class="w-4 h-4" />
        </slot>
      </Button>
    </template>
  </Dropdown>
</template>

<script lang="ts">
import { Doc } from 'fyo/model/doc';
import { Action } from 'fyo/model/types';
import Button from 'src/components/Button.vue';
import Dropdown from 'src/components/Dropdown.vue';
import { DropdownItem } from 'src/utils/types';
import { defineComponent, PropType } from 'vue';

export default defineComponent({
  name: 'DropdownWithActions',
  components: {
    Dropdown,
    Button,
  },
  inject: {
    injectedDoc: {
      from: 'doc',
      default: undefined,
    },
  },
  props: {
    actions: { type: Array as PropType<Action[]>, default: () => [] },
    type: { type: String, default: 'secondary' },
    icon: { type: Boolean, default: true },
    /** Always show the menu (never auto-run a lone action). */
    forceDropdown: { type: Boolean, default: false },
  },
  computed: {
    doc() {
      // @ts-ignore
      const doc = this.injectedDoc;
      if (doc instanceof Doc) {
        return doc;
      }

      return undefined;
    },
    items(): DropdownItem[] {
      return this.actions.map(({ label, group, component, action }) => ({
        label,
        group,
        action,
        component,
      }));
    },
  },
  methods: {
    async runSingle() {
      const action = this.actions[0]?.action;
      if (!action) {
        return;
      }
      if (this.doc) {
        await action(this.doc, this.$router);
      } else {
        await (action as () => unknown)();
      }
    },
  },
});
</script>
