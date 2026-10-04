import { randomBytes } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';

try {
  await access('.env.local');
  console.info(
    '.env.local already exists; existing configuration was preserved.',
  );
} catch {
  const example = await readFile('.env.example', 'utf8');
  const configured = example
    .replace(
      /^DEMO_ADMIN_SECRET=$/m,
      `DEMO_ADMIN_SECRET=${randomBytes(24).toString('base64url')}`,
    )
    .replace(
      /^CRON_SECRET=$/m,
      `CRON_SECRET=${randomBytes(32).toString('base64url')}`,
    );
  await writeFile('.env.local', configured, { flag: 'wx' });
  console.info(
    'Local demo configured. The host password is stored in ignored .env.local as DEMO_ADMIN_SECRET.',
  );
}
