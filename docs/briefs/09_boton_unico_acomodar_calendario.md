# Brief 09: Un solo botón "Acomodar calendario" según las categorías activas

## Contexto
Proyecto: Copa Abogados. Stack: Next.js 16.3 (ver `AGENTS.md`), React 19, TypeScript, Tailwind 4, Supabase, Vitest (`npm test`). Requisito previo: Brief 08 construido (commit `2c1d147`), con `src/lib/scheduling/` (`matchday.ts`, `fairness.ts`, `rebalance.ts`, `sharedPlayers.ts`, `random.ts`).

Situación real del torneo (2026-09-30): ya se jugaron 4 fechas (sábados desde `SEASON_START = '2026-09-05'`, en `src/lib/fixtureGenerator.ts:30`). La categoría "+50 Varones" está en "Próximamente" y EMPIEZA ESTE SÁBADO. Puede que ya tenga partidos generados en fechas pasadas y sin jugar, o que no tenga ninguno. Antes de construir, ejecutar `docs/consultas/estado-calendario-por-categoria.sql` en Supabase y anotar el resultado en el resumen final.

Hoy, en Admin > Configuración (`src/components/AdminModal.tsx`, líneas ~1058-1170), hay cuatro tarjetas y botones de calendario que confunden al administrador:
- "Rehacer Calendario de una Categoría" (`onRegenerateCategory` -> `handleRegenerateCategory` en `src/app/page.tsx` ~546 -> `regenerateCategories`).
- "Reacomodar Horarios (quitar huecos)" (`onRepackSchedule` -> `handleRepackSchedule` ~559 -> `repackSchedule`, que ya equivale a `rebalanceFutureDates`).
- "Equilibrar fechas no jugadas", dentro de `src/components/AdminScheduleFairness.tsx` (~194).
- "Borrar Horarios Establecidos" (`onClearTimes` -> `handleClearTimes` ~492).

Además, al cambiar la categoría de un equipo, `handleUpdateTeam` (`page.tsx` ~353-378) ofrece un `confirm` que llama a `moveTeamCategory`.

Decisiones del cliente:
1. Quitar los cuatro botones y el ajuste automático al mover un equipo. Dejar UN solo botón, "Acomodar calendario", que acomode los horarios de todas las categorías ACTIVAS.
2. Ese botón también crea el calendario de una categoría activa que aún no tiene partidos jugados (caso de +50 esta semana).
3. No se permite cambiar la categoría de un equipo que ya tiene partidos.

Estados de categoría (`src/types/index.ts`, líneas ~10-20; ajustes en `settings`): ACTIVA, PRÓXIMAMENTE (`comingSoonCategories`), EN PAUSA (`pausedCategories`), SUSPENDIDA (`suspendedCategories`). "Activa" = ninguna de las otras tres.

## Objetivo
En Admin existe un único botón "Acomodar calendario". Muestra antes un resumen de lo que va a hacer y, al confirmar:
- crea el calendario (desde el próximo sábado) de cada categoría activa sin partidos jugados;
- asigna hora y cancha a todos los partidos de fechas futuras de las categorías activas, con las reglas del Brief 08 (dueños, jugadores compartidos con un turno libre, equidad);
- deja sin hora los partidos futuros de categorías no activas.

Las fechas ya jugadas y los partidos jugados no se tocan nunca.

## Requerimientos
1. Lógica nueva y pura en `src/lib/scheduling/arrangeCalendar.ts`:
   ```ts
   export interface ArrangeInput {
     matches: Match[]; teams: Team[]; players: Player[];
     activeCategories: Category[];
     today: string;              // YYYY-MM-DD local (usar localDateString)
     rng?: () => number;
   }
   export interface ArrangePlan {
     matches: Match[];                          // calendario resultante completo
     createdCategories: { category: Category; rounds: number; firstDate: string; matches: number }[];
     removedStaleMatches: number;               // partidos SCHEDULED eliminados al regenerar
     retimedMatches: number;                    // partidos cuyo time/stadium cambió
     clearedMatches: number;                    // partidos de categorías no activas que quedan sin hora
     overCapacityDates: { date: string; matches: number; capacity: number }[];
     warnings: string[];                        // p. ej. equipos activos sin ningún partido
   }
   export function planCalendarArrangement(input: ArrangeInput): ArrangePlan;
   ```
2. Reglas de `planCalendarArrangement`, en este orden:
   - **Próximo sábado**: `nextSaturday(today)`, el primer sábado ESTRICTAMENTE posterior a `today`, salvo que `today` sea sábado y ese día no tenga partidos jugados ni en juego (entonces es `today`). Función pura y testeada.
   - **Categorías a crear**: una categoría activa con al menos 2 equipos y CERO partidos jugados o en juego (`FINISHED` o `IN_PROGRESS`). Se eliminan sus partidos existentes (todos están en `SCHEDULED`) y se genera un calendario nuevo (todos contra todos + play offs) cuya jornada 1 cae en el próximo sábado, una jornada por sábado. Añadir a `generateRandomFixture` un parámetro opcional `startDate?: string` (por defecto `SEASON_START`); no duplicar el generador. Los ids nuevos no pueden chocar con los existentes: usar `m-<categoria>-<uuid corto>` o comprobar colisiones.
   - **Categorías activas con partidos jugados**: se conservan TODOS sus enfrentamientos, jornadas y fechas. Solo se reasignan hora y cancha en fechas futuras.
   - **Categorías no activas** (próximamente, en pausa o suspendidas): sus partidos de fechas futuras que sigan en `SCHEDULED` quedan con `time: ''` y `stadium: ''` (sin hora). No ocupan turnos. No se borran ni cambian de fecha. Cuando la categoría vuelva a estar activa, el mismo botón les dará hora.
   - **Horarios**: para cada fecha futura (`date >= proximoSabado`) en la que ningún partido esté `FINISHED` ni `IN_PROGRESS`, programar SOLO los partidos de categorías activas con `scheduleMatchday` (historial acumulado desde las fechas anteriores + `buildSharedPlayerPairs(players)`), reutilizando `rebalance.ts`. Las fechas con partidos jugados o en juego no se tocan.
   - **Capacidad**: si una fecha tiene más partidos activos que `MATCH_TIME_SLOTS.length * CANCHAS.length` (16), no se programa y se reporta en `overCapacityDates`. El plan con `overCapacityDates` no vacío NO se puede aplicar (ver punto 4).
   - **Avisos**: equipos de categorías activas sin ningún partido (por ejemplo, un equipo nuevo en una categoría que ya empezó) van a `warnings` con su nombre y categoría. El botón no los agrega al calendario.
   - Play offs: después de planificar, pasar el resultado por `recomputePlayoffs` (`src/lib/playoffs.ts`) como hoy.
   - Funciones <50 líneas; dividir en helpers (`nextSaturday`, `categoriesToCreate`, `regenerateCategory`, `clearInactive`, `retimeFutureDates`, `capacityCheck`).
3. Limpieza de código muerto en `src/lib/fixtureGenerator.ts`: eliminar `regenerateCategories`, `moveTeamCategory`, `scheduleAround` y `repackSchedule` si ya nadie los usa. Mantener `generateRandomFixture` y `seasonSaturdays`. Mover o eliminar sus tests según corresponda.
4. Interfaz:
   - `src/components/AdminModal.tsx`: quitar las tarjetas "Rehacer Calendario de una Categoría", "Reacomodar Horarios" y "Borrar Horarios Establecidos", el estado `regenCat` y las props `onRegenerateCategory`, `onRepackSchedule`, `onClearTimes` y `onRebalanceSchedule`. Añadir una sola tarjeta nueva, extraída a `src/components/AdminArrangeCalendar.tsx`, colocada antes de "Equidad de horarios".
   - `AdminArrangeCalendar` (props: `matches`, `teams`, `players`, `activeCategories`, `onApply(plan: ArrangePlan) => Promise<boolean>`):
     - Título "Acomodar calendario". Texto: "Asigna hora y cancha a todas las fechas futuras de las categorías activas y crea el calendario de las categorías activas que aún no empezaron. Las fechas jugadas no se tocan."
     - Botón "Revisar cambios": calcula `planCalendarArrangement` y muestra el resumen en la propia tarjeta (no en un `confirm`):
       - categorías que se crearán, con número de jornadas, primera fecha y partidos;
       - partidos pendientes que se eliminan al regenerar;
       - partidos que cambian de hora;
       - partidos que quedan sin hora por ser de categorías no activas;
       - fechas sobre capacidad, en rojo;
       - avisos.
     - Botón "Aplicar", deshabilitado si hay fechas sobre capacidad o si no hay cambios. Pide un `window.confirm` final: "Se aplicarán los cambios mostrados. Avisa a los delegados de los nuevos horarios."
     - Estado de carga y botón deshabilitado mientras aplica (evitar doble clic).
   - `src/components/AdminScheduleFairness.tsx`: quitar el botón "Equilibrar fechas no jugadas" y su lógica. Mantener la tabla de reparto, la lista de equipos que comparten jugadores y las alertas.
   - `src/app/page.tsx`: quitar `handleRegenerateCategory`, `handleRepackSchedule`, `handleClearTimes` y `handleRebalanceSchedule`. Añadir `handleApplyCalendarPlan(plan)`: comprobar que el plan no tiene `overCapacityDates`; `setMatches` optimista; persistir con `replaceMatches(plan.matches)` (que ya borra los partidos eliminados; verificar en `src/lib/store.ts` que `replaceMatches` reemplaza y no solo inserta, y si no, borrar explícitamente los ids eliminados); si falla, revertir y avisar. Devuelve `true` o `false`. Usar `ensureFullPlayers()` para calcular el plan con cédulas.
   - `activeCategories` = `CATEGORIES` menos `suspendedCategories`, `comingSoonCategories` y `pausedCategories` (unificar con `hiddenCalendarCategories` de `page.tsx`, línea ~109).
5. No permitir mover equipos con partidos:
   - `src/components/TeamEditModal.tsx`: nueva prop `hasMatches: boolean`. Si es `true`, el select de categoría queda deshabilitado con el texto: "Este equipo ya tiene partidos en el calendario. Para cambiarlo de categoría, elimínalo y créalo de nuevo en la categoría correcta."
   - `src/app/page.tsx`, `handleUpdateTeam`: quitar el bloque de `moveTeamCategory`. Como defensa, si llega un cambio de categoría para un equipo con partidos, rechazarlo con `alert` y no guardar.
   - Pasar `hasMatches` desde donde se abre `TeamEditModal` (`AdminModal.tsx`, buscar `<TeamEditModal`).
6. Operación previa para +50 esta semana (documentarla en el resumen final, no automatizarla): el admin debe cambiar +50 de "Próximamente" a "Activa" en Configuración y luego usar "Acomodar calendario".

## Restricciones técnicas
- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla o nombres de archivo. Iconos solo con `lucide-react` (SVG). Los `confirm` de `handleUpdateTeam` que se eliminen tenían viñetas; no reintroducir símbolos.
- Repo de un cliente con marca propia: NO aplicar la marca Ualdo. Mantener el estilo visual del panel Admin.
- Sigue las convenciones existentes del repo.
- Prioridades del Brief 08 intactas: reglas duras de dueño y jugadores compartidos > descanso exacto y dueño compacto > equidad.
- Nunca modificar partidos `FINISHED` o `IN_PROGRESS`, ni fechas que tengan alguno, ni fechas anteriores al próximo sábado.
- Seguridad: la acción solo está disponible para ADMIN (ya lo está al vivir en `AdminModal`); errores sin datos sensibles.
- Diseño: SOLID, DRY, KISS, funciones <50 líneas, archivos <800 líneas (no añadir lógica a `AdminModal.tsx`), sin anidación >4 niveles, inmutabilidad, manejo de errores explícito.
- No añadas dependencias.
- No toques archivos fuera del alcance indicado. No toques `tasks/`, `watch_tasks.*` ni `.gitignore`.

## Tests
`src/lib/scheduling/arrangeCalendar.test.ts`, con `rng` de semilla fija y un calendario de prueba que simule la situación real (4 fechas jugadas de Abierta, +40 y Damas; +50 activa con partidos `SCHEDULED` en fechas pasadas):
- `nextSaturday`: miércoles -> sábado de esa semana; sábado con partidos jugados -> sábado siguiente; sábado sin partidos jugados -> ese mismo día.
- +50 se regenera: sus partidos viejos desaparecen, la jornada 1 cae en el próximo sábado, todos los equipos de +50 juegan todos contra todos y existen sus play offs.
- Las 4 fechas jugadas quedan idénticas (`toEqual` con el original).
- Categorías activas con partidos jugados: mismos enfrentamientos, jornadas y fechas; solo cambian `time` y `stadium` en fechas futuras.
- Categoría no activa: sus partidos futuros quedan con `time: ''` y `stadium: ''`, y los pasados intactos.
- Reglas en el resultado: 0 choques de dueño, 0 pares con jugadores compartidos simultáneos o seguidos, máximo 2 partidos por turno, cada día desde el turno 0.
- Capacidad: con 17 partidos activos en una fecha, `overCapacityDates` lo reporta y esa fecha no se modifica.
- Avisos: un equipo activo sin partidos aparece en `warnings`.
- `TeamEditModal`: si no hay tests de componentes en el repo, cubrir la regla con una función pura `canChangeCategory(teamId, matches)` en `src/lib/registration.ts` o un archivo nuevo, y testearla.

Cobertura >=80% en `src/lib/scheduling/arrangeCalendar.ts`. Añadirlo a `coverage.include` en `vitest.config.ts`. Comandos: `npm test`, `npm run test:coverage`.

Verificación manual (en local o preview antes de producción):
1. Admin > Configuración: solo aparecen "Acomodar calendario" y "Equidad de horarios" (sin botón de equilibrar). Ya no están "Rehacer", "Reacomodar" ni "Borrar horarios".
2. Cambiar +50 a "Activa" y pulsar "Revisar cambios": se muestra que se crea +50 desde el próximo sábado, cuántos partidos cambian de hora y que no hay fechas sobre capacidad.
3. Aplicar: el calendario del próximo sábado incluye +50, las fechas 1 a 4 no cambian y no hay dos partidos del mismo dueño a la vez.
4. Editar un equipo con partidos: el select de categoría está deshabilitado con el mensaje.

## Verificación final
1. `npm test`
2. `npm run test:coverage`
3. `npm run lint`
4. `npx tsc --noEmit`
5. `npm run build`

## Criterios de aceptación
- [ ] En Configuración queda un único botón de calendario, "Acomodar calendario", con revisión previa y confirmación.
- [ ] Una categoría activa sin partidos jugados (+50) recibe calendario nuevo desde el próximo sábado.
- [ ] Las fechas y los partidos jugados no cambian nunca.
- [ ] Las categorías no activas no ocupan turnos: sus partidos futuros quedan sin hora.
- [ ] Si un sábado supera la capacidad de 16 partidos, no se puede aplicar y se muestra en rojo.
- [ ] No se puede cambiar la categoría de un equipo con partidos.
- [ ] Se eliminaron `regenerateCategories`, `moveTeamCategory`, `scheduleAround`, `repackSchedule` y los handlers y props de los botones quitados.
- [ ] Todos los tests pasan; cobertura >=80% en el código nuevo; build, lint y `tsc` sin errores.
- [ ] Cero emojis en el diff.
