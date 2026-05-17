import { Fyo } from 'fyo';
import NumberSeries from 'fyo/models/NumberSeries';
import { DEFAULT_SERIES_START } from 'fyo/utils/consts';
import { BaseError } from 'fyo/utils/errors';
import { generateDocId } from 'utils/ids';
import { isUuidIdentityComplete } from 'utils/ids/uuidIdentityState';
import { getRandomString } from 'utils';
import { Doc } from './doc';

export function isNameAutoSet(schemaName: string, fyo: Fyo): boolean {
  const schema = fyo.schemaMap[schemaName]!;
  if (schema.naming === 'manual') {
    return false;
  }

  if (
    schema.naming === 'autoincrement' ||
    schema.naming === 'uuid' ||
    schema.naming === 'random'
  ) {
    return true;
  }

  const numberSeries = fyo.getField(schema.name, 'numberSeries');
  if (numberSeries) {
    return true;
  }

  return false;
}

async function uuidIdentityActive(fyo: Fyo): Promise<boolean> {
  const knex = fyo.db.knex as import('knex').Knex | undefined;
  return await isUuidIdentityComplete(knex);
}

export async function setName(doc: Doc, fyo: Fyo) {
  if (doc.schema.naming === 'manual') {
    return;
  }

  const useUuid = await uuidIdentityActive(fyo);

  if (doc.schema.naming === 'autoincrement' && !useUuid) {
    return (doc.name = await getNextId(doc.schemaName, fyo));
  }

  if (
    doc.schema.naming === 'uuid' ||
    (doc.schema.naming === 'autoincrement' && useUuid)
  ) {
    doc.name = generateDocId();
    return doc.name;
  }

  if (doc.numberSeries !== undefined) {
    const seriesName = await getSeriesNext(
      doc.numberSeries as string,
      doc.schemaName,
      fyo
    );
    if (useUuid) {
      (doc as Doc & { documentNumber?: string }).documentNumber = seriesName;
      doc.name = generateDocId();
      return doc.name;
    }
    return (doc.name = seriesName);
  }

  if (doc.schema.isSingle) {
    return (doc.name = doc.schemaName);
  }

  if (!doc.name) {
    doc.name = useUuid ? generateDocId() : getRandomString();
  }

  return doc.name;
}

export async function getNextId(schemaName: string, fyo: Fyo): Promise<string> {
  const lastInserted = await fyo.db.getLastInserted(schemaName);
  return String(lastInserted + 1).padStart(9, '0');
}

export async function getSeriesNext(
  prefix: string,
  schemaName: string,
  fyo: Fyo
) {
  let series: NumberSeries;

  try {
    series = (await fyo.doc.getDoc('NumberSeries', prefix)) as NumberSeries;
  } catch (e) {
    const { statusCode } = e as BaseError;
    if (!statusCode || statusCode !== 404) {
      throw e;
    }

    await createNumberSeries(prefix, schemaName, DEFAULT_SERIES_START, fyo);
    series = (await fyo.doc.getDoc('NumberSeries', prefix)) as NumberSeries;
  }

  return await series.next(schemaName);
}

export async function createNumberSeries(
  prefix: string,
  referenceType: string,
  start: number,
  fyo: Fyo
) {
  const exists = await fyo.db.exists('NumberSeries', prefix);
  if (exists) {
    return;
  }

  const series = fyo.doc.getNewDoc('NumberSeries', {
    name: prefix,
    start,
    referenceType,
  });

  await series.sync();
}
