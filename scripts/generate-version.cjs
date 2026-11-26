/**
 * Генерує public/version.json (версія, git-хеш, timestamp, останні релізи) перед білдом.
 * Використовується в npm run build:client як pre-step.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getGitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

const root = path.join(__dirname, '..');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

const version = {
  version: readJson('package.json').version,
  hash: getGitHash(),
  builtAt: Date.now(),
  // Для «Що змінилось» у банері: відкрита вкладка ще має старий bundle.
  releases: readJson('shared/releaseNotes.json').releases.slice(0, 5),
};

const outputPath = path.join(__dirname, '..', 'public', 'version.json');
fs.writeFileSync(outputPath, JSON.stringify(version, null, 2), 'utf8');

console.log(`✅ version.json згенеровано: version=${version.version}, hash=${version.hash}, builtAt=${new Date(version.builtAt).toISOString()}`);
