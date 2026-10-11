import { symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
// Isolated audit dependency; no application manifest or lockfile changes.
try {
  await symlink(
    resolve('scripts/review/node_modules/@vitest/coverage-v8'),
    resolve('node_modules/@vitest/coverage-v8'),
    'junction',
  );
} catch (e) {
  if (e.code !== 'EEXIST') throw e;
}
const child = spawn(
  process.execPath,
  [
    'node_modules/vitest/vitest.mjs',
    'run',
    '--coverage',
    '--coverage.reportsDirectory=scripts/review/coverage',
    '--coverage.include=lib/**',
    '--coverage.reporter=text',
    '--coverage.reporter=json-summary',
  ],
  { stdio: 'inherit' },
);
child.on('exit', (code) => process.exit(code || 0));
