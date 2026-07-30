import fs from 'node:fs';
import path from 'node:path';

const source = process.argv[2];
const namespaceId = String(process.env.CLOUDFLARE_KV_NAMESPACE_ID || '').trim();
const placeholder = 'REPLACE_WITH_KV_NAMESPACE_ID';
const output = 'wrangler.share.ci.jsonc';

if (!source || !fs.existsSync(source)) {
  console.error('Usage: node scripts/configure-share-worker.mjs <wrangler-config>');
  process.exit(1);
}
if (!/^[a-f0-9]{32}$/i.test(namespaceId)) {
  console.error('CLOUDFLARE_KV_NAMESPACE_ID must be a 32-character hexadecimal namespace id.');
  process.exit(1);
}

const config = fs.readFileSync(source, 'utf8');
if (!config.includes(placeholder)) {
  console.error(`${source} does not contain the expected KV namespace placeholder.`);
  process.exit(1);
}
fs.writeFileSync(path.resolve(output), config.replace(placeholder, namespaceId));
console.log(`Configured ${output} from ${source}.`);
