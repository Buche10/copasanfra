-- =====================================================================
-- Copa Abogados - Consulta: jugadores con cedula placeholder ('1800000000')
-- =====================================================================
-- Solo LECTURA. Pegar en Supabase: SQL Editor -> New query -> Run.
-- Lista los jugadores creados con la cedula por defecto '1800000000' agrupados
-- por equipo y categoria, para que el administrador pueda corregirlos manualmente.

-- Resumen por equipo: cantidad de jugadores con cedula placeholder
select
  t.id                                  as equipo_id,
  t.data->>'name'                       as equipo,
  t.data->>'category'                   as categoria,
  count(p.id)                           as total_jugadores_placeholder
from public.players p
join public.teams t on t.id = p.data->>'teamId'
where btrim(p.data->>'cedula') = '1800000000'
group by t.id, t.data
order by total_jugadores_placeholder desc, equipo asc;

-- Detalle individual de jugadores con cedula placeholder
select
  p.id                                  as jugador_id,
  p.data->>'name'                       as nombre_jugador,
  p.data->>'dorsal'                     as dorsal,
  p.data->>'position'                   as posicion,
  coalesce(p.data->>'approvalStatus', 'APPROVED') as estado_aprobacion,
  t.data->>'name'                       as equipo,
  t.data->>'category'                   as categoria
from public.players p
join public.teams t on t.id = p.data->>'teamId'
where btrim(p.data->>'cedula') = '1800000000'
order by t.data->>'category', t.data->>'name', p.data->>'name';
