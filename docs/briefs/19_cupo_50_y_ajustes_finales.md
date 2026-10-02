# Brief 19: Cupo de 35 en +50, roja con doble amarilla, corrección de planilla por el árbitro y ajustes

## Contexto
Proyecto: Copa Abogados (marca del cliente, NO Ualdo). Stack: Next.js 16.3, React 19, TypeScript, Supabase (JSONB), Vitest. Antes de tocar código de Next lee la guía que corresponda en `node_modules/next/dist/docs/` (ver `AGENTS.md`).

Los Briefs 15 a 18 están construidos y aprobados con observaciones (auditoría del 2026-10-02). Este brief añade tres pedidos nuevos del cliente y cierra esas observaciones.

**Pedido nuevo 1, cupo de +50:** cada equipo de la categoría **+50 Varones** puede inscribir hasta **35 jugadores**. El resto de categorías sigue con 20.

Hoy el tope es una sola constante, `MAX_PLAYERS_PER_TEAM = 20` (`src/types/index.ts` línea ~131), usada en:
- `src/app/page.tsx` líneas ~410-413 (`handleAddPlayer`, red de seguridad y mensaje);
- `src/components/AdminModal.tsx` líneas ~236-237 (alta manual);
- `src/components/RegistrationView.tsx` líneas ~122, ~170, ~328 y ~356 (cupo lleno y contador "N/20" en la inscripción pública);
- `src/lib/crossCategory.ts` líneas ~109 y ~158 (`TEAM_FULL` al habilitar un jugador en otra categoría).

No hay tope en la base de datos (ni RLS ni trigger), así que el cambio es solo de código.

**Pedido nuevo 2, sanción por doble amarilla y roja directa en el mismo partido:** hoy `computeCardSuspension` (`src/lib/sanctions.ts`) suma las dos sanciones (1 + 2 = 3 fechas). El cliente decide que en ese caso son **2 fechas en total**: manda la roja directa.

**Pedido nuevo 3, corrección de planilla por el árbitro:** el modo corrección de planillas firmadas (Brief 03) hoy solo lo ve el ADMIN. El botón "Corregir planilla" aparece si `isAdmin && currentMatch.status === 'FINISHED' && !draft` (`src/components/MatchSheetModal.tsx` línea ~716). `src/app/page.tsx` (línea ~860) pasa a `MatchSheetModal` las props `isAdmin={currentUser?.role === 'ADMIN'}` y `editorName={currentUser?.name}`. Los usuarios con rol `REFEREE` también deben poder corregir. La base no necesita cambios: la política `matches_write` (`supabase/schema.sql` línea ~223) ya permite escribir partidos a cualquier usuario autenticado, y el árbitro ya guarda sus planillas por esa vía.

**Observaciones de la auditoría a cerrar:**
1. MEDIUM: `npm run test:coverage` falla. Con la medición de cobertura activa, los dos tests de 300 fechas de `src/lib/scheduling/ownerGaps.test.ts` ("programa 3 equipos de AKD..." y "acomoda dos duenos que se enfrentan...") tardan 42 s y 47 s y superan su límite de 40 s. Sin cobertura tardan 11 s y 13 s, y el Brief 18 pedía menos de 10 s. Como hay fallos, no se genera el informe y la cobertura de 80 % de `crossCategory.ts` y `sanctions.ts` no está verificada.
2. LOW: en `src/components/AdminModal.tsx` (línea ~791) se llama a `getEligibleTargetCategories(p, players, teams)` en cada fila de la tabla, y esa función recorre todos los jugadores.
3. LOW: los mensajes de `src/lib/crossCategory.ts` (`crossCategoryErrorMessage`) y los textos de `src/components/CrossCategoryModal.tsx` van sin tildes ("cedula valida", "categoria", "Ocurrio", "maximo"). El resto de la app sí lleva tildes.
4. LOW: en `src/components/QRScannerModal.tsx` (`handleSearch`) se compara `p.cedula === searchId` sin normalizar, así que una cédula escrita con guion o espacios no se encuentra.
5. LOW: en `src/components/SanctionsTable.tsx` el "/5" del progreso de amarillas está escrito a mano en vez de usar `YELLOWS_FOR_SUSPENSION` de `src/lib/sanctions.ts`.

## Objetivo
Los equipos de +50 Varones aceptan hasta 35 jugadores en todas las vías de alta (inscripción pública, alta manual del Admin y segundo carnet), y las demás categorías siguen en 20. Una doble amarilla con roja directa en el mismo partido suma 2 fechas. Los árbitros pueden corregir planillas firmadas con el mismo modo corrección que el Admin, y queda registrado quién corrigió y con qué rol. `npm run test:coverage` termina en verde (salvo el fallo de equidad ya conocido) y muestra cobertura de 80 % o más en `crossCategory.ts` y `sanctions.ts`. Quedan resueltas las observaciones LOW.

## Requerimientos
1. **Cupo por categoría** (`src/types/index.ts`):
   - Mantener `MAX_PLAYERS_PER_TEAM = 20` como valor por defecto.
   - Añadir `export const MAX_PLAYERS_BY_CATEGORY: Readonly<Partial<Record<Category, number>>> = { '+50 Varones': 35 };`.
   - Añadir `export function maxPlayersForCategory(category: Category | undefined): number` que devuelva el valor de la tabla o `MAX_PLAYERS_PER_TEAM`.
2. **Usar el cupo por categoría en todas las vías** (sustituir cada uso de `MAX_PLAYERS_PER_TEAM` por `maxPlayersForCategory(<categoría del equipo>)`):
   - `src/app/page.tsx` `handleAddPlayer`: buscar el equipo de `newPlayer.teamId` en `teams` y usar su categoría, tanto en la condición como en el mensaje.
   - `src/components/AdminModal.tsx` `handleCreatePlayer`: igual, condición y mensaje.
   - `src/components/RegistrationView.tsx`: `selectedTeamFull`, la comprobación de la línea ~170, la marca "Cupo lleno" y el contador `N/<cupo>` (cada equipo muestra su propio cupo).
   - `src/lib/crossCategory.ts` `validateCrossCategory` (`TEAM_FULL`): usar el cupo del equipo destino. `crossCategoryErrorMessage('TEAM_FULL')` debe decir "El equipo elegido ya alcanzó el máximo de jugadores permitidos." (sin número, porque depende del equipo).
3. **Tests de `ownerGaps.test.ts` más rápidos**, sin perder lo que comprueban:
   - Mantener las 300 fechas por test y las mismas comprobaciones: sin simultáneos del dueño, sin compartidos seguidos, máximo 1 turno libre.
   - Bajar el tamaño de cada fecha a un día realista (por ejemplo, de 10 partidos extra a 6 u 8).
   - O dividir cada test en 2 o 3 tests de 100 a 150 fechas con semillas distintas, de modo que entre todos sigan cubriendo 300 fechas.
   - Objetivo: cada test por debajo de 10 s sin cobertura y por debajo de su límite con `--coverage`.
   - No subir los límites de tiempo ni tocar `src/lib/scheduling/matchday.ts`, `score.ts` ni `compact.ts`.
4. **AdminModal (fila por fila)**: precalcular con `useMemo` un `Set` con los ids de los jugadores que pueden habilitarse en otra categoría. Reutiliza `cedulaCategoriesMap` (ya existe) y `CROSS_CATEGORY_TARGETS` de `crossCategory.ts`: un jugador aprobado es elegible si alguna categoría destino de la categoría de su equipo no está en las categorías de su cédula. En cada fila se consulta solo el `Set`. Si conviene, extrae esa lógica a una función pura en `crossCategory.ts` y testéala.
5. **Tildes**: corregir los textos de `crossCategoryErrorMessage` y de `CrossCategoryModal.tsx` ("cédula válida", "dígitos", "categoría", "está", "alcanzó", "máximo", "número", "Ocurrió", "Categoría destino"). Ajusta los tests que comparen esos textos.
6. **Escáner**: en `QRScannerModal.tsx`, comparar `normalizeCedula(p.cedula) === normalizeCedula(searchId)` (importar de `@/lib/scheduling/sharedPlayers`). Solo si `normalizeCedula(searchId)` no está vacío.
7. **SanctionsTable**: mostrar el progreso como `${sc.yellowsTowardNext}/${YELLOWS_FOR_SUSPENSION}` importando la constante de `@/lib/sanctions`.

8. **Doble amarilla con roja directa** (`src/lib/sanctions.ts`):
   - En `computeCardSuspension` (o en `classifyPlayerCards`), si en un mismo partido hay roja directa, la sanción de ese partido es solo la roja directa (`DIRECT_RED_MATCHES` = 2 fechas), aunque también haya doble amarilla. El motivo es "Roja Directa (2 partidos)".
   - Las amarillas de ese partido no suman al acumulado de 5 si hubo doble amarilla. Si hubo exactamente 1 amarilla y luego roja directa, esa amarilla sí suma (se mantiene lo del Brief 16).
   - Las estadísticas mostradas (`yellowCards`, `redCards`) no cambian.
9. **Corrección de planilla por el árbitro** (`src/components/MatchSheetModal.tsx`, `src/app/page.tsx`, `src/types/index.ts`):
   - Nueva prop `canCorrect?: boolean` (por defecto `false`) en `MatchSheetModal`. En `page.tsx`, pasar `canCorrect={currentUser?.role === 'ADMIN' || currentUser?.role === 'REFEREE'}` y una prop nueva `editorRole={currentUser?.role}`. El botón "Corregir planilla" usa `canCorrect` en vez de `isAdmin`. Si `isAdmin` se usa para otra cosa dentro del componente, mantenerlo para eso.
   - En `SheetCorrection` (`src/types/index.ts`) añadir `role?: 'ADMIN' | 'REFEREE'`. Al guardar, `by` es `editorName`; si no hay nombre, usar "Árbitro" o "Administrador" según el rol. `role` es el rol de quien corrige.
   - El rastro de correcciones (`formatCorrectionTrace`) muestra el rol, por ejemplo: "Corregida 2 veces. Última: Juan Pérez (Árbitro), 03/10/2026 12:30: motivo". Mantener que el detalle público (`MatchDetailModal.tsx`) no muestra motivos ni nombres.
   - El árbitro usa exactamente el mismo flujo que el Admin: borrador, motivo obligatorio de 5 a 300 caracteres, confirmación con número de cambios, "Descartar", "Recalcular desde goles" y aviso (no bloqueo) al agregar un jugador sancionado. Cambiar los textos "Atención Administrador" (líneas ~293 y ~358) por "Atención".
   - Trazabilidad de la firma: en `handleFinishMatch`, guardar también quién firmó (`signedBy: editorName`), añadiendo `signedBy?: string` al tipo `Match`. Mostrarlo junto a la fecha de firma ("Firmado por <nombre>, <fecha>") solo en la planilla (no en vistas públicas).
   - Sin rol (`PUBLIC`) o sin sesión, no hay botón de corrección (la pestaña de planilla ya está restringida; comprobarlo).

## Restricciones técnicas
- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla o nombres de archivo. Iconos solo en SVG.
- Marca: NO aplicar la marca Ualdo. Mantén los estilos actuales.
- Convenciones del repo: comentarios en español, imports con `@/`.
- Diseño: funciones <50 líneas; archivos <800 líneas (`AdminModal.tsx` ya supera ese límite: no lo hagas crecer, en lo posible que quede más corto); sin anidación >4 niveles; inmutabilidad.
- No cambies la lógica del planificador (`matchday.ts`, `score.ts`, `compact.ts`, `arrangeCalendar.ts`). En `sanctions.ts`, solo el cambio del requerimiento 8.
- Seguridad: no exponer motivos, nombres de quien corrige ni `signedBy` en vistas públicas. React ya escapa los textos: no uses `dangerouslySetInnerHTML`.
- `MatchSheetModal.tsx` tiene 749 líneas: no debe pasar de 800. Si hace falta, extrae el bloque de firma y rastro a `src/components/SheetSignatureBlock.tsx`.
- No añadas dependencias. No toques `tasks/`, `watch_tasks.*`, `.gitignore` ni archivos fuera del alcance.

## Tests
- `src/types/index.ts` no tiene tests. Crea `src/lib/playerLimits.test.ts` (o añade los casos a `crossCategory.test.ts`): `maxPlayersForCategory('+50 Varones') === 35`; `'+40 Varones'`, `'Abierta Varones'` y `'Damas'` dan 20; `undefined` da 20.
- `crossCategory.test.ts`:
  - `TEAM_FULL` con 20 jugadores en un equipo de Abierta (sigue igual);
  - un equipo de +50 con 20 jugadores NO da `TEAM_FULL`;
  - un equipo de +50 con 35 jugadores da `TEAM_FULL`;
  - si haces la función pura del requerimiento 4, sus casos: elegible, ya ocupado en la categoría destino, rechazado, sin cédula.
- `sanctions.test.ts`:
  - doble amarilla (2 `YELLOW_CARD`) más roja directa en el mismo partido: `pending` 2 y motivo "Roja Directa (2 partidos)";
  - `RED_CARD` con `isDoubleYellow` más `RED_CARD` directa en el mismo partido: 2;
  - 1 amarilla más roja directa: 2 fechas y la amarilla suma al ciclo (sin cambios);
  - se cumple tras 2 partidos terminados del equipo.
- `matchSheet.test.ts`: `applyCorrection` conserva `role` en la corrección añadida y no altera `signedBy`, `status`, `refereeSigned` ni `signedAt` del original.
- `ownerGaps.test.ts`: los tests reestructurados del requerimiento 3, todos en verde.
- Cobertura de 80 % o más en `crossCategory.ts` y `sanctions.ts` (y en el archivo nuevo, si lo hay).

## Verificación final (PowerShell, en `C:\laragon\www\Copa Abogados`)
1. `npm test`: solo puede fallar el test de equidad "max temprano <= 35 %" (conocido, Brief 13).
2. `npm run test:coverage`: termina, no hay timeouts y la tabla muestra 80 % o más en `crossCategory.ts` y `sanctions.ts`. Copia esa tabla en el resumen final.
3. `npm run lint`
4. `npm run build`
5. Prueba manual con `npm run dev`:
   - en la inscripción pública, un equipo de +50 muestra el contador sobre 35 y uno de Abierta sobre 20;
   - como Admin, dar de alta el jugador 21 en un equipo de +50 funciona, y en uno de Abierta lo rechaza;
   - como árbitro, abrir una planilla firmada, pulsar "Corregir planilla", cambiar un evento, poner motivo y guardar: el rastro muestra el nombre con "(Árbitro)";
   - en la tabla de sanciones, un jugador con doble amarilla y roja directa en el mismo partido figura con 2 fechas.

## Criterios de aceptación
- [ ] Los equipos de +50 Varones aceptan hasta 35 jugadores en la inscripción pública, el alta manual del Admin y el segundo carnet; el resto de categorías siguen en 20.
- [ ] El contador de la inscripción muestra el cupo correcto de cada equipo.
- [ ] `npm run test:coverage` termina sin timeouts y con 80 % o más en `crossCategory.ts` y `sanctions.ts`.
- [ ] Los tests de `ownerGaps.test.ts` siguen cubriendo 300 fechas por escenario y cada uno tarda menos de 10 s sin cobertura.
- [ ] La tabla de jugadores del Admin no recorre todos los jugadores por fila.
- [ ] Textos con tildes, cédula normalizada en el escáner y "/5" tomado de la constante.
- [ ] Doble amarilla más roja directa en el mismo partido = 2 fechas.
- [ ] Los árbitros pueden corregir planillas firmadas con el mismo flujo que el Admin; el rastro indica nombre y rol; la firma registra quién firmó.
- [ ] Ni los motivos ni los nombres de quien corrige o firma se muestran en vistas públicas.
- [ ] Lint y build sin errores; cero emojis.
