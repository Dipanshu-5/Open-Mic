-- Prevent parallel retries from issuing multiple provider orders for one hold.
alter table bookings add column order_lease_until timestamptz;
create function claim_order_creation(p_booking_id uuid) returns boolean language plpgsql set search_path=public as $$
begin
 update bookings set order_lease_until=now()+interval '2 minutes'
 where id=p_booking_id and status='pending' and held_until>now() and razorpay_order_id is null
 and (order_lease_until is null or order_lease_until<now());
 return found;
end; $$;
revoke all on function claim_order_creation(uuid) from public,anon,authenticated;
grant execute on function claim_order_creation(uuid) to service_role;
