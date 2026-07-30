import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'dist-share');

fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(root, 'fence-fable.html'), path.join(out, 'index.html'));
console.log('Built dist-share/index.html');
