import type { LanguageMap } from 'utils/types';

type LocaleModule = () => Promise<{ default: LanguageMap }>;

// Vite's import.meta.glob is untyped in TypeScript.
// eslint-disable-next-line @typescript-eslint/no-unsafe-call -- Vite import.meta.glob
const localeModules = import.meta.glob('../generated/locales/*.ts') as Record<
  string,
  LocaleModule
>;

/** Load one locale chunk (not the full 19-locale bundle). */
export async function getBundledLanguageMap(
  code: string
): Promise<LanguageMap | undefined> {
  const key = `../generated/locales/${code}.ts`;
  const loader = localeModules[key];
  if (!loader) {
    return undefined;
  }

  const mod = await loader();
  return mod.default;
}
