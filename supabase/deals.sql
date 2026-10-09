-- Weekly grocery and restaurant deals, found by a daily AI job that reads public weekly ads.
-- Deals are public (anyone can read them). Only the server, using the secret key, can write.

create table if not exists public.deals (
  id bigint generated always as identity primary key,
  area text not null,            -- ~50 km grid cell, e.g. '29.5,-82.5'
  chain text not null,           -- 'Publix', 'Aldi', 'Chipotle'
  item text not null,            -- 'Oikos Pro Greek yogurt, 4-pack'
  deal text not null,            -- 'BOGO', '$1.99/lb', 'Free bowl with student ID'
  price_usd numeric,             -- what you pay for the deal quantity, if known
  protein_g numeric,             -- total protein in that quantity, if known
  valid_from date,
  valid_to date not null,
  source_url text,
  created_at timestamptz not null default now()
);
create index if not exists deals_area_valid on public.deals (area, valid_to);
alter table public.deals enable row level security;
drop policy if exists "Deals are public" on public.deals;
create policy "Deals are public" on public.deals for select using (true);

-- Areas people have opened the app in, and when their deals were last refreshed
create table if not exists public.deal_areas (
  area text primary key,
  place text not null,           -- 'Gainesville, Florida'
  chains text[] not null default '{}',
  last_requested timestamptz not null default now(),
  last_refreshed timestamptz,
  refreshing_since timestamptz
);
alter table public.deal_areas enable row level security;  -- no policies: server only

-- Claims an area for refreshing if it's due (older than p_hours) and nobody else is already on it.
-- Returns true for exactly one caller, so two visitors can't trigger duplicate (paid) refreshes.
create or replace function public.claim_deal_refresh(p_area text, p_hours integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed text;
begin
  update public.deal_areas
     set refreshing_since = now()
   where area = p_area
     and (last_refreshed is null or last_refreshed < now() - make_interval(hours => p_hours))
     and (refreshing_since is null or refreshing_since < now() - interval '10 minutes')
  returning area into claimed;
  return claimed is not null;
end;
$$;
revoke all on function public.claim_deal_refresh(text, integer) from public, anon, authenticated;
grant execute on function public.claim_deal_refresh(text, integer) to service_role;
