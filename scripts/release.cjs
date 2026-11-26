/**
 * Випуск версії: переносить shared/releaseNotes.json `unreleased` у новий реліз,
 * піднімає версію в package.json, робить commit і тег.
 * Usage: npm run release [-- --major] [-- --dry-run]
 *   --major    X+1.0.0 (лише за явним рішенням)
 *   --dry-run  показати наступну версію, нічого не змінювати
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { validateReleaseNotes, compareVersions, nextVersion, applyRelease } = require('./release-notes-lib.cjs');

const ROOT = path.join(__dirname, '..');
const NOTES_PATH = 'shared/releaseNotes.json';
const RELEASE_FILES = [NOTES_PATH, 'package.json', 'package-lock.json'];

function fail(message) {
  console.error(`RELEASE FAILED: ${message}`);
  process.exit(1);
}

function run(command, args) {
  return execFileSync(command, args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

/** Локальна дата YYYY-MM-DD за Києвом. */
function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());
}

function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg !== '--major' && arg !== '--dry-run');
  if (unknown.length) fail(`невідомі параметри: ${unknown.join(' ')}`);
  const major = args.includes('--major');
  const dryRun = args.includes('--dry-run');

  const notes = readJson(NOTES_PATH);
  const errors = validateReleaseNotes(notes);
  if (errors.length) fail(`${NOTES_PATH}:\n  ${errors.join('\n  ')}`);
  if (notes.unreleased.length === 0) fail(`у ${NOTES_PATH} порожній "unreleased", випускати нічого`);

  const current = readJson('package.json').version;
  const version = nextVersion(current, notes.unreleased, { major });
  const latest = notes.releases[0]?.version;
  if (latest && compareVersions(version, latest) <= 0) {
    fail(`нова версія ${version} не новіша за останній реліз ${latest}`);
  }

  console.log(`${current} -> ${version} (пунктів: ${notes.unreleased.length})`);
  for (const item of notes.unreleased) console.log(`  [${item.type}] ${item.text}`);
  if (dryRun) {
    console.log('Dry run: нічого не змінено.');
    return;
  }

  // Чужі незакомічені зміни не повинні потрапити в release-коміт.
  const dirty = run('git', ['status', '--porcelain', '--', ...RELEASE_FILES]);
  if (dirty) fail(`спершу закомітьте зміни:\n${dirty}`);
  if (run('git', ['diff', '--cached', '--name-only'])) fail('в індексі є підготовлені зміни');
  const tag = `v${version}`;
  if (run('git', ['tag', '--list', tag])) fail(`тег ${tag} вже існує`);

  run('npm', ['version', version, '--no-git-tag-version']);
  fs.writeFileSync(
    path.join(ROOT, NOTES_PATH),
    `${JSON.stringify(applyRelease(notes, version, today()), null, 2)}\n`,
  );

  run('git', ['add', '--', ...RELEASE_FILES]);
  run('git', ['commit', '-m', `chore(release): ${tag}`, '--', ...RELEASE_FILES]);
  // Анотований тег: лише такі відправляє `git push --follow-tags`.
  run('git', ['tag', '-a', tag, '-m', tag]);
  console.log(`Готово: коміт і тег ${tag}. Відправити: git push --follow-tags`);
}

main();
