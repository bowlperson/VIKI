-- Run once in the Supabase SQL editor. Authentication must have Email enabled.
create table if not exists public.viki_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{"inventory":[],"presets":{},"favoriteRules":{},"reminders":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.viki_state enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on table public.viki_state to authenticated;

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

-- Cash profiles are separate from registry state so operators can switch between
-- balances without changing the active household inventory.
create table if not exists public.viki_cash_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  balance bigint not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

alter table public.viki_cash_profiles enable row level security;

grant select, insert, update on table public.viki_cash_profiles to authenticated;

create policy "Operators read their cash profiles"
on public.viki_cash_profiles for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "Operators create their cash profiles"
on public.viki_cash_profiles for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy "Operators update their cash profiles"
on public.viki_cash_profiles for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create or replace function public.increment_viki_cash(profile_id uuid, amount bigint default 250)
returns bigint
language plpgsql
set search_path = public
as $$
declare
  new_balance bigint;
begin
  if amount <= 0 then raise exception 'Cash increment must be positive'; end if;
  update public.viki_cash_profiles
  set balance = balance + amount, updated_at = now()
  where id = profile_id and owner_id = (select auth.uid())
  returning balance into new_balance;
  if new_balance is null then raise exception 'Cash profile not found'; end if;
  return new_balance;
end;
$$;

revoke all on function public.increment_viki_cash(uuid, bigint) from public;
grant execute on function public.increment_viki_cash(uuid, bigint) to authenticated;
