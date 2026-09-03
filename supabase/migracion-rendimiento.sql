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
