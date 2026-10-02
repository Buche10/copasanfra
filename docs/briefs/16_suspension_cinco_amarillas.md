# Brief 16: Suspensión por 5 amarillas y suspensiones que se cumplen

## Contexto
Proyecto: Copa Abogados (marca del cliente, NO Ualdo). Stack: Next.js 16.3, React 19, TypeScript, Supabase (JSONB), Vitest (`npm test`). Antes de tocar código de Next lee la guía que corresponda en `node_modules/next/dist/docs/` (ver `AGENTS.md`).

Regla que pide el cliente: **cada 5 tarjetas amarillas acumuladas, el jugador se suspende 1 partido**. Se mantienen las reglas actuales de expulsión: doble amarilla = 1 partido, roja directa = 2 partidos. Las multas económicas (`src/lib/cardFines.ts`) NO cambian.

Estado actual (`calculateSanctions` en `src/lib/store.ts`, líneas ~650-760):
1. Calcula `yellowAccumulationMatches = Math.floor(amarillas / 5)`, `doubleYellowMatches = dobles * 1` y `directRedMatches = rojas * 2`, pero **nunca descuenta los partidos ya cumplidos**. Un jugador que llegó a 5 amarillas o vio una roja queda con `cardSuspended = true` para siempre y la planilla lo bloquea en todos los partidos siguientes (`src/components/MatchSheetModal.tsx` línea ~113, `isSusp`, que usan `MatchLineupSection.tsx` y `MatchEventForm.tsx`).
2. Las 2 amarillas de una doble amarilla también suman al acumulado de 5.
3. Cuenta eventos de partidos `IN_PROGRESS`: una 5.ª amarilla o una roja en el partido que se está llenando bloquea al jugador en esa misma planilla (desaparece del selector de eventos de `MatchEventForm`).
4. `src/components/PlayerProfileModal.tsx` (líneas ~31-76) tiene su propia regla distinta: suspende con **3** amarillas o con cualquier roja, para siempre.
5. `src/lib/store.ts` tiene 879 líneas (por encima del límite de 800).

Usos de `calculateSanctions`: `src/app/page.tsx` (línea ~707, tabla de sanciones por categoría), `src/components/MatchSheetModal.tsx` (línea ~95), `src/components/QRScannerModal.tsx` (línea ~30). Tipo `PlayerSanction` en `src/types/index.ts` (líneas ~259-275). Texto de la regla en `src/components/SanctionsTable.tsx` línea ~100.

## Objetivo
Las suspensiones por tarjetas se calculan cronológicamente por equipo, se van cumpliendo con cada partido terminado del equipo y desaparecen al cumplirse. Cada 5 amarillas (sin contar las de doble amarilla) suspenden 1 partido y el contador vuelve a 0. Toda la app (planilla, tabla de sanciones, escáner y ficha del jugador) usa el mismo cálculo.

## Decisiones de negocio (aplicarlas tal cual)
- **Acumulación:** cada 5 amarillas -> 1 partido. Al llegar a 5 el contador se reinicia a 0 (la 10.ª amarilla genera otra suspensión, etc.).
- **Doble amarilla** (2 o más amarillas del mismo jugador en el mismo partido, o un evento `RED_CARD` con `isDoubleYellow: true`): 1 partido. Las amarillas de ese partido **no suman** al acumulado de 5.
- **Roja directa** (`RED_CARD` sin `isDoubleYellow`): 2 partidos. Si ese mismo partido tuvo exactamente 1 amarilla antes, esa amarilla sí suma al acumulado.
- **Cumplimiento:** cada partido **terminado** (`FINISHED`) del equipo del jugador, posterior al partido de la sanción, descuenta 1 partido pendiente. Se cumple aunque el jugador no figure en la alineación (lo normal es que no juegue). Incluye play offs.
- **Solo cuentan partidos `FINISHED`**, tanto para generar sanciones como para cumplirlas. Los eventos de un partido `IN_PROGRESS` no sancionan hasta que el partido se cierra (así la planilla abierta no bloquea a un jugador a mitad de partido).
- **Por carnet:** la sanción es por `player.id` y se cumple con los partidos del equipo de ese registro (coherente con el Brief 15).
- La **suspensión manual** (`suspendedRounds`) no cambia: bloquea solo esas fechas y se sigue sumando en `matchesRemaining` como hoy.
- Las estadísticas mostradas (`yellowCards`, `redCards`) siguen siendo totales del torneo; lo que cambia es `cardSuspended`, `isSuspended`, `matchesRemaining` y `suspensionReason`.

## Requerimientos
1. **Mover y reescribir** `calculateSanctions` a un módulo nuevo `src/lib/sanctions.ts` (lógica pura, sin Supabase). En `src/lib/store.ts` borrar la implementación y re-exportar: `export { calculateSanctions } from './sanctions';` para no romper imports.
2. En `sanctions.ts`:
   - Constantes exportadas: `YELLOWS_FOR_SUSPENSION = 5`, `DOUBLE_YELLOW_MATCHES = 1`, `DIRECT_RED_MATCHES = 2`.
   - `export function classifyPlayerCards(match: Match, playerId: string): { accumulableYellows: number; doubleYellow: boolean; directRed: boolean }` según las decisiones de arriba.
   - `export function orderTeamMatches(matches: Match[], teamId: string): Match[]`: partidos `FINISHED` del equipo (local o visitante), ordenados por `date`, luego `time` (por índice en `MATCH_TIME_SLOTS`; sin hora va después), luego `round`. No muta la entrada.
   - `export interface CardSuspensionState { pending: number; yellowCycle: number; reasons: string[] }` y `export function computeCardSuspension(playerId: string, teamMatches: Match[]): CardSuspensionState`. Recorre los partidos en orden; en cada partido: **primero** descuenta 1 de `pending` si es mayor que 0 (ese partido se cumple) y **luego** suma las sanciones generadas en él. `reasons` describe solo lo pendiente, por ejemplo "5 Amarillas (1 partido)", "Doble Amarilla (1 partido)" o "Roja Directa (2 partidos)". Si quedan pendientes de varias causas, se listan las que aún no se cumplieron (las más antiguas se cumplen primero).
   - `calculateSanctions(players, teams, matches, category?)` mantiene firma y orden de salida actuales. Usa `computeCardSuspension` por jugador, precalcula los partidos por equipo con un `Map` (una pasada sobre `matches`, no un filtro por jugador) y rellena `PlayerSanction` igual que hoy: `cardSuspended = pending > 0`, `matchesRemaining = pending + manualRounds.length`.
   - Además, expone en `PlayerSanction` un campo nuevo opcional `yellowsTowardNext?: number` (`yellowCycle`) para mostrar "3/5" en la tabla. Añadirlo al tipo en `src/types/index.ts`.
   - Funciones de menos de 50 líneas; sin mutar entradas.
3. `src/components/PlayerProfileModal.tsx`: quitar la regla propia (3 amarillas o cualquier roja) y usar `calculateSanctions([player], teams, matches)` (o recibir la sanción ya calculada si el componente padre la tiene) para `isSuspended` y el motivo. Mantener el conteo de goles, amarillas y rojas que muestra.
4. `src/components/SanctionsTable.tsx`: dejar el texto de la regla como "5 Amarillas = 1 partido · Doble amarilla = 1 · Roja directa = 2" y mostrar, para jugadores no suspendidos con amarillas, el progreso "N/5" usando `yellowsTowardNext`.
5. No cambiar `src/lib/cardFines.ts` ni los reportes de multas.

## Restricciones técnicas
- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla o nombres de archivo. Iconos solo en SVG.
- Marca: NO aplicar la marca Ualdo. Mantén estilos actuales.
- Convenciones del repo: comentarios en español, imports con `@/`.
- Diseño: SOLID, DRY, KISS; funciones <50 líneas; archivos <800 líneas; sin anidación >4 niveles; inmutabilidad; errores explícitos.
- Rendimiento: O(partidos + jugadores), sin filtros de todos los partidos por cada jugador.
- No añadas dependencias. No toques `tasks/`, `watch_tasks.*`, `.gitignore` ni archivos fuera del alcance.

## Tests
Nuevo `src/lib/sanctions.test.ts`; añadir `src/lib/sanctions.ts` a `coverage.include` en `vitest.config.ts`. Construye partidos de prueba de un mismo equipo en fechas consecutivas. Casos:
- 4 amarillas en 4 partidos: no suspendido, `yellowsTowardNext = 4`.
- 5.ª amarilla en el partido 5: suspendido 1 partido. Tras el partido 6 terminado: ya no suspendido y `yellowsTowardNext = 0`.
- 10 amarillas repartidas: dos suspensiones de 1 partido, cada una cumplida con el partido siguiente.
- Doble amarilla (2 eventos `YELLOW_CARD` en el mismo partido): 1 partido; esas 2 no suman al acumulado (4 amarillas sueltas previas + doble amarilla -> ciclo sigue en 4).
- `RED_CARD` con `isDoubleYellow: true` y 1 amarilla en el mismo partido: 1 partido, la amarilla no suma.
- Roja directa: 2 partidos; tras 1 partido terminado queda 1; tras 2 queda 0.
- Amarilla y roja directa en el mismo partido: 2 partidos y la amarilla suma 1 al ciclo.
- Sanción en el último partido jugado y siguiente partido `SCHEDULED`: sigue suspendido (los programados no cuentan como cumplidos).
- Eventos en un partido `IN_PROGRESS`: no generan sanción.
- Orden: partidos pasados en desorden en el array; el resultado es el mismo que en orden.
- El partido terminado de **otro** equipo no cumple la sanción.
- Suspensión manual `suspendedRounds: [6]` sin tarjetas: `isSuspended` true, `cardSuspended` false, `matchesRemaining` 1.
- Entradas no mutadas (comparar con copia profunda).
Cobertura >= 80% de `sanctions.ts`.

## Verificación final (Windows cmd, en la carpeta del proyecto)
1. `npm test` (los 2 fallos conocidos del Brief 13 pueden seguir; ningún fallo nuevo)
2. `npm run test:coverage` (`sanctions.ts` >= 80%)
3. `npm run lint`
4. `npm run build`
5. Prueba manual con `npm run dev`: en la tabla de sanciones, un jugador que vio roja en la fecha 1 y cuyo equipo jugó las fechas 2 y 3 ya no aparece suspendido; en la planilla de la fecha siguiente ya no sale tachado.

## Criterios de aceptación
- [ ] 5 amarillas = 1 partido de suspensión; el contador se reinicia.
- [ ] Las amarillas de una doble amarilla no suman al acumulado.
- [ ] Las suspensiones se cumplen con los partidos terminados del equipo y desaparecen al cumplirse.
- [ ] Un partido en juego no bloquea a sus propios jugadores por tarjetas de ese partido.
- [ ] Planilla, tabla de sanciones, escáner y ficha del jugador muestran el mismo estado.
- [ ] `calculateSanctions` vive en `src/lib/sanctions.ts`; `store.ts` queda por debajo de 800 líneas.
- [ ] Multas sin cambios.
- [ ] Tests nuevos en verde, cobertura >= 80%; lint y build sin errores; cero emojis.
