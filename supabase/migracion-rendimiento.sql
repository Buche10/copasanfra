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
