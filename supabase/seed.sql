-- Development availability only. No guest data or credentials.
insert into availability_windows(start_time,end_time)
select ((current_date+day)::text||'T04:30:00Z')::timestamptz,((current_date+day)::text||'T12:30:00Z')::timestamptz
from generate_series(1,14) day;
