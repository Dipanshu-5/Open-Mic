create function claim_notifications(p_worker uuid) returns setof notifications language sql set search_path=public as $$
 update notifications set lease_until=now()+interval '2 minutes',lease_token=p_worker
 where id in(select id from notifications where status='pending' and send_after<=now() and (lease_until is null or lease_until<now()) order by send_after limit 20 for update skip locked)
 returning *;
$$;
create function finish_notification(p_id uuid,p_worker uuid,p_success boolean) returns void language plpgsql set search_path=public as $$
declare n notifications;
begin
 update notifications set attempts=attempts+1,status=case when p_success then 'sent' when attempts>=2 then 'failed' else 'pending' end,
 send_after=case when p_success then send_after else now()+make_interval(mins=>power(2,attempts)::int) end,lease_until=null,lease_token=null
 where id=p_id and lease_token=p_worker returning * into n;
 if n.channel='whatsapp' and n.status='failed' then perform enqueue_message(n.booking_id,n.template); end if;
end; $$;
create function claim_refunds(p_worker uuid) returns setof refund_operations language sql set search_path=public as $$
 update refund_operations set lease_until=now()+interval '2 minutes',lease_token=p_worker
 where booking_id in(select booking_id from refund_operations where status='pending' and retry_after<=now() and (lease_until is null or lease_until<now()) order by retry_after limit 20 for update skip locked)
 returning *;
$$;
create function finish_refund(p_booking_id uuid,p_worker uuid,p_refund_id text,p_processed boolean) returns void language plpgsql set search_path=public as $$
begin
 update refund_operations set provider_refund_id=coalesce(p_refund_id,provider_refund_id),
 status=case when p_processed then 'processed' when p_refund_id is not null then 'submitted' else 'pending' end,
 attempts=attempts+1,retry_after=now()+interval '2 minutes',lease_until=null,lease_token=null
 where booking_id=p_booking_id and lease_token=p_worker and status<>'processed';
 if found and p_refund_id is not null then
  update bookings set razorpay_refund_id=p_refund_id,status=case when p_processed then 'refunded' else 'refund_pending' end where id=p_booking_id;
 end if;
end; $$;
create function set_outcome(p_booking_id uuid,p_outcome text,p_actor text) returns text language plpgsql set search_path=public as $$
declare b bookings;
begin
 perform pg_advisory_xact_lock(728104);
 if p_outcome not in ('completed','guest_no_show','host_missed') then raise exception 'invalid_outcome'; end if;
 select * into b from bookings where id=p_booking_id for update;
 if not found then return 'booking_not_found'; end if;
 if b.start_time>now() then return 'not_started'; end if;
 if b.session_outcome is not null then return b.session_outcome; end if;
 if b.status<>'confirmed' then return 'not_confirmed'; end if;
 update bookings set session_outcome=p_outcome where id=p_booking_id;
 if p_outcome='host_missed' then perform cancel_booking(p_booking_id,true); end if;
 insert into audit_log(action,booking_id,actor) values(p_outcome,p_booking_id,p_actor);
 return p_outcome;
end; $$;
revoke all on function claim_notifications(uuid),finish_notification(uuid,uuid,boolean),claim_refunds(uuid),finish_refund(uuid,uuid,text,boolean),set_outcome(uuid,text,text) from public,anon,authenticated;
grant execute on function claim_notifications(uuid),finish_notification(uuid,uuid,boolean),claim_refunds(uuid),finish_refund(uuid,uuid,text,boolean),set_outcome(uuid,text,text) to service_role;

create function resend_confirmation(p_booking_id uuid) returns void language plpgsql set search_path=public as $$
begin
 if not exists(select 1 from bookings where id=p_booking_id and status='confirmed' and encrypted_token<>'retired') then raise exception 'not_confirmed'; end if;
 perform enqueue_message(p_booking_id,'booking_confirmed');
 update notifications set status='pending',generation=generation+1,attempts=0,send_after=now(),lease_until=null,lease_token=null
 where booking_id=p_booking_id and template='booking_confirmed' and channel='email' and status in ('sent','failed');
end; $$;
create function purge_old_data() returns void language plpgsql set search_path=public as $$
begin
 delete from payment_events where processed_at is not null and received_at<now()-interval '90 days';
 update bookings set caller_name='Deleted guest',caller_email='deleted@privacy.invalid',caller_phone=null,whatsapp_opt_in=false,
 encrypted_token='retired',access_token_hash='retired_'||id::text
 where end_time<now()-interval '90 days' and encrypted_token<>'retired';
end; $$;
create function reconciliation_candidates() returns setof bookings language sql set search_path=public as $$
 select * from bookings where status in ('pending','expired') and razorpay_order_id is not null
 and created_at<now()-interval '15 minutes' and created_at>now()-interval '7 days'
 order by created_at desc limit 20;
$$;
revoke all on function resend_confirmation(uuid),purge_old_data(),reconciliation_candidates() from public,anon,authenticated;
grant execute on function resend_confirmation(uuid),purge_old_data(),reconciliation_candidates() to service_role;
