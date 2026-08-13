<template>
  <Dropdown :items="suggestions" :is-loading="isLoading" :df="df" :doc="doc">
    <template
      #default="{
        toggleDropdown,
        highlightItemUp,
        highlightItemDown,
        selectHighlightedItem,
      }"
    >
      <div v-if="showLabel" :class="labelClasses">
        {{ df.label }}<span v-if="isRequired" class="text-red-500"> *</span>
      </div>
      <div class="flex items-center gap-1">
        <div
          class="flex flex-1 items-center justify-between pe-2 rounded min-w-0"
          :style="containerStyles"
          :class="containerClasses"
        >
          <input
            ref="input"
            spellcheck="false"
            :class="inputClasses"
            class="bg-transparent"
            type="text"
            :value="linkValue"
            :placeholder="inputPlaceholder"
            :readonly="isReadOnly"
            :tabindex="isReadOnly ? '-1' : '0'"
            @focus="(e) => !isReadOnly && onFocus(e, toggleDropdown)"
            @click="(e) => !isReadOnly && onClick(e, toggleDropdown)"
            @blur="(e) => !isReadOnly && onBlur(e.target.value, toggleDropdown)"
            @input="(e) => onInput(e, toggleDropdown)"
            @keydown.up="onKeyDownUp($event, toggleDropdown, highlightItemUp)"
            @keydown.down="
              onKeyDownDown($event, toggleDropdown, highlightItemDown)
            "
            @keydown.enter="
              onPressEnter($event, toggleDropdown, selectHighlightedItem)
            "
            @keydown.tab="closeDropdown($event, toggleDropdown)"
            @keydown.esc="closeDropdown($event, toggleDropdown)"
          />

          <div v-if="!isReadOnly" class="flex items-center gap-0.5 shrink-0">
            <button
              v-if="canLink && value && showClearButton"
              class="
                p-0.5
                rounded
                bg-transparent
                text-gray-600
                hover:text-gray-800
                dark:text-gray-300 dark:hover:text-gray-100
                transition-colors
              "
              @click.stop.prevent="clearValue"
              @mousedown.prevent
            >
              <feather-icon name="x" class="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              class="
                p-0.5
                rounded
                bg-transparent
                text-gray-400
                hover:text-gray-600
              "
              @click.stop="(e) => onFocus(e, toggleDropdown)"
              @mousedown.prevent
            >
              <feather-icon name="chevron-down" class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <button
          v-if="canLink"
          type="button"
          class="
            p-0.5
            rounded
            bg-transparent
            text-gray-500
            hover:text-gray-800
            dark:text-gray-400 dark:hover:text-gray-100
            shrink-0
          "
          title="Open linked document"
          @mouseenter="showQuickView = true"
          @mouseleave="showQuickView = false"
          @click.stop.prevent="routeToLinkedDoc"
          @mousedown.prevent
        >
          <Popover
            :show-popup="showQuickView"
            :entry-delay="300"
            placement="bottom"
          >
            <template #target>
              <feather-icon name="external-link" class="w-3.5 h-3.5" />
            </template>
            <template #content>
              <QuickView :schema-name="linkSchemaName" :name="value" />
            </template>
          </Popover>
        </button>
      </div>
    </template>
  </Dropdown>
</template>
<script>
import { getOptionList } from 'fyo/utils';
import { FieldTypeEnum } from 'schemas/types';
import Dropdown from 'src/components/Dropdown.vue';
import { fuzzyMatch } from 'src/utils';
import { getFormRoute, routeTo } from 'src/utils/ui';
import Popover from '../Popover.vue';
import Base from './Base.vue';
import QuickView from '../QuickView.vue';

export default {
  name: 'AutoComplete',
  components: {
    Dropdown,
    Popover,
    QuickView,
  },
  extends: Base,
  emits: ['focus'],
  data() {
    return {
      showQuickView: false,
      linkValue: '',
      focInp: false,
      isLoading: false,
      suggestions: [],
      highlightedIndex: -1,
      isFocused: false,
      isDropdownOpen: false,
      // Ignore the input blur that follows mousedown on a dropdown row so
      // a single click commits (Link/AutoComplete sticky-select).
      selecting: false,
      suggestionRequestId: 0,
    };
  },
  computed: {
    linkSchemaName() {
      let schemaName = this.df?.target;

      if (!schemaName) {
        const references = this.df?.references ?? '';
        schemaName = this.doc?.[references];
      }

      return schemaName;
    },
    options() {
      if (!this.df) {
        return [];
      }

      return getOptionList(this.df, this.doc);
    },
    canLink() {
      if (!this.value || !this.df) {
        return false;
      }

      const fieldtype = this.df?.fieldtype;
      const isLink = fieldtype === FieldTypeEnum.Link;
      const isDynamicLink = fieldtype === FieldTypeEnum.DynamicLink;

      if (!isLink && !isDynamicLink) {
        return false;
      }

      if (isLink && this.df.target) {
        return true;
      }

      const references = this.df.references;
      if (!references) {
        return false;
      }

      if (!this.doc?.[references]) {
        return false;
      }

      return true;
    },
  },
  watch: {
    value: {
      immediate: true,
      handler(newValue) {
        if (this.selecting) {
          return;
        }
        this.setLinkValue(this.resolveDisplayLabel(newValue));
      },
    },
    options: {
      handler() {
        if (!this.value) {
          return;
        }
        // Options often load after value is set (label !== value).
        this.setLinkValue(this.resolveDisplayLabel(this.value));
      },
    },
  },
  mounted() {
    if (this.value) {
      this.setLinkValue(this.resolveDisplayLabel(this.value));
      return;
    }
    const value = this.linkValue || this.value;
    this.setLinkValue(this.resolveDisplayLabel(value));
  },
  unmounted() {
    this.showQuickView = false;
  },
  deactivated() {
    this.showQuickView = false;
  },
  methods: {
    clearValue(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      this.triggerChange('');
      this.setLinkValue('');
    },
    async routeToLinkedDoc() {
      const name = this.value;
      if (!this.linkSchemaName || !name) {
        return;
      }

      const route = getFormRoute(this.linkSchemaName, name);
      await routeTo(route);
    },
    async focusInputTag() {
      this.focInp = true;
      if (this.linkValue) {
        return;
      }

      await this.$nextTick();
      this.$refs.input.focus();
    },
    setLinkValue(value) {
      this.linkValue = value;
    },
    getLinkValue(value) {
      const oldValue = this.linkValue;
      let option = this.options.find((o) => o.value === value);
      if (!option) {
        option = this.options.find((o) => o.label === value);
      }
      if (!value && !option) {
        return null;
      }

      return option?.label ?? oldValue;
    },
    /** Prefer option label over raw value (UUID) when label !== value. */
    resolveDisplayLabel(value) {
      if (!value) {
        return this.getLinkValue(value);
      }
      let option = this.options.find((o) => o.value === value);
      if (!option) {
        option = this.options.find((o) => o.label === value);
      }
      if (option?.label) {
        return option.label;
      }
      // Keep prior human label if we already resolved; never flash a UUID when
      // options are momentarily empty.
      const prior = this.linkValue;
      if (prior && prior !== value) {
        return prior;
      }
      return value;
    },
    async updateSuggestions(keyword) {
      const requestId = ++this.suggestionRequestId;
      if (typeof keyword === 'string' && !this.selecting) {
        this.setLinkValue(keyword, true);
      }

      this.isLoading = true;
      const suggestions = await this.getSuggestions(keyword);
      if (requestId !== this.suggestionRequestId || this.selecting) {
        this.isLoading = false;
        return;
      }
      this.suggestions = this.setSetSuggestionAction(suggestions);
      this.isLoading = false;
    },

    setSetSuggestionAction(suggestions) {
      for (const option of suggestions) {
        if (!option.action) {
          option.action = () => this.setSuggestion(option);
        }
      }

      return suggestions;
    },
    async getSuggestions(keyword = '') {
      keyword = keyword.toLowerCase();
      if (!keyword) {
        return this.options;
      }

      return this.options
        .map((item) => ({ ...fuzzyMatch(keyword, item.label), item }))
        .filter(({ isMatch }) => isMatch)
        .sort((a, b) => a.distance - b.distance)
        .map(({ item }) => item);
    },
    setSuggestion(suggestion) {
      this.selecting = true;
      this.suggestionRequestId += 1;
      if (suggestion?.actionOnly) {
        this.setLinkValue(this.value);
        window.setTimeout(() => {
          this.selecting = false;
        }, 0);
        return;
      }

      if (suggestion) {
        const label = suggestion.label || '';
        this.setLinkValue(label, true);
        const input = this.$refs.input;
        if (input instanceof HTMLInputElement) {
          input.value = label;
        }
        this.triggerChange(suggestion.value);
      }
      window.setTimeout(() => {
        this.selecting = false;
      }, 0);
    },
    onClick(e, toggleDropdown) {
      if (this.selecting) {
        return;
      }
      if (this.isFocused) {
        toggleDropdown(true);
        this.updateSuggestions();
        this.isDropdownOpen = true;
        this.$emit('focus', e);
      }
    },
    onFocus(e, toggleDropdown) {
      this.isFocused = true;
      toggleDropdown(true);
      this.updateSuggestions();
      this.isDropdownOpen = true;
      this.$emit('focus', e);
    },
    async onBlur(label, toggleDropdown) {
      if (this.selecting) {
        return;
      }
      this.isFocused = false;
      this.isDropdownOpen = false;
      if (!label && !this.value) {
        return;
      }
      if (!label) {
        this.triggerChange('');
        return;
      }

      if (this.suggestions.length === 0) {
        this.triggerChange(label);
        return;
      }

      const suggestion = this.suggestions.find((s) => s.label === label);
      if (suggestion) {
        this.setSuggestion(suggestion);
      } else {
        const suggestions = await this.getSuggestions(label);
        if (suggestions[0]) {
          this.setSuggestion(suggestions[0]);
        } else {
          // Free-text AutoComplete (e.g. new payee): keep what the user typed.
          this.triggerChange(label);
        }
      }
    },

    onInput(e, toggleDropdown) {
      if (this.isReadOnly) {
        return;
      }

      if (!e.target.value || this.focInp) {
        e.target.value = null;
        this.focInp = false;
        toggleDropdown(false);
        return;
      }

      this.setLinkValue(e.target.value, true);
      this.updateSuggestions(e.target.value);
    },

    async onPressEnter(e, toggleDropdown, selectHighlightedItem) {
      e.preventDefault();

      if (
        this.suggestions.length > 0 &&
        this.isFocused &&
        this.isDropdownOpen
      ) {
        await selectHighlightedItem();
        this.closeDropdown(e, toggleDropdown);
        return;
      }

      await this.updateSuggestions(this.linkValue || e.target.value);
      toggleDropdown(true);
      this.isDropdownOpen = true;
    },

    onKeyDownUp(e, toggleDropdown, highlightItemUp) {
      if (this.suggestions.length === 0) {
        this.updateSuggestions();
        toggleDropdown(true);
        this.isDropdownOpen = true;
      }
      highlightItemUp();
    },
    onKeyDownDown(e, toggleDropdown, highlightItemDown) {
      if (this.suggestions.length === 0) {
        this.updateSuggestions();
        toggleDropdown(true);
        this.isDropdownOpen = true;
      }
      highlightItemDown();
    },
    closeDropdown(e, toggleDropdown) {
      toggleDropdown(false);
      this.isDropdownOpen = false;
    },
  },
};
</script>
