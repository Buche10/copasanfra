-- =====================================================================
-- Copa Abogados — Migracion: Multas por tarjetas y pagos
-- =====================================================================
-- Ejecutalo UNA vez en Supabase: SQL Editor -> New query -> pegar -> Run.
-- (Es idempotente: puedes correrlo de nuevo sin problema.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Helper para validar rol de administrador desde JWT y tabla users
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 2) Tabla de pagos de multas por tarjeta
-- ---------------------------------------------------------------------
create table if not exists public.fine_payments (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.fine_payments enable row level security;

-- ---------------------------------------------------------------------
-- 3) Politicas RLS: solo lectura y escritura para rol ADMIN
-- ---------------------------------------------------------------------
drop policy if exists "fine_payments_admin_read" on public.fine_payments;
drop policy if exists "fine_payments_admin_write" on public.fine_payments;

create policy "fine_payments_admin_read" on public.fine_payments
  for select to authenticated
  using (public.is_admin());

create policy "fine_payments_admin_write" on public.fine_payments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 4) Indice por equipo para acelerar consultas de saldo y pagos
-- ---------------------------------------------------------------------
create index if not exists fine_payments_team_idx on public.fine_payments ((data->>'teamId'));
