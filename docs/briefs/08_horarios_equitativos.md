# Brief 08: Horarios equitativos y descanso para jugadores en dos equipos

## Contexto
Proyecto: Copa Abogados. Stack: Next.js 16.3 (ver `AGENTS.md`), React 19, TypeScript, Tailwind 4, Supabase, Vitest (`npm test`).

Queja de los equipos: algunos juegan siempre en los primeros horarios. La causa está en `src/lib/fixtureGenerator.ts`, función `scheduleMatchday` (líneas 49-227), que asigna turno y cancha a los partidos de un sábado. La usan `generateRandomFixture` (línea ~483), `repackSchedule` (línea ~723), `regenerateCategories` (línea ~586), `moveTeamCategory` (línea ~635) y, por extensión, `scheduleAround` (línea ~529).

Reglas actuales:
- DURA: dos equipos del mismo dueño (`Team.clubId`) nunca juegan a la misma hora.
- BLANDA: los equipos de un mismo dueño juegan en turnos consecutivos.
- El día se llena desde el primer turno (08:00), sin huecos al inicio.
- Turnos: `MATCH_TIME_SLOTS` (8, de 08:00 a 16:45) x `CANCHAS` (2), definidos en `src/types/index.ts`.

Regla nueva pedida por el cliente (equipos que comparten jugadores):
- Hay jugadores inscritos en dos equipos (misma cédula, categorías distintas). La inscripción lo permite aunque los equipos sean de dueños DISTINTOS (función SQL `cedula_check` en `supabase/schema.sql`, línea ~186; NO se cambia). El calendario hoy no lo sabe: solo agrupa por `clubId`.
- Esos dos equipos NUNCA pueden jugar a la misma hora, y entre sus dos partidos del mismo sábado debe quedar EXACTAMENTE UN TURNO LIBRE para que el jugador descanse (por ejemplo 08:00 y 10:30; nunca 08:00 y 09:15). Si es imposible dejar exactamente uno, se permite más separación, pero nunca turnos seguidos ni simultáneos.
- El comentario de `checkCedula` en `src/lib/store.ts` (línea ~108) dice "solo si el equipo es del mismo dueño", y eso no es lo que hace la base. Corregir el comentario para que diga "en otra categoría" (no cambiar la lógica).

Por qué hay sesgo (tres causas deterministas):
1. El orden inicial de dueños es "los de más equipos primero" (`baseOrder`, línea 219), y el bucle de reintentos aleatorios (línea 221) solo corre si ese primer intento tiene huecos (`best.score > 0`). En la práctica el primer intento casi siempre sale sin huecos, así que los mismos dueños grandes se procesan primero todos los sábados.
2. La ventana de turnos de cada dueño se busca desde el turno 0 hacia adelante (`for (let start = 0; ...)`, línea 128), así que el primero en procesarse ocupa siempre 08:00, 09:15...
3. Los partidos sueltos van al primer turno libre (`placeAnywhere`, línea 110).

Evidencia (simulación: 20 temporadas con `INITIAL_TEAMS` de `src/lib/mockData.ts`; turno 0 = 08:00):
- Equipos de Abierta con dueño de varios equipos (Futleg, AKD, IDUS, Leones Q, Boman, Alianza, Lawyers): turno promedio 1,45-1,63 y 39-49 % de sus partidos a las 08:00 o 09:15.
- Equipos de Damas sin dueño compartido (Bef, Damas de la Justicia, Elite Legal): turno promedio 4,7 y 7-9 % en esos turnos.

Además, `repackSchedule` vuelve a acomodar TODAS las fechas, incluidas las ya jugadas, y les cambia la hora a partidos finalizados.

## Objetivo
Los equipos que comparten jugadores nunca juegan a la vez y tienen exactamente un turno libre entre sus partidos. A lo largo de la temporada, cada equipo reparte sus partidos de forma pareja entre turnos tempranos, medios y tardíos, sin romper ninguna de las reglas de dueño. El administrador puede equilibrar las fechas que aún no se han jugado con un botón, viendo antes cuántos partidos cambiarían de hora. Las fechas ya jugadas nunca se modifican.

## Requerimientos
1. Mover la lógica de turnos a un módulo propio y testeable: `src/lib/scheduling/matchday.ts` con `scheduleMatchday` exportada, más sus tipos. `fixtureGenerator.ts` la importa. Si el archivo nuevo supera ~300 líneas, separar el equilibrio en `src/lib/scheduling/fairness.ts`.
2. Historial de horarios: tipo `SlotHistory = ReadonlyMap<string, readonly number[]>` (teamId -> cuántas veces jugó en cada turno, un array de longitud `slotCount`). Funciones puras en `fairness.ts`:
   - `buildSlotHistory(matches: Match[], slotCount: number): SlotHistory`, a partir de partidos con `time` válido (ignorar play offs y partidos sin equipos).
   - `addToHistory(history, placements): SlotHistory` (devuelve un mapa nuevo, sin mutar).
   - `slotBand(slot: number, slotCount: number): 0 | 1 | 2`: temprano, medio o tarde, en tercios.
   - `fairnessCost(history, teamId, slot, slotCount): number`: cuántas veces ya jugó ese equipo en la misma franja que `slot`, más la mitad de las veces que jugó exactamente en ese turno.
   - `fairnessReport(matches, teams, slotCount)`: por equipo, partidos, % temprano, % tarde y turno promedio (para el panel y los tests).
3. Equipos que comparten jugadores, en `src/lib/scheduling/sharedPlayers.ts`:
   - `buildSharedPlayerPairs(players: Player[]): ReadonlySet<string>`: pares de equipos distintos con al menos una cédula en común (normalizada con `trim()` y sin puntos ni guiones). Representar cada par como clave ordenada `"teamA|teamB"`. Ignorar jugadores sin cédula y jugadores `REJECTED`.
   - `sharesPlayers(pairs, teamA, teamB): boolean`.
   - Si la lista de jugadores no trae cédulas (vista pública `players_public`), devolver un conjunto vacío. Las funciones de calendario solo se ejecutan desde el panel Admin, donde `players` sí trae la cédula (vista `players_admin`); verificarlo en `src/app/page.tsx` y, si no la trae, cargar la versión completa antes de programar.
4. `scheduleMatchday(dayMatches, clubOf, slotCount, fieldsPerSlot, options?: { history?: SlotHistory; sharedPairs?: ReadonlySet<string>; rng?: () => number })`:
   - Relación "vinculados": dos equipos están vinculados si tienen el mismo dueño O comparten jugadores.
   - DURA 1: dos equipos vinculados nunca juegan en el mismo turno (sustituye a la regla DURA actual, que solo miraba al dueño).
   - DURA 2: dos equipos que comparten jugadores nunca juegan en turnos seguidos (distancia de turno >= 2).
   - BLANDA A (descanso exacto): para cada par que comparte jugadores, penalizar `(distancia - 2)`; lo ideal es distancia 2 (exactamente un turno libre).
   - BLANDA B (dueño compacto): los equipos de un mismo dueño juegan lo más juntos posible. Contar como hueco cada turno vacío entre sus partidos, SALVO el turno libre obligatorio entre dos de sus equipos que comparten jugadores.
   - Mantener el día empezando en el turno 0. Con `history` y `sharedPairs` vacíos o ausentes, el resultado debe cumplir las mismas reglas que hoy.
   - La búsqueda por "ventana de turnos contiguos" del dueño deja de servir cuando hay descansos obligatorios. Sustituirla por una ventana de tamaño `k + descansos obligatorios del dueño` o, si es más simple, por la construcción greedy más reintentos más reparación, siempre que los tests de reglas pasen.
   - Correr SIEMPRE los reintentos aleatorios (no cortar cuando `score === 0`), con un límite fijo (por ejemplo 300) y un generador aleatorio con semilla (ver punto 7) para que los tests sean reproducibles.
   - Puntuación combinada, en orden estricto de prioridad: `violacionesDuras * 1_000_000 + (descansoExacto + huecosDeDueño) * 1_000 + costeDeEquidad`, donde `costeDeEquidad` es la suma de `fairnessCost` de los dos equipos de cada partido en su turno asignado.
   - Búsqueda de ventana del dueño: probar todas las posiciones válidas de `start` y quedarse con la de menor coste de equidad (no la primera).
   - `placeAnywhere`: entre los turnos libres válidos, elegir el de menor coste de equidad para los dos equipos (desempate: el turno más temprano, para no dejar huecos al inicio).
   - Tras elegir la mejor colocación, un último paso de "compactar": si quedan turnos totalmente vacíos ANTES del último turno usado, correr los partidos hacia arriba sin romper ninguna regla (tampoco el turno libre de los equipos que comparten jugadores: ese turno queda libre para ESOS equipos, pero lo pueden ocupar otros partidos), para que el día siga empezando a las 08:00 y sin turnos vacíos intermedios.
   - La reparación local existente (`repair`) sigue funcionando con la puntuación completa: solo acepta un intercambio si no crea violaciones duras y baja la puntuación total (primero descanso exacto y huecos de dueño, luego equidad).
5. `generateRandomFixture(teams, blockedByCategory?, players?: Player[])`: construir `sharedPairs` con `buildSharedPlayerPairs(players ?? [])`, procesar los sábados en orden cronológico (ya lo hace) y pasar a cada `scheduleMatchday` el historial acumulado de los sábados anteriores (`addToHistory`) junto con `sharedPairs`. Actualizar la llamada en `src/app/page.tsx` para pasar `players`.
6. Nueva función `rebalanceFutureDates(matches, teams, players, hiddenCategories, today = localDateString()): { matches: Match[]; changed: number; perDate: { date: string; changed: number }[] }` en `fixtureGenerator.ts` (o en `src/lib/scheduling/rebalance.ts`):
   - Solo toca fechas ESTRICTAMENTE futuras (`date > today`) en las que TODOS los partidos siguen en `SCHEDULED`. Las demás fechas quedan exactamente igual.
   - El historial se construye con las fechas anteriores (jugadas o no) y se va acumulando fecha por fecha.
   - Mantiene la lógica de categorías ocultas de `repackSchedule` (sus partidos se estacionan al final).
   - No cambia enfrentamientos, jornadas ni fechas: solo `time` y `stadium`.
   - Aplica las reglas de equipos que comparten jugadores (`buildSharedPlayerPairs(players)`).
   - `localDateString` ya existe en `src/lib/finesReport.ts`; reutilízala (o muévela a un util compartido y actualiza los imports).
7. Aleatoriedad reproducible: añadir en `src/lib/scheduling/random.ts` un PRNG con semilla (por ejemplo mulberry32) y un `shuffleWith(rng, array)`. `scheduleMatchday` recibe un `rng` opcional (por defecto `Math.random`), para que los tests fijen la semilla.
8. `repackSchedule`, `regenerateCategories`, `moveTeamCategory` y `scheduleAround`: aceptar `players` (parámetro opcional al final, para no romper llamadas) y respetar las reglas de equipos que comparten jugadores. `repackSchedule` tampoco debe modificar fechas ya jugadas o pasadas (mismo filtro que el punto 6) y debe usar el historial. Actualizar las llamadas en `src/app/page.tsx`.
9. Panel Admin, en `src/components/AdminModal.tsx` (sección donde está el botón de `onRepackSchedule`, línea ~1096), un bloque nuevo "Equidad de horarios", extraído a `src/components/AdminScheduleFairness.tsx` (no añadir lógica a `AdminModal.tsx`, que ya supera las 1200 líneas):
   - Tabla de `fairnessReport` sobre el calendario actual: equipo, categoría, partidos, % temprano (08:00-09:15), % tarde, turno promedio. Orden por turno promedio. Resaltar en ámbar a los equipos con más del doble de % temprano que la media.
   - Botón "Equilibrar fechas no jugadas": calcula `rebalanceFutureDates` y muestra un `window.confirm` con "Se cambiará la hora de N partidos en M fechas (de la F1 a la Fn). Las fechas ya jugadas no se tocan." Solo si se confirma, persiste con `replaceMatches` (igual que `handleRepackSchedule` en `src/app/page.tsx`, línea ~545), con reversión y mensaje si falla.
   - Debajo de la tabla, una lista "Equipos que comparten jugadores" (pares de `buildSharedPlayerPairs`, mostrando nombres de equipo y la cantidad de jugadores en común, SIN mostrar cédulas ni nombres de jugadores), y una alerta en rojo por cada sábado futuro donde alguno de esos pares juega simultáneo o en turnos seguidos.
   - En `page.tsx`, nuevo handler `handleRebalanceSchedule` y prop `onRebalanceSchedule` para `AdminModal`.
10. No tocar nada de marcadores, eventos, play offs (`recomputePlayoffs` se sigue llamando como hoy tras reprogramar) ni fechas.

## Restricciones técnicas
- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla o nombres de archivo. Iconos solo con `lucide-react` (SVG).
- Repo de un cliente con marca propia: NO aplicar la marca Ualdo. Mantener el estilo visual del panel Admin.
- Sigue las convenciones existentes del repo.
- Prioridad estricta: reglas duras (vinculados nunca simultáneos; equipos con jugadores compartidos nunca seguidos) > descanso exacto de un turno y dueño compacto > equidad de horarios.
- No cambiar la regla de inscripción (`cedula_check`) ni ninguna política SQL.
- Diseño: SOLID, DRY, KISS, funciones <50 líneas, archivos <800 líneas, sin anidación >4 niveles, inmutabilidad en las funciones nuevas, manejo de errores explícito.
- Rendimiento: `scheduleMatchday` debe seguir tardando menos de 200 ms por sábado con 16 partidos (medirlo en un test).
- No añadas dependencias.
- No toques archivos fuera del alcance indicado. No toques `tasks/`, `watch_tasks.*` ni `.gitignore`.

## Tests
`src/lib/scheduling/matchday.test.ts` y `fairness.test.ts` (con semilla fija):
- Reglas: 300 generaciones de temporada completa con `INITIAL_TEAMS` y 0 choques de dueño, 0 dos partidos en la misma cancha y turno, y dueños compactos (0 huecos salvo los descansos obligatorios).
- Jugadores compartidos: con un set de jugadores de prueba en el que dos equipos de dueños DISTINTOS y dos equipos del MISMO dueño comparten cédula, en 300 generaciones esos pares nunca juegan simultáneos ni seguidos, y quedan exactamente a un turno libre en al menos el 95 % de los sábados en que ambos juegan.
- `buildSharedPlayerPairs`: normaliza la cédula (espacios, puntos, guiones), ignora cédulas vacías y jugadores `REJECTED`, no crea pares de un equipo consigo mismo, y la clave del par es la misma sin importar el orden.
- Día compacto: en cada sábado, los turnos usados son `0..k` sin huecos.
- Equidad: con `generateRandomFixture(INITIAL_TEAMS)` promediado en 20 temporadas, la diferencia de turno promedio entre el equipo más temprano y el más tardío de una misma categoría es <= 1,0, y ningún equipo supera el 35 % de partidos a las 08:00 o 09:15. (Hoy: Futleg 1,45 frente a Sanfra Legal 2,03 en Abierta, y hasta 49 % temprano.)
- `rebalanceFutureDates`: no cambia ninguna fecha pasada ni ninguna con un partido que no esté `SCHEDULED`; conserva enfrentamientos, jornada y fecha; `changed` coincide con el número de partidos cuyo `time` o `stadium` cambió.
- `buildSlotHistory`, `addToHistory` (sin mutar la entrada), `slotBand`, `fairnessCost` y `fairnessReport` con casos pequeños a mano.
- Rendimiento: `scheduleMatchday` con 16 partidos en menos de 200 ms.

Cobertura >=80% en `src/lib/scheduling/*`. Añadir esos archivos a `coverage.include` en `vitest.config.ts`. Comandos: `npm test`, `npm run test:coverage`.

Verificación manual:
1. Admin > Configuración > "Equidad de horarios": la tabla muestra el reparto actual.
2. Pulsar "Equilibrar fechas no jugadas", leer el aviso y cancelar: nada cambia.
3. Repetir y confirmar: las fechas ya jugadas quedan igual; en las futuras, los equipos marcados en ámbar bajan su % temprano; ningún dueño juega dos partidos a la misma hora; los equipos que comparten jugadores quedan con un turno libre entre sus partidos; el día sigue empezando a las 08:00.
4. La lista "Equipos que comparten jugadores" coincide con la consulta `docs/consultas/equipos-con-jugadores-compartidos.sql` ejecutada en Supabase.

## Verificación final
1. `npm test`
2. `npm run test:coverage`
3. `npm run lint`
4. `npx tsc --noEmit`
5. `npm run build`

## Criterios de aceptación
- [ ] Reglas de dueño y día compacto desde las 08:00 intactos (tests de 300 generaciones).
- [ ] Los equipos que comparten jugadores (mismo dueño o no) nunca juegan simultáneos ni seguidos, y quedan con exactamente un turno libre entre sus partidos.
- [ ] El panel lista los pares de equipos con jugadores compartidos (sin datos personales) y alerta de los sábados futuros que incumplen la regla.
- [ ] En simulación, ningún equipo supera el 35 % de partidos a las 08:00 o 09:15, y la diferencia de turno promedio dentro de cada categoría es <= 1,0.
- [ ] "Equilibrar fechas no jugadas" solo modifica fechas futuras sin partidos iniciados, avisa antes cuántos partidos cambian y permite cancelar.
- [ ] `repackSchedule` ya no cambia la hora de partidos de fechas jugadas o pasadas.
- [ ] El panel muestra el reparto de horarios por equipo.
- [ ] Cobertura >=80% en `src/lib/scheduling/*`; todos los tests pasan; build, lint y `tsc` sin errores.
- [ ] Cero emojis en el diff.
