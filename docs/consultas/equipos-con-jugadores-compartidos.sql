-- =====================================================================
-- Copa Abogados — Consulta: equipos que comparten jugadores (misma cedula)
-- =====================================================================
-- Solo LECTURA. Pegar en Supabase: SQL Editor -> New query -> Run.
-- Lista cada par de equipos con jugadores en comun, si son del mismo dueño
-- y cuantos jugadores comparten. No muestra cedulas.
with jug as (
  select
    regexp_replace(btrim(p.data->>'cedula'), '[.\- ]', '', 'g') as ced,
    p.data->>'teamId' as team_id
  from public.players p
  where coalesce(btrim(p.data->>'cedula'), '') <> ''
    and coalesce(p.data->>'approvalStatus', 'APPROVED') <> 'REJECTED'
)
select
  ta.data->>'name'     as equipo_a,
  ta.data->>'category' as categoria_a,
  tb.data->>'name'     as equipo_b,
  tb.data->>'category' as categoria_b,
  case
    when ta.data->>'clubId' is not null and ta.data->>'clubId' = tb.data->>'clubId'
    then 'si' else 'no'
  end                  as mismo_dueno,
  count(distinct a.ced) as jugadores_compartidos
from jug a
join jug b on b.ced = a.ced and a.team_id < b.team_id
join public.teams ta on ta.id = a.team_id
join public.teams tb on tb.id = b.team_id
group by ta.id, ta.data, tb.id, tb.data
order by mismo_dueno, jugadores_compartidos desc;
