-- La jornada 10 (sábado 2026-11-21) no se jugó: se pasa al sábado 2026-11-28 y
-- todas las fechas por jugar avanzan 7 días (28-nov -> 5-dic, ..., 2-ene -> 9-ene).
-- Horarios y canchas no cambian. Afecta 59 partidos (status SCHEDULED desde el 21-nov).
-- Respaldo de las fechas originales: docs/respaldos/fechas-antes-de-correr-semana.json
-- Ejecutar UNA sola vez en Supabase > SQL Editor.

update public.matches
set data = data || jsonb_build_object(
  'date', to_char((data->>'date')::date + 7, 'YYYY-MM-DD')
)
where data->>'status' = 'SCHEDULED'
  and data->>'date' >= '2026-11-21'
returning id, data->>'category' as categoria, data->>'round' as jornada,
          data->>'date' as fecha, data->>'time' as hora;
