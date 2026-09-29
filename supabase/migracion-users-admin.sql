-- =====================================================================
-- Copa Abogados — Migracion: Proteccion de escritura en users (solo ADMIN)
-- =====================================================================
-- Ejecutalo UNA vez en Supabase: SQL Editor -> New query -> pegar -> Run.
-- (Es idempotente: puedes correrlo de nuevo sin problema.)
-- =====================================================================
-- Nota: El primer usuario ADMIN se crea directamente desde el SQL Editor
-- de Supabase (que ignora RLS), tal como describe supabase/seed.sql.
-- =====================================================================

-- 1) Asegurar que la funcion is_admin() existe y es security definer
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where lower(u.data->>'email') = lower(auth.jwt()->>'email')
      and u.data->>'role' = 'ADMIN'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- 2) Actualizar la politica de escritura en public.users
-- Solo administradores pueden crear, modificar o eliminar filas en users.
drop policy if exists "users_write" on public.users;

create policy "users_write" on public.users
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
