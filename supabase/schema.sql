-- =====================================================================
-- Copa Abogados de Tungurahua — Esquema de base de datos (Supabase)
-- =====================================================================
-- Cómo usarlo:
--   1. Entra a tu proyecto en https://supabase.com
--   2. Menú lateral: SQL Editor -> New query
--   3. Pega TODO este archivo y presiona "Run"
--
-- Modelo: cada entidad se guarda como una fila { id, data (jsonb) }.
-- Esto preserva exactamente las formas de datos que usa la app
-- (equipos, jugadores, partidos con eventos/alineaciones/finanzas anidados).
-- =====================================================================

-- ---------- Tablas ----------
create table if not exists public.teams (
  id   text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.players (
  id   text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.matches (
  id   text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id   text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Pagos de arbitraje por equipo/fecha. El respaldo (comprobante) se guarda en
-- Storage (bucket "respaldos"); aquí solo va la URL pública dentro de `data`.
create table if not exists public.payments (
  id   text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- Row Level Security (Fase 2: seguridad) ----------
-- Lectura PÚBLICA (cualquiera ve la tabla de posiciones, goleadores, etc.)
-- Escritura solo para usuarios AUTENTICADOS vía Supabase Auth
-- (administrador y árbitros que inician sesión con email + contraseña).

alter table public.teams    enable row level security;
alter table public.players  enable row level security;
alter table public.matches  enable row level security;
alter table public.users    enable row level security;
alter table public.payments enable row level security;

-- Elimina políticas previas (incluida la versión abierta de la fase 1)
drop policy if exists "teams_public_rw"   on public.teams;
drop policy if exists "players_public_rw" on public.players;
drop policy if exists "matches_public_rw" on public.matches;
drop policy if exists "users_public_rw"   on public.users;

-- Macro manual por tabla: SELECT público + INSERT/UPDATE/DELETE autenticado.

-- teams
drop policy if exists "teams_read"   on public.teams;
drop policy if exists "teams_write"  on public.teams;
create policy "teams_read"  on public.teams for select using (true);
create policy "teams_write" on public.teams for all to authenticated using (true) with check (true);

-- players (Fase 3: PII protegida)
-- La tabla base contiene datos sensibles (cedula, verificationDoc) y NO es de
-- lectura pública. El público lee la vista `players_public` (sin esos campos).
-- Escritura completa (editar/borrar) solo autenticados. Excepción: la
-- INSCRIPCIÓN pública permite a anónimos INSERTAR un jugador, únicamente en
-- estado PENDING (el admin luego aprueba/rechaza).
drop policy if exists "players_read"          on public.players;
drop policy if exists "players_read_auth"     on public.players;
drop policy if exists "players_write"         on public.players;
drop policy if exists "players_public_insert" on public.players;
create policy "players_read_auth" on public.players for select to authenticated using (true);
create policy "players_write"     on public.players for all    to authenticated using (true) with check (true);
create policy "players_public_insert" on public.players
  for insert to anon
  with check (coalesce(data->>'approvalStatus', 'PENDING') = 'PENDING');

-- Vista pública: mismos jugadores pero SIN cédula ni documento de respaldo.
-- (Se ejecuta con privilegios del creador, por eso el público la puede leer
--  aunque la tabla base esté protegida.)
drop view if exists public.players_public;
create view public.players_public as
  select id, (data - 'cedula' - 'verificationDoc') as data
  from public.players;
grant select on public.players_public to anon, authenticated;

-- Vista para el STAFF autenticado (admin/árbitros): incluye la cédula pero NO
-- el documento de respaldo (verificationDoc), que puede ser una imagen pesada
-- en base64 y hace lenta la lectura de toda la nómina (timeouts en móviles).
-- En su lugar expone `hasDoc` (si existe respaldo); el documento se lee aparte,
-- solo cuando se necesita verlo.
drop view if exists public.players_admin;
create view public.players_admin as
  select id,
    (data - 'verificationDoc') || jsonb_build_object('hasDoc', (data ? 'verificationDoc')) as data
  from public.players;
grant select on public.players_admin to authenticated;

-- Margen de tiempo de consulta más alto para el staff (evita el timeout al leer
-- la nómina si algún respaldo pendiente aún es grande).
alter role authenticated set statement_timeout = '20s';

-- Verifica si una cédula YA está registrada, devolviendo solo verdadero/falso
-- (no expone ningún dato). Se usa en la inscripción pública para evitar
-- registros duplicados. Es security definer para poder consultar la tabla
-- protegida sin dar acceso de lectura a los anónimos.
create or replace function public.cedula_exists(p_cedula text)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.players
    where btrim(data->>'cedula') = btrim(p_cedula)
  );
$$;
revoke all on function public.cedula_exists(text) from public;
grant execute on function public.cedula_exists(text) to anon, authenticated;

-- Verifica si una cédula puede inscribirse en un equipo dado. Un jugador puede
-- repetir en OTRA categoría solo si el equipo es del MISMO dueño (clubId).
-- Devuelve: 'OK' (permitido), 'SAME_TEAM' (ya está en ese mismo equipo) u
-- 'OTHER_OWNER' (ya está en un equipo de otro dueño). No expone datos.
create or replace function public.cedula_check(p_cedula text, p_team_id text)
returns text
language plpgsql
security definer
stable
as $$
declare
  target_owner text;
  same_team    boolean;
  other_owner  boolean;
begin
  select coalesce(data->>'clubId', id) into target_owner from public.teams where id = p_team_id;

  select exists (
    select 1 from public.players p
    where btrim(p.data->>'cedula') = btrim(p_cedula)
      and p.data->>'teamId' = p_team_id
  ) into same_team;
  if same_team then return 'SAME_TEAM'; end if;

  select exists (
    select 1 from public.players p
    join public.teams t on t.id = p.data->>'teamId'
    where btrim(p.data->>'cedula') = btrim(p_cedula)
      and coalesce(t.data->>'clubId', t.id) is distinct from target_owner
  ) into other_owner;
  if other_owner then return 'OTHER_OWNER'; end if;

  return 'OK';
end $$;
revoke all on function public.cedula_check(text, text) from public;
grant execute on function public.cedula_check(text, text) to anon, authenticated;

-- matches
drop policy if exists "matches_read"  on public.matches;
drop policy if exists "matches_write" on public.matches;
create policy "matches_read"  on public.matches for select using (true);
create policy "matches_write" on public.matches for all to authenticated using (true) with check (true);

-- users (contiene emails/nombres del staff: NO es de lectura pública)
drop policy if exists "users_read"  on public.users;
drop policy if exists "users_write" on public.users;
create policy "users_read"  on public.users for select to authenticated using (true);
create policy "users_write" on public.users for all    to authenticated using (true) with check (true);

-- payments (arbitraje)
-- Lectura pública: todos ven qué equipos ya cancelaron cada fecha.
-- INSERT anónimo: el delegado sube su respaldo (queda en estado PENDING).
-- UPDATE/DELETE solo autenticados: el Admin aprueba/rechaza/elimina.
drop policy if exists "payments_read"          on public.payments;
drop policy if exists "payments_public_insert" on public.payments;
drop policy if exists "payments_write"         on public.payments;
create policy "payments_read"  on public.payments for select using (true);
create policy "payments_public_insert" on public.payments
  for insert to anon
  with check (coalesce(data->>'status', 'PENDING') = 'PENDING');
create policy "payments_write" on public.payments for all to authenticated using (true) with check (true);

-- ---------- Storage: bucket público de respaldos ----------
-- Crea el bucket "respaldos" (público para lectura). Si ya existe, no hace nada.
insert into storage.buckets (id, name, public)
values ('respaldos', 'respaldos', true)
on conflict (id) do update set public = true;

-- Políticas sobre storage.objects para ESTE bucket:
--   * INSERT anónimo (el delegado sube el respaldo desde la web pública).
--   * UPDATE/DELETE solo autenticados (limpieza por el Admin).
-- NO se crea una política SELECT pública: al ser un bucket público, los enlaces
-- (URL pública) ya funcionan sin RLS. Una SELECT amplia solo permitiría LISTAR
-- todos los comprobantes, lo que preferimos evitar.
drop policy if exists "respaldos_read"        on storage.objects;
drop policy if exists "respaldos_anon_insert" on storage.objects;
drop policy if exists "respaldos_auth_write"  on storage.objects;
create policy "respaldos_anon_insert" on storage.objects for insert to anon          with check (bucket_id = 'respaldos');
create policy "respaldos_auth_write"  on storage.objects for all    to authenticated using (bucket_id = 'respaldos') with check (bucket_id = 'respaldos');
