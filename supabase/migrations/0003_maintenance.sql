-- Fair, bounded batches. Failed items cannot indefinitely hide later receipts.
alter table payment_events add column next_attempt_at timestamptz not null default now();
alter table bookings add column reconciled_at timestamptz;
create index payment_events_pending on payment_events(next_attempt_at) where processed_at is null;
create function pending_payment_events() returns setof payment_events language sql set search_path=public as $$
 update payment_events set next_attempt_at=now()+interval '2 minutes'
 where event_id in(select event_id from payment_events where processed_at is null and next_attempt_at<=now()
 order by next_attempt_at,received_at limit 20 for update skip locked) returning *;
$$;
create or replace function reconciliation_candidates() returns setof bookings language sql set search_path=public as $$
 update bookings set reconciled_at=now()
 where id in(select id from bookings where status in ('pending','expired') and razorpay_order_id is not null
 and created_at<now()-interval '15 minutes' and created_at>now()-interval '7 days'
 and (reconciled_at is null or reconciled_at<now()-interval '10 minutes')
 order by reconciled_at nulls first,created_at limit 20 for update skip locked) returning *;
$$;
create function submitted_refunds() returns setof refund_operations language sql set search_path=public as $$
 update refund_operations set retry_after=now()+interval '2 minutes'
 where booking_id in(select booking_id from refund_operations where status='submitted' and retry_after<=now()
 order by retry_after limit 20 for update skip locked) returning *;
$$;
revoke all on function pending_payment_events(),submitted_refunds() from public,anon,authenticated;
grant execute on function pending_payment_events(),submitted_refunds() to service_role;
