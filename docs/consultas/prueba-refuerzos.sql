-- =====================================================================
-- Copa Abogados - Pruebas de Habilitacion de Refuerzos con PIN y Conexion
-- =====================================================================
-- Instrucciones:
-- Pegar en Supabase: SQL Editor -> New query -> Run.
--
-- Comportamiento y reversion de datos:
-- Este script termina SIEMPRE con un error intencional (RAISE EXCEPTION) a proposito.
-- Al fallar la ultima sentencia, PostgreSQL revierte automaticamente toda la transaccion
-- del script (ROLLBACK automatico), garantizando que NUNCA quede ningun dato de prueba
-- guardado en la base de datos real (equipos, jugadores, fallos, etc.).
--
-- Resultado esperado en la consola de Supabase:
-- Un mensaje que dice textualmente:
-- "ERROR: FIN DE LA PRUEBA (todo se revierte): N de N casos pasan."
-- (Por ejemplo: "FIN DE LA PRUEBA (todo se revierte): 24 de 24 casos pasan.")
-- Si algun caso fallara, el mensaje indicara exactamente cuales casos fallaron
-- junto con sus valores esperados y obtenidos.
--
-- Documentacion de reglas de negocio:
-- - Bloqueo por conexion (ventana deslizante de 15 minutos):
--   Cuenta los fallos de una conexion para un equipo en los ultimos 15 min.
--   Cuando el fallo mas antiguo de los 5 cumple 15 minutos, la conexion
--   recupera un intento (~20 intentos por hora como maximo).
--   Los 5 primeros fallos responden BAD_PIN; desde el 6.to intento da LOCKED.
-- - Bloqueo global de equipo:
--   30 fallos en los ultimos 60 minutos (sumando todas las conexiones)
--   bloquea el equipo para todas las conexiones durante 60 minutos.
-- - Regeneracion de PIN:
--   admin_set_team_pin borra todos los fallos del equipo y lo desbloquea.
-- =====================================================================

-- 1. Guardar estado previo de settings si existe
create temp table _backup_settings on commit drop as
select * from public.settings where id = 'app';

-- 2. Configurar settings de prueba con refuerzos abiertos
insert into public.settings (id, data)
values ('app', jsonb_build_object(
  'registrationsOpen', true,
  'reinforcementsOpen', true,
  'suspendedCategories', '[]'::jsonb,
  'pausedCategories', '[]'::jsonb,
  'closedRegistrationCategories', '[]'::jsonb
))
on conflict (id) do update
set data = excluded.data;

-- 3. Crear equipos de prueba temporales
insert into public.teams (id, data) values
  ('t-test-abierta', '{"id": "t-test-abierta", "name": "Equipo Abierta Test", "category": "Abierta Varones"}'::jsonb),
  ('t-test-plus40', '{"id": "t-test-plus40", "name": "Equipo +40 Test", "category": "+40 Varones"}'::jsonb),
  ('t-test-plus50', '{"id": "t-test-plus50", "name": "Equipo +50 Test", "category": "+50 Varones"}'::jsonb),
  ('t-test-damas', '{"id": "t-test-damas", "name": "Equipo Damas Test", "category": "Damas"}'::jsonb),
  ('t-test-full', '{"id": "t-test-full", "name": "Equipo Lleno Test", "category": "Abierta Varones"}'::jsonb),
  ('t-test-nopin', '{"id": "t-test-nopin", "name": "Equipo Sin PIN Test", "category": "Abierta Varones"}'::jsonb),
  ('t-test-lock', '{"id": "t-test-lock", "name": "Equipo Para Bloqueo Test", "category": "Abierta Varones"}'::jsonb);

-- 4. Configurar PINs de prueba en team_pins (PIN: '123456')
insert into public.team_pins (team_id, pin_hash, updated_at) values
  ('t-test-abierta', extensions.crypt('123456', extensions.gen_salt('bf')), now()),
  ('t-test-plus40', extensions.crypt('123456', extensions.gen_salt('bf')), now()),
  ('t-test-full', extensions.crypt('123456', extensions.gen_salt('bf')), now()),
  ('t-test-lock', extensions.crypt('123456', extensions.gen_salt('bf')), now());
-- t-test-nopin queda deliberadamente sin registro en team_pins para probar NO_PIN

-- 5. Crear jugadores de prueba temporales
-- Jugador 1: aprobado en +40 (cedula 0911111111) elegible para Abierta (usado en Caso 4)
insert into public.players (id, data) values (
  'p-test-src-approved',
  jsonb_build_object(
    'id', 'p-test-src-approved',
    'teamId', 't-test-plus40',
    'name', 'Jugador Elegible Mas40',
    'cedula', '0911111111',
    'dorsal', 10,
    'position', 'DEL',
    'affiliation', 'Colegio de Abogados',
    'approvalStatus', 'APPROVED'
  )
);

-- Jugador 2: PENDIENTE en +40 (cedula 0922222222) - no elegible (usado en Caso 9)
insert into public.players (id, data) values (
  'p-test-src-pending',
  jsonb_build_object(
    'id', 'p-test-src-pending',
    'teamId', 't-test-plus40',
    'name', 'Jugador Pendiente Mas40',
    'cedula', '0922222222',
    'dorsal', 8,
    'position', 'MED',
    'affiliation', 'Colegio de Abogados',
    'approvalStatus', 'PENDING'
  )
);

-- Jugador 3: ya registrado en Abierta (cedula 0933333333) (usado en Caso 10)
insert into public.players (id, data) values
(
  'p-test-src-p3',
  jsonb_build_object(
    'id', 'p-test-src-p3',
    'teamId', 't-test-plus40',
    'name', 'Jugador Duplicado',
    'cedula', '0933333333',
    'dorsal', 5,
    'position', 'DEF',
    'approvalStatus', 'APPROVED'
  )
),
(
  'p-test-abierta-p3',
  jsonb_build_object(
    'id', 'p-test-abierta-p3',
    'teamId', 't-test-abierta',
    'name', 'Jugador Duplicado En Abierta',
    'cedula', '0933333333',
    'dorsal', 5,
    'position', 'DEF',
    'approvalStatus', 'APPROVED'
  )
);

-- Jugador 4: ocupa dorsal 9 en t-test-abierta (usado en Caso 11)
insert into public.players (id, data) values (
  'p-test-abierta-dorsal9',
  jsonb_build_object(
    'id', 'p-test-abierta-dorsal9',
    'teamId', 't-test-abierta',
    'name', 'Duenio Dorsal 9',
    'cedula', '0944444444',
    'dorsal', 9,
    'position', 'DEL',
    'approvalStatus', 'APPROVED'
  )
);

-- Jugador 5: aprobado en +40 (cedula 0955555555) elegible para Abierta (usado en Caso 6)
insert into public.players (id, data) values (
  'p-test-src-p5',
  jsonb_build_object(
    'id', 'p-test-src-p5',
    'teamId', 't-test-plus40',
    'name', 'Jugador Elegible Mas40 Caso 6',
    'cedula', '0955555555',
    'dorsal', 15,
    'position', 'DEL',
    'affiliation', 'Colegio de Abogados',
    'approvalStatus', 'APPROVED'
  )
);

-- Jugador 6: aprobado en +40 (cedula 0966666666) elegible para Abierta (usado en Caso 7.1)
insert into public.players (id, data) values (
  'p-test-src-p6',
  jsonb_build_object(
    'id', 'p-test-src-p6',
    'teamId', 't-test-plus40',
    'name', 'Jugador Elegible Mas40 Caso 7',
    'cedula', '0966666666',
    'dorsal', 16,
    'position', 'DEL',
    'affiliation', 'Colegio de Abogados',
    'approvalStatus', 'APPROVED'
  )
);

-- Jugador 7: aprobado en +50 (cedula 0977777777) elegible para +40 (usado en Casos 11 y 12)
insert into public.players (id, data) values (
  'p-test-src-plus50',
  jsonb_build_object(
    'id', 'p-test-src-plus50',
    'teamId', 't-test-plus50',
    'name', 'Jugador Elegible Mas50',
    'cedula', '0977777777',
    'dorsal', 4,
    'position', 'MED',
    'approvalStatus', 'APPROVED'
  )
);

-- Jugador 8: dorsal 13 en t-test-plus40 pero REJECTED (no debe bloquear dorsal en Caso 12)
insert into public.players (id, data) values (
  'p-test-plus40-dorsal13-rej',
  jsonb_build_object(
    'id', 'p-test-plus40-dorsal13-rej',
    'teamId', 't-test-plus40',
    'name', 'Rechazado Dorsal 13',
    'cedula', '0988888888',
    'dorsal', 13,
    'position', 'MED',
    'approvalStatus', 'REJECTED'
  )
);

-- Llenar t-test-full con 20 jugadores para simular cupo lleno (usado en Caso 13)
insert into public.players (id, data)
select
  'p-test-full-' || i,
  jsonb_build_object(
    'id', 'p-test-full-' || i,
    'teamId', 't-test-full',
    'name', 'Jugador Cupo ' || i,
    'cedula', '09500000' || lpad(i::text, 2, '0'),
    'dorsal', i,
    'position', 'MED',
    'approvalStatus', 'APPROVED'
  )
from generate_series(1, 20) as s(i);

-- ---------------------------------------------------------------------
-- 6. Ejecucion de Casos de Prueba (una sola llamada por caso)
-- ---------------------------------------------------------------------

create temp table _test_results (
  id serial primary key,
  caso text,
  esperado text,
  obtenido text,
  pasa boolean
) on commit drop;

-- NOTA DE COMPATIBILIDAD Y SEGURIDAD:
-- 1. La version anterior de register_reinforcement(text, text, int, text) con 4 parametros
--    ha sido eliminada con DROP FUNCTION. Ejecutar:
--    SELECT public.register_reinforcement('0911111111', 't-test-abierta', 7, 'DEL');
--    provoca el error: "function public.register_reinforcement(text, text, integer, unknown) does not exist".
-- 2. La funcion admin_set_team_pin(text) exige ser ADMIN mediante public.is_admin().
--    Si se llama sin sesion de administrador autenticado, lanza: "ERROR: forbidden".

-- Caso 1: NO_PIN (equipo destino sin registro en team_pins)
select set_config('request.headers', '{"cf-connecting-ip":"10.0.0.1"}', true);
with r as (select public.register_reinforcement('123456', '0911111111', 't-test-nopin', 7, 'DEL')->>'status' as s)
insert into _test_results (caso, esperado, obtenido, pasa)
select 'Caso 1: Equipo sin PIN configurado (NO_PIN)', 'NO_PIN', s, s = 'NO_PIN' from r;

-- Caso 2: IP A (10.0.0.1) falla 5 veces (BAD_PIN) y a la 6ta queda bloqueada (LOCKED)
-- Se acumulan 5 registros en team_pin_failures para IP A en t-test-lock
select set_config('request.headers', '{"cf-connecting-ip":"10.0.0.1"}', true);

with r as (select public.register_reinforcement('999999', '0911111111', 't-test-lock', 7, 'DEL')->>'status' as s)
insert into _test_results (caso, esperado, obtenido, pasa)
select 'Caso 2.1: IP A intento 1 fallido (BAD_PIN)', 'BAD_PIN', s, s = 'BAD_PIN' from r;

with r as (select public.register_reinforcement('999999', '0911111111', 't-test-lock', 7, 'DEL')->>'status' as s)
insert into _test_results (caso, esperado, obtenido, pasa)
select 'Caso 2.2: IP A intento 2 fallido (BAD_PIN)', 'BAD_PIN', s, s = 'BAD_PIN' from r;

with r as (select public.register_reinforcement('999999', '0911111111', 't-test-lock', 7, 'DEL')->>'status' as s)
insert into _test_results (caso, esperado, obtenido, pasa)
select 'Caso 2.3: IP A intento 3 fallido (BAD_PIN)', 'BAD_PIN', s, s = 'BAD_PIN' from r;

with r as (select public.register_reinforcement('999999', '0911111111', 't-test-lock', 7, 'DEL')->>'status' as s)
insert into _test_results (caso, esperado, obtenido, pasa)
select 'Caso 2.4: IP A intento 4 fallido (BAD_PIN)', 'BAD_PIN', s, s = 'BAD_PIN' from r;

with r as (select public.register_reinforcement('999999', '0911111111', 't-test-lock', 7, 'DEL')->>'status' as s)
insert into _test_results (caso, esperado, obtenido, pasa)
select 'Caso 2.5: IP A intento 5 fallido (BAD_PIN)', 'BAD_PIN', s, s = 'BAD_PIN' from r;

with r as (select public.register_reinforcement('999999', '0911111111', 't-test-lock', 7, 'DEL')->>'status' as s)
insert into _test_results (caso, esperado, obtenido, pasa)
select 'Caso 2.6: IP A intento 6 queda bloqueada (LOCKED)', 'LOCKED', s, s = 'LOCKED' from r;

-- Caso 3: IP A con codigo correcto tambien da LOCKED por estar bloqueada
-- Depende de los 5 fallos acumulados en el Caso 2 para la conexion 10.0.0.1
with r as (select public.register_reinforcement('123456', '0911111111', 't-test-lock', 7, 'DEL')->>'status' as s)
insert into _test_results (caso, esperado, obtenido, pasa)
select 'Caso 3: IP A con PIN correcto da LOCKED', 'LOCKED', s, s = 'LOCKED' from r;

-- Caso 4: IP B (10.0.0.2) no afectada por bloqueo de IP A, con PIN correcto da OK
-- Registra 0911111111 como PENDING en t-test-lock (Abierta Varones, dorsal 7)
select set_config('request.headers', '{"cf-connecting-ip":"10.0.0.2"}', true);
with r as (select public.register_reinforcement('123456', '0911111111', 't-test-lock', 7, 'DEL')->>'status' as s)
insert into _test_results (caso, esperado, obtenido, pasa)
select 'Caso 4: IP B entra sin bloqueo y con PIN correcto (OK)', 'OK', s, s = 'OK' from r;

-- Caso 5: Bloqueo general del equipo (30 fallos en 60 minutos de distintas conexiones)
-- Inserta 30 fallos simulados para t-test-lock; bloquea a cualquier IP
insert into public.team_pin_failures (team_id, client_hash, failed_at)
select 't-test-lock', 'fake-client-hash-' || i, now()
from generate_series(1, 30) as s(i);

select set_config('request.headers', '{"cf-connecting-ip":"10.0.0.3"}', true);
with r as (select public.register_reinforcement('123456', '0911111111', 't-test-lock', 14, 'DEL')->>'status' as s)
insert into _test_results (caso, esperado, obtenido, pasa)
select 'Caso 5: Equipo bloqueado para todos tras 30 fallos (LOCKED)', 'LOCKED', s, s = 'LOCKED' from r;

-- Caso 6: Simulacion de regeneracion de PIN (borra fallos del equipo y desbloquea)
-- Usa cedula 0955555555 (libre en Abierta) y dorsal libre 14 en t-test-lock
delete from public.team_pin_failures where team_id = 't-test-lock';
with r as (select public.register_reinforcement('123456', '0955555555', 't-test-lock', 14, 'DEL')->>'status' as s)
insert into _test_results (caso, esperado, obtenido, pasa)
select 'Caso 6: Desbloqueo tras regenerar codigo (OK)', 'OK', s, s = 'OK' from r;

-- Caso 7: Limpieza automatica de fallos >24h tras cualquier llamada
-- Inserta fallo con 25h de antiguedad y ejecuta registro con cedula 0966666666 en t-test-abierta
insert into public.team_pin_failures (team_id, client_hash, failed_at)
values ('t-test-abierta', 'hash-antiguo-25h', now() - interval '25 hours');

with r as (select public.register_reinforcement('123456', '0966666666', 't-test-abierta', 7, 'DEL')->>'status' as s)
insert into _test_results (caso, esperado, obtenido, pasa)
select 'Caso 7.1: Habilitacion en t-test-abierta (OK)', 'OK', s, s = 'OK' from r;

with r as (
  select (not exists (select 1 from public.team_pin_failures where client_hash = 'hash-antiguo-25h')) as cleaned
)
insert into _test_results (caso, esperado, obtenido, pasa)
select 'Caso 7.2: Limpieza de fallos de mas de 24h', 'true', cleaned::text, cleaned from r;

-- Casos del Brief 20
-- Caso 8: Cedula inexistente (NOT_ELIGIBLE)
with r as (select public.register_reinforcement('123456', '0999999999', 't-test-abierta', 11, 'DEL')->>'status' as s)
insert into _test_results (caso, esperado, obtenido, pasa)
select 'Caso 8: Cedula inexistente (NOT_ELIGIBLE)', 'NOT_ELIGIBLE', s, s = 'NOT_ELIGIBLE' from r;

-- Caso 9: Origen en PENDING (NOT_ELIGIBLE)
-- Usa cedula 0922222222 que esta PENDING en t-test-plus40
with r as (select public.register_reinforcement('123456', '0922222222', 't-test-abierta', 11, 'DEL')->>'status' as s)
insert into _test_results (caso, esperado, obtenido, pasa)
select 'Caso 9: Origen en PENDING (NOT_ELIGIBLE)', 'NOT_ELIGIBLE', s, s = 'NOT_ELIGIBLE' from r;

-- Caso 10: Ya en categoria destino (ALREADY_IN_CATEGORY)
-- Usa cedula 0933333333 que ya existe como APPROVED en t-test-abierta
with r as (select public.register_reinforcement('123456', '0933333333', 't-test-abierta', 12, 'DEF')->>'status' as s)
insert into _test_results (caso, esperado, obtenido, pasa)
select 'Caso 10: Ya en categoria destino (ALREADY_IN_CATEGORY)', 'ALREADY_IN_CATEGORY', s, s = 'ALREADY_IN_CATEGORY' from r;

-- Caso 11: Dorsal ocupado por jugador aprobado (DORSAL_TAKEN)
-- Usa dorsal 9 que esta ocupado en t-test-abierta por p-test-abierta-dorsal9
with r as (select public.register_reinforcement('123456', '0977777777', 't-test-abierta', 9, 'DEL')->>'status' as s)
insert into _test_results (caso, esperado, obtenido, pasa)
select 'Caso 11: Dorsal ocupado (DORSAL_TAKEN)', 'DORSAL_TAKEN', s, s = 'DORSAL_TAKEN' from r;

-- Caso 12: Dorsal ocupado por jugador REJECTED no bloquea y permite habilitacion
-- Usa dorsal 13 en t-test-plus40 ocupado por p-test-plus40-dorsal13-rej (REJECTED)
with r as (select public.register_reinforcement('123456', '0977777777', 't-test-plus40', 13, 'MED')->>'status' as s)
insert into _test_results (caso, esperado, obtenido, pasa)
select 'Caso 12: Dorsal con REJECTED no bloquea (OK)', 'OK', s, s = 'OK' from r;

-- Caso 13: Refuerzo permitido en equipo con cupo completo (20 jugadores) (OK)
-- t-test-full tiene 20 jugadores registrados; los refuerzos no ocupan cupo
with r as (select public.register_reinforcement('123456', '0977777777', 't-test-full', 25, 'DEL')->>'status' as s)
insert into _test_results (caso, esperado, obtenido, pasa)
select 'Caso 13: Refuerzo permitido en equipo con cupo lleno (OK)', 'OK', s, s = 'OK' from r;

-- Caso 14: Refuerzos cerrados por configuracion (CLOSED)
-- Desactiva reinforcementsOpen en settings
update public.settings
set data = jsonb_set(data, '{reinforcementsOpen}', 'false'::jsonb)
where id = 'app';

with r as (select public.register_reinforcement('123456', '0977777777', 't-test-abierta', 15, 'DEL')->>'status' as s)
insert into _test_results (caso, esperado, obtenido, pasa)
select 'Caso 14: Refuerzos cerrados globalmente (CLOSED)', 'CLOSED', s, s = 'CLOSED' from r;

-- Caso 15: Formato de PIN invalido (INVALID)
with r as (select public.register_reinforcement('123', '0977777777', 't-test-abierta', 15, 'DEL')->>'status' as s)
insert into _test_results (caso, esperado, obtenido, pasa)
select 'Caso 15: PIN formato invalido (INVALID)', 'INVALID', s, s = 'INVALID' from r;

-- Caso 16: Cedula corta (INVALID)
with r as (select public.register_reinforcement('123456', '123', 't-test-abierta', 15, 'DEL')->>'status' as s)
insert into _test_results (caso, esperado, obtenido, pasa)
select 'Caso 16: Cedula corta (INVALID)', 'INVALID', s, s = 'INVALID' from r;

-- Caso 17: Dorsal 0 (INVALID)
with r as (select public.register_reinforcement('123456', '0977777777', 't-test-abierta', 0, 'DEL')->>'status' as s)
insert into _test_results (caso, esperado, obtenido, pasa)
select 'Caso 17: Dorsal 0 (INVALID)', 'INVALID', s, s = 'INVALID' from r;

-- Caso 18: Destino no permitido Damas (INVALID)
with r as (select public.register_reinforcement('123456', '0977777777', 't-test-damas', 15, 'DEL')->>'status' as s)
insert into _test_results (caso, esperado, obtenido, pasa)
select 'Caso 18: Destino no permitido Damas (INVALID)', 'INVALID', s, s = 'INVALID' from r;

-- ---------------------------------------------------------------------
-- 7. Resumen de resultados y rollback automatico mediante excepcion
-- ---------------------------------------------------------------------
-- Al terminar con RAISE EXCEPTION, PostgreSQL revierte todo el script
-- en una sola transaccion y el SQL Editor de Supabase muestra el resumen:
-- "FIN DE LA PRUEBA (todo se revierte): N de N casos pasan."
-- ---------------------------------------------------------------------

do $$
declare
  v_total int;
  v_passed int;
  v_failed_details text;
begin
  select count(*), count(*) filter (where pasa)
  into v_total, v_passed
  from _test_results;

  if v_passed = v_total then
    raise exception 'FIN DE LA PRUEBA (todo se revierte): % de % casos pasan.', v_passed, v_total;
  else
    select string_agg(caso || ' (esperado: ' || esperado || ', obtenido: ' || obtenido || ')', '; ' order by id)
    into v_failed_details
    from _test_results
    where not pasa;

    raise exception 'FIN DE LA PRUEBA (todo se revierte): fallan los casos: %', v_failed_details;
  end if;
end $$;
