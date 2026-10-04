import 'server-only';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { readEnv } from './env.js';

/** @typedef {{ id: string, request_key: string, plan_id: string, call_mode: 'video'|'audio', duration_minutes: number, amount_in_paise: number, currency: string, start_time: string, end_time: string, caller_name: string, caller_email: string, caller_phone: string|null, whatsapp_opt_in: boolean, status: string, held_until: string, razorpay_order_id: string|null, razorpay_payment_id: string|null, razorpay_refund_id: string|null, hms_room_id: string|null, access_token_hash: string, encrypted_token: string, session_outcome: string|null }} Booking */
/** @typedef {{ rpc: (name: string, args?: Record<string,unknown>) => Promise<unknown>, rows: (table: string, filters?: Record<string,unknown>) => Promise<Record<string,unknown>[]>, insert: (table: string, data: Record<string,unknown>, conflict?: string) => Promise<void>, update: (table: string, id: Record<string,unknown>, data: Record<string,unknown>) => Promise<void> }} Repository */

/** @type {{ demoDb?: Promise<import('@electric-sql/pglite').PGlite> }} */
const state =
  /** @type {{ demoDb?: Promise<import('@electric-sql/pglite').PGlite> }} */ (
    /** @type {unknown} */ (globalThis)
  );
const tables = new Set([
  'plans',
  'availability_windows',
  'bookings',
  'payment_events',
  'refund_operations',
  'notifications',
  'audit_log',
]);
const functions = new Set([
  'expire_stale_holds',
  'available_starts',
  'reserve_booking',
  'attach_order',
  'release_booking',
  'enqueue_message',
  'queue_refund',
  'confirm_booking',
  'cancel_booking',
  'create_windows_batch',
  'delete_window',
  'claim_notifications',
  'claim_refunds',
  'finish_notification',
  'finish_refund',
  'set_outcome',
  'resend_confirmation',
  'purge_old_data',
  'reconciliation_candidates',
  'pending_payment_events',
  'submitted_refunds',
  'claim_order_creation',
]);

/** @param {string} identifier */
function safeIdentifier(identifier) {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier))
    throw new Error('Invalid database identifier.');
  return `"${identifier}"`;
}

export async function getDemoDatabase() {
  if (!state.demoDb)
    state.demoDb = (async () => {
      const { PGlite } = await import('@electric-sql/pglite');
      const { btree_gist } =
        await import('@electric-sql/pglite/contrib/btree_gist');
      await mkdir(join(process.cwd(), '.demo'), { recursive: true });
      const db = new PGlite(join(process.cwd(), '.demo', 'postgres'), {
        extensions: { btree_gist },
      });
      await db.waitReady;
      const exists = await db.query(
        "select to_regclass('public.bookings') exists",
      );
      await db.exec(
        'create table if not exists demo_migrations(name text primary key);',
      );
      if (!exists.rows[0]?.exists) {
        await db.exec(
          'create role anon; create role authenticated; create role service_role bypassrls;',
        );
        await db.exec(
          await readFile(
            join(process.cwd(), 'supabase/migrations/0001_init.sql'),
            'utf8',
          ),
        );
        await db.exec(
          await readFile(
            join(process.cwd(), 'supabase/migrations/0002_workers.sql'),
            'utf8',
          ),
        );
        await db.exec(
          await readFile(join(process.cwd(), 'supabase/seed.sql'), 'utf8'),
        );
        await db.exec(
          "insert into demo_migrations(name) values('0001_init.sql'),('0002_workers.sql');",
        );
      }
      // Upgrade pre-migration-tracking demos without replaying their existing schema.
      if (exists.rows[0]?.exists)
        await db.exec(
          "insert into demo_migrations(name) values('0001_init.sql'),('0002_workers.sql') on conflict do nothing;",
        );
      for (const name of (
        await readdir(join(process.cwd(), 'supabase/migrations'))
      )
        .filter((name) => name.endsWith('.sql'))
        .sort()) {
        if (
          (
            await db.query('select name from demo_migrations where name=$1', [
              name,
            ])
          ).rows.length
        )
          continue;
        await db.transaction(async (tx) => {
          await tx.exec(
            await readFile(
              join(process.cwd(), 'supabase/migrations', name),
              'utf8',
            ),
          );
          await tx.query('insert into demo_migrations(name) values($1)', [
            name,
          ]);
        });
      }
      return db;
    })();
  return state.demoDb;
}

/** @returns {Promise<Repository>} */
export async function getRepository() {
  const env = readEnv();
  if (env.APP_MODE === 'live') {
    const client = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL || '',
      env.SUPABASE_SERVICE_ROLE_KEY || '',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (url, init) =>
            fetch(url, { ...init, signal: AbortSignal.timeout(10000) }),
        },
      },
    );
    return {
      async rpc(name, args = {}) {
        if (!functions.has(name)) throw new Error('Unknown RPC.');
        const { data, error } = await client.rpc(name, args);
        if (error) throw new Error('Database operation failed.');
        return data;
      },
      async rows(table, filters = {}) {
        if (!tables.has(table)) throw new Error('Unknown table.');
        let query = client.from(table).select('*');
        for (const [key, value] of Object.entries(filters))
          query = query.eq(key, value);
        const { data, error } = await query.limit(1000);
        if (error) throw new Error('Database read failed.');
        return data || [];
      },
      async insert(table, data, conflict) {
        if (!tables.has(table)) throw new Error('Unknown table.');
        const query = conflict
          ? client
              .from(table)
              .upsert(data, { onConflict: conflict, ignoreDuplicates: true })
          : client.from(table).insert(data);
        const { error } = await query;
        if (error) throw new Error('Database write failed.');
      },
      async update(table, id, data) {
        if (!tables.has(table)) throw new Error('Unknown table.');
        let query = client.from(table).update(data);
        for (const [key, value] of Object.entries(id))
          query = query.eq(key, value);
        const { error } = await query;
        if (error) throw new Error('Database write failed.');
      },
    };
  }
  const db = await getDemoDatabase();
  return embeddedRepository(db);
}

/** @param {import('@electric-sql/pglite').PGlite} db @returns {Repository} */
export function embeddedRepository(db) {
  return {
    async rpc(name, args = {}) {
      if (!functions.has(name)) throw new Error('Unknown RPC.');
      const values = Object.values(args);
      const parameters = Object.keys(args)
        .map((key, index) => `${safeIdentifier(key)} => $${index + 1}`)
        .join(',');
      const result = await db.query(
        `select * from ${safeIdentifier(name)}(${parameters})`,
        values.map((value) =>
          typeof value === 'object' ? JSON.stringify(value) : value,
        ),
      );
      return [
        'available_starts',
        'reconciliation_candidates',
        'pending_payment_events',
        'submitted_refunds',
      ].includes(name) || name.startsWith('claim_')
        ? JSON.parse(JSON.stringify(result.rows))
        : Object.values(result.rows[0] || {})[0];
    },
    async rows(table, filters = {}) {
      if (!tables.has(table)) throw new Error('Unknown table.');
      const where = Object.keys(filters)
        .map((key, index) => `${safeIdentifier(key)}=$${index + 1}`)
        .join(' and ');
      const result = await db.query(
        `select * from ${safeIdentifier(table)}${where ? ` where ${where}` : ''} limit 1000`,
        Object.values(filters),
      );
      return /** @type {Record<string,unknown>[]} */ (
        JSON.parse(JSON.stringify(result.rows))
      );
    },
    async insert(table, data, conflict) {
      if (!tables.has(table)) throw new Error('Unknown table.');
      const keys = Object.keys(data);
      await db.query(
        `insert into ${safeIdentifier(table)}(${keys.map(safeIdentifier).join(',')}) values(${keys.map((_, index) => `$${index + 1}`).join(',')})${conflict ? ` on conflict(${safeIdentifier(conflict)}) do nothing` : ''}`,
        Object.values(data).map((value) =>
          typeof value === 'object' ? JSON.stringify(value) : value,
        ),
      );
    },
    async update(table, id, data) {
      if (!tables.has(table)) throw new Error('Unknown table.');
      const sets = Object.keys(data)
        .map((key, index) => `${safeIdentifier(key)}=$${index + 1}`)
        .join(',');
      const where = Object.keys(id)
        .map(
          (key, index) =>
            `${safeIdentifier(key)}=$${Object.keys(data).length + index + 1}`,
        )
        .join(' and ');
      await db.query(
        `update ${safeIdentifier(table)} set ${sets} where ${where}`,
        [...Object.values(data), ...Object.values(id)],
      );
    },
  };
}

/** @param {string} hash @returns {Promise<Booking | undefined>} */
export async function findBooking(hash) {
  const rows = await (
    await getRepository()
  ).rows('bookings', { access_token_hash: hash });
  return /** @type {Booking | undefined} */ (rows[0]);
}
