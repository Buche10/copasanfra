# Brief 14: Detectar calendarios con jornadas mal armadas (+50 tras el retiro)

## Contexto
Proyecto: Copa Abogados. Stack: Next.js 16.3, React 19, TypeScript, Vitest (`npm test`). En producción: commit `2850215`. Urgente: +50 juega el sábado 2026-10-03.

Datos reales de +50 en producción (2026-09-30, 15:36, tras pulsar "Acomodar calendario"): 4 equipos (AKD (+50), Amigos del C.A.T., IURA y CEFNA Ecuador) y 12 partidos de fase regular repartidos en 10 jornadas:

| Jornadas | Partidos por jornada |
|---|---|
| 1, 2, 4, 5, 6, 7, 9 y 10 | 1 |
| 3 y 8 | 2 |

Más la final en la jornada 11 (2026-12-12). Casi todas las fechas tienen un solo partido y dos equipos descansan. Es el calendario de 5 equipos con los partidos de Club Constelación (retirado) eliminados.

`checkCalendarMismatch` (`src/lib/scheduling/arrangeCalendar.ts`, líneas ~59-84) no lo detecta por una coincidencia:
- todos los equipos tienen partidos;
- ningún partido referencia a un equipo que no existe;
- el total de partidos regulares es 12, que es justo `n*(n-1)` con n = 4 a doble vuelta;
- además, cada par se enfrenta exactamente dos veces.

Por eso "Acomodar calendario" no regenera +50.

## Objetivo
"Acomodar calendario" detecta que el calendario de +50 no tiene la estructura correcta para 4 equipos y lo regenera desde el próximo sábado: 6 jornadas de 2 partidos (doble vuelta), sin descansos, más play offs.

## Requerimientos
1. En `checkCalendarMismatch` (`arrangeCalendar.ts`), además de las comprobaciones actuales, considerar desajustado el calendario si su estructura de jornadas no es la esperada para `n` equipos:
   - Jornadas regulares esperadas: con `n` par, `n - 1`; con `n` impar, `n`. Por 2 si la categoría es a doble vuelta (`isDoubleRoundRobin`).
   - Partidos por jornada esperados: `Math.floor(n / 2)`.
   - Desajustado si el número de jornadas regulares distintas (valores distintos de `round` en partidos no play off) es diferente del esperado, o si alguna jornada regular tiene un número de partidos distinto de `Math.floor(n / 2)`.
   - Desajustado si algún equipo juega más de un partido en la misma jornada.
2. El motivo en el resumen debe ser claro, por ejemplo: "+50 Varones: el calendario tiene 10 jornadas con partidos sueltos, pero con 4 equipos deben ser 6 jornadas de 2 partidos; se regenera desde el 2026-10-03".
3. Mantener que solo se regenera si la categoría NO tiene partidos jugados ni en juego. Si tiene, solo se avisa en `warnings`.
4. Comprobar que las categorías con calendario correcto (Abierta, +40 y Damas en producción) NO se marcan como desajustadas. Ojo: Abierta tiene partidos con ids `m-move-9xx`, de un antiguo "mover equipo". Tiene partidos jugados, así que no se regenera en ningún caso, pero no debe generar avisos falsos si su estructura es correcta.

## Restricciones técnicas
- CERO EMOJIS. NO aplicar la marca Ualdo. Sigue las convenciones del repo. Funciones <50 líneas (extraer `checkRoundStructure`). No añadas dependencias. No toques `tasks/`, `watch_tasks.*` ni `.gitignore`.

## Tests (`src/lib/scheduling/arrangeCalendar.test.ts`)
- Caso real: 4 equipos de +50 con los 12 partidos regulares repartidos en 10 jornadas como en la tabla del Contexto, sin jugados: se detecta el desajuste, se regenera y el resultado tiene 6 jornadas regulares de 2 partidos, empezando el próximo sábado, y cada equipo juega exactamente 1 partido por jornada.
- Calendario correcto de 4 equipos a doble vuelta (6 jornadas de 2): NO se regenera.
- Calendario correcto de 5 equipos (10 jornadas de 2 a doble vuelta): NO se regenera.
- Categoría de una sola vuelta con número impar de equipos: estructura correcta, NO se regenera.
- Mismo desajuste pero con un partido jugado: no se regenera y aparece el aviso en `warnings`.

## Verificación final (Windows cmd, en la carpeta del proyecto)
1. `npm test` (los 2 fallos conocidos del Brief 13 pueden seguir; ningún fallo nuevo)
2. `npm run lint`
3. `npm run build`

## Criterios de aceptación
- [ ] El caso real de +50 (12 partidos en 10 jornadas) se detecta y se regenera en 6 jornadas de 2 partidos desde el próximo sábado.
- [ ] Los calendarios correctos no se regeneran.
- [ ] El motivo se ve en el resumen de "Revisar cambios".
- [ ] Lint y build sin errores; sin fallos de test nuevos. Cero emojis.
