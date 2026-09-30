# Brief 10: Guardado seguro del botón "Acomodar calendario" (corrección del Brief 09)

## Contexto
Proyecto: Copa Abogados. Stack: Next.js 16.3 (ver `AGENTS.md`), React 19, TypeScript, Supabase (tablas `{ id, data jsonb }`), Vitest (`npm test`).

El Brief 09 está construido y funciona: 115 tests en verde, build y lint limpios. En una simulación del caso real (4 fechas jugadas, +50 activada), el plan no altera ningún partido jugado, crea +50 desde el 2026-10-03 y no deja choques. Pero la auditoría encontró un riesgo HIGH de pérdida de datos al GUARDAR y un comportamiento MEDIUM que este brief corrige. No se añaden funciones nuevas.

### HIGH: aplicar el plan puede borrar resultados
`handleApplyCalendarPlan` (`src/app/page.tsx`, línea ~503) persiste con `replaceMatches(reconciled)`, y `replaceMatches` (`src/lib/store.ts`) hace `deleteAllRows(MATCHES)` y luego `upsertRows` de TODO el calendario que tiene el navegador. Hay dos formas de perder datos:
1. **Fallo a mitad**: si el `upsert` falla después del borrado (red, timeout), la tabla `matches` queda vacía o incompleta y se pierden las 4 fechas jugadas con sus resultados. El `setMatches(previousMatches)` solo restaura la pantalla, no la base.
2. **Datos desactualizados**: el plan se calcula con los `matches` que el navegador cargó al abrir la página. Si mientras tanto un árbitro cargó un resultado o una tarjeta desde otro dispositivo (por ejemplo, un sábado), aplicar el plan sobreescribe la tabla con la versión vieja y ese resultado se pierde.

### MEDIUM: pulsar dos veces cambia los enfrentamientos de +50
`findCategoriesToCreate` (`src/lib/scheduling/arrangeCalendar.ts`, línea ~61) regenera cualquier categoría activa sin partidos jugados. Tras aplicar una vez (+50 creada para el 2026-10-03), si el admin vuelve a pulsar antes del sábado, por ejemplo para reacomodar horarios, +50 se regenera con emparejamientos nuevos al azar y cambia el calendario ya comunicado.

### LOW (corregir de paso)
- Se eliminó `ensureFullPlayers` de `page.tsx`. `AdminArrangeCalendar` calcula el plan con el `players` que llega por props; si esa lista no trae cédulas (por ejemplo, tras "Restablecer datos"), la regla de jugadores compartidos se desactiva sin avisar.
- `src/lib/scheduling/rebalance.ts` quedó sin uso: solo lo reexporta `src/lib/fixtureGenerator.ts` (líneas 5 y 8).
- `ArrangePlan` tiene campos duplicados: `newMatches`/`matches`, `removedStaleMatches`/`staleMatchesRemoved`, `clearedMatches`/`clearedInactiveMatches`.
- `generateRandomFixture` recibe la fecha de inicio por dos vías (`options.startDate` y `startDateParam`).

## Objetivo
Aplicar el plan nunca borra ni pisa partidos que no cambian, nunca deja la tabla vacía si algo falla, y se niega a aplicar si el calendario cambió en la base desde que se revisó. Una categoría ya creada para el próximo sábado no se vuelve a sortear.

## Requerimientos
1. Guardado por diferencias, en `src/lib/store.ts`:
   - Nueva función `applyMatchChanges(changes: { upserts: Match[]; deleteIds: string[] }): Promise<void>`. Primero hace `upsertRows(TABLES.MATCHES, upserts)` en lotes de 200; SOLO si todo el upsert fue bien, borra `deleteIds` con `.delete().in('id', lote)` en lotes de 200. Nunca usa `deleteAllRows`.
   - Función pura `diffMatches(before: Match[], after: Match[]): { upserts: Match[]; deleteIds: string[] }` en `src/lib/scheduling/matchDiff.ts`. `upserts` son los partidos nuevos o con cualquier diferencia (comparar por `JSON.stringify` con las claves ordenadas, o campo a campo); `deleteIds` son los ids de `before` que no están en `after`.
   - `replaceMatches` se mantiene solo para restaurar un respaldo (importación). El calendario deja de usarla.
2. Comprobación de datos frescos, en `handleApplyCalendarPlan` (`page.tsx`):
   - Antes de guardar, leer la base con `getMatches()`.
   - Si algún partido de la base difiere del `matches` con el que se calculó el plan (usar `diffMatches(estadoAlRevisar, deLaBase)`; cualquier diferencia cuenta), NO aplicar. Actualizar `matches` en pantalla con lo de la base y avisar: "El calendario cambió desde que revisaste (por ejemplo, se cargó un resultado). Pulsa Revisar cambios otra vez." Devolver `false`.
   - Para eso, `ArrangePlan` debe guardar la base usada: añadir `baseMatches: Match[]` (el `input.matches`).
   - Si no hubo cambios: `const { upserts, deleteIds } = diffMatches(plan.baseMatches, reconciliado)`, luego `applyMatchChanges(...)`. Actualizar la pantalla solo si el guardado fue bien; si falla, volver a leer la base con `getMatches()` y mostrar eso (no la copia local), y avisar.
3. No volver a sortear, en `findCategoriesToCreate` (`arrangeCalendar.ts`): crear o regenerar una categoría activa solo si tiene al menos 2 equipos, CERO partidos jugados o en juego, y además (a) no tiene partidos, o (b) tiene algún partido pendiente con fecha anterior al próximo sábado (calendario viejo que quedó atrás). Si todos sus partidos pendientes están en el próximo sábado o después, NO se regenera: solo se le reasignan horarios.
4. Jugadores completos: restaurar en `page.tsx` una función `ensureFullPlayers()` (la versión anterior, que cargaba `getPlayersFull()` si la lista no traía cédulas) y usarla en `AdminArrangeCalendar` al pulsar "Revisar cambios" (pasarla como prop `loadPlayers: () => Promise<Player[]>`).
5. Limpieza:
   - Eliminar `src/lib/scheduling/rebalance.ts` y su reexportación en `fixtureGenerator.ts` si nada más lo usa (mover a `arrangeCalendar.ts` cualquier helper que se siga usando). Mantener o adaptar sus tests solo si cubren helpers que siguen vivos.
   - `ArrangePlan`: dejar un solo nombre por dato (`matches`, `removedStaleMatches`, `clearedMatches`) más el nuevo `baseMatches`; actualizar `AdminArrangeCalendar`.
   - `generateRandomFixture`: una sola vía para la fecha de inicio (`options.startDate`); eliminar `startDateParam` y actualizar las llamadas.

## Restricciones técnicas
- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla o nombres de archivo.
- Repo de un cliente con marca propia: NO aplicar la marca Ualdo.
- Sigue las convenciones existentes del repo.
- No cambiar las reglas de programación del Brief 08 ni el comportamiento visible del Brief 09, salvo lo indicado.
- Seguridad: errores sin datos sensibles.
- Diseño: SOLID, DRY, KISS, funciones <50 líneas, archivos <800 líneas, sin anidación >4 niveles, inmutabilidad, manejo de errores explícito.
- No añadas dependencias.
- No toques archivos fuera del alcance indicado. No toques `tasks/`, `watch_tasks.*` ni `.gitignore`.

## Tests
- `src/lib/scheduling/matchDiff.test.ts`: sin cambios devuelve listas vacías; detecta partido nuevo, modificado (hora, resultado, evento) y eliminado; no muta las entradas.
- `applyMatchChanges`, con `vi.mock` de Supabase: hace upsert antes que delete; si el upsert falla, NO llama a delete y lanza el error; usa lotes de 200; nunca llama a `deleteAllRows`.
- `findCategoriesToCreate`: categoría sin partidos se crea; categoría con pendientes en fechas pasadas y sin jugados se regenera; categoría con todos sus pendientes a partir del próximo sábado NO se regenera; categoría con algún jugado nunca se regenera.
- Aplicar dos veces seguidas `planCalendarArrangement` sobre su propio resultado no cambia ningún enfrentamiento de la categoría creada (solo, como mucho, horarios).
- `planCalendarArrangement` devuelve `baseMatches` igual a la entrada.

Cobertura >=80% en `arrangeCalendar.ts` y `matchDiff.ts`. Comandos: `npm test`, `npm run test:coverage`.

Verificación manual:
1. Abrir el panel Admin en dos pestañas. En la A pulsar "Revisar cambios". En la B cargar un resultado. En la A pulsar "Aplicar": se niega con el aviso y el resultado de B sigue en la base.
2. Revisar y aplicar sin cambios intermedios: se guarda; las fechas jugadas siguen iguales.
3. Con DevTools en "Offline", aplicar: aparece el error y, al volver la conexión y recargar, el calendario está completo (nada borrado).
4. Tras crear +50, volver a "Revisar cambios": el resumen no dice que se crea +50.

## Verificación final
1. `npm test`
2. `npm run test:coverage`
3. `npm run lint`
4. `npx tsc --noEmit`
5. `npm run build`

## Criterios de aceptación
- [ ] El calendario se guarda por diferencias (upsert primero, borrado después, solo de ids eliminados); nunca se vacía la tabla.
- [ ] Si el calendario cambió en la base desde la revisión, no se aplica y se avisa.
- [ ] Una categoría ya programada desde el próximo sábado no se vuelve a sortear.
- [ ] El plan se calcula con jugadores que incluyen la cédula.
- [ ] Sin código muerto (`rebalance.ts`), sin campos duplicados en `ArrangePlan` y con una sola vía para `startDate`.
- [ ] Todos los tests pasan; cobertura >=80%; build, lint y `tsc` sin errores.
- [ ] Cero emojis en el diff.
