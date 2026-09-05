-- =====================================================================
-- Copa Abogados — Migración: rendimiento de la nómina (arregla timeouts)
-- =====================================================================
-- Ejecútalo en Supabase: SQL Editor -> New query -> pegar TODO -> Run.
-- Es idempotente (se puede correr de nuevo).
--
-- IMPORTANTE (evitar "deadlock detected"): esta app está EN VIVO, así que la
-- migración compite por bloqueos con las consultas de la página. Por eso:
--   * lock_timeout = 4s: si un paso no consigue el bloqueo, FALLA RÁPIDO (no se
--     traba). Si algún paso falla, simplemente vuelve a correr el script.
--   * Los pasos van del más liviano al más pesado; si el último falla, los de
--     arriba YA quedaron aplicados (incluida la subida de timeouts que desbloquea
--     la página). Puedes reintentar solo la Sección 5.
-- =====================================================================

set lock_timeout = '4s';

-- ---------------------------------------------------------------------
-- 1) URGENTE: subir el límite de tiempo (desbloquea la carga pública).
--    No toca tablas, no se traba.
-- ---------------------------------------------------------------------
alter role authenticated set statement_timeout = '20s';
alter role anon          set statement_timeout = '30s';

-- ---------------------------------------------------------------------
-- 2) Verificación de cédula (existe / por categoría).
-- ---------------------------------------------------------------------
create or replace function public.cedula_exists(p_cedula text)
returns boolean language sql security definer stable as $$
  select exists (select 1 from public.players where btrim(data->>'cedula') = btrim(p_cedula));
$$;
revoke all on function public.cedula_exists(text) from public;
grant execute on function public.cedula_exists(text) to anon, authenticated;

create or replace function public.cedula_check(p_cedula text, p_team_id text)
returns text language plpgsql security definer stable as $$
declare
  target_cat text;
  same_team  boolean;
  same_cat   boolean;
begin
  select data->>'category' into target_cat from public.teams where id = p_team_id;
  select exists (
    select 1 from public.players p
    where btrim(p.data->>'cedula') = btrim(p_cedula) and p.data->>'teamId' = p_team_id
  ) into same_team;
  if same_team then return 'SAME_TEAM'; end if;
  select exists (
    select 1 from public.players p
    join public.teams t on t.id = p.data->>'teamId'
    where btrim(p.data->>'cedula') = btrim(p_cedula) and t.data->>'category' = target_cat
  ) into same_cat;
  if same_cat then return 'SAME_CATEGORY'; end if;
  return 'OK';
end $$;
revoke all on function public.cedula_check(text, text) from public;
grant execute on function public.cedula_check(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) Ajustes globales (categorías suspendidas / próximamente).
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id text primary key, data jsonb not null, updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;
drop policy if exists "settings_read"  on public.settings;
drop policy if exists "settings_write" on public.settings;
create policy "settings_read"  on public.settings for select using (true);
create policy "settings_write" on public.settings for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- 4) Tabla de respaldos aparte (player_docs).
-- ---------------------------------------------------------------------
create table if not exists public.player_docs (
  id text primary key, data jsonb not null, updated_at timestamptz not null default now()
);
alter table public.player_docs enable row level security;
drop policy if exists "player_docs_read"          on public.player_docs;
drop policy if exists "player_docs_public_insert"  on public.player_docs;
drop policy if exists "player_docs_write"          on public.player_docs;
create policy "player_docs_read"          on public.player_docs for select to authenticated using (true);
create policy "player_docs_public_insert" on public.player_docs for insert to anon          with check (true);
create policy "player_docs_write"         on public.player_docs for all    to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- 5) (Puede reintentarse solo) Mover respaldos existentes y recrear la vista.
--    Si aquí sale "deadlock"/"lock timeout", vuelve a correr el script: las
--    secciones 1-4 ya quedaron aplicadas y esta se reintenta sola.
-- ---------------------------------------------------------------------
insert into public.player_docs (id, data)
  select id, jsonb_build_object('verificationDoc', data->'verificationDoc')
  from public.players
  where data ? 'verificationDoc'
  on conflict (id) do update set data = excluded.data;

update public.players set data = data - 'verificationDoc' where data ? 'verificationDoc';

-- create or replace: recrea la vista con un solo bloqueo (no drop+create).
create or replace view public.players_admin as
  select p.id,
    (p.data - 'verificationDoc')
      || jsonb_build_object('hasDoc', exists (select 1 from public.player_docs d where d.id = p.id)) as data
  from public.players p;
grant select on public.players_admin to authenticated;
