# Brief 25: Motivo de suspensión claro, ficha del jugador sin ambigüedad y refuerzos fuera del cupo

## Contexto
Proyecto: Copa Abogados (marca del cliente, NO Ualdo). Stack: Next.js 16.3 estático, React 19, TypeScript, Vitest. Desplegado en Vercel. Antes de tocar código de Next lee la guía que corresponda en `node_modules/next/dist/docs/` (ver `AGENTS.md`).

**Caso real (2026-10-03):** la ficha del jugador "Siza Arias William Damián" (Futleg) mostraba:
- "Suspendido (Doble Amarilla (1 partido))";
- Amarillas 3;
- Rojas 0.

Los árbitros entendieron "3 amarillas = suspendido" y no le dejaron jugar. En realidad, dos de esas amarillas estaban registradas en el mismo partido, y el sistema lo cuenta como doble amarilla, que suspende 1 fecha (regla de los Briefs 16 y 19). La ficha no dice en qué partido fue la doble amarilla, cuenta 0 rojas aunque hubo expulsión y no indica cuántas amarillas cuentan para el acumulado de 5. Eso llevó a la confusión.

Código actual:
- `src/lib/sanctions.ts`:
  - `computeCardSuspension` (líneas ~103-145) guarda una cola `PendingSanctionItem { label, remaining }`;
  - `formatSanctionReason` (línea ~92) produce textos como "Doble Amarilla (1 partido)";
  - `calculateSanctions` une esos textos con " • " en `PlayerSanction.suspensionReason`;
  - `PlayerSanction.redCards` ya suma rojas directas y dobles amarillas.
- Usan `suspensionReason`:
  - `src/components/PlayerProfileModal.tsx` (línea ~118, "Suspendido ({suspensionReason})");
  - `src/components/MatchSheetModal.tsx` (línea ~122, planilla del árbitro);
  - `src/components/QRScannerModal.tsx` (línea ~294, escáner);
  - `src/components/SanctionsTable.tsx` (línea ~80).
- `PlayerProfileModal.tsx` (líneas ~31-66) cuenta por su cuenta amarillas y rojas recorriendo eventos: "Rojas" solo cuenta eventos `RED_CARD`, así que una doble amarilla registrada como dos `YELLOW_CARD` sale como 0 rojas.

## Objetivo
En todas las pantallas (ficha, planilla, escáner y tabla de sanciones), el motivo de una suspensión dice qué la causó, en qué fecha, contra qué rival y cuántas fechas faltan por cumplir. Por ejemplo: "Doble amarilla en la fecha 4 contra Leones Q: 1 fecha por cumplir". En la ficha del jugador las expulsiones se cuentan bien y se ve cuántas amarillas llevan hacia la suspensión por acumulación. Las reglas de sanción no cambian.

## Requerimientos
1. **`src/lib/sanctions.ts`, detalle de cada sanción pendiente:**
   - Ampliar el elemento de la cola. Nueva interfaz exportada:
     ```ts
     export interface PendingSanctionDetail {
       kind: 'DOUBLE_YELLOW' | 'DIRECT_RED' | 'YELLOW_ACCUMULATION';
       round: number;
       date: string;
       opponentTeamId: string;
       opponentName: string;
       remaining: number;
     }
     ```
     Para la acumulación, `round`, `date` y el rival son los del partido donde se vio la 5.ª amarilla.
   - `computeCardSuspension(playerId, teamMatches, teamId?, teamNames?)` recibe opcionalmente el equipo del jugador y un `ReadonlyMap<string, string>` (id de equipo a nombre) para resolver el rival. Si no hay nombre, usa "rival". Devuelve, además de lo actual, `pendingDetails: PendingSanctionDetail[]`, en el orden en que se cumplen (las más antiguas primero).
   - Nueva función pura exportada `formatPendingSanction(d: PendingSanctionDetail): string`:
     - `DOUBLE_YELLOW`: "Doble amarilla en la fecha {round} contra {rival}: {n} fecha(s) por cumplir";
     - `DIRECT_RED`: "Roja directa en la fecha {round} contra {rival}: {n} fecha(s) por cumplir";
     - `YELLOW_ACCUMULATION`: "5 amarillas acumuladas (la quinta en la fecha {round} contra {rival}): {n} fecha(s) por cumplir".

     Usa "1 fecha" en singular y "N fechas" en plural.
   - `calculateSanctions` construye el mapa de nombres una vez a partir de `teams`, pasa equipo y nombres, y arma `suspensionReason` uniendo con `formatPendingSanction` los pendientes, más la suspensión manual con el texto "Suspensión puesta por la organización para la fecha {lista}". Separador: ". " o salto de línea, no " • ".
   - Añadir a `PlayerSanction` (`src/types/index.ts`) `pendingDetails?: PendingSanctionDetail[]` y `expulsions?: number` (rojas directas más dobles amarillas, igual que `redCards`; si `redCards` ya es eso, documenta en un comentario que `redCards` significa "expulsiones" y reutilízalo en lugar de duplicar).
   - No cambies ninguna regla:
     - 5 amarillas = 1 fecha;
     - doble amarilla = 1 fecha, y sus amarillas no suman al acumulado;
     - roja directa = 2 fechas;
     - doble amarilla más roja directa = 2 fechas;
     - solo cuentan partidos `FINISHED`.
2. **Ficha del jugador** (`src/components/PlayerProfileModal.tsx`):
   - Estado disciplinario:
     - si está suspendido: "Suspendido" y debajo `suspensionReason` completo (cada pendiente en su línea);
     - si no: "Habilitado".
   - Tarjeta de amarillas:
     - total de amarillas como hoy;
     - debajo, "{yellowsTowardNext}/5 para suspensión por acumulación" (usa `YELLOWS_FOR_SUSPENSION`);
     - si alguna amarilla formó parte de una doble amarilla, añade "(N en dobles amarillas, no acumulan)". Calcula N con una función pura nueva en `sanctions.ts`, por ejemplo `countDoubleYellowYellows(playerId, matches)`, contando solo partidos `FINISHED`.
   - Cambiar la tarjeta "Rojas" por "Expulsiones", con el valor de la sanción (`redCards` o `expulsions`), que incluye las dobles amarillas.
   - Quitar el conteo propio de amarillas y rojas cuando ya venga de `calculateSanctions`, para que la ficha y la tabla de sanciones nunca discrepen. Goles, penaltis y partidos jugados siguen calculándose como hoy.
3. **Planilla, escáner y tabla de sanciones:** siguen leyendo `suspensionReason`, así que reciben el texto nuevo. Comprueba que se lee bien:
   - En `QRScannerModal.tsx` y en la tabla de sanciones, que los saltos de línea se respeten (`whitespace-pre-line`) o que cada pendiente se muestre en su línea usando `pendingDetails`.
   - En la planilla (`MatchSheetModal.tsx`), el aviso al intentar alinear a un sancionado debe mostrar el motivo completo.
4. **Texto de la tabla de sanciones** (`src/components/SanctionsTable.tsx`): la columna de amarillas ya muestra "(N/5)". Añade un `title` (tooltip) con "Amarillas que cuentan para la suspensión por acumulación".

## Parte B: los refuerzos no ocupan cupo

### Contexto B
El cliente decide que **los refuerzos de +40 (y +50) habilitados en una categoría más joven NO ocupan cupo** en el equipo que los recibe. El cupo (`maxPlayersForCategory`: 35 en +50, 20 en el resto) cuenta solo a los jugadores propios del equipo.

Un refuerzo es un registro de jugador creado a partir de otro de categoría mayor. Puede venir de dos vías:
- **Por el delegado** (Briefs 20 a 24): la función SQL `register_reinforcement` ya guarda `reinforcementOf: <id del registro de origen>`.
- **Por el Admin** con "Habilitar en otra categoría" (Brief 15): `buildCrossCategoryPlayer` en `src/lib/crossCategory.ts` **no** guarda `reinforcementOf` hoy.

Hoy el cupo se cuenta por separado, con todos los registros del equipo, en siete sitios:
- `src/app/page.tsx` línea ~413 (`handleAddPlayer`);
- `src/components/AdminModal.tsx` línea ~242 (alta manual);
- `src/components/RegistrationView.tsx` líneas ~122, ~170 y ~327 (inscripción pública y contador `N/cupo`);
- `src/components/ReinforcementForm.tsx` línea ~184 (contador);
- `src/lib/crossCategory.ts` línea ~123 (`TEAM_FULL`);
- `src/lib/reinforcement.ts` línea ~83 (`TEAM_FULL`);
- la función SQL `register_reinforcement` (paso de cupo: `select count(*) ... where p.data->>'teamId' = p_team_id`), presente en las cuatro copias SQL: `supabase/schema.sql`, `migracion-refuerzos.sql`, `migracion-pin-refuerzos.sql` y `migracion-pin-por-conexion.sql`.

### Decisiones de negocio B
- Para el cupo cuenta todo registro del equipo **sin** `reinforcementOf`. Los refuerzos no cuentan.
- No hay límite propio de refuerzos por equipo; si el cliente lo pide más adelante, irá en otro brief.
- El contador visible pasa a ser "N/cupo" de jugadores propios, más " + R refuerzos" cuando haya alguno. Ejemplo: "18/20 + 2 refuerzos".
- Un equipo con el cupo lleno de jugadores propios **sí** puede recibir refuerzos. Un refuerzo nunca bloquea la inscripción de un jugador propio.

### Requerimientos B
5. **Lógica común** nueva en `src/lib/roster.ts`:
   - `export function isReinforcement(p: Player): boolean` (`Boolean(p.reinforcementOf)`);
   - `export function rosterCount(players: Player[], teamId: string): number`: jugadores del equipo que no son refuerzo;
   - `export function reinforcementCount(players: Player[], teamId: string): number`;
   - `export function isRosterFull(players: Player[], team: Team): boolean`, que compara `rosterCount` con `maxPlayersForCategory(team.category)`;
   - `export function rosterLabel(players: Player[], team: Team): string`: "N/cupo" o "N/cupo + R refuerzo(s)".
6. **Usar esa lógica en todas las vías:**
   - En `page.tsx` (`handleAddPlayer`) y en el alta manual de `AdminModal.tsx`, el cupo usa `rosterCount`. Si el jugador que se añade es un refuerzo (`reinforcementOf` presente), no se comprueba cupo.
   - En `RegistrationView.tsx`, `teamCount`, `selectedTeamFull` y el contador usan `rosterCount`, `isRosterFull` y `rosterLabel`.
   - En `ReinforcementForm.tsx`, el contador usa `rosterLabel`. **No** se bloquea el envío por cupo.
   - En `crossCategory.ts` (`validateCrossCategory`), quitar la comprobación `TEAM_FULL`: el registro creado es un refuerzo. Mantener el código `TEAM_FULL` en el tipo solo si otra parte lo usa; si no, eliminarlo y su mensaje.
   - En `reinforcement.ts` (`validateReinforcementInput`), quitar la comprobación de cupo (`TEAM_FULL`). Mantener el estado en `ReinforcementStatus` y su mensaje por compatibilidad con la base, aunque ya no se produzca.
   - `buildCrossCategoryPlayer` (`crossCategory.ts`) añade `reinforcementOf: source.id`.
7. **SQL** (las cuatro copias, idénticas):
   - En `register_reinforcement`, eliminar el paso de cupo (contar jugadores y devolver `TEAM_FULL`). Se mantienen todos los demás pasos y su orden.
   - `max_players_for_category` deja de usarse en esa función: déjala definida (no estorba) o elimínala de las cuatro copias, pero no las dejes distintas.
   - El usuario volverá a ejecutar `supabase/migracion-pin-por-conexion.sql` (es idempotente y contiene la versión final de la función). Indica en su cabecera: "Versión con refuerzos fuera del cupo (Brief 25)".
8. **Refuerzos ya creados por el Admin** antes de este cambio, que no tienen `reinforcementOf`: crea `docs/consultas/marcar-refuerzos-existentes.sql` con dos partes.
   - **Parte 1 (solo lectura).** Lista los registros que son refuerzos sin marcar. Condiciones:
     - el registro está en Abierta o +40;
     - no tiene `reinforcementOf`;
     - existe otro registro aprobado con la misma cédula normalizada (`public.normalize_cedula`) en una categoría de origen permitida (+40 o +50 hacia Abierta; +50 hacia +40);
     - ese otro registro tiene un `registeredAt` anterior, o no tiene, cuando el candidato sí.

     Muestra el nombre, el equipo destino, el equipo de origen y el id propuesto como origen.
   - **Parte 2 (escritura, comentada por defecto).** Hace el `update` que añade `reinforcementOf` a esos registros, con instrucciones: "Revisa la Parte 1 antes de quitar los comentarios y ejecutar.".
   - No exponer cédulas en la salida (no seleccionarlas como columna).

### Tests B
- `src/lib/roster.test.ts`:
  - `rosterCount` ignora refuerzos;
  - `reinforcementCount`;
  - `isRosterFull` con 20 propios más 3 refuerzos en Abierta da `true`, y con 19 propios más 5 refuerzos da `false`;
  - en +50, el cupo es 35;
  - `rosterLabel` con y sin refuerzos, en singular y en plural.
- `src/lib/crossCategory.test.ts`:
  - un equipo con 20 jugadores propios **sí** permite habilitar un refuerzo;
  - `buildCrossCategoryPlayer` incluye `reinforcementOf` con el id del origen.
- `src/lib/reinforcement.test.ts`: un equipo con 20 propios no devuelve `TEAM_FULL`.
- Añadir `src/lib/roster.ts` a `coverage.include` en `vitest.config.ts`. Cobertura >= 80%.

## Restricciones técnicas
- Parte B: no cambies en `register_reinforcement` nada que no sea quitar el paso de cupo (PIN, bloqueos, origen, `ALREADY_IN_CATEGORY`, dorsal e inserción siguen igual). No cambies las políticas RLS.
- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla o nombres de archivo. Iconos solo en SVG.
- Marca: NO aplicar la marca Ualdo. Mantén los estilos actuales.
- Convenciones del repo: comentarios en español, imports con `@/`.
- No cambiar las reglas de sanción ni las multas (`src/lib/cardFines.ts`).
- Rendimiento: el mapa de nombres se construye una vez por llamada a `calculateSanctions`; nada de búsquedas por jugador sobre todos los equipos.
- Funciones <50 líneas; archivos <800 líneas; inmutabilidad (la cola interna puede ser local, pero no mutes entradas).
- No añadas dependencias. No toques `tasks/`, `watch_tasks.*`, `.gitignore` ni archivos fuera del alcance.

## Tests (`src/lib/sanctions.test.ts`)
- Doble amarilla en la fecha 4 contra el equipo "Leones Q": `suspensionReason` es exactamente "Doble amarilla en la fecha 4 contra Leones Q: 1 fecha por cumplir".
- Roja directa en la fecha 3: "...: 2 fechas por cumplir". Tras 1 partido terminado del equipo: "...: 1 fecha por cumplir".
- Acumulación: la 5.ª amarilla en la fecha 6 contra X produce el texto de acumulación con la fecha 6 y X.
- Dos pendientes a la vez (por ejemplo, roja y luego acumulación): aparecen los dos, en orden, y `pendingDetails` tiene 2 elementos.
- Rival sin nombre en el mapa: usa "rival".
- Suspensión manual: el texto de la organización con la fecha.
- `countDoubleYellowYellows`: 2 amarillas en un partido y 1 en otro dan 2; 3 sueltas en partidos distintos dan 0; los partidos no `FINISHED` no cuentan.
- Las reglas existentes siguen dando lo mismo (los tests actuales de `sanctions.test.ts` deben seguir en verde, ajustando solo los que comparan texto).
- Cobertura >= 80% de `sanctions.ts`.

## Verificación final (PowerShell, en `C:\laragon\www\Copa Abogados`)
1. `npm test` (solo puede fallar el test de equidad conocido del Brief 13)
2. `npm run lint`
3. `npm run build`
4. Prueba manual con `npm run dev`:
   - en la ficha de un jugador con doble amarilla pendiente: "Suspendido", el motivo con fecha y rival, "Expulsiones 1" y el texto "(2 en dobles amarillas, no acumulan)";
   - en un jugador con 3 amarillas sueltas: "Habilitado" y "3/5 para suspensión por acumulación";
   - el mismo motivo aparece en la tabla de sanciones, en el escáner y en el aviso de la planilla;
   - Parte B: en Inscripción, un equipo con 20 propios más 1 refuerzo muestra "20/20 + 1 refuerzo" y no admite un jugador propio más. En cambio, en "Habilitar refuerzo +40" sí admite otro refuerzo, y desde Admin > Jugadores también.
5. En Supabase (lo hace el usuario):
   - volver a ejecutar `supabase/migracion-pin-por-conexion.sql`;
   - ejecutar la Parte 1 de `docs/consultas/marcar-refuerzos-existentes.sql` y revisar la lista;
   - si la lista es correcta, ejecutar la Parte 2.

## Criterios de aceptación
- [ ] El motivo de suspensión indica causa, fecha, rival y fechas por cumplir, y es el mismo en ficha, planilla, escáner y tabla.
- [ ] La ficha muestra "Expulsiones" incluyendo las dobles amarillas, y el progreso "N/5" hacia la suspensión por acumulación.
- [ ] La ficha indica cuántas amarillas fueron de dobles amarillas.
- [ ] Ficha y tabla de sanciones nunca discrepan (mismo cálculo).
- [ ] Las reglas de sanción y las multas no cambian.
- [ ] Los refuerzos (con `reinforcementOf`) no cuentan para el cupo en ninguna vía: inscripción pública, alta manual del Admin, segundo carnet del Admin, refuerzo por delegado y función SQL.
- [ ] Los contadores muestran "N/cupo + R refuerzos".
- [ ] El segundo carnet creado por el Admin guarda `reinforcementOf`.
- [ ] Las cuatro copias SQL siguen idénticas y sin el paso de cupo en `register_reinforcement`.
- [ ] Existe la consulta para marcar refuerzos antiguos, con la escritura comentada y sin mostrar cédulas.
- [ ] Tests en verde, cobertura >= 80% de `sanctions.ts`; lint y build sin errores; cero emojis.
