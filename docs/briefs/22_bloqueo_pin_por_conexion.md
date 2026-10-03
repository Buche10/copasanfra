# Brief 22: Bloqueo de intentos de PIN por conexión y script de prueba fiable

## Contexto
Proyecto: Copa Abogados (marca del cliente, NO Ualdo). Stack: Next.js 16.3 exportado como sitio **estático** (`output: 'export'` en `next.config.ts`, sin servidor propio: no hay Route Handlers ni middleware en producción), React 19, TypeScript, Supabase (tablas JSONB con RLS; la API REST la sirve PostgREST detrás de Cloudflare), Vitest. Antes de tocar código de Next lee la guía que corresponda en `node_modules/next/dist/docs/` (ver `AGENTS.md`).

Los Briefs 20 y 21 (sin commitear) permiten a los delegados habilitar refuerzos con un código (PIN) de 6 dígitos por equipo:
- función `public.register_reinforcement(p_pin, p_cedula, p_team_id, p_dorsal, p_position)` en `supabase/migracion-pin-refuerzos.sql`, con copias idénticas en `supabase/migracion-refuerzos.sql` y al final de `supabase/schema.sql`;
- tabla `public.team_pins` (RLS sin políticas) con `pin_hash`, `failed_attempts`, `locked_until`;
- funciones de Admin `admin_set_team_pin` y `admin_list_team_pins`;
- panel `src/components/AdminTeamPins.tsx` y lógica de estado en `src/lib/teamPins.ts`;
- formulario `src/components/ReinforcementForm.tsx`, mensajes en `src/lib/reinforcement.ts`;
- script de prueba `docs/consultas/prueba-refuerzos.sql`.

La auditoría del Brief 21 encontró:
1. **MEDIUM, bloqueo malintencionado.** El contador de fallos es por equipo. Los ids de equipo son públicos, así que cualquiera puede mandar 5 códigos falsos cada 15 minutos y dejar al equipo bloqueado permanentemente. Regenerar el código no ayuda, porque se vuelve a bloquear al instante (`migracion-pin-refuerzos.sql` líneas ~182-197).
2. **LOW, script de prueba con resultados falsos.** En `docs/consultas/prueba-refuerzos.sql` (líneas ~176-245) cada caso llama **dos veces** a `register_reinforcement`: una para la columna `obtenido` y otra para `pasa`. Como la función cambia el contador, los intentos se duplican y los resultados no corresponden a lo esperado. Ese script, tal como está, no sirve para verificar.
3. **LOW, documentación.** El brief decía "LOCKED a la quinta", pero el comportamiento real es 5 respuestas `BAD_PIN` y `LOCKED` desde el 6.º intento. Se mantiene así y se documenta.

Como no hay servidor propio, el límite por conexión tiene que vivir en la base. PostgREST expone las cabeceras de la petición con `current_setting('request.headers', true)` (JSON). Detrás de Cloudflare llega `cf-connecting-ip`, que el cliente no puede falsificar, y `x-forwarded-for`, que sí se puede manipular en su primer valor.

## Objetivo
Los fallos de código se cuentan por equipo y por conexión. Una conexión que falla 5 veces queda bloqueada 15 minutos para ese equipo, sin afectar al delegado real, que entra desde otra conexión. Como freno contra quien cambie de conexión para probar códigos, un equipo con 30 fallos en la última hora, sumando todas las conexiones, queda bloqueado 60 minutos para todos. Regenerar el código borra todos los fallos y desbloquea. El Admin ve cuántos fallos tuvo cada equipo en las últimas 24 horas. El script de prueba da resultados fiables.

## Decisiones de negocio (aplicarlas tal cual)
- **Identificador de conexión:**
  - `cf-connecting-ip`; si no viene, el primer valor de `x-forwarded-for`; si tampoco, `'desconocida'`.
  - Se guarda solo su **hash** (`encode(extensions.digest(ip || ':' || team_id, 'sha256'), 'hex')`), nunca la IP en claro.
- **Por conexión:** 5 fallos en los últimos 15 minutos para ese equipo bloquean esa conexión 15 minutos desde el último fallo. Respuestas: las 5 primeras, `BAD_PIN`; desde el 6.º intento, `LOCKED`. Este es el comportamiento documentado; corrige el texto del Brief 21, que decía "LOCKED a la quinta".
- **Por equipo:** 30 fallos en los últimos 60 minutos, de cualquier conexión, bloquean el equipo para todos 60 minutos. Respuesta `LOCKED`.
- **Un acierto** borra los fallos de esa conexión para ese equipo. Los fallos de otras conexiones se mantienen.
- **Regenerar el código** (`admin_set_team_pin`) borra todos los fallos del equipo.
- **Limpieza:** cada llamada borra los fallos de más de 24 horas (de cualquier equipo).
- **Si a pesar de todo un equipo queda bloqueado:** el Admin puede habilitar el refuerzo a mano con "Habilitar en otra categoría" (Brief 15). Indícalo en el panel de códigos con una línea de ayuda.

## Requerimientos
1. **Migración SQL** nueva `supabase/migracion-pin-por-conexion.sql`, idempotente y con la cabecera habitual. Copia el resultado final al final de `supabase/schema.sql`. Deja `register_reinforcement`, `admin_set_team_pin` y `admin_list_team_pins` **idénticas** en `schema.sql`, `migracion-refuerzos.sql`, `migracion-pin-refuerzos.sql` y la nueva migración, para que volver a ejecutar cualquiera de ellas no devuelva una versión anterior.
   - Tabla `public.team_pin_failures`:
     - `id bigserial primary key`;
     - `team_id text not null references public.teams(id) on delete cascade`;
     - `client_hash text not null`;
     - `failed_at timestamptz not null default now()`;
     - índices en `(team_id, client_hash, failed_at)` y `(team_id, failed_at)`;
     - RLS activado y **sin políticas**.
   - En `team_pins`: `alter table public.team_pins drop column if exists failed_attempts, drop column if exists locked_until;`. Los bloqueos se calculan ahora a partir de `team_pin_failures`.
   - Función auxiliar `public.request_client_hash(p_team_id text) returns text`, `stable`, `security definer`, `set search_path = public`:
     - lee `current_setting('request.headers', true)` con tolerancia: si es nulo o no es JSON válido, usa `'desconocida'`;
     - aplica el orden de cabeceras de las decisiones;
     - devuelve el hash. Sin `grant` a anon, porque solo la usa `register_reinforcement`.
   - **`register_reinforcement`** (misma firma de 5 parámetros), sustituyendo el paso 4 actual:
     1. `delete from public.team_pin_failures where failed_at < now() - interval '24 hours';`
     2. Si el equipo no tiene fila en `team_pins`: `NO_PIN`.
     3. `v_client := public.request_client_hash(p_team_id);`
     4. Si hay 30 o más fallos del equipo en los últimos 60 minutos: `LOCKED`.
     5. Si hay 5 o más fallos de `(equipo, v_client)` en los últimos 15 minutos: `LOCKED`.
     6. Si el código no coincide (`extensions.crypt`): insertar una fila en `team_pin_failures` y devolver `BAD_PIN`. Usa `return`, no `raise`, para que la fila quede guardada.
     7. Si coincide: borrar los fallos de `(equipo, v_client)` y seguir con el flujo actual (bloqueo por cédula, origen, `ALREADY_IN_CATEGORY`, cupo, dorsal, insertar).
   - **`admin_set_team_pin`:** además de lo actual, `delete from public.team_pin_failures where team_id = p_team_id;`. Quita las referencias a las columnas eliminadas.
   - **`admin_list_team_pins`** devuelve `table(team_id text, updated_at timestamptz, locked boolean, failures_24h int)`:
     - `locked` es verdadero si el equipo tiene 30 o más fallos en los últimos 60 minutos (bloqueo de equipo);
     - `failures_24h` es el número de fallos del equipo en las últimas 24 horas.

     Como cambia el tipo de retorno, primero `drop function if exists public.admin_list_team_pins();`.
   - Permisos sin cambios: `register_reinforcement` para `anon, authenticated`; las funciones de Admin solo para `authenticated`; `revoke all ... from public` en todas.
2. **Cliente:**
   - `src/lib/store.ts`: `adminListTeamPins` devuelve también `failures24h: number`.
   - `src/lib/teamPins.ts`: `TeamPinInfo` incluye `failures24h`. `formatPinStatus`:
     - si `locked`: "Bloqueado por intentos (60 min)";
     - si no está bloqueado y `failures24h > 0`: añade al texto de estado "N intentos fallidos en 24 h".
   - `src/components/AdminTeamPins.tsx`:
     - muestra ese texto;
     - si un equipo tiene 10 o más fallos en 24 h, lo resalta en ámbar;
     - añade la línea de ayuda: "Si un equipo no puede usar su código, regenéralo o habilita el refuerzo desde Jugadores > Habilitar en otra categoría.".
   - `src/lib/reinforcement.ts`: mensaje de `LOCKED`: "Demasiados intentos fallidos. Espera unos minutos o solicita un nuevo código a la organización.".
3. **Script de prueba** `docs/consultas/prueba-refuerzos.sql`, reescrito:
   - **Una sola llamada por caso.** Patrón:
     ```sql
     with r as (select public.register_reinforcement(...)->>'status' as s)
     insert into _test_results (caso, esperado, obtenido, pasa)
     select '<caso>', '<esperado>', s, s = '<esperado>' from r;
     ```
   - Simular conexiones con `select set_config('request.headers', '{"cf-connecting-ip":"10.0.0.1"}', true);` antes de cada grupo de casos.
   - Casos:
     - `NO_PIN`;
     - con la IP A, 5 veces `BAD_PIN` y la 6.ª `LOCKED`;
     - con la IP A, el código correcto también da `LOCKED`;
     - con la IP B, el código correcto da `OK`, porque el bloqueo de A no le afecta;
     - bloqueo de equipo: insertar directamente 30 filas de `team_pin_failures` con hashes distintos y `failed_at = now()`, y comprobar que con la IP C sale `LOCKED`;
     - simular la regeneración borrando los fallos del equipo (no se puede llamar a `admin_set_team_pin` sin sesión de Admin) y comprobar que ya no está bloqueado;
     - limpieza: una fila con `failed_at = now() - interval '25 hours'` desaparece tras cualquier llamada;
     - los casos del Brief 20 (`INVALID`, `CLOSED`, `NOT_ELIGIBLE`, `ALREADY_IN_CATEGORY`, `TEAM_FULL`, `DORSAL_TAKEN`), con una sola llamada cada uno.
   - Mantener `begin` ... `rollback` y la tabla de resultados al final con `select * from _test_results order by ...`. Indicar en la cabecera que el resultado esperado es `pasa = true` en todas las filas.

## Restricciones técnicas
- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla o nombres de archivo.
- Marca: NO aplicar la marca Ualdo.
- **Seguridad:**
  - nunca guardar IPs en claro (solo el hash con el equipo);
  - `team_pin_failures` sin políticas RLS;
  - funciones `security definer` con `set search_path = public` y nombres calificados (`public.`, `extensions.`);
  - sin SQL dinámico;
  - las funciones de Admin comprueban `is_admin()` en el servidor;
  - errores sin datos internos;
  - el código no se escribe en logs.
- No cambies el resto del flujo de `register_reinforcement` (origen, cupo, dorsal, inserción, respuesta sin cédula) ni las políticas RLS existentes.
- Funciones <50 líneas cuando sea razonable. En SQL, si `register_reinforcement` crece demasiado, extrae la comprobación de código a `public.check_team_pin(p_team_id text, p_pin text) returns text` (`security definer`, sin `grant` a anon), que devuelva `NO_PIN`, `LOCKED`, `BAD_PIN` u `OK`.
- `AdminModal.tsx`: sin cambios, salvo que haga falta pasar algo nuevo a `AdminTeamPins`.
- No añadas dependencias. No toques `tasks/`, `watch_tasks.*`, `.gitignore` ni archivos fuera del alcance.

## Tests
- `src/lib/teamPins.test.ts`: `formatPinStatus` con `locked` true; sin bloqueo y con 0 fallos; sin bloqueo y con 3 fallos (incluye "3 intentos fallidos en 24 h"); resaltado a partir de 10 fallos, si lo resuelves con una función pura.
- `src/lib/reinforcement.test.ts`: el nuevo texto de `LOCKED`.
- Cobertura >= 80% de `teamPins.ts` y `reinforcement.ts`.

## Verificación final (PowerShell, en `C:\laragon\www\Copa Abogados`)
1. `npm test` (solo puede fallar el test de equidad conocido del Brief 13)
2. `npm run lint`
3. `npm run build`
4. En Supabase (lo hace el usuario), en este orden:
   - `supabase/migracion-refuerzos.sql`;
   - `supabase/migracion-pin-refuerzos.sql`;
   - `supabase/migracion-pin-por-conexion.sql`;
   - `docs/consultas/prueba-refuerzos.sql`: todas las filas con `pasa = true` y sin datos persistidos.
5. Prueba manual con `npm run dev`:
   - desde un navegador, 6 códigos falsos dan `LOCKED`;
   - desde otra red (por ejemplo, datos móviles), el código correcto funciona;
   - en Admin > Ajustes se ve "6 intentos fallidos en 24 h" para ese equipo;
   - regenerar el código borra el contador.

## Criterios de aceptación
- [ ] Una conexión que falla 5 veces queda bloqueada 15 minutos solo para sí misma; otras conexiones del mismo equipo siguen funcionando.
- [ ] 30 fallos en 60 minutos, de cualquier conexión, bloquean el equipo 60 minutos.
- [ ] Regenerar el código borra todos los fallos del equipo.
- [ ] No se guardan IPs en claro; `team_pin_failures` no es accesible fuera de las funciones.
- [ ] El panel del Admin muestra los fallos de las últimas 24 horas y la ayuda para habilitar el refuerzo a mano.
- [ ] Las cuatro copias SQL tienen las mismas versiones finales de las funciones.
- [ ] `prueba-refuerzos.sql` hace una sola llamada por caso y todas las filas dan `pasa = true`.
- [ ] Tests en verde, cobertura >= 80%; lint y build sin errores; cero emojis.
