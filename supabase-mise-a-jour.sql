-- Mise à jour : suppression de compte + statistiques d'inscriptions réservées à l'administratrice.
-- À coller dans Supabase → SQL Editor → New query, puis « Run » (une seule fois).
-- ⚠️ Remplace ton@email.fr (dernière ligne) par l'email de TON compte dans l'app.

-- 1. Liste des administratrices (invisible depuis l'app)
create table if not exists public.admins (email text primary key);
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

-- 2. Statistiques d'inscriptions (refusées à toute personne qui n'est pas admin)
create or replace function public.admin_stats() returns json
language plpgsql stable security definer set search_path = public, auth as $$
declare r json;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select json_build_object(
    'total',   (select count(*) from auth.users),
    'last7',   (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'last30',  (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'active7', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'days',    (select coalesce(json_agg(json_build_object('d', d, 'n', n) order by d), '[]'::json) from (
                  select g::date as d, (select count(*) from auth.users u where u.created_at::date = g::date) as n
                  from generate_series(current_date - 29, current_date, interval '1 day') g) t),
    'latest',  (select coalesce(json_agg(json_build_object('email', email, 'at', created_at) order by created_at desc), '[]'::json) from (
                  select email, created_at from auth.users order by created_at desc limit 10) l)
  ) into r;
  return r;
end $$;

-- 3. Suppression de son propre compte (et de ses données, grâce au « on delete cascade »)
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.admin_stats() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- 4. Toi, en tant qu'administratrice
insert into public.admins (email) values ('ton@email.fr') on conflict do nothing;
