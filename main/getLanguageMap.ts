/**
 * Load packaged translation CSV files (no GitHub fetch at runtime).
 * Renderer boot uses per-locale chunks from src/generated/locales/.
 */

import { constants } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { parseCSV } from 'utils/csvParser';
import { LanguageMap } from 'utils/types';

export async function getLanguageMap(code: string): Promise<LanguageMap> {
  const contents = await getContentsIfExists(code);
  if (!contents.length) {
    throw new Error(`Could not load translations for '${code}'.`);
  }

  return getMapFromCsv(stripLeadingTimestamp(contents));
}

function stripLeadingTimestamp(contents: string): string {
  const firstLine = contents.split('\n')[0]?.trim() ?? '';
  if (/^\d{4}-\d{2}-\d{2}T/.test(firstLine)) {
    return contents.slice(contents.indexOf('\n') + 1);
  }

  return contents;
}

function getMapFromCsv(csv: string): LanguageMap {
  const matrix = parseCSV(csv);
  const languageMap: LanguageMap = {};

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

async function getContentsIfExists(code: string): Promise<string> {
  const filePath = await getTranslationFilePath(code);
  if (!filePath) {
    return '';
  }

  return await fs.readFile(filePath, { encoding: 'utf-8' });
}

async function getTranslationFilePath(code: string) {
  let filePath = path.join(
    process.resourcesPath,
    `../translations/${code}.csv`
  );

  try {
    await fs.access(filePath, constants.R_OK);
  } catch {
    filePath = path.join(__dirname, `../../translations/${code}.csv`);
  }

  try {
    await fs.access(filePath, constants.R_OK);
  } catch {
    return '';
  }

  return filePath;
}
