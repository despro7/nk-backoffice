/**
 * Генерує public/version.json з git-хешем і timestamp перед білдом.
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

const version = {
  hash: getGitHash(),
  builtAt: Date.now(),
};

const outputPath = path.join(__dirname, '..', 'public', 'version.json');
fs.writeFileSync(outputPath, JSON.stringify(version, null, 2), 'utf8');

console.log(`✅ version.json згенеровано: hash=${version.hash}, builtAt=${new Date(version.builtAt).toISOString()}`);
