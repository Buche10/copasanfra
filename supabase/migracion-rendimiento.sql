-- =====================================================================
-- Copa Abogados — Migración: rendimiento de la nómina (arregla timeouts)
-- =====================================================================
-- Ejecútalo UNA vez en Supabase: SQL Editor -> New query -> pegar -> Run.
-- Es idempotente (se puede correr de nuevo).
--
-- Problema: leer TODA la nómina con el documento de respaldo (verificationDoc,
-- imagen en base64) es lento y a veces supera el límite de tiempo de consulta,
-- dejando la página en blanco en el celular.
--
-- Solución: una vista liviana para el staff (con cédula, SIN el respaldo) y un
-- margen de tiempo mayor. El respaldo se lee aparte, solo al pulsar "Ver".
-- =====================================================================

drop view if exists public.players_admin;
create view public.players_admin as
  select id,
    (data - 'verificationDoc') || jsonb_build_object('hasDoc', (data ? 'verificationDoc')) as data
  from public.players;
grant select on public.players_admin to authenticated;

alter role authenticated set statement_timeout = '20s';

-- Verificación de cédula duplicada (solo devuelve verdadero/falso; no expone
-- datos). Se usa en la inscripción pública para evitar registros repetidos.
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

-- Cédula por dueño: permite repetir en otra categoría SOLO si el equipo es del
-- mismo dueño. 'OK' | 'SAME_TEAM' | 'OTHER_OWNER'.
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

-- Ajustes globales del torneo (categorías suspendidas, etc.). Lectura pública,
-- escritura autenticada. Una sola fila id='app'.
create table if not exists public.settings (
  id   text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;
drop policy if exists "settings_read"  on public.settings;
drop policy if exists "settings_write" on public.settings;
create policy "settings_read"  on public.settings for select using (true);
create policy "settings_write" on public.settings for all to authenticated using (true) with check (true);
