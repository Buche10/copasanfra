# Brief 06: Bloquear de verdad la inscripción en categorías cerradas

## Contexto
Proyecto: Copa Abogados. Stack: Next.js 16.3 (ver `AGENTS.md`), React 19, TypeScript, Tailwind 4, Supabase (tablas `{ id, data jsonb }`), Vitest (`npm test`).

Desde el commit `e1dc139` (2026-09-23) el admin puede cerrar la inscripción por categoría (`AppSettings.closedRegistrationCategories`, guardado en la tabla `settings`, fila `id = 'app'`). `src/app/page.tsx` (línea ~102) calcula `registrableCategories` sin las cerradas y se lo pasa a `RegistrationView` como `categories` (línea ~874).

Problema reportado en producción: con "Abierta Varones" cerrada, el público se sigue inscribiendo en equipos de esa categoría.

Causa 1 (interfaz): `src/components/RegistrationView.tsx:49` inicia `selectedCategory` en `'Abierta Varones'` fijo. Si esa categoría no está en `categories`, su botón no aparece, pero el estado sigue en Abierta. Como `filteredTeams` (línea 110) filtra por `selectedCategory`, la lista de equipos muestra los de Abierta aunque el único botón visible sea, por ejemplo, "+50 Varones". El jugador elige un equipo de Abierta y se inscribe.

Causa 2 (base de datos): la política `players_public_insert` (`supabase/schema.sql`, línea ~92) solo exige `approvalStatus = 'PENDING'`. No comprueba si la inscripción está abierta ni si la categoría del equipo está cerrada, así que una pestaña abierta desde antes o una petición directa también pasan.

## Objetivo
No es posible inscribir un jugador en un equipo de una categoría cerrada (ni con la inscripción global cerrada), ni desde la interfaz ni con una petición directa a Supabase.

## Requerimientos
1. `src/components/RegistrationView.tsx`:
   - Iniciar `selectedCategory` con `categories[0]` (tipo `Category | null`; `null` si la lista está vacía).
   - Categoría efectiva: `const effectiveCategory = selectedCategory && categories.includes(selectedCategory) ? selectedCategory : categories[0] ?? null;` y usarla en `filteredTeams`, en el resaltado de botones y en los textos. Así, si el admin cierra una categoría mientras la página está abierta, la vista cambia sola.
   - Si `categories` está vacía, mostrar el mismo aviso de "inscripciones cerradas" que ya existe para `registrationsOpen === false` (línea ~190).
   - Antes de guardar (`handleSubmit` o equivalente, donde se arma el jugador con `registeredAt`, línea ~175), comprobar que el equipo elegido existe y que su `category` está en `categories`; si no, mostrar "La inscripción para esta categoría está cerrada." y no enviar.
   - Extraer esa comprobación a una función pura en `src/lib/registration.ts`: `canRegisterInTeam(team: Team | undefined, categories: Category[], registrationsOpen: boolean): boolean`.
2. Base de datos. Crear `supabase/migracion-inscripcion-cerrada.sql` (idempotente y comentada, como `migracion-arbitraje.sql`) y reflejar lo mismo en `supabase/schema.sql`:
   - Función `public.registration_allowed(team_id text) returns boolean language sql stable security definer set search_path = public`. Devuelve `true` solo si:
     - existe el equipo en `public.teams`;
     - `coalesce((s.data->>'registrationsOpen')::boolean, true)` es verdadero en la fila `settings` `id = 'app'` (si no hay fila, tratar como abierta);
     - la categoría del equipo (`t.data->>'category'`) NO está en `s.data->'closedRegistrationCategories'`, ni en `suspendedCategories`, ni en `pausedCategories` (usar el operador `?` sobre el array JSONB; tratar como vacío si el campo no existe).
   - `revoke all on function public.registration_allowed(text) from public; grant execute ... to anon, authenticated;`
   - Rehacer la política: `drop policy if exists "players_public_insert" on public.players; create policy "players_public_insert" on public.players for insert to anon with check (coalesce(data->>'approvalStatus', 'PENDING') = 'PENDING' and public.registration_allowed(data->>'teamId'));`
   - Revisar si la tabla `player_docs` (insert anónimo del documento de respaldo) necesita la misma condición: si su fila se inserta antes que la del jugador, NO añadir la condición ahí (dejar comentario explicándolo); si se inserta después, añadir `exists (select 1 from public.players p where p.id = player_docs.id)` para que no queden documentos huérfanos. Revisa el orden real en `src/lib/store.ts` (`insertPlayer`, línea ~195).
   - Los administradores autenticados siguen pudiendo añadir jugadores en cualquier categoría (la política `players_write` no cambia).
3. Mensaje de error: si Supabase rechaza el insert por RLS, `RegistrationView` debe mostrar "La inscripción para esta categoría está cerrada." en lugar del error técnico (detectar el código `42501` o el texto `row-level security` en el mensaje de `insertPlayer`).

## Restricciones técnicas
- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla o nombres de archivo. Iconos solo con `lucide-react` (SVG).
- Repo de un cliente con marca propia: NO aplicar la marca Ualdo. Mantener el estilo visual actual.
- Sigue las convenciones existentes del repo.
- Seguridad: la regla se aplica en la base (RLS), no solo en la interfaz; errores sin datos sensibles.
- Diseño: SOLID, DRY, KISS, funciones <50 líneas, archivos <800 líneas, sin anidación >4 niveles, inmutabilidad, manejo de errores explícito.
- No borres ni modifiques jugadores ya inscritos: la depuración la hace el admin a mano.
- No añadas dependencias.
- No toques archivos fuera del alcance indicado. No toques `tasks/`, `watch_tasks.*` ni `.gitignore`.

## Tests
`src/lib/registration.test.ts` para `canRegisterInTeam`:
- equipo de categoría abierta con inscripción global abierta: `true`;
- equipo de categoría que no está en `categories`: `false`;
- inscripción global cerrada: `false`;
- equipo `undefined`: `false`.

Cobertura >=80% en `src/lib/registration.ts`. Comandos: `npm test`, `npm run test:coverage`.

Verificación manual (después de ejecutar la migración en Supabase):
1. Con "Abierta Varones" cerrada, abrir Inscripción sin sesión: solo aparecen categorías abiertas y los equipos listados son de la categoría seleccionada.
2. Dejar una pestaña de Inscripción abierta, cerrar la categoría desde Admin en otra pestaña y enviar la inscripción desde la primera: se rechaza con "La inscripción para esta categoría está cerrada." y el jugador no aparece en la base.
3. Como admin, agregar un jugador a un equipo de Abierta desde el panel: funciona.

## Verificación final
1. `npm test`
2. `npm run test:coverage`
3. `npm run lint`
4. `npx tsc --noEmit`
5. `npm run build`

## Criterios de aceptación
- [ ] La lista de equipos corresponde siempre a una categoría abierta y visible.
- [ ] Una inscripción pública en categoría cerrada, pausada o suspendida, o con la inscripción global cerrada, es rechazada por la base (RLS).
- [ ] El público ve un mensaje claro, sin errores técnicos.
- [ ] Los admins siguen pudiendo añadir jugadores en cualquier categoría.
- [ ] Todos los tests pasan; cobertura >=80% en el código nuevo; build, lint y `tsc` sin errores.
- [ ] Cero emojis en el diff.
