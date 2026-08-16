<script>
import { t } from 'fyo';
import Badge from 'src/components/Badge.vue';
import { fyo } from 'src/initFyo';
import { fuzzyMatch } from 'src/utils';
import { getCreateFiltersFromListViewFilters } from 'src/utils/misc';
import { accountDisplayName } from 'utils/accountDisplay';
import { isUuidDocId } from 'utils/ids';
import { getPartyNameMap, partyLabel } from 'src/utils/partyNames';
import { markRaw } from 'vue';
import AutoComplete from './AutoComplete.vue';

export default {
  name: 'Link',
  extends: AutoComplete,
  data() {
    return { results: [], resultsFilterKey: '', filtersDisabled: false };
  },
  watch: {
    value: {
      immediate: true,
      handler(newValue) {
        if (this.selecting) {
          return;
        }
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

      try {
        let linkDoc = await this.doc?.loadAndGetLink(fieldname);
        // Standalone FormControls (no parent doc) still need the display label.
        if (!linkDoc && value && target) {
          linkDoc = await fyo.doc.getDoc(target, value);
        }

        if (target === 'Account' && linkDoc) {
          this.linkValue = accountDisplayName({
            name: linkDoc.name,
            accountName: linkDoc.get('accountName'),
          });
          return;
        }

        if (target === 'Party' && value) {
          const map = await getPartyNameMap(fyo, [value]);
          const label = partyLabel(map, value);
          this.linkValue = isUuidDocId(label) ? '' : label;
          return;
        }

        if (!linkDisplayField) {
          return (this.linkValue = isUuidDocId(value) ? '' : value || '');
        }

        const display = linkDoc?.get(linkDisplayField);
        if (display != null && display !== '' && !isUuidDocId(display)) {
          this.linkValue = display;
        } else if (isUuidDocId(value)) {
          this.linkValue = '';
        } else {
          this.linkValue = display ?? value ?? '';
        }
      } catch {
        // Missing / partial link targets are expected while typing.
        this.linkValue = isUuidDocId(value) ? '' : value || '';
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

      const filterKey = JSON.stringify(filters ?? {});
      if (this.results?.length && this.resultsFilterKey === filterKey) {
        return this.results;
      }

      const schema = fyo.schemaMap[schemaName];

      const fields = [
        ...new Set([
          'name',
          schema.titleField,
          schema.linkDisplayField,
          this.df.groupBy,
          ...(schemaName === 'Account' ? ['accountName', 'rootType'] : []),
          ...(schemaName === 'Party' ? ['partyName'] : []),
        ]),
      ].filter(Boolean);

      const orderBy =
        schemaName === 'Account'
          ? 'accountName'
          : schemaName === 'Party'
          ? 'partyName'
          : schema.titleField || 'name';

      const results = await fyo.db.getAll(schemaName, {
        filters,
        fields,
        orderBy,
        order: 'asc',
      });

      if (schemaName === 'Party') {
        const map = await getPartyNameMap(
          fyo,
          results.map((r) => r.name).filter(Boolean)
        );
        const options = results
          .map((r) => {
            const label = partyLabel(map, r.name);
            if (!label || isUuidDocId(label)) {
              return null;
            }
            const option = { label, value: r.name };
            if (this.df.groupBy) {
              option.group = r[this.df.groupBy];
            }
            return option;
          })
          .filter(Boolean)
          .sort((a, b) =>
            String(a.label).localeCompare(String(b.label), undefined, {
              sensitivity: 'base',
            })
          );
        this.resultsFilterKey = filterKey;
        return (this.results = options);
      }

      const options = results
        .map((r) => {
          const label =
            schemaName === 'Account'
              ? accountDisplayName({
                  name: r.name,
                  accountName: r.accountName,
                })
              : r[schema.titleField];
          const option = { label, value: r.name };
          if (schemaName === 'Account' && r.rootType) {
            // Mixed account-type pickers (register Category): group by
            // root type, then A–Z within the group (QBD-style).
            option.group = r.rootType;
          } else if (this.df.groupBy) {
            option.group = r[this.df.groupBy];
          }
          return option;
        })
        .filter(Boolean)
        .sort((a, b) => {
          const groupCmp = String(a.group || '').localeCompare(
            String(b.group || ''),
            undefined,
            { sensitivity: 'base' }
          );
          if (groupCmp !== 0) {
            return groupCmp;
          }
          return String(a.label).localeCompare(String(b.label), undefined, {
            sensitivity: 'base',
          });
        });
      this.resultsFilterKey = filterKey;
      return (this.results = options);
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

      if (this.df.create) {
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
      this.resultsFilterKey = '';
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

      // focInp is a one-shot focus quirk: clear the flag and fall through so
      // empty / first keystroke still refreshes suggestions and reopens the list.
      if (this.focInp) {
        this.focInp = false;
      }

      const keyword = e.target.value ?? '';
      this.setLinkValue(keyword, true);
      this.updateSuggestions(keyword);
      toggleDropdown(true);
    },
    async onBlur(label, toggleDropdown) {
      if (this.selecting) {
        return;
      }
      this.isFocused = false;
      this.isDropdownOpen = false;
      if (toggleDropdown) {
        toggleDropdown(false);
      }

      if (!label && !this.value) {
        return;
      }
      // Empty display with a committed value (focus race / remount) — restore
      // label only. Never clear the parent; that made Check Register's bank
      // picker reset when focus moved to Filter or elsewhere.
      if (!label) {
        await this.setLinkValue(this.value);
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
        // Already committed on select — refresh label only (same as empty-label
        // path). Parent setSuggestion always re-emits and reloads parents.
        if (match.value === this.value) {
          await this.setLinkValue(this.value);
          return;
        }
        this.setSuggestion(match);
        return;
      }

      // No real option — restore committed value; do not link a phantom name.
      await this.setLinkValue(this.value);
    },
    quickAddPartyRole() {
      const roleFilter = this.df?.filters?.role;
      if (Array.isArray(roleFilter) && roleFilter[0] === 'in') {
        const roles = roleFilter[1];
        if (Array.isArray(roles)) {
          const hasSupplier = roles.includes('Supplier');
          const hasCustomer = roles.includes('Customer');
          if (hasSupplier && !hasCustomer) {
            return 'Supplier';
          }
          if (hasCustomer && !hasSupplier) {
            return 'Customer';
          }
        }
      }
      return 'Both';
    },
    async quickAddParty() {
      const typed = String(this.linkValue || '').trim();
      if (!typed || isUuidDocId(typed)) {
        const { showToast } = await import('src/utils/interactive');
        showToast({
          type: 'warning',
          message: t`Type a payee name to Quick Add.`,
        });
        return;
      }

      const { showDialog } = await import('src/utils/interactive');
      const ok = await showDialog({
        title: t`Name not found`,
        detail: t`Quick Add "${typed}" as a payee?`,
        type: 'info',
        buttons: [
          { label: t`Cancel`, action: () => false, isEscape: true },
          { label: t`Quick Add`, action: () => true, isPrimary: true },
        ],
      });
      if (!ok) {
        return;
      }

      const role = this.quickAddPartyRole();
      const doc = fyo.doc.getNewDoc('Party', {
        partyName: typed,
        role,
      });
      await doc.sync();
      this.results = [];
      this.resultsFilterKey = '';
      this.triggerChange(doc.name);
      await this.setLinkValue(doc.name);
    },
    async openNewDoc() {
      // Standalone Links (Write Entry) have no parent Doc — Quick Add with a
      // confirm, not silent create and not the full Party form.
      if (this.df.target === 'Party' && !this.doc) {
        await this.quickAddParty();
        return;
      }

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
        this.resultsFilterKey = '';
        this.$router.back();
      });
    },
    async getCreateFilters() {
      const { schemaName, fieldname } = this.df;
      const getCreateFilters =
        fyo.models[schemaName]?.createFilters?.[fieldname];
      let createFilters = await getCreateFilters?.(this.doc);

      if (createFilters !== undefined) {
        if (this.df.target === 'Account') {
          delete createFilters.accountType;
        }
        return createFilters;
      }

      const filters = (await this.getFilters()) ?? {};
      const result = getCreateFiltersFromListViewFilters(filters);
      if (this.df.target === 'Account') {
        delete result.accountType;
      }
      return result;
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
