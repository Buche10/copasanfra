-- Anula el partido Abogadasos vs Futleg del 2026-10-24 (jornada 7, Abierta Varones),
-- que se había dado por ganado 3-0 por tiempo de espera, y lo reprograma para
-- jugarse de nuevo el 2026-11-21 a las 15:35 en la Cancha 1.
-- Respaldo del registro original: docs/respaldos/partido-m-abiertavarones-192-antes-de-anular.json
-- Ejecutar en Supabase > SQL Editor.

update public.matches
set data = (data
            - 'signedAt'
            - 'signedBy'
            - 'refereeNotes'
            - 'homeGoalkeeperId'
            - 'awayGoalkeeperId')
         || jsonb_build_object(
              'status', 'SCHEDULED',
              'homeScore', 0,
              'awayScore', 0,
              'events', '[]'::jsonb,
              'homeLineup', '[]'::jsonb,
              'awayLineup', '[]'::jsonb,
              'refereeSigned', false,
              'date', '2026-11-21',
              'time', '15:35',
              'stadium', 'Cancha 1'
            )
where id = 'm-abiertavarones-192'
  and data->>'status' = 'FINISHED'
returning id, data->>'status' as estado, data->>'date' as fecha, data->>'time' as hora, data->>'stadium' as cancha;
