# Brief 12: Completar el Brief 11 (canchas llenas, +50 con 4 equipos, borrado seguro)

## Contexto
Proyecto: Copa Abogados. Stack: Next.js 16.3 (ver `AGENTS.md`), React 19, TypeScript, Supabase, Vitest (`npm test`). Leer primero `docs/briefs/11_fix_canchas_llenas.md`: este brief NO cambia sus requisitos, solo lista lo que falta o quedó mal. Urgente: +50 empieza el sábado 2026-10-03.

Estado auditado (2026-09-30, 14:52): solo cambiaron `src/lib/scheduling/matchday.ts`, `src/lib/scheduling/score.ts` (nuevo) y 2 líneas de `matchday.test.ts`. Tests, `tsc` y build pasan; el lint da 4 avisos.

Prueba con los 14 partidos reales del 03 de octubre (datos en el Contexto del Brief 11), 50 semillas:
- Sin jugadores compartidos: 7 turnos llenos en 46/50. Hay repartos como `2,2,1,2,2,2,2,1`.
- Con 3 pares compartidos (Alianza, Lawyers, Fuerza Legal): 40/50. Hay un caso `1,1,2,2,2,2,2,2`, es decir, 08:00 con una sola cancha, el mismo fallo de producción.
- Reglas duras: 0 violaciones. Dueños compactos: 50/50. Tiempo: 26 ms de media y 97 ms como máximo (bien).

### HIGH 1: la penalización "canchas llenas" no se aplica
`src/lib/scheduling/score.ts`, `computeScore` (línea ~98) calcula `const canchasLlenas = computeCanchasLlenas(...)`, pero NO la suma: devuelve `hard * 1_000_000 + soft * 1_000 + equity`. Por eso el algoritmo sigue dejando canchas vacías al azar (el lint lo avisa: `'canchasLlenas' is assigned a value but never used`). El requisito 1 del Brief 11 no está cumplido.

### HIGH 2: faltan los puntos 5 y 6 del Brief 11
- Punto 5 (regenerar una categoría sin jugados cuyo calendario no coincide con sus equipos): `src/lib/scheduling/arrangeCalendar.ts` no cambió. "Acomodar calendario" NO rehace +50 con sus 4 equipos: el 03 de octubre seguiría con un solo partido de +50 y dos equipos descansando.
- Punto 6 (eliminar un equipo guardando por diferencias y con aviso): `src/app/page.tsx` no cambió; `handleDeleteTeam` sigue usando `replaceMatches`.

### MEDIUM
- Faltan todos los tests nuevos del Brief 11: regresión del 03 de octubre en 50 semillas, versión con jugadores compartidos, número impar, compacidad de dueños, regeneración de categoría desactualizada y `planTeamDeletion`.
- `score.ts` duplica código de `matchday.ts`. Hay que dejar una sola fuente: la puntuación y las penalizaciones viven en `score.ts` y `matchday.ts` solo las importa.

### LOW
- Lint: variables sin usar `turnosMinimos` (`matchday.ts:243`), `hardViolations` (`matchday.ts:321`) y `canchasLlenas` (`score.ts:98`). Si `placeAnywhere` fuerza una colocación inválida, su violación dura debe seguir contando en la puntuación (no descartar `hardViolations`).
- `console.log('894b713 MAX EARLY PCT:', ...)` en `src/lib/scheduling/matchday.test.ts:66`. Eliminarlo.

## Objetivo
Cumplir por completo el Brief 11: con los datos reales del 03 de octubre, 7 turnos llenos en todas las semillas; +50 regenerada con 4 equipos (2 partidos por fecha) al pulsar "Acomodar calendario"; y eliminar un equipo sin reescribir la tabla.

## Requerimientos
1. `score.ts`: `return hard * 1_000_000 + canchasLlenas * 100_000 + soft * 1_000 + equity;`. `matchday.ts` usa esa única `computeScore`; eliminar duplicados.
2. Mantener `hardViolations` de `placeAnywhere` sumado como `baseHard` en la puntuación.
3. Implementar los puntos 5 y 6 del Brief 11 tal como están escritos (regeneración por calendario que no coincide con los equipos, con motivo visible en el resumen; `handleDeleteTeam` con `planTeamDeletion`, `applyMatchChanges(diffMatches(...))`, confirmación con número de partidos y de partidos jugados, y relectura de la base si falla).
4. Añadir todos los tests del apartado "Tests" del Brief 11, con los umbrales allí indicados: 7 turnos llenos en 50/50 semillas sin compartidos; con compartidos, como mucho una cancha libre y solo en el último turno en al menos el 95 %.
5. Resolver los avisos de lint y quitar el `console.log`.

## Restricciones técnicas
- Las del Brief 11, sin cambios. CERO EMOJIS. NO aplicar la marca Ualdo. Funciones <50 líneas, archivos <800 líneas, inmutabilidad, manejo de errores explícito. Rendimiento: menos de 200 ms por sábado. No añadas dependencias. No toques `tasks/`, `watch_tasks.*` ni `.gitignore`.

## Tests
Los del Brief 11. Además, un test unitario de `computeScore` que compruebe que dos distribuciones iguales en todo salvo una cancha libre a las 08:00 difieren en exactamente 100.000 puntos.

## Verificación final
1. `npm test`
2. `npm run test:coverage`
3. `npm run lint` (0 errores y 0 avisos en los archivos tocados)
4. `npx tsc --noEmit`
5. `npm run build`

## Criterios de aceptación
- [ ] `computeScore` incluye `canchasLlenas * 100_000` y hay un test que lo prueba.
- [ ] Regresión del 03 de octubre: 7 turnos llenos en 50/50 semillas sin compartidos, y al menos 95 % con compartidos (cancha libre solo en el último turno).
- [ ] "Acomodar calendario" regenera +50 con sus 4 equipos desde el 2026-10-03 (2 partidos por fecha), y lo indica en el resumen.
- [ ] Eliminar un equipo guarda por diferencias y avisa de los partidos y los jugados que se borran.
- [ ] Sin código duplicado en `score.ts`/`matchday.ts`, sin `console.log` y sin avisos de lint en los archivos tocados.
- [ ] Todos los tests pasan; build y `tsc` sin errores. Cero emojis en el diff.
