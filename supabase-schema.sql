-- Run this once in the Supabase SQL editor. VIKI authenticates each operator with
-- Supabase Auth and Row Level Security keeps each account's document private.
create table if not exists public.viki_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  inventory jsonb not null default '[]'::jsonb,
  presets jsonb not null default '{}'::jsonb,
  favorite_rules jsonb not null default '{}'::jsonb,
  app_settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.viki_data enable row level security;
create policy "operators read their own VIKI data" on public.viki_data
  for select using (auth.uid() = user_id);
create policy "operators create their own VIKI data" on public.viki_data
  for insert with check (auth.uid() = user_id);
create policy "operators update their own VIKI data" on public.viki_data
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "operators delete their own VIKI data" on public.viki_data
  for delete using (auth.uid() = user_id);
