-- À coller dans Supabase → SQL Editor → New query, puis « Run ».
-- Crée la table qui stocke les données de chaque compte.
-- Chaque personne ne peut lire et modifier que ses propres données.

create table if not exists public.user_data (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

drop policy if exists "lire ses données" on public.user_data;
drop policy if exists "créer ses données" on public.user_data;
drop policy if exists "modifier ses données" on public.user_data;
drop policy if exists "supprimer ses données" on public.user_data;

create policy "lire ses données" on public.user_data
  for select to authenticated using (auth.uid() = user_id);

create policy "créer ses données" on public.user_data
  for insert to authenticated with check (auth.uid() = user_id);

create policy "modifier ses données" on public.user_data
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "supprimer ses données" on public.user_data
  for delete to authenticated using (auth.uid() = user_id);
