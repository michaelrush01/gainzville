-- Saved store lists per ~1 km area, so the map doesn't depend on the free (and sometimes
-- overloaded) OpenStreetMap servers every time. Only the server, using the secret key, reads or writes.

create table if not exists public.store_cache (
  key text primary key,          -- '29.64,-82.35' (lat/lng rounded to 2 decimals)
  stores jsonb not null,         -- the store list the app shows
  full_list boolean not null,    -- true = groceries + restaurants (Overpass); false = grocery-only backup
  updated_at timestamptz not null default now()
);
alter table public.store_cache enable row level security;  -- no policies: server only

-- Explicit Data API grants (Supabase stops auto-granting new public tables on 2026-10-30)
grant all on public.store_cache to service_role;
