import 'server-only';
import { getRepository } from './db.js';
export async function adminData() {
  const repo = await getRepository();
  const [bookings, windows, refunds] = await Promise.all([
    repo.rows('bookings'),
    repo.rows('availability_windows'),
    repo.rows('refund_operations'),
  ]);
  const keys = [
    'id',
    'caller_name',
    'caller_email',
    'call_mode',
    'start_time',
    'end_time',
    'amount_in_paise',
    'status',
    'session_outcome',
    'razorpay_refund_id',
  ];
  return {
    now: Date.now(),
    bookings: bookings
      .map((row) => Object.fromEntries(keys.map((key) => [key, row[key]])))
      .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time))),
    windows,
    refunds: refunds.map((row) => ({
      booking_id: row.booking_id,
      status: row.status,
      attempts: row.attempts,
      provider_refund_id: row.provider_refund_id,
    })),
  };
}
