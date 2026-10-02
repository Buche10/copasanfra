-- =====================================================================
-- Copa Abogados — Consulta: huecos entre partidos del mismo dueño por fecha
-- =====================================================================
-- Solo LECTURA. Pegar en Supabase: SQL Editor -> New query -> Run.
-- Analiza los partidos futuros agrupados por fecha y dueño (clubId o id de equipo),
-- calculando turnos libres entre partidos consecutivos del mismo dueño el mismo día.
-- Muestra primero los casos que superan la regla (más de 1 turno libre).

with turnos as (
  select * from (values
    ('08:00', 0), ('09:15', 1), ('10:30', 2), ('11:45', 3),
    ('13:00', 4), ('14:15', 5), ('15:30', 6), ('16:45', 7)
  ) as v(hora, idx)
),
partidos_dueno as (
  select distinct
    m.id as match_id,
    m.data->>'date' as fecha,
    m.data->>'time' as hora,
    coalesce(t.data->>'clubId', t.id) as dueno_id,
    coalesce(t.data->>'clubId', t.data->>'name') as dueno_nombre,
    t.data->>'name' as equipo
  from public.matches m
  join public.teams t on t.id in (m.data->>'homeTeamId', m.data->>'awayTeamId')
  where coalesce(m.data->>'date', '') >= to_char(current_date, 'YYYY-MM-DD')
    and coalesce(m.data->>'time', '') <> ''
    and coalesce(m.data->>'status', 'SCHEDULED') = 'SCHEDULED'
),
partidos_ordenados as (
  select
    p.fecha,
    p.dueno_id,
    p.dueno_nombre,
    p.hora,
    tu.idx as turno_idx,
    p.equipo,
    lead(p.hora) over (partition by p.fecha, p.dueno_id order by tu.idx) as sig_hora,
    lead(tu.idx) over (partition by p.fecha, p.dueno_id order by tu.idx) as sig_turno_idx,
    lead(p.equipo) over (partition by p.fecha, p.dueno_id order by tu.idx) as sig_equipo
  from partidos_dueno p
  join turnos tu on tu.hora = p.hora
)
select
  fecha,
  dueno_nombre as dueno,
  hora as hora_desde,
  equipo as equipo_desde,
  sig_hora as hora_hasta,
  sig_equipo as equipo_hasta,
  (sig_turno_idx - turno_idx - 1) as turnos_libres,
  case
    when (sig_turno_idx - turno_idx - 1) > 1 then 'ALERTA: mas de 1 turno libre'
    when (sig_turno_idx - turno_idx - 1) = 1 then 'OK: exactamente 1 turno libre'
    else 'OK: turnos seguidos'
  end as estado_regla
from partidos_ordenados
where sig_turno_idx is not null
order by (sig_turno_idx - turno_idx - 1) desc, fecha asc, dueno_nombre asc;
