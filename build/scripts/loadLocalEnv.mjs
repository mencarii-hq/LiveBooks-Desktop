import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

/** Load gitignored local env before baking origins / notarize teamId. */
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const name of ['.env.local', '.env', '.env.publish']) {
  dotenv.config({ path: path.join(root, name) });
}
