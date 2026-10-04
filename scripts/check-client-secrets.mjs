import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const secrets = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'HMS_APP_SECRET',
  'WHATSAPP_TOKEN',
  'RESEND_API_KEY',
  'TURNSTILE_SECRET_KEY',
  'UPSTASH_REDIS_REST_TOKEN',
  'CRON_SECRET',
  'BOOKING_LINK_ENCRYPTION_KEY',
  'DEMO_ADMIN_SECRET',
];
const values = secrets
  .map((key) => process.env[key])
  .filter((value) => value && value.length >= 8);
const forbidden = [...secrets, ...values];

async function scan(directory) {
  let files;
  try {
    files = await readdir(directory, { withFileTypes: true });
  } catch {
    throw new Error('Client build output is missing. Run npm run build first.');
  }
  for (const file of files) {
    const path = join(directory, file.name);
    if (file.isDirectory()) {
      await scan(path);
      continue;
    }
    if (!/\.(js|json|map)$/.test(file.name)) continue;
    const content = await readFile(path, 'utf8');
    if (forbidden.some((value) => content.includes(value))) {
      // Do not print the matched value, since it could be a credential.
      throw new Error(
        `Potential server secret found in client output: ${path}`,
      );
    }
  }
}

await scan('.next/static');
console.info('Client bundle secret scan passed.');
