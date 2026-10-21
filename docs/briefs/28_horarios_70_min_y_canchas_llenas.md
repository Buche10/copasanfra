# Brief 28: Turnos cada 70 minutos, canchas llenas y máximo un turno libre por dueño

## Contexto
Proyecto: Copa Abogados (marca del cliente, NO Ualdo). Stack: Next.js 16.3, React 19, TypeScript, Supabase (modelo JSONB `data`), Vitest (`npm test`). Antes de tocar código de Next lee la guía que corresponda en `node_modules/next/dist/docs/` (ver `AGENTS.md`). Lee primero `docs/briefs/17_horario_compacto_por_dueno.md` (regla del dueño) y `docs/briefs/11_fix_canchas_llenas.md`.

Queja del cliente sobre la fecha del 2026-10-17: a las 13:00 solo se jugó un partido (una cancha vacía) y la jornada terminó a las 18:00. Pide:
1. **Turnos cada 70 minutos**: 08:00, 09:10, 10:20, 11:30, 12:40, 13:50, 15:00, 16:10, para terminar antes.
2. **Las dos canchas llenas** desde las 08:00, sin turnos con una sola cancha en medio de la jornada.
3. **Sobre todo**: los equipos del mismo dueño (mismo `Team.clubId`; por ejemplo AKD tiene equipo en Abierta, +40 y +50) juegan con **como máximo un turno libre** entre sus partidos del día. Ejemplo válido: 08:00, 10:20, 12:40. También vale seguidos (08:00, 09:10). Inválido: 08:00 y 11:30 (dos turnos libres).

Datos reales revisados en producción (solo lectura):
- 2026-10-17: 14 partidos con hora en 8 turnos; a las 13:00 solo Cancha 1. Además Lawyers jugó 10:30 y 15:30 (3 turnos libres).
- 2026-10-24 (próxima fecha), 10-31, 11-07 y 11-14: 13 o 14 partidos cada una, programadas en 8 turnos con turnos de una sola cancha (por ejemplo 10-24 tiene una sola cancha a las 08:00 y a las 09:15). Con 14 partidos y 2 canchas bastan 7 turnos.
- Se comprobó con un solver exacto que esas 4 fechas SÍ caben en 7 turnos con canchas llenas cumpliendo "máximo 1 turno libre por dueño" y sin simultáneos del mismo dueño. Con la regla actual del código (ver causa 1) NO caben en 7 turnos en 10-31, 11-07 y 11-14.

### Causa raíz (corrígelas todas)
1. **La regla del dueño es más estricta de lo pedido.** En `src/lib/scheduling/score.ts`, `computeOwnerGapViolations` usa `const allowedMax = shares ? maxFree : 0;`: si los dos equipos del dueño NO comparten jugadores, exige 0 turnos libres (seguidos) como regla DURA (peso 1.000.000). Lo mismo en `src/lib/scheduling/matchday.ts`, `computePlacementGapCost` (`const allowedMax = shares ? MAX_OWNER_FREE_SLOTS : 0;`) y en `attemptOrder` (`maxSpan = hasInternalShares ? k + (k - 1) * MAX_OWNER_FREE_SLOTS : k`, ventana de exactamente `k` turnos). Con 8 dueños con 2 o 3 equipos cada sábado, exigir seguidos es imposible junto con canchas llenas, y como la regla dura pesa más que `canchasLlenas` (100.000), el optimizador estira la jornada a 8 turnos y deja canchas vacías.
2. **La búsqueda se detiene antes de llenar canchas.** En `searchBestSchedule` (`matchday.ts`), `hasViolations` solo mira reglas duras y blandas; si la mejor solución tiene `canchasLlenas > 0` pero no viola nada más, corta tras 15 intentos sin mejora.
3. **Turnos de 75 minutos** en `MATCH_TIME_SLOTS` (`src/types/index.ts`: 08:00, 09:15, 10:30, 11:45, 13:00, 14:15, 15:30, 16:45).

### Horas antiguas en partidos ya jugados
Los partidos jugados conservan las horas antiguas (09:15, 10:30, ...). Hay código que convierte la hora en índice de turno con `indexOf` sobre la lista actual; con la lista nueva esos partidos darían `-1` y se perderían. Lugares:
- `src/lib/sanctions.ts:52-56` (`getSlotIndex`, orden cronológico para suspensiones).
- `src/lib/scheduling/fairness.ts:78` y `:155` (historial de equidad).
- `src/lib/scheduling/sharedPlayers.ts:160-161` (conflictos de jugadores compartidos).
- `src/lib/scheduling/arrangeCalendar.ts:325` (aviso de huecos por dueño).
- `docs/consultas/huecos-por-dueno.sql` y `docs/consultas/horarios-por-equipo.sql` (tabla `turnos` con las horas antiguas).
- `src/components/AdminScheduleFairness.tsx:111` (texto "08:00-09:15").
- `src/components/MatchEditModal.tsx:25`: una hora antigua se mostrará como "hora personalizada"; es aceptable, no lo cambies.

## Objetivo
Al pulsar "Acomodar calendario", cada fecha desde el próximo sábado queda en turnos de 70 minutos (08:00, 09:10, 10:20, ...), usa el mínimo de turnos posible (`ceil(partidos / 2)`) con las dos canchas llenas, y ningún dueño tiene más de un turno libre entre dos partidos seguidos del mismo día. Los partidos ya jugados con horas antiguas siguen contando bien en suspensiones, equidad y avisos.

## Prioridad de reglas (de mayor a menor)
1. DURA: dos equipos del mismo dueño o con jugadores compartidos nunca a la misma hora.
2. DURA: equipos con jugadores compartidos nunca en turnos seguidos.
3. DURA: máximo `MAX_OWNER_FREE_SLOTS` (1) turno libre entre partidos seguidos del mismo dueño, **compartan o no jugadores**.
4. Canchas llenas y mínimo de turnos (`computeCanchasLlenas`, peso 100.000).
5. Blandas: preferir dueño sin hueco cuando no comparten jugadores; descanso exacto de 1 turno para compartidos.
6. Equidad de horarios.

## Requerimientos
1. **Turnos nuevos** en `src/types/index.ts`:
   - `MATCH_TIME_SLOTS = ['08:00', '09:10', '10:20', '11:30', '12:40', '13:50', '15:00', '16:10'] as const;` (siguen siendo 8 turnos; `CANCHAS` no cambia).
   - Añade `export const LEGACY_MATCH_TIME_SLOTS = ['08:00', '09:15', '10:30', '11:45', '13:00', '14:15', '15:30', '16:45'] as const;` con un comentario de una línea: horas de 75 minutos usadas hasta el 2026-10-17.
2. **Función única de hora a turno** en un archivo nuevo `src/lib/scheduling/timeSlots.ts`:
   - `export function getTimeSlotIndex(time?: string): number`: devuelve el índice en `MATCH_TIME_SLOTS`; si no está, el índice en `LEGACY_MATCH_TIME_SLOTS`; si tampoco, `-1`.
   - Úsala en los cinco puntos de código listados en "Horas antiguas" (sanctions, fairness x2, sharedPlayers, arrangeCalendar). En `sanctions.ts` mantén el 999 para hora desconocida. Elimina los `indexOf` sueltos; no dupliques la lógica.
3. **Regla del dueño = máximo 1 turno libre siempre**:
   - `score.ts`, `computeOwnerGapViolations`: `allowedMax = maxFree` para todos los pares (quita la rama `shares ? maxFree : 0`). Actualiza su comentario/JSDoc.
   - `matchday.ts`, `computePlacementGapCost`: `allowedMax = MAX_OWNER_FREE_SLOTS` siempre. La penalización blanda `softGap * 1000` se queda igual (sigue prefiriendo seguidos si no comparten).
   - `matchday.ts`, `attemptOrder`: `maxSpan = Math.min(ctx.slotCount, k + (k - 1) * MAX_OWNER_FREE_SLOTS)` siempre; `minSpan = k`. Si `hasInternalClubShares` queda sin uso, elimínala.
   - `computeSoftPenalties` (`ownerGaps`) no cambia: es blanda (peso 1.000) y queda por debajo de canchas llenas.
4. **Búsqueda hasta llenar canchas** (`searchBestSchedule` en `matchday.ts`): considera también como "por mejorar" una solución con `canchasLlenas > 0`, es decir `hasViolations = best.score >= 100_000 || (best.score % 100_000) >= 1000`, y la salida temprana por `unimprovedCount >= 15` solo si `best.score < 100_000`. Mantén el tope de 60 iteraciones para no disparar el tiempo.
5. **Aviso si no se pueden llenar canchas** (`src/lib/scheduling/arrangeCalendar.ts`):
   - Nueva función pura exportada `findUnfilledCourtDays(matches: Match[], fieldsPerSlot: number): { date: string; usedSlots: number; minSlots: number; emptyCells: number }[]`: por fecha, con partidos con hora (usa `getTimeSlotIndex`), cuenta turnos usados, el mínimo `ceil(n / fieldsPerSlot)` y celdas vacías antes del último turno usado. Devuelve solo fechas con `usedSlots > minSlots` o `emptyCells > 0`.
   - En `planCalendarArrangement`, tras programar, ejecútala sobre las fechas reprogramadas y añade a `warnings` una línea por fecha, por ejemplo: "2026-10-24: se usaron 8 turnos (mínimo 7), con 2 canchas vacías; termina a las 16:10 en vez de las 15:00". Usa las horas de `MATCH_TIME_SLOTS`.
   - `findOwnerGapViolations` ya existe: pásale `getTimeSlotIndex` en lugar del `indexOf` y mantén su aviso.
6. **Consultas SQL** (solo lectura): en `docs/consultas/huecos-por-dueno.sql` y `docs/consultas/horarios-por-equipo.sql`, la tabla `turnos` debe incluir las horas nuevas y las antiguas con su índice (08:00 una sola vez con índice 0). En `horarios-por-equipo.sql` actualiza el comentario "08:00 y 09:15" a "08:00 y 09:10".
7. **Texto de la UI**: `src/components/AdminScheduleFairness.tsx:111` pasa a "% Temprano (08:00-09:10)". En `src/lib/scheduling/fairness.ts` actualiza los dos comentarios "(08:00 y 09:15)".
8. **No migres** las horas de los partidos jugados en la base de datos. Las fechas futuras se corrigen solas al pulsar "Acomodar calendario" (reprograma desde el próximo sábado las fechas sin partidos jugados ni en juego).

## Restricciones técnicas
- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla o nombres de archivo. Iconos solo en SVG.
- Marca: NO aplicar la marca Ualdo (cliente con marca propia).
- Sigue las convenciones del repo: comentarios en español, imports con `@/`, estilo de `matchday.ts` y `score.ts`.
- Seguridad: no expongas datos de jugadores (cédulas) en avisos; usa nombres de equipo, `clubId`, fechas y horas.
- Diseño: SOLID, DRY, KISS; funciones <50 líneas; archivos <800 líneas (`matchday.ts` tiene 679: si se pasa, mueve funciones a `compact.ts` o a un archivo nuevo de `src/lib/scheduling/`); sin anidación >4 niveles; inmutabilidad en código nuevo; errores explícitos.
- Rendimiento: el test "ejecuta 16 partidos en menos de 200 ms" debe seguir pasando; no subas timeouts de los tests de 300 fechas.
- No añadas dependencias. No toques `tasks/`, `watch_tasks.*`, `.gitignore`, los cambios sin commitear de sanciones (`MatchLineupSection.tsx`, `MatchSanctionsAlert.tsx`, `MatchSheetModal.tsx`, `SanctionsTable.tsx`, `sanctions.ts` salvo `getSlotIndex`, `sanctions.test.ts` salvo lo de horas) ni archivos fuera del alcance.

## Tests
1. **Nuevo** `src/lib/scheduling/timeSlots.test.ts`: `getTimeSlotIndex` con '08:00' -> 0, '09:10' -> 1, '16:10' -> 7, '09:15' -> 1, '16:45' -> 7, '12:00' -> -1, `undefined` -> -1, '' -> -1.
2. **Regresión con fechas reales** en un nuevo `src/lib/scheduling/realMatchdays.test.ts`. Datos (sin jugadores compartidos; ids reales abreviados, solo hace falta que sean consistentes):

```ts
const CLUB_OF: Record<string, string> = {
  'team-40-1': 'club-leonesq', 'team-40-2': 'club-futleg', 'team-40-3': 'club-akd',
  'team-40-4': 'club-alianza', 'team-40-5': 'club-boman', 'team-40-6': 'club-idus',
  'team-40-7': 'club-lawyers', 'team-50-1': 'club-akd', 'team-ab-1': 'club-leonesq',
  'team-ab-11': 'club-lawyers', 'team-ab-12': 'club-sanfra', 'team-ab-2': 'club-futleg',
  'team-ab-4': 'club-akd', 'team-ab-7': 'club-alianza', 'team-ab-8': 'club-boman',
  'team-ab-9': 'club-idus', 'legal-ab': 'club-legal', 'legal-40': 'club-legal',
};
// [categoria, local, visitante]; los equipos sin entrada en CLUB_OF son su propio dueño.
const DAYS: Record<string, [string, string, string][]> = {
  '2026-10-24': [
    ['Abierta Varones', 'team-ab-3', 'team-ab-2'], ['Abierta Varones', 'legal-ab', 'team-ab-12'],
    ['+40 Varones', 'team-ab-13', 'team-40-1'], ['Abierta Varones', 'team-ab-5', 'lexpro'],
    ['+50 Varones', 'p50-a', 'p50-b'], ['Abierta Varones', 'team-40-9', 'team-ab-4'],
    ['Abierta Varones', 'team-ab-11', 'team-ab-10'], ['+40 Varones', 'team-40-8', 'team-40-2'],
    ['+40 Varones', 'team-40-5', 'legal-40'], ['Abierta Varones', 'team-ab-7', 'team-ab-9'],
    ['Abierta Varones', 'team-ab-1', 'team-ab-8'], ['+50 Varones', 'team-50-2', 'p50-c'],
    ['+40 Varones', 'team-40-3', 'team-40-6'], ['+40 Varones', 'team-40-4', 'team-40-7'],
  ],
  '2026-10-31': [
    ['Abierta Varones', 'team-40-9', 'team-ab-5'], ['Abierta Varones', 'lexpro', 'legal-ab'],
    ['+40 Varones', 'team-40-3', 'team-40-4'], ['+40 Varones', 'legal-40', 'team-40-1'],
    ['+50 Varones', 'p50-b', 'team-50-1'], ['Abierta Varones', 'team-ab-8', 'team-ab-3'],
    ['Abierta Varones', 'team-ab-4', 'team-ab-1'], ['Abierta Varones', 'team-ab-12', 'team-ab-7'],
    ['Abierta Varones', 'team-ab-2', 'team-ab-11'], ['Abierta Varones', 'team-ab-9', 'team-ab-10'],
    ['+40 Varones', 'team-40-6', 'team-40-8'], ['+50 Varones', 'team-50-2', 'p50-a'],
    ['+40 Varones', 'team-40-2', 'team-40-5'], ['+40 Varones', 'team-40-7', 'team-ab-13'],
  ],
  '2026-11-07': [
    ['+40 Varones', 'team-40-1', 'team-40-2'], ['+40 Varones', 'team-ab-13', 'team-40-3'],
    ['+40 Varones', 'legal-40', 'team-40-7'], ['+50 Varones', 'team-50-1', 'p50-c'],
    ['+50 Varones', 'p50-b', 'p50-a'], ['Abierta Varones', 'legal-ab', 'team-ab-5'],
    ['+40 Varones', 'team-40-5', 'team-40-8'], ['Abierta Varones', 'team-ab-3', 'team-ab-4'],
    ['Abierta Varones', 'team-ab-7', 'lexpro'], ['Abierta Varones', 'team-ab-11', 'team-ab-8'],
    ['Abierta Varones', 'team-ab-9', 'team-ab-2'], ['Abierta Varones', 'team-ab-10', 'team-ab-12'],
    ['Abierta Varones', 'team-40-9', 'team-ab-1'], ['+40 Varones', 'team-40-4', 'team-40-6'],
  ],
  '2026-11-14': [
    ['Abierta Varones', 'team-40-9', 'legal-ab'], ['Abierta Varones', 'team-ab-1', 'team-ab-3'],
    ['Abierta Varones', 'team-ab-5', 'team-ab-7'], ['Abierta Varones', 'team-ab-4', 'team-ab-11'],
    ['Abierta Varones', 'team-ab-12', 'team-ab-2'], ['+40 Varones', 'team-40-4', 'team-40-1'],
    ['+40 Varones', 'team-40-2', 'team-40-7'], ['+50 Varones', 'p50-a', 'team-50-2'],
    ['+50 Varones', 'team-50-1', 'p50-b'], ['Abierta Varones', 'lexpro', 'team-ab-10'],
    ['Abierta Varones', 'team-ab-8', 'team-ab-9'], ['+40 Varones', 'team-40-3', 'team-40-6'],
    ['+40 Varones', 'legal-40', 'team-40-5'],
  ],
};
```

   Para cada fecha, con 50 semillas distintas de `createRng` (`src/lib/scheduling/random.ts`) y `scheduleMatchday(..., MATCH_TIME_SLOTS.length, CANCHAS.length, { rng })`, comprobar en el 100% de los casos:
   - turnos usados = `ceil(n / 2)` (7) y son 0..6 seguidos; ninguna cancha vacía salvo, si `n` es impar, una en el último turno;
   - ningún dueño a la misma hora dos veces;
   - ningún dueño con más de 1 turno libre entre partidos seguidos.
3. **Variante con compartidos**: repite la fecha 2026-10-24 marcando como compartidos (`sharedPairs` con `makePairKey`) los pares de AKD (`team-ab-4`, `team-40-3`, `team-50-1` entre sí) y de Fuerza Legal (`legal-ab`, `legal-40`). En 50 semillas: 0 simultáneos, 0 compartidos en turnos seguidos, máximo 1 turno libre por dueño, y canchas llenas en al menos el 90% de las semillas (si una semilla no las llena, debe salir el aviso del requerimiento 5).
4. **Ajustar tests existentes** que exigían seguidos sin compartidos:
   - `src/lib/scheduling/matchday.test.ts`, test "cumple reglas de dueño, canchas y dia compacto en 300 fechas generadas", bloque 3: `expect(gap).toBeLessThanOrEqual(1)` en vez de `toBe(0)`. Los bloques 1, 2 y 4 no cambian.
   - `src/lib/scheduling/ownerGaps.test.ts`: añade "no penaliza 1 turno libre aunque no compartan jugadores" (`[0, 2]` sin `shareMatrix` -> 0) y "penaliza 2 turnos libres sin compartir" (`[0, 3]` -> 1). Los existentes deben seguir pasando.
   - Cualquier test que use horas fijas antiguas ('09:15', '10:30', ...) como turno programado por el algoritmo debe pasar a las nuevas; los que simulan partidos ya jugados con hora antigua deben seguir funcionando gracias a `getTimeSlotIndex` (añade al menos uno en `sanctions.test.ts` y otro en `fairness.test.ts` con horas antiguas).
5. **`findUnfilledCourtDays`**: fecha con 14 partidos en 7 turnos llenos -> no reporta; 14 partidos en 8 turnos -> reporta `usedSlots 8, minSlots 7`; fecha con hueco en el turno 4 -> reporta `emptyCells`; ignora partidos sin hora.
6. Los tests de 300 fechas de AKD y de dos dueños que se enfrentan (`ownerGaps.test.ts`) y el de descanso de compartidos (>= 95%) deben seguir pasando.

Cobertura >= 80% del código nuevo.

## Verificación final (Windows cmd, en la carpeta del proyecto)
1. `npm test` (ningún fallo nuevo; si quedan los 2 fallos conocidos del Brief 13, indícalo)
2. `npm run test:coverage`
3. `npm run lint`
4. `npm run build`
5. Revisa `git diff` completo: cero emojis en código, tests, comentarios y textos (solo se permiten tildes y eñes).
6. En producción, tras desplegar y ANTES del sábado 2026-10-24: pulsar "Acomodar calendario", revisar en "Revisar cambios" que 10-24 en adelante usan 08:00 a 15:00 (7 turnos) y que no hay avisos de canchas vacías ni de dueños; aplicar. Ejecutar `docs/consultas/huecos-por-dueno.sql`: ninguna fila con "ALERTA".

## Criterios de aceptación
- [ ] `MATCH_TIME_SLOTS` es 08:00, 09:10, 10:20, 11:30, 12:40, 13:50, 15:00, 16:10.
- [ ] Una fecha de 14 partidos queda en 7 turnos (08:00 a 15:00) con las dos canchas llenas en las 4 fechas reales del test.
- [ ] Ningún dueño tiene más de un turno libre entre partidos seguidos del mismo día, compartan o no jugadores.
- [ ] Se mantienen: sin simultáneos del mismo dueño, compartidos nunca seguidos.
- [ ] Partidos jugados con horas antiguas se ordenan bien en suspensiones y cuentan en equidad y conflictos (`getTimeSlotIndex`).
- [ ] Si una fecha no se puede llenar, "Revisar cambios" lo avisa con fecha, turnos usados y hora de término.
- [ ] Consultas SQL reconocen horas nuevas y antiguas.
- [ ] Tests en verde (sin fallos nuevos), lint y build sin errores; cero emojis.

## Cambio posterior (2026-10-21, pedido del cliente)
Con los jugadores compartidos reales (consulta `equipos-con-jugadores-compartidos.sql`) no cabían a la vez todas las reglas. El cliente fijó estas prioridades:
1. Obligatorias: el último partido empieza como máximo a las 15:00 (`MATCH_TIME_SLOTS` pasa a 7 turnos, 14 partidos por día); la categoría +50 juega siempre a las 08:00 (`FIRST_SLOT_CATEGORIES`); dos equipos del mismo dueño o con jugadores compartidos nunca a la vez.
2. Canchas llenas (terminar lo antes posible).
3. Hora de descanso para los jugadores compartidos siempre que se pueda (antes era obligatoria).
4. Dueño con máximo 1 turno libre siempre que se pueda (antes era obligatoria).
Los pesos están en `SCORE_WEIGHTS` (`src/lib/scheduling/score.ts`). La búsqueda exacta (`exactFill.ts`) minimiza primero los compartidos sin descanso y luego los turnos libres de más por dueño; en las fechas reales del 24-oct al 14-nov llega al mínimo posible calculado por búsqueda exhaustiva (2, 4, 2 y 1 turnos libres de más). Las horas 16:10 ya guardadas se siguen reconociendo como turno antiguo.
