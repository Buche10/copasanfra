# Brief 17: Equipos del mismo dueño con máximo un turno libre entre partidos

## Contexto
Proyecto: Copa Abogados (marca del cliente, NO Ualdo). Stack: Next.js 16.3, React 19, TypeScript, Vitest (`npm test`). Antes de tocar código de Next lee la guía que corresponda en `node_modules/next/dist/docs/` (ver `AGENTS.md`).

Queja del cliente: los equipos del mismo dueño (mismo `Team.clubId`, por ejemplo AKD, AKD +40 y AKD +50) tienen demasiada distancia entre sus partidos del mismo sábado. Regla nueva: **entre dos partidos seguidos del mismo dueño en el mismo día puede haber como máximo UN turno libre**. Ejemplo válido: AKD 08:00, AKD +40 10:30, AKD +50 13:00. Inválido: AKD 08:00 y AKD +40 11:45 (dos turnos libres).

Se mantiene todo lo demás:
- DURA: dos equipos del mismo dueño o con jugadores compartidos nunca juegan a la misma hora.
- DURA: equipos con jugadores compartidos (misma cédula, `src/lib/scheduling/sharedPlayers.ts`) nunca en turnos seguidos; el ideal es exactamente un turno libre entre ellos (Brief 08).
- Preferencia: si no comparten jugadores, el ideal del dueño es sin hueco (seguidos).
- Canchas llenas desde las 08:00 (Brief 11) y equidad de horarios (Brief 08).

Turnos: `MATCH_TIME_SLOTS` en `src/types/index.ts` (08:00, 09:15, 10:30, 11:45, 13:00, 14:15, 15:30, 16:45), 2 canchas.

Código implicado:
- `src/lib/scheduling/matchday.ts` (`scheduleMatchday`, `attemptOrder`, `findWindowPlan`, `searchWindowSlots`, `placeAnywhere`, `compactSchedule`, `tryPullMatchIntoEmptySlot`, `canMoveMatch`, `repairSchedule`).
- `src/lib/scheduling/score.ts` (`computeScore`, `computeSoftPenalties`).
- `src/lib/scheduling/arrangeCalendar.ts` (`processFutureDates`, `scheduleActiveDayMatches`, `planCalendarArrangement`). El botón "Acomodar calendario" vuelve a asignar horas a todas las fechas desde el próximo sábado que no tengan partidos jugados ni en juego.

Causas encontradas (corrígelas todas):
1. **La separación del dueño es solo una preferencia** (`ownerGaps` en `computeSoftPenalties`, peso 1.000) y pesa mucho menos que `canchasLlenas` (100.000). El optimizador prefiere llenar canchas y separa al dueño.
2. **Ventana mal calculada en `attemptOrder`**: `mandatoryRests` cuenta PARES de partidos con jugadores compartidos, no huecos necesarios. Con 3 equipos del mismo dueño que comparten jugadores entre sí hay 3 pares, así que `minSpan = 3 + 3 = 6`, cuando lo necesario es 5 (turnos 0, 2 y 4). Además `findWindowPlan` prueba ventanas hasta `minSpan + 2`. En una ventana de 6 a 8 turnos el plan puede quedar 0, 2 y 5, o peor.
3. **`searchWindowSlots` no comprueba la separación máxima** entre partidos del dueño, solo el descanso mínimo de los compartidos.
4. **Bug en `placeAnywhere`** (líneas ~160-183): `ctx.shareMatrix[mIdx * ctx.n + os]` usa `os`, que es un TURNO, como si fuera un índice de partido. Hay que guardar el índice del otro partido junto a su turno.
5. **`compactSchedule` / `tryPullMatchIntoEmptySlot` / `canMoveMatch`** mueven partidos a turnos anteriores comprobando solo las reglas duras actuales; pueden separar a un dueño después del cálculo.

## Objetivo
En toda fecha que programe "Acomodar calendario", ningún dueño tiene más de un turno libre entre dos de sus partidos seguidos del día, sin romper las reglas duras actuales ni las canchas llenas cuando sea posible. Si en una fecha concreta es imposible cumplirlo, el resumen de "Revisar cambios" lo avisa con fecha, dueño y horas.

## Requerimientos
1. **Constante** en `src/lib/scheduling/matchday.ts` (exportada): `export const MAX_OWNER_FREE_SLOTS = 1;`.
2. **Nueva regla dura en el score** (`src/lib/scheduling/score.ts`):
   - `export function computeOwnerGapViolations(ctx: ScoreContext, matchSlot: readonly number[], maxFree: number): number`: para cada club de `multiClubs`, ordena los turnos de sus partidos colocados y suma `max(0, (s[i] - s[i-1] - 1) - maxFree)`.
   - En `computeScore`, sumar ese valor a `hard` (peso 1.000.000), por encima de `canchasLlenas`. Mantener la penalización blanda actual de `ownerGaps` para seguir prefiriendo sin hueco cuando no hay jugadores compartidos.
   - Para no cambiar la firma de `computeScore`, añade `maxOwnerFreeSlots: number` a `ScoreContext` y rellénalo en `buildContext` con `MAX_OWNER_FREE_SLOTS`.
3. **Ventana del dueño** (`attemptOrder` / `findWindowPlan`):
   - Con `k` partidos del dueño ese día, la ventana máxima permitida es `k + (k - 1) * MAX_OWNER_FREE_SLOTS` turnos (con k = 3: 5 turnos).
   - Ventana mínima: `k + r`, donde `r` es el mínimo de huecos obligatorios: el número de pares CONSECUTIVOS en el orden elegido que comparten jugadores. Como el orden no se conoce de antemano, usa `minSpan = k` y deja que la búsqueda pruebe anchos desde `k` hasta la ventana máxima (nunca más). Elimina el cálculo actual de `mandatoryRests` por pares.
   - En `searchWindowSlots`, además del descanso de compartidos, rechaza planes en los que, al ordenar los turnos del dueño (los ya colocados `placedSlots` más los del plan), algún hueco supere `MAX_OWNER_FREE_SLOTS`. Extrae esa comprobación a una función `ownerGapsWithinLimit(slots: number[], maxFree: number): boolean` exportada para testearla.
4. **`placeAnywhere`**: corregir el bug de la causa 4 (iterar pares `{ idx, slot }` de los otros partidos del mismo dueño y usar `idx` en `shareMatrix`). Penalizar con peso 1.000.000 cada turno libre por encima de `MAX_OWNER_FREE_SLOTS` respecto a los partidos ya colocados del dueño, para que solo elija un turno así cuando no haya otro.
5. **Compactación**: en `tryPullMatchIntoEmptySlot` y en el desplazamiento de `compactSchedule`, aceptar un movimiento solo si no aumenta `computeOwnerGapViolations` (compáralo antes y después del movimiento). `tryPullToEarlierSlots` ya compara el score completo; al estar la regla en `computeScore` queda cubierto.
6. **Aviso en "Acomodar calendario"** (`src/lib/scheduling/arrangeCalendar.ts`):
   - Nueva función pura exportada `findOwnerGapViolations(matches: Match[], teams: Team[], maxFree: number): { date: string; club: string; fromTime: string; toTime: string; freeSlots: number }[]` que revisa partidos con hora agrupados por fecha y dueño (`clubId || id`; solo dueños con 2 o más partidos ese día).
   - En `planCalendarArrangement`, tras programar, ejecutarla sobre las fechas reprogramadas y añadir a `warnings` una línea por violación, por ejemplo: "2026-10-10: el dueño AKD tiene 2 turnos libres entre 09:15 y 11:45 (no se pudo dejar en máximo 1)".
   - Mostrar el nombre del club tal como está en `clubId` (no exponer datos de jugadores).
7. **Consulta de solo lectura** `docs/consultas/huecos-por-dueno.sql`: por fecha futura y `clubId`, lista equipos, horas y el mayor número de turnos libres entre partidos seguidos del dueño, para comprobar producción antes y después de pulsar "Acomodar calendario". No la ejecutes tú.

## Restricciones técnicas
- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla o nombres de archivo.
- Marca: NO aplicar la marca Ualdo.
- Convenciones del repo: comentarios en español, imports con `@/`, estilo de `matchday.ts`.
- Diseño: SOLID, DRY, KISS; funciones <50 líneas; archivos <800 líneas (`matchday.ts` tiene 609: si se pasa, mueve la compactación a `src/lib/scheduling/compact.ts`); sin anidación >4 niveles; errores explícitos.
- Rendimiento: `scheduleMatchday` debe seguir tardando lo mismo en orden de magnitud (los tests de 300 fechas ya tienen timeouts de 30-40 s; no los subas).
- No cambies `MATCH_TIME_SLOTS`, `CANCHAS` ni la regla de descanso de jugadores compartidos.
- No añadas dependencias. No toques `tasks/`, `watch_tasks.*`, `.gitignore` ni archivos fuera del alcance.

## Tests
En `src/lib/scheduling/matchday.test.ts` y un nuevo `src/lib/scheduling/ownerGaps.test.ts` (o dentro de `score`/`arrangeCalendar` tests existentes):
- `ownerGapsWithinLimit`: [0,1,2] true; [0,2,4] true; [0,2,5] false; [0,3] false; [5] true; orden desordenado se maneja.
- `computeOwnerGapViolations`: suma correcta con 2 clubes, uno con hueco 2 (1 violación) y otro con hueco 3 (2 violaciones).
- **Caso AKD:** dueño con 3 equipos en Abierta, +40 y +50 que comparten jugadores entre los 3 (pares en `sharedPairs`), más 10 partidos de otros equipos sin dueño común. En 300 fechas con `createRng` distintos: 0 simultáneos del dueño, 0 compartidos seguidos, y máximo 1 turno libre entre partidos del dueño en el 100% de las fechas.
- **Dos dueños que se enfrentan:** club A (3 equipos) y club B (2 equipos) con un partido A vs B en una categoría. 300 fechas: máximo 1 turno libre para ambos en todas.
- El test existente "cumple reglas de dueño, canchas y dia compacto en 300 fechas generadas" debe seguir pasando sin cambios (sin jugadores compartidos el dueño queda sin hueco).
- El test de descanso de jugadores compartidos (>= 95% descanso exacto) debe seguir pasando.
- `findOwnerGapViolations`: detecta un dueño a las 08:00 y 11:45 (2 turnos libres); no reporta 08:00, 10:30 y 13:00; ignora partidos sin hora y dueños con un solo partido ese día.
- `planCalendarArrangement`: si se fuerza un caso imposible (por ejemplo un dueño con 6 partidos el mismo día que comparten jugadores entre todos), devuelve el aviso en `warnings` en lugar de fallar.
Cobertura >= 80% del código nuevo.

## Verificación final (Windows cmd, en la carpeta del proyecto)
1. `npm test` (los 2 fallos conocidos del Brief 13 pueden seguir; ningún fallo nuevo)
2. `npm run test:coverage`
3. `npm run lint`
4. `npm run build`
5. En producción, tras desplegar: ejecutar `docs/consultas/huecos-por-dueno.sql` (antes), pulsar "Acomodar calendario", revisar el resumen, aplicar y ejecutar la consulta otra vez (después): ningún dueño con más de 1 turno libre en las fechas futuras.

## Criterios de aceptación
- [ ] En las fechas que programa "Acomodar calendario", ningún dueño tiene más de un turno libre entre partidos seguidos del mismo día.
- [ ] Sin jugadores compartidos, los equipos del mismo dueño quedan seguidos; con compartidos, con exactamente un turno libre.
- [ ] Se mantienen: sin simultáneos del mismo dueño, sin compartidos seguidos, canchas llenas desde las 08:00.
- [ ] Corregido el índice erróneo de `shareMatrix` en `placeAnywhere`.
- [ ] Si una fecha no se puede cumplir, aparece el aviso en "Revisar cambios".
- [ ] `docs/consultas/huecos-por-dueno.sql` existe y es solo lectura.
- [ ] Tests en verde (sin fallos nuevos), lint y build sin errores; cero emojis.
