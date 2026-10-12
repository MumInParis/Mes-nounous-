-- Installation complète (nouveau projet Supabase).
-- À coller dans Supabase → SQL Editor → New query, puis « Run ».
-- Ensuite, lance aussi supabase-mise-a-jour.sql (suppression de compte + statistiques admin).

create table if not exists public.user_data (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

drop policy if exists "lire" on public.user_data;
drop policy if exists "creer" on public.user_data;
drop policy if exists "modifier" on public.user_data;
drop policy if exists "supprimer" on public.user_data;

create policy "lire" on public.user_data for select to authenticated using (auth.uid() = user_id);
create policy "creer" on public.user_data for insert to authenticated with check (auth.uid() = user_id);
create policy "modifier" on public.user_data for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "supprimer" on public.user_data for delete to authenticated using (auth.uid() = user_id);
