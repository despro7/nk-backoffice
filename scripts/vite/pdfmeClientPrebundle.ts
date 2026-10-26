import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import type { Plugin } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'package.json'));
const cacheDir = path.join(root, 'node_modules/.cache/pdfme-client-bundle');
const stubPath = path.join(root, 'client/shims/pdfmeConverterBrowserStub.ts');

const ENTRIES = {
  ui: { pkg: '@pdfme/ui', file: 'ui.js' },
  schemas: { pkg: '@pdfme/schemas', file: 'schemas.js' },
} as const;

function pkgVersion(name: string): string {
  const entry = require.resolve(name);
  const pkgRoot = entry.includes(`${path.sep}dist${path.sep}`)
    ? entry.slice(0, entry.indexOf(`${path.sep}dist${path.sep}`))
    : path.dirname(entry);
  const parsed = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8')) as {
    version?: string;
  };
  return parsed.version ?? '0';
}

function cacheKey(): string {
  const stubStat = fs.statSync(stubPath);
  return createHash('sha1')
    .update(
      JSON.stringify({
        ui: pkgVersion('@pdfme/ui'),
        schemas: pkgVersion('@pdfme/schemas'),
        common: pkgVersion('@pdfme/common'),
        stub: stubStat.mtimeMs,
      }),
    )
    .digest('hex');
}

async function ensureBundle(entryPkg: string, outfile: string, key: string): Promise<void> {
  const stamp = `${outfile}.key`;
  if (fs.existsSync(outfile) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === key) {
    return;
  }
  fs.mkdirSync(cacheDir, { recursive: true });
  await esbuild.build({
    absWorkingDir: root,
    entryPoints: [require.resolve(entryPkg)],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile,
    legalComments: 'none',
    logLevel: 'silent',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    alias: {
      '@pdfme/converter': stubPath,
    },
  });
  fs.writeFileSync(stamp, key);
}

/** Один esbuild-бандл замість розбору @pdfme/* + zod у Rollup (жовті INVALID_ANNOTATION і довгий build). */
export function pdfmeClientPrebundle(): Plugin {
  const uiFile = path.join(cacheDir, ENTRIES.ui.file);
  const schemasFile = path.join(cacheDir, ENTRIES.schemas.file);
  return {
    name: 'pdfme-client-prebundle',
    apply: 'build',
    enforce: 'pre',
    async buildStart() {
      const key = cacheKey();
      await ensureBundle(ENTRIES.ui.pkg, uiFile, key);
      await ensureBundle(ENTRIES.schemas.pkg, schemasFile, key);
    },
    resolveId(id) {
      if (id === '@pdfme/ui') return { id: uiFile, moduleSideEffects: 'no-treeshake' };
      if (id === '@pdfme/schemas') return { id: schemasFile, moduleSideEffects: 'no-treeshake' };
      return null;
    },
  };
}

export function suppressClientBuildNoise(
  warning: { code?: string; message?: string },
  warn: (warning: { code?: string; message?: string }) => void,
): void {
  if (warning.code === 'INVALID_ANNOTATION') return;
  warn(warning);
}
