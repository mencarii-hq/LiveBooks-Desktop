import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Load gitignored local env before baking origins / notarize teamId.
 * Do not load `.env.publish` here — that file holds signing/notarize secrets
 * and is sourced explicitly by publish scripts / CI. Loading it on every
 * `yarn build` made `--nosign` still sign + notarize.
 */
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const name of ['.env.local', '.env']) {
  dotenv.config({ path: path.join(root, name) });
}
