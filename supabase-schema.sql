-- Run once in the Supabase SQL editor. Authentication must have Email enabled.
create table if not exists public.viki_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{"inventory":[],"presets":{},"favoriteRules":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.viki_state enable row level security;

create policy "Operators read their VIKI state"
on public.viki_state for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Operators create their VIKI state"
on public.viki_state for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Operators update their VIKI state"
on public.viki_state for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
