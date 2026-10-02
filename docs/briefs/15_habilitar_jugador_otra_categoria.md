# Brief 15: Habilitar jugadores de +40 en la Abierta (segundo carnet)

## Contexto
Proyecto: Copa Abogados (marca del cliente, NO Ualdo). Stack: Next.js 16.3, React 19, TypeScript, Supabase (modelo JSONB `{ id, data }`), Vitest (`npm test`). Antes de tocar código de Next lee la guía que corresponda en `node_modules/next/dist/docs/` (ver `AGENTS.md`).

Un jugador inscrito en +40 Varones debe poder jugar también en Abierta Varones con otro equipo. En la práctica eso es un **segundo registro de jugador** (otro `id`, otro equipo, otro dorsal) con la misma cédula, y por tanto **otro carnet** (el QR del carnet codifica solo `player.id`, ver `src/components/CarnetDigital.tsx` línea ~23).

Lo que ya existe y NO hay que rehacer:
- La regla "una cédula puede estar en dos equipos solo si son de categorías distintas" ya está en la inscripción pública: RPC `cedula_check` (`supabase/schema.sql` líneas ~186-217) y `checkCedula` en `src/lib/store.ts` (líneas ~110-123), usada en `src/components/RegistrationView.tsx` (líneas ~70-105).
- El calendario ya trata a los equipos que comparten cédulas (Brief 08): `src/lib/scheduling/sharedPlayers.ts` (`buildSharedPlayerPairs`) evita que jueguen a la misma hora o seguidos. El nuevo registro entra solo en ese cálculo.
- Planillas, alineaciones, goleadores y sanciones trabajan por `player.id` y filtran por `teamId` (`src/components/MatchSheetModal.tsx` líneas ~109-110), así que cada carnet acumula sus propias estadísticas y tarjetas.

Lo que falta:
1. El Admin no tiene una acción para habilitar a un jugador existente en otra categoría. Hoy tendría que crearlo a mano en "Jugadores" (`handleCreatePlayer`, `src/components/AdminModal.tsx` líneas ~218-243), que no valida la cédula ni copia afiliación, ni lo deja aprobado, ni muestra el carnet.
2. Si la inscripción pública de Abierta está cerrada, el jugador no puede hacerlo por su cuenta. La vía oficial será el Admin.
3. `handleCreatePlayer` pone `cedula: playerCedula || '1800000000'`. Todos los jugadores creados sin cédula comparten esa cédula falsa, y `buildSharedPlayerPairs` los trata como el mismo jugador (crea pares de equipos falsos que restringen el calendario).
4. `PlayerEditModal` (`src/components/PlayerEditModal.tsx`) permite cambiar el equipo sin validar la regla de categoría: se podría mover un jugador a otro equipo de la misma categoría donde ya está su cédula.
5. El buscador manual de `src/components/QRScannerModal.tsx` (líneas ~53-61) usa `players.find(...)` por id, cédula, nombre o dorsal. Con dos carnets de la misma cédula muestra solo el primero, que puede ser el de la otra categoría.

## Objetivo
Desde el panel de Admin, en la lista de jugadores, un jugador de +40 (o +50) se puede "Habilitar en otra categoría": se elige un equipo de una categoría permitida y un dorsal libre, se crea un segundo registro ya aprobado y se muestra su carnet nuevo para descargar o imprimir. Ambos carnets funcionan por separado en planillas y en el escáner.

## Decisiones de negocio (aplicarlas tal cual)
- **Categorías permitidas** (un jugador mayor puede bajar de edad, nunca subir; Damas no se cruza):
  - `+40 Varones` -> `Abierta Varones`
  - `+50 Varones` -> `+40 Varones`, `Abierta Varones`
  - `Abierta Varones` y `Damas` -> ninguna.
- Una cédula solo puede tener un registro por categoría (no se habilita en una categoría donde ya está).
- Las sanciones y multas son **por carnet**: una roja en +40 no suspende en Abierta y viceversa (es el comportamiento actual por `player.id`; no cambiarlo).
- El nuevo registro: `id` nuevo `p-${crypto.randomUUID()}`, mismo `name`, `cedula`, `position`, `affiliation`; `teamId` y `dorsal` elegidos; `approvalStatus: 'APPROVED'`; `registeredAt` = ahora en ISO; sin `photo`, sin `verificationDoc`, sin `isCaptain`, sin `suspendedRounds`.

## Requerimientos
1. **Lógica pura nueva** en `src/lib/crossCategory.ts`:
   - `export const CROSS_CATEGORY_TARGETS: Readonly<Record<Category, readonly Category[]>>` con la tabla de arriba.
   - `export function getEligibleTargetCategories(player: Player, players: Player[], teams: Team[]): Category[]`: categorías destino permitidas para la categoría del equipo actual del jugador, quitando aquellas donde su cédula (normalizada con `normalizeCedula` de `src/lib/scheduling/sharedPlayers.ts`) ya tiene un registro no `REJECTED`. Si el jugador no tiene cédula válida, devuelve `[]`.
   - `export type CrossCategoryError = 'NO_CEDULA' | 'CATEGORY_NOT_ALLOWED' | 'ALREADY_IN_CATEGORY' | 'TEAM_FULL' | 'DORSAL_TAKEN' | 'TEAM_NOT_FOUND' | 'INVALID_DORSAL'`.
   - `export function validateCrossCategory(input: { source: Player; targetTeamId: string; dorsal: number }, players: Player[], teams: Team[]): CrossCategoryError | null`. Dorsal válido: entero 1-99. Equipo lleno: `MAX_PLAYERS_PER_TEAM` de `src/types/index.ts`.
   - `export function buildCrossCategoryPlayer(source: Player, targetTeamId: string, dorsal: number, now: Date): Player`. Recibe `now` para ser testeable; no muta `source`.
   - `export function crossCategoryErrorMessage(err: CrossCategoryError): string` con un mensaje en español claro por cada código (por ejemplo `DORSAL_TAKEN` -> "Ese dorsal ya está en uso en el equipo elegido.").
   - `export function findSameCategoryConflict(cedula: string, teamId: string, players: Player[], teams: Team[], excludePlayerId?: string): boolean`: true si otra ficha (no `REJECTED`, distinto `excludePlayerId`) con esa cédula normalizada ya está en un equipo de la misma categoría que `teamId`. Se reutiliza en los puntos 3 y 4.
2. **Modal nuevo** `src/components/CrossCategoryModal.tsx` (menos de 250 líneas), estilo igual que `PlayerEditModal.tsx`:
   - Muestra nombre, equipo y categoría actual del jugador (no muestra la cédula completa en el título; basta con el nombre).
   - Selector de categoría destino (solo `getEligibleTargetCategories`), selector de equipo de esa categoría (ordenados por nombre, excluye categorías suspendidas que ya recibe `AdminModal` en `suspendedCategories`), input de dorsal (por defecto el mismo dorsal si está libre en el equipo destino; si no, vacío).
   - Al guardar: `validateCrossCategory`; si hay error, mostrarlo en el modal. Si no, llamar `onConfirm(newPlayer)` que devuelve `Promise<boolean>` (es `handleAddPlayer` de `src/app/page.tsx`, que ya persiste primero y aplica el tope de 20). Deshabilitar el botón mientras guarda para evitar doble envío.
   - Si `onConfirm` devuelve `true`, el modal pasa a mostrar `CarnetDigital` del nuevo jugador con su equipo (igual que `PlayerProfileModal.tsx` líneas ~204-220), con un texto: "Carnet de <categoría>. Es distinto al carnet de <categoría original>; el jugador debe presentar el carnet de la categoría en la que juega."
3. **AdminModal** (`src/components/AdminModal.tsx`):
   - En la fila de cada jugador (bloque de acciones, líneas ~760-800) añadir el botón "Habilitar en otra categoría" (icono SVG de `lucide-react`, p. ej. `CopyPlus`), visible solo si `status === 'APPROVED'` y `getEligibleTargetCategories(...)` no está vacío. Abre `CrossCategoryModal`.
   - En la tabla, si la cédula del jugador aparece en más de una categoría, mostrar junto al nombre una etiqueta pequeña "También en <categoría>" (calcularlo con un `Map` cédula normalizada -> categorías construido una sola vez por render con `useMemo`, no con búsquedas anidadas por fila).
   - `handleCreatePlayer`: quitar el fallback `'1800000000'`; la cédula pasa a ser obligatoria (validar 10 dígitos tras `normalizeCedula`, igual criterio que uses en el modal). Validar también `findSameCategoryConflict` y mostrar "Esta cédula ya está registrada en otro equipo de esta categoría.".
   - Pasar a `AdminModal` una prop `onAddPlayerAsync?: (p: Player) => Promise<boolean>` o cambiar el tipo de `onAddPlayer` a `(player: Player) => Promise<boolean> | void` (como ya hace `RegistrationView`), lo que sea menos invasivo; `page.tsx` ya pasa `handleAddPlayer` que devuelve `Promise<boolean>`.
4. **PlayerEditModal** (`src/components/PlayerEditModal.tsx`): en `handleSubmit`, si cambia el equipo o la cédula, rechazar con `findSameCategoryConflict(cedula, teamId, players, teams, player.id)` y el mensaje "Esta cédula ya está registrada en otro equipo de esta categoría.".
5. **QRScannerModal** (`src/components/QRScannerModal.tsx`):
   - Si la búsqueda coincide exactamente con un `id`, mostrar ese jugador (caso QR, sin cambios).
   - Si no, usar `filter` en lugar de `find`. Con una sola coincidencia, igual que ahora. Con varias, listar las coincidencias (nombre, dorsal, equipo y categoría) y dejar elegir una; al elegir se muestra su ficha y su estado de sanción como hoy.
6. **Datos existentes** (consulta de solo lectura, no la ejecutes contra producción tú: entrégala): crea `docs/consultas/cedula-placeholder.sql` que liste cuántos jugadores tienen `btrim(data->>'cedula') = '1800000000'` y en qué equipos, para que el Admin los corrija a mano.
7. No se toca la base de datos (ni RLS, ni RPC): el Admin inserta autenticado como ya hace hoy, y la regla de categorías de la inscripción pública ya está en `cedula_check`.

## Restricciones técnicas
- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla o nombres de archivo. Iconos solo en SVG (`lucide-react`, ya instalado).
- Marca: NO aplicar la marca Ualdo. Mantén los colores y estilos actuales del proyecto (`#00A859`, slate, rose).
- Sigue las convenciones del repo: comentarios en español, `@/` para imports, componentes `React.FC`, estilos Tailwind como en `PlayerEditModal.tsx`.
- Seguridad: no mostrar cédulas en vistas públicas (el escáner es de árbitro/admin y ya las muestra; no añadir cédulas a ninguna vista nueva pública). Valida todas las entradas del modal. Sin `dangerouslySetInnerHTML`.
- Diseño: SOLID, DRY, KISS; funciones <50 líneas; archivos <800 líneas (`AdminModal.tsx` ya tiene ~1155: no lo hagas crecer más de ~60 líneas; la lógica va en `crossCategory.ts` y el modal nuevo); sin anidación >4 niveles; inmutabilidad (sin mutar `players`, `teams` ni el jugador origen); errores explícitos.
- Rendimiento: nada de búsquedas O(n^2) por fila de la tabla; usa `Map` precalculado.
- No añadas dependencias. No toques `tasks/`, `watch_tasks.*`, `.gitignore` ni archivos fuera del alcance.

## Tests
Nuevo `src/lib/crossCategory.test.ts` y añadir `src/lib/crossCategory.ts` a `coverage.include` en `vitest.config.ts`. Casos:
- `getEligibleTargetCategories`: +40 sin registro en Abierta -> `['Abierta Varones']`; +40 ya en Abierta -> `[]`; +50 -> `['+40 Varones', 'Abierta Varones']` menos las ocupadas; Abierta -> `[]`; Damas -> `[]`; jugador sin cédula -> `[]`; un registro `REJECTED` en Abierta no cuenta como ocupado; cédulas con guiones o espacios se normalizan.
- `validateCrossCategory`: cada código de error (`NO_CEDULA`, `CATEGORY_NOT_ALLOWED` p. ej. +40 -> Damas o Abierta -> +40, `ALREADY_IN_CATEGORY`, `TEAM_FULL` con 20 jugadores, `DORSAL_TAKEN`, `TEAM_NOT_FOUND`, `INVALID_DORSAL` con 0, 100 y 7.5) y el caso válido -> `null`.
- `buildCrossCategoryPlayer`: id nuevo distinto del origen, mismos nombre/cédula/posición/afiliación, `approvalStatus` APPROVED, `registeredAt` igual a `now.toISOString()`, sin foto/respaldo/capitán/suspensiones, y el objeto origen queda intacto (comparar con una copia profunda).
- `findSameCategoryConflict`: detecta conflicto en la misma categoría, no en categorías distintas, respeta `excludePlayerId` y ignora `REJECTED`.
- Integración con calendario: tras añadir el registro construido, `buildSharedPlayerPairs` (de `sharedPlayers.ts`) contiene el par equipo +40 / equipo Abierta.
Cobertura >= 80% de `crossCategory.ts` (`npm run test:coverage`).

## Verificación final (Windows cmd, en la carpeta del proyecto)
1. `npm test` (los 2 fallos conocidos del Brief 13 pueden seguir; ningún fallo nuevo)
2. `npm run test:coverage` (crossCategory.ts >= 80%)
3. `npm run lint`
4. `npm run build`
5. Prueba manual con `npm run dev`, como Admin:
   - En Jugadores, un jugador aprobado de +40 muestra "Habilitar en otra categoría"; uno de Abierta o Damas no.
   - Habilitarlo en un equipo de Abierta con dorsal libre: aparece el carnet nuevo (QR distinto, dorsal y equipo de Abierta). En la tabla ambos registros muestran "También en ...".
   - Repetir con el mismo jugador: el botón ya no aparece.
   - Dorsal ocupado o equipo con 20 jugadores: mensaje de error y no se guarda.
   - Crear jugador sin cédula en el formulario manual: no deja guardar.
   - En el escáner, buscar el nombre del jugador: salen las dos fichas y se puede elegir.

## Criterios de aceptación
- [ ] Un jugador de +40 (o +50) aprobado se habilita en una categoría permitida desde el Admin, con equipo y dorsal propios, quedando APROBADO.
- [ ] El nuevo registro tiene su propio carnet (id y QR distintos) y se muestra al terminar para descargar o imprimir.
- [ ] No se permite: categoría no permitida, categoría donde la cédula ya está, dorsal ocupado o inválido, equipo lleno.
- [ ] Ambas fichas aparecen en sus planillas y suman estadísticas y sanciones por separado.
- [ ] El calendario los trata como jugador compartido (par de equipos en `buildSharedPlayerPairs`).
- [ ] La creación manual ya no usa la cédula `1800000000` y exige cédula.
- [ ] Editar un jugador no permite dejar la misma cédula dos veces en una categoría.
- [ ] El escáner muestra todas las coincidencias cuando hay varias.
- [ ] `docs/consultas/cedula-placeholder.sql` existe y es solo lectura.
- [ ] Tests nuevos en verde, cobertura >= 80% de `crossCategory.ts`; lint y build sin errores; cero emojis.
