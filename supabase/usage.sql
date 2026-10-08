-- Daily usage limits for AI features, stored in the database so they survive server restarts.
-- Only the server (using the secret key) can call use_quota; browsers can't touch this table.

create table if not exists public.usage (
  bucket text not null,   -- e.g. 'scan:ip:1.2.3.4', 'chat:user:<uuid>', 'scan:global'
  day date not null,
  count integer not null default 0,
  primary key (bucket, day)
);
alter table public.usage enable row level security;  -- no policies: no direct access from browsers

-- Counts one use against a bucket and a site-wide bucket. Returns true if both are still under their limits.
create or replace function public.use_quota(p_bucket text, p_max integer, p_global text, p_global_max integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  d date := (now() at time zone 'utc')::date;
  c integer;
  g integer;
begin
  insert into public.usage (bucket, day, count) values (p_global, d, 1)
    on conflict (bucket, day) do update set count = public.usage.count + 1
    returning count into g;
  if g > p_global_max then
    return false;
  end if;
  insert into public.usage (bucket, day, count) values (p_bucket, d, 1)
    on conflict (bucket, day) do update set count = public.usage.count + 1
    returning count into c;
  return c <= p_max;
end;
$$;
revoke all on function public.use_quota(text, integer, text, integer) from public, anon, authenticated;
grant execute on function public.use_quota(text, integer, text, integer) to service_role;

-- Old rows aren't needed after a few days
create index if not exists usage_day on public.usage (day);
