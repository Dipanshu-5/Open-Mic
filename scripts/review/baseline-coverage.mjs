import { mkdir, writeFile, symlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
const fixture = resolve('scripts/review/.baseline');
await mkdir(fixture, { recursive: true });
const files = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter(
    (f) =>
      /^(lib|tests|app|supabase)\//.test(f) ||
      ['vitest.config.mjs', 'package.json', 'next.config.mjs'].includes(f),
  );
for (const file of files) {
  const dest = resolve(fixture, file);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, execFileSync('git', ['show', `HEAD:${file}`]));
}
try {
  await symlink(
    resolve('node_modules'),
    resolve(fixture, 'node_modules'),
    'junction',
  );
} catch (e) {
  if (e.code !== 'EEXIST') throw e;
}
const child = spawn(
  process.execPath,
  [
    resolve('node_modules/vitest/vitest.mjs'),
    'run',
    '--coverage',
    '--coverage.reportsDirectory=' + resolve('scripts/review/coverage-before'),
    '--coverage.include=lib/**',
    '--coverage.reporter=text',
    '--coverage.reporter=json-summary',
  ],
  { cwd: fixture, stdio: 'inherit', env: { ...process.env, APP_MODE: 'demo' } },
);
child.on('exit', (code) => process.exit(code || 0));
