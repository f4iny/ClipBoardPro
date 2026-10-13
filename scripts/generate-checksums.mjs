import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const releaseDir = path.resolve(__dirname, '..', 'release');

if (!fs.existsSync(releaseDir)) {
  console.error(`Release directory not found at: ${releaseDir}`);
  process.exit(1);
}

const entries = fs.readdirSync(releaseDir, { withFileTypes: true });
const targetExtensions = ['.exe', '.zip', '.7z', '.AppImage', '.dmg'];
const ignoredNames = ['builder-debug.yml', 'builder-effective-config.yaml'];

const filesToHash = entries
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => {
    if (ignoredNames.includes(name)) return false;
    if (name.endsWith('.blockmap')) return false;
    if (name === 'SHA256SUMS.txt') return false;
    return targetExtensions.some((ext) => name.endsWith(ext));
  })
  .sort();

if (filesToHash.length === 0) {
  console.log('No release binaries found to hash in release directory.');
  process.exit(0);
}

const results = [];

console.log('Generating SHA256 checksums...');
for (const fileName of filesToHash) {
  const filePath = path.join(releaseDir, fileName);
  const fileBuffer = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const line = `${hash}  ${fileName}`;
  results.push(line);
  console.log(`  ${line}`);
}

const outputPath = path.join(releaseDir, 'SHA256SUMS.txt');
fs.writeFileSync(outputPath, results.join('\n') + '\n', 'utf8');
console.log(`\nSuccessfully wrote ${results.length} checksum(s) to ${outputPath}`);
