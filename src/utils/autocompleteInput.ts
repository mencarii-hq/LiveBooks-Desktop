/**
 * Shared AutoComplete / Link / MultiLabelLink input contract.
 * Empty is a keyword (full option list); blur owns commit — never triggerChange('').
 */
export function autocompleteInputKeyword(value: unknown): string {
  return value == null ? '' : String(value);
}

export function autocompleteOnInput(raw: unknown): {
  keyword: string;
  openDropdown: boolean;
} {
  return {
    keyword: autocompleteInputKeyword(raw),
    openDropdown: true,
  };
}

export function filterAutocompleteSuggestions<T extends { label: string }>(
  options: T[],
  keyword: string
): T[] {
  const k = autocompleteInputKeyword(keyword).toLowerCase();
  if (!k) {
    return [...options];
  }
  return options.filter((item) => item.label.toLowerCase().includes(k));
}
