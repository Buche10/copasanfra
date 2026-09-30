# Brief 07: Corregir la política de `player_docs` del Brief 06

## Contexto
Proyecto: Copa Abogados. Stack: Next.js 16.3, React 19, TypeScript, Supabase (tablas `{ id, data jsonb }` con RLS), Vitest.

El Brief 06 (bloqueo de inscripción en categorías cerradas) está construido y sus tests, el lint y el build pasan. La parte de interfaz y la política de `players` son correctas. Pero el punto 3 de `supabase/migracion-inscripcion-cerrada.sql` (líneas ~47-54), replicado en `supabase/schema.sql` (líneas ~145-148), cambió la política de inserción anónima de documentos de respaldo a:

```sql
create policy "player_docs_public_insert" on public.player_docs
  for insert to anon
  with check (exists (select 1 from public.players p where p.id = player_docs.id));
```

### CRITICAL: con esta política ninguna inscripción pública con respaldo funciona
La subconsulta `select ... from public.players` se ejecuta con los permisos del usuario anónimo. La tabla `players` solo tiene política de lectura para `authenticated` (`players_read_auth`), así que para el anónimo la subconsulta no devuelve filas y el `exists` es siempre falso. Resultado:
1. `insertPlayer` (`src/lib/store.ts`, línea ~195) inserta el jugador (permitido).
2. El insert en `player_docs` falla por RLS.
3. El "deshacer" (`delete` del jugador) tampoco funciona para el anónimo, porque no hay política de borrado para `anon`. Supabase no devuelve error: simplemente no borra nada.
4. El jugador queda inscrito SIN respaldo y el público ve "No se pudo guardar el respaldo" (o "La inscripción para esta categoría está cerrada", porque el mensaje contiene "row-level security"), así que vuelve a intentarlo y deja duplicados.

Además, la comprobación es innecesaria: `player_docs.id` ya es `references public.players(id) on delete cascade` (`schema.sql`, línea ~135). Las claves foráneas se validan sin RLS, así que un documento huérfano ya es imposible.

## Objetivo
Las inscripciones públicas con documento de respaldo vuelven a funcionar en categorías abiertas, manteniendo el bloqueo en categorías cerradas.

## Requerimientos
1. `supabase/migracion-inscripcion-cerrada.sql`, punto 3: sustituir la política por
   ```sql
   drop policy if exists "player_docs_public_insert" on public.player_docs;
   create policy "player_docs_public_insert" on public.player_docs
     for insert to anon
     with check (true);
   ```
   con un comentario que explique que la clave foránea `player_docs.id -> players.id` ya impide documentos sin jugador, y que una subconsulta sobre `players` no funciona para `anon` por RLS.
2. `supabase/schema.sql`: el mismo cambio, y restaurar el comentario original ("INSERT anónimo (inscripción)").
3. `src/lib/registration.ts`, `isRlsRegistrationError`: que solo considere "categoría cerrada" los errores de la tabla `players`. Hoy cualquier mensaje con "row-level security" (también el de `player_docs`) se muestra como "La inscripción para esta categoría está cerrada.". Detectar que el mensaje mencione `"players"` y NO `player_docs`, o mejor, que `insertPlayer` lance un error propio y distinguible (por ejemplo, una clase `RegistrationClosedError` en `src/lib/registration.ts`) cuando falla el insert en `players` por RLS. Actualizar los tests.

## Restricciones técnicas
- CERO EMOJIS, sin excepción: ni en interfaz, textos, código, comentarios, logs, consola, commits, docs, tests, datos semilla o nombres de archivo.
- Repo de un cliente con marca propia: NO aplicar la marca Ualdo.
- Sigue las convenciones existentes del repo.
- No cambies la política `players_public_insert` ni la función `registration_allowed` (están bien).
- Diseño: SOLID, DRY, KISS, funciones <50 líneas, inmutabilidad, manejo de errores explícito.
- No añadas dependencias.
- No toques archivos fuera del alcance indicado. No toques `tasks/`, `watch_tasks.*` ni `.gitignore`.

## Tests
En `src/lib/registration.test.ts`:
- Un error de RLS en `players` se reconoce como "categoría cerrada".
- Un error de RLS en `player_docs` NO se reconoce como "categoría cerrada".
- Si se implementa `RegistrationClosedError`: `insertPlayer` la lanza cuando el insert de `players` devuelve un error RLS (usar un mock de `supabase` con `vi.mock`).

Cobertura >=80% en `src/lib/registration.ts`. Comandos: `npm test`, `npm run test:coverage`.

Verificación manual (después de ejecutar la migración corregida en Supabase):
1. Sin sesión, inscribir un jugador con documento de respaldo en una categoría abierta: se guarda el jugador y el respaldo (Admin > Jugadores muestra "Ver Respaldo").
2. Con la categoría cerrada, intentar inscribir (con una pestaña abierta desde antes): se rechaza con el mensaje de categoría cerrada y no se crea el jugador.

## Verificación final
1. `npm test`
2. `npm run test:coverage`
3. `npm run lint`
4. `npx tsc --noEmit`
5. `npm run build`

## Criterios de aceptación
- [ ] `player_docs_public_insert` vuelve a `with check (true)` en la migración y en `schema.sql`, con el comentario explicativo.
- [ ] La inscripción pública con respaldo funciona en categorías abiertas.
- [ ] El mensaje de "categoría cerrada" solo aparece cuando el rechazo viene de `players`.
- [ ] Todos los tests pasan; build, lint y `tsc` sin errores.
- [ ] Cero emojis en el diff.
