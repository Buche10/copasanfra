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

-- Ajustes globales del torneo (una sola fila id='app'): categorías suspendidas, etc.
create table if not exists public.settings (
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
alter table public.settings enable row level security;

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

-- Documentos de respaldo (imagen del carné/certificado) EN TABLA APARTE, para
-- que la nómina (players) sea liviana y las lecturas públicas no hagan timeout.
-- FK con ON DELETE CASCADE: al borrar el jugador se borra su respaldo.
create table if not exists public.player_docs (
  id   text primary key references public.players(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.player_docs enable row level security;
drop policy if exists "player_docs_read"          on public.player_docs;
drop policy if exists "player_docs_public_insert"  on public.player_docs;
drop policy if exists "player_docs_write"          on public.player_docs;
-- Lectura SOLO staff (el respaldo es sensible). INSERT anónimo (inscripción).
create policy "player_docs_read"          on public.player_docs for select to authenticated using (true);
create policy "player_docs_public_insert" on public.player_docs for insert to anon          with check (true);
create policy "player_docs_write"         on public.player_docs for all    to authenticated using (true) with check (true);

-- Vista para el STAFF autenticado (admin/árbitros): incluye la cédula pero NO
-- el documento de respaldo (vive en player_docs). Expone `hasDoc` según exista
-- un respaldo, para mostrar el botón "Ver Respaldo" (que lo carga aparte).
drop view if exists public.players_admin;
create view public.players_admin as
  select p.id,
    (p.data - 'verificationDoc')
      || jsonb_build_object('hasDoc', exists (select 1 from public.player_docs d where d.id = p.id)) as data
  from public.players p;
grant select on public.players_admin to authenticated;

-- Margen de tiempo de consulta más alto (evita timeouts). Público y staff.
alter role authenticated set statement_timeout = '20s';
alter role anon          set statement_timeout = '30s';

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
-- estar en dos equipos SOLO si son de CATEGORÍAS DISTINTAS.
-- Devuelve: 'OK' (permitido), 'SAME_TEAM' (ya está en ese mismo equipo) o
-- 'SAME_CATEGORY' (ya está en otro equipo de la misma categoría). No expone datos.
create or replace function public.cedula_check(p_cedula text, p_team_id text)
returns text
language plpgsql
security definer
stable
as $$
declare
  target_cat text;
  same_team  boolean;
  same_cat   boolean;
begin
  select data->>'category' into target_cat from public.teams where id = p_team_id;

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
      and t.data->>'category' = target_cat
  ) into same_cat;
  if same_cat then return 'SAME_CATEGORY'; end if;

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

-- settings: lectura pública (el público necesita saber qué categorías están
-- suspendidas), escritura solo autenticados (Admin).
drop policy if exists "settings_read"  on public.settings;
drop policy if exists "settings_write" on public.settings;
create policy "settings_read"  on public.settings for select using (true);
create policy "settings_write" on public.settings for all to authenticated using (true) with check (true);

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
