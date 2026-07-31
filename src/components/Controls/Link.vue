<script>
import { t } from 'fyo';
import Badge from 'src/components/Badge.vue';
import { fyo } from 'src/initFyo';
import { fuzzyMatch } from 'src/utils';
import { getCreateFiltersFromListViewFilters } from 'src/utils/misc';
import { markRaw } from 'vue';
import AutoComplete from './AutoComplete.vue';

export default {
  name: 'Link',
  extends: AutoComplete,
  data() {
    return { results: [], filtersDisabled: false };
  },
  watch: {
    value: {
      immediate: true,
      handler(newValue) {
        this.setLinkValue(newValue);
      },
    },
  },
  mounted() {
    if (this.value) {
      this.setLinkValue();
    }
  },
  props: {
    focusInput: Boolean,
    showClearButton: Boolean,
  },
  async created() {
    if (this.focusInput) {
      this.focusInputTag();
    }
  },
  methods: {
    async setLinkValue(newValue, isInput) {
      if (isInput) {
        return (this.linkValue = newValue || '');
      }

      const value = newValue ?? this.value;
      const { fieldname, target } = this.df ?? {};
      const linkDisplayField = fyo.schemaMap[target ?? '']?.linkDisplayField;
      if (!linkDisplayField) {
        return (this.linkValue = value);
      }

      try {
        const linkDoc = await this.doc?.loadAndGetLink(fieldname);
        this.linkValue = linkDoc?.get(linkDisplayField) ?? '';
      } catch {
        // Missing / partial link targets are expected while typing.
        this.linkValue = value || '';
      }
    },
    getTargetSchemaName() {
      return this.df.target;
    },
    async getOptions(filters) {
      const schemaName = this.getTargetSchemaName();
      if (!schemaName) {
        return [];
      }

      if (this.results?.length) {
        return this.results;
      }

      const schema = fyo.schemaMap[schemaName];

      const fields = [
        ...new Set(['name', schema.titleField, this.df.groupBy]),
      ].filter(Boolean);

      const results = await fyo.db.getAll(schemaName, {
        filters,
        fields,
      });

      return (this.results = results
        .map((r) => {
          const option = { label: r[schema.titleField], value: r.name };
          if (this.df.groupBy) {
            option.group = r[this.df.groupBy];
          }
          return option;
        })
        .filter(Boolean));
    },
    async getSuggestions(keyword = '') {
      let filters = this.filtersDisabled ? null : await this.getFilters();
      let options = await this.getOptions(filters || {});

      if (keyword) {
        options = options
          .map((item) => ({ ...fuzzyMatch(keyword, item.label), item }))
          .filter(({ isMatch }) => isMatch)
          .sort((a, b) => a.distance - b.distance)
          .map(({ item }) => item);
      }

      if (options.length === 0 && !this.df.emptyMessage) {
        if (filters && !!fyo.singles.SystemSettings?.allowFilterBypass) {
          options = [
            {
              component: markRaw({
                template:
                  '<span class="text-gray-600 dark:text-gray-300">{{ t`No results found, disable filters` }}</span>',
              }),
              action: () => this.disableFiltering(),
              actionOnly: true,
            },
          ];
        } else if (this.isFocused && (!this.doc || !this.df.create)) {
          options = [
            {
              component: markRaw({
                template:
                  '<span class="text-gray-600 dark:text-gray-300">{{ t`No results found` }}</span>',
              }),
              action: () => {},
              actionOnly: true,
            },
          ];
        }
      }

      if (this.doc && this.df.create) {
        options = options.concat(this.getCreateNewOption());
      }

      return options;
    },
    getCreateNewOption() {
      return {
        label: t`Create`,
        action: () => this.openNewDoc(),
        actionOnly: true,
        component: markRaw({
          template:
            '<div class="flex items-center font-semibold">{{ t`Create` }}' +
            '<Badge color="blue" class="ms-2" v-if="isNewValue">{{ linkValue }}</Badge>' +
            '</div>',
          computed: {
            value: () => this.value,
            linkValue: () => this.linkValue,
            isNewValue: () => {
              const values = this.suggestions.map((d) => d.label);
              return this.linkValue && !values.includes(this.linkValue);
            },
          },
          components: { Badge },
        }),
      };
    },
    disableFiltering(keyword) {
      this.filtersDisabled = true;
      this.results = [];
      setTimeout(() => {
        this.isDropdownOpen = true;
        this.updateSuggestions(keyword);
      }, 1);
    },
    /**
     * Links must not commit free-typed text: that writes non-existent
     * names onto the parent doc (e.g. Party.address) and fails on save.
     * Update the display only while typing; commit on select / Create.
     */
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
    async onBlur(label, toggleDropdown) {
      this.isFocused = false;
      this.isDropdownOpen = false;
      if (toggleDropdown) {
        toggleDropdown(false);
      }

      if (!label && !this.value) {
        return;
      }
      if (!label) {
        this.triggerChange('');
        return;
      }

      const suggestions =
        this.suggestions?.length > 0
          ? this.suggestions
          : await this.getSuggestions(label);
      const match = suggestions.find(
        (s) => !s.actionOnly && (s.label === label || s.value === label)
      );
      if (match) {
        this.setSuggestion(match);
        return;
      }

      // No real option — restore committed value; do not link a phantom name.
      this.setLinkValue(this.value);
    },
    async openNewDoc() {
      const schemaName = this.df.target;
      const fieldname = this.df.fieldname;
      const parentDoc = this.doc;
      const name =
        this.linkValue || fyo.doc.getTemporaryName(fyo.schemaMap[schemaName]);
      const filters = await this.getCreateFilters();
      const { openQuickEdit } = await import('src/utils/ui');

      const doc = fyo.doc.getNewDoc(schemaName, { name, ...filters });
      openQuickEdit({ doc });

      // Nested quick-edit replaces this panel and destroys this Link.
      // Set the parent Doc directly so the link survives remount.
      doc.once('afterSync', async () => {
        try {
          if (parentDoc && fieldname) {
            parentDoc.links ??= {};
            parentDoc.links[fieldname] = doc;
            await parentDoc.set(fieldname, doc.name);
          }
          this.triggerChange(doc.name);
        } catch (error) {
          // Keep the nested create panel open so the user can fix the parent
          // field; do not pop the stack after a failed link-back.
          throw error;
        }

        this.results = [];
        this.$router.back();
      });
    },
    async getCreateFilters() {
      const { schemaName, fieldname } = this.df;
      const getCreateFilters =
        fyo.models[schemaName]?.createFilters?.[fieldname];
      let createFilters = await getCreateFilters?.(this.doc);

      if (createFilters !== undefined) {
        return createFilters;
      }

      const filters = (await this.getFilters()) ?? {};
      return getCreateFiltersFromListViewFilters(filters);
    },
    async getFilters() {
      if (this.df.filters) {
        return this.df.filters;
      }

      if (fyo.singles.SystemSettings?.removeFilter) {
        return null;
      }

      const { schemaName, fieldname } = this.df;
      const getFilters = fyo.models[schemaName]?.filters?.[fieldname];

      if (getFilters === undefined) {
        return null;
      }

      if (this.doc) {
        return await getFilters(this.doc);
      }

      try {
        return await getFilters();
      } catch {
        return null;
      }
    },
  },
};
</script>
