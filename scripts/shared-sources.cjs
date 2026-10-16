// Development-only synchronization. The deployed worker never reads the API checkout.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const manifestFile = path.join(root, 'shared-sources.json');
const manifest = JSON.parse(fs.readFileSync(manifestFile));
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const mode = process.argv[2];
if (!['check', 'sync'].includes(mode)) throw new Error('Use check or sync');
for (const relative of Object.keys(manifest)) {
  const target = path.join(root, 'src/shared', relative);
  if (mode === 'sync') {
    const source = path.resolve(root, '../Play4CashApi/src', relative);
    const data = fs.readFileSync(source);
    fs.writeFileSync(target, data);
    manifest[relative] = hash(data);
  } else {
    if (hash(fs.readFileSync(target)) !== manifest[relative]) throw new Error(`Shared source changed: ${relative}`);
    const source = path.resolve(root, '../Play4CashApi/src', relative);
    if (fs.existsSync(source) && hash(fs.readFileSync(source)) !== manifest[relative]) {
      throw new Error(`API and worker differ: ${relative}; review and run npm run sync:shared`);
    }
  }
}
if (mode === 'sync') fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
console.log(`${mode}: ${Object.keys(manifest).length} shared financial sources verified`);
