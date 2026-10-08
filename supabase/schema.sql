-- Gainzville database schema. Run in the Supabase SQL editor.
-- Every table uses row level security: users can only see and change their own rows.

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create table if not exists public.food_logs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  at timestamptz not null,
  name text not null,
  calories integer not null,
  protein numeric not null,
  cost numeric
);
alter table public.food_logs enable row level security;
drop policy if exists "own logs" on public.food_logs;
create policy "own logs" on public.food_logs
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index if not exists food_logs_user_at on public.food_logs (user_id, at desc);

-- "Delete my account": removes the login and, through the cascades above, every row the user owns.
create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = (select auth.uid());
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
