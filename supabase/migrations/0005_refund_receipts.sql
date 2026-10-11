-- Apply verified full refunds under the same lock as capture/cancellation.
-- Receipt persistence precedes processing; unmatched receipts must remain retryable.
create function apply_processed_refund(p_payment_id text,p_refund_id text,p_amount integer)
returns text language plpgsql set search_path=public as $$
declare b bookings; r refund_operations;
begin
 perform pg_advisory_xact_lock(728104);
 select * into b from bookings where razorpay_payment_id=p_payment_id for update;
 if not found then return 'booking_not_found'; end if;
 if b.amount_in_paise<>p_amount then return 'refund_mismatch'; end if;
 select * into r from refund_operations where booking_id=b.id for update;
 if found and (r.payment_id<>p_payment_id or r.amount_in_paise<>p_amount
   or (r.provider_refund_id is not null and r.provider_refund_id<>p_refund_id)) then
  return 'refund_mismatch';
 end if;
 if b.razorpay_refund_id is not null and b.razorpay_refund_id<>p_refund_id then return 'refund_mismatch'; end if;
 insert into refund_operations(booking_id,payment_id,amount_in_paise,idempotency_key,provider_refund_id,status)
 values(b.id,p_payment_id,p_amount,'refund_'||b.id,p_refund_id,'processed')
 on conflict(booking_id) do update set provider_refund_id=excluded.provider_refund_id,status='processed',lease_until=null,lease_token=null;
 update bookings set status='refunded',razorpay_refund_id=p_refund_id where id=b.id;
 update notifications set status='failed' where booking_id=b.id and status='pending'
   and template in ('booking_confirmed','reminder_24h','reminder_1h');
 return 'refunded';
end; $$;
revoke all on function apply_processed_refund(text,text,integer) from public,anon,authenticated;
grant execute on function apply_processed_refund(text,text,integer) to service_role;
create index payment_events_refund_payment on payment_events((event_data->>'paymentId')) where event_type='refund.processed';
create or replace function confirm_booking(p_order_id text,p_payment_id text,p_amount integer,p_currency text) returns text language plpgsql set search_path=public as $$
declare b bookings; receipt jsonb; refund_result text;
begin
 perform pg_advisory_xact_lock(728104);
 perform expire_stale_holds();
 select * into b from bookings where razorpay_order_id=p_order_id for update;
 if not found then return 'booking_not_found'; end if;
 if b.amount_in_paise<>p_amount or b.currency<>p_currency or (b.razorpay_payment_id is not null and b.razorpay_payment_id<>p_payment_id) then return 'payment_mismatch'; end if;
 -- A full refund receipt may arrive before the capture event or browser verification.
 select event_data into receipt from payment_events where event_type='refund.processed'
   and event_data->>'paymentId'=p_payment_id and (event_data->>'amount')::integer=p_amount
   order by received_at,event_id limit 1;
 if found then
  update bookings set razorpay_payment_id=p_payment_id where id=b.id;
  refund_result:=apply_processed_refund(p_payment_id,receipt->>'refundId',p_amount);
  if refund_result<>'refunded' then raise exception 'refund_reconciliation_required'; end if;
  return 'refunded';
 end if;
 if b.status='confirmed' then return 'already_confirmed'; end if;
 if b.status in ('refund_pending','refunded') then return 'slot_lost'; end if;
 if b.status='cancelled' or b.start_time<=now() then
  update bookings set status='refund_pending',razorpay_payment_id=p_payment_id where id=b.id;
 else
  begin
   update bookings set status='confirmed',razorpay_payment_id=p_payment_id,confirmed_at=now() where id=b.id;
  exception when exclusion_violation then
   update bookings set status='refund_pending',razorpay_payment_id=p_payment_id where id=b.id;
  end;
 end if;
 select * into b from bookings where id=b.id;
 if b.status='refund_pending' then
  perform queue_refund(b.id); perform enqueue_message(b.id,'slot_lost_refund'); return 'slot_lost';
 end if;
 perform enqueue_message(b.id,'booking_confirmed');
 if b.start_time-interval '24 hours'>now() then perform enqueue_message(b.id,'reminder_24h',b.start_time-interval '24 hours'); end if;
 if b.start_time-interval '1 hour'>now() then perform enqueue_message(b.id,'reminder_1h',b.start_time-interval '1 hour'); end if;
 return 'confirmed';
end; $$;
