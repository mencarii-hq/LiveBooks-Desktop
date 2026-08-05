import { SchemaStub } from 'schemas/types';
import CanadianSchemas from './ca';
import IndianSchemas from './in';
import SwissSchemas from './ch';
import UsSchemas from './us';

/**
 * Regional Schemas are exported by country code.
 */
export default {
  ca: CanadianSchemas,
  ch: SwissSchemas,
  in: IndianSchemas,
  us: UsSchemas,
} as Record<string, SchemaStub[]>;
