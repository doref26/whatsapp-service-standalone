import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

for (const name of ['.wwebjs_auth', '.wwebjs_cache']) {
  const p = path.join(root, name);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
    console.log('Removed', p);
  } else {
    console.log('Already absent:', p);
  }
}
