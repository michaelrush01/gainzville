-- Campus deals board: anonymous-looking posts (like Yik Yak), but every post is tied to an
-- account on the server so bans stick. Browsers never read these tables directly: the server
-- reads them with the secret key and strips out who posted what.

create table if not exists public.board_posts (
  id bigint generated always as identity primary key,
  area text not null,                 -- same ~50 km grid as weekly deals
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 3 and 280),
  place text check (char_length(place) <= 60),   -- optional tag, e.g. 'Chipotle on University Ave'
  score integer not null default 0,
  reports integer not null default 0,
  hidden boolean not null default false,          -- by downvotes, reports, or a moderator
  removed boolean not null default false,         -- removed by a moderator or its author
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists board_posts_area on public.board_posts (area, expires_at);
create index if not exists board_posts_user on public.board_posts (user_id);

create table if not exists public.board_votes (
  post_id bigint not null references public.board_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  primary key (post_id, user_id)
);

create table if not exists public.board_reports (
  post_id bigint not null references public.board_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Keyed by email, not account, so deleting and re-creating an account doesn't lift a ban
create table if not exists public.board_bans (
  email text primary key,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.board_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table public.board_posts enable row level security;    -- no policies: server only
alter table public.board_votes enable row level security;
alter table public.board_reports enable row level security;
alter table public.board_bans enable row level security;
alter table public.board_admins enable row level security;

-- Vote (+1/-1) or clear a vote (0), then recount. A post hides itself at -5, like Yik Yak.
create or replace function public.board_vote(p_post bigint, p_user uuid, p_value integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s integer;
begin
  if p_value = 0 then
    delete from public.board_votes where post_id = p_post and user_id = p_user;
  else
    insert into public.board_votes (post_id, user_id, value) values (p_post, p_user, sign(p_value))
      on conflict (post_id, user_id) do update set value = excluded.value;
  end if;
  update public.board_posts p
     set score = coalesce((select sum(value) from public.board_votes v where v.post_id = p_post), 0)
   where p.id = p_post
  returning score into s;
  update public.board_posts set hidden = true where id = p_post and s <= -5;
  return s;
end;
$$;

-- One report per person per post. Two reports hide the post until a moderator looks.
create or replace function public.board_report(p_post bigint, p_user uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.board_reports (post_id, user_id, reason) values (p_post, p_user, left(p_reason, 200))
    on conflict do nothing;
  update public.board_posts p
     set reports = (select count(*) from public.board_reports r where r.post_id = p_post),
         hidden = p.hidden or (select count(*) from public.board_reports r where r.post_id = p_post) >= 2
   where p.id = p_post;
end;
$$;

revoke all on function public.board_vote(bigint, uuid, integer) from public, anon, authenticated;
revoke all on function public.board_report(bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.board_vote(bigint, uuid, integer) to service_role;
grant execute on function public.board_report(bigint, uuid, text) to service_role;

-- The site owner moderates
insert into public.board_admins (user_id)
select id from auth.users where email = 'michaelrushnyc@gmail.com'
on conflict do nothing;

-- Explicit Data API grants (Supabase stops auto-granting new public tables on 2026-10-30)
grant all on public.board_posts, public.board_votes, public.board_reports, public.board_bans, public.board_admins to service_role;
