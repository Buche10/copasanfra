-- =====================================================================
-- Copa Abogados - Generar de una vez los codigos (PIN) de refuerzos
-- =====================================================================
-- Pegar en Supabase: SQL Editor -> New query -> Run.
-- Si aparece el aviso "Potential issues detected", elegir "Run without RLS"
-- (las tablas ya tienen RLS; el aviso es generico).
--
-- Que hace:
--   Genera un codigo de 6 digitos para cada equipo de Abierta Varones y
--   +40 Varones que AUN NO tenga codigo, lo guarda cifrado (igual que el
--   boton del panel de Admin) y muestra la lista equipo / codigo.
--
-- IMPORTANTE:
--   - Los codigos se ven SOLO en el resultado de esta ejecucion. Usa
--     "Export" (CSV) o copialos antes de cerrar. No se pueden recuperar:
--     si se pierde uno, se regenera desde el panel de Admin.
--   - Despues de repartirlos, borra el CSV o la copia que hayas guardado.
--   - Los equipos que YA tienen codigo no se tocan (su codigo sigue valido).
--     Para regenerar TODOS (invalida los anteriores), ver la variante abajo.
-- =====================================================================

with eq as materialized (
  select
    t.id,
    t.data->>'category' as categoria,
    t.data->>'name'     as equipo,
    lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0') as codigo
  from public.teams t
  where t.data->>'category' in ('Abierta Varones', '+40 Varones')
    and not exists (select 1 from public.team_pins tp where tp.team_id = t.id)
),
guardados as (
  insert into public.team_pins (team_id, pin_hash, updated_at)
  select id, extensions.crypt(codigo, extensions.gen_salt('bf')), now()
  from eq
  on conflict (team_id) do update
    set pin_hash = excluded.pin_hash, updated_at = now()
  returning team_id
),
limpieza as (
  delete from public.team_pin_failures f
  using eq
  where f.team_id = eq.id
)
select eq.categoria, eq.equipo, eq.codigo
from eq
join guardados g on g.team_id = eq.id
order by eq.categoria, eq.equipo;

-- ---------------------------------------------------------------------
-- VARIANTE: regenerar los codigos de TODOS los equipos de Abierta y +40
-- (los codigos anteriores dejan de valer). Para usarla, borra la linea
--   and not exists (select 1 from public.team_pins tp where tp.team_id = t.id)
-- de la consulta de arriba y ejecutala.
-- ---------------------------------------------------------------------
