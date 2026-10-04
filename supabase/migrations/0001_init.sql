create extension if not exists btree_gist;

create table plans (
  id text primary key,
  mode text not null check (mode in ('video','audio')),
  duration_minutes integer not null check (duration_minutes in (30,60)),
  amount_in_paise integer not null check (amount_in_paise >= 100),
  currency text not null default 'INR' check (currency = 'INR'),
  enabled boolean not null default true
);
insert into plans(id,mode,duration_minutes,amount_in_paise) values
 ('video_30','video',30,29900),('video_60','video',60,50000),
 ('audio_30','audio',30,29900),('audio_60','audio',60,50000);

create table availability_windows (
  id uuid primary key default gen_random_uuid(),
  start_time timestamptz not null,
  end_time timestamptz not null,
  check (end_time > start_time),
  exclude using gist (tstzrange(start_time,end_time,'[)') with &&)
);
create table bookings (
  id uuid primary key,
  request_key uuid not null unique,
  plan_id text not null references plans(id),
  call_mode text not null check (call_mode in ('video','audio')),
  duration_minutes integer not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  amount_in_paise integer not null check (amount_in_paise >= 100),
  currency text not null default 'INR' check (currency = 'INR'),
  caller_name text not null check (length(caller_name) between 1 and 100),
  caller_email text not null,
  caller_phone text,
  whatsapp_opt_in boolean not null default false,
  consent jsonb not null,
  consent_at timestamptz not null default now(),
  access_token_hash text not null unique,
  encrypted_token text not null,
  status text not null default 'pending' check (status in ('pending','confirmed','expired','cancelled','refund_pending','refunded')),
  held_until timestamptz not null default now()+interval '10 minutes',
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  razorpay_refund_id text,
  hms_room_id text,
  session_outcome text check (session_outcome in ('completed','guest_no_show','host_missed')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  check (end_time > start_time),
  check (end_time=start_time+make_interval(mins=>duration_minutes)),
  check (caller_phone is null or caller_phone ~ '^\+[1-9][0-9]{7,14}$'),
  check (not whatsapp_opt_in or caller_phone is not null),
  exclude using gist (tstzrange(start_time,end_time,'[)') with &&) where (status in ('pending','confirmed'))
);
create index bookings_status_created on bookings(status,created_at);
create table payment_events (
  event_id text primary key,
  event_type text not null,
  event_data jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0
);
create table refund_operations (
  booking_id uuid primary key references bookings(id),
  payment_id text not null,
  amount_in_paise integer not null,
  idempotency_key text not null unique,
  provider_refund_id text unique,
  status text not null default 'pending' check(status in ('pending','submitted','processed')),
  attempts integer not null default 0,
  retry_after timestamptz not null default now(),
  lease_until timestamptz,
  lease_token uuid
);
create table notifications (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  channel text not null check(channel in ('email','whatsapp')),
  template text not null,
  send_after timestamptz not null default now(),
  status text not null default 'pending' check(status in ('pending','sent','failed')),
  attempts integer not null default 0,
  generation integer not null default 0,
  lease_until timestamptz,
  lease_token uuid,
  unique(booking_id,channel,template)
);
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  booking_id uuid,
  actor text not null,
  created_at timestamptz not null default now()
);

create function expire_stale_holds() returns void language plpgsql set search_path=public as $$
begin
  perform pg_advisory_xact_lock(728104);
  update bookings set status='expired' where status='pending' and held_until<=now();
end; $$;

create function available_starts(p_plan_id text,p_date date)
returns table(start_time timestamptz,end_time timestamptz) language sql set search_path=public as $$
 select candidate, candidate+make_interval(mins=>p.duration_minutes)
 from plans p cross join availability_windows w
 cross join lateral generate_series(w.start_time,w.end_time-make_interval(mins=>p.duration_minutes),interval '30 minutes') candidate
 where p.id=p_plan_id and p.enabled
 and candidate::time is not null
 and extract(minute from candidate at time zone 'Asia/Kolkata')::int % 30=0
 and extract(second from candidate)=0
 and (candidate at time zone 'Asia/Kolkata')::date=p_date
 and candidate>=now()+interval '2 hours' and candidate<=now()+interval '30 days'
 and not exists(select 1 from bookings b where (b.status='confirmed' or (b.status='pending' and b.held_until>now()))
  and tstzrange(b.start_time,b.end_time,'[)') && tstzrange(candidate,candidate+make_interval(mins=>p.duration_minutes),'[)'))
 order by candidate;
$$;

create function reserve_booking(p_input jsonb) returns jsonb language plpgsql set search_path=public as $$
declare p plans; b bookings; starts timestamptz; ends timestamptz;
begin
 perform pg_advisory_xact_lock(728104);
 perform expire_stale_holds();
 select * into b from bookings where request_key=(p_input->>'request_key')::uuid;
 if found then
  -- A retry key is not authorization to read someone else's booking.
  if b.access_token_hash<>p_input->>'access_token_hash' then return jsonb_build_object('error','request_conflict'); end if;
  return to_jsonb(b);
 end if;
 select * into p from plans where id=p_input->>'plan_id' and enabled;
 if not found then return jsonb_build_object('error','invalid_plan'); end if;
 starts:=(p_input->>'start_time')::timestamptz; ends:=starts+make_interval(mins=>p.duration_minutes);
 if starts<now()+interval '2 hours' or starts>now()+interval '30 days'
  or extract(minute from starts at time zone 'Asia/Kolkata')::int%30<>0 or extract(second from starts)<>0
  or not exists(select 1 from availability_windows where start_time<=starts and end_time>=ends)
 then return jsonb_build_object('error','slot_unavailable'); end if;
 begin
 insert into bookings(id,request_key,plan_id,call_mode,duration_minutes,start_time,end_time,amount_in_paise,
 caller_name,caller_email,caller_phone,whatsapp_opt_in,consent,access_token_hash,encrypted_token)
 values((p_input->>'id')::uuid,(p_input->>'request_key')::uuid,p.id,p.mode,p.duration_minutes,starts,ends,p.amount_in_paise,
 p_input->>'caller_name',p_input->>'caller_email',nullif(p_input->>'caller_phone',''),coalesce((p_input->>'whatsapp_opt_in')::boolean,false),
 p_input->'consent',p_input->>'access_token_hash',p_input->>'encrypted_token') returning * into b;
 exception when exclusion_violation then return jsonb_build_object('error','slot_unavailable');
 end;
 return to_jsonb(b);
end; $$;

create function attach_order(p_booking_id uuid,p_order_id text) returns jsonb language plpgsql set search_path=public as $$
declare b bookings;
begin
 update bookings set razorpay_order_id=p_order_id where id=p_booking_id and razorpay_order_id is null returning * into b;
 if not found then select * into b from bookings where id=p_booking_id and razorpay_order_id=p_order_id; end if;
 if b.id is null then raise exception 'order_conflict'; end if;
 return to_jsonb(b);
end; $$;
create function release_booking(p_booking_id uuid) returns void language plpgsql set search_path=public as $$
begin
 perform pg_advisory_xact_lock(728104);
 update bookings set status='expired' where id=p_booking_id and status='pending';
end; $$;

create function enqueue_message(p_booking_id uuid,p_template text,p_send_after timestamptz default now()) returns void language plpgsql set search_path=public as $$
begin
 insert into notifications(booking_id,channel,template,send_after) values(p_booking_id,'email',p_template,p_send_after) on conflict do nothing;
 insert into notifications(booking_id,channel,template,send_after)
 select id,'whatsapp',p_template,p_send_after from bookings where id=p_booking_id and whatsapp_opt_in on conflict do nothing;
end; $$;
create function queue_refund(p_booking_id uuid) returns void language plpgsql set search_path=public as $$
begin
 insert into refund_operations(booking_id,payment_id,amount_in_paise,idempotency_key)
 select id,razorpay_payment_id,amount_in_paise,'refund_'||id from bookings where id=p_booking_id and razorpay_payment_id is not null
 on conflict do nothing;
end; $$;

create function confirm_booking(p_order_id text,p_payment_id text,p_amount integer,p_currency text) returns text language plpgsql set search_path=public as $$
declare b bookings;
begin
 perform pg_advisory_xact_lock(728104);
 perform expire_stale_holds();
 select * into b from bookings where razorpay_order_id=p_order_id for update;
 if not found then return 'booking_not_found'; end if;
 if b.amount_in_paise<>p_amount or b.currency<>p_currency or (b.razorpay_payment_id is not null and b.razorpay_payment_id<>p_payment_id) then return 'payment_mismatch'; end if;
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

create function cancel_booking(p_booking_id uuid,p_host boolean default false) returns text language plpgsql set search_path=public as $$
declare b bookings;
begin
 perform pg_advisory_xact_lock(728104);
 select * into b from bookings where id=p_booking_id for update;
 if not found then return 'booking_not_found'; end if;
 if b.status in ('refund_pending','refunded','cancelled') then return b.status; end if;
 if b.status<>'confirmed' then return 'not_confirmed'; end if;
 if not p_host and b.start_time<now()+interval '24 hours' then return 'contact_host'; end if;
 update bookings set status='refund_pending' where id=b.id;
 update notifications set status='failed' where booking_id=b.id and template in ('reminder_24h','reminder_1h') and status='pending';
 perform queue_refund(b.id); perform enqueue_message(b.id,'booking_cancelled_refund');
 return 'refund_pending';
end; $$;

create function create_windows_batch(p_windows jsonb,p_preview boolean default true) returns jsonb language plpgsql set search_path=public as $$
declare item jsonb; starts timestamptz; ends timestamptz; created integer:=0; skipped integer:=0; seen tstzrange[]:=array[]::tstzrange[];
begin
 if jsonb_typeof(p_windows)<>'array' or jsonb_array_length(p_windows)>500 then raise exception 'invalid_batch'; end if;
 perform pg_advisory_xact_lock(728104);
 for item in select * from jsonb_array_elements(p_windows) loop
  starts:=(item->>'start_time')::timestamptz; ends:=(item->>'end_time')::timestamptz;
  if starts is null or ends is null or ends<=starts or extract(minute from starts)::int%30<>0 or extract(second from starts)<>0 then raise exception 'invalid_window'; end if;
  if exists(select 1 from availability_windows where tstzrange(start_time,end_time,'[)')&&tstzrange(starts,ends,'[)'))
   or exists(select 1 from unnest(seen) r where r&&tstzrange(starts,ends,'[)')) then skipped:=skipped+1;
  else
   seen:=array_append(seen,tstzrange(starts,ends,'[)')); created:=created+1;
   if not p_preview then insert into availability_windows(start_time,end_time) values(starts,ends); end if;
  end if;
 end loop;
 return jsonb_build_object('created',created,'skipped',skipped,'preview',p_preview);
end; $$;
create function delete_window(p_window_id uuid) returns boolean language plpgsql set search_path=public as $$
declare w availability_windows;
begin
 perform pg_advisory_xact_lock(728104); perform expire_stale_holds();
 select * into w from availability_windows where id=p_window_id for update;
 if not found then return false; end if;
 if exists(select 1 from bookings where status in ('pending','confirmed') and tstzrange(start_time,end_time,'[)')&&tstzrange(w.start_time,w.end_time,'[)')) then return false; end if;
 delete from availability_windows where id=w.id; return true;
end; $$;

-- Server access only. SECURITY INVOKER RPCs additionally require table privileges.
alter table plans enable row level security;
alter table availability_windows enable row level security;
alter table bookings enable row level security;
alter table payment_events enable row level security;
alter table refund_operations enable row level security;
alter table notifications enable row level security;
alter table audit_log enable row level security;
revoke all on plans,availability_windows,bookings,payment_events,refund_operations,notifications,audit_log from anon,authenticated;
grant all on plans,availability_windows,bookings,payment_events,refund_operations,notifications,audit_log to service_role;
do $$ declare fn record; begin
 for fn in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in
 ('expire_stale_holds','available_starts','reserve_booking','attach_order','release_booking','enqueue_message','queue_refund','confirm_booking','cancel_booking','create_windows_batch','delete_window') loop
  execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
  execute format('grant execute on function %s to service_role',fn.signature);
 end loop;
end; $$;
