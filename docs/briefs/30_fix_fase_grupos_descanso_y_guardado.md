# Brief 30: Corrección de la fase de grupos de +40 (descanso entre categorías, guardado y grupos fijos)

## Contexto

Este brief corrige lo construido en el brief 29 (`docs/briefs/29_fase_de_grupos_40.md`), que está en la rama `feat/brief-29-fase-de-grupos-40` y todavía sin commit. Stack: Next.js 16 con export estático, React, TypeScript, Vitest y Supabase. Lee primero `AGENTS.md` y el brief 29.

La auditoría simuló la fase con los datos reales de producción, sin escribir nada. El resultado:
- Grupos, bonificaciones, cruces, desempate, lint, build y los 321 tests están bien.
- **Falla el descanso entre categorías del mismo dueño.** El cliente exige que un dueño (`Team.clubId`) con equipos en dos categorías tenga al menos un turno libre entre un partido y el siguiente: "se van a quejar si juegan dos categorías seguidas". `generateGroupStageMatches` toma el primer turno libre y solo evita que el mismo dueño juegue a la misma hora. Con los datos reales salen 8 partidos seguidos del mismo dueño:
  - 2026-11-28 (este sábado): Boman Legal 09:05 y Boman Legal (+40) 10:10; Club IDUS 09:05 y Club IDUS (+40) 10:10; AKD (+40) 11:15 y AKD 12:20.
  - 2026-12-05: Fuerza Legal 11:15 y 12:20; Lawyers 12:20 y Lawyers (+40) 13:25.
  - 2026-12-19: Club IDUS 11:15 y Club IDUS (+40) 12:20.
  - 2026-12-26: Boman Legal 10:10 y Boman Legal (+40) 11:15; Fuerza Legal 10:10 y 11:15.
- Para el 28-nov sí existe una solución sin partidos seguidos con los 4 turnos que quedan libres:
  - 10:10: Vodka Jr. vs AKD (+40) y Lawyers (+40) vs Alianza Legal (+40);
  - 11:15: Boman Legal (+40) vs Club IDUS (+40) y Sporting Legal vs Leones Q (+40).

Archivos implicados: `src/lib/groupStage.ts`, `src/lib/groupStage.test.ts`, `src/components/AdminGroupStage.tsx`, `src/components/GroupStandings.tsx`, `src/components/FixtureView.tsx`, `src/lib/playoffs.ts` y `vitest.config.ts`.

## Objetivo

La fase de grupos se genera sin partidos seguidos del mismo dueño siempre que sea posible, y avisa cuando no lo es. La creación se guarda de una sola vez. Los grupos quedan fijos según los partidos creados. Con los datos reales, el 2026-11-28 no queda ningún partido seguido del mismo dueño.

## Requerimientos

1. **Asignación de turnos por fecha** (`src/lib/groupStage.ts`). Cambia `findFirstFreeSlot`, que asigna partido por partido, por una búsqueda que asigne juntos los partidos de grupo de cada fecha:
   - **Turnos candidatos:** las combinaciones de `MATCH_TIME_SLOTS` × `CANCHAS` libres ese día, excluyendo los partidos del cuadro de la categoría, que se mueven.
   - **Reglas duras:** no repetir turno y cancha, ningún equipo juega dos veces el mismo día, y el mismo `clubId` nunca juega a la misma hora.
   - **Penalización principal:** por cada par de partidos del mismo `clubId` en turnos consecutivos (índices de `MATCH_TIME_SLOTS` que difieren en 1), incluidos los partidos de otras categorías de ese día, suma 100 puntos.
   - **Penalización secundaria:** por cada turno libre de más (más de 1) entre partidos del mismo `clubId` ese día, suma 1 punto.
   - **Desempate:** a igual puntuación, elige la combinación con los turnos más tempranos.
   - **Método:** búsqueda exhaustiva con poda (backtracking). Con 4 partidos y hasta 18 turnos el espacio es pequeño; añade un límite de seguridad de iteraciones y, si se alcanza, quédate con la mejor combinación encontrada.
   - La función devuelve, además de `matches` y `unscheduled`, `backToBack: Array<{ date: string; clubId: string; times: [string, string] }>` con los partidos seguidos que no se pudieron evitar.
   - Extrae la búsqueda a funciones pequeñas (de menos de 50 líneas cada una) y no mutes las entradas.

2. **Vista previa** (`src/components/AdminGroupStage.tsx`):
   - Si `backToBack` no está vacío, muestra un aviso con cada caso, por ejemplo: "2026-12-05: Lawyers juega 12:20 y 13:25 seguidos".
   - Calcula `lastGroupDate` como la fecha mayor de los partidos generados, en lugar de `addDays(startDate, 28)`.

3. **Guardado de una sola vez** (`handleCreate` en `AdminGroupStage.tsx`):
   - Usa `applyMatchChanges({ upserts: [...partidos de grupo, ...cuadro movido, ...cuadro recalculado], deleteIds: [] })` de `src/lib/store.ts`, en una sola llamada, en lugar del bucle de `upsertMatch`.
   - Calcula `recomputePlayoffs` antes de guardar, para que todo vaya en el mismo envío.
   - Si falla, muestra el error y no actualices el estado local.

4. **Grupos fijos** (`calculateGroupStandings` en `src/lib/groupStage.ts` y la sección de descansos en `src/components/FixtureView.tsx`):
   - Cuando ya existen partidos `GRUPOS`, los integrantes de cada grupo salen de esos partidos (los equipos que aparecen en partidos con ese `groupName`), no de recalcular la tabla regular.
   - `bonus` y `regularPosition` siguen saliendo de `buildGroups`, pero solo para esos equipos.
   - Así, una corrección posterior de un resultado regular no puede cambiar de grupo a un equipo.
   - Añade un test que lo demuestre.

5. **Cobertura** (`vitest.config.ts`):
   - Añade `src/lib/groupStage.ts` y `src/lib/playoffs.ts` a `coverage.include`.
   - La cobertura de ramas de esos dos archivos debe llegar al menos al 80 %. Hoy está en 84 % y 66 %: faltan casos de `playoffs.ts` en las líneas 60-63, 74-77, 86 y 99.

6. **Limpieza:** ordena los comentarios del test de desempate de `src/lib/groupStage.test.ts` (líneas 113-121). Hoy contienen razonamiento a medias; deja solo la explicación final del triple empate.

## Restricciones técnicas

- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla ni nombres de archivo. Los iconos van solo en SVG.
- Marca: este repo es de un cliente con marca propia. No apliques el manual de Ualdo; respeta los estilos actuales.
- Sigue las convenciones existentes del repo.
- Seguridad: valida las entradas, escritura solo con sesión de ADMIN y errores sin datos sensibles.
- Diseño: SOLID, DRY y KISS. Funciones de menos de 50 líneas, archivos de menos de 800 líneas, sin anidar más de 4 niveles, inmutabilidad y manejo de errores explícito.
- Rendimiento: la búsqueda de turnos debe terminar en menos de 200 ms por fecha.
- No añadas dependencias.
- No toques nada fuera de los archivos indicados.

## Tests

1. **Escenario real del 28-nov en `src/lib/groupStage.test.ts`.** Construye el día con los partidos de las demás categorías tal como están:
   - 08:00 +50: C1 Amigos del C.A.T. vs IURA; C2 Administradores vs AKD (+50), de club-akd.
   - 09:05 Abierta: C1 Sanfra Legal (club-sanfra) vs Futleg (club-futleg); C2 Boman Legal (club-boman) vs Club IDUS (club-idus).
   - 12:20 Abierta: C1 AKD (club-akd) vs Lawyers (club-lawyers); C2 Chamucos vs Fuerza Legal (club-legal).
   - 13:25 Abierta: C1 Leones Q (club-leonesq) vs Abogadasos; C2 Legal Sport vs Lex Pro FC.
   - 14:30 Damas: C1 Sanfra (club-sanfra) vs Elite Legal; C2 Bef vs Damas de la Justicia.
   - 15:35 Abierta: C1 Abogadasos vs Futleg (club-futleg).

   Con eso, la fecha 1 de grupos (Boman-IDUS, Lawyers-Alianza, Sporting-Leones Q, Vodka-AKD) debe quedar con `backToBack` vacío para el 2026-11-28.
2. **Caso inevitable:** un caso construido donde el partido seguido no se puede evitar debe devolverlo en `backToBack`, sin lanzar errores.
3. **Integrantes fijos:** con partidos `GRUPOS` creados, cambiar un resultado regular no cambia los integrantes de los grupos.
4. **Guardado:** `handleCreate` usa `applyMatchChanges` una sola vez. Extrae la construcción del lote a una función pura y pruébala.
5. Los tests existentes siguen en verde.

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

## Criterios de aceptación

- [ ] Con los datos reales, el 2026-11-28 queda sin partidos seguidos del mismo dueño.
- [ ] La vista previa avisa de cada partido seguido inevitable, con fecha, dueño y horas.
- [ ] La creación se guarda en una sola llamada a `applyMatchChanges`.
- [ ] Los integrantes de los grupos salen de los partidos `GRUPOS` ya creados.
- [ ] `groupStage.ts` y `playoffs.ts` están en la cobertura, con al menos el 80 % en todas las métricas.
- [ ] Cero emojis.
- [ ] Todos los tests pasan, y lint y build quedan sin errores.
