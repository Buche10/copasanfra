-- =====================================================================
-- Copa Abogados — Consulta: inscritos en una categoria con inscripcion cerrada
-- =====================================================================
-- Solo LECTURA: no modifica nada. Pegar en Supabase: SQL Editor -> New query -> Run.
--
-- Paso 1 (opcional): ver cuando se cambiaron por ultima vez los ajustes
-- (cerrar/abrir categorias). Sirve como referencia de la fecha de cierre,
-- pero si despues se cambio otro ajuste, esta fecha sera posterior.
select updated_at at time zone 'America/Guayaquil' as ultimo_cambio_ajustes,
       data->'closedRegistrationCategories'     as categorias_cerradas
from public.settings
where id = 'app';

-- Paso 2: jugadores inscritos desde el formulario publico en 'Abierta Varones'
-- desde la fecha indicada (hora de Ecuador). Cambia la fecha si cerraste la
-- categoria otro dia. Incluye pendientes y aprobados.
select
  (p.data->>'registeredAt')::timestamptz at time zone 'America/Guayaquil' as inscrito_el,
  p.data->>'name'           as jugador,
  p.data->>'cedula'         as cedula,
  p.data->>'dorsal'         as dorsal,
  t.data->>'name'           as equipo,
  p.data->>'approvalStatus' as estado,
  p.id                      as player_id
from public.players p
join public.teams t on t.id = p.data->>'teamId'
where t.data->>'category' = 'Abierta Varones'
  and p.data ? 'registeredAt'
  and (p.data->>'registeredAt')::timestamptz >= timestamptz '2026-09-23 00:00:00-05'
order by inscrito_el desc;
