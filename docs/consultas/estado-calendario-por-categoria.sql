-- =====================================================================
-- Copa Abogados — Consulta: estado del calendario por categoria
-- =====================================================================
-- Solo LECTURA. Pegar en Supabase: SQL Editor -> New query -> Run.

-- 1) Por categoria: equipos, partidos, jugados, pendientes, primera y ultima fecha,
--    y cuantos partidos pendientes quedaron en fechas ya pasadas.
with eq as (
  select data->>'category' as categoria, count(*) as equipos
  from public.teams group by 1
),
pa as (
  select
    data->>'category' as categoria,
    count(*) as partidos,
    count(*) filter (where data->>'status' in ('FINISHED', 'IN_PROGRESS')) as jugados,
    count(*) filter (where data->>'status' = 'SCHEDULED') as pendientes,
    count(*) filter (where data->>'status' = 'SCHEDULED'
                       and (data->>'date')::date < (now() at time zone 'America/Guayaquil')::date) as pendientes_en_fechas_pasadas,
    min(data->>'date') as primera_fecha,
    max(data->>'date') as ultima_fecha
  from public.matches group by 1
)
select eq.categoria, eq.equipos, coalesce(pa.partidos, 0) as partidos, coalesce(pa.jugados, 0) as jugados,
       coalesce(pa.pendientes, 0) as pendientes, coalesce(pa.pendientes_en_fechas_pasadas, 0) as pendientes_en_fechas_pasadas,
       pa.primera_fecha, pa.ultima_fecha
from eq left join pa using (categoria)
order by eq.categoria;

-- 2) Partidos por sabado futuro (capacidad: 8 turnos x 2 canchas = 16 por sabado).
select data->>'date' as sabado,
       count(*) as partidos,
       string_agg(distinct data->>'category', ', ') as categorias
from public.matches
where (data->>'date')::date >= (now() at time zone 'America/Guayaquil')::date
group by 1
order by 1;

-- 3) Estado de las categorias en los ajustes (activa / proximamente / pausa / suspendida).
select data->'comingSoonCategories' as proximamente,
       data->'pausedCategories'     as en_pausa,
       data->'suspendedCategories'  as suspendidas
from public.settings where id = 'app';
