-- Replies on campus board posts. Same rules as posts: anonymous to users, tied to an account
-- on the server, voted up or down (hidden at -5), hidden after two reports, server-only access.

create table if not exists public.board_replies (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.board_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  score integer not null default 0,
  reports integer not null default 0,
  hidden boolean not null default false,
  removed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists board_replies_post on public.board_replies (post_id, created_at);

create table if not exists public.board_reply_votes (
  reply_id bigint not null references public.board_replies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  primary key (reply_id, user_id)
);

create table if not exists public.board_reply_reports (
  reply_id bigint not null references public.board_replies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (reply_id, user_id)
);

alter table public.board_replies enable row level security;   -- no policies: server only
alter table public.board_reply_votes enable row level security;
alter table public.board_reply_reports enable row level security;

create or replace function public.board_reply_vote(p_reply bigint, p_user uuid, p_value integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s integer;
begin
  if p_value = 0 then
    delete from public.board_reply_votes where reply_id = p_reply and user_id = p_user;
  else
    insert into public.board_reply_votes (reply_id, user_id, value) values (p_reply, p_user, sign(p_value))
      on conflict (reply_id, user_id) do update set value = excluded.value;
  end if;
  update public.board_replies r
     set score = coalesce((select sum(value) from public.board_reply_votes v where v.reply_id = p_reply), 0)
   where r.id = p_reply
  returning score into s;
  update public.board_replies set hidden = true where id = p_reply and s <= -5;
  return s;
end;
$$;

create or replace function public.board_reply_report(p_reply bigint, p_user uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.board_reply_reports (reply_id, user_id, reason) values (p_reply, p_user, left(p_reason, 200))
    on conflict do nothing;
  update public.board_replies r
     set reports = (select count(*) from public.board_reply_reports x where x.reply_id = p_reply),
         hidden = r.hidden or (select count(*) from public.board_reply_reports x where x.reply_id = p_reply) >= 2
   where r.id = p_reply;
end;
$$;

revoke all on function public.board_reply_vote(bigint, uuid, integer) from public, anon, authenticated;
revoke all on function public.board_reply_report(bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.board_reply_vote(bigint, uuid, integer) to service_role;
grant execute on function public.board_reply_report(bigint, uuid, text) to service_role;

-- Explicit Data API grants (Supabase stops auto-granting new public tables on 2026-10-30)
grant all on public.board_replies, public.board_reply_votes, public.board_reply_reports to service_role;
