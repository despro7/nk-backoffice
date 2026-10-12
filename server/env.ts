/**
 * Завантаження .env з кореня репозиторію (поруч із package.json).
 * Не залежить від process.cwd() — важливо для PM2 reload з іншої директорії.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

function resolveProjectRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));

  for (let i = 0; i < 10; i += 1) {
    if (existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return process.cwd();
}

const root = resolveProjectRoot();
const envPath = path.join(root, '.env');

const result = dotenv.config({ path: envPath });

if (!process.env.DATABASE_URL) {
  const exists = existsSync(envPath);
  const parseHint = result.error ? result.error.message : 'ok';
  console.error(
    `[env] DATABASE_URL відсутній після завантаження .env (path=${envPath}, exists=${exists}, parse=${parseHint}, cwd=${process.cwd()})`,
  );
}
