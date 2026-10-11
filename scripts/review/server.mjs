import { mkdir, copyFile, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
const root = process.cwd();
const fixture = resolve(root, 'scripts/review/.fixture');
await mkdir(fixture, { recursive: true });
for (const name of ['node_modules', '.next', 'supabase']) {
  try {
    await symlink(resolve(root, name), resolve(fixture, name), 'junction');
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
}
for (const name of ['package.json', 'next.config.mjs'])
  await copyFile(resolve(root, name), resolve(fixture, name));
const child = spawn(
  process.execPath,
  [
    resolve(root, 'node_modules/next/dist/bin/next'),
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    '3001',
  ],
  {
    cwd: fixture,
    stdio: 'inherit',
    env: {
      ...process.env,
      APP_MODE: 'demo',
      NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3001',
      WHATSAPP_ENABLED: 'false',
      DEMO_ADMIN_SECRET: 'review-local-password-only',
      CRON_SECRET: 'review-local-cron-secret-not-production',
      BRAND_NAME: 'Review demo',
      HOST_NAME: 'Review host',
    },
  },
);
process.on('SIGINT', () => child.kill());
child.on('exit', (code) => process.exit(code || 0));
