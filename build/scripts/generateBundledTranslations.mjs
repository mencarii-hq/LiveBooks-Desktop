/**
 * Embeds translations/*.csv into src/generated/locales/{code}.ts for
 * bundle-only i18n. One locale per chunk so dev/prod only load the active language.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prettier from 'prettier';
import { parseCSV } from '../../utils/csvParser';

const prettierOpts = {
  parser: 'typescript',
  semi: true,
  singleQuote: true,
  trailingComma: 'es5',
};

function formatTs(source) {
  return prettier.format(source, prettierOpts);
}

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dirname, '..', '..');
const translationsDir = path.join(root, 'translations');
const localesDir = path.join(root, 'src', 'generated', 'locales');

function csvToLanguageMap(csv) {
  const matrix = parseCSV(csv);
  const languageMap = {};
  for (const row of matrix) {
    if (!row[0] || !row[1]) {
      continue;
    }
    const source = row[0];
    const translation = row[1];
    const context = row[3];
    languageMap[source] = { translation };
    if (context?.length) {
      languageMap[source].context = context;
    }
  }
  return languageMap;
}

function readCsvBody(filePath) {
  let text = fs.readFileSync(filePath, 'utf-8');
  const firstLine = text.split('\n')[0]?.trim() ?? '';
  if (/^\d{4}-\d{2}-\d{2}T/.test(firstLine)) {
    text = text.slice(text.indexOf('\n') + 1);
  }
  return text;
}

function main() {
  const files = fs
    .readdirSync(translationsDir)
    .filter((f) => f.endsWith('.csv'));

  fs.mkdirSync(localesDir, { recursive: true });

  const codes = [];
  const header =
    "/* eslint-disable */\n/* Auto-generated — do not edit. */\nimport type { LanguageMap } from 'utils/types';\n\n";

  for (const file of files) {
    const code = file.replace(/\.csv$/, '');
    codes.push(code);
    const body = readCsvBody(path.join(translationsDir, file));
    const map = csvToLanguageMap(body);
    const outFile = path.join(localesDir, `${code}.ts`);
    const contents = formatTs(
      `${header}const languageMap: LanguageMap = ${JSON.stringify(map, null, 2)};\n\nexport default languageMap;\n`
    );
    fs.writeFileSync(outFile, contents, 'utf-8');
  }

  const indexHeader = formatTs(
    `/* eslint-disable */\n/* Auto-generated — do not edit. */\n\nexport const bundledLocaleCodes = ${JSON.stringify(codes.sort(), null, 2)} as const;\n`
  );
  fs.writeFileSync(path.join(localesDir, 'index.ts'), indexHeader, 'utf-8');

  const legacyMonolith = path.join(
    root,
    'src',
    'generated',
    'bundledLanguageMaps.ts'
  );
  if (fs.existsSync(legacyMonolith)) {
    fs.unlinkSync(legacyMonolith);
  }

  console.log(
    `Wrote ${codes.length} locale chunks to ${path.relative(root, localesDir)}`
  );
}

main();
