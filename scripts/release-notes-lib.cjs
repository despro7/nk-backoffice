/**
 * Чиста логіка релізів: перевірка shared/releaseNotes.json і вибір версії.
 * Використовується scripts/release.cjs і spec-тестом.
 */

const ITEM_TYPES = ['new', 'improved', 'fixed'];
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateItems(items, where, errors) {
  if (!Array.isArray(items)) {
    errors.push(`${where}: має бути масивом`);
    return;
  }
  items.forEach((item, index) => {
    const at = `${where}[${index}]`;
    if (!item || typeof item !== 'object') {
      errors.push(`${at}: має бути обʼєктом`);
      return;
    }
    if (!ITEM_TYPES.includes(item.type)) {
      errors.push(`${at}.type: очікується ${ITEM_TYPES.join(' | ')}`);
    }
    if (typeof item.text !== 'string' || !item.text.trim()) {
      errors.push(`${at}.text: порожній текст`);
    }
    if (item.permission !== undefined && !/^(page|action)\.\S+$/.test(String(item.permission))) {
      errors.push(`${at}.permission: очікується ключ page.* або action.*`);
    }
  });
}

/** Повертає список помилок (порожній, якщо все гаразд). */
function validateReleaseNotes(notes) {
  const errors = [];
  if (!notes || typeof notes !== 'object') return ['releaseNotes: має бути обʼєктом'];

  validateItems(notes.unreleased, 'unreleased', errors);

  if (!Array.isArray(notes.releases)) {
    errors.push('releases: має бути масивом');
    return errors;
  }
  notes.releases.forEach((release, index) => {
    const at = `releases[${index}]`;
    if (!VERSION_RE.test(String(release?.version))) errors.push(`${at}.version: очікується X.Y.Z`);
    if (!DATE_RE.test(String(release?.date))) errors.push(`${at}.date: очікується YYYY-MM-DD`);
    validateItems(release?.items, `${at}.items`, errors);

    const previous = notes.releases[index - 1];
    if (previous && compareVersions(previous.version, release?.version) <= 0) {
      errors.push(`${at}.version: релізи мають йти від нових до старих`);
    }
  });
  return errors;
}

function compareVersions(a, b) {
  const left = String(a).split('.').map(Number);
  const right = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** major лише з явним прапорцем; є пункт `new` → minor; інакше patch. */
function nextVersion(current, items, { major = false } = {}) {
  if (!VERSION_RE.test(current)) throw new Error(`Некоректна поточна версія: ${current}`);
  const [x, y, z] = current.split('.').map(Number);
  if (major) return `${x + 1}.0.0`;
  if (items.some((item) => item.type === 'new')) return `${x}.${y + 1}.0`;
  return `${x}.${y}.${z + 1}`;
}

/** Переносить unreleased у новий реліз на початку списку. */
function applyRelease(notes, version, date) {
  return {
    unreleased: [],
    releases: [{ version, date, items: notes.unreleased }, ...notes.releases],
  };
}

module.exports = { validateReleaseNotes, compareVersions, nextVersion, applyRelease };
