# Brief 13: Ajustar y completar los tests del calendario (cierre del Brief 12)

## Contexto
Proyecto: Copa Abogados. Stack: Next.js 16.3, React 19, TypeScript, Vitest (`npm test`). Leer primero `docs/briefs/11_fix_canchas_llenas.md` y `docs/briefs/12_fix_brief11_incompleto.md`. Urgente: +50 empieza el sábado 2026-10-03.

Estado del código (auditado leyendo el código y con `npm test` ejecutado por el usuario el 2026-09-30 a las 15:30):
- Bien: `computeScore` (`src/lib/scheduling/score.ts:107`) ya suma `canchasLlenas * 100_000`. `findCategoriesToCreate` (`arrangeCalendar.ts:59-119`) regenera categorías sin jugados cuyo calendario no coincide con sus equipos. `handleDeleteTeam` (`src/app/page.tsx:365`) usa `planTeamDeletion` y `applyMatchChanges`.
- `npm test`: 128 de 130 pasan, fallan 2, más 1 error no controlado. La suite tarda 84 s (antes, 15 s).

### HIGH: la suite de tests no pasa
1. `matchday.test.ts:68`, "equidad promediada en 20 temporadas": `expected 40.41 to be less than or equal to 35`. Al llenar las canchas desde las 08:00 se usan menos turnos por día, y un equipo de una categoría pequeña queda con el 40 % de sus partidos a las 08:00 o 09:15.
2. `matchday.test.ts:132`, "cumple reglas de dueño, canchas y dia compacto en 300 fechas": un dueño quedó con un hueco de 3 turnos. Es la consecuencia esperada de la nueva prioridad del Brief 11 (canchas llenas > dueño compacto), pero el test exige 0 huecos siempre. El umbral quedó incompatible con esa prioridad; fue un error del Brief 11, que pedía no cambiar umbrales.
3. `Error: [vitest-worker]: Timeout calling "onTaskUpdate"`: los tests pesados bloquean el hilo más de 30 s (el de equidad tardó 36 s con un límite de 30 s).

### MEDIUM
- Siguen faltando los tests del Brief 11: regresión con los 14 partidos reales del 03 de octubre (50 semillas, con y sin jugadores compartidos), número impar de partidos, regeneración de categoría desactualizada (+50 con 4 equipos) y el test de `computeScore` que difiere en exactamente 100.000 puntos. `teamDeletion.test.ts` tiene 1 solo test.
- `console.log('894b713 MAX EARLY PCT:', ...)` sigue en `matchday.test.ts:66`.
- Con partidos jugados, `findCategoriesToCreate` no avisa en `warnings` cuando el calendario no coincide con los equipos (lo pedía el punto 5 del Brief 11).

### LOW
- El texto de confirmación de `handleDeleteTeam` (`page.tsx:370-374`) va sin tildes: "eliminara", "categoria", "aun", "empezo". Corregir: "eliminará", "categoría", "aún", "empezó".

## Objetivo
`npm test` en verde, en menos de 30 s y sin errores no controlados, con umbrales coherentes con la prioridad acordada (reglas duras > canchas llenas > descanso exacto y dueño compacto > equidad), y con los tests de regresión del caso real.

## Requerimientos
1. NO cambiar la lógica de programación salvo que un test nuevo demuestre un fallo real. Este brief es sobre tests, avisos y textos.
2. Test de reglas en 300 fechas (`matchday.test.ts`, ~línea 72): mantener estrictos los 0 choques de dueño, las 0 celdas con más de 2 partidos y el día desde el turno 0. Cambiar la compacidad de dueño a: huecos (sin contar el descanso obligatorio) <= 1 turno en al menos el 97 % de los pares de partidos de un mismo dueño, y nunca más de 3. Explicar en un comentario que se relaja porque "canchas llenas" tiene prioridad.
3. Test de equidad (~línea 41): mantener la diferencia de turno promedio <= 1,0 dentro de cada categoría. Cambiar "max temprano <= 35 %" por "max temprano <= 35 % en categorías con 4 o más equipos, y <= 45 % en categorías de 2 o 3 equipos (un solo partido por día)". Justificarlo en un comentario. Reducir a 10 temporadas si hace falta para bajar el tiempo.
4. Rendimiento de la suite: ningún test por encima de 10 s. Reducir iteraciones (300 fechas -> 150, 20 temporadas -> 10) solo si no se pierde cobertura de casos. Fijar `testTimeout` razonable en `vitest.config.ts` y comprobar que desaparece el error "Timeout calling onTaskUpdate".
5. Añadir los tests del Brief 11 que faltan:
   - Regresión con los 14 partidos reales del 2026-10-03 (lista en el Contexto del Brief 11), en 50 semillas:
     - sin compartidos: 7 turnos llenos (`2,2,2,2,2,2,2`) en 50/50;
     - con 3 pares compartidos (Alianza Legal / Alianza Legal (+40), Lawyers / Lawyers (+40), Fuerza Legal / Fuerza Legal (+40)): 0 violaciones duras, y como mucho una cancha libre, siempre en el último turno, en al menos el 95 %;
     - dueños con distancia <= 2 turnos en al menos el 90 %.
   - 13 partidos: 7 turnos, con la única cancha libre en el último.
   - `computeScore`: dos distribuciones iguales salvo una cancha libre a las 08:00 difieren en exactamente 100.000.
   - `planCalendarArrangement`: +50 con calendario de 5 equipos (11 partidos regulares) y 4 equipos actuales, sin jugados, se regenera con 12 partidos regulares (2 por jornada) y el motivo aparece en el resumen. Si tuviera un jugado, no se regenera y aparece el aviso en `warnings`.
   - `planTeamDeletion`: equipo sin partidos, equipo con jugados (cuenta `playedRemoved`), y que no muta las entradas.
6. Añadir en `findCategoriesToCreate` el aviso en `warnings` para categorías con jugados cuyo calendario no coincide.
7. Quitar el `console.log` y corregir las tildes del texto de `handleDeleteTeam`.

## Restricciones técnicas
- CERO EMOJIS. NO aplicar la marca Ualdo. Sigue las convenciones del repo. Funciones <50 líneas, archivos <800 líneas. No añadas dependencias. No toques `tasks/`, `watch_tasks.*` ni `.gitignore`.

## Verificación final (ejecutar en la terminal del proyecto, en Windows cmd)
1. `npm test` (todo en verde, menos de 30 s, sin "Unhandled Errors")
2. `npm run lint`
3. `npx tsc --noEmit`
4. `npm run build`

## Criterios de aceptación
- [ ] `npm test` pasa entero, sin errores no controlados y en menos de 30 s.
- [ ] Los umbrales relajados están justificados en comentarios y siguen la prioridad acordada.
- [ ] Existen los tests de regresión del 03 de octubre y pasan con los umbrales indicados.
- [ ] Existe el test de regeneración de +50 con 4 equipos.
- [ ] Aviso para categorías con jugados y calendario desajustado.
- [ ] Sin `console.log`, textos con tildes, lint y build sin errores. Cero emojis.
