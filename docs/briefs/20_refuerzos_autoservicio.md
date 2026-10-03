# Brief 20: Habilitación de refuerzos +40 por los propios equipos (dentro de Inscripción)

## Contexto
Proyecto: Copa Abogados (marca del cliente, NO Ualdo). Stack: Next.js 16.3, React 19, TypeScript, Supabase (tablas JSONB `{ id, data }` con RLS), Vitest. Antes de tocar código de Next lee la guía que corresponda en `node_modules/next/dist/docs/` (ver `AGENTS.md`).

Hoy un jugador de +40 (o +50) solo puede tener un segundo registro ("segundo carnet") en una categoría más joven si lo crea el Admin (Brief 15: `src/lib/crossCategory.ts`, `src/components/CrossCategoryModal.tsx`, botón "Habilitar en otra categoría" en Admin > Jugadores). El cliente quiere que **los propios equipos** (delegados, sin iniciar sesión) puedan habilitar a sus refuerzos de +40 en la Abierta, desde un apartado nuevo dentro de la pestaña **Inscripción**.

Puntos del sistema actual que condicionan el diseño (léelos antes de empezar):
- **El público no puede leer cédulas.** `supabase/schema.sql` (líneas ~80-160):
  - la tabla `players` solo la leen usuarios autenticados;
  - los anónimos leen la vista `players_public`, que quita `cedula` y `verificationDoc`;
  - los anónimos solo pueden INSERTAR jugadores en estado `PENDING` y en equipos con inscripción abierta (política `players_public_insert` y función `registration_allowed`, en `supabase/migracion-inscripcion-cerrada.sql`).

  Por eso, comprobar en el navegador que una cédula pertenece a un jugador de +40 es imposible sin exponer datos. La comprobación y el alta deben hacerse **en la base**, con una función `security definer`, igual que la existente `cedula_check` (`schema.sql` líneas ~186-217).
- **La inscripción pública** está en `src/components/RegistrationView.tsx` (766 líneas, asistente de 5 pasos). Se renderiza en `src/app/page.tsx` (línea ~905) con `categories={registrableCategories}`. Si `registrationsOpen` es falso o no hay categorías, muestra a pantalla completa "Inscripciones cerradas" (línea ~214). La categoría Abierta puede estar en `closedRegistrationCategories` aunque se quieran aceptar refuerzos.
- **Ajustes:** `AppSettings` (`src/types/index.ts`), `getSettings` / guardado en `src/lib/store.ts` (líneas ~128-170), estado y manejadores en `page.tsx` (líneas ~94-107 y ~605-660), interruptores en Admin (`src/components/AdminModal.tsx`, props `registrationsOpen` / `onSetRegistrations`). Los ajustes viven en la tabla `settings` (fila `id = 'app'`, columna `data` JSONB).
- **Reglas que ya existen y deben respetarse:**
  - categorías permitidas `CROSS_CATEGORY_TARGETS` (`+40 Varones` -> `Abierta Varones`; `+50 Varones` -> `+40 Varones` o `Abierta Varones`);
  - una cédula, un registro por categoría;
  - dorsal único por equipo;
  - cupo `maxPlayersForCategory` (35 en +50, 20 en el resto, `src/types/index.ts`).
- El nuevo registro debe entrar en el cálculo de jugadores compartidos del calendario (`buildSharedPlayerPairs`, por cédula), lo que ocurre solo al tener la misma cédula.

## Objetivo
En Inscripción hay dos apartados: "Inscribir jugador" (el asistente actual, sin cambios) y "Habilitar refuerzo +40". En el segundo, un delegado elige categoría destino y equipo, escribe la cédula del refuerzo, su dorsal y su posición. Si el jugador está aprobado en +40 (o +50), la base crea el segundo registro en estado PENDIENTE sin exponer ningún dato de otros jugadores, y se muestra su carnet. El Admin lo ve marcado como refuerzo y lo aprueba como cualquier inscripción. El Admin puede abrir o cerrar los refuerzos con un interruptor propio.

## Decisiones de negocio (aplicarlas tal cual)
- **Origen y destino:** los mismos de `CROSS_CATEGORY_TARGETS` (+40 a Abierta; +50 a +40 o Abierta). El registro de origen debe estar **APROBADO** (o sin `approvalStatus`, que hoy equivale a aprobado) y no `REJECTED`.
- **Estado del nuevo registro:** `PENDING`. El Admin lo aprueba en Admin > Jugadores como cualquier inscripción pública. No se pide documento de respaldo, porque el jugador ya fue verificado en su categoría de origen.
- **Datos copiados del registro de origen:** `name`, `cedula`, `affiliation`. Del formulario salen `teamId`, `dorsal` y `position` (por defecto la del origen). Además, campo nuevo `reinforcementOf: <id del registro de origen>` para trazabilidad. Sin foto, sin `verificationDoc`, sin `isCaptain` y sin `suspendedRounds`.
- **Apertura:** interruptor nuevo `reinforcementsOpen` (por defecto `true`), independiente de `closedRegistrationCategories`. Así se aceptan refuerzos en Abierta aunque esté cerrada la inscripción de jugadores nuevos. Se rechaza si la categoría destino está suspendida o en pausa.
- **Privacidad:**
  - La función nunca devuelve la cédula. Solo devuelve, en caso de éxito, los datos públicos del nuevo registro (los mismos que ya expone `players_public`).
  - Los errores no permiten distinguir "la cédula no existe" de "existe pero no es elegible": ambos dan `NOT_ELIGIBLE`.

## Requerimientos
1. **Migración SQL** nueva `supabase/migracion-refuerzos.sql` (idempotente, con cabecera igual a las otras migraciones: "Ejecútalo UNA vez en Supabase: SQL Editor -> New query -> pegar -> Run"). Copia el mismo contenido al final de `supabase/schema.sql`.
   - Función `public.normalize_cedula(text) returns text`, `immutable`: `regexp_replace(btrim(coalesce($1, '')), '[-.\s]', '', 'g')`. Debe coincidir con `normalizeCedula` de `src/lib/scheduling/sharedPlayers.ts`.
   - Función `public.max_players_for_category(text) returns int`, `immutable`: 35 para `'+50 Varones'` y 20 para el resto. Comentario: "debe coincidir con MAX_PLAYERS_BY_CATEGORY de src/types/index.ts".
   - Función `public.register_reinforcement(p_cedula text, p_team_id text, p_dorsal int, p_position text) returns jsonb`, `language plpgsql`, `security definer`, `set search_path = public`, en este orden:
     1. Validar entradas:
        - cédula normalizada de 10 dígitos (`~ '^\d{10}$'`);
        - dorsal entre 1 y 99;
        - posición en (`'POR'`, `'DEF'`, `'MED'`, `'DEL'`) o nula (en ese caso, la del origen).

        Si algo falla: `{"status": "INVALID"}`.
     2. Bloquear el equipo destino con `select ... from teams where id = p_team_id for update`. Si no existe: `INVALID`.
     3. Leer `settings` (`id = 'app'`):
        - `reinforcementsOpen` (por defecto true) debe ser verdadero;
        - la categoría destino no puede estar en `suspendedCategories` ni en `pausedCategories`.

        Si algo falla: `{"status": "CLOSED"}`.
     4. Buscar el registro de origen: jugador con la misma cédula normalizada, `approvalStatus` nulo o `'APPROVED'`, cuyo equipo sea de una categoría de origen permitida para la categoría destino (mapa fijo en SQL igual a `CROSS_CATEGORY_TARGETS`). Si no hay: `{"status": "NOT_ELIGIBLE"}`.
     5. Si ya existe un registro no `REJECTED` con esa cédula en un equipo de la categoría destino: `{"status": "ALREADY_IN_CATEGORY"}`.
     6. Si el equipo destino ya tiene `max_players_for_category(categoría)` jugadores o más (contados igual que el cliente: todos los registros con ese `teamId`): `{"status": "TEAM_FULL"}`.
     7. Si el dorsal ya está usado en el equipo destino: `{"status": "DORSAL_TAKEN"}`.
     8. Insertar en `players` con `id = 'p-' || gen_random_uuid()` y `data` = `{ id, teamId, name, cedula, dorsal, position, affiliation, approvalStatus: 'PENDING', registeredAt: now() en ISO, reinforcementOf }`. Comprueba en `src/lib/store.ts` (`insertRows` / `selectAll`) si `data` debe incluir el `id`, y sigue esa misma convención.
     9. Devolver `{"status": "OK", "player": { id, teamId, name, dorsal, position, affiliation, approvalStatus, registeredAt, reinforcementOf }}` (sin cédula).
   - `revoke all ... from public; grant execute ... to anon, authenticated;` para las tres funciones (las dos auxiliares pueden quedarse sin `grant` a anon si solo las usa `register_reinforcement`).
   - No modifiques las políticas RLS existentes ni `registration_allowed`.
2. **Ajuste `reinforcementsOpen`:**
   - `AppSettings` en `src/types/index.ts`: `reinforcementsOpen: boolean`.
   - `src/lib/store.ts`: valor por defecto `true` en `DEFAULT_SETTINGS` y lectura tolerante en `getSettings`, igual que `registrationsOpen`.
   - `src/app/page.tsx`: estado `reinforcementsOpen`, cargado con los demás ajustes, y manejador `handleSetReinforcements(open)`. Sigue el patrón de `handleSetRegistrations` (actualización optimista y vuelta atrás si falla el guardado), y conserva el resto de ajustes al guardar.
   - `src/components/AdminModal.tsx`: interruptor "Refuerzos +40/+50 abiertos" junto al de inscripción global. Props `reinforcementsOpen` y `onSetReinforcements`. Lo mínimo posible de código (el archivo ya pasa de 800 líneas).
3. **Cliente de la función:** `src/lib/store.ts`, `export async function registerReinforcement(input: { cedula: string; teamId: string; dorsal: number; position?: PlayerPosition }): Promise<ReinforcementResult>`. Llama a `supabase.rpc('register_reinforcement', ...)` y devuelve `{ status: ReinforcementStatus; player?: Player }`. Si hay error de red o la función no existe (migración sin ejecutar), lanza un `Error` con un mensaje claro ("No se pudo habilitar el refuerzo. Inténtalo más tarde.") sin datos internos.
4. **Lógica pura** nueva en `src/lib/reinforcement.ts`, para validar en el navegador antes de llamar y mostrar mensajes:
   - `export type ReinforcementStatus = 'OK' | 'INVALID' | 'CLOSED' | 'NOT_ELIGIBLE' | 'ALREADY_IN_CATEGORY' | 'TEAM_FULL' | 'DORSAL_TAKEN'`.
   - `export function reinforcementTargetCategories(): Category[]`: categorías destino posibles, es decir, la unión de los valores de `CROSS_CATEGORY_TARGETS` (Abierta y +40).
   - `export function validateReinforcementInput(input, teams, players): ReinforcementStatus | null`: cédula de 10 dígitos (`isValidCedula`), dorsal entero de 1 a 99, equipo existente y de categoría destino posible, dorsal no usado en el equipo (con la lista pública `players`) y cupo no lleno (`maxPlayersForCategory`). Devuelve `null` si todo está bien. Es una ayuda para el usuario: la regla real la aplica la base.
   - `export function reinforcementMessage(status: ReinforcementStatus): string`, en español y con tildes:
     - `NOT_ELIGIBLE`: "No encontramos un jugador aprobado de +40 o +50 con esa cédula que pueda jugar en esta categoría.";
     - `ALREADY_IN_CATEGORY`: "Este jugador ya está registrado en un equipo de esta categoría.";
     - `CLOSED`: "La habilitación de refuerzos está cerrada por la organización.";
     - mensajes claros para el resto de códigos.
5. **Apartados en Inscripción:**
   - Componente nuevo `src/components/RegistrationHub.tsx` con dos pestañas tipo pastilla, con el mismo estilo que el resto de la app: "Inscribir jugador" y "Habilitar refuerzo +40". Recuerda la pestaña elegida en `useState`.
   - "Inscribir jugador" renderiza `RegistrationView` tal cual. Si la inscripción está cerrada, su pantalla "Inscripciones cerradas" se ve solo dentro de esa pestaña, sin bloquear la otra.
   - En `page.tsx`, sustituir `<RegistrationView ... />` por `<RegistrationHub ... />` pasando lo mismo más `reinforcementsOpen`, `suspendedCategories`, `pausedCategories` y un `onReinforcementAdded(player)` que añade el jugador devuelto al estado `players` (inmutable: `setPlayers(prev => [...prev, player])`).
6. **Formulario de refuerzo:** componente nuevo `src/components/ReinforcementForm.tsx`, de menos de 300 líneas.
   - Si `reinforcementsOpen` es falso: aviso "La habilitación de refuerzos está cerrada por la organización." y nada más.
   - Texto de ayuda breve: "Si un jugador ya está inscrito y aprobado en +40 (o +50), su equipo de la Abierta puede habilitarlo como refuerzo. Recibirá un carnet distinto para esa categoría; la organización revisará la habilitación."
   - Campos:
     - categoría destino: solo `reinforcementTargetCategories()` que no estén suspendidas ni en pausa;
     - equipo de esa categoría, ordenado por nombre, con el contador `N/<cupo>`;
     - cédula del refuerzo;
     - dorsal;
     - posición (opcional, "Igual que en su categoría");
     - foto opcional para el carnet: reutiliza `applyWatermarkToPhoto` de `src/lib/watermark.ts` como en `RegistrationView`, y la foto no se guarda.
   - Casilla obligatoria: "Confirmo que este jugador es refuerzo de nuestro equipo y que los datos son correctos."
   - Al enviar: `validateReinforcementInput`; si hay error, mostrarlo. Si no, `registerReinforcement`. Botón deshabilitado mientras se envía (evita el doble envío).
   - Si sale `OK`: llamar a `onReinforcementAdded(player)` y mostrar `CarnetDigital` con `{ ...player, photo }` y el equipo destino, con el aviso "Carnet de <categoría>. Pendiente de aprobación por la organización. Es distinto al carnet de su otra categoría."
   - Si no: mostrar `reinforcementMessage(status)`.
   - No mostrar nunca la cédula de otros jugadores ni datos del registro de origen distintos del nombre que devuelve la función.
7. **Admin > Jugadores** (`AdminModal.tsx`): en la fila de un jugador con `reinforcementOf`, etiqueta pequeña "Refuerzo", junto a las de "También en ...". Añadir `reinforcementOf?: string` al tipo `Player` (`src/types/index.ts`). Comprobar que `players_public` y `players_admin` lo exponen: lo hacen solas, porque devuelven `data` sin `cedula` ni `verificationDoc`.

## Restricciones técnicas
- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla o nombres de archivo. Iconos solo en SVG (`lucide-react`).
- Marca: NO aplicar la marca Ualdo. Mantén los colores y estilos actuales (`#00A859`, slate).
- Convenciones del repo: comentarios en español, imports con `@/`, `React.FC`, Tailwind como en `RegistrationView.tsx`.
- **Seguridad:**
  - toda la regla de elegibilidad se aplica en la función SQL `security definer`;
  - el cliente solo valida por comodidad;
  - consultas SQL sin concatenar texto del usuario (parámetros de la función);
  - `set search_path = public`;
  - la función no devuelve cédulas ni distingue cédula inexistente de no elegible;
  - errores sin detalles internos;
  - sin `dangerouslySetInnerHTML`.
- No cambies el asistente de `RegistrationView.tsx` salvo lo imprescindible para colocarlo dentro de la pestaña. No debe pasar de 800 líneas.
- `AdminModal.tsx` (más de 1.200 líneas): añade lo mínimo (interruptor y etiqueta); no lo hagas crecer más de ~25 líneas.
- Funciones <50 líneas; archivos nuevos <300 líneas; sin anidación >4 niveles; inmutabilidad.
- No añadas dependencias. No toques `tasks/`, `watch_tasks.*`, `.gitignore` ni archivos fuera del alcance.

## Tests
- `src/lib/reinforcement.test.ts` (añadir `src/lib/reinforcement.ts` a `coverage.include` en `vitest.config.ts`):
  - `reinforcementTargetCategories` devuelve Abierta y +40 (sin Damas ni +50);
  - `validateReinforcementInput`, un caso por resultado: cédula inválida, dorsal 0, 100 o 7.5, equipo inexistente, equipo de Damas o de +50, dorsal ocupado, equipo lleno (20 en Abierta), y caso válido -> `null`;
  - `reinforcementMessage` devuelve texto no vacío para cada estado y el de `NOT_ELIGIBLE` no menciona si la cédula existe.
- `src/lib/settings.test.ts` (o en el test que ya cubra ajustes): `getSettings` sin `reinforcementsOpen` en la base devuelve `true`. Si `getSettings` no es testeable sin Supabase, extrae la normalización de ajustes a una función pura y testéala.
- **Pruebas SQL manuales:** escribe en `docs/consultas/prueba-refuerzos.sql` un bloque comentado, con datos ficticios dentro de una transacción con `rollback`, que el Admin pueda ejecutar en Supabase para comprobar cada código de la función. Casos: OK, NOT_ELIGIBLE (cédula inexistente y origen pendiente), ALREADY_IN_CATEGORY, TEAM_FULL, DORSAL_TAKEN, CLOSED e INVALID.
- Cobertura >= 80% de `reinforcement.ts`.

## Verificación final (PowerShell, en `C:\laragon\www\Copa Abogados`)
1. `npm test` (solo puede fallar el test de equidad conocido del Brief 13)
2. `npm run lint`
3. `npm run build`
4. En Supabase (lo hace el usuario): ejecutar `supabase/migracion-refuerzos.sql` y después `docs/consultas/prueba-refuerzos.sql`; todos los casos devuelven el código esperado y el `rollback` no deja datos.
5. Prueba manual con `npm run dev` y la migración aplicada, sin iniciar sesión:
   - Inscripción muestra las dos pestañas. Con la inscripción de Abierta cerrada, "Habilitar refuerzo +40" sigue funcionando.
   - Habilitar a un jugador aprobado de +40 en un equipo de Abierta: aparece su carnet nuevo (pendiente). En Admin > Jugadores sale con "Pendiente", "Refuerzo" y "También en +40 Varones".
   - Repetir con la misma cédula: "Este jugador ya está registrado en un equipo de esta categoría."
   - Cédula inexistente o de un jugador de Abierta: mensaje `NOT_ELIGIBLE`.
   - Con el interruptor de refuerzos apagado en Admin: el apartado muestra que está cerrado y la función devuelve `CLOSED` aunque se llame directamente.

## Criterios de aceptación
- [ ] La pestaña Inscripción tiene los apartados "Inscribir jugador" y "Habilitar refuerzo +40"; el primero funciona igual que antes.
- [ ] Un delegado sin sesión habilita a un jugador aprobado de +40 (o +50) en una categoría permitida; el registro queda PENDIENTE con `reinforcementOf` y se muestra su carnet.
- [ ] La base rechaza los casos no permitidos con el código correcto, aunque se llame a la función saltándose la interfaz.
- [ ] La función no devuelve cédulas ni revela si una cédula existe.
- [ ] El Admin puede abrir o cerrar los refuerzos con su propio interruptor, independiente de la inscripción por categoría.
- [ ] El refuerzo cuenta como jugador compartido para el calendario (misma cédula).
- [ ] Tests en verde, cobertura >= 80% de `reinforcement.ts`; lint y build sin errores; cero emojis.
