# Brief 11: Canchas llenas desde las 08:00 y calendario de +50 tras el retiro de un equipo

## Contexto
Proyecto: Copa Abogados. Stack: Next.js 16.3 (ver `AGENTS.md`), React 19, TypeScript, Supabase, Vitest (`npm test`). Briefs 08 a 10 construidos y en producción (commit `894b713`).

Problema reportado en producción: el sábado 2026-10-03 hay 14 partidos de categorías activas (7 de Abierta, 5 de +40 y 2 de +50; los 2 de Damas quedan sin hora porque Damas está en pausa). Caben exactos en 7 turnos (08:00 a 15:30, dos canchas). Sin embargo, el calendario aplicado usa 8 turnos y deja la Cancha 2 vacía a las 08:00 y a las 16:45. El 2026-10-10 pasa lo mismo.

Causa (verificada reproduciendo `scheduleMatchday` con los 14 partidos reales del 03 de octubre): la puntuación de `src/lib/scheduling/matchday.ts` (`computeScore`, línea ~158) no premia llenar las canchas. El paso `compactSchedule` (línea ~433) solo elimina turnos TOTALMENTE vacíos, así que un turno con un solo partido cuenta como "usado". Con los mismos datos, en 5 corridas el reparto por turno fue:
- `2,2,2,2,2,2,2,0` (correcto);
- `2,2,2,2,1,2,2,1`;
- `1,2,2,2,2,1,2,2` (igual al de producción: 08:00 con un solo partido).

El resultado depende del azar.

También se vio poca compacidad de dueño en producción (por ejemplo, Alianza Legal a las 09:15 y Alianza Legal (+40) a las 16:45).

Datos reales del 03 de octubre para los tests (equipo y dueño):
- Abierta:
  - Legal Sport (sin dueño) vs Sanfra Legal (`club-sanfra`)
  - Camaradas (sin dueño) vs Club IDUS (`club-idus`)
  - AKD (`club-akd`) vs Futleg (`club-futleg`)
  - Leones Q (`club-leonesq`) vs Lex Pro FC (sin dueño)
  - Fuerza Legal (`club-legal`) vs Lawyers (`club-lawyers`)
  - Abogadasos (sin dueño) vs Alianza Legal (`club-alianza`)
  - Chamucos (sin dueño) vs Boman Legal (`club-boman`)
- +40:
  - Vodka Jr. vs Sporting Legal (ambos sin dueño)
  - AKD (+40) (`club-akd`) vs Leones Q (+40) (`club-leonesq`)
  - Alianza Legal (+40) (`club-alianza`) vs Boman Legal (+40) (`club-boman`)
  - Lawyers (+40) (`club-lawyers`) vs Club IDUS (+40) (`club-idus`)
  - Futleg (+40) (`club-futleg`) vs Fuerza Legal (+40) (`club-legal`)
- +50:
  - CEFNA Ecuador vs IURA (ambos sin dueño)
  - Club Constelación (sin dueño) vs AKD (+50) (`club-akd`)

### Segundo problema: +50 tras el retiro de Club Constelación
El 2026-09-30 a las 13:47 se eliminó el equipo "Club Constelación" de +50, porque se retiró del torneo. `handleDeleteTeam` (`src/app/page.tsx`, línea ~364) borró sus partidos. +50 quedó con 4 equipos (AKD (+50), Amigos del C.A.T., IURA y CEFNA Ecuador) pero con el calendario pensado para 5: cada fecha tiene un solo partido y dos equipos descansan. "Acomodar calendario" no lo rehace, porque `findCategoriesToCreate` (`src/lib/scheduling/arrangeCalendar.ts`, línea ~59) solo regenera si la categoría no tiene partidos o si tiene pendientes en fechas pasadas. Además, `handleDeleteTeam` guarda con `replaceMatches` (borra la tabla entera y la reescribe), el mismo riesgo de pérdida de datos que corrigió el Brief 10.

## Objetivo
Cada sábado usa el mínimo de turnos posible, `ceil(partidos / 2)`, con las dos canchas ocupadas en todos los turnos salvo, como mucho, el último. Así el día empieza a las 08:00 con las dos canchas llenas y, si sobra una cancha, sobra al final. Todo sin romper las reglas duras del Brief 08. Además, una categoría sin partidos jugados cuyo calendario ya no corresponde a sus equipos actuales (se retiró o se añadió un equipo) se regenera con el botón "Acomodar calendario", y eliminar un equipo ya no reescribe toda la tabla de partidos.

## Requerimientos
1. En `src/lib/scheduling/matchday.ts`, nueva penalización "canchas llenas":
   - `turnosMinimos = ceil(n / fieldsPerSlot)`.
   - `celdasVaciasIntermedias` = número de canchas libres en cualquier turno anterior al último turno usado. Más `(turnosUsados - turnosMinimos)` si se usaron turnos de más.
   - Nueva puntuación, en este orden estricto: `violacionesDuras * 1_000_000 + canchasLlenas * 100_000 + (descansoExacto + huecosDeDueño) * 1_000 + equidad`.
   - Si con las reglas duras no es posible llenar todo (por ejemplo, por muchos descansos obligatorios de jugadores compartidos), se acepta el mejor resultado posible. Solo cuando es inevitable puede quedar una cancha libre antes del final.
2. `compactSchedule` y `repairSchedule` deben trabajar con la puntuación completa (incluida la nueva) y no aceptar movimientos que la empeoren. El paso final de compactar debe, además, correr partidos hacia las canchas libres de turnos anteriores cuando no rompa reglas duras.
3. Construcción: al colocar partidos sueltos (`placeAnywhere`) y al elegir la ventana de un dueño (`findWindowPlan`), preferir los turnos que todavía tienen una cancha libre dentro de los `turnosMinimos` antes que abrir un turno nuevo.
4. Reintentos: mantener los 300 intentos. Si el mejor resultado ya tiene `canchasLlenas = 0` y `descansoExacto + huecosDeDueño = 0`, se puede cortar antes (solo como optimización).
5. Regenerar categorías desactualizadas, en `findCategoriesToCreate` (`arrangeCalendar.ts`): además de los casos actuales, regenerar una categoría activa con al menos 2 equipos y CERO partidos jugados o en juego cuando su calendario no coincide con sus equipos actuales. Es decir, cuando pasa alguna de estas cosas:
   - algún equipo actual de la categoría no aparece en ningún partido de fase regular;
   - algún partido de la categoría referencia a un equipo que ya no existe o que no es de la categoría;
   - el número de partidos de fase regular no es el esperado: `n*(n-1)/2`, por 2 en Damas y +50, que son a doble vuelta (ver `isDoubleRoundRobin` en `src/lib/fixtureGenerator.ts`).
   La regeneración empieza el próximo sábado (igual que hoy). En la revisión previa, el motivo debe verse en el resumen, por ejemplo: "+50 Varones: el calendario no coincide con sus 4 equipos actuales; se regenera desde el 2026-10-03".
   Si la categoría ya tiene partidos jugados, NO se regenera; se añade un aviso en `warnings` ("+40 Varones: el calendario no coincide con sus equipos, pero ya tiene partidos jugados; revísalo a mano").
6. Eliminar equipo sin reescribir la tabla, en `handleDeleteTeam` (`page.tsx`):
   - Reemplazar `replaceMatches(remainingMatches)` por `applyMatchChanges(diffMatches(matches, remainingMatches))` (Brief 10).
   - Antes de eliminar, un `window.confirm` que diga cuántos partidos se borran y cuántos de ellos ya están jugados: "Se eliminará el equipo X, sus N jugadores y sus M partidos (J ya jugados; sus resultados dejarán de contar en la tabla). Luego pulsa Acomodar calendario para rehacer su categoría si aún no empezó."
   - Si falla, volver a leer la base (`getTeams`, `getPlayers` o `getPlayersFull`, y `getMatches`) y mostrar eso, no la copia local.
7. No cambiar la interfaz de "Acomodar calendario" salvo mostrar el motivo del punto 5 en el resumen.

## Restricciones técnicas
- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla o nombres de archivo.
- Repo de un cliente con marca propia: NO aplicar la marca Ualdo.
- Sigue las convenciones existentes del repo.
- Prioridad estricta: reglas duras (vinculados nunca simultáneos, jugadores compartidos nunca seguidos, máximo 2 partidos por turno) > canchas llenas > descanso exacto y dueño compacto > equidad.
- Rendimiento: un sábado de 16 partidos en menos de 200 ms (el test existente debe seguir pasando).
- Diseño: SOLID, DRY, KISS, funciones <50 líneas, archivos <800 líneas (si `matchday.ts` supera ~650 líneas, extraer la puntuación a `src/lib/scheduling/score.ts`), sin anidación >4 niveles, manejo de errores explícito.
- No añadas dependencias.
- No toques archivos fuera del alcance indicado. No toques `tasks/`, `watch_tasks.*` ni `.gitignore`.

## Tests
En `src/lib/scheduling/matchday.test.ts` añadir, con semillas fijas:
- Regresión con los 14 partidos reales del 2026-10-03 (datos del Contexto; ids ficticios con los `clubId` indicados), sin jugadores compartidos: en 50 semillas distintas, el reparto por turno es siempre `2,2,2,2,2,2,2` (7 turnos llenos, 08:00 a 15:30).
- La misma regresión con dos pares de jugadores compartidos (Alianza Legal / Alianza Legal (+40) y Lawyers / Lawyers (+40)): 0 violaciones duras, y como mucho una cancha libre, siempre en el último turno, en al menos el 95 % de las semillas.
- Número impar de partidos (por ejemplo 13): 7 turnos y la única cancha libre está en el último.
- En la regresión del 03 de octubre, los dueños con dos equipos ese día quedan con distancia <= 2 turnos entre sus partidos en al menos el 90 % de las semillas (hoy Alianza queda a 6).
- Los tests existentes (reglas en 300 fechas, jugadores compartidos, equidad y rendimiento) siguen pasando sin cambiar sus umbrales.
- En `arrangeCalendar.test.ts`: una categoría sin jugados, con calendario de 5 equipos y 4 equipos actuales, se regenera con 2 partidos por jornada y sin partidos del equipo retirado. Si tuviera un partido jugado, no se regenera y sale el aviso. Una categoría con todos sus equipos y su calendario correcto NO se regenera (no se vuelve a sortear).
- `handleDeleteTeam`: extraer el cálculo a una función pura `planTeamDeletion(team, matches, players)` que devuelva `{ remainingMatches, removedMatches, playedRemoved, removedPlayers }` y testearla.

Comandos: `npm test`, `npm run test:coverage` (cobertura >=80% en `src/lib/scheduling/*`).

Verificación manual:
1. Con la web publicada, Admin > Configuración > "Acomodar calendario" > "Revisar cambios": el resumen indica que +50 se regenera con sus 4 equipos desde el 2026-10-03. "Aplicar".
1b. Calendario de +50, Jornada 1 (2026-10-03): 2 partidos y nadie descansa.
2. En Calendario > "Descargar / Imprimir programación" del 03 de octubre: 08:00 a 15:30 con las dos canchas ocupadas, sin partidos a las 16:45.
3. Revisar el 10 de octubre del mismo modo.
4. En "Equidad de horarios", sin alertas en rojo de jugadores compartidos.

## Verificación final
1. `npm test`
2. `npm run test:coverage`
3. `npm run lint`
4. `npx tsc --noEmit`
5. `npm run build`

## Criterios de aceptación
- [ ] Con los datos reales del 03 de octubre, 7 turnos llenos de 08:00 a 15:30 en todas las semillas probadas.
- [ ] Si sobra una cancha, solo queda libre en el último turno del día.
- [ ] Reglas duras intactas (0 violaciones en los tests existentes y nuevos).
- [ ] Los dueños quedan más compactos (distancia <= 2 en >=90 % de las semillas del caso real).
- [ ] Todos los tests pasan; build, lint y `tsc` sin errores.
- [ ] Una categoría sin jugados cuyo calendario no coincide con sus equipos se regenera desde el próximo sábado; con jugados, solo se avisa.
- [ ] Eliminar un equipo guarda por diferencias y avisa de cuántos partidos, y cuántos jugados, se borran.
- [ ] Cero emojis en el diff.
