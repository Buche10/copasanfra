-- =====================================================================
-- Copa Abogados — Migración: Arbitraje + limpieza
-- =====================================================================
-- Ejecútalo UNA vez en Supabase: SQL Editor -> New query -> pegar -> Run.
-- (Es idempotente: puedes correrlo de nuevo sin problema.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabla de pagos de arbitraje (respaldo va a Storage, no aquí)
-- ---------------------------------------------------------------------
create table if not exists public.payments (
  id   text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.payments enable row level security;

drop policy if exists "payments_read"          on public.payments;
drop policy if exists "payments_public_insert" on public.payments;
drop policy if exists "payments_write"         on public.payments;
create policy "payments_read"  on public.payments for select using (true);
create policy "payments_public_insert" on public.payments
  for insert to anon
  with check (coalesce(data->>'status', 'PENDING') = 'PENDING');
create policy "payments_write" on public.payments for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- 2) Storage: bucket público "respaldos" (comprobantes de arbitraje)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('respaldos', 'respaldos', true)
on conflict (id) do update set public = true;

-- Bucket público: los enlaces ya funcionan sin política SELECT. Solo permitimos
-- que el delegado SUBA (anon insert) y que el Admin gestione (authenticated).
-- No se crea SELECT pública para que nadie pueda LISTAR todos los comprobantes.
drop policy if exists "respaldos_read"        on storage.objects;
drop policy if exists "respaldos_anon_insert" on storage.objects;
drop policy if exists "respaldos_auth_write"  on storage.objects;
create policy "respaldos_anon_insert" on storage.objects for insert to anon          with check (bucket_id = 'respaldos');
create policy "respaldos_auth_write"  on storage.objects for all    to authenticated using (bucket_id = 'respaldos') with check (bucket_id = 'respaldos');

-- ---------------------------------------------------------------------
-- 3) Borrar los nombres de TODOS los representantes (delegados)
-- ---------------------------------------------------------------------
update public.teams set data = jsonb_set(data, '{delegate}', '""'::jsonb);

-- ---------------------------------------------------------------------
-- 4) Eliminar el equipo "Sporting Legal" (antes "Sport Legal") y sus datos
--    OJO: si el equipo a borrar es otro, cambia el id o hazlo desde el
--    panel Admin con el botón "Eliminar" (borra equipo + jugadores + partidos).
-- ---------------------------------------------------------------------
delete from public.players where data->>'teamId'     = 'team-ab-6';
delete from public.matches where data->>'homeTeamId' = 'team-ab-6'
                              or data->>'awayTeamId'  = 'team-ab-6';
delete from public.teams   where id = 'team-ab-6';
