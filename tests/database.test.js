import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { embeddedRepository } from '../lib/db.js';
import { processPaymentEvent } from '../lib/workers.js';

/** @type {PGlite} */ let db;
const start = new Date();
start.setUTCDate(start.getUTCDate() + 3);
start.setUTCHours(4, 30, 0, 0);
const end = new Date(start.getTime() + 8 * 3600000);
/** @param {string} plan @param {string} [time] */
function input(plan, time = start.toISOString()) {
  const id = randomUUID();
  return {
    id,
    request_key: randomUUID(),
    plan_id: plan,
    start_time: time,
    caller_name: 'Test guest',
    caller_email: 'test@example.com',
    whatsapp_opt_in: false,
    consent: { adult: true, terms: true, privacy: true },
    access_token_hash: id,
    encrypted_token: 'test-encrypted',
  };
}
/** @param {ReturnType<typeof input>} booking */
async function reserve(booking) {
  const result = await db.query('select reserve_booking($1::jsonb) value', [
    JSON.stringify(booking),
  ]);
  return /** @type {Record<string,unknown>} */ (result.rows[0]?.value);
}
beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  await db.waitReady;
  await db.exec(
    'create role anon; create role authenticated; create role service_role bypassrls;',
  );
  await db.exec(await readFile('supabase/migrations/0001_init.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/0002_workers.sql', 'utf8'));
  await db.exec(
    await readFile('supabase/migrations/0003_maintenance.sql', 'utf8'),
  );
  await db.exec(
    await readFile('supabase/migrations/0004_order_creation.sql', 'utf8'),
  );
  await db.query(
    'insert into availability_windows(start_time,end_time) values($1,$2)',
    [start.toISOString(), end.toISOString()],
  );
}, 30000);
afterAll(async () => db?.close());

describe('PostgreSQL reservation invariants', () => {
  it('guards the twenty-four hour cancellation boundary transactionally', async () => {
    const b = await reserve(
      input('video_30', new Date(start.getTime() + 4 * 3600000).toISOString()),
    );
    await db.query('select attach_order($1,$2)', [b.id, 'order-boundary']);
    await db.query(
      "select confirm_booking('order-boundary','pay-boundary',29900,'INR')",
    );
    await db.exec('begin');
    try {
      await db.query(
        "update bookings set start_time=now()+interval '24 hours',end_time=now()+interval '24 hours 30 minutes' where id=$1",
        [b.id],
      );
      expect(
        (await db.query('select cancel_booking($1,false) value', [b.id]))
          .rows[0]?.value,
      ).toBe('refund_pending');
    } finally {
      await db.exec('rollback');
    }
    await db.exec('begin');
    try {
      await db.query(
        "update bookings set start_time=now()+interval '23 hours 59 minutes 59 seconds',end_time=now()+interval '24 hours 29 minutes 59 seconds' where id=$1",
        [b.id],
      );
      expect(
        (await db.query('select cancel_booking($1,false) value', [b.id]))
          .rows[0]?.value,
      ).toBe('contact_host');
    } finally {
      await db.exec('rollback');
    }
    await db.query('select cancel_booking($1,true)', [b.id]);
  });
  it('fifty concurrent submissions produce one winner across plans', async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, index) =>
        reserve(input(index % 2 ? 'audio_30' : 'video_60')),
      ),
    );
    expect(results.filter((result) => result.id)).toHaveLength(1);
    expect(
      results.filter((result) => result.error === 'slot_unavailable'),
    ).toHaveLength(49);
  });
  it('parallel payment-order retries receive one creation lease', async () => {
    const b = await reserve(
      input('audio_30', new Date(start.getTime() + 7 * 3600000).toISOString()),
    );
    const claims = await Promise.all(
      Array.from({ length: 50 }, () =>
        db.query('select claim_order_creation($1) value', [b.id]),
      ),
    );
    expect(claims.filter((result) => result.rows[0]?.value)).toHaveLength(1);
    await db.query('select release_booking($1)', [b.id]);
  });
  it('permits adjacent sessions and snapshots trusted prices', async () => {
    const booking = await reserve(
      input('audio_30', new Date(start.getTime() + 3600000).toISOString()),
    );
    expect(booking.amount_in_paise).toBe(29900);
    expect(booking.duration_minutes).toBe(30);
  });
  it('rejects direct overlapping inserts with the exclusion constraint', async () => {
    await expect(
      db.query(
        "insert into bookings(id,request_key,plan_id,call_mode,duration_minutes,start_time,end_time,amount_in_paise,caller_name,caller_email,consent,access_token_hash,encrypted_token) select gen_random_uuid(),gen_random_uuid(),plan_id,call_mode,duration_minutes,start_time,end_time,amount_in_paise,'Direct guest','direct@example.com',consent,gen_random_uuid()::text,'test' from bookings where status='pending' limit 1",
      ),
    ).rejects.toThrow(/conflicting key/);
    await expect(
      db.query(
        'insert into availability_windows(start_time,end_time) values($1,$2)',
        [start.toISOString(), end.toISOString()],
      ),
    ).rejects.toThrow();
  });
  it('confirms idempotently, rejects wrong money, and refunds late slot loss once', async () => {
    const time = new Date(start.getTime() + 2 * 3600000).toISOString();
    const first = await reserve(input('video_60', time));
    await db.query('select attach_order($1,$2)', [first.id, 'order-first']);
    expect(
      (
        await db.query(
          "select confirm_booking('order-first','pay-first',1,'INR') value",
        )
      ).rows[0]?.value,
    ).toBe('payment_mismatch');
    await db.query(
      "update bookings set held_until=now()-interval '1 second' where id=$1",
      [first.id],
    );
    const second = await reserve(input('audio_30', time));
    await db.query('select attach_order($1,$2)', [second.id, 'order-second']);
    expect(
      (
        await db.query(
          "select confirm_booking('order-second','pay-second',29900,'INR') value",
        )
      ).rows[0]?.value,
    ).toBe('confirmed');
    expect(
      (
        await db.query(
          "select confirm_booking('order-second','pay-second',29900,'INR') value",
        )
      ).rows[0]?.value,
    ).toBe('already_confirmed');
    expect(
      (
        await db.query(
          "select confirm_booking('order-first','pay-first',50000,'INR') value",
        )
      ).rows[0]?.value,
    ).toBe('slot_lost');
    await db.query(
      "select confirm_booking('order-first','pay-first',50000,'INR')",
    );
    expect(
      (
        await db.query(
          'select count(*)::int n from refund_operations where booking_id=$1',
          [first.id],
        )
      ).rows[0]?.n,
    ).toBe(1);
  });
  it('cancellation frees the interval and creates one refund intent', async () => {
    const rows = await db.query(
      "select id from bookings where razorpay_order_id='order-second'",
    );
    const id = rows.rows[0]?.id;
    expect(
      (await db.query('select cancel_booking($1,false) value', [id])).rows[0]
        ?.value,
    ).toBe('refund_pending');
    await db.query('select cancel_booking($1,false)', [id]);
    expect(
      (
        await db.query(
          'select count(*)::int n from refund_operations where booking_id=$1',
          [id],
        )
      ).rows[0]?.n,
    ).toBe(1);
  });
  it('anonymous roles cannot read tables or invoke reservation functions', async () => {
    await db.exec('set role anon');
    try {
      await expect(db.query('select * from bookings')).rejects.toThrow(
        /permission denied/,
      );
      await expect(db.query('select expire_stale_holds()')).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await db.exec('reset role');
    }
  });
  it('batch previews skip overlaps without mutating availability', async () => {
    const windows = [
      { start_time: start.toISOString(), end_time: end.toISOString() },
    ];
    const result = await db.query(
      'select create_windows_batch($1::jsonb,true) value',
      [JSON.stringify(windows)],
    );
    expect(result.rows[0]?.value).toMatchObject({
      created: 0,
      skipped: 1,
      preview: true,
    });
  });
  it('resumes an event interrupted after confirmation without duplicate effects', async () => {
    const booking = await reserve(
      input('audio_30', new Date(start.getTime() + 5 * 3600000).toISOString()),
    );
    await db.query('select attach_order($1,$2)', [booking.id, 'order-resume']);
    const event = {
      event_id: 'event-resume',
      event_type: 'payment.captured',
      event_data: {
        orderId: 'order-resume',
        paymentId: 'pay-resume',
        amount: 29900,
        currency: 'INR',
      },
    };
    const repo = embeddedRepository(db);
    await repo.insert('payment_events', event, 'event_id');
    await repo.insert('payment_events', event, 'event_id');
    await db.query(
      "select confirm_booking('order-resume','pay-resume',29900,'INR')",
    );
    await processPaymentEvent(event, repo);
    await processPaymentEvent(event, repo);
    expect(
      (
        await db.query(
          "select count(*)::int n from payment_events where event_id='event-resume'",
        )
      ).rows[0]?.n,
    ).toBe(1);
    expect(
      (
        await db.query(
          "select count(*)::int n from notifications where booking_id=$1 and template='booking_confirmed'",
          [booking.id],
        )
      ).rows[0]?.n,
    ).toBe(1);
    expect(
      (
        await db.query(
          "select processed_at from payment_events where event_id='event-resume'",
        )
      ).rows[0]?.processed_at,
    ).toBeTruthy();
  });
  it('notification outages retain confirmation and exhaust bounded retries', async () => {
    const booking = await db.query(
      "select id,status from bookings where razorpay_order_id='order-resume'",
    );
    const id = booking.rows[0]?.id;
    const notification = await db.query(
      "select id from notifications where booking_id=$1 and template='booking_confirmed'",
      [id],
    );
    const messageId = notification.rows[0]?.id;
    for (let attempt = 0; attempt < 3; attempt++) {
      const worker = randomUUID();
      await db.query(
        "update notifications set send_after=now()-interval '1 second' where id=$1",
        [messageId],
      );
      await db.query('select claim_notifications($1)', [worker]);
      await db.query('select finish_notification($1,$2,false)', [
        messageId,
        worker,
      ]);
    }
    expect(
      (
        await db.query(
          'select status,attempts from notifications where id=$1',
          [messageId],
        )
      ).rows[0],
    ).toMatchObject({ status: 'failed', attempts: 3 });
    expect(
      (await db.query('select status from bookings where id=$1', [id])).rows[0]
        ?.status,
    ).toBe('confirmed');
    await db.query('select resend_confirmation($1)', [id]);
    expect(
      (
        await db.query(
          'select status,generation,attempts from notifications where id=$1',
          [messageId],
        )
      ).rows[0],
    ).toMatchObject({ status: 'pending', generation: 1, attempts: 0 });
  });
  it('leases refund retries without changing the idempotency key', async () => {
    const worker = randomUUID();
    const first = await db.query('select * from claim_refunds($1)', [worker]);
    expect(first.rows.length).toBeGreaterThan(0);
    expect(
      (await db.query('select * from claim_refunds($1)', [randomUUID()])).rows,
    ).toHaveLength(0);
    const refund = first.rows[0];
    await db.query(
      "update refund_operations set lease_until=now()-interval '1 second' where booking_id=$1",
      [refund.booking_id],
    );
    const retry = await db.query('select * from claim_refunds($1)', [
      randomUUID(),
    ]);
    expect(retry.rows[0]?.idempotency_key).toBe(refund.idempotency_key);
  });
  it('maintenance receipt batches remain reachable beyond processed history', async () => {
    await db.exec(
      "insert into payment_events(event_id,event_type,event_data,processed_at) select 'history-'||n,'ignored','{}',now() from generate_series(1,1001)n;",
    );
    await db.exec(
      "insert into payment_events(event_id,event_type,event_data) values('new-pending-event','ignored','{}');",
    );
    const batch = await db.query('select * from pending_payment_events()');
    expect(batch.rows.some((row) => row.event_id === 'new-pending-event')).toBe(
      true,
    );
    expect(
      (await db.query('select * from pending_payment_events()')).rows,
    ).toHaveLength(0);
  });
  it('host-missed outcomes queue one refund while guest no-shows queue none', async () => {
    for (const [index, outcome] of ['host_missed', 'guest_no_show'].entries()) {
      const booking = await reserve(
        input(
          'video_30',
          new Date(start.getTime() + (6 + index) * 3600000).toISOString(),
        ),
      );
      const order = `order-outcome-${index}`;
      await db.query('select attach_order($1,$2)', [booking.id, order]);
      await db.query("select confirm_booking($1,$2,29900,'INR')", [
        order,
        `pay-outcome-${index}`,
      ]);
      await db.query(
        "update bookings set start_time=now()-make_interval(hours=>$2::int),end_time=now()-make_interval(hours=>$2::int)+interval '30 minutes' where id=$1",
        [booking.id, 3 + index],
      );
      await db.query("select set_outcome($1,$2,'test-host')", [
        booking.id,
        outcome,
      ]);
      await db.query("select set_outcome($1,$2,'test-host')", [
        booking.id,
        outcome,
      ]);
      expect(
        (
          await db.query(
            'select count(*)::int n from refund_operations where booking_id=$1',
            [booking.id],
          )
        ).rows[0]?.n,
      ).toBe(index === 0 ? 1 : 0);
    }
  });
});
