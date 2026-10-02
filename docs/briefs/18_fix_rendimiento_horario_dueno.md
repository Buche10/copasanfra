# Brief 18: Corrección del Brief 17 (rendimiento del planificador y tests)

## Contexto
Proyecto: Copa Abogados (marca del cliente, NO Ualdo). Stack: Next.js 16.3, React 19, TypeScript, Vitest (`npm test`). Antes de tocar código de Next lee la guía que corresponda en `node_modules/next/dist/docs/` (ver `AGENTS.md`).

El Brief 17 (máximo un turno libre entre partidos del mismo dueño) está construido sin commitear. La lógica es correcta en lo funcional, pero la auditoría del 2026-10-02 encontró:

1. **HIGH, rendimiento.** `npm run test:coverage` pasó de 84 s a **688 s**. Dos tests de `src/lib/scheduling/matchday.test.ts` ("cumple reglas de dueño, canchas y dia compacto en 300 fechas generadas" y "respeta descanso de jugadores compartidos") superan su límite de 40 s: tardan 171 s y 301 s, cuando antes cabían en 40 s. El test de AKD en `src/lib/scheduling/ownerGaps.test.ts` (30 fechas de solo 4 partidos) tarda 8,5 s, unos 280 ms por fecha. "Acomodar calendario" se ejecuta en el navegador y programa todas las fechas futuras, así que esto congela la pantalla del Admin. El Brief 17 exigía mantener el tiempo en el mismo orden de magnitud.
2. **MEDIUM, test debilitado.** En `matchday.test.ts` (línea ~132) se cambió `expect(gap).toBe(0)` por `toBeLessThanOrEqual(1)`. El brief pedía que ese test siguiera pasando sin cambios: sin jugadores compartidos, los equipos del mismo dueño deben quedar seguidos.
3. **MEDIUM, tests incompletos.** El caso AKD usa 30 fechas con un `rng` constante en lugar de 300 fechas con `createRng`. El caso "dos dueños que se enfrentan" no recorre 300 fechas. Con un `rng` constante, `repairSchedule` acepta siempre los empates (`ctx.rng() < 0.15`) y agota las 300 iteraciones, lo que distorsiona los tiempos.
4. **LOW.** `computeOwnerGapViolations` y `computeSoftPenalties` (`src/lib/scheduling/score.ts`) duplican la rama `ms.length === 2`. `findOwnerGapViolations` (`src/lib/scheduling/arrangeCalendar.ts`) y su llamada usan el número `1` literal en vez de `MAX_OWNER_FREE_SLOTS`.

Fallos que ya existían antes del Brief 17 (Brief 13) y que NO forman parte de este brief: el test de equidad "max temprano <= 35 %" (hoy da 35,4 %) y el error "Timeout calling onTaskUpdate".

## Objetivo
Mantener exactamente la regla del Brief 17 (dueño con máximo un turno libre; seguidos si no comparten jugadores; un turno exacto si comparten), pero con `scheduleMatchday` igual de rápido que antes del Brief 17 y con los tests completos y sin debilitar.

## Requerimientos
1. **Medir primero.** Crea `src/lib/scheduling/matchday.bench.test.ts` (o un test con `performance.now()`) que programe 50 fechas reales con `INITIAL_TEAMS` de `src/lib/mockData.ts` y `createRng(7)`, con y sin `sharedPairs`, e imprima el tiempo medio por fecha. Anota en el resumen final los tiempos antes y después del cambio. Para obtener el "antes del Brief 17", ejecuta el mismo test con `git stash` o en una copia limpia del commit `9dc0233`.
2. **Poda en `searchWindowSlots`** (`src/lib/scheduling/matchday.ts`): hoy la separación máxima solo se comprueba al final (`idx >= unplaced.length`), así que se recorren todas las permutaciones. Ordena los candidatos y descarta una rama en cuanto los turnos ya decididos (colocados más plan parcial) hagan imposible cumplir `MAX_OWNER_FREE_SLOTS`, por ejemplo si un hueco entre turnos ya fijados no puede rellenarse con los partidos que quedan.
3. **Limitar ventanas inútiles** en `findWindowPlan`: no probar anchos mayores que `slotCount`. Si `k` (partidos del club ese día) hace que `k + (k - 1) * MAX_OWNER_FREE_SLOTS > slotCount`, usa `slotCount`. Corta en cuanto encuentres un plan de coste mínimo posible (sin hueco previo y con coste de equidad 0).
4. **Revisar el bucle de intentos** en `scheduleMatchday`: hoy se ejecuta `repairSchedule` sobre cada intento si `best.score >= 1000`. Con la nueva regla dura, casi todos los intentos entran ahí. Reduce el trabajo sin perder calidad. Por ejemplo:
   - repara solo los intentos cuyo `raw.score` sea menor que `best.score`;
   - o termina antes si `best.score` no tiene parte dura (`< 1_000_000`) y lleva N intentos sin mejorar (N razonable, por ejemplo 60).

   Justifica la elección en el resumen con los tiempos medidos.
5. **No mover pesos ni reglas**: la violación del dueño sigue siendo dura (1.000.000), por encima de `canchasLlenas`. Las reglas de compartidos no cambian.
6. **Restaurar el test** de `matchday.test.ts` (línea ~132) a `expect(gap).toBe(0)`. Si falla, el algoritmo tiene que corregirse, no el test. Sin jugadores compartidos el dueño queda seguido.
7. **Completar `ownerGaps.test.ts`:**
   - Caso AKD: 300 fechas con `createRng(seed)` distinto por fecha (de `src/lib/scheduling/random.ts`), 3 equipos que comparten jugadores entre sí, más al menos 10 partidos de otros equipos sin dueño común. Comprobar en el 100 % de las fechas: 0 simultáneos del dueño, 0 compartidos seguidos y huecos de máximo 1.
   - Dos dueños que se enfrentan: club A (3 equipos) y club B (2 equipos) con un partido A contra B. 300 fechas con `createRng`: huecos de máximo 1 para ambos.
8. **DRY en `score.ts`**: extrae un helper `sortedPlacedSlots(clubIdx, matchSlot)` (o similar) que usen `computeOwnerGapViolations` y `computeSoftPenalties`, y elimina la rama duplicada de `ms.length === 2`. En `arrangeCalendar.ts`, usa `MAX_OWNER_FREE_SLOTS` (importado de `./matchday`) en lugar del `1` literal.

## Restricciones técnicas
- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla o nombres de archivo.
- Marca: NO aplicar la marca Ualdo.
- Convenciones del repo: comentarios en español, imports con `@/`, estilo de `matchday.ts`.
- Diseño: funciones <50 líneas; archivos <800 líneas (si `matchday.ts` se pasa, mueve la compactación a `src/lib/scheduling/compact.ts`); sin anidación >4 niveles.
- **No subas** los timeouts de los tests para que pasen, ni reduzcas las 300 fechas de los tests de reglas.
- No toques los Briefs 15 y 16 (`crossCategory`, `sanctions`, componentes de jugadores y sanciones).
- No añadas dependencias. No toques `tasks/`, `watch_tasks.*`, `.gitignore` ni archivos fuera del alcance.

## Tests
- Los de `matchday.test.ts` con sus límites actuales (40 s) y `gap` restaurado a 0.
- Los de `ownerGaps.test.ts` ampliados según el requerimiento 7; cada test por debajo de 10 s.
- El de rendimiento del requerimiento 1, con un límite de 150 ms de media por fecha con `INITIAL_TEAMS`.

## Verificación final (PowerShell, en `C:\laragon\www\Copa Abogados`)
1. `npm test`: solo pueden fallar el test de equidad (35 %) y el error "onTaskUpdate", ya conocidos del Brief 13. Ningún otro fallo ni timeout.
2. `npm run test:coverage`: duración total similar a la de antes del Brief 17 (alrededor de 90 s o menos).
3. `npm run lint`
4. `npm run build`

## Criterios de aceptación
- [ ] Se cumple la regla del Brief 17: máximo 1 turno libre por dueño, seguidos sin compartidos y 1 turno exacto con compartidos.
- [ ] Los dos tests de 300 fechas de `matchday.test.ts` pasan dentro de 40 s y el test de dueño exige `gap` 0.
- [ ] Caso AKD y caso de dos dueños con 300 fechas y `createRng`, en verde.
- [ ] Tiempo medio por fecha de 150 ms o menos, con los tiempos de antes y después en el resumen.
- [ ] Sin código duplicado en `score.ts` y sin el `1` literal en `arrangeCalendar.ts`.
- [ ] Lint y build sin errores; cero emojis.
