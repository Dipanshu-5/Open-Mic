export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { readEnv } = await import('./lib/env.js');
    readEnv();
  }
}
