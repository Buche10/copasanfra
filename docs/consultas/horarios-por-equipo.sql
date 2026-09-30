-- =====================================================================
-- Copa Abogados — Consulta: reparto de horarios por equipo
-- =====================================================================
-- Solo LECTURA. Pegar en Supabase: SQL Editor -> New query -> Run.
-- Por cada equipo: cuantos partidos tiene programados, cuantos en los dos
-- primeros turnos (08:00 y 09:15), cuantos en los dos ultimos, y el turno
-- promedio (0 = 08:00, 7 = 16:45). Ordenado de mas madrugador a menos.
with turnos as (
  select * from (values
    ('08:00', 0), ('09:15', 1), ('10:30', 2), ('11:45', 3),
    ('13:00', 4), ('14:15', 5), ('15:30', 6), ('16:45', 7)
  ) as v(hora, idx)
),
partidos as (
  select m.data->>'homeTeamId' as team_id, m.data->>'time' as hora
  from public.matches m
  where coalesce((m.data->>'isPlayoff')::boolean, false) = false
  union all
  select m.data->>'awayTeamId', m.data->>'time'
  from public.matches m
  where coalesce((m.data->>'isPlayoff')::boolean, false) = false
)
select
  t.data->>'name'                                   as equipo,
  t.data->>'category'                               as categoria,
  coalesce(t.data->>'clubId', '-')                  as club,
  count(*)                                          as partidos,
  count(*) filter (where tu.idx <= 1)               as en_08_00_o_09_15,
  round(100.0 * count(*) filter (where tu.idx <= 1) / count(*)) as pct_temprano,
  count(*) filter (where tu.idx >= 6)               as en_ultimos_turnos,
  round(avg(tu.idx), 2)                             as turno_promedio
from partidos p
join turnos tu on tu.hora = p.hora
join public.teams t on t.id = p.team_id
group by t.id, t.data
order by turno_promedio asc, pct_temprano desc;
