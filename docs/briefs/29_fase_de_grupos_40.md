# Brief 29: Fase de grupos en +40 Varones antes de los cuartos de final

## Contexto

App Copa Sanfra 2026 (repo `Copa Abogados`): Next.js 16 con export estático (`output: 'export'`), React, TypeScript, Tailwind, Vitest y Supabase. Cada entidad se guarda como fila `{ id text pk, data jsonb }`. La capa de acceso a datos está en `src/lib/store.ts` (`upsertMatch`, `calculateStandings`, etc.) y el deploy lo hace Vercel en cada push a `main`. Esta versión de Next.js tiene cambios incompatibles con lo que conoces: antes de tocar código de Next, lee la guía que corresponda en `node_modules/next/dist/docs/` (ver `AGENTS.md`).

**Antes de empezar:** la copia local de `main` va 3 commits por detrás de `origin/main` y tiene cambios sin commitear de los briefs 26 y 27. Trabaja sobre `origin/main` actualizado (`git pull`), sin perder ni mezclar esos cambios locales.

**Estado actual de +40 Varones (datos reales al 2026-11-25):**
- Tiene 10 equipos. La fase regular (jornadas 1 a 9, todos contra todos a una vuelta) terminó y todos sus partidos están en `FINISHED`.
- Tabla final, ya con desempates: 1 Fuerza Legal, 2 Futleg (+40), 3 Club IDUS (+40), 4 Leones Q (+40), 5 Lawyers (+40), 6 Vodka Jr., 7 Alianza Legal (+40), 8 AKD (+40), 9 Boman Legal (+40), 10 Sporting Legal.
- Ya existen los partidos de play off creados por `src/lib/fixtureGenerator.ts`, con `isPlayoff: true`:
  - Cuartos, 2026-11-28: `m-40varones-146` (C1) a las 10:10 en Cancha 1, `m-40varones-149` (C4) a las 10:10 en Cancha 2, `m-40varones-147` (C2) a las 11:15 en Cancha 1, `m-40varones-148` (C3) a las 11:15 en Cancha 2.
  - Semis, 2026-12-05: `m-40varones-150` (S1) a las 12:20 y `m-40varones-151` (S2) a las 13:25, ambos en Cancha 1.
  - Final, 2026-12-12: `m-40varones-152` (F) a las 09:05 en Cancha 2.
- `src/lib/playoffs.ts`, función `recomputePlayoffs`, arma hoy los cuartos con la tabla regular (1v8, 2v7, 3v6, 4v5), las semis con S1 = G(C1) vs G(C4) y S2 = G(C2) vs G(C3), y la final con los ganadores de las semis. Nunca cambia un partido ya `FINISHED`.
- Turnos de juego: `MATCH_TIME_SLOTS` en `src/types/index.ts` (08:00, 09:05, 10:10, 11:15, 12:20, 13:25, 14:30, 15:35, 16:40), con 2 canchas.

**Por qué:** el cliente cambió el formato de +40. Los cuartos del sábado 2026-11-28 ya no se juegan así: ese día empieza una fase de grupos.

**Documentos a leer primero:** `AGENTS.md`, `src/lib/playoffs.ts`, `src/lib/store.ts` (`calculateStandings`), `src/components/FixtureView.tsx`, `src/components/MatchEditModal.tsx`, `src/components/AdminArrangeCalendar.tsx`, `src/components/ArbitrajeView.tsx`, `src/components/CalendarExport.tsx` y `src/lib/scheduling/arrangeCalendar.ts`.

## Reglas del nuevo formato (decididas por el cliente)

1. **Grupos según la tabla final de la fase regular.** Al grupo A van los puestos 1, 3, 5, 7 y 9. Al grupo B, los puestos 2, 4, 6, 8 y 10.
2. **Bonificación inicial en la tabla del grupo.** Los puestos 1 y 2 de la fase regular empiezan con 2 puntos, y los puestos 3 y 4 con 1 punto. Los demás empiezan en 0.
3. **Dentro de cada grupo, todos contra todos a una vuelta.** Con 5 equipos son 10 partidos y 5 fechas por grupo; en cada fecha juegan 2 partidos y descansa 1 equipo. Las dos fases de grupos se juegan en paralelo, así que hay 4 partidos de +40 por sábado durante 5 sábados.
4. **Orden de la tabla de cada grupo:** primero los puntos, contando la bonificación y solo los partidos de ese grupo. Si dos o más equipos empatan en puntos, queda arriba el que terminó mejor en la fase regular. No se usan enfrentamiento directo, diferencia de goles ni goles a favor para desempatar en grupos. Como cada equipo tiene un puesto regular distinto, nunca queda un empate sin resolver.
5. **Cruces entre grupos, que reemplazan a los cuartos.** C1 = 1A vs 4B, C2 = 2A vs 3B, C3 = 3A vs 2B, C4 = 4A vs 1B. En cada cruce es local el equipo del grupo A.
6. **Semifinales y final.** S1 = ganador de C1 vs ganador de C3, y S2 = ganador de C2 vs ganador de C4. Así, los primeros de cada grupo solo pueden encontrarse en la final. La final enfrenta a los ganadores de S1 y S2. Un empate en cruces, semis o final se sigue definiendo a mano con `winnerTeamId`, como hoy.
7. **Resultado esperado con los datos reales:**
   - Grupo A: Fuerza Legal (+2), Club IDUS (+1), Lawyers (0), Alianza Legal (0), Boman Legal (0).
   - Grupo B: Futleg (+40) (+2), Leones Q (+40) (+1), Vodka Jr. (0), AKD (+40) (0), Sporting Legal (0).

## Objetivo

El administrador pulsa un botón y la app crea la fase de grupos de +40: 20 partidos repartidos en 5 sábados desde el 2026-11-28, con los cuartos, semis y final corridos detrás. En la pestaña de play offs y en Posiciones se ven las dos tablas de grupo, con la bonificación incluida. Los cruces, semis y final se completan solos con las reglas de arriba, y el resto de categorías funciona exactamente igual que hoy.

## Requerimientos

1. **Tipos** (`src/types/index.ts` y la copia de tipos en `src/lib/scheduling/matchday.ts`):
   - Añade `'GRUPOS'` a `playoffStage`, que queda `'GRUPOS' | 'CUARTOS' | 'SEMIS' | 'FINAL'`.
   - Añade al tipo `Match` el campo opcional `groupName?: 'A' | 'B'`.
   - Los partidos de grupo se guardan con `isPlayoff: true`, `playoffStage: 'GRUPOS'`, `groupName` y sin `bracketSlot`. Así no entran en la tabla ni en las validaciones de la fase regular, que ya filtran `!m.isPlayoff`.

2. **Configuración** en el nuevo archivo `src/lib/groupStage.ts`:
   ```ts
   export const GROUP_STAGE_CONFIG: Partial<Record<Category, { bonusByRegularPosition: number[] }>> = {
     '+40 Varones': { bonusByRegularPosition: [2, 2, 1, 1] },
   };
   ```
   Ninguna otra categoría tiene fase de grupos. No metas `+40 Varones` en código fuera de esta constante.

3. **Funciones puras en `src/lib/groupStage.ts`.** Ninguna muta su entrada y cada una mide menos de 50 líneas.
   - `buildGroups(cat, teams, matches)` devuelve `{ A: GroupEntry[]; B: GroupEntry[] }`, donde `GroupEntry = { teamId: string; regularPosition: number; bonus: number }`. Para armarlo usa `calculateStandings` con los partidos regulares de la categoría (`!isPlayoff`): los puestos impares van al A, los pares al B, y la bonificación sale de `bonusByRegularPosition`. Excluye los equipos con `withdrawn: true`.
   - `hasGroupStage(cat, matches)` devuelve `true` si existe algún partido `playoffStage === 'GRUPOS'` de esa categoría.
   - `calculateGroupStandings(cat, teams, matches, groupName)` calcula la tabla del grupo así:
     - Las estadísticas (PJ, PG, PE, PP, GF, GC, DG, tarjetas) salen de `calculateStandings` (`src/lib/store.ts`) con solo los equipos y partidos del grupo.
     - Devuelve copias nuevas con `bonus` y con `pts` igual a los puntos ganados más la bonificación.
     - Ordena por `pts` de mayor a menor y, si hay empate, por `regularPosition` de menor a mayor (regla 4).
     - No modifiques `calculateStandings` ni su orden: la tabla regular y las demás categorías tienen que seguir igual.
     - Añade a `TeamStanding` los campos opcionales `bonus?: number` y `regularPosition?: number` para que la tabla pueda mostrarlos.
   - `groupStageComplete(cat, matches)` devuelve `true` cuando todos los partidos `GRUPOS` de la categoría están `FINISHED`.
   - `generateGroupStageMatches({ cat, teams, matches, startDate })` devuelve los 20 partidos nuevos, sin guardarlos:
     - Usa el método del círculo con 5 equipos más un descanso: son 5 fechas y en cada una juegan 2 partidos por grupo. Reparte la localía de forma equilibrada.
     - `round` continúa después de la última jornada regular de la categoría (en +40, de 10 a 14) y `date` es `startDate` más 7 días por cada fecha.
     - `time` y `stadium` usan los turnos libres de ese día: combinaciones de `MATCH_TIME_SLOTS` × `Cancha 1`/`Cancha 2` que no ocupe ningún otro partido de cualquier categoría en esa fecha, sin contar los cuartos, semis y final de esta categoría, que se mueven. Hay dos condiciones: un mismo equipo no puede jugar dos veces el mismo día, y dos equipos con el mismo `clubId` no pueden jugar a la misma hora. Se recorren los turnos de menor a mayor. Si no queda un turno libre válido, el partido queda sin hora (`time: ''`) y la función lo devuelve en una lista `unscheduled`.
     - Los ids siguen el patrón `m-<slug categoría>-g<A|B><fecha>-<n>` (por ejemplo `m-40varones-gA1-1`) y nunca chocan con ids existentes.
     - El resto de campos de cada partido nuevo: `status: 'SCHEDULED'`, `homeScore: 0`, `awayScore: 0`, `events: []`, `homeLineup: []`, `awayLineup: []` y `refereeSigned: false`.
   - `shiftBracketAfterGroups(...)` devuelve copias de los partidos C1–C4, S1–S2 y F de la categoría con fechas nuevas: los cruces el sábado siguiente a la última fecha de grupos, las semis una semana después y la final otra semana después. Se mantiene su hora y cancha si siguen libres ese día; si no, se usa el primer turno libre con la misma regla de arriba. Un partido `FINISHED` o `IN_PROGRESS` nunca se mueve.

4. **Cuadro** (`src/lib/playoffs.ts`, `recomputePlayoffs`). Si `hasGroupStage(cat, matches)`:
   - Mientras `groupStageComplete` sea falso, C1–C4 quedan con `homeTeamId` y `awayTeamId` vacíos (por definir).
   - Cuando sea verdadero, C1–C4 se arman con las tablas de grupo según la regla 5.
   - Las semis se arman con la regla 6: S1 = G(C1) vs G(C3) y S2 = G(C2) vs G(C4). La final no cambia.
   - Las categorías sin fase de grupos siguen exactamente igual que hoy, incluidas sus semis C1/C4 y C2/C3.
   - No se tocan los partidos `FINISHED` ni los partidos `GRUPOS`, cuyos equipos son fijos desde que se crean.

5. **Acción de administrador** en el nuevo componente `src/components/AdminGroupStage.tsx`, que se monta en `AdminModal.tsx` junto a `AdminArrangeCalendar`:
   - Se muestra solo para las categorías que estén en `GROUP_STAGE_CONFIG`. El botón "Crear fase de grupos" se habilita solo si se cumplen tres condiciones: todos los partidos regulares están `FINISHED`, todavía no hay partidos `GRUPOS`, y ningún partido de play off está `FINISHED` ni `IN_PROGRESS`. Si el botón está deshabilitado, se explica en texto por qué.
   - Hay un campo de fecha de inicio cuyo valor por defecto es el próximo sábado (usa `localDateString` de `src/lib/finesReport.ts`).
   - Antes de guardar se muestra una vista previa:
     - los dos grupos con su bonificación;
     - las 5 fechas, con cada partido, su hora y su cancha;
     - las nuevas fechas de cruces, semis y final;
     - un aviso si queda algún partido sin hora.
   - Al confirmar se guardan los 20 partidos nuevos y los del cuadro movidos con `upsertMatch`, y después se aplica `recomputePlayoffs`, igual que hace `handleUpdateMatch` en `src/app/page.tsx`. Hay que manejar los errores: si falla un guardado, se muestra el mensaje y no se informa de un éxito parcial como si fuera completo.
   - Debe quedar la opción de deshacer, con un botón "Quitar fase de grupos". Solo está disponible mientras ningún partido `GRUPOS` esté `FINISHED` o `IN_PROGRESS`. Borra los partidos `GRUPOS` y devuelve el cuadro a las fechas que tenía, que se guardan en `data.preGroupSchedule` (`{ date, time, stadium }`) dentro de cada partido del cuadro al crear la fase.
   - Solo el rol ADMIN puede hacer esto, y la escritura sigue protegida por RLS (`authenticated`).

6. **Vista pública** (`src/components/FixtureView.tsx`):
   - En la pestaña Play Offs, si hay partidos `GRUPOS`, la primera sección es "Fase de grupos". Contiene las dos tablas de grupo (Pos, Equipo, PJ, PG, PE, PP, GF, GC, DG, Bonif., PTS) con los 4 primeros resaltados, y debajo los partidos agrupados por fecha. Cada fecha indica qué equipo descansa en cada grupo.
   - Añade `GRUPOS` a `STAGE_ORDER` como primera etapa. Para `+40`, la etiqueta de `CUARTOS` pasa a ser "Cruces de grupos (cuartos de final)".
   - Las etiquetas nuevas van sin emojis. Si cambias las etiquetas existentes, quita también los emojis que tienen.
   - Cambia el texto de ayuda del cuadro para que, si hay grupos, diga que los cruces se arman con las tablas de grupo.
   - Extrae las tablas de grupo a su propio componente `src/components/GroupStandings.tsx` para que `FixtureView.tsx` no siga creciendo.

7. **Posiciones:** en la vista de posiciones de la categoría (la que usa `StandingsTable`), cuando haya fase de grupos, muestra `GroupStandings` arriba con el título "Fase de grupos" y deja la tabla regular debajo con el título "Fase regular (cerrada)".

8. **Partidos de grupo que pueden terminar empatados:**
   - En `src/components/MatchEditModal.tsx`, `isPlayoffTie` no debe aplicarse a `playoffStage === 'GRUPOS'`, porque el empate vale 1 punto y no se pide ganador.
   - Haz lo mismo en cualquier otra validación que exija ganador en un play off. Búscalas con `grep -rn "isPlayoff" src`.

9. **Otras pantallas:**
   - `src/components/ArbitrajeView.tsx`: las fechas de la categoría deben incluir las de grupos. Cambia el filtro a `!m.isPlayoff || m.playoffStage === 'GRUPOS'`.
   - `src/components/CalendarExport.tsx`: en los partidos de grupo muestra "Grupo A" o "Grupo B" en lugar de `(GRUPOS)`.
   - Sanciones y multas (`src/lib/sanctions.ts`, `src/lib/cardFines.ts`): comprueba que las tarjetas de los partidos de grupo cuenten como en cualquier otro partido y añade un test que lo demuestre.
   - "Acomodar calendario" (`src/lib/scheduling/arrangeCalendar.ts` y `completeCategory.ts`) no debe borrar, regenerar ni mover partidos `GRUPOS`, ni marcar +40 como "calendario que no coincide". Añade un test que lo demuestre.

## Restricciones técnicas

- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla ni nombres de archivo. Los iconos van solo en SVG (lucide-react ya está instalado).
- Marca: este repo es de un cliente con marca propia. No apliques el manual de Ualdo; respeta los colores y estilos que ya usa la app (verde `#00A859`, tarjetas `rounded-3xl`, etc.).
- Sigue las convenciones existentes del repo: nombres, estructura y textos de UI en español.
- Seguridad: valida toda entrada (fecha de inicio con formato `YYYY-MM-DD` y que sea un sábado), sin secretos en el código, sin `dangerouslySetInnerHTML`, y escritura solo con sesión de ADMIN. Los mensajes de error no deben exponer datos sensibles.
- Diseño: SOLID, DRY y KISS. Funciones de menos de 50 líneas, archivos de menos de 800 líneas, sin anidar más de 4 niveles, inmutabilidad (nunca mutes `matches` ni `teams`) y manejo de errores explícito.
- Rendimiento: los cálculos de tablas de grupo van en `useMemo`, y nada de recalcular todo el torneo en cada render.
- No añadas dependencias.
- No toques archivos fuera del alcance indicado, ni el comportamiento de Abierta Varones, +50 Varones o Damas.

## Tests

Usa Vitest. Pon los tests en `src/lib/groupStage.test.ts` y amplía `src/lib/playoffs` (créalo si no existe: `src/lib/playoffs.test.ts`) y los tests de scheduling que ya existen.

1. `buildGroups` con 10 equipos: comprueba que los impares van al A y los pares al B, que las bonificaciones son 2/2/1/1/0..., y que se excluyen los equipos retirados. Incluye un caso con los 10 equipos reales en el orden de arriba y su resultado esperado (regla 7).
2. `calculateGroupStandings`:
   - la bonificación se suma a los puntos;
   - con empate en puntos queda arriba quien terminó mejor en la fase regular, aunque tenga peor diferencia de goles o haya perdido el enfrentamiento directo;
   - un caso con tres equipos empatados;
   - no se muta la entrada;
   - los tests existentes de `calculateStandings` siguen en verde sin cambios.
3. `generateGroupStageMatches`:
   - 20 partidos y 5 fechas;
   - en cada fecha, 2 partidos por grupo y 1 equipo que descansa por grupo;
   - cada par del grupo juega exactamente una vez;
   - nadie juega dos veces el mismo día;
   - no hay dos partidos en el mismo turno y cancha;
   - dos equipos del mismo `clubId` nunca juegan a la misma hora;
   - los ids son únicos;
   - no se muta la entrada.
4. `recomputePlayoffs` con grupos:
   - con los grupos incompletos, los cruces quedan vacíos;
   - con los grupos completos, salen 1A-4B, 2A-3B, 3A-2B y 4A-1B;
   - las semis son G(C1)-G(C3) y G(C2)-G(C4);
   - una categoría sin grupos mantiene el comportamiento actual;
   - un partido `FINISHED` no cambia.
5. `shiftBracketAfterGroups`: las fechas quedan correctas y no mueve partidos jugados.
6. "Acomodar calendario" ignora los partidos `GRUPOS`, y las tarjetas de grupo cuentan para las sanciones.
7. La cobertura del código nuevo debe ser de al menos el 80 % (`npm run test:coverage`).

## Verificación final

```powershell
npm run lint
```

```powershell
npm test
```

```powershell
npm run test:coverage
```

```powershell
npm run build
```

Después prueba a mano con `npm run dev`:
- entra como ADMIN y abre Admin, luego "Fase de grupos";
- revisa la vista previa con la fecha de inicio 2026-11-28: los grupos deben coincidir con la regla 7 y debe haber 4 partidos el 28 sin choques;
- crea la fase, comprueba la pestaña Play Offs y Posiciones de +40, y que Abierta, +50 y Damas no cambiaron;
- usa "Quitar fase de grupos" y comprueba que todo vuelve como estaba.

No lo hagas contra la base de producción hasta que el usuario lo confirme.

## Criterios de aceptación

- [ ] Grupos A y B según la regla 1, con la bonificación de la regla 2, y con los datos reales coinciden con la regla 7.
- [ ] 20 partidos de grupo en 5 sábados desde la fecha elegida, sin choques de turno o cancha, sin equipo repetido en un día y sin el mismo dueño (`clubId`) a la misma hora.
- [ ] Tablas de grupo con columna Bonif., ordenadas por puntos y, si hay empate, por la posición en la fase regular. Visibles en Play Offs y en Posiciones, con una nota bajo cada tabla: "Empate en puntos: queda arriba quien terminó mejor en la fase regular".
- [ ] Cruces 1A-4B, 2A-3B, 3A-2B, 4A-1B armados automáticamente al terminar los grupos; semis G(C1)-G(C3) y G(C2)-G(C4); final igual que hoy.
- [ ] Cuartos, semis y final de +40 corridos detrás de los grupos, con la opción de deshacer mientras no se haya jugado ningún partido de grupo.
- [ ] Los empates en partidos de grupo no piden ganador.
- [ ] Arbitraje, exportación del calendario, sanciones y multas incluyen los partidos de grupo.
- [ ] "Acomodar calendario" no altera la fase de grupos.
- [ ] Las demás categorías se comportan exactamente igual que antes.
- [ ] Cero emojis en todo lo nuevo o modificado.
- [ ] Todos los tests pasan, la cobertura del código nuevo es de al menos el 80 %, y lint y build quedan sin errores.

## Urgencia

La primera fecha de grupos se juega el sábado 2026-11-28. Esto tiene que estar en producción y la fase creada desde Admin antes de ese día. Si no da el tiempo, avisa: hay un plan B para cargar a mano solo la fecha 1.
