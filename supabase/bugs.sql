-- Bug reports filed through the coach. Server-only (no browser access).
create table if not exists public.bug_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  summary text not null check (char_length(summary) <= 200),
  details text check (char_length(details) <= 2000),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  device text check (char_length(device) <= 400),
  last_error text check (char_length(last_error) <= 1000),
  status text not null default 'new' check (status in ('new', 'investigating', 'fix drafted', 'fixed', 'wont fix')),
  notes text
);
create index if not exists bug_reports_status on public.bug_reports (status, created_at);
alter table public.bug_reports enable row level security;  -- no policies: server only
notify pgrst, 'reload schema';
select to_regclass('public.bug_reports') as created;

-- Explicit Data API grants (Supabase stops auto-granting new public tables on 2026-10-30)
grant all on public.bug_reports to service_role;
